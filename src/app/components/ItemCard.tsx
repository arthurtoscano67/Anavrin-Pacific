import type { PlayerItem } from "../lib/types";
import { itemAccent, itemBonusSummary, itemExpirationLabel, itemIcon, itemTypeLabel } from "../lib/items";
import { Spinner } from "./Spinner";

export function ItemCard({
  item,
  nowMs,
  isSelling,
  canSell,
  onSell,
}: {
  item: PlayerItem;
  nowMs: number;
  isSelling: boolean;
  canSell: boolean;
  onSell: (item: PlayerItem) => void;
}) {
  return (
    <article className="glass-card card-hover group flex h-full min-h-[360px] flex-col overflow-hidden rounded-[28px] border border-white/10">
      <div className={`relative bg-gradient-to-br ${itemAccent(item.kind)} p-5`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/20 bg-black/20 text-4xl shadow-lg transition duration-200 group-hover:scale-105">
            {itemIcon(item.kind, item.slot)}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white">
              {itemTypeLabel(item.kind)}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                item.equipped
                  ? "border-green-300/40 bg-green-500/15 text-green-100"
                  : "border-white/20 bg-black/20 text-white"
              }`}
            >
              {item.equipped ? "Equipped" : "Backpack"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          <h3 className="min-h-[3rem] text-lg font-extrabold leading-tight text-white">{item.name}</h3>
          <p className="text-sm text-gray-300">{itemBonusSummary(item)}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-gray-200">
            <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Timer</div>
            <div className="mt-2 text-sm text-white">{itemExpirationLabel(item.expirationMs, nowMs)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-gray-200">
            <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Chain ID</div>
            <div className="mt-2 text-sm text-white">#{item.objectId.slice(0, 6)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl border border-white/10 bg-red-500/10 p-3 text-red-100">
            Heal +{item.healAmount}
          </div>
          <div className="rounded-2xl border border-white/10 bg-amber-500/10 p-3 text-amber-100">
            ATK +{item.attackBonus}
          </div>
          <div className="rounded-2xl border border-white/10 bg-sky-500/10 p-3 text-sky-100">
            DEF +{item.defenseBonus}
          </div>
          <div className="rounded-2xl border border-white/10 bg-purple/15 p-3 text-purple-100">
            {item.equipped ? "Ready now" : "Backpack"}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <button className="btn-ghost min-h-[44px] text-xs" disabled title="Current items package has no equip entrypoint.">
            {item.equipped ? "Unequip" : "Equip"}
          </button>
          {item.kind === "Potion" ? (
            <button className="btn-ghost min-h-[44px] text-xs" disabled title="Current items package has no use entrypoint.">
              Use
            </button>
          ) : (
            <button className="btn-ghost min-h-[44px] text-xs" disabled title="Only potions can be used.">
              Use
            </button>
          )}
          <button
            className="btn-secondary min-h-[44px] text-xs"
            disabled={!canSell || isSelling}
            onClick={() => onSell(item)}
            title={canSell ? "List this item for sale at its base shop price." : "Need a kiosk cap and item must not be equipped."}
          >
            {isSelling ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size={14} /> Selling...
              </span>
            ) : (
              "Sell"
            )}
          </button>
          <button className="btn-ghost min-h-[44px] text-xs" disabled title="Current items package has no burn entrypoint.">
            Burn / Discard
          </button>
        </div>
      </div>
    </article>
  );
}
