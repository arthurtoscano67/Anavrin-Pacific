export type ShooterCharacterPreset = {
  id: string;
  label: string;
  prefabResource: string;
  tagline: string;
  role: string;
  previewImagePath: string;
};

export const SHOOTER_CHARACTER_PRESETS: ShooterCharacterPreset[] = [
  {
    id: "mplayer_1",
    label: "Nomad",
    prefabResource: "MPlayer [1]",
    tagline: "Balanced assault rifleman",
    role: "Assault",
    previewImagePath: "/mfps-previews/nomad-realistic.png",
  },
  {
    id: "mplayer_2",
    label: "Bastion",
    prefabResource: "MPlayer [2]",
    tagline: "Heavy breach armor frontline",
    role: "Heavy",
    previewImagePath: "/mfps-previews/bastion-realistic.png",
  },
  {
    id: "botplayer_1",
    label: "Specter",
    prefabResource: "BotPlayer [1]",
    tagline: "Fast recon flank specialist",
    role: "Recon",
    previewImagePath: "/mfps-previews/specter-realistic.png",
  },
  {
    id: "botplayer_2",
    label: "Sentinel",
    prefabResource: "BotPlayer [2]",
    tagline: "Support anchor for lane control",
    role: "Support",
    previewImagePath: "/mfps-previews/sentinel-realistic.png",
  },
];

export function findShooterPresetById(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return SHOOTER_CHARACTER_PRESETS.find((preset) => preset.id === id) ?? null;
}

export async function createShooterPresetPreviewBlob(
  preset: ShooterCharacterPreset,
  size = 640,
) {
  if (typeof document === "undefined") {
    throw new Error("Canvas preview is unavailable outside a browser context.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create preview canvas context.");
  }

  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#0f1116");
  gradient.addColorStop(0.54, "#141a25");
  gradient.addColorStop(1, "#1a2332");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const previewImage = await loadPreviewImage(preset.previewImagePath);
  if (previewImage) {
    context.drawImage(previewImage, 0, 0, size, size);

    const imageFade = context.createLinearGradient(0, size * 0.44, 0, size);
    imageFade.addColorStop(0, "rgba(8, 12, 18, 0)");
    imageFade.addColorStop(1, "rgba(8, 12, 18, 0.84)");
    context.fillStyle = imageFade;
    context.fillRect(0, 0, size, size);

    const vignette = context.createRadialGradient(
      size * 0.5,
      size * 0.34,
      size * 0.25,
      size * 0.5,
      size * 0.5,
      size * 0.72,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.42)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, size, size);
  }

  context.fillStyle = "rgba(7, 11, 17, 0.62)";
  context.fillRect(0, size * 0.62, size, size * 0.38);

  context.fillStyle = "rgba(255, 220, 72, 0.95)";
  context.font = `700 ${Math.round(size * 0.05)}px "Space Grotesk", sans-serif`;
  context.fillText("MFPS 2.0", size * 0.06, size * 0.09);

  context.fillStyle = "#ffffff";
  context.font = `700 ${Math.round(size * 0.084)}px "Space Grotesk", sans-serif`;
  context.fillText(preset.label, size * 0.08, size * 0.76);

  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.font = `500 ${Math.round(size * 0.048)}px "Space Grotesk", sans-serif`;
  context.fillText(preset.role, size * 0.08, size * 0.84);

  context.fillStyle = "rgba(255, 255, 255, 0.7)";
  context.font = `500 ${Math.round(size * 0.036)}px "IBM Plex Mono", monospace`;
  context.fillText(preset.prefabResource, size * 0.08, size * 0.9);

  context.fillStyle = "rgba(255, 255, 255, 0.8)";
  context.font = `500 ${Math.round(size * 0.028)}px "IBM Plex Mono", monospace`;
  context.fillText("Minted on Sui + Walrus", size * 0.08, size * 0.95);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Failed to encode shooter preview PNG."));
        return;
      }

      resolve(value);
    }, "image/png");
  });

  const previewUrl = URL.createObjectURL(blob);
  return { previewBlob: blob, previewUrl };
}

async function loadPreviewImage(src: string) {
  if (!src || typeof Image === "undefined") {
    return null;
  }

  return await new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
