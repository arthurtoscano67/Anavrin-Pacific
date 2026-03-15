import { KioskClient, Network } from "@mysten/kiosk";
import type { SuiClient, SuiObjectData } from "@mysten/sui/client";

import { ADMIN_CAP_TYPE, MONSTER_TYPE, SUI_NETWORK, TREASURY_ID } from "./config";
import type { KioskModel, MintConfig, MonsterModel } from "./types";

function kioskNetwork(): Network {
  if (SUI_NETWORK === "mainnet") return Network.MAINNET;
  if (SUI_NETWORK === "testnet") return Network.TESTNET;
  return Network.CUSTOM;
}

function parseMonsterFromObject(
  objectData: SuiObjectData,
  location: "wallet" | "kiosk",
  kioskId?: string,
  listedPriceMist?: string
): MonsterModel | null {
  const fields =
    objectData.content?.dataType === "moveObject"
      ? (objectData.content.fields as Record<string, unknown>)
      : null;
  if (!fields) return null;

  return {
    objectId: objectData.objectId,
    name: String(fields.name ?? "Unknown Monster"),
    stage: Number(fields.stage ?? 0),
    createdAt: Number(fields.created_at ?? 0),
    stats: {
      attack: Number(fields.attack ?? 0),
      defense: Number(fields.defense ?? 0),
      speed: Number(fields.speed ?? 0),
      wins: Number(fields.wins ?? 0),
      losses: Number(fields.losses ?? 0),
      xp: Number(fields.xp ?? 0),
    },
    location,
    kioskId,
    listedPriceMist,
  };
}

export async function fetchMintConfig(client: SuiClient): Promise<MintConfig> {
  const obj = await client.getObject({
    id: TREASURY_ID,
    options: { showContent: true },
  });
  const fields =
    obj.data?.content?.dataType === "moveObject"
      ? (obj.data.content.fields as Record<string, unknown>)
      : {};

  return {
    mintPriceMist: String(fields.mint_price_mist ?? "0"),
    mintEnabled: Boolean(fields.mint_enabled ?? false),
    feesMist: String(fields.fees ?? "0"),
  };
}

export async function fetchWalletMonsters(
  client: SuiClient,
  address: string
): Promise<MonsterModel[]> {
  const result = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: MONSTER_TYPE },
    options: { showContent: true, showType: true },
  });

  return result.data
    .map((entry) => entry.data)
    .filter((entry): entry is SuiObjectData => Boolean(entry))
    .map((entry) => parseMonsterFromObject(entry, "wallet"))
    .filter((entry): entry is MonsterModel => Boolean(entry));
}

export async function fetchOwnedKiosks(client: SuiClient, address: string): Promise<KioskModel[]> {
  const kioskClient = new KioskClient({
    client,
    network: kioskNetwork(),
  });
  const owned = await kioskClient.getOwnedKiosks({ address });
  const kiosks = await Promise.all(
    owned.kioskOwnerCaps.map(async (cap) => {
      const kiosk = await kioskClient.getKiosk({
        id: cap.kioskId,
        options: { withKioskFields: true },
      });
      return {
        kioskId: cap.kioskId,
        ownerCapId: cap.objectId,
        itemCount: kiosk.kiosk?.itemCount ?? 0,
      };
    })
  );
  return kiosks;
}

export async function fetchKioskMonsters(
  client: SuiClient,
  kioskId: string
): Promise<MonsterModel[]> {
  const kioskClient = new KioskClient({
    client,
    network: kioskNetwork(),
  });
  const kiosk = await kioskClient.getKiosk({
    id: kioskId,
    options: {
      withKioskFields: true,
      withObjects: true,
      withListingPrices: true,
      objectOptions: {
        showContent: true,
        showType: true,
      },
    },
  });

  return kiosk.items
    .filter((item) => item.type === MONSTER_TYPE)
    .map((item) => {
      if (!item.data) return null;
      return parseMonsterFromObject(item.data, "kiosk", kioskId, item.listing?.price);
    })
    .filter((item): item is MonsterModel => Boolean(item));
}

export async function fetchAdminCapId(
  client: SuiClient,
  address: string
): Promise<string | null> {
  const result = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: ADMIN_CAP_TYPE },
    options: { showType: true },
  });
  return result.data[0]?.data?.objectId || null;
}
