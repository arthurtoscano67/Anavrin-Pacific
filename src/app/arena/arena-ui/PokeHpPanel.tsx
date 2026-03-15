/** Classic Pokémon DS-style HP / XP info box */

const STAGE_LABEL = ['Egg', 'Baby', 'Adult', 'Legend'] as const;

function hpBarColor(pct: number): string {
  if (pct > 50) return '#58c449';
  if (pct > 20) return '#f0c030';
  return '#e83030';
}

export function PokeHpPanel({
  name,
  stage,
  hpPct,
  showHpNumber,
  xp,
  isWinner,
}: {
  name: string;
  stage: number;
  hpPct: number;
  showHpNumber?: boolean;
  xp?: number;
  isWinner?: boolean;
}) {
  const safeHp  = Math.max(0, Math.min(100, hpPct));
  const safeXp  = Math.max(0, Math.min(100, ((xp ?? 0) % 100)));
  const barColor = hpBarColor(safeHp);
  const stageStr = STAGE_LABEL[Math.max(0, Math.min(3, stage ?? 0))];

  return (
    <div
      className="poke-hp-box"
      style={isWinner ? { boxShadow: '0 0 0 2px #facc15, 0 0 12px #facc1580' } : undefined}
    >
      {/* name row */}
      <div className="poke-hp-name-row">
        <span className="poke-hp-name">{name}</span>
        <span className="poke-hp-level">{stageStr}</span>
      </div>

      {/* HP label + bar */}
      <div className="poke-hp-row">
        <span className="poke-hp-label">HP</span>
        <div className="poke-hp-track">
          <div
            className="poke-hp-fill"
            style={{
              width: `${safeHp}%`,
              backgroundColor: barColor,
              transition: 'width 0.4s ease, background-color 0.4s ease',
            }}
          />
        </div>
        {showHpNumber && (
          <span className="poke-hp-number">{Math.round(safeHp)}<span className="text-[9px]">%</span></span>
        )}
      </div>

      {/* XP bar (player only) */}
      {showHpNumber && (
        <div className="poke-xp-row">
          <span className="poke-xp-label">EXP</span>
          <div className="poke-xp-track">
            <div
              className="poke-xp-fill"
              style={{
                width: `${safeXp}%`,
                transition: 'width 0.6s ease',
              }}
            />
          </div>
        </div>
      )}

      {isWinner && (
        <div className="poke-winner-tag">★ WINNER</div>
      )}
    </div>
  );
}
