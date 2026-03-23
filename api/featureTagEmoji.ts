/**
 * feature_tag → emoji mapping for local emoji supplement when model omits them.
 * Aligned with api/prompts.ts examples.
 */
const FEATURE_TAG_EMOJI: Record<string, string> = {
  // Skincare
  Hydrating: "💧",
  Antioxidant: "🛡️",
  Soothing: "🌿",
  "Anti-acne": "🩹",
  Exfoliating: "✨",
  Repair: "🧬",
  "Anti-glycation": "🕰️",
  Conditioning: "💆",
  Fragrance: "🌸",
  Botanical: "🌿",
  Preservative: "🧪",
  Base: "⚙️",
  // Haircare (overlaps use first-defined)
  Cleansing: "☁️",
  "Oil-Control": "🧴",
  Smoothing: "✨",
  "Anti-dandruff": "❄️",
  Strengthening: "💪",
  // Supplement
  "Core-Active": "🧠",
  "Co-factors": "🛠️",
  Bioavailability: "🚀",
  Fillers: "📦",
  "Flavor/Fragrance": "🌸",
  "Capsule-Shell": "💊",
};

const FALLBACK_EMOJI = "✨";

/** When model omits a leading emoji, rotate so consecutive pros/cons are not identical. */
const PRO_FALLBACK_EMOJIS = ["✨", "💧", "🛡️", "🌿", "💜"] as const;
const CON_FALLBACK_EMOJIS = ["⚠️", "🔶", "📌"] as const;

/** Any emoji at start → prefer AI; no emoji → use default. Uses Unicode Extended_Pictographic. */
function hasLeadingEmoji(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && /^\p{Extended_Pictographic}/u.test(t);
}

export function getEmojiForFeatureTag(featureTag: string | undefined): string {
  if (!featureTag || !featureTag.trim()) return FALLBACK_EMOJI;
  const trimmed = featureTag.trim();
  return FEATURE_TAG_EMOJI[trimmed] ?? FALLBACK_EMOJI;
}

export function ensureLabelEmoji(
  label: string,
  featureTag?: string
): string {
  const t = label.trim();
  if (!t) return t;
  if (hasLeadingEmoji(t)) return label;
  const emoji = getEmojiForFeatureTag(featureTag);
  return `${emoji} ${t}`;
}

/**
 * Pros/cons: API keeps model text. UI calls with rowIndex; trim 后句首已有 emoji 则不动，
 * 否则按行轮换兜底 emoji（避免每条都是 ✅）。
 */
export function ensureProConEmoji(
  s: string,
  type: "pro" | "con",
  rowIndex = 0
): string {
  const t = s.trim();
  if (!t) return t;
  if (hasLeadingEmoji(t)) return s;
  const pool =
    type === "pro" ? PRO_FALLBACK_EMOJIS : CON_FALLBACK_EMOJIS;
  const emoji = pool[rowIndex % pool.length] ?? pool[0];
  return `${emoji} ${t}`;
}
