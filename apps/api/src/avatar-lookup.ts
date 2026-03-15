import { KioskClient } from "@mysten/kiosk";
import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
  type ObjectOwner,
  type SuiObjectData,
} from "@mysten/sui/jsonRpc";
import type { ShooterCharacter, ShooterStats } from "@pacific/shared";
import { apiConfig } from "./config.js";

type JsonObject = Record<string, unknown>;

export type AvatarLocation = "wallet" | "kiosk";

export type OnChainAvatar = {
  objectId: string;
  objectType: string;
  version: string;
  previousTransaction: string | null;
  name: string | null;
  manifestBlobId: string | null;
  previewBlobId: string | null;
  previewUrl: string | null;
  modelUrl: string | null;
  shooterStats: ShooterStats;
  shooterCharacter: ShooterCharacter | null;
  location: AvatarLocation;
  kioskId: string | null;
  isListed: boolean;
  listedPriceMist: string | null;
  ownerWalletAddress: string | null;
};

export type AvatarChainOwner =
  | {
      kind: "wallet";
      address: string;
    }
  | {
      kind: "object";
      objectId: string;
    }
  | {
      kind: "shared";
    }
  | {
      kind: "immutable";
    }
  | {
      kind: "unknown";
    };

const suiClient = new SuiJsonRpcClient({
  network: apiConfig.SUI_NETWORK,
  url:
    apiConfig.SUI_JSON_RPC_URL ||
    getJsonRpcFullnodeUrl(apiConfig.SUI_NETWORK),
});

const kioskClient = new KioskClient({
  client: suiClient as never,
  network: apiConfig.SUI_NETWORK,
});

export function isConfiguredPackageId(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^0x[0-9a-fA-F]+$/.test(value) && !/^0x0+$/.test(value);
}

export function blobIdFromWalrusReference(reference: string | null | undefined) {
  if (!reference) {
    return null;
  }

  const normalized = reference.trim();
  if (!normalized.startsWith("walrus://")) {
    return null;
  }

  const blobId = normalized.slice("walrus://".length).split(/[/?#]/)[0];
  return blobId.length > 0 ? blobId : null;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/_/g, "");
}

function lookupStringField(payload: unknown, fieldNames: string[]) {
  const targetKeys = new Set(fieldNames.map(normalizeKey));
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value)) {
      continue;
    }

    visited.add(value);
    for (const [key, entry] of Object.entries(value as JsonObject)) {
      if (targetKeys.has(normalizeKey(key)) && typeof entry === "string" && entry.length > 0) {
        return entry;
      }

      if (entry && typeof entry === "object") {
        queue.push(entry);
      }
    }
  }

  return null;
}

function lookupNumberField(payload: unknown, fieldNames: string[]) {
  const targetKeys = new Set(fieldNames.map(normalizeKey));
  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value)) {
      continue;
    }

    visited.add(value);
    for (const [key, entry] of Object.entries(value as JsonObject)) {
      if (targetKeys.has(normalizeKey(key))) {
        const parsed = Number(entry);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }

      if (entry && typeof entry === "object") {
        queue.push(entry);
      }
    }
  }

  return null;
}

function parseVersion(value: string | null | undefined) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function getObjectFields(object: SuiObjectData) {
  const content = object.content;
  if (!content || typeof content !== "object" || content.dataType !== "moveObject") {
    return null;
  }

  return (content.fields ?? null) as JsonObject | null;
}

function getDisplayString(
  object: SuiObjectData,
  fieldNames: Array<"image" | "image_url" | "thumbnail_url" | "name" | "description" | "link">,
) {
  const display = object.display?.data;
  if (!display || typeof display !== "object") {
    return null;
  }

  for (const fieldName of fieldNames) {
    const value = (display as Record<string, unknown>)[fieldName];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function parseAvatarCandidate(
  object: SuiObjectData,
  args: {
    location: AvatarLocation;
    kioskId: string | null;
    isListed: boolean;
    listedPriceMist: string | null;
    ownerWalletAddress: string | null;
  },
): OnChainAvatar | null {
  const fields = getObjectFields(object);
  const objectType = object.type ?? "";
  if (!fields || !objectType) {
    return null;
  }

  const name = lookupStringField(fields, ["name"]) ?? getDisplayString(object, ["name"]);
  const modelUrl = lookupStringField(fields, ["model_url", "modelUrl"]);
  const manifestBlobId =
    lookupStringField(fields, ["manifest_blob_id", "manifestBlobId"]) ??
    blobIdFromWalrusReference(modelUrl);
  const previewBlobId = lookupStringField(fields, ["preview_blob_id", "previewBlobId"]);
  const previewUrl =
    lookupStringField(fields, ["preview_url", "previewUrl"]) ??
    getDisplayString(object, ["image", "image_url", "thumbnail_url"]);

  if (!manifestBlobId && !modelUrl) {
    return null;
  }

  return {
    objectId: object.objectId,
    objectType,
    version: String(object.version ?? "0"),
    previousTransaction: object.previousTransaction ?? null,
    name,
    manifestBlobId,
    previewBlobId,
    previewUrl,
    modelUrl,
    shooterStats: {
      wins: Math.max(0, Math.floor(lookupNumberField(fields, ["wins", "win_count"]) ?? 0)),
      losses: Math.max(0, Math.floor(lookupNumberField(fields, ["losses", "loss_count"]) ?? 0)),
      hp: Math.max(
        0,
        Math.floor(lookupNumberField(fields, ["hp", "health"]) ?? apiConfig.SHOOTER_DEFAULT_HP),
      ),
    },
    shooterCharacter: (() => {
      const characterId = lookupStringField(fields, ["character_id", "characterId"]);
      const characterLabel = lookupStringField(fields, ["character_label", "characterLabel"]);
      const prefabResource = lookupStringField(fields, ["prefab_resource", "prefabResource"]);
      if (!characterId || !characterLabel || !prefabResource) {
        return null;
      }

      const role = lookupStringField(fields, ["character_role", "characterRole"]) ?? undefined;
      return {
        id: characterId,
        label: characterLabel,
        prefabResource,
        role,
        source: "preset",
      } satisfies ShooterCharacter;
    })(),
    location: args.location,
    kioskId: args.kioskId,
    isListed: args.isListed,
    listedPriceMist: args.listedPriceMist,
    ownerWalletAddress: args.ownerWalletAddress,
  };
}

async function listOwnedObjectsByType(owner: string, type: string) {
  const objects: SuiObjectData[] = [];
  let cursor: string | null | undefined = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await suiClient.getOwnedObjects({
      owner,
      filter: { StructType: type },
      cursor,
      limit: 50,
      options: {
        showContent: true,
        showDisplay: true,
        showType: true,
        showPreviousTransaction: true,
      },
    });

    objects.push(
      ...response.data
        .map((entry) => entry.data)
        .filter((entry): entry is SuiObjectData => Boolean(entry)),
    );
    cursor = response.nextCursor;
    hasNextPage = response.hasNextPage;
  }

  return objects;
}

async function fetchObjectsByIds(ids: string[]) {
  const objects: SuiObjectData[] = [];

  for (let index = 0; index < ids.length; index += 50) {
    const response = await suiClient.multiGetObjects({
      ids: ids.slice(index, index + 50),
      options: {
        showContent: true,
        showDisplay: true,
        showType: true,
        showPreviousTransaction: true,
      },
    });

    objects.push(
      ...response
        .map((entry) => entry.data)
        .filter((entry): entry is SuiObjectData => Boolean(entry)),
    );
  }

  return objects;
}

function configuredObjectTypes(packageIds: string[]) {
  return new Set(
    packageIds.flatMap((packageId) => [
      `${packageId}::simple_avatar::Avatar`,
      `${packageId}::avatar::Avatar`,
    ]),
  );
}

function sortAvatars<T extends { version: string; previousTransaction: string | null }>(
  avatars: T[],
) {
  return avatars.sort((left, right) => {
    const versionDiff = parseVersion(right.version) - parseVersion(left.version);
    if (versionDiff !== 0n) {
      return versionDiff > 0n ? 1 : -1;
    }

    if (left.previousTransaction === right.previousTransaction) {
      return 0;
    }

    return (right.previousTransaction ?? "").localeCompare(left.previousTransaction ?? "");
  });
}

export async function listOwnedOnChainAvatars(
  owner: string,
  packageIdOrIds: string | string[],
) {
  const packageIds = Array.isArray(packageIdOrIds) ? packageIdOrIds : [packageIdOrIds];
  const configuredPackageIds = packageIds.filter((packageId) => isConfiguredPackageId(packageId));

  if (configuredPackageIds.length === 0) {
    throw new Error(
      "Avatar package id is not configured. Set AVATAR_PACKAGE_ID or pass packageId in the request.",
    );
  }

  const objectLists = await Promise.all(
    configuredPackageIds.flatMap((packageId) => [
      listOwnedObjectsByType(owner, `${packageId}::simple_avatar::Avatar`),
      listOwnedObjectsByType(owner, `${packageId}::avatar::Avatar`),
    ]),
  );

  const seenIds = new Set<string>();
  return sortAvatars(
    objectLists.flat()
      .filter((object) => {
        if (seenIds.has(object.objectId)) {
          return false;
        }

        seenIds.add(object.objectId);
        return true;
      })
      .map((object) =>
        parseAvatarCandidate(object, {
          location: "wallet",
          kioskId: null,
          isListed: false,
          listedPriceMist: null,
          ownerWalletAddress: owner,
        }))
      .filter((avatar): avatar is OnChainAvatar => Boolean(avatar)),
  );
}

export async function listOwnedKiosks(walletAddress: string) {
  const result = await kioskClient.getOwnedKiosks({
    address: walletAddress,
  });
  return result.kioskOwnerCaps;
}

async function listKioskAvatarsForWallet(walletAddress: string, packageIds: string[]) {
  const ownedKiosks = await listOwnedKiosks(walletAddress);
  if (ownedKiosks.length === 0) {
    return [];
  }

  const allowedTypes = configuredObjectTypes(packageIds);
  const kiosks = await Promise.allSettled(
    ownedKiosks.map(async (cap) => ({
      cap,
      kiosk: await kioskClient.getKiosk({
        id: cap.kioskId,
        options: {
          withListingPrices: true,
        },
      }),
    })),
  );

  return sortAvatars(
    (await Promise.all(
      kiosks.map(async (result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        const items = result.value.kiosk.items.filter((item) => allowedTypes.has(item.type));
        if (items.length === 0) {
          return [];
        }

        const objectMap = new Map(
          (await fetchObjectsByIds(items.map((item) => item.objectId))).map((object) => [
            object.objectId,
            object,
          ]),
        );

        return items
          .map((item) => {
            const object = objectMap.get(item.objectId);
            return object
              ? parseAvatarCandidate(object, {
                  location: "kiosk",
                  kioskId: result.value.cap.kioskId,
                  isListed: Boolean(item.listing),
                  listedPriceMist: item.listing?.price ?? null,
                  ownerWalletAddress: walletAddress,
                })
              : null;
          })
          .filter((avatar): avatar is OnChainAvatar => Boolean(avatar));
      }),
    )).flat(),
  );
}

export async function listControlledOnChainAvatars(
  walletAddress: string,
  packageIdOrIds: string | string[],
) {
  const packageIds = Array.isArray(packageIdOrIds) ? packageIdOrIds : [packageIdOrIds];
  const configuredPackageIds = packageIds.filter((packageId) => isConfiguredPackageId(packageId));

  if (configuredPackageIds.length === 0) {
    throw new Error(
      "Avatar package id is not configured. Set AVATAR_PACKAGE_ID or pass packageId in the request.",
    );
  }

  const [walletAvatars, kioskAvatars] = await Promise.all([
    listOwnedOnChainAvatars(walletAddress, configuredPackageIds),
    listKioskAvatarsForWallet(walletAddress, configuredPackageIds),
  ]);

  const deduped = new Map<string, OnChainAvatar>();
  for (const avatar of [...walletAvatars, ...kioskAvatars]) {
    const current = deduped.get(avatar.objectId);
    if (!current) {
      deduped.set(avatar.objectId, avatar);
      continue;
    }

    if (current.location === "kiosk" && avatar.location === "wallet") {
      deduped.set(avatar.objectId, avatar);
    }
  }

  return sortAvatars([...deduped.values()]);
}

export async function listListedKioskAvatars(
  kiosks: Array<{
    kioskId: string;
    walletAddress: string | null;
  }>,
  packageIdOrIds: string | string[],
) {
  const packageIds = Array.isArray(packageIdOrIds) ? packageIdOrIds : [packageIdOrIds];
  const configuredPackageIds = packageIds.filter((packageId) => isConfiguredPackageId(packageId));
  if (configuredPackageIds.length === 0 || kiosks.length === 0) {
    return [];
  }

  const allowedTypes = configuredObjectTypes(configuredPackageIds);
  const fetched = await Promise.allSettled(
    kiosks.map(async (trackedKiosk) => ({
      trackedKiosk,
      kiosk: await kioskClient.getKiosk({
        id: trackedKiosk.kioskId,
        options: {
          withListingPrices: true,
        },
      }),
    })),
  );

  const seen = new Set<string>();
  return sortAvatars(
    (await Promise.all(
      fetched.map(async (result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        const items = result.value.kiosk.items.filter(
          (item) => allowedTypes.has(item.type) && item.listing?.price,
        );
        if (items.length === 0) {
          return [];
        }

        const objectMap = new Map(
          (await fetchObjectsByIds(items.map((item) => item.objectId))).map((object) => [
            object.objectId,
            object,
          ]),
        );

        return items
          .map((item) => {
            const object = objectMap.get(item.objectId);
            const avatar = object
              ? parseAvatarCandidate(object, {
                  location: "kiosk",
                  kioskId: result.value.trackedKiosk.kioskId,
                  isListed: true,
                  listedPriceMist: item.listing?.price ?? null,
                  ownerWalletAddress: result.value.trackedKiosk.walletAddress,
                })
              : null;
            if (!avatar || seen.has(avatar.objectId)) {
              return null;
            }

            seen.add(avatar.objectId);
            return avatar;
          })
          .filter((avatar): avatar is OnChainAvatar => Boolean(avatar));
      }),
    )).flat(),
  );
}

function parseObjectOwner(owner: ObjectOwner | null | undefined): AvatarChainOwner {
  if (!owner) {
    return { kind: "unknown" };
  }

  if (typeof owner === "string") {
    return owner === "Immutable" ? { kind: "immutable" } : { kind: "unknown" };
  }

  if ("AddressOwner" in owner && typeof owner.AddressOwner === "string") {
    return {
      kind: "wallet",
      address: owner.AddressOwner,
    };
  }

  if ("ObjectOwner" in owner && typeof owner.ObjectOwner === "string") {
    return {
      kind: "object",
      objectId: owner.ObjectOwner,
    };
  }

  if ("Shared" in owner) {
    return { kind: "shared" };
  }

  return { kind: "unknown" };
}

export async function readAvatarChainOwner(avatarObjectId: string): Promise<AvatarChainOwner> {
  const response = await suiClient.getObject({
    id: avatarObjectId,
    options: {
      showOwner: true,
    },
  });

  return parseObjectOwner(response.data?.owner);
}
