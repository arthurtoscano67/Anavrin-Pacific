import Link from "next/link";

import { APP_DESCRIPTION, PACKAGE_ID, TREASURY_ID } from "@/lib/config";

const features = [
  {
    title: "Wallet + Kiosk Inventory",
    text: "Pull Monster NFTs from both your connected wallet and all Kiosks owned by your account.",
  },
  {
    title: "Live Arena Coordination",
    text: "See online players, send battle invites, accept challenges, and spectate active fights in real time.",
  },
  {
    title: "On-chain Battle Controls",
    text: "Use contract actions for create_match, deposit_monster, deposit_stake, and start_battle.",
  },
  {
    title: "Breeding + Equipment",
    text: "Breed adult monsters on-chain and manage cosmetic equipment sets per monster for battle identity.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-storm/90 to-ink p-8 md:p-12">
        <div className="absolute -right-28 -top-24 h-72 w-72 rounded-full bg-pulse/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="inline-flex rounded-full border border-pulse/40 bg-pulse/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-pulse">
            Production-ready Sui Game Platform
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-white md:text-5xl">
            Build, battle, breed, and trade living Monster NFTs on Sui.
          </h1>
          <p className="mt-4 text-base text-mist md:text-lg">{APP_DESCRIPTION}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/arena" className="btn btn-primary">
              Enter Arena
            </Link>
            <Link href="/my-monsters" className="btn btn-secondary">
              Open My Monsters
            </Link>
            <Link href="/customizer" className="btn btn-secondary">
              Customize Gear
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {features.map((feature) => (
          <article key={feature.title} className="panel">
            <h2 className="text-xl font-semibold text-white">{feature.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist/90">{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2 className="text-xl font-semibold">On-chain Deployment</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-ink/60 p-3">
            <div className="text-xs uppercase tracking-wide text-mist/70">Package ID</div>
            <div className="mt-1 break-all text-mist">{PACKAGE_ID}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-ink/60 p-3">
            <div className="text-xs uppercase tracking-wide text-mist/70">Treasury ID</div>
            <div className="mt-1 break-all text-mist">{TREASURY_ID}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
