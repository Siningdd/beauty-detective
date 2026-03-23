/**
 * Beauty Detective - API 调用
 * 开发时需确保后端 API 运行在 http://localhost:3001
 */

import type {
  AnalysisResult,
} from "../types/analysis";

const API_BASE =
  typeof window !== "undefined"
    ? "http://localhost:3002"
    : "http://localhost:3002";

export type ThinkingHint = "supplement" | "essence" | "cream" | "special";

export async function analyzeImage(
  base64Image: string,
  mimeType: string = "image/jpeg",
  signal?: AbortSignal,
  categoryHint?: "skincare" | "supplement" | "haircare",
  thinkingHint?: ThinkingHint,
  ingredientText?: string
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: base64Image,
      mimeType,
      ...(categoryHint && { categoryHint }),
      ...(thinkingHint && { thinkingHint }),
      ...(ingredientText && { ingredientText }),
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

