"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { StatCard } from "@/components/stat-card";
import { WalletGate } from "@/components/wallet-gate";
import { formatAddress, timeAgo } from "@/lib/format";
import { useArenaRealtime } from "@/hooks/use-arena-realtime";
import { useContractActions } from "@/hooks/use-contract-actions";
import { useMonsterPortfolio } from "@/hooks/use-monster-portfolio";

export default function ArenaPage() {
  const account = useCurrentAccount();
  const actions = useContractActions();
  const portfolio = useMonsterPortfolio(account?.address);
  const realtime = useArenaRealtime(account?.address);

  const [selectedMonsterId, setSelectedMonsterId] = useState("");
  const [createMatchOpponent, setCreateMatchOpponent] = useState("");
  const [matchIdInput, setMatchIdInput] = useState("");
  const [stakeSui, setStakeSui] = useState("0.1");
  const [spectatingMatchId, setSpectatingMatchId] = useState<string | null>(null);
  const [onchainMatchId, setOnchainMatchId] = useState("");

  useEffect(() => {
    if (!selectedMonsterId && portfolio.walletMonsters.length > 0) {
      setSelectedMonsterId(portfolio.walletMonsters[0].objectId);
    }
  }, [portfolio.walletMonsters, selectedMonsterId]);

  const onlinePlayers = useMemo(
    () => realtime.state.players.filter((player) => player.address !== account?.address),
    [account?.address, realtime.state.players]
  );

  const incomingInvites = useMemo(
    () =>
      realtime.state.invites.filter(
        (invite) => invite.to === account?.address && invite.status === "pending"
      ),
    [account?.address, realtime.state.invites]
  );

  const myMatches = useMemo(
    () =>
      realtime.state.matches.filter(
        (match) => match.playerA === account?.address || match.playerB === account?.address
      ),
    [account?.address, realtime.state.matches]
  );

  useEffect(() => {
    if (!account?.address || !spectatingMatchId) return;
    void realtime.updateMatch({
      id: spectatingMatchId,
      addSpectator: account.address,
      addNote: `${formatAddress(account.address)} started spectating.`,
    });
    return () => {
      void realtime.updateMatch({
        id: spectatingMatchId,
        removeSpectator: account.address,
        addNote: `${formatAddress(account.address)} stopped spectating.`,
      });
    };
  }, [account?.address, realtime, spectatingMatchId]);

  if (!account) {
    return (
      <WalletGate
        title="Connect wallet to enter arena"
        subtitle="Live online player list, battle invites, spectator mode, and on-chain battle actions are unlocked after wallet connect."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Online Players" value={realtime.state.players.length} tone="pulse" />
        <StatCard label="Incoming Invites" value={incomingInvites.length} />
        <StatCard label="Your Matches" value={myMatches.length} />
        <StatCard
          label="Realtime Link"
          value={realtime.connected ? "Connected" : "Reconnecting"}
          tone={realtime.connected ? "pulse" : "ember"}
        />
      </section>

      {realtime.error && (
        <div className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
          {realtime.error}
        </div>
      )}

      {actions.error && (
        <div className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 text-sm text-ember">
          {actions.error}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="panel space-y-4">
          <h2 className="text-2xl font-semibold">Live Players</h2>
          <div className="grid gap-2">
            {onlinePlayers.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-ink/50 p-3 text-sm text-mist">
                No players online right now.
              </div>
            )}

            {onlinePlayers.map((player) => (
              <div
                key={player.address}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink/50 p-3"
              >
                <div>
                  <div className="font-medium text-white">{player.alias}</div>
                  <div className="text-xs text-mist">
                    {formatAddress(player.address)} • seen {timeAgo(player.lastSeen)}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!selectedMonsterId}
                  onClick={() =>
                    void realtime.invite(account.address, player.address, selectedMonsterId)
                  }
                >
                  Invite to Battle
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h2 className="text-2xl font-semibold">Incoming Invites</h2>
          {incomingInvites.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-ink/50 p-3 text-sm text-mist">
              No pending invites.
            </div>
          )}
          {incomingInvites.map((invite) => (
            <div
              key={invite.id}
              className="rounded-lg border border-white/10 bg-ink/50 p-3 text-sm"
            >
              <div className="text-white">
                {formatAddress(invite.from)} challenged you
                {invite.monsterId ? ` with ${formatAddress(invite.monsterId)}` : ""}.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn btn-primary"
                  onClick={() => void realtime.respondInvite(invite.id, true)}
                >
                  Accept
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => void realtime.respondInvite(invite.id, false)}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-4">
        <h2 className="text-2xl font-semibold">On-chain Battle Controls</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="input"
            value={selectedMonsterId}
            onChange={(event) => setSelectedMonsterId(event.target.value)}
          >
            <option value="">Select your monster</option>
            {portfolio.walletMonsters.map((monster) => (
              <option key={monster.objectId} value={monster.objectId}>
                {monster.name} ({monster.objectId.slice(0, 8)}...)
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Opponent address"
            value={createMatchOpponent}
            onChange={(event) => setCreateMatchOpponent(event.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={!createMatchOpponent || actions.pending !== null}
            onClick={async () => {
              await actions.createMatch(createMatchOpponent);
              await realtime.refresh();
            }}
          >
            create_match
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="input"
            placeholder="ArenaMatch object id"
            value={matchIdInput}
            onChange={(event) => setMatchIdInput(event.target.value)}
          />
          <button
            className="btn btn-secondary"
            disabled={!matchIdInput || !selectedMonsterId || actions.pending !== null}
            onClick={async () => {
              await actions.depositMonster(matchIdInput, selectedMonsterId);
              await realtime.updateMatch({
                id: matchIdInput,
                monsterA: selectedMonsterId,
                addNote: `${formatAddress(account.address)} deposited monster.`,
              });
            }}
          >
            deposit_monster
          </button>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Stake SUI"
              value={stakeSui}
              onChange={(event) => setStakeSui(event.target.value)}
            />
            <button
              className="btn btn-secondary"
              disabled={!matchIdInput || !stakeSui || actions.pending !== null}
              onClick={async () => {
                await actions.depositStake(matchIdInput, stakeSui);
                await realtime.updateMatch({
                  id: matchIdInput,
                  addNote: `${formatAddress(account.address)} deposited ${stakeSui} SUI stake.`,
                });
              }}
            >
              Stake
            </button>
          </div>
          <button
            className="btn btn-danger"
            disabled={!matchIdInput || actions.pending !== null}
            onClick={async () => {
              await actions.startBattle(matchIdInput);
              await realtime.updateMatch({
                id: matchIdInput,
                status: "finished",
                addNote: "Battle started and finalized on-chain.",
              });
            }}
          >
            start_battle
          </button>
        </div>
      </section>

      <section className="panel space-y-4">
        <h2 className="text-2xl font-semibold">Matches & Spectator Mode</h2>
        {realtime.state.matches.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-ink/50 p-3 text-sm text-mist">
            No matches yet.
          </div>
        )}

        <div className="grid gap-3">
          {realtime.state.matches.map((match) => (
            <div
              key={match.id}
              className="rounded-lg border border-white/10 bg-ink/60 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">
                    {formatAddress(match.playerA)} vs {formatAddress(match.playerB)}
                  </div>
                  <div className="text-mist">
                    Match ID: {match.id} • status: {match.status}
                    {match.onchainMatchId ? ` • on-chain: ${formatAddress(match.onchainMatchId)}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={() =>
                      setSpectatingMatchId((current) =>
                        current === match.id ? null : match.id
                      )
                    }
                  >
                    {spectatingMatchId === match.id ? "Stop spectating" : "Spectate"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  className="input"
                  placeholder="Attach on-chain ArenaMatch id"
                  value={spectatingMatchId === match.id ? onchainMatchId : ""}
                  onChange={(event) => setOnchainMatchId(event.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={!onchainMatchId}
                  onClick={() =>
                    void realtime.updateMatch({
                      id: match.id,
                      onchainMatchId,
                      addNote: `On-chain match linked: ${onchainMatchId}`,
                    })
                  }
                >
                  Link Match
                </button>
              </div>

              {spectatingMatchId === match.id && (
                <div className="mt-3 rounded-lg border border-pulse/30 bg-pulse/10 p-3">
                  <div className="text-xs uppercase tracking-wider text-pulse">Spectator Feed</div>
                  <ul className="mt-2 space-y-1 text-xs text-mist">
                    {match.notes.map((note, index) => (
                      <li key={`${match.id}-${index}`}>• {note}</li>
                    ))}
                    {match.notes.length === 0 && <li>• Waiting for updates...</li>}
                  </ul>
                  <div className="mt-2 text-xs text-mist/80">
                    Spectators:{" "}
                    {match.spectators.length ? match.spectators.map(formatAddress).join(", ") : "none"}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
