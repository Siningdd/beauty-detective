/**
 * Beauty Detective API Server
 * 开发时运行: npm run dev
 * 需在 .env 中配置 GEMINI_API_KEY 或 GOOGLE_API_KEY
 */
import "./loadEnv";
import express from "express";
import cors from "cors";
import { analyzeCosmeticImage } from "./analyze.js";
import { detectCriticalBannedIngredient } from "./criticalBan.js";
import { detectAndRecognizeOcr } from "./ocr.js";
import {
  applyOcrCorrectionMapToText,
  normalizeOcrCorrectionMapBody,
} from "./ocrCorrectionApply.js";
import { generateIngredientDeepDiveMarkdown } from "./ingredientDeepDive.js";

/** When client sends enough OCR text, skip Node OCR to avoid double OCR + latency. */
const CLIENT_TEXT_SKIP_NODE_OCR_MIN_LEN = 100;

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.post("/api/analyze", async (req, res) => {
  try {
    const {
      image,
      ingredientText,
      ocrRawText,
      mimeType = "image/jpeg",
      categoryHint,
      thinkingHint,
      userQuestion,
      verifiedIngredientDirective,
      ocrCorrectionMap: ocrCorrectionMapRaw,
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: "no image （Base64）" });
    }

    const validCategory =
      categoryHint === "skincare" ||
      categoryHint === "supplement" ||
      categoryHint === "haircare"
        ? categoryHint
        : undefined;

    const validThinking =
      thinkingHint === "supplement" ||
      thinkingHint === "essence" ||
      thinkingHint === "cream" ||
      thinkingHint === "special"
        ? thinkingHint
        : undefined;

    const ocrRaw = typeof ocrRawText === "string" ? ocrRawText.trim() : "";
    const ingFallback =
      typeof ingredientText === "string" ? ingredientText.trim() : "";

    let resolvedOcrRawText = ocrRaw;
    let resolvedIngredientText = ingFallback;
    let ocrMeta:
      | {
          detectedOrientationDegrees: number;
          usedFallback: boolean;
          passCount: number;
        }
      | undefined;

    const clientTextEnough =
      ingFallback.length >= CLIENT_TEXT_SKIP_NODE_OCR_MIN_LEN ||
      ocrRaw.length >= CLIENT_TEXT_SKIP_NODE_OCR_MIN_LEN;

    try {
      const imageBase64 = String(image).replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(imageBase64, "base64");
      if (clientTextEnough) {
        if (resolvedOcrRawText.length === 0 && resolvedIngredientText.length > 0) {
          resolvedOcrRawText = resolvedIngredientText;
        }
        if (resolvedIngredientText.length === 0 && resolvedOcrRawText.length > 0) {
          resolvedIngredientText = resolvedOcrRawText;
        }
      } else {
        const ocrResult = await detectAndRecognizeOcr(buffer);
        const bestText = ocrResult.bestText.trim();
        if (bestText.length > 0) {
          resolvedOcrRawText = bestText;
          resolvedIngredientText = bestText;
        }
        ocrMeta = {
          detectedOrientationDegrees: ocrResult.detectedOrientationDegrees,
          usedFallback: ocrResult.usedFallback,
          passCount: ocrResult.passes.length,
        };
      }
    } catch (ocrError) {
      console.warn("[api/analyze] Node OCR failed, fallback to client OCR:", ocrError);
    }

    const correctionMap = normalizeOcrCorrectionMapBody(ocrCorrectionMapRaw);
    if (Object.keys(correctionMap).length > 0) {
      resolvedIngredientText = applyOcrCorrectionMapToText(
        resolvedIngredientText,
        correctionMap
      );
      resolvedOcrRawText = applyOcrCorrectionMapToText(
        resolvedOcrRawText,
        correctionMap
      );
    }

    const safetyScanText =
      resolvedOcrRawText.length > 0 ? resolvedOcrRawText : resolvedIngredientText;
    const bannedIngredient =
      safetyScanText.length > 0
        ? detectCriticalBannedIngredient(safetyScanText, validCategory)
        : null;
    if (bannedIngredient) {
      return res.status(422).json({
        error: "High Risk",
        code: "HIGH_RISK_INGREDIENT",
        ingredient: bannedIngredient,
      });
    }

    const directive =
      typeof verifiedIngredientDirective === "string"
        ? verifiedIngredientDirective.trim()
        : "";

    const result = await analyzeCosmeticImage(
      image,
      mimeType,
      validCategory,
      validThinking,
      resolvedIngredientText,
      typeof userQuestion === "string" ? userQuestion : undefined,
      directive.length > 0 ? directive : undefined
    );
    res.json({
      ...result,
      resolvedIngredientText,
      resolvedOcrRawText,
      ocrMeta,
    });
  } catch (err) {
    console.error("Analysis failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Analysis failed",
    });
  }
});



app.post("/api/ingredient-deep-dive", async (req, res) => {
  try {
    const {
      image,
      mimeType = "image/jpeg",
      category,
      ingredientName,
      featureTag,
      descriptionSnippet,
      isMajor,
      safetyScore,
    } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "缺少 image" });
    }
    const name =
      typeof ingredientName === "string" ? ingredientName.trim() : "";
    if (name.length < 2) {
      return res.status(400).json({ error: "缺少 ingredientName" });
    }
    const cat =
      category === "skincare" ||
      category === "supplement" ||
      category === "haircare"
        ? category
        : "skincare";
    const tag =
      typeof featureTag === "string" && featureTag.trim()
        ? featureTag.trim()
        : "Unknown";
    const snippet =
      typeof descriptionSnippet === "string"
        ? descriptionSnippet.slice(0, 800)
        : "";
    const major = Boolean(isMajor);
    const safety =
      typeof safetyScore === "number" && Number.isFinite(safetyScore)
        ? safetyScore
        : undefined;

    const markdown = await generateIngredientDeepDiveMarkdown({
      base64Image: image,
      mimeType,
      category: cat,
      ingredientName: name,
      featureTag: tag,
      descriptionSnippet: snippet,
      isMajor: major,
      safetyScore: safety,
    });
    res.json({ markdown });
  } catch (err) {
    console.error("[api/ingredient-deep-dive]", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Deep dive failed",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Beauty Detective API listening on http://localhost:${PORT}`);
});
