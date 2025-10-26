"use client";

import dynamic from "next/dynamic";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useState } from "react";
import React from "react";

const FaceCapture = dynamic(
  () => import("@/components/face/FaceCapture").then((m) => m.FaceCapture),
  { ssr: false }
);

export default function RegisterPage() {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address; // checksummed by Dynamic
  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");

  async function handleCaptured(args: {
    embedding: number[];
    embeddingDim: number;
    modelVersion: string;
  }) {
    if (!walletAddress) {
      setMessage("Please connect your wallet first.");
      return;
    }
    setSubmitting(true);
    const payload = {
      walletAddressHex: walletAddress,
      embedding: Array.isArray(args.embedding)
        ? args.embedding
        : Array.from(args.embedding || []),
      embeddingDim:
        typeof args.embeddingDim === "number" && args.embeddingDim > 0
          ? args.embeddingDim
          : (args.embedding || []).length,
      modelVersion: args.modelVersion,
    };
    setMessage("Registering your face template...");
    try {
      const res = await fetch("/api/face/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const missing = Array.isArray(data?.missing)
          ? ` missing=[${data.missing.join(",")}]`
          : "";
        throw new Error(`${data?.error || "Failed to register"}${missing}`);
      }
      setMessage("Face registered. Proceed to set your PIN.");
      setStep(2);
    } catch (e: unknown) {
      setMessage((e as { message?: string })?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (submitting) return;
    setMessage("");
    setStep((s) => Math.max(1, s - 1));
  }

  function handleNext() {
    if (submitting) return;
    setMessage("");
    if (step === 2) {
      const normalized = pin.trim();
      if (normalized.length !== 6 || /\D/.test(normalized)) {
        setMessage("Enter a 6-digit PIN.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      const normalized = confirmPin.trim();
      if (normalized.length !== 6 || /\D/.test(normalized)) {
        setMessage("Confirm with a 6-digit PIN.");
        return;
      }
      if (normalized !== pin) {
        setMessage("PINs do not match.");
        return;
      }
      setStep(4);
      return;
    }
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex flex-col items-center gap-8">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-gray-900">Register</h2>
            <p className="text-gray-600">
              Capture your face and set up your account
            </p>
          </div>

          {/* Stepper with colored circles and connectors */}
          {(() => {
            const stepsLabels = ["Face", "PIN", "Confirm", "Proof", "Email"];
            return (
              <div className="flex w-full items-center justify-center gap-4 text-sm">
                {stepsLabels.map((label, idx) => {
                  const circleActive = idx < step; // 1-based step
                  const connectorActive = idx < step - 1; // connectors behind current step
                  return (
                    <div key={label} className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-6 w-6 rounded-full grid place-items-center text-xs ${
                            circleActive
                              ? "bg-indigo-600 text-white"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span
                          className={
                            circleActive ? "text-gray-900" : "text-gray-500"
                          }
                        >
                          {label}
                        </span>
                      </div>
                      {idx < stepsLabels.length - 1 && (
                        <div
                          className={`h-0.5 w-10 ${
                            connectorActive ? "bg-indigo-600" : "bg-gray-300"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="mt-4">
            {step === 1 ? (
              <FaceCapture onCaptured={handleCaptured} />
            ) : step === 2 ? (
              <div className="w-full max-w-sm mx-auto">
                <label className="block text-sm font-medium text-gray-700">
                  Set a PIN (6 digits)
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
            ) : step === 3 ? (
              <div className="w-full max-w-sm mx-auto">
                <label className="block text-sm font-medium text-gray-700">
                  Confirm your PIN
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
            ) : step === 4 ? (
              <ProofSection walletAddress={walletAddress} pin={pin} />
            ) : (
              <div className="relative h-64 w-64 rounded-full bg-green-50 border border-green-200 shadow grid place-items-center">
                <span className="text-green-700">Face captured ✓</span>
              </div>
            )}
          </div>

          <div className="w-full max-w-md">
            <div className="mt-2 text-center text-sm text-gray-600 min-h-5">
              {message}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              disabled={step === 1 || submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              disabled={step === 1 || submitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-white font-semibold disabled:opacity-50"
            >
              {step === 1
                ? "Awaiting face..."
                : step === 2
                ? "Set PIN"
                : step === 3
                ? "Confirm PIN"
                : step === 4
                ? "Generate proof"
                : "Next"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ProofSection({
  walletAddress,
  pin,
}: {
  walletAddress?: string;
  pin: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<{
    proof: unknown;
    publicSignals: unknown;
    credentialHash: string;
    resultHash: string;
  } | null>(null);

  async function handleGenerate() {
    try {
      setLoading(true);
      setError("");
      setResult(null);
      if (!walletAddress) throw new Error("Connect wallet first");
      if (!/^\d{6}$/.test(pin)) throw new Error("PIN missing or invalid");
      // 0 = register intent
      const intent = 0;
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
      setResult(proofJson);
    } catch (e: unknown) {
      setError(
        (e as { message?: string })?.message || "Error generating proof"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto text-center space-y-4">
      <h3 className="text-xl font-semibold text-gray-900">
        Generate zero knowledge proof
      </h3>
      <p className="text-gray-600">
        PIN will be proven in-circuit without revealing it.
      </p>
      <button
        className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold disabled:opacity-50"
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? "Generating..." : "Generate proof"}
      </button>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {result && (
        <pre className="text-left text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-64">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
