/**
 * Beauty Detective — ingredient analysis API (Gemini)
 */

import { GoogleGenAI } from "@google/genai";
import {
  getAnalysisPrompt,
} from "./prompts.js";
import type {
  AnalysisResult,
  CoreTagItem,
  ConflictItem,
  DynamicDetails,
  GreasinessLevel,
  Category,
  HighMedLow,
  Score0to100,
  SkinTypeToken,
  SynergyItem,
} from "../types/analysis.js";
import { buildChartData, coerceFeatureTag } from "./featureTagPools.js";
import { ensureLabelEmoji } from "./featureTagEmoji.js";
// Parent utils compile to CJS interop under tsx; named ESM import fails at runtime.
import skinTypesMod from "../utils/skinTypes.js";
const normalizeSkinTypes = (
  skinTypesMod as { normalizeSkinTypes: (raw: unknown) => SkinTypeToken[] }
).normalizeSkinTypes;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY 或 GOOGLE_API_KEY 未设置。请在 .env 中配置。"
  );
}

const MAX_CORE_TAGS = 5;

/** feature_tags for which actions/description should be omitted. */
const NO_ACTIONS_TAGS = new Set<string>([
  "Fragrance",
  "Preservative",
  "Base",
  "Fillers",
  "Capsule-Shell",
  "Flavor/Fragrance",
]);

const IMAGE_MODEL = "gemini-2.5-flash";

const CONTEXT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CONTEXT_CACHE_TTL = "86400s";

type CacheEntry = {
  name: string;
  expiresAt: number;
};

type ActiveCache = {
  analysis?: CacheEntry;
};

// Local in-memory cache (per server instance).
// Cached-content itself is server-side; this avoids re-creating the cache object.
let activeCache: ActiveCache = {};
let cacheInFlight: {
  analysis?: Promise<CacheEntry>;
} = {};

function isCacheEntryValid(entry?: CacheEntry): boolean {
  return !!entry && entry.expiresAt > Date.now();
}

const ANALYSIS_SYSTEM_INSTRUCTION_BASE = getAnalysisPrompt();

function getPromptSuffix(base: string, full: string): string {
  if (full.startsWith(base)) return full.slice(base.length).trim();
  return full.trim();
}

async function getOrCreateCache(
  ai: GoogleGenAI,
  kind: "analysis"
): Promise<CacheEntry> {
  const existing = activeCache.analysis;
  if (isCacheEntryValid(existing)) return existing!;

  const inflight = cacheInFlight.analysis;
  if (inflight) return inflight;

  const promise = (async (): Promise<CacheEntry> => {
    const systemInstruction = ANALYSIS_SYSTEM_INSTRUCTION_BASE;
    const displayName = "beauty-detective:analysis-system-v1";

    const cache = await ai.caches.create({
      model: IMAGE_MODEL,
      config: {
        systemInstruction,
        displayName,
        ttl: CONTEXT_CACHE_TTL,
      },
    });

    const name = (cache as { name?: string }).name;
    if (!name) throw new Error("Gemini cache create failed (missing name).");

    const entry: CacheEntry = {
      name,
      expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
    };

    activeCache.analysis = entry;
    return entry;
  })();

  cacheInFlight.analysis = promise;

  try {
    const entry = await promise;
    return entry;
  } finally {
    // Clear in-flight marker regardless of success/failure.
    cacheInFlight.analysis = undefined;
  }
}

/** JSON Schema for structured output — matches prompt's expected shape. */
const ANALYSIS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["skincare", "haircare", "supplement", "unknown"] },
    main_functions: {
      type: "object",
      properties: {
        tag: {
          anyOf: [
            {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  feature_tag: { type: "string" },
                },
                required: ["label"],
                additionalProperties: true,
              },
            },
            {
              type: "object",
              properties: {
                label: { type: "string" },
                feature_tag: { type: "string" },
              },
              required: ["label"],
              additionalProperties: true,
            },
          ],
        },
      },
      additionalProperties: {
        type: "object",
        properties: { label: { type: "string" }, feature_tag: { type: "string" } },
        required: ["label"],
        additionalProperties: true,
      },
    },
    summary: {
      type: "object",
      properties: {
        the_real_talk: { type: "string" },
        the_wins: { type: "array", items: { type: "string" } },
        the_risks: { type: "array", items: { type: "string" } },
        the_red_flags: { type: "array", items: { type: "string" } },
      },
    },
    ingredients_deep_dive: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          feature_tag: { type: "string" },
          actions: { type: "string" },
          is_major: { type: "boolean" },
          safetyScore: { type: ["integer", "number", "null"] },
        },
      },
    },
    safety_audit: {
      type: "object",
      properties: {
        formula_style: { type: "string" },
        safety_verdict: { type: "string" },
        unfiltered_risks: { type: "string" },
      },
      required: ["formula_style", "safety_verdict", "unfiltered_risks"],
      additionalProperties: true,
    },
    dynamic_details: {
      type: "object",
      properties: {
        absorption_rate: { type: ["integer", "null"] },
        optimal_timing: { type: "array", items: { type: "string" } },
        irritation_level: { type: ["integer", "null"] },
        greasiness: { type: ["string", "null"] },
        is_wash_off: { type: "boolean" },
      },
    },
    synergy_squad: {
      type: "array",
      items: {
        type: "object",
        properties: {
          partner_ingredient: { type: "string" },
          product_rec: { type: "string" },
          product_image_url: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    conflicts_alert: {
      type: "array",
      items: {
        type: "object",
        properties: {
          partner_ingredient: { type: "string" },
          why: { type: "string" },
          severity: { type: ["integer", "null"] },
        },
      },
    },
    usage_tactics: {
      type: "object",
      properties: {
        best_match: { type: "array", items: { type: "string" } },
        skin_types: { type: "array", items: { type: "string" } },
        avoid_groups: { type: "array", items: { type: "string" } },
      },
    },
    expert_advice: { type: "array", items: { type: "string" } },
  },
  required: [
    "category",
    "main_functions",
    "summary",
    "ingredients_deep_dive",
    "safety_audit",
    "usage_tactics",
  ],
};

type CategoryHintArg = "skincare" | "supplement" | "haircare";

/** Gemini response schema; supplement hint forces integer absorption + irritation in dynamic_details. */
function getAnalysisResponseSchema(categoryHint?: CategoryHintArg): object {
  const schema = structuredClone(ANALYSIS_RESPONSE_SCHEMA) as {
    type: string;
    properties: {
      dynamic_details: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };
    };
    required: string[];
  };
  if (categoryHint === "supplement") {
    const prev = schema.properties.dynamic_details;
    schema.properties.dynamic_details = {
      type: "object",
      properties: {
        ...prev.properties,
        absorption_rate: { type: "integer", minimum: 0, maximum: 100 },
        irritation_level: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["absorption_rate", "irritation_level"],
    };
    if (!schema.required.includes("dynamic_details")) {
      schema.required = [...schema.required, "dynamic_details"];
    }
  }
  return schema;
}

const EXTRACT_INGREDIENTS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["skincare", "supplement", "haircare", "unknown"],
    },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          feature_tag: { type: "string" },
          is_major: { type: "boolean" },
        },
        required: ["name", "feature_tag", "is_major"],
        additionalProperties: true,
      },
    },
  },
  required: ["category", "ingredients"],
};

const PRODUCT_SLIM_RESPONSE_SCHEMA_BASE = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["skincare", "supplement", "haircare", "unknown"],
    },
    main_functions: {
      type: "object",
      properties: {
        tag: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              feature_tag: { type: "string" },
            },
            required: ["label"],
            additionalProperties: true,
          },
        },
      },
      additionalProperties: {
        type: "object",
        properties: { label: { type: "string" }, feature_tag: { type: "string" } },
      },
    },
    summary: {
      type: "object",
      properties: {
        the_real_talk: { type: "string" },
        the_wins: { type: "array", items: { type: "string" } },
        the_red_flags: { type: "array", items: { type: "string" } },
      },
      additionalProperties: true,
    },
    dynamic_details: {
      type: "object",
      properties: {
        absorption_rate: { type: ["integer", "null"] },
        optimal_timing: { type: "array", items: { type: "string" } },
        irritation_level: { type: ["integer", "null"] },
        greasiness: { type: ["string", "null"] },
        is_wash_off: { type: "boolean" },
      },
      additionalProperties: true,
    },
    safety_audit: {
      type: "object",
      properties: {
        formula_style: { type: "string" },
        safety_verdict: { type: "string" },
        unfiltered_risks: { type: "string" },
      },
      required: ["formula_style", "safety_verdict", "unfiltered_risks"],
      additionalProperties: true,
    },
    synergy_squad: {
      type: "array",
      items: {
        type: "object",
        properties: {
          partner_ingredient: { type: "string" },
          product_rec: { type: "string" },
          product_image_url: { type: "string" },
          why: { type: "string" },
        },
        additionalProperties: true,
      },
    },
    conflicts_alert: {
      type: "array",
      items: {
        type: "object",
        properties: {
          partner_ingredient: { type: "string" },
          why: { type: "string" },
          severity: { type: ["integer", "null"] },
        },
        additionalProperties: true,
      },
    },
    usage_tactics: {
      type: "object",
      properties: {
        best_match: { type: "array", items: { type: "string" } },
        skin_types: { type: "array", items: { type: "string" } },
        avoid_groups: { type: "array", items: { type: "string" } },
      },
      additionalProperties: true,
    },
    expert_advice: { type: "array", items: { type: "string" } },
  },
  required: ["category", "main_functions", "summary", "safety_audit", "usage_tactics"],
};

function getProductSlimResponseSchema(categoryHint?: CategoryHintArg): object {
  const schema = structuredClone(PRODUCT_SLIM_RESPONSE_SCHEMA_BASE) as {
    type: "object";
    required: string[];
    properties: {
      dynamic_details?: {
        type: string;
        properties: Record<string, unknown>;
      };
    };
  };
  if (categoryHint === "supplement") {
    const prev = schema.properties.dynamic_details;
    schema.properties.dynamic_details = {
      type: "object",
      properties: {
        ...(prev?.properties ?? {}),
        absorption_rate: { type: "integer", minimum: 0, maximum: 100 },
        irritation_level: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["absorption_rate", "irritation_level"],
    } as any;
    if (!schema.required.includes("dynamic_details")) {
      schema.required = [...schema.required, "dynamic_details"];
    }
  }
  return schema;
}

const HIGH_MED_LOW_SET = new Set<string>(["high", "medium", "low"]);
const GREASINESS_SET = new Set<string>([
  "rich",
  "creamy",
  "silky",
  "fresh",
  "light",
]);

function coerceHighMedLow(v: unknown): HighMedLow | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (HIGH_MED_LOW_SET.has(s)) return s as Exclude<HighMedLow, null>;
  return undefined;
}

/** Legacy enum → 0–100 when model still returns high|medium|low */
const LEGACY_HIGH_MED_LOW_TO_SCORE: Record<"high" | "medium" | "low", Score0to100> =
  {
    low: 20,
    medium: 50,
    high: 85,
  };

/** 0–100 integer from JSON, or legacy high|medium|low; invalid → undefined */
function coerceScore0to100(raw: unknown): Score0to100 | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(100, Math.max(0, Math.round(raw)));
  }
  const hml = coerceHighMedLow(raw);
  if (hml === undefined) return undefined;
  if (hml === null) return null;
  return LEGACY_HIGH_MED_LOW_TO_SCORE[hml];
}

function coerceGreasiness(v: unknown): GreasinessLevel | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (GREASINESS_SET.has(s)) return s as Exclude<GreasinessLevel, null>;
  return undefined;
}

function coerceWashOff(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}

function normalizeIngredientSafetyScore(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const scaled = v <= 10 ? v * 10 : v;
  return Math.min(100, Math.max(0, Math.round(scaled)));
}

/** New prompt: single string; tolerate legacy array from older model output. */
function coerceTheRealTalk(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map(String)
      .map((x) => x.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  return String(raw).trim();
}

function normalizeDynamicDetails(
  raw: unknown,
  category: AnalysisResult["category"]
): DynamicDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const d = raw as Record<string, unknown>;
  const pickTiming = (): string | undefined => {
    const v = d.optimal_timing;
    if (v == null) return undefined;
    if (Array.isArray(v)) {
      const parts = v.map(String).map((x) => x.trim()).filter(Boolean);
      return parts.length ? parts.join(", ") : undefined;
    }
    const s = String(v).trim();
    return s || undefined;
  };
  const out: DynamicDetails = {};
  if (category === "supplement" && "absorption_rate" in d) {
    const v = coerceScore0to100(d.absorption_rate);
    if (v !== undefined) out.absorption_rate = v;
  }
  {
    const s = pickTiming();
    if (s !== undefined) out.optimal_timing = s;
  }
  if ("irritation_level" in d) {
    const v = coerceScore0to100(d.irritation_level);
    if (v !== undefined) out.irritation_level = v;
  }
  if ("greasiness" in d) {
    const v = coerceGreasiness(d.greasiness);
    if (v !== undefined) out.greasiness = v;
  }
  if ("is_wash_off" in d) {
    const b = coerceWashOff(d.is_wash_off);
    if (b !== undefined) out.is_wash_off = b;
  }
  return out;
}

function normalizeSynergy(raw: unknown): SynergyItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const s = item as Record<string, unknown>;
      return {
        partner_ingredient: String(
          s.partner_ingredient ?? s.partnerIngredient ?? ""
        ).trim(),
        benefit: String(s.benefit ?? s.product_rec ?? "").trim(),
        description: String(s.description ?? s.why ?? "").trim(),
        product_image_url: "",
      };
    })
    .filter(
      (x) =>
        x.partner_ingredient.length > 0 ||
        x.benefit.length > 0 ||
        x.description.length > 0
    );
}

function normalizeConflicts(raw: unknown): ConflictItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const c = item as Record<string, unknown>;
      const severity: Score0to100 | null =
        "severity" in c ? coerceScore0to100(c.severity) ?? null : null;
      return {
        ingredient: String(c.ingredient ?? c.partner_ingredient ?? "").trim(),
        interaction: String(c.interaction ?? c.why ?? "").trim(),
        severity,
      };
    })
    .filter(
      (x) =>
        x.ingredient.length > 0 ||
        x.interaction.length > 0 ||
        x.severity !== null
    );
}

/** Parses main_functions / coreTags from raw; returns CoreTagItem[] for display + optional chart linkage. */
function normalizeCoreTagItems(raw: unknown, category: AnalysisResult["category"]): CoreTagItem[] {
  let arr: unknown[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if ("tag" in o) {
      const tagVal = o.tag;
      if (Array.isArray(tagVal)) arr = tagVal;
      else if (tagVal && typeof tagVal === "object") arr = [tagVal];
      else if (tagVal != null) arr = [tagVal];
      else arr = [];
    } else {
      arr = [
        o.tag_1 ?? o.primary,
        o.tag_2 ?? o.secondary,
        o.tag_3 ?? o.booster,
      ].filter((x): x is NonNullable<typeof x> => x != null);
    }
  } else {
    arr = [];
  }
  const seen = new Set<string>();
  const out: CoreTagItem[] = [];
  for (const item of arr) {
    if (out.length >= MAX_CORE_TAGS) break;
    let label: string;
    let feature_tag: string | undefined;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      label = String(o.label ?? o.headline ?? o.text ?? "").trim().replace(/\s+/g, " ");
      const ft = o.feature_tag ?? o.featureTag ?? o.tag;
      feature_tag = typeof ft === "string" && ft.trim() ? ft.trim() : undefined;
    } else {
      label = String(item ?? "").trim().replace(/\s+/g, " ");
      feature_tag = undefined;
    }
    if (!label) continue;
    label = ensureLabelEmoji(label, feature_tag);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(feature_tag ? { label, feature_tag } : { label });
  }
  return out;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch
    ? codeBlockMatch[1].trim()
    : text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(jsonStr) as Record<string, unknown>;
}

function extractJson(text: string): AnalysisResult {
  const raw = parseJsonObject(text);
  return normalizeToNewFormat(raw);
}

function normalizeToNewFormat(raw: Record<string, unknown>): AnalysisResult {
  const categoryVal =
    typeof raw.category === "string"
      ? raw.category.toLowerCase().trim().replace(/\s+/g, "")
      : "";
  let category: AnalysisResult["category"] = "unknown";
  if (categoryVal === "skincare" || categoryVal === "supplement") {
    category = categoryVal;
  } else if (categoryVal === "haircare" || categoryVal === "hairproduct") {
    category = "haircare";
  }

  const summaryRaw = raw.summary;
  let summary: AnalysisResult["summary"];
  if (
    summaryRaw &&
    typeof summaryRaw === "object" &&
    !Array.isArray(summaryRaw)
  ) {
    const s = summaryRaw as Record<string, unknown>;
    const legacyEval = String(s.overallEvaluation ?? "").trim();
    const realTalk = coerceTheRealTalk(s.the_real_talk);
    const overallEvaluation =
      legacyEval.length > 0 ? legacyEval : realTalk;
    summary = {
      overallEvaluation,
      pros: Array.isArray(s.pros)
        ? s.pros.map((p) => String(p).trim())
        : Array.isArray(s.the_wins)
          ? s.the_wins.map((w) => String(w).trim())
          : [],
      cons: Array.isArray(s.cons)
        ? s.cons.map((c) => String(c).trim())
        : Array.isArray(s.the_red_flags)
          ? s.the_red_flags.map((r) => String(r).trim())
        : Array.isArray(s.the_risks)
          ? s.the_risks.map((r) => String(r).trim())
          : [],
    };
  } else {
    const fallback = String(summaryRaw ?? "");
    summary = {
      overallEvaluation: fallback,
      pros: [],
      cons: [],
    };
  }

  const suitabilityObj =
    raw.suitability &&
    typeof raw.suitability === "object" &&
    !Array.isArray(raw.suitability)
      ? (raw.suitability as Record<string, unknown>)
      : null;
  const tacticsObj =
    raw.usage_tactics &&
    typeof raw.usage_tactics === "object" &&
    !Array.isArray(raw.usage_tactics)
      ? (raw.usage_tactics as Record<string, unknown>)
      : null;
  const mergedSuit: Record<string, unknown> = {
    ...tacticsObj,
    ...suitabilityObj,
  };
  let suitability: AnalysisResult["suitability"];
  if (tacticsObj || suitabilityObj) {
    suitability = {
      best_for: Array.isArray(mergedSuit.best_for)
        ? mergedSuit.best_for.map(String)
        : Array.isArray(mergedSuit.best_match)
          ? mergedSuit.best_match.map(String)
          : [],
      skin_types: normalizeSkinTypes(
        Array.isArray(mergedSuit.skin_types)
          ? mergedSuit.skin_types
          : Array.isArray(raw.suitableSkinTypes)
            ? raw.suitableSkinTypes
            : []
      ),
      avoid_groups: Array.isArray(mergedSuit.avoid_groups)
        ? mergedSuit.avoid_groups.map(String)
        : [],
    };
  } else {
    suitability = {
      best_for: [],
      skin_types: normalizeSkinTypes(
        Array.isArray(raw.suitableSkinTypes) ? raw.suitableSkinTypes : []
      ),
      avoid_groups: [],
    };
  }

  const tips = Array.isArray(raw.tips)
    ? raw.tips.map(String)
    : Array.isArray(raw.expert_advice)
      ? raw.expert_advice.map(String)
      : [];

  const ingredientsRaw = Array.isArray(raw.ingredients)
    ? (raw.ingredients as Array<Record<string, unknown>>)
    : Array.isArray(raw.ingredients_deep_dive)
      ? (raw.ingredients_deep_dive as Array<Record<string, unknown>>)
      : [];

  const ingredients: AnalysisResult["ingredients"] = ingredientsRaw.map(
    (ing) => {
      const tagRaw = String(
        ing.feature_tag ?? ing.featureTag ?? ing.tag ?? ""
      );
      const feature_tag = coerceFeatureTag(tagRaw, category);
      const is_major =
        typeof ing.is_major === "boolean"
          ? ing.is_major
          : typeof ing.isMajor === "boolean"
            ? ing.isMajor
            : false;
      const safetyScore = normalizeIngredientSafetyScore(
        ing.safetyScore ?? ing.safety_score
      );
      const row: AnalysisResult["ingredients"][number] = {
        name: String(ing.name ?? "").trim(),
        feature_tag,
        description: NO_ACTIONS_TAGS.has(feature_tag)
          ? ""
          : String(ing.description ?? ing.efficacy ?? ing.actions ?? "")
              .trim(),
        is_major,
      };
      if (safetyScore !== undefined) row.safetyScore = safetyScore;
      return row;
    }
  );

  const dynamic_details = normalizeDynamicDetails(
    raw.dynamic_details ?? raw.dynamicDetails,
    category
  );
  const synergySource =
    Array.isArray(raw.synergy) && raw.synergy.length > 0
      ? raw.synergy
      : raw.synergy_squad;
  const synergy = normalizeSynergy(synergySource);

  const conflictsSource =
    Array.isArray(raw.conflicts) && raw.conflicts.length > 0
      ? raw.conflicts
      : raw.conflicts_alert;
  const conflicts = normalizeConflicts(conflictsSource);

  const chartData = buildChartData(ingredients, category);

  const coreTagsRaw =
    raw.coreTags ??
    raw.core_tags ??
    raw.mainEffects ??
    raw.main_functions ??
    [];

  const coreTags = normalizeCoreTagItems(coreTagsRaw, category);

  const pickAuditString = (v: unknown): string =>
    v == null ? "" : String(v).trim();

  const safetyAuditRaw = raw.safety_audit ?? raw.safetyAudit;
  const safety_audit =
    safetyAuditRaw &&
    typeof safetyAuditRaw === "object" &&
    !Array.isArray(safetyAuditRaw)
      ? {
          formula_style: pickAuditString(
            (safetyAuditRaw as Record<string, unknown>).formula_style
          ),
          safety_verdict: pickAuditString(
            (safetyAuditRaw as Record<string, unknown>).safety_verdict
          ),
          unfiltered_risks: pickAuditString(
            (safetyAuditRaw as Record<string, unknown>).unfiltered_risks
          ),
        }
      : {
          formula_style: "",
          safety_verdict: "",
          unfiltered_risks: "",
        };

  if (!(summary.overallEvaluation ?? "").trim()) {
    const topNames = ingredients.slice(0, 5).map((i) => i.name).filter(Boolean);
    summary.overallEvaluation =
      topNames.length > 0
        ? `Formulation map: ${topNames.join(", ")}. See ingredient tags below.`
        : "Unable to generate evaluation from this image. Please try again.";
  }
  if (summary.pros.length === 0) summary.pros = ["Structured ingredient breakdown available"];
  if (summary.cons.length === 0) summary.cons = ["None noted in this pass"];

  if (suitability.best_for.length === 0) {
    suitability.best_for =
      category === "skincare"
        ? ["Daily skincare"]
        : category === "supplement"
          ? ["Label-directed use"]
          : category === "haircare"
            ? ["Hair care"]
            : ["General use"];
  }
  if (suitability.avoid_groups.length === 0) suitability.avoid_groups = ["None specified"];

  return {
    category,
    coreTags,
    summary,
    chartData,
    ingredients,
    dynamic_details,
    safety_audit,
    synergy,
    conflicts,
    suitability,
    tips,
  };
}

export type ExtractIngredient = {
  name: string;
  feature_tag: string;
  is_major: boolean;
};

export type ExtractIngredientsResult = {
  category: Category;
  ingredients: ExtractIngredient[];
};

export type IngredientDetailsItem = {
  name: string;
  description: string;
  safetyScore?: number;
};

export type ProductSlimResult = Omit<AnalysisResult, "ingredients">;

function normalizeExtractIngredients(raw: Record<string, unknown>): ExtractIngredientsResult {
  const categoryVal =
    typeof raw.category === "string"
      ? raw.category.toLowerCase().trim().replace(/\s+/g, "")
      : "";
  let category: Category = "unknown";
  if (categoryVal === "skincare" || categoryVal === "supplement") {
    category = categoryVal;
  } else if (categoryVal === "haircare" || categoryVal === "hairproduct") {
    category = "haircare";
  }

  const ingredientsRaw = Array.isArray(raw.ingredients)
    ? (raw.ingredients as Array<Record<string, unknown>>)
    : [];

  const ingredients: ExtractIngredient[] = ingredientsRaw
    .map((ing) => {
      const name = String(ing.name ?? ing.ingredientName ?? "").trim();
      const rawTag = String(
        ing.feature_tag ?? ing.featureTag ?? ing.tag ?? ""
      );
      const feature_tag = coerceFeatureTag(rawTag, category);
      const is_major =
        typeof ing.is_major === "boolean"
          ? ing.is_major
          : typeof ing.isMajor === "boolean"
            ? ing.isMajor
            : false;
      return {
        name,
        feature_tag,
        is_major,
      };
    })
    .filter((x) => x.name.length > 0);

  return { category, ingredients };
}

function normalizeProductSlimToAnalysisResult(
  raw: Record<string, unknown>,
  evidenceIngredients: ExtractIngredient[]
): ProductSlimResult {
  const categoryVal =
    typeof raw.category === "string"
      ? raw.category.toLowerCase().trim().replace(/\s+/g, "")
      : "";

  let category: AnalysisResult["category"] = "unknown";
  if (categoryVal === "skincare" || categoryVal === "supplement") {
    category = categoryVal;
  } else if (categoryVal === "haircare" || categoryVal === "hairproduct") {
    category = "haircare";
  }

  const summaryRaw = raw.summary;
  let summary: AnalysisResult["summary"];
  if (summaryRaw && typeof summaryRaw === "object" && !Array.isArray(summaryRaw)) {
    const s = summaryRaw as Record<string, unknown>;
    const legacyEval = String(s.overallEvaluation ?? "").trim();
    const realTalk = coerceTheRealTalk(s.the_real_talk);
    const overallEvaluation =
      legacyEval.length > 0 ? legacyEval : realTalk;
    summary = {
      overallEvaluation,
      pros: Array.isArray(s.pros)
        ? s.pros.map((p) => String(p).trim())
        : Array.isArray(s.the_wins)
          ? s.the_wins.map((w) => String(w).trim())
          : [],
      cons: Array.isArray(s.cons)
        ? s.cons.map((c) => String(c).trim())
        : Array.isArray(s.the_red_flags)
          ? s.the_red_flags.map((r) => String(r).trim())
          : [],
    };
  } else {
    const fallback = String(summaryRaw ?? "");
    summary = { overallEvaluation: fallback, pros: [], cons: [] };
  }

  const coreTagsRaw =
    raw.coreTags ??
    raw.core_tags ??
    raw.mainEffects ??
    raw.main_functions ??
    [];
  const coreTags = normalizeCoreTagItems(coreTagsRaw, category);

  const dynamic_details = normalizeDynamicDetails(
    raw.dynamic_details ?? raw.dynamicDetails,
    category
  );

  const synergySource =
    Array.isArray(raw.synergy) && raw.synergy.length > 0
      ? raw.synergy
      : raw.synergy_squad;
  const synergy = normalizeSynergy(synergySource);

  const conflictsSource =
    Array.isArray(raw.conflicts) && raw.conflicts.length > 0
      ? raw.conflicts
      : raw.conflicts_alert;
  const conflicts = normalizeConflicts(conflictsSource);

  const chartData = buildChartData(
    evidenceIngredients.map((i) => ({ feature_tag: i.feature_tag, is_major: i.is_major })),
    category
  );

  const pickAuditString = (v: unknown): string => (v == null ? "" : String(v).trim());
  const safetyAuditRaw = raw.safety_audit ?? raw.safetyAudit;
  const safety_audit =
    safetyAuditRaw && typeof safetyAuditRaw === "object" && !Array.isArray(safetyAuditRaw)
      ? {
          formula_style: pickAuditString((safetyAuditRaw as Record<string, unknown>).formula_style),
          safety_verdict: pickAuditString((safetyAuditRaw as Record<string, unknown>).safety_verdict),
          unfiltered_risks: pickAuditString((safetyAuditRaw as Record<string, unknown>).unfiltered_risks),
        }
      : {
          formula_style: "",
          safety_verdict: "",
          unfiltered_risks: "",
        };

  const tacticsObj =
    raw.usage_tactics && typeof raw.usage_tactics === "object" && !Array.isArray(raw.usage_tactics)
      ? (raw.usage_tactics as Record<string, unknown>)
      : null;

  const suitability = (() => {
    if (tacticsObj) {
      const mergedSuit = { ...tacticsObj };
      return {
        best_for: Array.isArray(mergedSuit.best_for)
          ? mergedSuit.best_for.map(String)
          : Array.isArray(mergedSuit.best_match)
            ? mergedSuit.best_match.map(String)
            : [],
        skin_types: normalizeSkinTypes(
          Array.isArray(mergedSuit.skin_types)
            ? mergedSuit.skin_types
            : []
        ),
        avoid_groups: Array.isArray(mergedSuit.avoid_groups)
          ? mergedSuit.avoid_groups.map(String)
          : [],
      };
    }

    return {
      best_for: [],
      skin_types: normalizeSkinTypes(
        Array.isArray(raw.suitableSkinTypes) ? raw.suitableSkinTypes : []
      ),
      avoid_groups: [],
    };
  })();

  const tips = Array.isArray(raw.tips)
    ? raw.tips.map(String)
    : Array.isArray(raw.expert_advice)
      ? raw.expert_advice.map(String)
      : [];

  if (!(summary.overallEvaluation ?? "").trim()) {
    const topNames = evidenceIngredients.slice(0, 5).map((i) => i.name).filter(Boolean);
    summary.overallEvaluation =
      topNames.length > 0
        ? `Formulation map: ${topNames.join(", ")}. See ingredient tags below.`
        : "Unable to generate evaluation from this image. Please try again.";
  }
  if (summary.pros.length === 0) summary.pros = ["Structured ingredient breakdown available"];
  if (summary.cons.length === 0) summary.cons = ["None noted in this pass"];

  if (suitability.best_for.length === 0) {
    suitability.best_for =
      category === "skincare"
        ? ["Daily skincare"]
        : category === "supplement"
          ? ["Label-directed use"]
          : category === "haircare"
            ? ["Hair care"]
            : ["General use"];
  }
  if (suitability.avoid_groups.length === 0) suitability.avoid_groups = ["None specified"];

  return {
    category,
    coreTags,
    summary,
    chartData,
    dynamic_details,
    safety_audit,
    synergy,
    conflicts,
    suitability,
    tips,
  };
}

function pickThinkingConfig(useThinking: boolean) {
  return {
    thinkingBudget: useThinking ? 1400 : 0,
    includeThoughts: useThinking,
  };
}

export type ThinkingHint = "supplement" | "essence" | "cream" | "special";
type CategoryHintInput = "skincare" | "supplement" | "haircare" | "hairproduct";
type NormalizedCategoryHint = "skincare" | "supplement" | "haircare";

const ENABLE_THINKING =
  process.env.GEMINI_ENABLE_THINKING === "true" ||
  process.env.GEMINI_ENABLE_THINKING === "1";

function normalizeCategoryHint(
  categoryHint?: CategoryHintInput
): NormalizedCategoryHint | undefined {
  if (categoryHint === "hairproduct") return "haircare";
  if (
    categoryHint === "skincare" ||
    categoryHint === "supplement" ||
    categoryHint === "haircare"
  ) {
    return categoryHint;
  }
  return undefined;
}

function shouldEnableThinking(
  categoryHint?: CategoryHintInput,
  thinkingHint?: ThinkingHint
): boolean {
  if (!ENABLE_THINKING) return false;
  const normalizedCategory = normalizeCategoryHint(categoryHint);
  if (normalizedCategory === "haircare") return false;
  return (
    thinkingHint === "essence" ||
    thinkingHint === "cream" ||
    thinkingHint === "supplement"
  );
}

export async function analyzeCosmeticImage(
  base64Image: string,
  mimeType: string = "image/jpeg",
  categoryHint?: CategoryHintInput,
  thinkingHint?: ThinkingHint,
  ingredientText?: string
): Promise<AnalysisResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("请在 .env 中配置 GEMINI_API_KEY 或 GOOGLE_API_KEY");
  }

  const normalizedCategoryHint = normalizeCategoryHint(categoryHint);
  const useThinking = shouldEnableThinking(categoryHint, thinkingHint);

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const cache = await getOrCreateCache(ai, "analysis");
  const fullPrompt = getAnalysisPrompt(normalizedCategoryHint);
  const suffix = getPromptSuffix(ANALYSIS_SYSTEM_INSTRUCTION_BASE, fullPrompt);
  const normalizedIngredientText =
    typeof ingredientText === "string" ? ingredientText.trim() : "";
  const hasIngredientText = normalizedIngredientText.length >= 12;
  // cached system instruction already contains the heavy ~2500 tokens.
  // Per request, only send the category-specific prompt suffix.
  const userText =
    (suffix || "Analyze the provided product image and output strict JSON.") +
    (hasIngredientText
      ? "\n\nINPUT_INGREDIENT_TEXT=" + JSON.stringify(normalizedIngredientText)
      : "");

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
      { text: userText },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: getAnalysisResponseSchema(normalizedCategoryHint),
      thinkingConfig: {
        thinkingBudget: useThinking ? 1400: 0,
        includeThoughts: useThinking,
      },
      cachedContent: cache.name,
    },
  });

  const meta = response.usageMetadata;
  const plain =
    meta && typeof meta === "object"
      ? Object.fromEntries(
          Object.entries(meta as Record<string, unknown>)
        )
      : meta;
  console.log(
    `\n[Thinking: ${useThinking ? "ON" : "OFF"} | categoryHint: ${categoryHint ?? "无"} | thinkingHint: ${thinkingHint ?? "无"} | ocrText: ${hasIngredientText ? "YES" : "NO"}] Gemini usageMetadata:`,
    JSON.stringify(plain ?? {}, null, 2)
  );

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 未返回有效内容");
  }

  return extractJson(text);
}

export async function analyzeCosmeticText(
  ingredientText: string,
  categoryHint?: CategoryHintInput,
  thinkingHint?: ThinkingHint
): Promise<AnalysisResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("请在 .env 中配置 GEMINI_API_KEY 或 GOOGLE_API_KEY");
  }

  const trimmed = ingredientText.trim();
  if (trimmed.length < 12) {
    throw new Error("OCR_TEXT_TOO_SHORT");
  }

  const normalizedCategoryHint = normalizeCategoryHint(categoryHint);
  const useThinking = shouldEnableThinking(categoryHint, thinkingHint);
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = getAnalysisPrompt(normalizedCategoryHint);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        text:
          prompt +
          "\n\nINPUT_INGREDIENT_TEXT=" +
          JSON.stringify(trimmed),
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: getAnalysisResponseSchema(normalizedCategoryHint),
      thinkingConfig: {
        thinkingBudget: useThinking ? 1400 : 0,
        includeThoughts: useThinking,
      },
    },
  });

  const meta = response.usageMetadata;
  const plain =
    meta && typeof meta === "object"
      ? Object.fromEntries(
          Object.entries(meta as Record<string, unknown>)
        )
      : meta;
  console.log(
    `\n[AnalyzeText: thinking=${useThinking ? "ON" : "OFF"} | categoryHint: ${
      categoryHint ?? "无"
    } | thinkingHint: ${thinkingHint ?? "无"}] Gemini usageMetadata:`,
    JSON.stringify(plain ?? {}, null, 2)
  );

  const text = response.text;
  if (!text) {
    throw new Error("Gemini 未返回有效内容");
  }

  return extractJson(text);
}
