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

// 补剂成分：去除易与护肤重叠的词（如 ascorbic/ascorbate）以降低误判。
const SUPPLEMENT_INGREDIENTS_REG =
  /magnesium|trimagnesium|magnesiumcitrat|magnesiumsalze|magnesiumcarbonat|magnesiumaspartat|zink|zinc|eisen|iron|kalzium|kalcium|calcium|vitamin\s*[abcdekm]\s*\d*|vitamin\s*b6|vitamin\s*b12|vitamin\s*d|vitamin\s*c|pyridoxin|thiamin|riboflavin|cyanocobalamin|methylcobalamin|biotin|folsäure|folsaeure|folat|folate|coenzym|coenzyme|ubiquinon|melatonin|probiotik|probiotic|kollagen|collagen|carnitin|carnitine|selen|selenium|omega\s*[-]?\s*3|cholecalciferol|ergocalciferol|jod|iodine|chrom|chromium|mangan|manganese|kupfer|copper|lutein|inositol|taurin|taurine/gi;

// 补剂标签上下文：与配料词组合后才认为是高置信补剂。
const SUPPLEMENT_CONTEXT_REG =
  /nahrungsergänzungsmittel|nahrungsergaenzungsmittel|dietary\s*supplement|supplement\s*facts|einnahme|verzehrempfehlung|kapseln?|tabletten?|kapsel|tablet|softgel|servings?|dosage|daily\s*dose|portion|per\s*serving|tägliche|taegliche|tagesdosis/i;

// 活性护肤成分：英文 + 德语
const ACTIVE_SKINCARE_REG =
  /retinol|retinal|retinyl|adapalene|tretinoin|ascorbic|ascorbinsäure|ascorbinsaeure|glycolic|glycolsäure|glycolsaeure|glykolsäure|glykolsaeure|lactic|milchsäure|milchsaure|salicylic|salicylsäure|salicylsaeure|niacinamide|niacinamid|peptide|peptid|aha|bha|mandelic|ferulic|kojic|hyaluron|hyaluronsäure|hyaluronsaeure|ceramid|ceramide|panthenol|benzoyl/i;

// 面霜
const CREAM_REG =
  /cream|面霜|moisturizer|moisturiser|pflegecreme|tagescreme|nachtcreme|日霜|晚霜/i;

// 精华类产品名关键词（不依赖活性词）
const ESSENCE_REG =
  /serum|essence|ampoule|elixir|essenz|精华|精华液|原液|安瓶/i;

// 特殊成分：标签文字或高浓度活性
const SPECIAL_REG =
  /特殊成分|special\s*ingredient|tretinoin|tretinoïde|adapalene|高浓度|high\s*strength|prescription/i;

// 发用产品关键词：用于强制把 `categoryHint` 设为 haircare
const HAIRCARE_PRODUCT_REG =
  /洗发水|shampoo|护发素|conditioner|发膜|hair\s*mask|去屑|anti[-\s]?dandruff|head\s*and\s*shoulders/i;

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

function matchCategoryHint(text: string): CategoryHint {
  if (HAIRCARE_PRODUCT_REG.test(text)) return "haircare";

  const supplementContextHits = countMatches(text, SUPPLEMENT_CONTEXT_REG);
  const supplementIngredientHits = countMatches(text, SUPPLEMENT_INGREDIENTS_REG);
  const skincareActiveHits = countMatches(text, ACTIVE_SKINCARE_REG);

  // 补剂优先规则：
  // 1) 只要出现补剂上下文 + 至少1个补剂成分，即判为补剂；
  // 2) 在无护肤活性冲突时，补剂强词>=3也判为补剂。
  const confidentSupplement =
    (supplementContextHits >= 1 && supplementIngredientHits >= 1) ||
    (supplementContextHits >= 2 && supplementIngredientHits >= 0 && skincareActiveHits === 0) ||
    (supplementIngredientHits >= 3 && skincareActiveHits === 0);

  if (confidentSupplement) return "supplement";
  // 业务默认：证据不足或冲突时按护肤处理。
  return "skincare";
}

function matchThinkingHint(text: string, categoryHint: CategoryHint): ThinkingHint | undefined {
  if (categoryHint === "supplement") return "supplement";
  if (categoryHint !== "skincare") return undefined;
  if (SPECIAL_REG.test(text)) return "special";
  if (ESSENCE_REG.test(text)) return "essence";
  if (ACTIVE_SKINCARE_REG.test(text)) return "essence";
  if (CREAM_REG.test(text)) return "cream";
  return undefined;
}

async function extractTextWeb(base64: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
  const dataUrl = `data:image/jpeg;base64,${cleanBase64}`;
  const worker = await createWorker("eng+chi_sim+deu", 1, { logger: () => {} });
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
  return /usage|directions|warning|caution|keep out|avoid contact|for external use|net wt|www\.|http|barcode|batch|lot|expiry|exp|mfg|manufactured|distributed|客服|注意事项|警告|使用方法|净含量/u.test(
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
  let text = "";
  try {
    text = await extractRawText(options);
  } catch (e) {
    if (__DEV__) {
      console.log("[ocrDetect] OCR failed:", e);
    }
    return {};
  }
  const categoryHint = matchCategoryHint(text);
  const thinkingHint = matchThinkingHint(text, categoryHint);

  if (__DEV__) {
    console.log("[ocrDetect] platform:", Platform.OS, "| hasBase64:", !!options.base64, "| hasUri:", !!options.uri);
    console.log("[ocrDetect] text preview:", text.slice(0, 200));
    console.log(
      "[ocrDetect] match:",
      JSON.stringify(
        {
          thinkingHint: thinkingHint ?? "none",
          categoryHint: categoryHint ?? "none",
        },
        null,
        2
      )
    );
  }

  return { thinkingHint, categoryHint, ocrText: text };
}
