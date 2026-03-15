import type { EQUIPMENT_SLOTS } from "./config";

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export interface MonsterStats {
  attack: number;
  defense: number;
  speed: number;
  wins: number;
  losses: number;
  xp: number;
}

export interface MonsterModel {
  objectId: string;
  name: string;
  stage: number;
  createdAt: number;
  stats: MonsterStats;
  location: "wallet" | "kiosk";
  kioskId?: string;
  listedPriceMist?: string;
  ownerAddress?: string;
}

export interface KioskModel {
  kioskId: string;
  ownerCapId: string;
  itemCount: number;
}

export interface MintConfig {
  mintPriceMist: string;
  mintEnabled: boolean;
  feesMist: string;
}

export interface OnlinePlayer {
  address: string;
  alias: string;
  lastSeen: number;
  selectedMonsterId?: string;
}

export interface BattleInvite {
  id: string;
  from: string;
  to: string;
  monsterId?: string;
  createdAt: number;
  status: "pending" | "accepted" | "declined";
}

export interface ArenaMatch {
  id: string;
  playerA: string;
  playerB: string;
  monsterA?: string;
  monsterB?: string;
  onchainMatchId?: string;
  createdAt: number;
  spectators: string[];
  status: "pending" | "live" | "finished";
  winner?: string;
  notes: string[];
}

export interface ArenaStateSnapshot {
  players: OnlinePlayer[];
  invites: BattleInvite[];
  matches: ArenaMatch[];
  serverTime: number;
}
