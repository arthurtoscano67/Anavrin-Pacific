import { lazy, Suspense, useMemo } from 'react';

import { useMonsterState } from '../hooks/useMonsterState';
import { MonsterImage } from './MonsterImage';
import { useRendererTier } from '../three/useRendererTier';
import type { ArenaMonsterSnapshot, Monster } from '../lib/types';

const LazyPortraitCanvas = lazy(async () => {
  const mod = await import('../three/MonsterSceneCanvas');
  return { default: mod.MonsterPortraitCanvas };
});

type MonsterViewport3DProps = {
  objectId: string;
  monster?: Partial<Monster & ArenaMonsterSnapshot> | null;
  className?: string;
  mirrored?: boolean;
  priority?: 'portrait' | 'arena';
};

export function MonsterViewport3D({
  objectId,
  monster,
  className = '',
  mirrored = false,
  priority = 'portrait',
}: MonsterViewport3DProps) {
  const { allow3D } = useRendererTier(priority);
  const seedInput = monster ? { objectId, ...monster } : undefined;
  const { monster: resolved } = useMonsterState(objectId, seedInput);
  const fallbackMonster = useMemo(() => monster ?? resolved ?? null, [monster, resolved]);

  if (!allow3D || !resolved) {
    return <MonsterImage objectId={objectId} monster={fallbackMonster as Monster | null} className={className} />;
  }

  return (
    <Suspense fallback={<MonsterImage objectId={objectId} monster={fallbackMonster as Monster | null} className={className} />}>
      <LazyPortraitCanvas className={className} monster={resolved} mirrored={mirrored} />
    </Suspense>
  );
}
