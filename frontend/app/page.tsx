"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white to-indigo-50 px-4">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 rounded-2xl border border-gray-100 bg-white/90 p-10 shadow-lg backdrop-blur">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Checkout
          </h1>
          <p className="text-gray-600">Login or sign up to start.</p>
        </div>

        <div className="w-full flex items-center justify-center">
          <div className="scale-110 sm:scale-125">
            <DynamicWidget
              variant="modal"
              buttonClassName="!px-6 !py-3 !text-base !rounded-xl"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Checkout with your face, securely holding your assets.
        </p>
      </main>
    </div>
  );
}
