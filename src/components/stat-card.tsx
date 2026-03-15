export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "pulse" | "ember";
}) {
  const toneClass =
    tone === "pulse"
      ? "border-pulse/40 bg-pulse/10"
      : tone === "ember"
        ? "border-ember/40 bg-ember/10"
        : "border-white/10 bg-storm/70";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide text-mist/80">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
