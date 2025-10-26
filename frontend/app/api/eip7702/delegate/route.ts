import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
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

export async function POST() {
  try {
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const PK = process.env.EIP7702_PRIVATE_KEY as `0x${string}`;
    const AUTHORITY = process.env.EIP7702_AUTHORITY_ADDRESS as `0x${string}`;
    if (!RPC || !PK || !AUTHORITY) {
      return NextResponse.json(
        {
          error:
            "Missing env: ARBITRUM_SEPOLIA_RPC_URL / EIP7702_PRIVATE_KEY / EIP7702_AUTHORITY_ADDRESS",
        },
        { status: 500 }
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

    // Build a basic 7702 authorization payload
    const chainId = BigInt(ARB_SEPOLIA_ID);
    const nonce = BigInt(Date.now());
    // Sign EIP-712 typed data for the Authorization (shape subject to EIP-7702 evolutions)
    type AuthorizationMsg = {
      chainId: bigint;
      address: `0x${string}`;
      nonce: bigint;
      authority: `0x${string}`;
    };
    const signature: `0x${string}` = await account.signTypedData({
      domain: { chainId: Number(chainId) },
      types: {
        Authorization: [
          { name: "chainId", type: "uint256" },
          { name: "address", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "authority", type: "address" },
        ],
      },
      primaryType: "Authorization",
      message: {
        chainId,
        address: account.address,
        nonce,
        authority: AUTHORITY,
      } as AuthorizationMsg,
    });

    // Split signature into yParity/r/s as required by SetCodeAuthorization
    const sig = signature.slice(2);
    const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
    const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
    const v = parseInt(sig.slice(128, 130), 16);
    const yParity = v % 2; // 27/28 -> 0/1

    // Attempt to send a tx with authorizationList (may fail if RPC doesn't support 7702)
    const txRequest: Record<string, unknown> = {
      account,
      to: AUTHORITY,
      data: "0x",
      authorizationList: [
        {
          chainId: Number(chainId),
          address: account.address,
          nonce: Number(nonce),
          authority: AUTHORITY,
          r,
          s,
          yParity,
        },
      ],
    };
    const hash = await (
      walletClient as unknown as {
        sendTransaction: (args: typeof txRequest) => Promise<`0x${string}`>;
      }
    ).sendTransaction(txRequest);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash, status: receipt.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Delegate failed" },
      { status: 500 }
    );
  }
}
