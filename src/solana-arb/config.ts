import type { ArbRouteConfig, CommitmentLevel, WalletWorker } from "./types.js";

const DEFAULT_DEXES = ["Raydium", "Orca"];

const DEFAULT_ROUTES: ArbRouteConfig[] = [
  {
    name: "SOL-USDC-SOL",
    baseMint: "So11111111111111111111111111111111111111112",
    midMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    tradeAmountAtomic: 200_000_000n,
  },
  {
    name: "SOL-USDT-SOL",
    baseMint: "So11111111111111111111111111111111111111112",
    midMint: "Es9vMFrzaCERmJfrF4H2FYD8Vw9xQj2iX8GZF9dgNpQ",
    tradeAmountAtomic: 200_000_000n,
  },
];

export interface BotConfig {
  rpcUrl: string;
  wsUrl?: string;
  jupiterApiBase: string;
  cycleIntervalMs: number;
  quoteTimeoutMs: number;
  maxConcurrentQuotes: number;
  slippageBps: number;
  minProfitBps: number;
  minProfitAtomic: bigint;
  dryRun: boolean;
  autoExecute: boolean;
  requoteBeforeExecute: boolean;
  preflightSimulationEnabled: boolean;
  computeUnitLimit: number;
  computeUnitPriceMicroLamports: number;
  confirmationCommitment: CommitmentLevel;
  dexes: string[];
  routes: ArbRouteConfig[];
  logFilePath?: string;
  metricsFilePath?: string;
  workers: WalletWorker[];
  runOnce: boolean;
}

function parseBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean-like value.`);
}

function parseInteger(name: string, fallback: number, min = Number.MIN_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || Number.isNaN(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}.`);
  }

  return value;
}

function parseBigIntValue(name: string, fallback: bigint, min = 0n): bigint {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    throw new Error(`${name} must be a bigint-compatible integer string.`);
  }

  if (value < min) {
    throw new Error(`${name} must be >= ${min.toString()}.`);
  }

  return value;
}

function parseCsv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (list.length === 0) {
    throw new Error(`${name} cannot be empty.`);
  }

  return list;
}

function parseCommitment(name: string, fallback: CommitmentLevel): CommitmentLevel {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "processed" || normalized === "confirmed" || normalized === "finalized") {
    return normalized;
  }

  throw new Error(`${name} must be one of processed|confirmed|finalized.`);
}

function toSecretKey(value: unknown, label: string): Uint8Array {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of bytes.`);
  }

  const bytes = value.map((entry, index) => {
    const num = Number(entry);
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      throw new Error(`${label}[${index}] must be an integer between 0 and 255.`);
    }
    return num;
  });

  return Uint8Array.from(bytes);
}

function parseWorkers(): WalletWorker[] {
  const many = process.env.SOLANA_PRIVATE_KEYS_JSON;
  if (many && many.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(many);
    } catch {
      throw new Error("SOLANA_PRIVATE_KEYS_JSON must be valid JSON.");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("SOLANA_PRIVATE_KEYS_JSON must be a non-empty array.");
    }

    return parsed.map((entry, idx) => ({
      label: `wallet-${idx + 1}`,
      secretKey: toSecretKey(entry, `SOLANA_PRIVATE_KEYS_JSON[${idx}]`),
    }));
  }

  const one = process.env.SOLANA_PRIVATE_KEY_JSON;
  if (!one || one.trim() === "") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(one);
  } catch {
    throw new Error("SOLANA_PRIVATE_KEY_JSON must be valid JSON.");
  }

  return [
    {
      label: "wallet-1",
      secretKey: toSecretKey(parsed, "SOLANA_PRIVATE_KEY_JSON"),
    },
  ];
}

function parseRoutes(): ArbRouteConfig[] {
  const raw = process.env.ARB_ROUTES_JSON;
  if (!raw || raw.trim() === "") {
    return DEFAULT_ROUTES;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ARB_ROUTES_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("ARB_ROUTES_JSON must be a non-empty array.");
  }

  return parsed.map((item, idx) => {
    const route = item as Partial<Record<string, unknown>>;
    const name = String(route.name ?? `route-${idx + 1}`).trim();
    const baseMint = String(route.baseMint ?? "").trim();
    const midMint = String(route.midMint ?? "").trim();
    const tradeAmountRaw = route.tradeAmountAtomic;

    if (!baseMint || !midMint) {
      throw new Error(`ARB_ROUTES_JSON[${idx}] must include baseMint and midMint.`);
    }

    if (tradeAmountRaw == null) {
      throw new Error(`ARB_ROUTES_JSON[${idx}] must include tradeAmountAtomic.`);
    }

    let tradeAmountAtomic: bigint;
    try {
      tradeAmountAtomic = BigInt(String(tradeAmountRaw));
    } catch {
      throw new Error(`ARB_ROUTES_JSON[${idx}].tradeAmountAtomic must be an integer string.`);
    }

    if (tradeAmountAtomic <= 0n) {
      throw new Error(`ARB_ROUTES_JSON[${idx}].tradeAmountAtomic must be > 0.`);
    }

    return {
      name,
      baseMint,
      midMint,
      tradeAmountAtomic,
    };
  });
}

export function loadConfig(): BotConfig {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com",
    wsUrl: process.env.SOLANA_WS_URL?.trim() || undefined,
    jupiterApiBase: process.env.JUPITER_API_BASE?.trim() || "https://quote-api.jup.ag/v6",
    cycleIntervalMs: parseInteger("ARB_CYCLE_INTERVAL_MS", 1_000, 100),
    quoteTimeoutMs: parseInteger("ARB_QUOTE_TIMEOUT_MS", 1_500, 250),
    maxConcurrentQuotes: parseInteger("ARB_MAX_CONCURRENT_QUOTES", 6, 1),
    slippageBps: parseInteger("ARB_SLIPPAGE_BPS", 30, 1),
    minProfitBps: parseInteger("ARB_MIN_PROFIT_BPS", 20, 1),
    minProfitAtomic: parseBigIntValue("ARB_MIN_PROFIT_ATOMIC", 100_000n, 0n),
    dryRun: parseBool("ARB_DRY_RUN", true),
    autoExecute: parseBool("ARB_AUTO_EXECUTE", false),
    requoteBeforeExecute: parseBool("ARB_REQUOTE_BEFORE_EXECUTE", true),
    preflightSimulationEnabled: parseBool("ARB_PREFLIGHT_SIMULATION_ENABLED", true),
    computeUnitLimit: parseInteger("ARB_COMPUTE_UNIT_LIMIT", 1_000_000, 200_000),
    computeUnitPriceMicroLamports: parseInteger("ARB_COMPUTE_UNIT_PRICE_MICROLAMPORTS", 5_000, 0),
    confirmationCommitment: parseCommitment("ARB_CONFIRMATION_COMMITMENT", "confirmed"),
    dexes: parseCsv("ARB_DEXES", DEFAULT_DEXES),
    routes: parseRoutes(),
    logFilePath: process.env.ARB_LOG_FILE?.trim() || undefined,
    metricsFilePath: process.env.ARB_METRICS_FILE?.trim() || undefined,
    workers: parseWorkers(),
    runOnce: parseBool("ARB_RUN_ONCE", false),
  };
}
