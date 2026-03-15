import { useEffect, useMemo, useState } from "react";
import { SiteTabs } from "../components/SiteTabs";
import { buildAppPath, buildQueryAppHref } from "../lib/app-paths";
import { useActiveAvatarPackageId } from "../lib/active-avatar-package";
import { fetchOnChainAvatarMetadata, loadWalrusPreviewObjectUrl, type OnChainAvatarMetadata } from "../lib/avatar-onchain";
import {
  buildAvatarProfileUrl,
  buildShooterStatsSummary,
  isPublicHttpUrl,
} from "../lib/avatar-public";
import { useAdminWalletAccess } from "../lib/use-admin-wallet-access";

type LoadState = "idle" | "loading" | "ready" | "error";

export function AvatarProfilePage() {
  const activeAvatarPackageId = useActiveAvatarPackageId();
  const adminWalletAccess = useAdminWalletAccess(activeAvatarPackageId);
  const avatarObjectId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("avatarObjectId");
  }, []);
  const [profile, setProfile] = useState<OnChainAvatarMetadata | null>(null);
  const [state, setState] = useState<LoadState>(avatarObjectId ? "loading" : "error");
  const [error, setError] = useState<string | null>(
    avatarObjectId ? null : "Missing avatarObjectId in the profile link.",
  );
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy Link");

  useEffect(() => {
    if (!avatarObjectId) {
      return;
    }

    let cancelled = false;
    setState("loading");
    setError(null);

    void fetchOnChainAvatarMetadata(avatarObjectId)
      .then((nextProfile) => {
        if (cancelled) {
          return;
        }

        setProfile(nextProfile);
        setState("ready");
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Profile lookup failed.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [avatarObjectId]);

  useEffect(() => {
    if (!profile) {
      setPreviewSrc(null);
      return;
    }

    if (isPublicHttpUrl(profile.previewUrl)) {
      setPreviewSrc(profile.previewUrl);
      return;
    }

    if (!profile.previewBlobId) {
      setPreviewSrc(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    void loadWalrusPreviewObjectUrl(profile.previewBlobId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        objectUrl = url;
        setPreviewSrc(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewSrc(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [profile]);

  const shareUrl = avatarObjectId ? buildAvatarProfileUrl(avatarObjectId) : window.location.href;
  const statsSummary = profile ? buildShooterStatsSummary(profile.shooterStats) : "W 0 | L 0 | HP 100";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel("Link Copied");
      window.setTimeout(() => setCopyLabel("Copy Link"), 1500);
    } catch {
      setCopyLabel("Copy Failed");
      window.setTimeout(() => setCopyLabel("Copy Link"), 1500);
    }
  };

  return (
    <div className="app-shell app-shell--minimal profile-shell">
      <header className="app-topbar">
        <div className="brand-lockup">
          <a className="brand-mark" href={buildAppPath("/")}>
            Pacific
          </a>
          <p className="brand-subtitle">Public operator profile</p>
        </div>
        <SiteTabs activeRoute="start" showAdmin={adminWalletAccess.isAdmin} />
        <div className="profile-topbar-actions">
          <button className="secondary-button" onClick={handleCopyLink} type="button">
            {copyLabel}
          </button>
          <a className="primary-button" href={buildQueryAppHref("/unity")}>
            Play
          </a>
        </div>
      </header>

      <main className="experience-shell">
        <section className="profile-hero">
          <div className="profile-media">
            {previewSrc ? (
              <img src={previewSrc} alt={`${profile?.name ?? "Pacific"} operator preview`} />
            ) : (
              <div className="profile-media-fallback">Pacific</div>
            )}
          </div>
          <div className="profile-copy">
            <p className="eyebrow">Sui operator NFT</p>
            <h1>{profile?.name ?? "Operator profile"}</h1>
            <p className="lede">
              {profile?.description || "Wallet-owned Pacific operator stored on Sui + Walrus."}
            </p>
            <div className="profile-stat-row">
              <div className="profile-stat-card">
                <span>Wins</span>
                <strong>{profile?.shooterStats.wins ?? 0}</strong>
              </div>
              <div className="profile-stat-card">
                <span>Losses</span>
                <strong>{profile?.shooterStats.losses ?? 0}</strong>
              </div>
              <div className="profile-stat-card">
                <span>HP</span>
                <strong>{profile?.shooterStats.hp ?? 100}</strong>
              </div>
            </div>
            <div className="hero-chip-row">
              <span className="hero-chip">{statsSummary}</span>
              <span className="hero-chip">{profile?.objectType ? "On-chain verified" : "Loading"}</span>
            </div>
          </div>
        </section>

        <section className="runtime-flow-layout runtime-flow-layout--selector">
          <article className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Operator</p>
                <h2>Chain record</h2>
              </div>
              <span className="section-badge">{state === "ready" ? "Live" : "Pending"}</span>
            </div>
            {error ? <div className="error-callout">{error}</div> : null}
            {state === "loading" ? (
              <div className="notice-callout">Loading operator from Sui.</div>
            ) : null}
            {profile ? (
              <div className="summary-grid">
                <div className="summary-item">
                  <span>Object ID</span>
                  <strong>{profile.objectId}</strong>
                </div>
                <div className="summary-item">
                  <span>Preview blob</span>
                  <strong>{profile.previewBlobId || "n/a"}</strong>
                </div>
                <div className="summary-item">
                  <span>Manifest blob</span>
                  <strong>{profile.manifestBlobId || "n/a"}</strong>
                </div>
                <div className="summary-item">
                  <span>Schema</span>
                  <strong>v{profile.schemaVersion}</strong>
                </div>
              </div>
            ) : null}
          </article>
        </section>
      </main>
    </div>
  );
}
