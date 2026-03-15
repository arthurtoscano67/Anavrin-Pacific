"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import type { SuiClient } from "@mysten/sui/client";

import { fetchAdminCapId, fetchKioskMonsters, fetchMintConfig, fetchOwnedKiosks, fetchWalletMonsters } from "@/lib/sui-data";
import type { KioskModel, MintConfig, MonsterModel } from "@/lib/types";

interface PortfolioData {
  walletMonsters: MonsterModel[];
  kioskMonsters: MonsterModel[];
  kiosks: KioskModel[];
  adminCapId: string | null;
  mintConfig: MintConfig | null;
}

async function loadPortfolio(client: SuiClient, address?: string): Promise<PortfolioData> {
  const mintConfig = await fetchMintConfig(client);
  if (!address) {
    return {
      walletMonsters: [],
      kioskMonsters: [],
      kiosks: [],
      adminCapId: null,
      mintConfig,
    };
  }

  const [walletMonsters, kiosks, adminCapId] = await Promise.all([
    fetchWalletMonsters(client, address),
    fetchOwnedKiosks(client, address),
    fetchAdminCapId(client, address),
  ]);

  const kioskMonstersNested = await Promise.all(
    kiosks.map((kiosk) => fetchKioskMonsters(client, kiosk.kioskId))
  );
  const kioskMonsters = kioskMonstersNested.flat();

  return {
    walletMonsters,
    kioskMonsters,
    kiosks,
    adminCapId,
    mintConfig,
  };
}

export function useMonsterPortfolio(address?: string) {
  const client = useSuiClient();
  const query = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => loadPortfolio(client, address),
    refetchInterval: 20_000,
  });

  const allMonsters = useMemo(
    () => [...(query.data?.walletMonsters || []), ...(query.data?.kioskMonsters || [])],
    [query.data?.kioskMonsters, query.data?.walletMonsters]
  );

  return {
    ...query,
    walletMonsters: query.data?.walletMonsters || [],
    kioskMonsters: query.data?.kioskMonsters || [],
    allMonsters,
    kiosks: query.data?.kiosks || [],
    adminCapId: query.data?.adminCapId || null,
    mintConfig: query.data?.mintConfig || null,
  };
}
