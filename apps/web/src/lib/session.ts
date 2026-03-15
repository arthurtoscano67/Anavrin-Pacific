import { type useDAppKit } from "@mysten/dapp-kit-react";
import type { WalletSessionRequest } from "@pacific/shared";
import { webEnv } from "../env";

type DAppKitInstance = ReturnType<typeof useDAppKit>;

export type WalletSession = {
  token: string;
  walletAddress: string;
  expiresAt: string;
};

type HealthResponse = {
  ok?: boolean;
};

const walletSessionStorageKeyPrefix = "pacific:wallet-session:";

function getStringField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function parseWalletSession(payload: unknown): WalletSession | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const token = getStringField(record, ["token"]);
  const walletAddress = getStringField(record, ["walletAddress", "wallet_address", "address"]);
  const expiresAt = getStringField(record, ["expiresAt", "expires_at"]);

  if (!token || !walletAddress || !expiresAt) {
    return null;
  }

  return {
    token,
    walletAddress,
    expiresAt,
  };
}

export async function readResponseError(response: Response, fallback: string) {
  try {
    const payload = (await response.clone().json()) as {
      error?: string;
      message?: string;
    };
    return payload.error ?? payload.message ?? fallback;
  } catch {
    const text = await response.text();
    return text || fallback;
  }
}

export async function isApiAvailable(signal?: AbortSignal) {
  try {
    const response = await fetch(`${webEnv.apiBaseUrl}/health`, {
      signal,
    });
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as HealthResponse | null;
    return payload?.ok === true;
  } catch {
    return false;
  }
}

export function buildSessionMessage(address: string) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 60 * 60 * 1000);

  return [
    "Pacific wallet session",
    `Address: ${address}`,
    `Origin: ${window.location.origin}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join("\n");
}

export async function createWalletSession(
  dAppKit: DAppKitInstance,
  address: string,
): Promise<WalletSession> {
  const message = buildSessionMessage(address);
  const signature = await dAppKit.signPersonalMessage({
    message: new TextEncoder().encode(message),
  });

  const payload: WalletSessionRequest = {
    address,
    message,
    signature: signature.signature,
  };

  const response = await fetch(`${webEnv.apiBaseUrl}/session/wallet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Wallet session request failed."));
  }

  const session = parseWalletSession(await response.json());
  if (!session) {
    throw new Error(
      `Invalid wallet session response from ${webEnv.apiBaseUrl}. Check VITE_API_BASE_URL.`,
    );
  }

  persistWalletSession(session);
  return session;
}

function walletSessionStorageKey(address: string) {
  return `${walletSessionStorageKeyPrefix}${address?.trim().toLowerCase() ?? ""}`;
}

function isWalletSessionValid(session: WalletSession | null | undefined, address: string) {
  if (!session) {
    return false;
  }

  const sessionAddress = session.walletAddress?.trim().toLowerCase();
  const targetAddress = address?.trim().toLowerCase();
  if (!sessionAddress || !targetAddress) {
    return false;
  }

  return (
    sessionAddress === targetAddress &&
    new Date(session.expiresAt).getTime() > Date.now()
  );
}

export function readStoredWalletSession(address: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(walletSessionStorageKey(address));
    if (!raw) {
      return null;
    }

    const parsed = parseWalletSession(JSON.parse(raw));
    if (!isWalletSessionValid(parsed, address)) {
      window.localStorage.removeItem(walletSessionStorageKey(address));
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(walletSessionStorageKey(address));
    return null;
  }
}

export function readAvailableWalletSession(
  address: string,
  currentSession?: WalletSession | null,
) {
  if (isWalletSessionValid(currentSession, address)) {
    return currentSession as WalletSession;
  }

  return readStoredWalletSession(address);
}

export function persistWalletSession(session: WalletSession) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session.walletAddress?.trim()) {
    return;
  }

  window.localStorage.setItem(
    walletSessionStorageKey(session.walletAddress),
    JSON.stringify(session),
  );
}

export async function ensureWalletSession(
  dAppKit: DAppKitInstance,
  address: string,
  currentSession?: WalletSession | null,
) {
  const stored = readAvailableWalletSession(address, currentSession);
  if (stored) {
    return stored;
  }

  if (!(await isApiAvailable())) {
    throw new Error(`Wallet session API unavailable at ${webEnv.apiBaseUrl}.`);
  }

  return createWalletSession(dAppKit, address);
}

export async function createUploadIntent(
  session: WalletSession,
  body: {
    filename: string;
    kind: "avatar" | "preview" | "manifest" | "source-asset";
    size: number;
    mime: string;
  },
) {
  const response = await fetch(`${webEnv.apiBaseUrl}/avatar/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response, "Upload intent request failed."));
  }

  return response.json() as Promise<{
    intentId: string;
    relayHost: string;
    epochs: number;
  }>;
}
