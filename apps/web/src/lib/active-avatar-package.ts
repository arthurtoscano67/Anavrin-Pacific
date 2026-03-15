import { useEffect, useState } from "react";
import { webEnv } from "../env";

const storageKey = "pacific:activeAvatarPackageId";
const changeEventName = "pacific:active-avatar-package-change";

function normalizePackageId(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function isConfiguredAvatarPackageId(value: string | null | undefined) {
  const normalized = normalizePackageId(value);
  return /^0x[0-9a-fA-F]+$/.test(normalized) && !/^0x0+$/.test(normalized);
}

export function defaultAvatarPackageId() {
  const normalized = normalizePackageId(webEnv.avatarPackageId);
  return isConfiguredAvatarPackageId(normalized) ? normalized : "";
}

export function getActiveAvatarPackageId() {
  if (typeof window === "undefined") {
    return defaultAvatarPackageId();
  }

  const stored = normalizePackageId(window.localStorage.getItem(storageKey));
  return isConfiguredAvatarPackageId(stored) ? stored : defaultAvatarPackageId();
}

function dispatchPackageChange() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(changeEventName, {
      detail: {
        packageId: getActiveAvatarPackageId(),
      },
    }),
  );
}

export function setActiveAvatarPackageId(value: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizePackageId(value);
  if (!isConfiguredAvatarPackageId(normalized) || normalized === defaultAvatarPackageId()) {
    window.localStorage.removeItem(storageKey);
  } else {
    window.localStorage.setItem(storageKey, normalized);
  }

  dispatchPackageChange();
}

export function clearActiveAvatarPackageId() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
  dispatchPackageChange();
}

export function useActiveAvatarPackageId() {
  const [packageId, setPackageId] = useState(() => getActiveAvatarPackageId());

  useEffect(() => {
    const updatePackageId = () => {
      setPackageId(getActiveAvatarPackageId());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) {
        return;
      }

      updatePackageId();
    };

    window.addEventListener(changeEventName, updatePackageId);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(changeEventName, updatePackageId);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return packageId;
}
