/**
 * Critical ingredient hard-block (multi-language needles).
 * Shared by app OCR flow and API server — no React Native imports.
 */

export const CRITICAL_BANNED_LIST = [
  "Mercury",
  "汞",
  "Quecksilber",
  "Hydroquinone",
  "氢醌",
  "Hydrochinon",
  "Glucocorticoids",
  "Glukokortikoide",
  "糖皮质激素",
  "Betamethasone",
  "倍他米松",
  "Betamethason",
] as const;

/** 2. 欧盟法规专项禁用 (常见于德系/英系过时产品) */
export const EU_BANNED_LIST = [
  "Lilial",
  "Butylphenyl Methylpropional",
  "Isopropylparaben",
  "Isobutylparaben",
  // 注意：此项在面霜中为非法，洗发水中合法 — haircare 分类下不参与匹配
  "Methylisothiazolinone",
] as const;

export const BANNED_INGREDIENT_GROUPS = {
  CRITICAL_BANNED: CRITICAL_BANNED_LIST,
  // 2. 欧盟法规专项禁用 (常见于德系/英系过时产品)
  EU_BANNED: EU_BANNED_LIST,
} as const;

const MIT_NEEDLE = "Methylisothiazolinone";

export type SafetyCategoryHint = "skincare" | "supplement" | "haircare";

function euNeedlesForCategory(
  categoryHint?: SafetyCategoryHint
): readonly string[] {
  if (categoryHint === "haircare") {
    return EU_BANNED_LIST.filter((n) => n !== MIT_NEEDLE);
  }
  return EU_BANNED_LIST;
}

export function detectCriticalBannedIngredient(
  rawText: string,
  categoryHint?: SafetyCategoryHint
): string | null {
  const haystack = rawText.toLowerCase();
  for (const name of CRITICAL_BANNED_LIST) {
    if (haystack.includes(String(name).toLowerCase())) return String(name);
  }
  for (const name of euNeedlesForCategory(categoryHint)) {
    if (haystack.includes(String(name).toLowerCase())) return String(name);
  }
  return null;
}
