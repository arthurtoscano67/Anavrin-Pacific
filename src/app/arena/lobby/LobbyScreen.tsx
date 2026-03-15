import { short } from '../../lib/format';
import type { ArenaMatch, Monster } from '../../lib/types';
import type { LobbyConnectionState, LobbyInvite, LobbyOpenMatch, LobbyPlayer } from '../network/types';
import { MonsterImage } from '../../components/MonsterImage';
import { StageBadge } from '../../components/StageBadge';
import { spectatorSummary } from '../battle-engine/battleEngine';

export function LobbyScreen({
  totalPlayers,
  players,
  selfPlayer,
  invites,
  openMatches,
  liveMatches,
  selectedMonsterId,
  monsters,
  pending,
  connectionState,
  lastError,
  onPickMonster,
  onInvite,
  onAcceptInvite,
  onJoinOpenMatch,
  onWatchMatch,
}: {
  totalPlayers: number;
  players: LobbyPlayer[];
  selfPlayer?: LobbyPlayer | null;
  invites: LobbyInvite[];
  openMatches: LobbyOpenMatch[];
  liveMatches: ArenaMatch[];
  selectedMonsterId: string;
  monsters: Monster[];
  pending: string | null;
  connectionState: LobbyConnectionState;
  lastError?: string | null;
  onPickMonster: (monsterId: string) => void;
  onInvite: (address: string) => void;
  onAcceptInvite: (invite: LobbyInvite) => void;
  onJoinOpenMatch: (match: LobbyOpenMatch) => void;
  onWatchMatch: (matchId: string) => void;
}) {
  const statusTone = connectionState === 'open'
    ? 'border-green-300/30 bg-green-500/10 text-green-100'
    : connectionState === 'connecting'
      ? 'border-yellow-300/30 bg-yellow-500/10 text-yellow-100'
      : 'border-red-300/30 bg-red-500/10 text-red-100';
  const statusLabel = connectionState === 'open'
    ? 'Live'
    : connectionState === 'connecting'
      ? 'Connecting'
      : 'Offline';

  return (
    <div className="space-y-4">
      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div className="space-y-2 text-center sm:text-left">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan/80">Martians</div>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Battle Arena</h2>
        </div>

        {invites.length > 0 ? (
          <div className="grid gap-3">
            {invites.map((invite) => (
              <article key={invite.id} className="rounded-[26px] border border-purple/30 bg-gradient-to-br from-purple/20 to-pink-500/10 p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-purple-100">Invite waiting</div>
                <div className="mt-2 text-2xl font-black text-white">{short(invite.from)} wants to battle</div>
                <div className="mt-1 text-sm text-gray-300">{invite.monsterName} • Level {invite.level}</div>
                <button
                  className="mt-4 min-h-[72px] w-full rounded-[24px] bg-gradient-to-r from-green-400 to-emerald-500 text-lg font-black text-slate-950 shadow-[0_18px_40px_rgba(34,197,94,0.25)] disabled:opacity-50"
                  onClick={() => onAcceptInvite(invite)}
                  disabled={pending !== null || monsters.length === 0}
                >
                  ACCEPT!
                </button>
              </article>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-[24px] border border-borderSoft bg-black/20 px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Players Online</div>
            <div className="mt-1 text-3xl font-black text-white">{totalPlayers}</div>
          </div>
          <div className={`rounded-full border px-4 py-2 text-sm font-black ${statusTone}`}>{statusLabel}</div>
        </div>

        {lastError && connectionState !== 'open' ? (
          <div className="rounded-[20px] border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {lastError}
          </div>
        ) : null}

        <div className="space-y-3">
          {selfPlayer ? (
            <article className="flex items-center justify-between gap-3 rounded-[24px] border border-green-300/20 bg-green-500/5 px-4 py-4">
              <div className="min-w-0">
                <div className="text-xl font-black text-white">🟢 {short(selfPlayer.address)} <span className="text-sm text-green-200">YOU</span></div>
                <div className="mt-1 truncate text-sm text-gray-300">{selfPlayer.monsterName} • Level {selfPlayer.level}</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-gray-200">
                Online
              </div>
            </article>
          ) : null}

          {players.length === 0 ? (
            <div className="rounded-[24px] border border-borderSoft bg-black/20 p-4 text-center text-gray-400">
              {selfPlayer ? 'Only you are online right now.' : 'No trainers online right now.'}
            </div>
          ) : (
            players.map((player) => (
              <article key={player.address} className="flex items-center justify-between gap-3 rounded-[24px] border border-borderSoft bg-black/20 px-4 py-4">
                <div className="min-w-0">
                  <div className="text-xl font-black text-white">🟢 {short(player.address)}</div>
                  <div className="mt-1 truncate text-sm text-gray-300">{player.monsterName} • Level {player.level}</div>
                </div>
                <button
                  className="min-h-[60px] shrink-0 rounded-[20px] bg-gradient-to-r from-cyan-400 to-blue-500 px-5 text-base font-black text-slate-950 disabled:opacity-50"
                  onClick={() => onInvite(player.address)}
                  disabled={pending !== null || !selectedMonsterId}
                >
                  INVITE
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="glass-card space-y-4 p-5 sm:p-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Your Monsters</div>
          <div className="mt-2 text-2xl font-black text-white">Pick your Martian</div>
        </div>
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
          {monsters.map((monster) => {
            const selected = monster.objectId === selectedMonsterId;
            return (
              <button
                key={monster.objectId}
                className={`w-[180px] shrink-0 rounded-[26px] border p-3 text-left transition ${selected ? 'border-purple/70 bg-purple/15 shadow-[0_18px_40px_rgba(139,92,246,0.18)]' : 'border-borderSoft bg-black/20'}`}
                onClick={() => onPickMonster(monster.objectId)}
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
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="glass-card space-y-3 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Open Rooms</div>
          {openMatches.length === 0 ? (
            <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">No open rooms.</div>
          ) : (
            openMatches.map((match) => (
              <article key={match.id} className="rounded-[22px] border border-borderSoft bg-black/20 p-4">
                <div className="text-lg font-black text-white">{match.creatorMonster}</div>
                <div className="mt-1 text-sm text-gray-300">{short(match.creator)} • {match.stakeSui || '0'} SUI</div>
                <button
                  className="mt-4 min-h-[58px] w-full rounded-[18px] bg-gradient-to-r from-fuchsia-400 to-pink-500 text-base font-black text-slate-950 disabled:opacity-50"
                  onClick={() => onJoinOpenMatch(match)}
                  disabled={pending !== null || !selectedMonsterId}
                >
                  JOIN ROOM
                </button>
              </article>
            ))
          )}
        </div>

        <div className="glass-card space-y-3 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Live Battles</div>
          {liveMatches.length === 0 ? (
            <div className="rounded-[22px] border border-borderSoft bg-black/20 p-4 text-sm text-gray-400">No live battles to watch.</div>
          ) : (
            liveMatches.map((match) => (
              <article key={match.objectId} className="rounded-[22px] border border-borderSoft bg-black/20 p-4">
                <div className="text-lg font-black text-white">{spectatorSummary(match)}</div>
                <div className="mt-1 text-sm text-gray-300">Battle ID {short(match.objectId)}</div>
                <button
                  className="mt-4 min-h-[58px] w-full rounded-[18px] bg-gradient-to-r from-amber-300 to-yellow-400 text-base font-black text-slate-950"
                  onClick={() => onWatchMatch(match.objectId)}
                >
                  WATCH
                </button>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
