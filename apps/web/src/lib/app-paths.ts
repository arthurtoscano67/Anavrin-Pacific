const normalizedBasePath = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

const queryPageToPath = {
  admin: "/admin",
  create: "/create",
  play: "/play",
  profile: "/profile",
  unity: "/unity",
  world: "/world",
} as const;

const pathToQueryPage = {
  "/admin": "admin",
  "/create": "create",
  "/play": "play",
  "/profile": "profile",
  "/unity": "unity",
  "/world": "world",
} as const;

export type AppRoutePath = "/" | keyof typeof pathToQueryPage;

export function buildAppPath(pathname: string) {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!normalizedBasePath || normalizedBasePath === "/") {
    return normalizedPathname;
  }

  return normalizedPathname === "/"
    ? normalizedBasePath
    : `${normalizedBasePath}${normalizedPathname}`;
}

export function buildPublicAssetPath(pathname: string) {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return buildAppPath(normalizedPathname);
}

export function stripAppBasePath(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  if (
    normalizedBasePath &&
    normalizedBasePath !== "/" &&
    normalizedPathname.startsWith(normalizedBasePath)
  ) {
    return normalizedPathname.slice(normalizedBasePath.length) || "/";
  }

  return normalizedPathname;
}

export function resolveAppRoute(pathname: string, search: string) {
  const requestedPage = new URLSearchParams(search).get("page")?.trim().toLowerCase() ?? "";
  const mappedPath = queryPageToPath[requestedPage as keyof typeof queryPageToPath];
  return mappedPath ?? stripAppBasePath(pathname);
}

export function buildQueryAppHref(
  route: AppRoutePath,
  params?: Record<string, string | number | boolean | null | undefined>,
) {
  const origin =
    typeof window === "undefined" ? "https://example.invalid" : window.location.origin;
  const url = new URL(buildAppPath("/"), origin);
  const page = pathToQueryPage[route as keyof typeof pathToQueryPage];

  if (page) {
    url.searchParams.set("page", page);
  } else {
    url.searchParams.delete("page");
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    if (key === "page") {
      continue;
    }

    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return `${url.pathname}${url.search}`;
}
