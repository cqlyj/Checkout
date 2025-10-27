"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { primaryWallet } = useDynamicContext();
  const isConnected = !!primaryWallet;
  const router = useRouter();
  const wasConnectedRef = useRef(isConnected);

  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    if (!wasConnected && isConnected) {
      (async () => {
        try {
          const res = await fetch("/api/status/wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress: primaryWallet?.address }),
          });
          const data = await res.json();
          if (data?.registered) {
            router.push("/dashboard");
          } else {
            router.push("/register");
          }
        } catch {
          router.push("/register");
        }
      })();
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, router, primaryWallet?.address]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <main className="flex flex-col items-center gap-6 p-12 bg-white rounded-2xl shadow-xl max-w-2xl w-full">
        <div className="text-center space-y-3">
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
            Checkout
          </h1>
          <p className="text-base md:text-lg text-gray-600 max-w-xl mx-auto">
            Connect to start checking out by scanning your face while securely
            holding your assets.
          </p>
        </div>
      </main>
    </div>
  );
}
