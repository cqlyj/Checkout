"use client";

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
      // This is where facial payment flow would be triggered (scan + on-chain tx)
      // For now, simulate a brief delay and success.
      await new Promise((r) => setTimeout(r, 1200));
      setCart([]);
      setMessage("Checkout complete via facial payment demo!");
    } catch {
      setMessage("Checkout failed. Please try again.");
    } finally {
      setCheckingOut(false);
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
              <button
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-white font-semibold disabled:opacity-50"
                disabled={cart.length === 0 || checkingOut}
                onClick={onCheckout}
              >
                {checkingOut ? "Processing..." : "Checkout with Face"}
              </button>
              {message && (
                <div className="text-sm text-emerald-700">{message}</div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
