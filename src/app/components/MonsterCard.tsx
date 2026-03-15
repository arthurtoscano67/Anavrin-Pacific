import { Link } from "react-router-dom";

import type { Monster } from "../lib/types";
import { short } from "../lib/format";
import { MartianHealthBar } from "./MartianHealthBar";
import { MonsterImage } from "./MonsterImage";
import { StageBadge } from "./StageBadge";
import { StatBar } from "./StatBar";

export function MonsterCard({
  monster,
  actions,
  arenaDisabled = false,
  arenaLabel = "Send To Battle",
}: {
  monster: Monster;
  actions?: React.ReactNode;
  arenaDisabled?: boolean;
  arenaLabel?: string;
}) {
  const winRate = monster.wins + monster.losses === 0 ? 0 : Math.round((monster.wins / (monster.wins + monster.losses)) * 100);
  const xpPct = Math.min(100, (monster.xp / 300) * 100);

  return (
    <article className="glass-card card-hover overflow-hidden">
      <MonsterImage objectId={monster.objectId} monster={monster} className="aspect-square" />
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{monster.name}</h3>
          <StageBadge stage={monster.stage} />
        </div>

        <div className="text-xs text-gray-400">{short(monster.objectId)} • {monster.location === "wallet" ? "Wallet" : `Kiosk ${short(monster.kioskId)}`}</div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-gray-300">
            <span>W/L {monster.wins}/{monster.losses} ({winRate}%)</span>
            <span>XP {monster.xp}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-cyan" style={{ width: `${xpPct}%` }} />
          </div>
        </div>

        <div className="space-y-2">
          <MartianHealthBar
            currentHealth={Number(monster.current_health ?? 0)}
            maxHealth={Number(monster.max_health ?? 0)}
          />
          <StatBar label="ATK" value={monster.attack} color="bg-red-500" />
          <StatBar label="DEF" value={monster.defense} color="bg-blue-500" />
          <StatBar label="SPD" value={monster.speed} color="bg-green-500" />
        </div>

        {(monster.scars > 0 || monster.broken_horns > 0 || monster.torn_wings > 0) && (
          <div className="flex flex-wrap gap-1 text-[10px]">
            {monster.scars > 0 && <span className="rounded-full border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-red-300">Scars {monster.scars}</span>}
            {monster.broken_horns > 0 && <span className="rounded-full border border-yellow-400/40 bg-yellow-500/10 px-2 py-0.5 text-yellow-300">Broken Horn</span>}
            {monster.torn_wings > 0 && <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2 py-0.5 text-purple-300">Torn Wings</span>}
          </div>
        )}

        {actions}

        {arenaDisabled ? (
          <button className="btn-ghost w-full text-center text-xs" disabled>
            {arenaLabel}
          </button>
        ) : (
          <Link
            to={`/lobby?monster=${monster.objectId}`}
            className="btn-ghost w-full text-center text-xs"
          >
            {arenaLabel}
          </Link>
        )}
      </div>
    </article>
  );
}
