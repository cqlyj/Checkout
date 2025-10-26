"use client";

import dynamic from "next/dynamic";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useState } from "react";

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
  const [debug, setDebug] = useState<string>("");

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
    setDebug(
      `payload: len=${payload.embedding.length}, dim=${payload.embeddingDim}`
    );
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

          {/* Stepper */}
          <ol className="flex w-full items-center justify-center gap-4 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-indigo-600 text-white text-xs grid place-items-center">
                1
              </span>
              Face
            </li>
            <div className="h-px w-10 bg-gray-300" />
            <li className="flex items-center gap-2 opacity-60">
              <span className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs grid place-items-center">
                2
              </span>
              PIN
            </li>
            <div className="h-px w-10 bg-gray-300" />
            <li className="flex items-center gap-2 opacity-60">
              <span className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs grid place-items-center">
                3
              </span>
              Confirm
            </li>
            <div className="h-px w-10 bg-gray-300" />
            <li className="flex items-center gap-2 opacity-60">
              <span className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs grid place-items-center">
                4
              </span>
              Sign
            </li>
            <div className="h-px w-10 bg-gray-300" />
            <li className="flex items-center gap-2 opacity-60">
              <span className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 text-xs grid place-items-center">
                5
              </span>
              Email
            </li>
          </ol>

          <div className="mt-4">
            {step === 1 ? (
              <FaceCapture onCaptured={handleCaptured} />
            ) : (
              <div className="relative h-64 w-64 rounded-full bg-green-50 border border-green-200 shadow grid place-items-center">
                <span className="text-green-700">Face captured ✓</span>
              </div>
            )}
          </div>

          <div className="w-full max-w-md">
            <div className="h-2 w-full rounded bg-gray-200">
              <div
                className="h-2 rounded bg-indigo-600 transition-all"
                style={{ width: `${(step / 5) * 100}%` }}
              />
            </div>
            <div className="mt-2 text-center text-sm text-gray-600 min-h-5">
              {message}
            </div>
            {debug && (
              <div className="mt-1 text-center text-xs text-gray-400 break-all">
                {debug}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              disabled={step === 1 || submitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 disabled:opacity-50"
            >
              Back
            </button>
            <button
              disabled={step < 1 || submitting}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-white font-semibold disabled:opacity-50"
            >
              {step === 1
                ? "Awaiting face..."
                : step === 2
                ? "Set PIN"
                : "Next"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
