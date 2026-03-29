import AsyncStorage from "@react-native-async-storage/async-storage";
import type { IntentProductCategory } from "../constants/intentQuestions";

const CHIP_OPEN_KEY = "intent_chip_open_count";
const QUESTION_SELECT_KEY = "intent_question_select_count";
const FAV_CHIP_KEY = "intent_fav_chip_by_category";

type CounterMap = Record<string, number>;
type CategoryCounterMap = Record<IntentProductCategory, CounterMap>;
type QuestionCounterMap = Record<
  IntentProductCategory,
  Record<string, CounterMap>
>;
type FavChipMap = Partial<Record<IntentProductCategory, string>>;

const EMPTY_CATEGORY_COUNTER: CategoryCounterMap = {
  skincare: {},
  haircare: {},
  supplement: {},
};

const EMPTY_QUESTION_COUNTER: QuestionCounterMap = {
  skincare: {},
  haircare: {},
  supplement: {},
};

function toSafeKey(input: string): string {
  return input.trim();
}

function toNumberMap(value: unknown): CounterMap {
  if (!value || typeof value !== "object") return {};
  const out: CounterMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = toSafeKey(k);
    if (!key) continue;
    const count = Number(v);
    if (!Number.isFinite(count) || count <= 0) continue;
    out[key] = Math.floor(count);
  }
  return out;
}

function parseCategoryCounter(value: unknown): CategoryCounterMap {
  if (!value || typeof value !== "object") return { ...EMPTY_CATEGORY_COUNTER };
  const src = value as Record<string, unknown>;
  return {
    skincare: toNumberMap(src.skincare),
    haircare: toNumberMap(src.haircare),
    supplement: toNumberMap(src.supplement),
  };
}

function parseQuestionCounter(value: unknown): QuestionCounterMap {
  if (!value || typeof value !== "object") return { ...EMPTY_QUESTION_COUNTER };
  const src = value as Record<string, unknown>;
  const parseByCategory = (categoryValue: unknown): Record<string, CounterMap> => {
    if (!categoryValue || typeof categoryValue !== "object") return {};
    const out: Record<string, CounterMap> = {};
    for (const [chipId, questionMap] of Object.entries(
      categoryValue as Record<string, unknown>
    )) {
      const key = toSafeKey(chipId);
      if (!key) continue;
      out[key] = toNumberMap(questionMap);
    }
    return out;
  };
  return {
    skincare: parseByCategory(src.skincare),
    haircare: parseByCategory(src.haircare),
    supplement: parseByCategory(src.supplement),
  };
}

function parseFavMap(value: unknown): FavChipMap {
  if (!value || typeof value !== "object") return {};
  const src = value as Record<string, unknown>;
  const out: FavChipMap = {};
  for (const category of ["skincare", "haircare", "supplement"] as const) {
    const chipId = src[category];
    if (typeof chipId !== "string") continue;
    const key = toSafeKey(chipId);
    if (!key) continue;
    out[category] = key;
  }
  return out;
}

async function readJSON<T>(
  key: string,
  fallback: T,
  parser: (value: unknown) => T
): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return parser(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getCategoryOpenCountMap(
  category: IntentProductCategory
): Promise<CounterMap> {
  const map = await readJSON(
    CHIP_OPEN_KEY,
    { ...EMPTY_CATEGORY_COUNTER },
    parseCategoryCounter
  );
  return map[category] ?? {};
}

export async function getFavChipForCategory(
  category: IntentProductCategory
): Promise<string | null> {
  const favMap = await readJSON(FAV_CHIP_KEY, {}, parseFavMap);
  return favMap[category] ?? null;
}

export async function upsertFavChipByOpenCount(
  category: IntentProductCategory,
  chipId: string
): Promise<string | null> {
  const normalizedChip = toSafeKey(chipId);
  if (!normalizedChip) return null;
  const [openMap, favMap] = await Promise.all([
    readJSON(CHIP_OPEN_KEY, { ...EMPTY_CATEGORY_COUNTER }, parseCategoryCounter),
    readJSON(FAV_CHIP_KEY, {}, parseFavMap),
  ]);
  const categoryMap = openMap[category] ?? {};
  const currentFav = favMap[category] ?? null;
  const currentFavCount = currentFav ? categoryMap[currentFav] ?? 0 : 0;
  const incomingCount = categoryMap[normalizedChip] ?? 0;
  if (!currentFav || incomingCount >= currentFavCount) {
    favMap[category] = normalizedChip;
    await writeJSON(FAV_CHIP_KEY, favMap);
    return normalizedChip;
  }
  return currentFav;
}

export async function trackCategoryOpen(
  category: IntentProductCategory,
  chipId: string
): Promise<{ count: number; favChipId: string | null }> {
  const normalizedChip = toSafeKey(chipId);
  if (!normalizedChip) return { count: 0, favChipId: null };
  const openMap = await readJSON(
    CHIP_OPEN_KEY,
    { ...EMPTY_CATEGORY_COUNTER },
    parseCategoryCounter
  );
  const categoryMap = { ...(openMap[category] ?? {}) };
  const nextCount = (categoryMap[normalizedChip] ?? 0) + 1;
  categoryMap[normalizedChip] = nextCount;
  openMap[category] = categoryMap;
  await writeJSON(CHIP_OPEN_KEY, openMap);
  const favChipId = await upsertFavChipByOpenCount(category, normalizedChip);
  return { count: nextCount, favChipId };
}

export async function trackQuestionSelect(
  category: IntentProductCategory,
  chipId: string,
  question: string
): Promise<number> {
  const normalizedChip = toSafeKey(chipId);
  const normalizedQuestion = toSafeKey(question);
  if (!normalizedChip || !normalizedQuestion) return 0;
  const questionMap = await readJSON(
    QUESTION_SELECT_KEY,
    { ...EMPTY_QUESTION_COUNTER },
    parseQuestionCounter
  );
  const categoryMap = { ...(questionMap[category] ?? {}) };
  const chipMap = { ...(categoryMap[normalizedChip] ?? {}) };
  const nextCount = (chipMap[normalizedQuestion] ?? 0) + 1;
  chipMap[normalizedQuestion] = nextCount;
  categoryMap[normalizedChip] = chipMap;
  questionMap[category] = categoryMap;
  await writeJSON(QUESTION_SELECT_KEY, questionMap);
  return nextCount;
}
