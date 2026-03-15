import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';

import { fetchArenaMatch, fetchMatchResolution, fetchSyntheticMatchResolution } from '../lib/sui';

export function useBattleMatch(matchId?: string) {
  const client = useSuiClient();

  return useQuery({
    queryKey: ['battleMatch', matchId],
    enabled: Boolean(matchId),
    refetchInterval: 3_000,
    queryFn: async () => {
      if (!matchId) {
        return { match: null, resolution: null };
      }

      const match = await fetchArenaMatch(client, matchId);
      let resolution = await fetchMatchResolution(client, matchId);
      if (!resolution && match?.status === 2) {
        resolution = await fetchSyntheticMatchResolution(client, match);
      }

      return { match, resolution };
    },
  });
}
