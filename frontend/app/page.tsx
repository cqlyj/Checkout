"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

export default function Home() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();

  // Get the connected wallet address
  const walletAddress = primaryWallet?.address;
  const isConnected = !!primaryWallet;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="flex flex-col items-center gap-8 p-8 bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Wallet Connect
          </h1>
          <p className="text-gray-600">Arbitrum Sepolia Testnet</p>
        </div>

        {!isConnected ? (
          <div className="w-full space-y-4">
            <button
              onClick={() => setShowAuthFlow(true)}
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
              onClick={handleLogOut}
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
