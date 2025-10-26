"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { arbitrumSepolia } from "viem/chains";
import { useEffect, useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "your-privy-app-id"}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
        },
        defaultChain: arbitrumSepolia,
        supportedChains: [arbitrumSepolia],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
