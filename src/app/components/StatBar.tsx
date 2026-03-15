export function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  const width = Math.max(0, Math.min(100, (value / 60) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-gray-300">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
