import express from "express";
import { SuiClient } from "@mysten/sui/client";

import { PACKAGE_ID, RENDERER, SUI_NETWORK } from "../app/lib/constants";
import { renderMonsterSvg } from "../app/lib/monsterRenderer";

const PORT = Number(process.env.PORT ?? 3000);
const RPC_URL = process.env.SUI_RPC_URL ?? "https://fullnode.mainnet.sui.io:443";

const app = express();
const client = new SuiClient({ url: RPC_URL });

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike {
  if (!value || typeof value !== "object") return {};
  return value as RecordLike;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "bigint") return Number(value);
  return fallback;
}

async function loadMartian(id: string) {
  const response = await client.getObject({
    id,
    options: { showContent: true, showType: true },
  });

  const data = response.data;
  if (!data) {
    throw new Error(`Martian ${id} was not found on Sui ${SUI_NETWORK}.`);
  }

  const content = asRecord(data.content);
  const type = asString(content.type, asString(data.type));
  if (!type.includes(`${PACKAGE_ID}::martian::Martian`)) {
    throw new Error(`Object ${id} is not a Martian NFT.`);
  }

  const fields = asRecord(content.fields);
  return {
    objectId: id,
    name: asString(fields.name, "Martian"),
    seed: asString(fields.seed, id),
    stage: asNumber(fields.stage, 0),
    attack: asNumber(fields.attack, 0),
    defense: asNumber(fields.defense, 0),
    speed: asNumber(fields.speed, 0),
    wins: asNumber(fields.wins, 0),
    losses: asNumber(fields.losses, 0),
    xp: asNumber(fields.xp, 0),
    scars: asNumber(fields.scars, 0),
    broken_horns: asNumber(fields.broken_horns, 0),
    torn_wings: asNumber(fields.torn_wings, 0),
  };
}

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "martian-renderer",
    network: SUI_NETWORK,
    packageId: PACKAGE_ID,
    renderer: RENDERER,
  });
});

app.get("/martian/:id.svg", async (req, res) => {
  try {
    const martian = await loadMartian(req.params.id);
    const svg = renderMonsterSvg(martian);

    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.send(svg.trim());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown renderer error";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).setHeader("Content-Type", "text/plain; charset=utf-8").send(message);
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Martian renderer listening on http://localhost:${PORT}`);
});
