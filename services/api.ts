/**
 * Beauty Detective - API 调用
 * 开发时需确保后端 API 运行在 http://localhost:3002
 */

import type { AnalysisResult } from "../types/analysis";
import { loadUserCorrectionMap } from "./userOcrCorrections";
import { applyOcrCorrectionMapToText } from "../utils/ocrCorrectionApply";

const API_BASE =
  typeof window !== "undefined"
    ? "http://localhost:3002"
    : "http://localhost:3002";

export type ThinkingHint = "supplement" | "essence" | "cream" | "special";

export const HIGH_RISK_INGREDIENT_CODE = "HIGH_RISK_INGREDIENT";

export type AnalyzeErrorBody = {
  error?: string;
  code?: string;
  ingredient?: string;
};

export type AnalyzeImageResponse = AnalysisResult & {
  resolvedIngredientText?: string;
  resolvedOcrRawText?: string;
  ocrMeta?: {
    detectedOrientationDegrees: number;
    usedFallback: boolean;
    passCount: number;
  };
};

export async function analyzeImage(
  base64Image: string,
  mimeType: string = "image/jpeg",
  signal?: AbortSignal,
  categoryHint?: "skincare" | "supplement" | "haircare",
  thinkingHint?: ThinkingHint,
  ingredientText?: string,
  userQuestion?: string,
  ocrRawText?: string,
  verifiedIngredientDirective?: string,
  ocrCorrectionMap?: Record<string, string>
): Promise<AnalyzeImageResponse> {
  const q = typeof userQuestion === "string" ? userQuestion.trim() : "";
  const map =
    ocrCorrectionMap !== undefined
      ? ocrCorrectionMap
      : await loadUserCorrectionMap();

  let ing =
    typeof ingredientText === "string" ? ingredientText.trim() : "";
  let ocr = typeof ocrRawText === "string" ? ocrRawText.trim() : "";
  if (Object.keys(map).length > 0) {
    if (ing) ing = applyOcrCorrectionMapToText(ing, map);
    if (ocr) ocr = applyOcrCorrectionMapToText(ocr, map);
  }

  const directive =
    typeof verifiedIngredientDirective === "string"
      ? verifiedIngredientDirective.trim()
      : "";

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: base64Image,
      mimeType,
      ...(categoryHint && { categoryHint }),
      ...(thinkingHint && { thinkingHint }),
      ...(ing && { ingredientText: ing }),
      ...(ocr.length > 0 && { ocrRawText: ocr }),
      ...(q.length > 0 && { userQuestion: q }),
      ...(directive.length > 0 && {
        verifiedIngredientDirective: directive,
      }),
      ...(Object.keys(map).length > 0 && { ocrCorrectionMap: map }),
    }),
    signal,
  });

  if (res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as AnalyzeErrorBody;
    const err = new Error(body.error || "High Risk");
    Object.assign(err, {
      code: body.code,
      ingredient: body.ingredient,
      status: 422,
    });
    throw err;
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as AnalyzeErrorBody;
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export type IngredientDeepDiveParams = {
  base64Image: string;
  mimeType?: string;
  category: "skincare" | "supplement" | "haircare";
  ingredientName: string;
  featureTag: string;
  descriptionSnippet: string;
  isMajor: boolean;
  safetyScore?: number;
};

export async function fetchIngredientDeepDive(
  params: IngredientDeepDiveParams,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ingredient-deep-dive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: params.base64Image,
      mimeType: params.mimeType ?? "image/jpeg",
      category: params.category,
      ingredientName: params.ingredientName,
      featureTag: params.featureTag,
      descriptionSnippet: params.descriptionSnippet,
      isMajor: params.isMajor,
      ...(typeof params.safetyScore === "number"
        ? { safetyScore: params.safetyScore }
        : {}),
    }),
    signal,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Deep dive failed: ${res.status}`);
  }
  const data = (await res.json()) as { markdown?: string };
  const md = typeof data.markdown === "string" ? data.markdown.trim() : "";
  if (!md) throw new Error("Empty deep dive response");
  return md;
}

