import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { LoadingGrid } from '../components/LoadingGrid';
import { MonsterImage } from '../components/MonsterImage';
import { PageShell } from '../components/PageShell';
import { StageBadge } from '../components/StageBadge';
import { useAnavrinData } from '../hooks/useAnavrinData';
import { useArenaMatches } from '../hooks/useArenaMatches';
import { useTxExecutor } from '../hooks/useTxExecutor';
import { fetchBattleList } from '../arena/network/api';
import { useLobbyPresence } from '../arena/network/useLobbyPresence';
import type { BattleListKind, BattleSummary, LobbyInvite, LobbyPlayer } from '../arena/network/types';
import { ARENA_MATCH_TYPE, CLOCK_ID, MODULE, NORMAL_BATTLE_MODE, PACKAGE_ID, TREASURY_ID } from '../lib/constants';
import { short, toSui } from '../lib/format';
import { extractCreatedArenaMatchId } from '../lib/sui';

const PAGE_SIZE = 4;
const STAKE_OPTIONS = ['0', '0.1', '0.25', '0.5', '1'];

type BattleSectionProps = {
  title: string;
  kind: BattleListKind;
  page: number;
  onPageChange: (page: number) => void;
  onWatch: (matchId: string) => void;
};

function BattleSummarySection({ title, kind, page, onPageChange, onWatch }: BattleSectionProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['battleList', kind, page],
    queryFn: () => fetchBattleList(kind, page, PAGE_SIZE),
    staleTime: 4_000,
    refetchInterval: 5_000,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? PAGE_SIZE)));

  return (
    <section className="glass-card space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">{title}</div>
          <div className="mt-1 text-xl font-black text-white">{kind === 'featured' ? 'Crowd favorites' : kind === 'highest' ? 'Biggest stakes' : 'Fresh arenas'}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-200">
          Page {page} / {totalPages}
        </div>
      </div>

      {isLoading ? (
        <LoadingGrid count={2} />
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">No battles yet.</div>
      ) : (
        <div className="grid gap-3">
          {data.items.map((battle) => (
            <article key={`${kind}-${battle.matchId}`} className="rounded-[24px] border border-borderSoft bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-lg font-black text-white">{short(battle.playerA)} vs {short(battle.playerB)}</div>
                <div className="rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-cyan-50">
                  {battle.viewerCount} watching
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Stake {toSui(battle.wagerAmount)} SUI</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{battle.status}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Battle {short(battle.matchId)}</span>
              </div>
              <button
                className="mt-4 min-h-[58px] w-full rounded-[18px] bg-gradient-to-r from-amber-300 to-yellow-400 text-base font-black text-slate-950"
                onClick={() => onWatch(battle.matchId)}
              >
                WATCH
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          className="btn-ghost min-h-[48px] px-4 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <button
          className="btn-ghost min-h-[48px] px-4 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function PlayerCard({
  player,
  canInvite,
  onInvite,
}: {
  player: LobbyPlayer;
  canInvite: boolean;
  onInvite: (address: string) => void;
}) {
  return (
    <article className="flex items-center justify-between gap-3 rounded-[24px] border border-borderSoft bg-black/20 px-4 py-4">
      <div className="min-w-0">
        <div className="text-xl font-black text-white">🟢 {short(player.address)}</div>
        <div className="mt-1 truncate text-sm text-gray-300">{player.monsterName} • Level {player.level}</div>
      </div>
      <button
        className="min-h-[56px] shrink-0 rounded-[18px] bg-gradient-to-r from-cyan-400 to-blue-500 px-5 text-base font-black text-slate-950 disabled:opacity-50"
        onClick={() => onInvite(player.address)}
        disabled={!canInvite}
      >
        INVITE
      </button>
    </article>
  );
}

export function LobbyPage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { walletMonsters } = useAnavrinData();
  const arenaMatches = useArenaMatches(account?.address);
  const { executeAndFetchBlock } = useTxExecutor();
  const [selectedMonsterId, setSelectedMonsterId] = useState('');
  const [selectedStake, setSelectedStake] = useState('0');
  const [pending, setPending] = useState<string | null>(null);
  const [featuredPage, setFeaturedPage] = useState(1);
  const [highestPage, setHighestPage] = useState(1);
  const [newestPage, setNewestPage] = useState(1);
  const restoreOnceRef = useRef(false);

  const monsters = walletMonsters.data ?? [];
  const selectedMonster = useMemo(
    () => monsters.find((monster) => monster.objectId === selectedMonsterId) ?? monsters[0] ?? null,
    [monsters, selectedMonsterId]
  );

  useEffect(() => {
    if (!selectedMonsterId && monsters[0]) {
      setSelectedMonsterId(monsters[0].objectId);
    }
  }, [monsters, selectedMonsterId]);

  const lobby = useLobbyPresence({
    enabled: Boolean(account?.address),
    address: account?.address,
    monsterName: selectedMonster?.name ?? 'Martian',
    level: (selectedMonster?.stage ?? 0) + 1,
  });

  useEffect(() => {
    if (!account?.address) return;
    if (restoreOnceRef.current) return;
    if (arenaMatches.isLoading || arenaMatches.isFetching) return;

    restoreOnceRef.current = true;
    const restored = arenaMatches.restoredOwnedMatch;
    if (!restored || (restored.status !== 0 && restored.status !== 1)) return;

    navigate(`/battle/${restored.objectId}`, { replace: true });
  }, [account?.address, arenaMatches.isFetching, arenaMatches.isLoading, arenaMatches.restoredOwnedMatch, navigate]);

  useEffect(() => {
    if (!lobby.startedMatch?.matchId) return;
    navigate(`/battle/${lobby.startedMatch.matchId}`);
    lobby.clearStartedMatch();
  }, [lobby, navigate]);

  const inviteCandidates = useMemo(
    () => lobby.players.filter((player) => player.address !== account?.address),
    [account?.address, lobby.players]
  );

  const handleInvite = (address: string) => {
    if (!selectedMonster) {
      toast.error('Pick a Martian first');
      return;
    }
    lobby.invitePlayer(address, '');
    toast.success(`Invite sent to ${short(address)}.`);
  };

  const handleAcceptInvite = async (invite: LobbyInvite) => {
    if (!account?.address) return;
    setPending(`accept:${invite.id}`);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::create_match`,
        arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), tx.pure.address(invite.from), tx.pure.u8(NORMAL_BATTLE_MODE)],
      });

      const { block } = await executeAndFetchBlock(tx, 'Battle room created');
      const matchId = extractCreatedArenaMatchId(block);
      if (!matchId) {
        throw new Error('Could not find the new MartianMatch object');
      }

      lobby.acceptInvite(invite);
      lobby.announceMatchStarted({
        from: account.address,
        to: invite.from,
        matchId,
        wagerAmount: '0',
      });
      navigate(`/battle/${matchId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept invite');
    } finally {
      setPending(null);
    }
  };

  if (!account) {
    return (
      <PageShell title="Lobby" subtitle="Connect your wallet to see trainers online, invite them, or queue for a fast match.">
        <div className="glass-card p-5 text-sm text-gray-300">Connect wallet to enter the lobby.</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Lobby" subtitle="Online trainers, quick match queue, and live battles all in one place.">
      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan/80">Martians</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">Battle Lobby</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
              Invite a trainer directly or jump into quick match. If you already have an active battle, the site sends you back there automatically.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
            <div className="rounded-[22px] border border-borderSoft bg-black/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Online</div>
              <div className="mt-2 text-3xl font-black text-white">{lobby.players.length}</div>
            </div>
            <div className="rounded-[22px] border border-borderSoft bg-black/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Queue</div>
              <div className="mt-2 text-3xl font-black text-white">{lobby.queueCount}</div>
            </div>
          </div>
        </div>

        {lobby.invites.filter((invite) => invite.to === account.address).length > 0 ? (
          <div className="grid gap-3">
            {lobby.invites
              .filter((invite) => invite.to === account.address)
              .map((invite) => (
                <article key={invite.id} className="rounded-[26px] border border-purple/30 bg-gradient-to-br from-purple/20 to-pink-500/10 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-100">Invite waiting</div>
                  <div className="mt-2 text-2xl font-black text-white">{short(invite.from)} wants to battle</div>
                  <div className="mt-1 text-sm text-gray-300">{invite.monsterName} • Level {invite.level}</div>
                  <button
                    className="mt-4 min-h-[72px] w-full rounded-[24px] bg-gradient-to-r from-green-400 to-emerald-500 text-lg font-black text-slate-950 shadow-[0_18px_40px_rgba(34,197,94,0.25)] disabled:opacity-50"
                    onClick={() => void handleAcceptInvite(invite)}
                    disabled={pending !== null}
                  >
                    {pending === `accept:${invite.id}` ? 'Opening battle...' : 'ACCEPT'}
                  </button>
                </article>
              ))}
          </div>
        ) : null}
      </section>

      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Quick Match</div>
            <div className="mt-1 text-2xl font-black text-white">Pick your queue Martian</div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200">
            Queue heartbeat updates every 5s
          </div>
        </div>

        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
          {monsters.map((monster) => {
            const selected = monster.objectId === selectedMonsterId;
            return (
              <button
                key={monster.objectId}
                className={`w-[180px] shrink-0 rounded-[26px] border p-3 text-left transition ${selected ? 'border-purple/70 bg-purple/15 shadow-[0_18px_40px_rgba(139,92,246,0.18)]' : 'border-borderSoft bg-black/20'}`}
                onClick={() => setSelectedMonsterId(monster.objectId)}
              >
                <MonsterImage objectId={monster.objectId} monster={monster} className="aspect-square" />
                <div className="mt-3 text-lg font-black text-white">{monster.name}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <StageBadge stage={monster.stage} />
                  <span className="text-xs text-gray-400">{short(monster.objectId)}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {STAKE_OPTIONS.map((option) => (
            <button
              key={option}
              className={`min-h-[58px] rounded-[18px] border text-sm font-black ${selectedStake === option ? 'border-cyan/70 bg-cyan/15 text-white' : 'border-borderSoft bg-black/20 text-gray-300'}`}
              onClick={() => setSelectedStake(option)}
            >
              {option === '0' ? 'No Wager' : `${option} SUI`}
            </button>
          ))}
        </div>

        <button
          className="min-h-[68px] w-full rounded-[24px] bg-gradient-to-r from-fuchsia-400 via-purple to-cyan px-5 text-lg font-black text-white disabled:opacity-50"
          disabled={!selectedMonster}
          onClick={() => {
            const next = new URLSearchParams();
            if (selectedMonster) next.set('monster', selectedMonster.objectId);
            next.set('wager', selectedStake);
            navigate(`/queue?${next.toString()}`);
          }}
        >
          JOIN QUICK MATCH
        </button>
      </section>

      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Online Players</div>
            <div className="mt-1 text-2xl font-black text-white">Direct invites</div>
          </div>
          <div className={`rounded-full border px-4 py-2 text-sm font-black ${lobby.isConnected ? 'border-green-300/30 bg-green-500/10 text-green-100' : 'border-yellow-300/30 bg-yellow-500/10 text-yellow-100'}`}>
            {lobby.isConnected ? 'Live' : 'Connecting'}
          </div>
        </div>

        {inviteCandidates.length === 0 ? (
          <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">Only you are online right now.</div>
        ) : (
          <div className="grid gap-3">
            {inviteCandidates.map((player) => (
              <PlayerCard key={player.address} player={player} canInvite={Boolean(selectedMonster) && pending === null} onInvite={handleInvite} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <BattleSummarySection title="Featured Live Battles" kind="featured" page={featuredPage} onPageChange={setFeaturedPage} onWatch={(matchId) => navigate(`/spectate/${matchId}`)} />
        <BattleSummarySection title="Highest Stake Battles" kind="highest" page={highestPage} onPageChange={setHighestPage} onWatch={(matchId) => navigate(`/spectate/${matchId}`)} />
        <BattleSummarySection title="Newest Battles" kind="newest" page={newestPage} onPageChange={setNewestPage} onWatch={(matchId) => navigate(`/spectate/${matchId}`)} />
      </div>
    </PageShell>
  );
}
