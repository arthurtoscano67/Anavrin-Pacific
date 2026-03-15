import type { EquipmentSlotId, ItemDefinition, ItemKind, PlayerItem } from "./types";

export function resolveItemKind(itemType: number): ItemKind {
  if (itemType === 0) return "Potion";
  if (itemType === 1) return "Armor";
  if (itemType === 2) return "Weapon";
  return "Unknown";
}

export function resolveEquipmentSlot(name: string, kind: ItemKind): EquipmentSlotId {
  const lower = name.toLowerCase();
  if (kind === "Potion") return "potion";
  if (kind === "Weapon") return "weapon";
  if (/(helmet|helm|visor|crown|cap)/.test(lower)) return "helmet";
  return "armor";
}

export function equipmentSlotLabel(slot: EquipmentSlotId): string {
  if (slot === "helmet") return "Helmet";
  if (slot === "armor") return "Armor";
  if (slot === "weapon") return "Weapon";
  return "Potion Slot";
}

export function itemIcon(kind: ItemKind, slot?: EquipmentSlotId): string {
  if (slot === "helmet") return "🪖";
  if (kind === "Potion") return "🧪";
  if (kind === "Weapon") return "⚔️";
  if (kind === "Armor") return "🛡️";
  return "✨";
}

export function itemTypeLabel(kind: ItemKind): string {
  return kind === "Unknown" ? "Mystery" : kind;
}

export function itemAccent(kind: ItemKind): string {
  if (kind === "Potion") return "from-pink-500/30 via-fuchsia-400/20 to-rose-400/20 border-pink-400/40";
  if (kind === "Weapon") return "from-amber-400/30 via-orange-400/20 to-red-400/20 border-amber-300/40";
  if (kind === "Armor") return "from-cyan-400/30 via-sky-400/20 to-blue-500/20 border-cyan-300/40";
  return "from-purple/30 via-cyan/20 to-purple/10 border-purple/40";
}

export function itemBonusSummary(item: Pick<PlayerItem, "healAmount" | "attackBonus" | "defenseBonus">): string {
  const parts: string[] = [];
  if (item.healAmount > 0) parts.push(`+${item.healAmount} Heal`);
  if (item.attackBonus > 0) parts.push(`+${item.attackBonus} ATK`);
  if (item.defenseBonus > 0) parts.push(`+${item.defenseBonus} DEF`);
  return parts.join(" • ") || "No bonus";
}

export function itemSupplyRemaining(definition: Pick<ItemDefinition, "supplyLimit" | "minted">): number | null {
  if (definition.supplyLimit <= 0) return null;
  return Math.max(0, definition.supplyLimit - definition.minted);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function itemExpirationLabel(expirationMs: number, nowMs: number): string {
  if (expirationMs <= 0) return "Permanent";
  const remaining = expirationMs - nowMs;
  if (remaining <= 0) return "Expired";
  return `${formatDuration(remaining)} left`;
}

export function itemDurationLabel(durationMs: number): string {
  if (durationMs <= 0) return "Permanent";
  return `Expires after ${formatDuration(durationMs)}`;
}
