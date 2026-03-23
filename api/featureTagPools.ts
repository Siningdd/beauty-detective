import type { Category } from "../types/analysis.js";

/** Strict pools — exact spellings required in API output */
export const SKINCARE_TAGS = [
  "Hydrating",
  "Antioxidant",
  "Soothing",
  "Anti-acne",
  "Exfoliating",
  "Repair",
  "Anti-glycation",
  "Conditioning",
  "Fragrance",
  "Botanical",
  "Preservative",
  "Base",
] as const;

export const HAIRCARE_TAGS = [
  "Cleansing",
  "Oil-Control",
  "Smoothing",
  "Repair",
  "Anti-dandruff",
  "Strengthening",
  "Soothing",
  "Fragrance",
  "Botanical",
  "Preservative",
  "Base",
] as const;

export const SUPPLEMENT_TAGS = [
  "Core-Active",
  "Co-factors",
  "Bioavailability",
  "Fillers",
  "Flavor/Fragrance",
  "Conditioning",
  "Preservative",
  "Capsule-Shell",
] as const;

export type SkincareTag = (typeof SKINCARE_TAGS)[number];
export type HaircareTag = (typeof HAIRCARE_TAGS)[number];
export type SupplementTag = (typeof SUPPLEMENT_TAGS)[number];

const SKINCARE_SET = new Set<string>(SKINCARE_TAGS);
const HAIRCARE_SET = new Set<string>(HAIRCARE_TAGS);
const SUPPLEMENT_SET = new Set<string>(SUPPLEMENT_TAGS);

/** Aliases → canonical (lowercase key) */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  "oil control": "Oil-Control",
  "oil-control": "Oil-Control",
  "flavor": "Flavor/Fragrance",
  "fragrance": "Flavor/Fragrance",
  "flavor/fragrance": "Flavor/Fragrance",
  "capsule shell": "Capsule-Shell",
  "capsule-shell": "Capsule-Shell",
  "co factors": "Co-factors",
  "co-factors": "Co-factors",
  "cofactors": "Co-factors",
  "core active": "Core-Active",
  "core-active": "Core-Active",
  "anti acne": "Anti-acne",
  "anti-acne": "Anti-acne",
  "anti glycation": "Anti-glycation",
  "anti-glycation": "Anti-glycation",
  "anti dandruff": "Anti-dandruff",
  "anti-dandruff": "Anti-dandruff",
};

export function getTagPool(category: Category): readonly string[] {
  if (category === "haircare") return HAIRCARE_TAGS;
  if (category === "supplement") return SUPPLEMENT_TAGS;
  if (category === "skincare") return SKINCARE_TAGS;
  return SKINCARE_TAGS;
}

function poolSet(category: Category): Set<string> {
  if (category === "haircare") return HAIRCARE_SET;
  if (category === "supplement") return SUPPLEMENT_SET;
  return SKINCARE_SET;
}

export function coerceFeatureTag(raw: string, category: Category): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Base";

  const pool = poolSet(category);
  if (pool.has(trimmed)) return trimmed;

  const alias = ALIAS_TO_CANONICAL[trimmed.toLowerCase()];
  if (alias && pool.has(alias)) return alias;

  const lower = trimmed.toLowerCase();
  for (const tag of getTagPool(category)) {
    if (tag.toLowerCase() === lower) return tag;
  }

  return "Base";
}

const MAJOR_WEIGHT = 3;
const TRACE_WEIGHT = 1;

export function buildChartData(
  ingredients: Array<{ feature_tag: string; is_major: boolean }>,
  category: Category
): Array<{ name: string; value: number }> {
  const scores = new Map<string, number>();
  for (const ing of ingredients) {
    const w = ing.is_major ? MAJOR_WEIGHT : TRACE_WEIGHT;
    const t = ing.feature_tag;
    scores.set(t, (scores.get(t) ?? 0) + w);
  }
  const order = getTagPool(category);
  const out: Array<{ name: string; value: number }> = [];
  for (const name of order) {
    const value = scores.get(name) ?? 0;
    if (value > 0) out.push({ name, value });
  }
  return out;
}
