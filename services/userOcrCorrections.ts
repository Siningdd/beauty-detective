import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  applyOcrCorrectionMapToText,
  type OcrCorrectionMap,
} from "../utils/ocrCorrectionApply";

export const USER_CORRECTION_MAP_KEY = "user_correction_map";
const USER_CORRECTION_EVENTS_KEY = "user_correction_events";
const MAX_EVENTS = 200;

export type CorrectionTrackAction = "edit" | "add" | "delete";

export type CorrectionTrackPayload = {
  before: string[];
  after: string[];
  action: CorrectionTrackAction;
};

export async function loadUserCorrectionMap(): Promise<OcrCorrectionMap> {
  try {
    const raw = await AsyncStorage.getItem(USER_CORRECTION_MAP_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const out: OcrCorrectionMap = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      const ks = String(k).trim();
      const vs = String(v ?? "").trim();
      if (ks && vs) out[ks] = vs;
    }
    return out;
  } catch {
    return {};
  }
}

export async function mergeCorrectionEntry(
  oldTerm: string,
  newTerm: string
): Promise<void> {
  const o = oldTerm.trim();
  const n = newTerm.trim();
  if (!o || !n || o === n) return;
  const map = await loadUserCorrectionMap();
  map[o] = n;
  await AsyncStorage.setItem(USER_CORRECTION_MAP_KEY, JSON.stringify(map));
}

export async function appendCorrectionEvent(
  payload: CorrectionTrackPayload
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(USER_CORRECTION_EVENTS_KEY);
    let list: CorrectionTrackPayload[] = [];
    if (raw) {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) list = p as CorrectionTrackPayload[];
    }
    list.push({
      before: [...payload.before],
      after: [...payload.after],
      action: payload.action,
    });
    if (list.length > MAX_EVENTS) {
      list = list.slice(list.length - MAX_EVENTS);
    }
    await AsyncStorage.setItem(USER_CORRECTION_EVENTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function applyStoredCorrectionsToText(
  text: string,
  map: OcrCorrectionMap
): string {
  return applyOcrCorrectionMapToText(text, map);
}
