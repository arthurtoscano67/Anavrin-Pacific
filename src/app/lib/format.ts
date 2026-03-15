import { RENDERER, STAGE_META, SUI_DECIMALS } from "./constants";

export function toSui(mist: string | number | bigint | null | undefined): string {
  if (mist === null || mist === undefined) return "0.0000";
  return (Number(mist) / SUI_DECIMALS).toFixed(4);
}

export function toMist(value: string): bigint {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return BigInt(0);
  return BigInt(Math.floor(n * SUI_DECIMALS));
}

export function short(addr?: string | null): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function monsterSvg(objectId: string): string {
  return `${RENDERER}/martian/${objectId}.svg`;
}

export function monsterPng(objectId: string): string {
  return `${RENDERER}/martian/${objectId}.svg`;
}

export function stageMeta(stage: number) {
  return STAGE_META[stage] ?? STAGE_META[0];
}

export function powerPreview(input: {
  attack: number;
  defense: number;
  speed: number;
  stage: number;
  xp: number;
}): number {
  return Math.floor(input.attack * 3 + input.defense * 2 + input.speed + input.stage * 25 + input.xp / 10);
}

export function evolvedStage(createdAtMs: string): number {
  const age = Date.now() - Number(createdAtMs);
  if (age < 86_400_000) return 0;
  if (age < 172_800_000) return 1;
  if (age < 259_200_000) return 2;
  return 3;
}

export function statusLabel(status: number): string {
  if (status === 0) return "WAITING";
  if (status === 1) return "LOCKED";
  if (status === 2) return "FINISHED";
  return "CANCELLED";
}
