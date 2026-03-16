import { webEnv } from "../env";
import { getAnalyticsCollectorBaseUrl } from "./analytics";
import { publicSuiJsonRpcClient } from "./sui-jsonrpc";

type EventCursor = Parameters<typeof publicSuiJsonRpcClient.queryEvents>[0]["cursor"];

export type SiteAnalyticsSummary = {
  visitors: {
    totalUnique: number;
    todayUnique: number;
  };
  pageViews: {
    total: number;
    today: number;
    last7Days: number;
    last30Days: number;
  };
  events: {
    total: Record<string, number>;
    today: Record<string, number>;
  };
  collectorTimeZone: string | null;
  updatedAt: string | null;
};

export type MintAnalyticsSummary = {
  total: number;
  today: number;
  latestMintedAt: string | null;
};

function normalizeCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizeCounterMap(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, number>;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, normalizeCount(entry)] as const)
      .filter(([, entry]) => entry > 0),
  );
}

export async function fetchSiteAnalyticsSummary() {
  const baseUrl = getAnalyticsCollectorBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const response = await fetch(new URL("/api/analytics/admin", baseUrl));
  if (!response.ok) {
    throw new Error(`Site analytics lookup failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const visitors =
    payload.visitors && typeof payload.visitors === "object"
      ? (payload.visitors as Record<string, unknown>)
      : {};
  const pageViews =
    payload.pageViews && typeof payload.pageViews === "object"
      ? (payload.pageViews as Record<string, unknown>)
      : {};
  const events =
    payload.events && typeof payload.events === "object"
      ? (payload.events as Record<string, unknown>)
      : {};

  return {
    visitors: {
      totalUnique: normalizeCount(visitors.totalUnique),
      todayUnique: normalizeCount(visitors.todayUnique),
    },
    pageViews: {
      total: normalizeCount(pageViews.total),
      today: normalizeCount(pageViews.today),
      last7Days: normalizeCount(pageViews.last7Days),
      last30Days: normalizeCount(pageViews.last30Days),
    },
    events: {
      total: normalizeCounterMap(events.total),
      today: normalizeCounterMap(events.today),
    },
    collectorTimeZone:
      typeof payload.collectorTimeZone === "string" ? payload.collectorTimeZone : null,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
  } satisfies SiteAnalyticsSummary;
}

export async function fetchOnChainMintSummary(packageId = webEnv.avatarPackageId) {
  const normalizedPackageId = packageId.trim();
  if (!normalizedPackageId || normalizedPackageId === "0x0") {
    return {
      total: 0,
      today: 0,
      latestMintedAt: null,
    } satisfies MintAnalyticsSummary;
  }

  const eventType = `${normalizedPackageId}::avatar::AvatarMinted`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  let cursor: EventCursor = null;
  let hasNextPage = true;
  let total = 0;
  let today = 0;
  let latestMintedAt: string | null = null;

  while (hasNextPage) {
    const page = await publicSuiJsonRpcClient.queryEvents({
      query: {
        MoveEventType: eventType,
      },
      cursor,
      limit: 100,
      order: "descending",
    });

    if (!latestMintedAt) {
      const latestTimestamp = Number(page.data[0]?.timestampMs ?? 0);
      latestMintedAt = latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
    }

    for (const event of page.data) {
      total += 1;
      const timestampMs = Number(event.timestampMs ?? 0);
      if (timestampMs >= startOfTodayMs) {
        today += 1;
      }
    }

    cursor = page.nextCursor;
    hasNextPage = Boolean(page.hasNextPage && page.nextCursor);
  }

  return {
    total,
    today,
    latestMintedAt,
  } satisfies MintAnalyticsSummary;
}
