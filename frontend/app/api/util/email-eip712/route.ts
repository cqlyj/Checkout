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

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, emailHashHex, deadline } = (await req.json()) as {
      walletAddress: `0x${string}`;
      emailHashHex: `0x${string}`;
      deadline: number;
    };
    if (!walletAddress || !emailHashHex || !deadline) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    // For demo: use PK to sign typed data as the wallet owner (simulating user signature)
    const PK = process.env.REGISTRY_PRIVATE_KEY as `0x${string}`;
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const VERIFIER = process.env
      .EMAIL_VERIFIER_CONTRACT_ADDRESS as `0x${string}`;
    if (!PK || !RPC || !VERIFIER)
      return NextResponse.json({ error: "Missing env" }, { status: 500 });
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

    const domain = {
      name: "EmailDomainVerifier",
      version: "1",
      chainId: ARB_SEPOLIA_ID,
      verifyingContract: VERIFIER,
    } as const;
    const types = {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      SetEmail: [
        { name: "wallet", type: "address" },
        { name: "emailHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    } as const;
    // Read current nonce from contract for walletAddress
    const abi = parseAbi(["function nonces(address) view returns (uint256)"]);
    const nonce = await publicClient.readContract({
      address: VERIFIER,
      abi,
      functionName: "nonces",
      args: [walletAddress],
    });
    type Msg = {
      wallet: `0x${string}`;
      emailHash: `0x${string}`;
      nonce: bigint;
      deadline: bigint;
    };
    const message: Msg = {
      wallet: walletAddress,
      emailHash: emailHashHex,
      nonce: BigInt(nonce as unknown as string),
      deadline: BigInt(deadline),
    };

    const signature = await walletClient.signTypedData({
      account,
      domain: {
        name: domain.name,
        version: domain.version,
        chainId: BigInt(domain.chainId),
        verifyingContract: domain.verifyingContract,
      },
      primaryType: "SetEmail",
      types,
      message,
    });

    return NextResponse.json({ signature });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Sign error" },
      { status: 500 }
    );
  }
}
