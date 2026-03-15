import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import bs58 from "bs58";
import { Connection, Keypair } from "@solana/web3.js";

const DEFAULT_DATA_FILE = ".data/local-solana-arb-state.json";
const MAX_LOG_ENTRIES = 300;

const DEFAULT_CONFIG = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  wsUrl: "",
  jupiterApiBase: "https://quote-api.jup.ag/v6",
  cycleIntervalMs: 1000,
  quoteTimeoutMs: 1500,
  maxConcurrentQuotes: 6,
  slippageBps: 30,
  minProfitBps: 20,
  minProfitAtomic: "100000",
  dryRun: true,
  autoExecute: false,
  liveTradingEnabled: false,
  requoteBeforeExecute: true,
  preflightSimulationEnabled: true,
  computeUnitLimit: 1_000_000,
  computeUnitPriceMicroLamports: 5_000,
  confirmationCommitment: "confirmed",
  dexes: ["Raydium", "Orca"],
  routes: [
    {
      name: "SOL-USDC-SOL",
      baseMint: "So11111111111111111111111111111111111111112",
      midMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tradeAmountAtomic: "200000000",
    },
    {
      name: "SOL-USDT-SOL",
      baseMint: "So11111111111111111111111111111111111111112",
      midMint: "Es9vMFrzaCERmJfrF4H2FYD8Vw9xQj2iX8GZF9dgNpQ",
      tradeAmountAtomic: "200000000",
    },
  ],
};

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, fallback, min, max) {
  const numeric = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeCommitment(value, fallback = "confirmed") {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "processed" || normalized === "confirmed" || normalized === "finalized") {
    return normalized;
  }
  return fallback;
}

function normalizeDexes(value, fallback) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const normalized = source
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return [...fallback];
  }
  return [...new Set(normalized)];
}

function normalizeRoutes(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback.map((route) => ({ ...route }));
  }

  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object") {
      continue;
    }

    const name = String(item.name || `route-${index + 1}`).trim();
    const baseMint = String(item.baseMint || "").trim();
    const midMint = String(item.midMint || "").trim();
    const tradeAmountAtomicRaw = String(item.tradeAmountAtomic || "").trim();
    if (!baseMint || !midMint || !tradeAmountAtomicRaw) {
      continue;
    }

    let tradeAmountAtomic;
    try {
      tradeAmountAtomic = BigInt(tradeAmountAtomicRaw);
    } catch {
      continue;
    }

    if (tradeAmountAtomic <= 0n) {
      continue;
    }

    normalized.push({
      name,
      baseMint,
      midMint,
      tradeAmountAtomic: tradeAmountAtomic.toString(),
    });
  }

  if (normalized.length === 0) {
    return fallback.map((route) => ({ ...route }));
  }
  return normalized;
}

function normalizeConfig(rawConfig) {
  const base = { ...DEFAULT_CONFIG };
  const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};

  return {
    rpcUrl: String(source.rpcUrl || base.rpcUrl).trim() || base.rpcUrl,
    wsUrl: String(source.wsUrl || "").trim(),
    jupiterApiBase: String(source.jupiterApiBase || base.jupiterApiBase).trim() || base.jupiterApiBase,
    cycleIntervalMs: clampInt(source.cycleIntervalMs, base.cycleIntervalMs, 250, 120000),
    quoteTimeoutMs: clampInt(source.quoteTimeoutMs, base.quoteTimeoutMs, 250, 20000),
    maxConcurrentQuotes: clampInt(source.maxConcurrentQuotes, base.maxConcurrentQuotes, 1, 24),
    slippageBps: clampInt(source.slippageBps, base.slippageBps, 1, 1000),
    minProfitBps: clampInt(source.minProfitBps, base.minProfitBps, 1, 5000),
    minProfitAtomic: (() => {
      const text = String(source.minProfitAtomic || base.minProfitAtomic).trim();
      try {
        const parsed = BigInt(text);
        if (parsed < 0n) {
          return base.minProfitAtomic;
        }
        return parsed.toString();
      } catch {
        return base.minProfitAtomic;
      }
    })(),
    dryRun: parseBoolean(source.dryRun, base.dryRun),
    autoExecute: parseBoolean(source.autoExecute, base.autoExecute),
    liveTradingEnabled: parseBoolean(source.liveTradingEnabled, base.liveTradingEnabled),
    requoteBeforeExecute: parseBoolean(source.requoteBeforeExecute, base.requoteBeforeExecute),
    preflightSimulationEnabled: parseBoolean(source.preflightSimulationEnabled, base.preflightSimulationEnabled),
    computeUnitLimit: clampInt(source.computeUnitLimit, base.computeUnitLimit, 200000, 1_600_000),
    computeUnitPriceMicroLamports: clampInt(
      source.computeUnitPriceMicroLamports,
      base.computeUnitPriceMicroLamports,
      0,
      200000,
    ),
    confirmationCommitment: normalizeCommitment(source.confirmationCommitment, base.confirmationCommitment),
    dexes: normalizeDexes(source.dexes, base.dexes),
    routes: normalizeRoutes(source.routes, base.routes),
  };
}

function parseSecretKeyInput(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error("Private key is required.");
  }

  let bytes = null;
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Private key JSON must be a non-empty byte array.");
    }
    bytes = Uint8Array.from(
      parsed.map((entry, index) => {
        const value = Number(entry);
        if (!Number.isInteger(value) || value < 0 || value > 255) {
          throw new Error(`Private key byte at index ${index} must be 0..255.`);
        }
        return value;
      }),
    );
  } else if (raw.includes(",")) {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      bytes = Uint8Array.from(
        parts.map((entry, index) => {
          const value = Number(entry);
          if (!Number.isInteger(value) || value < 0 || value > 255) {
            throw new Error(`Private key byte at index ${index} must be 0..255.`);
          }
          return value;
        }),
      );
    }
  }

  if (!bytes) {
    try {
      bytes = bs58.decode(raw);
    } catch {
      const maybeBase64 = Buffer.from(raw, "base64");
      if (maybeBase64.length > 0) {
        bytes = Uint8Array.from(maybeBase64);
      }
    }
  }

  if (!bytes || bytes.length === 0) {
    throw new Error("Unsupported private key format. Use JSON bytes, CSV bytes, base58, or base64.");
  }

  if (bytes.length === 64) {
    return Keypair.fromSecretKey(bytes);
  }
  if (bytes.length === 32) {
    return Keypair.fromSeed(bytes);
  }

  throw new Error("Private key must decode to 32 bytes (seed) or 64 bytes (secret key).");
}

function shortAddress(address) {
  if (!address || address.length < 12) {
    return address || "";
  }
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function parseJsonLine(line, fallbackLevel) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return {
        ts: typeof parsed.ts === "string" ? parsed.ts : nowIso(),
        level: typeof parsed.level === "string" ? parsed.level : fallbackLevel,
        msg: typeof parsed.msg === "string" ? parsed.msg : trimmed,
        ...parsed,
      };
    }
  } catch {
    // Fallback to plain text record.
  }

  return {
    ts: nowIso(),
    level: fallbackLevel,
    msg: trimmed,
  };
}

export class LocalSolanaArbService {
  constructor({ rootDir, dataFile = DEFAULT_DATA_FILE } = {}) {
    this.rootDir = resolve(rootDir || process.cwd());
    this.dataFile = resolve(this.rootDir, dataFile);
    this.stateReadyPromise = null;

    this.config = normalizeConfig(DEFAULT_CONFIG);
    this.logs = [];
    this.lastScan = null;

    this.wallet = {
      keypair: null,
      importedAt: null,
      balanceLamports: null,
      balanceUpdatedAt: null,
    };

    this.engine = {
      running: false,
      pid: null,
      startedAt: null,
      lastHeartbeatAt: null,
      lastExitAt: null,
      lastExitCode: null,
      lastSignal: null,
    };

    this.workerProcess = null;
  }

  async ready() {
    if (!this.stateReadyPromise) {
      this.stateReadyPromise = this.initializeState();
    }
    await this.stateReadyPromise;
  }

  async initializeState() {
    await mkdir(dirname(this.dataFile), { recursive: true });
    try {
      const raw = await readFile(this.dataFile, "utf8");
      const parsed = JSON.parse(raw);
      this.config = normalizeConfig(parsed?.config);
      this.logs = Array.isArray(parsed?.logs) ? parsed.logs.slice(-MAX_LOG_ENTRIES) : [];
      this.lastScan = parsed?.lastScan && typeof parsed.lastScan === "object" ? parsed.lastScan : null;
    } catch {
      this.config = normalizeConfig(DEFAULT_CONFIG);
      this.logs = [];
      this.lastScan = null;
      await this.persistState();
    }
  }

  async persistState() {
    const payload = {
      savedAt: nowIso(),
      config: this.config,
      lastScan: this.lastScan,
      logs: this.logs.slice(-MAX_LOG_ENTRIES),
    };
    await writeFile(this.dataFile, JSON.stringify(payload, null, 2), "utf8");
  }

  addLog(record) {
    const entry = {
      ts: nowIso(),
      level: "info",
      msg: "event",
      ...record,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }

    this.engine.lastHeartbeatAt = entry.ts;
    this.updateLastScanFromRecord(entry);
  }

  updateLastScanFromRecord(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }

    if (entry.msg === "opportunity-found") {
      this.lastScan = {
        ...(this.lastScan || {}),
        ts: entry.ts,
        route: entry.route || null,
        buyDex: entry.buyDex || null,
        sellDex: entry.sellDex || null,
        expectedProfitAtomic: entry.expectedProfitAtomic || null,
        expectedProfitBps: typeof entry.expectedProfitBps === "number" ? entry.expectedProfitBps : null,
      };
      return;
    }

    if (entry.msg === "execution-sent") {
      this.lastScan = {
        ...(this.lastScan || {}),
        ts: entry.ts,
        executedSignature: entry.signature || null,
      };
      return;
    }

    if (entry.msg === "cycle-complete") {
      this.lastScan = {
        ...(this.lastScan || {}),
        ts: entry.ts,
        cycleLatencyMs: typeof entry.cycleLatencyMs === "number" ? entry.cycleLatencyMs : null,
        detectedCount: typeof entry.detectedCount === "number" ? entry.detectedCount : null,
        simulated: typeof entry.simulated === "boolean" ? entry.simulated : null,
        executed: typeof entry.executed === "boolean" ? entry.executed : null,
      };
      return;
    }

    if (entry.msg === "cycle-error" || entry.level === "error") {
      this.lastScan = {
        ...(this.lastScan || {}),
        ts: entry.ts,
        error: entry.err || entry.msg || "Unknown bot error",
      };
    }
  }

  walletStatus() {
    if (!this.wallet.keypair) {
      return {
        loaded: false,
        address: null,
        addressShort: null,
        importedAt: null,
        balanceLamports: null,
        balanceSol: null,
        balanceUpdatedAt: null,
      };
    }

    const address = this.wallet.keypair.publicKey.toBase58();
    const balanceLamports = this.wallet.balanceLamports;

    return {
      loaded: true,
      address,
      addressShort: shortAddress(address),
      importedAt: this.wallet.importedAt,
      balanceLamports,
      balanceSol: typeof balanceLamports === "number" ? balanceLamports / 1_000_000_000 : null,
      balanceUpdatedAt: this.wallet.balanceUpdatedAt,
    };
  }

  getStatus() {
    return {
      running: this.engine.running,
      pid: this.engine.pid,
      engine: { ...this.engine },
      config: { ...this.config, dexes: [...this.config.dexes], routes: this.config.routes.map((route) => ({ ...route })) },
      wallet: this.walletStatus(),
      lastScan: this.lastScan,
      logs: this.logs.slice(-MAX_LOG_ENTRIES),
    };
  }

  async importWallet({ privateKey }) {
    const keypair = parseSecretKeyInput(privateKey);
    this.wallet.keypair = keypair;
    this.wallet.importedAt = nowIso();
    this.wallet.balanceLamports = null;
    this.wallet.balanceUpdatedAt = null;
    await this.refreshWalletBalance();

    this.addLog({
      level: "info",
      msg: "wallet-imported",
      address: keypair.publicKey.toBase58(),
    });

    return this.walletStatus();
  }

  async clearWallet() {
    this.wallet.keypair = null;
    this.wallet.importedAt = null;
    this.wallet.balanceLamports = null;
    this.wallet.balanceUpdatedAt = null;

    this.addLog({
      level: "info",
      msg: "wallet-cleared",
    });

    return this.walletStatus();
  }

  async refreshWalletBalance() {
    if (!this.wallet.keypair) {
      return this.walletStatus();
    }

    const connection = new Connection(this.config.rpcUrl, {
      commitment: normalizeCommitment(this.config.confirmationCommitment, "confirmed"),
    });
    const lamports = await connection.getBalance(this.wallet.keypair.publicKey);

    this.wallet.balanceLamports = lamports;
    this.wallet.balanceUpdatedAt = nowIso();

    this.addLog({
      level: "debug",
      msg: "wallet-balance-updated",
      balanceLamports: lamports,
    });

    return this.walletStatus();
  }

  async applyConfigPatch(patch) {
    const merged = {
      ...this.config,
      ...(patch && typeof patch === "object" ? patch : {}),
    };
    this.config = normalizeConfig(merged);
    await this.persistState();

    this.addLog({
      level: "info",
      msg: "config-updated",
      dryRun: this.config.dryRun,
      autoExecute: this.config.autoExecute,
      liveTradingEnabled: this.config.liveTradingEnabled,
    });

    return { ...this.config, dexes: [...this.config.dexes], routes: this.config.routes.map((route) => ({ ...route })) };
  }

  attachProcessStream(stream, source) {
    if (!stream) {
      return;
    }

    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const record = parseJsonLine(line, source === "stderr" ? "error" : "info");
        if (!record) {
          continue;
        }
        this.addLog({
          ...record,
          source,
        });
      }
    });
    stream.on("end", () => {
      if (buffer.trim()) {
        const record = parseJsonLine(buffer, source === "stderr" ? "error" : "info");
        if (record) {
          this.addLog({
            ...record,
            source,
          });
        }
      }
    });
  }

  buildEngineEnv({ runOnce, allowExecute = true }) {
    const liveAllowed = Boolean(this.config.liveTradingEnabled && allowExecute);
    const autoExecute = Boolean(liveAllowed && this.config.autoExecute);
    const dryRun = Boolean(!liveAllowed || this.config.dryRun);

    const env = {
      ...process.env,
      SOLANA_RPC_URL: this.config.rpcUrl,
      SOLANA_WS_URL: this.config.wsUrl || "",
      JUPITER_API_BASE: this.config.jupiterApiBase,
      ARB_RUN_ONCE: String(Boolean(runOnce)),
      ARB_CYCLE_INTERVAL_MS: String(this.config.cycleIntervalMs),
      ARB_QUOTE_TIMEOUT_MS: String(this.config.quoteTimeoutMs),
      ARB_MAX_CONCURRENT_QUOTES: String(this.config.maxConcurrentQuotes),
      ARB_SLIPPAGE_BPS: String(this.config.slippageBps),
      ARB_MIN_PROFIT_BPS: String(this.config.minProfitBps),
      ARB_MIN_PROFIT_ATOMIC: String(this.config.minProfitAtomic),
      ARB_DRY_RUN: String(dryRun),
      ARB_AUTO_EXECUTE: String(autoExecute),
      ARB_REQUOTE_BEFORE_EXECUTE: String(this.config.requoteBeforeExecute),
      ARB_PREFLIGHT_SIMULATION_ENABLED: String(this.config.preflightSimulationEnabled),
      ARB_COMPUTE_UNIT_LIMIT: String(this.config.computeUnitLimit),
      ARB_COMPUTE_UNIT_PRICE_MICROLAMPORTS: String(this.config.computeUnitPriceMicroLamports),
      ARB_CONFIRMATION_COMMITMENT: this.config.confirmationCommitment,
      ARB_DEXES: this.config.dexes.join(","),
      ARB_ROUTES_JSON: JSON.stringify(this.config.routes),
      ARB_LOG_FILE: resolve(this.rootDir, ".data/solana-arb.log"),
      ARB_METRICS_FILE: resolve(this.rootDir, ".data/solana-arb-metrics.ndjson"),
    };

    if (this.wallet.keypair) {
      env.SOLANA_PRIVATE_KEY_JSON = JSON.stringify(Array.from(this.wallet.keypair.secretKey));
    } else {
      env.SOLANA_PRIVATE_KEY_JSON = "";
    }

    return env;
  }

  spawnEngine({ runOnce, allowExecute }) {
    const tsxBinary = resolve(this.rootDir, "node_modules/.bin/tsx");
    const env = this.buildEngineEnv({ runOnce, allowExecute });
    const child = spawn(tsxBinary, ["src/solana-arb/index.ts"], {
      cwd: this.rootDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.attachProcessStream(child.stdout, "stdout");
    this.attachProcessStream(child.stderr, "stderr");
    return child;
  }

  async scanOnce({ trigger = "manual", allowExecute = true } = {}) {
    if (this.engine.running) {
      throw new Error("Bot loop is currently running. Stop it before running single scans.");
    }

    this.addLog({
      level: "info",
      msg: "scan-once-start",
      trigger,
      allowExecute: Boolean(allowExecute),
    });

    const process = this.spawnEngine({
      runOnce: true,
      allowExecute,
    });

    await new Promise((resolvePromise, rejectPromise) => {
      process.once("error", rejectPromise);
      process.once("exit", (code) => {
        if (code === 0) {
          resolvePromise();
        } else {
          rejectPromise(new Error(`Single scan process exited with code ${code}.`));
        }
      });
    });

    if (this.wallet.keypair) {
      await this.refreshWalletBalance();
    }
    await this.persistState();

    this.addLog({
      level: "info",
      msg: "scan-once-complete",
    });

    return {
      trigger,
      completedAt: nowIso(),
      lastScan: this.lastScan,
    };
  }

  async start() {
    if (this.engine.running && this.workerProcess) {
      return this.getStatus();
    }

    const process = this.spawnEngine({
      runOnce: false,
      allowExecute: true,
    });

    this.workerProcess = process;
    this.engine.running = true;
    this.engine.pid = process.pid || null;
    this.engine.startedAt = nowIso();
    this.engine.lastHeartbeatAt = this.engine.startedAt;
    this.engine.lastExitAt = null;
    this.engine.lastExitCode = null;
    this.engine.lastSignal = null;

    process.once("error", (error) => {
      this.addLog({
        level: "error",
        msg: "engine-process-error",
        err: error instanceof Error ? error.message : String(error),
      });
    });

    process.once("exit", (code, signal) => {
      this.engine.running = false;
      this.engine.pid = null;
      this.engine.lastExitAt = nowIso();
      this.engine.lastExitCode = code;
      this.engine.lastSignal = signal;
      this.workerProcess = null;
      this.addLog({
        level: code === 0 ? "info" : "error",
        msg: "engine-process-exit",
        code,
        signal,
      });
      void this.persistState();
    });

    await this.persistState();
    this.addLog({
      level: "info",
      msg: "engine-start-requested",
      pid: this.engine.pid,
    });

    return this.getStatus();
  }

  async stop() {
    if (!this.workerProcess || !this.engine.running) {
      return this.getStatus();
    }

    const process = this.workerProcess;
    const exitPromise = new Promise((resolvePromise) => {
      process.once("exit", () => {
        resolvePromise();
      });
    });

    process.kill("SIGTERM");
    const timeout = setTimeout(() => {
      if (this.workerProcess === process) {
        process.kill("SIGKILL");
      }
    }, 5000);

    await exitPromise;
    clearTimeout(timeout);
    await this.persistState();

    this.addLog({
      level: "info",
      msg: "engine-stop-requested",
    });

    return this.getStatus();
  }
}
