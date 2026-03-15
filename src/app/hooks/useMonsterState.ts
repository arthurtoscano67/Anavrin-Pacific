import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';

import { parseMonster } from '../lib/sui';
import type { ArenaMonsterSnapshot, Monster } from '../lib/types';
import { resolveMonster3D, type MonsterSeedSource } from '../three/monster3d';

type MonsterStateInput = MonsterSeedSource | ArenaMonsterSnapshot | Monster | null | undefined;

function hasResolvedSeed(monster?: MonsterStateInput): boolean {
  return Boolean(monster?.objectId && typeof monster.seed === 'string' && typeof monster.stage === 'number');
}

export function useMonsterState(objectId?: string, initialMonster?: MonsterStateInput) {
  const client = useSuiClient();

  const query = useQuery({
    queryKey: ['monsterState', objectId],
    enabled: Boolean(objectId),
    staleTime: 10_000,
    queryFn: async () => {
      if (!objectId) return null;
      const response = await client.getObject({
        id: objectId,
        options: { showContent: true, showType: true, showDisplay: true },
      });
      if (!response.data) return null;
      return parseMonster(response.data, 'wallet');
    },
  });

  const monster = useMemo(() => {
    if (query.data?.objectId) {
      return resolveMonster3D(query.data);
    }
    if (hasResolvedSeed(initialMonster)) {
      return resolveMonster3D(initialMonster as MonsterSeedSource);
    }
    if (objectId) {
      return resolveMonster3D({ ...(initialMonster ?? {}), objectId });
    }
    return null;
  }, [initialMonster, objectId, query.data]);

  return {
    ...query,
    monster,
  };
}
