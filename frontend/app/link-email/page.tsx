"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function LinkEmail() {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;
  const router = useRouter();
  const [email1, setEmail1] = useState("");
  const [email2, setEmail2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const explorer = "https://arbitrum-sepolia.blockscout.com/tx/";

  const canConfirm = useMemo(() => {
    if (!email1 || !email2) return false;
    if (email1 !== email2) return false;
    return true;
  }, [email1, email2]);

  async function onConfirm() {
    try {
      if (!walletAddress) throw new Error("Connect wallet first");
      if (!canConfirm) return;
      setLoading(true);
      setError("");
      // Hash email as bytes32 (keccak256 of lowercase trimmed string)
      const normalized = email1.trim().toLowerCase();
      // keccak256 in browser: use SubtleCrypto is not available; ask backend to hash or use a tiny helper
      // For simplicity here, call a small helper API that computes keccak256
      const hRes = await fetch("/api/util/keccak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: normalized }),
      });
      const hJson = await hRes.json();
      const emailHashHex = hJson?.hash as `0x${string}`;

      // Ask the user's wallet to sign EIP-712 typed data (real signature by wallet owner)
      const deadline = Math.floor(Date.now() / 1000) + 15 * 60; // 15 min
      // Fetch current EIP-712 nonce from contract
      const nonceRes = await fetch("/api/email/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const nonceJson = await nonceRes.json();
      const currentNonce: string = nonceJson?.nonce ?? "0";
      const verifyingContract = nonceJson?.verifyingContract as
        | `0x${string}`
        | undefined;
      if (!verifyingContract) {
        throw new Error("Missing verifying contract address");
      }

      const typedData = {
        domain: {
          name: "EmailDomainVerifier",
          version: "1",
          chainId: 421614,
          verifyingContract,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          SetEmail: [
            { name: "wallet", type: "address" },
            { name: "emailHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "SetEmail",
        message: {
          wallet: walletAddress,
          emailHash: emailHashHex,
          nonce: Number(currentNonce),
          deadline,
        },
      } as const;
      // dynamic labs exposes an ethers-like provider on window.ethereum; use the raw JSON-RPC
      const sig = await (
        window as unknown as {
          ethereum: {
            request: (args: {
              method: string;
              params: unknown[];
            }) => Promise<string>;
          };
        }
      ).ethereum.request({
        method: "eth_signTypedData_v4",
        params: [walletAddress, JSON.stringify(typedData)],
      });
      const signature = sig as `0x${string}`;

      const res = await fetch("/api/email/set-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          emailHashHex,
          deadline: String(deadline),
          signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to link email");
      setTxHash(data.hash as string);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-gray-900">
              Link email (optional)
            </h2>
            <p className="text-gray-600">
              Your email hash will be set on-chain by the backend key after you
              sign.
            </p>
          </div>

          <div className="grid gap-4 max-w-md mx-auto">
            <input
              type="email"
              placeholder="you@example.com"
              value={email1}
              onChange={(e) => setEmail1(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              type="email"
              placeholder="repeat email"
              value={email2}
              onChange={(e) => setEmail2(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {error && (
            <div className="text-center text-sm text-red-600">{error}</div>
          )}
          {txHash && (
            <div className="text-center">
              <a
                href={`${explorer}${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline"
              >
                View transaction
              </a>
            </div>
          )}

          {txHash ? (
            <div className="flex justify-center">
              <button
                className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
                onClick={() => router.push("/dashboard")}
              >
                Finish
              </button>
            </div>
          ) : (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700"
              >
                Back
              </button>
              <button
                className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold disabled:opacity-50 flex items-center gap-2 justify-center"
                onClick={onConfirm}
                disabled={!canConfirm || loading}
              >
                {loading && (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                )}
                Confirm
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
