function getHpPercent(currentHealth: number, maxHealth: number) {
  if (maxHealth <= 0) return 0;
  return Math.max(0, Math.min(100, (currentHealth / maxHealth) * 100));
}

function getHpTone(percent: number) {
  if (percent > 60) return "hp-fill-green";
  if (percent >= 30) return "hp-fill-yellow";
  return "hp-fill-red";
}

export function MartianHealthBar({
  currentHealth,
  maxHealth,
}: {
  currentHealth: number;
  maxHealth: number;
}) {
  const safeCurrentHealth = Math.max(0, currentHealth);
  const safeMaxHealth = Math.max(0, maxHealth);
  const hpPercent = getHpPercent(safeCurrentHealth, safeMaxHealth);
  const hpTone = getHpTone(hpPercent);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-gray-300">
        <span>HP {safeCurrentHealth} / {safeMaxHealth}</span>
        <span>{Math.round(hpPercent)}%</span>
      </div>
      <div className="hp-bar" aria-label={`Health ${safeCurrentHealth} of ${safeMaxHealth}`}>
        <div className={`hp-fill ${hpTone}`} style={{ width: `${hpPercent}%` }} />
      </div>
    </div>
  );
}
