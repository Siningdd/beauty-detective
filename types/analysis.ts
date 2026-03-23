/** Gemini + client contract: Formulation DNA Map (no top-level product score). */
export type Category = "skincare" | "supplement" | "haircare" | "unknown";

/** suitability.skin_types — API + model must use these literals only (string "null" = unknown / N/A). */
export type SkinTypeToken =
  | "dry"
  | "null"
  | "oily"
  | "neutral"
  | "sensitive"
  | "combination";

export type AnalysisIngredient = {
  name: string;
  feature_tag: string;
  description: string;
  is_major: boolean;
  /** 0–100 per ingredient; omit if model did not provide */
  safetyScore?: number;
};

/** Short ingredient evidence (no description/safety) from `/api/extract-ingredients`. */
export type ExtractIngredient = {
  name: string;
  feature_tag: string;
  is_major: boolean;
};

/** Ingredient-only details (description + safetyScore). */
export type IngredientDetailsItem = {
  name: string;
  description: string;
  safetyScore?: number;
};

export type ExtractIngredientsResult = {
  category: Category;
  ingredients: ExtractIngredient[];
};

/** high / medium / low, or explicit null from JSON — legacy; prefer Score0to100 in API */
export type HighMedLow = "high" | "medium" | "low" | null;

/** Irritation, absorption (supplements), conflict severity — 0–100 from model; legacy enum coerced in analyze */
export type Score0to100 = number;

export type GreasinessLevel =
  | "rich"
  | "creamy"
  | "silky"
  | "fresh"
  | "light"
  | null;

export type DynamicDetails = {
  absorption_rate?: Score0to100 | null;
  optimal_timing?: string;
  irritation_level?: Score0to100 | null;
  greasiness?: GreasinessLevel;
  is_wash_off?: boolean;
};

export type SynergyItem = {
  partner_ingredient: string;
  benefit: string;
  description: string;
  product_image_url: string;
};

export type ConflictItem = {
  ingredient: string;
  interaction: string;
  severity: Score0to100 | null;
};

/** Display label from AI; optional feature_tag maps to chart segment for theme/highlight. */
export type CoreTagItem = {
  label: string;
  feature_tag?: string;
};

export type AnalysisResult = {
  category: Category;
  /** 1–5 product-level headline tags; label = display, feature_tag = chart linkage */
  coreTags: CoreTagItem[];
  summary: {
    overallEvaluation: string;
    pros: string[];
    cons: string[];
  };
  /** Per-tag weighted score (Major +3, Trace +1); pie slice = value / sum of values */
  chartData: Array<{ name: string; value: number }>;
  ingredients: AnalysisIngredient[];
  dynamic_details: DynamicDetails;
  safety_audit?: {
    formula_style: string;
    safety_verdict: string;
    unfiltered_risks: string;
  };
  synergy: SynergyItem[];
  conflicts: ConflictItem[];
  suitability: {
    best_for: string[];
    skin_types: SkinTypeToken[];
    avoid_groups: string[];
  };
  tips: string[];
};

export type ProductSlimResult = Omit<AnalysisResult, "ingredients">;
