import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";

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

const ABI = parseAbi(["function nonces(address) view returns (uint256)"]);

export async function POST(req: NextRequest) {
  try {
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const VERIFIER = process.env
      .EMAIL_VERIFIER_CONTRACT_ADDRESS as `0x${string}`;
    if (!RPC || !VERIFIER)
      return NextResponse.json({ error: "Missing env" }, { status: 500 });
    const { walletAddress } = (await req.json()) as {
      walletAddress: `0x${string}`;
    };
    if (!walletAddress)
      return NextResponse.json(
        { error: "Missing walletAddress" },
        { status: 400 }
      );
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(RPC),
    });
    const nonce = await publicClient.readContract({
      address: VERIFIER,
      abi: ABI,
      functionName: "nonces",
      args: [walletAddress],
    });
    return NextResponse.json({
      nonce: nonce?.toString?.() ?? String(nonce),
      verifyingContract: VERIFIER,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Nonce error" },
      { status: 500 }
    );
  }
}
