import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

import { EquipmentSlot } from "../components/EquipmentSlot";
import { ItemCard } from "../components/ItemCard";
import { LoadingGrid } from "../components/LoadingGrid";
import { MarketplaceCard } from "../components/MarketplaceCard";
import { PageShell } from "../components/PageShell";
import { CLOCK_ID, ITEMS_MODULE, ITEMS_PACKAGE_ID, ITEMS_TREASURY_ID } from "../lib/constants";
import { short, toSui } from "../lib/format";
import type { EquipmentSlotId, ItemDefinition, PlayerItem } from "../lib/types";
import { fetchItemDefinitions, fetchOwnedItems } from "../lib/sui";
import { useAnavrinData } from "../hooks/useAnavrinData";
import { useTxExecutor } from "../hooks/useTxExecutor";

type ItemsTab = "inventory" | "marketplace" | "equipped";

const TABS: Array<{ id: ItemsTab; label: string }> = [
  { id: "inventory", label: "Inventory" },
  { id: "marketplace", label: "Marketplace" },
  { id: "equipped", label: "Equipped" },
];

function panelVisibility(activeTab: ItemsTab, panel: ItemsTab) {
  return activeTab === panel ? "block" : "hidden lg:block";
}

export function ItemsPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { execute } = useTxExecutor();
  const { walletMonsters, kioskCaps } = useAnavrinData();

  const [activeTab, setActiveTab] = useState<ItemsTab>("inventory");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const balance = useQuery({
    queryKey: ["suiBalance", account?.address],
    queryFn: () => client.getBalance({ owner: account!.address }),
    enabled: Boolean(account?.address),
    refetchInterval: 15_000,
  });

  const inventory = useQuery({
    queryKey: ["ownedItems", account?.address],
    queryFn: () => fetchOwnedItems(client, account!.address),
    enabled: Boolean(account?.address),
    refetchInterval: 15_000,
  });

  const definitions = useQuery({
    queryKey: ["itemDefinitions", ITEMS_PACKAGE_ID],
    queryFn: () => fetchItemDefinitions(client),
    refetchInterval: 30_000,
  });

  const equippedBySlot = useMemo(() => {
    const slots: Partial<Record<EquipmentSlotId, PlayerItem>> = {};

    for (const item of inventory.data ?? []) {
      if (!item.equipped) continue;
      if (!slots[item.slot]) {
        slots[item.slot] = item;
        continue;
      }

      if (item.slot === "helmet" && !slots.armor) {
        slots.armor = item;
      }
    }

    return slots;
  }, [inventory.data]);

  const totals = useMemo(() => {
    return Object.values(equippedBySlot).reduce(
      (acc, item) => {
        if (!item) return acc;
        acc.attack += item.attackBonus;
        acc.defense += item.defenseBonus;
        acc.heal += item.healAmount;
        return acc;
      },
      { attack: 0, defense: 0, heal: 0 }
    );
  }, [equippedBySlot]);

  const teamHealth = useMemo(() => {
    const monsters = walletMonsters.data ?? [];
    const current = monsters.reduce((sum, monster) => sum + Number(monster.current_health ?? 0), 0);
    const max = monsters.reduce((sum, monster) => sum + Number(monster.max_health ?? 0), 0);
    const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    return { current, max, percent };
  }, [walletMonsters.data]);

  const onBuy = async (definition: ItemDefinition) => {
    if (!account) {
      toast.error("Connect wallet first");
      return;
    }

    setPendingAction(`buy:${definition.objectId}`);
    try {
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(definition.priceMist))]);
      tx.moveCall({
        target: `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::buy_item`,
        arguments: [
          tx.object(definition.objectId),
          coin,
          tx.object(ITEMS_TREASURY_ID),
          tx.object(CLOCK_ID),
        ],
      });

      await execute(tx, `${definition.name} bought`);
      await Promise.all([inventory.refetch(), definitions.refetch(), balance.refetch()]);
    } finally {
      setPendingAction(null);
    }
  };

  const onSell = async (item: PlayerItem) => {
    if (!account) {
      toast.error("Connect wallet first");
      return;
    }

    const cap = kioskCaps.data?.[0];
    if (!cap) {
      toast.error("Create a kiosk first in My Martians before listing items.");
      return;
    }
    if (item.equipped) {
      toast.error("Unequip is not available in this package yet, so equipped items cannot be listed.");
      return;
    }

    setPendingAction(`sell:${item.objectId}`);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::list_item_for_sale`,
        arguments: [
          tx.object(cap.kioskId),
          tx.object(cap.objectId),
          tx.object(item.objectId),
          tx.pure.u64(BigInt(item.priceMist || "0")),
        ],
      });

      await execute(tx, `${item.name} listed for sale`);
      await inventory.refetch();
    } finally {
      setPendingAction(null);
    }
  };

  const marketplaceItems = definitions.data ?? [];
  const ownedItems = inventory.data ?? [];
  const hasKioskCap = (kioskCaps.data?.length ?? 0) > 0;
  const hpTone =
    teamHealth.percent > 60 ? "hp-fill-green" : teamHealth.percent >= 30 ? "hp-fill-yellow" : "hp-fill-red";

  return (
    <PageShell
      title="Items"
      subtitle="A bright little backpack for potions, armor, and weapons on Sui."
    >
      <section className="glass-card overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.16),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_auto] xl:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-purple/40 bg-purple/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-purple-100">
                Martian Items
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-200">
                {account ? short(account.address) : "Wallet not connected"}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-gray-300">
                <span>{teamHealth.max > 0 ? `HP ${teamHealth.current} / ${teamHealth.max}` : "HP link your Martians"}</span>
                <span>{Math.round(teamHealth.percent)}%</span>
              </div>
              <div className="hp-bar">
                <div className={`hp-fill ${hpTone}`} style={{ width: `${teamHealth.percent}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400">SUI Balance</div>
            <div className="mt-2 text-2xl font-extrabold text-cyan">
              {account ? toSui(balance.data?.totalBalance ?? "0") : "0.0000"} SUI
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {hasKioskCap ? "Kiosk ready for selling items." : "Create a kiosk in My Martians to sell items."}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-[24px] border border-white/10 bg-black/20 p-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`rounded-2xl px-3 py-2 text-xs font-bold transition ${
                  activeTab === tab.id
                    ? "bg-cyan text-slate-950"
                    : "bg-white/5 text-gray-200 hover:bg-white/10"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-xs leading-6 text-amber-50">
          This items package currently exposes on-chain buy and sale listing only. Equip, unequip, use,
          and burn buttons are shown in the UI but remain disabled until those entrypoints exist on-chain.
        </div>
      </section>

      {!account && (
        <div className="glass-card p-4 text-sm text-gray-300">
          Connect a Sui wallet to load your item backpack and shop.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <section className={`${panelVisibility(activeTab, "inventory")} lg:col-span-2`}>
          <div className="glass-card space-y-4 rounded-[28px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-white">Inventory</h2>
                <p className="text-sm text-gray-400">Everything in your backpack.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
                {ownedItems.length} items
              </div>
            </div>

            {inventory.isLoading ? (
              <LoadingGrid count={4} />
            ) : ownedItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-gray-400">
                No items in your backpack yet.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {ownedItems.map((item) => (
                  <ItemCard
                    key={item.objectId}
                    item={item}
                    nowMs={nowMs}
                    isSelling={pendingAction === `sell:${item.objectId}`}
                    canSell={hasKioskCap && !item.equipped}
                    onSell={onSell}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={`${panelVisibility(activeTab, "marketplace")} lg:col-span-1`}>
          <div className="glass-card space-y-4 rounded-[28px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-white">Marketplace</h2>
                <p className="text-sm text-gray-400">Buy bright tools from the chain.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white">
                {marketplaceItems.length} live
              </div>
            </div>

            {definitions.isLoading ? (
              <LoadingGrid count={3} />
            ) : marketplaceItems.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-gray-400">
                No enabled item definitions were discovered on-chain yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {marketplaceItems.map((definition) => (
                  <MarketplaceCard
                    key={definition.objectId}
                    definition={definition}
                    isPending={pendingAction === `buy:${definition.objectId}`}
                    disabled={!account}
                    onBuy={onBuy}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className={`${panelVisibility(activeTab, "equipped")} lg:col-span-1`}>
          <div className="glass-card space-y-4 rounded-[28px] p-4">
            <div>
              <h2 className="text-xl font-extrabold text-white">Equipped</h2>
              <p className="text-sm text-gray-400">What your Martians are carrying right now.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <EquipmentSlot slot="helmet" item={equippedBySlot.helmet} />
              <EquipmentSlot slot="armor" item={equippedBySlot.armor} />
              <EquipmentSlot slot="weapon" item={equippedBySlot.weapon} />
              <EquipmentSlot slot="potion" item={equippedBySlot.potion} />
            </div>
          </div>
        </aside>
      </div>

      <section className="glass-card rounded-[28px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-white">Player Stats Summary</h2>
            <p className="text-sm text-gray-400">Bonuses from equipped items only.</p>
          </div>
          <div className="rounded-full border border-green-300/20 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-100">
            Equipped bonuses
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-amber-300/20 bg-amber-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100/80">Total Attack</div>
            <div className="mt-2 text-3xl font-extrabold text-amber-50">+{totals.attack}</div>
          </div>
          <div className="rounded-[24px] border border-sky-300/20 bg-sky-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-sky-100/80">Total Defense</div>
            <div className="mt-2 text-3xl font-extrabold text-sky-50">+{totals.defense}</div>
          </div>
          <div className="rounded-[24px] border border-pink-300/20 bg-pink-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-pink-100/80">Total Heal Bonus</div>
            <div className="mt-2 text-3xl font-extrabold text-pink-50">+{totals.heal}</div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
