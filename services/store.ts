/**
 * 临时存储分析报告，用于页面间传递
 * 避免通过 URL params 传递大 JSON
 */

import type { AnalysisResult } from "../types/analysis";

let reportCache: AnalysisResult | null = null;

export function setReport(report: AnalysisResult) {
  reportCache = report;
}

export function getReport(): AnalysisResult | null {
  return reportCache;
}

export function clearReport() {
  reportCache = null;
}

let pendingImage: {
  uri: string;
  base64: string;
  mimeType: string;
  ingredientText?: string;
} | null = null;
let lastAnalyzedImage: {
  uri: string;
  base64: string;
  mimeType: string;
  ingredientText?: string;
} | null = null;

export function setPendingImage(data: {
  uri: string;
  base64: string;
  mimeType: string;
  ingredientText?: string;
}) {
  pendingImage = data;
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
}) {
  lastAnalyzedImage = data;
}

export function getLastAnalyzedImage() {
  return lastAnalyzedImage;
}

export function clearLastAnalyzedImage() {
  lastAnalyzedImage = null;
}
