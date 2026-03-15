const required = (value: string | undefined, fallback: string) => value ?? fallback;
const optional = (value: string | undefined) => (typeof value === "string" ? value.trim() : "");
const optionalList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
const resolvePublicPath = (value: string) => {
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("blob:") || value.startsWith("data:")) {
    return value;
  }

  const normalizedBase = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
  const normalizedValue = value.startsWith("/") ? value.slice(1) : value;
  return `${normalizedBase}${normalizedValue}`;
};

export const webEnv = {
  apiBaseUrl: required(import.meta.env.VITE_API_BASE_URL, "http://127.0.0.1:3001"),
  publicAssetBaseUrl: optional(import.meta.env.VITE_PUBLIC_ASSET_BASE_URL),
  publicAppBaseUrl: optional(import.meta.env.VITE_PUBLIC_APP_BASE_URL),
  avatarPackageId: required(import.meta.env.VITE_AVATAR_PACKAGE_ID, "0x0"),
  legacyAvatarPackageIds: optionalList(import.meta.env.VITE_LEGACY_AVATAR_PACKAGE_IDS),
  suiGrpcUrl: required(
    import.meta.env.VITE_SUI_GRPC_URL,
    "https://fullnode.mainnet.sui.io:443",
  ),
  walrusUploadRelayUrl: required(
    import.meta.env.VITE_WALRUS_UPLOAD_RELAY_URL,
    "https://upload-relay.mainnet.walrus.space",
  ),
  walrusEpochs: Number(import.meta.env.VITE_WALRUS_EPOCHS ?? "53"),
  walrusMaxTipMist: Number(import.meta.env.VITE_WALRUS_MAX_TIP_MIST ?? "100000000"),
  walrusRequestTimeoutMs: Number(import.meta.env.VITE_WALRUS_REQUEST_TIMEOUT_MS ?? "3600000"),
  maxSourceAssetMb: Number(import.meta.env.VITE_MAX_SOURCE_ASSET_MB ?? "250"),
  maxRuntimeAvatarMb: Number(import.meta.env.VITE_MAX_RUNTIME_AVATAR_MB ?? "100"),
  projectUrl: required(
    import.meta.env.VITE_PROJECT_URL,
    "https://arthurtoscano67.github.io/Pacific",
  ),
  unityWebglUrl: required(
    resolvePublicPath(required(import.meta.env.VITE_UNITY_WEBGL_URL, "/unity-webgl/index.html")),
    "/unity-webgl/index.html",
  ),
  unityAssetVersion: optional(import.meta.env.VITE_UNITY_ASSET_VERSION),
  photonAppIdRealtime: optional(import.meta.env.VITE_PHOTON_APP_ID_REALTIME),
  photonAppIdChat: optional(import.meta.env.VITE_PHOTON_APP_ID_CHAT),
  photonAppIdVoice: optional(import.meta.env.VITE_PHOTON_APP_ID_VOICE),
  photonFixedRegion: required(import.meta.env.VITE_PHOTON_FIXED_REGION, "usw").trim().toLowerCase(),
};

webEnv.maxSourceAssetMb = Number.isFinite(webEnv.maxSourceAssetMb) && webEnv.maxSourceAssetMb > 0
  ? webEnv.maxSourceAssetMb
  : 250;
webEnv.maxRuntimeAvatarMb =
  Number.isFinite(webEnv.maxRuntimeAvatarMb) && webEnv.maxRuntimeAvatarMb > 0
    ? webEnv.maxRuntimeAvatarMb
    : 100;
webEnv.walrusRequestTimeoutMs =
  Number.isFinite(webEnv.walrusRequestTimeoutMs) && webEnv.walrusRequestTimeoutMs > 0
    ? webEnv.walrusRequestTimeoutMs
    : 3600000;

export const webEnvLimits = {
  maxSourceAssetBytes: Math.round(webEnv.maxSourceAssetMb * 1024 * 1024),
  maxRuntimeAvatarBytes: Math.round(webEnv.maxRuntimeAvatarMb * 1024 * 1024),
};
