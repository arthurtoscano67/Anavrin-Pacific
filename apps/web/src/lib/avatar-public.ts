import type { ShooterStats } from "@pacific/shared";
import { webEnv } from "../env";
import { buildQueryAppHref } from "./app-paths";

const WALRUS_PUBLIC_BLOB_BASE_URL = "https://aggregator.walrus-mainnet.walrus.space/v1/blobs";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildAppBaseFallback() {
  if (typeof window === "undefined") {
    return trimTrailingSlash(webEnv.projectUrl);
  }

  return trimTrailingSlash(new URL(import.meta.env.BASE_URL, window.location.origin).toString());
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  ) {
    return true;
  }

  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }

  const match = normalized.match(/^172\.(\d+)\./);
  if (match) {
    const secondOctet = Number(match[1]);
    if (Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

export function isPublicHttpUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function hasPublicAssetGateway() {
  return isPublicHttpUrl(webEnv.publicAssetBaseUrl);
}

export function resolvePublicAppBaseUrl() {
  return trimTrailingSlash(webEnv.publicAppBaseUrl || buildAppBaseFallback());
}

export function resolveMintProjectUrl() {
  return trimTrailingSlash(webEnv.projectUrl || resolvePublicAppBaseUrl());
}

function buildAppRouteUrl(
  baseUrl: string,
  page: string | null,
  params?: Record<string, string | number | boolean | null | undefined>,
) {
  const url = new URL(`${trimTrailingSlash(baseUrl)}/`);
  if (page) {
    url.searchParams.set("page", page);
  } else {
    url.searchParams.delete("page");
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    if (key === "page") {
      continue;
    }

    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export function buildAvatarProfileUrl(avatarObjectId: string) {
  return buildAppRouteUrl(resolvePublicAppBaseUrl(), "profile", {
    avatarObjectId,
  });
}

export function buildCurrentAvatarProfileHref(avatarObjectId: string) {
  return buildQueryAppHref("/profile", {
    avatarObjectId,
  });
}

export function buildPublicAssetUrl(blobId: string) {
  const base = trimTrailingSlash(webEnv.publicAssetBaseUrl || webEnv.apiBaseUrl);
  return `${base}/preview/${encodeURIComponent(blobId)}`;
}

export function buildWalrusBlobReadUrl(blobId: string) {
  return `${WALRUS_PUBLIC_BLOB_BASE_URL}/${encodeURIComponent(blobId)}`;
}

export function buildShooterStatsSummary(stats: ShooterStats) {
  return `W ${stats.wins} | L ${stats.losses} | HP ${stats.hp}`;
}

export function buildAvatarDisplayDescription(description: string, stats: ShooterStats) {
  const trimmedDescription = description.trim();
  const statsSummary = buildShooterStatsSummary(stats);
  return trimmedDescription
    ? `${trimmedDescription} Stats: ${statsSummary}`
    : `Stats: ${statsSummary}`;
}
