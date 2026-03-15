import { StageBadge } from '../../components/StageBadge';
import { StatBar } from '../../components/StatBar';
import { MonsterViewport3D } from '../../components/MonsterViewport3D';
import { powerPreview, short } from '../../lib/format';
import type { ArenaMonsterSnapshot, Monster } from '../../lib/types';

type VisualMonster = Partial<Monster & ArenaMonsterSnapshot> & {
  objectId?: string;
  name?: string;
  stage?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  wins?: number;
  losses?: number;
  xp?: number;
  seed?: string;
};

export function ArenaMonsterPanel({
  title,
  address,
  monster,
  ready,
  side,
  hpPercent = 100,
  stateLabel,
}: {
  title: string;
  address?: string;
  monster?: VisualMonster | null;
  ready: boolean;
  side: 'left' | 'right';
  hpPercent?: number;
  stateLabel: string;
}) {
  const hasMonster = Boolean(monster?.objectId);
  const power = monster
    ? powerPreview({
        attack: Number(monster.attack ?? 0),
        defense: Number(monster.defense ?? 0),
        speed: Number(monster.speed ?? 0),
        stage: Number(monster.stage ?? 0),
        xp: Number(monster.xp ?? 0),
      })
    : 0;

  return (
    <article className={`arena-monster-card rounded-[28px] border border-white/10 bg-black/30 p-4 ${ready ? 'arena-ready-glow' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-cyan/80">{title}</div>
          <div className="mt-2 text-xl font-black text-white">{address ? short(address) : 'Open Slot'}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${ready ? 'border border-green-300/40 bg-green-500/15 text-green-100' : 'border border-white/10 bg-white/5 text-gray-200'}`}>
          {stateLabel}
        </span>
      </div>

      <div className="mt-4">
        {hasMonster ? (
          <div className="arena-creature-frame">
            <div className="arena-creature-glow" />
            <div className={`arena-idle-${side} relative z-10 mx-auto h-48 w-48 rounded-full border border-white/10 bg-white/5`} style={side === 'right' ? { transform: 'scaleX(-1)' } : undefined}>
              <MonsterViewport3D
                objectId={monster!.objectId!}
                monster={monster as Monster}
                className="h-full w-full"
                mirrored={side === 'right'}
                priority="arena"
              />
            </div>
            <div className="arena-blink" />
          </div>
        ) : (
          <div className="mx-auto grid h-48 w-48 place-items-center rounded-full border border-dashed border-white/15 bg-white/5 text-center text-lg font-semibold text-gray-400">
            Martian not loaded
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-black text-white">{monster?.name ?? 'Waiting...'}</div>
            {typeof monster?.stage === 'number' ? <StageBadge stage={monster.stage} /> : null}
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-200">
            Power {power}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
            <span>HP</span>
            <span>{Math.max(0, Math.round(hpPercent))}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/10">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-green-400 via-lime-300 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }}
            />
          </div>
        </div>

        {hasMonster ? (
          <div className="space-y-2">
            <StatBar label="ATK" value={Number(monster?.attack ?? 0)} color="bg-red-500" />
            <StatBar label="DEF" value={Number(monster?.defense ?? 0)} color="bg-blue-500" />
            <StatBar label="SPD" value={Number(monster?.speed ?? 0)} color="bg-green-500" />
          </div>
        ) : null}
      </div>
    </article>
  );
}
