import { webEnv } from "../env";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
    __pacificAnalyticsHistoryPatched__?: boolean;
  }
}

const GA_SCRIPT_ID = "pacific-ga4-script";
const CLARITY_SCRIPT_ID = "pacific-clarity-script";
const NAVIGATION_EVENT = "pacific:navigation";

let analyticsInitialized = false;

function pushNavigationEvent() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function patchHistoryEvents() {
  if (typeof window === "undefined" || window.__pacificAnalyticsHistoryPatched__) {
    return;
  }

  const { history } = window;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function pushState(...args) {
    const result = originalPushState(...args);
    pushNavigationEvent();
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState(...args);
    pushNavigationEvent();
    return result;
  };

  window.__pacificAnalyticsHistoryPatched__ = true;
}

function ensureGoogleAnalytics() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const measurementId = webEnv.gaMeasurementId;
  if (!measurementId) {
    return;
  }

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    anonymize_ip: true,
  });
}

function ensureClarity() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const projectId = webEnv.clarityProjectId;
  if (!projectId) {
    return;
  }

  if (document.getElementById(CLARITY_SCRIPT_ID)) {
    return;
  }

  if (!window.clarity) {
    const clarityQueue = Object.assign(
      (...args: unknown[]) => {
        clarityQueue.q.push(args);
      },
      { q: [] as unknown[][] },
    );
    window.clarity = clarityQueue;
  }

  const firstScript = document.getElementsByTagName("script")[0];
  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
}

export function initializeAnalytics() {
  if (typeof window === "undefined" || analyticsInitialized) {
    return;
  }

  ensureGoogleAnalytics();
  ensureClarity();
  patchHistoryEvents();
  analyticsInitialized = true;
}

export function getAnalyticsNavigationEventName() {
  return NAVIGATION_EVENT;
}

export function trackPageView(path = `${window.location.pathname}${window.location.search}`) {
  if (typeof window === "undefined") {
    return;
  }

  if (webEnv.gaMeasurementId && window.gtag) {
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: path,
    });
  }

  if (webEnv.clarityProjectId && window.clarity) {
    window.clarity("event", `page_view:${path}`);
  }
}

export function trackAnalyticsEvent(
  name: string,
  params?: Record<string, string | number | boolean | null | undefined>,
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedParams = Object.fromEntries(
    Object.entries(params ?? {}).filter(([, value]) => value !== null && value !== undefined),
  );

  if (webEnv.gaMeasurementId && window.gtag) {
    window.gtag("event", name, normalizedParams);
  }

  if (webEnv.clarityProjectId && window.clarity) {
    window.clarity("event", name);
  }
}
