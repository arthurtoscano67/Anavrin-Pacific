import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useCurrentClient, useDAppKit } from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { READY_AVATAR_MAX_EPOCHS } from "@pacific/shared";
import { SiteTabs } from "../components/SiteTabs";
import {
  fetchMarketplaceListings,
  fetchOwnedAvatarsFromBackend,
  type BackendOwnedAvatar,
} from "../lib/backend-avatar";
import {
  extendAvatarWalrusStorage,
  syncWalrusStorageRecord,
} from "../lib/avatar-chain";
import {
  buyAvatarListing,
  delistAvatar,
  listAvatarForSale,
  moveAvatarToKiosk,
  syncTrackedKiosks,
  takeAvatarToWallet,
} from "../lib/avatar-kiosk";
import {
  buildCurrentAvatarProfileHref,
  buildPublicAssetUrl,
} from "../lib/avatar-public";
import { buildAppPath, buildPublicAssetPath, buildQueryAppHref } from "../lib/app-paths";
import {
  queryControlledOnChainAvatars,
  queryListedOnChainAvatars,
} from "../lib/on-chain-avatar";
import { trackAnalyticsEvent } from "../lib/analytics";
import {
  ensureWalletSession,
  readAvailableWalletSession,
  type WalletSession,
} from "../lib/session";
import {
  describeWalrusRetention,
  fetchWalrusNetworkClock,
  type WalrusNetworkClock,
} from "../lib/walrus-storage";

const MARKETPLACE_FALLBACK_IMAGE = buildPublicAssetPath("/marketing/suiplay-fallback.png");

function shortId(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function previewForAvatar(avatar: BackendOwnedAvatar) {
  if (avatar.previewBlobId) {
    return buildPublicAssetUrl(avatar.previewBlobId);
  }

  if (avatar.previewUrl) {
    return avatar.previewUrl;
  }

  return MARKETPLACE_FALLBACK_IMAGE;
}

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
  const mist = whole * 1_000_000_000n + fraction;
  if (mist <= 0n) {
    throw new Error("Price must be greater than 0.");
  }

  return mist.toString();
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function formatIsoDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function buildPlayHref(avatar: BackendOwnedAvatar) {
  return buildQueryAppHref("/world", {
    mode: "shooter",
    fullscreen: "1",
    avatarObjectId: avatar.objectId,
    manifestBlobId: avatar.manifestBlobId,
  });
}

type OnChainAvatarRecord = Awaited<ReturnType<typeof queryControlledOnChainAvatars>>[number];

function toBackendAvatarFromOnChain(
  avatar: OnChainAvatarRecord,
  ownerWalletAddress: string | null,
): BackendOwnedAvatar {
  return {
    objectId: avatar.objectId,
    objectType: avatar.objectType,
    name: avatar.name,
    manifestBlobId: avatar.manifestBlobId,
    previewBlobId: avatar.previewBlobId,
    previewUrl: avatar.previewUrl,
    modelUrl: avatar.modelUrl,
    runtimeAvatarBlobId: null,
    txDigest: avatar.previousTransaction,
    status: "stored",
    runtimeReady: Boolean(avatar.manifestBlobId || avatar.modelUrl),
    updatedAt: null,
    isActive: false,
    location: avatar.location,
    kioskId: avatar.kioskId,
    isListed: avatar.isListed,
    listedPriceMist: avatar.listedPriceMist,
    ownerWalletAddress,
    source: "on-chain",
    shooterStats: avatar.shooterStats,
    shooterCharacter: avatar.shooterCharacter,
    walrusStorage: null,
  };
}

function mergeListingsByObjectId(
  backendListings: BackendOwnedAvatar[],
  onChainListings: BackendOwnedAvatar[],
) {
  const merged = new Map<string, BackendOwnedAvatar>();

  for (const listing of backendListings) {
    merged.set(listing.objectId, listing);
  }

  for (const listing of onChainListings) {
    const existing = merged.get(listing.objectId);
    if (!existing) {
      merged.set(listing.objectId, listing);
      continue;
    }

    merged.set(listing.objectId, {
      ...existing,
      objectType: existing.objectType ?? listing.objectType,
      name: existing.name ?? listing.name,
      manifestBlobId: existing.manifestBlobId ?? listing.manifestBlobId,
      previewBlobId: existing.previewBlobId ?? listing.previewBlobId,
      previewUrl: existing.previewUrl ?? listing.previewUrl,
      modelUrl: existing.modelUrl ?? listing.modelUrl,
      txDigest: existing.txDigest ?? listing.txDigest,
      location: listing.location,
      kioskId: listing.kioskId ?? existing.kioskId,
      isListed: existing.isListed || listing.isListed,
      listedPriceMist: listing.listedPriceMist ?? existing.listedPriceMist,
      ownerWalletAddress: existing.ownerWalletAddress ?? listing.ownerWalletAddress,
      source: existing.source,
    });
  }

  return [...merged.values()];
}

export function MarketplacePage() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const [walletSession, setWalletSession] = useState<WalletSession | null>(null);
  const [walletSessionError, setWalletSessionError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<BackendOwnedAvatar[]>([]);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [listings, setListings] = useState<BackendOwnedAvatar[]>([]);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [walrusClock, setWalrusClock] = useState<WalrusNetworkClock | null>(null);

  const loadInventory = useCallback(async () => {
    if (!account?.address) {
      setInventory([]);
      setInventoryError(null);
      return;
    }

    setLoadingInventory(true);
    try {
      const owned = await fetchOwnedAvatarsFromBackend(account.address);
      if (owned.avatars.length > 0) {
        setInventory(owned.avatars);
        setInventoryError(null);
        return;
      }

      const onChain = await queryControlledOnChainAvatars(account.address);
      setInventory(onChain.map((avatar) => toBackendAvatarFromOnChain(avatar, account.address)));
      setInventoryError(null);
    } catch (backendCaught) {
      try {
        const onChain = await queryControlledOnChainAvatars(account.address);
        setInventory(onChain.map((avatar) => toBackendAvatarFromOnChain(avatar, account.address)));
        setInventoryError(null);
      } catch (chainCaught) {
        const backendMessage =
          backendCaught instanceof Error
            ? backendCaught.message
            : "Inventory lookup failed.";
        const chainMessage =
          chainCaught instanceof Error ? chainCaught.message : "On-chain inventory lookup failed.";
        setInventory([]);
        setInventoryError(`${backendMessage} ${chainMessage}`);
      }
    } finally {
      setLoadingInventory(false);
    }
  }, [account?.address]);

  const loadListings = useCallback(async () => {
    setLoadingListings(true);
    let backendListings: BackendOwnedAvatar[] = [];
    let backendError: string | null = null;

    try {
      const result = await fetchMarketplaceListings();
      backendListings = result.listings;
    } catch (caught) {
      backendError = caught instanceof Error ? caught.message : "Marketplace lookup failed.";
    }

    try {
      const onChainListings = await queryListedOnChainAvatars();
      const normalizedOnChainListings = onChainListings.map((avatar) =>
        toBackendAvatarFromOnChain(avatar, null),
      );
      const mergedListings = mergeListingsByObjectId(backendListings, normalizedOnChainListings);
      setListings(mergedListings);

      if (backendError && mergedListings.length === 0) {
        setListingsError(backendError);
      } else {
        setListingsError(null);
      }
    } catch (chainCaught) {
      const chainMessage =
        chainCaught instanceof Error ? chainCaught.message : "On-chain marketplace lookup failed.";
      setListings(backendListings);

      if (backendError) {
        setListingsError(
          backendError.includes("Invalid marketplace response")
            ? chainMessage
            : `${backendError} ${chainMessage}`,
        );
      } else if (backendListings.length === 0) {
        setListingsError(chainMessage);
      } else {
        setListingsError(null);
      }
    } finally {
      setLoadingListings(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadInventory(), loadListings()]);
  }, [loadInventory, loadListings]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let cancelled = false;

    void fetchWalrusNetworkClock(client)
      .then((clock) => {
        if (!cancelled) {
          setWalrusClock(clock);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWalrusClock(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const ensureSession = useCallback(async () => {
    if (!account?.address) {
      throw new Error("Connect wallet first.");
    }

    const session = await ensureWalletSession(dAppKit, account.address, walletSession);
    setWalletSession(session);
    setWalletSessionError(null);
    return session;
  }, [account?.address, dAppKit, walletSession]);

  useEffect(() => {
    if (!account?.address) {
      setWalletSession(null);
      setWalletSessionError(null);
      return;
    }

    const storedSession = readAvailableWalletSession(account.address);
    setWalletSession(storedSession);
    setWalletSessionError(null);

    void syncTrackedKiosks(account.address)
      .then(() => loadListings())
      .catch(() => undefined);
  }, [account?.address, loadListings]);

  const runAction = useCallback(
    async (
      avatarId: string,
      callback: () => Promise<unknown>,
      successMessage: string,
      eventName?: string,
      eventParams?: Record<string, string | number | boolean | null | undefined>,
    ) => {
      setPendingId(avatarId);
      setActionError(null);
      setNotice(null);

      try {
        await callback();
        if (account?.address) {
          await syncTrackedKiosks(account.address).catch(() => undefined);
        }
        await refreshAll();
        setNotice(successMessage);
        if (eventName) {
          trackAnalyticsEvent(eventName, eventParams);
        }
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : "Marketplace action failed.");
      } finally {
        setPendingId(null);
      }
    },
    [account?.address, refreshAll],
  );

  const onList = useCallback(
    async (avatar: BackendOwnedAvatar) => {
      if (!account?.address) {
        setActionError("Connect wallet to list avatars.");
        return;
      }

      await runAction(
        avatar.objectId,
        () =>
          listAvatarForSale({
            dAppKit,
            walletAddress: account.address,
            avatar,
            priceMist: parseSuiToMist(priceInputs[avatar.objectId] ?? ""),
          }),
        "Avatar listed for sale.",
        "market_listed",
        {
          location: avatar.location,
          listed_price_sui: priceInputs[avatar.objectId] ?? "",
        },
      );
    },
    [account?.address, dAppKit, priceInputs, runAction],
  );

  const onDelist = useCallback(
    async (avatar: BackendOwnedAvatar) => {
      if (!account?.address) {
        setActionError("Connect wallet to delist avatars.");
        return;
      }

      await runAction(
        avatar.objectId,
        () =>
          delistAvatar({
            dAppKit,
            walletAddress: account.address,
            avatar,
          }),
        "Avatar delisted.",
        "market_delisted",
        {
          location: avatar.location,
        },
      );
    },
    [account?.address, dAppKit, runAction],
  );

  const onTake = useCallback(
    async (avatar: BackendOwnedAvatar) => {
      if (!account?.address) {
        setActionError("Connect wallet to move avatars back to the wallet.");
        return;
      }

      await runAction(
        avatar.objectId,
        () =>
          takeAvatarToWallet({
            dAppKit,
            walletAddress: account.address,
            avatar,
          }),
        "Avatar moved back to the wallet.",
        "move_to_wallet",
      );
    },
    [account?.address, dAppKit, runAction],
  );

  const onMoveToKiosk = useCallback(
    async (avatar: BackendOwnedAvatar) => {
      if (!account?.address) {
        setActionError("Connect wallet to move avatars into kiosk.");
        return;
      }

      await runAction(
        avatar.objectId,
        () =>
          moveAvatarToKiosk({
            dAppKit,
            walletAddress: account.address,
            avatar,
          }),
        "Avatar moved into kiosk storage.",
        "move_to_kiosk",
      );
    },
    [account?.address, dAppKit, runAction],
  );

  const onBuy = useCallback(
    async (avatar: BackendOwnedAvatar) => {
      if (!account?.address) {
        setActionError("Connect wallet to buy avatars.");
        return;
      }

      await runAction(
        avatar.objectId,
        () =>
          buyAvatarListing({
            dAppKit,
            walletAddress: account.address,
            avatar,
          }),
        "Avatar purchased. It is now ready in your kiosk and can be launched from Play.",
        "market_purchase",
        {
          listed_price_mist: avatar.listedPriceMist ?? "",
        },
      );
    },
    [account?.address, dAppKit, runAction],
  );

  const onRenewWalrus = useCallback(
    async (avatar: BackendOwnedAvatar) => {
      if (!account?.address) {
        setActionError("Connect wallet to extend Walrus storage.");
        return;
      }

      if (!avatar.walrusStorage) {
        setActionError("Walrus storage metadata is not available for this avatar yet.");
        return;
      }

      setPendingId(avatar.objectId);
      setActionError(null);
      setNotice(null);

      try {
        const renewed = await extendAvatarWalrusStorage({
          client,
          dAppKit,
          walrusStorage: avatar.walrusStorage,
          epochs: READY_AVATAR_MAX_EPOCHS,
        });

        let synced = false;
        try {
          const session = await ensureSession();
          await syncWalrusStorageRecord(session, avatar.objectId, renewed.walrusStorage);
          synced = true;
        } catch (caught) {
          setActionError(`Walrus renewed on chain, but backend sync failed: ${formatError(caught)}`);
        }

        await refreshAll();
        const retention = describeWalrusRetention(renewed.walrusStorage, walrusClock);
        setNotice(
          `Walrus storage extended (${renewed.digest}). ${retention.detail}${synced ? " Backend cache synced." : ""}`,
        );
        trackAnalyticsEvent("walrus_extended_market", {
          avatar_object_id_prefix: avatar.objectId.slice(0, 10),
          backend_synced: synced,
        });
      } catch (caught) {
        setActionError(formatError(caught));
      } finally {
        setPendingId(null);
      }
    },
    [account?.address, client, dAppKit, ensureSession, refreshAll, walrusClock],
  );

  const visibleListings = useMemo(
    () =>
      listings.filter(
        (avatar) =>
          avatar.isListed &&
          !inventory.some((inventoryAvatar) => inventoryAvatar.objectId === avatar.objectId) &&
          avatar.ownerWalletAddress !== account?.address,
      ),
    [account?.address, inventory, listings],
  );

  return (
    <div className="app-shell app-shell--minimal">
      <header className="app-topbar">
        <div className="brand-lockup">
          <a className="brand-mark" href={buildAppPath("/")}>
            Pacific
          </a>
          <p className="brand-subtitle">Marketplace</p>
        </div>
        <SiteTabs activeRoute="market" />
        <div className="wallet-shell">
          <ConnectButton />
        </div>
      </header>

      <main className="experience-shell">
        <section className="screen-hero screen-hero--runtime">
          <div className="screen-hero-copy">
            <p className="eyebrow">Unified ownership</p>
            <h1>Move between wallet NFT and kiosk, set any SUI price, renew Walrus, and play immediately.</h1>
            <p className="lede">
              The game inventory and marketplace both read direct wallet ownership and kiosk-held
              avatars. Sellers can set any SUI price, buyers pay in SUI, and owned avatars can
              renew Walrus storage without leaving the site. Transfers between wallet and kiosk are
              explicit, so users do not have to list just to store an avatar in kiosk.
            </p>
          </div>
          <div className="screen-hero-art">
            <img src={MARKETPLACE_FALLBACK_IMAGE} alt="SuiPlay marketplace fallback hero" />
            <div className="hero-art-caption">
              <span className="panel-label">Current flow</span>
              <strong>Mint, list, buy, play</strong>
              <p>Wallet, kiosk, sale, and Walrus renewal all run through the same connected-wallet flow.</p>
            </div>
          </div>
        </section>

        <section className="runtime-flow-layout runtime-flow-layout--selector">
          <article className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">My Inventory</p>
                <h2>Controlled avatars</h2>
              </div>
              <span className="section-badge">{inventory.length}</span>
            </div>
            {walletSessionError ? <div className="error-callout">{walletSessionError}</div> : null}
            {inventoryError ? <div className="error-callout">{inventoryError}</div> : null}
            {notice ? <div className="notice-callout">{notice}</div> : null}
            {actionError ? <div className="error-callout">{actionError}</div> : null}
            {!account?.address ? (
              <div className="notice-callout">Connect wallet to manage listings.</div>
            ) : loadingInventory ? (
              <div className="notice-callout">Loading wallet and kiosk inventory.</div>
            ) : inventory.length === 0 ? (
              <div className="notice-callout">No avatars found in the connected wallet or kiosks.</div>
            ) : (
              <div className="market-grid">
                {inventory.map((avatar) => (
                  <article key={avatar.objectId} className="market-card">
                    <img
                      className="market-card-image"
                      src={previewForAvatar(avatar)}
                      alt={`${avatar.name ?? "Avatar"} preview`}
                    />
                    <div className="market-card-copy">
                      {(() => {
                        const retention = describeWalrusRetention(avatar.walrusStorage, walrusClock);
                        return (
                          <>
                      <div className="section-head section-head--compact">
                        <div>
                          <h3>{avatar.name ?? "Unnamed avatar"}</h3>
                          <p>{shortId(avatar.objectId)}</p>
                        </div>
                        <span className="section-badge">
                          {avatar.location === "kiosk" ? "Kiosk" : "Wallet"}
                        </span>
                      </div>
                      <div className="market-meta">
                        <span>{avatar.shooterCharacter?.label ?? "Unknown class"}</span>
                        <span>
                          W {avatar.shooterStats.wins} · L {avatar.shooterStats.losses} · HP {avatar.shooterStats.hp}
                        </span>
                        <span>
                          {avatar.isListed
                            ? `Listed for ${formatMistAsSui(avatar.listedPriceMist)} SUI`
                            : avatar.kioskId
                              ? `Stored in ${shortId(avatar.kioskId)}`
                              : "Direct wallet ownership"}
                        </span>
                        <span>
                          {avatar.walrusStorage
                            ? `Walrus ${retention.shortLabel}`
                            : "Walrus storage unknown"}
                        </span>
                      </div>
                      {avatar.walrusStorage ? (
                        <div className="summary-grid">
                          <div className="summary-item">
                            <span>Walrus</span>
                            <strong>{retention.protectionLabel}</strong>
                          </div>
                          <div className="summary-item">
                            <span>Time left</span>
                            <strong>{retention.shortLabel}</strong>
                          </div>
                          <div className="summary-item">
                            <span>Expires</span>
                            <strong>{formatIsoDate(retention.expiresAt)}</strong>
                          </div>
                          <div className="summary-item">
                            <span>Renewal</span>
                            <strong>{retention.renewRecommended ? "Recommended" : "Healthy"}</strong>
                          </div>
                        </div>
                      ) : null}
                      <div className="field-inline">
                        <input
                          value={priceInputs[avatar.objectId] ?? ""}
                          onChange={(event) =>
                            setPriceInputs((current) => ({
                              ...current,
                              [avatar.objectId]: event.target.value,
                            }))
                          }
                          placeholder="Price in SUI"
                        />
                        <button
                          className="secondary-button"
                          disabled={pendingId === avatar.objectId}
                          onClick={() => void onList(avatar)}
                          type="button"
                        >
                          {avatar.isListed ? "Update Price" : "List For Sale"}
                        </button>
                      </div>
                      <div className="action-row action-row--tight">
                        {avatar.isListed ? (
                          <button
                            className="secondary-button"
                            disabled={pendingId === avatar.objectId}
                            onClick={() => void onDelist(avatar)}
                            type="button"
                          >
                            Delist
                          </button>
                        ) : null}
                        {avatar.location === "kiosk" ? (
                          <button
                            className="secondary-button"
                            disabled={pendingId === avatar.objectId}
                            onClick={() => void onTake(avatar)}
                            type="button"
                          >
                            Move To Wallet
                          </button>
                        ) : (
                          <button
                            className="secondary-button"
                            disabled={pendingId === avatar.objectId}
                            onClick={() => void onMoveToKiosk(avatar)}
                            type="button"
                          >
                            Move To Kiosk
                          </button>
                        )}
                        <button
                          className="secondary-button"
                          disabled={pendingId === avatar.objectId || !avatar.walrusStorage}
                          onClick={() => void onRenewWalrus(avatar)}
                          type="button"
                        >
                          {pendingId === avatar.objectId ? "Working..." : "Extend Walrus"}
                        </button>
                        <a className="secondary-button" href={buildPlayHref(avatar)}>
                          Play
                        </a>
                        <a
                          className="secondary-button"
                          href={buildCurrentAvatarProfileHref(avatar.objectId)}
                        >
                          Profile
                        </a>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Marketplace</p>
                <h2>Live kiosk listings</h2>
              </div>
              <span className="section-badge">{visibleListings.length}</span>
            </div>
            {listingsError ? <div className="error-callout">{listingsError}</div> : null}
            {loadingListings ? (
              <div className="notice-callout">Loading tracked kiosk listings.</div>
            ) : visibleListings.length === 0 ? (
              <div className="notice-callout">
                No tracked kiosk listings are live yet.
              </div>
            ) : (
              <div className="market-grid">
                {visibleListings.map((avatar) => (
                  <article key={`${avatar.kioskId}-${avatar.objectId}`} className="market-card">
                    <img
                      className="market-card-image"
                      src={previewForAvatar(avatar)}
                      alt={`${avatar.name ?? "Avatar"} preview`}
                    />
                    <div className="market-card-copy">
                      <div className="section-head section-head--compact">
                        <div>
                          <h3>{avatar.name ?? "Unnamed avatar"}</h3>
                          <p>{shortId(avatar.objectId)}</p>
                        </div>
                        <span className="section-badge">
                          {formatMistAsSui(avatar.listedPriceMist)} SUI
                        </span>
                      </div>
                      <div className="market-meta">
                        <span>{avatar.shooterCharacter?.label ?? "Unknown class"}</span>
                        <span>
                          Seller {shortId(avatar.ownerWalletAddress)}
                        </span>
                        <span>Kiosk {shortId(avatar.kioskId)}</span>
                      </div>
                      <div className="action-row action-row--tight">
                        <button
                          className="primary-button primary-button--wide"
                          disabled={!account?.address || pendingId === avatar.objectId}
                          onClick={() => void onBuy(avatar)}
                          type="button"
                        >
                          {pendingId === avatar.objectId
                            ? "Buying..."
                            : `Buy ${formatMistAsSui(avatar.listedPriceMist)} SUI`}
                        </button>
                        <a
                          className="secondary-button"
                          href={buildCurrentAvatarProfileHref(avatar.objectId)}
                        >
                          Profile
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}
