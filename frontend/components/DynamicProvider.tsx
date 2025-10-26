"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId:
          process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ||
          "your-dynamic-environment-id",
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: ["https://sepolia.arbiscan.io"],
              chainId: 421614,
              chainName: "Arbitrum Sepolia",
              iconUrls: ["https://arbitrum.io/logo.png"],
              name: "Arbitrum Sepolia",
              nativeCurrency: {
                decimals: 18,
                name: "ETH",
                symbol: "ETH",
              },
              networkId: 421614,
              rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
              vanityName: "Arbitrum Sepolia",
            },
          ],
        },
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
