/**
 * Beauty Detective API Server
 * 开发时运行: npm run dev
 * 需在 .env 中配置 GEMINI_API_KEY 或 GOOGLE_API_KEY
 */
import "./loadEnv";
import express from "express";
import cors from "cors";
import {
  analyzeCosmeticImage,
} from "./analyze.js";
import { detectCriticalBannedIngredient } from "./criticalBan.js";

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
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: "缺少 image 字段（Base64 编码）" });
    }

    const ocrRaw =
      typeof ocrRawText === "string" ? ocrRawText.trim() : "";
    const ingFallback =
      typeof ingredientText === "string" ? ingredientText.trim() : "";
    const safetyScanText = ocrRaw.length > 0 ? ocrRaw : ingFallback;
    const categoryForSafety =
      categoryHint === "skincare" ||
      categoryHint === "supplement" ||
      categoryHint === "haircare"
        ? categoryHint
        : undefined;
    const bannedIngredient =
      safetyScanText.length > 0
        ? detectCriticalBannedIngredient(safetyScanText, categoryForSafety)
        : null;
    if (bannedIngredient) {
      return res.status(422).json({
        error: "High Risk",
        code: "HIGH_RISK_INGREDIENT",
        ingredient: bannedIngredient,
      });
    }

    // Safety check passed, proceeding to cost-intensive AI analysis
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

    const result = await analyzeCosmeticImage(
      image,
      mimeType,
      validCategory,
      validThinking,
      ingredientText,
      typeof userQuestion === "string" ? userQuestion : undefined
    );
    res.json(result);
  } catch (err) {
    console.error("Analysis failed:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "分析失败",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Beauty Detective API listening on http://localhost:${PORT}`);
});
