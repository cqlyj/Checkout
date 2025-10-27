import { useState, useEffect } from "react";
import { useAccount, useBalance } from "wagmi";
import {
  useCallProver,
  useWaitForProvingResult,
  useChain,
} from "@vlayer/react";
import { preverifyEmail } from "@vlayer/sdk";
import proverSpec from "../../../../out/EmailDomainProver.sol/EmailDomainProver.json";
import verifierSpec from "../../../../out/EmailProofVerifier.sol/EmailDomainVerifier.json";
import { type Abi, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useNavigate } from "react-router";
import debug from "debug";
import {
  AlreadyMintedError,
  NoProofError,
  CallProverError,
  UseChainError,
  PreverifyError,
} from "../errors/appErrors";
//

const log = debug("vlayer:email-proof-verification");
const safeStringify = (value: unknown) =>
  JSON.stringify(
    value,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Simplified to mimic template behavior

// Extract settle block number and hash from proof
const extractSettleInfo = (
  args: readonly unknown[]
): { blockNumber: bigint; blockHash: `0x${string}` } | undefined => {
  try {
    const proofStruct: any = (args as any[])?.[0];
    const callAssumptions: any =
      proofStruct?.callAssumptions ?? proofStruct?.[3];
    const rawNumber = callAssumptions?.settleBlockNumber as
      | `0x${string}`
      | number
      | string
      | undefined;
    const rawHash = callAssumptions?.settleBlockHash as
      | `0x${string}`
      | undefined;

    console.debug("[extractSettleInfo] raw data", {
      rawNumber,
      rawNumberType: typeof rawNumber,
      rawHash,
      callAssumptions: JSON.stringify(callAssumptions, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      ),
    });

    if (rawNumber === undefined || !rawHash) return undefined;

    let blockNumber: bigint;
    if (typeof rawNumber === "bigint") blockNumber = rawNumber;
    else if (typeof rawNumber === "number") blockNumber = BigInt(rawNumber);
    else if (typeof rawNumber === "string")
      blockNumber = BigInt(
        rawNumber.startsWith("0x")
          ? rawNumber
          : `0x${BigInt(rawNumber).toString(16)}`
      );
    else return undefined;

    console.debug("[extractSettleInfo] converted", {
      blockNumber: blockNumber.toString(),
      blockNumberHex: "0x" + blockNumber.toString(16),
    });

    return { blockNumber, blockHash: rawHash };
  } catch (e) {
    console.debug("[extractSettleInfo] error", e);
    return undefined;
  }
};

enum ProofVerificationStepLabel {
  GO = "Go",
  SENDING_TO_PROVER = "Sending to prover...",
  WAITING_FOR_PROOF = "Waiting for proof...",
  VERIFY = "Verify",
  VERIFYING_ON_CHAIN = "Verifying on-chain...",
  DONE = "Done",
}

export const useEmailProofVerification = () => {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<string>(
    ProofVerificationStepLabel.GO
  );
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [proofArgs, setProofArgs] = useState<readonly unknown[] | null>(null);

  const [verificationError, setVerificationError] = useState<Error | null>(
    null
  );

  const { chain, error: chainError } = useChain(
    import.meta.env.VITE_CHAIN_NAME
  );
  if (chainError) {
    throw new UseChainError(chainError);
  }

  const proverAbi = (proverSpec as any).abi as Abi;
  const verifierAbi = (verifierSpec as any).abi as Abi;
  const {
    callProver,
    data: proofHash,
    error: callProverError,
  } = useCallProver({
    address: import.meta.env.VITE_PROVER_ADDRESS,
    proverAbi,
    functionName: "main",
    vgasLimit: Number(import.meta.env.VITE_GAS_LIMIT),
    chainId: chain?.id,
  });

  if (callProverError) {
    console.error("[callProverError]", callProverError);
    throw new CallProverError(callProverError.message);
  }

  const { data: proof, error: provingError } =
    useWaitForProvingResult(proofHash);

  if (provingError) {
    console.error("[provingError]", provingError);
    throw new CallProverError(provingError.message);
  }

  const verifyProofOnChain = async (argsOverride?: readonly unknown[]) => {
    setCurrentStep(ProofVerificationStepLabel.VERIFYING_ON_CHAIN);
    const args = (argsOverride ?? proofArgs) as readonly unknown[] | null;
    if (!args) throw new NoProofError("No proof available to verify on-chain");

    const rpcUrl =
      (import.meta.env.VITE_JSON_RPC_URL as string | undefined) ||
      ((chain?.rpcUrls as any)?.default?.http?.[0] as string | undefined);
    const privateKey =
      (import.meta.env.VITE_EXAMPLES_TEST_PRIVATE_KEY as
        | `0x${string}`
        | undefined) ||
      ((import.meta.env as any).EXAMPLES_TEST_PRIVATE_KEY as
        | `0x${string}`
        | undefined);

    if (!rpcUrl || !privateKey) {
      setVerificationError(
        new Error(
          "Missing RPC URL or private key in env (VITE_EXAMPLES_TEST_PRIVATE_KEY/EXAMPLES_TEST_PRIVATE_KEY)"
        )
      );
      return;
    }

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: chain as unknown as any,
      transport: http(rpcUrl),
    });
    const publicClient = createPublicClient({
      chain: chain as unknown as any,
      transport: http(rpcUrl),
    });

    try {
      // Wait for settle block to be available with correct hash AND additional confirmations
      try {
        const settleInfo = extractSettleInfo(args);
        console.debug("[verify] settle info extracted", settleInfo);
        if (settleInfo) {
          const { blockNumber, blockHash } = settleInfo;
          const REQUIRED_CONFIRMATIONS = 2; // Wait for just 2 blocks - submit ASAP
          let attempts = 0;
          let blockAvailable = false;

          // Wait until the settle block is available and has the correct hash
          while (!blockAvailable && attempts < 90) {
            try {
              const block = await publicClient.getBlock({ blockNumber });
              const onChainHash = block.hash;

              console.debug("[verify] checking settle block", {
                blockNumber: blockNumber.toString(),
                expectedHash: blockHash,
                onChainHash,
                match: onChainHash?.toLowerCase() === blockHash.toLowerCase(),
                attempt: attempts + 1,
              });

              if (
                onChainHash &&
                onChainHash.toLowerCase() === blockHash.toLowerCase()
              ) {
                blockAvailable = true;
                console.debug("[verify] settle block confirmed available");
              } else {
                await sleep(2000);
                attempts += 1;
              }
            } catch (e) {
              console.debug(
                "[verify] settle block not yet available, waiting...",
                {
                  blockNumber: blockNumber.toString(),
                  attempt: attempts + 1,
                }
              );
              await sleep(2000);
              attempts += 1;
            }
          }

          if (!blockAvailable) {
            console.warn(
              "[verify] settle block never became available after 90 attempts"
            );
          } else {
            // Now wait for additional confirmations PAST the settle block
            // We need to ensure that when our tx is EXECUTED (not just submitted),
            // the block.number in the EVM will be > settleBlockNumber
            // Since our tx might take 1-2 blocks to be mined, we need extra buffer
            const targetBlockNumber =
              blockNumber + BigInt(REQUIRED_CONFIRMATIONS);
            console.debug("[verify] waiting for confirmations", {
              settleBlock: blockNumber.toString(),
              targetBlock: targetBlockNumber.toString(),
              confirmationsNeeded: REQUIRED_CONFIRMATIONS,
            });

            let confirmsAttempt = 0;
            while (confirmsAttempt < 120) {
              try {
                const currentHead = await publicClient.getBlockNumber();
                console.debug("[verify] confirmation progress", {
                  currentHead: currentHead.toString(),
                  targetBlock: targetBlockNumber.toString(),
                  remainingBlocks: (targetBlockNumber - currentHead).toString(),
                  attempt: confirmsAttempt + 1,
                });

                if (currentHead >= targetBlockNumber) {
                  console.debug("[verify] confirmations reached", {
                    currentHead: currentHead.toString(),
                    confirmations: (currentHead - blockNumber).toString(),
                  });
                  break;
                }

                await sleep(2000);
                confirmsAttempt += 1;
              } catch (e) {
                console.debug("[verify] confirmation check error", e);
                await sleep(2000);
                confirmsAttempt += 1;
              }
            }
          }
        }
      } catch (e) {
        console.debug("[verify] settle block wait error", e);
      }

      // Write with short retry on future-block
      let lastErr: unknown = null;
      let hash: `0x${string}` | null = null;

      // Get settle block number for logging
      const settleInfo = extractSettleInfo(args);

      for (let i = 0; i < 5 && !hash; i++) {
        try {
          const preSubmitBlock = await publicClient.getBlockNumber();
          console.debug(`[verify] write attempt ${i + 1}`, {
            settleBlockNumber: settleInfo?.blockNumber.toString(),
            currentBlockBeforeSubmit: preSubmitBlock.toString(),
            diff: settleInfo
              ? (preSubmitBlock - settleInfo.blockNumber).toString()
              : "unknown",
          });

          // Skip ALL viem validation by sending raw transaction
          // Even with fixed gas, writeContract might simulate and hit "block from future"
          const gas = BigInt(1000000);
          const nonce = await publicClient.getTransactionCount({
            address: account.address,
          });

          console.debug(`[verify] preparing raw tx`, {
            gas: gas.toString(),
            nonce,
          });

          // Encode the function call
          const { encodeFunctionData } = await import("viem");
          const data = encodeFunctionData({
            abi: verifierAbi,
            functionName: "verify",
            args,
          });

          // Send as raw transaction to bypass ALL viem simulation/checks
          hash = await walletClient.sendTransaction({
            to: import.meta.env.VITE_VERIFIER_ADDRESS as `0x${string}`,
            data,
            gas,
            nonce,
            chain: chain as unknown as any,
          });

          console.debug(`[verify] tx submitted successfully`, hash);
        } catch (e) {
          lastErr = e;
          const message = String((e as Error)?.message ?? e);
          const postFailBlock = await publicClient.getBlockNumber();
          console.debug(`[verify] write attempt ${i + 1} failed`, {
            settleBlockNumber: settleInfo?.blockNumber.toString(),
            currentBlockAfterFail: postFailBlock.toString(),
            diff: settleInfo
              ? (postFailBlock - settleInfo.blockNumber).toString()
              : "unknown",
            error: message.substring(0, 100),
          });

          if (message.includes("block from future")) {
            console.debug(`[verify] retrying after 4s (attempt ${i + 1}/5)`);
            await sleep(4000);
            continue;
          }
          throw e;
        }
      }
      if (!hash) throw lastErr ?? new Error("verify failed after retries");
      console.debug("[verify] tx hash", hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.debug("[verify] receipt confirmed", {
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        settleBlockNumber: settleInfo?.blockNumber.toString(),
        blocksAfterSettle: settleInfo
          ? (receipt.blockNumber - settleInfo.blockNumber).toString()
          : "unknown",
      });

      setTxHash(hash);
      setCurrentStep(ProofVerificationStepLabel.DONE);
    } catch (error) {
      console.error("[verify] error", error);
      setVerificationError(error as Error);
    }
  };

  const [preverifyError, setPreverifyError] = useState<Error | null>(null);
  const startProving = async (emlContent: string) => {
    setCurrentStep(ProofVerificationStepLabel.SENDING_TO_PROVER);

    try {
      console.debug("[prove] preverifyEmail.start");
      const email = await preverifyEmail({
        mimeEmail: emlContent,
        dnsResolverUrl: import.meta.env.VITE_DNS_SERVICE_URL,
        token: import.meta.env.VITE_VLAYER_API_TOKEN,
      });
      console.debug("[prove] preverifyEmail.done", safeStringify(email));
      const hash = await callProver([email]);
      console.debug("[prove] callProver.submitted", hash);
    } catch (error) {
      console.error("[prove] error", error);
      setPreverifyError(error as Error);
    }
    setCurrentStep(ProofVerificationStepLabel.WAITING_FOR_PROOF);
  };

  useEffect(() => {
    if (proof) {
      log("proof", proof);
      try {
        if (Array.isArray(proof)) {
          console.debug("[prove] proof received", {
            emailHash: String((proof as any[])[1]),
            targetWallet: String((proof as any[])[2]),
          });
        } else {
          console.debug(
            "[prove] proof received (non-array)",
            safeStringify(proof)
          );
        }
      } catch (e) {
        console.debug("[prove] proof log error", e);
      }
      const args = proof as unknown as readonly unknown[];
      setProofArgs(args);
      // Verify immediately with fresh args to avoid state race
      void verifyProofOnChain(args);
    }
  }, [proof]);

  // Keep optional navigation disabled for now as per requirements

  useEffect(() => {
    if (verificationError) {
      console.error("[verify] verificationError", verificationError);
      if (verificationError.message.includes("already been minted")) {
        throw new AlreadyMintedError();
      } else if (
        verificationError.message.includes("User rejected the request")
      ) {
        setCurrentStep(ProofVerificationStepLabel.GO);
      } else {
        // Surface the error; boundary will handle
      }
    }
  }, [verificationError]);

  useEffect(() => {
    if (preverifyError) {
      throw new PreverifyError(preverifyError.message);
    }
  }, [preverifyError]);

  return {
    currentStep,
    txHash,
    verificationError,
    provingError,
    startProving,
    handleVerify: verifyProofOnChain,
  };
};
