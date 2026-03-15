import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { MonsterImage } from "../components/MonsterImage";
import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import { StageBadge } from "../components/StageBadge";
import { StatBar } from "../components/StatBar";
import { CLOCK_ID, MODULE, MONSTER_TYPE, PACKAGE_ID, TREASURY_ID } from "../lib/constants";
import { short } from "../lib/format";
import type { Monster } from "../lib/types";
import { parseMonster } from "../lib/sui";
import { useAnavrinData } from "../hooks/useAnavrinData";
import { useTxExecutor } from "../hooks/useTxExecutor";

const BREEDING_STEPS = [
  "Select two Enlightened Martians you own.",
  "Confirm the breeding action on-chain.",
  "A new Martian is born with combined traits.",
  "The child begins as a Spirit and evolves over time.",
];

const BREEDING_RULES = [
  "Only Enlightened Martians can breed.",
  "Martians cannot breed with themselves.",
  "Each Martian has a breeding cooldown.",
  "The child inherits a mix of stats and experience.",
];

export function BreedPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { adults, walletMonsters } = useAnavrinData();
  const { executeAndFetchBlock } = useTxExecutor();

  const [parentA, setParentA] = useState("");
  const [parentB, setParentB] = useState("");
  const [pending, setPending] = useState(false);
  const [child, setChild] = useState<Monster | null>(null);

  useEffect(() => {
    if (parentA && parentA === parentB) {
      setParentB("");
    }
  }, [parentA, parentB]);

  const parentAMonster = useMemo(
    () => adults.find((m) => m.objectId === parentA) ?? null,
    [adults, parentA]
  );
  const parentBMonster = useMemo(
    () => adults.find((m) => m.objectId === parentB) ?? null,
    [adults, parentB]
  );

  const preview = useMemo(() => {
    if (!parentAMonster || !parentBMonster) return null;
    return {
      attack: Math.floor((parentAMonster.attack + parentBMonster.attack) / 2),
      defense: Math.floor((parentAMonster.defense + parentBMonster.defense) / 2),
      speed: Math.floor((parentAMonster.speed + parentBMonster.speed) / 2),
    };
  }, [parentAMonster, parentBMonster]);

  const canBreed = Boolean(account && parentA && parentB && parentA !== parentB && !pending);
  const ownedCount = walletMonsters.data?.length ?? 0;

  const onBreed = async () => {
    if (!parentA || !parentB || parentA === parentB) return;

    setPending(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::breed`,
        arguments: [tx.object(parentA), tx.object(parentB), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });

      const { block } = await executeAndFetchBlock(tx, "Breeding complete");
      const createdMonster = block.objectChanges?.find(
        (c) => c.type === "created" && c.objectType === MONSTER_TYPE
      );

      if (createdMonster && "objectId" in createdMonster) {
        const obj = await client.getObject({
          id: createdMonster.objectId,
          options: { showContent: true, showDisplay: true, showType: true },
        });
        const parsed = obj.data ? parseMonster(obj.data, "wallet") : null;
        if (parsed) setChild(parsed);
      }

      await walletMonsters.refetch();
    } finally {
      setPending(false);
    }
  };

  return (
    <PageShell
      title="Breeding"
      subtitle="Pair two Enlightened Martians to create a new Spirit with blended stats, inherited experience, and permanent on-chain lineage."
    >
      <section className="relative overflow-hidden rounded-[28px] border border-purple/30 bg-gradient-to-br from-purple/20 via-surface to-cyan/10 p-5 shadow-card md:p-6">
        <div className="absolute -left-20 top-0 h-48 w-48 rounded-full bg-purple/20 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-cyan/20 blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan">
              On-chain lineage
            </div>
            <div className="space-y-3">
              <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white md:text-4xl">
                Two Enlightened Martians can combine their traits to create a brand-new Martian.
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-gray-200 md:text-base">
                Breeding allows players to grow stronger bloodlines by mixing the power, speed, and
                defense of their best creatures. The offspring inherits a blend of its parents'
                stats and carries a portion of their experience, giving it a head start in its
                journey.
              </p>
              <p className="max-w-3xl text-sm leading-7 text-gray-300 md:text-base">
                Each Martian must wait for a breeding cooldown before it can breed again, so
                choosing the right pairing matters. Every new Martian is unique, with its own name,
                stats, and lineage recorded permanently on the blockchain.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Eligible Parents</div>
                <div className="mt-2 text-2xl font-bold text-white">{account ? adults.length : "--"}</div>
                <div className="mt-1 text-sm text-gray-400">Enlightened Martians in wallet</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Child Form</div>
                <div className="mt-2">
                  <StageBadge stage={0} />
                </div>
                <div className="mt-2 text-sm text-gray-400">Every child starts life as a Spirit</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Recorded Forever</div>
                <div className="mt-2 text-2xl font-bold text-white">2 Parents</div>
                <div className="mt-1 text-sm text-gray-400">Lineage is written permanently on-chain</div>
              </div>
            </div>
          </div>

          <div className="glass-card space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Breeding Console</div>
                <h3 className="mt-1 text-xl font-bold text-white">Select your pair</h3>
              </div>
              {account && (
                <div className="rounded-full border border-purple/40 bg-purple/10 px-3 py-1 text-xs font-semibold text-purple-100">
                  {ownedCount} owned
                </div>
              )}
            </div>

            {!account && (
              <div className="rounded-2xl border border-purple/40 bg-purple/15 p-4 text-sm text-purple-100">
                Connect wallet to choose two Enlightened Martians and confirm a breeding
                transaction.
              </div>
            )}

            {account && (
              <>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-gray-400">Parent A</label>
                  <select className="input" value={parentA} onChange={(e) => setParentA(e.target.value)}>
                    <option value="">Choose Enlightened Martian</option>
                    {adults.map((m) => (
                      <option value={m.objectId} key={m.objectId}>
                        {m.name} ({short(m.objectId)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wide text-gray-400">Parent B</label>
                  <select className="input" value={parentB} onChange={(e) => setParentB(e.target.value)}>
                    <option value="">Choose Enlightened Martian</option>
                    {adults
                      .filter((m) => m.objectId !== parentA)
                      .map((m) => (
                        <option value={m.objectId} key={m.objectId}>
                          {m.name} ({short(m.objectId)})
                        </option>
                      ))}
                  </select>
                </div>

                <button className="btn-primary w-full" onClick={onBreed} disabled={!canBreed}>
                  {pending ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Breeding...
                    </span>
                  ) : (
                    "Confirm Breeding"
                  )}
                </button>

                <div className="rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-300">
                  Cooldown eligibility, lineage recording, and the child&apos;s final experience
                  carryover are enforced by the on-chain contract when the transaction executes.
                </div>

                {adults.length < 2 && (
                  <p className="text-xs text-gray-400">
                    You need at least two Enlightened Martians in your wallet before you can breed.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <article className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">How It Works</h2>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400">4 steps</div>
          </div>
          <div className="space-y-3">
            {BREEDING_STEPS.map((step, index) => (
              <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/10 p-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan/40 bg-cyan/10 text-sm font-bold text-cyan">
                  {index + 1}
                </div>
                <p className="pt-1 text-sm leading-6 text-gray-200">{step}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Important Rules</h2>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-400">On-chain checks</div>
          </div>
          <div className="space-y-3">
            {BREEDING_RULES.map((rule) => (
              <div key={rule} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/10 p-3">
                <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-purple" />
                <p className="text-sm leading-6 text-gray-200">{rule}</p>
              </div>
            ))}
          </div>
        </article>

        <div className="grid gap-4">
          <article className="glass-card space-y-3 p-5">
            <h2 className="text-lg font-bold">Lineage</h2>
            <p className="text-sm leading-7 text-gray-300">
              Every Martian records its parents on-chain, creating a permanent family tree of
              Martian bloodlines.
            </p>
            <p className="text-sm leading-7 text-gray-300">
              Some players may choose to specialize in breeding powerful or rare Martians.
            </p>
          </article>

          <article className="glass-card space-y-3 p-5">
            <h2 className="text-lg font-bold">Strategy</h2>
            <p className="text-sm leading-7 text-gray-300">
              Breeding strong Martians together can produce stronger offspring, but the results are
              never perfectly predictable.
            </p>
            <p className="text-sm leading-7 text-gray-300">
              Experiment with different pairings to discover powerful combinations.
            </p>
          </article>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.95fr]">
        <div className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Parent A</h3>
            {parentAMonster && <StageBadge stage={parentAMonster.stage} />}
          </div>
          {parentAMonster ? (
            <>
              <MonsterImage objectId={parentAMonster.objectId} monster={parentAMonster} className="aspect-square" />
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-white">{parentAMonster.name}</div>
                  <div className="text-xs text-gray-400">{short(parentAMonster.objectId)}</div>
                </div>
                <div className="space-y-3">
                  <StatBar label="ATK" value={parentAMonster.attack} color="bg-red-500" />
                  <StatBar label="DEF" value={parentAMonster.defense} color="bg-blue-500" />
                  <StatBar label="SPD" value={parentAMonster.speed} color="bg-green-500" />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">
              Select the first Enlightened Martian to start building a bloodline.
            </div>
          )}
        </div>

        <div className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Parent B</h3>
            {parentBMonster && <StageBadge stage={parentBMonster.stage} />}
          </div>
          {parentBMonster ? (
            <>
              <MonsterImage objectId={parentBMonster.objectId} monster={parentBMonster} className="aspect-square" />
              <div className="space-y-3">
                <div>
                  <div className="font-semibold text-white">{parentBMonster.name}</div>
                  <div className="text-xs text-gray-400">{short(parentBMonster.objectId)}</div>
                </div>
                <div className="space-y-3">
                  <StatBar label="ATK" value={parentBMonster.attack} color="bg-red-500" />
                  <StatBar label="DEF" value={parentBMonster.defense} color="bg-blue-500" />
                  <StatBar label="SPD" value={parentBMonster.speed} color="bg-green-500" />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">
              Select a second Enlightened Martian. A Martian cannot breed with itself.
            </div>
          )}
        </div>

        <div className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Offspring Preview</h3>
            <StageBadge stage={0} />
          </div>
          {!preview && (
            <div className="rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">
              Select two parents to preview the child&apos;s blended combat profile.
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-cyan/30 bg-cyan/10 p-4 text-sm leading-6 text-cyan-50">
                The child begins life as a Spirit. Previewed stats show the blended attack,
                defense, and speed inherited from the selected parents.
              </div>
              <div className="space-y-3">
                <StatBar label="ATK" value={preview.attack} color="bg-red-500" />
                <StatBar label="DEF" value={preview.defense} color="bg-blue-500" />
                <StatBar label="SPD" value={preview.speed} color="bg-green-500" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-gray-300">
                Experience carryover and final child identity are resolved on-chain when the breed
                transaction is confirmed.
              </div>
            </div>
          )}
        </div>
      </div>

      {child && (
        <div className="glass-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-cyan">Child Martian Minted</h3>
            <StageBadge stage={child.stage} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <MonsterImage objectId={child.objectId} monster={child} className="aspect-square max-w-[220px]" />
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Name</div>
                  <div className="mt-1 font-semibold text-white">{child.name}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Child ID</div>
                  <div className="mt-1 break-all font-mono text-xs text-gray-200">{child.objectId}</div>
                </div>
              </div>

              <div className="space-y-3">
                <StatBar label="ATK" value={child.attack} color="bg-red-500" />
                <StatBar label="DEF" value={child.defense} color="bg-blue-500" />
                <StatBar label="SPD" value={child.speed} color="bg-green-500" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Lineage</div>
                <div className="mt-2 space-y-1 font-mono text-xs text-gray-200">
                  <div>Parent 1: {child.parent1 ?? "-"}</div>
                  <div>Parent 2: {child.parent2 ?? "-"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
