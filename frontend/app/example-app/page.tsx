"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  name: string;
  priceCents: number;
  img?: string;
};

const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Wireless Earbuds",
    priceCents: 4999,
    img: "/img/earbud.jpg",
  },
  { id: "p2", name: "Smart Watch", priceCents: 12999, img: "./img/watch.jpg" },
  { id: "p3", name: "Phone Case", priceCents: 1999, img: "./img/case.jpg" },
  { id: "p4", name: "USB-C Cable", priceCents: 999, img: "./img/usb.jpg" },
];

type CartItem = { id: string; qty: number };

export default function ExampleApp() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [message, setMessage] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [identifiedWallet, setIdentifiedWallet] = useState<
    `0x${string}` | null
  >(null);
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [pin, setPin] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  const items = useMemo(() => PRODUCTS, []);

  const addToCart = (id: string) => {
    setCart((prev) => {
      const found = prev.find((c) => c.id === id);
      if (found) {
        return prev.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { id, qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) return removeFromCart(id);
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, qty } : c)));
  };

  const currency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const cartTotalCents = useMemo(
    () =>
      cart.reduce((sum, c) => {
        const p = items.find((i) => i.id === c.id);
        return sum + (p ? p.priceCents * c.qty : 0);
      }, 0),
    [cart, items]
  );

  async function onCheckout() {
    try {
      setCheckingOut(true);
      setMessage("");
      setModalError("");
      setShowScanner(true);
    } catch {
      setMessage("Checkout failed. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }

  const FaceCapture = useMemo(
    () =>
      dynamic(
        () =>
          import("@/components/face/FaceCapture").then((m) => m.FaceCapture),
        { ssr: false }
      ),
    []
  );

  async function handleCaptured(args: {
    embedding: number[];
    embeddingDim: number;
    modelVersion: string;
  }) {
    try {
      setMessage("Identifying face...");
      const res = await fetch("/api/face/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding: args.embedding }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Identify failed");
      if (!data?.match) throw new Error("No matching wallet found");
      setIdentifiedWallet(data.match as `0x${string}`);
      setSimilarity(
        typeof data.similarity === "number" ? data.similarity : null
      );
      setMessage("");
    } catch (e: unknown) {
      setMessage((e as { message?: string })?.message || "Identify failed");
    }
  }

  function usdCentsToUsdcUnits(cents: number): string {
    // USDC has 6 decimals; cents has 2 decimals -> multiply by 10^(6-2) = 10000
    const units = Number(Math.max(0, cents)) * 10000;
    return String(units);
  }

  async function onPay() {
    try {
      if (!identifiedWallet) throw new Error("No wallet identified");
      const normalizedPin = pin.trim();
      if (!/^\d{6}$/.test(normalizedPin))
        throw new Error("Enter a 6-digit PIN");
      setSubmitting(true);
      setMessage("Generating proof...");
      setModalError("");
      const backend =
        process.env.NEXT_PUBLIC_ZK_BACKEND_URL || "http://localhost:8787";
      const intent = 0; // use intent 0 (same as registration) for transfers for now
      const nonceRes = await fetch(`${backend}/api/zk/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: identifiedWallet, intent }),
      });
      const nonceJson = await nonceRes.json();
      if (!nonceRes.ok)
        throw new Error(nonceJson?.error || "Failed to get nonce");
      const { nonce } = nonceJson;
      const proofRes = await fetch(`${backend}/api/zk/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: identifiedWallet,
          pin: normalizedPin,
          intent,
          nonce,
        }),
      });
      const proofJson = await proofRes.json();
      if (!proofRes.ok)
        throw new Error(proofJson?.error || "Failed to generate proof");

      setMessage("Submitting payment...");
      const token =
        (process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS as `0x${string}`) ||
        ("0x8cc9F652130D7698763fD870E90CFdaCd3E9ee41" as `0x${string}`); // MockUSDC from addresses.txt fallback
      const to =
        (process.env.NEXT_PUBLIC_MERCHANT_ADDRESS as `0x${string}`) ||
        (process.env.NEXT_PUBLIC_EOA_RECEIVER as `0x${string}`) ||
        ("0x681D696734e0f04b361507C3F234A2528A77e8Ee" as `0x${string}`); // Registry as dummy fallback
      const amount = usdCentsToUsdcUnits(cartTotalCents);
      const res = await fetch("/api/delegation/agree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: proofJson.proof,
          publicSignals: proofJson.publicSignals,
          from: identifiedWallet,
          to,
          token,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Payment failed");
      setTxHash(data.hash as string);
      setMessage("");
      setCart([]);
    } catch {
      setModalError("PIN is not correct.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Example Store</h1>
          <button
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700"
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <section className="md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="h-40 bg-gray-100 rounded mb-3 flex items-center justify-center text-gray-400">
                    {p.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.img} alt={p.name} className="h-full" />
                    ) : (
                      <span>No image</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-gray-600 text-sm">
                        {currency(p.priceCents)}
                      </div>
                    </div>
                    <button
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-white"
                      onClick={() => addToCart(p.id)}
                    >
                      Add to cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="md:col-span-1">
            <h2 className="text-xl font-semibold mb-4">Cart</h2>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              {cart.length === 0 && (
                <div className="text-gray-500 text-sm">Your cart is empty.</div>
              )}
              {cart.map((c) => {
                const p = items.find((i) => i.id === c.id)!;
                return (
                  <div key={c.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-gray-600 text-sm">
                        {currency(p.priceCents)} each
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-16 rounded border border-gray-300 px-2 py-1"
                        value={c.qty}
                        min={1}
                        onChange={(e) =>
                          updateQty(c.id, Number(e.target.value))
                        }
                      />
                      <button
                        className="rounded bg-red-100 text-red-700 px-2 py-1"
                        onClick={() => removeFromCart(c.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="border-t pt-3 flex items-center justify-between">
                <div className="font-semibold">Total</div>
                <div className="font-semibold">{currency(cartTotalCents)}</div>
              </div>
              {!txHash ? (
                <>
                  <button
                    className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-white font-semibold disabled:opacity-50"
                    disabled={cart.length === 0 || checkingOut || submitting}
                    onClick={onCheckout}
                  >
                    {checkingOut ? "Processing..." : "Checkout"}
                  </button>
                  {message && (
                    <div className="text-sm text-emerald-700">{message}</div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm">Payment sent.</div>
                  <a
                    href={`https://arbitrum-sepolia.blockscout.com/tx/${txHash}`}
                    className="text-indigo-600 underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                  <button
                    className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-white font-semibold"
                    onClick={() => {
                      if (typeof window !== "undefined")
                        window.location.reload();
                    }}
                  >
                    Finish
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Scanner & Payment Modal */}
        {showScanner && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-4">
              <h3 className="text-xl font-semibold text-gray-900 text-center">
                Verify your face to checkout
              </h3>
              {txHash ? (
                <div className="space-y-4 text-center">
                  <div className="text-sm text-emerald-700">Payment sent.</div>
                  <a
                    href={`https://arbitrum-sepolia.blockscout.com/tx/${txHash}`}
                    className="text-indigo-600 underline break-all"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                  <button
                    className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-white font-semibold"
                    onClick={() => {
                      setShowScanner(false);
                      if (typeof window !== "undefined")
                        window.location.reload();
                    }}
                  >
                    Finish
                  </button>
                </div>
              ) : !identifiedWallet ? (
                <div className="flex flex-col items-center gap-4">
                  <FaceCapture onCaptured={handleCaptured} />
                  <button
                    className="text-sm text-gray-600 underline"
                    onClick={() => setShowScanner(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-sm text-gray-600">Wallet</div>
                    <div className="font-mono text-sm break-all">
                      {identifiedWallet}
                    </div>
                    {typeof similarity === "number" && (
                      <div className="text-xs text-gray-500">
                        Similarity: {similarity.toFixed(3)}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-sm text-gray-600">Amount</div>
                    <div className="font-semibold">
                      {currency(cartTotalCents)} (USDC)
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Enter your PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="••••••"
                    />
                  </div>
                  <div className="flex justify-between gap-3">
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700"
                      onClick={() => {
                        setIdentifiedWallet(null);
                        setShowScanner(false);
                        setPin("");
                        setModalError("");
                      }}
                    >
                      Back
                    </button>
                    <button
                      className="rounded-lg bg-emerald-600 px-5 py-3 text-white font-semibold disabled:opacity-50"
                      onClick={onPay}
                      disabled={submitting || pin.length !== 6}
                    >
                      {submitting ? "Processing..." : "Pay with Face"}
                    </button>
                  </div>
                  {modalError && (
                    <div className="text-sm text-red-600">{modalError}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
