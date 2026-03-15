import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { SiteTabs } from "../components/SiteTabs";
import { webEnv } from "../env";
import {
  bootstrapAvatarMintConfig,
  fetchAvatarMintPricing,
  findOwnedMintAdminCapObjectId,
  findOwnedPublisherObjectId,
  updateAvatarMintConfig,
  type AvatarMintPricing,
} from "../lib/avatar-chain";
import { buildAppPath } from "../lib/app-paths";
import { formatMistToSui, formatMistToSuiLabel, parseSuiToMist } from "../lib/mint-price";

function hasConfiguredAvatarPackageId(packageId: string) {
  return /^0x[0-9a-fA-F]+$/.test(packageId) && !/^0x0+$/.test(packageId);
}

function formatWalletAddress(value: string | null) {
  if (!value) {
    return "Wallet not connected";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function isValidSuiAddress(value: string) {
  return /^0x[0-9a-fA-F]{1,64}$/.test(value.trim());
}

export function AdminPage() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const walletAddress = account?.address ?? null;
  const packageConfigured = hasConfiguredAvatarPackageId(webEnv.avatarPackageId);

  const [configIdOverride, setConfigIdOverride] = useState<string | null>(
    webEnv.avatarMintConfigId.trim() || null,
  );
  const [pricing, setPricing] = useState<AvatarMintPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [mintAdminCapObjectId, setMintAdminCapObjectId] = useState<string | null>(null);
  const [publisherObjectId, setPublisherObjectId] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [mintPriceInput, setMintPriceInput] = useState("");
  const [treasuryInput, setTreasuryInput] = useState("");
  const [priceDirty, setPriceDirty] = useState(false);
  const [treasuryDirty, setTreasuryDirty] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshPricing = useCallback(
    async (overrideConfigId?: string | null) => {
      if (!packageConfigured) {
        setPricing(null);
        setPricingError(null);
        return;
      }

      setPricingLoading(true);
      try {
        const nextPricing = await fetchAvatarMintPricing(client, overrideConfigId ?? configIdOverride);
        setPricing(nextPricing);
        setPricingError(null);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Failed to load mint pricing.";
        setPricing(null);
        setPricingError(message);
      } finally {
        setPricingLoading(false);
      }
    },
    [client, configIdOverride, packageConfigured],
  );

  const refreshAccess = useCallback(async () => {
    if (!walletAddress || !packageConfigured) {
      setMintAdminCapObjectId(null);
      setPublisherObjectId(null);
      setAccessError(null);
      return;
    }

    setAccessLoading(true);
    try {
      const [mintAdminCapId, publisherId] = await Promise.all([
        findOwnedMintAdminCapObjectId(walletAddress),
        findOwnedPublisherObjectId(walletAddress),
      ]);
      setMintAdminCapObjectId(mintAdminCapId);
      setPublisherObjectId(publisherId);
      setAccessError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to load admin access objects.";
      setMintAdminCapObjectId(null);
      setPublisherObjectId(null);
      setAccessError(message);
    } finally {
      setAccessLoading(false);
    }
  }, [packageConfigured, walletAddress]);

  useEffect(() => {
    void refreshPricing();
  }, [refreshPricing]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    if (!priceDirty) {
      setMintPriceInput(pricing?.mode === "paid" ? formatMistToSui(pricing.mintPriceMist) : "5");
    }
  }, [priceDirty, pricing]);

  useEffect(() => {
    if (treasuryDirty) {
      return;
    }

    if (pricing?.treasury) {
      setTreasuryInput(pricing.treasury);
      return;
    }

    if (walletAddress) {
      setTreasuryInput(walletAddress);
    }
  }, [pricing?.treasury, treasuryDirty, walletAddress]);

  const parsedMintPriceMist = useMemo(() => parseSuiToMist(mintPriceInput), [mintPriceInput]);
  const treasuryValid = useMemo(() => isValidSuiAddress(treasuryInput), [treasuryInput]);
  const supportsPaidMint = pricing?.target === "avatar-paid-v2";
  const configReady = Boolean(pricing?.mode === "paid" && pricing.configId);
  const canBootstrap = Boolean(
    supportsPaidMint && walletAddress && publisherObjectId && !configReady && !busyLabel,
  );
  const canUpdate = Boolean(
    supportsPaidMint &&
      walletAddress &&
      mintAdminCapObjectId &&
      pricing?.configId &&
      parsedMintPriceMist &&
      treasuryValid &&
      !busyLabel,
  );

  const accessLabel = accessLoading
    ? "Checking wallet-owned admin objects."
    : mintAdminCapObjectId
      ? "Mint admin cap detected in this wallet."
      : publisherObjectId
        ? "Publisher detected. Bootstrap can mint the first admin cap/config for this package."
        : walletAddress
          ? "Connected wallet does not hold the package Publisher or MintAdminCap."
          : "Connect the admin wallet to manage pricing.";

  const configLabel = pricingLoading
    ? "Reading on-chain mint pricing."
    : pricingError
      ? pricingError
      : pricing?.mode === "paid" && pricing.configId
        ? `${formatMistToSuiLabel(pricing.mintPriceMist)} -> ${pricing.treasury ?? "treasury pending"}`
        : pricing?.mode === "paid"
          ? "No mint config exists yet. Bootstrap it once from the admin wallet."
          : "This package is still on the legacy free-mint path.";

  const handleBootstrap = useCallback(async () => {
    if (!publisherObjectId) {
      setError("Connect the wallet that owns the package Publisher object first.");
      return;
    }

    setBusyLabel("Bootstrapping mint config...");
    setNotice(null);
    setError(null);

    try {
      const bootstrapped = await bootstrapAvatarMintConfig(dAppKit, {
        publisherObjectId,
      });
      if (bootstrapped.mintConfigId) {
        setConfigIdOverride(bootstrapped.mintConfigId);
      }
      await Promise.all([
        refreshPricing(bootstrapped.mintConfigId),
        refreshAccess(),
      ]);
      setPriceDirty(false);
      setTreasuryDirty(false);
      setNotice(
        `Mint config bootstrapped in ${bootstrapped.digest}. Current price now reads from chain.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mint config bootstrap failed.");
    } finally {
      setBusyLabel(null);
    }
  }, [dAppKit, publisherObjectId, refreshAccess, refreshPricing]);

  const handleUpdate = useCallback(async () => {
    if (!pricing?.configId) {
      setError("Mint config is not initialized yet.");
      return;
    }

    if (!mintAdminCapObjectId) {
      setError("Connect the wallet that owns MintAdminCap before updating price.");
      return;
    }

    if (!parsedMintPriceMist) {
      setError("Enter a valid SUI mint price with up to 9 decimals.");
      return;
    }

    if (!treasuryValid) {
      setError("Enter a valid treasury wallet address.");
      return;
    }

    setBusyLabel("Updating mint price...");
    setNotice(null);
    setError(null);

    try {
      const updated = await updateAvatarMintConfig(dAppKit, {
        mintAdminCapObjectId,
        mintConfigId: pricing.configId,
        treasury: treasuryInput.trim(),
        mintPriceMist: parsedMintPriceMist,
      });
      await Promise.all([
        refreshPricing(pricing.configId),
        refreshAccess(),
      ]);
      setPriceDirty(false);
      setTreasuryDirty(false);
      setNotice(
        `Mint price updated to ${formatMistToSuiLabel(parsedMintPriceMist)} in ${updated.digest}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mint config update failed.");
    } finally {
      setBusyLabel(null);
    }
  }, [
    dAppKit,
    mintAdminCapObjectId,
    parsedMintPriceMist,
    pricing?.configId,
    refreshAccess,
    refreshPricing,
    treasuryInput,
    treasuryValid,
  ]);

  return (
    <div className="app-shell app-shell--minimal">
      <header className="app-topbar">
        <div className="brand-lockup">
          <a className="brand-mark" href={buildAppPath("/")}>
            Pacific
          </a>
          <p className="brand-subtitle">Mint pricing admin</p>
        </div>
        <SiteTabs activeRoute="admin" />
        <div className="wallet-shell">
          <ConnectButton />
        </div>
      </header>

      <main className="experience-shell">
        <section className="phase-screen admin-hero">
          <div className="phase-head">
            <div>
              <p className="eyebrow">Admin console</p>
              <h2>Control paid mint pricing.</h2>
            </div>
            <span className="section-badge">
              {configReady ? "Live config" : supportsPaidMint ? "Bootstrap required" : "Legacy package"}
            </span>
          </div>
          <p className="section-copy">
            This page writes the on-chain Pacific mint config. Regular minters will pay whatever price is
            currently stored here.
          </p>
          <div className="summary-grid">
            <div className="summary-item">
              <span>Package</span>
              <strong>{packageConfigured ? webEnv.avatarPackageId : "Set VITE_AVATAR_PACKAGE_ID"}</strong>
            </div>
            <div className="summary-item">
              <span>Connected wallet</span>
              <strong>{formatWalletAddress(walletAddress)}</strong>
            </div>
            <div className="summary-item">
              <span>Mint mode</span>
              <strong>{supportsPaidMint ? "Paid mint" : pricing?.target ? "Legacy free mint" : "Checking"}</strong>
            </div>
            <div className="summary-item">
              <span>Current price</span>
              <strong>
                {pricing?.mode === "paid" && pricing.configId
                  ? formatMistToSuiLabel(pricing.mintPriceMist)
                  : supportsPaidMint
                    ? "Not initialized"
                    : "Free"}
              </strong>
            </div>
            <div className="summary-item">
              <span>Mint config</span>
              <strong>{pricing?.configId ?? "Not created yet"}</strong>
            </div>
            <div className="summary-item">
              <span>Treasury</span>
              <strong>{pricing?.treasury ?? "Not set"}</strong>
            </div>
          </div>
        </section>

        <section className="admin-grid">
          <section className="phase-screen">
            <div className="phase-head">
              <div>
                <p className="eyebrow">Chain status</p>
                <h2>Current access</h2>
              </div>
              <span className="section-badge">Wallet gated</span>
            </div>
            <p className="section-copy">On-chain ownership decides admin rights. The UI only reflects what this wallet can currently do.</p>
            <div className="summary-grid">
              <div className="summary-item">
                <span>Pricing status</span>
                <strong>{configLabel}</strong>
              </div>
              <div className="summary-item">
                <span>Admin status</span>
                <strong>{accessLabel}</strong>
              </div>
              <div className="summary-item">
                <span>Mint admin cap</span>
                <strong>{mintAdminCapObjectId ?? "Not in this wallet"}</strong>
              </div>
              <div className="summary-item">
                <span>Publisher object</span>
                <strong>{publisherObjectId ?? "Not in this wallet"}</strong>
              </div>
            </div>
            {supportsPaidMint && !configReady ? (
              <div className="notice-callout">
                Existing packages need one bootstrap transaction after upgrade. That transaction consumes the
                package Publisher object, creates the shared mint config, and transfers MintAdminCap to the
                current wallet.
              </div>
            ) : null}
            {!supportsPaidMint && !pricingLoading && !pricingError ? (
              <div className="notice-callout">
                This package does not expose `mint_paid` yet. Publish or upgrade the paid-mint Move package
                before using this page for production pricing.
              </div>
            ) : null}
          </section>

          <section className="phase-screen">
            <div className="phase-head">
              <div>
                <p className="eyebrow">Controls</p>
                <h2>Bootstrap or update</h2>
              </div>
              <span className="section-badge">On chain</span>
            </div>
            <p className="section-copy">
              Set the mint price in SUI and the payout treasury. Changes apply to the shared mint config, not
              local browser state.
            </p>
            <div className="form-stack">
              <label className="form-field">
                <span>Mint price (SUI)</span>
                <input
                  value={mintPriceInput}
                  onChange={(event) => {
                    setPriceDirty(true);
                    setMintPriceInput(event.target.value);
                  }}
                  placeholder="5"
                />
              </label>
              <label className="form-field">
                <span>Treasury wallet</span>
                <input
                  value={treasuryInput}
                  onChange={(event) => {
                    setTreasuryDirty(true);
                    setTreasuryInput(event.target.value);
                  }}
                  placeholder="0x..."
                />
              </label>
            </div>
            <ul className="check-list check-list--muted">
              <li>Price accepts up to 9 decimals because Sui uses 1,000,000,000 mist per SUI.</li>
              <li>Only the wallet holding `MintAdminCap` can change treasury or price.</li>
              <li>Bootstrap is a one-time package-upgrade migration step.</li>
            </ul>
            <div className="action-row">
              <button
                className="secondary-button"
                disabled={!canBootstrap}
                onClick={() => void handleBootstrap()}
                type="button"
              >
                {busyLabel && busyLabel.includes("Bootstrapping") ? busyLabel : "Bootstrap config"}
              </button>
              <button
                className="primary-button"
                disabled={!canUpdate}
                onClick={() => void handleUpdate()}
                type="button"
              >
                {busyLabel && busyLabel.includes("Updating") ? busyLabel : "Update price"}
              </button>
            </div>
            {parsedMintPriceMist && !pricingLoading ? (
              <div className="summary-grid admin-summary-grid">
                <div className="summary-item">
                  <span>Stored as</span>
                  <strong>{parsedMintPriceMist} mist</strong>
                </div>
                <div className="summary-item">
                  <span>Preview</span>
                  <strong>{formatMistToSuiLabel(parsedMintPriceMist)}</strong>
                </div>
              </div>
            ) : null}
          </section>
        </section>

        {pricingError ? <div className="error-callout">{pricingError}</div> : null}
        {accessError ? <div className="error-callout">{accessError}</div> : null}
        {notice ? <div className="notice-callout">{notice}</div> : null}
        {error ? <div className="error-callout">{error}</div> : null}
      </main>
    </div>
  );
}
