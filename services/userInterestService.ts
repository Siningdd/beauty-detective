import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "user_interest_map";

export type InterestInteractionType = "view" | "ask";

export type IngredientInterestEntry = {
  view_count: number;
  deep_dive_count: number;
  last_seen: string;
};

export type UserInterestMap = Record<string, IngredientInterestEntry>;

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeName(name: string): string {
  return name.trim();
}

export async function loadUserInterestMap(): Promise<UserInterestMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const out: UserInterestMap = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      const key = normalizeName(k);
      if (!key) continue;
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const view_count = Number(o.view_count) || 0;
      const deep_dive_count = Number(o.deep_dive_count) || 0;
      const last_seen =
        typeof o.last_seen === "string" ? o.last_seen : todayISO();
      out[key] = { view_count, deep_dive_count, last_seen };
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveUserInterestMap(map: UserInterestMap): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export async function logInteraction(
  name: string,
  type: InterestInteractionType
): Promise<void> {
  const key = normalizeName(name);
  if (!key) return;
  const map = await loadUserInterestMap();
  const prev = map[key] ?? {
    view_count: 0,
    deep_dive_count: 0,
    last_seen: todayISO(),
  };
  const next: IngredientInterestEntry = {
    view_count: prev.view_count + (type === "view" ? 1 : 0),
    deep_dive_count: prev.deep_dive_count + (type === "ask" ? 1 : 0),
    last_seen: todayISO(),
  };
  map[key] = next;
  await saveUserInterestMap(map);
}

export async function getInterestForIngredient(
  name: string
): Promise<IngredientInterestEntry | null> {
  const map = await loadUserInterestMap();
  return map[normalizeName(name)] ?? null;
}

export function shouldShowFrequentBadge(
  entry: IngredientInterestEntry | null
): boolean {
  return !!entry && entry.view_count > 3;
}

export function shouldDefaultExpand(
  entry: IngredientInterestEntry | null
): boolean {
  return !!entry && entry.deep_dive_count >= 2;
}

export function shouldUseCuriousPlaceholder(
  entry: IngredientInterestEntry | null
): boolean {
  return shouldShowFrequentBadge(entry);
}
