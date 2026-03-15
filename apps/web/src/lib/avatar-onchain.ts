import { READY_AVATAR_PREVIEW_MIME, type ShooterStats } from "@pacific/shared";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { buildNftImageUrl, buildWalrusBlobReadUrl } from "./avatar-public";

const publicSuiClient = new SuiJsonRpcClient({
  network: "mainnet",
  url: getJsonRpcFullnodeUrl("mainnet"),
});

type OnChainObjectFields = Record<string, unknown>;

export type OnChainAvatarMetadata = {
  objectId: string;
  objectType: string | null;
  name: string;
  description: string;
  displayDescription: string;
  manifestBlobId: string;
  previewBlobId: string;
  previewUrl: string;
  projectUrl: string;
  schemaVersion: number;
  shooterStats: ShooterStats;
};

function readStringField(fields: OnChainObjectFields, key: string) {
  const value = fields[key];
  return typeof value === "string" ? value : "";
}

function readNumberField(fields: OnChainObjectFields, key: string, fallback = 0) {
  const value = fields[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export async function fetchOnChainAvatarMetadata(avatarObjectId: string) {
  const response = await publicSuiClient.getObject({
    id: avatarObjectId,
    options: {
      showContent: true,
      showDisplay: true,
      showType: true,
    },
  });

  const fields = (
    response.data?.content &&
    typeof response.data.content === "object" &&
    "fields" in response.data.content
      ? (response.data.content.fields as OnChainObjectFields)
      : null
  );

  if (!response.data || !fields) {
    throw new Error("Avatar object does not expose readable Move fields.");
  }

  const display = response.data.display?.data ?? {};
  const displayName = typeof display.name === "string" ? display.name : "";
  const displayDescription =
    typeof display.description === "string" ? display.description : "";
  const displayImage = typeof display.image === "string" ? display.image : "";
  const displayImageUrl =
    typeof display.image_url === "string" ? display.image_url : "";
  const displayThumbnailUrl =
    typeof display.thumbnail_url === "string" ? display.thumbnail_url : "";
  const displayLink = typeof display.link === "string" ? display.link : "";

  return {
    objectId: response.data.objectId,
    objectType: response.data.type ?? null,
    name: readStringField(fields, "name") || displayName || "Pacific Operator",
    description: readStringField(fields, "description"),
    displayDescription:
      readStringField(fields, "display_description") || displayDescription,
    manifestBlobId: readStringField(fields, "manifest_blob_id"),
    previewBlobId: readStringField(fields, "preview_blob_id"),
    previewUrl:
      readStringField(fields, "preview_url") ||
      displayImage ||
      displayImageUrl ||
      displayThumbnailUrl ||
      buildNftImageUrl(readStringField(fields, "preview_blob_id")),
    projectUrl: readStringField(fields, "project_url") || displayLink,
    schemaVersion: readNumberField(fields, "schema_version", 1),
    shooterStats: {
      wins: readNumberField(fields, "wins", 0),
      losses: readNumberField(fields, "losses", 0),
      hp: readNumberField(fields, "hp", 100),
    },
  } satisfies OnChainAvatarMetadata;
}

export async function loadWalrusPreviewObjectUrl(previewBlobId: string) {
  const response = await fetch(buildWalrusBlobReadUrl(previewBlobId));
  if (!response.ok) {
    throw new Error(`Walrus preview fetch failed with HTTP ${response.status}.`);
  }

  const buffer = await response.arrayBuffer();
  return URL.createObjectURL(
    new Blob([buffer], {
      type: READY_AVATAR_PREVIEW_MIME,
    }),
  );
}
