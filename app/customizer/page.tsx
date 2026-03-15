"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { MonsterCard } from "@/components/monster-card";
import { WalletGate } from "@/components/wallet-gate";
import { EQUIPMENT_SLOTS } from "@/lib/config";
import { readLoadouts, writeLoadouts, type EquipmentLoadout } from "@/lib/loadouts";
import { useMonsterPortfolio } from "@/hooks/use-monster-portfolio";

const DEFAULT_ITEMS = {
  hat: ["None", "Samurai Helm", "Mech Crown", "Guardian Hood"],
  shirt: ["None", "Battle Tunic", "Neon Vest", "Storm Robe"],
  pants: ["None", "Heavy Greaves", "Scout Pants", "Shadow Slacks"],
  shoes: ["None", "Swift Boots", "Gravity Soles", "Ranger Sandals"],
  armor: ["None", "Titan Plate", "Drake Mail", "Hex Armor"],
  suit: ["None", "Stealth Suit", "Royal Suit", "Astral Suit"],
} as const;

export default function CustomizerPage() {
  const account = useCurrentAccount();
  const portfolio = useMonsterPortfolio(account?.address);
  const [selectedId, setSelectedId] = useState("");
  const [loadouts, setLoadouts] = useState<Record<string, EquipmentLoadout>>({});

  useEffect(() => {
    setLoadouts(readLoadouts());
  }, []);

  useEffect(() => {
    if (!selectedId && portfolio.walletMonsters.length > 0) {
      setSelectedId(portfolio.walletMonsters[0].objectId);
    }
  }, [portfolio.walletMonsters, selectedId]);

  const selectedMonster = useMemo(
    () => portfolio.walletMonsters.find((monster) => monster.objectId === selectedId) || null,
    [portfolio.walletMonsters, selectedId]
  );

  const selectedLoadout = selectedId ? loadouts[selectedId] || {} : {};

  const updateSlot = (slot: keyof typeof DEFAULT_ITEMS, value: string) => {
    if (!selectedId) return;
    setLoadouts((current) => {
      const next = {
        ...current,
        [selectedId]: {
          ...(current[selectedId] || {}),
          [slot]: value === "None" ? undefined : value,
        },
      };
      writeLoadouts(next);
      return next;
    });
  };

  if (!account) {
    return (
      <WalletGate
        title="Connect wallet to customize monsters"
        subtitle="Set hats, shirts, pants, shoes, armor, and suit loadouts per NFT."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-4">
        <h1 className="text-3xl font-semibold">Monster Customizer</h1>
        <p className="text-sm text-mist">
          Equipment loadouts are saved per monster in local profile storage. Slot values are ready to be
          mapped to future on-chain cosmetic modules.
        </p>

        <select className="input max-w-xl" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Select monster</option>
          {portfolio.walletMonsters.map((monster) => (
            <option key={monster.objectId} value={monster.objectId}>
              {monster.name} ({monster.objectId.slice(0, 8)}...)
            </option>
          ))}
        </select>
      </section>

      {!selectedMonster ? (
        <div className="panel text-sm text-mist">Select a wallet monster to configure equipment slots.</div>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <MonsterCard monster={selectedMonster} />

          <div className="panel space-y-4">
            <h2 className="text-2xl font-semibold">Equipment Slots</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {EQUIPMENT_SLOTS.map((slot) => (
                <label key={slot} className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-mist">{slot}</div>
                  <select
                    className="input"
                    value={selectedLoadout[slot] || "None"}
                    onChange={(event) => updateSlot(slot, event.target.value)}
                  >
                    {DEFAULT_ITEMS[slot].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="rounded-lg border border-white/10 bg-ink/60 p-4">
              <div className="text-xs uppercase tracking-wide text-mist">Active Preset</div>
              <pre className="mt-2 overflow-auto text-xs text-mist">
                {JSON.stringify(selectedLoadout, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
