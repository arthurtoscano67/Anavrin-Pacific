import { stageMeta } from "../lib/format";

export function StageBadge({ stage }: { stage: number }) {
  const m = stageMeta(stage);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${m.color}`}>
      <span>{m.emoji}</span>
      <span>{m.label}</span>
    </span>
  );
}
