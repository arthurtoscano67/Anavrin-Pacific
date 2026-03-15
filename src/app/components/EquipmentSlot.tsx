import type { PlayerItem } from "../lib/types";
import { equipmentSlotLabel, itemAccent, itemBonusSummary, itemIcon } from "../lib/items";

export function EquipmentSlot({
  slot,
  item,
}: {
  slot: "helmet" | "armor" | "weapon" | "potion";
  item?: PlayerItem | null;
}) {
  return (
    <div className="glass-card overflow-hidden rounded-[24px] border border-white/10">
      <div className="border-b border-white/10 bg-black/20 px-4 py-3">
        <div className="text-sm font-bold text-white">{equipmentSlotLabel(slot)}</div>
      </div>

      {item ? (
        <div className="space-y-3 p-4">
          <div className={`rounded-2xl border bg-gradient-to-br p-4 ${itemAccent(item.kind)}`}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-black/20 text-2xl">
              {itemIcon(item.kind, item.slot)}
            </div>
          </div>
          <div>
            <div className="font-semibold text-white">{item.name}</div>
            <div className="mt-1 text-xs text-gray-300">{itemBonusSummary(item)}</div>
          </div>
          <button className="btn-ghost w-full text-xs" disabled title="Current items package has no unequip entrypoint.">
            Unequip
          </button>
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-400">Nothing here yet.</div>
      )}
    </div>
  );
}
