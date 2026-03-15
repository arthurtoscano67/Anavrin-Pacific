import { type useDAppKit } from "@mysten/dapp-kit-react";
import { KioskTransaction } from "@mysten/kiosk";
import {
  READY_AVATAR_MAX_EPOCHS,
  type ManifestRecord,
  type ReadyAvatarManifest,
  type WalrusAvatarStorage,
} from "@pacific/shared";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { webEnv } from "../env";
import { readResponseError, type WalletSession } from "./session";
import { collectWalrusAssets, extendWalrusStorageWindow } from "./walrus-storage";
import { findOwnedKioskCap, getAvatarKioskClient } from "./avatar-kiosk";
import { publicSuiJsonRpcClient } from "./sui-jsonrpc";

type DAppKitInstance = ReturnType<typeof useDAppKit>;
type WalrusEnabledClient = SuiGrpcClient & {
  walrus: {
    extendBlob(options: { blobObjectId: string; epochs: number }): (tx: Transaction) => Promise<void>;
  };
};
type TransactionResultWithEffects = Awaited<
  ReturnType<DAppKitInstance["signAndExecuteTransaction"]>
>;

const LEGACY_AVATAR_OBJECT_TYPE = `${webEnv.avatarPackageId}::simple_avatar::Avatar`;
const AVATAR_OBJECT_TYPE = `${webEnv.avatarPackageId}::avatar::Avatar`;
const LEGACY_AVATAR_MINT_TARGET = `${webEnv.avatarPackageId}::simple_avatar::mint`;
const AVATAR_MINT_TARGET = `${webEnv.avatarPackageId}::avatar::mint`;
const AVATAR_UPDATE_TARGET = `${webEnv.avatarPackageId}::avatar::update`;
const LEGACY_MANIFEST_PREFIX = "walrus://";

type MoveFunctionLike = {
  function?: {
    parameters?: unknown[];
  };
};

type AvatarMintTarget = "legacy" | "avatar-v1" | "avatar-v2" | "avatar-v3";
type AvatarUpdateTarget = "avatar-v1" | "avatar-v2";

export type AvatarMintConfig = {
  treasuryObjectId: string;
  mintPriceMist: string;
  mintEnabled: boolean;
  feesMist: string;
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
    const avatarMint = await readMoveFunction(client, {
      packageId: webEnv.avatarPackageId,
      moduleName: "avatar",
      name: "mint",
    });
    const parameterCount = avatarMint.function?.parameters?.length ?? 0;
    return parameterCount >= 14
      ? "avatar-v3"
      : parameterCount >= 12
        ? "avatar-v2"
        : "avatar-v1";
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

function appendAvatarUpdateCall(
  transaction: Transaction,
  updateTarget: AvatarUpdateTarget,
  avatarObject: TransactionObjectArgument,
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
  },
) {
  if (updateTarget === "avatar-v2") {
    transaction.moveCall({
      target: AVATAR_UPDATE_TARGET,
      arguments: [
        avatarObject,
        transaction.pure.string(args.name),
        transaction.pure.string(args.description),
        transaction.pure.string(args.displayDescription),
        transaction.pure.string(args.manifestBlobId),
        transaction.pure.string(args.previewBlobId),
        transaction.pure.string(args.previewUrl),
        transaction.pure.string(args.projectUrl),
        transaction.pure.u64(args.wins),
        transaction.pure.u64(args.losses),
        transaction.pure.u64(args.hp),
        transaction.pure.u64(args.schemaVersion),
      ],
    });
    return;
  }

  transaction.moveCall({
    target: AVATAR_UPDATE_TARGET,
    arguments: [
      avatarObject,
      transaction.pure.string(args.name),
      transaction.pure.string(args.description),
      transaction.pure.string(args.manifestBlobId),
      transaction.pure.string(args.previewBlobId),
      transaction.pure.string(args.previewUrl),
      transaction.pure.string(args.projectUrl),
      transaction.pure.u64(args.schemaVersion),
    ],
  });
}

export async function fetchAvatarMintConfig() {
  if (!webEnv.avatarTreasuryId) {
    return null;
  }

  const treasury = await publicSuiJsonRpcClient.getObject({
    id: webEnv.avatarTreasuryId,
    options: {
      showContent: true,
    },
  });
  const fields =
    treasury.data?.content?.dataType === "moveObject"
      ? (treasury.data.content.fields as Record<string, unknown>)
      : null;
  if (!fields) {
    throw new Error("Avatar mint treasury is not readable on chain.");
  }

  const fees =
    fields.fees && typeof fields.fees === "object"
      ? Number((fields.fees as Record<string, unknown>).value ?? 0)
      : 0;

  return {
    treasuryObjectId: webEnv.avatarTreasuryId,
    mintPriceMist: String(fields.mint_price_mist ?? "0"),
    mintEnabled: Boolean(fields.mint_enabled ?? false),
    feesMist: Number.isFinite(fees) && fees >= 0 ? String(Math.floor(fees)) : "0",
  } satisfies AvatarMintConfig;
}

export async function findOwnedAvatarAdminCapId(owner: string) {
  const result = await publicSuiJsonRpcClient.getOwnedObjects({
    owner,
    filter: {
      StructType: `${webEnv.avatarPackageId}::avatar::AvatarAdminCap`,
    },
    options: {
      showType: true,
    },
    limit: 1,
  });

  return result.data[0]?.data?.objectId ?? null;
}

export async function setAvatarMintEnabled(args: {
  dAppKit: DAppKitInstance;
  adminCapId: string;
  enabled: boolean;
}) {
  if (!webEnv.avatarTreasuryId) {
    throw new Error("Set VITE_AVATAR_TREASURY_ID before changing mint settings.");
  }

  const transaction = new Transaction();
  transaction.moveCall({
    target: `${webEnv.avatarPackageId}::avatar::set_mint_enabled`,
    arguments: [
      transaction.object(webEnv.avatarTreasuryId),
      transaction.object(args.adminCapId),
      transaction.pure.bool(args.enabled),
    ],
  });

  const result = await args.dAppKit.signAndExecuteTransaction({ transaction });
  return ensureTransactionSucceeded(result, "Mint enabled update failed.");
}

export async function setAvatarMintPrice(args: {
  dAppKit: DAppKitInstance;
  adminCapId: string;
  priceMist: string;
}) {
  if (!webEnv.avatarTreasuryId) {
    throw new Error("Set VITE_AVATAR_TREASURY_ID before changing mint price.");
  }

  const transaction = new Transaction();
  transaction.moveCall({
    target: `${webEnv.avatarPackageId}::avatar::set_mint_price`,
    arguments: [
      transaction.object(webEnv.avatarTreasuryId),
      transaction.object(args.adminCapId),
      transaction.pure.u64(BigInt(args.priceMist || "0")),
    ],
  });

  const result = await args.dAppKit.signAndExecuteTransaction({ transaction });
  return ensureTransactionSucceeded(result, "Mint price update failed.");
}

export async function withdrawAvatarMintFees(args: {
  dAppKit: DAppKitInstance;
  adminCapId: string;
  destinationAddress: string;
}) {
  if (!webEnv.avatarTreasuryId) {
    throw new Error("Set VITE_AVATAR_TREASURY_ID before withdrawing mint fees.");
  }

  const transaction = new Transaction();
  transaction.moveCall({
    target: `${webEnv.avatarPackageId}::avatar::withdraw_fees`,
    arguments: [
      transaction.object(webEnv.avatarTreasuryId),
      transaction.object(args.adminCapId),
      transaction.pure.address(args.destinationAddress),
    ],
  });

  const result = await args.dAppKit.signAndExecuteTransaction({ transaction });
  return ensureTransactionSucceeded(result, "Mint fee withdrawal failed.");
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
    mintPriceMist?: string | null;
    legacyRig: string;
  },
): Promise<{
  digest: string;
  avatarObjectId: string | null;
}> {
  const mintTarget = await resolveMintTarget(client);
  const tx = new Transaction();
  if (mintTarget === "avatar-v3") {
    if (!webEnv.avatarTreasuryId) {
      throw new Error(
        "Set VITE_AVATAR_TREASURY_ID before minting with the admin-priced avatar package.",
      );
    }

    const [payment] = tx.splitCoins(tx.gas, [
      tx.pure.u64(BigInt(args.mintPriceMist ?? "0")),
    ]);
    tx.moveCall({
      target: AVATAR_MINT_TARGET,
      arguments: [
        tx.object(webEnv.avatarTreasuryId),
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
    objectType?: string | null;
    location?: "wallet" | "kiosk";
    kioskId?: string | null;
    isListed?: boolean;
    listedPriceMist?: string | null;
    walletAddress?: string | null;
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
  const isKioskHeld = args.location === "kiosk";
  if (isKioskHeld) {
    if (!args.objectType || !args.kioskId || !args.walletAddress) {
      throw new Error("Kiosk-held avatar sync requires object type, kiosk id, and wallet address.");
    }

    if (args.isListed && !args.listedPriceMist) {
      throw new Error("Kiosk listing price is missing, so the avatar cannot be re-listed after sync.");
    }

    const cap = await findOwnedKioskCap(args.walletAddress, args.kioskId);
    if (!cap) {
      throw new Error("The connected wallet does not control the kiosk that holds this avatar.");
    }

    const tx = new Transaction();
    const kioskTx = new KioskTransaction({
      transaction: tx,
      kioskClient: getAvatarKioskClient(),
      cap,
    });

    if (args.isListed) {
      kioskTx.delist({
        itemType: args.objectType,
        itemId: args.avatarObjectId,
      });
    }

    const avatarObject = kioskTx.take({
      itemType: args.objectType,
      itemId: args.avatarObjectId,
    });
    appendAvatarUpdateCall(tx, updateTarget, avatarObject, args);

    if (args.isListed) {
      kioskTx.placeAndList({
        itemType: args.objectType,
        item: avatarObject,
        price: args.listedPriceMist ?? "0",
      });
    } else {
      kioskTx.place({
        itemType: args.objectType,
        item: avatarObject,
      });
    }

    kioskTx.finalize();
    const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
    const transaction = ensureTransactionSucceeded(result, "Avatar metadata sync failed.");
    return {
      digest: transaction.digest,
    };
  }

  const tx = new Transaction();
  appendAvatarUpdateCall(tx, updateTarget, tx.object(args.avatarObjectId), args);
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
