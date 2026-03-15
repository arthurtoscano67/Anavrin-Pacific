import type { EquipmentSlot } from "./types";

export type EquipmentLoadout = Partial<Record<EquipmentSlot, string>>;

const STORAGE_KEY = "anavrin-monster-loadouts-v1";

export function readLoadouts(): Record<string, EquipmentLoadout> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EquipmentLoadout>;
  } catch {
    return {};
  }
}

export function writeLoadouts(next: Record<string, EquipmentLoadout>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
