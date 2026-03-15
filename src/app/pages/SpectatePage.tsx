import { useParams } from 'react-router-dom';

import { PageShell } from '../components/PageShell';
import { MatchRouteView } from '../arena/MatchRouteView';

export function SpectatePage() {
  const { matchId = '' } = useParams();

  return (
    <PageShell title="Spectate" subtitle="Watch the current MartianMatch without control access.">
      <MatchRouteView matchId={matchId} spectatorOnly />
    </PageShell>
  );
}
