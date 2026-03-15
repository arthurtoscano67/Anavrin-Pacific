import type { ProceduralMonsterInput } from "../lib/monsterRenderer";

type MonsterImageProps = {
  objectId: string;
  className?: string;
  monster?: ProceduralMonsterInput | null;
};

const GIF_RENDERER_BASE = "https://heart-beat-production.up.railway.app";

export function MonsterImage({ objectId, className = "", monster = null }: MonsterImageProps) {
  const name = typeof monster?.name === "string" && monster.name.length > 0 ? monster.name : "Martian";

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black/30 ${className}`}>
      <img
        src={`${GIF_RENDERER_BASE}/martian/${objectId}`}
        alt={`${name} ${objectId}`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  );
}
