import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { buildQueryAppHref } from "../lib/app-paths";
import { useAvatarAdminAccess } from "../lib/useAvatarAdminAccess";

export type SiteRoute = "start" | "create" | "market" | "unity" | "admin";

type TabDescriptor = {
  route: SiteRoute;
  label: string;
  href: string;
};

const tabs: TabDescriptor[] = [
  {
    route: "start",
    label: "Home",
    href: buildQueryAppHref("/"),
  },
  {
    route: "create",
    label: "Mint",
    href: buildQueryAppHref("/create"),
  },
  {
    route: "market",
    label: "Market",
    href: buildQueryAppHref("/market"),
  },
  {
    route: "unity",
    label: "Play",
    href: buildQueryAppHref("/unity"),
  },
  {
    route: "admin",
    label: "Admin",
    href: buildQueryAppHref("/admin"),
  },
];

type Props = {
  activeRoute: SiteRoute;
};

export function SiteTabs({ activeRoute }: Props) {
  const account = useCurrentAccount();
  const { isAdmin, loading } = useAvatarAdminAccess(account?.address);
  const visibleTabs = tabs.filter((tab) => {
    if (tab.route !== "admin") {
      return true;
    }

    return isAdmin || (activeRoute === "admin" && Boolean(account?.address) && loading);
  });

  return (
    <nav className="site-tabs" aria-label="Pacific sections">
      {visibleTabs.map((tab) => (
        <a
          key={tab.route}
          className={`site-tab ${tab.route === activeRoute ? "active" : ""}`}
          href={tab.href}
          aria-current={tab.route === activeRoute ? "page" : undefined}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
