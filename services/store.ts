/**
 * 临时存储分析报告，用于页面间传递
 * 避免通过 URL params 传递大 JSON
 */

import type { AnalysisResult } from "../types/analysis";

/** Stable id for which image produced the cached report (session + payload shape). */
export function makeAnalysisSourceKey(
  sessionId: number,
  base64: string
): string {
  const head = base64.length > 96 ? base64.slice(0, 96) : base64;
  return `${sessionId}:${base64.length}:${head}`;
}

/** Reserved key for MOCK_REPORT dev entry; always allowed to hydrate without image match. */
export const MOCK_REPORT_SOURCE_KEY = "__mock__";

export type PendingAnalysisParams = {
  base64: string;
  mimeType: string;
  categoryHint?: "skincare" | "supplement" | "haircare";
  thinkingHint?: "supplement" | "essence" | "cream" | "special";
  ingredientText?: string;
  /** Raw OCR text for safety scan before AI */
  ocrRawText?: string;
  sessionId?: number;
};

type ReportCacheEntry = {
  report: AnalysisResult;
  sessionId: number;
  isFollowUpResponse: boolean;
  thinkingHint?: PendingAnalysisParams["thinkingHint"];
  analysisSourceKey?: string;
};

type SessionBoundImage = {
  uri: string;
  base64: string;
  mimeType: string;
  ingredientText?: string;
  ocrRawText?: string;
  sessionId: number;
};

let activeAnalysisSessionId = 0;
let reportCache: ReportCacheEntry | null = null;
let pendingAnalysisParams: PendingAnalysisParams | null = null;

export function startFreshAnalysisSession() {
  activeAnalysisSessionId += 1;
  reportCache = null;
  pendingAnalysisParams = null;
  pendingImage = null;
  lastAnalyzedImage = null;
}

export function getActiveAnalysisSessionId() {
  return activeAnalysisSessionId;
}

export function setReport(
  report: AnalysisResult,
  options?: {
    sessionId?: number;
    isFollowUpResponse?: boolean;
    thinkingHint?: PendingAnalysisParams["thinkingHint"];
    analysisSourceKey?: string;
  }
) {
  const sid = options?.sessionId ?? activeAnalysisSessionId;
  const preservedHint =
    reportCache?.sessionId === sid ? reportCache.thinkingHint : undefined;
  const preservedSourceKey =
    reportCache?.sessionId === sid ? reportCache.analysisSourceKey : undefined;
  reportCache = {
    report,
    sessionId: sid,
    isFollowUpResponse: options?.isFollowUpResponse ?? false,
    thinkingHint:
      options?.thinkingHint !== undefined
        ? options.thinkingHint
        : preservedHint,
    analysisSourceKey:
      options?.analysisSourceKey !== undefined
        ? options.analysisSourceKey
        : preservedSourceKey,
  };
}

export function getReport(): AnalysisResult | null {
  return reportCache?.report ?? null;
}

export function getReportMeta():
  | {
      sessionId: number;
      isFollowUpResponse: boolean;
      thinkingHint?: PendingAnalysisParams["thinkingHint"];
      analysisSourceKey?: string;
    }
  | null {
  if (!reportCache) return null;
  return {
    sessionId: reportCache.sessionId,
    isFollowUpResponse: reportCache.isFollowUpResponse,
    ...(reportCache.thinkingHint !== undefined
      ? { thinkingHint: reportCache.thinkingHint }
      : {}),
    ...(reportCache.analysisSourceKey !== undefined
      ? { analysisSourceKey: reportCache.analysisSourceKey }
      : {}),
  };
}

export function clearReport() {
  reportCache = null;
}

export function setAnalysisParams(params: PendingAnalysisParams) {
  pendingAnalysisParams = {
    ...params,
    sessionId: params.sessionId ?? activeAnalysisSessionId,
  };
}

export function getAnalysisParams(): PendingAnalysisParams | null {
  return pendingAnalysisParams;
}

export function clearAnalysisParams() {
  pendingAnalysisParams = null;
}

let pendingImage: SessionBoundImage | null = null;
let lastAnalyzedImage: SessionBoundImage | null = null;

export function setPendingImage(data: {
  uri: string;
  base64: string;
  mimeType: string;
  ingredientText?: string;
  ocrRawText?: string;
}) {
  pendingImage = {
    ...data,
    sessionId: activeAnalysisSessionId,
  };
}

export function getPendingImage() {
  return pendingImage;
}

export function clearPendingImage() {
  pendingImage = null;
}

export function setLastAnalyzedImage(data: {
  uri: string;
  base64: string;
  mimeType: string;
  ingredientText?: string;
  ocrRawText?: string;
}) {
  lastAnalyzedImage = {
    ...data,
    sessionId: activeAnalysisSessionId,
  };
}

export function getLastAnalyzedImage() {
  return lastAnalyzedImage;
}

export function clearLastAnalyzedImage() {
  lastAnalyzedImage = null;
}
