import { NextResponse } from "next/server";
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

export async function POST() {
  try {
    const RPC = process.env.ARBITRUM_SEPOLIA_RPC_URL as string;
    const EOA_PK = process.env.EIP7702_PRIVATE_KEY as `0x${string}`;
    const RELAY_PK = process.env.REGISTRY_PRIVATE_KEY as `0x${string}`;
    const AUTHORITY = process.env.EIP7702_AUTHORITY_ADDRESS as `0x${string}`;
    if (!RPC || !EOA_PK || !RELAY_PK || !AUTHORITY) {
      return NextResponse.json(
        {
          error:
            "Missing env: ARBITRUM_SEPOLIA_RPC_URL / EIP7702_PRIVATE_KEY / REGISTRY_PRIVATE_KEY / EIP7702_AUTHORITY_ADDRESS",
        },
        { status: 500 }
      );
    }

    // EOA to be delegated
    const eoaAccount = privateKeyToAccount(EOA_PK);
    // Relay that will execute the tx
    const relayAccount = privateKeyToAccount(RELAY_PK);

    const walletClient = createWalletClient({
      account: relayAccount,
      chain: arbitrumSepolia,
      transport: http(RPC),
    });
    const publicClient = createPublicClient({
      chain: arbitrumSepolia,
      transport: http(RPC),
    });

    // Sign Authorization with the EOA that will be delegated
    const authorization = await walletClient.signAuthorization({
      account: eoaAccount,
      contractAddress: AUTHORITY,
    });

    // ABI for the designated contract – must include initialize()
    const abi = parseAbi(["function initialize() external payable"]);

    // Execute initialize() on the EOA address with the Authorization
    const hash = await walletClient.writeContract({
      abi,
      address: eoaAccount.address,
      authorizationList: [authorization],
      functionName: "initialize",
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({ hash, status: receipt.status });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message || "Delegate failed" },
      { status: 500 }
    );
  }
}
