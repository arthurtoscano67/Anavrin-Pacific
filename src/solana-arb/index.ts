import "dotenv/config";

import { loadConfig } from "./config.js";
import { ArbEngine } from "./arbEngine.js";
import type { ArbRouteConfig, WalletWorker } from "./types.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const controller = new AbortController();

  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());

  const workerDefs: Array<{ label: string; secretKey?: Uint8Array; routes: ArbRouteConfig[] }> =
    config.workers.length > 0
      ? shardRoutes(config.routes, config.workers).map(({ worker, routes }) => ({
          label: worker.label,
          secretKey: worker.secretKey,
          routes,
        }))
      : [
          {
            label: "scanner-read-only",
            routes: config.routes,
          },
        ];

  const engines = workerDefs.map(
    (workerDef) =>
      new ArbEngine({
        config,
        workerLabel: workerDef.label,
        workerSecretKey: workerDef.secretKey,
        routes: workerDef.routes,
      }),
  );

  if (config.runOnce) {
    await Promise.all(
      engines.map(async (engine) => {
        await engine.runCycle();
      }),
    );
    return;
  }

  await Promise.all(engines.map((engine) => engine.runForever(controller.signal)));
}

function shardRoutes(
  routes: ArbRouteConfig[],
  workers: WalletWorker[],
): Array<{ worker: WalletWorker; routes: ArbRouteConfig[] }> {
  const shards = workers.map((worker) => ({
    worker,
    routes: [] as ArbRouteConfig[],
  }));

  for (let i = 0; i < routes.length; i += 1) {
    const shardIndex = i % shards.length;
    shards[shardIndex].routes.push(routes[i]);
  }

  for (const shard of shards) {
    if (shard.routes.length === 0) {
      shard.routes = routes;
    }
  }

  return shards;
}

void main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      msg: "fatal",
      err: message,
    }),
  );
  process.exitCode = 1;
});
