import type { SkinTypeToken } from "../types/analysis";

const SKIN_TYPE_TOKENS = new Set<string>([
  "dry",
  "null",
  "oily",
  "neutral",
  "sensitive",
  "combination",
]);

/** Map legacy synonyms; drop unknown tokens. */
export function normalizeSkinTypes(raw: unknown): SkinTypeToken[] {
  if (!Array.isArray(raw)) return [];
  const out: SkinTypeToken[] = [];
  const seen = new Set<string>();
  const push = (token: SkinTypeToken) => {
    if (seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };
  for (const item of raw) {
    if (item === null || item === undefined) {
      push("null");
      continue;
    }
    const s = String(item).trim().toLowerCase();
    if (!s) continue;
    let token: SkinTypeToken | undefined;
    if (s === "normal") token = "neutral";
    else if (SKIN_TYPE_TOKENS.has(s)) token = s as SkinTypeToken;
    if (token !== undefined) push(token);
  }
  return out;
}
