import { useCallback, useEffect, useState } from "react";
import { findOwnedAvatarAdminCapId } from "./avatar-chain";

export function useAvatarAdminAccess(walletAddress: string | null | undefined) {
  const normalizedAddress = walletAddress?.trim() || null;
  const [adminCapId, setAdminCapId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!normalizedAddress) {
      setAdminCapId(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const nextAdminCapId = await findOwnedAvatarAdminCapId(normalizedAddress);
      setAdminCapId(nextAdminCapId);
      setError(null);
      return nextAdminCapId;
    } catch (caught) {
      setAdminCapId(null);
      setError(caught instanceof Error ? caught.message : "Admin access lookup failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [normalizedAddress]);

  useEffect(() => {
    let cancelled = false;

    if (!normalizedAddress) {
      setAdminCapId(null);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void findOwnedAvatarAdminCapId(normalizedAddress)
      .then((nextAdminCapId) => {
        if (cancelled) {
          return;
        }

        setAdminCapId(nextAdminCapId);
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }

        setAdminCapId(null);
        setError(caught instanceof Error ? caught.message : "Admin access lookup failed.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedAddress]);

  return {
    adminCapId,
    isAdmin: Boolean(normalizedAddress && adminCapId),
    loading,
    error,
    refresh,
  };
}
