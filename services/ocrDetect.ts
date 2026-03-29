/**
 * 本地 OCR 预判产品类型（基于成分，补剂/活性护肤），用于自动开启 thinking
 * 匹配 INCI 成分名，支持英文与德语
 * Web: tesseract.js | Native: expo-text-extractor
 */

import { Image, Platform } from "react-native";
import { distance } from "fastest-levenshtein";
import { canonicalizeIngredientKey } from "../constants/ingredientDict";

export {
  BANNED_INGREDIENT_GROUPS,
  CRITICAL_BANNED_LIST,
  EU_BANNED_LIST,
  detectCriticalBannedIngredient,
  type SafetyCategoryHint,
} from "./criticalBan";

export type ThinkingHint = "supplement" | "essence" | "cream" | "special";

export type CategoryHint = "skincare" | "haircare" | "supplement";
export type OcrConfidenceHint = "low" | "medium" | "high";
export type ResolvedHintDecision = {
  categoryHint: CategoryHint;
  thinkingHint?: Exclude<ThinkingHint, "special">;
};
export type OcrDetectionResult = {
  rawOcrText: string;
  correctedText: string;
  confidenceHint: OcrConfidenceHint;
  categoryHint?: CategoryHint;
  thinkingHint?: ThinkingHint;
  detectedKind: "supplement" | "shampoo" | "skincare_serum" | "skincare_cream" | "unknown";
  suggestedCategoryHint?: CategoryHint;
  needsCategoryConfirm: boolean;
  ocrText: string;
};
export type OcrStreamToken = {
  id: string;
  text: string;
};
type ClassifyKind =
  | "supplement"
  | "shampoo"
  | "skincare_serum"
  | "skincare_cream"
  | "unknown";

export type SubtypeMeta = {
  subtypeScore: number;
  subtypeConfidence: "high" | "low";
  subtypeLocked: boolean;
};

const DEFAULT_SUBTYPE_META: SubtypeMeta = {
  subtypeScore: 0,
  subtypeConfidence: "low",
  subtypeLocked: false,
};

/** When false: one OCR pass only (upscale / 180° retry code stays but does not run). */
const ENABLE_OCR_RETRY = false;

/**
 * When classifyProduct returns a concrete kind, treat category as locally resolved
 * (matches internal topScore/margin gates). OCR "low" still forces path B (LLM classify).
 * Supplement keeps a slightly higher margin bar to reduce haircare → supplement false positives.
 */
const LOCAL_SUPPLEMENT_HINT_MIN_MARGIN = 10;

function isLocalCategoryTrustedForApi(
  classified: {
    kind: ClassifyKind;
    margin: number;
  },
  confidenceHint: OcrConfidenceHint
): boolean {
  if (classified.kind === "unknown") return false;
  if (confidenceHint === "low") return false;
  if (classified.kind === "supplement") {
    return classified.margin >= LOCAL_SUPPLEMENT_HINT_MIN_MARGIN;
  }
  return true;
}

type WeightedRule = {
  regex: RegExp;
  weight: number;
};

type WebTesseractWorker = {
  recognize: (
    image: string
  ) => Promise<{ data: { text?: string | null } }>;
  detect?: (image: string) => Promise<{
    data?: {
      orientation_degrees?: number | string | null;
      orientation?: number | string | null;
      osd?: {
        orientation_degrees?: number | string | null;
        orientation?: number | string | null;
      };
    };
  }>;
  setParameters?: (params: Record<string, string | number>) => Promise<unknown>;
};

type WebExtractOptions = {
  upscale?: boolean;
  forceRotate180?: boolean;
};

type OcrCandidate = {
  rawOcrText: string;
  correctedText: string;
  confidenceHint: OcrConfidenceHint;
  tokenCount: number;
};

const OCR_SHORT_TEXT_MIN_CHARS = 18;
const OCR_SHORT_TEXT_MIN_TOKENS = 4;

const UNIT_AFTER_NUMBER_REG = /(?<=\d)\s*(mg|mcg|µg|iu|ie|nrv)\b/gi;
const STRONG_SUPP_RE =
  /\b(naehrwert|nahrungsergaenzung(?:smittel)?|supplement facts|serving size)\b/i;
const STRONG_SKIN_RE =
  /\b(ingredients|bestandteile|inci|aqua|wasser|glycerin)\b/i;
const ORAL_INSTRUCTION_RE =
  /\b(einnehmen|swallow|daily dose|dosage|take with water|serving|taeglich)\b/i;
const SKIN_ACTION_RE =
  /\b(apply|skin|face|massage|gesicht|hals|auftragen|creme|cream|serum)\b/i;
const VITAMIN_C_RE = /\bvitamin\s*c\b/i;
const TOPICAL_VC_RE =
  /\b(ascorbic|ascorbyl|palmitate|skin|face|cream|serum|haut|gesicht)\b/i;

/** Strong rinse-off: lock subtype hints (EN/DE). */
const STRONG_RINSE_RE =
  /\b(sulfate|isethionate|lather|rinse|wash|cleanser|nettoyant|soap|saponified|reinigung|waschgel|abspuelen|duschgel)\b/i;
const WEAK_RINSE_RE =
  /\b(betaine|glucoside|amphoacetate|glutamate|coco-betaine|mizellen)\b/i;
const GELLING_AGENTS_RE =
  /\b(xanthan|carbomer|polyacrylate|crosspolymer|acryloyldimethyltaurate|hydroxyethylcellulose)\b/i;
const HEAVY_OILS_RE =
  /\b(butyrospermum|petrolatum|cera|wax|stearic|lanolin|mineraloel|sheabutter|bienenwachs|mandeloel|jojobaoel|arganoel|olivenoel|sonnenblumenoel|butter)\b/i;
const EMULSIFIER_SYSTEM_RE =
  /\b(glyceryl\s+stearate|peg-100\s+stearate|sorbitan\s+stearate|polysorbate|ceteareth|polyglyceryl)\b/i;
const FATTY_ALCOHOLS_RE =
  /\b(cetearyl\s+alcohol|cetyl\s+alcohol|stearyl\s+alcohol|behenyl\s+alcohol|fettalkohol)\b/i;
const SUNSCREEN_RE =
  /\b(homosalate|octocrylene|avobenzone|salicylate|benzophenone|titanium\s+dioxide|zinc\s+oxide|lichtschutz|sunscreen|sonnen|sonnenschutz|lsf|spf|uv-schutz|uva|uvb|pa\+)\b/i;
/** Title / marketing hints (normalized text; umlauts downgraded). */
const CREAM_HINT_RE =
  /\b(cream|creme|balm|balsam|tagespflege|nachtpflege|gesichtscreme|butter|gel[-\s]?cream)\b/i;
const SERUM_STRONG_WORDS_RE =
  /\b(serum|essence|konzentrat|ampulle|ampoule|tropfen|elixir)\b/i;
const KUR_ONLY_RE = /\bkur\b/i;
/**
 * 敏感活性词根拦截（无词界；偏敏感，适配 OCR 碎片）
 * 含 VC / VA / 烟酸族、多类酸根、肽、酯类常见词干，以及 ceramid / tocopher / vitamin / acid。
 */
const FORCE_THINKING_RE =
  /(ascorb|retin|niacin|salicyl|glycol|lactic|mandel|glucon|tranexam|peptid|tretin|bakuch|resverat|ferul|ceramid|tocopher|vitamin|acid)/i;
export const ACTIVE_WHITELIST = [
  "niacinamide",
  "ascorbic",
  "retinol",
  "salicylic",
  "glycolic",
  "peptide",
  "ceramide",
  "bakuchiol",
  "resveratrol",
  "tocopherol",
  "tranexamic",
] as const;
const SKINCARE_BASE_MARKERS_RE =
  /\b(aqua|wasser|glycerin|propanediol|butylene\s+glycol|pentylene\s+glycol|carbomer|dimethicone|cetearyl|caprylic|triglyceride)\b/i;

const SUBTYPE_TITLE_WINDOW = 400;

const SUPPLEMENT_RULES: WeightedRule[] = [
  { regex: /\b(nahrungsergaenzungsmittel|supplement facts|dietary supplement|verzehrempfehlung)\b/gi, weight: 20 },
  { regex: /\b(kapseln?|tabletten?|capsules?|tablets?|softgels?|gummies?)\b/gi, weight: 10 },
  { regex: /\b(einnehmen|schlucken|take with water|daily dose|tagesdosis|tagesportion)\b/gi, weight: 15 },
  { regex: /\b(magnesium|zink|zinc|omega[\s-]?3|fischoel|folsaeure|biotin)\b/gi, weight: 10 },
];

const SHAMPOO_RULES: WeightedRule[] = [
  {
    regex:
      /\b(shampoo|shamp[o0]{2}|conditioner|conditi[o0]ner|spuelung|spülung|haarkur|antischuppen)\b/gi,
    weight: 22,
  },
  {
    regex:
      /\b(ausspuelen|ausspülen|rinse(?:\s+off)?|ins nasse haar|apply to wet hair|lather)\b/gi,
    weight: 22,
  },
  {
    regex:
      /\b(sodium chloride|chloride|kopfhaut|scalp|sodium laureth sulfate|sulfates?|sulfat|betaine|keratin)\b/gi,
    weight: 22,
  },
  {
    regex:
      /\b(spulung|spuelung|spülung|reinigung|tensid|seifenfrei|inhaltsstoffe)\b/gi,
    weight: 24,
  },
  {
    regex: /\b(aqua|glucoside|sulfosuccinate)\b/gi,
    weight: 20,
  },
  {
    regex: /\b(ph\s*5[\s.,-]*5|ph55)\b/gi,
    weight: 35,
  },
  {
    regex: /\b400\s*ml\b/gi,
    weight: 15,
  },
];

const SKINCARE_RULES: WeightedRule[] = [
  { regex: /\b(gesichtscreme|moisturizer|moisturiser|facial|serum|konzentrat|ampulle)\b/gi, weight: 10 },
  { regex: /\b(morgens und abends|apply to skin|gesicht und hals|auftragen)\b/gi, weight: 10 },
  { regex: /\b(niacinamide|retinol|hyaluron|squalane|ceramide)\b/gi, weight: 10 },
];

const AQUA_FIRST_REG = /^\s*aqua\b/i;
const FORCE_HAIRCARE_INCI_RE =
  /\b(sodium chloride|chloride|sodium laureth sulfate|laureth|sulfates?|sulfat|ammonium)\b/i;

const OCR_CORRECTION_WHITELIST: Record<string, string> = {
  methylpropional: "methylpropanediol",
  methyipropanediol: "methylpropanediol",
  niacinarnide: "niacinamide",
  hyaluronlc: "hyaluronic",
  phenoxyethanoi: "phenoxyethanol",
  butyleneglycoi: "butylene glycol",
  caprylyiglycol: "caprylyl glycol",
  tocopherylacetate: "tocopheryl acetate",
  chlorphenesln: "chlorphenesin",
  sodiumhyaluronate: "sodium hyaluronate",
};

function countMatches(text: string, reg: RegExp): number {
  const flags = reg.flags.includes("g") ? reg.flags : `${reg.flags}g`;
  const safeReg = new RegExp(reg.source, flags);
  return Array.from(text.matchAll(safeReg)).length;
}

function countRegexHits(text: string, re: RegExp): number {
  const safeFlags = re.flags.includes("g")
    ? re.flags
    : `${re.flags}g`;
  const safeRe = new RegExp(re.source, safeFlags);
  const matches = text.match(safeRe);
  return matches ? matches.length : 0;
}

function normalizeForScoring(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEMANTIC_LEXICON = [
  "shampoo",
  "conditioner",
  "ingredients",
  "niacinamide",
  "panthenol",
  "sulfosuccinate",
  "sulfate",
  "isethionate",
  "glucoside",
  "betaine",
  "amphoacetate",
  "cocamidopropyl",
  "laureth",
  "hyaluronate",
  "hyaluronic",
  "phenoxyethanol",
  "tocopherol",
  "glycerin",
  "dimethicone",
  "ceramide",
  "retinol",
] as const;

const SEMANTIC_FIX_MIN_LEN = 5;
const SEMANTIC_FIX_MAX_RATIO = 0.2;

function foldOcrConfusions(input: string): string {
  return input
    .replace(/rn/g, "m")
    .replace(/l/g, "i");
}

function semanticLevenshteinWord(token: string): string {
  if (!token || token.length < SEMANTIC_FIX_MIN_LEN || /\d/.test(token)) return token;

  let bestWord = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  const foldedToken = foldOcrConfusions(token);

  for (const dictWord of SEMANTIC_LEXICON) {
    const rawDistance = distance(token, dictWord);
    const foldedDistance = distance(foldedToken, foldOcrConfusions(dictWord));
    const candidateDistance = Math.min(rawDistance, foldedDistance);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestWord = dictWord;
    }
  }

  if (!bestWord || !Number.isFinite(bestDistance)) return token;
  const baseLen = Math.max(token.length, bestWord.length);
  const ratio = bestDistance / baseLen;
  return ratio < SEMANTIC_FIX_MAX_RATIO ? bestWord : token;
}

function applySemanticLevenshtein(text: string): string {
  if (!text) return text;
  return text
    .split(" ")
    .map((token) => semanticLevenshteinWord(token))
    .join(" ");
}

function scoreByRules(text: string, rules: WeightedRule[]): number {
  return rules.reduce((sum, rule) => sum + countMatches(text, rule.regex) * rule.weight, 0);
}

function clampNonNegative(v: number): number {
  return Math.max(0, v);
}

function computeNameSignalDelta(titleWindow: string): number {
  const creamHit = CREAM_HINT_RE.test(titleWindow);
  const strongSerum = SERUM_STRONG_WORDS_RE.test(titleWindow);
  const kurOnly = KUR_ONLY_RE.test(titleWindow) && !strongSerum;
  if (creamHit && (strongSerum || kurOnly)) return 0;
  let d = 0;
  if (creamHit) d -= 30;
  if (strongSerum) d += 30;
  else if (kurOnly) d += 10;
  return d;
}

function hasWhitelistActives(text: string): boolean {
  return (
    ACTIVE_WHITELIST.some((active) =>
      new RegExp(`\\b${active}\\b`, "i").test(text)
    ) ||
    FORCE_THINKING_RE.test(text)
  );
}

function hasStrongSerumTitle(titleWindow: string): boolean {
  return (
    SERUM_STRONG_WORDS_RE.test(titleWindow) ||
    (KUR_ONLY_RE.test(titleWindow) && !CREAM_HINT_RE.test(titleWindow))
  );
}

function hasStrongCreamTitle(titleWindow: string): boolean {
  return CREAM_HINT_RE.test(titleWindow);
}

function classifyProduct(correctedText: string, rawOcrText: string): {
  kind: ClassifyKind;
  scores: { supplement: number; shampoo: number; skincare: number };
  margin: number;
  meta: SubtypeMeta;
} {
  const mainText = applySemanticLevenshtein(
    normalizeForScoring(correctedText).trim()
  );
  const rawText = applySemanticLevenshtein(
    normalizeForScoring(rawOcrText).trim()
  );
  const originalMerged = [correctedText, rawOcrText].filter(Boolean).join(" ");
  const scoringText = mainText || rawText;
  const headerText = scoringText.slice(0, 800);
  const fullText = [mainText, rawText].filter(Boolean).join(" ");
  let scores = { supplement: 0, shampoo: 0, skincare: 0 };

  // Base scoring: corrected text is primary; raw text contributes as weak evidence.
  const supplementMain =
    scoreByRules(scoringText, SUPPLEMENT_RULES) +
    countMatches(scoringText, UNIT_AFTER_NUMBER_REG) * 15;
  const supplementRaw =
    scoreByRules(rawText, SUPPLEMENT_RULES) +
    countMatches(rawText, UNIT_AFTER_NUMBER_REG) * 15;
  const shampooMain = scoreByRules(scoringText, SHAMPOO_RULES);
  const shampooRaw = scoreByRules(rawText, SHAMPOO_RULES);
  const skincareMainBase = scoreByRules(scoringText, SKINCARE_RULES);
  const skincareRawBase = scoreByRules(rawText, SKINCARE_RULES);
  const skincareMain = AQUA_FIRST_REG.test(scoringText)
    ? skincareMainBase + 10
    : skincareMainBase;
  const skincareRaw = AQUA_FIRST_REG.test(rawText)
    ? skincareRawBase + 10
    : skincareRawBase;

  scores = {
    supplement: supplementMain + Math.round(supplementRaw * 0.25),
    shampoo: shampooMain + Math.round(shampooRaw * 0.25),
    skincare: skincareMain + Math.round(skincareRaw * 0.25),
  };

  // INCI structure / base-marker correction for ingredient-only crops.
  const commaCount = (originalMerged.match(/,/g) ?? []).length;
  const inciChemicalHits = (
    scoringText.match(/\b(ate|ol|ide|acid|glycol|amide|amine|polymer|extract)\b/g) ?? []
  ).length;
  const isINCIStructure = commaCount >= 4 && inciChemicalHits >= 3;
  if (isINCIStructure || SKINCARE_BASE_MARKERS_RE.test(scoringText)) {
    scores.skincare += 25;
  }

  // Structured breakers.
  const isStrongSupplement = STRONG_SUPP_RE.test(scoringText);
  const isStrongSkincare = STRONG_SKIN_RE.test(headerText);
  const isOralInstruction = ORAL_INSTRUCTION_RE.test(scoringText);

  // Pivot with anti-pivot protection.
  const hasMl = /\bml\b/i.test(fullText);
  const hasMg = /\b(mg|mcg|µg|iu|ie)\b/i.test(fullText);
  const shouldProtectSupplement = isStrongSupplement || isOralInstruction;
  if (hasMl && hasMg && !shouldProtectSupplement) {
    scores.supplement = clampNonNegative(scores.supplement * 0.4);
    scores.skincare += 20;
  }

  // Identity confirmation with mutual exclusion.
  if (SKIN_ACTION_RE.test(scoringText)) {
    scores.skincare += 25;
    scores.supplement = clampNonNegative(scores.supplement - 15);
  }
  if (ORAL_INSTRUCTION_RE.test(scoringText)) {
    scores.supplement += 25;
    scores.skincare = clampNonNegative(scores.skincare - 10);
  }

  // Vitamin C special correction.
  if (VITAMIN_C_RE.test(scoringText)) {
    const isTopicalVC = TOPICAL_VC_RE.test(scoringText);
    if (isTopicalVC && !isStrongSupplement) {
      scores.skincare += 25;
      scores.supplement = clampNonNegative(scores.supplement - 15);
    }
  }

  // Final sanitization before ranking.
  scores = {
    supplement: clampNonNegative(scores.supplement),
    shampoo: clampNonNegative(scores.shampoo),
    skincare: clampNonNegative(scores.skincare),
  };

  const ranked = (Object.entries(scores) as Array<
    [keyof typeof scores, number]
  >).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0][0];
  const topScore = ranked[0][1];
  const margin = topScore - ranked[1][1];
  const minMargin = isStrongSkincare || isStrongSupplement ? 2 : 5;
  if (topScore < 10 || margin < minMargin) {
    return {
      kind: "unknown",
      scores,
      margin,
      meta: { ...DEFAULT_SUBTYPE_META },
    };
  }

  if (winner === "supplement") {
    return {
      kind: "supplement",
      scores,
      margin,
      meta: { ...DEFAULT_SUBTYPE_META },
    };
  }

  const forceHaircareSignal =
    FORCE_HAIRCARE_INCI_RE.test(scoringText) ||
    FORCE_HAIRCARE_INCI_RE.test(fullText);
  const shampooWithinTenPercentOfSkincare =
    scores.skincare > 0 && scores.shampoo >= scores.skincare * 0.9;
  if (
    shampooWithinTenPercentOfSkincare &&
    forceHaircareSignal
  ) {
    return {
      kind: "shampoo",
      scores,
      margin,
      meta: { ...DEFAULT_SUBTYPE_META },
    };
  }

  if (winner === "shampoo") {
    return {
      kind: "shampoo",
      scores,
      margin,
      meta: { ...DEFAULT_SUBTYPE_META },
    };
  }

  // Guardrail: strong oral/supplement cues should not enter skincare subtype.
  if (
    (isStrongSupplement || isOralInstruction) &&
    scores.supplement >= scores.skincare - 5
  ) {
    return {
      kind: "supplement",
      scores,
      margin,
      meta: { ...DEFAULT_SUBTYPE_META },
    };
  }

  // --- Skincare subtype: signal-driven scoring ---
  const textLower = scoringText.toLowerCase();
  const isStrongWashOff = countRegexHits(textLower, STRONG_RINSE_RE) > 0;
  const isSunscreen = countRegexHits(textLower, SUNSCREEN_RE) > 0;
  const subtypeLocked = isStrongWashOff || isSunscreen;

  if (subtypeLocked) {
    return {
      kind: "skincare_cream",
      scores,
      margin,
      meta: {
        subtypeScore: 0,
        subtypeConfidence: "low",
        subtypeLocked: true,
      },
    };
  }

  let subtypeScore = 0;
  const titleWindow = scoringText.slice(0, SUBTYPE_TITLE_WINDOW);

  subtypeScore += computeNameSignalDelta(titleWindow);

  const gellingHits = countRegexHits(textLower, GELLING_AGENTS_RE);
  subtypeScore += gellingHits * 10;

  const heavy = countRegexHits(textLower, HEAVY_OILS_RE) > 0;
  const fatty = countRegexHits(textLower, FATTY_ALCOHOLS_RE) > 0;
  const emul = countRegexHits(textLower, EMULSIFIER_SYSTEM_RE) > 0;
  const trioCount = (heavy ? 1 : 0) + (fatty ? 1 : 0) + (emul ? 1 : 0);
  if (trioCount === 3) subtypeScore -= 35;
  else if (trioCount === 2) subtypeScore -= 15;
  else if (trioCount === 1) subtypeScore -= 15;

  if (countRegexHits(textLower, WEAK_RINSE_RE) > 0) {
    subtypeScore *= 0.35;
  }

  const subtypeConfidence: SubtypeMeta["subtypeConfidence"] =
    Math.abs(subtypeScore) >= 18 ? "high" : "low";

  let finalKind: ClassifyKind = "skincare_cream";
  if (subtypeScore >= 18) finalKind = "skincare_serum";
  else if (subtypeScore <= -18) finalKind = "skincare_cream";

  return {
    kind: finalKind,
    scores,
    margin,
    meta: {
      subtypeScore,
      subtypeConfidence,
      subtypeLocked: false,
    },
  };
}

function classifyKindToHints(
  kind: ClassifyKind,
  text: string,
  meta: SubtypeMeta
): {
  categoryHint?: CategoryHint;
  thinkingHint?: ThinkingHint;
} {
  if (kind === "supplement") {
    return {
      categoryHint: "supplement",
      thinkingHint: "supplement",
    };
  }
  if (kind === "shampoo") {
    return {
      categoryHint: "haircare",
    };
  }
  if (kind === "skincare_serum") {
    if (meta.subtypeLocked || meta.subtypeConfidence === "low") {
      return { categoryHint: "skincare" };
    }
    const normalized = normalizeForScoring(text);
    const titleWindow = normalized.slice(0, SUBTYPE_TITLE_WINDOW);
    const hasActives = hasWhitelistActives(normalized);
    const strongName = hasStrongSerumTitle(titleWindow);
    if (!hasActives && !strongName) {
      return { categoryHint: "skincare" };
    }
    return {
      categoryHint: "skincare",
      thinkingHint: "essence",
    };
  }
  if (kind === "skincare_cream") {
    if (meta.subtypeLocked || meta.subtypeConfidence === "low") {
      return { categoryHint: "skincare" };
    }
    const normalized = normalizeForScoring(text);
    const titleWindow = normalized.slice(0, SUBTYPE_TITLE_WINDOW);
    const hasActives = hasWhitelistActives(normalized);
    const strongName = hasStrongCreamTitle(titleWindow);
    if (!hasActives && !strongName) {
      return { categoryHint: "skincare" };
    }
    return {
      categoryHint: "skincare",
      thinkingHint: "cream",
    };
  }
  return {};
}

function normalizeRotationDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const snapped = Math.round(degrees / 90) * 90;
  const normalized = ((snapped % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function extractOrientationDegrees(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const data = (raw as { data?: unknown }).data;
  if (!data || typeof data !== "object") return 0;
  const d = data as {
    orientation_degrees?: number | string | null;
    orientation?: number | string | null;
    osd?: {
      orientation_degrees?: number | string | null;
      orientation?: number | string | null;
    };
  };
  const candidate =
    d.orientation_degrees ?? d.orientation ?? d.osd?.orientation_degrees ?? d.osd?.orientation;
  const numeric =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string"
        ? Number(candidate)
        : NaN;
  return normalizeRotationDegrees(numeric);
}

function buildDataUrlFromBase64(base64: string): string {
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
  return `data:image/jpeg;base64,${cleanBase64}`;
}

async function loadWebImage(source: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = source;
  });
  return img;
}

function applyGrayscaleNormalizeAndSharpen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pxCount = width * height;
  const gray = new Uint8ClampedArray(pxCount);
  let min = 255;
  let max = 0;

  for (let i = 0; i < pxCount; i++) {
    const offset = i * 4;
    const y = Math.round(
      data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
    );
    gray[i] = y;
    if (y < min) min = y;
    if (y > max) max = y;
  }

  const norm = new Uint8ClampedArray(pxCount);
  const range = Math.max(1, max - min);
  for (let i = 0; i < pxCount; i++) {
    norm[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - min) * 255) / range)));
  }

  const sharp = new Uint8ClampedArray(pxCount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const center = norm[idx];
      const left = x > 0 ? norm[idx - 1] : center;
      const right = x + 1 < width ? norm[idx + 1] : center;
      const up = y > 0 ? norm[idx - width] : center;
      const down = y + 1 < height ? norm[idx + width] : center;
      const sharpened = center * 5 - left - right - up - down;
      sharp[idx] = Math.max(0, Math.min(255, Math.round(sharpened)));
    }
  }

  for (let i = 0; i < pxCount; i++) {
    const value = sharp[i];
    const offset = i * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

async function preprocessWebDataUrl(input: string, options: { rotateDegrees?: number; upscale?: boolean }): Promise<string> {
  if (typeof document === "undefined") return input;
  const img = await loadWebImage(input);
  const rotateDegrees = normalizeRotationDegrees(options.rotateDegrees ?? 0);
  const scale = options.upscale ? 1.8 : 1;
  const sourceWidth = Math.max(1, Math.round(img.width * scale));
  const sourceHeight = Math.max(1, Math.round(img.height * scale));
  const rotate90 = rotateDegrees === 90 || rotateDegrees === 270;
  const canvas = document.createElement("canvas");
  canvas.width = rotate90 ? sourceHeight : sourceWidth;
  canvas.height = rotate90 ? sourceWidth : sourceHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return input;

  if (rotateDegrees !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotateDegrees * Math.PI) / 180);
    ctx.drawImage(img, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.drawImage(img, 0, 0, sourceWidth, sourceHeight);
  }

  applyGrayscaleNormalizeAndSharpen(ctx, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 1);
}

async function extractTextWeb(base64: string, options: WebExtractOptions = {}): Promise<string> {
  const worker = await getWebTesseractWorker();
  const dataUrl = buildDataUrlFromBase64(base64);
  const recognizeJob = async (): Promise<string> => {
    let osdRotate = 0;
    if (typeof worker.detect === "function") {
      try {
        const detectResult = await worker.detect(dataUrl);
        osdRotate = extractOrientationDegrees(detectResult);
      } catch {
        osdRotate = 0;
      }
    }

    const forcedRotate = options.forceRotate180 ? 180 : 0;
    const totalRotate = normalizeRotationDegrees(osdRotate + forcedRotate);
    const preprocessedDataUrl = await preprocessWebDataUrl(dataUrl, {
      rotateDegrees: totalRotate,
      upscale: options.upscale,
    });

    const recognizeWithPsm = async (psm: 6 | 11): Promise<string> => {
      if (typeof worker.setParameters === "function") {
        await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      }
      const {
        data: { text },
      } = await worker.recognize(preprocessedDataUrl);
      return text || "";
    };

    const primary = await recognizeWithPsm(6);
    const primaryLen = normalizeOcrNoise(primary).replace(/\s+/g, "").length;
    if (primaryLen >= 32) return primary;

    const fallback = await recognizeWithPsm(11);
    return fallback.trim().length > primary.trim().length ? fallback : primary;
  };
  const queued = webRecognizeQueue.then(recognizeJob, recognizeJob);
  webRecognizeQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

async function extractTextNative(uri: string): Promise<string> {
  const { extractTextFromImage } = await import("expo-text-extractor");
  const blocks = await extractTextFromImage(uri);
  return Array.isArray(blocks) ? blocks.join(" ") : "";
}

function imageGetSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

async function preprocessNativeUri(
  uri: string,
  options: { upscale?: boolean; forceRotate180?: boolean }
): Promise<string | undefined> {
  try {
    const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
    const actions: Array<
      | { resize: { width: number; height: number } }
      | { rotate: number }
    > = [];
    if (options.upscale) {
      const { width, height } = await imageGetSize(uri);
      const scale = 1.8;
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      actions.push({ resize: { width: targetWidth, height: targetHeight } });
    }
    if (options.forceRotate180) {
      actions.push({ rotate: 180 });
    }
    if (actions.length === 0) return uri;
    const result = await manipulateAsync(
      uri,
      actions as any,
      { compress: 1, format: SaveFormat.JPEG, base64: false }
    );
    return result.uri;
  } catch {
    return undefined;
  }
}

async function extractRawText(options: {
  uri?: string;
  base64?: string;
  upscale?: boolean;
  forceRotate180?: boolean;
}): Promise<string> {
  if (Platform.OS === "web" && options.base64) {
    return extractTextWeb(options.base64, {
      upscale: options.upscale,
      forceRotate180: options.forceRotate180,
    });
  }
  if (options.uri) {
    if (options.upscale || options.forceRotate180) {
      const processedUri = await preprocessNativeUri(options.uri, {
        upscale: options.upscale,
        forceRotate180: options.forceRotate180,
      });
      if (processedUri) return extractTextNative(processedUri);
    }
    return extractTextNative(options.uri);
  }
  return "";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);
    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export async function extractRawTextFast(
  options: { uri?: string; base64?: string },
  timeoutMs = 100
): Promise<string> {
  let safeTimeout = Number.isFinite(timeoutMs) ? Math.max(50, timeoutMs) : 100;
  if (Platform.OS === "web") {
    safeTimeout = Math.max(safeTimeout, 1200);
  }
  const raw = await withTimeout(extractRawText(options), safeTimeout, "");
  return String(raw ?? "").trim();
}

let webTesseractWorkerPromise: Promise<WebTesseractWorker> | null = null;
let webRecognizeQueue: Promise<string | void> = Promise.resolve();

async function getWebTesseractWorker(): Promise<WebTesseractWorker> {
  if (!webTesseractWorkerPromise) {
    webTesseractWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("deu+eng", 1, { logger: () => {} });
    })();
  }
  const workerPromise = webTesseractWorkerPromise;
  if (!workerPromise) {
    throw new Error("web tesseract worker init failed");
  }
  try {
    return await workerPromise;
  } catch (error) {
    webTesseractWorkerPromise = null;
    throw error;
  }
}

export async function extractRawTextLate(
  options: { uri?: string; base64?: string },
  timeoutMs = 4000
): Promise<string> {
  const safeTimeout = Number.isFinite(timeoutMs) ? Math.max(300, timeoutMs) : 4000;
  const raw = await withTimeout(extractRawText(options), safeTimeout, "");
  return String(raw ?? "").trim();
}

function normalizeKeywordPiece(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isActiveWhitelistToken(input: string): boolean {
  const text = input.toLowerCase().trim();
  if (text.length < 3) return false;
  return FORCE_THINKING_RE.test(text);
}

export function tokenizeOcrStream(rawText: string, maxTokens = 300): OcrStreamToken[] {
  const raw = String(rawText ?? "").trim();
  if (!raw) return [];

  const collapsed = raw.replace(/\s+/g, " ").trim();
  // 禁止引入字符级 split("") 逻辑，确保单词完整性以供 isActiveWhitelistToken 判定
  const words = collapsed
    .split(/[\s,;:|/\\]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  return words.slice(0, maxTokens).map((text, index) => ({
    id: `${index}-${text}`,
    text,
  }));
}

const FALLBACK_STREAM_TOKENS = [
  "AQUA",
  "GLYCERIN",
  "NIACINAMIDE",
  "VITAMIN C",
  "PANTHENOL",
  "SODIUM",
  "HYALURONATE",
  "CERAMIDE",
  "EXTRACT",
  "PEPTIDE",
];

export function buildFallbackStreamTokens(): OcrStreamToken[] {
  return FALLBACK_STREAM_TOKENS.map((text, index) => ({
    id: `fallback-${index}-${text}`,
    text,
  }));
}

export function mergeOcrStreamTokens(input: {
  primary: OcrStreamToken[];
  secondary?: OcrStreamToken[];
  limit?: number;
}): OcrStreamToken[] {
  const limit = Math.max(1, input.limit ?? 300);
  const merged = [...input.primary, ...(input.secondary ?? [])];
  const out: OcrStreamToken[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < merged.length; i++) {
    const token = merged[i];
    const key = normalizeKeywordPiece(token.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${i}-${key}`,
      text: token.text,
    });
    if (out.length >= limit) break;
  }
  return out;
}

const DEFAULT_KEYWORDS = [
  "AQUA",
  "WATER",
  "GLYCERIN",
  "VITAMIN C",
  "NIACINAMIDE",
  "HYALURONIC ACID",
  "SODIUM HYALURONATE",
  "RETINOL",
  "CERAMIDE",
];

export function extractHighlightKeywords(input: {
  correctedText?: string;
  rawText?: string;
  limit?: number;
}): string[] {
  const limit = Math.max(6, input.limit ?? 16);
  const merged = [input.correctedText, input.rawText].filter(Boolean).join(", ");
  const tokens = merged
    .split(/[,;\n]/)
    .map((part) => normalizeKeywordPiece(part))
    .filter((item) => item.length >= 4);
  const rank = [...DEFAULT_KEYWORDS, ...tokens];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of rank) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeOcrNoise(input: string): string {
  let text = input
    .replace(/\r/g, "\n")
    .replace(/-\s*\n/g, "")
    .replace(/[|]/g, " ")
    .replace(/[·•]/g, ",")
    .replace(/[;；]/g, ",")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // Common OCR confusions around words.
  text = text
    .replace(/\bINGREDlENTS\b/gi, "INGREDIENTS")
    .replace(/\blNCI\b/g, "INCI")
    .replace(/\bAQUA0\b/gi, "AQUA")
    .replace(/\bPHENOXYETHAN0L\b/gi, "PHENOXYETHANOL")
    .replace(/\bS0DIUM\b/gi, "SODIUM")
    .replace(/\bP0TASSIUM\b/gi, "POTASSIUM")
    .replace(/\bRETIN0L\b/gi, "RETINOL")
    .replace(/\bC0LLAGEN\b/gi, "COLLAGEN")
    .replace(/\brn\b/g, "m");

  return text;
}

function looksLikeNoiseLine(line: string): boolean {
  const n = line.toLowerCase().trim();
  if (!n) return true;
  return /usage|directions|warning|caution|keep out|avoid contact|for external use|net wt|www\.|http|barcode|batch|lot|expiry|exp|mfg|manufactured|distributed/u.test(
    n
  );
}

function normalizeToken(token: string): string {
  const t = token
    .trim()
    .replace(/^[^a-zA-Z0-9\u00C0-\u024F]+|[^a-zA-Z0-9\u00C0-\u024F]+$/g, "")
    .replace(/\s+/g, " ");
  if (!t) return "";
  const lower = t.toLowerCase().replace(/\s+/g, "");
  const corrected = OCR_CORRECTION_WHITELIST[lower] ?? t;
  const canonical = canonicalizeIngredientKey(corrected);
  return canonical || corrected.toLowerCase();
}

function toTitleCaseIngredient(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      if (/^[a-z]{1,3}$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function buildCorrectedIngredientText(raw: string): {
  correctedText: string;
  confidenceHint: OcrConfidenceHint;
  tokenCount: number;
} {
  const normalized = normalizeOcrNoise(raw);
  const lines = normalized.split("\n").filter((line) => !looksLikeNoiseLine(line));
  const merged = lines.join(" ");
  const source = merged.length > 0 ? merged : normalized;

  const tokens = source
    .split(/,|\n/)
    .flatMap((part) => part.split(/\s{2,}/))
    .map(normalizeToken)
    .filter((v) => v.length >= 3)
    .filter((v) => !/^\d+$/.test(v));

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    uniq.push(toTitleCaseIngredient(token));
    if (uniq.length >= 80) break;
  }

  const correctedText = uniq.join(", ");
  const confidenceHint: OcrConfidenceHint =
    uniq.length >= 10 ? "high" : uniq.length >= 4 ? "medium" : "low";
  return { correctedText, confidenceHint, tokenCount: uniq.length };
}

function isOcrTextTooShort(pass: { correctedText: string; tokenCount: number }): boolean {
  const strippedLen = pass.correctedText.replace(/[^A-Za-z0-9]/g, "").length;
  return pass.tokenCount < OCR_SHORT_TEXT_MIN_TOKENS || strippedLen < OCR_SHORT_TEXT_MIN_CHARS;
}

function computeCandidateRuleScore(candidate: OcrCandidate): number {
  const scoringText = applySemanticLevenshtein(
    normalizeForScoring(
      [candidate.correctedText, candidate.rawOcrText].filter(Boolean).join(" ")
    )
  );
  return (
    scoreByRules(scoringText, SHAMPOO_RULES) +
    scoreByRules(scoringText, SKINCARE_RULES) +
    scoreByRules(scoringText, SUPPLEMENT_RULES)
  );
}

function selectBetterOcrCandidate(a: OcrCandidate, b: OcrCandidate): OcrCandidate {
  if (a.tokenCount !== b.tokenCount) {
    return a.tokenCount > b.tokenCount ? a : b;
  }
  const scoreA = computeCandidateRuleScore(a);
  const scoreB = computeCandidateRuleScore(b);
  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
  return a.correctedText.length >= b.correctedText.length ? a : b;
}

export async function extractCorrectedIngredientText(options: {
  uri?: string;
  base64?: string;
}): Promise<{
  rawOcrText: string;
  correctedText: string;
  confidenceHint: OcrConfidenceHint;
}> {
  const candidates: OcrCandidate[] = [];
  const rawOcrText = await extractRawText(options);
  const firstPass = buildCorrectedIngredientText(rawOcrText);
  candidates.push({
    rawOcrText,
    correctedText: firstPass.correctedText,
    confidenceHint: firstPass.confidenceHint,
    tokenCount: firstPass.tokenCount,
  });

  if (!ENABLE_OCR_RETRY) {
    const c = candidates[0];
    return {
      rawOcrText: c.rawOcrText,
      correctedText: c.correctedText,
      confidenceHint: c.confidenceHint,
    };
  }

  const canRetry = !!options.base64 || !!options.uri;
  if (canRetry && firstPass.confidenceHint === "low") {
    const retryRawText = await extractRawText({
      uri: options.uri,
      base64: options.base64,
      upscale: true,
    });
    const retryPass = buildCorrectedIngredientText(retryRawText);
    candidates.push({
      rawOcrText: retryRawText,
      correctedText: retryPass.correctedText,
      confidenceHint: retryPass.confidenceHint,
      tokenCount: retryPass.tokenCount,
    });
  }

  let best = candidates.reduce((prev, curr) => selectBetterOcrCandidate(prev, curr));
  if (canRetry && isOcrTextTooShort(best)) {
    const rotate180RawText = await extractRawText({
      uri: options.uri,
      base64: options.base64,
      forceRotate180: true,
      upscale: true,
    });
    const rotate180Pass = buildCorrectedIngredientText(rotate180RawText);
    const rotate180Candidate: OcrCandidate = {
      rawOcrText: rotate180RawText,
      correctedText: rotate180Pass.correctedText,
      confidenceHint: rotate180Pass.confidenceHint,
      tokenCount: rotate180Pass.tokenCount,
    };
    best = selectBetterOcrCandidate(best, rotate180Candidate);
  }

  return {
    rawOcrText: best.rawOcrText,
    correctedText: best.correctedText,
    confidenceHint: best.confidenceHint,
  };
}

export async function guessThinkingHint(options: {
  uri?: string;
  base64?: string;
}): Promise<{
  thinkingHint?: ThinkingHint;
  categoryHint?: CategoryHint;
  ocrText?: string;
}> {
  const detected = await detectOcrAndHints(options);
  return {
    thinkingHint: detected.thinkingHint,
    categoryHint: detected.categoryHint,
    ocrText: detected.ocrText,
  };
}

export async function detectOcrAndHints(options: {
  uri?: string;
  base64?: string;
}): Promise<OcrDetectionResult> {
  let detected: {
    rawOcrText: string;
    correctedText: string;
    confidenceHint: OcrConfidenceHint;
  };
  try {
    detected = await extractCorrectedIngredientText(options);
  } catch (e) {
    if (__DEV__) {
      console.log("[ocrDetect] OCR failed:", e);
    }
    return {
      rawOcrText: "",
      correctedText: "",
      confidenceHint: "low",
      detectedKind: "unknown",
      suggestedCategoryHint: undefined,
      needsCategoryConfirm: false,
      ocrText: "",
    };
  }
  const corrected = detected.correctedText.trim();
  const raw = detected.rawOcrText.trim();
  const mergedText = [corrected, raw].filter(Boolean).join("\n");
  const classified = classifyProduct(corrected, raw);
  const softHints = classifyKindToHints(
    classified.kind,
    corrected || raw,
    classified.meta
  );
  const trusted = isLocalCategoryTrustedForApi(
    classified,
    detected.confidenceHint
  );
  let categoryHint = trusted ? softHints.categoryHint : undefined;
  let thinkingHint = trusted ? softHints.thinkingHint : undefined;

  const compressedRaw = raw.toLowerCase().replace(/[\s,.;:|/\\]/g, "");
  const hasSensitiveActives =
    FORCE_THINKING_RE.test(compressedRaw) ||
    FORCE_THINKING_RE.test(corrected.toLowerCase());

  if (hasSensitiveActives && trusted) {
    if (__DEV__) {
      console.log(
        "[ocrDetect] Ingredient-list root match: forcing Thinking Flow on"
      );
    }
    thinkingHint = "essence";
  }
  const suggestedCategoryHint = softHints.categoryHint;
  const needsCategoryConfirm = false;

  if (__DEV__) {
    console.log(
      "[ocrDetect] platform:",
      Platform.OS,
      "| hasBase64:",
      !!options.base64,
      "| hasUri:",
      !!options.uri
    );
    console.log("[ocrDetect] raw preview:", raw.slice(0, 200));
    console.log("[ocrDetect] corrected preview:", corrected.slice(0, 200));
    console.log(
      "[ocrDetect] match:",
      JSON.stringify(
        {
          confidenceHint: detected.confidenceHint,
          localCategoryTrusted: trusted,
          hasSensitiveActives,
          thinkingHint: thinkingHint ?? "none",
          categoryHint: categoryHint ?? "none",
          classifyKind: classified.kind,
          scores: classified.scores,
          margin: classified.margin,
          subtypeMeta: classified.meta,
        },
        null,
        2
      )
    );
  }

  return {
    rawOcrText: detected.rawOcrText,
    correctedText: detected.correctedText,
    confidenceHint: detected.confidenceHint,
    categoryHint,
    thinkingHint,
    detectedKind: classified.kind,
    suggestedCategoryHint,
    needsCategoryConfirm,
    ocrText: mergedText,
  };
}

export function resolveHintDecision(options: {
  confidenceHint: OcrConfidenceHint;
  categoryHint?: CategoryHint;
  thinkingHint?: ThinkingHint;
}): ResolvedHintDecision | null {
  const { confidenceHint: _confidenceHint, categoryHint, thinkingHint } = options;
  if (!categoryHint) return null;

  if (categoryHint === "haircare") {
    return { categoryHint: "haircare" };
  }

  if (categoryHint === "supplement") {
    return {
      categoryHint: "supplement",
      thinkingHint: "supplement",
    };
  }

  if (thinkingHint === "essence" || thinkingHint === "cream") {
    return { categoryHint: "skincare", thinkingHint };
  }

  return { categoryHint: "skincare" };
}
