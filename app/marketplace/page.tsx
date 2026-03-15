"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import type { SuiClient } from "@mysten/sui/client";

import { MonsterCard } from "@/components/monster-card";
import { StatCard } from "@/components/stat-card";
import { WalletGate } from "@/components/wallet-gate";
import { fetchKioskMonsters } from "@/lib/sui-data";
import { formatSui } from "@/lib/format";
import { useMonsterPortfolio } from "@/hooks/use-monster-portfolio";

async function fetchTrackedListings(client: SuiClient, kioskIds: string[]) {
  const result = await Promise.all(kioskIds.map((id) => fetchKioskMonsters(client, id)));
  return result.flat().filter((monster) => Boolean(monster.listedPriceMist));
}

export default function MarketplacePage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const portfolio = useMonsterPortfolio(account?.address);
  const [trackedKiosks, setTrackedKiosks] = useState<string[]>([]);
  const [kioskInput, setKioskInput] = useState("");

  useEffect(() => {
    if (!portfolio.kiosks.length) return;
    setTrackedKiosks((previous) => {
      const merged = new Set([...previous, ...portfolio.kiosks.map((k) => k.kioskId)]);
      return [...merged];
    });
  }, [portfolio.kiosks]);

  const listingsQuery = useQuery({
    queryKey: ["marketplace", trackedKiosks.slice().sort().join(",")],
    queryFn: () => fetchTrackedListings(client, trackedKiosks),
    enabled: trackedKiosks.length > 0,
    refetchInterval: 15_000,
  });

  const listings = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const floorMist = useMemo(() => {
    if (listings.length === 0) return null;
    return listings.reduce((min, listing) => {
      if (!listing.listedPriceMist) return min;
      if (min === null) return listing.listedPriceMist;
      return BigInt(listing.listedPriceMist) < BigInt(min) ? listing.listedPriceMist : min;
    }, null as string | null);
  }, [listings]);

  if (!account) {
    return (
      <WalletGate
        title="Connect wallet to access marketplace tools"
        subtitle="Track kiosk listings, monitor floor prices, and view listed monsters from your own or external kiosks."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3">
        <StatCard label="Tracked Kiosks" value={trackedKiosks.length} />
        <StatCard label="Active Listings" value={listings.length} tone="pulse" />
        <StatCard
          label="Floor Price"
          value={floorMist ? `${formatSui(floorMist)} SUI` : "N/A"}
          tone="ember"
        />
      </section>

      <section className="panel space-y-3">
        <h2 className="text-2xl font-semibold">Track Kiosk</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="input"
            placeholder="Enter kiosk object id"
            value={kioskInput}
            onChange={(event) => setKioskInput(event.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!kioskInput) return;
              setTrackedKiosks((current) =>
                current.includes(kioskInput) ? current : [...current, kioskInput]
              );
              setKioskInput("");
            }}
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {trackedKiosks.map((kioskId) => (
            <button
              key={kioskId}
              className="btn btn-secondary"
              onClick={() => {
                setTrackedKiosks((current) => current.filter((id) => id !== kioskId));
              }}
            >
              Remove {kioskId.slice(0, 10)}...
            </button>
          ))}
          <button className="btn btn-secondary" onClick={() => void listingsQuery.refetch()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Listings</h2>
        {listingsQuery.isLoading ? (
          <div className="panel text-sm text-mist">Loading listings...</div>
        ) : listings.length === 0 ? (
          <div className="panel text-sm text-mist">
            No listed monsters found in tracked kiosks.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((monster) => (
              <MonsterCard key={`${monster.kioskId}-${monster.objectId}`} monster={monster} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
