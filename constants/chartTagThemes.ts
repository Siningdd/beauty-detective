/** gray-50 / gray-700 — unmatched or marketing-only (no chart evidence) */
export const DEFAULT_FALLBACK_TAG_THEME = {
  pillBg: "#f9fafb",
  pillText: "#374151",
} as const;

/** One entry per index in `CHART_COLORS` (formulationChart.ts) — pill bg/text aligned to slice hue */
export const TAG_PILL_THEMES: ReadonlyArray<{
  pillBg: string;
  pillText: string;
}> = [
  { pillBg: "#f0fdfa", pillText: "#0f766a" },
  { pillBg: "#e0f2fe", pillText: "#0369a1" },
  { pillBg: "#f5f3ff", pillText: "#6d28d9" },
  { pillBg: "#fce7f3", pillText: "#be185d" },
  { pillBg: "#fffbeb", pillText: "#b45309" },
  { pillBg: "#ecfdf5", pillText: "#047857" },
  { pillBg: "#fff7ed", pillText: "#c2410c" },
  { pillBg: "#f8fafc", pillText: "#334155" },
  { pillBg: "#ecfeff", pillText: "#0e7490" },
  { pillBg: "#faf5ff", pillText: "#7e22ce" },
  { pillBg: "#f0fdf4", pillText: "#15803d" },
  { pillBg: "#fdf2f8", pillText: "#be185d" },
];
