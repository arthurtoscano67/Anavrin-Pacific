import { lazy, Suspense } from 'react';

import { toSui, short, statusLabel } from '../../lib/format';
import type { ArenaMatch, MatchResolution } from '../../lib/types';
import type { BattlePreview } from '../battle-engine/battleEngine';
import { PokeHpPanel } from './PokeHpPanel';
import { MonsterImage } from '../../components/MonsterImage';
import { MonsterViewport3D } from '../../components/MonsterViewport3D';
import { useRendererTier } from '../../three/useRendererTier';

const LazyBattleArenaCanvas = lazy(async () => {
  const mod = await import('../../three/MonsterSceneCanvas');
  return { default: mod.BattleArenaCanvas3D };
});

function resolvePose(params: {
  side: 'left' | 'right';
  actor?: 'left' | 'right' | 'none';
  winnerSide?: 'left' | 'right';
  animating: boolean;
}): 'idle' | 'attack' | 'recoil' | 'victory' {
  const { side, actor, winnerSide, animating } = params;
  if (winnerSide === side) return 'victory';
  if (winnerSide && winnerSide !== side) return 'recoil';
  if (!animating || actor === 'none' || !actor) return 'idle';
  return actor === side ? 'attack' : 'recoil';
}

function StaticFallbackStage({
  leftMonster,
  rightMonster,
}: {
  leftMonster?: ArenaMatch['monster_a_data'] | null;
  rightMonster?: ArenaMatch['monster_b_data'] | null;
}) {
  return (
    <div className="relative grid min-h-[320px] gap-4 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,#362361_0%,#0c1023_50%,#06070f_100%)] p-4 sm:min-h-[420px] sm:grid-cols-2 sm:p-6">
      <div className="rounded-[24px] border border-white/10 bg-black/25 p-3">
        {leftMonster?.objectId ? (
          <MonsterImage objectId={leftMonster.objectId} monster={leftMonster as any} className="aspect-square h-full w-full" />
        ) : (
          <div className="grid h-full min-h-[220px] place-items-center rounded-[20px] border border-dashed border-white/10 text-sm text-white/40">Waiting for Martian</div>
        )}
      </div>
      <div className="rounded-[24px] border border-white/10 bg-black/25 p-3">
        {rightMonster?.objectId ? (
          <MonsterImage objectId={rightMonster.objectId} monster={rightMonster as any} className="aspect-square h-full w-full" />
        ) : (
          <div className="grid h-full min-h-[220px] place-items-center rounded-[20px] border border-dashed border-white/10 text-sm text-white/40">Waiting for Martian</div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 grid place-items-center text-4xl font-black text-yellow-100/80 sm:text-6xl">VS</div>
    </div>
  );
}

export function BattleArenaScreen({
  match,
  resolution,
  preview,
  frameIndex,
  animating,
  canAttack,
  pending,
  accountAddress,
  spectator,
  viewerCount,
  onAttack,
  onSpecial,
  onDefend,
  onEmote,
  onBackRoom,
  onBackLobby,
}: {
  match: ArenaMatch | null;
  resolution: MatchResolution | null;
  preview: BattlePreview | null;
  frameIndex: number;
  animating: boolean;
  canAttack: boolean;
  pending: string | null;
  accountAddress?: string;
  spectator: boolean;
  viewerCount?: number;
  onAttack: () => void;
  onSpecial: () => void;
  onDefend: () => void;
  onEmote: () => void;
  onBackRoom: () => void;
  onBackLobby: () => void;
}) {
  const { allow3D } = useRendererTier('arena');

  if (!match) {
    return (
      <div className="poke-ui-box p-8 text-center">
        <p className="poke-label mb-4">No battle loaded.</p>
        <button className="poke-btn-fight" onClick={onBackLobby}>Go to Lobby</button>
      </div>
    );
  }

  const currentFrame = preview?.frames[Math.min(frameIndex, Math.max(0, (preview?.frames.length ?? 1) - 1))];
  const totalStake = Number(match.stake_a || '0') + Number(match.stake_b || '0');

  const isPlayerA = match.player_a === accountAddress;
  const myMonster = isPlayerA ? match.monster_a_data ?? match.monster_b_data : match.monster_b_data ?? match.monster_a_data;
  const enemyMonster = isPlayerA ? match.monster_b_data ?? match.monster_a_data : match.monster_a_data ?? match.monster_b_data;
  const myHp = Math.max(0, Math.min(100, isPlayerA ? (currentFrame?.leftHp ?? 100) : (currentFrame?.rightHp ?? 100)));
  const enemyHp = Math.max(0, Math.min(100, isPlayerA ? (currentFrame?.rightHp ?? 100) : (currentFrame?.leftHp ?? 100)));

  const winnerSide = resolution
    ? resolution.winner === match.player_a ? 'left' : 'right'
    : currentFrame?.winnerSide;

  const winnerMonster = resolution
    ? match.monster_a_data?.objectId === resolution.winnerMonsterId
      ? match.monster_a_data
      : match.monster_b_data?.objectId === resolution.winnerMonsterId
        ? match.monster_b_data
        : null
    : null;

  const winnerName = winnerMonster?.name
    ?? (resolution?.winner === match.player_a ? match.monster_a_data?.name : match.monster_b_data?.name)
    ?? 'Champion Martian';

  const battleLog = resolution
    ? `${short(resolution.winner)} wins! Payout: ${toSui(resolution.totalPayoutMist)} SUI`
    : match.status === 2
      ? 'Battle finished on-chain. Martians returned to their wallets.'
    : currentFrame?.label ?? (canAttack
      ? `What will ${myMonster?.name ?? 'your Martian'} do?`
      : 'Waiting for both players…');

  const leftPose = resolvePose({ side: 'left', actor: currentFrame?.actor, winnerSide, animating });
  const rightPose = resolvePose({ side: 'right', actor: currentFrame?.actor, winnerSide, animating });

  return (
    <div className="poke-battle-root select-none font-mono">
      <div className="mb-3 flex items-center justify-between text-xs text-white/50">
        <div className="flex flex-wrap gap-1">
          <span className="poke-chip">{short(match.objectId)}</span>
          <span className="poke-chip">{toSui(totalStake)} SUI</span>
          <span className="poke-chip">{statusLabel(match.status)}</span>
          {spectator && <span className="poke-chip poke-chip-cyan">Spectator</span>}
          <span className="poke-chip">{viewerCount ?? 0} watching</span>
          <span className={`poke-chip ${allow3D ? 'poke-chip-cyan' : ''}`}>{allow3D ? '3D Arena' : 'Lite Mode'}</span>
        </div>
        <div className="flex gap-1">
          <button className="poke-chip hover:bg-white/15" onClick={onBackRoom}>Room</button>
          <button className="poke-chip hover:bg-white/15" onClick={onBackLobby}>Lobby</button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#070a14] shadow-[0_28px_80px_rgba(9,5,24,0.45)]">
        <div className="absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/35 to-transparent" />
        <div className="absolute left-4 top-4 z-20 w-[12.5rem] max-w-[45vw] sm:w-56">
          <PokeHpPanel
            name={enemyMonster?.name ?? 'Enemy'}
            stage={enemyMonster?.stage ?? 0}
            hpPct={enemyHp}
            showHpNumber={false}
            isWinner={winnerSide === (isPlayerA ? 'right' : 'left')}
          />
        </div>
        <div className="absolute bottom-4 right-4 z-20 w-[13rem] max-w-[52vw] sm:w-56">
          <PokeHpPanel
            name={myMonster?.name ?? 'Your Martian'}
            stage={myMonster?.stage ?? 0}
            hpPct={myHp}
            showHpNumber
            xp={myMonster?.xp ?? 0}
            isWinner={winnerSide === (isPlayerA ? 'left' : 'right')}
          />
        </div>

        {allow3D ? (
          <Suspense fallback={<StaticFallbackStage leftMonster={match.monster_a_data} rightMonster={match.monster_b_data} />}>
            <LazyBattleArenaCanvas
              className="h-[360px] w-full sm:h-[460px] lg:h-[560px]"
              leftMonster={match.monster_a_data}
              rightMonster={match.monster_b_data}
              leftPose={leftPose}
              rightPose={rightPose}
              winnerSide={winnerSide}
            />
          </Suspense>
        ) : (
          <StaticFallbackStage leftMonster={match.monster_a_data} rightMonster={match.monster_b_data} />
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 overflow-hidden rounded-2xl border-4 border-[#1a1a2e] md:grid-cols-[1fr_auto]">
        <div className="poke-textbox flex min-h-[84px] items-center px-5 py-3">
          <p className="poke-battle-text leading-snug">{battleLog}</p>
        </div>

        <div className="grid grid-cols-2 border-t-4 border-[#1a1a2e] md:border-l-4 md:border-t-0">
          <button className="poke-move-btn poke-move-fight" onClick={onAttack} disabled={!canAttack || pending !== null}>⚔ FIGHT</button>
          <button className="poke-move-btn poke-move-special" onClick={onSpecial} disabled={!canAttack || pending !== null}>✦ SPECIAL</button>
          <button className="poke-move-btn poke-move-defend" onClick={onDefend} disabled={pending !== null}>🛡 DEFEND</button>
          <button className="poke-move-btn poke-move-run" onClick={onEmote} disabled={pending !== null}>♟ EMOTE</button>
        </div>
      </div>

      {resolution && (
        <div className="mt-4 space-y-3">
          <div className="poke-ui-box grid gap-4 p-4 sm:grid-cols-[240px_1fr] sm:items-center">
            <div className="rounded-2xl border border-yellow-300/20 bg-gradient-to-b from-yellow-300/10 via-fuchsia-300/5 to-transparent p-3">
              <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-200/80">Winner</div>
              <div className="mx-auto h-48 w-full max-w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 shadow-[0_0_24px_rgba(250,204,21,0.18)]">
                <MonsterViewport3D
                  objectId={resolution.winnerMonsterId}
                  monster={winnerMonster as any}
                  className="h-full w-full"
                  priority="arena"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Champion Martian</div>
                <div className="mt-1 text-2xl font-black text-yellow-100">{winnerName}</div>
                <div className="mt-1 text-sm font-semibold text-green-300">{short(resolution.winner)} wins the battle</div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Winner', value: short(resolution.winner), color: 'text-green-300' },
                  { label: 'Winner Mon', value: short(resolution.winnerMonsterId), color: 'text-white' },
                  { label: 'Loser Mon', value: short(resolution.loserMonsterId), color: 'text-white' },
                  { label: 'Payout', value: `${toSui(resolution.totalPayoutMist)} SUI`, color: 'text-yellow-200' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</div>
                    <div className={`mt-1 text-lg font-black ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
