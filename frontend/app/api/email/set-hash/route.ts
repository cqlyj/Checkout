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

const ABI = parseAbi([
  "function setEmailHash(address _wallet, bytes32 _emailHash, uint256 deadline, bytes signature) external",
  "function nonces(address) view returns (uint256)",
]);

export async function POST(req: NextRequest) {
  try {
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const PK = process.env.REGISTRY_PRIVATE_KEY as `0x${string}`;
    const VERIFIER = process.env
      .EMAIL_VERIFIER_CONTRACT_ADDRESS as `0x${string}`;
    if (!RPC || !PK || !VERIFIER) {
      return NextResponse.json(
        {
          error:
            "Missing env: ARBITRUM_SEPOLIA_RPC_URL / REGISTRY_PRIVATE_KEY / EMAIL_VERIFIER_CONTRACT_ADDRESS",
        },
        { status: 500 }
      );
    }

    const { walletAddress, emailHashHex, deadline, signature } =
      (await req.json()) as {
        walletAddress: `0x${string}`;
        emailHashHex: `0x${string}`;
        deadline: string;
        signature: `0x${string}`;
      };
    if (!walletAddress || !emailHashHex || !deadline || !signature) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
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

    const hash = await walletClient.writeContract({
      address: VERIFIER,
      abi: ABI,
      functionName: "setEmailHash",
      args: [walletAddress, emailHashHex, BigInt(deadline), signature],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // Update face_templates.email_hash via Supabase (if configured)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
      if (supabaseUrl && serviceKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const toPgBytea = (hex: string) =>
          `\\x${(hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase()}`;
        await supabase
          .from("face_templates")
          .update({ email_hash: toPgBytea(emailHashHex) })
          .eq("wallet_address_bytes", toPgBytea(walletAddress));
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
