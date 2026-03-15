import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import type { BotConfig } from "./config.js";
import { JupiterClient } from "./jupiterClient.js";
import { Logger } from "./logger.js";
import { MetricsTracker } from "./metrics.js";
import type {
  ArbRouteConfig,
  BuildTxResult,
  CycleOutcome,
  Opportunity,
  SimulationResult,
} from "./types.js";

interface EngineDeps {
  config: BotConfig;
  workerLabel: string;
  workerSecretKey?: Uint8Array;
  routes?: ArbRouteConfig[];
}

export class ArbEngine {
  private readonly config: BotConfig;
  private readonly routes: ArbRouteConfig[];
  private readonly logger: Logger;
  private readonly metrics: MetricsTracker;
  private readonly connection: Connection;
  private readonly jupiter: JupiterClient;
  private readonly wallet: Keypair | null;
  private quoteBackoffMs = 0;
  private quoteBackoffUntilTs = 0;
  private lastQuoteRateLimitLogTs = 0;

  constructor(deps: EngineDeps) {
    this.config = deps.config;
    this.routes = deps.routes ?? deps.config.routes;
    this.logger = new Logger(deps.workerLabel, deps.config.logFilePath);
    this.metrics = new MetricsTracker(deps.config.metricsFilePath);
    this.connection = new Connection(deps.config.rpcUrl, {
      wsEndpoint: deps.config.wsUrl,
      commitment: this.config.confirmationCommitment,
    });
    this.jupiter = new JupiterClient(deps.config.jupiterApiBase, deps.config.quoteTimeoutMs);
    this.wallet = deps.workerSecretKey ? Keypair.fromSecretKey(deps.workerSecretKey) : null;
  }

  async runForever(signal?: AbortSignal): Promise<void> {
    this.logger.info("engine-start", {
      routeCount: this.routes.length,
      dexes: this.config.dexes,
      walletConfigured: Boolean(this.wallet),
      dryRun: this.config.dryRun,
      autoExecute: this.config.autoExecute,
      requoteBeforeExecute: this.config.requoteBeforeExecute,
    });

    while (!signal?.aborted) {
      if (this.quoteBackoffUntilTs > Date.now()) {
        const waitMs = this.quoteBackoffUntilTs - Date.now();
        this.logger.warn("quote-backoff-active", {
          waitMs,
        });
        await sleep(waitMs, signal);
        if (signal?.aborted) {
          break;
        }
      }

      const started = Date.now();
      try {
        const outcome = await this.runCycle();
        this.metrics.recordCycle(outcome);
        await this.metrics.flush(this.wallet?.publicKey.toBase58() ?? "read-only");
      } catch (error) {
        this.logger.error("cycle-error", {
          err: stringifyError(error),
        });
      }

      const elapsed = Date.now() - started;
      const sleepMs = Math.max(0, this.config.cycleIntervalMs - elapsed);
      if (sleepMs > 0) {
        await sleep(sleepMs, signal);
      }
    }

    this.logger.info("engine-stop");
  }

  async runCycle(): Promise<CycleOutcome> {
    const cycleStarted = Date.now();
    const opportunities = await this.scanOpportunities();
    const bestOpportunity = selectBest(opportunities);

    if (!bestOpportunity) {
      const cycleLatencyMs = Date.now() - cycleStarted;
      this.logger.debug("no-opportunity", { cycleLatencyMs });
      return {
        detectedCount: 0,
        bestOpportunity: null,
        simulated: null,
        executedSignature: null,
        cycleLatencyMs,
      };
    }

    this.logger.info("opportunity-found", {
      route: bestOpportunity.route.name,
      buyDex: bestOpportunity.buyDex,
      sellDex: bestOpportunity.sellDex,
      expectedProfitAtomic: bestOpportunity.expectedProfitAtomic.toString(),
      expectedProfitBps: bestOpportunity.expectedProfitBps,
    });

    if (!this.wallet) {
      const cycleLatencyMs = Date.now() - cycleStarted;
      this.logger.warn("wallet-missing-skip-sim-exec", { cycleLatencyMs });
      return {
        detectedCount: opportunities.length,
        bestOpportunity,
        simulated: null,
        executedSignature: null,
        cycleLatencyMs,
      };
    }

    let activeOpportunity = bestOpportunity;
    let built = await this.buildTransaction(activeOpportunity);

    let simulated: SimulationResult | null = null;
    if (this.config.preflightSimulationEnabled) {
      simulated = await this.simulate(built.tx);
      if (!simulated.ok) {
        const cycleLatencyMs = Date.now() - cycleStarted;
        this.logger.warn("simulation-failed", {
          route: activeOpportunity.route.name,
          buyDex: activeOpportunity.buyDex,
          sellDex: activeOpportunity.sellDex,
          err: simulated.err,
          unitsConsumed: simulated.unitsConsumed,
        });

        return {
          detectedCount: opportunities.length,
          bestOpportunity,
          simulated,
          executedSignature: null,
          cycleLatencyMs,
        };
      }
    }

    if (this.config.requoteBeforeExecute) {
      const requoted = await this.requote(activeOpportunity);
      if (!requoted) {
        const cycleLatencyMs = Date.now() - cycleStarted;
        this.logger.info("requote-rejected", {
          route: activeOpportunity.route.name,
          buyDex: activeOpportunity.buyDex,
          sellDex: activeOpportunity.sellDex,
          cycleLatencyMs,
        });

        return {
          detectedCount: opportunities.length,
          bestOpportunity,
          simulated,
          executedSignature: null,
          cycleLatencyMs,
        };
      }

      activeOpportunity = requoted;
      built = await this.buildTransaction(activeOpportunity);

      if (this.config.preflightSimulationEnabled) {
        simulated = await this.simulate(built.tx);
        if (!simulated.ok) {
          const cycleLatencyMs = Date.now() - cycleStarted;
          this.logger.warn("post-requote-simulation-failed", {
            route: activeOpportunity.route.name,
            buyDex: activeOpportunity.buyDex,
            sellDex: activeOpportunity.sellDex,
            err: simulated.err,
            unitsConsumed: simulated.unitsConsumed,
          });

          return {
            detectedCount: opportunities.length,
            bestOpportunity: activeOpportunity,
            simulated,
            executedSignature: null,
            cycleLatencyMs,
          };
        }
      }
    }

    let executedSignature: string | null = null;
    if (this.config.autoExecute && !this.config.dryRun) {
      executedSignature = await this.execute(built);
      this.logger.info("execution-sent", {
        route: activeOpportunity.route.name,
        buyDex: activeOpportunity.buyDex,
        sellDex: activeOpportunity.sellDex,
        signature: executedSignature,
      });
    } else {
      this.logger.info("dry-run-skip-execution", {
        reason: this.config.dryRun ? "dry-run" : "auto-execute-disabled",
      });
    }

    const cycleLatencyMs = Date.now() - cycleStarted;
    this.logger.info("cycle-complete", {
      cycleLatencyMs,
      detectedCount: opportunities.length,
      simulated: simulated?.ok ?? null,
      executed: Boolean(executedSignature),
    });

    return {
      detectedCount: opportunities.length,
      bestOpportunity: activeOpportunity,
      simulated,
      executedSignature,
      cycleLatencyMs,
    };
  }

  private async scanOpportunities(): Promise<Opportunity[]> {
    const tasks: Array<() => Promise<Opportunity | null>> = [];

    for (const route of this.routes) {
      for (const buyDex of this.config.dexes) {
        for (const sellDex of this.config.dexes) {
          if (buyDex === sellDex) {
            continue;
          }

          tasks.push(() => this.evaluateRoute(route, buyDex, sellDex));
        }
      }
    }

    const outputs = await runWithConcurrency(tasks, this.config.maxConcurrentQuotes);
    return outputs.filter((item): item is Opportunity => item !== null);
  }

  private async evaluateRoute(
    route: ArbRouteConfig,
    buyDex: string,
    sellDex: string,
  ): Promise<Opportunity | null> {
    const amountIn = route.tradeAmountAtomic;

    let leg1;
    try {
      leg1 = await this.jupiter.quote({
        inputMint: route.baseMint,
        outputMint: route.midMint,
        amount: amountIn,
        slippageBps: this.config.slippageBps,
        dexes: [buyDex],
      });
    } catch (error) {
      this.handleQuoteError(error, {
        route,
        buyDex,
        sellDex,
        leg: 1,
      });
      return null;
    }

    if (!leg1 || leg1.outAmount <= 0n) {
      return null;
    }

    let leg2;
    try {
      leg2 = await this.jupiter.quote({
        inputMint: route.midMint,
        outputMint: route.baseMint,
        amount: leg1.outAmount,
        slippageBps: this.config.slippageBps,
        dexes: [sellDex],
      });
    } catch (error) {
      this.handleQuoteError(error, {
        route,
        buyDex,
        sellDex,
        leg: 2,
      });
      return null;
    }

    if (!leg2 || leg2.outAmount <= 0n) {
      return null;
    }

    const expectedOut = leg2.outAmount;
    const expectedProfitAtomic = expectedOut - amountIn;
    const expectedProfitBps = toBps(expectedProfitAtomic, amountIn);

    if (expectedProfitAtomic < this.config.minProfitAtomic || expectedProfitBps < this.config.minProfitBps) {
      return null;
    }

    return {
      route,
      buyDex,
      sellDex,
      amountIn,
      leg1,
      leg2,
      expectedOut,
      expectedProfitAtomic,
      expectedProfitBps,
      scannedAt: new Date().toISOString(),
    };
  }

  private handleQuoteError(
    error: unknown,
    context: {
      route: ArbRouteConfig;
      buyDex: string;
      sellDex: string;
      leg: 1 | 2;
    },
  ): void {
    if (isRateLimitedError(error)) {
      const nextBackoff = this.quoteBackoffMs > 0 ? Math.min(this.quoteBackoffMs * 2, 60_000) : 5_000;
      this.quoteBackoffMs = nextBackoff;
      this.quoteBackoffUntilTs = Math.max(this.quoteBackoffUntilTs, Date.now() + nextBackoff);

      const now = Date.now();
      if (now - this.lastQuoteRateLimitLogTs >= 15_000) {
        this.lastQuoteRateLimitLogTs = now;
        this.logger.warn("quote-rate-limited", {
          route: context.route.name,
          buyDex: context.buyDex,
          sellDex: context.sellDex,
          leg: context.leg,
          backoffMs: this.quoteBackoffMs,
          err: stringifyError(error),
        });
      }
      return;
    }

    if (isAuthError(error)) {
      this.logger.error("quote-auth-error", {
        route: context.route.name,
        buyDex: context.buyDex,
        sellDex: context.sellDex,
        leg: context.leg,
        err: stringifyError(error),
      });
    }
  }

  private async requote(opportunity: Opportunity): Promise<Opportunity | null> {
    const refreshed = await this.evaluateRoute(opportunity.route, opportunity.buyDex, opportunity.sellDex);

    if (!refreshed) {
      return null;
    }

    return refreshed;
  }

  private async buildTransaction(opportunity: Opportunity): Promise<BuildTxResult> {
    if (!this.wallet) {
      throw new Error("wallet not configured");
    }

    const leg1Instructions = await this.jupiter.buildSwapInstructions({
      quote: opportunity.leg1,
      userPublicKey: this.wallet.publicKey,
      dynamicComputeUnitLimit: false,
      wrapAndUnwrapSol: true,
    });

    const leg2Instructions = await this.jupiter.buildSwapInstructions({
      quote: opportunity.leg2,
      userPublicKey: this.wallet.publicKey,
      dynamicComputeUnitLimit: false,
      wrapAndUnwrapSol: true,
    });

    const allInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: this.config.computeUnitLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.computeUnitPriceMicroLamports,
      }),
      ...leg1Instructions.setupInstructions,
      leg1Instructions.swapInstruction,
      ...leg1Instructions.cleanupInstructions,
      ...leg2Instructions.setupInstructions,
      leg2Instructions.swapInstruction,
      ...leg2Instructions.cleanupInstructions,
    ];

    const lookupTableAddresses = [
      ...leg1Instructions.lookupTableAddresses,
      ...leg2Instructions.lookupTableAddresses,
    ];

    const lookupTables = await this.jupiter.fetchLookupTables(this.connection, lookupTableAddresses);
    const latest = await this.connection.getLatestBlockhash({ commitment: "processed" });

    const message = new TransactionMessage({
      payerKey: this.wallet.publicKey,
      recentBlockhash: latest.blockhash,
      instructions: allInstructions,
    }).compileToV0Message(lookupTables);

    const tx = new VersionedTransaction(message);
    tx.sign([this.wallet]);

    return {
      tx,
      lookupTables,
      instructionCount: allInstructions.length,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    };
  }

  private async simulate(tx: VersionedTransaction): Promise<SimulationResult> {
    const res = await this.connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "processed",
    });

    return {
      ok: !res.value.err,
      err: res.value.err,
      logs: res.value.logs ?? [],
      unitsConsumed: Number(res.value.unitsConsumed ?? 0),
    };
  }

  private async execute(built: BuildTxResult): Promise<string> {
    const signature = await this.connection.sendRawTransaction(built.tx.serialize(), {
      skipPreflight: false,
      maxRetries: 2,
      preflightCommitment: "processed",
    });

    const confirmation = await this.connection.confirmTransaction(
      {
        signature,
        blockhash: built.blockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
      },
      this.config.confirmationCommitment,
    );

    if (confirmation.value.err) {
      throw new Error(`execution failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return signature;
  }
}

function selectBest(opportunities: Opportunity[]): Opportunity | null {
  if (opportunities.length === 0) {
    return null;
  }

  return opportunities
    .slice()
    .sort((a, b) => {
      if (a.expectedProfitAtomic === b.expectedProfitAtomic) {
        return 0;
      }

      return a.expectedProfitAtomic > b.expectedProfitAtomic ? -1 : 1;
    })[0];
}

function toBps(profit: bigint, notional: bigint): number {
  if (notional <= 0n) {
    return 0;
  }

  return Number((profit * 10_000n) / notional);
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number,
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const concurrency = Math.min(Math.max(1, maxConcurrency), tasks.length);
  const results = new Array<T>(tasks.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = next;
        next += 1;

        if (index >= tasks.length) {
          return;
        }

        results[index] = await tasks[index]();
      }
    }),
  );

  return results;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function extractHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const status = Reflect.get(error, "status");
  if (typeof status === "number" && Number.isFinite(status)) {
    return status;
  }

  const message = Reflect.get(error, "message");
  if (typeof message === "string") {
    const matched = message.match(/HTTP\s+(\d{3})/i);
    if (matched) {
      return Number.parseInt(matched[1], 10);
    }
  }

  return null;
}

function isRateLimitedError(error: unknown): boolean {
  const status = extractHttpStatus(error);
  if (status === 429) {
    return true;
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes("rate limit");
  }

  return false;
}

function isAuthError(error: unknown): boolean {
  const status = extractHttpStatus(error);
  return status === 401 || status === 403;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);

    if (!signal) {
      return;
    }

    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
