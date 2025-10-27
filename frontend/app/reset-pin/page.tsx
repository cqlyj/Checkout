"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export default function ResetPinPage() {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;
  const [verified, setVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>("");
  const explorer = "https://arbitrum-sepolia.blockscout.com/tx/";

  useEffect(() => {
    let ignore = false;
    async function check() {
      if (!walletAddress) {
        // Wait for wallet connection rather than marking as unverified
        setVerified(null);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/status/email-verified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress }),
        });
        const data = await res.json();
        if (!ignore) {
          setVerified(!!data?.verified);
        }
      } catch {
        if (!ignore) setVerified(false);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    check();
    return () => {
      ignore = true;
    };
  }, [walletAddress]);

  useEffect(() => {
    if (!loading && walletAddress && verified === false) {
      window.location.href = "/reset-pin-error";
    }
  }, [loading, verified, walletAddress]);

  const pinValid = useMemo(() => /^\d{6}$/.test(pin.trim()), [pin]);
  const confirmValid = useMemo(
    () => pinValid && confirmPin.trim() === pin.trim(),
    [pinValid, confirmPin, pin]
  );

  async function handleConfirm() {
    setMessage("");
    try {
      if (!walletAddress) throw new Error("Connect wallet first");
      if (!confirmValid) throw new Error("Enter matching 6-digit PINs");
      setSubmitting(true);
      // intent 1 = recover
      const intent = 1;
      const backend =
        process.env.NEXT_PUBLIC_ZK_BACKEND_URL || "http://localhost:8787";
      const nonceRes = await fetch(`${backend}/api/zk/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, intent }),
      });
      const nonceJson = await nonceRes.json();
      if (!nonceRes.ok)
        throw new Error(nonceJson?.error || "Failed to get nonce");
      const { nonce } = nonceJson;
      const proofRes = await fetch(`${backend}/api/zk/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, pin, intent, nonce }),
      });
      const proofJson = await proofRes.json();
      if (!proofRes.ok)
        throw new Error(proofJson?.error || "Failed to generate proof");

      const regRes = await fetch("/api/registry/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: proofJson.proof,
          publicSignals: proofJson.publicSignals,
        }),
      });
      const regJson = await regRes.json();
      if (!regRes.ok) throw new Error(regJson?.error || "Recover tx failed");
      setTxHash(regJson.hash as string);
      setMessage("Recover submitted.");
    } catch (e: unknown) {
      setMessage((e as { message?: string })?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || verified === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
        <main className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Reset PIN</h1>
          <p className="text-gray-600">
            {walletAddress
              ? "Checking eligibility..."
              : "Connect your wallet to continue."}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Reset PIN</h1>

        {!txHash ? (
          <div className="w-full max-w-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                New PIN (6 digits)
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                maxLength={6}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                maxLength={6}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="••••••"
              />
            </div>

            <div className="text-sm text-gray-600 min-h-5">{message}</div>
            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 disabled:opacity-50"
              >
                Cancel
              </Link>
              <button
                onClick={handleConfirm}
                disabled={!confirmValid || submitting}
                className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold disabled:opacity-50 flex items-center gap-2 justify-center"
              >
                {submitting && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                )}
                Confirm
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-center gap-3">
            <a
              href={`${explorer}${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
            >
              View transaction
            </a>
            <Link
              href="/dashboard"
              className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
            >
              Finish
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
