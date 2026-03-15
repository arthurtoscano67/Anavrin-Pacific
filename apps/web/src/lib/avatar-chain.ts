import { type useDAppKit } from "@mysten/dapp-kit-react";
import {
  READY_AVATAR_MAX_EPOCHS,
  type ManifestRecord,
  type ReadyAvatarManifest,
  type WalrusAvatarStorage,
} from "@pacific/shared";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { webEnv } from "../env";
import { defaultAvatarPackageId, getActiveAvatarPackageId } from "./active-avatar-package";
import { buildNftImageUrl } from "./avatar-public";
import { readResponseError, type WalletSession } from "./session";
import { collectWalrusAssets, extendWalrusStorageWindow } from "./walrus-storage";

type DAppKitInstance = ReturnType<typeof useDAppKit>;
type WalrusEnabledClient = SuiGrpcClient & {
  walrus: {
    extendBlob(options: { blobObjectId: string; epochs: number }): (tx: Transaction) => Promise<void>;
  };
};
type TransactionResultWithEffects = Awaited<
  ReturnType<DAppKitInstance["signAndExecuteTransaction"]>
>;
type OnChainObjectFields = Record<string, unknown>;

const PACKAGE_PUBLISHER_OBJECT_TYPE = "0x2::package::Publisher";
const LEGACY_MANIFEST_PREFIX = "walrus://";
const publicSuiClient = new SuiJsonRpcClient({
  network: "mainnet",
  url: getJsonRpcFullnodeUrl("mainnet"),
});

type MoveFunctionLike = {
  function?: {
    parameters?: unknown[];
  };
};

type AvatarMintTarget = "legacy" | "avatar-v1" | "avatar-v2" | "avatar-paid-v2";
type AvatarUpdateTarget = "avatar-v1" | "avatar-v2" | "avatar-v3";

export type AvatarMintPricing = {
  target: AvatarMintTarget;
  mode: "free" | "paid";
  configId: string | null;
  mintPriceMist: string;
  treasury: string | null;
};

function resolveAvatarPackageId(packageIdOverride?: string | null) {
  return (packageIdOverride?.trim() || getActiveAvatarPackageId()).trim();
}

function avatarTargets(packageIdOverride?: string | null) {
  const packageId = resolveAvatarPackageId(packageIdOverride);
  return {
    packageId,
    legacyAvatarObjectType: `${packageId}::simple_avatar::Avatar`,
    avatarObjectType: `${packageId}::avatar::Avatar`,
    legacyAvatarMintTarget: `${packageId}::simple_avatar::mint`,
    avatarMintTarget: `${packageId}::avatar::mint`,
    avatarMintPaidTarget: `${packageId}::avatar::mint_paid`,
    avatarUpdateTarget: `${packageId}::avatar::update`,
    avatarBootstrapMintConfigTarget: `${packageId}::avatar::bootstrap_mint_config`,
    avatarUpdateMintConfigTarget: `${packageId}::avatar::update_mint_config`,
    avatarMintAdminCapObjectType: `${packageId}::avatar::MintAdminCap`,
    mintConfigCreatedEventType: `${packageId}::avatar::MintConfigCreated`,
  } as const;
}

function ensureTransactionSucceeded(
  result: TransactionResultWithEffects,
  fallbackMessage: string,
) {
  if (result.$kind === "FailedTransaction") {
    throw new Error(result.FailedTransaction.status.error?.message ?? fallbackMessage);
  }

  return result.Transaction;
}

async function listOwnedAvatarObjectIdsByType(
  client: SuiGrpcClient,
  owner: string,
  objectType: string,
) {
  const { response } = await client.stateService.listOwnedObjects({
    owner,
    objectType,
    readMask: {
      paths: ["object_id", "object_type", "previous_transaction"],
    },
  });

  return response.objects ?? [];
}

function readStringField(fields: OnChainObjectFields, key: string) {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

function readU64StringField(fields: OnChainObjectFields, key: string, fallback = "0") {
  const value = fields[key];
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value).toString();
  }

  if (typeof value === "bigint" && value >= 0n) {
    return value.toString();
  }

  return fallback;
}

function extractObjectFields(response: Awaited<ReturnType<typeof publicSuiClient.getObject>>) {
  const content = response.data?.content;
  if (!content || typeof content !== "object" || !("fields" in content)) {
    return null;
  }

  return content.fields as OnChainObjectFields;
}

async function listOwnedObjectIdsByType(
  owner: string,
  objectType: string,
) {
  const objectIds: string[] = [];
  let cursor: string | null | undefined = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await publicSuiClient.getOwnedObjects({
      owner,
      filter: {
        StructType: objectType,
      },
      options: {
        showType: true,
      },
      cursor,
      limit: 50,
    });

    objectIds.push(
      ...response.data
        .map((object) => object.data?.objectId ?? null)
        .filter((objectId): objectId is string => Boolean(objectId)),
    );
    cursor = response.nextCursor;
    hasNextPage = response.hasNextPage;
  }

  return objectIds;
}

async function findMintConfigIdFromEvents(packageIdOverride?: string | null) {
  const { mintConfigCreatedEventType } = avatarTargets(packageIdOverride);
  const response = await publicSuiClient.queryEvents({
    query: {
      MoveEventType: mintConfigCreatedEventType,
    },
    limit: 1,
    order: "descending",
  });

  const event = response.data[0];
  if (!event || !event.parsedJson || typeof event.parsedJson !== "object") {
    return null;
  }

  const fields = event.parsedJson as OnChainObjectFields;
  return readStringField(fields, "mint_config_id") || null;
}

function configuredMintConfigIdForPackage(packageId: string) {
  const configuredMintConfigId = webEnv.avatarMintConfigId.trim();
  const configuredPackageId = defaultAvatarPackageId();
  if (!configuredMintConfigId || !configuredPackageId) {
    return "";
  }

  return configuredPackageId.toLowerCase() === packageId.toLowerCase() ? configuredMintConfigId : "";
}

async function resolveMintConfigId(configIdOverride?: string | null, packageIdOverride?: string | null) {
  const explicitConfigId = configIdOverride?.trim();
  if (explicitConfigId) {
    return explicitConfigId;
  }

  const packageId = resolveAvatarPackageId(packageIdOverride);
  const configuredMintConfigId = configuredMintConfigIdForPackage(packageId);
  if (configuredMintConfigId) {
    return configuredMintConfigId;
  }

  return findMintConfigIdFromEvents(packageId);
}

async function readMoveFunction(
  client: unknown,
  input: {
    packageId: string;
    moduleName: string;
    name: string;
  },
) {
  const moveInspector = client as {
    getMoveFunction?: (input: {
      packageId: string;
      moduleName: string;
      name: string;
    }) => Promise<MoveFunctionLike>;
  } | null;

  if (!moveInspector?.getMoveFunction) {
    throw new Error(
      `Unable to inspect Move functions in package ${input.packageId}. Restart the app if you recently changed the package ID.`,
    );
  }

  return moveInspector.getMoveFunction(input);
}

async function resolveMintTarget(
  client: unknown,
  packageIdOverride?: string | null,
): Promise<AvatarMintTarget> {
  const { packageId } = avatarTargets(packageIdOverride);
  try {
    const paidMint = await readMoveFunction(client, {
      packageId,
      moduleName: "avatar",
      name: "mint_paid",
    });
    const parameterCount = paidMint.function?.parameters?.length ?? 0;
    if (parameterCount >= 14) {
      return "avatar-paid-v2";
    }
  } catch {
    // Fall through and probe the unpaid target next.
  }

  try {
    const avatarMint = await readMoveFunction(client, {
      packageId,
      moduleName: "avatar",
      name: "mint",
    });
    const parameterCount = avatarMint.function?.parameters?.length ?? 0;
    return parameterCount >= 12 ? "avatar-v2" : "avatar-v1";
  } catch {
    // Fall through and probe the legacy module next.
  }

  try {
    await readMoveFunction(client, {
      packageId,
      moduleName: "simple_avatar",
      name: "mint",
    });
    return "legacy";
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(
    `Unable to find a supported mint function in package ${packageId}. Restart the app if you recently changed the package ID.`,
  );
}

async function resolveUpdateTarget(
  client: unknown,
  packageIdOverride?: string | null,
): Promise<AvatarUpdateTarget> {
  const { packageId } = avatarTargets(packageIdOverride);
  const avatarUpdate = await readMoveFunction(client, {
    packageId,
    moduleName: "avatar",
    name: "update",
  });
  const parameterCount = avatarUpdate.function?.parameters?.length ?? 0;
  if (parameterCount >= 14) {
    return "avatar-v3";
  }

  return parameterCount >= 13 ? "avatar-v2" : "avatar-v1";
}

export async function fetchAvatarMintPricing(
  client: unknown,
  configIdOverride?: string | null,
  packageIdOverride?: string | null,
): Promise<AvatarMintPricing> {
  const target = await resolveMintTarget(client, packageIdOverride);
  if (target !== "avatar-paid-v2") {
    return {
      target,
      mode: "free",
      configId: null,
      mintPriceMist: "0",
      treasury: null,
    };
  }

  const configId = await resolveMintConfigId(configIdOverride, packageIdOverride);
  if (!configId) {
    return {
      target,
      mode: "paid",
      configId: null,
      mintPriceMist: Math.max(0, webEnv.avatarMintPriceMist).toString(),
      treasury: null,
    };
  }

  const response = await publicSuiClient.getObject({
    id: configId,
    options: {
      showContent: true,
      showType: true,
    },
  });
  const fields = extractObjectFields(response);
  if (!response.data || !fields) {
    throw new Error(`Mint config ${configId} does not expose readable Move fields.`);
  }

  return {
    target,
    mode: "paid",
    configId: response.data.objectId,
    mintPriceMist: readU64StringField(
      fields,
      "mint_price_mist",
      Math.max(0, webEnv.avatarMintPriceMist).toString(),
    ),
    treasury: readStringField(fields, "treasury") || null,
  };
}

export async function findOwnedMintAdminCapObjectId(
  owner: string,
  packageIdOverride?: string | null,
) {
  const { avatarMintAdminCapObjectType } = avatarTargets(packageIdOverride);
  const objectIds = await listOwnedObjectIdsByType(owner, avatarMintAdminCapObjectType);
  return objectIds[0] ?? null;
}

export async function findOwnedPublisherObjectId(
  owner: string,
  packageIdOverride?: string | null,
) {
  let cursor: string | null | undefined = null;
  let hasNextPage = true;
  const normalizedPackageId = resolveAvatarPackageId(packageIdOverride).toLowerCase();

  while (hasNextPage) {
    const response = await publicSuiClient.getOwnedObjects({
      owner,
      filter: {
        StructType: PACKAGE_PUBLISHER_OBJECT_TYPE,
      },
      options: {
        showContent: true,
      },
      cursor,
      limit: 50,
    });

    for (const object of response.data) {
      const fields = (
        object.data?.content &&
        typeof object.data.content === "object" &&
        "fields" in object.data.content
          ? (object.data.content.fields as OnChainObjectFields)
          : null
      );
      const publishedPackage = fields ? readStringField(fields, "package").toLowerCase() : "";
      if (object.data?.objectId && publishedPackage === normalizedPackageId) {
        return object.data.objectId;
      }
    }

    cursor = response.nextCursor;
    hasNextPage = response.hasNextPage;
  }

  return null;
}

export async function bootstrapAvatarMintConfig(
  dAppKit: DAppKitInstance,
  args: {
    publisherObjectId: string;
    packageIdOverride?: string | null;
  },
) {
  const { avatarBootstrapMintConfigTarget } = avatarTargets(args.packageIdOverride);
  const transaction = new Transaction();
  transaction.moveCall({
    target: avatarBootstrapMintConfigTarget,
    arguments: [transaction.object(args.publisherObjectId)],
  });

  const result = await dAppKit.signAndExecuteTransaction({ transaction });
  const executed = ensureTransactionSucceeded(result, "Mint config bootstrap failed.");
  const mintConfigId =
    executed.effects?.changedObjects.find((object) =>
      object.idOperation === "Created" &&
      object.outputState === "ObjectWrite" &&
      object.outputOwner?.$kind === "Shared",
    )?.objectId ?? null;

  return {
    digest: executed.digest,
    mintConfigId,
  };
}

export async function updateAvatarMintConfig(
  dAppKit: DAppKitInstance,
  args: {
    mintAdminCapObjectId: string;
    mintConfigId: string;
    treasury: string;
    mintPriceMist: string | bigint | number;
    packageIdOverride?: string | null;
  },
) {
  const { avatarUpdateMintConfigTarget } = avatarTargets(args.packageIdOverride);
  const transaction = new Transaction();
  transaction.moveCall({
    target: avatarUpdateMintConfigTarget,
    arguments: [
      transaction.object(args.mintAdminCapObjectId),
      transaction.object(args.mintConfigId),
      transaction.pure.address(args.treasury),
      transaction.pure.u64(args.mintPriceMist),
    ],
  });

  const result = await dAppKit.signAndExecuteTransaction({ transaction });
  const executed = ensureTransactionSucceeded(result, "Mint config update failed.");
  return {
    digest: executed.digest,
  };
}

export async function findOwnedAvatarObjectId(
  client: SuiGrpcClient,
  owner: string,
  afterDigest?: string,
  packageIdOverride?: string | null,
) {
  const { avatarObjectType, legacyAvatarObjectType } = avatarTargets(packageIdOverride);
  const [avatarObjects, legacyObjects] = await Promise.all([
    listOwnedAvatarObjectIdsByType(client, owner, avatarObjectType),
    listOwnedAvatarObjectIdsByType(client, owner, legacyAvatarObjectType),
  ]);
  const objects = [...avatarObjects, ...legacyObjects];
  if (afterDigest) {
    const exactMatch = objects.find((object) => object.previousTransaction === afterDigest);
    if (exactMatch?.objectId) {
      return exactMatch.objectId;
    }
  }

  return objects[0]?.objectId ?? null;
}

export async function mintAvatarObject(
  client: unknown,
  dAppKit: DAppKitInstance,
  args: {
    name: string;
    description: string;
    displayDescription: string;
    manifestBlobId: string;
    previewBlobId: string;
    previewUrl: string;
    projectUrl: string;
    wins: number;
    losses: number;
    hp: number;
    schemaVersion: number;
    legacyRig: string;
  },
): Promise<{
  digest: string;
  avatarObjectId: string | null;
}> {
  const {
    avatarMintPaidTarget,
    avatarMintTarget,
    legacyAvatarMintTarget,
  } = avatarTargets();
  const mintTarget = await resolveMintTarget(client);
  const nftPreviewUrl = buildNftImageUrl(args.previewBlobId, args.previewUrl);
  const tx = new Transaction();
  if (mintTarget === "avatar-paid-v2") {
    const pricing = await fetchAvatarMintPricing(client);
    if (!pricing.configId) {
      throw new Error(
        "Mint config is not initialized yet. Open the Admin page and bootstrap paid minting first.",
      );
    }

    const [payment] = tx.splitCoins(tx.gas, [pricing.mintPriceMist]);
    tx.moveCall({
      target: avatarMintPaidTarget,
      arguments: [
        tx.object(pricing.configId),
        payment,
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(nftPreviewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else if (mintTarget === "avatar-v2") {
    tx.moveCall({
      target: avatarMintTarget,
      arguments: [
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(nftPreviewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else if (mintTarget === "avatar-v1") {
    tx.moveCall({
      target: avatarMintTarget,
      arguments: [
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(nftPreviewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else {
    tx.moveCall({
      target: legacyAvatarMintTarget,
      arguments: [
        tx.pure.string(args.name),
        tx.pure.string(args.legacyRig),
        tx.pure.string(`${LEGACY_MANIFEST_PREFIX}${args.manifestBlobId}`),
      ],
    });
  }

  const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
  const transaction = ensureTransactionSucceeded(result, "Avatar publish failed.");

  return {
    digest: transaction.digest,
    avatarObjectId: null,
  };
}

export async function updateAvatarObject(
  client: unknown,
  dAppKit: DAppKitInstance,
  args: {
    avatarObjectId: string;
    name: string;
    description: string;
    displayDescription: string;
    manifestBlobId: string;
    previewBlobId: string;
    previewUrl: string;
    projectUrl: string;
    wins: number;
    losses: number;
    hp: number;
    xp: number;
    schemaVersion: number;
  },
) {
  const { avatarUpdateTarget } = avatarTargets();
  const updateTarget = await resolveUpdateTarget(client);
  const nftPreviewUrl = buildNftImageUrl(args.previewBlobId, args.previewUrl);
  const tx = new Transaction();
  if (updateTarget === "avatar-v3") {
    tx.moveCall({
      target: avatarUpdateTarget,
      arguments: [
        tx.object(args.avatarObjectId),
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(nftPreviewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.xp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else if (updateTarget === "avatar-v2") {
    tx.moveCall({
      target: avatarUpdateTarget,
      arguments: [
        tx.object(args.avatarObjectId),
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(nftPreviewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else {
    tx.moveCall({
      target: avatarUpdateTarget,
      arguments: [
        tx.object(args.avatarObjectId),
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(nftPreviewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  }

  const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
  const transaction = ensureTransactionSucceeded(result, "Avatar metadata sync failed.");
  return {
    digest: transaction.digest,
  };
}

export async function persistManifestRecord(
  session: WalletSession,
  manifest: ReadyAvatarManifest,
  record: ManifestRecord,
) {
  const response = await fetch(`${webEnv.apiBaseUrl}/avatar/manifest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      ...record,
      manifest,
    }),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Manifest persistence failed."));
  }

  return response.json();
}

export async function syncWalrusStorageRecord(
  session: WalletSession,
  avatarObjectId: string,
  walrusStorage: WalrusAvatarStorage,
) {
  const response = await fetch(`${webEnv.apiBaseUrl}/avatar/storage/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({
      avatarObjectId,
      walrusStorage,
    }),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Walrus storage sync failed."));
  }

  return response.json();
}

export async function extendAvatarWalrusStorage(args: {
  client: WalrusEnabledClient;
  dAppKit: DAppKitInstance;
  walrusStorage: WalrusAvatarStorage;
  epochs?: number;
}) {
  const epochs = args.epochs ?? READY_AVATAR_MAX_EPOCHS;
  const assets = collectWalrusAssets(args.walrusStorage);
  if (assets.length === 0) {
    throw new Error("No Walrus assets are available to renew for this avatar.");
  }

  const transaction = new Transaction();
  for (const asset of assets) {
    transaction.add(
      args.client.walrus.extendBlob({
        blobObjectId: asset.blobObjectId,
        epochs,
      }),
    );
  }

  const result = await args.dAppKit.signAndExecuteTransaction({ transaction });
  const executed = ensureTransactionSucceeded(result, "Walrus renewal transaction failed.");
  const nextWalrusStorage = extendWalrusStorageWindow(args.walrusStorage, epochs);
  if (!nextWalrusStorage) {
    throw new Error("Walrus renewal succeeded but storage state could not be updated.");
  }

  return {
    digest: executed.digest,
    walrusStorage: nextWalrusStorage,
  };
}
