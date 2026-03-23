import { View, Text, StyleSheet } from "react-native";
import type { GreasinessLevel } from "../types/analysis";
import { TEXT_SECONDARY, THEME_BORDER } from "../constants/theme";

/**
 * Tailwind palette equivalents (for web / className):
 * - Inactive: `bg-zinc-200` (#e4e4e7)
 * - Active dot 1–5: `bg-violet-200` … `bg-violet-600`
 *
 * @example From analysis JSON
 * ```tsx
 * const greasiness = analysisResult.dynamic_details.greasiness;
 * <GreasinessGauge value={greasiness} />
 * ```
 *
 * @example Web + Tailwind (same mapping; import `activeDotCount` from this module or duplicate the switch)
 * ```tsx
 * const n = activeDotCount(value);
 * const inactive = 'bg-zinc-200';
 * const active = ['bg-violet-200','bg-violet-300','bg-violet-400','bg-violet-500','bg-violet-600'];
 * <div className="flex w-full flex-col">
 *   <div className="flex justify-between px-0.5">
 *     {active.map((cls, i) => (
 *       <div key={i} className={`h-3 w-3 shrink-0 rounded-full ${i < n ? cls : inactive}`} />
 *     ))}
 *   </div>
 *   <div className="mt-2 flex w-full text-xs text-slate-600">
 *     {['Light','','','','Rich'].map((t, i) => (
 *       <div key={i} className="flex-1 text-center">{t}</div>
 *     ))}
 *   </div>
 * </div>
 * ```
 */
const INACTIVE = "#e4e4e7"; // bg-zinc-200
/** Active fill: darker left→right per dot index (matches Tailwind violet-200 … violet-600). */
const ACTIVE_BY_INDEX = [
  "#ddd6fe", // violet-200
  "#c4b5fd", // violet-300
  "#a78bfa", // violet-400
  "#8b5cf6", // violet-500
  "#7c3aed", // violet-600
] as const;

/** How many dots (1–5) are filled for a level; `0` when `null` or unknown. */
export function activeDotCount(value: GreasinessLevel): number {
  if (value == null) return 0;
  switch (value) {
    case "light":
      return 1;
    case "fresh":
      return 2;
    case "silky":
      return 3;
    case "creamy":
      return 4;
    case "rich":
      return 5;
    default:
      return 0;
  }
}

export type GreasinessGaugeProps = {
  value: GreasinessLevel;
};

export function GreasinessGauge({ value }: GreasinessGaugeProps) {
  const n = activeDotCount(value);
  const fillColor =
    n > 0 ? ACTIVE_BY_INDEX[Math.min(n - 1, ACTIVE_BY_INDEX.length - 1)] : INACTIVE;

  return (
    <View style={styles.container}>
      <View style={styles.trackArea}>
        <View style={styles.trackBg}>
          <View
            style={[
              styles.trackFill,
              { width: `${(n / 5) * 100}%`, backgroundColor: fillColor },
            ]}
          />
        </View>
        <View style={styles.dotsOverlay} pointerEvents="none">
          {ACTIVE_BY_INDEX.map((color, i) => {
            const isActive = i < n;
            return (
              <View key={i} style={styles.column}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: isActive ? color : INACTIVE },
                    isActive && styles.dotActive,
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.labelRow}>
        {ACTIVE_BY_INDEX.map((_, i) => (
          <View
            key={i}
            style={[
              styles.labelColumn,
              i === 0 && styles.labelColumnLeading,
              i === 4 && styles.labelColumnTrailing,
            ]}
          >
            {i === 0 ? (
              <Text style={[styles.labelEnd, styles.labelLight]}>Light</Text>
            ) : i === 4 ? (
              <Text style={[styles.labelEnd, styles.labelRich]}>Rich</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const DOT_SIZE = 12;
const TRACK_H = 10;
const TRACK_AREA_H = 22;

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
  },
  trackArea: {
    height: TRACK_AREA_H,
    position: "relative",
    justifyContent: "center",
  },
  trackBg: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: INACTIVE,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: THEME_BORDER,
  },
  trackFill: {
    height: "100%",
    borderRadius: TRACK_H / 2,
    opacity: 0.92,
  },
  dotsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 1,
  },
  column: {
    alignItems: "center",
    flex: 1,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotActive: {
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  labelRow: {
    flexDirection: "row",
    marginTop: 10,
    paddingHorizontal: 1,
  },
  labelColumn: {
    flex: 1,
    minHeight: 18,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  labelColumnLeading: {
    alignItems: "flex-start",
  },
  labelColumnTrailing: {
    alignItems: "flex-end",
  },
  labelEnd: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    letterSpacing: 0.2,
    width: "100%",
  },
  labelLight: {
    textAlign: "left",
  },
  labelRich: {
    textAlign: "right",
  },
});
