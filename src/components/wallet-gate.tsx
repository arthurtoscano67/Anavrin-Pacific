"use client";

import { ConnectButton } from "@mysten/dapp-kit";

export function WalletGate({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-storm/60 p-8 text-center shadow-card">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-mist/90">{subtitle}</p>
      <div className="mt-5 inline-flex">
        <ConnectButton />
      </div>
    </section>
  );
}
