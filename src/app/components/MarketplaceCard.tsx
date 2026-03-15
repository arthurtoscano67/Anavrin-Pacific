import type { ItemDefinition } from "../lib/types";
import { itemAccent, itemBonusSummary, itemDurationLabel, itemIcon, itemSupplyRemaining, itemTypeLabel } from "../lib/items";
import { toSui } from "../lib/format";
import { Spinner } from "./Spinner";

export function MarketplaceCard({
  definition,
  isPending,
  disabled,
  onBuy,
}: {
  definition: ItemDefinition;
  isPending: boolean;
  disabled: boolean;
  onBuy: (definition: ItemDefinition) => void;
}) {
  const remaining = itemSupplyRemaining(definition);

  return (
    <article className="glass-card card-hover group flex h-full min-h-[360px] flex-col overflow-hidden rounded-[28px] border border-white/10">
      <div className={`bg-gradient-to-br p-5 ${itemAccent(definition.kind)}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/20 bg-black/20 text-4xl transition duration-200 group-hover:scale-105">
            {itemIcon(definition.kind, definition.slot)}
          </div>
          <span className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white">
            {itemTypeLabel(definition.kind)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          <h3 className="min-h-[3rem] text-lg font-extrabold leading-tight text-white">{definition.name}</h3>
          <p className="text-sm text-gray-300">{itemBonusSummary(definition)}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-cyan/10 p-3 text-sm text-cyan-100">
            {toSui(definition.priceMist)} SUI
          </div>
          <div className="rounded-2xl border border-white/10 bg-purple/15 p-3 text-sm text-purple-100">
            {remaining === null ? "Unlimited" : `${remaining} left`}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
          {itemDurationLabel(definition.durationMs)}
        </div>

        <button className="btn-primary mt-auto min-h-[50px] w-full text-base" disabled={disabled || isPending} onClick={() => onBuy(definition)}>
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size={14} /> Buying...
            </span>
          ) : (
            "Buy Item"
          )}
        </button>
      </div>
    </article>
  );
}
