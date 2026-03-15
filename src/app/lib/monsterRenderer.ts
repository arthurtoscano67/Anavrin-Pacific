import type { ArenaMonsterSnapshot, Monster } from "./types";

export type ProceduralMonsterInput = {
  objectId: string;
  seed?: string | null;
  name?: string | null;
  stage?: number | null;
  attack?: number | null;
  defense?: number | null;
  speed?: number | null;
  wins?: number | null;
  losses?: number | null;
  xp?: number | null;
  scars?: number | null;
  broken_horns?: number | null;
  torn_wings?: number | null;
};

export type ProceduralMonster = {
  objectId: string;
  seed: string;
  name: string;
  stage: number;
  attack: number;
  defense: number;
  speed: number;
  wins: number;
  losses: number;
  xp: number;
  scars: number;
  broken_horns: number;
  torn_wings: number;
};

type CreaturePalette = {
  body: string;
  bodyDark: string;
  bodyLight: string;
  belly: string;
  accent: string;
  horn: string;
  wing: string;
  aura: string;
  sparkle: string;
  eye: string;
  iris: string;
  shadow: string;
};

function hashString(value: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash *= 0x100000001b3n;
  }
  return hash & ((1n << 63n) - 1n);
}

function parseSeed(input?: string | null, objectId?: string): bigint {
  if (input) {
    try {
      if (input.startsWith("0x")) return BigInt(input);
      return BigInt(input);
    } catch {
      return hashString(input);
    }
  }
  return hashString(objectId ?? "anavrin");
}

function trait(seed: bigint, shift: number, mod: number): number {
  return Number((seed >> BigInt(shift)) % BigInt(mod));
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clampStage(stage?: number | null): number {
  const safe = Number(stage ?? 0);
  return Math.max(0, Math.min(3, safe));
}

export function normalizeProceduralMonster(input: ProceduralMonsterInput): ProceduralMonster {
  return {
    objectId: input.objectId,
    seed: String(input.seed ?? hashString(input.objectId)),
    name: String(input.name ?? "Martian"),
    stage: clampStage(input.stage),
    attack: Number(input.attack ?? 0),
    defense: Number(input.defense ?? 0),
    speed: Number(input.speed ?? 0),
    wins: Number(input.wins ?? 0),
    losses: Number(input.losses ?? 0),
    xp: Number(input.xp ?? 0),
    scars: Number(input.scars ?? 0),
    broken_horns: Number(input.broken_horns ?? 0),
    torn_wings: Number(input.torn_wings ?? 0),
  };
}

function paletteFromSeed(seed: bigint): CreaturePalette {
  const hue = trait(seed, 0, 360);
  const accentHue = (hue + 35 + trait(seed, 8, 95)) % 360;
  const wingHue = (accentHue + 28) % 360;
  const bodySat = 58 + trait(seed, 14, 24);
  const bodyLight = 42 + trait(seed, 20, 12);
  return {
    body: hsl(hue, bodySat, bodyLight),
    bodyDark: hsl((hue + 8) % 360, Math.min(95, bodySat + 8), Math.max(20, bodyLight - 16)),
    bodyLight: hsl(hue, Math.max(48, bodySat - 8), Math.min(84, bodyLight + 16)),
    belly: hsl((hue + 20) % 360, 48, Math.min(88, bodyLight + 28)),
    accent: hsl(accentHue, 76, 64),
    horn: hsl((accentHue + 18) % 360, 42, 84),
    wing: hsl(wingHue, 54, 70),
    aura: hsl((wingHue + 18) % 360, 90, 72),
    sparkle: hsl((accentHue + 160) % 360, 95, 76),
    eye: hsl((hue + 210) % 360, 28, 12),
    iris: hsl((accentHue + 150) % 360, 75, 48),
    shadow: "rgba(5, 10, 24, 0.24)",
  };
}

function renderEar(earShape: number, x: number, side: "left" | "right", color: CreaturePalette): string {
  const direction = side === "left" ? -1 : 1;
  if (earShape === 0) {
    return `
      <path d="M ${x} 118 Q ${x + 18 * direction} 62 ${x + 44 * direction} 90 Q ${x + 32 * direction} 126 ${x + 6 * direction} 142 Z" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
      <path d="M ${x + 6 * direction} 118 Q ${x + 18 * direction} 92 ${x + 30 * direction} 104 Q ${x + 20 * direction} 126 ${x + 6 * direction} 134 Z" fill="${color.accent}" opacity="0.55" />
    `;
  }

  if (earShape === 1) {
    return `
      <path d="M ${x} 126 C ${x + 10 * direction} 74 ${x + 34 * direction} 70 ${x + 44 * direction} 118 C ${x + 44 * direction} 158 ${x + 12 * direction} 162 ${x} 142 Z" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
      <path d="M ${x + 10 * direction} 118 C ${x + 16 * direction} 92 ${x + 28 * direction} 94 ${x + 30 * direction} 118 C ${x + 28 * direction} 134 ${x + 16 * direction} 138 ${x + 10 * direction} 130 Z" fill="${color.accent}" opacity="0.5" />
    `;
  }

  return `
    <path d="M ${x} 132 Q ${x + 26 * direction} 74 ${x + 52 * direction} 116 Q ${x + 36 * direction} 150 ${x + 8 * direction} 148 Z" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
    <circle cx="${x + 18 * direction}" cy="118" r="10" fill="${color.accent}" opacity="0.45" />
  `;
}

function renderHorns(hornType: number, brokenHorns: number, color: CreaturePalette): string {
  if (hornType === 2) {
    return `
      <path d="M 122 126 L 110 82 L 124 90 L 136 76 L 144 130 Z" fill="${color.horn}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
      <path d="M 198 130 L 214 ${brokenHorns > 0 ? "100" : "78"} L 200 88 L 188 74 L 176 128 Z" fill="${color.horn}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
    `;
  }

  if (hornType === 1) {
    return `
      <path d="M 130 124 C 104 108 102 78 124 66 C 146 80 146 106 140 130 Z" fill="${color.horn}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
      <path d="M 190 124 C 214 108 214 ${brokenHorns > 0 ? "94" : "78"} 194 ${brokenHorns > 0 ? "88" : "66"} C 176 82 176 106 180 130 Z" fill="${color.horn}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
    `;
  }

  return `
    <path d="M 132 126 C 118 96 118 72 134 58 C 148 74 150 98 146 130 Z" fill="${color.horn}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
    <path d="M 188 126 C 202 96 202 ${brokenHorns > 0 ? "90" : "72"} 186 ${brokenHorns > 0 ? "78" : "58"} C 172 74 170 98 174 130 Z" fill="${color.horn}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
  `;
}

function renderTail(tailType: number, color: CreaturePalette): string {
  if (tailType === 0) {
    return `
      <path d="M 226 286 C 274 278 280 332 250 350 C 228 364 220 338 238 326 C 248 320 254 304 226 286 Z" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 254 350 L 270 356 L 250 372 L 238 354 Z" fill="${color.accent}" stroke="${color.bodyDark}" stroke-width="4" stroke-linejoin="round" />
    `;
  }

  if (tailType === 1) {
    return `
      <path d="M 226 286 C 280 292 282 348 238 362 C 220 366 212 344 228 334 C 242 326 246 306 226 286 Z" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="246" cy="360" r="14" fill="${color.accent}" stroke="${color.bodyDark}" stroke-width="4" />
    `;
  }

  return `
    <path d="M 228 284 C 270 292 278 334 252 354" fill="none" stroke="${color.bodyDark}" stroke-width="16" stroke-linecap="round" />
    <path d="M 228 284 C 270 292 278 334 252 354" fill="none" stroke="${color.bodyLight}" stroke-width="10" stroke-linecap="round" />
    <path d="M 250 350 L 270 354" stroke="${color.accent}" stroke-width="6" stroke-linecap="round" />
    <path d="M 244 338 L 264 342" stroke="${color.accent}" stroke-width="6" stroke-linecap="round" />
  `;
}

function renderWings(color: CreaturePalette, tornWings: number): string {
  return `
    <g opacity="0.94">
      <path d="M 106 220 C 66 168 52 120 82 102 C 118 124 126 180 144 238 C 132 252 118 252 106 220 Z" fill="${color.wing}" stroke="${color.bodyDark}" stroke-width="5" stroke-linejoin="round" />
      <path d="M 214 220 C 254 168 268 120 238 102 C 202 124 194 180 176 238 C 188 252 ${tornWings > 0 ? "206 246" : "202 252"} 214 220 Z" fill="${color.wing}" stroke="${color.bodyDark}" stroke-width="5" stroke-linejoin="round" />
      <path d="M 98 210 C 122 198 136 176 144 160" stroke="${color.bodyLight}" stroke-width="4" stroke-linecap="round" />
      <path d="M 222 210 C 198 198 184 176 176 160" stroke="${color.bodyLight}" stroke-width="4" stroke-linecap="round" />
    </g>
  `;
}

function renderAura(color: CreaturePalette): string {
  return `
    <g opacity="0.75">
      <ellipse cx="160" cy="234" rx="120" ry="160" fill="${color.aura}" opacity="0.08">
        <animate attributeName="rx" values="118;128;118" dur="3.8s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="160" cy="234" rx="146" ry="188" fill="${color.sparkle}" opacity="0.05">
        <animate attributeName="ry" values="184;194;184" dur="4.4s" repeatCount="indefinite" />
      </ellipse>
      <circle cx="74" cy="136" r="4" fill="${color.sparkle}">
        <animate attributeName="cy" values="140;128;140" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="246" cy="132" r="5" fill="${color.sparkle}">
        <animate attributeName="cy" values="136;122;136" dur="3.2s" repeatCount="indefinite" />
      </circle>
      <path d="M 96 94 L 100 104 L 110 108 L 100 112 L 96 122 L 92 112 L 82 108 L 92 104 Z" fill="${color.sparkle}" opacity="0.8" />
      <path d="M 240 88 L 244 98 L 254 102 L 244 106 L 240 116 L 236 106 L 226 102 L 236 98 Z" fill="${color.sparkle}" opacity="0.7" />
    </g>
  `;
}

function renderSpots(seed: bigint, stage: number, color: CreaturePalette): string {
  if (stage === 0) return "";
  const count = stage === 1 ? 3 : 4 + trait(seed, 44, 2);
  const pieces: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const cx = 126 + trait(seed, 50 + i * 4, 68);
    const cy = 208 + trait(seed, 70 + i * 5, 108);
    const rx = 8 + trait(seed, 92 + i * 3, 12);
    const ry = 6 + trait(seed, 112 + i * 4, 10);
    pieces.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color.accent}" opacity="0.22" />`);
  }
  return pieces.join("");
}

function renderEgg(monster: ProceduralMonster, seed: bigint, color: CreaturePalette): string {
  const crackOffset = trait(seed, 12, 20);
  const eyeSpacing = 18 + trait(seed, 30, 10);
  return `
    <g transform="translate(0 0)">
      <animateTransform attributeName="transform" type="translate" values="0 0;0 -4;0 0" dur="3.6s" repeatCount="indefinite" />
      <ellipse cx="160" cy="388" rx="84" ry="24" fill="${color.shadow}" />
      <path d="M 112 332 C 112 250 134 184 160 184 C 186 184 208 250 208 332 C 208 384 186 412 160 412 C 134 412 112 384 112 332 Z" fill="${color.belly}" stroke="${color.bodyDark}" stroke-width="5" />
      <path d="M 118 328 C 118 256 138 198 160 198 C 182 198 202 256 202 328 C 202 372 184 398 160 398 C 136 398 118 372 118 328 Z" fill="${color.bodyLight}" opacity="0.86" />
      <path d="M 134 320 L 148 302 L 158 ${292 + crackOffset} L 170 300 L 182 286 L 190 314" fill="none" stroke="${color.bodyDark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M 120 346 L 136 330 L 150 344 L 166 326 L 178 342 L 194 332" fill="none" stroke="${color.bodyDark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />
      <ellipse cx="${160 - eyeSpacing}" cy="310" rx="16" ry="20" fill="white">
        <animate attributeName="ry" values="20;20;2;20;20" dur="5.2s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="${160 + eyeSpacing}" cy="310" rx="16" ry="20" fill="white">
        <animate attributeName="ry" values="20;20;2;20;20" dur="5.2s" begin="0.12s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="${160 - eyeSpacing}" cy="314" rx="7" ry="10" fill="${color.eye}">
        <animate attributeName="ry" values="10;10;1;10;10" dur="5.2s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="${160 + eyeSpacing}" cy="314" rx="7" ry="10" fill="${color.eye}">
        <animate attributeName="ry" values="10;10;1;10;10" dur="5.2s" begin="0.12s" repeatCount="indefinite" />
      </ellipse>
      <circle cx="${160 - eyeSpacing + 3}" cy="310" r="2.5" fill="white" />
      <circle cx="${160 + eyeSpacing + 3}" cy="310" r="2.5" fill="white" />
      <path d="M 148 344 Q 160 352 172 344" fill="none" stroke="${color.bodyDark}" stroke-width="4" stroke-linecap="round" />
    </g>
  `;
}

function renderCreature(monster: ProceduralMonster, seed: bigint, color: CreaturePalette, safeName: string): string {
  const stage = monster.stage;
  const earShape = trait(seed, 6, 3);
  const hornType = trait(seed, 18, 3);
  const tailType = trait(seed, 26, 3);
  const eyeSpacing = 18 + trait(seed, 34, 14);

  const bodyHeight = 220 + stage * 60;
  const headY = stage === 1 ? 160 : stage === 2 ? 146 : 132;
  const headRx = stage === 1 ? 62 : stage === 2 ? 66 : 72;
  const headRy = stage === 1 ? 58 : stage === 2 ? 60 : 68;
  const bodyY = stage === 1 ? 266 : stage === 2 ? 282 : 294;
  const bodyRx = stage === 1 ? 54 : stage === 2 ? 64 : 72;
  const bodyRy = stage === 1 ? 76 : stage === 2 ? 98 : 120;
  const armLength = stage === 1 ? 46 : stage === 2 ? 72 : 96;
  const legLength = stage === 1 ? 42 : stage === 2 ? 58 : 66;
  const legBaseY = 360 + Math.min(28, stage * 10);
  const eyeY = headY + 8;
  const cheekY = headY + 28;
  const pupilShift = trait(seed, 40, 4) - 2;
  const cheekColor = color.accent;
  const bodyFloat = stage === 1 ? -3 : -5;
  const spikeCount = 3 + trait(seed, 54, 3);
  const spikes = stage >= 2
    ? Array.from({ length: spikeCount }, (_, index) => {
        const cx = 132 + index * 18;
        const peakY = 132 - trait(seed, 60 + index * 5, 14);
        return `<path d="M ${cx} ${headY - headRy + 16} L ${cx + 8} ${peakY} L ${cx + 18} ${headY - headRy + 16} Z" fill="${color.accent}" opacity="0.65" />`;
      }).join("")
    : "";

  return `
    <g transform="translate(0 0)">
      <animateTransform attributeName="transform" type="translate" values="0 0;0 ${bodyFloat};0 0" dur="3.8s" repeatCount="indefinite" />
      <ellipse cx="160" cy="404" rx="${stage === 1 ? 78 : 92}" ry="${stage === 1 ? 24 : 28}" fill="${color.shadow}" />
      ${stage === 3 ? renderAura(color) : ""}
      ${stage === 3 ? renderWings(color, monster.torn_wings) : ""}
      ${stage >= 2 ? renderTail(tailType, color) : ""}
      <g>
        <path d="M 118 ${bodyY - 26} C 96 ${bodyY - 10} 90 ${bodyY + 12} 96 ${bodyY + armLength} C 98 ${bodyY + armLength + 18} 116 ${bodyY + armLength + 16} 122 ${bodyY + armLength - 2} L 128 ${bodyY + 32}" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M 202 ${bodyY - 26} C 224 ${bodyY - 10} 230 ${bodyY + 12} 224 ${bodyY + armLength} C 222 ${bodyY + armLength + 18} 204 ${bodyY + armLength + 16} 198 ${bodyY + armLength - 2} L 192 ${bodyY + 32}" fill="${color.bodyLight}" stroke="${color.bodyDark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <g>
        <path d="M 138 ${bodyY + bodyRy - 8} C 132 ${bodyY + bodyRy + 16} 130 ${legBaseY + legLength - 8} 138 ${legBaseY + legLength}" fill="none" stroke="${color.bodyDark}" stroke-width="16" stroke-linecap="round" />
        <path d="M 182 ${bodyY + bodyRy - 8} C 188 ${bodyY + bodyRy + 16} 190 ${legBaseY + legLength - 8} 182 ${legBaseY + legLength}" fill="none" stroke="${color.bodyDark}" stroke-width="16" stroke-linecap="round" />
        <path d="M 138 ${bodyY + bodyRy - 8} C 132 ${bodyY + bodyRy + 16} 130 ${legBaseY + legLength - 8} 138 ${legBaseY + legLength}" fill="none" stroke="${color.bodyLight}" stroke-width="10" stroke-linecap="round" />
        <path d="M 182 ${bodyY + bodyRy - 8} C 188 ${bodyY + bodyRy + 16} 190 ${legBaseY + legLength - 8} 182 ${legBaseY + legLength}" fill="none" stroke="${color.bodyLight}" stroke-width="10" stroke-linecap="round" />
        <ellipse cx="136" cy="${legBaseY + legLength + 6}" rx="20" ry="10" fill="${color.bodyDark}" />
        <ellipse cx="184" cy="${legBaseY + legLength + 6}" rx="20" ry="10" fill="${color.bodyDark}" />
      </g>
      <ellipse cx="160" cy="${bodyY}" rx="${bodyRx}" ry="${bodyRy}" fill="${color.body}" stroke="${color.bodyDark}" stroke-width="5">
        <animate attributeName="ry" values="${bodyRy};${bodyRy + 6};${bodyRy}" dur="3.4s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="160" cy="${bodyY + 16}" rx="${Math.max(32, bodyRx - 14)}" ry="${Math.max(38, bodyRy - 20)}" fill="${color.belly}" opacity="0.96" />
      ${renderSpots(seed, stage, color)}
      ${renderEar(earShape, 118, "left", color)}
      ${renderEar(earShape, 202, "right", color)}
      ${stage >= 2 ? renderHorns(hornType, monster.broken_horns, color) : ""}
      ${spikes}
      <ellipse cx="160" cy="${headY}" rx="${headRx}" ry="${headRy}" fill="${color.body}" stroke="${color.bodyDark}" stroke-width="5" />
      <ellipse cx="160" cy="${headY + 14}" rx="${Math.max(20, headRx - 20)}" ry="${Math.max(12, headRy - 28)}" fill="${color.bodyLight}" opacity="0.38" />
      <ellipse cx="${160 - eyeSpacing}" cy="${eyeY}" rx="${stage === 1 ? 18 : 16}" ry="${stage === 1 ? 22 : 20}" fill="white">
        <animate attributeName="ry" values="${stage === 1 ? 22 : 20};${stage === 1 ? 22 : 20};2;${stage === 1 ? 22 : 20};${stage === 1 ? 22 : 20}" dur="5.4s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="${160 + eyeSpacing}" cy="${eyeY}" rx="${stage === 1 ? 18 : 16}" ry="${stage === 1 ? 22 : 20}" fill="white">
        <animate attributeName="ry" values="${stage === 1 ? 22 : 20};${stage === 1 ? 22 : 20};2;${stage === 1 ? 22 : 20};${stage === 1 ? 22 : 20}" dur="5.4s" begin="0.1s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="${160 - eyeSpacing + pupilShift}" cy="${eyeY + 4}" rx="7" ry="10" fill="${color.iris}">
        <animate attributeName="ry" values="10;10;1;10;10" dur="5.4s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="${160 + eyeSpacing + pupilShift}" cy="${eyeY + 4}" rx="7" ry="10" fill="${color.iris}">
        <animate attributeName="ry" values="10;10;1;10;10" dur="5.4s" begin="0.1s" repeatCount="indefinite" />
      </ellipse>
      <circle cx="${160 - eyeSpacing + pupilShift + 2}" cy="${eyeY + 1}" r="2.5" fill="white" />
      <circle cx="${160 + eyeSpacing + pupilShift + 2}" cy="${eyeY + 1}" r="2.5" fill="white" />
      <ellipse cx="${160 - eyeSpacing}" cy="${cheekY}" rx="${stage === 1 ? 12 : 9}" ry="${stage === 1 ? 8 : 7}" fill="${cheekColor}" opacity="0.22" />
      <ellipse cx="${160 + eyeSpacing}" cy="${cheekY}" rx="${stage === 1 ? 12 : 9}" ry="${stage === 1 ? 8 : 7}" fill="${cheekColor}" opacity="0.22" />
      <path d="M 146 ${headY + 40} Q 160 ${headY + 52} 174 ${headY + 40}" fill="none" stroke="${color.bodyDark}" stroke-width="4" stroke-linecap="round" />
      <path d="M 156 ${headY + 38} Q 160 ${headY + 44} 164 ${headY + 38}" fill="none" stroke="${color.bodyDark}" stroke-width="3" stroke-linecap="round" />
      ${monster.scars > 0 ? `<path d="M 194 ${headY + 6} L 206 ${headY + 20}" stroke="${color.bodyDark}" stroke-width="3" stroke-linecap="round" opacity="0.55" />` : ""}
      ${monster.scars > 1 ? `<path d="M 118 ${bodyY - 6} L 132 ${bodyY + 8}" stroke="${color.bodyDark}" stroke-width="3" stroke-linecap="round" opacity="0.55" />` : ""}
      ${monster.xp > 30 ? `<circle cx="208" cy="${headY - 8}" r="6" fill="${color.sparkle}" opacity="0.75" />` : ""}
    </g>
    <text x="160" y="486" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-size="18" font-family="Inter, system-ui, sans-serif" font-weight="700">${safeName}</text>
    <text x="160" y="506" text-anchor="middle" fill="rgba(255,255,255,0.42)" font-size="11" font-family="Inter, system-ui, sans-serif" letter-spacing="1.6">HEIGHT ${bodyHeight}  ATK ${monster.attack}  DEF ${monster.defense}  SPD ${monster.speed}</text>
  `;
}

export function renderMonsterSvg(input: ProceduralMonsterInput): string {
  const monster = normalizeProceduralMonster(input);
  const seed = parseSeed(monster.seed, monster.objectId);
  const color = paletteFromSeed(seed);
  const safeName = escapeXml(monster.name);
  const bgTop = hsl((trait(seed, 2, 360) + 320) % 360, 54, 18);
  const bgBottom = hsl((trait(seed, 6, 360) + 220) % 360, 48, 8);

  const stageTitle = ["Egg", "Baby", "Adult", "Legendary"][monster.stage] ?? "Egg";
  const content = monster.stage === 0
    ? renderEgg(monster, seed, color)
    : renderCreature(monster, seed, color, safeName);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 520" role="img" aria-label="${safeName} ${stageTitle}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${bgTop}" />
          <stop offset="100%" stop-color="${bgBottom}" />
        </linearGradient>
        <radialGradient id="spotlight" cx="50%" cy="10%" r="70%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.24)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <rect width="320" height="520" rx="36" fill="url(#bg)" />
      <rect width="320" height="520" rx="36" fill="url(#spotlight)" opacity="0.9" />
      <circle cx="80" cy="80" r="42" fill="${color.sparkle}" opacity="0.06" />
      <circle cx="248" cy="104" r="56" fill="${color.accent}" opacity="0.08" />
      ${content}
    </svg>
  `;
}

export function renderMonsterDataUri(input: ProceduralMonsterInput): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(renderMonsterSvg(input))}`;
}

export function monsterToProceduralInput(monster: Monster | ArenaMonsterSnapshot): ProceduralMonsterInput {
  return {
    objectId: monster.objectId,
    seed: "seed" in monster ? monster.seed : undefined,
    name: monster.name,
    stage: monster.stage,
    attack: monster.attack,
    defense: monster.defense,
    speed: monster.speed,
    wins: monster.wins,
    losses: monster.losses,
    xp: monster.xp,
    scars: monster.scars,
    broken_horns: monster.broken_horns,
    torn_wings: monster.torn_wings,
  };
}
