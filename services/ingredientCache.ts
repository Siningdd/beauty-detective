import AsyncStorage from "@react-native-async-storage/async-storage";
import type { IngredientDetailsItem } from "../types/analysis";
import { canonicalizeIngredientKey, lookupIngredient } from "../constants/ingredientDict";

const CACHE_PREFIX = "ingredient_details:v1:";

const storage = AsyncStorage as { multiGet?: (keys: string[]) => Promise<[string, string | null][]>; multiSet?: (entries: [string, string][]) => Promise<void>; getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };

async function multiGetCompat(keys: string[]): Promise<[string, string | null][]> {
  if (typeof storage.multiGet === "function") {
    return storage.multiGet(keys);
  }
  const values = await Promise.all(keys.map((k) => storage.getItem(k)));
  return keys.map((k, i) => [k, values[i] ?? null]);
}

async function multiSetCompat(entries: [string, string][]): Promise<void> {
  if (typeof storage.multiSet === "function") {
    return storage.multiSet(entries);
  }
  await Promise.all(entries.map(([k, v]) => storage.setItem(k, v)));
}

export function normalizeIngredientNameForCache(name: string): string {
  return canonicalizeIngredientKey(name);
}

function cacheKeyFor(name: string): string {
  return CACHE_PREFIX + normalizeIngredientNameForCache(name);
}

export async function getIngredientDetailsFromCache(
  names: string[]
): Promise<Record<string, IngredientDetailsItem | undefined>> {
  const uniq = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (uniq.length === 0) return {};

  const keys = uniq.map(cacheKeyFor);
  const pairs = await multiGetCompat(keys);

  const out: Record<string, IngredientDetailsItem | undefined> = {};
  for (let i = 0; i < uniq.length; i++) {
    const originalName = uniq[i];
    const raw = pairs[i]?.[1];
    if (!raw) continue;
    try {
      out[originalName] = JSON.parse(raw) as IngredientDetailsItem;
    } catch {
      // ignore invalid cache
    }
  }

  return out;
}

export async function setIngredientDetailsToCache(
  items: IngredientDetailsItem[]
): Promise<void> {
  if (items.length === 0) return;

  const entries = items.map((it) => [
    cacheKeyFor(it.name),
    JSON.stringify(it),
  ]) as Array<[string, string]>;

  await multiSetCompat(entries);
}

export function getIngredientDictFallback(name: string): {
  description?: string;
  safetyScore?: number;
} | null {
  const entry = lookupIngredient(name);
  if (!entry) return null;
  return { description: entry.description, safetyScore: entry.safetyScore };
}

