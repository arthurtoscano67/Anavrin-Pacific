import { useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { PageShell } from "../components/PageShell";
import { StageBadge } from "../components/StageBadge";
import { Spinner } from "../components/Spinner";
import { CLOCK_ID, MODULE, MONSTER_TYPE, PACKAGE_ID, TREASURY_ID } from "../lib/constants";
import { toSui } from "../lib/format";
import type { Monster } from "../lib/types";
import { parseMonster } from "../lib/sui";
import { useAnavrinData } from "../hooks/useAnavrinData";
import { useTxExecutor } from "../hooks/useTxExecutor";

export function MintPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { treasury, mintPreviewId, walletMonsters } = useAnavrinData();
  const { executeAndFetchBlock } = useTxExecutor();
  const [minted, setMinted] = useState<Monster | null>(null);
  const [pending, setPending] = useState(false);

  const previewId = useMemo(() => {
    return minted?.objectId || mintPreviewId.data || walletMonsters.data?.[0]?.objectId || "";
  }, [mintPreviewId.data, minted?.objectId, walletMonsters.data]);
  const previewMonster = useMemo(() => {
    return minted ?? walletMonsters.data?.find((monster) => monster.objectId === previewId) ?? null;
  }, [minted, previewId, walletMonsters.data]);
  const previewTraits = useMemo(() => {
    return {
      seed: String(previewMonster?.seed ?? 42),
      stage: Number(previewMonster?.stage ?? 0),
      attack: Number(previewMonster?.attack ?? 50),
      defense: Number(previewMonster?.defense ?? 50),
      speed: Number(previewMonster?.speed ?? 50),
      wins: Number(previewMonster?.wins ?? 0),
      xp: Number(previewMonster?.xp ?? 0),
    };
  }, [previewMonster]);
  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({
      seed: previewTraits.seed,
      stage: String(previewTraits.stage),
      attack: String(previewTraits.attack),
      defense: String(previewTraits.defense),
      speed: String(previewTraits.speed),
      wins: String(previewTraits.wins),
      xp: String(previewTraits.xp),
    });
    return `https://heart-beat-production.up.railway.app/martian/preview?${params.toString()}`;
  }, [previewTraits]);

  const onMint = async () => {
    if (!account) return;
    const priceMist = treasury.data?.mint_price_mist ?? "0";
    setPending(true);
    try {
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::mint`,
        arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), coin],
      });

      const { block } = await executeAndFetchBlock(tx, "Martian minted");
      const createdMonster = block.objectChanges?.find(
        (c) => c.type === "created" && c.objectType === MONSTER_TYPE
      );
      if (createdMonster && "objectId" in createdMonster) {
        const obj = await client.getObject({
          id: createdMonster.objectId,
          options: { showContent: true, showDisplay: true, showType: true },
        });
        const parsed = obj.data ? parseMonster(obj.data, "wallet") : null;
        if (parsed) setMinted(parsed);
      }
      walletMonsters.refetch();
    } finally {
      setPending(false);
    }
  };

  return (
    <PageShell
      title="Mint A Martian"
      subtitle="Mint directly on Sui mainnet. Forms evolve over time, and traits update on-chain via sync_stage."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-300">Live Animated Preview</div>
            {minted && <StageBadge stage={minted.stage} />}
          </div>
          <div className="overflow-hidden rounded-2xl border border-borderSoft bg-black/20">
            <img
              key={previewTraits.seed}
              src={previewUrl}
              alt="Animated Martian preview"
              className="aspect-square w-full object-cover"
              loading="eager"
            />
          </div>
          <p className="text-xs text-gray-400">Animated preview is rendered from the current seed, form, and battle traits.</p>
        </div>

        <div className="glass-card space-y-5 p-5">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-400">Game Config</div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Mint Price</span>
              <span className="text-xl font-bold text-cyan">{toSui(treasury.data?.mint_price_mist)} SUI</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Status</span>
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${treasury.data?.mint_enabled ? "border-green-400/40 bg-green-500/15 text-green-300" : "border-red-400/40 bg-red-500/15 text-red-300"}`}>
                {treasury.data?.mint_enabled ? "Mint Enabled" : "Paused"}
              </span>
            </div>
          </div>

          {!account && (
            <div className="rounded-xl border border-purple/40 bg-purple/15 p-3 text-sm text-purple-100">
              Connect wallet to mint your first Martian.
            </div>
          )}

          <button
            className="btn-primary w-full"
            disabled={!account || !treasury.data?.mint_enabled || pending || treasury.isLoading}
            onClick={onMint}
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Minting...
              </span>
            ) : (
              `Mint for ${toSui(treasury.data?.mint_price_mist)} SUI`
            )}
          </button>

          {minted && (
            <div className="rounded-xl border border-cyan/40 bg-cyan/10 p-3 text-sm text-cyan-100">
              Mint success: <strong>{minted.name}</strong> ({minted.objectId})
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
