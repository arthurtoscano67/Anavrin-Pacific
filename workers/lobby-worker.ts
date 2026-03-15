import { ArenaLobby } from "./arena-lobby";

export { ArenaLobby };

export interface Env {
  ARENA_LOBBY: DurableObjectNamespace;
}

const WALRUS_PUBLIC_BLOB_BASE_URL = "https://aggregator.walrus-mainnet.walrus.space/v1/blobs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handlePreviewRequest(url: URL) {
  const blobId = url.pathname.replace(/^\/preview\//, "").trim();
  if (!blobId) {
    return jsonResponse({ error: "Missing preview blob id." }, 400);
  }

  const upstream = await fetch(`${WALRUS_PUBLIC_BLOB_BASE_URL}/${encodeURIComponent(blobId)}`, {
    cf: {
      cacheEverything: true,
      cacheTtl: 31_536_000,
    },
  });

  if (!upstream.ok || !upstream.body) {
    return jsonResponse({
      error: `Walrus preview fetch failed with HTTP ${upstream.status}.`,
    }, upstream.status || 502);
  }

  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `inline; filename="${blobId}.png"`,
      "content-type": "image/png",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  });
}

function handlePreviewHeadRequest(url: URL) {
  const blobId = url.pathname.replace(/^\/preview\//, "").trim();
  if (!blobId) {
    return jsonResponse({ error: "Missing preview blob id." }, 400);
  }

  return new Response(null, {
    headers: {
      ...corsHeaders,
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": `inline; filename="${blobId}.png"`,
      "content-type": "image/png",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      request.method === "OPTIONS" &&
      (url.pathname.startsWith("/api/") || url.pathname.startsWith("/preview/"))
    ) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "HEAD" && url.pathname.startsWith("/preview/")) {
      return handlePreviewHeadRequest(url);
    }

    if (request.method === "GET" && url.pathname.startsWith("/preview/")) {
      return handlePreviewRequest(url);
    }

    if (url.pathname === "/lobby" || url.pathname === "/ws/lobby" || url.pathname.startsWith("/api/")) {
      const id = env.ARENA_LOBBY.idFromName("global-lobby");
      const stub = env.ARENA_LOBBY.get(id);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/room/") || url.pathname.startsWith("/ws/room/")) {
      const roomId = url.pathname.replace(/^\/(?:ws\/)?room\//, "").trim();
      if (!roomId) {
        return new Response("Missing room id", { status: 400 });
      }
      const id = env.ARENA_LOBBY.idFromName(`room:${roomId}`);
      const stub = env.ARENA_LOBBY.get(id);
      return stub.fetch(request);
    }

    return jsonResponse({
      ok: true,
      service: "anavrin-arena-lobby",
      websocket: "/ws/lobby",
      preview: "/preview/:blobId",
      roomWebsocket: "/ws/room/:roomId",
      api: {
        lobbySnapshot: "/api/lobby/snapshot",
        battles: "/api/battles?kind=featured&page=1&pageSize=6",
        battleSummary: "/api/battles/:matchId",
      },
    });
  },
};
