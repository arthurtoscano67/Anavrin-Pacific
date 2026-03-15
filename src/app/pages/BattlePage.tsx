import { useParams } from 'react-router-dom';

import { PageShell } from '../components/PageShell';
import { MatchRouteView } from '../arena/MatchRouteView';

export function BattlePage() {
  const { matchId = '' } = useParams();

  return (
    <PageShell title="Battle" subtitle="This page loads one MartianMatch and restores it from chain.">
      <MatchRouteView matchId={matchId} />
    </PageShell>
  );
}
