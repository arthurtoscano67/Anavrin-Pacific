import { type useDAppKit } from "@mysten/dapp-kit-react";
import { KioskClient, KioskTransaction } from "@mysten/kiosk";
import { Transaction } from "@mysten/sui/transactions";
import { webEnv } from "../env";
import { publicSuiJsonRpcClient } from "./sui-jsonrpc";
import { readResponseError, type WalletSession } from "./session";

type DAppKitInstance = ReturnType<typeof useDAppKit>;

export type OwnedKioskCap = {
  kioskId: string;
  objectId: string;
  digest: string;
  version: string;
  isPersonal?: boolean;
};

export type KioskAwareAvatar = {
  objectId: string;
  objectType: string | null;
  location: "wallet" | "kiosk";
  kioskId: string | null;
  isListed: boolean;
  listedPriceMist: string | null;
};

const kioskClient = new KioskClient({
  client: publicSuiJsonRpcClient as never,
  network: "mainnet",
});

export function getAvatarKioskClient() {
  return kioskClient;
}

export async function fetchOwnedKioskCaps(walletAddress: string) {
  const owned = await kioskClient.getOwnedKiosks({
    address: walletAddress,
  });

  return owned.kioskOwnerCaps;
}

export async function findOwnedKioskCap(walletAddress: string, kioskId?: string | null) {
  const caps = await fetchOwnedKioskCaps(walletAddress);
  if (caps.length === 0) {
    return null;
  }

  if (!kioskId) {
    return caps[0] ?? null;
  }

  return caps.find((cap) => cap.kioskId === kioskId) ?? null;
}

function buildKioskTransaction(tx: Transaction, cap: OwnedKioskCap | null) {
  return cap
    ? new KioskTransaction({
        transaction: tx,
        kioskClient,
        cap,
      })
    : new KioskTransaction({
        transaction: tx,
        kioskClient,
      });
}

async function executeTransaction(dAppKit: DAppKitInstance, transaction: Transaction) {
  const result = await dAppKit.signAndExecuteTransaction({ transaction });
  if (result.$kind === "FailedTransaction") {
    throw new Error(
      result.FailedTransaction.status.error?.message ?? "Kiosk transaction failed.",
    );
  }

  return result.Transaction;
}

export async function syncTrackedKiosks(sessionOrWalletAddress: WalletSession | string) {
  const usingSession = typeof sessionOrWalletAddress !== "string";
  const walletAddress = usingSession
    ? sessionOrWalletAddress.walletAddress
    : sessionOrWalletAddress;
  const response = await fetch(
    usingSession
      ? `${webEnv.apiBaseUrl}/kiosk/sync`
      : `${webEnv.apiBaseUrl}/kiosk/sync/${encodeURIComponent(walletAddress)}`,
    {
      method: "POST",
      headers: usingSession
        ? {
            Authorization: `Bearer ${sessionOrWalletAddress.token}`,
          }
        : undefined,
    },
  );

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Kiosk tracking sync failed."));
  }

  return response.json();
}

export async function listAvatarForSale(args: {
  dAppKit: DAppKitInstance;
  walletAddress: string;
  avatar: KioskAwareAvatar;
  priceMist: string;
}) {
  if (!args.avatar.objectType) {
    throw new Error("Avatar object type is missing, so kiosk listing cannot be prepared.");
  }

  const existingCap =
    args.avatar.location === "kiosk" && args.avatar.kioskId
      ? await findOwnedKioskCap(args.walletAddress, args.avatar.kioskId)
      : await findOwnedKioskCap(args.walletAddress);
  const transaction = new Transaction();
  const kioskTx = buildKioskTransaction(transaction, existingCap);

  if (!existingCap) {
    kioskTx.create();
  }

  if (args.avatar.location === "wallet") {
    kioskTx.placeAndList({
      itemType: args.avatar.objectType,
      item: transaction.object(args.avatar.objectId),
      price: args.priceMist,
    });
  } else if (args.avatar.isListed) {
    kioskTx.delist({
      itemType: args.avatar.objectType,
      itemId: args.avatar.objectId,
    });
    kioskTx.list({
      itemType: args.avatar.objectType,
      itemId: args.avatar.objectId,
      price: args.priceMist,
    });
  } else {
    kioskTx.list({
      itemType: args.avatar.objectType,
      itemId: args.avatar.objectId,
      price: args.priceMist,
    });
  }

  if (!existingCap) {
    kioskTx.shareAndTransferCap(args.walletAddress);
  }
  kioskTx.finalize();

  return executeTransaction(args.dAppKit, transaction);
}

export async function delistAvatar(args: {
  dAppKit: DAppKitInstance;
  walletAddress: string;
  avatar: KioskAwareAvatar;
}) {
  if (!args.avatar.objectType || !args.avatar.kioskId) {
    throw new Error("Kiosk listing data is incomplete.");
  }

  const cap = await findOwnedKioskCap(args.walletAddress, args.avatar.kioskId);
  if (!cap) {
    throw new Error("The wallet does not control the kiosk that holds this avatar.");
  }

  const transaction = new Transaction();
  const kioskTx = buildKioskTransaction(transaction, cap);
  kioskTx.delist({
    itemType: args.avatar.objectType,
    itemId: args.avatar.objectId,
  });
  kioskTx.finalize();

  return executeTransaction(args.dAppKit, transaction);
}

export async function moveAvatarToKiosk(args: {
  dAppKit: DAppKitInstance;
  walletAddress: string;
  avatar: KioskAwareAvatar;
}) {
  if (!args.avatar.objectType) {
    throw new Error("Avatar object type is missing, so kiosk transfer cannot be prepared.");
  }

  if (args.avatar.location === "kiosk") {
    throw new Error("This avatar is already stored in a kiosk.");
  }

  const existingCap = await findOwnedKioskCap(args.walletAddress);
  const transaction = new Transaction();
  const kioskTx = buildKioskTransaction(transaction, existingCap);

  if (!existingCap) {
    kioskTx.create();
  }

  kioskTx.place({
    itemType: args.avatar.objectType,
    item: transaction.object(args.avatar.objectId),
  });

  if (!existingCap) {
    kioskTx.shareAndTransferCap(args.walletAddress);
  }
  kioskTx.finalize();

  return executeTransaction(args.dAppKit, transaction);
}

export async function takeAvatarToWallet(args: {
  dAppKit: DAppKitInstance;
  walletAddress: string;
  avatar: KioskAwareAvatar;
}) {
  if (!args.avatar.objectType || !args.avatar.kioskId) {
    throw new Error("Kiosk-held avatar data is incomplete.");
  }

  const cap = await findOwnedKioskCap(args.walletAddress, args.avatar.kioskId);
  if (!cap) {
    throw new Error("The wallet does not control the kiosk that holds this avatar.");
  }

  const transaction = new Transaction();
  const kioskTx = buildKioskTransaction(transaction, cap);
  if (args.avatar.isListed) {
    kioskTx.delist({
      itemType: args.avatar.objectType,
      itemId: args.avatar.objectId,
    });
  }

  const avatarObject = kioskTx.take({
    itemType: args.avatar.objectType,
    itemId: args.avatar.objectId,
  });
  transaction.transferObjects([avatarObject], transaction.pure.address(args.walletAddress));
  kioskTx.finalize();

  return executeTransaction(args.dAppKit, transaction);
}

export async function buyAvatarListing(args: {
  dAppKit: DAppKitInstance;
  walletAddress: string;
  avatar: KioskAwareAvatar;
}) {
  if (
    !args.avatar.objectType ||
    !args.avatar.kioskId ||
    !args.avatar.listedPriceMist
  ) {
    throw new Error("Marketplace listing data is incomplete.");
  }

  const existingCap = await findOwnedKioskCap(args.walletAddress);
  const transaction = new Transaction();
  const kioskTx = buildKioskTransaction(transaction, existingCap);

  if (!existingCap) {
    kioskTx.create();
  }

  await kioskTx.purchaseAndResolve({
    itemType: args.avatar.objectType,
    itemId: args.avatar.objectId,
    price: args.avatar.listedPriceMist,
    sellerKiosk: args.avatar.kioskId,
  });

  if (!existingCap) {
    kioskTx.shareAndTransferCap(args.walletAddress);
  }
  kioskTx.finalize();

  return executeTransaction(args.dAppKit, transaction);
}

export async function fetchTransferPoliciesForType(itemType: string) {
  return kioskClient.getTransferPolicies({
    type: itemType,
  });
}
