import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import BN from "bn.js";
import { ALL_DEXES, AggregatorClient, Env } from "@cetusprotocol/aggregator-sdk";
import { decodeSuiPrivateKey, encodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";

const DEFAULT_DATA_FILE = ".data/local-mev-state.json";
const MAX_LOG_ENTRIES = 200;
const TOKEN_UNIVERSE_CACHE_TTL_MS = 30 * 60 * 1000;
const TOKEN_METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const REQUIRED_PROVIDERS = ["CETUS", "AFTERMATH", "DEEPBOOKV3"];
const TOKEN_UNIVERSE_MIN = 30;
const TOKEN_UNIVERSE_MAX = 100;
const PAIR_CANDIDATE_MIN = 50;
const PAIR_CANDIDATE_MAX = 300;
const ADAPTIVE_LEARNING_RATE_MIN = 0.1;
const ADAPTIVE_LEARNING_RATE_MAX = 1;
const ADAPTIVE_MIN_SAMPLES = 6;
const ADAPTIVE_COOLDOWN_MS = 45 * 1000;
const ADAPTIVE_HISTORY_MAX = 120;
const ADAPTIVE_ADJUSTMENTS_MAX = 40;
const EQUITY_HISTORY_MAX = 400;
const BACKRUN_CONFIRMATIONS_MIN = 1;
const BACKRUN_CONFIRMATIONS_MAX = 10;
const BACKRUN_WAIT_TIMEOUT_MIN = 500;
const BACKRUN_WAIT_TIMEOUT_MAX = 30000;
const CONFIRMED_FLOW_LOOKBACK_MIN = 1;
const CONFIRMED_FLOW_LOOKBACK_MAX = 20;
const CONFIRMED_FLOW_MAX_TX_MIN = 5;
const CONFIRMED_FLOW_MAX_TX_MAX = 200;
const CONFIRMED_FLOW_COOLDOWN_MIN = 500;
const CONFIRMED_FLOW_COOLDOWN_MAX = 120000;
const CONFIRMED_FLOW_POLL_MIN = 800;
const CONFIRMED_FLOW_POLL_MAX = 15000;
const FAST_LANE_INTERVAL_MIN = 800;
const FAST_LANE_INTERVAL_MAX = 120000;
const SLOW_LANE_INTERVAL_MIN = 1500;
const SLOW_LANE_INTERVAL_MAX = 300000;
const UNWIND_MAX_HOLD_MIN = 5000;
const UNWIND_MAX_HOLD_MAX = 30 * 60 * 1000;
const UNWIND_STOP_LOSS_MIN = 10;
const UNWIND_STOP_LOSS_MAX = 5000;
const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BUDGET_MS = 2000;
const WRITE_RETRY_JITTER_MIN_MS = 250;
const WRITE_RETRY_JITTER_MAX_MS = 750;
const WRITE_ENDPOINT_COOLDOWN_MS = 5000;
const SAFETY_PAUSE_MS = 90 * 1000;
const SAFETY_DRAWDOWN_HARD_STOP_PCT = 0.03;
const SAFETY_NEGATIVE_STREAK_HARD_STOP = 4;
const SAFETY_MIN_EXECUTION_BUFFER_BPS = 6;
const SAFETY_MAX_EXECUTION_BUFFER_BPS = 160;
const SAFETY_MIN_TRADE_MULTIPLIER = 0.15;
const SAFETY_MAX_TRADE_MULTIPLIER = 1.1;
const MIN_EXECUTION_START_SUI_ATOMIC = 50_000_000n;
const MIN_PROFIT_SUI_MIN = 0.0005;
const MIN_PROFIT_SUI_MAX = 5;
const MAX_ROUTE_DEVIATION_BPS_MIN = 10;
const MAX_ROUTE_DEVIATION_BPS_MAX = 5000;
const DUAL_REQUOTE_GAP_MIN_MS = 50;
const DUAL_REQUOTE_GAP_MAX_MS = 2000;
const DUAL_REQUOTE_MAX_DRIFT_MIN_BPS = 5;
const DUAL_REQUOTE_MAX_DRIFT_MAX_BPS = 5000;
const TOXIC_STRIKE_THRESHOLD_MIN = 1;
const TOXIC_STRIKE_THRESHOLD_MAX = 10;
const TOXIC_ROUTE_COOLDOWN_MIN_MS = 5000;
const TOXIC_ROUTE_COOLDOWN_MAX_MS = 30 * 60 * 1000;
const TOXIC_TOKEN_COOLDOWN_MIN_MS = 3000;
const TOXIC_TOKEN_COOLDOWN_MAX_MS = 20 * 60 * 1000;
const REALIZED_SIZING_ALPHA_MIN = 0.05;
const REALIZED_SIZING_ALPHA_MAX = 0.95;
const REALIZED_SIZING_TARGET_WINRATE_MIN = 0.3;
const REALIZED_SIZING_TARGET_WINRATE_MAX = 0.95;
const REALIZED_SIZING_MIN_DELTA_SUI_MIN = 0.0002;
const REALIZED_SIZING_MIN_DELTA_SUI_MAX = 0.2;
const REALIZED_SIZING_MULTIPLIER_MIN = 0.2;
const REALIZED_SIZING_MULTIPLIER_MAX = 1.5;
const PRIORITY_GAS_MULTIPLIER_MIN = 1;
const PRIORITY_GAS_MULTIPLIER_MAX = 100;
const GAS_BUDGET_MULTIPLIER_MIN = 1;
const GAS_BUDGET_MULTIPLIER_MAX = 5;
const GAS_BUDGET_SAFETY_BUFFER_ATOMIC = 5_000_000n;
const PERSIST_BACKOFF_ENOSPC_MS = 2 * 60 * 1000;
const PERSIST_BACKOFF_GENERIC_MS = 20 * 1000;

const RPC_BY_NETWORK = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

const AGGREGATOR_ENDPOINT_BY_NETWORK = {
  mainnet: "https://api-sui.cetus.zone/router_v3",
  testnet: "https://api-sui.cetus.zone/router_v3",
  devnet: "https://api-sui.cetus.zone/router_v3",
};

const CETUS_COIN_LIST_HANDLE_BY_NETWORK = {
  mainnet: "0x49136005e90e28c4695419ed4194cc240603f1ea8eb84e62275eaff088a71063",
  testnet: "0x3204350fc603609c91675e07b8f9ac0999b9607d83845086321fca7f469de235",
};

const DEFAULT_TOKENS_BY_NETWORK = {
  mainnet: [],
  testnet: [
    {
      symbol: "SUI",
      type: "0x2::sui::SUI",
      decimals: 9,
      scanAmount: "1",
    },
  ],
  devnet: [
    {
      symbol: "SUI",
      type: "0x2::sui::SUI",
      decimals: 9,
      scanAmount: "1",
    },
  ],
};

const FALLBACK_TOKENS_BY_NETWORK = {
  mainnet: [
    {
      symbol: "SUI",
      type: "0x2::sui::SUI",
      decimals: 9,
      scanAmount: "1",
    },
    {
      symbol: "CETUS",
      type: "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
      decimals: 9,
      scanAmount: "500",
    },
  ],
  testnet: [
    {
      symbol: "SUI",
      type: "0x2::sui::SUI",
      decimals: 9,
      scanAmount: "1",
    },
  ],
  devnet: [
    {
      symbol: "SUI",
      type: "0x2::sui::SUI",
      decimals: 9,
      scanAmount: "1",
    },
  ],
};

const DEFAULT_CONFIG = {
  network: "mainnet",
  dryRun: true,
  liveTradingEnabled: false,
  autoExecute: true,
  cycleIntervalMs: 15000,
  minProfitBps: 20,
  slippageBps: 30,
  maxDepth: 3,
  maxQuoteConcurrency: 4,
  providers: REQUIRED_PROVIDERS.filter((provider) => ALL_DEXES.includes(provider)),
  tradeAmountSui: "5",
  minProfitSui: "0.01",
  maxRouteDeviationBps: 180,
  dualRequoteEnabled: true,
  dualRequoteGapMs: 220,
  dualRequoteMaxDriftBps: 120,
  toxicRouteStrikeThreshold: 2,
  toxicRouteCooldownMs: 90000,
  toxicTokenStrikeThreshold: 2,
  toxicTokenCooldownMs: 60000,
  realizedSizingEnabled: true,
  realizedSizingAlpha: 0.28,
  realizedSizingWinRateAlpha: 0.22,
  realizedSizingTargetWinRate: 0.58,
  realizedSizingMinDeltaSui: "0.003",
  tokenUniverseTarget: 40,
  maxPairCandidates: 300,
  backrunOnly: false,
  backrunConfirmations: 1,
  backrunWaitTimeoutMs: 3500,
  confirmedFlowEnabled: true,
  confirmedFlowMinNotionalSui: "40",
  confirmedFlowLookbackCheckpoints: 2,
  confirmedFlowMaxTxPerCheckpoint: 35,
  confirmedFlowCooldownMs: 5000,
  confirmedFlowPollIntervalMs: 2000,
  dualLaneEnabled: false,
  fastLaneIntervalMs: 3000,
  fastLaneTokenUniverseTarget: 32,
  fastLaneMaxPairCandidates: 80,
  fastLaneMaxQuoteConcurrency: 10,
  slowLaneIntervalMs: 18000,
  slowLaneTokenUniverseTarget: 90,
  slowLaneMaxPairCandidates: 260,
  slowLaneMaxQuoteConcurrency: 4,
  unwindEnabled: true,
  unwindMaxHoldMs: 120000,
  unwindStopLossBps: 180,
  unwindMinSuiOut: "0.02",
  preflightDryRunEnabled: true,
  priorityGasMultiplier: 5,
  gasBudgetMultiplier: 1.8,
  adaptiveEnabled: true,
  adaptiveLearningRate: 0.35,
  tokens: DEFAULT_TOKENS_BY_NETWORK.mainnet,
};

function clampInteger(value, fallback, { min, max }) {
  const numeric = Math.round(parseNumber(value, fallback, { min, max }));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampFloat(value, fallback, { min, max }) {
  const numeric = parseNumber(value, fallback, { min, max });
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampToRange(value, { min, max }) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function formatDecimalString(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0";
  }
  return numeric.toFixed(digits).replace(/\.?0+$/, "");
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function normalizeTypeName(raw) {
  const value = String(raw || "").trim();
  if (!value.includes("::")) {
    return "";
  }

  const [address, module, name] = value.split("::");
  if (!address || !module || !name) {
    return "";
  }

  const normalizedAddress = address.startsWith("0x") ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  return `${normalizedAddress}::${module}::${name}`;
}

function ensureRequiredProviders(selected) {
  const available = new Set(ALL_DEXES.map((dex) => String(dex).toUpperCase()));
  const normalized = selected
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => available.has(value));

  for (const provider of REQUIRED_PROVIDERS) {
    if (available.has(provider) && !normalized.includes(provider)) {
      normalized.push(provider);
    }
  }

  return normalized.length > 0 ? normalized : REQUIRED_PROVIDERS.filter((provider) => available.has(provider));
}

function normalizeNetwork(value) {
  const network = String(value || "mainnet").trim().toLowerCase();
  if (network === "mainnet" || network === "testnet" || network === "devnet") {
    return network;
  }
  throw new Error("network must be one of: mainnet, testnet, devnet");
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value == null) {
    return fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function parseNumber(value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  if (value == null || value === "") {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (numeric < min || numeric > max) {
    return fallback;
  }
  return numeric;
}

function maybeNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBigInt(value, fallback = 0n) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return BigInt(Math.max(0, Math.floor(value)));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }
    try {
      return BigInt(trimmed);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function scaleBigIntByMultiplier(value, multiplier) {
  const base = toBigInt(value, 0n);
  if (base <= 0n) {
    return 0n;
  }
  const safeMultiplier = Math.max(1, Number(multiplier) || 1);
  const scaled = Math.round(safeMultiplier * 1000);
  const factor = BigInt(Math.max(1, scaled));
  return (base * factor + 999n) / 1000n;
}

function extractDryRunNetGasAtomic(dryRunResponse) {
  const summary = dryRunResponse?.effects?.gasUsed;
  if (!summary || typeof summary !== "object") {
    return 0n;
  }
  const computationCost = toBigInt(summary.computationCost, 0n);
  const storageCost = toBigInt(summary.storageCost, 0n);
  const storageRebate = toBigInt(summary.storageRebate, 0n);
  const nonRefundableStorageFee = toBigInt(summary.nonRefundableStorageFee, 0n);
  const net = computationCost + storageCost + nonRefundableStorageFee - storageRebate;
  return net > 0n ? net : 0n;
}

function isDryRunSuccess(dryRunResponse) {
  const status = String(dryRunResponse?.effects?.status?.status || "").toLowerCase();
  return status === "success";
}

function extractDryRunErrorMessage(dryRunResponse) {
  const statusError = dryRunResponse?.effects?.status?.error;
  if (statusError) {
    return String(statusError);
  }
  const executionErrorSource = dryRunResponse?.executionErrorSource;
  if (executionErrorSource) {
    return String(executionErrorSource);
  }
  return "dry-run failed";
}

function randomInteger(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) {
    return lo;
  }
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function lookupHeaderValue(headers, name) {
  if (!headers) {
    return null;
  }

  const normalizedName = String(name || "").toLowerCase();
  if (!normalizedName) {
    return null;
  }

  if (typeof headers.get === "function") {
    const value = headers.get(name) || headers.get(normalizedName);
    return value == null ? null : String(value);
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const key = String(entry[0] || "").toLowerCase();
      if (key === normalizedName) {
        return String(entry[1]);
      }
    }
    return null;
  }

  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (String(key || "").toLowerCase() === normalizedName) {
        if (Array.isArray(value)) {
          return value.length > 0 ? String(value[0]) : null;
        }
        return value == null ? null : String(value);
      }
    }
  }

  return null;
}

function parseRetryAfterToMs(raw) {
  if (raw == null) {
    return null;
  }

  const text = String(raw).trim();
  if (!text) {
    return null;
  }

  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    if (asNumber <= 0) {
      return null;
    }
    if (asNumber < 100) {
      return Math.round(asNumber * 1000);
    }
    return Math.round(asNumber);
  }

  const asDate = Date.parse(text);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
}

function parseRetryAfterFromMessage(message) {
  const text = String(message || "");
  if (!text) {
    return null;
  }

  const match = text.match(/retry[- ]after[:\s]+([0-9]+(?:\.[0-9]+)?)\s*(ms|millisecond|milliseconds|s|sec|secs|second|seconds)?/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const unit = String(match[2] || "").toLowerCase();
  if (unit.startsWith("ms") || unit.startsWith("millisecond")) {
    return Math.round(value);
  }
  return Math.round(value * 1000);
}

function isNoSpaceError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = String(error.code || "").toUpperCase();
  const message = String(error.message || "").toLowerCase();
  return code === "ENOSPC" || message.includes("no space left on device");
}

function unwrapErrorChain(error) {
  const chain = [];
  const visited = new Set();
  let cursor = error;

  while (cursor && typeof cursor === "object" && !visited.has(cursor) && chain.length < 6) {
    chain.push(cursor);
    visited.add(cursor);
    cursor = cursor.cause;
  }

  return chain;
}

function isRateLimitedError(error) {
  const chain = unwrapErrorChain(error);
  for (const item of chain) {
    const status = maybeNumber(item.status) ?? maybeNumber(item.statusCode) ?? maybeNumber(item.code);
    if (status === 429) {
      return true;
    }

    const message = String(item.message || "").toLowerCase();
    if (message.includes("429") || message.includes("too many requests") || message.includes("rate limit")) {
      return true;
    }
  }
  return false;
}

function extractRetryAfterMs(error) {
  const chain = unwrapErrorChain(error);
  for (const item of chain) {
    const direct = parseRetryAfterToMs(item.retryAfterMs ?? item.retryAfter);
    if (direct != null) {
      return direct;
    }

    const responseHeaders = item.response?.headers;
    const retryAfterHeader = lookupHeaderValue(responseHeaders, "retry-after");
    const fromHeader = parseRetryAfterToMs(retryAfterHeader);
    if (fromHeader != null) {
      return fromHeader;
    }

    const headers = item.headers;
    const retryAfter = lookupHeaderValue(headers, "retry-after");
    const fromHeadersObject = parseRetryAfterToMs(retryAfter);
    if (fromHeadersObject != null) {
      return fromHeadersObject;
    }

    const fromMessage = parseRetryAfterFromMessage(item.message);
    if (fromMessage != null) {
      return fromMessage;
    }
  }

  return null;
}

function resolveRpcEndpoint(network, role = "read") {
  const normalizedNetwork = normalizeNetwork(network);
  const networkUpper = normalizedNetwork.toUpperCase();
  const sharedNetwork = process.env[`MEV_RPC_${networkUpper}`];
  const sharedGlobal = process.env.MEV_RPC_URL;
  const readNetwork = process.env[`MEV_RPC_READ_${networkUpper}`];
  const readGlobal = process.env.MEV_RPC_READ_URL;
  const writeNetwork = process.env[`MEV_RPC_WRITE_${networkUpper}`];
  const writeGlobal = process.env.MEV_RPC_WRITE_URL;

  if (role === "write") {
    return writeNetwork || writeGlobal || readNetwork || readGlobal || sharedNetwork || sharedGlobal || RPC_BY_NETWORK[normalizedNetwork];
  }

  return readNetwork || readGlobal || sharedNetwork || sharedGlobal || RPC_BY_NETWORK[normalizedNetwork];
}

function maskAddress(address) {
  if (!address || address.length < 14) {
    return address || null;
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function cloneConfig(config) {
  return {
    ...config,
    providers: [...config.providers],
    tokens: config.tokens.map((token) => ({ ...token })),
  };
}

function defaultTokensForNetwork(network) {
  return (DEFAULT_TOKENS_BY_NETWORK[network] || DEFAULT_TOKENS_BY_NETWORK.mainnet).map((token) => ({ ...token }));
}

function fallbackTokensForNetwork(network) {
  return (FALLBACK_TOKENS_BY_NETWORK[network] || FALLBACK_TOKENS_BY_NETWORK.mainnet).map((token) => ({ ...token }));
}

function defaultSizingRuntimeState() {
  return {
    multiplier: 1,
    tradeSamples: 0,
    ewmaPnlSui: 0,
    ewmaWinRate: 0.5,
    lastRealizedPnlSui: null,
    lastUpdatedAt: null,
    lastDecision: null,
  };
}

function normalizeSampleNetwork(value, fallback = "mainnet") {
  const network = String(value || fallback).trim().toLowerCase();
  if (network === "mainnet" || network === "testnet" || network === "devnet") {
    return network;
  }
  return fallback;
}

function sanitizeBalanceHistory(samples) {
  if (!Array.isArray(samples)) {
    return [];
  }

  const normalized = [];
  for (const sample of samples) {
    if (!sample || typeof sample !== "object") {
      continue;
    }

    const tsRaw = sample.ts ? String(sample.ts) : "";
    const tsDate = new Date(tsRaw);
    if (Number.isNaN(tsDate.getTime())) {
      continue;
    }

    const balanceSui = Number(sample.balanceSui);
    if (!Number.isFinite(balanceSui) || balanceSui < 0) {
      continue;
    }

    const deltaSui = Number(sample.deltaSui);
    const deltaPct = Number(sample.deltaPct);
    const rollingPeakSui = Number(sample.rollingPeakSui);
    const normalizedPeakSui =
      Number.isFinite(rollingPeakSui) && rollingPeakSui >= balanceSui ? rollingPeakSui : balanceSui;
    const source = String(sample.source || "unknown").trim() || "unknown";
    const network = normalizeSampleNetwork(sample.network, "mainnet");
    const balanceAtomicRaw = sample.balanceAtomic != null ? String(sample.balanceAtomic).trim() : "";
    const balanceAtomic =
      balanceAtomicRaw && /^\d+$/.test(balanceAtomicRaw)
        ? balanceAtomicRaw
        : BigInt(Math.max(0, Math.round(balanceSui * 1_000_000_000))).toString();

    normalized.push({
      ts: tsDate.toISOString(),
      source,
      network,
      balanceSui,
      balanceAtomic,
      deltaSui: Number.isFinite(deltaSui) ? deltaSui : 0,
      deltaPct: Number.isFinite(deltaPct) ? deltaPct : 0,
      rollingPeakSui: normalizedPeakSui,
    });
  }

  return normalized.slice(-EQUITY_HISTORY_MAX);
}

function serializeBigInt(value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function toAtomicUnits(amount, decimals) {
  const raw = String(amount ?? "").trim();
  if (!raw) {
    throw new Error("amount is required");
  }

  const negative = raw.startsWith("-");
  if (negative) {
    throw new Error("amount must be positive");
  }

  const [wholeRaw, fracRaw = ""] = raw.split(".");
  const whole = wholeRaw || "0";

  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) {
    throw new Error(`invalid decimal amount: ${raw}`);
  }

  const paddedFraction = `${fracRaw}${"0".repeat(decimals)}`.slice(0, decimals);
  const wholePart = BigInt(whole) * 10n ** BigInt(decimals);
  const fracPart = paddedFraction.length > 0 ? BigInt(paddedFraction) : 0n;
  return wholePart + fracPart;
}

function fromAtomicUnits(value, decimals) {
  const atomic = typeof value === "bigint" ? value : BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = atomic / base;
  const fraction = atomic % base;
  if (fraction === 0n) {
    return whole.toString();
  }

  const padded = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${padded}`;
}

function normalizedRate(amountInAtomic, inDecimals, amountOutAtomic, outDecimals) {
  const amountIn = Number(amountInAtomic);
  const amountOut = Number(amountOutAtomic);

  if (!Number.isFinite(amountIn) || !Number.isFinite(amountOut) || amountIn <= 0 || amountOut <= 0) {
    return 0;
  }

  const inNormalized = amountIn / 10 ** inDecimals;
  const outNormalized = amountOut / 10 ** outDecimals;
  if (inNormalized <= 0 || outNormalized <= 0) {
    return 0;
  }

  return outNormalized / inNormalized;
}

function normalizeDeviationToBps(rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  if (numeric <= 1) {
    return numeric * 100;
  }
  if (numeric <= 100) {
    return numeric * 100;
  }
  return numeric;
}

function deriveEncryptionKey() {
  const secret = process.env.MEV_ENCRYPTION_KEY || process.env.SUI_WALLET_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("Missing encryption key. Set MEV_ENCRYPTION_KEY.");
  }
  return scryptSync(secret, "sui-local-mev-v1", 32);
}

function encryptSecret(plaintext) {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(payload) {
  const [ivB64, tagB64, encryptedB64] = String(payload || "").split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Stored wallet payload is invalid.");
  }

  const key = deriveEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function flagToScheme(flag) {
  if (flag === 0) {
    return "ED25519";
  }
  if (flag === 1) {
    return "Secp256k1";
  }
  if (flag === 2) {
    return "Secp256r1";
  }
  throw new Error("Unsupported private key scheme flag.");
}

function schemeToEnv(network) {
  return network === "mainnet" ? Env.Mainnet : Env.Testnet;
}

function parsePrivateKeyInput(privateKeyRaw) {
  const input = String(privateKeyRaw || "").trim();
  if (!input) {
    throw new Error("privateKey is required");
  }

  if (input.startsWith("suiprivkey")) {
    const parsed = decodeSuiPrivateKey(input);
    return {
      scheme: parsed.scheme,
      secretKey: parsed.secretKey,
      encoded: encodeSuiPrivateKey(parsed.secretKey, parsed.scheme),
    };
  }

  const normalized = input.startsWith("0x") ? input : `0x${input}`;
  const bytes = fromHex(normalized);

  if (bytes.length === 33) {
    const scheme = flagToScheme(bytes[0]);
    const secretKey = bytes.slice(1);
    return {
      scheme,
      secretKey,
      encoded: encodeSuiPrivateKey(secretKey, scheme),
    };
  }

  if (bytes.length === 32) {
    const scheme = "ED25519";
    return {
      scheme,
      secretKey: bytes,
      encoded: encodeSuiPrivateKey(bytes, scheme),
    };
  }

  if (bytes.length === 64) {
    const scheme = "ED25519";
    const secretKey = bytes.slice(0, 32);
    return {
      scheme,
      secretKey,
      encoded: encodeSuiPrivateKey(secretKey, scheme),
    };
  }

  throw new Error("Unsupported private key format. Use suiprivkey..., 32-byte hex, or flag+secret hex.");
}

function createKeypairFromSecret(secret) {
  if (secret.scheme === "ED25519") {
    return Ed25519Keypair.fromSecretKey(secret.secretKey);
  }
  if (secret.scheme === "Secp256k1") {
    return Secp256k1Keypair.fromSecretKey(secret.secretKey);
  }
  if (secret.scheme === "Secp256r1") {
    return Secp256r1Keypair.fromSecretKey(secret.secretKey);
  }
  throw new Error(`Unsupported scheme: ${secret.scheme}`);
}

async function runWithConcurrency(items, limit, worker) {
  const tasks = [...items];
  const workers = [];
  const maxWorkers = Math.max(1, Math.min(limit, tasks.length || 1));

  for (let i = 0; i < maxWorkers; i += 1) {
    workers.push(
      (async () => {
        while (tasks.length > 0) {
          const task = tasks.shift();
          if (!task) {
            continue;
          }
          await worker(task);
        }
      })(),
    );
  }

  await Promise.all(workers);
}

export class LocalMevService {
  constructor({ rootDir = process.cwd(), stateFile = DEFAULT_DATA_FILE } = {}) {
    this.rootDir = rootDir;
    this.statePath = resolve(rootDir, stateFile);

    this.state = {
      wallet: null,
      config: cloneConfig(DEFAULT_CONFIG),
      learning: {
        history: [],
        adjustments: [],
        lastAdjustedAt: null,
        balanceHistory: [],
      },
    };

    this.runtime = {
      enabled: false,
      running: false,
      scanCursor: 0,
      nextRunAt: null,
      lastScanAt: null,
      lastScanResult: null,
      lastOpportunity: null,
      lastTrade: null,
      lastError: null,
      adaptive: {
        history: [],
        adjustments: [],
        lastMetrics: null,
        lastAdjustedAt: null,
        lastDecision: null,
      },
      sizing: defaultSizingRuntimeState(),
      safety: {
        pauseLiveUntil: null,
        pauseReason: null,
        lastGuard: null,
      },
      routeHealth: {
        routes: {},
        tokens: {},
        lastBlockedAt: null,
        lastBlockedReason: null,
        lastBlockedRoute: null,
      },
      persistence: {
        degraded: false,
        reason: null,
        backoffUntil: null,
        lastPersistAt: null,
        lastError: null,
        lastErrorAt: null,
        failedWrites: 0,
      },
      equity: {
        history: [],
        currentSui: null,
        startSui: null,
        peakSui: null,
        changeSui: null,
        changePct: null,
        drawdownPct: null,
        downStepRate: null,
        negativeStreak: 0,
        lastUpdatedAt: null,
        lastSource: null,
      },
      reactor: {
        lastCheckedCheckpoint: null,
        lastCheckedAt: null,
        nextCheckAt: null,
        lastSignalAt: null,
        lastSignal: null,
        pendingImmediate: false,
      },
      lanes: {
        fast: {
          nextRunAt: null,
          lastRunAt: null,
          lastDurationMs: null,
          skippedBusy: 0,
          lastSkippedAt: null,
          lastResult: null,
        },
        slow: {
          nextRunAt: null,
          lastRunAt: null,
          lastDurationMs: null,
          skippedBusy: 0,
          lastSkippedAt: null,
          lastResult: null,
        },
      },
      rpc: {
        writeCooldownUntil: null,
        lastRateLimitAt: null,
        lastRateLimitReason: null,
        deferred: {
          equityRetryAt: null,
          unwindRetryAt: null,
        },
      },
      unwind: {
        positions: {},
        lastRunAt: null,
        lastAction: null,
      },
      logs: [],
    };

    this.suiReadClients = new Map();
    this.suiWriteClients = new Map();
    this.scanPromise = null;
    this.loopTimer = null;
    this.fastLoopTimer = null;
    this.slowLoopTimer = null;
    this.reactorTimer = null;
    this.tokenMetadataCache = new Map();
    this.tokenUniverseCache = new Map();
    this.readyPromise = this.loadState();
  }

  async loadState() {
    try {
      const raw = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw);

      if (parsed?.wallet && typeof parsed.wallet === "object") {
        this.state.wallet = {
          address: String(parsed.wallet.address || ""),
          scheme: String(parsed.wallet.scheme || ""),
          encryptedSecret: String(parsed.wallet.encryptedSecret || ""),
          importedAt: String(parsed.wallet.importedAt || ""),
        };
      }

      if (parsed?.config && typeof parsed.config === "object") {
        const merged = await this.applyConfigPatch(parsed.config, { persist: false, log: false, skipReady: true });
        this.state.config = merged;
      }

      if (parsed?.learning && typeof parsed.learning === "object") {
        const history = Array.isArray(parsed.learning.history) ? parsed.learning.history : [];
        const adjustments = Array.isArray(parsed.learning.adjustments) ? parsed.learning.adjustments : [];
        const lastAdjustedAt = parsed.learning.lastAdjustedAt ? String(parsed.learning.lastAdjustedAt) : null;
        const balanceHistory = sanitizeBalanceHistory(parsed.learning.balanceHistory);

        this.state.learning = {
          history: history.slice(-ADAPTIVE_HISTORY_MAX),
          adjustments: adjustments.slice(-ADAPTIVE_ADJUSTMENTS_MAX),
          lastAdjustedAt,
          balanceHistory,
        };

        this.runtime.adaptive.history = [...this.state.learning.history];
        this.runtime.adaptive.adjustments = [...this.state.learning.adjustments];
        this.runtime.adaptive.lastAdjustedAt = this.state.learning.lastAdjustedAt;
        this.runtime.adaptive.lastMetrics = this.computeAdaptiveMetrics(this.runtime.adaptive.history);
      }

      this.rebuildEquityRuntimeFromHistory();
      this.rebuildSizingRuntimeFromHistory();
    } catch {
      // Start with defaults.
    }
  }

  persistBackoffRemainingMs() {
    const untilIso = this.runtime.persistence.backoffUntil;
    if (!untilIso) {
      return 0;
    }

    const untilMs = new Date(untilIso).getTime();
    if (!Number.isFinite(untilMs)) {
      this.runtime.persistence.backoffUntil = null;
      return 0;
    }

    const remaining = untilMs - Date.now();
    if (remaining <= 0) {
      this.runtime.persistence.backoffUntil = null;
      return 0;
    }

    return remaining;
  }

  async persistState({ context = "general", fatal = true, bypassBackoff = false } = {}) {
    const remainingBackoffMs = this.persistBackoffRemainingMs();
    if (!bypassBackoff && remainingBackoffMs > 0) {
      if (fatal) {
        const error = new Error(`Persistence backoff active (${remainingBackoffMs}ms)`);
        error.code = "PERSIST_BACKOFF";
        throw error;
      }
      return false;
    }

    try {
      await mkdir(resolve(this.statePath, ".."), { recursive: true });
      await writeFile(
        this.statePath,
        JSON.stringify(
          {
            wallet: this.state.wallet,
            config: this.state.config,
            learning: this.state.learning,
          },
          (key, value) => serializeBigInt(value),
          2,
        ),
        "utf8",
      );

      this.runtime.persistence.degraded = false;
      this.runtime.persistence.reason = null;
      this.runtime.persistence.backoffUntil = null;
      this.runtime.persistence.lastPersistAt = new Date().toISOString();
      this.runtime.persistence.lastError = null;
      this.runtime.persistence.lastErrorAt = null;
      this.runtime.persistence.failedWrites = 0;
      return true;
    } catch (error) {
      const isNoSpace = isNoSpaceError(error);
      const backoffMs = isNoSpace ? PERSIST_BACKOFF_ENOSPC_MS : PERSIST_BACKOFF_GENERIC_MS;
      this.runtime.persistence.degraded = true;
      this.runtime.persistence.reason = isNoSpace ? "disk-full" : "write-error";
      this.runtime.persistence.backoffUntil = new Date(Date.now() + backoffMs).toISOString();
      this.runtime.persistence.lastError = error instanceof Error ? error.message : String(error);
      this.runtime.persistence.lastErrorAt = new Date().toISOString();
      this.runtime.persistence.failedWrites = Number(this.runtime.persistence.failedWrites || 0) + 1;

      this.log("persist-error", "State persistence failed", {
        context,
        reason: this.runtime.persistence.reason,
        message: this.runtime.persistence.lastError,
        backoffUntil: this.runtime.persistence.backoffUntil,
      });

      if (fatal) {
        throw error;
      }
      return false;
    }
  }

  async ready() {
    await this.readyPromise;
  }

  log(type, label, details = null) {
    const entry = {
      ts: new Date().toISOString(),
      type,
      label,
      details,
    };

    this.runtime.logs.push(entry);
    if (this.runtime.logs.length > MAX_LOG_ENTRIES) {
      this.runtime.logs.splice(0, this.runtime.logs.length - MAX_LOG_ENTRIES);
    }
  }

  getSuiClient(network, role = "read") {
    const key = normalizeNetwork(network);
    const lane = role === "write" ? "write" : "read";
    const clients = lane === "write" ? this.suiWriteClients : this.suiReadClients;
    if (!clients.has(key)) {
      const url = resolveRpcEndpoint(key, lane);
      clients.set(key, new SuiClient({ url }));
      this.log("rpc", `Initialized ${lane.toUpperCase()} RPC client`, {
        network: key,
        url,
      });
    }
    return clients.get(key);
  }

  createAggregatorClient(network, signerAddress = "0x0", role = "read") {
    const normalizedNetwork = normalizeNetwork(network);
    const endpoint = process.env.MEV_AGGREGATOR_ENDPOINT || AGGREGATOR_ENDPOINT_BY_NETWORK[normalizedNetwork];

    return new AggregatorClient({
      endpoint,
      env: schemeToEnv(normalizedNetwork),
      signer: signerAddress,
      client: this.getSuiClient(normalizedNetwork, role),
      apiKey: process.env.CETUS_AGGREGATOR_API_KEY || "",
    });
  }

  writeCooldownRemainingMs() {
    const cooldownIso = this.runtime.rpc.writeCooldownUntil;
    if (!cooldownIso) {
      return 0;
    }

    const cooldownUntil = new Date(cooldownIso).getTime();
    if (!Number.isFinite(cooldownUntil)) {
      this.runtime.rpc.writeCooldownUntil = null;
      return 0;
    }

    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) {
      this.runtime.rpc.writeCooldownUntil = null;
      return 0;
    }

    return remaining;
  }

  scheduleDeferredRpcRetry(kind, delayMs) {
    const safeDelay = Math.max(150, Math.round(Number(delayMs) || 0));
    const retryAt = new Date(Date.now() + safeDelay).toISOString();
    if (kind === "equity") {
      this.runtime.rpc.deferred.equityRetryAt = retryAt;
    } else if (kind === "unwind") {
      this.runtime.rpc.deferred.unwindRetryAt = retryAt;
    }
    return retryAt;
  }

  setWriteEndpointCooldown(delayMs = WRITE_ENDPOINT_COOLDOWN_MS, reason = "rate-limit") {
    const duration = Math.max(500, Math.round(Number(delayMs) || WRITE_ENDPOINT_COOLDOWN_MS));
    const nextUntil = Date.now() + duration;
    const existingUntil = this.runtime.rpc.writeCooldownUntil ? new Date(this.runtime.rpc.writeCooldownUntil).getTime() : 0;
    if (!existingUntil || !Number.isFinite(existingUntil) || nextUntil > existingUntil) {
      this.runtime.rpc.writeCooldownUntil = new Date(nextUntil).toISOString();
    }
    this.runtime.rpc.lastRateLimitAt = new Date().toISOString();
    this.runtime.rpc.lastRateLimitReason = String(reason || "rate-limit");
    return this.runtime.rpc.writeCooldownUntil;
  }

  async runRpcWriteWithRetry(task, { label = "rpc-write", maxAttempts = WRITE_RETRY_ATTEMPTS, budgetMs = WRITE_RETRY_BUDGET_MS } = {}) {
    const cooldownRemaining = this.writeCooldownRemainingMs();
    if (cooldownRemaining > 0) {
      const error = new Error(`RPC_WRITE_COOLDOWN: ${cooldownRemaining}ms remaining for ${label}`);
      error.code = "RPC_WRITE_COOLDOWN";
      error.cooldownRemainingMs = cooldownRemaining;
      throw error;
    }

    const startedAt = Date.now();
    let attempt = 0;
    let lastRateLimitError = null;

    while (attempt < Math.max(1, maxAttempts)) {
      attempt += 1;
      try {
        return await task();
      } catch (error) {
        if (!isRateLimitedError(error)) {
          throw error;
        }

        lastRateLimitError = error;
        const elapsedMs = Date.now() - startedAt;
        const remainingBudgetMs = Math.max(0, budgetMs - elapsedMs);
        if (attempt >= maxAttempts || remainingBudgetMs <= 80) {
          break;
        }

        const retryAfterMs = extractRetryAfterMs(error);
        const jitterMs = randomInteger(WRITE_RETRY_JITTER_MIN_MS, WRITE_RETRY_JITTER_MAX_MS);
        const waitMs = Math.max(60, Math.min(retryAfterMs ?? jitterMs, remainingBudgetMs - 40));
        this.log("rate-limit", `429 on ${label}; retrying`, {
          attempt,
          maxAttempts,
          waitMs,
          remainingBudgetMs,
          retryAfterMs,
        });
        await sleep(waitMs);
      }
    }

    const cooldownUntil = this.setWriteEndpointCooldown(WRITE_ENDPOINT_COOLDOWN_MS, label);
    const failure = new Error(`RPC_WRITE_RATE_LIMIT: ${label} exceeded retry budget; cooling write endpoint`);
    failure.code = "RPC_WRITE_RATE_LIMIT";
    failure.cooldownUntil = cooldownUntil;
    failure.cause = lastRateLimitError;
    throw failure;
  }

  async getWalletKeypair() {
    await this.ready();

    if (!this.state.wallet?.encryptedSecret) {
      throw new Error("No wallet imported.");
    }

    const encodedPrivateKey = decryptSecret(this.state.wallet.encryptedSecret);
    const parsed = decodeSuiPrivateKey(encodedPrivateKey);
    const keypair = createKeypairFromSecret(parsed);

    return {
      keypair,
      address: keypair.getPublicKey().toSuiAddress(),
      scheme: parsed.scheme,
    };
  }

  walletStatus() {
    const wallet = this.state.wallet;
    return {
      configured: Boolean(wallet?.address),
      address: wallet?.address || null,
      addressMasked: wallet?.address ? maskAddress(wallet.address) : null,
      scheme: wallet?.scheme || null,
      importedAt: wallet?.importedAt || null,
      suiBalanceSui: this.runtime.equity.currentSui,
      suiBalanceUpdatedAt: this.runtime.equity.lastUpdatedAt,
      encryptionReady: Boolean(process.env.MEV_ENCRYPTION_KEY || process.env.SUI_WALLET_ENCRYPTION_KEY),
    };
  }

  resetEquityTracking({ reason = null, log = true } = {}) {
    this.state.learning.balanceHistory = [];
    this.runtime.equity = {
      history: [],
      currentSui: null,
      startSui: null,
      peakSui: null,
      changeSui: null,
      changePct: null,
      drawdownPct: null,
      downStepRate: null,
      negativeStreak: 0,
      lastUpdatedAt: null,
      lastSource: null,
    };

    if (log) {
      this.log("equity", "Reset SUI balance history", reason ? { reason } : null);
    }
  }

  rebuildEquityRuntimeFromHistory() {
    const history = sanitizeBalanceHistory(this.state.learning.balanceHistory);
    this.state.learning.balanceHistory = history;
    this.runtime.equity.history = [...history];

    if (history.length === 0) {
      this.runtime.equity.currentSui = null;
      this.runtime.equity.startSui = null;
      this.runtime.equity.peakSui = null;
      this.runtime.equity.changeSui = null;
      this.runtime.equity.changePct = null;
      this.runtime.equity.drawdownPct = null;
      this.runtime.equity.downStepRate = null;
      this.runtime.equity.negativeStreak = 0;
      this.runtime.equity.lastUpdatedAt = null;
      this.runtime.equity.lastSource = null;
      return;
    }

    const startSui = history[0].balanceSui;
    const currentSui = history[history.length - 1].balanceSui;
    const peakSui = history.reduce((peak, point) => Math.max(peak, point.balanceSui), startSui);
    const changeSui = currentSui - startSui;
    const changePct = startSui > 0 ? changeSui / startSui : 0;
    const drawdownPct = peakSui > 0 ? (peakSui - currentSui) / peakSui : 0;

    let downSteps = 0;
    for (let i = 1; i < history.length; i += 1) {
      if (history[i].balanceSui < history[i - 1].balanceSui - 1e-12) {
        downSteps += 1;
      }
    }

    let negativeStreak = 0;
    for (let i = history.length - 1; i > 0; i -= 1) {
      if (history[i].balanceSui < history[i - 1].balanceSui - 1e-12) {
        negativeStreak += 1;
      } else {
        break;
      }
    }

    this.runtime.equity.currentSui = currentSui;
    this.runtime.equity.startSui = startSui;
    this.runtime.equity.peakSui = peakSui;
    this.runtime.equity.changeSui = changeSui;
    this.runtime.equity.changePct = changePct;
    this.runtime.equity.drawdownPct = drawdownPct;
    this.runtime.equity.downStepRate = history.length > 1 ? downSteps / (history.length - 1) : 0;
    this.runtime.equity.negativeStreak = negativeStreak;
    this.runtime.equity.lastUpdatedAt = history[history.length - 1].ts;
    this.runtime.equity.lastSource = history[history.length - 1].source || null;
  }

  pruneRouteHealth(nowMs = Date.now()) {
    const routes = this.runtime.routeHealth.routes || {};
    const tokens = this.runtime.routeHealth.tokens || {};

    for (const [routeKey, entry] of Object.entries(routes)) {
      const cooldownUntilMs = entry?.cooldownUntil ? new Date(entry.cooldownUntil).getTime() : 0;
      const hasValidCooldown = Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs;
      if (hasValidCooldown) {
        continue;
      }
      if (entry?.cooldownUntil) {
        entry.cooldownUntil = null;
      }
      const strikes = Number(entry?.strikes || 0);
      const lastFailureMs = entry?.lastFailureAt ? new Date(entry.lastFailureAt).getTime() : 0;
      const stale = Number.isFinite(lastFailureMs) && nowMs - lastFailureMs > 20 * 60 * 1000;
      if (strikes <= 0 || stale) {
        delete routes[routeKey];
      }
    }

    for (const [symbol, entry] of Object.entries(tokens)) {
      const cooldownUntilMs = entry?.cooldownUntil ? new Date(entry.cooldownUntil).getTime() : 0;
      const hasValidCooldown = Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs;
      if (hasValidCooldown) {
        continue;
      }
      if (entry?.cooldownUntil) {
        entry.cooldownUntil = null;
      }
      const strikes = Number(entry?.strikes || 0);
      const lastFailureMs = entry?.lastFailureAt ? new Date(entry.lastFailureAt).getTime() : 0;
      const stale = Number.isFinite(lastFailureMs) && nowMs - lastFailureMs > 20 * 60 * 1000;
      if (strikes <= 0 || stale) {
        delete tokens[symbol];
      }
    }
  }

  buildOpportunityRouteKey(opportunity) {
    if (!opportunity || !Array.isArray(opportunity.hops) || opportunity.hops.length === 0) {
      return "";
    }

    const hopKey = opportunity.hops.map((hop) => `${hop.fromSymbol}->${hop.toSymbol}`).join("|");
    const providerKey = opportunity.hops
      .map((hop) =>
        Array.isArray(hop.providers) && hop.providers.length > 0 ? [...hop.providers].sort().join("+") : "-",
      )
      .join("|");
    const cycleKey = Array.isArray(opportunity.cycle) ? opportunity.cycle.join("->") : hopKey;
    return `${cycleKey}::${hopKey}::${providerKey}`;
  }

  getOpportunityCooldownBlock(opportunity) {
    const nowMs = Date.now();
    this.pruneRouteHealth(nowMs);

    const routeKey = this.buildOpportunityRouteKey(opportunity);
    const routeEntry = routeKey ? this.runtime.routeHealth.routes[routeKey] : null;
    const routeCooldownUntilMs = routeEntry?.cooldownUntil ? new Date(routeEntry.cooldownUntil).getTime() : 0;
    if (routeEntry && Number.isFinite(routeCooldownUntilMs) && routeCooldownUntilMs > nowMs) {
      const block = {
        blocked: true,
        type: "route",
        routeKey,
        reason: routeEntry.lastReason || "route-cooldown",
        cooldownUntil: routeEntry.cooldownUntil,
        remainingMs: routeCooldownUntilMs - nowMs,
      };
      this.runtime.routeHealth.lastBlockedAt = new Date().toISOString();
      this.runtime.routeHealth.lastBlockedReason = block.reason;
      this.runtime.routeHealth.lastBlockedRoute = routeKey;
      return block;
    }

    const symbols = [...new Set(Array.isArray(opportunity?.cycle) ? opportunity.cycle : [])].filter((symbol) => symbol && symbol !== "SUI");
    for (const symbol of symbols) {
      const entry = this.runtime.routeHealth.tokens[symbol];
      const tokenCooldownUntilMs = entry?.cooldownUntil ? new Date(entry.cooldownUntil).getTime() : 0;
      if (entry && Number.isFinite(tokenCooldownUntilMs) && tokenCooldownUntilMs > nowMs) {
        const block = {
          blocked: true,
          type: "token",
          symbol,
          routeKey,
          reason: entry.lastReason || `token-cooldown:${symbol}`,
          cooldownUntil: entry.cooldownUntil,
          remainingMs: tokenCooldownUntilMs - nowMs,
        };
        this.runtime.routeHealth.lastBlockedAt = new Date().toISOString();
        this.runtime.routeHealth.lastBlockedReason = block.reason;
        this.runtime.routeHealth.lastBlockedRoute = routeKey || null;
        return block;
      }
    }

    return {
      blocked: false,
      routeKey,
    };
  }

  classifyExecutionFailure(reason) {
    const text = String(reason || "").toLowerCase();
    if (!text) {
      return { toxic: false, weight: 0, category: "none" };
    }

    if (
      text.includes("rpc_write") ||
      text.includes("rate limit") ||
      text.includes("cooldown") ||
      text.includes("backrun wait") ||
      text.includes("safety pause")
    ) {
      return { toxic: false, weight: 0, category: "infra" };
    }

    if (text.includes("non-positive-requote-profit") || text.includes("requote edge")) {
      return { toxic: true, weight: 2, category: "negative-requote" };
    }
    if (text.includes("requote-drift-too-high")) {
      return { toxic: true, weight: 2, category: "requote-drift" };
    }
    if (text.includes("missing-live-quote") || text.includes("no executable route")) {
      return { toxic: true, weight: 2, category: "missing-liquidity" };
    }
    if (text.includes("route-deviation") || text.includes("route deviation")) {
      return { toxic: true, weight: 2, category: "route-deviation" };
    }
    if (text.includes("does not increase sui")) {
      return { toxic: true, weight: 2, category: "negative-projection" };
    }

    return { toxic: false, weight: 0, category: "other" };
  }

  recordOpportunityFailure(opportunity, reason, config) {
    const classification = this.classifyExecutionFailure(reason);
    if (!classification.toxic || !opportunity) {
      return null;
    }

    const routeKey = this.buildOpportunityRouteKey(opportunity);
    if (!routeKey) {
      return null;
    }

    const nowMs = Date.now();
    this.pruneRouteHealth(nowMs);

    const routeStrikeThreshold = clampInteger(config.toxicRouteStrikeThreshold, DEFAULT_CONFIG.toxicRouteStrikeThreshold, {
      min: TOXIC_STRIKE_THRESHOLD_MIN,
      max: TOXIC_STRIKE_THRESHOLD_MAX,
    });
    const routeCooldownMs = clampInteger(config.toxicRouteCooldownMs, DEFAULT_CONFIG.toxicRouteCooldownMs, {
      min: TOXIC_ROUTE_COOLDOWN_MIN_MS,
      max: TOXIC_ROUTE_COOLDOWN_MAX_MS,
    });
    const tokenStrikeThreshold = clampInteger(config.toxicTokenStrikeThreshold, DEFAULT_CONFIG.toxicTokenStrikeThreshold, {
      min: TOXIC_STRIKE_THRESHOLD_MIN,
      max: TOXIC_STRIKE_THRESHOLD_MAX,
    });
    const tokenCooldownMs = clampInteger(config.toxicTokenCooldownMs, DEFAULT_CONFIG.toxicTokenCooldownMs, {
      min: TOXIC_TOKEN_COOLDOWN_MIN_MS,
      max: TOXIC_TOKEN_COOLDOWN_MAX_MS,
    });

    const routeEntry = this.runtime.routeHealth.routes[routeKey] || {
      strikes: 0,
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastReason: null,
      cooldownUntil: null,
    };

    routeEntry.strikes = Number(routeEntry.strikes || 0) + classification.weight;
    routeEntry.failures = Number(routeEntry.failures || 0) + 1;
    routeEntry.lastFailureAt = new Date().toISOString();
    routeEntry.lastReason = String(reason || classification.category);

    let routeCooldownApplied = false;
    if (routeEntry.strikes >= routeStrikeThreshold) {
      const scale = Math.min(4, 1 + Math.floor((routeEntry.strikes - routeStrikeThreshold) / 2));
      const untilMs = nowMs + routeCooldownMs * scale;
      const currentCooldownMs = routeEntry.cooldownUntil ? new Date(routeEntry.cooldownUntil).getTime() : 0;
      if (!Number.isFinite(currentCooldownMs) || untilMs > currentCooldownMs) {
        routeEntry.cooldownUntil = new Date(untilMs).toISOString();
        routeCooldownApplied = true;
      }
    }

    this.runtime.routeHealth.routes[routeKey] = routeEntry;

    const cycleSymbols = [...new Set(Array.isArray(opportunity.cycle) ? opportunity.cycle : [])].filter(
      (symbol) => symbol && symbol !== "SUI",
    );
    let tokenCooldownsApplied = 0;
    for (const symbol of cycleSymbols) {
      const tokenEntry = this.runtime.routeHealth.tokens[symbol] || {
        strikes: 0,
        failures: 0,
        successes: 0,
        lastFailureAt: null,
        lastReason: null,
        cooldownUntil: null,
      };
      tokenEntry.strikes = Number(tokenEntry.strikes || 0) + classification.weight;
      tokenEntry.failures = Number(tokenEntry.failures || 0) + 1;
      tokenEntry.lastFailureAt = new Date().toISOString();
      tokenEntry.lastReason = String(reason || classification.category);

      if (tokenEntry.strikes >= tokenStrikeThreshold) {
        const scale = Math.min(3, 1 + Math.floor((tokenEntry.strikes - tokenStrikeThreshold) / 2));
        const untilMs = nowMs + tokenCooldownMs * scale;
        const currentCooldownMs = tokenEntry.cooldownUntil ? new Date(tokenEntry.cooldownUntil).getTime() : 0;
        if (!Number.isFinite(currentCooldownMs) || untilMs > currentCooldownMs) {
          tokenEntry.cooldownUntil = new Date(untilMs).toISOString();
          tokenCooldownsApplied += 1;
        }
      }

      this.runtime.routeHealth.tokens[symbol] = tokenEntry;
    }

    if (routeCooldownApplied || tokenCooldownsApplied > 0) {
      this.log("route-health", "Applied toxic route/token cooldown", {
        routeKey,
        category: classification.category,
        routeStrikes: routeEntry.strikes,
        routeCooldownUntil: routeEntry.cooldownUntil,
        tokenCooldownsApplied,
      });
    }

    return {
      routeKey,
      routeEntry,
    };
  }

  recordOpportunitySuccess(opportunity) {
    if (!opportunity) {
      return;
    }

    const routeKey = this.buildOpportunityRouteKey(opportunity);
    if (!routeKey) {
      return;
    }

    const nowMs = Date.now();
    this.pruneRouteHealth(nowMs);

    const routeEntry = this.runtime.routeHealth.routes[routeKey];
    if (routeEntry) {
      routeEntry.successes = Number(routeEntry.successes || 0) + 1;
      routeEntry.strikes = Math.max(0, Number(routeEntry.strikes || 0) - 1);
      if (routeEntry.strikes <= 0) {
        routeEntry.cooldownUntil = null;
      }
    }

    const cycleSymbols = [...new Set(Array.isArray(opportunity.cycle) ? opportunity.cycle : [])].filter(
      (symbol) => symbol && symbol !== "SUI",
    );
    for (const symbol of cycleSymbols) {
      const tokenEntry = this.runtime.routeHealth.tokens[symbol];
      if (!tokenEntry) {
        continue;
      }
      tokenEntry.successes = Number(tokenEntry.successes || 0) + 1;
      tokenEntry.strikes = Math.max(0, Number(tokenEntry.strikes || 0) - 1);
      if (tokenEntry.strikes <= 0) {
        tokenEntry.cooldownUntil = null;
      }
    }
  }

  buildRouteHealthSnapshot(limit = 12) {
    const nowMs = Date.now();
    this.pruneRouteHealth(nowMs);

    const routeEntries = Object.entries(this.runtime.routeHealth.routes || {}).map(([routeKey, entry]) => {
      const cooldownUntilMs = entry?.cooldownUntil ? new Date(entry.cooldownUntil).getTime() : 0;
      return {
        routeKey,
        strikes: Number(entry?.strikes || 0),
        failures: Number(entry?.failures || 0),
        successes: Number(entry?.successes || 0),
        lastReason: entry?.lastReason || null,
        cooldownUntil: entry?.cooldownUntil || null,
        cooldownRemainingMs: Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs ? cooldownUntilMs - nowMs : 0,
      };
    });
    const tokenEntries = Object.entries(this.runtime.routeHealth.tokens || {}).map(([symbol, entry]) => {
      const cooldownUntilMs = entry?.cooldownUntil ? new Date(entry.cooldownUntil).getTime() : 0;
      return {
        symbol,
        strikes: Number(entry?.strikes || 0),
        failures: Number(entry?.failures || 0),
        successes: Number(entry?.successes || 0),
        lastReason: entry?.lastReason || null,
        cooldownUntil: entry?.cooldownUntil || null,
        cooldownRemainingMs: Number.isFinite(cooldownUntilMs) && cooldownUntilMs > nowMs ? cooldownUntilMs - nowMs : 0,
      };
    });

    const activeRoutes = routeEntries
      .filter((entry) => entry.cooldownRemainingMs > 0)
      .sort((a, b) => b.cooldownRemainingMs - a.cooldownRemainingMs);
    const activeTokens = tokenEntries
      .filter((entry) => entry.cooldownRemainingMs > 0)
      .sort((a, b) => b.cooldownRemainingMs - a.cooldownRemainingMs);

    return {
      activeRouteCooldowns: activeRoutes.length,
      activeTokenCooldowns: activeTokens.length,
      routes: activeRoutes.slice(0, limit),
      tokens: activeTokens.slice(0, limit),
      lastBlockedAt: this.runtime.routeHealth.lastBlockedAt,
      lastBlockedReason: this.runtime.routeHealth.lastBlockedReason,
      lastBlockedRoute: this.runtime.routeHealth.lastBlockedRoute,
    };
  }

  rebuildSizingRuntimeFromHistory() {
    this.runtime.sizing = defaultSizingRuntimeState();
    const history = Array.isArray(this.state.learning?.history) ? this.state.learning.history : [];
    if (history.length === 0) {
      return;
    }

    const baselineConfig = this.state.config || DEFAULT_CONFIG;
    for (const sample of history) {
      if (!sample?.tradeExecuted) {
        continue;
      }
      const walletDeltaSui = Number(sample.walletDeltaSui);
      if (!Number.isFinite(walletDeltaSui)) {
        continue;
      }
      this.applyRealizedSizingObservation({
        realizedDeltaSui: walletDeltaSui,
        config: baselineConfig,
        log: false,
        source: "history-rebuild",
      });
    }
  }

  applyRealizedSizingObservation({ realizedDeltaSui, config, log = true, source = "scan" }) {
    const delta = Number(realizedDeltaSui);
    if (!Number.isFinite(delta)) {
      return null;
    }

    const sizing = this.runtime.sizing || defaultSizingRuntimeState();
    this.runtime.sizing = sizing;

    if (!parseBoolean(config.realizedSizingEnabled, DEFAULT_CONFIG.realizedSizingEnabled)) {
      sizing.multiplier = 1;
      sizing.lastDecision = {
        ts: new Date().toISOString(),
        source,
        action: "disabled",
        reason: "realized sizing disabled",
      };
      return sizing;
    }

    const alpha = clampFloat(config.realizedSizingAlpha, DEFAULT_CONFIG.realizedSizingAlpha, {
      min: REALIZED_SIZING_ALPHA_MIN,
      max: REALIZED_SIZING_ALPHA_MAX,
    });
    const winAlpha = clampFloat(config.realizedSizingWinRateAlpha, DEFAULT_CONFIG.realizedSizingWinRateAlpha, {
      min: REALIZED_SIZING_ALPHA_MIN,
      max: REALIZED_SIZING_ALPHA_MAX,
    });
    const targetWinRate = clampFloat(config.realizedSizingTargetWinRate, DEFAULT_CONFIG.realizedSizingTargetWinRate, {
      min: REALIZED_SIZING_TARGET_WINRATE_MIN,
      max: REALIZED_SIZING_TARGET_WINRATE_MAX,
    });
    const minDeltaSui = clampFloat(config.realizedSizingMinDeltaSui, Number(DEFAULT_CONFIG.realizedSizingMinDeltaSui), {
      min: REALIZED_SIZING_MIN_DELTA_SUI_MIN,
      max: REALIZED_SIZING_MIN_DELTA_SUI_MAX,
    });

    const previousSamples = Number(sizing.tradeSamples || 0);
    const pnlBase = previousSamples <= 0 ? delta : Number(sizing.ewmaPnlSui || 0) * (1 - alpha) + delta * alpha;
    const winSample = delta > 0 ? 1 : 0;
    const winRateBase = previousSamples <= 0 ? winSample : Number(sizing.ewmaWinRate || 0.5) * (1 - winAlpha) + winSample * winAlpha;

    let multiplier = clampToRange(Number(sizing.multiplier || 1), {
      min: REALIZED_SIZING_MULTIPLIER_MIN,
      max: REALIZED_SIZING_MULTIPLIER_MAX,
    });
    let action = "hold";
    let reason = "stable";

    if (delta <= -minDeltaSui || pnlBase < -minDeltaSui * 0.33 || winRateBase < targetWinRate - 0.12) {
      multiplier *= 0.86;
      action = "downscale";
      reason = "negative realized PnL pressure";
    } else if (delta >= minDeltaSui && pnlBase > minDeltaSui * 0.18 && winRateBase >= targetWinRate) {
      multiplier *= 1.07;
      action = "upscale";
      reason = "positive realized PnL and win-rate";
    } else if (Math.abs(delta) < minDeltaSui * 0.4) {
      multiplier *= 0.98;
      action = "trim";
      reason = "low realized edge";
    }

    multiplier = clampToRange(multiplier, {
      min: REALIZED_SIZING_MULTIPLIER_MIN,
      max: REALIZED_SIZING_MULTIPLIER_MAX,
    });

    sizing.multiplier = multiplier;
    sizing.tradeSamples = previousSamples + 1;
    sizing.ewmaPnlSui = pnlBase;
    sizing.ewmaWinRate = winRateBase;
    sizing.lastRealizedPnlSui = delta;
    sizing.lastUpdatedAt = new Date().toISOString();
    sizing.lastDecision = {
      ts: sizing.lastUpdatedAt,
      source,
      action,
      reason,
      multiplier,
      ewmaPnlSui: pnlBase,
      ewmaWinRate: winRateBase,
      minDeltaSui,
      targetWinRate,
      realizedDeltaSui: delta,
    };

    if (log) {
      this.log("sizing", "Updated realized sizing multiplier", {
        source,
        action,
        reason,
        multiplier,
        realizedDeltaSui: delta,
        ewmaPnlSui: pnlBase,
        ewmaWinRate: winRateBase,
      });
    }

    return sizing;
  }

  updateRealizedSizingFromResult(config, result) {
    if (!parseBoolean(config.realizedSizingEnabled, DEFAULT_CONFIG.realizedSizingEnabled)) {
      this.runtime.sizing.multiplier = 1;
      return;
    }

    const trade = result?.trade;
    if (!trade || !trade.success || trade.dryRun) {
      return;
    }

    const walletDeltaSui = Number(result?.walletEquity?.deltaSui);
    if (!Number.isFinite(walletDeltaSui)) {
      return;
    }

    this.applyRealizedSizingObservation({
      realizedDeltaSui: walletDeltaSui,
      config,
      log: true,
      source: "trade-result",
    });

    trade.realizedPnlSui = walletDeltaSui;
    trade.sizingMultiplier = this.runtime.sizing.multiplier;
  }

  async runExecutionRequoteGate({ opportunity, config, tokenMap, startAmountAtomic }) {
    const primary = await this.validateOpportunityAtExecutionSize({
      opportunity,
      config,
      tokenMap,
      startAmountAtomic,
    });

    const dualEnabled = parseBoolean(config.dualRequoteEnabled, DEFAULT_CONFIG.dualRequoteEnabled);
    if (!dualEnabled || !primary.valid) {
      return {
        ...primary,
        requoteCount: 1,
        requoteDriftBps: null,
        primaryValidation: primary,
        secondaryValidation: null,
      };
    }

    const gapMs = clampInteger(config.dualRequoteGapMs, DEFAULT_CONFIG.dualRequoteGapMs, {
      min: DUAL_REQUOTE_GAP_MIN_MS,
      max: DUAL_REQUOTE_GAP_MAX_MS,
    });
    if (gapMs > 0) {
      await sleep(gapMs);
    }

    const secondary = await this.validateOpportunityAtExecutionSize({
      opportunity,
      config,
      tokenMap,
      startAmountAtomic,
    });
    if (!secondary.valid) {
      return {
        ...secondary,
        valid: false,
        reason: secondary.reason ? `confirm-${secondary.reason}` : "confirm-validation-failed",
        requoteCount: 2,
        requoteDriftBps: null,
        primaryValidation: primary,
        secondaryValidation: secondary,
      };
    }

    const firstBps = Number(primary.profitBps);
    const secondBps = Number(secondary.profitBps);
    const driftBps = Number.isFinite(firstBps) && Number.isFinite(secondBps) ? Math.abs(secondBps - firstBps) : Number.POSITIVE_INFINITY;
    const maxDriftBps = clampInteger(config.dualRequoteMaxDriftBps, DEFAULT_CONFIG.dualRequoteMaxDriftBps, {
      min: DUAL_REQUOTE_MAX_DRIFT_MIN_BPS,
      max: DUAL_REQUOTE_MAX_DRIFT_MAX_BPS,
    });

    if (!Number.isFinite(driftBps) || driftBps > maxDriftBps) {
      return {
        ...secondary,
        valid: false,
        reason: `requote-drift-too-high:${Number.isFinite(driftBps) ? driftBps.toFixed(2) : "NaN"}>${maxDriftBps}`,
        requoteCount: 2,
        requoteDriftBps: Number.isFinite(driftBps) ? driftBps : null,
        primaryValidation: primary,
        secondaryValidation: secondary,
      };
    }

    const projectedProfitSui = Math.min(
      Number.isFinite(Number(primary.projectedProfitSui)) ? Number(primary.projectedProfitSui) : Number.POSITIVE_INFINITY,
      Number.isFinite(Number(secondary.projectedProfitSui)) ? Number(secondary.projectedProfitSui) : Number.POSITIVE_INFINITY,
    );
    const conservativeProfitBps = Math.min(
      Number.isFinite(firstBps) ? firstBps : Number.POSITIVE_INFINITY,
      Number.isFinite(secondBps) ? secondBps : Number.POSITIVE_INFINITY,
    );
    const primaryDeviation = Number(primary.maxRouteDeviationBps);
    const secondaryDeviation = Number(secondary.maxRouteDeviationBps);
    const maxRouteDeviationBps = Math.max(
      Number.isFinite(primaryDeviation) ? primaryDeviation : 0,
      Number.isFinite(secondaryDeviation) ? secondaryDeviation : 0,
    );

    return {
      ...secondary,
      valid: true,
      reason: "ok",
      projectedProfitSui: Number.isFinite(projectedProfitSui) ? projectedProfitSui : Number(secondary.projectedProfitSui || 0),
      profitBps: Number.isFinite(conservativeProfitBps) ? conservativeProfitBps : Number(secondary.profitBps || 0),
      maxRouteDeviationBps,
      requoteCount: 2,
      requoteDriftBps: driftBps,
      primaryValidation: primary,
      secondaryValidation: secondary,
    };
  }

  appendEquitySample({ balanceAtomic, network, source = "unknown" }) {
    const atomic = typeof balanceAtomic === "bigint" ? balanceAtomic : BigInt(balanceAtomic || "0");
    const balanceSui = Number(fromAtomicUnits(atomic, 9));
    if (!Number.isFinite(balanceSui) || balanceSui < 0) {
      return null;
    }

    const history = this.state.learning.balanceHistory;
    const previous = history.length > 0 ? history[history.length - 1] : null;
    const deltaSui = previous ? balanceSui - previous.balanceSui : 0;
    const deltaPct = previous && previous.balanceSui > 0 ? deltaSui / previous.balanceSui : 0;
    const rollingPeakSui = Math.max(previous?.rollingPeakSui ?? balanceSui, balanceSui);
    const sample = {
      ts: new Date().toISOString(),
      source: String(source || "unknown").trim() || "unknown",
      network: normalizeSampleNetwork(network, this.state.config.network),
      balanceSui,
      balanceAtomic: atomic.toString(),
      deltaSui,
      deltaPct,
      rollingPeakSui,
    };

    history.push(sample);
    if (history.length > EQUITY_HISTORY_MAX) {
      history.splice(0, history.length - EQUITY_HISTORY_MAX);
    }

    this.rebuildEquityRuntimeFromHistory();
    return sample;
  }

  async captureWalletEquitySnapshot({ network, source = "scan", persist = false, deferOnRateLimit = true } = {}) {
    const walletAddress = this.state.wallet?.address;
    if (!walletAddress) {
      return null;
    }

    const nowMs = Date.now();
    const scheduledRetryAt = this.runtime.rpc.deferred.equityRetryAt;
    if (deferOnRateLimit && scheduledRetryAt) {
      const scheduledMs = new Date(scheduledRetryAt).getTime();
      if (Number.isFinite(scheduledMs) && scheduledMs > nowMs) {
        return {
          deferred: true,
          reason: "equity-retry-scheduled",
          retryAt: scheduledRetryAt,
        };
      }
      this.runtime.rpc.deferred.equityRetryAt = null;
    }

    const cooldownRemaining = this.writeCooldownRemainingMs();
    if (deferOnRateLimit && cooldownRemaining > 0) {
      const retryAt = this.scheduleDeferredRpcRetry("equity", cooldownRemaining + randomInteger(80, 220));
      return {
        deferred: true,
        reason: "write-cooldown",
        retryAt,
      };
    }

    const normalizedNetwork = normalizeNetwork(network || this.state.config.network);
    const client = this.getSuiClient(normalizedNetwork, "write");

    let balance;
    try {
      balance = await this.runRpcWriteWithRetry(
        () => client.getBalance({ owner: walletAddress, coinType: "0x2::sui::SUI" }),
        { label: "equity-balance" },
      );
    } catch (error) {
      if (deferOnRateLimit && (error.code === "RPC_WRITE_RATE_LIMIT" || error.code === "RPC_WRITE_COOLDOWN")) {
        const retryAt = this.scheduleDeferredRpcRetry("equity", this.writeCooldownRemainingMs() + randomInteger(120, 300));
        return {
          deferred: true,
          reason: error.code === "RPC_WRITE_RATE_LIMIT" ? "write-rate-limit" : "write-cooldown",
          retryAt,
        };
      }
      throw error;
    }
    const atomic = BigInt(balance?.totalBalance || "0");
    const sample = this.appendEquitySample({
      balanceAtomic: atomic,
      network: normalizedNetwork,
      source,
    });

    if (!sample) {
      return null;
    }

    if (persist) {
      await this.persistState();
    }

    this.runtime.rpc.deferred.equityRetryAt = null;

    return {
      ts: sample.ts,
      source: sample.source,
      network: sample.network,
      balanceSui: sample.balanceSui,
      balanceAtomic: sample.balanceAtomic,
      deltaSui: sample.deltaSui,
      deltaPct: sample.deltaPct,
      peakSui: this.runtime.equity.peakSui,
      changeSui: this.runtime.equity.changeSui,
      changePct: this.runtime.equity.changePct,
      drawdownPct: this.runtime.equity.drawdownPct,
      points: this.runtime.equity.history.length,
    };
  }

  async importWallet({ privateKey }) {
    await this.ready();

    const previousAddress = this.state.wallet?.address || null;
    const parsed = parsePrivateKeyInput(privateKey);
    const keypair = createKeypairFromSecret(parsed);
    const address = keypair.getPublicKey().toSuiAddress();

    const encryptedSecret = encryptSecret(parsed.encoded);
    this.state.wallet = {
      address,
      scheme: parsed.scheme,
      encryptedSecret,
      importedAt: new Date().toISOString(),
    };

    if (!previousAddress || previousAddress !== address) {
      this.resetEquityTracking({ reason: previousAddress ? "wallet-changed" : "wallet-imported", log: false });
      this.runtime.sizing = defaultSizingRuntimeState();
      this.runtime.routeHealth = {
        routes: {},
        tokens: {},
        lastBlockedAt: null,
        lastBlockedReason: null,
        lastBlockedRoute: null,
      };
    }

    await this.persistState();
    try {
      await this.captureWalletEquitySnapshot({
        network: this.state.config.network,
        source: "wallet-import",
        persist: true,
      });
    } catch (error) {
      this.log("equity-error", "Failed to sample SUI balance after wallet import", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    this.log("wallet", `Imported ${parsed.scheme} wallet ${maskAddress(address)}`);

    return this.walletStatus();
  }

  async clearWallet() {
    await this.ready();
    this.state.wallet = null;
    this.resetEquityTracking({ reason: "wallet-cleared", log: false });
    this.runtime.sizing = defaultSizingRuntimeState();
    this.runtime.routeHealth = {
      routes: {},
      tokens: {},
      lastBlockedAt: null,
      lastBlockedReason: null,
      lastBlockedRoute: null,
    };
    await this.persistState();
    this.log("wallet", "Cleared wallet from local storage");
    return this.walletStatus();
  }

  sanitizeTokens(tokens, config) {
    if (!Array.isArray(tokens)) {
      return config.tokens;
    }

    const normalized = [];
    const symbols = new Set();

    for (const item of tokens) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const normalizedType = normalizeTypeName(item.type || item.coinType);
      const symbolBase = String(item.symbol || normalizedType.split("::").at(-1) || "")
        .trim()
        .toUpperCase();
      const scanAmount = String(item.scanAmount ?? item.amount ?? "").trim();
      const decimalsNumeric = Number(item.decimals);
      const decimals =
        Number.isInteger(decimalsNumeric) && decimalsNumeric >= 0 && decimalsNumeric <= 18 ? decimalsNumeric : null;

      if (!symbolBase || !normalizedType || symbols.has(symbolBase)) {
        continue;
      }

      if (!scanAmount || Number(scanAmount) <= 0) {
        continue;
      }

      normalized.push({
        symbol: symbolBase,
        type: normalizedType,
        decimals,
        scanAmount,
      });
      symbols.add(symbolBase);
    }

    return normalized;
  }

  sanitizeProviders(providers, config) {
    if (!Array.isArray(providers)) {
      return config.providers;
    }

    return ensureRequiredProviders(providers);
  }

  async applyConfigPatch(patch, { persist = true, log = true, skipReady = false } = {}) {
    if (!skipReady) {
      await this.ready();
    }

    const current = cloneConfig(this.state.config);
    const next = cloneConfig(current);
    const networkChanged = patch.network != null && normalizeNetwork(patch.network) !== current.network;

    if (patch.network != null) {
      const network = normalizeNetwork(patch.network);
      next.network = network;

      if (!Array.isArray(patch.tokens)) {
        next.tokens = defaultTokensForNetwork(network);
      }
    }

    next.dryRun = parseBoolean(patch.dryRun, next.dryRun);
    next.liveTradingEnabled = parseBoolean(patch.liveTradingEnabled, next.liveTradingEnabled);
    next.autoExecute = parseBoolean(patch.autoExecute, next.autoExecute);
    next.backrunOnly = parseBoolean(patch.backrunOnly, next.backrunOnly);
    next.confirmedFlowEnabled = parseBoolean(patch.confirmedFlowEnabled, next.confirmedFlowEnabled);
    next.dualLaneEnabled = parseBoolean(patch.dualLaneEnabled, next.dualLaneEnabled);
    next.unwindEnabled = parseBoolean(patch.unwindEnabled, next.unwindEnabled);
    next.adaptiveEnabled = parseBoolean(patch.adaptiveEnabled, next.adaptiveEnabled);
    next.dualRequoteEnabled = parseBoolean(patch.dualRequoteEnabled, next.dualRequoteEnabled);
    next.realizedSizingEnabled = parseBoolean(patch.realizedSizingEnabled, next.realizedSizingEnabled);
    next.preflightDryRunEnabled = parseBoolean(patch.preflightDryRunEnabled, next.preflightDryRunEnabled);

    next.cycleIntervalMs = Math.round(
      parseNumber(patch.cycleIntervalMs, next.cycleIntervalMs, {
        min: 3000,
        max: 300000,
      }),
    );

    next.minProfitBps = parseNumber(patch.minProfitBps, next.minProfitBps, {
      min: 0,
      max: 5000,
    });

    next.slippageBps = parseNumber(patch.slippageBps, next.slippageBps, {
      min: 1,
      max: 1000,
    });

    next.maxDepth = Math.round(
      parseNumber(patch.maxDepth, next.maxDepth, {
        min: 1,
        max: 5,
      }),
    );

    next.maxQuoteConcurrency = Math.round(
      parseNumber(patch.maxQuoteConcurrency, next.maxQuoteConcurrency, {
        min: 1,
        max: 16,
      }),
    );

    next.tokenUniverseTarget = clampInteger(patch.tokenUniverseTarget, next.tokenUniverseTarget, {
      min: TOKEN_UNIVERSE_MIN,
      max: TOKEN_UNIVERSE_MAX,
    });

    next.maxPairCandidates = clampInteger(patch.maxPairCandidates, next.maxPairCandidates, {
      min: PAIR_CANDIDATE_MIN,
      max: PAIR_CANDIDATE_MAX,
    });

    next.backrunConfirmations = clampInteger(patch.backrunConfirmations, next.backrunConfirmations, {
      min: BACKRUN_CONFIRMATIONS_MIN,
      max: BACKRUN_CONFIRMATIONS_MAX,
    });

    next.backrunWaitTimeoutMs = clampInteger(patch.backrunWaitTimeoutMs, next.backrunWaitTimeoutMs, {
      min: BACKRUN_WAIT_TIMEOUT_MIN,
      max: BACKRUN_WAIT_TIMEOUT_MAX,
    });

    next.confirmedFlowLookbackCheckpoints = clampInteger(
      patch.confirmedFlowLookbackCheckpoints,
      next.confirmedFlowLookbackCheckpoints,
      {
        min: CONFIRMED_FLOW_LOOKBACK_MIN,
        max: CONFIRMED_FLOW_LOOKBACK_MAX,
      },
    );

    next.confirmedFlowMaxTxPerCheckpoint = clampInteger(
      patch.confirmedFlowMaxTxPerCheckpoint,
      next.confirmedFlowMaxTxPerCheckpoint,
      {
        min: CONFIRMED_FLOW_MAX_TX_MIN,
        max: CONFIRMED_FLOW_MAX_TX_MAX,
      },
    );

    next.confirmedFlowCooldownMs = clampInteger(patch.confirmedFlowCooldownMs, next.confirmedFlowCooldownMs, {
      min: CONFIRMED_FLOW_COOLDOWN_MIN,
      max: CONFIRMED_FLOW_COOLDOWN_MAX,
    });

    next.confirmedFlowPollIntervalMs = clampInteger(
      patch.confirmedFlowPollIntervalMs,
      next.confirmedFlowPollIntervalMs,
      {
        min: CONFIRMED_FLOW_POLL_MIN,
        max: CONFIRMED_FLOW_POLL_MAX,
      },
    );

    next.fastLaneIntervalMs = clampInteger(patch.fastLaneIntervalMs, next.fastLaneIntervalMs, {
      min: FAST_LANE_INTERVAL_MIN,
      max: FAST_LANE_INTERVAL_MAX,
    });

    next.slowLaneIntervalMs = clampInteger(patch.slowLaneIntervalMs, next.slowLaneIntervalMs, {
      min: SLOW_LANE_INTERVAL_MIN,
      max: SLOW_LANE_INTERVAL_MAX,
    });

    next.fastLaneTokenUniverseTarget = clampInteger(
      patch.fastLaneTokenUniverseTarget,
      next.fastLaneTokenUniverseTarget,
      {
        min: TOKEN_UNIVERSE_MIN,
        max: TOKEN_UNIVERSE_MAX,
      },
    );

    next.slowLaneTokenUniverseTarget = clampInteger(
      patch.slowLaneTokenUniverseTarget,
      next.slowLaneTokenUniverseTarget,
      {
        min: TOKEN_UNIVERSE_MIN,
        max: TOKEN_UNIVERSE_MAX,
      },
    );

    next.fastLaneMaxPairCandidates = clampInteger(
      patch.fastLaneMaxPairCandidates,
      next.fastLaneMaxPairCandidates,
      {
        min: PAIR_CANDIDATE_MIN,
        max: PAIR_CANDIDATE_MAX,
      },
    );

    next.slowLaneMaxPairCandidates = clampInteger(
      patch.slowLaneMaxPairCandidates,
      next.slowLaneMaxPairCandidates,
      {
        min: PAIR_CANDIDATE_MIN,
        max: PAIR_CANDIDATE_MAX,
      },
    );

    next.fastLaneMaxQuoteConcurrency = clampInteger(
      patch.fastLaneMaxQuoteConcurrency,
      next.fastLaneMaxQuoteConcurrency,
      {
        min: 1,
        max: 16,
      },
    );

    next.slowLaneMaxQuoteConcurrency = clampInteger(
      patch.slowLaneMaxQuoteConcurrency,
      next.slowLaneMaxQuoteConcurrency,
      {
        min: 1,
        max: 16,
      },
    );

    next.unwindMaxHoldMs = clampInteger(patch.unwindMaxHoldMs, next.unwindMaxHoldMs, {
      min: UNWIND_MAX_HOLD_MIN,
      max: UNWIND_MAX_HOLD_MAX,
    });

    next.unwindStopLossBps = clampInteger(patch.unwindStopLossBps, next.unwindStopLossBps, {
      min: UNWIND_STOP_LOSS_MIN,
      max: UNWIND_STOP_LOSS_MAX,
    });

    next.adaptiveLearningRate = clampFloat(patch.adaptiveLearningRate, next.adaptiveLearningRate, {
      min: ADAPTIVE_LEARNING_RATE_MIN,
      max: ADAPTIVE_LEARNING_RATE_MAX,
    });

    next.priorityGasMultiplier = clampFloat(patch.priorityGasMultiplier, next.priorityGasMultiplier, {
      min: PRIORITY_GAS_MULTIPLIER_MIN,
      max: PRIORITY_GAS_MULTIPLIER_MAX,
    });

    next.gasBudgetMultiplier = clampFloat(patch.gasBudgetMultiplier, next.gasBudgetMultiplier, {
      min: GAS_BUDGET_MULTIPLIER_MIN,
      max: GAS_BUDGET_MULTIPLIER_MAX,
    });

    next.dualRequoteGapMs = clampInteger(patch.dualRequoteGapMs, next.dualRequoteGapMs, {
      min: DUAL_REQUOTE_GAP_MIN_MS,
      max: DUAL_REQUOTE_GAP_MAX_MS,
    });

    next.dualRequoteMaxDriftBps = clampInteger(patch.dualRequoteMaxDriftBps, next.dualRequoteMaxDriftBps, {
      min: DUAL_REQUOTE_MAX_DRIFT_MIN_BPS,
      max: DUAL_REQUOTE_MAX_DRIFT_MAX_BPS,
    });

    next.toxicRouteStrikeThreshold = clampInteger(patch.toxicRouteStrikeThreshold, next.toxicRouteStrikeThreshold, {
      min: TOXIC_STRIKE_THRESHOLD_MIN,
      max: TOXIC_STRIKE_THRESHOLD_MAX,
    });

    next.toxicRouteCooldownMs = clampInteger(patch.toxicRouteCooldownMs, next.toxicRouteCooldownMs, {
      min: TOXIC_ROUTE_COOLDOWN_MIN_MS,
      max: TOXIC_ROUTE_COOLDOWN_MAX_MS,
    });

    next.toxicTokenStrikeThreshold = clampInteger(patch.toxicTokenStrikeThreshold, next.toxicTokenStrikeThreshold, {
      min: TOXIC_STRIKE_THRESHOLD_MIN,
      max: TOXIC_STRIKE_THRESHOLD_MAX,
    });

    next.toxicTokenCooldownMs = clampInteger(patch.toxicTokenCooldownMs, next.toxicTokenCooldownMs, {
      min: TOXIC_TOKEN_COOLDOWN_MIN_MS,
      max: TOXIC_TOKEN_COOLDOWN_MAX_MS,
    });

    next.realizedSizingAlpha = clampFloat(patch.realizedSizingAlpha, next.realizedSizingAlpha, {
      min: REALIZED_SIZING_ALPHA_MIN,
      max: REALIZED_SIZING_ALPHA_MAX,
    });

    next.realizedSizingWinRateAlpha = clampFloat(patch.realizedSizingWinRateAlpha, next.realizedSizingWinRateAlpha, {
      min: REALIZED_SIZING_ALPHA_MIN,
      max: REALIZED_SIZING_ALPHA_MAX,
    });

    next.realizedSizingTargetWinRate = clampFloat(patch.realizedSizingTargetWinRate, next.realizedSizingTargetWinRate, {
      min: REALIZED_SIZING_TARGET_WINRATE_MIN,
      max: REALIZED_SIZING_TARGET_WINRATE_MAX,
    });

    if (patch.tradeAmountSui != null) {
      const tradeAmountSui = String(patch.tradeAmountSui).trim();
      if (tradeAmountSui && Number(tradeAmountSui) > 0) {
        next.tradeAmountSui = tradeAmountSui;
      }
    }

    if (patch.unwindMinSuiOut != null) {
      const unwindMinSuiOut = String(patch.unwindMinSuiOut).trim();
      if (unwindMinSuiOut && Number(unwindMinSuiOut) > 0) {
        next.unwindMinSuiOut = unwindMinSuiOut;
      }
    }

    if (patch.minProfitSui != null) {
      const minProfitSui = String(patch.minProfitSui).trim();
      if (minProfitSui && Number(minProfitSui) > 0) {
        next.minProfitSui = minProfitSui;
      }
    }

    if (patch.realizedSizingMinDeltaSui != null) {
      const realizedSizingMinDeltaSui = String(patch.realizedSizingMinDeltaSui).trim();
      if (realizedSizingMinDeltaSui && Number(realizedSizingMinDeltaSui) > 0) {
        next.realizedSizingMinDeltaSui = realizedSizingMinDeltaSui;
      }
    }

    if (patch.confirmedFlowMinNotionalSui != null) {
      const confirmedFlowMinNotionalSui = String(patch.confirmedFlowMinNotionalSui).trim();
      if (confirmedFlowMinNotionalSui && Number(confirmedFlowMinNotionalSui) > 0) {
        next.confirmedFlowMinNotionalSui = confirmedFlowMinNotionalSui;
      }
    }

    next.maxRouteDeviationBps = clampInteger(patch.maxRouteDeviationBps, next.maxRouteDeviationBps, {
      min: MAX_ROUTE_DEVIATION_BPS_MIN,
      max: MAX_ROUTE_DEVIATION_BPS_MAX,
    });

    if (patch.providers != null) {
      next.providers = this.sanitizeProviders(patch.providers, next);
    }

    if (patch.tokens != null) {
      next.tokens = this.sanitizeTokens(patch.tokens, next);
    }

    if (!Array.isArray(next.providers) || next.providers.length === 0) {
      next.providers = ensureRequiredProviders(next.providers || []);
    } else {
      next.providers = ensureRequiredProviders(next.providers);
    }

    this.state.config = next;
    if (networkChanged) {
      this.resetEquityTracking({
        reason: `network-changed:${current.network}->${next.network}`,
        log: false,
      });
      this.runtime.reactor.lastCheckedCheckpoint = null;
      this.runtime.reactor.lastCheckedAt = null;
      this.runtime.reactor.lastSignal = null;
      this.runtime.reactor.lastSignalAt = null;
      this.runtime.reactor.pendingImmediate = false;
      this.runtime.rpc.writeCooldownUntil = null;
      this.runtime.rpc.lastRateLimitAt = null;
      this.runtime.rpc.lastRateLimitReason = null;
      this.runtime.rpc.deferred.equityRetryAt = null;
      this.runtime.rpc.deferred.unwindRetryAt = null;
      this.runtime.safety.pauseLiveUntil = null;
      this.runtime.safety.pauseReason = null;
      this.runtime.safety.lastGuard = null;
      this.runtime.routeHealth = {
        routes: {},
        tokens: {},
        lastBlockedAt: null,
        lastBlockedReason: null,
        lastBlockedRoute: null,
      };
      this.runtime.sizing = defaultSizingRuntimeState();

      if (!skipReady && this.state.wallet?.address) {
        try {
          await this.captureWalletEquitySnapshot({
            network: next.network,
            source: "network-change",
            persist: false,
          });
        } catch (error) {
          this.log("equity-error", "Failed to sample SUI balance after network change", {
            message: error instanceof Error ? error.message : String(error),
            network: next.network,
          });
        }
      }
    }

    if (persist) {
      await this.persistState();
    }

    if (log) {
      if (networkChanged) {
        this.log("equity", "Reset SUI balance history after network change", {
          from: current.network,
          to: next.network,
        });
      }
      this.log("config", "Updated local MEV configuration");
    }

    if (this.runtime.enabled) {
      if (next.dualLaneEnabled) {
        this.scheduleLaneRun("fast", 50);
        this.scheduleLaneRun("slow", 100);
      } else {
        this.clearLaneTimer("fast");
        this.scheduleLaneRun("slow", 50);
      }

      if (next.confirmedFlowEnabled) {
        this.scheduleReactorPoll(50);
      } else {
        this.clearReactorPoll();
      }
    }

    return cloneConfig(next);
  }

  extractRegistryTokenEntry(objectData, tradeAmountSui, usedTypes, usedSymbols) {
    const valueFields = objectData?.data?.content?.fields?.value?.fields;
    const nameFields = objectData?.data?.content?.fields?.name?.fields;

    const typeName = normalizeTypeName(valueFields?.coin_type?.fields?.name || nameFields?.name || "");
    if (!typeName || usedTypes.has(typeName)) {
      return null;
    }

    const decimalsRaw = Number(valueFields?.decimals);
    if (!Number.isInteger(decimalsRaw) || decimalsRaw < 0 || decimalsRaw > 18) {
      return null;
    }

    const baseSymbol = String(valueFields?.symbol || typeName.split("::").at(-1) || "")
      .trim()
      .toUpperCase();
    if (!baseSymbol) {
      return null;
    }

    let symbol = baseSymbol;
    let suffix = 2;
    while (usedSymbols.has(symbol)) {
      symbol = `${baseSymbol}_${suffix}`;
      suffix += 1;
    }

    usedTypes.add(typeName);
    usedSymbols.add(symbol);

    return {
      symbol,
      type: typeName,
      decimals: decimalsRaw,
      scanAmount: symbol === "SUI" ? String(tradeAmountSui || "1") : "1",
      source: "registry",
    };
  }

  async loadRegistryTokenCatalog(network, tradeAmountSui) {
    const normalizedNetwork = normalizeNetwork(network);
    const handle = CETUS_COIN_LIST_HANDLE_BY_NETWORK[normalizedNetwork];
    if (!handle) {
      return [];
    }

    const now = Date.now();
    const cache = this.tokenUniverseCache.get(normalizedNetwork);
    if (cache && now - cache.ts < TOKEN_UNIVERSE_CACHE_TTL_MS) {
      return cache.tokens.map((token) => ({
        ...token,
        scanAmount: token.symbol === "SUI" ? String(tradeAmountSui || "1") : token.scanAmount,
      }));
    }

    const client = this.getSuiClient(normalizedNetwork);
    const dynamicObjectIds = [];

    let cursor = null;
    for (let pageCount = 0; pageCount < 25; pageCount += 1) {
      const page = await client.getDynamicFields({ parentId: handle, cursor, limit: 50 });
      for (const field of page.data || []) {
        if (field?.objectId) {
          dynamicObjectIds.push(field.objectId);
        }
      }

      if (!page.hasNextPage || !page.nextCursor || dynamicObjectIds.length >= 1200) {
        break;
      }

      cursor = page.nextCursor;
    }

    if (dynamicObjectIds.length === 0) {
      return [];
    }

    const tokens = [];
    const usedTypes = new Set();
    const usedSymbols = new Set();

    for (let i = 0; i < dynamicObjectIds.length; i += 50) {
      const ids = dynamicObjectIds.slice(i, i + 50);
      const objects = await client.multiGetObjects({
        ids,
        options: { showContent: true, showType: true },
      });

      for (const objectData of objects) {
        const token = this.extractRegistryTokenEntry(objectData, tradeAmountSui, usedTypes, usedSymbols);
        if (token) {
          tokens.push(token);
        }
      }

      if (tokens.length >= TOKEN_UNIVERSE_MAX * 4) {
        break;
      }
    }

    this.tokenUniverseCache.set(normalizedNetwork, {
      ts: now,
      tokens: tokens.map((token) => ({ ...token })),
    });

    return tokens;
  }

  selectTokenUniverse(config, catalogTokens) {
    const desiredSize = clampInteger(config.tokenUniverseTarget, DEFAULT_CONFIG.tokenUniverseTarget, {
      min: TOKEN_UNIVERSE_MIN,
      max: TOKEN_UNIVERSE_MAX,
    });

    const prioritySymbols = ["SUI", "USDC", "USDT", "WETH", "WBTC", "CETUS", "AUSD"];
    const selected = [];
    const usedTypes = new Set();

    for (const symbol of prioritySymbols) {
      const candidate = catalogTokens.find((token) => token.symbol === symbol);
      if (candidate && !usedTypes.has(candidate.type)) {
        selected.push(candidate);
        usedTypes.add(candidate.type);
      }
    }

    const sortedCatalog = [...catalogTokens].sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const token of sortedCatalog) {
      if (usedTypes.has(token.type)) {
        continue;
      }
      selected.push(token);
      usedTypes.add(token.type);
      if (selected.length >= desiredSize) {
        break;
      }
    }

    return selected.slice(0, desiredSize);
  }

  async resolveTokenInputs(config) {
    const manualTokens = Array.isArray(config.tokens) ? config.tokens.map((token) => ({ ...token })) : [];
    const desiredSize = clampInteger(config.tokenUniverseTarget, DEFAULT_CONFIG.tokenUniverseTarget, {
      min: TOKEN_UNIVERSE_MIN,
      max: TOKEN_UNIVERSE_MAX,
    });

    if (config.network === "mainnet" || config.network === "testnet") {
      try {
        const catalogTokens = await this.loadRegistryTokenCatalog(config.network, config.tradeAmountSui);
        if (manualTokens.length > 0) {
          const merged = [...manualTokens];
          const usedTypes = new Set(manualTokens.map((token) => normalizeTypeName(token.type || token.coinType)));
          const usedSymbols = new Set(
            manualTokens.map((token) => String(token.symbol || "").trim().toUpperCase()).filter(Boolean),
          );

          for (const token of this.selectTokenUniverse(config, catalogTokens)) {
            const normalizedType = normalizeTypeName(token.type);
            const symbol = String(token.symbol || "").trim().toUpperCase();
            if (!normalizedType || !symbol || usedTypes.has(normalizedType) || usedSymbols.has(symbol)) {
              continue;
            }
            merged.push(token);
            usedTypes.add(normalizedType);
            usedSymbols.add(symbol);
            if (merged.length >= desiredSize) {
              break;
            }
          }

          if (merged.length > 0) {
            return merged;
          }
        } else {
          const selected = this.selectTokenUniverse(config, catalogTokens);
          if (selected.length > 0) {
            return selected;
          }
        }
      } catch (error) {
        this.log("token", "Registry token discovery failed; falling back to defaults", {
          network: config.network,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (manualTokens.length > 0) {
      return manualTokens;
    }

    return fallbackTokensForNetwork(config.network);
  }

  async fetchTokenMetadata(network, tokenType) {
    const cacheKey = `${network}:${tokenType}`;
    const cached = this.tokenMetadataCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.ts < TOKEN_METADATA_CACHE_TTL_MS) {
      return cached.value;
    }

    const client = this.getSuiClient(network);
    let value = null;

    try {
      value = await client.getCoinMetadata({ coinType: tokenType });
    } catch {
      value = null;
    }

    this.tokenMetadataCache.set(cacheKey, { ts: now, value });
    return value;
  }

  async resolveActiveTokens(config) {
    const active = [];
    const tokenInputs = await this.resolveTokenInputs(config);
    const seenSymbols = new Set();
    const seenTypes = new Set();

    for (const token of tokenInputs) {
      const type = normalizeTypeName(token.type || token.coinType);
      if (!type || seenTypes.has(type)) {
        continue;
      }

      let metadata = null;
      let decimals = Number(token.decimals);
      let symbol = String(token.symbol || "").trim().toUpperCase();

      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || !symbol) {
        metadata = await this.fetchTokenMetadata(config.network, type);
        if (!metadata) {
          this.log("token", `Skipping ${token.symbol || type}: metadata not found`, { type });
          continue;
        }
      }

      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
        decimals = Number(metadata?.decimals ?? 0);
      }
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
        this.log("token", `Skipping ${token.symbol || type}: invalid decimals`, { decimals });
        continue;
      }

      if (!symbol) {
        symbol = String(metadata?.symbol || type.split("::").at(-1) || "").toUpperCase();
      }
      if (!symbol || seenSymbols.has(symbol)) {
        continue;
      }

      const scanAmount = token.scanAmount || (symbol === "SUI" ? config.tradeAmountSui : "1");
      let scanAmountAtomic;
      try {
        scanAmountAtomic = toAtomicUnits(scanAmount, decimals);
      } catch {
        this.log("token", `Skipping ${symbol}: invalid scan amount`, { scanAmount });
        continue;
      }

      if (scanAmountAtomic <= 0n) {
        continue;
      }

      active.push({
        symbol,
        type,
        decimals,
        scanAmount,
        scanAmountAtomic,
        metadata: metadata || null,
      });

      seenSymbols.add(symbol);
      seenTypes.add(type);
    }

    return active;
  }

  buildLaneScanConfig(baseConfig, lane = "slow") {
    const config = cloneConfig(baseConfig);
    if (!config.dualLaneEnabled || (lane !== "fast" && lane !== "slow")) {
      return config;
    }

    if (lane === "fast") {
      config.tokenUniverseTarget = clampInteger(
        config.fastLaneTokenUniverseTarget,
        config.tokenUniverseTarget,
        {
          min: TOKEN_UNIVERSE_MIN,
          max: TOKEN_UNIVERSE_MAX,
        },
      );
      config.maxPairCandidates = clampInteger(
        config.fastLaneMaxPairCandidates,
        config.maxPairCandidates,
        {
          min: PAIR_CANDIDATE_MIN,
          max: PAIR_CANDIDATE_MAX,
        },
      );
      config.maxQuoteConcurrency = clampInteger(
        config.fastLaneMaxQuoteConcurrency,
        config.maxQuoteConcurrency,
        {
          min: 1,
          max: 16,
        },
      );
      return config;
    }

    config.tokenUniverseTarget = clampInteger(
      config.slowLaneTokenUniverseTarget,
      config.tokenUniverseTarget,
      {
        min: TOKEN_UNIVERSE_MIN,
        max: TOKEN_UNIVERSE_MAX,
      },
    );
    config.maxPairCandidates = clampInteger(
      config.slowLaneMaxPairCandidates,
      config.maxPairCandidates,
      {
        min: PAIR_CANDIDATE_MIN,
        max: PAIR_CANDIDATE_MAX,
      },
    );
    config.maxQuoteConcurrency = clampInteger(
      config.slowLaneMaxQuoteConcurrency,
      config.maxQuoteConcurrency,
      {
        min: 1,
        max: 16,
      },
    );

    return config;
  }

  async quotePair({ aggregator, fromToken, toToken, amountInAtomic, config, fromIndex, toIndex }) {
    try {
      const route = await aggregator.findRouters({
        from: fromToken.type,
        target: toToken.type,
        amount: new BN(amountInAtomic.toString()),
        byAmountIn: true,
        depth: config.maxDepth,
        providers: config.providers,
      });

      if (!route || route.insufficientLiquidity || route.error || !route.amountOut || route.amountOut.isZero()) {
        return null;
      }

      const amountOutAtomic = BigInt(route.amountOut.toString());
      if (amountOutAtomic <= 0n) {
        return null;
      }

      const rate = normalizedRate(amountInAtomic, fromToken.decimals, amountOutAtomic, toToken.decimals);
      if (!Number.isFinite(rate) || rate <= 0) {
        return null;
      }

      const routeDeviationBps = normalizeDeviationToBps(route.deviationRatio);

      return {
        from: fromIndex,
        to: toIndex,
        fromSymbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        fromType: fromToken.type,
        toType: toToken.type,
        amountInAtomic,
        amountOutAtomic,
        amountIn: fromAtomicUnits(amountInAtomic, fromToken.decimals),
        amountOut: fromAtomicUnits(amountOutAtomic, toToken.decimals),
        rate,
        weight: -Math.log(rate),
        route,
        routeDeviationBps,
        providers: [...new Set(route.paths.map((path) => String(path.provider || "").toUpperCase()))],
      };
    } catch (error) {
      this.log("quote-error", `Quote failed ${fromToken.symbol}->${toToken.symbol}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  buildPairTasks(tokens, config) {
    if (tokens.length < 3) {
      return { scanTokens: tokens, tasks: [] };
    }

    const maxPairs = clampInteger(config.maxPairCandidates, DEFAULT_CONFIG.maxPairCandidates, {
      min: PAIR_CANDIDATE_MIN,
      max: PAIR_CANDIDATE_MAX,
    });

    const maxWindowSize = Math.max(3, Math.floor((1 + Math.sqrt(1 + 4 * maxPairs)) / 2));
    const scanWindowSize = Math.min(tokens.length, maxWindowSize);

    const cursor = this.runtime.scanCursor || 0;
    const stride = Math.max(1, Math.floor(scanWindowSize / 2));
    const startIndex = tokens.length <= scanWindowSize ? 0 : (cursor * stride) % tokens.length;
    this.runtime.scanCursor = (cursor + 1) % Math.max(tokens.length, 1);

    const scanTokens = [];
    for (let i = 0; i < scanWindowSize; i += 1) {
      const index = (startIndex + i) % tokens.length;
      scanTokens.push(tokens[index]);
    }

    const hasSui = scanTokens.some((token) => token.symbol === "SUI");
    if (!hasSui) {
      const suiToken = tokens.find((token) => token.symbol === "SUI");
      if (suiToken) {
        scanTokens[0] = suiToken;
      }
    }

    const tasks = [];
    for (let i = 0; i < scanTokens.length; i += 1) {
      for (let j = 0; j < scanTokens.length; j += 1) {
        if (i === j) {
          continue;
        }

        tasks.push({
          fromToken: scanTokens[i],
          toToken: scanTokens[j],
          fromIndex: i,
          toIndex: j,
        });
      }
    }

    return {
      scanTokens,
      tasks: tasks.slice(0, maxPairs),
    };
  }

  detectBestTriangularCycle(tokens, edges) {
    if (tokens.length < 3 || edges.length < 3) {
      return null;
    }

    const bestEdgeByPair = new Map();
    for (const edge of edges) {
      const key = `${edge.from}>${edge.to}`;
      const current = bestEdgeByPair.get(key);
      if (!current || edge.rate > current.rate) {
        bestEdgeByPair.set(key, edge);
      }
    }

    let bestSui = null;
    for (let a = 0; a < tokens.length; a += 1) {
      for (let b = 0; b < tokens.length; b += 1) {
        if (a === b) {
          continue;
        }
        const ab = bestEdgeByPair.get(`${a}>${b}`);
        if (!ab) {
          continue;
        }

        for (let c = 0; c < tokens.length; c += 1) {
          if (c === a || c === b) {
            continue;
          }

          const bc = bestEdgeByPair.get(`${b}>${c}`);
          const ca = bestEdgeByPair.get(`${c}>${a}`);
          if (!bc || !ca) {
            continue;
          }

          const multiplier = ab.rate * bc.rate * ca.rate;
          if (!Number.isFinite(multiplier) || multiplier <= 0) {
            continue;
          }

          const candidate = {
            multiplier,
            hops: [ab, bc, ca],
          };

          const includesSui = tokens[a]?.symbol === "SUI" || tokens[b]?.symbol === "SUI" || tokens[c]?.symbol === "SUI";
          if (includesSui && (!bestSui || multiplier > bestSui.multiplier)) {
            bestSui = candidate;
          }
        }
      }
    }

    const best = bestSui;
    if (!best || best.multiplier <= 1) {
      return null;
    }

    let rotated = best.hops;
    const startAtSui = best.hops.findIndex((hop) => hop.fromSymbol === "SUI");
    if (startAtSui === -1) {
      return null;
    }
    if (startAtSui > 0) {
      rotated = [...best.hops.slice(startAtSui), ...best.hops.slice(0, startAtSui)];
    }

    const expectedProfitBps = (best.multiplier - 1) * 10_000;
    const tokenCycle = [rotated[0].fromSymbol, ...rotated.map((hop) => hop.toSymbol)];
    if (tokenCycle[tokenCycle.length - 1] !== "SUI") {
      return null;
    }

    return {
      detectedAt: new Date().toISOString(),
      cycle: tokenCycle,
      hops: rotated.map((hop) => ({
        fromSymbol: hop.fromSymbol,
        toSymbol: hop.toSymbol,
        fromType: hop.fromType,
        toType: hop.toType,
        amountIn: hop.amountIn,
        amountOut: hop.amountOut,
        amountInAtomic: hop.amountInAtomic.toString(),
        amountOutAtomic: hop.amountOutAtomic.toString(),
        providers: hop.providers,
        rate: hop.rate,
        routeDeviationBps: hop.routeDeviationBps ?? null,
      })),
      expectedMultiplier: best.multiplier,
      expectedProfitBps,
      startTokenSymbol: rotated[0].fromSymbol,
      startAmountAtomic: rotated[0].amountInAtomic.toString(),
      startAmount: rotated[0].amountIn,
    };
  }

  async validateOpportunityAtExecutionSize({ opportunity, config, tokenMap, startAmountAtomic }) {
    const walletAddress = this.state.wallet?.address || "0x0";
    const aggregator = this.createAggregatorClient(config.network, walletAddress, "read");
    const executionAmountAtomic = BigInt(startAmountAtomic || opportunity?.startAmountAtomic || "0");
    if (executionAmountAtomic <= 0n) {
      return {
        valid: false,
        reason: "invalid-start-amount",
      };
    }

    let currentAmountAtomic = executionAmountAtomic;
    let currentToken = opportunity.startTokenSymbol;
    let maxRouteDeviationBps = 0;
    const steps = [];

    for (const hop of opportunity.hops || []) {
      const fromToken = tokenMap.get(hop.fromSymbol);
      const toToken = tokenMap.get(hop.toSymbol);
      if (!fromToken || !toToken) {
        return {
          valid: false,
          reason: `missing-token-metadata:${hop.fromSymbol}->${hop.toSymbol}`,
        };
      }

      if (fromToken.symbol !== currentToken) {
        return {
          valid: false,
          reason: `sequence-mismatch:${currentToken}->${fromToken.symbol}`,
        };
      }

      const freshQuote = await this.quotePair({
        aggregator,
        fromToken,
        toToken,
        amountInAtomic: currentAmountAtomic,
        config,
        fromIndex: 0,
        toIndex: 0,
      });

      if (!freshQuote) {
        return {
          valid: false,
          reason: `missing-live-quote:${fromToken.symbol}->${toToken.symbol}`,
        };
      }

      const routeDeviationBps = Number(freshQuote.routeDeviationBps);
      if (Number.isFinite(routeDeviationBps)) {
        maxRouteDeviationBps = Math.max(maxRouteDeviationBps, routeDeviationBps);
      }

      steps.push({
        from: fromToken.symbol,
        to: toToken.symbol,
        amountInAtomic: currentAmountAtomic.toString(),
        amountOutAtomic: freshQuote.amountOutAtomic.toString(),
        providers: freshQuote.providers,
        routeDeviationBps: Number.isFinite(routeDeviationBps) ? routeDeviationBps : null,
      });

      currentAmountAtomic = freshQuote.amountOutAtomic;
      currentToken = toToken.symbol;
    }

    if (currentToken !== "SUI") {
      return {
        valid: false,
        reason: `not-settling-in-sui:${currentToken}`,
      };
    }

    const profitAtomic = currentAmountAtomic - executionAmountAtomic;
    const profitBps = Number((profitAtomic * 10_000n) / (executionAmountAtomic || 1n));
    const projectedProfitSui = Number(fromAtomicUnits(profitAtomic > 0n ? profitAtomic : 0n, 9));
    const maxAllowedDeviationBps = clampInteger(
      config.maxRouteDeviationBps,
      DEFAULT_CONFIG.maxRouteDeviationBps,
      {
        min: MAX_ROUTE_DEVIATION_BPS_MIN,
        max: MAX_ROUTE_DEVIATION_BPS_MAX,
      },
    );

    if (maxRouteDeviationBps > maxAllowedDeviationBps) {
      return {
        valid: false,
        reason: `route-deviation-too-high:${maxRouteDeviationBps.toFixed(2)}>${maxAllowedDeviationBps}`,
        maxRouteDeviationBps,
        maxAllowedDeviationBps,
        projectedProfitSui,
        profitBps,
        steps,
      };
    }

    return {
      valid: profitAtomic > 0n,
      reason: profitAtomic > 0n ? "ok" : "non-positive-requote-profit",
      finalAmountAtomic: currentAmountAtomic.toString(),
      profitAtomic: profitAtomic.toString(),
      profitBps,
      projectedProfitSui,
      maxRouteDeviationBps,
      maxAllowedDeviationBps,
      steps,
    };
  }

  buildAdaptiveSample({ trigger, result, durationMs }) {
    const scannedPairs = Number(result?.scannedPairs || 0);
    const executablePairs = Number(result?.executablePairs || 0);
    const coverage = scannedPairs > 0 ? executablePairs / scannedPairs : 0;
    const trade = result?.trade || null;
    const walletEquity = result?.walletEquity || null;
    const walletBalanceSui = Number(walletEquity?.balanceSui);
    const hasWalletBalance = Number.isFinite(walletBalanceSui) && walletBalanceSui >= 0;
    const walletDeltaSui = Number(walletEquity?.deltaSui);
    const tradeRealizedPnlSui = trade && trade.success && Number.isFinite(walletDeltaSui) ? walletDeltaSui : null;
    const sizingMultiplier = clampToRange(Number(this.runtime.sizing?.multiplier || 1), {
      min: REALIZED_SIZING_MULTIPLIER_MIN,
      max: REALIZED_SIZING_MULTIPLIER_MAX,
    });

    return {
      ts: new Date().toISOString(),
      trigger,
      durationMs: Number(durationMs || 0),
      error: String(result?.error || ""),
      hadOpportunity: Boolean(result?.opportunity),
      expectedProfitBps: Number(result?.opportunity?.expectedProfitBps || 0),
      scannedPairs,
      executablePairs,
      executableCoverage: coverage,
      scannedTokens: Number(result?.scannedTokens || 0),
      tokenUniverseSize: Number(result?.tokenUniverseSize || 0),
      tradeAttempted: Boolean(trade),
      tradeExecuted: Boolean(trade && trade.success),
      tradeProfitBps: Number(trade?.profitBps || 0),
      tradeRealizedPnlSui,
      sizingMultiplier,
      walletBalanceSui: hasWalletBalance ? walletBalanceSui : null,
      walletDeltaSui: Number(walletEquity?.deltaSui || 0),
      walletDeltaPct: Number(walletEquity?.deltaPct || 0),
      walletDrawdownPct: Number(walletEquity?.drawdownPct || 0),
      walletChangePct: Number(walletEquity?.changePct || 0),
    };
  }

  computeAdaptiveMetrics(history) {
    const samples = Array.isArray(history) ? history : [];
    const count = samples.length;
    if (count === 0) {
      return {
        sampleCount: 0,
        opportunityRate: 0,
        errorRate: 0,
        avgExpectedProfitBps: 0,
        avgExecutableCoverage: 0,
        tradeCount: 0,
        tradeSuccessRate: 0,
        avgTradeProfitBps: 0,
        tradeRealizedSampleCount: 0,
        tradeRealizedLossRate: 0,
        avgTradeWalletDeltaSui: 0,
        avgTradeRealizedPnlSui: 0,
        avgSizingMultiplier: 1,
        equitySampleCount: 0,
        equityGrowthPct: 0,
        equityDrawdownPct: 0,
        equityDownRate: 0,
        equityNegativeStreak: 0,
        equityLastBalanceSui: null,
      };
    }

    let opportunities = 0;
    let errors = 0;
    let expectedProfitTotal = 0;
    let coverageTotal = 0;
    let tradeCount = 0;
    let tradeSuccess = 0;
    let tradeProfitTotal = 0;
    let tradeRealizedSampleCount = 0;
    let tradeRealizedLossCount = 0;
    let tradeWalletDeltaTotal = 0;
    let tradeRealizedPnlTotal = 0;
    let sizingMultiplierTotal = 0;
    const equitySeries = [];

    for (const sample of samples) {
      if (sample.hadOpportunity) {
        opportunities += 1;
        expectedProfitTotal += Number(sample.expectedProfitBps || 0);
      }
      if (sample.error) {
        errors += 1;
      }
      coverageTotal += Number(sample.executableCoverage || 0);
      sizingMultiplierTotal += clampToRange(Number(sample.sizingMultiplier || 1), {
        min: REALIZED_SIZING_MULTIPLIER_MIN,
        max: REALIZED_SIZING_MULTIPLIER_MAX,
      });

      if (sample.tradeAttempted) {
        tradeCount += 1;
        if (sample.tradeExecuted) {
          tradeSuccess += 1;
        }
        tradeProfitTotal += Number(sample.tradeProfitBps || 0);

        const walletDeltaSui = Number(sample.walletDeltaSui);
        if (Number.isFinite(walletDeltaSui)) {
          tradeRealizedSampleCount += 1;
          tradeWalletDeltaTotal += walletDeltaSui;
          tradeRealizedPnlTotal += Number.isFinite(Number(sample.tradeRealizedPnlSui))
            ? Number(sample.tradeRealizedPnlSui)
            : walletDeltaSui;
          if (walletDeltaSui < -1e-6) {
            tradeRealizedLossCount += 1;
          }
        }
      }

      if (sample.walletBalanceSui != null) {
        const walletBalanceSui = Number(sample.walletBalanceSui);
        if (Number.isFinite(walletBalanceSui) && walletBalanceSui >= 0) {
          equitySeries.push(walletBalanceSui);
        }
      }
    }

    let equityGrowthPct = 0;
    let equityDrawdownPct = 0;
    let equityDownRate = 0;
    let equityNegativeStreak = 0;
    let equityLastBalanceSui = null;

    if (equitySeries.length > 0) {
      equityLastBalanceSui = equitySeries[equitySeries.length - 1];
    }

    if (equitySeries.length >= 2) {
      const first = equitySeries[0];
      const last = equitySeries[equitySeries.length - 1];
      const peak = equitySeries.reduce((acc, value) => Math.max(acc, value), first);
      equityGrowthPct = first > 0 ? (last - first) / first : 0;
      equityDrawdownPct = peak > 0 ? (peak - last) / peak : 0;

      let downMoves = 0;
      for (let i = 1; i < equitySeries.length; i += 1) {
        if (equitySeries[i] < equitySeries[i - 1] - 1e-12) {
          downMoves += 1;
        }
      }
      equityDownRate = downMoves / (equitySeries.length - 1);

      for (let i = equitySeries.length - 1; i > 0; i -= 1) {
        if (equitySeries[i] < equitySeries[i - 1] - 1e-12) {
          equityNegativeStreak += 1;
        } else {
          break;
        }
      }
    }

    return {
      sampleCount: count,
      opportunityRate: opportunities / count,
      errorRate: errors / count,
      avgExpectedProfitBps: opportunities > 0 ? expectedProfitTotal / opportunities : 0,
      avgExecutableCoverage: coverageTotal / count,
      tradeCount,
      tradeSuccessRate: tradeCount > 0 ? tradeSuccess / tradeCount : 0,
      avgTradeProfitBps: tradeCount > 0 ? tradeProfitTotal / tradeCount : 0,
      tradeRealizedSampleCount,
      tradeRealizedLossRate: tradeRealizedSampleCount > 0 ? tradeRealizedLossCount / tradeRealizedSampleCount : 0,
      avgTradeWalletDeltaSui: tradeRealizedSampleCount > 0 ? tradeWalletDeltaTotal / tradeRealizedSampleCount : 0,
      avgTradeRealizedPnlSui: tradeRealizedSampleCount > 0 ? tradeRealizedPnlTotal / tradeRealizedSampleCount : 0,
      avgSizingMultiplier: count > 0 ? sizingMultiplierTotal / count : 1,
      equitySampleCount: equitySeries.length,
      equityGrowthPct,
      equityDrawdownPct,
      equityDownRate,
      equityNegativeStreak,
      equityLastBalanceSui,
    };
  }

  evaluateExecutionGuard(config, opportunity, liveValidation = null) {
    const metrics = this.runtime.adaptive.lastMetrics || {};
    const equity = this.runtime.equity || {};
    const safety = this.runtime.safety;
    const now = Date.now();

    let pauseLiveUntilMs = null;
    if (safety.pauseLiveUntil) {
      const parsed = new Date(safety.pauseLiveUntil).getTime();
      if (Number.isFinite(parsed) && parsed > now) {
        pauseLiveUntilMs = parsed;
      } else {
        safety.pauseLiveUntil = null;
        safety.pauseReason = null;
      }
    }

    const liveProfitBps = Number(liveValidation?.profitBps);
    const expectedProfitBps = Number.isFinite(liveProfitBps) ? liveProfitBps : Number(opportunity?.expectedProfitBps || 0);
    const drawdownPct = Number(equity.drawdownPct || 0);
    const downStepRate = Number(equity.downStepRate || 0);
    const negativeStreak = Number(equity.negativeStreak || 0);
    const tradeCount = Number(metrics.tradeCount || 0);
    const tradeSuccessRate = Number(metrics.tradeSuccessRate || 0);
    const avgTradeProfitBps = Number(metrics.avgTradeProfitBps || 0);
    const realizedSamples = Number(metrics.tradeRealizedSampleCount || 0);
    const realizedLossRate = Number(metrics.tradeRealizedLossRate || 0);
    const avgTradeWalletDeltaSui = Number(metrics.avgTradeWalletDeltaSui || 0);

    const severeDrawdown = drawdownPct >= SAFETY_DRAWDOWN_HARD_STOP_PCT;
    const lossStreakPressure =
      negativeStreak >= SAFETY_NEGATIVE_STREAK_HARD_STOP &&
      realizedSamples >= 2 &&
      realizedLossRate >= 0.6 &&
      avgTradeWalletDeltaSui < 0;

    if (!config.dryRun && (severeDrawdown || lossStreakPressure)) {
      const reason = severeDrawdown ? "drawdown-guard" : "loss-streak-guard";
      const nextPauseUntilMs = now + SAFETY_PAUSE_MS;
      if (!pauseLiveUntilMs || nextPauseUntilMs > pauseLiveUntilMs) {
        pauseLiveUntilMs = nextPauseUntilMs;
        safety.pauseLiveUntil = new Date(nextPauseUntilMs).toISOString();
        safety.pauseReason = reason;
      }
    }

    const slippagePenalty = Number(config.slippageBps || DEFAULT_CONFIG.slippageBps) * 0.35;
    const drawdownPenalty = Math.max(0, drawdownPct * 10_000 * 0.35);
    const downRatePenalty = Math.max(0, downStepRate * 12);
    const weakTradePenalty = tradeCount >= 4 && tradeSuccessRate < 0.5 ? (0.5 - tradeSuccessRate) * 46 : 0;
    const negativeTradePenalty = tradeCount >= 3 && avgTradeProfitBps < 0 ? 16 : 0;
    const realizedPenalty =
      realizedSamples >= 2 && avgTradeWalletDeltaSui < 0
        ? Math.min(30, Math.abs(avgTradeWalletDeltaSui) * 1400 + 12)
        : 0;

    const dynamicBufferBps = Math.round(
      clampToRange(
        slippagePenalty + drawdownPenalty + downRatePenalty + weakTradePenalty + negativeTradePenalty + realizedPenalty,
        {
          min: SAFETY_MIN_EXECUTION_BUFFER_BPS,
          max: SAFETY_MAX_EXECUTION_BUFFER_BPS,
        },
      ),
    );
    const requiredProfitBps = Math.max(0, Number(config.minProfitBps || 0)) + dynamicBufferBps;

    let riskMultiplier = 1;
    riskMultiplier -= Math.min(0.6, Math.max(0, drawdownPct * 5.2));
    riskMultiplier -= Math.min(0.22, Math.max(0, downStepRate * 0.35));
    riskMultiplier -= Math.min(0.2, Math.max(0, negativeStreak * 0.05));
    if (tradeCount >= 4 && tradeSuccessRate < 0.5) {
      riskMultiplier -= 0.18;
    }
    if (tradeCount >= 4 && avgTradeProfitBps < 0) {
      riskMultiplier -= 0.14;
    }
    if (realizedSamples >= 2 && avgTradeWalletDeltaSui < 0) {
      riskMultiplier -= 0.22;
    }
    if (expectedProfitBps > requiredProfitBps * 1.8 && Number(metrics.errorRate || 0) < 0.15) {
      riskMultiplier += 0.08;
    }
    riskMultiplier = clampToRange(riskMultiplier, {
      min: SAFETY_MIN_TRADE_MULTIPLIER,
      max: SAFETY_MAX_TRADE_MULTIPLIER,
    });

    const sizingEnabled = parseBoolean(config.realizedSizingEnabled, DEFAULT_CONFIG.realizedSizingEnabled);
    const sizingMultiplier = sizingEnabled
      ? clampToRange(Number(this.runtime.sizing?.multiplier || 1), {
          min: REALIZED_SIZING_MULTIPLIER_MIN,
          max: REALIZED_SIZING_MULTIPLIER_MAX,
        })
      : 1;
    const effectiveTradeMultiplier = clampToRange(riskMultiplier * sizingMultiplier, {
      min: SAFETY_MIN_TRADE_MULTIPLIER,
      max: SAFETY_MAX_TRADE_MULTIPLIER,
    });

    const startAmountAtomic = BigInt(opportunity?.startAmountAtomic || "0");
    const startAmountSui = Number(fromAtomicUnits(startAmountAtomic > 0n ? startAmountAtomic : 0n, 9));
    const scaledMultiplierBps = BigInt(Math.round(effectiveTradeMultiplier * 10_000));
    let adjustedStartAmountAtomic = startAmountAtomic > 0n ? (startAmountAtomic * scaledMultiplierBps) / 10_000n : 0n;
    if (startAmountAtomic >= MIN_EXECUTION_START_SUI_ATOMIC && adjustedStartAmountAtomic < MIN_EXECUTION_START_SUI_ATOMIC) {
      adjustedStartAmountAtomic = MIN_EXECUTION_START_SUI_ATOMIC;
    }
    const adjustedStartAmountSui = Number(fromAtomicUnits(adjustedStartAmountAtomic > 0n ? adjustedStartAmountAtomic : 0n, 9));

    const liveProjectedProfitSui = Number(liveValidation?.projectedProfitSui);
    const projectedProfitSui = Number.isFinite(liveProjectedProfitSui)
      ? liveProjectedProfitSui
      : Number.isFinite(startAmountSui)
        ? (startAmountSui * expectedProfitBps) / 10_000
        : 0;
    const configuredMinProfitSui = clampFloat(config.minProfitSui, Number(DEFAULT_CONFIG.minProfitSui), {
      min: MIN_PROFIT_SUI_MIN,
      max: MIN_PROFIT_SUI_MAX,
    });
    const minProjectedProfitSui = Number.isFinite(startAmountSui)
      ? Math.max(configuredMinProfitSui, startAmountSui * 0.00035)
      : configuredMinProfitSui;
    const maxRouteDeviationBps = clampInteger(config.maxRouteDeviationBps, DEFAULT_CONFIG.maxRouteDeviationBps, {
      min: MAX_ROUTE_DEVIATION_BPS_MIN,
      max: MAX_ROUTE_DEVIATION_BPS_MAX,
    });
    const liveDeviationBps = Number(liveValidation?.maxRouteDeviationBps);
    const opportunityMaxDeviationBps = Number.isFinite(liveDeviationBps)
      ? liveDeviationBps
      : Math.max(
          0,
          ...(Array.isArray(opportunity?.hops)
            ? opportunity.hops
                .map((hop) => Number(hop.routeDeviationBps))
                .filter((value) => Number.isFinite(value) && value >= 0)
            : []),
        );

    const reasons = [];
    const profitContext = liveValidation ? "live requote edge" : "expected edge";
    if (!Number.isFinite(expectedProfitBps)) {
      reasons.push(`${profitContext} is not numeric`);
    } else if (expectedProfitBps <= 0) {
      reasons.push(`${profitContext} ${expectedProfitBps.toFixed(2)}bps is non-positive`);
    } else if (expectedProfitBps < requiredProfitBps) {
      reasons.push(`${profitContext} ${expectedProfitBps.toFixed(2)}bps below guarded threshold ${requiredProfitBps}bps`);
    }

    if (liveValidation && liveValidation.valid === false) {
      reasons.push(`live requote rejected (${liveValidation.reason || "validation-failed"})`);
    }

    if (startAmountAtomic > 0n && startAmountAtomic < MIN_EXECUTION_START_SUI_ATOMIC) {
      reasons.push("risk-adjusted size below minimum safe start size (0.05 SUI)");
    }

    if (expectedProfitBps > 0 && projectedProfitSui < minProjectedProfitSui) {
      reasons.push(`projected profit ${projectedProfitSui.toFixed(5)} SUI below fee/risk floor ${minProjectedProfitSui.toFixed(5)} SUI`);
    }

    if (opportunityMaxDeviationBps > maxRouteDeviationBps) {
      reasons.push(`route deviation ${opportunityMaxDeviationBps.toFixed(2)}bps exceeds ${maxRouteDeviationBps}bps cap`);
    }

    if (tradeCount >= 6 && tradeSuccessRate < 0.34) {
      reasons.push(`recent trade success rate too low (${(tradeSuccessRate * 100).toFixed(1)}%)`);
    }

    if (realizedSamples >= 3 && realizedLossRate >= 0.67) {
      reasons.push(`recent realized wallet deltas are mostly negative (${(realizedLossRate * 100).toFixed(0)}% loss rate)`);
    }

    if (!config.dryRun && pauseLiveUntilMs && pauseLiveUntilMs > now) {
      reasons.push(
        `live safety pause active until ${new Date(pauseLiveUntilMs).toISOString()} (${safety.pauseReason || "guard-triggered"})`,
      );
    }

    const guard = {
      ts: new Date().toISOString(),
      allowed: reasons.length === 0,
      reasons,
      expectedProfitBps,
      requiredProfitBps,
      dynamicBufferBps,
      projectedProfitSui,
      minProjectedProfitSui,
      configuredMinProfitSui,
      riskMultiplier,
      sizingMultiplier,
      effectiveTradeMultiplier,
      opportunityMaxDeviationBps,
      maxRouteDeviationBps,
      startAmountAtomic: startAmountAtomic.toString(),
      adjustedStartAmountAtomic: adjustedStartAmountAtomic.toString(),
      adjustedStartAmountSui: Number.isFinite(adjustedStartAmountSui) ? adjustedStartAmountSui : null,
      pauseLiveUntil: pauseLiveUntilMs ? new Date(pauseLiveUntilMs).toISOString() : null,
      pauseReason: safety.pauseReason || null,
    };

    safety.lastGuard = guard;
    return guard;
  }

  deriveAdaptiveConfigPatch(config, metrics) {
    const learningRate = clampToRange(config.adaptiveLearningRate || DEFAULT_CONFIG.adaptiveLearningRate, {
      min: ADAPTIVE_LEARNING_RATE_MIN,
      max: ADAPTIVE_LEARNING_RATE_MAX,
    });

    const patch = {};
    const reasons = [];

    const currentTradeSize = Number(config.tradeAmountSui) > 0 ? Number(config.tradeAmountSui) : 1;

    const setInt = (field, value, min, max) => {
      const next = Math.round(clampToRange(value, { min, max }));
      if (Number(config[field]) !== next) {
        patch[field] = next;
      }
    };

    const setFloatString = (field, value, min, max) => {
      const next = formatDecimalString(clampToRange(value, { min, max }), 4);
      if (String(config[field]) !== next) {
        patch[field] = next;
      }
    };

    const highError = metrics.errorRate >= 0.25;
    const lowOpportunity = metrics.opportunityRate <= 0.12;
    const lowCoverage = metrics.avgExecutableCoverage <= 0.28;
    const strongEdgeFlow =
      metrics.opportunityRate >= 0.4 &&
      metrics.avgExpectedProfitBps > config.minProfitBps * 1.5 &&
      metrics.errorRate < 0.12 &&
      metrics.tradeCount >= 4 &&
      metrics.tradeSuccessRate >= 0.6 &&
      metrics.avgTradeProfitBps > config.minProfitBps * 0.2 &&
      (metrics.tradeRealizedSampleCount < 2 || metrics.avgTradeWalletDeltaSui >= -0.0002);
    const equityStress =
      metrics.equitySampleCount >= 4 &&
      (metrics.equityDrawdownPct >= 0.008 ||
        (metrics.equityGrowthPct < -0.004 && metrics.equityDownRate >= 0.5) ||
        metrics.equityNegativeStreak >= 3);
    const equityStrong =
      metrics.equitySampleCount >= 5 &&
      metrics.equityGrowthPct > 0.01 &&
      metrics.equityDrawdownPct < 0.004 &&
      metrics.tradeSuccessRate >= 0.6;
    const realizedLossPressure =
      metrics.tradeRealizedSampleCount >= 2 &&
      (metrics.tradeRealizedLossRate >= 0.6 || metrics.avgTradeWalletDeltaSui < -0.0025);
    const profitTargetOutOfRange =
      metrics.tradeCount >= 3 &&
      metrics.avgTradeProfitBps > 0 &&
      config.minProfitBps > metrics.avgTradeProfitBps * 2.5;

    if (highError) {
      setInt("minProfitBps", config.minProfitBps + 12 * learningRate, 10, 5000);
      setInt("cycleIntervalMs", config.cycleIntervalMs + 2500 * learningRate, 3000, 300000);
      setInt("maxPairCandidates", config.maxPairCandidates - 35 * learningRate, PAIR_CANDIDATE_MIN, PAIR_CANDIDATE_MAX);
      setFloatString("tradeAmountSui", currentTradeSize * (1 - 0.2 * learningRate), 0.05, 20);
      reasons.push("high error rate");
    } else {
      if (lowOpportunity) {
        setInt("minProfitBps", config.minProfitBps - 6 * learningRate, 5, 5000);
        setInt("tokenUniverseTarget", config.tokenUniverseTarget + 8 * learningRate, TOKEN_UNIVERSE_MIN, TOKEN_UNIVERSE_MAX);
        setInt("maxPairCandidates", config.maxPairCandidates + 20 * learningRate, PAIR_CANDIDATE_MIN, PAIR_CANDIDATE_MAX);
        reasons.push("low opportunity rate");
      }

      if (lowCoverage) {
        setInt("slippageBps", config.slippageBps + 10 * learningRate, 1, 1000);
        setInt("maxDepth", config.maxDepth + 1, 1, 5);
        reasons.push("low executable coverage");
      }

      if (metrics.tradeCount >= 2) {
        if (metrics.avgTradeProfitBps < 0 || metrics.tradeSuccessRate < 0.5) {
          setFloatString("tradeAmountSui", currentTradeSize * (1 - 0.15 * learningRate), 0.05, 20);
          setInt("minProfitBps", config.minProfitBps + 5 * learningRate, 5, 5000);
          reasons.push("weak trade outcomes");
        } else if (metrics.avgTradeProfitBps > config.minProfitBps * 1.2 && metrics.tradeSuccessRate >= 0.75) {
          setFloatString("tradeAmountSui", currentTradeSize * (1 + 0.1 * learningRate), 0.05, 20);
          reasons.push("strong trade outcomes");
        }
      }

      if (profitTargetOutOfRange) {
        setInt("minProfitBps", metrics.avgTradeProfitBps * 1.6, 8, 5000);
        reasons.push("profit target normalized to realized fills");
      }

      if (realizedLossPressure) {
        setFloatString("tradeAmountSui", currentTradeSize * (1 - 0.3 * learningRate), 0.05, 20);
        setInt("minProfitBps", config.minProfitBps + 12 * learningRate, 8, 5000);
        setInt("cycleIntervalMs", config.cycleIntervalMs + 1800 * learningRate, 3000, 300000);
        setInt("slippageBps", config.slippageBps - 6 * learningRate, 1, 1000);
        reasons.push("realized wallet losses");
      }

      if (strongEdgeFlow) {
        setInt("minProfitBps", config.minProfitBps + 3 * learningRate, 5, 5000);
        reasons.push("strong edge flow");
      }
    }

    if (equityStress) {
      setFloatString("tradeAmountSui", currentTradeSize * (1 - 0.25 * learningRate), 0.05, 20);
      setInt("minProfitBps", config.minProfitBps + 8 * learningRate, 5, 5000);
      setInt("cycleIntervalMs", config.cycleIntervalMs + 3000 * learningRate, 3000, 300000);
      setInt("unwindStopLossBps", config.unwindStopLossBps - 20 * learningRate, UNWIND_STOP_LOSS_MIN, UNWIND_STOP_LOSS_MAX);
      setInt("unwindMaxHoldMs", config.unwindMaxHoldMs - 9000 * learningRate, UNWIND_MAX_HOLD_MIN, UNWIND_MAX_HOLD_MAX);
      reasons.push("equity drawdown pressure");
    } else if (!highError && !realizedLossPressure && equityStrong) {
      setFloatString("tradeAmountSui", currentTradeSize * (1 + 0.08 * learningRate), 0.05, 20);
      setInt("cycleIntervalMs", config.cycleIntervalMs - 1200 * learningRate, 3000, 300000);
      reasons.push("equity growth trend");
    }

    return {
      patch,
      reasons,
      learningRate,
    };
  }

  async observeAndAdapt({ config, trigger, result, durationMs }) {
    try {
      const sample = this.buildAdaptiveSample({ trigger, result, durationMs });
      const adaptive = this.runtime.adaptive;

      adaptive.history.push(sample);
      if (adaptive.history.length > ADAPTIVE_HISTORY_MAX) {
        adaptive.history.splice(0, adaptive.history.length - ADAPTIVE_HISTORY_MAX);
      }

      this.state.learning.history = [...adaptive.history];

      const metrics = this.computeAdaptiveMetrics(adaptive.history);
      adaptive.lastMetrics = metrics;

      if (!config.adaptiveEnabled) {
        adaptive.lastDecision = {
          ts: new Date().toISOString(),
          status: "disabled",
          reason: "adaptive mode disabled",
        };
        if (adaptive.history.length % 5 === 0) {
          await this.persistState({ context: "adaptive-disabled", fatal: false });
        }
        return;
      }

      if (metrics.sampleCount < ADAPTIVE_MIN_SAMPLES) {
        adaptive.lastDecision = {
          ts: new Date().toISOString(),
          status: "waiting",
          reason: `collecting samples (${metrics.sampleCount}/${ADAPTIVE_MIN_SAMPLES})`,
        };
        if (adaptive.history.length % 5 === 0) {
          await this.persistState({ context: "adaptive-waiting", fatal: false });
        }
        return;
      }

      const now = Date.now();
      if (adaptive.lastAdjustedAt && now - new Date(adaptive.lastAdjustedAt).getTime() < ADAPTIVE_COOLDOWN_MS) {
        adaptive.lastDecision = {
          ts: new Date().toISOString(),
          status: "cooldown",
          reason: "adaptive cooldown active",
        };
        if (adaptive.history.length % 5 === 0) {
          await this.persistState({ context: "adaptive-cooldown", fatal: false });
        }
        return;
      }

      const decision = this.deriveAdaptiveConfigPatch(config, metrics);
      if (Object.keys(decision.patch).length === 0) {
        adaptive.lastDecision = {
          ts: new Date().toISOString(),
          status: "steady",
          reason: "no adaptive config changes needed",
        };
        if (adaptive.history.length % 5 === 0) {
          await this.persistState({ context: "adaptive-steady", fatal: false });
        }
        return;
      }

      const before = {
        minProfitBps: config.minProfitBps,
        slippageBps: config.slippageBps,
        maxDepth: config.maxDepth,
        cycleIntervalMs: config.cycleIntervalMs,
        tokenUniverseTarget: config.tokenUniverseTarget,
        maxPairCandidates: config.maxPairCandidates,
        tradeAmountSui: config.tradeAmountSui,
        unwindStopLossBps: config.unwindStopLossBps,
        unwindMaxHoldMs: config.unwindMaxHoldMs,
      };

      const updatedConfig = await this.applyConfigPatch(decision.patch, {
        // Keep adaptive loop non-blocking when persistence is degraded (ENOSPC/backoff).
        persist: false,
        log: false,
        skipReady: true,
      });

      const after = {
        minProfitBps: updatedConfig.minProfitBps,
        slippageBps: updatedConfig.slippageBps,
        maxDepth: updatedConfig.maxDepth,
        cycleIntervalMs: updatedConfig.cycleIntervalMs,
        tokenUniverseTarget: updatedConfig.tokenUniverseTarget,
        maxPairCandidates: updatedConfig.maxPairCandidates,
        tradeAmountSui: updatedConfig.tradeAmountSui,
        unwindStopLossBps: updatedConfig.unwindStopLossBps,
        unwindMaxHoldMs: updatedConfig.unwindMaxHoldMs,
      };

      const adjustment = {
        ts: new Date().toISOString(),
        trigger,
        reasons: decision.reasons,
        learningRate: decision.learningRate,
        patch: decision.patch,
        metrics,
        before,
        after,
      };

      adaptive.adjustments.push(adjustment);
      if (adaptive.adjustments.length > ADAPTIVE_ADJUSTMENTS_MAX) {
        adaptive.adjustments.splice(0, adaptive.adjustments.length - ADAPTIVE_ADJUSTMENTS_MAX);
      }

      adaptive.lastAdjustedAt = adjustment.ts;
      this.state.learning.adjustments = [...adaptive.adjustments];
      this.state.learning.lastAdjustedAt = adaptive.lastAdjustedAt;
      adaptive.lastDecision = {
        ts: adjustment.ts,
        status: "adjusted",
        reason: decision.reasons.join(", "),
        patch: decision.patch,
      };

      this.log("adaptive", "Auto-adjusted bot configuration", {
        reasons: decision.reasons,
        patch: decision.patch,
        sampleCount: metrics.sampleCount,
      });

      await this.persistState({ context: "adaptive-adjusted", fatal: false });
    } catch (error) {
      this.log("adaptive-error", "Adaptive tuner error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async waitForBackrunConfirmation(config) {
    const confirmations = clampInteger(config.backrunConfirmations, DEFAULT_CONFIG.backrunConfirmations, {
      min: BACKRUN_CONFIRMATIONS_MIN,
      max: BACKRUN_CONFIRMATIONS_MAX,
    });
    const timeoutMs = clampInteger(config.backrunWaitTimeoutMs, DEFAULT_CONFIG.backrunWaitTimeoutMs, {
      min: BACKRUN_WAIT_TIMEOUT_MIN,
      max: BACKRUN_WAIT_TIMEOUT_MAX,
    });

    const client = this.getSuiClient(config.network, "read");
    const startedAt = Date.now();

    try {
      const startCheckpoint = BigInt(await client.getLatestCheckpointSequenceNumber());
      const targetCheckpoint = startCheckpoint + BigInt(confirmations);
      let latestCheckpoint = startCheckpoint;

      while (Date.now() - startedAt < timeoutMs) {
        latestCheckpoint = BigInt(await client.getLatestCheckpointSequenceNumber());
        if (latestCheckpoint >= targetCheckpoint) {
          return {
            confirmed: true,
            confirmations,
            startCheckpoint: startCheckpoint.toString(),
            confirmedCheckpoint: latestCheckpoint.toString(),
            waitedMs: Date.now() - startedAt,
          };
        }
        await sleep(200);
      }

      return {
        confirmed: false,
        confirmations,
        startCheckpoint: startCheckpoint.toString(),
        confirmedCheckpoint: latestCheckpoint.toString(),
        waitedMs: Date.now() - startedAt,
        reason: "checkpoint-timeout",
      };
    } catch (error) {
      return {
        confirmed: false,
        confirmations,
        waitedMs: Date.now() - startedAt,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  clearReactorPoll() {
    if (this.reactorTimer) {
      clearTimeout(this.reactorTimer);
      this.reactorTimer = null;
    }
    this.runtime.reactor.nextCheckAt = null;
  }

  scheduleReactorPoll(delayMs = null) {
    this.clearReactorPoll();

    if (!this.runtime.enabled || !this.state.config.confirmedFlowEnabled) {
      this.runtime.reactor.pendingImmediate = false;
      return;
    }

    const pollMs = clampInteger(
      this.state.config.confirmedFlowPollIntervalMs,
      DEFAULT_CONFIG.confirmedFlowPollIntervalMs,
      {
        min: CONFIRMED_FLOW_POLL_MIN,
        max: CONFIRMED_FLOW_POLL_MAX,
      },
    );
    const delay = delayMs == null ? pollMs : Math.max(25, Math.round(delayMs));
    this.runtime.reactor.nextCheckAt = new Date(Date.now() + delay).toISOString();

    this.reactorTimer = setTimeout(async () => {
      try {
        await this.runReactorTick();
      } finally {
        this.scheduleReactorPoll();
      }
    }, delay);
  }

  extractConfirmedFlowSignal(txBlock) {
    const balanceChanges = Array.isArray(txBlock?.balanceChanges) ? txBlock.balanceChanges : [];
    const suiType = normalizeTypeName("0x2::sui::SUI");
    let largestAbsAtomic = 0n;
    let positiveAtomic = 0n;
    let negativeAtomic = 0n;

    for (const change of balanceChanges) {
      const coinType = normalizeTypeName(change?.coinType);
      if (coinType !== suiType) {
        continue;
      }

      let amountAtomic = 0n;
      try {
        amountAtomic = BigInt(change?.amount || "0");
      } catch {
        continue;
      }

      if (amountAtomic > 0n) {
        positiveAtomic += amountAtomic;
      } else if (amountAtomic < 0n) {
        negativeAtomic += -amountAtomic;
      }

      const absAtomic = amountAtomic < 0n ? -amountAtomic : amountAtomic;
      if (absAtomic > largestAbsAtomic) {
        largestAbsAtomic = absAtomic;
      }
    }

    if (largestAbsAtomic <= 0n) {
      return null;
    }

    let pressure = "mixed";
    if (negativeAtomic > positiveAtomic * 2n) {
      pressure = "buy-pressure";
    } else if (positiveAtomic > negativeAtomic * 2n) {
      pressure = "sell-pressure";
    }

    return {
      largestAbsAtomic,
      largestAbsSui: Number(fromAtomicUnits(largestAbsAtomic, 9)),
      positiveAtomic,
      negativeAtomic,
      pressure,
    };
  }

  async detectConfirmedFlowSignal(config) {
    let minNotionalAtomic = 0n;
    try {
      minNotionalAtomic = toAtomicUnits(config.confirmedFlowMinNotionalSui || DEFAULT_CONFIG.confirmedFlowMinNotionalSui, 9);
    } catch {
      minNotionalAtomic = toAtomicUnits(DEFAULT_CONFIG.confirmedFlowMinNotionalSui, 9);
    }
    const lookback = clampInteger(
      config.confirmedFlowLookbackCheckpoints,
      DEFAULT_CONFIG.confirmedFlowLookbackCheckpoints,
      {
        min: CONFIRMED_FLOW_LOOKBACK_MIN,
        max: CONFIRMED_FLOW_LOOKBACK_MAX,
      },
    );
    const maxTxPerCheckpoint = clampInteger(
      config.confirmedFlowMaxTxPerCheckpoint,
      DEFAULT_CONFIG.confirmedFlowMaxTxPerCheckpoint,
      {
        min: CONFIRMED_FLOW_MAX_TX_MIN,
        max: CONFIRMED_FLOW_MAX_TX_MAX,
      },
    );
    const cooldownMs = clampInteger(config.confirmedFlowCooldownMs, DEFAULT_CONFIG.confirmedFlowCooldownMs, {
      min: CONFIRMED_FLOW_COOLDOWN_MIN,
      max: CONFIRMED_FLOW_COOLDOWN_MAX,
    });

    const client = this.getSuiClient(config.network, "read");
    const latestCheckpoint = BigInt(await client.getLatestCheckpointSequenceNumber());
    let startCheckpoint = latestCheckpoint - BigInt(Math.max(0, lookback - 1));
    if (startCheckpoint < 0n) {
      startCheckpoint = 0n;
    }

    if (this.runtime.reactor.lastCheckedCheckpoint != null) {
      try {
        const cursor = BigInt(this.runtime.reactor.lastCheckedCheckpoint);
        startCheckpoint = cursor + 1n;
      } catch {
        // Ignore malformed cursor and fallback to lookback window.
      }
    }

    if (startCheckpoint > latestCheckpoint) {
      this.runtime.reactor.lastCheckedCheckpoint = latestCheckpoint.toString();
      this.runtime.reactor.lastCheckedAt = new Date().toISOString();
      return {
        triggered: false,
        reason: "no-new-checkpoints",
        scannedCheckpoints: 0,
        scannedTransactions: 0,
        latestCheckpoint: latestCheckpoint.toString(),
      };
    }

    let scannedCheckpoints = 0;
    let scannedTransactions = 0;
    let bestSignal = null;

    for (let checkpoint = startCheckpoint; checkpoint <= latestCheckpoint; checkpoint += 1n) {
      let checkpointData = null;
      try {
        checkpointData = await client.getCheckpoint({ id: checkpoint.toString() });
      } catch {
        continue;
      }

      scannedCheckpoints += 1;
      const digests = Array.isArray(checkpointData?.transactions)
        ? checkpointData.transactions.slice(0, maxTxPerCheckpoint)
        : [];
      scannedTransactions += digests.length;

      for (const digest of digests) {
        let txBlock = null;
        try {
          txBlock = await client.getTransactionBlock({
            digest,
            options: {
              showBalanceChanges: true,
            },
          });
        } catch {
          continue;
        }

        const signal = this.extractConfirmedFlowSignal(txBlock);
        if (!signal || signal.largestAbsAtomic < minNotionalAtomic) {
          continue;
        }

        if (!bestSignal || signal.largestAbsAtomic > bestSignal.largestAbsAtomic) {
          bestSignal = {
            ts: new Date().toISOString(),
            checkpoint: checkpoint.toString(),
            digest,
            pressure: signal.pressure,
            largestAbsAtomic: signal.largestAbsAtomic.toString(),
            largestAbsSui: signal.largestAbsSui,
            scannedCheckpoints,
            scannedTransactions,
          };
        }
      }
    }

    this.runtime.reactor.lastCheckedCheckpoint = latestCheckpoint.toString();
    this.runtime.reactor.lastCheckedAt = new Date().toISOString();

    if (!bestSignal) {
      return {
        triggered: false,
        reason: "no-large-confirmed-flow",
        scannedCheckpoints,
        scannedTransactions,
        latestCheckpoint: latestCheckpoint.toString(),
      };
    }

    const lastSignalAt = this.runtime.reactor.lastSignalAt ? new Date(this.runtime.reactor.lastSignalAt).getTime() : null;
    const now = Date.now();
    if (lastSignalAt && Number.isFinite(lastSignalAt) && now - lastSignalAt < cooldownMs) {
      return {
        triggered: false,
        reason: "cooldown",
        remainingMs: cooldownMs - (now - lastSignalAt),
        scannedCheckpoints,
        scannedTransactions,
        latestCheckpoint: latestCheckpoint.toString(),
        signal: bestSignal,
      };
    }

    return {
      triggered: true,
      reason: "confirmed-large-flow",
      scannedCheckpoints,
      scannedTransactions,
      latestCheckpoint: latestCheckpoint.toString(),
      signal: bestSignal,
    };
  }

  async runReactorTick() {
    const config = cloneConfig(this.state.config);
    if (!this.runtime.enabled || !config.confirmedFlowEnabled) {
      return {
        skipped: true,
        reason: "disabled",
      };
    }

    try {
      const detection = await this.detectConfirmedFlowSignal(config);
      if (!detection) {
        return {
          skipped: true,
          reason: "no-detection",
        };
      }

      if (detection.signal) {
        this.runtime.reactor.lastSignal = detection.signal;
      }

      if (!detection.triggered) {
        return detection;
      }

      this.runtime.reactor.lastSignalAt = detection.signal.ts;
      this.log("flow", "Confirmed large swap detected", {
        checkpoint: detection.signal.checkpoint,
        digest: detection.signal.digest,
        largestAbsSui: detection.signal.largestAbsSui,
        pressure: detection.signal.pressure,
      });

      if (this.runtime.running) {
        this.runtime.reactor.pendingImmediate = true;
        this.log("flow", "Queued immediate scan after current cycle", {
          checkpoint: detection.signal.checkpoint,
          digest: detection.signal.digest,
        });
        return {
          ...detection,
          queued: true,
        };
      }

      await this.scanOnce({ trigger: "confirmed-flow", allowExecute: true, lane: "fast" });
      return {
        ...detection,
        queued: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("flow-error", "Confirmed flow reactor failed", { message });
      return {
        skipped: true,
        reason: "reactor-error",
        error: message,
      };
    }
  }

  async resolveTokenFromCoinType(network, tokenByType, coinType) {
    const normalizedType = normalizeTypeName(coinType);
    if (!normalizedType) {
      return null;
    }

    const existing = tokenByType.get(normalizedType);
    if (existing) {
      return existing;
    }

    const metadata = await this.fetchTokenMetadata(network, normalizedType);
    if (!metadata) {
      return null;
    }

    const decimals = Number(metadata.decimals ?? 0);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      return null;
    }

    const symbol = String(metadata.symbol || normalizedType.split("::").at(-1) || "").trim().toUpperCase();
    if (!symbol) {
      return null;
    }

    const token = {
      symbol,
      type: normalizedType,
      decimals,
      scanAmount: symbol === "SUI" ? "1" : "1",
      scanAmountAtomic: toAtomicUnits("1", decimals),
      metadata,
    };
    tokenByType.set(normalizedType, token);
    return token;
  }

  async runUnwindPass({ config, tokenUniverse }) {
    this.runtime.unwind.lastRunAt = new Date().toISOString();

    if (!config.unwindEnabled) {
      return { ran: false, reason: "disabled", actions: [] };
    }

    const walletAddress = this.state.wallet?.address;
    if (!walletAddress) {
      return { ran: false, reason: "wallet-missing", actions: [] };
    }

    const nowMs = Date.now();
    const scheduledRetryAt = this.runtime.rpc.deferred.unwindRetryAt;
    if (scheduledRetryAt) {
      const scheduledMs = new Date(scheduledRetryAt).getTime();
      if (Number.isFinite(scheduledMs) && scheduledMs > nowMs) {
        return { ran: false, reason: "unwind-retry-scheduled", retryAt: scheduledRetryAt, actions: [] };
      }
      this.runtime.rpc.deferred.unwindRetryAt = null;
    }

    const cooldownRemaining = this.writeCooldownRemainingMs();
    if (cooldownRemaining > 0) {
      const retryAt = this.scheduleDeferredRpcRetry("unwind", cooldownRemaining + randomInteger(120, 320));
      return { ran: false, reason: "write-cooldown", retryAt, actions: [] };
    }

    const client = this.getSuiClient(config.network, "write");
    const aggregator = this.createAggregatorClient(config.network, walletAddress, "write");
    const tokenByType = new Map(tokenUniverse.map((token) => [normalizeTypeName(token.type), token]));
    const suiType = normalizeTypeName("0x2::sui::SUI");
    const suiToken =
      tokenUniverse.find((token) => token.symbol === "SUI") ||
      ({
        symbol: "SUI",
        type: suiType,
        decimals: 9,
        scanAmount: "1",
        scanAmountAtomic: toAtomicUnits("1", 9),
        metadata: null,
      });

    const minSuiOutAtomic = toAtomicUnits(config.unwindMinSuiOut || DEFAULT_CONFIG.unwindMinSuiOut, 9);
    let balances = [];
    try {
      balances = await this.runRpcWriteWithRetry(() => client.getAllBalances({ owner: walletAddress }), {
        label: "unwind-balances",
      });
    } catch (error) {
      if (error.code === "RPC_WRITE_RATE_LIMIT" || error.code === "RPC_WRITE_COOLDOWN") {
        const retryAt = this.scheduleDeferredRpcRetry("unwind", this.writeCooldownRemainingMs() + randomInteger(120, 320));
        return { ran: false, reason: "write-rate-limit", retryAt, actions: [] };
      }
      throw error;
    }

    const activeCoinTypes = new Set();
    const actions = [];

    for (const balance of balances || []) {
      const coinType = normalizeTypeName(balance.coinType);
      if (!coinType || coinType === suiType) {
        continue;
      }

      const balanceAtomic = BigInt(balance.totalBalance || "0");
      if (balanceAtomic <= 0n) {
        continue;
      }

      activeCoinTypes.add(coinType);
      const fromToken = await this.resolveTokenFromCoinType(config.network, tokenByType, coinType);
      if (!fromToken) {
        continue;
      }

      const quote = await this.quotePair({
        aggregator,
        fromToken,
        toToken: suiToken,
        amountInAtomic: balanceAtomic,
        config,
        fromIndex: 0,
        toIndex: 0,
      });

      const positions = this.runtime.unwind.positions;
      const position = positions[coinType] || {
        coinType,
        symbol: fromToken.symbol,
        firstSeenAt: new Date(nowMs).toISOString(),
        peakSuiOutAtomic: "0",
        lastSuiOutAtomic: "0",
        lastUpdatedAt: null,
        balanceAtomic: "0",
      };

      position.symbol = fromToken.symbol;
      position.balanceAtomic = balanceAtomic.toString();
      position.lastUpdatedAt = new Date(nowMs).toISOString();

      let drawdownBps = 0;
      let currentSuiOutAtomic = 0n;
      let peakSuiOutAtomic = BigInt(position.peakSuiOutAtomic || "0");
      if (quote) {
        currentSuiOutAtomic = quote.amountOutAtomic;
        if (currentSuiOutAtomic > peakSuiOutAtomic) {
          peakSuiOutAtomic = currentSuiOutAtomic;
        }
        position.peakSuiOutAtomic = peakSuiOutAtomic.toString();
        position.lastSuiOutAtomic = currentSuiOutAtomic.toString();

        if (peakSuiOutAtomic > 0n && currentSuiOutAtomic < peakSuiOutAtomic) {
          drawdownBps = Number(((peakSuiOutAtomic - currentSuiOutAtomic) * 10_000n) / peakSuiOutAtomic);
        }
      }

      positions[coinType] = position;

      const holdMs = nowMs - new Date(position.firstSeenAt).getTime();
      const shouldTriggerByTime = holdMs >= config.unwindMaxHoldMs;
      const shouldTriggerByLoss = drawdownBps >= config.unwindStopLossBps;
      const canExit = Boolean(quote) && (currentSuiOutAtomic >= minSuiOutAtomic || shouldTriggerByTime);
      const shouldUnwind = canExit && (shouldTriggerByTime || shouldTriggerByLoss);

      if (!shouldUnwind) {
        continue;
      }

      const action = {
        ts: new Date().toISOString(),
        symbol: fromToken.symbol,
        coinType,
        balanceAtomic: balanceAtomic.toString(),
        expectedSuiOutAtomic: quote ? quote.amountOutAtomic.toString() : "0",
        holdMs,
        drawdownBps,
      };

      if (config.dryRun) {
        action.mode = "dry-run";
        action.status = "simulated";
        actions.push(action);
        continue;
      }

      try {
        const wallet = await this.getWalletKeypair();
        const txb = new Transaction();
        await aggregator.fastRouterSwap({
          router: quote.route,
          txb,
          slippage: config.slippageBps / 10_000,
        });
        const result = await this.runRpcWriteWithRetry(() => aggregator.sendTransaction(txb, wallet.keypair), {
          label: "unwind-send",
        });
        action.mode = "live";
        action.status = "executed";
        action.digest = result.digest;
        actions.push(action);
        delete positions[coinType];
      } catch (error) {
        action.mode = "live";
        if (error.code === "RPC_WRITE_RATE_LIMIT" || error.code === "RPC_WRITE_COOLDOWN") {
          action.status = "deferred";
          action.error = error instanceof Error ? error.message : String(error);
          action.retryAt = this.scheduleDeferredRpcRetry("unwind", this.writeCooldownRemainingMs() + randomInteger(120, 320));
          actions.push(action);
          this.log("unwind", "Deferred unwind after RPC rate limit", {
            symbol: action.symbol,
            retryAt: action.retryAt,
          });
          break;
        }
        action.status = "failed";
        action.error = error instanceof Error ? error.message : String(error);
        actions.push(action);
      }
    }

    for (const trackedCoinType of Object.keys(this.runtime.unwind.positions)) {
      if (!activeCoinTypes.has(trackedCoinType)) {
        delete this.runtime.unwind.positions[trackedCoinType];
      }
    }

    if (actions.length > 0) {
      this.runtime.unwind.lastAction = actions[actions.length - 1];
      this.log("unwind", "Processed sell-max unwind actions", {
        count: actions.length,
        actions: actions.map((action) => ({
          symbol: action.symbol,
          status: action.status,
          digest: action.digest || null,
          error: action.error || null,
        })),
      });
    }

    return {
      ran: true,
      actions,
      trackedPositions: Object.keys(this.runtime.unwind.positions).length,
    };
  }

  async executeOpportunity(opportunity, config, tokenMap, { startAmountAtomicOverride = null } = {}) {
    const dryRun = config.dryRun;

    let keypair = null;
    let walletAddress = null;

    if (!dryRun) {
      if (!config.liveTradingEnabled) {
        throw new Error("Live trading is disabled. Set liveTradingEnabled=true.");
      }

      const writeCooldownMs = this.writeCooldownRemainingMs();
      if (writeCooldownMs > 0) {
        throw new Error(`Write RPC cooldown active (${writeCooldownMs}ms remaining).`);
      }

      const wallet = await this.getWalletKeypair();
      keypair = wallet.keypair;
      walletAddress = wallet.address;
    }

    const signerAddress = walletAddress || this.state.wallet?.address || "0x0";
    const aggregator = this.createAggregatorClient(config.network, signerAddress, dryRun ? "read" : "write");

    const executionStartAmountAtomic = startAmountAtomicOverride
      ? BigInt(startAmountAtomicOverride)
      : BigInt(opportunity.startAmountAtomic);
    if (executionStartAmountAtomic <= 0n) {
      throw new Error("Execution aborted: start amount must be positive.");
    }

    let currentAmountAtomic = executionStartAmountAtomic;
    let currentToken = opportunity.startTokenSymbol;
    const routePlans = [];
    const steps = [];

    for (const hop of opportunity.hops) {
      const fromToken = tokenMap.get(hop.fromSymbol);
      const toToken = tokenMap.get(hop.toSymbol);
      if (!fromToken || !toToken) {
        throw new Error(`Token metadata missing for hop ${hop.fromSymbol}->${hop.toSymbol}`);
      }
      if (currentToken !== fromToken.symbol) {
        throw new Error(`Cycle sequencing mismatch: expected ${currentToken}, got ${fromToken.symbol}`);
      }

      const freshQuote = await this.quotePair({
        aggregator,
        fromToken,
        toToken,
        amountInAtomic: currentAmountAtomic,
        config,
        fromIndex: 0,
        toIndex: 0,
      });

      if (!freshQuote) {
        throw new Error(`No executable route for ${hop.fromSymbol}->${hop.toSymbol}`);
      }

      const step = {
        from: hop.fromSymbol,
        to: hop.toSymbol,
        amountInAtomic: currentAmountAtomic.toString(),
        amountIn: fromAtomicUnits(currentAmountAtomic, fromToken.decimals),
        quotedAmountOutAtomic: freshQuote.amountOutAtomic.toString(),
        quotedAmountOut: fromAtomicUnits(freshQuote.amountOutAtomic, toToken.decimals),
        providers: freshQuote.providers,
      };
      routePlans.push({ fromToken, toToken, quote: freshQuote });

      currentAmountAtomic = freshQuote.amountOutAtomic;
      currentToken = hop.toSymbol;
      steps.push(step);
    }

    if (currentToken !== "SUI") {
      throw new Error(`Execution aborted: cycle settled in ${currentToken} instead of SUI.`);
    }

    const startAmountAtomic = executionStartAmountAtomic;
    const profitAtomic = currentAmountAtomic - startAmountAtomic;
    const profitBps = Number((profitAtomic * 10_000n) / (startAmountAtomic || 1n));

    if (profitAtomic <= 0n) {
      throw new Error(`Execution aborted: projected cycle does not increase SUI (profitAtomic=${profitAtomic.toString()}).`);
    }

    const digests = [];
    let preflight = null;
    if (!dryRun) {
      if (routePlans.length !== 3) {
        throw new Error(`Execution requires 3-hop cycle; got ${routePlans.length} hops.`);
      }
      if (routePlans[0].fromToken.symbol !== "SUI") {
        throw new Error(`Execution requires SUI start token; got ${routePlans[0].fromToken.symbol}.`);
      }
      if (routePlans[routePlans.length - 1].toToken.symbol !== "SUI") {
        throw new Error(`Execution requires SUI settlement; got ${routePlans[routePlans.length - 1].toToken.symbol}.`);
      }

      const txb = new Transaction();
      const slippage = config.slippageBps / 10_000;
      const writeClient = this.getSuiClient(config.network, "write");
      const priorityGasMultiplier = clampFloat(
        config.priorityGasMultiplier,
        DEFAULT_CONFIG.priorityGasMultiplier,
        {
          min: PRIORITY_GAS_MULTIPLIER_MIN,
          max: PRIORITY_GAS_MULTIPLIER_MAX,
        },
      );
      const gasBudgetMultiplier = clampFloat(
        config.gasBudgetMultiplier,
        DEFAULT_CONFIG.gasBudgetMultiplier,
        {
          min: GAS_BUDGET_MULTIPLIER_MIN,
          max: GAS_BUDGET_MULTIPLIER_MAX,
        },
      );
      const preflightEnabled = parseBoolean(
        config.preflightDryRunEnabled,
        DEFAULT_CONFIG.preflightDryRunEnabled,
      );

      const referenceGasPriceRaw = await this.runRpcWriteWithRetry(
        () => writeClient.getReferenceGasPrice(),
        { label: "trade-reference-gas-price" },
      );
      const referenceGasPrice = toBigInt(referenceGasPriceRaw, 1n);
      const boostedGasPrice = scaleBigIntByMultiplier(referenceGasPrice, priorityGasMultiplier);
      txb.setGasPrice(boostedGasPrice > 0n ? boostedGasPrice : 1n);

      const [initialSuiCoin] = txb.splitCoins(txb.gas, [txb.pure.u64(startAmountAtomic.toString())]);
      let inputCoin = initialSuiCoin;

      for (let i = 0; i < routePlans.length; i += 1) {
        const plan = routePlans[i];
        // Exact-in chaining: use the full output coin from previous hop as next hop input.
        const outputCoin = await aggregator.routerSwap({
          router: plan.quote.route,
          inputCoin,
          slippage,
          txb,
        });

        inputCoin = outputCoin;
      }

      txb.mergeCoins(txb.gas, [inputCoin]);

      if (preflightEnabled) {
        const txBytes = await this.runRpcWriteWithRetry(
          () => txb.build({ client: writeClient }),
          { label: "trade-preflight-build" },
        );
        const dryRunResult = await this.runRpcWriteWithRetry(
          () => writeClient.dryRunTransactionBlock({ transactionBlock: txBytes }),
          { label: "trade-preflight-dry-run" },
        );

        if (!isDryRunSuccess(dryRunResult)) {
          const message = extractDryRunErrorMessage(dryRunResult);
          throw new Error(`Execution aborted: preflight dry-run failed (${message}).`);
        }

        const estimatedGasAtomic = extractDryRunNetGasAtomic(dryRunResult);
        const projectedProfitSui = Number(fromAtomicUnits(profitAtomic > 0n ? profitAtomic : 0n, 9));
        const estimatedGasSui = Number(fromAtomicUnits(estimatedGasAtomic, 9));
        const netProjectedProfitSui = projectedProfitSui - estimatedGasSui;
        const minProjectedProfitSui = clampFloat(
          config.minProfitSui,
          Number(DEFAULT_CONFIG.minProfitSui),
          {
            min: MIN_PROFIT_SUI_MIN,
            max: MIN_PROFIT_SUI_MAX,
          },
        );

        if (!Number.isFinite(netProjectedProfitSui) || netProjectedProfitSui < minProjectedProfitSui) {
          throw new Error(
            `Execution aborted: preflight net profit ${netProjectedProfitSui.toFixed(5)} SUI below ${minProjectedProfitSui.toFixed(5)} SUI.`,
          );
        }

        const scaledBudget = scaleBigIntByMultiplier(estimatedGasAtomic, gasBudgetMultiplier);
        const gasBudget =
          scaledBudget + GAS_BUDGET_SAFETY_BUFFER_ATOMIC > 0n
            ? scaledBudget + GAS_BUDGET_SAFETY_BUFFER_ATOMIC
            : GAS_BUDGET_SAFETY_BUFFER_ATOMIC;
        txb.setGasBudget(gasBudget);

        preflight = {
          ok: true,
          estimatedGasAtomic: estimatedGasAtomic.toString(),
          estimatedGasSui,
          projectedProfitSui,
          netProjectedProfitSui,
          minProjectedProfitSui,
          gasBudgetAtomic: gasBudget.toString(),
          referenceGasPriceAtomic: referenceGasPrice.toString(),
          gasPriceAtomic: (boostedGasPrice > 0n ? boostedGasPrice : 1n).toString(),
          gasBudgetMultiplier,
          priorityGasMultiplier,
        };

        this.log("trade", "Preflight dry-run passed", preflight);
      }

      const result = await this.runRpcWriteWithRetry(() => aggregator.sendTransaction(txb, keypair), {
        label: "trade-send",
      });
      digests.push(result.digest);

      if (steps.length > 0) {
        steps[steps.length - 1].digest = result.digest;
      }
    }

    return {
      success: true,
      executedAt: new Date().toISOString(),
      dryRun,
      finalToken: currentToken,
      startAmountAtomic: startAmountAtomic.toString(),
      finalAmountAtomic: currentAmountAtomic.toString(),
      profitAtomic: profitAtomic.toString(),
      profitBps,
      digests,
      steps,
      preflight,
      assertedSuiSettlement: true,
    };
  }

  async scanOnce({ trigger = "manual", allowExecute = true, lane = "slow" } = {}) {
    await this.ready();

    const laneKey = lane === "fast" || lane === "slow" ? lane : "slow";

    if (this.scanPromise) {
      const laneState = this.runtime.lanes[laneKey];
      if (laneState) {
        laneState.skippedBusy = Number(laneState.skippedBusy || 0) + 1;
        laneState.lastSkippedAt = new Date().toISOString();
      }
      return this.scanPromise;
    }

    this.scanPromise = (async () => {
      const persistedConfig = cloneConfig(this.state.config);
      const config = this.buildLaneScanConfig(persistedConfig, laneKey);
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      const laneState = this.runtime.lanes[laneKey];

      this.runtime.running = true;
      this.runtime.nextRunAt = null;
      this.runtime.lastScanAt = startedAt;
      this.runtime.lastError = null;
      if (laneState) {
        laneState.lastRunAt = startedAt;
      }
      this.log("scan", `Cycle started (${trigger})`, {
        network: config.network,
        dryRun: config.dryRun,
        lane: laneKey,
        tokenUniverseTarget: config.tokenUniverseTarget,
        maxPairCandidates: config.maxPairCandidates,
        maxQuoteConcurrency: config.maxQuoteConcurrency,
      });

      try {
        const tokenUniverse = await this.resolveActiveTokens(config);
        const tokenMap = new Map(tokenUniverse.map((token) => [token.symbol, token]));

        if (tokenUniverse.length < 3) {
          const result = {
            trigger,
            lane: laneKey,
            startedAt,
            finishedAt: new Date().toISOString(),
            tokenUniverseSize: tokenUniverse.length,
            scannedTokens: 0,
            scannedPairs: 0,
            executablePairs: 0,
            message: "Need at least three valid tokens to scan triangular arbitrage cycles.",
          };
          if (allowExecute) {
            try {
              result.walletEquity = await this.captureWalletEquitySnapshot({
                network: config.network,
                source: `scan-skip:${trigger}`,
                persist: false,
              });
            } catch (error) {
              this.log("equity-error", "Failed to sample SUI balance for skipped scan", {
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }

          this.runtime.lastScanResult = result;
          await this.observeAndAdapt({
            config: persistedConfig,
            trigger,
            result,
            durationMs: Date.now() - startedMs,
          });
          this.log("scan", "Skipped scan: insufficient token universe for triangular scan", {
            tokenCount: tokenUniverse.length,
          });
          return result;
        }

        const walletAddress = this.state.wallet?.address || "0x0";
        const aggregator = this.createAggregatorClient(config.network, walletAddress, "read");

        const pairPlan = this.buildPairTasks(tokenUniverse, config);
        const scanTokens = pairPlan.scanTokens;
        const pairTasks = pairPlan.tasks;

        if (scanTokens.length < 3 || pairTasks.length < 6) {
          const result = {
            trigger,
            lane: laneKey,
            startedAt,
            finishedAt: new Date().toISOString(),
            tokenUniverseSize: tokenUniverse.length,
            scannedTokens: scanTokens.length,
            scannedPairs: pairTasks.length,
            executablePairs: 0,
            message: "Pair plan too small for triangular cycles. Increase maxPairCandidates or reduce filters.",
          };
          if (allowExecute) {
            try {
              result.walletEquity = await this.captureWalletEquitySnapshot({
                network: config.network,
                source: `scan-skip:${trigger}`,
                persist: false,
              });
            } catch (error) {
              this.log("equity-error", "Failed to sample SUI balance for pair-plan skip", {
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }

          this.runtime.lastScanResult = result;
          await this.observeAndAdapt({
            config: persistedConfig,
            trigger,
            result,
            durationMs: Date.now() - startedMs,
          });
          this.log("scan", "Skipped scan: pair plan does not satisfy triangular requirements", {
            tokenUniverse: tokenUniverse.length,
            scannedTokens: scanTokens.length,
            scannedPairs: pairTasks.length,
          });
          return result;
        }

        const edges = [];
        await runWithConcurrency(pairTasks, config.maxQuoteConcurrency, async (task) => {
          const edge = await this.quotePair({
            aggregator,
            fromToken: task.fromToken,
            toToken: task.toToken,
            amountInAtomic: task.fromToken.scanAmountAtomic,
            config,
            fromIndex: task.fromIndex,
            toIndex: task.toIndex,
          });

          if (edge) {
            edges.push(edge);
          }
        });

        const opportunity = this.detectBestTriangularCycle(scanTokens, edges);
        this.log("scan", "Quote pass completed", {
          tokenUniverse: tokenUniverse.length,
          scannedTokens: scanTokens.length,
          scannedPairs: pairTasks.length,
          executablePairs: edges.length,
          providers: config.providers,
        });

        let trade = null;
        let tradeError = null;
        let backrun = null;
        let executionGuard = null;
        let executionValidation = null;
        let routeBlock = null;
        if (opportunity) {
          this.runtime.lastOpportunity = opportunity;

          const startsWithTradableBase = opportunity.startTokenSymbol === "SUI";
          const settlesInSui = Array.isArray(opportunity.cycle) && opportunity.cycle[opportunity.cycle.length - 1] === "SUI";
          routeBlock = this.getOpportunityCooldownBlock(opportunity);
          if (!routeBlock.blocked) {
            executionValidation = await this.validateOpportunityAtExecutionSize({
              opportunity,
              config,
              tokenMap,
              startAmountAtomic: opportunity.startAmountAtomic,
            });
          }
          executionGuard = this.evaluateExecutionGuard(config, opportunity, executionValidation);
          if (routeBlock.blocked) {
            tradeError = `cooldown:${routeBlock.type}:${routeBlock.reason}`;
            executionGuard.allowed = false;
            executionGuard.reasons = [...(executionGuard.reasons || []), tradeError];
          }

          this.log("opportunity", `Detected cycle ${opportunity.cycle.join(" -> ")}`, {
            expectedProfitBps: opportunity.expectedProfitBps,
            liveProfitBps: Number.isFinite(Number(executionValidation?.profitBps))
              ? Number(executionValidation.profitBps)
              : null,
            liveValidation: executionValidation?.reason || null,
            routeBlocked: routeBlock.blocked,
            routeBlockReason: routeBlock.reason || null,
          });

          const executionAllowlisted = true;
          const executionRequested =
            allowExecute && config.autoExecute && startsWithTradableBase && settlesInSui && executionAllowlisted;
          if (executionRequested && !executionGuard.allowed) {
            const guardReasons = Array.isArray(executionGuard.reasons) ? executionGuard.reasons : [];
            const prioritizedReason =
              guardReasons.find((reason) => String(reason || "").includes("cooldown:")) ||
              guardReasons.find((reason) => String(reason || "").includes("live requote")) ||
              guardReasons.find((reason) => String(reason || "").includes("route deviation")) ||
              guardReasons[0];
            tradeError = prioritizedReason || "Execution guard rejected opportunity.";
          }
          if (executionRequested && executionGuard.allowed) {
            executionValidation = await this.runExecutionRequoteGate({
              opportunity,
              config,
              tokenMap,
              startAmountAtomic: executionGuard.adjustedStartAmountAtomic,
            });

            if (!executionValidation.valid) {
              tradeError = `Live requote rejected (${executionValidation.reason || "validation-failed"}).`;
              executionGuard.allowed = false;
              executionGuard.reasons = [...(executionGuard.reasons || []), tradeError];
            } else {
              let backrunReady = true;
              if (config.backrunOnly) {
                backrun = await this.waitForBackrunConfirmation(config);
                backrunReady = backrun.confirmed;
                this.log("backrun", backrunReady ? "Checkpoint confirmation satisfied" : "Checkpoint confirmation timeout", {
                  ...backrun,
                });
              } else {
                backrun = {
                  confirmed: true,
                  skipped: true,
                  reason: "backrun-only disabled",
                };
              }

              if (backrunReady) {
                try {
                  trade = await this.executeOpportunity(opportunity, config, tokenMap, {
                    startAmountAtomicOverride: executionGuard.adjustedStartAmountAtomic,
                  });
                  trade.executionGuard = {
                    requiredProfitBps: executionGuard.requiredProfitBps,
                    dynamicBufferBps: executionGuard.dynamicBufferBps,
                    riskMultiplier: executionGuard.riskMultiplier,
                    sizingMultiplier: executionGuard.sizingMultiplier,
                    effectiveTradeMultiplier: executionGuard.effectiveTradeMultiplier,
                    adjustedStartAmountAtomic: executionGuard.adjustedStartAmountAtomic,
                  };
                  trade.executionValidation = executionValidation;
                  this.runtime.lastTrade = trade;

                  this.log("trade", trade.dryRun ? "Simulated trade cycle" : "Executed trade cycle", {
                    profitBps: trade.profitBps,
                    digests: trade.digests,
                    requiredProfitBps: executionGuard.requiredProfitBps,
                    adjustedStartAmountSui: executionGuard.adjustedStartAmountSui,
                  });
                } catch (error) {
                  tradeError = error instanceof Error ? error.message : String(error);
                  this.log("trade-error", "Trade execution failed", {
                    message: tradeError,
                  });
                }
              } else {
                tradeError = `Backrun wait requirement not satisfied (${backrun.reason || "not confirmed"}).`;
              }
            }
          }

          if (!trade) {
            this.log("scan", "Cycle not executed", {
              expectedProfitBps: opportunity.expectedProfitBps,
              minProfitBps: config.minProfitBps,
              guardRequiredProfitBps: executionGuard?.requiredProfitBps ?? null,
              guardRiskMultiplier: executionGuard?.riskMultiplier ?? null,
              guardReasons: executionGuard?.reasons || [],
              executionValidationReason: executionValidation?.reason || null,
              autoExecute: config.autoExecute,
              allowExecute,
              startTokenSymbol: opportunity.startTokenSymbol,
              requiresSuiStartToken: true,
              requiresSuiSettlement: true,
              settlesInSui,
              executionAllowlisted,
              executionRequested,
              backrunOnly: config.backrunOnly,
              routeBlock,
              backrun,
              tradeError,
            });
          }

          if (trade?.success) {
            this.recordOpportunitySuccess(opportunity);
          } else if (tradeError) {
            this.recordOpportunityFailure(opportunity, tradeError, config);
          }
        } else {
          this.log("scan", "No arbitrage cycle detected", {
            tokenUniverse: tokenUniverse.length,
            scannedTokens: scanTokens.length,
            scannedPairs: pairTasks.length,
            executablePairs: edges.length,
          });
        }

        let unwind = null;
        if (allowExecute) {
          try {
            unwind = await this.runUnwindPass({ config, tokenUniverse });
          } catch (error) {
            unwind = {
              ran: false,
              error: error instanceof Error ? error.message : String(error),
            };
            this.log("unwind-error", "Unwind pass failed", {
              message: unwind.error,
            });
          }
        }

        let walletEquity = null;
        if (allowExecute) {
          try {
            walletEquity = await this.captureWalletEquitySnapshot({
              network: config.network,
              source: `scan:${trigger}`,
              persist: false,
            });
          } catch (error) {
            this.log("equity-error", "Failed to sample SUI balance after scan cycle", {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const result = {
          trigger,
          lane: laneKey,
          startedAt,
          finishedAt: new Date().toISOString(),
          tokenUniverseSize: tokenUniverse.length,
          scannedTokens: scanTokens.length,
          scannedPairs: pairTasks.length,
          executablePairs: edges.length,
          opportunity,
          trade,
          tradeError,
          backrun,
          routeBlock,
          executionGuard,
          executionValidation,
          unwind,
          walletEquity,
        };

        this.updateRealizedSizingFromResult(config, result);

        this.runtime.lastScanResult = result;
        await this.observeAndAdapt({
          config: persistedConfig,
          trigger,
          result,
          durationMs: Date.now() - startedMs,
        });
        this.log("scan", "Cycle finished", {
          durationMs: Date.now() - startedMs,
          lane: laneKey,
          hasOpportunity: Boolean(opportunity),
          executed: Boolean(trade),
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.runtime.lastError = message;
        this.log("error", "Scan cycle failed", { message });

        const result = {
          trigger,
          lane: laneKey,
          startedAt,
          finishedAt: new Date().toISOString(),
          error: message,
        };
        if (allowExecute) {
          try {
            result.walletEquity = await this.captureWalletEquitySnapshot({
              network: config.network,
              source: `scan-error:${trigger}`,
              persist: false,
            });
          } catch (equityError) {
            this.log("equity-error", "Failed to sample SUI balance after scan error", {
              message: equityError instanceof Error ? equityError.message : String(equityError),
            });
          }
        }
        this.runtime.lastScanResult = result;
        await this.observeAndAdapt({
          config: persistedConfig,
          trigger,
          result,
          durationMs: Date.now() - startedMs,
        });
        return result;
      } finally {
        const durationMs = Date.now() - startedMs;
        if (laneState) {
          laneState.lastDurationMs = durationMs;
          laneState.lastResult = {
            ts: new Date().toISOString(),
            trigger,
            lane: laneKey,
            durationMs,
            error: this.runtime.lastScanResult?.error || null,
            hasOpportunity: Boolean(this.runtime.lastScanResult?.opportunity),
            executed: Boolean(this.runtime.lastScanResult?.trade),
          };
        }
        this.runtime.running = false;
        this.scanPromise = null;
        if (this.runtime.reactor.pendingImmediate) {
          this.runtime.reactor.pendingImmediate = false;
          if (this.runtime.enabled) {
            this.log("flow", "Scheduling immediate follow-up scan", {
              reason: "queued-confirmed-flow",
            });
            this.scheduleLaneRun(this.state.config.dualLaneEnabled ? "fast" : "slow", 25);
          }
        }
      }
    })();

    return this.scanPromise;
  }

  updateNextRunAtFromLanes() {
    const candidates = [this.runtime.lanes.fast.nextRunAt, this.runtime.lanes.slow.nextRunAt]
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite);

    if (candidates.length === 0) {
      this.runtime.nextRunAt = null;
      return;
    }

    const earliest = Math.min(...candidates);
    this.runtime.nextRunAt = new Date(earliest).toISOString();
  }

  clearLaneTimer(lane) {
    if (lane === "fast" && this.fastLoopTimer) {
      clearTimeout(this.fastLoopTimer);
      this.fastLoopTimer = null;
    }

    if (lane === "slow" && this.slowLoopTimer) {
      clearTimeout(this.slowLoopTimer);
      this.slowLoopTimer = null;
    }

    if (this.runtime.lanes[lane]) {
      this.runtime.lanes[lane].nextRunAt = null;
    }
    this.updateNextRunAtFromLanes();
  }

  clearAllLaneTimers() {
    this.clearLaneTimer("fast");
    this.clearLaneTimer("slow");
  }

  laneIntervalMs(lane) {
    const config = this.state.config;
    if (lane === "fast") {
      return clampInteger(config.fastLaneIntervalMs, DEFAULT_CONFIG.fastLaneIntervalMs, {
        min: FAST_LANE_INTERVAL_MIN,
        max: FAST_LANE_INTERVAL_MAX,
      });
    }

    if (config.dualLaneEnabled) {
      return clampInteger(config.slowLaneIntervalMs, DEFAULT_CONFIG.slowLaneIntervalMs, {
        min: SLOW_LANE_INTERVAL_MIN,
        max: SLOW_LANE_INTERVAL_MAX,
      });
    }

    return clampInteger(config.cycleIntervalMs, DEFAULT_CONFIG.cycleIntervalMs, {
      min: 3000,
      max: 300000,
    });
  }

  scheduleLaneRun(lane, delayMs = null) {
    const laneKey = lane === "fast" ? "fast" : "slow";
    this.clearLaneTimer(laneKey);

    if (!this.runtime.enabled) {
      return;
    }

    if (!this.state.config.dualLaneEnabled && laneKey === "fast") {
      return;
    }

    const intervalMs = this.laneIntervalMs(laneKey);
    const delay = delayMs == null ? intervalMs : Math.max(25, Math.round(delayMs));
    const nextRunAt = new Date(Date.now() + delay).toISOString();
    this.runtime.lanes[laneKey].nextRunAt = nextRunAt;
    this.updateNextRunAtFromLanes();

    const run = async () => {
      if (!this.runtime.enabled) {
        return;
      }

      this.runtime.lanes[laneKey].nextRunAt = null;
      this.updateNextRunAtFromLanes();

      if (this.scanPromise || this.runtime.running) {
        this.runtime.lanes[laneKey].skippedBusy = Number(this.runtime.lanes[laneKey].skippedBusy || 0) + 1;
        this.runtime.lanes[laneKey].lastSkippedAt = new Date().toISOString();
      } else {
        const trigger = laneKey === "fast" ? "auto-fast" : this.state.config.dualLaneEnabled ? "auto-slow" : "auto";
        await this.scanOnce({ trigger, allowExecute: true, lane: laneKey });
      }

      this.scheduleLaneRun(laneKey);
    };

    if (laneKey === "fast") {
      this.fastLoopTimer = setTimeout(run, delay);
    } else {
      this.slowLoopTimer = setTimeout(run, delay);
    }
  }

  scheduleNextRun(delayMs = null) {
    this.scheduleLaneRun("slow", delayMs);
  }

  async start() {
    await this.ready();
    if (this.runtime.enabled) {
      return this.getStatus();
    }

    if (this.state.wallet?.address) {
      try {
        await this.captureWalletEquitySnapshot({
          network: this.state.config.network,
          source: "bot-start",
          persist: false,
        });
      } catch (error) {
        this.log("equity-error", "Failed to sample SUI balance on bot start", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.runtime.enabled = true;
    this.log("bot", "Started local MEV loop");
    this.runtime.lanes.fast.lastSkippedAt = null;
    this.runtime.lanes.slow.lastSkippedAt = null;
    this.runtime.lanes.fast.skippedBusy = 0;
    this.runtime.lanes.slow.skippedBusy = 0;
    if (this.state.config.dualLaneEnabled) {
      this.scheduleLaneRun("fast", 25);
      this.scheduleLaneRun("slow", 350);
    } else {
      this.scheduleLaneRun("slow", 25);
      this.runtime.lanes.fast.nextRunAt = null;
      this.updateNextRunAtFromLanes();
    }
    this.scheduleReactorPoll(350);
    return this.getStatus();
  }

  async stop() {
    await this.ready();
    this.runtime.enabled = false;
    this.runtime.nextRunAt = null;
    this.clearAllLaneTimers();
    this.clearReactorPoll();
    this.runtime.reactor.pendingImmediate = false;

    this.log("bot", "Stopped local MEV loop");
    return this.getStatus();
  }

  getStatus() {
    return {
      wallet: this.walletStatus(),
      config: cloneConfig(this.state.config),
      runtime: {
        enabled: this.runtime.enabled,
        running: this.runtime.running,
        nextRunAt: this.runtime.nextRunAt,
        lastScanAt: this.runtime.lastScanAt,
        lastScanResult: this.runtime.lastScanResult,
        lastOpportunity: this.runtime.lastOpportunity,
        lastTrade: this.runtime.lastTrade,
        lastError: this.runtime.lastError,
        adaptive: {
          sampleCount: this.runtime.adaptive.history.length,
          lastMetrics: this.runtime.adaptive.lastMetrics,
          lastAdjustedAt: this.runtime.adaptive.lastAdjustedAt,
          lastDecision: this.runtime.adaptive.lastDecision,
          recentAdjustments: this.runtime.adaptive.adjustments.slice(-10),
        },
        sizing: {
          ...this.runtime.sizing,
        },
        safety: {
          pauseLiveUntil: this.runtime.safety.pauseLiveUntil,
          pauseReason: this.runtime.safety.pauseReason,
          lastGuard: this.runtime.safety.lastGuard,
        },
        routeHealth: this.buildRouteHealthSnapshot(10),
        persistence: {
          degraded: this.runtime.persistence.degraded,
          reason: this.runtime.persistence.reason,
          backoffUntil: this.runtime.persistence.backoffUntil,
          backoffRemainingMs: this.persistBackoffRemainingMs(),
          lastPersistAt: this.runtime.persistence.lastPersistAt,
          lastError: this.runtime.persistence.lastError,
          lastErrorAt: this.runtime.persistence.lastErrorAt,
          failedWrites: this.runtime.persistence.failedWrites,
        },
        equity: {
          history: this.runtime.equity.history.slice(-240),
          currentSui: this.runtime.equity.currentSui,
          startSui: this.runtime.equity.startSui,
          peakSui: this.runtime.equity.peakSui,
          changeSui: this.runtime.equity.changeSui,
          changePct: this.runtime.equity.changePct,
          drawdownPct: this.runtime.equity.drawdownPct,
          downStepRate: this.runtime.equity.downStepRate,
          negativeStreak: this.runtime.equity.negativeStreak,
          lastUpdatedAt: this.runtime.equity.lastUpdatedAt,
          lastSource: this.runtime.equity.lastSource,
        },
        reactor: {
          lastCheckedCheckpoint: this.runtime.reactor.lastCheckedCheckpoint,
          lastCheckedAt: this.runtime.reactor.lastCheckedAt,
          nextCheckAt: this.runtime.reactor.nextCheckAt,
          lastSignalAt: this.runtime.reactor.lastSignalAt,
          lastSignal: this.runtime.reactor.lastSignal,
          pendingImmediate: this.runtime.reactor.pendingImmediate,
        },
        rpc: {
          readEndpoint: resolveRpcEndpoint(this.state.config.network, "read"),
          writeEndpoint: resolveRpcEndpoint(this.state.config.network, "write"),
          writeCooldownUntil: this.runtime.rpc.writeCooldownUntil,
          writeCooldownRemainingMs: this.writeCooldownRemainingMs(),
          lastRateLimitAt: this.runtime.rpc.lastRateLimitAt,
          lastRateLimitReason: this.runtime.rpc.lastRateLimitReason,
          deferred: {
            ...this.runtime.rpc.deferred,
          },
        },
        lanes: {
          fast: { ...this.runtime.lanes.fast },
          slow: { ...this.runtime.lanes.slow },
        },
        unwind: {
          trackedPositions: this.runtime.unwind.positions,
          lastRunAt: this.runtime.unwind.lastRunAt,
          lastAction: this.runtime.unwind.lastAction,
        },
        logs: [...this.runtime.logs],
      },
    };
  }
}
