import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { isConfiguredAvatarPackageId } from "./active-avatar-package";
import { findOwnedMintAdminCapObjectId, findOwnedPublisherObjectId } from "./avatar-chain";

type AdminWalletAccess = {
  walletAddress: string | null;
  mintAdminCapObjectId: string | null;
  publisherObjectId: string | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
};

export function useAdminWalletAccess(packageId: string | null | undefined): AdminWalletAccess {
  const account = useCurrentAccount();
  const walletAddress = account?.address ?? null;
  const [mintAdminCapObjectId, setMintAdminCapObjectId] = useState<string | null>(null);
  const [publisherObjectId, setPublisherObjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const targetPackageId = packageId?.trim() ?? "";
    if (!walletAddress || !isConfiguredAvatarPackageId(targetPackageId)) {
      setMintAdminCapObjectId(null);
      setPublisherObjectId(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.all([
      findOwnedMintAdminCapObjectId(walletAddress, targetPackageId),
      findOwnedPublisherObjectId(walletAddress, targetPackageId),
    ])
      .then(([mintAdminCapId, publisherId]) => {
        if (cancelled) {
          return;
        }

        setMintAdminCapObjectId(mintAdminCapId);
        setPublisherObjectId(publisherId);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }

        setMintAdminCapObjectId(null);
        setPublisherObjectId(null);
        setError(caught instanceof Error ? caught.message : "Failed to load admin access.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [packageId, walletAddress]);

  return {
    walletAddress,
    mintAdminCapObjectId,
    publisherObjectId,
    isAdmin: Boolean(mintAdminCapObjectId || publisherObjectId),
    loading,
    error,
  };
}
