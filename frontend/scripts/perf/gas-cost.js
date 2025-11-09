#!/usr/bin/env node
/**
 * Gas Cost Analysis on a local Anvil (recommended)
 *
 * Deploys verifier, registry, delegation, mocks; generates a fresh proof from backend;
 * Measures gas for:
 *  - Registry.register()
 *  - Delegation.agree() (proof verification + transfer)
 *  - Registry.recover()
 *  - EmailDomainVerifier.verify() (optional/manual; see README)
 *
 * Usage (with anvil running on :8545):
 *   node scripts/perf/gas-cost.js \
 *     --rpc http://127.0.0.1:8545 \
 *     --privateKey 0x... \
 *     --backendUrl http://localhost:8787 \
 *     --wallet 0x... \
 *     --pin 123456 \
 *     --amount 1000000
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  getAddress,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("viem");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { privateKeyToAccount } = require("viem/accounts");

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=");
      const key = k.slice(2);
      args[key] = v ?? process.argv[++i];
    }
  }
  return {
    rpc:
      args.rpc ||
      process.env.ARBITRUM_SEPOLIA_RPC_URL ||
      "http://127.0.0.1:8545",
    privateKey: args.privateKey || process.env.REGISTRY_PRIVATE_KEY,
    backendUrl:
      args.backendUrl ||
      process.env.NEXT_PUBLIC_ZK_BACKEND_URL ||
      "http://localhost:8787",
    wallet: args.wallet || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS,
    pin: args.pin || "123456",
    amount: args.amount || "1000000",
  };
}

function loadArtifact(rel) {
  const p = path.resolve(__dirname, "../../../out", rel);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function toSolidityProof(proof) {
  const p = proof;
  const a = [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])];
  const b = [
    [BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])],
    [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])],
  ];
  const c = [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])];
  return { a, b, c };
}
async function getProof(backendUrl, wallet, pin, intent) {
  const nonceRes = await fetch(`${backendUrl}/api/zk/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, intent }),
  });
  const nonceJson = await nonceRes.json();
  if (!nonceRes.ok)
    throw new Error(`nonce error: ${nonceJson?.error || "unknown"}`);
  const { nonce } = nonceJson;
  const proofRes = await fetch(`${backendUrl}/api/zk/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, pin, intent, nonce }),
  });
  const proofJson = await proofRes.json();
  if (!proofRes.ok)
    throw new Error(`proof error: ${proofJson?.error || "unknown"}`);
  return proofJson;
}

async function main() {
  const {
    rpc,
    privateKey,
    backendUrl,
    wallet: walletArg,
    pin,
    amount,
  } = parseArgs();
  if (!privateKey) throw new Error("Missing --privateKey");
  if (!pin || !/^\d{6}$/.test(pin)) throw new Error("Missing/invalid --pin");

  const walletClient = createWalletClient({
    transport: http(rpc),
    account: privateKeyToAccount(privateKey),
  });
  const publicClient = createPublicClient({ transport: http(rpc) });
  const sender = getAddress((await walletClient.getAddresses())[0]);
  const wallet =
    walletArg && /^0x[0-9a-fA-F]{40}$/.test(walletArg) ? walletArg : sender;

  // Load artifacts
  const verifierArt = loadArtifact("verifier.sol/Groth16Verifier.json");
  const registryArt = loadArtifact("Registry.sol/Registry.json");
  const delegationArt = loadArtifact("Delegation.sol/Delegation.json");
  const mockEmailArt = loadArtifact(
    "MockEmailVerifier.sol/MockEmailVerifier.json"
  );
  const mockUsdcArt = loadArtifact("MockUSDC.sol/MockUSDC.json");

  // Deploy Verifier
  const verifierHash = await walletClient.deployContract({
    abi: verifierArt.abi,
    bytecode: verifierArt.bytecode.object || verifierArt.bytecode,
    args: [],
  });
  const verifierRc = await publicClient.waitForTransactionReceipt({
    hash: verifierHash,
  });
  const verifier = verifierRc.contractAddress;

  // Deploy MockEmailVerifier
  const emailHash = await walletClient.deployContract({
    abi: mockEmailArt.abi,
    bytecode: mockEmailArt.bytecode.object || mockEmailArt.bytecode,
    args: [],
  });
  const emailRc = await publicClient.waitForTransactionReceipt({
    hash: emailHash,
  });
  const emailVerifier = emailRc.contractAddress;

  // Deploy Registry(verifier, emailVerifier)
  const registryHash = await walletClient.deployContract({
    abi: registryArt.abi,
    bytecode: registryArt.bytecode.object || registryArt.bytecode,
    args: [verifier, emailVerifier],
  });
  const registryRc = await publicClient.waitForTransactionReceipt({
    hash: registryHash,
  });
  const registry = registryRc.contractAddress;

  // Deploy Delegation(verifier, registry)
  const delegationHash = await walletClient.deployContract({
    abi: delegationArt.abi,
    bytecode: delegationArt.bytecode.object || delegationArt.bytecode,
    args: [verifier, registry],
  });
  const delegationRc = await publicClient.waitForTransactionReceipt({
    hash: delegationHash,
  });
  const delegation = delegationRc.contractAddress;

  // Deploy MockUSDC and fund + approve
  const usdcHash = await walletClient.deployContract({
    abi: mockUsdcArt.abi,
    bytecode: mockUsdcArt.bytecode.object || mockUsdcArt.bytecode,
    args: [],
  });
  const usdcRc = await publicClient.waitForTransactionReceipt({
    hash: usdcHash,
  });
  const usdc = usdcRc.contractAddress;
  // Mint to wallet address and approve delegation
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: usdc,
      abi: mockUsdcArt.abi,
      functionName: "mint",
      args: [sender, BigInt(amount) * 10n],
    }),
  });
  await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: usdc,
      abi: mockUsdcArt.abi,
      functionName: "approve",
      args: [delegation, BigInt(2) ** 256n - 1n],
    }),
  });

  // Generate proof
  const proofJson = await getProof(backendUrl, wallet, pin, 0);
  const { proof, publicSignals } = proofJson;
  const { a, b, c } = toSolidityProof(proof);
  const [walletPS, intentPS, ch, nonce, rh] = publicSignals.map((x) =>
    BigInt(x)
  );

  // 1) Registry.register
  const rcReg = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: registry,
      abi: registryArt.abi,
      functionName: "register",
      args: [a, b, c, walletPS, intentPS, ch, nonce, rh],
    }),
  });

  // 2) Delegation.agree (transfer from 'wallet' to sender with mock token)
  // Generate a fresh proof (new nonce) for delegation
  const proofJson2 = await getProof(backendUrl, wallet, pin, 0);
  const { proof: proof2, publicSignals: publicSignals2 } = proofJson2;
  const { a: a2, b: b2, c: c2 } = toSolidityProof(proof2);
  const [walletPS2, intentPS2, ch2, nonce2, rh2] = publicSignals2.map((x) =>
    BigInt(x)
  );
  const rcDel = await publicClient.waitForTransactionReceipt({
    hash: await walletClient.writeContract({
      address: delegation,
      abi: delegationArt.abi,
      functionName: "agree",
      args: [
        a2,
        b2,
        c2,
        walletPS2,
        0n,
        ch2,
        nonce2,
        rh2,
        sender,
        sender,
        usdc,
        BigInt(amount),
      ],
    }),
  });

  // 3) Enable recover (mark verified) and call recover
  let rcRec = null;
  try {
    await publicClient.waitForTransactionReceipt({
      hash: await walletClient.writeContract({
        address: emailVerifier,
        abi: mockEmailArt.abi,
        functionName: "setVerified",
        args: [sender, true],
      }),
    });
    // Optional: confirm flag is set
    const isOk = await publicClient.readContract({
      address: emailVerifier,
      abi: mockEmailArt.abi,
      functionName: "getWalletToEmailVerified",
      args: [sender],
    });
    if (isOk) {
      rcRec = await publicClient.waitForTransactionReceipt({
        hash: await walletClient.writeContract({
          address: registry,
          abi: registryArt.abi,
          functionName: "recover",
          args: [a, b, c, walletPS, 0n, ch, nonce + 2n, rh],
        }),
      });
    }
  } catch {
    // skip recover if verification flow not available
  }

  const out = {
    registryRegisterGas: Number(rcReg.gasUsed),
    delegationAgreeGas: Number(rcDel.gasUsed),
    registryRecoverGas: rcRec ? Number(rcRec.gasUsed) : null,
    targets: {
      proofVerificationMaxGas: 450000,
      delegatedTxMaxGas: 400000,
    },
    note: "EmailDomainVerifier.verify() gas not measured here. Recover is attempted only if verification flag can be set with the mock verifier.",
    addresses: { verifier, emailVerifier, registry, delegation, usdc },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
