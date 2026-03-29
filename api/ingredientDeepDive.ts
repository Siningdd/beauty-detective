/**
 * Targeted mini-analysis for a single ingredient (markdown prose, not JSON).
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const MODEL = "gemini-2.5-flash";

export type DeepDiveRequest = {
  base64Image: string;
  mimeType: string;
  category: string;
  ingredientName: string;
  featureTag: string;
  descriptionSnippet: string;
  isMajor: boolean;
  safetyScore?: number;
};

export async function generateIngredientDeepDiveMarkdown(
  req: DeepDiveRequest
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("please set GOOGLE_API_KEY");
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const safety =
    typeof req.safetyScore === "number"
      ? `Declared safety score (0-100): ${req.safetyScore}.`
      : "Safety score not provided.";
  const system =
    "You are a cosmetic and supplement label expert. Reply in Markdown only. Plain language for non-chemists.";

  const userText = `
Ingredient: **${req.ingredientName}** in a ${req.category} context.
- Role: ${req.isMajor ? "Core Functional Ingredient" : "Supporting/Active Ingredient"}
- Feature tag: ${req.featureTag}
- Initial Scan: ${req.descriptionSnippet || "n/a"}
- Safety Score: ${safety}
[Specific Requirements]
** max 200 words**
1. **The "Why"**: Why did the brand put THIS in THIS ${req.category}? (e.g., as a preservative, active, or texture enhancer?)
2. **The "Watch-out"**: What should the user notice during the first week of use? (e.g., purging, dryness, or immediate glow?)
3. **The "Match"**: Does it play well with common ingredients in this category? 

Reply in Markdown. Keep it punchy and jargon-free. 
Cover: what it does in this type of product, typical concerns or synergies, and one practical usage note. Do not diagnose or prescribe.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { text: system + "\n\n" + userText },
    ],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      stopSequences: [],
    },
  });
  const finishReason = response.candidates?.[0]?.finishReason;
  const safetyRatings = response.candidates?.[0]?.safetyRatings;
  console.log(
    "[ingredient-deep-dive] finishReason:",
    finishReason,
    "| safetyRatings:",
    JSON.stringify(safetyRatings ?? [])
  );

  const text = response.text?.trim();
  if (!text) throw new Error("Deep dive: empty model response");
  return text;
}
