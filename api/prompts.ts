import { PROMPT_SKINCARE } from "./promptParts/skincare.js";
import { PROMPT_SUPPLEMENT } from "./promptParts/supplement.js";

/** Normalized category used by analysis routes (haircare shares PROMPT_SKINCARE). */
export type AnalysisPromptCategory = "skincare" | "haircare" | "supplement";
export type ClassifyPromptCategory =
  | "skincare"
  | "haircare"
  | "supplement"
  | "unknown";

function assertAnalysisCategory(category: unknown): asserts category is AnalysisPromptCategory {
  if (category === null || category === undefined) {
    throw new Error("Analysis category is required");
  }
  if (typeof category !== "string") {
    throw new Error("Analysis category is required");
  }
  if (category.trim() === "") {
    throw new Error("Analysis category is required");
  }
  if (
    category !== "skincare" &&
    category !== "haircare" &&
    category !== "supplement"
  ) {
    throw new Error("Analysis category is required");
  }
}

/** Base template only (no category hint suffixes). For cache systemInstruction / suffix split. */
export function getAnalysisPromptBaseConstant(
  category: AnalysisPromptCategory
): string {
  assertAnalysisCategory(category);
  return category === "supplement" ? PROMPT_SUPPLEMENT : PROMPT_SKINCARE;
}

export function getAnalysisPrompt(category: AnalysisPromptCategory): string {
  assertAnalysisCategory(category);
  const base =
    category === "supplement" ? PROMPT_SUPPLEMENT : PROMPT_SKINCARE;
  const baseHint =
    "\n\nIMPORTANT: The user confirmed this product is " +
    category +
    ". Set \"category\" to \"" +
    category +
    "\" and use only the feature_tag pool for that category.";
  const hairHint =
    category === "haircare"
      ? " For usage_tactics.skin_types, use the same six tokens only; interpret as scalp type where relevant (e.g. oily = oily scalp)."
      : "";
  const supplementHint =
    category === "supplement"
      ? " MANDATORY: Root JSON must include object \"dynamic_details\" with \"absorption_rate\" and \"irritation_level\" as integers 0-100 only (never null, never omit)."
      : "";
  return base + baseHint + hairHint + supplementHint;
}

const PROMPT_CLASSIFY_CATEGORY = `
Role: Product category classifier for beauty/supplement packaging.
Task: Determine product category from image and optional OCR text.

Return strict JSON only:
{
  "category": "skincare" | "haircare" | "supplement" | "unknown",
  "confidence": "high" | "medium" | "low",
  "reason": "short reason under 20 words"
}

Rules:
- Use "haircare" for spray, mist, oil, scalp, shampoo, conditioner, styling products for hair/scalp.
- Use "supplement" for oral pills/capsules/powder/sachet/facts serving labels.
- Use "skincare" for topical face/body skin products.
- Use "unknown" if evidence is mixed or too weak.
- If uncertain between skincare and haircare, prefer "haircare" only with explicit hair/scalp context.
- No markdown, no prose, no extra fields.
`.trim();

export function getClassifyCategoryPrompt(): string {
  return PROMPT_CLASSIFY_CATEGORY;
}
