import type { ArenaMonsterSnapshot, Monster, MonsterGearSlots } from '../lib/types';

export type MonsterSeedSource = Partial<Monster & ArenaMonsterSnapshot> & {
  objectId: string;
  name?: string;
  seed?: string;
  stage?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  wins?: number;
  losses?: number;
  xp?: number;
  scars?: number;
  broken_horns?: number;
  torn_wings?: number;
  gearSlots?: MonsterGearSlots;
};

export type ResolvedMonster3D = {
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
  gearSlots?: MonsterGearSlots;
};

export type MonsterTraits3D = {
  palette: {
    body: string;
    bodyDark: string;
    bodyLight: string;
    belly: string;
    accent: string;
    aura: string;
    outline: string;
    eyeWhite: string;
    iris: string;
    floor: string;
  };
  headScale: [number, number, number];
  bodyScale: [number, number, number];
  armLength: number;
  legLength: number;
  earType: 0 | 1 | 2;
  hornType: 0 | 1 | 2;
  tailType: 0 | 1 | 2;
  wingType: 0 | 1 | 2;
  eyeShape: 0 | 1 | 2;
  eyeSpacing: number;
  bodyHeight: number;
  hasTail: boolean;
  hasHorns: boolean;
  hasWings: boolean;
  hasAura: boolean;
  gear: {
    hat: boolean;
    armor: boolean;
    suit: boolean;
    shoes: boolean;
  };
};

function hashString(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash *= 0x100000001b3n;
  }
  return hash & ((1n << 63n) - 1n);
}

function parseSeed(input?: string | null, objectId?: string): bigint {
  if (input) {
    try {
      return input.startsWith('0x') ? BigInt(input) : BigInt(input);
    } catch {
      return hashString(input);
    }
  }
  return hashString(objectId ?? 'anavrin-legend');
}

function trait(seed: bigint, shift: number, mod: number): number {
  return Number((seed >> BigInt(shift)) % BigInt(mod));
}

function clampStage(stage?: number | null): 0 | 1 | 2 | 3 {
  const safe = Number(stage ?? 0);
  return Math.max(0, Math.min(3, safe)) as 0 | 1 | 2 | 3;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

export function resolveMonster3D(input?: MonsterSeedSource | null): ResolvedMonster3D | null {
  if (!input?.objectId) return null;
  return {
    objectId: input.objectId,
    name: input.name ?? 'Anavrin Legend',
    seed: String(input.seed ?? hashString(input.objectId)),
    stage: clampStage(input.stage),
    attack: Number(input.attack ?? 0),
    defense: Number(input.defense ?? 0),
    speed: Number(input.speed ?? 0),
    wins: Number(input.wins ?? 0),
    losses: Number(input.losses ?? 0),
    xp: Number(input.xp ?? 0),
    scars: Number(input.scars ?? 0),
    broken_horns: Number(input.broken_horns ?? 0),
    torn_wings: Number(input.torn_wings ?? 0),
    gearSlots: input.gearSlots,
  };
}

export function monsterTraits3D(monster: ResolvedMonster3D): MonsterTraits3D {
  const seed = parseSeed(monster.seed, monster.objectId);
  const stage = clampStage(monster.stage);
  const baseHue = trait(seed, 0, 360);
  const accentHue = (baseHue + 40 + trait(seed, 8, 110)) % 360;
  const auraHue = (accentHue + 120) % 360;
  const bodySat = 55 + trait(seed, 14, 22);
  const bodyLight = 52 + trait(seed, 20, 14);
  const stageHeight = [1.1, 1.45, 1.8, 2.1][stage];
  const gear = monster.gearSlots ?? {};

  return {
    palette: {
      body: hsl(baseHue, bodySat, bodyLight),
      bodyDark: hsl((baseHue + 10) % 360, Math.min(92, bodySat + 12), Math.max(18, bodyLight - 18)),
      bodyLight: hsl(baseHue, Math.max(42, bodySat - 8), Math.min(88, bodyLight + 14)),
      belly: hsl((baseHue + 25) % 360, 44, Math.min(92, bodyLight + 24)),
      accent: hsl(accentHue, 76, 66),
      aura: hsl(auraHue, 86, 68),
      outline: '#1a1133',
      eyeWhite: '#fff7ff',
      iris: hsl((accentHue + 150) % 360, 72, 44),
      floor: hsl((baseHue + 260) % 360, 26, 24),
    },
    headScale: [stage === 0 ? 1 : 0.95 + stage * 0.14, stage === 0 ? 1.15 : 1.04 + stage * 0.1, stage === 0 ? 1 : 0.92 + stage * 0.12],
    bodyScale: [0.78 + stage * 0.1, 0.8 + stage * 0.16, 0.74 + stage * 0.08],
    armLength: 0.3 + stage * 0.08,
    legLength: 0.34 + stage * 0.12,
    earType: trait(seed, 28, 3) as 0 | 1 | 2,
    hornType: trait(seed, 32, 3) as 0 | 1 | 2,
    tailType: trait(seed, 36, 3) as 0 | 1 | 2,
    wingType: trait(seed, 40, 3) as 0 | 1 | 2,
    eyeShape: trait(seed, 44, 3) as 0 | 1 | 2,
    eyeSpacing: 0.2 + trait(seed, 48, 10) / 100,
    bodyHeight: stageHeight,
    hasTail: stage >= 2,
    hasHorns: stage >= 2,
    hasWings: stage >= 3,
    hasAura: stage >= 3,
    gear: {
      hat: Boolean(gear.hat),
      armor: Boolean(gear.armor || gear.shirt),
      suit: Boolean(gear.suit),
      shoes: Boolean(gear.shoes || gear.pants),
    },
  };
}
