export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-white/25 border-t-white"
      style={{ width: size, height: size }}
    />
  );
}
