import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, getAddress } from "viem";

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
  "function getCredentialHash(uint256 wallet) view returns (uint256)",
]);

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = (await req.json()) as {
      walletAddress: `0x${string}`;
    };
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Missing walletAddress" },
        { status: 400 }
      );
    }

    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const REGISTRY = process.env.REGISTRY_CONTRACT_ADDRESS as `0x${string}`;
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(RPC),
    });

    let inDb = false;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const serviceKey =
        (process.env.SUPABASE_SERVICE_ROLE_KEY as string) ||
        (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
      if (supabaseUrl && serviceKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const checksum = getAddress(walletAddress);
        const { data, error } = await supabase
          .from("face_templates")
          .select("wallet_address_checksum")
          .eq("wallet_address_checksum", checksum)
          .maybeSingle();
        if (!error && data) inDb = true;
      }
    } catch {}

    let registered = false;
    try {
      if (RPC && REGISTRY) {
        const credentialHash = (await publicClient.readContract({
          address: REGISTRY,
          abi: REGISTRY_ABI,
          functionName: "getCredentialHash",
          args: [
            // convert hex address to uint256: pad left
            BigInt(walletAddress as unknown as string) as unknown as bigint,
          ],
        })) as bigint;
        registered = credentialHash !== BigInt(0);
      }
    } catch {}

    return NextResponse.json({ inDb, registered });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Status error" },
      { status: 500 }
    );
  }
}
