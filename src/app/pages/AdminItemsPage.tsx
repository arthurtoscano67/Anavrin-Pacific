import { useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { Transaction } from "@mysten/sui/transactions";

import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import {
  CLOCK_ID,
  ITEM_DEFINITION_TYPE,
  ITEMS_ADMIN_CAP_ID,
  ITEMS_MODULE,
  ITEMS_PACKAGE_ID,
} from "../lib/constants";
import { itemAccent, itemBonusSummary, itemDurationLabel, itemIcon, itemSupplyRemaining, itemTypeLabel, resolveEquipmentSlot, resolveItemKind } from "../lib/items";
import { short, toMist, toSui } from "../lib/format";
import { fetchItemDefinitions, parseItemDefinition } from "../lib/sui";
import type { ItemDefinition } from "../lib/types";
import { useTxExecutor } from "../hooks/useTxExecutor";

const ADMIN_CAP_OBJECT_ID = (import.meta.env.VITE_ITEMS_ADMIN_CAP_ID ?? ITEMS_ADMIN_CAP_ID).trim();
const ITEMS_ADMIN_CAP_TYPE = `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::AdminCap`;

const ITEM_TYPES = [
  { label: "Potion", value: 0 },
  { label: "Armor", value: 1 },
  { label: "Weapon", value: 2 },
] as const;

const DURATIONS = [
  { label: "Never expires", value: "0", ms: 0 },
  { label: "1 hour", value: "3600000", ms: 3_600_000 },
  { label: "24 hours", value: "86400000", ms: 86_400_000 },
  { label: "7 days", value: "604800000", ms: 604_800_000 },
  { label: "30 days", value: "2592000000", ms: 2_592_000_000 },
] as const;

function parseWholeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function supplyLabel(definition: ItemDefinition): string {
  return definition.supplyLimit === 0 ? "Unlimited" : String(definition.supplyLimit);
}

export function AdminItemsPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { execute, executeAndFetchBlock } = useTxExecutor();

  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("0");
  const [healAmount, setHealAmount] = useState("0");
  const [attackBonus, setAttackBonus] = useState("0");
  const [defenseBonus, setDefenseBonus] = useState("0");
  const [price, setPrice] = useState("0.001");
  const [duration, setDuration] = useState("0");
  const [supplyLimit, setSupplyLimit] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [createdDefinition, setCreatedDefinition] = useState<ItemDefinition | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("0.001");

  const adminCap = useQuery({
    queryKey: ["itemsAdminCap", ADMIN_CAP_OBJECT_ID],
    queryFn: () =>
      client.getObject({
        id: ADMIN_CAP_OBJECT_ID,
        options: { showOwner: true, showType: true, showContent: true },
      }),
    enabled: Boolean(ADMIN_CAP_OBJECT_ID),
    refetchInterval: 20_000,
  });

  const definitions = useQuery({
    queryKey: ["itemDefinitionsAdmin", ITEMS_PACKAGE_ID],
    queryFn: () => fetchItemDefinitions(client, { includeDisabled: true }),
    refetchInterval: 20_000,
  });

  const adminOwner = useMemo(() => {
    const owner = adminCap.data?.data?.owner as { AddressOwner?: string } | undefined;
    return owner?.AddressOwner ?? null;
  }, [adminCap.data?.data?.owner]);

  const hasAdminAccess = Boolean(
    account?.address &&
      adminCap.data?.data?.type === ITEMS_ADMIN_CAP_TYPE &&
      adminOwner &&
      adminOwner.toLowerCase() === account.address.toLowerCase()
  );

  const selectedDuration = useMemo(
    () => DURATIONS.find((entry) => entry.value === duration) ?? DURATIONS[0],
    [duration]
  );

  const priceMist = useMemo(() => toMist(price).toString(), [price]);

  const preview = useMemo(() => {
    const resolvedType = Number(itemType);
    const kind = resolveItemKind(resolvedType);
    const safeName = name.trim() || "New Item";
    return {
      name: safeName,
      kind,
      slot: resolveEquipmentSlot(safeName, kind),
      healAmount: parseWholeNumber(healAmount),
      attackBonus: parseWholeNumber(attackBonus),
      defenseBonus: parseWholeNumber(defenseBonus),
      priceMist,
      durationMs: selectedDuration.ms,
      supplyLimit: parseWholeNumber(supplyLimit),
      enabled,
      minted: 0,
    };
  }, [attackBonus, defenseBonus, enabled, healAmount, itemType, name, priceMist, selectedDuration.ms, supplyLimit]);

  const resetForm = () => {
    setName("");
    setItemType("0");
    setHealAmount("0");
    setAttackBonus("0");
    setDefenseBonus("0");
    setPrice("0.001");
    setDuration("0");
    setSupplyLimit("0");
    setEnabled(true);
  };

  const onCreate = async () => {
    if (!hasAdminAccess || !ADMIN_CAP_OBJECT_ID) return;

    setPendingAction("create");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::create_item_definition`,
        arguments: [
          tx.object(ADMIN_CAP_OBJECT_ID),
          tx.pure.string(preview.name),
          tx.pure.u8(Number(itemType)),
          tx.pure.u16(preview.healAmount),
          tx.pure.u16(preview.attackBonus),
          tx.pure.u16(preview.defenseBonus),
          tx.pure.u64(BigInt(preview.priceMist)),
          tx.pure.u64(BigInt(preview.durationMs)),
          tx.pure.u64(BigInt(preview.supplyLimit)),
        ],
      });

      const { block } = await executeAndFetchBlock(tx, "Item Created Successfully");
      const createdChange = block.objectChanges?.find(
        (change) =>
          change.type === "created" &&
          change.objectType === ITEM_DEFINITION_TYPE &&
          typeof change.objectId === "string"
      );

      const createdId = createdChange && "objectId" in createdChange ? createdChange.objectId : null;
      let parsed: ItemDefinition | null = null;

      if (createdId) {
        const createdObject = await client.getObject({
          id: createdId,
          options: { showContent: true, showType: true },
        });
        parsed = createdObject.data ? parseItemDefinition(createdObject.data) : null;
      }

      if (createdId && parsed && parsed.enabled !== enabled) {
        const toggleTx = new Transaction();
        toggleTx.moveCall({
          target: `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::toggle_enabled`,
          arguments: [
            toggleTx.object(ADMIN_CAP_OBJECT_ID),
            toggleTx.object(createdId),
            toggleTx.pure.bool(enabled),
          ],
        });
        await execute(toggleTx, enabled ? "Item enabled" : "Item disabled");

        const refreshedObject = await client.getObject({
          id: createdId,
          options: { showContent: true, showType: true },
        });
        parsed = refreshedObject.data ? parseItemDefinition(refreshedObject.data) : parsed;
      }

      setCreatedDefinition(parsed);
      resetForm();
      await definitions.refetch();
    } finally {
      setPendingAction(null);
    }
  };

  const onToggleEnabled = async (definition: ItemDefinition, nextEnabled: boolean) => {
    if (!hasAdminAccess || !ADMIN_CAP_OBJECT_ID) return;

    setPendingAction(`toggle:${definition.objectId}`);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::toggle_enabled`,
        arguments: [
          tx.object(ADMIN_CAP_OBJECT_ID),
          tx.object(definition.objectId),
          tx.pure.bool(nextEnabled),
        ],
      });
      await execute(tx, nextEnabled ? "Item enabled" : "Item disabled");
      await definitions.refetch();
    } finally {
      setPendingAction(null);
    }
  };

  const onStartEditPrice = (definition: ItemDefinition) => {
    setEditingPriceId(definition.objectId);
    setPriceDraft(toSui(definition.priceMist));
  };

  const onUpdatePrice = async (definition: ItemDefinition) => {
    if (!hasAdminAccess || !ADMIN_CAP_OBJECT_ID) return;

    setPendingAction(`price:${definition.objectId}`);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::update_price`,
        arguments: [
          tx.object(ADMIN_CAP_OBJECT_ID),
          tx.object(definition.objectId),
          tx.pure.u64(toMist(priceDraft)),
        ],
      });
      await execute(tx, "Item price updated");
      setEditingPriceId(null);
      await definitions.refetch();
    } finally {
      setPendingAction(null);
    }
  };

  const totalDefinitions = definitions.data?.length ?? 0;
  const enabledDefinitions = (definitions.data ?? []).filter((definition) => definition.enabled).length;

  if (!account) {
    return (
      <PageShell title="Martian Admin Item Creator" subtitle="Connect the admin wallet to manage ItemDefinitions.">
        <div className="glass-card p-4 text-sm text-gray-300">Connect wallet to access the item admin console.</div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Martian Admin Item Creator"
      subtitle="Secure item-definition controls for potions, armor, and weapons on Sui."
    >
      <section className="glass-card overflow-hidden rounded-[28px] border border-lime-400/25 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_24%),linear-gradient(180deg,rgba(3,8,12,0.98),rgba(5,16,18,0.98))] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-lime-300/30 bg-lime-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-lime-200">
              Admin Console
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-gray-500">Wallet Status</div>
              <div className="mt-2 text-lg font-bold text-white">{short(account.address)}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">AdminCap</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {ADMIN_CAP_OBJECT_ID ? short(ADMIN_CAP_OBJECT_ID) : "Missing env"}
              </div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Definitions</div>
              <div className="mt-2 text-2xl font-extrabold text-lime-200">{totalDefinitions}</div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Enabled</div>
              <div className="mt-2 text-2xl font-extrabold text-lime-200">{enabledDefinitions}</div>
            </div>
          </div>
        </div>

        {!ADMIN_CAP_OBJECT_ID && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            Missing `VITE_ITEMS_ADMIN_CAP_ID`. Add the AdminCap object id to your environment variables.
          </div>
        )}

        {ADMIN_CAP_OBJECT_ID && adminCap.isLoading && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
            <Spinner />
            Checking AdminCap ownership...
          </div>
        )}

        {ADMIN_CAP_OBJECT_ID && !adminCap.isLoading && !hasAdminAccess && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
            Admin Access Only
          </div>
        )}
      </section>

      {hasAdminAccess && (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <section className="glass-card space-y-4 rounded-[28px] border border-lime-400/20 p-5">
              <div>
                <h2 className="text-lg font-bold text-white">Create Item Form</h2>
                <p className="mt-1 text-sm text-gray-400">Simple enough to fill fast, strict enough to stay safe.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Item Name</label>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Super Juice Potion" />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Item Type</label>
                <select className="input" value={itemType} onChange={(event) => setItemType(event.target.value)}>
                  {ITEM_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Heal Amount</label>
                  <input className="input" inputMode="numeric" value={healAmount} onChange={(event) => setHealAmount(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Attack Bonus</label>
                  <input className="input" inputMode="numeric" value={attackBonus} onChange={(event) => setAttackBonus(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Defense Bonus</label>
                  <input className="input" inputMode="numeric" value={defenseBonus} onChange={(event) => setDefenseBonus(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Price (SUI)</label>
                  <input className="input" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.001" />
                  <div className="text-xs text-lime-200">Mist: {priceMist}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Duration</label>
                  <select className="input" value={duration} onChange={(event) => setDuration(event.target.value)}>
                    {DURATIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.18em] text-gray-500">Supply Limit</label>
                  <input className="input" inputMode="numeric" value={supplyLimit} onChange={(event) => setSupplyLimit(event.target.value)} />
                  <div className="text-xs text-gray-500">0 = unlimited supply</div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Enable Item</div>
                      <div className="mt-1 text-sm text-white">{enabled ? "Enabled after create" : "Disabled after create"}</div>
                    </div>
                    <button
                      type="button"
                      className={`relative h-8 w-14 rounded-full border transition ${
                        enabled ? "border-lime-300/40 bg-lime-400/25" : "border-white/10 bg-white/10"
                      }`}
                      onClick={() => setEnabled((value) => !value)}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                          enabled ? "left-8" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <button
                className="btn-primary w-full border-lime-300/40 bg-lime-400/85 text-slate-950 hover:bg-lime-300"
                onClick={onCreate}
                disabled={pendingAction !== null || !name.trim()}
              >
                {pendingAction === "create" ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} /> Creating...
                  </span>
                ) : (
                  "Create Item"
                )}
              </button>

              {createdDefinition && (
                <div className="rounded-2xl border border-lime-300/30 bg-lime-400/10 p-4 text-sm text-lime-100">
                  <div className="font-semibold">Item Created Successfully</div>
                  <div className="mt-2 break-all text-xs">ItemDefinition ID: {createdDefinition.objectId}</div>
                </div>
              )}
            </section>

            <section className="glass-card space-y-4 rounded-[28px] border border-lime-400/20 p-5">
              <div>
                <h2 className="text-lg font-bold text-white">Preview Card</h2>
                <p className="mt-1 text-sm text-gray-400">Live preview while you type.</p>
              </div>

              <article className="card-hover overflow-hidden rounded-[26px] border border-lime-300/25 bg-black/20">
                <div className={`bg-gradient-to-br p-5 ${itemAccent(preview.kind)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid h-16 w-16 place-items-center rounded-[22px] border border-white/20 bg-black/20 text-4xl">
                      {itemIcon(preview.kind, preview.slot)}
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      preview.enabled
                        ? "border-lime-300/40 bg-lime-400/15 text-lime-100"
                        : "border-red-300/30 bg-red-500/10 text-red-100"
                    }`}>
                      {preview.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <div className="text-xl font-extrabold text-white">{preview.name}</div>
                    <div className="mt-1 text-sm text-gray-400">
                      {itemTypeLabel(preview.kind)} • {itemBonusSummary(preview)}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-lime-400/10 p-3 text-sm text-lime-100">
                      Price: {toSui(preview.priceMist)} SUI
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-cyan/10 p-3 text-sm text-cyan-100">
                      {itemDurationLabel(preview.durationMs)}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-purple/10 p-3 text-sm text-purple-100">
                      Supply: {preview.supplyLimit === 0 ? "Unlimited" : preview.supplyLimit}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white">
                      Slot: {preview.slot}
                    </div>
                  </div>
                </div>
              </article>
            </section>

            <section className="glass-card space-y-4 rounded-[28px] border border-lime-400/20 p-5">
              <div>
                <h2 className="text-lg font-bold text-white">Console Status</h2>
                <p className="mt-1 text-sm text-gray-400">Fast checks before you write to chain.</p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Connected Admin</div>
                  <div className="mt-2 text-sm font-semibold text-white">{short(account.address)}</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">AdminCap Owner</div>
                  <div className="mt-2 text-sm font-semibold text-white">{adminOwner ? short(adminOwner) : "Unknown"}</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Package</div>
                  <div className="mt-2 break-all text-xs text-gray-300">{ITEMS_PACKAGE_ID}</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Module</div>
                  <div className="mt-2 text-sm font-semibold text-white">{ITEMS_MODULE}</div>
                </div>
              </div>
            </section>
          </div>

          <section className="glass-card rounded-[28px] border border-lime-400/20 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Existing Items Table</h2>
                <p className="mt-1 text-sm text-gray-400">All discovered ItemDefinition objects, including disabled ones.</p>
              </div>
              <button className="btn-ghost text-xs" onClick={() => definitions.refetch()} disabled={definitions.isFetching}>
                {definitions.isFetching ? "Refreshing..." : "Refresh Items"}
              </button>
            </div>

            {definitions.isLoading ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
                <Spinner />
                Loading item definitions from chain...
              </div>
            ) : (definitions.data ?? []).length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-gray-400">
                No item definitions found yet.
              </div>
            ) : (
              <>
                <div className="mt-4 space-y-3 lg:hidden">
                  {(definitions.data ?? []).map((definition) => (
                    <article key={definition.objectId} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-white">{definition.name}</div>
                          <div className="mt-1 text-xs text-gray-400">{itemTypeLabel(definition.kind)}</div>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          definition.enabled
                            ? "border-lime-300/30 bg-lime-400/10 text-lime-100"
                            : "border-red-300/30 bg-red-500/10 text-red-100"
                        }`}>
                          {definition.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-gray-300">
                        <div className="flex items-center justify-between gap-2"><span>Price</span><span>{toSui(definition.priceMist)} SUI</span></div>
                        <div className="flex items-center justify-between gap-2"><span>Supply</span><span>{supplyLabel(definition)}</span></div>
                        <div className="flex items-center justify-between gap-2"><span>Minted</span><span>{definition.minted}</span></div>
                      </div>

                      <div className="mt-4 space-y-2">
                        {editingPriceId === definition.objectId ? (
                          <div className="flex gap-2">
                            <input className="input" value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)} />
                            <button className="btn-primary text-xs" onClick={() => onUpdatePrice(definition)} disabled={pendingAction !== null}>
                              {pendingAction === `price:${definition.objectId}` ? "Saving..." : "Save"}
                            </button>
                          </div>
                        ) : (
                          <button className="btn-ghost w-full text-xs" onClick={() => onStartEditPrice(definition)} disabled={pendingAction !== null}>
                            Update Price
                          </button>
                        )}

                        <button
                          className="btn-secondary w-full text-xs"
                          onClick={() => onToggleEnabled(definition, !definition.enabled)}
                          disabled={pendingAction !== null}
                        >
                          {pendingAction === `toggle:${definition.objectId}`
                            ? "Saving..."
                            : definition.enabled ? "Disable Item" : "Enable Item"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-4 hidden overflow-x-auto lg:block">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs uppercase tracking-[0.2em] text-gray-500">
                        <th className="px-3 py-3">Name</th>
                        <th className="px-3 py-3">Type</th>
                        <th className="px-3 py-3">Price</th>
                        <th className="px-3 py-3">Supply</th>
                        <th className="px-3 py-3">Enabled</th>
                        <th className="px-3 py-3">Minted</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(definitions.data ?? []).map((definition) => (
                        <tr key={definition.objectId} className="border-b border-white/6 transition hover:bg-lime-400/5">
                          <td className="px-3 py-4">
                            <div className="font-semibold text-white">{definition.name}</div>
                            <div className="mt-1 text-xs text-gray-500">{short(definition.objectId)}</div>
                          </td>
                          <td className="px-3 py-4 text-gray-300">{itemTypeLabel(definition.kind)}</td>
                          <td className="px-3 py-4 text-gray-300">
                            {editingPriceId === definition.objectId ? (
                              <div className="flex items-center gap-2">
                                <input className="input min-w-[120px]" value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)} />
                                <button className="btn-primary text-xs" onClick={() => onUpdatePrice(definition)} disabled={pendingAction !== null}>
                                  {pendingAction === `price:${definition.objectId}` ? "Saving..." : "Save"}
                                </button>
                              </div>
                            ) : (
                              `${toSui(definition.priceMist)} SUI`
                            )}
                          </td>
                          <td className="px-3 py-4 text-gray-300">{supplyLabel(definition)}</td>
                          <td className="px-3 py-4">
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              definition.enabled
                                ? "border-lime-300/30 bg-lime-400/10 text-lime-100"
                                : "border-red-300/30 bg-red-500/10 text-red-100"
                            }`}>
                              {definition.enabled ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-gray-300">{definition.minted}</td>
                          <td className="px-3 py-4">
                            <div className="flex justify-end gap-2">
                              {editingPriceId !== definition.objectId && (
                                <button className="btn-ghost text-xs" onClick={() => onStartEditPrice(definition)} disabled={pendingAction !== null}>
                                  Update Price
                                </button>
                              )}
                              <button
                                className="btn-secondary text-xs"
                                onClick={() => onToggleEnabled(definition, !definition.enabled)}
                                disabled={pendingAction !== null}
                              >
                                {pendingAction === `toggle:${definition.objectId}`
                                  ? "Saving..."
                                  : definition.enabled ? "Disable Item" : "Enable Item"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
