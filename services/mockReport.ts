/**
 * Mock data for development - preview report page
 */

import type { AnalysisResult } from "../types/analysis";

export const MOCK_REPORT: AnalysisResult = {
  category: "skincare",
  coreTags: [
    { label: "💧 Deep hydration", feature_tag: "Hydrating" },
    { label: "🛡️ Antioxidant repair", feature_tag: "Antioxidant" },
    { label: "🔧 Barrier repair", feature_tag: "Repair" },
    { label: "Base", feature_tag: "Base" },
  ],
  summary: {
    overallEvaluation:
      "Synergistic humectant stack with niacinamide in a minimalist aqueous base; suitable for daily barrier support without fragrance load.",
    pros: [
      "Layered humectants for sustained hydration",
      "Niacinamide supports barrier and sebum balance",
      "No added fragrance in this read",
    ],
    cons: [
      "Traditional phenoxyethanol preservative system",
      "Texture relies on carbomer thickening",
    ],
  },
  chartData: [
    { name: "Hydrating", value: 6 },
    { name: "Antioxidant", value: 3 },
    { name: "Preservative", value: 1 },
    { name: "Base", value: 1 },
  ],
  tips: [
    "Apply to damp skin to maximize humectant uptake",
    "Pair with occlusive PM if barrier is compromised",
  ],
  dynamic_details: {
    optimal_timing: "AM/PM; follow with SPF in daytime",
    irritation_level: 22,
    greasiness: "light",
    is_wash_off: false,
  },
  synergy: [
    {
      partner_ingredient: "Thermal spring water (minerals)",
      benefit: "La Roche-Posay Thermal Spring Water",
      description:
        "Dampens skin to reduce friction and boost absorption of humectants in your base formula.",
      product_image_url:
        "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&q=80",
    },
  ],
  conflicts: [
    {
      ingredient: "High-strength exfoliants",
      interaction:
        "Can compound irritation when skin barrier is compromised.",
      severity: 65,
    },
  ],
  suitability: {
    best_for: ["Daily skincare", "Office workers"],
    skin_types: ["dry", "combination", "neutral", "sensitive"],
    avoid_groups: ["Pregnancy — confirm with clinician"],
  },
  ingredients: [
    {
      name: "Sodium Hyaluronate",
      feature_tag: "Hydrating",
      description: "High-molecular humectant; binds water in stratum corneum.",
      is_major: true,
      safetyScore: 100,
    },
    {
      name: "Niacinamide",
      feature_tag: "Antioxidant",
      description: "Multi-target vitamin B3; barrier and sebum modulation.",
      is_major: true,
      safetyScore: 95,
    },
    {
      name: "Glycerin",
      feature_tag: "Hydrating",
      description: "Classic osmolyte humectant; supports skin softness.",
      is_major: true,
      safetyScore: 95,
    },
    {
      name: "Phenoxyethanol",
      feature_tag: "Preservative",
      description: "Phenoxyethanol-based preservation near typical use levels.",
      is_major: false,
      safetyScore: 85,
    },
    {
      name: "Carbomer",
      feature_tag: "Base",
      description: "Synthetic rheology modifier; suspends and thickens aqueous phase.",
      is_major: false,
      safetyScore: 90,
    },
  ],
};

/** For testing unknown category alert */
export const MOCK_REPORT_UNKNOWN: AnalysisResult = {
  ...MOCK_REPORT,
  category: "unknown",
  coreTags: [],
  chartData: [],
  ingredients: [],
  dynamic_details: {},
  synergy: [],
  conflicts: [],
};
