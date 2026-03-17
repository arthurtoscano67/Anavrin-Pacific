import { KioskClient } from "@mysten/kiosk";
import type { ShooterCharacter, ShooterStats } from "@pacific/shared";
import type { SuiObjectData } from "@mysten/sui/jsonRpc";
import { publicSuiJsonRpcClient } from "./sui-jsonrpc";
import { webEnv } from "../env";

type JsonObject = Record<string, unknown>;

export type OnChainAvatarCandidate = {
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
  location: "wallet" | "kiosk";
  kioskId: string | null;
  isListed: boolean;
  listedPriceMist: string | null;
  ownerWalletAddress: string | null;
};

const kioskClient = new KioskClient({
  client: publicSuiJsonRpcClient as never,
  network: "mainnet",
});

function isConfiguredPackageId(value: string) {
  return /^0x[0-9a-fA-F]+$/.test(value) && !/^0x0+$/.test(value);
}

function configuredPackageIds() {
  const seen = new Set<string>();
  return [webEnv.avatarPackageId, ...webEnv.legacyAvatarPackageIds].filter((packageId) => {
    if (!isConfiguredPackageId(packageId) || seen.has(packageId)) {
      return false;
    }

    seen.add(packageId);
    return true;
  });
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

function blobIdFromWalrusReference(reference: string | null | undefined) {
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

function getObjectFields(object: SuiObjectData) {
  const content = object.content;
  if (!content || typeof content !== "object" || content.dataType !== "moveObject") {
    return null;
  }

  return (content.fields ?? null) as JsonObject | null;
}

function getDisplayString(
  object: SuiObjectData,
  fieldNames: Array<"image" | "image_url" | "thumbnail_url" | "name">,
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

function parseCandidate(
  object: SuiObjectData,
  args: {
    location: "wallet" | "kiosk";
    kioskId: string | null;
    isListed: boolean;
    listedPriceMist: string | null;
    ownerWalletAddress: string | null;
  },
): OnChainAvatarCandidate | null {
  const fields = getObjectFields(object);
  const objectType = object.type ?? "";
  if (!fields || !objectType) {
    return null;
  }

  const name = lookupStringField(fields, ["name"]) ?? getDisplayString(object, ["name"]);
  const manifestBlobId = lookupStringField(fields, [
    "manifest_blob_id",
    "manifestBlobId",
  ]);
  const previewBlobId = lookupStringField(fields, [
    "preview_blob_id",
    "previewBlobId",
  ]);
  const modelUrl = lookupStringField(fields, ["model_url", "modelUrl"]);
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
    manifestBlobId: manifestBlobId ?? blobIdFromWalrusReference(modelUrl),
    previewBlobId,
    previewUrl,
    modelUrl,
    shooterStats: {
      wins: Math.max(0, Math.floor(lookupNumberField(fields, ["wins", "win_count"]) ?? 0)),
      losses: Math.max(0, Math.floor(lookupNumberField(fields, ["losses", "loss_count"]) ?? 0)),
      hp: Math.max(0, Math.floor(lookupNumberField(fields, ["hp", "health"]) ?? 100)),
    },
    shooterCharacter: (() => {
      const characterId = lookupStringField(fields, ["character_id", "characterId"]);
      const characterLabel = lookupStringField(fields, ["character_label", "characterLabel"]);
      const prefabResource = lookupStringField(fields, ["prefab_resource", "prefabResource"]);
      if (!characterId || !characterLabel || !prefabResource) {
        return null;
      }

      return {
        id: characterId,
        label: characterLabel,
        prefabResource,
        role: lookupStringField(fields, ["character_role", "characterRole"]) ?? undefined,
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

function parseVersion(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function configuredAvatarObjectTypes(packageIds: string[]) {
  return new Set(
    packageIds.flatMap((packageId) => [
      `${packageId}::simple_avatar::Avatar`,
      `${packageId}::avatar::Avatar`,
    ]),
  );
}

async function listOwnedObjectsByType(owner: string, objectType: string) {
  const objects: SuiObjectData[] = [];
  let cursor: string | null | undefined = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await publicSuiJsonRpcClient.getOwnedObjects({
      owner,
      filter: { StructType: objectType },
      options: {
        showContent: true,
        showDisplay: true,
        showType: true,
        showPreviousTransaction: true,
      },
      cursor,
      limit: 50,
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
    const response = await publicSuiJsonRpcClient.multiGetObjects({
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

type ListedKioskEventCandidate = {
  objectId: string;
  kioskId: string;
  listedPriceMist: string;
  sellerWalletAddress: string | null;
};

function readListedKioskEventCandidate(
  eventPayload: unknown,
  sender: string | null | undefined,
): ListedKioskEventCandidate | null {
  const eventObject =
    eventPayload && typeof eventPayload === "object"
      ? (eventPayload as JsonObject)
      : null;
  if (!eventObject) {
    return null;
  }

  const objectId = lookupStringField(eventObject, ["id", "object_id", "objectId"]) ?? null;
  const kioskId = lookupStringField(eventObject, ["kiosk", "kiosk_id", "kioskId"]) ?? null;
  const listedPriceMist =
    lookupStringField(eventObject, ["price", "price_mist", "priceMist"]) ?? null;
  if (
    !objectId ||
    !kioskId ||
    !listedPriceMist ||
    !/^\d+$/.test(listedPriceMist) ||
    !objectId.startsWith("0x") ||
    !kioskId.startsWith("0x")
  ) {
    return null;
  }

  return {
    objectId,
    kioskId,
    listedPriceMist,
    sellerWalletAddress: sender?.startsWith("0x") ? sender : null,
  };
}

async function listRecentListedKioskCandidates(itemTypes: string[]) {
  const latestByObjectId = new Map<string, ListedKioskEventCandidate>();

  for (const itemType of itemTypes) {
    let cursor: Parameters<typeof publicSuiJsonRpcClient.queryEvents>[0]["cursor"] = null;
    let hasNextPage = true;
    let pagesRead = 0;
    const maxPages = 50;

    while (hasNextPage && pagesRead < maxPages) {
      const page = await publicSuiJsonRpcClient.queryEvents({
        query: {
          MoveEventType: `0x2::kiosk::ItemListed<${itemType}>`,
        },
        cursor,
        limit: 100,
        order: "descending",
      });

      pagesRead += 1;

      for (const event of page.data) {
        const candidate = readListedKioskEventCandidate(event.parsedJson, event.sender);
        if (!candidate || latestByObjectId.has(candidate.objectId)) {
          continue;
        }

        latestByObjectId.set(candidate.objectId, candidate);
      }

      cursor = page.nextCursor;
      hasNextPage = Boolean(page.hasNextPage && page.nextCursor);
    }
  }

  return [...latestByObjectId.values()];
}

export async function queryControlledOnChainAvatars(owner: string) {
  const packageIds = configuredPackageIds();
  if (packageIds.length === 0) {
    throw new Error(
      "Set VITE_AVATAR_PACKAGE_ID to the deployed Avatar package before loading on-chain avatars.",
    );
  }

  const walletObjectLists = await Promise.all(
    packageIds.flatMap((packageId) => [
      listOwnedObjectsByType(owner, `${packageId}::simple_avatar::Avatar`),
      listOwnedObjectsByType(owner, `${packageId}::avatar::Avatar`),
    ]),
  );

  const ownedKiosks = await kioskClient.getOwnedKiosks({ address: owner });
  const kioskObjectTypes = configuredAvatarObjectTypes(packageIds);
  const listedCandidates = await listRecentListedKioskCandidates([...kioskObjectTypes]);
  const listedByObjectId = new Map(
    listedCandidates.map((candidate) => [candidate.objectId, candidate] as const),
  );
  const kioskResults = await Promise.allSettled(
    ownedKiosks.kioskOwnerCaps.map(async (cap) => ({
      kioskId: cap.kioskId,
      kiosk: await kioskClient.getKiosk({
        id: cap.kioskId,
        options: {
          withListingPrices: true,
        },
      }),
    })),
  );

  const seenIds = new Set<string>();
  const all = [
    ...walletObjectLists.flat().map((object) =>
      parseCandidate(object, {
        location: "wallet",
        kioskId: null,
        isListed: false,
        listedPriceMist: null,
        ownerWalletAddress: owner,
      })),
    ...(await Promise.all(
      kioskResults.map(async (result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        const items = result.value.kiosk.items.filter((item) => kioskObjectTypes.has(item.type));
        if (items.length === 0) {
          return [];
        }

        const objectMap = new Map(
          (await fetchObjectsByIds(items.map((item) => item.objectId))).map((object) => [
            object.objectId,
            object,
          ]),
        );

        return items.map((item) => {
          const object = objectMap.get(item.objectId);
          const listedCandidate = listedByObjectId.get(item.objectId);
          return object
            ? parseCandidate(object, {
                location: "kiosk",
                kioskId: result.value.kioskId,
                isListed: Boolean(item.listing),
                listedPriceMist:
                  item.listing && listedCandidate?.kioskId === result.value.kioskId
                    ? listedCandidate.listedPriceMist
                    : null,
                ownerWalletAddress: owner,
              })
            : null;
        });
      }),
    )).flat(),
  ]
    .filter((avatar): avatar is OnChainAvatarCandidate => Boolean(avatar))
    .filter((avatar) => {
      if (seenIds.has(avatar.objectId)) {
        return false;
      }

      seenIds.add(avatar.objectId);
      return true;
    })
    .sort((left, right) => {
      const versionDiff = parseVersion(right.version) - parseVersion(left.version);
      if (versionDiff !== 0n) {
        return versionDiff > 0n ? 1 : -1;
      }

      if (left.previousTransaction === right.previousTransaction) {
        return 0;
      }

      return (right.previousTransaction ?? "").localeCompare(left.previousTransaction ?? "");
    });

  return all;
}

export async function queryListedOnChainAvatars() {
  const packageIds = configuredPackageIds();
  if (packageIds.length === 0) {
    throw new Error(
      "Set VITE_AVATAR_PACKAGE_ID to the deployed Avatar package before loading on-chain avatars.",
    );
  }

  const allowedTypes = configuredAvatarObjectTypes(packageIds);
  const listedCandidates = await listRecentListedKioskCandidates([...allowedTypes]);
  if (listedCandidates.length === 0) {
    return [];
  }

  const candidatesByObjectId = new Map(
    listedCandidates.map((candidate) => [candidate.objectId, candidate] as const),
  );
  const kioskIds = [...new Set(listedCandidates.map((candidate) => candidate.kioskId))];

  const kioskResults = await Promise.allSettled(
    kioskIds.map(async (kioskId) => ({
      kioskId,
      kiosk: await kioskClient.getKiosk({
        id: kioskId,
        options: {
          withListingPrices: true,
        },
      }),
    })),
  );

  const activeListingsByObjectId = new Map<string, ListedKioskEventCandidate & { listedPriceMist: string }>();
  for (const result of kioskResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    for (const item of result.value.kiosk.items) {
      if (!allowedTypes.has(item.type) || !item.listing) {
        continue;
      }

      const candidate = candidatesByObjectId.get(item.objectId);
      if (
        !candidate ||
        candidate.kioskId !== result.value.kioskId ||
        !candidate.listedPriceMist
      ) {
        continue;
      }

      activeListingsByObjectId.set(item.objectId, {
        ...candidate,
        listedPriceMist: candidate.listedPriceMist,
      });
    }
  }

  if (activeListingsByObjectId.size === 0) {
    return [];
  }

  const objectMap = new Map(
    (await fetchObjectsByIds([...activeListingsByObjectId.keys()]))
      .filter((object) => allowedTypes.has(object.type ?? ""))
      .map((object) => [object.objectId, object] as const),
  );

  return sortByVersion(
    [...activeListingsByObjectId.values()]
      .map((candidate) => {
        const object = objectMap.get(candidate.objectId);
        if (!object) {
          return null;
        }

        return parseCandidate(object, {
          location: "kiosk",
          kioskId: candidate.kioskId,
          isListed: true,
          listedPriceMist: candidate.listedPriceMist,
          ownerWalletAddress: candidate.sellerWalletAddress,
        });
      })
      .filter((avatar): avatar is OnChainAvatarCandidate => Boolean(avatar)),
  );
}

function sortByVersion(avatars: OnChainAvatarCandidate[]) {
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
