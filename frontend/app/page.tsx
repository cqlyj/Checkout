"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

export default function Home() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  // Get the connected wallet address
  const connectedWallet = wallets?.[0];
  const walletAddress = connectedWallet?.address;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="flex flex-col items-center gap-8 p-8 bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Wallet Connect
          </h1>
          <p className="text-gray-600">Arbitrum Sepolia Testnet</p>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : !authenticated ? (
          <div className="w-full space-y-4">
            <button
              onClick={login}
              className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="w-full space-y-6">
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-lg border border-indigo-200">
              <p className="text-sm font-medium text-gray-600 mb-2">
                Connected Wallet Address
              </p>
              <p className="text-sm font-mono text-gray-800 break-all bg-white px-3 py-2 rounded border border-gray-200">
                {walletAddress || "Loading..."}
              </p>
            </div>

            <button
              onClick={logout}
              className="w-full py-3 px-6 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-all duration-200"
            >
              Disconnect
            </button>
          </div>
        )}

        <div className="text-center text-sm text-gray-500">
          <p>🔗 Connected to Arbitrum Sepolia</p>
        </div>
      </main>
    </div>
  );
}
