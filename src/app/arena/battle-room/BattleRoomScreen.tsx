import { useMemo, useState } from 'react';
import { StageBadge } from '../../components/StageBadge';
import { MonsterImage } from '../../components/MonsterImage';
import { short, toSui } from '../../lib/format';
import type { ArenaMatch, MatchResolution, Monster } from '../../lib/types';
import type { LobbyConnectionState, RoomChatMessage, RoomNotice, RoomParticipant } from '../network/types';
import type { RoomModel } from '../battle-engine/battleEngine';
import { ArenaMonsterPanel } from '../arena-ui/ArenaMonsterPanel';

const STAKE_OPTIONS = ['0', '0.1', '0.25', '0.5', '1'];

type VisualMonster = Partial<Monster> & {
  objectId?: string;
  name?: string;
  stage?: number;
};

type GuideState = {
  eyebrow: string;
  title: string;
  body: string;
  primaryLabel: string;
  primaryAction?: () => void;
  primaryDisabled: boolean;
  primaryTone: string;
  statusLabel: string;
  statusTone: string;
};

export function BattleRoomScreen({
  accountAddress,
  match,
  currentMatchId,
  currentRoomId,
  roomConnectionState,
  roomIsConnected,
  roomLastError,
  resolution,
  roomParticipants,
  roomNotices,
  roomMessages,
  roomModel,
  selectedMonsterId,
  monsters,
  selectedStake,
  playerAMonster,
  playerBMonster,
  pending,
  canCreateRoomMatch,
  onPickMonster,
  onPickStake,
  onCreateRoomMatch,
  onDeposit,
  onWithdraw,
  onBattle,
  onBackLobby,
  onSendChat,
}: {
  accountAddress?: string;
  match: ArenaMatch | null;
  currentMatchId?: string;
  currentRoomId?: string;
  roomConnectionState: LobbyConnectionState;
  roomIsConnected: boolean;
  roomLastError: string | null;
  resolution: MatchResolution | null;
  roomParticipants: RoomParticipant[];
  roomNotices: RoomNotice[];
  roomMessages: RoomChatMessage[];
  roomModel: RoomModel;
  selectedMonsterId: string;
  monsters: Monster[];
  selectedStake: string;
  playerAMonster?: VisualMonster | null;
  playerBMonster?: VisualMonster | null;
  pending: string | null;
  canCreateRoomMatch: boolean;
  onPickMonster: (monsterId: string) => void;
  onPickStake: (stake: string) => void;
  onCreateRoomMatch: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onBattle: () => void;
  onBackLobby: () => void;
  onSendChat: (text: string) => boolean;
}) {
  const [chatDraft, setChatDraft] = useState('');
  const playerAAddress = match?.player_a ?? roomParticipants[0]?.address;
  const playerBAddress = match?.player_b ?? roomParticipants.find((participant) => participant.address !== playerAAddress)?.address;
  const roomLeader = roomParticipants.find((participant) => participant.address !== accountAddress);
  const sideAHasMonster = Boolean(match?.mon_a || match?.monster_a_data);
  const sideBHasMonster = Boolean(match?.mon_b || match?.monster_b_data);
  const waitingForMatch = Boolean(currentRoomId && !currentMatchId);
  const roomCanOpen = waitingForMatch && canCreateRoomMatch;
  const actionDisabled = pending !== null;
  const selectedMonster = monsters.find((monster) => monster.objectId === selectedMonsterId) ?? null;
  const selectionLocked = roomModel.playerDeposited || actionDisabled;
  const withdrawLocked = Boolean(match?.status === 1 || match?.status === 2 || match?.status === 3);
  const totalStakeSui = match ? toSui((BigInt(match.stake_a || '0') + BigInt(match.stake_b || '0')).toString()) : '0.0000';
  const showSetupPanels = Boolean(match && !roomModel.playerDeposited && match.status === 0);
  const showLoadoutSummary = !showSetupPanels;
  const quickMessages = useMemo(
    () => [
      'I will open the room.',
      'You open the room.',
      'Deposit your Martian now.',
      'I am ready to battle.',
      'Withdraw if you want to switch.',
    ],
    []
  );

  const connectionLabel = roomConnectionState === 'open'
    ? 'Room Live'
    : roomConnectionState === 'connecting'
      ? 'Reconnecting'
      : roomConnectionState === 'error'
        ? 'Room Offline'
        : 'Room Closed';

  const flowStep = roomModel.canStartBattle
    ? 3
    : roomModel.playerDeposited || roomModel.opponentDeposited
      ? 2
      : currentMatchId || waitingForMatch
        ? 1
        : 0;

  const flowSteps = [
    { id: 1, label: 'Room' },
    { id: 2, label: 'Deposit' },
    { id: 3, label: 'Battle' },
  ];

  const guide: GuideState = (() => {
    if (resolution) {
      return {
        eyebrow: 'Complete',
        title: 'Battle finished.',
        body: 'The fight resolved on-chain and the Martians are back in their wallets.',
        primaryLabel: 'Back To Lobby',
        primaryAction: onBackLobby,
        primaryDisabled: actionDisabled,
        primaryTone: 'from-purple to-cyan',
        statusLabel: 'Complete',
        statusTone: 'border-yellow-300/30 bg-yellow-500/10 text-yellow-100',
      };
    }

    if (match?.status === 3) {
      return {
        eyebrow: 'Cancelled',
        title: 'Room cancelled.',
        body: 'The contract cancelled this room. Martians should already be back with their trainers.',
        primaryLabel: 'Back To Lobby',
        primaryAction: onBackLobby,
        primaryDisabled: actionDisabled,
        primaryTone: 'from-slate-700 to-slate-600',
        statusLabel: 'Cancelled',
        statusTone: 'border-red-300/25 bg-red-500/10 text-red-100',
      };
    }

    if (waitingForMatch) {
      if (roomCanOpen) {
        return {
          eyebrow: 'Step 1',
          title: 'Open the battle pool.',
          body: 'Both fighters are here. Tap once to create the on-chain MartianMatch object.',
          primaryLabel: pending === 'create-room' ? 'Opening...' : 'Open Battle Room',
          primaryAction: onCreateRoomMatch,
          primaryDisabled: actionDisabled,
          primaryTone: 'from-cyan to-sky-400',
          statusLabel: 'Both Here',
          statusTone: 'border-cyan/30 bg-cyan/10 text-cyan-50',
        };
      }

      return {
        eyebrow: 'Step 1',
        title: 'Waiting for invite accept.',
        body: 'This room is live already. The next move is the other trainer accepting the invite.',
        primaryLabel: 'Waiting for Trainer',
        primaryDisabled: true,
        primaryTone: 'from-slate-700 to-slate-600',
        statusLabel: 'Invite Sent',
        statusTone: 'border-cyan/30 bg-cyan/10 text-cyan-50',
      };
    }

    if (!roomModel.playerDeposited) {
      return {
        eyebrow: 'Step 2',
        title: selectedMonster ? 'Deposit your Martian.' : 'Pick your Martian first.',
        body: selectedMonster
          ? `${selectedMonster.name} is selected. Deposit now${selectedStake !== '0' ? ` with ${selectedStake} SUI` : ''}.`
          : 'Choose a Martian below, then deposit it into the battle pool.',
        primaryLabel: pending === 'deposit' ? 'Depositing...' : 'Deposit Martian',
        primaryAction: onDeposit,
        primaryDisabled: actionDisabled || !roomModel.canDeposit,
        primaryTone: 'from-cyan to-purple',
        statusLabel: roomModel.canDeposit ? 'Your Turn' : 'Pick Martian',
        statusTone: roomModel.canDeposit ? 'border-cyan/30 bg-cyan/10 text-cyan-50' : 'border-white/10 bg-white/5 text-gray-200',
      };
    }

    if (!roomModel.opponentDeposited) {
      return {
        eyebrow: 'Step 2',
        title: 'Waiting for opponent deposit.',
        body: roomModel.canWithdraw
          ? 'Your Martian is in the pool. Withdraw is still available for safety until the other trainer deposits.'
          : 'Your Martian is in the pool. Waiting for the other trainer to deposit theirs.',
        primaryLabel: 'Waiting for Opponent',
        primaryDisabled: true,
        primaryTone: 'from-slate-700 to-slate-600',
        statusLabel: 'Deposited',
        statusTone: 'border-green-300/30 bg-green-500/10 text-green-100',
      };
    }

    if (roomModel.canStartBattle) {
      return {
        eyebrow: 'Step 3',
        title: 'Battle now.',
        body: 'Both Martians are deposited and the match is locked. Either trainer can start the battle.',
        primaryLabel: pending === 'battle' ? 'Battling...' : 'Battle Now',
        primaryAction: onBattle,
        primaryDisabled: actionDisabled,
        primaryTone: 'from-fuchsia-400 via-pink-400 to-orange-300',
        statusLabel: 'Go Time',
        statusTone: 'border-fuchsia-300/35 bg-fuchsia-500/15 text-fuchsia-50',
      };
    }

    return {
      eyebrow: 'Syncing',
      title: 'Updating battle state.',
      body: roomLastError ?? 'The room is syncing with the chain. Wait for the battle button to unlock.',
      primaryLabel: 'Syncing...',
      primaryDisabled: true,
      primaryTone: 'from-slate-700 to-slate-600',
      statusLabel: roomIsConnected ? 'Syncing' : connectionLabel,
      statusTone: roomIsConnected ? 'border-yellow-300/25 bg-yellow-500/10 text-yellow-100' : 'border-red-300/25 bg-red-500/10 text-red-100',
    };
  })();

  const handleSendChat = (text: string) => {
    const next = text.trim();
    if (!next) return;
    const sent = onSendChat(next);
    if (sent) {
      setChatDraft('');
    }
  };

  return (
    <div className="space-y-4 pb-40 sm:pb-44">
      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan/80">Battle Room</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{roomModel.heroTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">{roomModel.heroHint}</p>
          </div>
          <button className="btn-ghost" onClick={onBackLobby}>Back To Lobby</button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-300">
          {currentRoomId ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Room {short(currentRoomId)}</span> : null}
          {currentMatchId ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Battle ID {short(currentMatchId)}</span> : null}
          {match ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Stake {totalStakeSui} SUI</span> : null}
          {roomLeader ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Opponent {short(roomLeader.address)}</span> : null}
          <span className={`rounded-full border px-3 py-1 ${roomIsConnected ? 'border-cyan/30 bg-cyan/10 text-cyan-50' : roomConnectionState === 'connecting' ? 'border-yellow-300/25 bg-yellow-500/10 text-yellow-100' : 'border-red-300/25 bg-red-500/10 text-red-100'}`}>
            {connectionLabel}
          </span>
        </div>
      </section>

      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Next Move</div>
            <div className="mt-1 text-xl font-black text-white">{guide.title}</div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${guide.statusTone}`}>
            {guide.statusLabel}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {flowSteps.map((step) => {
            const active = flowStep === step.id;
            const done = flowStep > step.id;
            return (
              <div
                key={step.id}
                className={`rounded-[18px] border px-4 py-3 text-center text-sm font-black uppercase tracking-[0.16em] ${
                  active
                    ? 'border-purple/45 bg-purple/15 text-white'
                    : done
                      ? 'border-green-300/30 bg-green-500/10 text-green-100'
                      : 'border-white/10 bg-white/5 text-gray-300'
                }`}
              >
                {step.id}. {step.label}
              </div>
            );
          })}
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan/80">{guide.eyebrow}</div>
          <p className="mt-2 text-sm leading-6 text-gray-200">{guide.body}</p>
          {roomLastError && !roomIsConnected ? (
            <p className="mt-2 text-xs font-semibold text-red-200">{roomLastError}</p>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[22px] border border-cyan/20 bg-cyan/10 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">You</div>
            <div className="mt-2 text-lg font-black text-white">{roomModel.yourTaskLabel}</div>
            <p className="mt-2 text-sm leading-6 text-cyan-50/90">{roomModel.yourTaskDetail}</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-300">Opponent</div>
            <div className="mt-2 text-lg font-black text-white">{roomModel.opponentTaskLabel}</div>
            <p className="mt-2 text-sm leading-6 text-gray-300">{roomModel.opponentTaskDetail}</p>
          </div>
        </div>
      </section>

      <section className="arena-stage overflow-hidden rounded-[32px] border border-borderSoft p-4 sm:p-6">
        {roomModel.canStartBattle ? (
          <div className="relative z-10 mb-4 rounded-[24px] border border-fuchsia-300/30 bg-fuchsia-500/12 px-4 py-4 text-center arena-ready-glow">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fuchsia-100/80">Battle Ready</div>
            <div className="mt-2 text-xl font-black text-white">Both Martians are in. Either trainer can start the battle now.</div>
          </div>
        ) : null}

        <div className="relative z-10 grid gap-4 lg:grid-cols-[1fr_120px_1fr] lg:items-center">
          <ArenaMonsterPanel
            title="Player A"
            address={playerAAddress}
            monster={playerAMonster}
            ready={sideAHasMonster}
            side="left"
            stateLabel={sideAHasMonster ? 'Deposited' : playerAAddress ? 'Waiting' : 'Open'}
          />

          <div className="grid place-items-center">
            <div className="arena-versus-ring"><span>VS</span></div>
          </div>

          <ArenaMonsterPanel
            title="Player B"
            address={playerBAddress}
            monster={playerBMonster}
            ready={sideBHasMonster}
            side="right"
            stateLabel={sideBHasMonster ? 'Deposited' : playerBAddress ? 'Waiting' : 'Open'}
          />
        </div>

        <div className="relative z-10 mt-4 grid gap-3 lg:grid-cols-2">
          {[
            {
              title: 'Player A',
              isYou: Boolean(accountAddress && playerAAddress === accountAddress),
              deposited: sideAHasMonster,
              canWithdrawNow: Boolean(sideAHasMonster && match?.status === 0),
              stakeLabel: `${toSui(match?.stake_a ?? '0')} SUI`,
            },
            {
              title: 'Player B',
              isYou: Boolean(accountAddress && playerBAddress === accountAddress),
              deposited: sideBHasMonster,
              canWithdrawNow: Boolean(sideBHasMonster && match?.status === 0),
              stakeLabel: `${toSui(match?.stake_b ?? '0')} SUI`,
            },
          ].map((side) => (
            <div key={side.title} className="rounded-[22px] border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-black uppercase tracking-[0.16em] text-white/80">{side.title}</div>
                {side.isYou ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white">YOU</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${side.deposited ? 'border-green-300/35 bg-green-500/15 text-green-100' : 'border-white/10 bg-white/5 text-gray-300'}`}>
                  {side.deposited ? 'Deposited' : 'Waiting'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-gray-200">
                  Stake {side.stakeLabel}
                </span>
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${side.canWithdrawNow ? 'border-red-300/35 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/5 text-gray-300'}`}>
                  {side.canWithdrawNow ? 'Can Withdraw' : withdrawLocked && side.deposited ? 'Locked In' : 'Safe'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showLoadoutSummary ? (
        <section className="glass-card space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Your Loadout</div>
              <div className="mt-1 text-xl font-black text-white">
                {roomModel.playerDeposited ? 'Locked in for battle' : 'Waiting for the next setup step'}
              </div>
            </div>
            {selectedMonster ? (
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-gray-200">
                {selectedMonster.name}
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Martian</div>
              <div className="mt-2 text-lg font-black text-white">
                {roomModel.playerDeposited
                  ? (roomModel.playerSide === 'a' ? playerAMonster?.name : playerBMonster?.name) ?? 'Deposited'
                  : selectedMonster?.name ?? 'None selected'}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Wager</div>
              <div className="mt-2 text-lg font-black text-white">
                {roomModel.playerSide === 'a'
                  ? `${toSui(match?.stake_a ?? '0')} SUI`
                  : roomModel.playerSide === 'b'
                    ? `${toSui(match?.stake_b ?? '0')} SUI`
                    : `${selectedStake} SUI`}
              </div>
            </div>
          </div>
          {roomModel.canWithdraw ? (
            <div className="rounded-[18px] border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              Safety exit is still open. You can withdraw until the other trainer deposits.
            </div>
          ) : roomModel.playerDeposited ? (
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
              Your Martian is already locked into the pool. Withdraw closes once both Martians are deposited because the contract locks the match.
            </div>
          ) : null}
        </section>
      ) : (
        <>
          <section className="glass-card space-y-4 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Your Monsters</div>
                <div className="mt-1 text-xl font-black text-white">Tap one to bring it in</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-200">
                {monsters.length} ready
              </div>
            </div>
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
              {monsters.map((monster) => {
                const selected = monster.objectId === selectedMonsterId;
                return (
                  <button
                    key={monster.objectId}
                    className={`w-[170px] shrink-0 rounded-[24px] border p-3 text-left disabled:opacity-45 ${selected ? 'border-purple/70 bg-purple/15' : 'border-borderSoft bg-black/20'}`}
                    onClick={() => onPickMonster(monster.objectId)}
                    disabled={selectionLocked}
                  >
                    <MonsterImage objectId={monster.objectId} monster={monster} className="aspect-square" />
                    <div className="mt-2 text-lg font-black text-white">{monster.name}</div>
                    <div className="mt-1"><StageBadge stage={monster.stage} /></div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="glass-card space-y-4 p-5 sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Wager</div>
            <div className="text-sm text-gray-300">
              Optional. Pick a wager before you deposit.
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {STAKE_OPTIONS.map((option) => (
                <button
                  key={option}
                  className={`min-h-[62px] rounded-[18px] border text-base font-black disabled:opacity-45 ${selectedStake === option ? 'border-cyan/70 bg-cyan/15 text-white' : 'border-borderSoft bg-black/20 text-gray-300'}`}
                  onClick={() => onPickStake(option)}
                  disabled={selectionLocked}
                >
                  {option === '0' ? 'NO' : `${option} SUI`}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {roomNotices.length > 0 ? (
        <section className="glass-card space-y-3 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Room Feed</div>
          <div className="space-y-2">
            {roomNotices.slice(0, 4).map((notice) => (
              <div key={notice.id} className={`rounded-[18px] border px-4 py-3 text-sm ${notice.tone === 'warn' ? 'border-red-300/25 bg-red-500/10 text-red-100' : notice.tone === 'success' ? 'border-green-300/25 bg-green-500/10 text-green-100' : 'border-borderSoft bg-black/20 text-gray-300'}`}>
                {notice.summary}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Room Chat</div>
            <div className="mt-1 text-xl font-black text-white">Talk through the next move</div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-200">
            {roomMessages.length} msgs
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {quickMessages.map((message) => (
            <button
              key={message}
              className="shrink-0 rounded-full border border-cyan/25 bg-cyan/10 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-cyan-50 disabled:opacity-50"
              onClick={() => handleSendChat(message)}
              disabled={!roomIsConnected || actionDisabled}
            >
              {message}
            </button>
          ))}
        </div>

        <div className="rounded-[22px] border border-white/10 bg-black/20 p-3">
          {roomMessages.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-gray-400">
              No messages yet. Use chat to agree on wager, room opening, or who taps battle.
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {[...roomMessages].reverse().map((message) => {
                const own = message.address === accountAddress;
                return (
                  <div
                    key={message.id}
                    className={`rounded-[18px] border px-4 py-3 ${own ? 'border-cyan/30 bg-cyan/10' : 'border-white/10 bg-white/5'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-black uppercase tracking-[0.14em] text-white/70">
                        {own ? 'You' : short(message.address)}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-white">{message.text}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="min-h-[60px] rounded-[18px] border border-borderSoft bg-black/20 px-4 text-base text-white outline-none transition focus:border-cyan/50"
            placeholder="Type a room message..."
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSendChat(chatDraft);
              }
            }}
            disabled={!roomIsConnected || actionDisabled}
            maxLength={280}
          />
          <button
            className="min-h-[60px] rounded-[18px] bg-gradient-to-r from-cyan-400 to-blue-500 px-5 text-base font-black uppercase tracking-[0.14em] text-slate-950 disabled:opacity-50"
            onClick={() => handleSendChat(chatDraft)}
            disabled={!roomIsConnected || actionDisabled || !chatDraft.trim()}
          >
            Send
          </button>
        </div>
      </section>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-borderSoft bg-background/95 px-4 py-3 shadow-[0_-18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="mx-auto max-w-5xl space-y-3">
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan/80">{guide.eyebrow}</div>
            <div className="mt-1 text-lg font-black text-white">{guide.title}</div>
            <div className="mt-1 text-sm text-gray-200">{guide.body}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.7fr]">
            <button
              className={`min-h-[68px] rounded-[22px] border text-base font-black uppercase tracking-[0.14em] disabled:opacity-50 ${
                roomModel.canWithdraw
                  ? 'border-red-300/35 bg-red-500/15 text-red-100'
                  : 'border-white/10 bg-white/5 text-gray-200'
              }`}
              onClick={roomModel.canWithdraw ? onWithdraw : onBackLobby}
              disabled={actionDisabled}
            >
              {roomModel.canWithdraw ? 'Withdraw Safely' : resolution ? 'Back To Lobby' : withdrawLocked ? 'Pool Locked' : 'Back To Lobby'}
            </button>
            <button
              className={`min-h-[76px] rounded-[24px] px-5 text-lg font-black uppercase tracking-[0.16em] text-white disabled:opacity-50 ${
                roomModel.canStartBattle
                  ? `arena-ready-glow arena-battle-shake bg-gradient-to-r ${guide.primaryTone}`
                  : guide.primaryDisabled
                    ? 'border border-borderSoft bg-black/20 text-gray-300'
                    : `bg-gradient-to-r ${guide.primaryTone}`
              }`}
              onClick={guide.primaryAction}
              disabled={guide.primaryDisabled}
            >
              {guide.primaryLabel}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-gray-200">
              You: {roomModel.playerDeposited ? 'Deposited' : 'Picking'}
            </div>
            <div className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-gray-200">
              Opponent: {roomModel.opponentDeposited ? 'Deposited' : 'Waiting'}
            </div>
            <div className={`rounded-[18px] border px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] ${roomModel.canWithdraw ? 'border-red-300/35 bg-red-500/15 text-red-100' : 'border-white/10 bg-white/5 text-gray-300'}`}>
              {roomModel.canWithdraw ? 'Safety Exit Open' : 'Safety Exit Closed'}
            </div>
            <div className={`rounded-[18px] border px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] ${roomModel.canStartBattle ? 'border-fuchsia-300/35 bg-fuchsia-500/15 text-fuchsia-50' : 'border-white/10 bg-white/5 text-gray-300'}`}>
              {roomModel.canStartBattle ? 'Battle Live' : flowStep === 0 ? 'Choose Room' : flowStep === 1 ? 'Open Room' : flowStep === 2 ? 'Deposit Step' : 'Syncing'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
