import { RENDERER_BASE } from "@/lib/config";
import { formatAddress, formatSui, stageLabel } from "@/lib/format";
import type { MonsterModel } from "@/lib/types";

interface MonsterCardProps {
  monster: MonsterModel;
  footer?: React.ReactNode;
}

export function MonsterCard({ monster, footer }: MonsterCardProps) {
  const imageUrl = `${RENDERER_BASE}/martian/${monster.objectId}.svg`;

  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-storm/70 shadow-card">
      <div className="relative aspect-square overflow-hidden bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={monster.name}
          className="h-full w-full object-cover"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute right-2 top-2 rounded-full border border-white/20 bg-ink/70 px-2 py-1 text-xs text-mist">
          {stageLabel(monster.stage)}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="truncate text-base font-semibold text-white">{monster.name}</h3>
          <p className="mt-0.5 truncate text-xs text-mist">{monster.objectId}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-ink/50 p-2 text-center text-mist">
            <div className="text-[10px] uppercase tracking-wide text-mist/70">Atk</div>
            <div className="text-sm font-semibold text-white">{monster.stats.attack}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-ink/50 p-2 text-center text-mist">
            <div className="text-[10px] uppercase tracking-wide text-mist/70">Def</div>
            <div className="text-sm font-semibold text-white">{monster.stats.defense}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-ink/50 p-2 text-center text-mist">
            <div className="text-[10px] uppercase tracking-wide text-mist/70">Spd</div>
            <div className="text-sm font-semibold text-white">{monster.stats.speed}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-mist/80">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
            {monster.location === "wallet" ? "Wallet" : `Kiosk ${formatAddress(monster.kioskId)}`}
          </span>
          {monster.listedPriceMist && (
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-amber-200">
              Listed {formatSui(monster.listedPriceMist)} SUI
            </span>
          )}
        </div>

        {footer}
      </div>
    </article>
  );
}
