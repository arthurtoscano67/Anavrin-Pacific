import { KioskClient, Network } from "@mysten/kiosk";
import type { PaginatedEvents, SuiClient, SuiObjectData } from "@mysten/sui/client";

import {
  ACTIVE_PLAYER_EVENT_TYPES,
  ADMIN_CAP_TYPE,
  ARENA_MATCH_TYPE,
  MODULE,
  MONSTER_TYPE,
  PACKAGE_ID,
  TREASURY_ID,
} from "./sui_constants";
import { ITEM_DEFINITION_TYPE, ITEMS_MODULE, ITEMS_PACKAGE_ID, ITEM_TYPE } from "./constants";
import { resolveEquipmentSlot, resolveItemKind } from "./items";
import type {
  ActivePlayer,
  ArenaMatch,
  ArenaMonsterSnapshot,
  BattleOutcomeEvent,
  ItemDefinition,
  KioskCap,
  Listing,
  MatchResolution,
  Monster,
  MonsterGearSlots,
  PlayerItem,
  TreasuryConfig,
} from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function parseOptionId(value: unknown): string | null {
  if (!value) return null;
  const rec = asRecord(value);
  if (typeof rec.id === "string") return rec.id;

  const vec = rec.vec as unknown[] | undefined;
  if (Array.isArray(vec) && vec.length > 0) {
    const first = vec[0] as Record<string, unknown>;
    if (typeof first === "string") return first;
    if (typeof first.id === "string") return first.id;
    if (asRecord(first.id).id) return String(asRecord(first.id).id);
  }
  return null;
}

function parseOptionMonsterId(value: unknown): string | null {
  const fields = extractEmbeddedMonsterFields(value);
  if (!fields) return null;
  return parseObjectIdField(fields.id);
}

function parseObjectIdField(value: unknown): string | null {
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (typeof rec.id === "string") return rec.id;
  if (typeof rec.bytes === "string") {
    return rec.bytes.startsWith("0x") ? rec.bytes : `0x${rec.bytes}`;
  }
  const nested = asRecord(rec.id);
  if (typeof nested.id === "string") return nested.id;
  if (typeof nested.bytes === "string") {
    return nested.bytes.startsWith("0x") ? nested.bytes : `0x${nested.bytes}`;
  }
  return null;
}

function parseMoveString(value: unknown): string {
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (typeof rec.bytes === "string") return rec.bytes;
  if (Array.isArray(rec.bytes)) {
    const bytes = rec.bytes.filter((entry): entry is number => typeof entry === "number");
    if (bytes.length > 0) {
      try {
        return new TextDecoder().decode(Uint8Array.from(bytes));
      } catch {
        // Fall back to string coercion below.
      }
    }
  }
  if (typeof rec.value === "string") return rec.value;
  return String(value ?? "");
}

function extractEmbeddedMonsterFields(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  const rec = asRecord(value);
  const directFields = asRecord(rec.fields);
  if (parseObjectIdField(directFields.id)) {
    return directFields;
  }

  const vec = rec.vec as unknown[] | undefined;
  if (!Array.isArray(vec) || vec.length === 0) return null;

  const first = asRecord(vec[0]);
  const nestedFields = asRecord(first.fields);
  return parseObjectIdField(nestedFields.id) ? nestedFields : null;
}

function parseGearSlots(fields: Record<string, unknown>): MonsterGearSlots | undefined {
  const gearSource = asRecord(fields.gear_slots ?? fields.gear ?? {});
  const slots = ["hat", "shirt", "pants", "shoes", "armor", "suit"] as const;
  const parsed: MonsterGearSlots = {};

  for (const slot of slots) {
    const direct = fields[slot];
    const nested = gearSource[slot];
    const value = typeof direct === "string" ? direct : typeof nested === "string" ? nested : null;
    if (!value || value === "None") continue;
    parsed[slot] = value;
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseEmbeddedArenaMonster(value: unknown): ArenaMonsterSnapshot | null {
  const fields = extractEmbeddedMonsterFields(value);
  if (!fields) return null;

  const objectId = parseObjectIdField(fields.id) ?? "";
  if (!objectId) return null;

  return {
    objectId,
    name: String(fields.name ?? "Unknown"),
    seed: String(fields.seed ?? "0"),
    stage: Number(fields.stage ?? 0),
    attack: Number(fields.attack ?? 0),
    defense: Number(fields.defense ?? 0),
    speed: Number(fields.speed ?? 0),
    wins: Number(fields.wins ?? 0),
    losses: Number(fields.losses ?? 0),
    xp: Number(fields.xp ?? 0),
    scars: Number(fields.scars ?? 0),
    broken_horns: Number(fields.broken_horns ?? 0),
    torn_wings: Number(fields.torn_wings ?? 0),
    created_at: String(fields.created_at ?? "0"),
    current_health: Number(fields.current_health ?? 0),
    max_health: Number(fields.max_health ?? 0),
    is_dead: Boolean(fields.is_dead),
    death_count: Number(fields.death_count ?? 0),
    gearSlots: parseGearSlots(fields),
  };
}

function parseBalanceValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  const rec = asRecord(value);
  if (rec.value !== undefined && rec.value !== null) {
    return String(rec.value);
  }
  return "0";
}

type GameConfigStats = {
  battle_fee_bps: number;
  xp_per_win: number;
  xp_per_loss: number;
  champion_xp_min: number;
  emperor_xp_min: number;
};

function rankBonus(xp: number, config: GameConfigStats): number {
  if (xp >= config.emperor_xp_min) return 60;
  if (xp >= config.champion_xp_min) return 25;
  return 0;
}

function formBonus(stage: number): number {
  if (stage >= 2) return 40;
  if (stage >= 1) return 20;
  return 0;
}

function powerFromBattleSnapshot(
  stats: { attack: number; defense: number; speed: number },
  monster: Monster,
  preBattleXp: number,
  config: GameConfigStats
): number {
  return Math.floor(
    stats.attack * 3 +
      stats.defense * 2 +
      stats.speed +
      formBonus(monster.stage) +
      rankBonus(preBattleXp, config) +
      preBattleXp / 20
  );
}

async function fetchGameConfigStats(client: SuiClient): Promise<GameConfigStats> {
  const obj = await client.getObject({ id: TREASURY_ID, options: { showContent: true } });
  const fields = asRecord((obj.data?.content as any)?.fields);
  return {
    battle_fee_bps: Number(fields.battle_fee_bps ?? 0),
    xp_per_win: Number(fields.xp_per_win ?? 0),
    xp_per_loss: Number(fields.xp_per_loss ?? 0),
    champion_xp_min: Number(fields.champion_xp_min ?? 100),
    emperor_xp_min: Number(fields.emperor_xp_min ?? 300),
  };
}

async function fetchFinishedMatchSnapshots(
  client: SuiClient,
  previousTransaction: string,
  playerA: string,
  playerB: string
): Promise<{
  mon_a: string | null;
  mon_b: string | null;
  monster_a_data: ArenaMonsterSnapshot | null;
  monster_b_data: ArenaMonsterSnapshot | null;
  txDigest: string;
  timestampMs: string;
} | null> {
  const tx = await client.getTransactionBlock({
    digest: previousTransaction,
    options: { showEffects: true, showObjectChanges: true },
  });

  const refs = tx.effects?.unwrapped ?? [];
  if (!refs.length) return null;

  const ownerById = new Map<string, string>();
  for (const item of refs) {
    const owner = (item.owner as { AddressOwner?: string })?.AddressOwner;
    const objectId = item.reference?.objectId;
    if (owner && objectId) ownerById.set(objectId, owner);
  }

  const ids = [...ownerById.keys()];
  if (!ids.length) return null;

  const objects = await client.multiGetObjects({
    ids,
    options: { showContent: true, showDisplay: true, showType: true },
  });

  let monsterA: Monster | null = null;
  let monsterB: Monster | null = null;

  for (const object of objects) {
    const data = object.data;
    if (!data) continue;
    const parsed = parseMonster(data, "wallet");
    if (!parsed) continue;

    const owner = ownerById.get(parsed.objectId);
    if (owner === playerA) monsterA = parsed;
    if (owner === playerB) monsterB = parsed;
  }

  return {
    mon_a: monsterA?.objectId ?? null,
    mon_b: monsterB?.objectId ?? null,
    monster_a_data: monsterA,
    monster_b_data: monsterB,
    txDigest: previousTransaction,
    timestampMs: String((tx as { timestampMs?: string | number | null }).timestampMs ?? "0"),
  };
}

function inferWinnerSideFromFinishedMatch(
  match: ArenaMatch,
  config: GameConfigStats
): "left" | "right" {
  const left = match.monster_a_data as Monster | undefined | null;
  const right = match.monster_b_data as Monster | undefined | null;
  if (!left || !right) return "left";

  const leftStats = {
    attack: Number((match as any).battle_attack_a ?? left.attack ?? 0),
    defense: Number((match as any).battle_defense_a ?? left.defense ?? 0),
    speed: Number((match as any).battle_speed_a ?? left.speed ?? 0),
  };
  const rightStats = {
    attack: Number((match as any).battle_attack_b ?? right.attack ?? 0),
    defense: Number((match as any).battle_defense_b ?? right.defense ?? 0),
    speed: Number((match as any).battle_speed_b ?? right.speed ?? 0),
  };

  const leftAsWinnerXp = Math.max(0, left.xp - config.xp_per_win);
  const rightAsLoserXp = Math.max(0, right.xp - config.xp_per_loss);
  const leftPowerIfWinner = powerFromBattleSnapshot(leftStats, left, leftAsWinnerXp, config);
  const rightPowerIfLoser = powerFromBattleSnapshot(rightStats, right, rightAsLoserXp, config);
  const leftConsistent =
    leftPowerIfWinner > rightPowerIfLoser ||
    (leftPowerIfWinner === rightPowerIfLoser && BigInt(left.seed) <= BigInt(right.seed));

  const rightAsWinnerXp = Math.max(0, right.xp - config.xp_per_win);
  const leftAsLoserXp = Math.max(0, left.xp - config.xp_per_loss);
  const rightPowerIfWinner = powerFromBattleSnapshot(rightStats, right, rightAsWinnerXp, config);
  const leftPowerIfLoser = powerFromBattleSnapshot(leftStats, left, leftAsLoserXp, config);
  const rightConsistent =
    rightPowerIfWinner > leftPowerIfLoser ||
    (rightPowerIfWinner === leftPowerIfLoser && BigInt(right.seed) < BigInt(left.seed));

  if (leftConsistent && !rightConsistent) return "left";
  if (rightConsistent && !leftConsistent) return "right";

  if ((left.current_health ?? 0) !== (right.current_health ?? 0)) {
    return (left.current_health ?? 0) > (right.current_health ?? 0) ? "left" : "right";
  }

  const directLeftPower = powerFromBattleSnapshot(leftStats, left, leftAsLoserXp, config);
  const directRightPower = powerFromBattleSnapshot(rightStats, right, rightAsLoserXp, config);
  if (directLeftPower !== directRightPower) return directLeftPower > directRightPower ? "left" : "right";
  return BigInt(left.seed) <= BigInt(right.seed) ? "left" : "right";
}

export function parseMonster(data: SuiObjectData, location: "wallet" | "kiosk", kioskId?: string, priceMist?: string): Monster | null {
  if (!data.content || data.content.dataType !== "moveObject") return null;
  const f = asRecord(data.content.fields);
  return {
    objectId: data.objectId,
    name: String(f.name ?? "Unknown"),
    seed: String(f.seed ?? "0"),
    stage: Number(f.stage ?? 0),
    attack: Number(f.attack ?? 0),
    defense: Number(f.defense ?? 0),
    speed: Number(f.speed ?? 0),
    wins: Number(f.wins ?? 0),
    losses: Number(f.losses ?? 0),
    xp: Number(f.xp ?? 0),
    scars: Number(f.scars ?? 0),
    broken_horns: Number(f.broken_horns ?? 0),
    torn_wings: Number(f.torn_wings ?? 0),
    created_at: String(f.created_at ?? "0"),
    last_breed: String(f.last_breed ?? "0"),
    current_health: Number(f.current_health ?? 0),
    max_health: Number(f.max_health ?? 0),
    is_dead: Boolean(f.is_dead),
    death_count: Number(f.death_count ?? 0),
    parent1: parseOptionId(f.parent1),
    parent2: parseOptionId(f.parent2),
    location,
    kioskId,
    priceMist,
    gearSlots: parseGearSlots(f),
  };
}

export function parseItemDefinition(data: SuiObjectData): ItemDefinition | null {
  const content = data.content;
  if (!content || content.dataType !== "moveObject") return null;
  if (content.type !== ITEM_DEFINITION_TYPE) return null;

  const fields = asRecord(content.fields);
  const name = parseMoveString(fields.name ?? "Mystery Item");
  const itemType = Number(fields.item_type ?? 0);
  const kind = resolveItemKind(itemType);

  return {
    objectId: data.objectId,
    name,
    itemType,
    kind,
    slot: resolveEquipmentSlot(name, kind),
    healAmount: Number(fields.heal_amount ?? 0),
    attackBonus: Number(fields.attack_bonus ?? 0),
    defenseBonus: Number(fields.defense_bonus ?? 0),
    priceMist: String(fields.price_mist ?? "0"),
    durationMs: Number(fields.duration_ms ?? 0),
    supplyLimit: Number(fields.supply_limit ?? 0),
    minted: Number(fields.minted ?? 0),
    enabled: Boolean(fields.enabled),
  };
}

function parsePlayerItem(
  data: SuiObjectData,
  definitionsById: Map<string, ItemDefinition>
): PlayerItem | null {
  const content = data.content;
  if (!content || content.dataType !== "moveObject") return null;
  if (content.type !== ITEM_TYPE) return null;

  const fields = asRecord(content.fields);
  const definitionId = parseObjectIdField(fields.definition_id) ?? "";
  const definition = definitionsById.get(definitionId) ?? null;
  const itemType = definition?.itemType ?? -1;
  const kind = definition?.kind ?? resolveItemKind(itemType);
  const name = definition?.name ?? "Mystery Item";

  return {
    objectId: data.objectId,
    definitionId,
    expirationMs: Number(fields.expiration_ms ?? 0),
    equipped: Boolean(fields.equipped),
    name,
    itemType,
    kind,
    slot: definition?.slot ?? resolveEquipmentSlot(name, kind),
    healAmount: definition?.healAmount ?? 0,
    attackBonus: definition?.attackBonus ?? 0,
    defenseBonus: definition?.defenseBonus ?? 0,
    priceMist: definition?.priceMist ?? "0",
    durationMs: definition?.durationMs ?? 0,
    supplyLimit: definition?.supplyLimit ?? 0,
    minted: definition?.minted ?? 0,
    enabled: definition?.enabled ?? true,
    definition,
  };
}

export async function fetchTreasury(client: SuiClient): Promise<TreasuryConfig> {
  const obj = await client.getObject({ id: TREASURY_ID, options: { showContent: true } });
  const f = asRecord((obj.data?.content as any)?.fields);
  const fees = asRecord(f.fees);
  return {
    mint_enabled: Boolean(f.mint_enabled),
    mint_price_mist: String(f.mint_price_mist ?? "0"),
    fees: String(fees.value ?? "0"),
  };
}

export async function fetchOwnedMonsters(client: SuiClient, owner: string): Promise<Monster[]> {
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: MONSTER_TYPE },
    options: { showContent: true, showDisplay: true, showType: true },
  });

  return res.data
    .map((o) => o.data)
    .filter((o): o is SuiObjectData => Boolean(o))
    .map((o) => parseMonster(o, "wallet"))
    .filter((m): m is Monster => Boolean(m));
}

function kioskNetwork(): Network {
  return Network.MAINNET;
}

export async function fetchOwnedKioskCaps(client: SuiClient, owner: string): Promise<KioskCap[]> {
  const kioskClient = new KioskClient({ client, network: kioskNetwork() });
  const owned = await kioskClient.getOwnedKiosks({ address: owner });
  return owned.kioskOwnerCaps.map((cap) => ({
    objectId: cap.objectId,
    kioskId: cap.kioskId,
    isPersonal: cap.isPersonal,
    digest: cap.digest,
    version: cap.version,
  }));
}

export async function fetchOwnedKioskMonsters(client: SuiClient, owner: string): Promise<Monster[]> {
  const kioskClient = new KioskClient({ client, network: kioskNetwork() });
  const owned = await kioskClient.getOwnedKiosks({ address: owner });

  const all: Monster[] = [];
  for (const cap of owned.kioskOwnerCaps) {
    const kiosk = await kioskClient.getKiosk({
      id: cap.kioskId,
      options: {
        withObjects: true,
        withListingPrices: true,
        objectOptions: { showContent: true, showType: true, showDisplay: true },
      },
    });

    for (const item of kiosk.items) {
      if (item.type !== MONSTER_TYPE || !item.data) continue;
      const monster = parseMonster(item.data, "kiosk", cap.kioskId, item.listing?.price);
      if (monster) all.push(monster);
    }
  }

  return all;
}

export async function fetchAdminCap(client: SuiClient, owner: string): Promise<string | null> {
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: ADMIN_CAP_TYPE },
    options: { showType: true },
  });
  return res.data[0]?.data?.objectId ?? null;
}

export async function queryAllEvents(
  client: SuiClient,
  eventType: string,
  maxPages = 20,
  limit = 50
): Promise<PaginatedEvents["data"]> {
  let cursor: PaginatedEvents["nextCursor"] = null;
  const out: PaginatedEvents["data"] = [];

  for (let i = 0; i < maxPages; i += 1) {
    const page = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit,
    });
    out.push(...page.data);
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return out;
}

export async function queryModuleEvents(
  client: SuiClient,
  pkg: string,
  module: string,
  maxPages = 20,
  limit = 50
): Promise<PaginatedEvents["data"]> {
  let cursor: PaginatedEvents["nextCursor"] = null;
  const out: PaginatedEvents["data"] = [];

  for (let i = 0; i < maxPages; i += 1) {
    const page = await client.queryEvents({
      query: { MoveModule: { package: pkg, module } },
      cursor,
      limit,
    });
    out.push(...page.data);
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return out;
}

export async function fetchLatestMintPreviewId(client: SuiClient): Promise<string | null> {
  const events = await queryAllEvents(client, `${PACKAGE_ID}::${MODULE}::Minted`, 1, 20);
  const ids = events
    .map((e) => String(asRecord(e.parsedJson).martian_id ?? asRecord(e.parsedJson).monster_id ?? ""))
    .filter(Boolean);
  if (ids.length === 0) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchAllOwnedObjectsByType(
  client: SuiClient,
  owner: string,
  structType: string
): Promise<SuiObjectData[]> {
  let cursor: string | null | undefined = null;
  const objects: SuiObjectData[] = [];

  for (let page = 0; page < 12; page += 1) {
    const response = await client.getOwnedObjects({
      owner,
      filter: { StructType: structType },
      cursor,
      limit: 50,
      options: { showContent: true, showDisplay: true, showType: true },
    });

    objects.push(
      ...response.data
        .map((entry) => entry.data)
        .filter((entry): entry is SuiObjectData => Boolean(entry))
    );

    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }

  return objects;
}

async function fetchItemDefinitionsByIds(
  client: SuiClient,
  ids: string[]
): Promise<ItemDefinition[]> {
  if (ids.length === 0) return [];

  const responses = await Promise.all(
    chunk(Array.from(new Set(ids)), 50).map((part) =>
      client.multiGetObjects({
        ids: part,
        options: { showContent: true, showType: true },
      })
    )
  );

  return responses
    .flatMap((part) => part)
    .map((obj) => obj.data)
    .filter((obj): obj is SuiObjectData => Boolean(obj))
    .map((obj) => parseItemDefinition(obj))
    .filter((definition): definition is ItemDefinition => Boolean(definition));
}

async function discoverItemDefinitionIds(client: SuiClient): Promise<string[]> {
  const ids = new Set<string>();

  for (const fn of ["create_item_definition", "buy_item"]) {
    let cursor: string | null | undefined = null;

    for (let page = 0; page < 12; page += 1) {
      const response = await client.queryTransactionBlocks({
        filter: {
          MoveFunction: {
            package: ITEMS_PACKAGE_ID,
            module: ITEMS_MODULE,
            function: fn,
          },
        },
        cursor,
        limit: 50,
        order: "descending",
        options: { showObjectChanges: true, showEvents: true },
      });

      for (const tx of response.data) {
        for (const change of tx.objectChanges ?? []) {
          const candidate = change as {
            type?: string;
            objectType?: string;
            objectId?: string;
          };
          if (
            (candidate.type === "created" || candidate.type === "mutated") &&
            candidate.objectType === ITEM_DEFINITION_TYPE &&
            typeof candidate.objectId === "string"
          ) {
            ids.add(candidate.objectId);
          }
        }

        for (const event of tx.events ?? []) {
          if (event.type !== `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::ItemPurchased`) continue;
          const definitionId = parseObjectIdField(asRecord(event.parsedJson).definition_id);
          if (definitionId) ids.add(definitionId);
        }
      }

      if (!response.hasNextPage || !response.nextCursor) break;
      cursor = response.nextCursor;
    }
  }

  return [...ids];
}

export async function fetchItemDefinitions(
  client: SuiClient,
  options?: { includeDisabled?: boolean }
): Promise<ItemDefinition[]> {
  const ids = await discoverItemDefinitionIds(client);
  const definitions = await fetchItemDefinitionsByIds(client, ids);
  return definitions
    .filter((definition) => options?.includeDisabled ? true : definition.enabled)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export async function fetchOwnedItems(client: SuiClient, owner: string): Promise<PlayerItem[]> {
  const objects = await fetchAllOwnedObjectsByType(client, owner, ITEM_TYPE);
  const definitionIds = objects
    .map((obj) => parseObjectIdField(asRecord((obj.content as { fields?: unknown } | null)?.fields).definition_id))
    .filter((id): id is string => Boolean(id));
  const definitions = await fetchItemDefinitionsByIds(client, definitionIds);
  const definitionsById = new Map(definitions.map((definition) => [definition.objectId, definition]));

  return objects
    .map((obj) => parsePlayerItem(obj, definitionsById))
    .filter((item): item is PlayerItem => Boolean(item))
    .sort((a, b) => Number(b.equipped) - Number(a.equipped) || a.name.localeCompare(b.name));
}

export async function fetchMintedMonsters(client: SuiClient): Promise<Monster[]> {
  const events = await queryAllEvents(client, `${PACKAGE_ID}::${MODULE}::Minted`, 20, 50);
  const ids = Array.from(
    new Set(
      events
        .map((event) => String(asRecord(event.parsedJson).martian_id ?? asRecord(event.parsedJson).monster_id ?? ""))
        .filter(Boolean)
    )
  );

  if (ids.length === 0) return [];

  const chunks = chunk(ids, 50);
  const objects = await Promise.all(
    chunks.map((part) =>
      client.multiGetObjects({
        ids: part,
        options: { showContent: true, showDisplay: true, showType: true },
      })
    )
  );

  return objects
    .flatMap((response) => response)
    .map((obj) => obj.data)
    .filter((obj): obj is SuiObjectData => Boolean(obj))
    .map((obj) => parseMonster(obj, "wallet"))
    .filter((monster): monster is Monster => Boolean(monster))
    .sort((a, b) => Number(b.created_at) - Number(a.created_at));
}

export async function fetchArenaMatch(client: SuiClient, matchId: string): Promise<ArenaMatch | null> {
  const obj = await client.getObject({ id: matchId, options: { showContent: true, showPreviousTransaction: true } });
  const c = obj.data?.content;
  if (!c || c.dataType !== "moveObject") return null;
  if (c.type !== ARENA_MATCH_TYPE) return null;

  const f = asRecord(c.fields);
  const match: ArenaMatch = {
    objectId: obj.data!.objectId,
    player_a: String(f.player_a ?? ""),
    player_b: String(f.player_b ?? ""),
    status: Number(f.status ?? 0) as 0 | 1 | 2 | 3,
    created_at: String(f.created_at ?? "0"),
    last_update: String(f.last_update ?? "0"),
    mode: Number(f.mode ?? 0),
    previousTransaction: String(obj.data?.previousTransaction ?? ""),
    mon_a: parseOptionMonsterId(f.martian_a ?? f.mon_a),
    mon_b: parseOptionMonsterId(f.martian_b ?? f.mon_b),
    stake_a: parseBalanceValue(f.stake_a),
    stake_b: parseBalanceValue(f.stake_b),
    battle_attack_a: Number(f.battle_attack_a ?? 0),
    battle_defense_a: Number(f.battle_defense_a ?? 0),
    battle_speed_a: Number(f.battle_speed_a ?? 0),
    battle_attack_b: Number(f.battle_attack_b ?? 0),
    battle_defense_b: Number(f.battle_defense_b ?? 0),
    battle_speed_b: Number(f.battle_speed_b ?? 0),
    monster_a_data: parseEmbeddedArenaMonster(f.martian_a ?? f.mon_a),
    monster_b_data: parseEmbeddedArenaMonster(f.martian_b ?? f.mon_b),
  };

  if (
    match.status === 2 &&
    !match.monster_a_data &&
    !match.monster_b_data &&
    match.previousTransaction
  ) {
    try {
      const restored = await fetchFinishedMatchSnapshots(
        client,
        match.previousTransaction,
        match.player_a,
        match.player_b
      );
      if (restored) {
        match.mon_a = restored.mon_a;
        match.mon_b = restored.mon_b;
        match.monster_a_data = restored.monster_a_data;
        match.monster_b_data = restored.monster_b_data;
      }
    } catch {
      // Best-effort restoration for completed matches.
    }
  }

  return match;
}

export function extractCreatedArenaMatchId(block: {
  objectChanges?: Array<{ type?: string; objectType?: string; objectId?: string }> | null;
}): string | null {
  const created = block.objectChanges?.find(
    (change) => change.type === "created" && change.objectType === ARENA_MATCH_TYPE && typeof change.objectId === "string"
  );
  return created?.objectId ?? null;
}

export async function fetchAllArenaMatches(client: SuiClient): Promise<ArenaMatch[]> {
  let cursor: string | null | undefined = null;
  const ids = new Set<string>();

  for (let page = 0; page < 12; page += 1) {
    const txs = await client.queryTransactionBlocks({
      filter: {
        MoveFunction: {
          package: PACKAGE_ID,
          module: MODULE,
          function: "create_match",
        },
      },
      cursor,
      limit: 50,
      order: "descending",
      options: { showObjectChanges: true },
    });

    for (const tx of txs.data) {
      const created = tx.objectChanges?.find((change) => {
        const candidate = change as { type?: string; objectType?: string; objectId?: string };
        return (
          candidate.type === "created" &&
          candidate.objectType === ARENA_MATCH_TYPE &&
          typeof candidate.objectId === "string"
        );
      }) as { objectId?: string } | undefined;
      if (typeof created?.objectId === "string") ids.add(created.objectId);
    }

    if (!txs.hasNextPage || !txs.nextCursor) break;
    cursor = txs.nextCursor;
  }

  if (ids.size === 0) return [];

  const matches = await Promise.all(
    [...ids].map(async (id) => {
      try {
        return await fetchArenaMatch(client, id);
      } catch {
        return null;
      }
    })
  );

  return matches
    .filter((match): match is ArenaMatch => Boolean(match))
    .sort((a, b) => Number(b.created_at) - Number(a.created_at));
}

export async function fetchRecentMatches(client: SuiClient): Promise<ArenaMatch[]> {
  const matches = await fetchAllArenaMatches(client);
  return matches.slice(0, 30);
}

export async function fetchActivePlayers(client: SuiClient): Promise<ActivePlayer[]> {
  if (ACTIVE_PLAYER_EVENT_TYPES.length === 0) return [];
  const activity: Record<string, ActivePlayer> = {};
  for (const eventType of ACTIVE_PLAYER_EVENT_TYPES as readonly string[]) {
    const events = await queryAllEvents(client, eventType, 2, 50);
    for (const event of events) {
      const parsed = asRecord(event.parsedJson);
      const address = String(parsed.player ?? parsed.player_a ?? parsed.player_b ?? "");
      if (!address) continue;
      const ts = Number(event.timestampMs ?? 0);
      const existing = activity[address];
      if (!existing || existing.lastActivityMs < ts) {
        activity[address] = {
          address,
          lastActivityMs: ts,
          source: eventType.includes("MatchCreated") ? "match_created" : "deposit",
        };
      }
    }
  }
  return Object.values(activity).sort((a, b) => b.lastActivityMs - a.lastActivityMs);
}

export async function fetchBattleOutcomes(client: SuiClient): Promise<BattleOutcomeEvent[]> {
  const events = await queryAllEvents(client, `${PACKAGE_ID}::${MODULE}::BattleOutcome`, 10, 50);
  return events.map((e) => ({
    ...(asRecord(e.parsedJson) as any),
    timestampMs: String(e.timestampMs ?? "0"),
  }));
}

export async function fetchLeaderboard(client: SuiClient) {
  const outcomes = await fetchBattleOutcomes(client);
  const byMonster = new Map<string, { wins: number; xp: number }>();

  for (const outcome of outcomes) {
    const current = byMonster.get(outcome.winner_id) ?? { wins: 0, xp: 0 };
    current.wins = Math.max(current.wins, Number(outcome.winner_wins ?? 0));
    current.xp = Math.max(current.xp, Number(outcome.winner_xp ?? 0));
    byMonster.set(outcome.winner_id, current);
  }

  const topIds = [...byMonster.entries()]
    .sort((a, b) => {
      if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
      return b[1].xp - a[1].xp;
    })
    .slice(0, 20)
    .map(([id]) => id);

  if (topIds.length === 0) return [] as Monster[];
  const objects = await client.multiGetObjects({
    ids: topIds,
    options: { showContent: true, showDisplay: true, showType: true },
  });

  return objects
    .map((obj) => obj.data)
    .filter((obj): obj is SuiObjectData => Boolean(obj))
    .map((obj) => parseMonster(obj, "wallet"))
    .filter((m): m is Monster => Boolean(m));
}

export async function fetchMatchResolution(
  client: SuiClient,
  matchId: string
): Promise<MatchResolution | null> {
  const finishedEvents = await queryAllEvents(client, `${PACKAGE_ID}::${MODULE}::MatchFinished`, 8, 50);
  const found = finishedEvents.find(
    (evt) => String(asRecord(evt.parsedJson).match_id ?? "") === matchId
  );
  if (!found) return null;

  const parsed = asRecord(found.parsedJson);
  const resolution: MatchResolution = {
    matchId: String(parsed.match_id ?? ""),
    winner: String(parsed.winner ?? ""),
    winnerMonsterId: String(parsed.winner_monster_id ?? ""),
    loserMonsterId: String(parsed.loser_monster_id ?? ""),
    totalPayoutMist: String(parsed.total_payout_mist ?? "0"),
    feeMist: String(parsed.fee_mist ?? "0"),
    txDigest: found.id.txDigest,
    timestampMs: String(found.timestampMs ?? "0"),
  };

  try {
    const block = await client.getTransactionBlock({
      digest: found.id.txDigest,
      options: { showEvents: true },
    });
    const battleEvent = block.events?.find(
      (evt) => evt.type === `${PACKAGE_ID}::${MODULE}::BattleOutcome`
    );
    if (battleEvent?.parsedJson) {
      resolution.battleOutcome = {
        ...(asRecord(battleEvent.parsedJson) as BattleOutcomeEvent),
        timestampMs: String(found.timestampMs ?? "0"),
      };
    }
  } catch {
    // Best-effort enrichment; core match result data already present from MatchFinished.
  }

  return resolution;
}

export async function fetchSyntheticMatchResolution(
  client: SuiClient,
  match: ArenaMatch
): Promise<MatchResolution | null> {
  if (match.status !== 2 || !match.previousTransaction || !match.monster_a_data || !match.monster_b_data) {
    return null;
  }

  const config = await fetchGameConfigStats(client);
  const winnerSide = inferWinnerSideFromFinishedMatch(match, config);
  const totalPayout = BigInt(match.stake_a || "0") + BigInt(match.stake_b || "0");
  const feeMist = totalPayout > 0n ? (totalPayout * BigInt(config.battle_fee_bps)) / 10_000n : 0n;

  return {
    matchId: match.objectId,
    winner: winnerSide === "left" ? match.player_a : match.player_b,
    winnerMonsterId: winnerSide === "left" ? match.monster_a_data.objectId : match.monster_b_data.objectId,
    loserMonsterId: winnerSide === "left" ? match.monster_b_data.objectId : match.monster_a_data.objectId,
    totalPayoutMist: totalPayout.toString(),
    feeMist: feeMist.toString(),
    txDigest: match.previousTransaction,
    timestampMs: match.last_update ?? match.created_at,
  };
}

function parseListing(parsed: Record<string, unknown>, txDigest: string): Listing | null {
  const itemId = String(parsed.id ?? parsed.item_id ?? parsed.itemId ?? "");
  const kioskId = String(parsed.kiosk ?? parsed.kiosk_id ?? parsed.kioskId ?? "");
  const priceMist = String(parsed.price ?? parsed.price_mist ?? parsed.amount ?? "");
  if (!itemId || !kioskId) return null;
  return { itemId, kioskId, priceMist: priceMist || "0", txDigest };
}

export async function fetchActiveListings(client: SuiClient): Promise<Listing[]> {
  const listedType = `0x2::kiosk::ItemListed<${MONSTER_TYPE}>`;
  const delistedType = `0x2::kiosk::ItemDelisted<${MONSTER_TYPE}>`;
  const purchasedType = `0x2::kiosk::ItemPurchased<${MONSTER_TYPE}>`;

  const events = await queryModuleEvents(client, "0x2", "kiosk", 20, 50);
  const targetEvents = events.filter(
    (evt) => evt.type === listedType || evt.type === delistedType || evt.type === purchasedType
  );

  const state = new Map<string, Listing | null>();
  for (const evt of targetEvents) {
    const parsed = asRecord(evt.parsedJson);
    const itemId = String(parsed.id ?? parsed.item_id ?? parsed.itemId ?? "");
    const kioskId = String(parsed.kiosk ?? parsed.kiosk_id ?? parsed.kioskId ?? "");
    if (!itemId || !kioskId) continue;
    const key = `${kioskId}:${itemId}`;
    if (state.has(key)) continue;

    if (evt.type === listedType) {
      state.set(key, parseListing(parsed, evt.id.txDigest));
    } else {
      state.set(key, null);
    }
  }

  return [...state.values()].filter((listing): listing is Listing => Boolean(listing));
}

export async function fetchListedMonsters(client: SuiClient): Promise<Monster[]> {
  const listings = await fetchActiveListings(client);
  if (listings.length === 0) return [];

  const objectIds = listings.map((l) => l.itemId);
  const objects = await client.multiGetObjects({
    ids: objectIds,
    options: { showContent: true, showDisplay: true, showType: true },
  });

  const byId = new Map(listings.map((l) => [l.itemId, l]));
  return objects
    .map((obj) => obj.data)
    .filter((obj): obj is SuiObjectData => Boolean(obj))
    .map((obj) => {
      const listing = byId.get(obj.objectId);
      return parseMonster(obj, "kiosk", listing?.kioskId, listing?.priceMist);
    })
    .filter((m): m is Monster => Boolean(m));
}
