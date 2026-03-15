export type Monster = {
  objectId: string;
  name: string;
  seed: string;
  stage: number;
  attack: number;
  defense: number;
  speed: number;
  wins: number;
  losses: number;
  xp: number;
  scars: number;
  broken_horns: number;
  torn_wings: number;
  created_at: string;
  last_breed: string;
  current_health?: number;
  max_health?: number;
  is_dead?: boolean;
  death_count?: number;
  parent1?: string | null;
  parent2?: string | null;
  location: "wallet" | "kiosk";
  kioskId?: string;
  priceMist?: string;
  gearSlots?: MonsterGearSlots;
};

export type TreasuryConfig = {
  mint_enabled: boolean;
  mint_price_mist: string;
  fees: string;
};

export type KioskCap = {
  objectId: string;
  kioskId: string;
  isPersonal?: boolean;
  digest?: string;
  version?: string;
};

export type ItemKind = "Potion" | "Armor" | "Weapon" | "Unknown";

export type EquipmentSlotId = "helmet" | "armor" | "weapon" | "potion";

export type ItemDefinition = {
  objectId: string;
  name: string;
  itemType: number;
  kind: ItemKind;
  slot: EquipmentSlotId;
  healAmount: number;
  attackBonus: number;
  defenseBonus: number;
  priceMist: string;
  durationMs: number;
  supplyLimit: number;
  minted: number;
  enabled: boolean;
};

export type PlayerItem = {
  objectId: string;
  definitionId: string;
  expirationMs: number;
  equipped: boolean;
  name: string;
  itemType: number;
  kind: ItemKind;
  slot: EquipmentSlotId;
  healAmount: number;
  attackBonus: number;
  defenseBonus: number;
  priceMist: string;
  durationMs: number;
  supplyLimit: number;
  minted: number;
  enabled: boolean;
  definition: ItemDefinition | null;
};

export type ArenaStatus = 0 | 1 | 2 | 3;

export type ArenaMonsterSnapshot = {
  objectId: string;
  name: string;
  seed: string;
  stage: number;
  attack: number;
  defense: number;
  speed: number;
  wins: number;
  losses: number;
  xp: number;
  scars: number;
  broken_horns: number;
  torn_wings: number;
  created_at: string;
  current_health?: number;
  max_health?: number;
  is_dead?: boolean;
  death_count?: number;
  gearSlots?: MonsterGearSlots;
};

export type MonsterGearSlot = "hat" | "shirt" | "pants" | "shoes" | "armor" | "suit";

export type MonsterGearSlots = Partial<Record<MonsterGearSlot, string | null>>;

export type ArenaMatch = {
  objectId: string;
  player_a: string;
  player_b: string;
  status: ArenaStatus;
  created_at: string;
  last_update?: string;
  mode?: number;
  previousTransaction?: string;
  mon_a?: string | null;
  mon_b?: string | null;
  stake_a: string;
  stake_b: string;
  battle_attack_a?: number;
  battle_defense_a?: number;
  battle_speed_a?: number;
  battle_attack_b?: number;
  battle_defense_b?: number;
  battle_speed_b?: number;
  monster_a_data?: ArenaMonsterSnapshot | null;
  monster_b_data?: ArenaMonsterSnapshot | null;
};

export type BattleOutcomeEvent = {
  winner_id: string;
  loser_id: string;
  winner_wins: string;
  loser_losses: string;
  winner_xp: string;
  loser_xp: string;
  loser_scars: string;
  loser_broken_horns: string;
  loser_torn_wings: string;
  timestampMs?: string;
};

export type MatchResolution = {
  matchId: string;
  winner: string;
  winnerMonsterId: string;
  loserMonsterId: string;
  totalPayoutMist: string;
  feeMist: string;
  txDigest: string;
  timestampMs: string;
  battleOutcome?: BattleOutcomeEvent;
};

export type Listing = {
  itemId: string;
  kioskId: string;
  priceMist: string;
  txDigest: string;
};

export type ActivePlayer = {
  address: string;
  lastActivityMs: number;
  source: "match_created" | "deposit";
};
