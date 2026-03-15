type MartianGifImageProps = {
  objectId: string;
  name?: string;
  className?: string;
};

const GIF_RENDERER_BASE = "https://heart-beat-production.up.railway.app";

export function MartianGifImage({ objectId, name = "Martian", className = "" }: MartianGifImageProps) {
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
