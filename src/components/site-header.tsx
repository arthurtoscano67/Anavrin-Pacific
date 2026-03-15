"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

import { formatAddress } from "@/lib/format";

const NAV_ITEMS: Array<{ href: Route; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/arena", label: "Arena" },
  { href: "/my-monsters", label: "My Monsters" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/customizer", label: "Monster Customizer" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const account = useCurrentAccount();

  return (
    <header className="sticky top-0 z-40 border-b border-sky-300/20 bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-pulse/40 bg-pulse/10 text-xl">
            ⚔️
          </div>
          <div>
            <div className="text-lg font-bold text-white md:text-xl">Anavrin Battle Arena</div>
            <div className="text-xs text-mist/80">
              {account ? `Connected: ${formatAddress(account.address)}` : "Connect Slush or Suiet"}
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-pulse/80 bg-pulse/15 text-pulse"
                    : "border-white/10 text-mist hover:border-pulse/40 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ConnectButton />
      </div>
    </header>
  );
}
