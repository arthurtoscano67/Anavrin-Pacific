import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useDAppKit, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { SiteTabs } from "../components/SiteTabs";
import {
  fetchOnChainMintSummary,
  fetchSiteAnalyticsSummary,
  type MintAnalyticsSummary,
  type SiteAnalyticsSummary,
} from "../lib/admin-metrics";
import {
  fetchAvatarMintConfig,
  setAvatarMintEnabled,
  setAvatarMintPrice,
  withdrawAvatarMintFees,
} from "../lib/avatar-chain";
import { fetchTransferPoliciesForType } from "../lib/avatar-kiosk";
import { buildAppPath } from "../lib/app-paths";
import { useAvatarAdminAccess } from "../lib/useAvatarAdminAccess";
import { webEnv } from "../env";

function formatMistAsSui(value: string | null | undefined) {
  const parsed = Number(value ?? "0");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "0";
  }

  return (parsed / 1_000_000_000).toFixed(parsed % 1_000_000_000 === 0 ? 0 : 3);
}

function parseSuiToMist(input: string) {
  const normalized = input.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(normalized)) {
    throw new Error("Enter a SUI price with up to 9 decimal places.");
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt((fractionalPart + "000000000").slice(0, 9));
  return (whole * 1_000_000_000n + fraction).toString();
}

function formatMetricCount(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatMetricTimestamp(value: string | null | undefined, fallback = "Unavailable") {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
}

export function AdminPage() {
  const account = useCurrentAccount();
  const walletConnection = useWalletConnection();
  const dAppKit = useDAppKit();
  const {
    adminCapId,
    isAdmin,
    checked: adminAccessChecked,
    loading: adminAccessLoading,
    error: adminAccessError,
  } =
    useAvatarAdminAccess(account?.address);
  const [mintConfig, setMintConfig] = useState<Awaited<ReturnType<typeof fetchAvatarMintConfig>>>(null);
  const [transferPolicyCount, setTransferPolicyCount] = useState(0);
  const [priceInput, setPriceInput] = useState("");
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteAnalytics, setSiteAnalytics] = useState<SiteAnalyticsSummary | null>(null);
  const [mintAnalytics, setMintAnalytics] = useState<MintAnalyticsSummary | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const isWalletSettling = walletConnection.isConnecting || walletConnection.isReconnecting;

  const avatarObjectType = useMemo(
    () => `${webEnv.avatarPackageId}::avatar::Avatar`,
    [],
  );

  const loadAdminState = useCallback(async () => {
    try {
      const [nextMintConfig, transferPolicies] = await Promise.all([
        fetchAvatarMintConfig(),
        fetchTransferPoliciesForType(avatarObjectType),
      ]);

      setMintConfig(nextMintConfig);
      setTransferPolicyCount(transferPolicies.length);
      if (nextMintConfig) {
        setPriceInput(formatMistAsSui(nextMintConfig.mintPriceMist));
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin state lookup failed.");
    }
  }, [account?.address, avatarObjectType]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);

    const [siteResult, mintResult] = await Promise.allSettled([
      fetchSiteAnalyticsSummary(),
      fetchOnChainMintSummary(),
    ]);

    const errors: string[] = [];

    if (siteResult.status === "fulfilled") {
      setSiteAnalytics(siteResult.value);
    } else {
      setSiteAnalytics(null);
      errors.push(siteResult.reason instanceof Error ? siteResult.reason.message : "Site analytics lookup failed.");
    }

    if (mintResult.status === "fulfilled") {
      setMintAnalytics(mintResult.value);
    } else {
      setMintAnalytics(null);
      errors.push(mintResult.reason instanceof Error ? mintResult.reason.message : "On-chain mint lookup failed.");
    }

    setMetricsError(errors.length > 0 ? errors.join(" ") : null);
    setMetricsLoading(false);
  }, []);

  useEffect(() => {
    void loadAdminState();
  }, [loadAdminState]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    void loadMetrics();
    const intervalId = window.setInterval(() => {
      void loadMetrics();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAdmin, loadMetrics]);

  const runAction = useCallback(
    async (label: string, callback: () => Promise<unknown>, successMessage: string) => {
      setPendingLabel(label);
      setNotice(null);
      setError(null);

      try {
        await callback();
        await loadAdminState();
        setNotice(successMessage);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Admin action failed.");
      } finally {
        setPendingLabel(null);
      }
    },
    [loadAdminState],
  );

  const canAdminister = Boolean(account?.address && adminCapId && mintConfig);

  if (isWalletSettling || adminAccessLoading || (Boolean(account?.address) && !adminAccessChecked)) {
    return (
      <div className="app-shell app-shell--minimal">
        <header className="app-topbar">
          <div className="brand-lockup">
            <a className="brand-mark" href={buildAppPath("/")}>
              Pacific
            </a>
            <p className="brand-subtitle">Admin controls</p>
          </div>
          <SiteTabs activeRoute="admin" />
          <div className="wallet-shell">
            <ConnectButton />
          </div>
        </header>

        <main className="experience-shell">
          <div className="notice-callout">Checking admin access.</div>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="app-shell app-shell--minimal">
        <header className="app-topbar">
          <div className="brand-lockup">
            <a className="brand-mark" href={buildAppPath("/")}>
              Pacific
            </a>
            <p className="brand-subtitle">Admin controls</p>
          </div>
          <SiteTabs activeRoute="start" />
          <div className="wallet-shell">
            <ConnectButton />
          </div>
        </header>

        <main className="experience-shell">
          <div className="error-callout">
            {adminAccessError ??
              (account?.address
                ? "Connected wallet is not an admin wallet."
                : "Connect the admin wallet to access admin controls.")}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--minimal">
      <header className="app-topbar">
        <div className="brand-lockup">
          <a className="brand-mark" href={buildAppPath("/")}>
            Pacific
          </a>
          <p className="brand-subtitle">Admin controls</p>
        </div>
        <SiteTabs activeRoute="admin" />
        <div className="wallet-shell">
          <ConnectButton />
        </div>
      </header>

      <main className="experience-shell">
        <section className="screen-hero screen-hero--runtime">
          <div className="screen-hero-copy">
            <p className="eyebrow">On-chain config</p>
            <h1>Transfer policy and mint price are controlled from the package, not the UI.</h1>
            <p className="lede">
              Kiosk trading requires a transfer policy, and robust mint pricing requires a shared
              treasury object plus an admin cap. This page manages those live objects.
            </p>
          </div>
          <div className="screen-hero-art">
            <img src={buildAppPath("/marketing/mint-preview.png")} alt="Pacific admin hero" />
            <div className="hero-art-caption">
              <span className="panel-label">Current package</span>
              <strong>{webEnv.avatarPackageId}</strong>
              <p>{transferPolicyCount > 0 ? "Transfer policy detected." : "No transfer policy detected yet."}</p>
            </div>
          </div>
        </section>

        <section className="runtime-flow-layout runtime-flow-layout--selector">
          <article className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Analytics</p>
                <h2>Live dashboard</h2>
              </div>
              <span className="section-badge">{metricsLoading ? "Syncing" : "Live"}</span>
            </div>
            <div className="action-row action-row--tight">
              <button
                className="secondary-button"
                disabled={metricsLoading}
                onClick={() => void loadMetrics()}
                type="button"
              >
                {metricsLoading ? "Refreshing" : "Refresh Metrics"}
              </button>
            </div>
            {metricsError ? <div className="error-callout">{metricsError}</div> : null}
            {!siteAnalytics && !mintAnalytics && !metricsError ? (
              <div className="notice-callout">Collecting visitor analytics and on-chain mint totals.</div>
            ) : null}
            <div className="summary-grid">
              <div className="summary-item">
                <span>Visitors</span>
                <strong>{formatMetricCount(siteAnalytics?.visitors.totalUnique)}</strong>
              </div>
              <div className="summary-item">
                <span>Visitors today</span>
                <strong>{formatMetricCount(siteAnalytics?.visitors.todayUnique)}</strong>
              </div>
              <div className="summary-item">
                <span>Page views</span>
                <strong>{formatMetricCount(siteAnalytics?.pageViews.total)}</strong>
              </div>
              <div className="summary-item">
                <span>Page views 30d</span>
                <strong>{formatMetricCount(siteAnalytics?.pageViews.last30Days)}</strong>
              </div>
              <div className="summary-item">
                <span>Mints</span>
                <strong>{formatMetricCount(mintAnalytics?.total)}</strong>
              </div>
              <div className="summary-item">
                <span>Mints today</span>
                <strong>{formatMetricCount(mintAnalytics?.today)}</strong>
              </div>
              <div className="summary-item">
                <span>Latest mint</span>
                <strong>{formatMetricTimestamp(mintAnalytics?.latestMintedAt, "No mints yet")}</strong>
              </div>
              <div className="summary-item">
                <span>Analytics zone</span>
                <strong>{siteAnalytics?.collectorTimeZone ?? "Unavailable"}</strong>
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary-item">
                <span>Wallet connects</span>
                <strong>{formatMetricCount(siteAnalytics?.events.total.wallet_connected)}</strong>
              </div>
              <div className="summary-item">
                <span>Play opens</span>
                <strong>{formatMetricCount(siteAnalytics?.events.total.play_opened)}</strong>
              </div>
              <div className="summary-item">
                <span>Mint success clicks</span>
                <strong>{formatMetricCount(siteAnalytics?.events.total.mint_success)}</strong>
              </div>
              <div className="summary-item">
                <span>Market sales listed</span>
                <strong>{formatMetricCount(siteAnalytics?.events.total.market_listed)}</strong>
              </div>
              <div className="summary-item">
                <span>Kiosk transfers</span>
                <strong>
                  {formatMetricCount(
                    (siteAnalytics?.events.total.move_to_kiosk ?? 0) +
                      (siteAnalytics?.events.total.move_to_wallet ?? 0),
                  )}
                </strong>
              </div>
              <div className="summary-item">
                <span>Last analytics event</span>
                <strong>{formatMetricTimestamp(siteAnalytics?.updatedAt)}</strong>
              </div>
            </div>
          </article>

          <article className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Status</p>
                <h2>Package state</h2>
              </div>
              <span className="section-badge">{transferPolicyCount}</span>
            </div>
            {notice ? <div className="notice-callout">{notice}</div> : null}
            {error ? <div className="error-callout">{error}</div> : null}
            {!webEnv.avatarTreasuryId ? (
              <div className="notice-callout">
                Set `VITE_AVATAR_TREASURY_ID` after publishing the upgraded package to enable
                on-chain price control.
              </div>
            ) : null}
            <div className="summary-grid">
              <div className="summary-item">
                <span>Admin cap</span>
                <strong>{adminCapId ?? "Not owned by connected wallet"}</strong>
              </div>
              <div className="summary-item">
                <span>Treasury</span>
                <strong>{(mintConfig?.treasuryObjectId ?? webEnv.avatarTreasuryId) || "Missing"}</strong>
              </div>
              <div className="summary-item">
                <span>Mint enabled</span>
                <strong>{mintConfig ? (mintConfig.mintEnabled ? "Yes" : "No") : "Unknown"}</strong>
              </div>
              <div className="summary-item">
                <span>Mint price</span>
                <strong>{mintConfig ? `${formatMistAsSui(mintConfig.mintPriceMist)} SUI` : "Unknown"}</strong>
              </div>
              <div className="summary-item">
                <span>Fees accrued</span>
                <strong>{mintConfig ? `${formatMistAsSui(mintConfig.feesMist)} SUI` : "Unknown"}</strong>
              </div>
              <div className="summary-item">
                <span>Transfer policy</span>
                <strong>{transferPolicyCount > 0 ? "Ready" : "Missing"}</strong>
              </div>
            </div>
          </article>

          <article className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Controls</p>
                <h2>Admin actions</h2>
              </div>
              <span className="section-badge">{canAdminister ? "Live" : "Locked"}</span>
            </div>
            {!account?.address ? (
              <div className="notice-callout">Connect the admin wallet to manage mint settings.</div>
            ) : !adminCapId ? (
              <div className="notice-callout">
                The connected wallet does not own `AvatarAdminCap`, so controls stay read-only.
              </div>
            ) : !mintConfig ? (
              <div className="notice-callout">
                Mint treasury data is unavailable. Publish the upgraded package and set
                `VITE_AVATAR_TREASURY_ID`.
              </div>
            ) : (
              <>
                <div className="field-inline">
                  <input
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                    placeholder="Mint price in SUI"
                  />
                  <button
                    className="secondary-button"
                    disabled={Boolean(pendingLabel)}
                    onClick={() =>
                      void runAction(
                        "Updating mint price",
                        () =>
                          setAvatarMintPrice({
                            dAppKit,
                            adminCapId,
                            priceMist: parseSuiToMist(priceInput),
                          }),
                        "Mint price updated.",
                      )
                    }
                    type="button"
                  >
                    {pendingLabel === "Updating mint price" ? pendingLabel : "Set Price"}
                  </button>
                </div>
                <div className="action-row action-row--tight">
                  <button
                    className="secondary-button"
                    disabled={Boolean(pendingLabel) || mintConfig.mintEnabled}
                    onClick={() =>
                      void runAction(
                        "Enabling mint",
                        () =>
                          setAvatarMintEnabled({
                            dAppKit,
                            adminCapId,
                            enabled: true,
                          }),
                        "Mint enabled.",
                      )
                    }
                    type="button"
                  >
                    Enable Mint
                  </button>
                  <button
                    className="secondary-button"
                    disabled={Boolean(pendingLabel) || !mintConfig.mintEnabled}
                    onClick={() =>
                      void runAction(
                        "Disabling mint",
                        () =>
                          setAvatarMintEnabled({
                            dAppKit,
                            adminCapId,
                            enabled: false,
                          }),
                        "Mint disabled.",
                      )
                    }
                    type="button"
                  >
                    Disable Mint
                  </button>
                  <button
                    className="primary-button"
                    disabled={Boolean(pendingLabel)}
                    onClick={() =>
                      void runAction(
                        "Withdrawing fees",
                        () =>
                          withdrawAvatarMintFees({
                            dAppKit,
                            adminCapId,
                            destinationAddress: account.address,
                          }),
                        "Mint fees withdrawn to the connected wallet.",
                      )
                    }
                    type="button"
                  >
                    Withdraw Fees
                  </button>
                </div>
              </>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
