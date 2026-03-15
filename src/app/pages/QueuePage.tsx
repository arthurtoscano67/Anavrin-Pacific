import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MonsterImage } from '../components/MonsterImage';
import { PageShell } from '../components/PageShell';
import { StageBadge } from '../components/StageBadge';
import { useAnavrinData } from '../hooks/useAnavrinData';
import { useArenaMatches } from '../hooks/useArenaMatches';
import { useTxExecutor } from '../hooks/useTxExecutor';
import { useLobbyPresence } from '../arena/network/useLobbyPresence';
import { CLOCK_ID, MODULE, NORMAL_BATTLE_MODE, PACKAGE_ID, TREASURY_ID } from '../lib/constants';
import { short } from '../lib/format';
import { extractCreatedArenaMatchId } from '../lib/sui';

const STAKE_OPTIONS = ['0', '0.1', '0.25', '0.5', '1'];

export function QueuePage() {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { walletMonsters } = useAnavrinData();
  const arenaMatches = useArenaMatches(account?.address);
  const { executeAndFetchBlock } = useTxExecutor();
  const [selectedMonsterId, setSelectedMonsterId] = useState(params.get('monster') ?? '');
  const [selectedWager, setSelectedWager] = useState(params.get('wager') ?? '0');
  const [queued, setQueued] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const queueCreatorRef = useRef<string | null>(null);
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

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedMonsterId) next.set('monster', selectedMonsterId);
    if (selectedWager) next.set('wager', selectedWager);
    setParams(next, { replace: true });
  }, [selectedMonsterId, selectedWager, setParams]);

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

  useEffect(() => {
    if (!account?.address || !lobby.queueMatch) return;
    const queueMatch = lobby.queueMatch;
    const opponent = queueMatch.playerA === account.address ? queueMatch.playerB : queueMatch.playerA;

    if (queueMatch.creator !== account.address) {
      toast.message(`Matched with ${short(opponent)}. Waiting for them to open the arena.`);
      return;
    }

    if (queueCreatorRef.current === queueMatch.id) {
      return;
    }

    queueCreatorRef.current = queueMatch.id;
    setPending('create-match');

    void (async () => {
      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULE}::create_match`,
          arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), tx.pure.address(opponent), tx.pure.u8(NORMAL_BATTLE_MODE)],
        });

        const { block } = await executeAndFetchBlock(tx, 'Queue match created');
        const matchId = extractCreatedArenaMatchId(block);
        if (!matchId) {
          throw new Error('Could not find the new MartianMatch object');
        }

        lobby.announceMatchStarted({
          from: account.address,
          to: opponent,
          matchId,
          wagerAmount: queueMatch.wagerAmount,
        });
        lobby.clearQueueMatch();
        setQueued(false);
        navigate(`/battle/${matchId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not create quick match');
      } finally {
        setPending(null);
      }
    })();
  }, [account?.address, executeAndFetchBlock, lobby, navigate]);

  useEffect(() => {
    return () => {
      if (queued) {
        lobby.leaveQueue();
      }
    };
  }, [lobby, queued]);

  const handleJoinQueue = () => {
    if (!selectedMonster) {
      toast.error('Pick a Martian first');
      return;
    }

    lobby.joinQueue({
      monsterId: selectedMonster.objectId,
      monsterName: selectedMonster.name,
      stage: selectedMonster.stage,
      wagerAmount: selectedWager,
    });
    setQueued(true);
    toast.success('You are in the quick match queue.');
  };

  const handleLeaveQueue = () => {
    lobby.leaveQueue();
    lobby.clearQueueMatch();
    setQueued(false);
    queueCreatorRef.current = null;
  };

  if (!account) {
    return (
      <PageShell title="Queue" subtitle="Connect your wallet to search for a fast arena match.">
        <div className="glass-card p-5 text-sm text-gray-300">Connect wallet to enter quick match.</div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Queue" subtitle="Select one Martian, choose a wager, and wait for a compatible fighter.">
      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Quick Match</div>
            <div className="mt-2 text-3xl font-black text-white">Find a battle automatically</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
              The realtime service pairs fighters with the same wager. Once matched, one wallet opens the on-chain MartianMatch and both users move into the battle room.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200">
            Queue {lobby.queueCount}
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
                disabled={queued || pending !== null}
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
              className={`min-h-[58px] rounded-[18px] border text-sm font-black ${selectedWager === option ? 'border-cyan/70 bg-cyan/15 text-white' : 'border-borderSoft bg-black/20 text-gray-300'}`}
              onClick={() => setSelectedWager(option)}
              disabled={queued || pending !== null}
            >
              {option === '0' ? 'No Wager' : `${option} SUI`}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="min-h-[68px] rounded-[24px] bg-gradient-to-r from-fuchsia-400 via-purple to-cyan px-5 text-lg font-black text-white disabled:opacity-50"
            disabled={!selectedMonster || queued || pending !== null}
            onClick={handleJoinQueue}
          >
            {pending === 'create-match' ? 'Opening Match...' : queued ? 'Queued' : 'JOIN QUEUE'}
          </button>
          <button
            className="min-h-[68px] rounded-[24px] border border-white/10 bg-white/5 px-5 text-lg font-black text-white disabled:opacity-40"
            disabled={!queued}
            onClick={handleLeaveQueue}
          >
            LEAVE QUEUE
          </button>
        </div>
      </section>
    </PageShell>
  );
}
