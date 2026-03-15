import type { BattleListKind, BattleListResponse, BattleSummary } from './types';
import { buildArenaHttpUrl } from './socket';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildArenaHttpUrl(path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Arena service request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function fetchLobbyStats(): Promise<{ onlineCount: number; queueCount: number }> {
  return fetchJson('/api/lobby/snapshot');
}

export async function fetchBattleList(kind: BattleListKind, page = 1, pageSize = 6): Promise<BattleListResponse> {
  const query = new URLSearchParams({ kind, page: String(page), pageSize: String(pageSize) });
  return fetchJson(`/api/battles?${query.toString()}`);
}

export async function fetchBattleSummary(matchId: string): Promise<BattleSummary | null> {
  const result = await fetchJson<{ summary: BattleSummary | null }>(`/api/battles/${matchId}`);
  return result.summary;
}

export async function upsertBattleSummary(summary: BattleSummary): Promise<BattleSummary> {
  const result = await fetchJson<{ summary: BattleSummary }>(`/api/battles/${summary.matchId}`, {
    method: 'POST',
    body: JSON.stringify(summary),
  });
  return result.summary;
}
