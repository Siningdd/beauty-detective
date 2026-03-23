/**
 * Common skincare & supplement ingredient fallback dictionary.
 * Used when AI returns empty description for safetyScore + default label.
 */

export type IngredientEntry = {
  safetyScore: number;
  description: string;
};

const ENTRIES: [string[], IngredientEntry][] = [
  [["water", "aqua", "eau", "wasser"], { safetyScore: 100, description: "Solvent, formula base" }],
  [["glycerin", "glycerine"], { safetyScore: 95, description: "Humectant" }],
  [["butylene glycol", "butylenglykol"], { safetyScore: 90, description: "Humectant solvent" }],
  [["propylene glycol", "propylenglykol"], { safetyScore: 90, description: "Humectant solvent" }],
  [["phenoxyethanol"], { safetyScore: 85, description: "Preservative" }],
  [["xanthan gum", "xanthan"], { safetyScore: 95, description: "Thickener" }],
  [["carbomer", "carbopol"], { safetyScore: 90, description: "Thickener" }],
  [["magnesium stearate", "magnesiumstearat"], { safetyScore: 85, description: "Lubricant / anti-caking" }],
  [["dimethicone", "dimethikon"], { safetyScore: 90, description: "Silicone, smooth feel" }],
  [["cyclomethicone", "cyclomethikon"], { safetyScore: 90, description: "Volatile silicone" }],
  [["tocopherol", "vitamin e"], { safetyScore: 95, description: "Antioxidant" }],
  [["citric acid", "zitronensäure", "zitronensaeure"], { safetyScore: 95, description: "pH adjuster, chelator" }],
  [["sodium citrate", "natriumcitrat"], { safetyScore: 95, description: "pH buffer" }],
  [["sodium hyaluronate", "hyaluronic acid", "natriumhyaluronat"], { safetyScore: 100, description: "Humectant" }],
  [["cetearyl alcohol", "cetearylalkohol"], { safetyScore: 85, description: "Emulsifier, thickener" }],
  [["cetyl alcohol", "cetylalkohol"], { safetyScore: 85, description: "Emulsifier" }],
  [["stearyl alcohol", "stearylalkohol"], { safetyScore: 85, description: "Emulsifier" }],
  [["sorbitol"], { safetyScore: 95, description: "Humectant" }],
  [["pentylene glycol", "pentylenglykol"], { safetyScore: 90, description: "Humectant solvent" }],
  [["caprylyl glycol", "caprylylglycol"], { safetyScore: 90, description: "Humectant, preservative booster" }],
  [["ethylhexylglycerin"], { safetyScore: 90, description: "Humectant, preservative booster" }],
  [["sodium benzoate", "natriumbenzoat"], { safetyScore: 85, description: "Preservative" }],
  [["potassium sorbate", "kaliumsorbat"], { safetyScore: 85, description: "Preservative" }],
  [["sodium lactate", "natriumlactat"], { safetyScore: 95, description: "Humectant" }],
  [["silicone", "polysiloxane", "silikon"], { safetyScore: 90, description: "Skin feel modifier" }],
  [["triethanolamine", "tea", "triethanolamin"], { safetyScore: 75, description: "pH adjuster" }],
  [["sodium hydroxide", "natriumhydroxid"], { safetyScore: 70, description: "pH adjuster" }],
  [["potassium hydroxide", "kaliumhydroxid"], { safetyScore: 70, description: "pH adjuster" }],
  [["disodium edta", "dinatriumedta"], { safetyScore: 90, description: "Chelator" }],
  [["tetrasodium edta", "tetranatriumedta"], { safetyScore: 90, description: "Chelator" }],
  [["methylparaben", "methylparaben"], { safetyScore: 85, description: "Preservative" }],
  [["ethylparaben"], { safetyScore: 85, description: "Preservative" }],
  [["propylparaben"], { safetyScore: 85, description: "Preservative" }],
  [["butylparaben"], { safetyScore: 80, description: "Preservative" }],
  [["hydroxyethylcellulose", "hydroxyethylcellulose"], { safetyScore: 95, description: "Thickener" }],
  [["cellulose gum", "sodium carboxymethylcellulose", "natriumcarboxymethylcellulose"], { safetyScore: 95, description: "Thickener" }],
  [["peg-40 hydrogenated castor oil", "peg-40 ricinusöl", "peg-40 ricinusoel"], { safetyScore: 85, description: "Emulsifier" }],
  [["polysorbate 80", "polysorbat 80"], { safetyScore: 85, description: "Emulsifier" }],
  [["polysorbate 20", "polysorbat 20"], { safetyScore: 85, description: "Emulsifier" }],
  [["sorbitan oleate", "sorbitanoleat"], { safetyScore: 85, description: "Emulsifier" }],
  [["glyceryl stearate", "glycerylstearat"], { safetyScore: 90, description: "Emulsifier" }],
  [["stearic acid", "stearinsäure", "stearinsaeure"], { safetyScore: 85, description: "Emulsifier, thickener" }],
  [["palmitic acid", "palmitinsäure", "palmitinsaeure"], { safetyScore: 85, description: "Thickener" }],
  [["ascorbyl palmitate", "ascorbylpalmitat"], { safetyScore: 90, description: "Antioxidant" }],
  [["bht", "butylated hydroxytoluene"], { safetyScore: 75, description: "Antioxidant" }],
  [["bha", "butylated hydroxyanisole"], { safetyScore: 70, description: "Antioxidant" }],
  [["titanium dioxide", "titandioxid"], { safetyScore: 95, description: "Physical sunscreen / pigment" }],
  [["zinc oxide", "zinkoxid"], { safetyScore: 95, description: "Physical sunscreen / astringent" }],
  [["mica"], { safetyScore: 95, description: "Pearlizer" }],
  [["iron oxides", "eisenoxide"], { safetyScore: 95, description: "Pigment" }],
  [["silica", "siliziumdioxid"], { safetyScore: 95, description: "Oil absorbent, skin feel modifier" }],
  [["microcrystalline cellulose", "mikrokristalline cellulose"], { safetyScore: 95, description: "Thickener / anti-caking" }],
  [["starch", "corn starch", "tapioca starch", "stärke", "staerke", "maisstärke"], { safetyScore: 100, description: "Oil absorbent / thickener" }],
  [["gelatin", "gelatine"], { safetyScore: 95, description: "Thickener" }],
];

// 构建扁平 lookup：每个别名 -> entry
const DICT: Record<string, IngredientEntry> = {};
const CANONICAL_KEY_BY_ALIAS: Record<string, string> = {};
for (const [aliases, entry] of ENTRIES) {
  for (const a of aliases) {
    DICT[a] = entry;
    // Use the first alias as the canonical cache key.
    CANONICAL_KEY_BY_ALIAS[a] = aliases[0];
  }
}

/** 精确匹配 + 包含匹配（避免误匹配：key 需为完整词） */
export function lookupIngredient(name: string): IngredientEntry | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;

  // 1. 精确匹配
  if (DICT[n]) return DICT[n];

  // 2. 包含匹配：仅当 name 以完整 key 开头或相等，或 name 包含 ", key" 等
  for (const key of Object.keys(DICT)) {
    if (key.length < 4) continue;
    if (n === key || n.startsWith(key + " ") || n.endsWith(" " + key) || n.includes(", " + key)) {
      return DICT[key];
    }
  }
  return undefined;
}

/**
 * Canonicalize ingredient name to improve cache hit rate.
 * - Prefer mapping to known aliases.
 * - Fallback: normalize the input (trim/lower/condense spaces).
 */
export function canonicalizeIngredientKey(name: string): string {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return "";

  const direct = CANONICAL_KEY_BY_ALIAS[n];
  if (direct) return direct;

  // Same matching strategy as `lookupIngredient`, but returning the canonical key.
  for (const key of Object.keys(CANONICAL_KEY_BY_ALIAS)) {
    if (key.length < 4) continue;
    if (
      n === key ||
      n.startsWith(key + " ") ||
      n.endsWith(" " + key) ||
      n.includes(", " + key)
    ) {
      return CANONICAL_KEY_BY_ALIAS[key];
    }
  }

  return n;
}
