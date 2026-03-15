import type { ArenaMatch, ArenaStateSnapshot, BattleInvite, OnlinePlayer } from "@/lib/types";

type ArenaInternalState = {
  players: Map<string, OnlinePlayer>;
  invites: Map<string, BattleInvite>;
  matches: Map<string, ArenaMatch>;
  listeners: Set<(snapshot: ArenaStateSnapshot) => void>;
};

const PLAYER_TTL_MS = 60_000;

declare global {
  var __ANAVRIN_ARENA_STATE__: ArenaInternalState | undefined;
}

function createState(): ArenaInternalState {
  return {
    players: new Map(),
    invites: new Map(),
    matches: new Map(),
    listeners: new Set(),
  };
}

function state(): ArenaInternalState {
  if (!globalThis.__ANAVRIN_ARENA_STATE__) {
    globalThis.__ANAVRIN_ARENA_STATE__ = createState();
  }
  return globalThis.__ANAVRIN_ARENA_STATE__;
}

function sanitizePlayers(players: Map<string, OnlinePlayer>) {
  const now = Date.now();
  for (const [key, player] of players.entries()) {
    if (now - player.lastSeen > PLAYER_TTL_MS) {
      players.delete(key);
    }
  }
}

function snapshot(): ArenaStateSnapshot {
  const st = state();
  sanitizePlayers(st.players);
  return {
    players: [...st.players.values()].sort((a, b) => b.lastSeen - a.lastSeen),
    invites: [...st.invites.values()].sort((a, b) => b.createdAt - a.createdAt),
    matches: [...st.matches.values()].sort((a, b) => b.createdAt - a.createdAt),
    serverTime: Date.now(),
  };
}

function emit() {
  const data = snapshot();
  const listeners = state().listeners;
  for (const listener of listeners) {
    listener(data);
  }
}

function inviteId() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function matchId() {
  return `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function upsertPlayer(address: string, alias: string, selectedMonsterId?: string) {
  const st = state();
  const existing = st.players.get(address);
  st.players.set(address, {
    address,
    alias: alias || existing?.alias || `${address.slice(0, 6)}...${address.slice(-4)}`,
    selectedMonsterId: selectedMonsterId || existing?.selectedMonsterId,
    lastSeen: Date.now(),
  });
  emit();
}

export function removePlayer(address: string) {
  state().players.delete(address);
  emit();
}

export function sendInvite(from: string, to: string, monsterId?: string) {
  const st = state();
  const invite: BattleInvite = {
    id: inviteId(),
    from,
    to,
    monsterId,
    createdAt: Date.now(),
    status: "pending",
  };
  st.invites.set(invite.id, invite);
  emit();
  return invite;
}

export function respondInvite(id: string, accepted: boolean) {
  const st = state();
  const invite = st.invites.get(id);
  if (!invite) return null;

  invite.status = accepted ? "accepted" : "declined";
  st.invites.set(id, invite);

  if (accepted) {
    const match: ArenaMatch = {
      id: matchId(),
      playerA: invite.from,
      playerB: invite.to,
      monsterA: invite.monsterId,
      createdAt: Date.now(),
      spectators: [],
      status: "pending",
      notes: ["Invite accepted. Create an on-chain match with create_match()."],
    };
    st.matches.set(match.id, match);
  }

  emit();
  return invite;
}

export function updateMatch(
  id: string,
  payload: Partial<Omit<ArenaMatch, "id" | "createdAt" | "spectators" | "notes">> & {
    addNote?: string;
    addSpectator?: string;
    removeSpectator?: string;
  }
) {
  const st = state();
  const current = st.matches.get(id);
  if (!current) return null;

  const next: ArenaMatch = {
    ...current,
    ...payload,
    spectators: [...current.spectators],
    notes: [...current.notes],
  };

  if (payload.addSpectator && !next.spectators.includes(payload.addSpectator)) {
    next.spectators.push(payload.addSpectator);
  }
  if (payload.removeSpectator) {
    next.spectators = next.spectators.filter((s) => s !== payload.removeSpectator);
  }
  if (payload.addNote) {
    next.notes.push(payload.addNote);
  }

  st.matches.set(id, next);
  emit();
  return next;
}

export function currentArenaState() {
  return snapshot();
}

export function subscribeArena(listener: (snapshot: ArenaStateSnapshot) => void) {
  const st = state();
  st.listeners.add(listener);
  return () => st.listeners.delete(listener);
}
