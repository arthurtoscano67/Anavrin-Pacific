"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ArenaStateSnapshot } from "@/lib/types";

const EMPTY_STATE: ArenaStateSnapshot = {
  players: [],
  invites: [],
  matches: [],
  serverTime: Date.now(),
};

async function sendArenaAction(payload: unknown): Promise<ArenaStateSnapshot> {
  const response = await fetch("/api/arena/state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Arena request failed");
  }
  return (await response.json()) as ArenaStateSnapshot;
}

export function useArenaRealtime(address?: string) {
  const [state, setState] = useState<ArenaStateSnapshot>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/arena/stream");
    sourceRef.current = source;

    source.addEventListener("snapshot", (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as ArenaStateSnapshot;
      setState(parsed);
      setConnected(true);
      setError(null);
    });

    source.onerror = () => {
      setConnected(false);
      setError("Realtime link lost. Trying to reconnect...");
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!address) return;
    const ticker = setInterval(() => {
      void sendArenaAction({
        action: "heartbeat",
        address,
        alias: `${address.slice(0, 6)}...${address.slice(-4)}`,
      });
    }, 10_000);

    void sendArenaAction({
      action: "heartbeat",
      address,
      alias: `${address.slice(0, 6)}...${address.slice(-4)}`,
    });

    return () => {
      clearInterval(ticker);
      void sendArenaAction({ action: "leave", address });
    };
  }, [address]);

  const api = useMemo(
    () => ({
      invite: (from: string, to: string, monsterId?: string) =>
        sendArenaAction({ action: "invite", from, to, monsterId }),
      respondInvite: (id: string, accepted: boolean) =>
        sendArenaAction({ action: "respondInvite", id, accepted }),
      updateMatch: (payload: {
        id: string;
        status?: "pending" | "live" | "finished";
        winner?: string;
        onchainMatchId?: string;
        monsterA?: string;
        monsterB?: string;
        addNote?: string;
        addSpectator?: string;
        removeSpectator?: string;
      }) => sendArenaAction({ action: "updateMatch", ...payload }),
    }),
    []
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/arena/state");
    if (!response.ok) return;
    const parsed = (await response.json()) as ArenaStateSnapshot;
    setState(parsed);
  }, []);

  return {
    state,
    connected,
    error,
    refresh,
    ...api,
  };
}
