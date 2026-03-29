/** Segment-safe OCR text correction: comma/semicolon/newline-separated INCI-style lists. */

export type OcrCorrectionMap = Record<string, string>;

function normalizeIncomingMap(map: unknown): OcrCorrectionMap {
  if (!map || typeof map !== "object") return {};
  const out: OcrCorrectionMap = {};
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    const ks = String(k).trim();
    const vs = String(v ?? "").trim();
    if (ks && vs) out[ks] = vs;
  }
  return out;
}

/**
 * Replace whole list segments when they case-insensitively match a map key.
 * If the entire string is one segment and matches, replace the whole string.
 */
export function applyOcrCorrectionMapToText(
  text: string,
  map: unknown
): string {
  const m = normalizeIncomingMap(map);
  const keys = Object.keys(m);
  if (keys.length === 0) return text;

  const trimmed = text.trim();
  if (!trimmed) return text;

  const lowerToValue = new Map<string, string>();
  for (const k of keys) {
    lowerToValue.set(k.toLowerCase(), m[k]!);
  }

  const whole = lowerToValue.get(trimmed.toLowerCase());
  if (whole) return whole;

  const segments = trimmed
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return text;

  const next = segments.map(
    (seg) => lowerToValue.get(seg.toLowerCase()) ?? seg
  );
  return next.join(", ");
}

export function normalizeOcrCorrectionMapBody(raw: unknown): OcrCorrectionMap {
  return normalizeIncomingMap(raw);
}
