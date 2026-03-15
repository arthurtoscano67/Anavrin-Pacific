import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { SiteTabs } from "../components/SiteTabs";
import {
  bootstrapAvatarMintConfig,
  fetchAvatarMintPricing,
  findOwnedMintAdminCapObjectId,
  findOwnedPublisherObjectId,
  updateAvatarMintConfig,
  type AvatarMintPricing,
} from "../lib/avatar-chain";
import {
  isConfiguredAvatarPackageId,
  setActiveAvatarPackageId,
  useActiveAvatarPackageId,
} from "../lib/active-avatar-package";
import { buildAppPath } from "../lib/app-paths";
import { formatMistToSui, formatMistToSuiLabel, parseSuiToMist } from "../lib/mint-price";
import { useAdminWalletAccess } from "../lib/use-admin-wallet-access";

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
  const activeAvatarPackageId = useActiveAvatarPackageId();
  const browserAdminAccess = useAdminWalletAccess(activeAvatarPackageId);
  const [selectedPackageId, setSelectedPackageId] = useState(activeAvatarPackageId);
  const normalizedSelectedPackageId = selectedPackageId.trim();
  const packageConfigured = isConfiguredAvatarPackageId(normalizedSelectedPackageId);

  const [configIdOverride, setConfigIdOverride] = useState<string | null>(null);
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
    async (overrideConfigId?: string | null, packageIdOverride?: string | null) => {
      const targetPackageId = (packageIdOverride ?? normalizedSelectedPackageId).trim();
      if (!packageConfigured) {
        setPricing(null);
        setPricingError(null);
        return;
      }

      setPricingLoading(true);
      try {
        const nextPricing = await fetchAvatarMintPricing(
          client,
          overrideConfigId ?? configIdOverride,
          targetPackageId,
        );
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
    [client, configIdOverride, normalizedSelectedPackageId, packageConfigured],
  );

  const refreshAccess = useCallback(async (packageIdOverride?: string | null) => {
    const targetPackageId = (packageIdOverride ?? normalizedSelectedPackageId).trim();
    if (!walletAddress || !isConfiguredAvatarPackageId(targetPackageId)) {
      setMintAdminCapObjectId(null);
      setPublisherObjectId(null);
      setAccessError(null);
      return {
        mintAdminCapId: null,
        publisherId: null,
      };
    }

    setAccessLoading(true);
    try {
      const [mintAdminCapId, publisherId] = await Promise.all([
        findOwnedMintAdminCapObjectId(walletAddress, targetPackageId),
        findOwnedPublisherObjectId(walletAddress, targetPackageId),
      ]);
      setMintAdminCapObjectId(mintAdminCapId);
      setPublisherObjectId(publisherId);
      setAccessError(null);
      return {
        mintAdminCapId,
        publisherId,
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to load admin access objects.";
      setMintAdminCapObjectId(null);
      setPublisherObjectId(null);
      setAccessError(message);
      return {
        mintAdminCapId: null,
        publisherId: null,
      };
    } finally {
      setAccessLoading(false);
    }
  }, [normalizedSelectedPackageId, walletAddress]);

  useEffect(() => {
    void refreshPricing();
  }, [refreshPricing]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    setConfigIdOverride(null);
    setPriceDirty(false);
    setTreasuryDirty(false);
    setNotice(null);
    setError(null);
  }, [normalizedSelectedPackageId]);

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
  const canUseSelectedPackage = Boolean(
    packageConfigured && normalizedSelectedPackageId !== activeAvatarPackageId && !busyLabel,
  );
  const canActivatePackage = Boolean(
    supportsPaidMint &&
      walletAddress &&
      publisherObjectId &&
      !configReady &&
      parsedMintPriceMist &&
      treasuryValid &&
      !busyLabel,
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
        ? "Publisher detected. This wallet can activate the first paid-mint config for this package."
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
          ? "No mint config exists yet. Activate it once from the admin wallet."
          : "This package is still on the legacy free-mint path.";

  const handleUseSelectedPackage = useCallback(() => {
    if (!packageConfigured) {
      setError("Enter a valid package ID first.");
      return;
    }

    setActiveAvatarPackageId(normalizedSelectedPackageId);
    setNotice(
      normalizedSelectedPackageId === activeAvatarPackageId
        ? `Using ${normalizedSelectedPackageId} already.`
        : `Active browser package switched to ${normalizedSelectedPackageId}. Mint and play now target this package in this browser.`,
    );
    setError(null);
  }, [activeAvatarPackageId, normalizedSelectedPackageId, packageConfigured]);

  const handleActivatePackage = useCallback(async () => {
    if (!walletAddress) {
      setError("Connect the admin wallet first.");
      return;
    }

    if (!publisherObjectId) {
      setError("Connect the wallet that owns the package Publisher object first.");
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

    setBusyLabel("Activating package...");
    setNotice(null);
    setError(null);

    try {
      const bootstrapped = await bootstrapAvatarMintConfig(dAppKit, {
        publisherObjectId,
        packageIdOverride: normalizedSelectedPackageId,
      });
      const nextPricing = await fetchAvatarMintPricing(
        client,
        bootstrapped.mintConfigId,
        normalizedSelectedPackageId,
      );
      if (!nextPricing.configId) {
        throw new Error("Package activated but mint config could not be located afterward.");
      }

      const nextMintAdminCapId = await findOwnedMintAdminCapObjectId(
        walletAddress,
        normalizedSelectedPackageId,
      );
      if (!nextMintAdminCapId) {
        throw new Error("Package activated but MintAdminCap was not found in the connected wallet.");
      }

      const updated = await updateAvatarMintConfig(dAppKit, {
        mintAdminCapObjectId: nextMintAdminCapId,
        mintConfigId: nextPricing.configId,
        treasury: treasuryInput.trim(),
        mintPriceMist: parsedMintPriceMist,
        packageIdOverride: normalizedSelectedPackageId,
      });
      setConfigIdOverride(nextPricing.configId);
      await Promise.all([
        refreshPricing(nextPricing.configId, normalizedSelectedPackageId),
        refreshAccess(normalizedSelectedPackageId),
      ]);
      setPriceDirty(false);
      setTreasuryDirty(false);
      setNotice(
        `Package activated and priced at ${formatMistToSuiLabel(parsedMintPriceMist)}. Bootstrap tx ${bootstrapped.digest}; price tx ${updated.digest}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Package activation failed.");
    } finally {
      setBusyLabel(null);
    }
  }, [
    client,
    dAppKit,
    normalizedSelectedPackageId,
    parsedMintPriceMist,
    publisherObjectId,
    refreshAccess,
    refreshPricing,
    treasuryInput,
    treasuryValid,
    walletAddress,
  ]);

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
        packageIdOverride: normalizedSelectedPackageId,
      });
      await Promise.all([
        refreshPricing(pricing.configId, normalizedSelectedPackageId),
        refreshAccess(normalizedSelectedPackageId),
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
    normalizedSelectedPackageId,
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
        <SiteTabs activeRoute="admin" showAdmin={browserAdminAccess.isAdmin} />
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
              {configReady ? "Live config" : supportsPaidMint ? "Activation required" : "Legacy package"}
            </span>
          </div>
          <p className="section-copy">
            This page writes the on-chain Pacific mint config. Regular minters will pay whatever price is
            currently stored here.
          </p>
          <div className="summary-grid">
            <div className="summary-item">
              <span>Selected package</span>
              <strong>{packageConfigured ? normalizedSelectedPackageId : "Enter a package ID"}</strong>
            </div>
            <div className="summary-item">
              <span>Active in browser</span>
              <strong>{activeAvatarPackageId || "Not set"}</strong>
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
                <h2>Activate or update</h2>
              </div>
              <span className="section-badge">On chain</span>
            </div>
            <p className="section-copy">
              Pick the package, make it active in this browser if needed, then activate or update the paid mint
              config with your custom price and treasury.
            </p>
            <div className="form-stack">
              <label className="form-field">
                <span>Package ID</span>
                <input
                  value={selectedPackageId}
                  onChange={(event) => setSelectedPackageId(event.target.value)}
                  placeholder="0x..."
                />
              </label>
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
              <li>The package field changes which Move package the admin page inspects and targets.</li>
              <li>Use the package switch first if you want Mint and Play to target the new package in this browser.</li>
              <li>Price accepts up to 9 decimals because Sui uses 1,000,000,000 mist per SUI.</li>
              <li>Only the wallet holding `MintAdminCap` can change treasury or price.</li>
              <li>Package activation is the one-time package-upgrade migration step.</li>
            </ul>
            <div className="action-row">
              <button
                className="secondary-button"
                disabled={!canUseSelectedPackage}
                onClick={handleUseSelectedPackage}
                type="button"
              >
                Use package in browser
              </button>
              {!configReady ? (
                <button
                  className="secondary-button"
                  disabled={!canActivatePackage}
                  onClick={() => void handleActivatePackage()}
                  type="button"
                >
                  {busyLabel && busyLabel.includes("Activating") ? busyLabel : "Activate package"}
                </button>
              ) : null}
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
