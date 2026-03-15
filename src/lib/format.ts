import { SUI_DECIMALS, STAGE_META } from "./config";

export function formatAddress(address?: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatSui(mist?: string | number | bigint | null): string {
  if (mist === null || mist === undefined) return "0.0000";
  return (Number(mist) / SUI_DECIMALS).toFixed(4);
}

export function toMist(value: string): bigint {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return BigInt(0);
  return BigInt(Math.floor(parsed * SUI_DECIMALS));
}

export function stageLabel(stage: number): string {
  const found = STAGE_META.find((s) => s.id === stage);
  return found ? `${found.emoji} ${found.name}` : "Unknown";
}

export function timeAgo(value: number): string {
  const diffMs = Date.now() - value;
  if (diffMs < 60_000) return `${Math.max(1, Math.floor(diffMs / 1000))}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
