/**
 * Beauty Detective - API 调用
 * 开发时需确保后端 API 运行在 http://localhost:3002
 */

import type {
  AnalysisResult,
} from "../types/analysis";

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

export async function analyzeImage(
  base64Image: string,
  mimeType: string = "image/jpeg",
  signal?: AbortSignal,
  categoryHint?: "skincare" | "supplement" | "haircare",
  thinkingHint?: ThinkingHint,
  ingredientText?: string,
  userQuestion?: string,
  ocrRawText?: string
): Promise<AnalysisResult> {
  const q =
    typeof userQuestion === "string" ? userQuestion.trim() : "";
  const ocr = typeof ocrRawText === "string" ? ocrRawText.trim() : "";
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: base64Image,
      mimeType,
      ...(categoryHint && { categoryHint }),
      ...(thinkingHint && { thinkingHint }),
      ...(ingredientText && { ingredientText }),
      ...(ocr.length > 0 && { ocrRawText: ocr }),
      ...(q.length > 0 && { userQuestion: q }),
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

