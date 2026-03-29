import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY = "ingredient_deep_dive_cache_v1";
const MAX_ENTRIES = 120;

type CacheShape = Record<string, { markdown: string; savedAt: number }>;

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function cacheKey(analysisSourceKey: string, ingredientName: string): string {
  return `${analysisSourceKey}::${norm(ingredientName)}`;
}

async function loadAll(): Promise<CacheShape> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" ? (p as CacheShape) : {};
  } catch {
    return {};
  }
}

async function saveAll(map: CacheShape): Promise<void> {
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES) {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(map));
    return;
  }
  const sorted = keys.sort((a, b) => map[b].savedAt - map[a].savedAt);
  const trimmed: CacheShape = {};
  for (let i = 0; i < MAX_ENTRIES; i++) {
    const k = sorted[i];
    trimmed[k] = map[k];
  }
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
}

export async function getCachedDeepDive(
  analysisSourceKey: string,
  ingredientName: string
): Promise<string | null> {
  const all = await loadAll();
  const hit = all[cacheKey(analysisSourceKey, ingredientName)];
  return hit?.markdown?.trim() ? hit.markdown : null;
}

export async function setCachedDeepDive(
  analysisSourceKey: string,
  ingredientName: string,
  markdown: string
): Promise<void> {
  const text = markdown.trim();
  if (!text) return;
  const all = await loadAll();
  all[cacheKey(analysisSourceKey, ingredientName)] = {
    markdown: text,
    savedAt: Date.now(),
  };
  await saveAll(all);
}
