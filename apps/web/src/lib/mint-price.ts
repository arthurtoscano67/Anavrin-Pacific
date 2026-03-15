const MIST_PER_SUI = 1_000_000_000n;

function normalizeMist(value: string | number | bigint | null | undefined) {
  if (typeof value === "bigint") {
    return value >= 0n ? value : 0n;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return 0n;
    }

    return BigInt(Math.floor(value));
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  return 0n;
}

export function formatMistToSui(value: string | number | bigint | null | undefined) {
  const mist = normalizeMist(value);
  const whole = mist / MIST_PER_SUI;
  const fraction = (mist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function formatMistToSuiLabel(value: string | number | bigint | null | undefined) {
  return `${formatMistToSui(value)} SUI`;
}

export function parseSuiToMist(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,9})?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt((fractionPart + "000000000").slice(0, 9));
  return (whole * MIST_PER_SUI + fraction).toString();
}
