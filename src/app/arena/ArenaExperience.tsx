import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageShell } from '../components/PageShell';
import { LoadingGrid } from '../components/LoadingGrid';
import { useArena } from '../hooks/useArena';
import { useAnavrinData } from '../hooks/useAnavrinData';
import { useArenaMatches } from '../hooks/useArenaMatches';
import { useTxExecutor } from '../hooks/useTxExecutor';
import { ARENA_MATCH_TYPE, CLOCK_ID, MODULE, NORMAL_BATTLE_MODE, PACKAGE_ID, TREASURY_ID } from '../lib/constants';
import { short, toMist } from '../lib/format';
import { fetchArenaMatch, fetchMatchResolution } from '../lib/sui';
import type { ArenaMatch, MatchResolution, Monster } from '../lib/types';
import { generateBattleRoomId } from '../../server/arenaRooms';
import { buildBattlePreview, buildRoomModel, type ArenaScreen } from './battle-engine/battleEngine';
import { BattleRoomScreen } from './battle-room/BattleRoomScreen';
import { BattleArenaScreen } from './arena-ui/BattleArenaScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import { useLobbyPresence } from './network/useLobbyPresence';
import { useRoomPresence } from './network/useRoomPresence';
import type { LobbyInvite, LobbyOpenMatch } from './network/types';

function buildPreviewMonster(participant?: { monsterId?: string; monsterName?: string; stage?: number } | null) {
  if (!participant?.monsterId) return null;
  return {
    objectId: participant.monsterId,
    name: participant.monsterName ?? 'Legend',
    stage: participant.stage ?? 0,
  };
}

function isRoomMessageRelevant(match: ArenaMatch | null, accountAddress?: string | null): boolean {
  if (!match || !accountAddress) return false;
  return match.player_a === accountAddress || match.player_b === accountAddress;
}

export function ArenaExperience() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const [params, setParams] = useSearchParams();
  const { walletMonsters, recentMatches } = useAnavrinData();
  const arenaMatches = useArenaMatches(account?.address);
  const { execute, executeAndFetchBlock } = useTxExecutor();
  const arena = useArena(params.get('match') ?? '', params.get('room') ?? '');

  const [selectedMonsterId, setSelectedMonsterId] = useState(params.get('monster') ?? '');
  const [selectedStake, setSelectedStake] = useState('0');
  const [activeMatch, setActiveMatch] = useState<ArenaMatch | null>(null);
  const [resolution, setResolution] = useState<MatchResolution | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [animatingBattle, setAnimatingBattle] = useState(false);
  const [roomOpponentAddress, setRoomOpponentAddress] = useState(params.get('opponent') ?? '');
  const attemptedInitialRestoreRef = useRef(false);
  const [recoveringFromChain, setRecoveringFromChain] = useState(false);

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

  const roomPresenceEnabled = Boolean(
    account?.address &&
    arena.currentRoomId &&
    (!activeMatch || isRoomMessageRelevant(activeMatch, account.address))
  );

  const lobby = useLobbyPresence({
    enabled: Boolean(account?.address),
    address: account?.address,
    monsterName: selectedMonster?.name ?? 'Martian',
    level: (selectedMonster?.stage ?? 0) + 1,
  });

  const room = useRoomPresence({
    enabled: roomPresenceEnabled,
    roomId: arena.currentRoomId || undefined,
    address: account?.address,
  });

  const lobbyStartedMatch = lobby.startedMatch;
  const clearLobbyStartedMatch = lobby.clearStartedMatch;
  const roomIsConnected = room.isConnected;
  const roomSetSelection = room.setSelection;
  const roomSetStake = room.setStake;
  const roomSendChat = room.sendChat;

  const resetToLobby = useCallback(() => {
    setActiveMatch(null);
    setResolution(null);
    setPending(null);
    arena.setCurrentMatchId('');
    arena.persistRoomId(null);
    arena.setScreen('lobby');
    setRoomOpponentAddress('');
    arenaMatches.persistMatchId(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('match');
      next.delete('room');
      next.delete('opponent');
      return next;
    });
  }, [arena, arenaMatches.persistMatchId, setParams]);

  const stageRoomEntry = useCallback((roomId: string, opponentAddress?: string) => {
    arena.persistRoomId(roomId);
    arena.setScreen('room');
    if (opponentAddress) {
      setRoomOpponentAddress(opponentAddress);
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('room', roomId);
      if (selectedMonster?.objectId) {
        next.set('monster', selectedMonster.objectId);
      }
      if (opponentAddress) {
        next.set('opponent', opponentAddress);
      }
      return next;
    });
  }, [arena, selectedMonster?.objectId, setParams]);

  useEffect(() => {
    if (!selectedMonster || !roomIsConnected) return;
    roomSetSelection({
      monsterId: selectedMonster.objectId,
      monsterName: selectedMonster.name,
      stage: selectedMonster.stage,
    });
  }, [roomIsConnected, roomSetSelection, selectedMonster]);

  useEffect(() => {
    if (!roomIsConnected) return;
    roomSetStake(selectedStake);
  }, [roomIsConnected, roomSetStake, selectedStake]);

  const loadMatch = useCallback(async (matchId: string, nextScreen: ArenaScreen = 'room') => {
    if (!matchId) return;
    setPending('load');
    try {
      const [match, nextResolution] = await Promise.all([
        fetchArenaMatch(client, matchId),
        fetchMatchResolution(client, matchId),
      ]);
      setActiveMatch(match);
      setResolution(nextResolution);
      arena.setCurrentMatchId(matchId);
      arenaMatches.persistMatchId(matchId);
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('match', matchId);
        if (arena.currentRoomId) next.set('room', arena.currentRoomId);
        return next;
      });
      arena.setScreen(nextResolution || match?.status === 2 ? 'battle' : nextScreen);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load match');
    } finally {
      setPending(null);
    }
  }, [arena, arenaMatches, client, setParams]);

  const refreshMatchState = useCallback(async (matchId: string) => {
    if (!matchId) return;
    try {
      const [match, nextResolution] = await Promise.all([
        fetchArenaMatch(client, matchId),
        fetchMatchResolution(client, matchId),
      ]);
      setActiveMatch(match);
      setResolution(nextResolution);
      if (nextResolution || match?.status === 2) {
        arena.setScreen('battle');
      }
    } catch {
      // Silent background refresh.
    }
  }, [arena, client]);

  useEffect(() => {
    attemptedInitialRestoreRef.current = false;
  }, [account?.address]);

  useEffect(() => {
    const urlMonster = params.get('monster');
    if (urlMonster) setSelectedMonsterId(urlMonster);
    const urlRoom = params.get('room');
    if (urlRoom && urlRoom !== arena.currentRoomId) {
      arena.persistRoomId(urlRoom);
    }
    const urlOpponent = params.get('opponent');
    if (urlOpponent && urlOpponent !== roomOpponentAddress) {
      setRoomOpponentAddress(urlOpponent);
    }

    const urlMatch = params.get('match');
    if (!urlMatch && !urlRoom) {
      if (arena.currentMatchId || arena.currentRoomId) {
        return;
      }
      setActiveMatch(null);
      setResolution(null);
      arena.setCurrentMatchId('');
      arena.persistRoomId(null);
      arenaMatches.persistMatchId(null);
      arena.setScreen('lobby');
      return;
    }

    if (urlRoom && !urlMatch && arena.screen !== 'room') {
      arena.setScreen('room');
    }

    if (urlMatch && activeMatch?.objectId !== urlMatch) {
      arena.setCurrentMatchId(urlMatch);
      void loadMatch(urlMatch, 'room');
      return;
    }
  }, [
    activeMatch?.objectId,
    arena.currentMatchId,
    arena.currentRoomId,
    arena.screen,
    arena.persistRoomId,
    arena.setCurrentMatchId,
    arena.setScreen,
    arenaMatches.persistMatchId,
    loadMatch,
    params,
    roomOpponentAddress,
  ]);

  useEffect(() => {
    if (!account?.address) return;
    if (attemptedInitialRestoreRef.current) return;

    const urlMatch = params.get('match');
    const urlRoom = params.get('room');
    if (urlMatch || urlRoom) {
      attemptedInitialRestoreRef.current = true;
      return;
    }

    if (arena.currentMatchId || arena.currentRoomId) {
      attemptedInitialRestoreRef.current = true;
      return;
    }

    if (arenaMatches.isLoading || arenaMatches.isFetching) return;

    attemptedInitialRestoreRef.current = true;
    const restoredMatch = arenaMatches.restoredOwnedMatch;
    if (!restoredMatch || (restoredMatch.status !== 0 && restoredMatch.status !== 1)) {
      return;
    }

    setRecoveringFromChain(true);
    setRoomOpponentAddress(restoredMatch.player_a === account.address ? restoredMatch.player_b : restoredMatch.player_a);
    void loadMatch(restoredMatch.objectId, 'room').finally(() => {
      setRecoveringFromChain(false);
    });
  }, [
    account?.address,
    arena.currentMatchId,
    arena.currentRoomId,
    arenaMatches.isFetching,
    arenaMatches.isLoading,
    arenaMatches.restoredOwnedMatch,
    loadMatch,
    params,
  ]);

  useEffect(() => {
    if (!arena.currentMatchId || activeMatch?.objectId === arena.currentMatchId) return;
    void loadMatch(arena.currentMatchId, arena.screen === 'battle' ? 'battle' : 'room');
  }, [activeMatch?.objectId, arena.currentMatchId, arena.screen, loadMatch]);

  useEffect(() => {
    if (!arena.currentMatchId) return;
    if (pending === 'load' || pending === 'deposit' || pending === 'withdraw' || pending === 'battle' || pending === 'create-room') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshMatchState(arena.currentMatchId);
    }, 3_000);

    return () => window.clearInterval(intervalId);
  }, [arena.currentMatchId, pending, refreshMatchState]);

  useEffect(() => {
    if (!lobbyStartedMatch?.matchId) return;
    const nextRoomId = lobbyStartedMatch.roomId || lobbyStartedMatch.matchId;
    if (nextRoomId) {
      const opponentAddress = lobbyStartedMatch.from === account?.address ? lobbyStartedMatch.to : lobbyStartedMatch.from;
      stageRoomEntry(nextRoomId, opponentAddress);
    }
    if (lobbyStartedMatch.matchId === arena.currentMatchId) {
      clearLobbyStartedMatch();
      return;
    }
    void loadMatch(lobbyStartedMatch.matchId, 'room');
    toast.success(`Battle room ready with ${short(lobbyStartedMatch.from === account?.address ? lobbyStartedMatch.to : lobbyStartedMatch.from)}.`);
    clearLobbyStartedMatch();
  }, [account?.address, arena.currentMatchId, clearLobbyStartedMatch, loadMatch, lobbyStartedMatch, stageRoomEntry]);

  useEffect(() => {
    if (!arena.currentMatchId || !activeMatch || !isRoomMessageRelevant(activeMatch, account?.address)) return;
    setRoomOpponentAddress(activeMatch.player_a === account?.address ? activeMatch.player_b : activeMatch.player_a);
    if (activeMatch.status === 2 || resolution) {
      arena.setScreen('battle');
    }
  }, [account?.address, activeMatch, arena.currentMatchId, arena.setScreen, resolution]);

  const roomModel = useMemo(
    () => buildRoomModel({
      match: activeMatch,
      accountAddress: account?.address,
      participants: room.participants,
      resolution,
    }),
    [account?.address, activeMatch, resolution, room.participants]
  );

  const battlePreview = useMemo(() => buildBattlePreview(activeMatch, resolution), [activeMatch, resolution]);

  const playerAParticipant = useMemo(
    () => {
      const playerAAddress = activeMatch?.player_a ?? room.participants[0]?.address;
      return playerAAddress ? room.participants.find((participant) => participant.address === playerAAddress) : undefined;
    },
    [activeMatch?.player_a, room.participants]
  );
  const playerBParticipant = useMemo(
    () => {
      const playerAAddress = activeMatch?.player_a ?? room.participants[0]?.address;
      const playerBAddress = activeMatch?.player_b
        ?? room.participants.find((participant) => participant.address !== playerAAddress)?.address;
      return playerBAddress ? room.participants.find((participant) => participant.address === playerBAddress) : undefined;
    },
    [activeMatch?.player_a, activeMatch?.player_b, room.participants]
  );

  const playerAAddress = activeMatch?.player_a ?? playerAParticipant?.address;
  const playerBAddress = activeMatch?.player_b ?? playerBParticipant?.address;

  const playerAMonster = activeMatch?.monster_a_data
    ?? buildPreviewMonster(playerAParticipant)
    ?? (playerAAddress === account?.address ? selectedMonster : null);
  const playerBMonster = activeMatch?.monster_b_data
    ?? buildPreviewMonster(playerBParticipant)
    ?? (playerBAddress === account?.address ? selectedMonster : null);

  const createMatchAgainst = useCallback(async (opponentAddress: string, meta?: { inviteId?: string; openMatchId?: string; roomId?: string }) => {
    if (!account?.address) {
      toast.error('Connect wallet first');
      return;
    }

    setPending('create-room');
    const roomId = meta?.roomId || generateBattleRoomId(account.address, opponentAddress);
    stageRoomEntry(roomId, opponentAddress);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::create_match`,
        arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), tx.pure.address(opponentAddress), tx.pure.u8(NORMAL_BATTLE_MODE)],
      });

      const { block } = await executeAndFetchBlock(tx, 'Battle room created');
      const created = block.objectChanges?.find((change) => change.type === 'created' && change.objectType === ARENA_MATCH_TYPE);
      if (!created || !('objectId' in created)) {
        throw new Error('Could not parse the room id');
      }

      const matchId = created.objectId;
      lobby.announceMatchStarted({
        from: account.address,
        to: opponentAddress,
        roomId,
        inviteId: meta?.inviteId,
        openMatchId: meta?.openMatchId,
        matchId,
      });
      await loadMatch(matchId, 'room');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the room');
    } finally {
      setPending(null);
    }
  }, [account?.address, executeAndFetchBlock, loadMatch, lobby, stageRoomEntry]);

  const handleInvite = useCallback((address: string) => {
    if (!selectedMonster) {
      toast.error('Pick your Martian first');
      return;
    }
    const roomId = generateBattleRoomId(account!.address, address);
    lobby.invitePlayer(address, roomId);
    stageRoomEntry(roomId, address);
    toast.success(`Invite sent to ${short(address)}.`);
  }, [account, lobby, selectedMonster, stageRoomEntry]);

  const handleAcceptInvite = useCallback(async (invite: LobbyInvite) => {
    lobby.acceptInvite(invite);
    stageRoomEntry(invite.roomId, invite.from);
    toast.success(`Joined ${short(invite.from)}'s room.`);
  }, [lobby, stageRoomEntry]);

  const handleJoinOpenMatch = useCallback(async (openMatch: LobbyOpenMatch) => {
    await createMatchAgainst(openMatch.creator, { openMatchId: openMatch.id, roomId: generateBattleRoomId(account!.address, openMatch.creator) });
  }, [account, createMatchAgainst]);

  const handleCreateRoomMatch = useCallback(async () => {
    if (!roomOpponentAddress) {
      toast.error('Waiting for the other trainer to join the room');
      return;
    }
    await createMatchAgainst(roomOpponentAddress, { roomId: arena.currentRoomId || generateBattleRoomId(account!.address, roomOpponentAddress) });
  }, [account, arena.currentRoomId, createMatchAgainst, roomOpponentAddress]);

  const handleDeposit = useCallback(async () => {
    if (!account?.address || !arena.currentMatchId || !selectedMonster) {
      toast.error('Pick a room and a Martian first');
      return;
    }

    setPending('deposit');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::deposit_martian`,
        arguments: [tx.object(arena.currentMatchId), tx.object(selectedMonster.objectId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });

      const stakeMist = toMist(selectedStake);
      if (stakeMist > 0n) {
        const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(stakeMist)]);
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULE}::deposit_stake`,
          arguments: [tx.object(arena.currentMatchId), stakeCoin, tx.object(CLOCK_ID)],
        });
      }

      await execute(tx, 'Martian deposited');
      await walletMonsters.refetch();
      await loadMatch(arena.currentMatchId, 'room');
    } finally {
      setPending(null);
    }
  }, [account?.address, arena.currentMatchId, execute, loadMatch, selectedMonster, selectedStake, walletMonsters]);

  const handleWithdraw = useCallback(async () => {
    if (!arena.currentMatchId) return;
    setPending('withdraw');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::withdraw`,
        arguments: [tx.object(arena.currentMatchId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });
      await execute(tx, 'Martian returned');
      await walletMonsters.refetch();
      await loadMatch(arena.currentMatchId, 'room');
    } finally {
      setPending(null);
    }
  }, [arena.currentMatchId, execute, loadMatch, walletMonsters]);

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

  const resolveBattle = useCallback(async () => {
    if (!arena.currentMatchId || !roomModel.canStartBattle) return;
    setPending('battle');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE}::start_battle`,
        arguments: [tx.object(arena.currentMatchId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
      });
      await execute(tx, 'Battle resolved');
      await playFrames();
      await loadMatch(arena.currentMatchId, 'battle');
    } finally {
      setPending(null);
    }
  }, [arena.currentMatchId, execute, loadMatch, playFrames, roomModel.canStartBattle]);

  const handleDefend = useCallback(() => {
    toast.message('Shield up!');
  }, []);

  const handleEmote = useCallback(() => {
    toast.message('Your Martian roars!');
  }, []);

  const handleBackLobby = useCallback(() => {
    resetToLobby();
  }, [resetToLobby]);

  const liveMatches = useMemo(
    () => arenaMatches.activeMatches.filter((match) => match.objectId !== arena.currentMatchId).slice(0, 6),
    [arena.currentMatchId, arenaMatches.activeMatches]
  );
  const canCreateRoomMatch = useMemo(() => {
    if (!arena.currentRoomId || arena.currentMatchId || !roomOpponentAddress) return false;
    const visibleParticipants = room.participants.filter((participant) => participant.present);
    return visibleParticipants.some((participant) => participant.address === account?.address)
      && visibleParticipants.some((participant) => participant.address === roomOpponentAddress);
  }, [account?.address, arena.currentMatchId, arena.currentRoomId, room.participants, roomOpponentAddress]);

  const selfPlayer = useMemo(
    () => lobby.players.find((player) => player.address === account?.address) ?? null,
    [account?.address, lobby.players]
  );
  const playerList = useMemo(
    () => lobby.players.filter((player) => player.address !== account?.address),
    [account?.address, lobby.players]
  );

  if (!account) {
    return (
      <PageShell title="Arena" subtitle="Connect your Sui wallet to invite, deposit, and battle.">
        <div className="space-y-4">
          <section className="glass-card space-y-4 p-5 sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan/80">Martians</div>
            <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Battle Arena</h2>
            <p className="max-w-2xl text-sm leading-6 text-gray-300">
              Connect your wallet to see fighters online, pick your Martian, and jump into battle rooms.
            </p>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="glass-card space-y-3 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">1. Lobby</div>
              <div className="text-2xl font-black text-white">See trainers online</div>
              <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">
                Invite a player or accept their challenge.
              </div>
            </section>
            <section className="glass-card space-y-3 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">2. Room</div>
              <div className="text-2xl font-black text-white">Open room and deposit Martians</div>
              <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">
                Open the on-chain match, deposit NFTs, and keep withdraw open until both sides are in.
              </div>
            </section>
            <section className="glass-card space-y-3 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">3. Battle</div>
              <div className="text-2xl font-black text-white">Big buttons. Fast fight.</div>
              <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">
                ATTACK, SPECIAL, DEFEND, and EMOTE with a giant arena view.
              </div>
            </section>
          </div>
        </div>
      </PageShell>
    );
  }

  const loading = walletMonsters.isLoading || arenaMatches.isLoading || recoveringFromChain;

  return (
    <PageShell title="Arena" subtitle="Invite. Open Room. Deposit. Battle.">
      <div className="flex flex-wrap gap-2">
        {(['lobby', 'room', 'battle'] as ArenaScreen[]).map((step) => (
          <button
            key={step}
            className={`rounded-full px-4 py-2 text-sm font-black uppercase tracking-[0.14em] ${arena.screen === step ? 'bg-purple text-white' : 'border border-borderSoft bg-black/20 text-gray-300'}`}
            onClick={() => arena.setScreen(step)}
            disabled={step !== 'lobby' && !arena.currentMatchId}
          >
            {step}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingGrid count={3} />
      ) : arena.screen === 'lobby' ? (
        <LobbyScreen
          totalPlayers={lobby.players.length}
          players={playerList}
          selfPlayer={selfPlayer}
          invites={lobby.invites.filter((invite) => invite.to === account.address && invite.status === 'pending')}
          openMatches={lobby.openMatches.filter((match) => match.creator !== account.address)}
          liveMatches={liveMatches}
          selectedMonsterId={selectedMonster?.objectId ?? ''}
          monsters={monsters}
          pending={pending}
          connectionState={lobby.connectionState}
          lastError={lobby.lastError}
          onPickMonster={setSelectedMonsterId}
          onInvite={handleInvite}
          onAcceptInvite={handleAcceptInvite}
          onJoinOpenMatch={handleJoinOpenMatch}
          onWatchMatch={(matchId) => {
            void loadMatch(matchId, 'battle');
          }}
        />
      ) : arena.screen === 'room' ? (
        <BattleRoomScreen
          accountAddress={account.address}
          match={activeMatch}
          currentMatchId={arena.currentMatchId}
          currentRoomId={arena.currentRoomId}
          roomConnectionState={room.connectionState}
          roomIsConnected={roomIsConnected}
          roomLastError={room.lastError}
          resolution={resolution}
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
          canCreateRoomMatch={canCreateRoomMatch}
          onPickMonster={setSelectedMonsterId}
          onPickStake={setSelectedStake}
          onCreateRoomMatch={handleCreateRoomMatch}
          onDeposit={handleDeposit}
          onWithdraw={handleWithdraw}
          onBattle={resolveBattle}
          onBackLobby={handleBackLobby}
          onSendChat={roomSendChat}
        />
      ) : (
        <BattleArenaScreen
          match={activeMatch}
          resolution={resolution}
          preview={battlePreview}
          frameIndex={frameIndex}
          animating={animatingBattle}
          canAttack={Boolean(
            activeMatch &&
            account.address &&
            (activeMatch.player_a === account.address || activeMatch.player_b === account.address) &&
            roomModel.canStartBattle &&
            !resolution &&
            pending === null
          )}
          pending={pending}
          accountAddress={account.address}
          spectator={!activeMatch || (activeMatch.player_a !== account.address && activeMatch.player_b !== account.address)}
          viewerCount={room.viewerCount}
          onAttack={resolveBattle}
          onSpecial={resolveBattle}
          onDefend={handleDefend}
          onEmote={handleEmote}
          onBackRoom={() => arena.setScreen('room')}
          onBackLobby={handleBackLobby}
        />
      )}
    </PageShell>
  );
}
