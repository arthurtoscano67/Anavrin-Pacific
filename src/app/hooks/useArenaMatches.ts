import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";

import { fetchAllArenaMatches } from "../lib/sui";
import type { ArenaMatch } from "../lib/types";

export const ACTIVE_ARENA_MATCH_STORAGE_KEY = "activeArenaMatch";

function includesPlayer(match: ArenaMatch, address?: string | null): boolean {
  if (!address) return false;
  return match.player_a === address || match.player_b === address;
}

function preferOwnedMatch(matches: ArenaMatch[], storedMatchId?: string | null): ArenaMatch | null {
  if (matches.length === 0) return null;
  if (storedMatchId) {
    const stored = matches.find((match) => match.objectId === storedMatchId);
    if (stored) return stored;
  }

  const active = matches.find((match) => match.status === 0 || match.status === 1);
  if (active) return active;
  return matches[0] ?? null;
}

function readStoredMatchId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ARENA_MATCH_STORAGE_KEY);
}

export function useArenaMatches(ownerAddress?: string | null) {
  const client = useSuiClient();
  const [storedMatchId, setStoredMatchId] = useState<string | null>(() => readStoredMatchId());

  const matchesQuery = useQuery({
    queryKey: ["arenaMatches"],
    queryFn: () => fetchAllArenaMatches(client),
    refetchInterval: 12_000,
  });

  const matches = matchesQuery.data ?? [];

  const activeMatches = useMemo(
    () => matches.filter((match) => match.status === 0 || match.status === 1),
    [matches]
  );

  const ownedMatches = useMemo(
    () => matches.filter((match) => includesPlayer(match, ownerAddress)),
    [matches, ownerAddress]
  );

  const restoredOwnedMatch = useMemo(
    () => preferOwnedMatch(ownedMatches, storedMatchId),
    [ownedMatches, storedMatchId]
  );

  const persistMatchId = useCallback((matchId?: string | null) => {
    if (typeof window === "undefined") return;
    if (matchId) {
      window.localStorage.setItem(ACTIVE_ARENA_MATCH_STORAGE_KEY, matchId);
      setStoredMatchId(matchId);
      return;
    }
    window.localStorage.removeItem(ACTIVE_ARENA_MATCH_STORAGE_KEY);
    setStoredMatchId(null);
  }, []);

  return {
    ...matchesQuery,
    matches,
    activeMatches,
    ownedMatches,
    restoredOwnedMatch,
    storedMatchId,
    persistMatchId,
  };
}
