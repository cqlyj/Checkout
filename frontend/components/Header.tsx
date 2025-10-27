"use client";

import Link from "next/link";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();
  if (pathname === "/") {
    return null;
  }
  return (
    <header className="sticky top-0 z-30 w-full border-b border-gray-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold text-gray-900">
          Checkout
        </Link>
        <div className="flex items-center gap-3">
          <div className="scale-110 sm:scale-125">
            <DynamicWidget variant="modal" />
          </div>
        </div>
      </div>
    </header>
  );
}
