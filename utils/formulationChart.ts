/** Donut slice colors — index = position in value-sorted chartData */
export const CHART_COLORS = [
  "#5eead4",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#fb923c",
  "#94a3b8",
  "#22d3ee",
  "#c084fc",
  "#4ade80",
  "#f9a8d4",
] as const;

export function sortChartDataDesc(
  chartData: Array<{ name: string; value: number }>
): Array<{ name: string; value: number }> {
  return [...chartData].sort((a, b) => b.value - a.value);
}

export type ChartSegment = {
  name: string;
  value: number;
  index: number;
  percent: number;
  color: string;
};

export function buildChartSegments(
  chartData: Array<{ name: string; value: number }>
): { total: number; segments: ChartSegment[] } {
  const sorted = sortChartDataDesc(chartData);
  const total = sorted.reduce((s, d) => s + d.value, 0);
  if (total <= 0 || sorted.length === 0) {
    return { total: 0, segments: [] };
  }
  const n = CHART_COLORS.length;
  const segments: ChartSegment[] = sorted.map((seg, i) => ({
    name: seg.name,
    value: seg.value,
    index: i,
    percent: Math.round((seg.value / total) * 100),
    color: CHART_COLORS[i % n],
  }));
  return { total, segments };
}
