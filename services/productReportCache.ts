import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AnalysisResult, ExtractIngredient } from "../types/analysis";
import { canonicalizeIngredientKey } from "../constants/ingredientDict";

type CategoryHint = "skincare" | "supplement" | "haircare" | undefined;

const CACHE_PREFIX = "product_report_cache:v1:";
const DEFAULT_MIN_TOKENS = 3;

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (!it) continue;
    const key = it;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Simple stable 64-bit FNV-1a hash for cache keys.
function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function canonicalKeysFromTokens(tokens: string[]): string[] {
  const canonical = tokens
    .map((t) => canonicalizeIngredientKey(t))
    .filter(Boolean) as string[];
  return dedupePreserveOrder(canonical);
}

function ingredientsKeysToHash(canonicalKeys: string[]): string {
  // Preserve order by joining on a delimiter.
  return fnv1a64Hex(canonicalKeys.join("|"));
}

function extractIngredientBlockFromOcrText(text: string): string | null {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
  if (!normalized) return null;

  const keywordRe =
    /(ingredients|inci|zutaten|composition|composizione|composicion|ingredientes)\b/i;
  const m = keywordRe.exec(normalized);
  if (!m || typeof m.index !== "number") return null;

  const after = normalized.slice(m.index + m[0].length);
  if (!after.trim()) return null;

  // Try to cut off at the next "directions/warnings" section.
  const stopRe =
    /\b(warnings?|warning|directions?|how to use|usage|application|apply|manufacturer|net\s*wt|net\s*contents|caution)\b/i;
  const stopIdx = after.search(stopRe);
  const block = stopIdx >= 0 ? after.slice(0, stopIdx) : after;
  return block.trim().slice(0, 6000);
}

function tokenizeIngredientsFromBlock(block: string): string[] {
  const rawParts = block.split(/[,;\n]+/g);
  const tokens: string[] = [];
  for (const part of rawParts) {
    let p = part
      .replace(/\([^)]*\)/g, " ")
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/[^A-Za-z0-9]+$/, "")
      .trim();
    if (!p) continue;

    // Handle synonyms like "Aqua/Water/Eau" (canonicalize will dedupe).
    const sub = p.split(/\s*\/\s*/g).map((s) => s.trim());
    for (const s of sub) {
      if (!s) continue;
      tokens.push(s);
    }
  }
  return tokens;
}

export function makeIngredientsKeyFromOcrText(
  text: string,
  minTokens: number = DEFAULT_MIN_TOKENS
): {
  ingredientsKeyHash: string | null;
  tokenCount: number;
  canonicalKeys: string[];
} {
  const block = extractIngredientBlockFromOcrText(text);
  if (!block) {
    return { ingredientsKeyHash: null, tokenCount: 0, canonicalKeys: [] };
  }

  const tokens = tokenizeIngredientsFromBlock(block);
  const canonicalKeys = canonicalKeysFromTokens(tokens);
  if (canonicalKeys.length < minTokens) {
    return {
      ingredientsKeyHash: null,
      tokenCount: canonicalKeys.length,
      canonicalKeys,
    };
  }

  const ingredientsKeyHash = ingredientsKeysToHash(canonicalKeys);
  return { ingredientsKeyHash, tokenCount: canonicalKeys.length, canonicalKeys };
}

export function makeIngredientsKeyFromAiIngredients(
  ingredients: ExtractIngredient[],
  minTokens: number = DEFAULT_MIN_TOKENS
): {
  ingredientsKeyHash: string | null;
  tokenCount: number;
  canonicalKeys: string[];
} {
  const tokens = ingredients.map((i) => i.name);
  const canonicalKeys = canonicalKeysFromTokens(tokens);
  if (canonicalKeys.length < minTokens) {
    return {
      ingredientsKeyHash: null,
      tokenCount: canonicalKeys.length,
      canonicalKeys,
    };
  }

  const ingredientsKeyHash = ingredientsKeysToHash(canonicalKeys);
  return { ingredientsKeyHash, tokenCount: canonicalKeys.length, canonicalKeys };
}

function buildCacheKey(args: {
  promptFingerprint: string;
  categoryHint: CategoryHint;
  ingredientsKeyHash: string;
}): string {
  const categoryKey = args.categoryHint ?? "none";
  return `${CACHE_PREFIX}${args.promptFingerprint}:${categoryKey}:${args.ingredientsKeyHash}`;
}

type ProductReportCacheEntry = {
  report: AnalysisResult;
  createdAt: number;
};

export async function getCachedProductReport(args: {
  promptFingerprint: string;
  categoryHint: CategoryHint;
  ingredientsKeyHash: string;
}): Promise<AnalysisResult | null> {
  const key = buildCacheKey(args);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProductReportCacheEntry;
    return parsed?.report ?? null;
  } catch {
    return null;
  }
}

export async function setCachedProductReport(args: {
  promptFingerprint: string;
  categoryHint: CategoryHint;
  ingredientsKeyHash: string;
  report: AnalysisResult;
}): Promise<void> {
  const key = buildCacheKey(args);
  const entry: ProductReportCacheEntry = {
    report: args.report,
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(entry));
}

