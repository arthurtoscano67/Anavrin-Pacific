import { useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Link } from "react-router-dom";

import { LoadingGrid } from "../components/LoadingGrid";
import { MartianGifCard } from "../components/MartianGifCard";
import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import { useArenaMatches } from "../hooks/useArenaMatches";
import { CLOCK_ID, MODULE, PACKAGE_ID, TREASURY_ID } from "../lib/constants";
import { toSui } from "../lib/format";
import { useAnavrinData } from "../hooks/useAnavrinData";
import { useTxExecutor } from "../hooks/useTxExecutor";

export function MyLegendsPage() {
  const account = useCurrentAccount();
  const { walletMonsters, kioskMonsters, kioskCaps, adults } = useAnavrinData();
  const arenaMatches = useArenaMatches(account?.address);
  const { execute } = useTxExecutor();

  const [pendingMonsterId, setPendingMonsterId] = useState<string | null>(null);
  const [breedTarget, setBreedTarget] = useState<string | null>(null);
  const [breedPartner, setBreedPartner] = useState("");
  const [listTarget, setListTarget] = useState<string | null>(null);
  const [listCap, setListCap] = useState("");
  const [listPrice, setListPrice] = useState("1");

  const depositedMonsterIds = useMemo(
    () =>
      new Set(
        arenaMatches.activeMatches.flatMap((match) => [match.mon_a, match.mon_b].filter(Boolean) as string[])
      ),
    [arenaMatches.activeMatches]
  );

  const onCreateKiosk = async () => {
    if (!account) return;
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::${MODULE}::create_kiosk`, arguments: [] });
    await execute(tx, "Kiosk created");
    kioskCaps.refetch();
  };

  const onHeartbeat = async (monsterId: string) => {
    setPendingMonsterId(monsterId);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::sync_stage`,
        arguments: [tx.object(monsterId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });
      await execute(tx, "Stage synced");
      walletMonsters.refetch();
    } finally {
      setPendingMonsterId(null);
    }
  };

  const onBreed = async () => {
    if (!breedTarget || !breedPartner) return;
    setPendingMonsterId(breedTarget);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::breed`,
        arguments: [tx.object(breedTarget), tx.object(breedPartner), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });
      await execute(tx, "Breed transaction sent");
      setBreedTarget(null);
      setBreedPartner("");
      walletMonsters.refetch();
    } finally {
      setPendingMonsterId(null);
    }
  };

  const onList = async () => {
    if (!listTarget || !listCap) return;
    const cap = kioskCaps.data?.find((k) => k.objectId === listCap);
    if (!cap) return;

    setPendingMonsterId(listTarget);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::list_for_sale`,
        arguments: [
          tx.object(cap.kioskId),
          tx.object(cap.objectId),
          tx.object(listTarget),
          tx.pure.u64(BigInt(Math.floor(Number(listPrice) * 1_000_000_000))),
        ],
      });
      await execute(tx, "Martian listed");
      setListTarget(null);
      walletMonsters.refetch();
      kioskMonsters.refetch();
    } finally {
      setPendingMonsterId(null);
    }
  };

  return (
    <PageShell
      title="My Martians"
      subtitle="Wallet + kiosk inventory, stage sync, breeding, and listing flows."
    >
      {!account && <div className="glass-card p-4 text-sm text-gray-300">Connect wallet to see your monsters.</div>}

      {account && (
        <div className="glass-card flex flex-wrap items-center gap-3 p-4">
          <div className="text-sm text-gray-300">Owned kiosk caps: <strong>{kioskCaps.data?.length ?? 0}</strong></div>
          <button className="btn-secondary" onClick={onCreateKiosk}>Create Kiosk</button>
          {kioskMonsters.data && kioskMonsters.data.length > 0 && (
            <div className="text-sm text-cyan">Kiosk Martians listed/stored: {kioskMonsters.data.length}</div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-bold">Wallet Martians</h2>
        {walletMonsters.isLoading ? (
          <LoadingGrid />
        ) : walletMonsters.data && walletMonsters.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {walletMonsters.data.map((monster) => (
              <MartianGifCard
                key={monster.objectId}
                monster={monster}
                actions={
                  <div className="grid gap-2">
                    <button
                      className="btn-secondary w-full"
                      onClick={() => onHeartbeat(monster.objectId)}
                      disabled={pendingMonsterId === monster.objectId}
                    >
                      {pendingMonsterId === monster.objectId ? (
                        <span className="inline-flex items-center gap-2"><Spinner /> Syncing</span>
                      ) : (
                        "Sync Stage"
                      )}
                    </button>

                    {monster.stage >= 2 && (
                      <button className="btn-ghost w-full" onClick={() => setBreedTarget(monster.objectId)}>
                        Breed
                      </button>
                    )}

                    <button className="btn-ghost w-full" onClick={() => setListTarget(monster.objectId)}>
                      List For Sale
                    </button>

                    {depositedMonsterIds.has(monster.objectId) ? (
                      <button className="btn-ghost w-full text-center text-xs" disabled>
                        Deposited
                      </button>
                    ) : (
                      <Link
                        to={`/lobby?monster=${monster.objectId}`}
                        className="btn-ghost w-full text-center text-xs"
                      >
                        Send To Battle
                      </Link>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <div className="glass-card p-4 text-sm text-gray-300">No wallet Martians yet.</div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-bold">Kiosk Martians</h2>
        {kioskMonsters.isLoading ? (
          <LoadingGrid count={4} />
        ) : kioskMonsters.data && kioskMonsters.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {kioskMonsters.data.map((monster) => (
              <MartianGifCard key={`${monster.kioskId}-${monster.objectId}`} monster={monster} />
            ))}
          </div>
        ) : (
          <div className="glass-card p-4 text-sm text-gray-300">No Martians currently in your kiosks.</div>
        )}
      </div>

      {breedTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="glass-card w-full max-w-md space-y-4 p-5">
            <h3 className="text-lg font-bold">Breed Martian</h3>
            <select className="input" value={breedPartner} onChange={(e) => setBreedPartner(e.target.value)}>
              <option value="">Select second Enlightened Martian</option>
              {adults
                .filter((m) => m.objectId !== breedTarget)
                .map((m) => (
                  <option value={m.objectId} key={m.objectId}>{m.name}</option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setBreedTarget(null)}>Cancel</button>
              <button className="btn-primary" disabled={!breedPartner} onClick={onBreed}>Breed</button>
            </div>
          </div>
        </div>
      )}

      {listTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="glass-card w-full max-w-md space-y-4 p-5">
            <h3 className="text-lg font-bold">List Martian</h3>
            <select className="input" value={listCap} onChange={(e) => setListCap(e.target.value)}>
              <option value="">Select kiosk cap</option>
              {(kioskCaps.data ?? []).map((cap) => (
                <option value={cap.objectId} key={cap.objectId}>{cap.kioskId}</option>
              ))}
            </select>
            <div>
              <label className="mb-1 block text-xs text-gray-400">Price (SUI)</label>
              <input className="input" value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
              <div className="mt-1 text-xs text-cyan">{toSui(BigInt(Math.floor(Number(listPrice || "0") * 1_000_000_000)))} SUI</div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setListTarget(null)}>Cancel</button>
              <button className="btn-primary" disabled={!listCap || !listPrice} onClick={onList}>List</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
