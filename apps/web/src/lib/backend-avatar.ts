import { webEnv } from "../env";
import type { ShooterCharacter, ShooterStats, WalrusAvatarStorage } from "@pacific/shared";

function normalizeShooterStats(value: unknown): ShooterStats {
  if (!value || typeof value !== "object") {
    return { wins: 0, losses: 0, hp: 100 };
  }

  const payload = value as Record<string, unknown>;
  const wins = Number(payload.wins);
  const losses = Number(payload.losses);
  const hp = Number(payload.hp);
  return {
    wins: Number.isFinite(wins) && wins >= 0 ? Math.floor(wins) : 0,
    losses: Number.isFinite(losses) && losses >= 0 ? Math.floor(losses) : 0,
    hp: Number.isFinite(hp) && hp >= 0 ? Math.floor(hp) : 100,
  };
}

export type BackendOwnedAvatar = {
  objectId: string;
  objectType: string | null;
  name: string | null;
  manifestBlobId: string | null;
  previewBlobId: string | null;
  previewUrl: string | null;
  modelUrl: string | null;
  runtimeAvatarBlobId: string | null;
  txDigest: string | null;
  status: string | null;
  runtimeReady: boolean;
  updatedAt: string | null;
  isActive: boolean;
  location: "wallet" | "kiosk";
  kioskId: string | null;
  isListed: boolean;
  listedPriceMist: string | null;
  ownerWalletAddress: string | null;
  source: "object-state" | "manifest-cache" | "on-chain";
  shooterStats: ShooterStats;
  shooterCharacter: ShooterCharacter | null;
  walrusStorage: WalrusAvatarStorage | null;
};

export type MarketplaceListingsResponse = {
  listings: BackendOwnedAvatar[];
};

function normalizeWalrusBlobStorage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (
    typeof payload.blobId !== "string" ||
    typeof payload.blobObjectId !== "string"
  ) {
    return null;
  }

  const startEpoch = Number(payload.startEpoch);
  const endEpoch = Number(payload.endEpoch);

  return {
    blobId: payload.blobId,
    blobObjectId: payload.blobObjectId,
    startEpoch:
      Number.isFinite(startEpoch) && startEpoch >= 0 ? Math.floor(startEpoch) : null,
    endEpoch: Number.isFinite(endEpoch) && endEpoch > 0 ? Math.floor(endEpoch) : null,
    deletable: typeof payload.deletable === "boolean" ? payload.deletable : null,
  };
}

function normalizeWalrusStorage(value: unknown): WalrusAvatarStorage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const minimumEndEpoch = Number(payload.minimumEndEpoch);
  const maximumEndEpoch = Number(payload.maximumEndEpoch);

  return {
    runtimeAvatar: normalizeWalrusBlobStorage(payload.runtimeAvatar),
    preview: normalizeWalrusBlobStorage(payload.preview),
    manifest: normalizeWalrusBlobStorage(payload.manifest),
    sourceAsset: normalizeWalrusBlobStorage(payload.sourceAsset),
    minimumEndEpoch:
      Number.isFinite(minimumEndEpoch) && minimumEndEpoch > 0
        ? Math.floor(minimumEndEpoch)
        : null,
    maximumEndEpoch:
      Number.isFinite(maximumEndEpoch) && maximumEndEpoch > 0
        ? Math.floor(maximumEndEpoch)
        : null,
  };
}

export type BackendOwnedAvatarResponse = {
  walletAddress: string;
  activeAvatarObjectId: string | null;
  activeManifestBlobId: string | null;
  avatars: BackendOwnedAvatar[];
};

function hasOwnProperty(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeAvatar(value: unknown): BackendOwnedAvatar | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const objectId = typeof payload.objectId === "string" ? payload.objectId : null;
  if (!objectId) {
    return null;
  }

  const source =
    payload.source === "object-state" ||
    payload.source === "manifest-cache" ||
    payload.source === "on-chain"
      ? payload.source
      : "manifest-cache";

  return {
    objectId,
    objectType: typeof payload.objectType === "string" ? payload.objectType : null,
    name: typeof payload.name === "string" ? payload.name : null,
    manifestBlobId:
      typeof payload.manifestBlobId === "string" ? payload.manifestBlobId : null,
    previewBlobId:
      typeof payload.previewBlobId === "string" ? payload.previewBlobId : null,
    previewUrl:
      typeof payload.previewUrl === "string" ? payload.previewUrl : null,
    modelUrl: typeof payload.modelUrl === "string" ? payload.modelUrl : null,
    runtimeAvatarBlobId:
      typeof payload.runtimeAvatarBlobId === "string"
        ? payload.runtimeAvatarBlobId
        : null,
    txDigest: typeof payload.txDigest === "string" ? payload.txDigest : null,
    status: typeof payload.status === "string" ? payload.status : null,
    runtimeReady: Boolean(payload.runtimeReady),
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
    isActive: Boolean(payload.isActive),
    location: payload.location === "kiosk" ? "kiosk" : "wallet",
    kioskId: typeof payload.kioskId === "string" ? payload.kioskId : null,
    isListed: Boolean(payload.isListed),
    listedPriceMist:
      typeof payload.listedPriceMist === "string" ? payload.listedPriceMist : null,
    ownerWalletAddress:
      typeof payload.ownerWalletAddress === "string" ? payload.ownerWalletAddress : null,
    source,
    shooterStats: normalizeShooterStats(payload.shooterStats),
    walrusStorage: normalizeWalrusStorage(payload.walrusStorage),
    shooterCharacter:
      payload.shooterCharacter &&
      typeof payload.shooterCharacter === "object" &&
      typeof (payload.shooterCharacter as Record<string, unknown>).id === "string" &&
      typeof (payload.shooterCharacter as Record<string, unknown>).label === "string" &&
      typeof (payload.shooterCharacter as Record<string, unknown>).prefabResource === "string"
        ? {
            id: (payload.shooterCharacter as Record<string, unknown>).id as string,
            label: (payload.shooterCharacter as Record<string, unknown>).label as string,
            prefabResource: (payload.shooterCharacter as Record<string, unknown>)
              .prefabResource as string,
            role:
              typeof (payload.shooterCharacter as Record<string, unknown>).role === "string"
                ? ((payload.shooterCharacter as Record<string, unknown>).role as string)
                : undefined,
            source:
              (payload.shooterCharacter as Record<string, unknown>).source === "uploaded-file"
                ? "uploaded-file"
                : "preset",
            runtimeAssetMime:
              typeof (payload.shooterCharacter as Record<string, unknown>).runtimeAssetMime ===
              "string"
                ? ((payload.shooterCharacter as Record<string, unknown>)
                    .runtimeAssetMime as string)
                : undefined,
            runtimeAssetFilename:
              typeof (payload.shooterCharacter as Record<string, unknown>)
                .runtimeAssetFilename === "string"
                ? ((payload.shooterCharacter as Record<string, unknown>)
                    .runtimeAssetFilename as string)
                : undefined,
          }
        : null,
  };
}

export async function fetchOwnedAvatarsFromBackend(
  walletAddress: string,
  packageId?: string,
) {
  const url = new URL(
    `/avatar/${encodeURIComponent(walletAddress)}/owned`,
    webEnv.apiBaseUrl,
  );
  const resolvedPackageId = (packageId ?? webEnv.avatarPackageId).trim();
  if (resolvedPackageId && resolvedPackageId !== "0x0") {
    url.searchParams.set("packageId", resolvedPackageId);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Owned-avatar lookup failed with HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (!hasOwnProperty(payload, "avatars") || !Array.isArray(payload.avatars)) {
    throw new Error(
      `Invalid owned-avatar response from ${webEnv.apiBaseUrl}. Expected an avatars array.`,
    );
  }

  const avatarsRaw = Array.isArray(payload.avatars) ? payload.avatars : [];
  const avatars = avatarsRaw
    .map((item) => normalizeAvatar(item))
    .filter((item): item is BackendOwnedAvatar => Boolean(item));

  return {
    walletAddress:
      typeof payload.walletAddress === "string"
        ? payload.walletAddress
        : walletAddress,
    activeAvatarObjectId:
      typeof payload.activeAvatarObjectId === "string"
        ? payload.activeAvatarObjectId
        : null,
    activeManifestBlobId:
      typeof payload.activeManifestBlobId === "string"
        ? payload.activeManifestBlobId
        : null,
    avatars,
  } satisfies BackendOwnedAvatarResponse;
}

export async function fetchMarketplaceListings(packageId?: string) {
  const url = new URL("/marketplace/listings", webEnv.apiBaseUrl);
  const resolvedPackageId = (packageId ?? webEnv.avatarPackageId).trim();
  if (resolvedPackageId && resolvedPackageId !== "0x0") {
    url.searchParams.set("packageId", resolvedPackageId);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Marketplace listings lookup failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (!hasOwnProperty(payload, "listings") || !Array.isArray(payload.listings)) {
    throw new Error(
      `Invalid marketplace response from ${webEnv.apiBaseUrl}. Expected a listings array.`,
    );
  }

  const listingsRaw = Array.isArray(payload.listings) ? payload.listings : [];
  return {
    listings: listingsRaw
      .map((item) => normalizeAvatar(item))
      .filter((item): item is BackendOwnedAvatar => Boolean(item)),
  } satisfies MarketplaceListingsResponse;
}
