import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";

import {
  fetchActivePlayers,
  fetchAdminCap,
  fetchLatestMintPreviewId,
  fetchListedMonsters,
  fetchOwnedKioskCaps,
  fetchOwnedKioskMonsters,
  fetchOwnedMonsters,
  fetchRecentMatches,
  fetchTreasury,
  fetchLeaderboard,
} from "../lib/sui";

export function useAnavrinData() {
  const account = useCurrentAccount();
  const client = useSuiClient();

  const treasury = useQuery({
    queryKey: ["treasury"],
    queryFn: () => fetchTreasury(client),
    refetchInterval: 15_000,
  });

  const mintPreviewId = useQuery({
    queryKey: ["mintPreviewId"],
    queryFn: () => fetchLatestMintPreviewId(client),
    refetchInterval: 30_000,
  });

  const walletMonsters = useQuery({
    queryKey: ["walletMonsters", account?.address],
    queryFn: () => fetchOwnedMonsters(client, account!.address),
    enabled: Boolean(account?.address),
    refetchInterval: 12_000,
  });

  const kioskCaps = useQuery({
    queryKey: ["kioskCaps", account?.address],
    queryFn: () => fetchOwnedKioskCaps(client, account!.address),
    enabled: Boolean(account?.address),
    refetchInterval: 20_000,
  });

  const kioskMonsters = useQuery({
    queryKey: ["kioskMonsters", account?.address],
    queryFn: () => fetchOwnedKioskMonsters(client, account!.address),
    enabled: Boolean(account?.address),
    refetchInterval: 15_000,
  });

  const listedMonsters = useQuery({
    queryKey: ["listedMonsters"],
    queryFn: () => fetchListedMonsters(client),
    refetchInterval: 20_000,
  });

  const recentMatches = useQuery({
    queryKey: ["recentMatches"],
    queryFn: () => fetchRecentMatches(client),
    refetchInterval: 12_000,
  });

  const activePlayers = useQuery({
    queryKey: ["activePlayers"],
    queryFn: () => fetchActivePlayers(client),
    refetchInterval: 12_000,
  });

  const leaderboard = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchLeaderboard(client),
    refetchInterval: 20_000,
  });

  const adminCapId = useQuery({
    queryKey: ["adminCap", account?.address],
    queryFn: () => fetchAdminCap(client, account!.address),
    enabled: Boolean(account?.address),
    refetchInterval: 20_000,
  });

  const adults = useMemo(
    () => (walletMonsters.data ?? []).filter((m) => m.stage >= 2),
    [walletMonsters.data]
  );

  return {
    account,
    treasury,
    mintPreviewId,
    walletMonsters,
    kioskCaps,
    kioskMonsters,
    listedMonsters,
    recentMatches,
    activePlayers,
    leaderboard,
    adminCapId,
    adults,
  };
}
