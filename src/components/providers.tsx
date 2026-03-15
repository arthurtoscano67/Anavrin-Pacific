"use client";

import "@mysten/dapp-kit/dist/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFullnodeUrl } from "@mysten/sui/client";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { useMemo } from "react";

import { SUI_NETWORK } from "@/lib/config";

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const networks = {
    mainnet: { url: getFullnodeUrl("mainnet") },
    testnet: { url: getFullnodeUrl("testnet") },
    devnet: { url: getFullnodeUrl("devnet") },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork={SUI_NETWORK}>
        <WalletProvider autoConnect preferredWallets={["Slush", "Suiet"]}>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
