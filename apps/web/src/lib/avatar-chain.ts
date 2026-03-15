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

const LEGACY_AVATAR_OBJECT_TYPE = `${webEnv.avatarPackageId}::simple_avatar::Avatar`;
const AVATAR_OBJECT_TYPE = `${webEnv.avatarPackageId}::avatar::Avatar`;
const LEGACY_AVATAR_MINT_TARGET = `${webEnv.avatarPackageId}::simple_avatar::mint`;
const AVATAR_MINT_TARGET = `${webEnv.avatarPackageId}::avatar::mint`;
const AVATAR_MINT_PAID_TARGET = `${webEnv.avatarPackageId}::avatar::mint_paid`;
const AVATAR_UPDATE_TARGET = `${webEnv.avatarPackageId}::avatar::update`;
const AVATAR_BOOTSTRAP_MINT_CONFIG_TARGET = `${webEnv.avatarPackageId}::avatar::bootstrap_mint_config`;
const AVATAR_UPDATE_MINT_CONFIG_TARGET = `${webEnv.avatarPackageId}::avatar::update_mint_config`;
const AVATAR_MINT_ADMIN_CAP_OBJECT_TYPE = `${webEnv.avatarPackageId}::avatar::MintAdminCap`;
const PACKAGE_PUBLISHER_OBJECT_TYPE = "0x2::package::Publisher";
const MINT_CONFIG_CREATED_EVENT_TYPE = `${webEnv.avatarPackageId}::avatar::MintConfigCreated`;
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
type AvatarUpdateTarget = "avatar-v1" | "avatar-v2";

export type AvatarMintPricing = {
  target: AvatarMintTarget;
  mode: "free" | "paid";
  configId: string | null;
  mintPriceMist: string;
  treasury: string | null;
};

function ensureTransactionSucceeded(
  result: TransactionResultWithEffects,
  fallbackMessage: string,
) {
  if (result.$kind === "FailedTransaction") {
    throw new Error(result.FailedTransaction.status.error?.message ?? fallbackMessage);
  }

  return result.Transaction;
}

function extractCreatedOwnedObjectId(
  result: TransactionResultWithEffects,
  owner: string,
) {
  const transaction = ensureTransactionSucceeded(result, "Transaction execution failed.");
  const createdObject = transaction.effects?.changedObjects.find((object) =>
    object.idOperation === "Created" &&
    object.outputState === "ObjectWrite" &&
    object.outputOwner?.$kind === "AddressOwner" &&
    object.outputOwner.AddressOwner === owner,
  );

  return createdObject?.objectId ?? null;
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

async function findMintConfigIdFromEvents() {
  const response = await publicSuiClient.queryEvents({
    query: {
      MoveEventType: MINT_CONFIG_CREATED_EVENT_TYPE,
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

async function resolveMintConfigId(configIdOverride?: string | null) {
  const configured = configIdOverride?.trim() || webEnv.avatarMintConfigId.trim();
  if (configured) {
    return configured;
  }

  return findMintConfigIdFromEvents();
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
      `Unable to inspect Move functions in package ${webEnv.avatarPackageId}. Restart the app if you recently changed the package ID.`,
    );
  }

  return moveInspector.getMoveFunction(input);
}

async function resolveMintTarget(client: unknown): Promise<AvatarMintTarget> {
  try {
    const paidMint = await readMoveFunction(client, {
      packageId: webEnv.avatarPackageId,
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
      packageId: webEnv.avatarPackageId,
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
      packageId: webEnv.avatarPackageId,
      moduleName: "simple_avatar",
      name: "mint",
    });
    return "legacy";
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error(
    `Unable to find a supported mint function in package ${webEnv.avatarPackageId}. Restart the app if you recently changed the package ID.`,
  );
}

async function resolveUpdateTarget(client: unknown): Promise<AvatarUpdateTarget> {
  const avatarUpdate = await readMoveFunction(client, {
    packageId: webEnv.avatarPackageId,
    moduleName: "avatar",
    name: "update",
  });
  const parameterCount = avatarUpdate.function?.parameters?.length ?? 0;
  return parameterCount >= 13 ? "avatar-v2" : "avatar-v1";
}

export async function fetchAvatarMintPricing(
  client: unknown,
  configIdOverride?: string | null,
): Promise<AvatarMintPricing> {
  const target = await resolveMintTarget(client);
  if (target !== "avatar-paid-v2") {
    return {
      target,
      mode: "free",
      configId: null,
      mintPriceMist: "0",
      treasury: null,
    };
  }

  const configId = await resolveMintConfigId(configIdOverride);
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

export async function findOwnedMintAdminCapObjectId(owner: string) {
  const objectIds = await listOwnedObjectIdsByType(owner, AVATAR_MINT_ADMIN_CAP_OBJECT_TYPE);
  return objectIds[0] ?? null;
}

export async function findOwnedPublisherObjectId(owner: string) {
  let cursor: string | null | undefined = null;
  let hasNextPage = true;
  const normalizedPackageId = webEnv.avatarPackageId.trim().toLowerCase();

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
  },
) {
  const transaction = new Transaction();
  transaction.moveCall({
    target: AVATAR_BOOTSTRAP_MINT_CONFIG_TARGET,
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
  },
) {
  const transaction = new Transaction();
  transaction.moveCall({
    target: AVATAR_UPDATE_MINT_CONFIG_TARGET,
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
) {
  const [avatarObjects, legacyObjects] = await Promise.all([
    listOwnedAvatarObjectIdsByType(client, owner, AVATAR_OBJECT_TYPE),
    listOwnedAvatarObjectIdsByType(client, owner, LEGACY_AVATAR_OBJECT_TYPE),
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
  owner: string,
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
  const mintTarget = await resolveMintTarget(client);
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
      target: AVATAR_MINT_PAID_TARGET,
      arguments: [
        tx.object(pricing.configId),
        payment,
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(args.previewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else if (mintTarget === "avatar-v2") {
    tx.moveCall({
      target: AVATAR_MINT_TARGET,
      arguments: [
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(args.previewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else if (mintTarget === "avatar-v1") {
    tx.moveCall({
      target: AVATAR_MINT_TARGET,
      arguments: [
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(args.previewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else {
    tx.moveCall({
      target: LEGACY_AVATAR_MINT_TARGET,
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
    avatarObjectId: extractCreatedOwnedObjectId(result, owner),
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
    schemaVersion: number;
  },
) {
  const updateTarget = await resolveUpdateTarget(client);
  const tx = new Transaction();
  if (updateTarget === "avatar-v2") {
    tx.moveCall({
      target: AVATAR_UPDATE_TARGET,
      arguments: [
        tx.object(args.avatarObjectId),
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.displayDescription),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(args.previewUrl),
        tx.pure.string(args.projectUrl),
        tx.pure.u64(args.wins),
        tx.pure.u64(args.losses),
        tx.pure.u64(args.hp),
        tx.pure.u64(args.schemaVersion),
      ],
    });
  } else {
    tx.moveCall({
      target: AVATAR_UPDATE_TARGET,
      arguments: [
        tx.object(args.avatarObjectId),
        tx.pure.string(args.name),
        tx.pure.string(args.description),
        tx.pure.string(args.manifestBlobId),
        tx.pure.string(args.previewBlobId),
        tx.pure.string(args.previewUrl),
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
