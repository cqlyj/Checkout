import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ARB_SEPOLIA_ID = 421614;

const arbitrumSepolia = {
  id: ARB_SEPOLIA_ID,
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARBITRUM_SEPOLIA_RPC_URL as string] },
    public: { http: [process.env.ARBITRUM_SEPOLIA_RPC_URL as string] },
  },
} as const;

const REGISTRY_ABI = parseAbi([
  "function recover(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256 wallet, uint256 intent, uint256 credential_hash, uint256 nonce, uint256 result_hash) external",
]);
const VERIFIER_ABI = parseAbi([
  "function setbackWalletToEmailVerified(address _wallet) external",
  "function getWalletToEmailVerified(address _wallet) view returns (bool)",
]);

type ProofBody = {
  registryAddress?: string;
  proof: unknown; // snarkjs groth16 proof object
  publicSignals: string[]; // [wallet, intent, credential_hash, nonce, result_hash]
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ProofBody;
    const registryAddress =
      body.registryAddress || (process.env.REGISTRY_CONTRACT_ADDRESS as string);
    const PK = process.env.REGISTRY_PRIVATE_KEY as string;
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const VERIFIER = process.env
      .EMAIL_VERIFIER_CONTRACT_ADDRESS as `0x${string}`;
    if (!registryAddress || !PK || !RPC) {
      return NextResponse.json(
        {
          error:
            "Missing env: REGISTRY_CONTRACT_ADDRESS / REGISTRY_PRIVATE_KEY / ARBITRUM_SEPOLIA_RPC_URL",
        },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(PK as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(RPC),
    });
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(RPC),
    });

    const { proof, publicSignals } = body;
    if (!proof || !publicSignals || publicSignals.length < 5) {
      return NextResponse.json(
        { error: "Invalid proof payload" },
        { status: 400 }
      );
    }

    const p = proof as unknown as {
      pi_a: [string, string];
      pi_b: [[string, string], [string, string]];
      pi_c: [string, string];
    };
    const a: [bigint, bigint] = [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])];
    const b: [[bigint, bigint], [bigint, bigint]] = [
      [BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])],
      [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])],
    ];
    const c: [bigint, bigint] = [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])];

    const wallet = BigInt(publicSignals[0]);
    const intent = BigInt(publicSignals[1]);
    const credential_hash = BigInt(publicSignals[2]);
    const nonce = BigInt(publicSignals[3]);
    const result_hash = BigInt(publicSignals[4]);

    const hash = await walletClient.writeContract({
      address: registryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "recover",
      args: [a, b, c, wallet, intent, credential_hash, nonce, result_hash],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Best-effort: reset verifier flag immediately after successful recover
    try {
      if (receipt.status === "success" && VERIFIER) {
        const walletHex = (
          "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, "0")
        ).slice(-40);
        const walletAddress = ("0x" + walletHex) as `0x${string}`;
        const before = (await publicClient.readContract({
          address: VERIFIER,
          abi: VERIFIER_ABI,
          functionName: "getWalletToEmailVerified",
          args: [walletAddress],
        })) as boolean;
        if (before) {
          const resetHash = await walletClient.writeContract({
            address: VERIFIER,
            abi: VERIFIER_ABI,
            functionName: "setbackWalletToEmailVerified",
            args: [walletAddress],
          });
          await publicClient.waitForTransactionReceipt({ hash: resetHash });
        }
      }
    } catch {}

    return NextResponse.json({ hash, status: receipt.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Internal error" },
      { status: 500 }
    );
  }
}
