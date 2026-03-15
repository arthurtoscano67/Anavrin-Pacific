import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

import { PageShell } from "../components/PageShell";
import { Spinner } from "../components/Spinner";
import { useAnavrinData } from "../hooks/useAnavrinData";
import { useArenaMatches } from "../hooks/useArenaMatches";
import { useTxExecutor } from "../hooks/useTxExecutor";
import { MODULE, PACKAGE_ID, TREASURY_ID } from "../lib/constants";
import { short, statusLabel, toMist, toSui } from "../lib/format";
import type { ArenaMatch } from "../lib/types";

function isActiveMatch(match: ArenaMatch): boolean {
  return match.status === 0 || match.status === 1;
}

export function AdminPage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { treasury, adminCapId } = useAnavrinData();
  const arenaMatches = useArenaMatches(account?.address);
  const { execute } = useTxExecutor();

  const [priceInput, setPriceInput] = useState("0");
  const [enabled, setEnabled] = useState(false);
  const [withdrawTo, setWithdrawTo] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ArenaMatch | null>(null);

  useEffect(() => {
    if (treasury.data) {
      setPriceInput(toSui(treasury.data.mint_price_mist));
      setEnabled(Boolean(treasury.data.mint_enabled));
    }
  }, [treasury.data]);

  useEffect(() => {
    if (account?.address) setWithdrawTo(account.address);
  }, [account?.address]);

  useEffect(() => {
    if (!account?.address || adminCapId.isLoading) return;
    if (!adminCapId.data) {
      navigate("/", { replace: true });
    }
  }, [account?.address, adminCapId.data, adminCapId.isLoading, navigate]);

  const capId = adminCapId.data;
  const allMatches = arenaMatches.matches;
  const activeMatches = useMemo(
    () => allMatches.filter((match) => isActiveMatch(match)),
    [allMatches]
  );

  const onSetPrice = async () => {
    if (!capId) return;
    setPending("price");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::set_mint_price`,
        arguments: [tx.object(TREASURY_ID), tx.object(capId), tx.pure.u64(toMist(priceInput))],
      });
      await execute(tx, "Mint price updated");
      await treasury.refetch();
    } finally {
      setPending(null);
    }
  };

  const onToggleEnabled = async () => {
    if (!capId) return;
    const next = !enabled;
    setPending("enabled");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::set_mint_enabled`,
        arguments: [tx.object(TREASURY_ID), tx.object(capId), tx.pure.bool(next)],
      });
      await execute(tx, `Mint ${next ? "enabled" : "paused"}`);
      setEnabled(next);
      await treasury.refetch();
    } finally {
      setPending(null);
    }
  };

  const onWithdrawFees = async () => {
    if (!capId || !withdrawTo) return;
    setPending("withdraw");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::withdraw_fees`,
        arguments: [tx.object(TREASURY_ID), tx.object(capId), tx.pure.address(withdrawTo)],
      });
      await execute(tx, "Game fees withdrawn");
      await treasury.refetch();
    } finally {
      setPending(null);
    }
  };

  const onConfirmCancel = async () => {
    if (!capId || !cancelTarget) return;
    setPending(`cancel:${cancelTarget.objectId}`);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::admin_cancel`,
        arguments: [tx.object(cancelTarget.objectId), tx.object(capId)],
      });
      await execute(tx, "Match cancelled and refunded.");
      setCancelTarget(null);
      await Promise.all([arenaMatches.refetch(), treasury.refetch()]);
    } finally {
      setPending(null);
    }
  };

  if (!account) {
    return (
      <PageShell title="Admin" subtitle="Connect the AdminCap wallet to access battle and treasury controls.">
        <div className="glass-card p-4 text-sm text-gray-300">Connect wallet to access admin controls.</div>
      </PageShell>
    );
  }

  if (adminCapId.isLoading) {
    return (
      <PageShell title="Admin Dashboard" subtitle="Checking AdminCap ownership and loading live Martian match state.">
        <div className="glass-card flex items-center gap-3 p-4 text-sm text-gray-300">
          <Spinner />
          Checking AdminCap ownership...
        </div>
      </PageShell>
    );
  }

  if (!capId) {
    return null;
  }

  return (
    <PageShell
      title="Admin Dashboard"
      subtitle="Live mint controls plus emergency cancellation for stuck Martian battles."
    >
      <div className="glass-card flex flex-col gap-3 rounded-[24px] border border-lime-300/20 bg-lime-400/10 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-lime-100/80">Items Console</div>
          <div className="mt-1 text-sm text-lime-50">Open the secure item-definition dashboard for the `items` package.</div>
        </div>
        <Link to="/admin/items" className="btn-primary border-lime-300/35 bg-lime-400/85 text-slate-950 hover:bg-lime-300">
          Open Item Creator
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card space-y-4 p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Active Battles</h2>
            <span className="rounded-full border border-cyan/35 bg-cyan/10 px-3 py-1 text-xs font-semibold text-cyan">
              {activeMatches.length} active
            </span>
          </div>

          {arenaMatches.isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-300">
              <Spinner />
              Loading MartianMatch objects from chain...
            </div>
          ) : activeMatches.length === 0 ? (
            <div className="rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-300">
              No WAITING or LOCKED battles right now.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {activeMatches.map((match) => (
                <article
                  key={match.objectId}
                  className={`rounded-[24px] border p-4 ${
                    match.status === 1
                      ? "border-legendGold/40 bg-legendGold/10"
                      : "border-cyan/35 bg-cyan/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-gray-400">Battle</div>
                      <div className="mt-1 text-sm font-bold text-white">{short(match.objectId)}</div>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white">
                      {statusLabel(match.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-gray-200">
                    <div className="flex items-center justify-between gap-2">
                      <span>{short(match.player_a)}</span>
                      <span>{match.monster_a_data?.name ?? "No monster"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>{short(match.player_b)}</span>
                      <span>{match.monster_b_data?.name ?? "No monster"}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-300">
                    <span>Stake {toSui(Number(match.stake_a) + Number(match.stake_b))} SUI</span>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => setCancelTarget(match)}
                      disabled={pending !== null}
                    >
                      Admin Cancel
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card space-y-4 p-4">
          <h2 className="text-lg font-bold">Mint + Game Config</h2>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-borderSoft bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.22em] text-gray-400">Mint Status</div>
              <div className={`mt-2 text-lg font-bold ${enabled ? "text-green-300" : "text-red-300"}`}>
                {enabled ? "Enabled" : "Paused"}
              </div>
            </div>
            <div className="rounded-2xl border border-borderSoft bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.22em] text-gray-400">Game Fees</div>
              <div className="mt-2 text-lg font-bold text-cyan">{toSui(treasury.data?.fees)} SUI</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400">Set Mint Price (SUI)</label>
            <input className="input" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-primary" onClick={onSetPrice} disabled={pending !== null}>
              {pending === "price" ? <span className="inline-flex items-center gap-2"><Spinner /> Updating...</span> : "Set Price"}
            </button>
            <button className="btn-secondary" onClick={onToggleEnabled} disabled={pending !== null}>
              {pending === "enabled" ? <span className="inline-flex items-center gap-2"><Spinner /> Saving...</span> : enabled ? "Pause Mint" : "Enable Mint"}
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400">Withdraw Destination</label>
            <input className="input" value={withdrawTo} onChange={(event) => setWithdrawTo(event.target.value)} placeholder="0x..." />
          </div>

          <button className="btn-primary w-full" onClick={onWithdrawFees} disabled={!withdrawTo || pending !== null}>
            {pending === "withdraw" ? <span className="inline-flex items-center gap-2"><Spinner /> Withdrawing...</span> : "Withdraw Fees"}
          </button>
        </div>
      </div>

      <div className="glass-card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Cancel Battle</h2>
            <p className="text-sm text-gray-400">All MartianMatch objects from chain. WAITING and LOCKED matches are highlighted for admin review.</p>
          </div>
          <button className="btn-ghost text-xs" onClick={() => arenaMatches.refetch()} disabled={arenaMatches.isFetching}>
            {arenaMatches.isFetching ? "Refreshing..." : "Refresh Matches"}
          </button>
        </div>

        <div className="space-y-3 md:hidden">
          {allMatches.map((match) => (
            <article
              key={match.objectId}
              className={`rounded-[24px] border p-4 ${
                isActiveMatch(match) ? "border-purple/35 bg-purple/10" : "border-borderSoft bg-black/20"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-white">{short(match.objectId)}</div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold">
                  {statusLabel(match.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-gray-300">
                <div className="flex items-center justify-between gap-2"><span>Player A</span><span>{short(match.player_a)}</span></div>
                <div className="flex items-center justify-between gap-2"><span>Player B</span><span>{short(match.player_b)}</span></div>
                <div className="flex items-center justify-between gap-2"><span>Monster A</span><span>{match.monster_a_data?.name ?? "Empty"}</span></div>
                <div className="flex items-center justify-between gap-2"><span>Monster B</span><span>{match.monster_b_data?.name ?? "Empty"}</span></div>
                <div className="flex items-center justify-between gap-2"><span>Stake A</span><span>{toSui(match.stake_a)} SUI</span></div>
                <div className="flex items-center justify-between gap-2"><span>Stake B</span><span>{toSui(match.stake_b)} SUI</span></div>
              </div>

              <button
                className="btn-primary mt-4 w-full"
                onClick={() => setCancelTarget(match)}
                disabled={pending !== null || !isActiveMatch(match)}
              >
                {isActiveMatch(match) ? "Admin Cancel" : "Resolved"}
              </button>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.22em] text-gray-400">
                <th className="px-3 py-3">Match ID</th>
                <th className="px-3 py-3">Player A</th>
                <th className="px-3 py-3">Player B</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Monster A</th>
                <th className="px-3 py-3">Monster B</th>
                <th className="px-3 py-3">Stake A</th>
                <th className="px-3 py-3">Stake B</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {allMatches.map((match) => (
                <tr
                  key={match.objectId}
                  className={`border-t border-white/6 ${
                    isActiveMatch(match) ? "bg-purple/10" : "bg-transparent"
                  }`}
                >
                  <td className="px-3 py-3 font-semibold text-white">{short(match.objectId)}</td>
                  <td className="px-3 py-3 text-gray-300">{short(match.player_a)}</td>
                  <td className="px-3 py-3 text-gray-300">{short(match.player_b)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      match.status === 1
                        ? "border border-legendGold/35 bg-legendGold/10 text-legendGold"
                        : match.status === 0
                          ? "border border-cyan/35 bg-cyan/10 text-cyan"
                          : "border border-white/10 bg-white/5 text-gray-300"
                    }`}>
                      {statusLabel(match.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-300">{match.monster_a_data?.name ?? "Empty"}</td>
                  <td className="px-3 py-3 text-gray-300">{match.monster_b_data?.name ?? "Empty"}</td>
                  <td className="px-3 py-3 text-gray-300">{toSui(match.stake_a)} SUI</td>
                  <td className="px-3 py-3 text-gray-300">{toSui(match.stake_b)} SUI</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      className="btn-primary text-xs"
                      onClick={() => setCancelTarget(match)}
                      disabled={pending !== null || !isActiveMatch(match)}
                    >
                      {isActiveMatch(match) ? "Admin Cancel" : "Resolved"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="glass-card w-full max-w-md space-y-4 p-5">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-red-300">Confirm</div>
              <h3 className="mt-2 text-xl font-bold text-white">Cancel this match and return monsters?</h3>
              <p className="mt-2 text-sm text-gray-300">
                {short(cancelTarget.player_a)} vs {short(cancelTarget.player_b)} will be cancelled. Deposited monsters and stakes will be refunded to their owners.
              </p>
            </div>

            <div className="rounded-2xl border border-borderSoft bg-black/20 p-4 text-sm text-gray-300">
              <div className="flex items-center justify-between gap-2"><span>Match</span><span>{short(cancelTarget.objectId)}</span></div>
              <div className="mt-2 flex items-center justify-between gap-2"><span>Status</span><span>{statusLabel(cancelTarget.status)}</span></div>
            </div>

            <div className="flex gap-3">
              <button className="btn-ghost flex-1" onClick={() => setCancelTarget(null)} disabled={pending !== null}>
                Keep Match
              </button>
              <button className="btn-primary flex-1" onClick={onConfirmCancel} disabled={pending !== null}>
                {pending === `cancel:${cancelTarget.objectId}`
                  ? <span className="inline-flex items-center gap-2"><Spinner /> Cancelling...</span>
                  : "Admin Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
