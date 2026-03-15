import { LoadingGrid } from "../components/LoadingGrid";
import { MonsterImage } from "../components/MonsterImage";
import { PageShell } from "../components/PageShell";
import { StageBadge } from "../components/StageBadge";
import { powerPreview, short } from "../lib/format";
import { useAnavrinData } from "../hooks/useAnavrinData";

export function LeaderboardPage() {
  const { leaderboard } = useAnavrinData();

  return (
    <PageShell
      title="Leaderboard"
      subtitle="Top Martians ranked by wins and XP from indexed battle history."
    >
      {leaderboard.isLoading ? (
        <LoadingGrid count={8} />
      ) : (leaderboard.data ?? []).length === 0 ? (
        <div className="glass-card p-4 text-sm text-gray-300">No indexed Martian battles recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {(leaderboard.data ?? []).map((monster, idx) => (
            <div key={monster.objectId} className="glass-card grid gap-3 p-3 sm:grid-cols-[80px_1fr_auto] sm:items-center">
              <div className="relative">
                <MonsterImage objectId={monster.objectId} monster={monster} className="aspect-square max-w-[80px]" />
                <div className="absolute -left-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-purple/40 bg-purple/20 text-xs font-bold">
                  #{idx + 1}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{monster.name}</h3>
                  <StageBadge stage={monster.stage} />
                </div>
                <div className="text-xs text-gray-400">{short(monster.objectId)}</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-300 sm:grid-cols-4">
                  <span>Wins {monster.wins}</span>
                  <span>Losses {monster.losses}</span>
                  <span>XP {monster.xp}</span>
                  <span>Power {powerPreview(monster)}</span>
                </div>
              </div>

              <div className="grid gap-1 rounded-xl border border-borderSoft bg-black/20 px-3 py-2 text-xs text-gray-300">
                <span>ATK {monster.attack}</span>
                <span>DEF {monster.defense}</span>
                <span>SPD {monster.speed}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
