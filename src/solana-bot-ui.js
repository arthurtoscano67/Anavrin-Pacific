const POLL_INTERVAL_MS = 4000;

const state = {
  status: null,
  configDirty: false,
};

const el = {
  flash: document.querySelector("#flash"),
  runtimeBadge: document.querySelector("#runtime-badge"),
  runtimeMeta: document.querySelector("#runtime-meta"),
  lastScan: document.querySelector("#last-scan"),
  walletSummary: document.querySelector("#wallet-summary"),
  walletPrivateKey: document.querySelector("#wallet-private-key"),
  btnWalletImport: document.querySelector("#btn-wallet-import"),
  btnWalletClear: document.querySelector("#btn-wallet-clear"),
  btnWalletRefresh: document.querySelector("#btn-wallet-refresh"),
  btnRefresh: document.querySelector("#btn-refresh"),
  btnScan: document.querySelector("#btn-scan"),
  btnStart: document.querySelector("#btn-start"),
  btnStop: document.querySelector("#btn-stop"),
  btnSaveConfig: document.querySelector("#btn-save-config"),
  logs: document.querySelector("#logs"),
  cfgRpcUrl: document.querySelector("#cfg-rpc-url"),
  cfgWsUrl: document.querySelector("#cfg-ws-url"),
  cfgJupiter: document.querySelector("#cfg-jupiter"),
  cfgCycle: document.querySelector("#cfg-cycle"),
  cfgQuoteTimeout: document.querySelector("#cfg-quote-timeout"),
  cfgMaxQuotes: document.querySelector("#cfg-max-quotes"),
  cfgSlippage: document.querySelector("#cfg-slippage"),
  cfgMinProfitBps: document.querySelector("#cfg-min-profit-bps"),
  cfgMinProfitAtomic: document.querySelector("#cfg-min-profit-atomic"),
  cfgComputeLimit: document.querySelector("#cfg-compute-limit"),
  cfgComputePrice: document.querySelector("#cfg-compute-price"),
  cfgCommitment: document.querySelector("#cfg-commitment"),
  cfgDryRun: document.querySelector("#cfg-dry-run"),
  cfgAutoExecute: document.querySelector("#cfg-auto-execute"),
  cfgLiveEnabled: document.querySelector("#cfg-live-enabled"),
  cfgRequote: document.querySelector("#cfg-requote"),
  cfgPreflight: document.querySelector("#cfg-preflight"),
  cfgDexes: document.querySelector("#cfg-dexes"),
  cfgRoutes: document.querySelector("#cfg-routes"),
};

function showMessage(text, type = "info") {
  if (!el.flash) {
    return;
  }
  el.flash.textContent = text;
  el.flash.dataset.type = type;
}

function toBool(value) {
  return String(value) === "true";
}

function formatTs(value) {
  if (!value) {
    return "n/a";
  }
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return String(value);
  }
  return asDate.toLocaleString();
}

function formatSol(balanceLamports) {
  if (typeof balanceLamports !== "number") {
    return "n/a";
  }
  return `${(balanceLamports / 1_000_000_000).toFixed(6)} SOL`;
}

async function api(path, init = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function readConfigPatch() {
  let routes;
  try {
    routes = JSON.parse(el.cfgRoutes.value || "[]");
  } catch {
    throw new Error("Routes JSON is invalid.");
  }

  return {
    rpcUrl: el.cfgRpcUrl.value.trim(),
    wsUrl: el.cfgWsUrl.value.trim(),
    jupiterApiBase: el.cfgJupiter.value.trim(),
    cycleIntervalMs: Number.parseInt(el.cfgCycle.value, 10),
    quoteTimeoutMs: Number.parseInt(el.cfgQuoteTimeout.value, 10),
    maxConcurrentQuotes: Number.parseInt(el.cfgMaxQuotes.value, 10),
    slippageBps: Number.parseInt(el.cfgSlippage.value, 10),
    minProfitBps: Number.parseInt(el.cfgMinProfitBps.value, 10),
    minProfitAtomic: el.cfgMinProfitAtomic.value.trim(),
    computeUnitLimit: Number.parseInt(el.cfgComputeLimit.value, 10),
    computeUnitPriceMicroLamports: Number.parseInt(el.cfgComputePrice.value, 10),
    confirmationCommitment: el.cfgCommitment.value,
    dryRun: toBool(el.cfgDryRun.value),
    autoExecute: toBool(el.cfgAutoExecute.value),
    liveTradingEnabled: toBool(el.cfgLiveEnabled.value),
    requoteBeforeExecute: toBool(el.cfgRequote.value),
    preflightSimulationEnabled: toBool(el.cfgPreflight.value),
    dexes: el.cfgDexes.value
      .split(/[,\n]/g)
      .map((item) => item.trim())
      .filter(Boolean),
    routes,
  };
}

function setConfigInputs(config) {
  if (!config || state.configDirty) {
    return;
  }

  el.cfgRpcUrl.value = config.rpcUrl || "";
  el.cfgWsUrl.value = config.wsUrl || "";
  el.cfgJupiter.value = config.jupiterApiBase || "";
  el.cfgCycle.value = String(config.cycleIntervalMs ?? "");
  el.cfgQuoteTimeout.value = String(config.quoteTimeoutMs ?? "");
  el.cfgMaxQuotes.value = String(config.maxConcurrentQuotes ?? "");
  el.cfgSlippage.value = String(config.slippageBps ?? "");
  el.cfgMinProfitBps.value = String(config.minProfitBps ?? "");
  el.cfgMinProfitAtomic.value = String(config.minProfitAtomic ?? "");
  el.cfgComputeLimit.value = String(config.computeUnitLimit ?? "");
  el.cfgComputePrice.value = String(config.computeUnitPriceMicroLamports ?? "");
  el.cfgCommitment.value = String(config.confirmationCommitment || "confirmed");
  el.cfgDryRun.value = String(Boolean(config.dryRun));
  el.cfgAutoExecute.value = String(Boolean(config.autoExecute));
  el.cfgLiveEnabled.value = String(Boolean(config.liveTradingEnabled));
  el.cfgRequote.value = String(Boolean(config.requoteBeforeExecute));
  el.cfgPreflight.value = String(Boolean(config.preflightSimulationEnabled));
  el.cfgDexes.value = Array.isArray(config.dexes) ? config.dexes.join(", ") : "";
  el.cfgRoutes.value = JSON.stringify(config.routes || [], null, 2);
}

function renderLogs(logs) {
  const lines = (logs || [])
    .slice(-120)
    .map((entry) => {
      const ts = formatTs(entry.ts);
      const level = String(entry.level || "info").toUpperCase();
      const msg = String(entry.msg || "");
      const extras = [];
      if (entry.route) {
        extras.push(`route=${entry.route}`);
      }
      if (entry.expectedProfitBps != null) {
        extras.push(`profitBps=${entry.expectedProfitBps}`);
      }
      if (entry.signature) {
        extras.push(`sig=${entry.signature}`);
      }
      return `${ts} [${level}] ${msg}${extras.length > 0 ? ` (${extras.join(", ")})` : ""}`;
    });

  el.logs.textContent = lines.length > 0 ? lines.join("\n") : "No log events yet.";
  el.logs.scrollTop = el.logs.scrollHeight;
}

function renderStatus(status) {
  state.status = status;
  setConfigInputs(status.config);

  if (status.running) {
    el.runtimeBadge.textContent = "Running";
    el.runtimeBadge.dataset.state = "running";
  } else {
    el.runtimeBadge.textContent = "Stopped";
    el.runtimeBadge.dataset.state = "stopped";
  }

  const pidText = status.pid ? `PID ${status.pid}` : "No process";
  const started = status.engine?.startedAt ? `started ${formatTs(status.engine.startedAt)}` : "idle";
  el.runtimeMeta.textContent = `${pidText} • ${started}`;

  const scan = status.lastScan || {};
  const summaryParts = [];
  if (scan.route) {
    summaryParts.push(`Route ${scan.route}`);
  }
  if (scan.buyDex && scan.sellDex) {
    summaryParts.push(`${scan.buyDex} -> ${scan.sellDex}`);
  }
  if (scan.expectedProfitBps != null) {
    summaryParts.push(`Expected ${scan.expectedProfitBps} bps`);
  }
  if (scan.executedSignature) {
    summaryParts.push(`Executed ${scan.executedSignature}`);
  }
  if (scan.error) {
    summaryParts.push(`Error: ${scan.error}`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push("No completed scan yet.");
  }
  el.lastScan.textContent = `${summaryParts.join(" | ")} • updated ${formatTs(scan.ts)}`;

  const wallet = status.wallet || {};
  if (wallet.loaded) {
    el.walletSummary.textContent = `${wallet.addressShort} • ${formatSol(wallet.balanceLamports)} • updated ${formatTs(wallet.balanceUpdatedAt)}`;
  } else {
    el.walletSummary.textContent = "No wallet loaded.";
  }

  renderLogs(status.logs || []);
}

async function loadStatus() {
  const status = await api("/api/local/solana/bot/status");
  renderStatus(status);
}

async function onWalletImport() {
  const privateKey = el.walletPrivateKey.value.trim();
  if (!privateKey) {
    showMessage("Paste a private key first.", "warn");
    return;
  }

  await api("/api/local/solana/wallet/import", {
    method: "POST",
    body: JSON.stringify({ privateKey }),
  });
  el.walletPrivateKey.value = "";
  await loadStatus();
  showMessage("Wallet imported. Secret key is kept in memory only.", "ok");
}

async function onWalletClear() {
  await api("/api/local/solana/wallet/clear", {
    method: "POST",
  });
  await loadStatus();
  showMessage("Wallet cleared.", "ok");
}

async function onWalletRefresh() {
  await api("/api/local/solana/wallet/status");
  await loadStatus();
  showMessage("Wallet balance refreshed.", "ok");
}

async function onSaveConfig() {
  const patch = readConfigPatch();
  await api("/api/local/solana/bot/config", {
    method: "POST",
    body: JSON.stringify(patch),
  });
  state.configDirty = false;
  await loadStatus();
  showMessage("Configuration saved.", "ok");
}

async function onScanOnce() {
  await api("/api/local/solana/bot/scan", {
    method: "POST",
    body: JSON.stringify({
      trigger: "ui",
      allowExecute: false,
    }),
  });
  await loadStatus();
  showMessage("Single safe scan completed.", "ok");
}

async function onStart() {
  const liveEnabled = toBool(el.cfgLiveEnabled.value);
  const autoExecute = toBool(el.cfgAutoExecute.value);
  const dryRun = toBool(el.cfgDryRun.value);
  if (liveEnabled && autoExecute && !dryRun) {
    const proceed = window.confirm(
      "Live execution is enabled and dry-run is off. Continue starting the bot?",
    );
    if (!proceed) {
      return;
    }
  }

  await api("/api/local/solana/bot/start", {
    method: "POST",
  });
  await loadStatus();
  showMessage("Bot loop started.", "ok");
}

async function onStop() {
  await api("/api/local/solana/bot/stop", {
    method: "POST",
  });
  await loadStatus();
  showMessage("Bot loop stopped.", "ok");
}

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showMessage(message, "error");
  }
}

function trackConfigDirty() {
  const inputs = [
    el.cfgRpcUrl,
    el.cfgWsUrl,
    el.cfgJupiter,
    el.cfgCycle,
    el.cfgQuoteTimeout,
    el.cfgMaxQuotes,
    el.cfgSlippage,
    el.cfgMinProfitBps,
    el.cfgMinProfitAtomic,
    el.cfgComputeLimit,
    el.cfgComputePrice,
    el.cfgCommitment,
    el.cfgDryRun,
    el.cfgAutoExecute,
    el.cfgLiveEnabled,
    el.cfgRequote,
    el.cfgPreflight,
    el.cfgDexes,
    el.cfgRoutes,
  ];

  for (const input of inputs) {
    input.addEventListener("input", () => {
      state.configDirty = true;
    });
    input.addEventListener("change", () => {
      state.configDirty = true;
    });
  }
}

function bindEvents() {
  el.btnWalletImport.addEventListener("click", () => runAction(onWalletImport));
  el.btnWalletClear.addEventListener("click", () => runAction(onWalletClear));
  el.btnWalletRefresh.addEventListener("click", () => runAction(onWalletRefresh));
  el.btnRefresh.addEventListener("click", () => runAction(loadStatus));
  el.btnSaveConfig.addEventListener("click", () => runAction(onSaveConfig));
  el.btnScan.addEventListener("click", () => runAction(onScanOnce));
  el.btnStart.addEventListener("click", () => runAction(onStart));
  el.btnStop.addEventListener("click", () => runAction(onStop));
  trackConfigDirty();
}

async function init() {
  bindEvents();
  try {
    await loadStatus();
    showMessage("Connected to local Solana bot service.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showMessage(message, "error");
  }

  setInterval(() => {
    void loadStatus().catch(() => {
      // Keep background polling resilient.
    });
  }, POLL_INTERVAL_MS);
}

void init();
