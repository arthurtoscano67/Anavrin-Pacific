import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useBattleMatch } from '../hooks/useBattleMatch';
import { useAnavrinData } from '../hooks/useAnavrinData';
import { useTxExecutor } from '../hooks/useTxExecutor';
import { upsertBattleSummary } from './network/api';
import { useRoomPresence } from './network/useRoomPresence';
import { buildBattlePreview, buildRoomModel } from './battle-engine/battleEngine';
import { BattleRoomScreen } from './battle-room/BattleRoomScreen';
import { BattleArenaScreen } from './arena-ui/BattleArenaScreen';
import { CLOCK_ID, MODULE, PACKAGE_ID, TREASURY_ID } from '../lib/constants';
import { toMist } from '../lib/format';
import type { MatchResolution, Monster } from '../lib/types';

type MatchRouteViewProps = {
  matchId: string;
  spectatorOnly?: boolean;
};

type VisualMonster = Partial<Monster> & {
  objectId?: string;
  name?: string;
  stage?: number;
};

function toBattleSummaryFromChain(input: {
  matchId: string;
  playerA: string;
  playerB: string;
  matchStatus: number;
  createdAt?: number;
  viewerCount?: number;
  wagerAmount?: string;
  selectedMonsterA?: string | null;
  selectedMonsterB?: string | null;
  selectedMonsterAName?: string | null;
  selectedMonsterBName?: string | null;
}) {
  return {
    matchId: input.matchId,
    playerA: input.playerA,
    playerB: input.playerB,
    status: input.matchStatus === 1 ? 'locked' : input.matchStatus === 2 ? 'finished' : input.matchStatus === 3 ? 'cancelled' : 'waiting',
    createdAt: input.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    viewerCount: input.viewerCount ?? 0,
    wagerAmount: input.wagerAmount ?? '0',
    selectedMonsterA: input.selectedMonsterA,
    selectedMonsterB: input.selectedMonsterB,
    selectedMonsterAName: input.selectedMonsterAName,
    selectedMonsterBName: input.selectedMonsterBName,
  } as const;
}

export function MatchRouteView({ matchId, spectatorOnly = false }: MatchRouteViewProps) {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const { walletMonsters } = useAnavrinData();
  const { execute } = useTxExecutor();
  const battleMatch = useBattleMatch(matchId);
  const [selectedMonsterId, setSelectedMonsterId] = useState('');
  const [selectedStake, setSelectedStake] = useState('0');
  const [pending, setPending] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [animatingBattle, setAnimatingBattle] = useState(false);

  const match = battleMatch.data?.match ?? null;
  const resolution = battleMatch.data?.resolution ?? null;
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

  const isParticipant = Boolean(
    !spectatorOnly &&
      account?.address &&
      match &&
      (match.player_a === account.address || match.player_b === account.address)
  );

  const room = useRoomPresence({
    enabled: Boolean(matchId),
    roomId: matchId,
    address: account?.address,
    spectator: !isParticipant,
  });

  useEffect(() => {
    if (!match) return;
    void upsertBattleSummary(
      toBattleSummaryFromChain({
        matchId: match.objectId,
        playerA: match.player_a,
        playerB: match.player_b,
        matchStatus: match.status,
        createdAt: Number(match.created_at || Date.now()),
        viewerCount: room.viewerCount,
        wagerAmount: match.stake_a || match.stake_b || '0',
        selectedMonsterA: match.mon_a,
        selectedMonsterB: match.mon_b,
        selectedMonsterAName: match.monster_a_data?.name,
        selectedMonsterBName: match.monster_b_data?.name,
      })
    ).catch(() => {});
  }, [match, room.viewerCount]);

  const roomModel = useMemo(
    () => buildRoomModel({
      match,
      accountAddress: isParticipant ? account?.address : undefined,
      participants: room.participants,
      resolution,
    }),
    [account?.address, isParticipant, match, resolution, room.participants]
  );

  const playerAMonster: VisualMonster | null = match?.monster_a_data ?? null;
  const playerBMonster: VisualMonster | null = match?.monster_b_data ?? null;
  const battlePreview = useMemo(() => buildBattlePreview(match, resolution), [match, resolution]);

  const playFrames = useCallback(async () => {
    if (!battlePreview) return;
    setAnimatingBattle(true);
    setFrameIndex(0);
    for (let i = 0; i < battlePreview.frames.length; i += 1) {
      setFrameIndex(i);
      await new Promise((resolve) => window.setTimeout(resolve, i === 0 ? 180 : 420));
    }
    setAnimatingBattle(false);
  }, [battlePreview]);

  const handleDeposit = useCallback(async () => {
    if (!account?.address || !matchId || !selectedMonster || !match || !isParticipant) {
      toast.error('Pick a Martian first');
      return;
    }

    setPending('deposit');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::deposit_martian`,
        arguments: [tx.object(matchId), tx.object(selectedMonster.objectId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });

      const stakeMist = toMist(selectedStake);
      if (stakeMist > 0n) {
        const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(stakeMist)]);
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULE}::deposit_stake`,
          arguments: [tx.object(matchId), stakeCoin, tx.object(CLOCK_ID)],
        });
      }

      await execute(tx, 'Martian deposited');
      await walletMonsters.refetch();
      await battleMatch.refetch();
    } finally {
      setPending(null);
    }
  }, [account?.address, battleMatch, execute, isParticipant, match, matchId, selectedMonster, selectedStake, walletMonsters]);

  const handleWithdraw = useCallback(async () => {
    if (!matchId || !isParticipant) return;

    setPending('withdraw');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::withdraw`,
        arguments: [tx.object(matchId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });
      await execute(tx, 'Martian returned');
      await walletMonsters.refetch();
      await battleMatch.refetch();
    } finally {
      setPending(null);
    }
  }, [battleMatch, execute, isParticipant, matchId, walletMonsters]);

  const handleBattle = useCallback(async () => {
    if (!matchId || !roomModel.canStartBattle || !isParticipant) return;

    setPending('battle');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::start_battle`,
        arguments: [tx.object(matchId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });
      await execute(tx, 'Battle resolved');
      await playFrames();
      await battleMatch.refetch();
    } finally {
      setPending(null);
    }
  }, [battleMatch, execute, isParticipant, matchId, playFrames, roomModel.canStartBattle]);

  const handleBackLobby = useCallback(() => {
    navigate('/lobby');
  }, [navigate]);

  if (battleMatch.isLoading) {
    return <div className="glass-card p-5 text-sm text-gray-300">Loading battle...</div>;
  }

  if (!match) {
    return (
      <div className="glass-card p-5 text-sm text-gray-300">
        Battle not found on Martians mainnet.
      </div>
    );
  }

  const shouldShowBattleScreen = Boolean(resolution || match.status === 2 || spectatorOnly || !isParticipant);
  const spectator = spectatorOnly || !isParticipant;

  if (shouldShowBattleScreen) {
    return (
      <BattleArenaScreen
        match={match}
        resolution={resolution}
        preview={battlePreview}
        frameIndex={frameIndex}
        animating={animatingBattle}
        canAttack={Boolean(isParticipant && roomModel.canStartBattle && !resolution && pending === null)}
        pending={pending}
        accountAddress={spectator ? match.player_b : account?.address}
        spectator={spectator}
        viewerCount={room.viewerCount}
        onAttack={handleBattle}
        onSpecial={handleBattle}
        onDefend={() => toast.message('Battle actions resolve on-chain in this build.')}
        onEmote={() => toast.message('Spectators can watch. Trainers settle the fight on-chain.')}
        onBackRoom={() => {
          if (spectator) {
            navigate(`/spectate/${matchId}`);
            return;
          }
          navigate(`/battle/${matchId}`);
        }}
        onBackLobby={handleBackLobby}
      />
    );
  }

  return (
    <BattleRoomScreen
      accountAddress={account?.address}
      match={match}
      currentMatchId={matchId}
      currentRoomId={matchId}
      roomConnectionState={room.connectionState}
      roomIsConnected={room.isConnected}
      roomLastError={room.lastError}
      resolution={resolution as MatchResolution | null}
      roomParticipants={room.participants}
      roomNotices={room.notices}
      roomMessages={room.messages}
      roomModel={roomModel}
      selectedMonsterId={selectedMonster?.objectId ?? ''}
      monsters={monsters}
      selectedStake={selectedStake}
      playerAMonster={playerAMonster}
      playerBMonster={playerBMonster}
      pending={pending}
      canCreateRoomMatch={false}
      onPickMonster={setSelectedMonsterId}
      onPickStake={setSelectedStake}
      onCreateRoomMatch={() => {}}
      onDeposit={handleDeposit}
      onWithdraw={handleWithdraw}
      onBattle={handleBattle}
      onBackLobby={handleBackLobby}
      onSendChat={room.sendChat}
    />
  );
}
