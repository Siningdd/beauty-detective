import sharp from "sharp";
import { createWorker } from "tesseract.js";

export type OcrPassResult = {
  text: string;
  psm: 6 | 11;
  forcedRotate180: boolean;
  orientationDegrees: number;
  keywordHits: number;
  cleanLength: number;
  score: number;
};

export type OcrDetectResult = {
  bestText: string;
  passes: OcrPassResult[];
  usedFallback: boolean;
  detectedOrientationDegrees: number;
};

type TesseractWorkerLike = {
  detect: (image: Buffer) => Promise<{
    data?: {
      orientation_degrees?: number | null;
      orientation?: number | null;
    };
  }>;
  recognize: (image: Buffer) => Promise<{
    data?: {
      text?: string | null;
    };
  }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
};

const OCR_KEYWORD_RE = /\b(ingredients?|aqua|inhaltsstoffe)\b/gi;
const OCR_INGREDIENTS_OR_AQUA_RE = /\b(ingredients?|aqua)\b/i;
const NON_ALNUM_RE = /[^a-z0-9]+/gi;

let workerPromise: Promise<TesseractWorkerLike> | null = null;

function normalizeRotationDegrees(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const snapped = Math.round(raw / 90) * 90;
  const normalized = ((snapped % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function normalizeTextForQuality(input: string): string {
  return input.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "s");
}

function fixBrokenLineHyphenation(input: string): string {
  return input.replace(/-\s*\n/g, "").replace(/\r\n/g, "\n");
}

function scoreOcrText(text: string): {
  keywordHits: number;
  cleanLength: number;
  score: number;
  isShortOrNoisy: boolean;
} {
  const normalized = normalizeTextForQuality(text);
  const keywordHits = Array.from(normalized.matchAll(OCR_KEYWORD_RE)).length;
  const clean = normalized.replace(NON_ALNUM_RE, "");
  const cleanLength = clean.length;
  const alphaChars = (normalized.match(/[a-z]/g) ?? []).length;
  const totalChars = Math.max(1, normalized.length);
  const alphaRatio = alphaChars / totalChars;
  const noisePenalty = alphaRatio < 0.35 ? 25 : alphaRatio < 0.5 ? 12 : 0;
  const score = keywordHits * 35 + cleanLength - noisePenalty;
  return {
    keywordHits,
    cleanLength,
    score,
    isShortOrNoisy: cleanLength < 32 || alphaRatio < 0.45,
  };
}

async function getWorker(): Promise<TesseractWorkerLike> {
  if (!workerPromise) {
    workerPromise = createWorker("deu+eng", 1, { logger: () => {} }) as Promise<TesseractWorkerLike>;
  }
  return workerPromise;
}

async function preprocessImage(buffer: Buffer, rotateDegrees: number): Promise<Buffer> {
  return sharp(buffer)
    .rotate(rotateDegrees)
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();
}

async function runRecognizePass(options: {
  worker: TesseractWorkerLike;
  sourceBuffer: Buffer;
  rotateDegrees: number;
  psm: 6 | 11;
  forcedRotate180: boolean;
  detectedOrientationDegrees: number;
}): Promise<OcrPassResult> {
  const prepared = await preprocessImage(options.sourceBuffer, options.rotateDegrees);
  await options.worker.setParameters({
    tessedit_pageseg_mode: String(options.psm),
  });
  const recognized = await options.worker.recognize(prepared);
  const text = fixBrokenLineHyphenation(recognized.data?.text ?? "").trim();
  const quality = scoreOcrText(text);
  return {
    text,
    psm: options.psm,
    forcedRotate180: options.forcedRotate180,
    orientationDegrees: options.detectedOrientationDegrees,
    keywordHits: quality.keywordHits,
    cleanLength: quality.cleanLength,
    score: quality.score,
  };
}

function pickBestPass(passes: OcrPassResult[]): OcrPassResult {
  return [...passes].sort((a, b) => b.score - a.score || b.cleanLength - a.cleanLength)[0];
}

export async function detectAndRecognizeOcr(imageBuffer: Buffer): Promise<OcrDetectResult> {
  const worker = await getWorker();
  let detectedOrientationDegrees = 0;
  try {
    const detected = await worker.detect(imageBuffer);
    const rawOrientation =
      detected.data?.orientation_degrees ?? detected.data?.orientation ?? 0;
    detectedOrientationDegrees = normalizeRotationDegrees(rawOrientation);
  } catch {
    detectedOrientationDegrees = 0;
  }

  const firstPass = await runRecognizePass({
    worker,
    sourceBuffer: imageBuffer,
    rotateDegrees: detectedOrientationDegrees,
    psm: 6,
    forcedRotate180: false,
    detectedOrientationDegrees,
  });

  const firstQuality = scoreOcrText(firstPass.text);
  const hasIngredientsOrAqua = OCR_INGREDIENTS_OR_AQUA_RE.test(
    normalizeTextForQuality(firstPass.text)
  );
  const needsFallback = firstQuality.isShortOrNoisy && !hasIngredientsOrAqua;
  if (!needsFallback) {
    return {
      bestText: firstPass.text,
      passes: [firstPass],
      usedFallback: false,
      detectedOrientationDegrees,
    };
  }

  const secondPass = await runRecognizePass({
    worker,
    sourceBuffer: imageBuffer,
    rotateDegrees: normalizeRotationDegrees(detectedOrientationDegrees + 180),
    psm: 11,
    forcedRotate180: true,
    detectedOrientationDegrees,
  });
  const best = pickBestPass([firstPass, secondPass]);
  return {
    bestText: best.text,
    passes: [firstPass, secondPass],
    usedFallback: true,
    detectedOrientationDegrees,
  };
}

