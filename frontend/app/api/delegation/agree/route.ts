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

const DELEGATION_ABI = parseAbi([
  "function agree(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, uint256 wallet, uint256 intent, uint256 credential_hash, uint256 nonce, uint256 result_hash, address from, address to, address tokenAddress, uint256 amount) external",
]);

type AgreeBody = {
  proof: unknown; // snarkjs groth16 proof object
  publicSignals: string[]; // [wallet, intent, credential_hash, nonce, result_hash]
  from: `0x${string}`; // payer EOA (EIP-7702 account)
  to: `0x${string}`; // merchant address
  token: `0x${string}`; // ERC20 token address (e.g., MockUSDC)
  amount: string; // uint256 as decimal string
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AgreeBody;
    const DELEGATION = process.env.EIP7702_AUTHORITY_ADDRESS as `0x${string}`;
    const PK = process.env.REGISTRY_PRIVATE_KEY as `0x${string}`;
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    if (!DELEGATION || !PK || !RPC) {
      return NextResponse.json(
        {
          error:
            "Missing env: EIP7702_AUTHORITY_ADDRESS / REGISTRY_PRIVATE_KEY / ARBITRUM_SEPOLIA_RPC_URL",
        },
        { status: 500 }
      );
    }

    const { proof, publicSignals, from, to, token, amount } = body;
    if (!proof || !publicSignals || publicSignals.length < 5) {
      return NextResponse.json(
        { error: "Invalid proof payload" },
        { status: 400 }
      );
    }
    if (!from || !to || !token || !amount) {
      return NextResponse.json(
        { error: "Missing transfer parameters" },
        { status: 400 }
      );
    }

    const account = privateKeyToAccount(PK);
    const walletClient = createWalletClient({
      account,
      chain: arbitrumSepolia,
      transport: http(RPC),
    });
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(RPC),
    });

    // Map snarkjs proof to solidity inputs
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
      address: DELEGATION,
      abi: DELEGATION_ABI,
      functionName: "agree",
      args: [
        a,
        b,
        c,
        wallet,
        intent,
        credential_hash,
        nonce,
        result_hash,
        from,
        to,
        token,
        BigInt(amount),
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash, status: receipt.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Internal error" },
      { status: 500 }
    );
  }
}
