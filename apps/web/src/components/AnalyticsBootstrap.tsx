import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { useEffect, useRef } from "react";
import {
  getAnalyticsNavigationEventName,
  initializeAnalytics,
  trackAnalyticsEvent,
  trackPageView,
} from "../lib/analytics";

export function AnalyticsBootstrap() {
  const account = useCurrentAccount();
  const lastWalletAddressRef = useRef<string | null>(null);
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    initializeAnalytics();

    const trackCurrentPage = () => {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      if (lastTrackedPathRef.current === nextPath) {
        return;
      }

      lastTrackedPathRef.current = nextPath;
      trackPageView(nextPath);
    };

    trackCurrentPage();
    const navigationEvent = getAnalyticsNavigationEventName();
    window.addEventListener(navigationEvent, trackCurrentPage);
    window.addEventListener("popstate", trackCurrentPage);
    return () => {
      window.removeEventListener(navigationEvent, trackCurrentPage);
      window.removeEventListener("popstate", trackCurrentPage);
    };
  }, []);

  useEffect(() => {
    const walletAddress = account?.address ?? null;
    if (!walletAddress || lastWalletAddressRef.current === walletAddress) {
      lastWalletAddressRef.current = walletAddress;
      return;
    }

    lastWalletAddressRef.current = walletAddress;
    trackAnalyticsEvent("wallet_connected", {
      wallet_prefix: walletAddress.slice(0, 6),
    });
  }, [account?.address]);

  return null;
}
