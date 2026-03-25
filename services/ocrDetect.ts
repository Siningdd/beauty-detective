/**
 * 本地 OCR 预判产品类型（基于成分，补剂/活性护肤），用于自动开启 thinking
 * 匹配 INCI 成分名，支持英文与德语
 * Web: tesseract.js | Native: expo-text-extractor
 */

import { Image, Platform } from "react-native";
import { canonicalizeIngredientKey } from "../constants/ingredientDict";

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

type WeightedRule = {
  regex: RegExp;
  weight: number;
};

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
/** Title / marketing hints (normalized text; ä→ae already). */
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

const SUBTYPE_TITLE_WINDOW = 220;

const SUPPLEMENT_RULES: WeightedRule[] = [
  { regex: /\b(nahrungsergaenzungsmittel|supplement facts|dietary supplement|verzehrempfehlung)\b/gi, weight: 20 },
  { regex: /\b(kapseln?|tabletten?|capsules?|tablets?|softgels?|gummies?)\b/gi, weight: 10 },
  { regex: /\b(einnehmen|schlucken|take with water|daily dose|tagesdosis|tagesportion)\b/gi, weight: 15 },
  { regex: /\b(magnesium|zink|zinc|omega[\s-]?3|fischoel|folsaeure|biotin)\b/gi, weight: 10 },
];

const SHAMPOO_RULES: WeightedRule[] = [
  { regex: /\b(shampoo|conditioner|spuelung|spülung|haarkur|antischuppen)\b/gi, weight: 20 },
  { regex: /\b(ausspuelen|ausspülen|rinse off|ins nasse haar|apply to wet hair|lather)\b/gi, weight: 15 },
  { regex: /\b(sodium laureth sulfate|sulfates?|sulfat|betaine|keratin|kopfhaut|scalp)\b/gi, weight: 15 },
];

const SKINCARE_RULES: WeightedRule[] = [
  { regex: /\b(gesichtscreme|moisturizer|moisturiser|facial|serum|konzentrat|ampulle)\b/gi, weight: 10 },
  { regex: /\b(morgens und abends|apply to skin|gesicht und hals|auftragen)\b/gi, weight: 10 },
  { regex: /\b(niacinamide|retinol|hyaluron|squalane|ceramide)\b/gi, weight: 10 },
];

const AQUA_FIRST_REG = /^\s*aqua\b/i;

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
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
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
  const mainText = normalizeForScoring(correctedText).trim();
  const rawText = normalizeForScoring(rawOcrText).trim();
  const scoringText = mainText || rawText;
  const headerText = scoringText.slice(0, 300);
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
  const commaCount = (scoringText.match(/,/g) ?? []).length;
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

async function extractTextWeb(base64: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:image/jpeg;base64,${cleanBase64}`;
  const worker = await createWorker("eng+deu", 1, { logger: () => {} });
  try {
    const {
      data: { text },
    } = await worker.recognize(dataUrl);
    return text || "";
  } finally {
    await worker.terminate();
  }
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

async function upsampleWebBase64(base64: string): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined;
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
  const source = `data:image/jpeg;base64,${cleanBase64}`;
  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = source;
  });
  const scale = 1.8;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 1);
}

async function upsampleNativeUri(uri: string): Promise<string | undefined> {
  try {
    const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
    const { width, height } = await imageGetSize(uri);
    const scale = 1.8;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: targetWidth, height: targetHeight } }],
      { compress: 1, format: SaveFormat.JPEG }
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
}): Promise<string> {
  if (Platform.OS === "web" && options.base64) {
    if (options.upscale) {
      const upscaled = await upsampleWebBase64(options.base64);
      if (upscaled) return extractTextWeb(upscaled);
    }
    return extractTextWeb(options.base64);
  }
  if (options.uri) {
    if (options.upscale) {
      const upscaledUri = await upsampleNativeUri(options.uri);
      if (upscaledUri) return extractTextNative(upscaledUri);
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
  const safeTimeout = Number.isFinite(timeoutMs) ? Math.max(50, timeoutMs) : 100;
  const raw = await withTimeout(extractRawText(options), safeTimeout, "");
  return String(raw ?? "").trim();
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

export function tokenizeOcrStream(rawText: string, maxTokens = 120): OcrStreamToken[] {
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
  const limit = Math.max(1, input.limit ?? 120);
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
    if (uniq.length >= 40) break;
  }

  const correctedText = uniq.join(", ");
  const confidenceHint: OcrConfidenceHint =
    uniq.length >= 10 ? "high" : uniq.length >= 4 ? "medium" : "low";
  return { correctedText, confidenceHint, tokenCount: uniq.length };
}

export async function extractCorrectedIngredientText(options: {
  uri?: string;
  base64?: string;
}): Promise<{
  rawOcrText: string;
  correctedText: string;
  confidenceHint: OcrConfidenceHint;
}> {
  const rawOcrText = await extractRawText(options);
  const firstPass = buildCorrectedIngredientText(rawOcrText);

  const shouldRetryUpscale =
    firstPass.confidenceHint === "low" && (!!options.base64 || !!options.uri);
  if (!shouldRetryUpscale) {
    return {
      rawOcrText,
      correctedText: firstPass.correctedText,
      confidenceHint: firstPass.confidenceHint,
    };
  }

  const retryRawText = await extractRawText({
    uri: options.uri,
    base64: options.base64,
    upscale: true,
  });
  const retryPass = buildCorrectedIngredientText(retryRawText);
  const useRetry = retryPass.tokenCount > firstPass.tokenCount;
  const winner = useRetry ? retryPass : firstPass;
  return {
    rawOcrText: useRetry ? retryRawText : rawOcrText,
    correctedText: winner.correctedText,
    confidenceHint: winner.confidenceHint,
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
      ocrText: "",
    };
  }
  const corrected = detected.correctedText.trim();
  const raw = detected.rawOcrText.trim();
  const mergedText = [corrected, raw].filter(Boolean).join("\n");
  const classified = classifyProduct(corrected, raw);
  let hints = classifyKindToHints(
    classified.kind,
    corrected || raw,
    classified.meta
  );

  const compressedRaw = raw.toLowerCase().replace(/[\s,.;:|/\\]/g, "");
  const hasSensitiveActives =
    FORCE_THINKING_RE.test(compressedRaw) ||
    FORCE_THINKING_RE.test(corrected.toLowerCase());

  if (hasSensitiveActives) {
    if (__DEV__) {
      console.log("[ocrDetect] 成分表词根命中: 强行开启 Thinking Flow");
    }
    if (!hints.categoryHint || (hints.categoryHint as string) === "unknown") {
      hints.categoryHint = "skincare";
    }
    hints.thinkingHint = "essence";
  }

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
          hasSensitiveActives,
          thinkingHint: hints.thinkingHint ?? "none",
          categoryHint: hints.categoryHint ?? "none",
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
    categoryHint: hints.categoryHint,
    thinkingHint: hints.thinkingHint,
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
