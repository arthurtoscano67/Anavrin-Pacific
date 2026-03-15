import { useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { KioskClient, KioskTransaction, Network } from "@mysten/kiosk";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";

import { LoadingGrid } from "../components/LoadingGrid";
import { MonsterImage } from "../components/MonsterImage";
import { PageShell } from "../components/PageShell";
import { StageBadge } from "../components/StageBadge";
import { Spinner } from "../components/Spinner";
import { MONSTER_TYPE } from "../lib/constants";
import { short, toSui } from "../lib/format";
import type { Monster } from "../lib/types";
import { useAnavrinData } from "../hooks/useAnavrinData";
import { useTxExecutor } from "../hooks/useTxExecutor";

export function MarketplacePage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { listedMonsters, kioskCaps, walletMonsters, kioskMonsters } = useAnavrinData();
  const { execute } = useTxExecutor();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onBuy = async (monster: Monster) => {
    if (!account) {
      toast.error("Connect wallet first");
      return;
    }
    if (!monster.kioskId || !monster.priceMist) {
      toast.error("Listing data missing kiosk/price details");
      return;
    }

    const cap = kioskCaps.data?.[0];
    if (!cap) {
      toast.error("You need a kiosk owner cap to receive marketplace purchases. Create a kiosk in My Martians first.");
      return;
    }

    setPendingId(monster.objectId);
    try {
      const tx = new Transaction();
      const kioskClient = new KioskClient({ client, network: Network.MAINNET });
      const kioskTx = new KioskTransaction({
        transaction: tx,
        kioskClient,
        cap: {
          objectId: cap.objectId,
          kioskId: cap.kioskId,
          isPersonal: cap.isPersonal,
          digest: cap.digest ?? "",
          version: cap.version ?? "0",
        },
      });

      await kioskTx.purchaseAndResolve({
        itemType: MONSTER_TYPE,
        itemId: monster.objectId,
        price: BigInt(monster.priceMist),
        sellerKiosk: monster.kioskId,
      });
      kioskTx.finalize();

      await execute(tx, "Purchase complete");
      await Promise.all([
        listedMonsters.refetch(),
        walletMonsters.refetch(),
        kioskMonsters.refetch(),
      ]);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <PageShell
      title="Marketplace"
      subtitle="Live kiosk listings for Martians. Buy flow uses Sui kiosk transactions on mainnet."
    >
      {!account && (
        <div className="glass-card p-4 text-sm text-gray-300">
          Connect wallet to buy listed Martians.
        </div>
      )}

      {account && (kioskCaps.data?.length ?? 0) === 0 && (
        <div className="glass-card rounded-xl border border-yellow-400/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          You have no kiosk owner cap. Buying from kiosk requires one. Create a kiosk on My Martians first.
        </div>
      )}

      {listedMonsters.isLoading ? (
        <LoadingGrid count={8} />
      ) : (listedMonsters.data ?? []).length === 0 ? (
        <div className="glass-card p-5 text-sm text-gray-300">
          No active listings found for `Martian` currently.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(listedMonsters.data ?? []).map((monster) => (
            <article key={`${monster.kioskId}-${monster.objectId}`} className="glass-card card-hover overflow-hidden">
              <MonsterImage objectId={monster.objectId} monster={monster} className="aspect-square" />
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="truncate text-sm font-semibold">{monster.name}</div>
                    <div className="text-xs text-gray-400">{short(monster.objectId)}</div>
                  </div>
                  <StageBadge stage={monster.stage} />
                </div>

                <div className="rounded-xl border border-borderSoft bg-black/20 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Price</span>
                    <span className="font-semibold text-cyan">{toSui(monster.priceMist)} SUI</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">Kiosk: {short(monster.kioskId)}</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-gray-300">
                  <div className="rounded-lg border border-borderSoft bg-black/20 p-2">ATK {monster.attack}</div>
                  <div className="rounded-lg border border-borderSoft bg-black/20 p-2">DEF {monster.defense}</div>
                  <div className="rounded-lg border border-borderSoft bg-black/20 p-2">SPD {monster.speed}</div>
                </div>

                <button
                  className="btn-primary w-full"
                  disabled={!account || pendingId === monster.objectId}
                  onClick={() => onBuy(monster)}
                >
                  {pendingId === monster.objectId ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Buying...
                    </span>
                  ) : (
                    `Buy ${toSui(monster.priceMist)} SUI`
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
