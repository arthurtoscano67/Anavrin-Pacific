import { Buffer } from "node:buffer";
import { LRUCache } from "lru-cache";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { walrus } from "@mysten/walrus";
import { READY_AVATAR_MANIFEST_MIME, READY_AVATAR_PREVIEW_MIME, READY_AVATAR_VRM_MIME } from "@pacific/shared";
import type { OptionalDatabase } from "./db.js";
import { apiConfig } from "./config.js";

const suiClient = new SuiGrpcClient({
  network: apiConfig.SUI_NETWORK,
  baseUrl: apiConfig.SUI_GRPC_URL,
}).$extend(walrus());

const WALRUS_PUBLIC_BLOB_BASE_URL =
  process.env.WALRUS_PUBLIC_BLOB_BASE_URL?.trim() ||
  "https://aggregator.walrus-mainnet.walrus.space/v1/blobs";
const parsedWalrusReadTimeoutMs = Number(process.env.WALRUS_READ_TIMEOUT_MS ?? "2500");
const WALRUS_READ_TIMEOUT_MS =
  Number.isFinite(parsedWalrusReadTimeoutMs) && parsedWalrusReadTimeoutMs > 0
    ? Math.floor(parsedWalrusReadTimeoutMs)
    : 2500;

const memoryCache = new LRUCache<string, { body: Buffer; contentType: string }>({
  max: 200,
  ttl: apiConfig.WALRUS_READ_CACHE_TTL_MS,
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function readBlobFromAggregator(blobId: string) {
  const response = await fetch(
    `${WALRUS_PUBLIC_BLOB_BASE_URL}/${encodeURIComponent(blobId)}`,
    {
      headers: {
        Accept: "*/*",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Walrus aggregator read failed with HTTP ${response.status}.`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function readBlobFromGateway(
  sql: OptionalDatabase,
  blobId: string,
  contentTypeHint?: string,
) {
  const cached = memoryCache.get(blobId);
  if (cached) {
    return cached;
  }

  if (sql) {
    const rows = await sql`
      select content_type, body
      from walrus_blob_cache
      where blob_id = ${blobId}
        and cached_at > now() - (${apiConfig.WALRUS_READ_CACHE_TTL_MS} * interval '1 millisecond')
      limit 1
    `;

    if (rows.length > 0) {
      const dbRow = rows[0] as { content_type: string; body: Buffer };
      const result = { body: dbRow.body, contentType: dbRow.content_type };
      memoryCache.set(blobId, result);
      return result;
    }
  }

  let bytes: Uint8Array<ArrayBufferLike>;
  try {
    bytes = await withTimeout(
      readBlobFromAggregator(blobId),
      WALRUS_READ_TIMEOUT_MS,
      `Walrus blob ${blobId} HTTP read timed out.`,
    );
  } catch {
    bytes = await withTimeout(
      suiClient.walrus.readBlob({ blobId }),
      WALRUS_READ_TIMEOUT_MS,
      `Walrus blob ${blobId} gRPC read timed out.`,
    );
  }

  const result = {
    body: Buffer.from(bytes),
    contentType: contentTypeHint ?? "application/octet-stream",
  };

  memoryCache.set(blobId, result);
  if (sql) {
    await sql`
      insert into walrus_blob_cache (blob_id, content_type, body, cached_at)
      values (${blobId}, ${result.contentType}, ${result.body}, now())
      on conflict (blob_id) do update
      set content_type = excluded.content_type,
          body = excluded.body,
          cached_at = excluded.cached_at
    `;
  }

  return result;
}

export async function resolveBlobContentType(sql: OptionalDatabase, blobId: string) {
  if (!sql) {
    return "application/octet-stream";
  }

  const manifestRows = await sql`
      select
        case
          when avatar_blob_id = ${blobId} then ${READY_AVATAR_VRM_MIME}
          when preview_blob_id = ${blobId} then ${READY_AVATAR_PREVIEW_MIME}
          when manifest_blob_id = ${blobId} then ${READY_AVATAR_MANIFEST_MIME}
          else null
        end as content_type
      from avatar_manifests
      where avatar_blob_id = ${blobId}
         or preview_blob_id = ${blobId}
         or manifest_blob_id = ${blobId}
      limit 1
    `;

  const row = manifestRows[0] as { content_type: string | null } | undefined;
  return row?.content_type ?? "application/octet-stream";
}
