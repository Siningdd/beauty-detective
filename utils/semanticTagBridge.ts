import type { Category } from "../types/analysis";
import { buildChartSegments, type ChartSegment } from "./formulationChart";
import {
  DEFAULT_FALLBACK_TAG_THEME,
  TAG_PILL_THEMES,
} from "../constants/chartTagThemes";
import { getTagPool } from "../api/featureTagPools";

export type LinkedTheme = {
  matchedName: string | null;
  segmentIndex: number | null;
  percent: number | null;
  displayLabel: string;
  pillBg: string;
  pillText: string;
};

function normalizeTagText(raw: string): string {
  return String(raw)
    .trim()
    .replace(/^#+/u, "")
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

function formatCoreTagForDisplay(raw: string): string {
  const t = String(raw).trim();
  if (!t) return "#";
  if (t.startsWith("#")) return t;
  return `#${t}`;
}

/** Longer phrases first so e.g. "anti-wrinkle" beats "wrinkle" */
function sortKeysByLengthDesc(keys: string[]): string[] {
  return [...keys].sort((a, b) => b.length - a.length);
}

type KeywordEntry = { phrase: string; canonical: string };

function skincareKeywordTable(): KeywordEntry[] {
  return [
    { phrase: "anti-wrinkle", canonical: "Repair" },
    { phrase: "anti wrinkle", canonical: "Repair" },
    { phrase: "wrinkle", canonical: "Repair" },
    { phrase: "aging", canonical: "Repair" },
    { phrase: "ageing", canonical: "Repair" },
    { phrase: "retinol", canonical: "Repair" },
    { phrase: "peptide", canonical: "Repair" },
    { phrase: "firming", canonical: "Repair" },
    { phrase: "hydration", canonical: "Hydrating" },
    { phrase: "hydrating", canonical: "Hydrating" },
    { phrase: "hydrate", canonical: "Hydrating" },
    { phrase: "moistur", canonical: "Hydrating" },
    { phrase: "humectant", canonical: "Hydrating" },
    { phrase: "barrier", canonical: "Hydrating" },
    { phrase: "soothing", canonical: "Soothing" },
    { phrase: "soothe", canonical: "Soothing" },
    { phrase: "calming", canonical: "Soothing" },
    { phrase: "calm", canonical: "Soothing" },
    { phrase: "sensitive", canonical: "Soothing" },
    { phrase: "redness", canonical: "Soothing" },
    { phrase: "anti-acne", canonical: "Anti-acne" },
    { phrase: "anti acne", canonical: "Anti-acne" },
    { phrase: "acne", canonical: "Anti-acne" },
    { phrase: "blemish", canonical: "Anti-acne" },
    { phrase: "exfoliating", canonical: "Exfoliating" },
    { phrase: "exfoliant", canonical: "Exfoliating" },
    { phrase: "aha", canonical: "Exfoliating" },
    { phrase: "bha", canonical: "Exfoliating" },
    { phrase: "glycation", canonical: "Anti-glycation" },
    { phrase: "antioxidant", canonical: "Antioxidant" },
    { phrase: "vitamin c", canonical: "Antioxidant" },
    { phrase: "niacinamide", canonical: "Antioxidant" },
    { phrase: "fragrance", canonical: "Fragrance" },
    { phrase: "botanical", canonical: "Botanical" },
    { phrase: "preservative", canonical: "Preservative" },
    { phrase: "base", canonical: "Base" },
    { phrase: "emollient", canonical: "Conditioning" },
    { phrase: "conditioning", canonical: "Conditioning" },
  ];
}

function haircareKeywordTable(): KeywordEntry[] {
  return [
    { phrase: "anti-dandruff", canonical: "Anti-dandruff" },
    { phrase: "dandruff", canonical: "Anti-dandruff" },
    { phrase: "oil-control", canonical: "Oil-Control" },
    { phrase: "oil control", canonical: "Oil-Control" },
    { phrase: "cleansing", canonical: "Cleansing" },
    { phrase: "cleanse", canonical: "Cleansing" },
    { phrase: "strengthening", canonical: "Strengthening" },
    { phrase: "smooth", canonical: "Smoothing" },
    { phrase: "smoothing", canonical: "Smoothing" },
    { phrase: "repair", canonical: "Repair" },
    { phrase: "soothing", canonical: "Soothing" },
    { phrase: "fragrance", canonical: "Fragrance" },
    { phrase: "botanical", canonical: "Botanical" },
    { phrase: "preservative", canonical: "Preservative" },
    { phrase: "base", canonical: "Base" },
  ];
}

function supplementKeywordTable(): KeywordEntry[] {
  return [
    { phrase: "core-active", canonical: "Core-Active" },
    { phrase: "core active", canonical: "Core-Active" },
    { phrase: "co-factors", canonical: "Co-factors" },
    { phrase: "cofactor", canonical: "Co-factors" },
    { phrase: "bioavailability", canonical: "Bioavailability" },
    { phrase: "filler", canonical: "Fillers" },
    { phrase: "capsule", canonical: "Capsule-Shell" },
    { phrase: "flavor", canonical: "Flavor/Fragrance" },
    { phrase: "fragrance", canonical: "Flavor/Fragrance" },
    { phrase: "preservative", canonical: "Preservative" },
    { phrase: "conditioning", canonical: "Conditioning" },
  ];
}

function keywordTableForCategory(category: Category): KeywordEntry[] {
  if (category === "haircare") return haircareKeywordTable();
  if (category === "supplement") return supplementKeywordTable();
  if (category === "skincare") return skincareKeywordTable();
  return [];
}

function resolveKeywordCanonical(
  normalized: string,
  category: Category
): string | null {
  const pool = new Set(getTagPool(category));
  const table = keywordTableForCategory(category);
  const sorted = sortKeysByLengthDesc(table.map((e) => e.phrase));
  const byPhrase = new Map(table.map((e) => [e.phrase, e.canonical]));
  for (const phrase of sorted) {
    const canonical = byPhrase.get(phrase);
    if (!canonical || !pool.has(canonical)) continue;
    if (normalized.includes(phrase)) return canonical;
  }
  return null;
}

function findSegmentByName(
  name: string,
  segments: ChartSegment[]
): ChartSegment | undefined {
  const lower = name.toLowerCase();
  return segments.find((s) => s.name.toLowerCase() === lower);
}

function resolveFromSubstring(
  normalized: string,
  segments: ChartSegment[]
): ChartSegment | undefined {
  const sortedSegs = [...segments].sort(
    (a, b) => b.name.length - a.name.length
  );
  for (const seg of sortedSegs) {
    const ln = seg.name.toLowerCase();
    if (normalized.includes(ln)) return seg;
  }
  return undefined;
}

function pillThemeForSegmentIndex(segmentIndex: number): {
  pillBg: string;
  pillText: string;
} {
  const i = segmentIndex % TAG_PILL_THEMES.length;
  return TAG_PILL_THEMES[i] ?? DEFAULT_FALLBACK_TAG_THEME;
}

/** Tag as string (legacy) or { label, feature_tag? } for explicit chart linkage. */
export type CoreTagInput = string | { label: string; feature_tag?: string };

/**
 * Links a free-form core tag to chart segments (ingredient evidence).
 * displayLabel = formatCoreTagForDisplay(label) only (no %).
 * Unmatched → DEFAULT_FALLBACK_TAG_THEME.
 */
export function getLinkedTheme(
  tag: CoreTagInput,
  chartData: Array<{ name: string; value: number }>,
  category: Category
): LinkedTheme {
  const label = typeof tag === "string" ? tag : tag.label;
  const explicitFeatureTag = typeof tag === "object" ? tag.feature_tag : undefined;
  const { total, segments } = buildChartSegments(chartData);
  const baseLabel = formatCoreTagForDisplay(label);

  if (total <= 0 || segments.length === 0) {
    return {
      matchedName: null,
      segmentIndex: null,
      percent: null,
      displayLabel: baseLabel,
      pillBg: DEFAULT_FALLBACK_TAG_THEME.pillBg,
      pillText: DEFAULT_FALLBACK_TAG_THEME.pillText,
    };
  }

  let seg: ChartSegment | undefined = undefined;
  if (explicitFeatureTag && explicitFeatureTag.trim()) {
    seg = findSegmentByName(explicitFeatureTag.trim(), segments);
  }
  if (!seg) {
    const normalized = normalizeTagText(label);
    seg =
      normalized.length > 0 ? findSegmentByName(normalized, segments) : undefined;
    if (!seg && category !== "unknown") {
      const canonical = resolveKeywordCanonical(normalized, category);
      if (canonical) seg = findSegmentByName(canonical, segments);
    }
    if (!seg) seg = resolveFromSubstring(normalized, segments);
  }

  if (!seg) {
    return {
      matchedName: null,
      segmentIndex: null,
      percent: null,
      displayLabel: baseLabel,
      pillBg: DEFAULT_FALLBACK_TAG_THEME.pillBg,
      pillText: DEFAULT_FALLBACK_TAG_THEME.pillText,
    };
  }

  const theme = pillThemeForSegmentIndex(seg.index);
  return {
    matchedName: seg.name,
    segmentIndex: seg.index,
    percent: seg.percent,
    displayLabel: baseLabel,
    pillBg: theme.pillBg,
    pillText: theme.pillText,
  };
}
