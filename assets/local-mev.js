const els = {
  statusBadges: document.getElementById("status-badges"),
  scanSummary: document.getElementById("scan-summary"),
  laneSummary: document.getElementById("lane-summary"),
  adaptiveSummary: document.getElementById("adaptive-summary"),
  unwindSummary: document.getElementById("unwind-summary"),
  flowSummary: document.getElementById("flow-summary"),
  rpcSummary: document.getElementById("rpc-summary"),
  equitySummary: document.getElementById("equity-summary"),
  equityMeta: document.getElementById("equity-meta"),
  equityChart: document.getElementById("equity-chart"),
  walletSummary: document.getElementById("wallet-summary"),
  logs: document.getElementById("logs"),

  walletPrivateKey: document.getElementById("wallet-private-key"),

  cfgNetwork: document.getElementById("cfg-network"),
  cfgInterval: document.getElementById("cfg-interval"),
  cfgTradeSize: document.getElementById("cfg-trade-size"),
  cfgProfit: document.getElementById("cfg-profit"),
  cfgProfitSui: document.getElementById("cfg-profit-sui"),
  cfgSlippage: document.getElementById("cfg-slippage"),
  cfgDepth: document.getElementById("cfg-depth"),
  cfgMaxRouteDev: document.getElementById("cfg-max-route-dev"),
  cfgTokenUniverse: document.getElementById("cfg-token-universe"),
  cfgMaxPairs: document.getElementById("cfg-max-pairs"),
  cfgDryRun: document.getElementById("cfg-dry-run"),
  cfgLive: document.getElementById("cfg-live"),
  cfgAuto: document.getElementById("cfg-auto"),
  cfgPreflightDryRun: document.getElementById("cfg-preflight-dry-run"),
  cfgGasMultiplier: document.getElementById("cfg-gas-mult"),
  cfgGasBudgetMultiplier: document.getElementById("cfg-gas-budget-mult"),
  cfgDualLane: document.getElementById("cfg-dual-lane"),
  cfgFastInterval: document.getElementById("cfg-fast-interval"),
  cfgFastTokenTarget: document.getElementById("cfg-fast-token-target"),
  cfgFastMaxPairs: document.getElementById("cfg-fast-max-pairs"),
  cfgFastConcurrency: document.getElementById("cfg-fast-concurrency"),
  cfgSlowInterval: document.getElementById("cfg-slow-interval"),
  cfgSlowTokenTarget: document.getElementById("cfg-slow-token-target"),
  cfgSlowMaxPairs: document.getElementById("cfg-slow-max-pairs"),
  cfgSlowConcurrency: document.getElementById("cfg-slow-concurrency"),
  cfgAdaptiveEnabled: document.getElementById("cfg-adaptive-enabled"),
  cfgAdaptiveRate: document.getElementById("cfg-adaptive-rate"),
  cfgBackrunOnly: document.getElementById("cfg-backrun-only"),
  cfgBackrunConfirmations: document.getElementById("cfg-backrun-confirmations"),
  cfgBackrunTimeout: document.getElementById("cfg-backrun-timeout"),
  cfgFlowEnabled: document.getElementById("cfg-flow-enabled"),
  cfgFlowMinSui: document.getElementById("cfg-flow-min-sui"),
  cfgFlowLookback: document.getElementById("cfg-flow-lookback"),
  cfgFlowMaxTx: document.getElementById("cfg-flow-max-tx"),
  cfgFlowCooldown: document.getElementById("cfg-flow-cooldown"),
  cfgFlowPollMs: document.getElementById("cfg-flow-poll-ms"),
  cfgUnwindEnabled: document.getElementById("cfg-unwind-enabled"),
  cfgUnwindHoldMs: document.getElementById("cfg-unwind-hold-ms"),
  cfgUnwindStopLoss: document.getElementById("cfg-unwind-stop-loss"),
  cfgUnwindMinSui: document.getElementById("cfg-unwind-min-sui"),
  cfgProviders: document.getElementById("cfg-providers"),
  cfgTokens: document.getElementById("cfg-tokens"),

  btnRefresh: document.getElementById("btn-refresh"),
  btnScan: document.getElementById("btn-scan"),
  btnStart: document.getElementById("btn-start"),
  btnStop: document.getElementById("btn-stop"),
  btnWalletImport: document.getElementById("btn-wallet-import"),
  btnWalletClear: document.getElementById("btn-wallet-clear"),
  btnConfigSave: document.getElementById("btn-config-save"),
};

let latestStatus = null;
let refreshInFlight = false;

function setSummary(message) {
  els.scanSummary.textContent = message;
}

function makeBadge(label, level = "warn") {
  const safeLabel = String(label || "");
  const safeLevel = ["good", "warn", "bad"].includes(level) ? level : "warn";
  return `<span class="badge"><span class="dot ${safeLevel}"></span>${safeLabel}</span>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(json.error || `Request failed (${response.status})`);
  }

  return json;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatSui(value, fractionDigits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

function formatPercent(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return `${(numeric * 100).toFixed(digits)}%`;
}

function formatSigned(value, digits = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(digits)}`;
}

function formatSignedPercent(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${(numeric * 100).toFixed(digits)}%`;
}

function drawEquityChart(equity) {
  const canvas = els.equityChart;
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const history = Array.isArray(equity?.history) ? equity.history : [];
  const points = history.map((entry) => Number(entry?.balanceSui)).filter((value) => Number.isFinite(value));

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
  const height = Math.max(1, Math.round(rect.height || 220));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0a1a24");
  bg.addColorStop(1, "#08131b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  if (points.length === 0) {
    ctx.fillStyle = "#9fc6de";
    ctx.font = '12px "JetBrains Mono", "IBM Plex Mono", monospace';
    ctx.fillText("No SUI balance samples yet.", 14, 22);
    return;
  }

  const left = 14;
  const right = 10;
  const top = 12;
  const bottom = 24;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);

  const minBalance = Math.min(...points);
  const maxBalance = Math.max(...points);
  const spread = Math.max(maxBalance - minBalance, Math.max(0.0005, maxBalance * 0.005));
  const yMin = minBalance - spread * 0.12;
  const yMax = maxBalance + spread * 0.12;
  const yRange = Math.max(1e-12, yMax - yMin);

  ctx.strokeStyle = "rgba(159, 198, 222, 0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + plotWidth, y);
    ctx.stroke();
  }

  const startBalance = points[0];
  const yStart = top + ((yMax - startBalance) / yRange) * plotHeight;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "rgba(244, 183, 64, 0.5)";
  ctx.beginPath();
  ctx.moveTo(left, yStart);
  ctx.lineTo(left + plotWidth, yStart);
  ctx.stroke();
  ctx.setLineDash([]);

  const trendUp = points[points.length - 1] >= startBalance;
  const lineColor = trendUp ? "#36d399" : "#f87272";
  const fillColor = trendUp ? "rgba(54, 211, 153, 0.16)" : "rgba(248, 114, 114, 0.16)";

  const toX = (index) => {
    if (points.length <= 1) {
      return left + plotWidth;
    }
    return left + (index / (points.length - 1)) * plotWidth;
  };
  const toY = (balance) => top + ((yMax - balance) / yRange) * plotHeight;

  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const x = toX(i);
    const y = toY(points[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(left + plotWidth, top + plotHeight);
  ctx.lineTo(left, top + plotHeight);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const x = toX(i);
    const y = toY(points[i]);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  const xLast = toX(points.length - 1);
  const yLast = toY(points[points.length - 1]);
  ctx.fillStyle = lineColor;
  ctx.beginPath();
  ctx.arc(xLast, yLast, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#9fc6de";
  ctx.font = '11px "JetBrains Mono", "IBM Plex Mono", monospace';
  ctx.fillText(`max ${formatSui(maxBalance, 4)} SUI`, left, 12);
  ctx.fillText(`min ${formatSui(minBalance, 4)} SUI`, left, height - 7);
}

function fillConfig(config) {
  if (!config) {
    return;
  }

  els.cfgNetwork.value = config.network;
  els.cfgInterval.value = String(config.cycleIntervalMs ?? "");
  els.cfgTradeSize.value = String(config.tradeAmountSui ?? "");
  els.cfgProfit.value = String(config.minProfitBps ?? "");
  els.cfgProfitSui.value = String(config.minProfitSui ?? "");
  els.cfgSlippage.value = String(config.slippageBps ?? "");
  els.cfgDepth.value = String(config.maxDepth ?? "");
  els.cfgMaxRouteDev.value = String(config.maxRouteDeviationBps ?? "");
  els.cfgTokenUniverse.value = String(config.tokenUniverseTarget ?? "");
  els.cfgMaxPairs.value = String(config.maxPairCandidates ?? "");
  els.cfgDryRun.value = String(Boolean(config.dryRun));
  els.cfgLive.value = String(Boolean(config.liveTradingEnabled));
  els.cfgAuto.value = String(Boolean(config.autoExecute));
  els.cfgPreflightDryRun.value = String(Boolean(config.preflightDryRunEnabled));
  els.cfgGasMultiplier.value = String(config.priorityGasMultiplier ?? "");
  els.cfgGasBudgetMultiplier.value = String(config.gasBudgetMultiplier ?? "");
  els.cfgDualLane.value = String(Boolean(config.dualLaneEnabled));
  els.cfgFastInterval.value = String(config.fastLaneIntervalMs ?? "");
  els.cfgFastTokenTarget.value = String(config.fastLaneTokenUniverseTarget ?? "");
  els.cfgFastMaxPairs.value = String(config.fastLaneMaxPairCandidates ?? "");
  els.cfgFastConcurrency.value = String(config.fastLaneMaxQuoteConcurrency ?? "");
  els.cfgSlowInterval.value = String(config.slowLaneIntervalMs ?? "");
  els.cfgSlowTokenTarget.value = String(config.slowLaneTokenUniverseTarget ?? "");
  els.cfgSlowMaxPairs.value = String(config.slowLaneMaxPairCandidates ?? "");
  els.cfgSlowConcurrency.value = String(config.slowLaneMaxQuoteConcurrency ?? "");
  els.cfgAdaptiveEnabled.value = String(Boolean(config.adaptiveEnabled));
  els.cfgAdaptiveRate.value = String(config.adaptiveLearningRate ?? "");
  els.cfgBackrunOnly.value = String(Boolean(config.backrunOnly));
  els.cfgBackrunConfirmations.value = String(config.backrunConfirmations ?? "");
  els.cfgBackrunTimeout.value = String(config.backrunWaitTimeoutMs ?? "");
  els.cfgFlowEnabled.value = String(Boolean(config.confirmedFlowEnabled));
  els.cfgFlowMinSui.value = String(config.confirmedFlowMinNotionalSui ?? "");
  els.cfgFlowLookback.value = String(config.confirmedFlowLookbackCheckpoints ?? "");
  els.cfgFlowMaxTx.value = String(config.confirmedFlowMaxTxPerCheckpoint ?? "");
  els.cfgFlowCooldown.value = String(config.confirmedFlowCooldownMs ?? "");
  els.cfgFlowPollMs.value = String(config.confirmedFlowPollIntervalMs ?? "");
  els.cfgUnwindEnabled.value = String(Boolean(config.unwindEnabled));
  els.cfgUnwindHoldMs.value = String(config.unwindMaxHoldMs ?? "");
  els.cfgUnwindStopLoss.value = String(config.unwindStopLossBps ?? "");
  els.cfgUnwindMinSui.value = String(config.unwindMinSuiOut ?? "");
  els.cfgProviders.value = Array.isArray(config.providers) ? config.providers.join(", ") : "";
  els.cfgTokens.value = JSON.stringify(config.tokens || [], null, 2);
}

function renderLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    els.logs.textContent = "No activity yet.";
    return;
  }

  const lines = [...logs]
    .reverse()
    .map((entry) => {
      const details = entry.details ? ` ${JSON.stringify(entry.details)}` : "";
      return `[${entry.ts}] ${entry.type}: ${entry.label}${details}`;
    });

  els.logs.textContent = lines.join("\n");
}

function renderStatus(status) {
  latestStatus = status;

  const { wallet, config, runtime } = status;
  const adaptive = runtime.adaptive || {};
  const sizing = runtime.sizing || {};
  const safety = runtime.safety || {};
  const routeHealth = runtime.routeHealth || {};
  const persistence = runtime.persistence || {};
  const equity = runtime.equity || {};
  const reactor = runtime.reactor || {};
  const rpc = runtime.rpc || {};
  const lanes = runtime.lanes || {};
  const unwind = runtime.unwind || {};
  const loopState = runtime.enabled ? (runtime.running ? "running" : runtime.nextRunAt ? "scheduled" : "idle") : "stopped";

  const badges = [
    makeBadge(`bot: ${runtime.enabled ? "enabled" : "disabled"}`, runtime.enabled ? "good" : "warn"),
    makeBadge(`loop: ${loopState}`, runtime.running ? "good" : "warn"),
    makeBadge(`scan: ${runtime.running ? "running" : "idle"}`, runtime.running ? "good" : "warn"),
    makeBadge(`dryRun: ${config.dryRun ? "on" : "off"}`, config.dryRun ? "warn" : "bad"),
    makeBadge(`wallet: ${wallet.configured ? "loaded" : "none"}`, wallet.configured ? "good" : "warn"),
    makeBadge(`network: ${config.network}`, "warn"),
    makeBadge(`dualLane: ${config.dualLaneEnabled ? "on" : "off"}`, config.dualLaneEnabled ? "good" : "warn"),
    makeBadge(`adaptive: ${config.adaptiveEnabled ? "on" : "off"}`, config.adaptiveEnabled ? "good" : "warn"),
    makeBadge(
      `size: x${Number.isFinite(Number(sizing.multiplier)) ? Number(sizing.multiplier).toFixed(2) : "1.00"}`,
      Number(sizing.multiplier || 1) >= 1 ? "good" : "warn",
    ),
    makeBadge(`safety: ${safety.pauseLiveUntil ? "paused" : "active"}`, safety.pauseLiveUntil ? "bad" : "good"),
    makeBadge(`state: ${persistence.degraded ? "degraded" : "ok"}`, persistence.degraded ? "bad" : "good"),
    makeBadge(`backrun: ${config.backrunOnly ? "on" : "off"}`, config.backrunOnly ? "good" : "warn"),
    makeBadge(`flow: ${config.confirmedFlowEnabled ? "on" : "off"}`, config.confirmedFlowEnabled ? "good" : "warn"),
    makeBadge(`unwind: ${config.unwindEnabled ? "on" : "off"}`, config.unwindEnabled ? "good" : "warn"),
  ];

  els.statusBadges.innerHTML = badges.join("");

  const walletLine = wallet.configured
    ? `Wallet ${wallet.addressMasked} (${wallet.scheme}) imported ${formatDateTime(wallet.importedAt)} | SUI=${formatSui(
        wallet.suiBalanceSui,
      )} | encryptionKey=${wallet.encryptionReady ? "set" : "missing"}`
    : `No wallet imported | encryptionKey=${wallet.encryptionReady ? "set" : "missing"}`;

  els.walletSummary.textContent = walletLine;

  const fastLane = lanes.fast || {};
  const slowLane = lanes.slow || {};
  const laneLineFast = `fast[next=${formatDateTime(fastLane.nextRunAt)} last=${formatDateTime(
    fastLane.lastRunAt,
  )} dur=${fastLane.lastDurationMs ?? "-"}ms busySkips=${fastLane.skippedBusy ?? 0}]`;
  const laneLineSlow = `slow[next=${formatDateTime(slowLane.nextRunAt)} last=${formatDateTime(
    slowLane.lastRunAt,
  )} dur=${slowLane.lastDurationMs ?? "-"}ms busySkips=${slowLane.skippedBusy ?? 0}]`;
  els.laneSummary.textContent = `Lanes ${config.dualLaneEnabled ? "dual" : "single"} | ${laneLineFast} | ${laneLineSlow}`;

  const metrics = adaptive.lastMetrics || {};
  const decision = adaptive.lastDecision || {};
  const guard = safety.lastGuard || null;
  const guardStatus = guard ? (guard.allowed ? "allow" : "block") : "n/a";
  const guardRequired = guard?.requiredProfitBps != null ? `${Number(guard.requiredProfitBps).toFixed(1)}bps` : "-";
  const guardReason = !guard?.allowed && Array.isArray(guard?.reasons) && guard.reasons.length > 0 ? guard.reasons[0] : "";
  const pauseSuffix = safety.pauseLiveUntil
    ? ` | pauseUntil=${formatDateTime(safety.pauseLiveUntil)} (${safety.pauseReason || "guard"})`
    : "";
  const sizingMultiplier = Number(sizing.multiplier || 1);
  const sizingEwmaPnl = Number(sizing.ewmaPnlSui);
  const sizingEwmaWinRate = Number(sizing.ewmaWinRate);
  const sizingSummary = ` | sizeMult=${Number.isFinite(sizingMultiplier) ? sizingMultiplier.toFixed(2) : "-"} | pnlEwma=${
    Number.isFinite(sizingEwmaPnl) ? formatSigned(sizingEwmaPnl, 4) : "-"
  } SUI | winEwma=${Number.isFinite(sizingEwmaWinRate) ? `${(sizingEwmaWinRate * 100).toFixed(1)}%` : "-"}`;
  els.adaptiveSummary.textContent = `Adaptive ${config.adaptiveEnabled ? "on" : "off"} | samples=${adaptive.sampleCount ?? 0} | oppRate=${
    metrics.opportunityRate != null ? (metrics.opportunityRate * 100).toFixed(1) : "-"
  }% | errRate=${metrics.errorRate != null ? (metrics.errorRate * 100).toFixed(1) : "-"}% | equity=${
    metrics.equityGrowthPct != null ? (metrics.equityGrowthPct * 100).toFixed(2) : "-"
  }% | dd=${metrics.equityDrawdownPct != null ? (metrics.equityDrawdownPct * 100).toFixed(2) : "-"}% | decision=${
    decision.status || "none"
  }${decision.reason ? ` (${decision.reason})` : ""} | guard=${guardStatus} req=${guardRequired}${
    guardReason ? ` (${guardReason})` : ""
  }${pauseSuffix}${sizingSummary}`;

  const equityPoints = Array.isArray(equity.history) ? equity.history.length : 0;
  if (!wallet.configured) {
    els.equitySummary.textContent = "No wallet loaded. Import wallet to track SUI balance.";
    els.equityMeta.textContent = "Goal: keep SUI equity curve positive.";
  } else if (equityPoints === 0) {
    els.equitySummary.textContent = "No balance samples yet. Run a scan to start equity tracking.";
    els.equityMeta.textContent = `current SUI=${formatSui(wallet.suiBalanceSui)} | updated=${formatDateTime(
      wallet.suiBalanceUpdatedAt,
    )}`;
  } else {
    els.equitySummary.textContent = `SUI now=${formatSui(equity.currentSui)} | start=${formatSui(
      equity.startSui,
    )} | peak=${formatSui(equity.peakSui)} | change=${formatSigned(equity.changeSui, 4)} (${formatSignedPercent(
      equity.changePct,
      2,
    )}) | drawdown=${formatPercent(equity.drawdownPct, 2)}`;
    els.equityMeta.textContent = `samples=${equityPoints} | downRate=${formatPercent(
      equity.downStepRate,
      1,
    )} | streak=${Number(equity.negativeStreak || 0)} | updated=${formatDateTime(equity.lastUpdatedAt)} (${
      equity.lastSource || "-"
    })`;
  }
  drawEquityChart(equity);

  const tracked = unwind.trackedPositions && typeof unwind.trackedPositions === "object" ? unwind.trackedPositions : {};
  const trackedCount = Object.keys(tracked).length;
  const unwindAction = unwind.lastAction || null;
  const unwindActionDigest = unwindAction?.digest ? ` ${String(unwindAction.digest).slice(0, 12)}...` : "";
  const unwindActionSummary = unwindAction
    ? `${unwindAction.status || "done"} ${unwindAction.symbol || ""}${unwindActionDigest}`.trim()
    : "none";
  els.unwindSummary.textContent = `Unwind ${config.unwindEnabled ? "on" : "off"} | tracked=${trackedCount} | lastRun=${formatDateTime(
    unwind.lastRunAt,
  )} | lastAction=${unwindActionSummary}`;

  const lastSignal = reactor.lastSignal || null;
  const signalSummary = lastSignal
    ? `cp=${lastSignal.checkpoint} | SUI=${formatSui(lastSignal.largestAbsSui)} | ${lastSignal.pressure || "mixed"}`
    : "none";
  els.flowSummary.textContent = `Confirmed flow reactor ${config.confirmedFlowEnabled ? "on" : "off"} | lastCheck=${formatDateTime(
    reactor.lastCheckedAt,
  )} | next=${formatDateTime(reactor.nextCheckAt)} | lastSignal=${signalSummary}${reactor.pendingImmediate ? " | queued=true" : ""}`;

  const cooldown = Number(rpc.writeCooldownRemainingMs || 0);
  const deferredEquity = rpc.deferred?.equityRetryAt || "-";
  const deferredUnwind = rpc.deferred?.unwindRetryAt || "-";
  const persistenceBackoff = Number(persistence.backoffRemainingMs || 0);
  const persistenceState = persistence.degraded
    ? `${persistence.reason || "write-error"}${persistenceBackoff > 0 ? `/${persistenceBackoff}ms` : ""}`
    : "ok";
  const activeRouteCooldowns = Number(routeHealth.activeRouteCooldowns || 0);
  const activeTokenCooldowns = Number(routeHealth.activeTokenCooldowns || 0);
  els.rpcSummary.textContent = `RPC read=${rpc.readEndpoint || "-"} | write=${rpc.writeEndpoint || "-"} | writeCooldown=${
    cooldown > 0 ? `${cooldown}ms` : "off"
  } | deferred[equity=${deferredEquity}, unwind=${deferredUnwind}] | persist=${persistenceState} | persistFails=${
    persistence.failedWrites ?? 0
  } | toxicCooldowns[route=${activeRouteCooldowns}, token=${activeTokenCooldowns}]`;

  const lastScan = runtime.lastScanResult;
  if (!lastScan) {
    setSummary("No scan yet.");
  } else if (lastScan.error) {
    setSummary(`Last scan error (${formatDateTime(lastScan.finishedAt)}): ${lastScan.error}`);
  } else {
    const cycle = lastScan.opportunity?.cycle?.join(" -> ") || "none";
    const profit = lastScan.opportunity?.expectedProfitBps?.toFixed
      ? `${lastScan.opportunity.expectedProfitBps.toFixed(2)} bps`
      : "-";
    const trade = lastScan.trade
      ? `${lastScan.trade.dryRun ? "simulated" : "executed"} | profit=${lastScan.trade.profitBps} bps`
      : "not executed";
    const backrun = lastScan.backrun
      ? lastScan.backrun.confirmed
        ? "confirmed"
        : `blocked (${lastScan.backrun.reason || "timeout"})`
      : "n/a";
    const unwindState = lastScan.unwind
      ? lastScan.unwind.ran
        ? `actions=${Array.isArray(lastScan.unwind.actions) ? lastScan.unwind.actions.length : 0}`
        : lastScan.unwind.reason || "skipped"
      : "n/a";
    const walletEquityState = lastScan.walletEquity
      ? ` | sui=${formatSui(lastScan.walletEquity.balanceSui)} (${formatSigned(lastScan.walletEquity.deltaSui, 4)})`
      : "";
    const executionGuard = lastScan.executionGuard || null;
    const guardSummary = executionGuard
      ? ` | guard=${executionGuard.allowed ? "allow" : "block"} req=${Number(
          executionGuard.requiredProfitBps || 0,
        ).toFixed(1)}bps size=${formatSui(executionGuard.adjustedStartAmountSui, 4)}`
      : "";
    const executionValidation = lastScan.executionValidation || null;
    const validationProfitBps = Number(executionValidation?.profitBps);
    const validationProfitSuffix = Number.isFinite(validationProfitBps) ? ` ${validationProfitBps.toFixed(1)}bps` : "";
    const requoteCount = Number(executionValidation?.requoteCount || 0);
    const requoteDrift = Number(executionValidation?.requoteDriftBps);
    const requoteSuffix =
      requoteCount > 0
        ? ` q=${requoteCount}${Number.isFinite(requoteDrift) ? ` drift=${requoteDrift.toFixed(1)}bps` : ""}`
        : "";
    const validationSummary = executionValidation
      ? executionValidation.valid
        ? ` | liveCheck=ok${validationProfitSuffix}${requoteSuffix}`
        : ` | liveCheck=reject (${executionValidation.reason || "failed"}${validationProfitSuffix}${requoteSuffix})`
      : "";
    const tradeErrorSummary = lastScan.tradeError ? ` | reason=${lastScan.tradeError}` : "";
    const nextRun = runtime.enabled && runtime.nextRunAt ? ` | next=${formatDateTime(runtime.nextRunAt)}` : "";
    const lane = lastScan.lane ? ` | lane=${lastScan.lane}` : "";
    const tokensSummary =
      lastScan.tokenUniverseSize != null
        ? ` | tokens=${lastScan.scannedTokens ?? "-"} / ${lastScan.tokenUniverseSize}`
        : "";

    setSummary(
      `Last scan ${formatDateTime(lastScan.finishedAt)}${lane}${tokensSummary} | pairs=${lastScan.scannedPairs}/${lastScan.executablePairs} | cycle=${cycle} | expected=${profit}${guardSummary}${validationSummary} | trade=${trade}${tradeErrorSummary} | backrun=${backrun} | unwind=${unwindState}${walletEquityState}${nextRun}`,
    );
  }

  fillConfig(config);
  renderLogs(runtime.logs);
}

async function refreshStatus() {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  try {
    const status = await api("/api/local/mev/status");
    renderStatus(status);
  } finally {
    refreshInFlight = false;
  }
}

async function onScan() {
  setSummary("Running scan...");
  await api("/api/local/mev/scan", { method: "POST", body: JSON.stringify({ trigger: "ui" }) });
  await refreshStatus();
}

async function onStart() {
  await api("/api/local/mev/start", { method: "POST" });
  await refreshStatus();
}

async function onStop() {
  await api("/api/local/mev/stop", { method: "POST" });
  await refreshStatus();
}

async function onImportWallet() {
  const privateKey = els.walletPrivateKey.value.trim();
  if (!privateKey) {
    throw new Error("Paste a private key first.");
  }

  await api("/api/local/wallet/import", {
    method: "POST",
    body: JSON.stringify({ privateKey }),
  });

  els.walletPrivateKey.value = "";
  await refreshStatus();
}

async function onClearWallet() {
  await api("/api/local/wallet/clear", { method: "POST" });
  await refreshStatus();
}

async function onSaveConfig() {
  const patch = {
    network: els.cfgNetwork.value,
    cycleIntervalMs: Number(els.cfgInterval.value),
    tradeAmountSui: els.cfgTradeSize.value,
    minProfitBps: Number(els.cfgProfit.value),
    minProfitSui: els.cfgProfitSui.value.trim(),
    slippageBps: Number(els.cfgSlippage.value),
    maxDepth: Number(els.cfgDepth.value),
    maxRouteDeviationBps: Number(els.cfgMaxRouteDev.value),
    tokenUniverseTarget: Number(els.cfgTokenUniverse.value),
    maxPairCandidates: Number(els.cfgMaxPairs.value),
    dryRun: els.cfgDryRun.value === "true",
    liveTradingEnabled: els.cfgLive.value === "true",
    autoExecute: els.cfgAuto.value === "true",
    preflightDryRunEnabled: els.cfgPreflightDryRun.value === "true",
    priorityGasMultiplier: Number(els.cfgGasMultiplier.value),
    gasBudgetMultiplier: Number(els.cfgGasBudgetMultiplier.value),
    dualLaneEnabled: els.cfgDualLane.value === "true",
    fastLaneIntervalMs: Number(els.cfgFastInterval.value),
    fastLaneTokenUniverseTarget: Number(els.cfgFastTokenTarget.value),
    fastLaneMaxPairCandidates: Number(els.cfgFastMaxPairs.value),
    fastLaneMaxQuoteConcurrency: Number(els.cfgFastConcurrency.value),
    slowLaneIntervalMs: Number(els.cfgSlowInterval.value),
    slowLaneTokenUniverseTarget: Number(els.cfgSlowTokenTarget.value),
    slowLaneMaxPairCandidates: Number(els.cfgSlowMaxPairs.value),
    slowLaneMaxQuoteConcurrency: Number(els.cfgSlowConcurrency.value),
    adaptiveEnabled: els.cfgAdaptiveEnabled.value === "true",
    adaptiveLearningRate: Number(els.cfgAdaptiveRate.value),
    backrunOnly: els.cfgBackrunOnly.value === "true",
    backrunConfirmations: Number(els.cfgBackrunConfirmations.value),
    backrunWaitTimeoutMs: Number(els.cfgBackrunTimeout.value),
    confirmedFlowEnabled: els.cfgFlowEnabled.value === "true",
    confirmedFlowMinNotionalSui: els.cfgFlowMinSui.value.trim(),
    confirmedFlowLookbackCheckpoints: Number(els.cfgFlowLookback.value),
    confirmedFlowMaxTxPerCheckpoint: Number(els.cfgFlowMaxTx.value),
    confirmedFlowCooldownMs: Number(els.cfgFlowCooldown.value),
    confirmedFlowPollIntervalMs: Number(els.cfgFlowPollMs.value),
    unwindEnabled: els.cfgUnwindEnabled.value === "true",
    unwindMaxHoldMs: Number(els.cfgUnwindHoldMs.value),
    unwindStopLossBps: Number(els.cfgUnwindStopLoss.value),
    unwindMinSuiOut: els.cfgUnwindMinSui.value.trim(),
  };

  const providersRaw = els.cfgProviders.value.trim();
  if (providersRaw) {
    patch.providers = providersRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const tokensRaw = els.cfgTokens.value.trim();
  if (tokensRaw) {
    patch.tokens = JSON.parse(tokensRaw);
  }

  await api("/api/local/mev/config", {
    method: "POST",
    body: JSON.stringify(patch),
  });

  await refreshStatus();
}

function wireAction(element, handler) {
  element.addEventListener("click", async () => {
    try {
      element.disabled = true;
      await handler();
    } catch (error) {
      setSummary(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      element.disabled = false;
    }
  });
}

wireAction(els.btnRefresh, refreshStatus);
wireAction(els.btnScan, onScan);
wireAction(els.btnStart, onStart);
wireAction(els.btnStop, onStop);
wireAction(els.btnWalletImport, onImportWallet);
wireAction(els.btnWalletClear, onClearWallet);
wireAction(els.btnConfigSave, onSaveConfig);

refreshStatus().catch((error) => {
  setSummary(`Failed to load status: ${error instanceof Error ? error.message : String(error)}`);
});

setInterval(() => {
  refreshStatus().catch(() => {});
}, 3000);
