import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import {
  getReport,
  getPendingImage,
  getLastAnalyzedImage,
  setReport,
  clearPendingImage,
} from "../services/store";
import { analyzeImage } from "../services/api";
import type {
  AnalysisIngredient,
  AnalysisResult,
  Category,
  CoreTagItem,
  DynamicDetails,
  GreasinessLevel,
  SkinTypeToken,
} from "../types/analysis";
import { IngredientCard } from "../components/IngredientCard";
import { GreasinessGauge } from "../components/GreasinessGauge";
import { SynergyProductCard } from "../components/SynergyProductCard";
import { normalizeSkinTypes } from "../utils/skinTypes";
import { sortChartDataDesc, buildChartSegments } from "../utils/formulationChart";
import { getLinkedTheme } from "../utils/semanticTagBridge";
import { ensureProConEmoji } from "../api/featureTagEmoji";
import {
  BG,
  CARD_BG,
  CARD_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  THEME,
  THEME_BORDER,
  THEME_BORDER_STRONG,
  THEME_SOFT,
} from "../constants/theme";

const DONUT_SIZE = 200;

/** Unified report layout: block spacing & heading scale */
const MODULE_GAP = 40;
const MODULE_TITLE_SIZE = 16;
const MODULE_TITLE_TO_BODY = 14;
const MODULE_INNER_GAP = 28;

const CATEGORY_LABELS: Record<Exclude<Category, "unknown">, string> = {
  skincare: "Skincare",
  supplement: "Supplement",
  haircare: "Haircare",
};
type EditableCategory = Exclude<Category, "unknown">;

const GREASINESS_LABELS: Record<
  "rich" | "creamy" | "silky" | "fresh" | "light",
  string
> = {
  rich: "Rich",
  creamy: "Creamy",
  silky: "Silky",
  fresh: "Fresh",
  light: "Light",
};

const SKIN_TYPE_LABELS: Record<SkinTypeToken, string> = {
  dry: "Dry",
  null: "Not specified",
  oily: "Oily",
  neutral: "Neutral",
  sensitive: "Sensitive",
  combination: "Combination",
};

function formatSkinTypeLabel(token: string): string {
  return SKIN_TYPE_LABELS[token as SkinTypeToken] ?? token;
}

const PLACEHOLDER_TEXT_LOWER = new Set([
  "not specified",
  "n/a",
  "na",
  "unknown",
  "none",
  "unspecified",
  "-",
  "—",
  "未指定",
  "未知",
  "不适用",
  "无",
]);

function isPlaceholderText(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (!t) return true;
  return PLACEHOLDER_TEXT_LOWER.has(t);
}

function hasMeaningfulScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function meaningfulOptimalTimingParts(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isPlaceholderText(s));
}

function formatGreasiness(v: GreasinessLevel): string {
  if (v === null) return "Not specified";
  return GREASINESS_LABELS[v];
}

function shouldShowDynamicRow(
  key: keyof DynamicDetails,
  details: DynamicDetails
): boolean {
  if (!(key in details)) return false;
  const v = details[key];
  if (key === "greasiness") {
    return typeof v === "string" && v in GREASINESS_LABELS;
  }
  if (key === "is_wash_off") {
    return typeof v === "boolean";
  }
  if (key === "optimal_timing") {
    return (
      typeof v === "string" &&
      meaningfulOptimalTimingParts(v).length > 0
    );
  }
  if (key === "absorption_rate" || key === "irritation_level") {
    return hasMeaningfulScore(v);
  }
  return false;
}

function formatDynamicDetailValue(
  key: keyof DynamicDetails,
  details: DynamicDetails
): string {
  const v = details[key];
  if (key === "optimal_timing") return typeof v === "string" ? v : "";
  if (key === "is_wash_off") {
    return v === true ? "Wash-off" : "Leave-on";
  }
  if (key === "greasiness") {
    return formatGreasiness(v as GreasinessLevel);
  }
  if (key === "absorption_rate" || key === "irritation_level") {
    if (typeof v === "number") return scoreToQualitativeLabel(v);
    return "Not specified";
  }
  return "";
}

function formatCoreTagForDisplay(raw: string): string {
  const t = String(raw).trim();
  if (!t) return "#";
  if (t.startsWith("#")) return t;
  return `#${t}`;
}

const TRACK_MASK_BG = "rgba(148, 163, 184, 0.35)";
const SCORE_GRADIENT_HEX = ["#22c55e", "#eab308", "#ef4444"] as const;

function parseRgbHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Matches expo LinearGradient 3 colors at 0 / 0.5 / 1 along the bar */
function scoreGradientColorAtPercent(p: number): string {
  const t = Math.min(1, Math.max(0, p / 100));
  const c0 = parseRgbHex(SCORE_GRADIENT_HEX[0]);
  const c1 = parseRgbHex(SCORE_GRADIENT_HEX[1]);
  const c2 = parseRgbHex(SCORE_GRADIENT_HEX[2]);
  let r: number;
  let g: number;
  let b: number;
  if (t <= 0.5) {
    const u = t / 0.5;
    r = lerpByte(c0.r, c1.r, u);
    g = lerpByte(c0.g, c1.g, u);
    b = lerpByte(c0.b, c1.b, u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = lerpByte(c1.r, c2.r, u);
    g = lerpByte(c1.g, c2.g, u);
    b = lerpByte(c1.b, c2.b, u);
  }
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const SCORE_TRACK_HEIGHT = 10;
const SCORE_DOT_SIZE = 12;
const SCORE_DOT_HALF = SCORE_DOT_SIZE / 2;
const SCORE_LABEL_GAP = 3;
/** Space below track for dot + gap + pill (absolute column does not expand layout) */
const SCORE_STACK_PADDING_BOTTOM = 26;

function scoreToQualitativeLabel(score: number): string {
  const p = Math.min(100, Math.max(0, Math.round(score)));
  if (p < 20) return "Very low";
  if (p < 40) return "Relatively low";
  if (p < 60) return "Moderate";
  if (p < 80) return "Relatively high";
  return "Very high";
}

/** 0–100 score: full-track gradient masked to score; null = not specified */
function ScorePercentBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return (
      <Text style={hmlBarStyles.notSpecified}>Not specified</Text>
    );
  }
  const p = Math.min(100, Math.max(0, percent));
  const label = scoreToQualitativeLabel(p);
  const progressColor = scoreGradientColorAtPercent(p);
  const stackTop = SCORE_TRACK_HEIGHT / 2 - SCORE_DOT_HALF;
  return (
    <View style={hmlBarStyles.wrap}>
      <View
        style={[
          hmlBarStyles.trackStack,
          { paddingBottom: SCORE_STACK_PADDING_BOTTOM },
        ]}
      >
        <View style={[hmlBarStyles.track, { height: SCORE_TRACK_HEIGHT }]}>
          <LinearGradient
            colors={[...SCORE_GRADIENT_HEX]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          {p < 100 ? (
            <View
              style={[
                hmlBarStyles.trackMask,
                { width: `${100 - p}%`, backgroundColor: TRACK_MASK_BG },
              ]}
            />
          ) : null}
        </View>
        <View
          pointerEvents="none"
          style={[
            hmlBarStyles.markerColumn,
            {
              left: `${p}%`,
              top: stackTop,
              transform: [{ translateX: "-50%" }],
            },
          ]}
        >
          <View
            style={[
              hmlBarStyles.progressDot,
              {
                width: SCORE_DOT_SIZE,
                height: SCORE_DOT_SIZE,
                borderRadius: SCORE_DOT_HALF,
                backgroundColor: progressColor,
              },
            ]}
          />
          <View style={[hmlBarStyles.qualPill, { marginTop: SCORE_LABEL_GAP }]}>
            <Text
              style={[hmlBarStyles.qualPillText, { color: progressColor }]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </View>
      </View>
      <View style={hmlBarStyles.axisRow}>
        <Text style={hmlBarStyles.axisEnd}>Lowest</Text>
        <Text style={hmlBarStyles.axisEnd}>Highest</Text>
      </View>
    </View>
  );
}

const hmlBarStyles = StyleSheet.create({
  wrap: {
    marginTop: 16,
  },
  trackStack: {
    position: "relative",
    width: "100%",
  },
  track: {
    borderRadius: 5,
    overflow: "hidden",
    position: "relative",
    backgroundColor: TRACK_MASK_BG,
  },
  markerColumn: {
    position: "absolute",
    alignItems: "center",
    zIndex: 2,
  },
  progressDot: {
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
  },
  trackMask: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  axisEnd: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  qualPill: {
    paddingHorizontal: 20,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    flexShrink: 0,
  },
  qualPillText: {
    fontSize: 12,
    textAlign: "center",
  },
  notSpecified: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 24,
  },
});

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number
) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string {
  let sweep = endAngle - startAngle;
  if (sweep >= 359.999) sweep = 359.999;
  if (sweep <= 0) return "";
  const largeArc = sweep > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle + sweep);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle + sweep);
  const p4 = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

/** Preserves INCI order within each group; group order follows chart (desc), then A–Z. */
function groupIngredientsByFeatureTag(
  ingredients: AnalysisIngredient[],
  chartData: Array<{ name: string; value: number }>
): { tag: string; items: AnalysisIngredient[] }[] {
  const map = new Map<string, AnalysisIngredient[]>();
  for (const ing of ingredients) {
    const tag = String(ing.feature_tag ?? "").trim() || "Untagged";
    if (!map.has(tag)) map.set(tag, []);
    map.get(tag)!.push(ing);
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of sortChartDataDesc(chartData)) {
    if (map.has(row.name) && !seen.has(row.name)) {
      ordered.push(row.name);
      seen.add(row.name);
    }
  }
  const rest = [...map.keys()]
    .filter((k) => !seen.has(k))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest].map((tag) => ({
    tag,
    items: map.get(tag)!,
  }));
}

function FormulationDonut({
  chartData,
  highlightSegmentIndex,
}: {
  chartData: Array<{ name: string; value: number }>;
  highlightSegmentIndex?: number | null;
}) {
  const { total, segments } = buildChartSegments(chartData);
  if (total <= 0 || segments.length === 0) {
    return (
      <Text style={donutStyles.emptyChart}>No formulation tags to chart</Text>
    );
  }
  const cx = DONUT_SIZE / 2;
  const cy = DONUT_SIZE / 2;
  const rOuter = DONUT_SIZE / 2 - 8;
  const rInner = rOuter * 0.52;
  let angle = 0;
  const dim =
    highlightSegmentIndex !== null &&
    highlightSegmentIndex !== undefined &&
    highlightSegmentIndex >= 0;
  return (
    <View style={donutStyles.donutBlock}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
        {segments.map((seg, i) => {
          const sweep = (seg.value / total) * 360;
          const start = angle;
          const end = angle + sweep;
          angle = end;
          const d = donutSlicePath(cx, cy, rOuter, rInner, start, end);
          if (!d) return null;
          const faded =
            dim && highlightSegmentIndex !== i ? 0.35 : 1;
          return (
            <Path
              key={`${seg.name}-${i}`}
              d={d}
              fill={seg.color}
              stroke={BG}
              strokeWidth={2}
              opacity={faded}
            />
          );
        })}
      </Svg>
      <View style={donutStyles.legend}>
        {segments.map((seg, i) => {
          const rowFaded =
            dim && highlightSegmentIndex !== i ? 0.35 : 1;
          return (
            <View
              key={`${seg.name}-${i}`}
              style={[donutStyles.legendRow, { opacity: rowFaded }]}
            >
              <View
                style={[
                  donutStyles.legendSwatch,
                  { backgroundColor: seg.color },
                ]}
              />
              <Text style={donutStyles.legendText}>
                {seg.name} {seg.percent}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

type Pt = { x: number; y: number };

const SAFETY_BINS = [
  { label: "0-20", min: 0, max: 20 },
  { label: "20-40", min: 20, max: 40 },
  { label: "40-60", min: 40, max: 60 },
  { label: "60-80", min: 60, max: 80 },
  { label: "80-100", min: 80, max: 101 }, // inclusive 100
] as const;

function binIndexForSafetyScore(score: number): number | null {
  for (let i = 0; i < SAFETY_BINS.length; i++) {
    const b = SAFETY_BINS[i];
    if (score >= b.min && score < b.max) return i;
  }
  return null;
}

function computeSafetyScoreWeightedBinPercents(
  ingredients: AnalysisIngredient[]
): { totalWeight: number; binPercents: number[] } {
  const binWeights = [0, 0, 0, 0, 0];
  let totalWeight = 0;

  for (const ing of ingredients) {
    if (typeof ing.safetyScore !== "number" || !Number.isFinite(ing.safetyScore)) {
      continue;
    }
    const idx = binIndexForSafetyScore(ing.safetyScore);
    if (idx == null) continue;

    const w = ing.is_major ? 3 : 1;
    binWeights[idx] += w;
    totalWeight += w;
  }

  const binPercents = binWeights.map((bw) =>
    totalWeight > 0 ? (bw / totalWeight) * 100 : 0
  );
  return { totalWeight, binPercents };
}

function catmullRomToBezierLinePath(points: Pt[], tension = 0.85): string {
  if (points.length < 2) return "";
  const n = points.length;
  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

function catmullRomToBezierAreaPath(points: Pt[], yBase: number): {
  lineD: string;
  areaD: string;
} {
  if (points.length < 2) return { lineD: "", areaD: "" };
  const lineD = catmullRomToBezierLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const segsStart = lineD.indexOf("C ");
  const segs = segsStart >= 0 ? lineD.slice(segsStart) : "";

  // Start at baseline -> up to first point -> smooth curve -> back to baseline.
  // (We rebuild it explicitly to keep the baseline at yBase.)
  const areaD = `M ${first.x} ${yBase} L ${first.x} ${first.y}${segs} L ${last.x} ${yBase} Z`;
  return { lineD, areaD };
}

function SafetyScoreWeightedAreaLineChart({
  binPercents,
}: {
  binPercents: number[];
}) {
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 320, height: 220 });

  const purple = "#8b5cf6";
  const fill = "rgba(139, 92, 246, 0.22)";

  const safePercents =
    binPercents.length === 5
      ? binPercents
      : [0, 0, 0, 0, 0]; // defensive fallback

  const onLayout = (e: any) => {
    const nextWidth = e?.nativeEvent?.layout?.width;
    const nextHeight = e?.nativeEvent?.layout?.height;
    if (typeof nextWidth !== "number" || typeof nextHeight !== "number") return;
    if (nextWidth <= 0 || nextHeight <= 0) return;
    setContainerSize({ width: nextWidth, height: nextHeight });
  };

  const svgW = Math.max(1, containerSize.width);
  const svgH = Math.max(1, containerSize.height);

  // Ensure bottom padding leaves room for (range + %) labels drawn inside Svg.
  const PAD_X = 22;
  const PAD_TOP = 26;
  const PAD_BOTTOM = 44;

  const chartW = Math.max(10, svgW - PAD_X * 2);
  const chartH = Math.max(10, svgH - PAD_TOP - PAD_BOTTOM);
  const yBase = PAD_TOP + chartH;

  const labelY = svgH - 34;
  const valueY = svgH - 14;

  const nPoints = safePercents.length;
  const points: Pt[] = safePercents.map((p, i) => {
    const x = PAD_X + (nPoints <= 1 ? 0 : (i / (nPoints - 1)) * chartW);
    const clamped = Math.min(100, Math.max(0, p));
    const y = PAD_TOP + (1 - clamped / 100) * chartH;
    return { x, y };
  });

  const { lineD, areaD } = catmullRomToBezierAreaPath(points, yBase);
  if (!lineD || !areaD) return null;

  return (
    <View style={{ width: "100%", minHeight: 220 }} onLayout={onLayout}>
      <Svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <Path d={areaD} fill={fill} />
        <Path d={lineD} stroke={purple} strokeWidth={3} fill="none" />
        {points.flatMap((pt, i) => [
          <Circle key={`p-${i}`} cx={pt.x} cy={pt.y} r={2} fill={purple} />,
          <SvgText
            key={`l-${i}`}
            x={pt.x}
            y={labelY}
            fill={TEXT_SECONDARY}
            fontSize={12}
            textAnchor="middle"
          >
            {SAFETY_BINS[i]?.label ?? ""}
          </SvgText>,
          <SvgText
            key={`v-${i}`}
            x={pt.x}
            y={valueY}
            fill={TEXT_PRIMARY}
            fontSize={12}
            fontWeight="600"
            textAnchor="middle"
          >
            {Math.round(safePercents[i] ?? 0)}%
          </SvgText>,
        ])}
      </Svg>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  donutBlock: {
    alignItems: "center",
    gap: 22,
  },
  emptyChart: {
    color: TEXT_MUTED,
    textAlign: "center",
    paddingVertical: 32,
  },
  legend: {
    alignSelf: "stretch",
    gap: 10,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    flex: 1,
  },
});

export default function ReportScreen() {
  const router = useRouter();
  const controllerRef = useRef(new AbortController());
  const [report, setReportState] = useState<AnalysisResult | null>(null);
  const [categoryOverride, setCategoryOverride] = useState<EditableCategory | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [reAnalyzeError, setReAnalyzeError] = useState<string | null>(null);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [reportTab, setReportTab] = useState<0 | 1>(0);
  const [expandedIngredientGroups, setExpandedIngredientGroups] = useState<
    Set<number>
  >(() => new Set([0]));
  const [highlightedDonutIndex, setHighlightedDonutIndex] = useState<
    number | null
  >(null);

  useEffect(() => {
    setReportState(getReport());
  }, []);

  const handleReAnalyze = async () => {
    if (!report) return;
    const targetCategory: EditableCategory | null =
      categoryOverride ?? (report.category === "unknown" ? null : report.category);
    if (!targetCategory) return;
    const imageForReanalyze = getPendingImage() ?? getLastAnalyzedImage();
    if (!imageForReanalyze?.base64) {
      setReAnalyzeError("Image expired, please scan again");
      return;
    }
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    setReAnalyzeError(null);
    setReAnalyzing(true);
    try {
      const newReport = await analyzeImage(
        imageForReanalyze.base64,
        imageForReanalyze.mimeType,
        signal,
        targetCategory,
        undefined
      );
      setReport(newReport);
      setReportState(newReport);
      setCategoryOverride(null);
      setShowCategoryPicker(false);
      if (newReport.category !== "unknown") {
        clearPendingImage();
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setReAnalyzeError(e instanceof Error ? e.message : "Re-analysis failed");
    } finally {
      setReAnalyzing(false);
    }
  };

  if (!report) {
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No report</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const summary =
    typeof report.summary === "object"
      ? report.summary
      : {
          overallEvaluation: String(report.summary ?? ""),
          pros: [] as string[],
          cons: [] as string[],
        };

  const legacySkin =
    (report as unknown as { suitableSkinTypes?: unknown }).suitableSkinTypes;
  const suitabilityBase = report.suitability ?? {
    best_for: [] as string[],
    avoid_groups: [] as string[],
  };
  const suitabilityRaw = {
    ...suitabilityBase,
    best_for: suitabilityBase.best_for ?? [],
    skin_types: normalizeSkinTypes(
      Array.isArray(suitabilityBase.skin_types)
        ? suitabilityBase.skin_types
        : legacySkin ?? []
    ),
    avoid_groups: suitabilityBase.avoid_groups ?? [],
  };
  const suitability = {
    ...suitabilityRaw,
    best_for: suitabilityRaw.best_for.filter(
      (b) => !isPlaceholderText(String(b ?? ""))
    ),
    skin_types: suitabilityRaw.skin_types.filter((t) => t !== "null"),
    avoid_groups: suitabilityRaw.avoid_groups.filter(
      (a) => !isPlaceholderText(String(a ?? ""))
    ),
  };

  const chartData = report.chartData ?? [];
  const ingredientGroups = groupIngredientsByFeatureTag(
    report.ingredients,
    chartData
  );

  const { totalWeight: safetyBinTotalWeight, binPercents: safetyBinPercents } =
    computeSafetyScoreWeightedBinPercents(report.ingredients);

  const toggleIngredientGroup = (gi: number) => {
    setExpandedIngredientGroups((prev) => {
      const next = new Set(prev);
      if (next.has(gi)) next.delete(gi);
      else next.add(gi);
      return next;
    });
  };
  const rawCoreTags =
    report.coreTags ??
    (report as unknown as { mainEffects?: string[] }).mainEffects ??
    [];
  const coreTags: CoreTagItem[] = Array.isArray(rawCoreTags)
    ? rawCoreTags
        .map((item) =>
          typeof item === "string"
            ? { label: item }
            : {
                label: (item as CoreTagItem).label ?? String(item),
                feature_tag: (item as CoreTagItem).feature_tag,
              }
        )
        .filter((t) => (t.label ?? "").trim().length > 0)
    : [];
  const showUnknown = report.category === "unknown";
  const hasPendingForReanalyze =
    !!getPendingImage()?.base64 || !!getLastAnalyzedImage()?.base64;
  const currentCategory: EditableCategory | null =
    categoryOverride ?? (report.category === "unknown" ? null : report.category);
  const pendingCategoryForReanalyze =
    categoryOverride !== null && categoryOverride !== report.category;

  const dynamicDetails = report.dynamic_details ?? {};
  const middleDynamicDetailRows = (
    [
      ["greasiness", "Greasiness"],
      ["optimal_timing", "Optimal timing"],
      ["is_wash_off", "Wash-off"],
      ...(report.category === "supplement"
        ? ([["absorption_rate", "Absorption"]] as const)
        : []),
    ] as const
  ).filter(([key]) => {
    if (
      report.category === "supplement" &&
      (key === "greasiness" || key === "is_wash_off")
    ) {
      return false;
    }
    return shouldShowDynamicRow(key, dynamicDetails);
  });
  const showIrritationLevel = shouldShowDynamicRow(
    "irritation_level",
    dynamicDetails
  );
  const hasBestFor = suitability.best_for.length > 0;
  const hasSkinTypes = suitability.skin_types.length > 0;
  const hasMiddleDynamics = middleDynamicDetailRows.length > 0;
  const showSuitabilityTop =
    hasBestFor || hasSkinTypes || hasMiddleDynamics;
  const synergy = report.synergy ?? [];
  const conflicts = report.conflicts ?? [];

  const safetyAudit = report.safety_audit;
  const hasSafetyAudit =
    !!safetyAudit &&
    [
      safetyAudit.formula_style,
      safetyAudit.safety_verdict,
      safetyAudit.unfiltered_risks,
    ].some((s) => (s ?? "").trim().length > 0);

  const formulaStyleLower = String(safetyAudit?.formula_style ?? "").toLowerCase();
  const hasLeanFormula = /\blean\b/u.test(formulaStyleLower);
  const hasOverloadFormula = /\boverload\b/u.test(formulaStyleLower);
  const safetyFormulaTag: "lean" | "overload" | null = hasLeanFormula
    ? "lean"
    : hasOverloadFormula
      ? "overload"
      : null;
  const safetyFormulaText =
    safetyFormulaTag === "lean"
      ? "🤍 lean formula"
      : safetyFormulaTag === "overload"
        ? "🤯 overload formula"
        : "";

  return (
    <View style={[styles.container, { backgroundColor: BG }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TEXT_PRIMARY} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <View style={styles.categoryTagSection}>
          <View style={styles.categoryTagInlineRow}>
            <View style={styles.categoryCurrentPill}>
              <Text style={styles.categoryCurrentPillText}>
                {currentCategory ? CATEGORY_LABELS[currentCategory] : "Unknown"}
              </Text>
            </View>
            <Pressable
              onPress={() => setShowCategoryPicker((prev) => !prev)}
              style={styles.categoryEditLinearButton}
            >
              <Text style={styles.categoryEditLinearText}>
                {showCategoryPicker ? "Done" : "Edit"}
              </Text>
            </Pressable>
          </View>

          {showCategoryPicker && (
            <View style={styles.categoryPickerWrap}>
              <View style={styles.categoryRow}>
                {(["skincare", "supplement", "haircare"] as const).map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setCategoryOverride(cat);
                      setReAnalyzeError(null);
                    }}
                    style={[
                      styles.categoryOption,
                      currentCategory === cat && styles.categoryOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        currentCategory === cat && styles.categoryOptionTextSelected,
                      ]}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {pendingCategoryForReanalyze && (
            <View style={styles.categoryReanalyzeWrap}>
              <Pressable
                onPress={handleReAnalyze}
                disabled={reAnalyzing || !hasPendingForReanalyze}
                style={[
                  styles.reanalyzeButton,
                  (reAnalyzing || !hasPendingForReanalyze) &&
                    styles.reanalyzeButtonDisabled,
                ]}
              >
                {reAnalyzing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.reanalyzeButtonText}>Re-analyze</Text>
                )}
              </Pressable>
              {!hasPendingForReanalyze && (
                <Text style={styles.reanalyzeError}>
                  Image expired, please scan again
                </Text>
              )}
              {reAnalyzeError && (
                <Text style={styles.reanalyzeError}>{reAnalyzeError}</Text>
              )}
            </View>
          )}
        </View>

        {/* Core tags — first module */}
        {coreTags.length > 0 || safetyFormulaTag ? (
          <View style={styles.coreTagsSection}>
            <View style={styles.tags}>
              {coreTags.map((tag, i) => {
                const linked = getLinkedTheme(tag, chartData, report.category);
                const pressProps =
                  Platform.OS === "web"
                    ? {
                        onHoverIn: () => {
                          if (linked.segmentIndex != null) {
                            setHighlightedDonutIndex(linked.segmentIndex);
                          }
                        },
                        onHoverOut: () => setHighlightedDonutIndex(null),
                      }
                    : {
                        onPressIn: () => {
                          if (linked.segmentIndex != null) {
                            setHighlightedDonutIndex(linked.segmentIndex);
                          }
                        },
                        onPressOut: () => setHighlightedDonutIndex(null),
                      };
                return (
                  <Pressable
                    key={`${tag.label}-${i}`}
                    {...pressProps}
                    style={[
                      styles.coreTagPill,
                      {
                        backgroundColor: linked.pillBg,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.coreTagText, { color: linked.pillText }]}
                    >
                      {linked.displayLabel}
                    </Text>
                  </Pressable>
                );
              })}

              {safetyFormulaTag === "lean" ? (
                <LinearGradient
                  colors={["#fde68a", "#fbbf24", "#f59e0b"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.coreTagPill, { overflow: "hidden" }]}
                >
                  <Text
                    style={[
                      styles.coreTagText,
                      { color: "#b45309" },
                    ]}
                  >
                    {safetyFormulaText}
                  </Text>
                </LinearGradient>
              ) : safetyFormulaTag === "overload" ? (
                <View
                  style={[
                    styles.coreTagPill,
                    {
                      backgroundColor: THEME_SOFT,
                    },
                  ]}
                >
                  <Text style={[styles.coreTagText, { color: THEME }]}>
                    {safetyFormulaText}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Unknown category alert */}
        {showUnknown && (
          <View style={[styles.card, styles.unknownCard]}>
            <Text style={styles.alertEmoji}>🤯</Text>
            <Text style={styles.unknownText}>
              Oops, you stumped me! I'm not sure what this product is. Please
              ensure it's intended for your skin or body.
            </Text>
            <Text style={styles.selectorLabel}>
              Edit Product category above, then tap Re-analyze.
            </Text>
          </View>
        )}

        {/* Formulation DNA — tag distribution */}
        {report.category !== "unknown" && chartData.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Formulation DNA</Text>
            <View style={styles.card}>
              <Text style={styles.dnaHint}>
              Skip the marketing claims. Our engine identifies high-content "Major" ingredients vs. trace additives. This chart shows the weighted functional share of each category, proving what this product is really made of.
              </Text>
              <FormulationDonut
                chartData={chartData}
                highlightSegmentIndex={highlightedDonutIndex}
              />
            </View>
          </>
        )}

        {/* Tabs below chart (or below unknown card when category is unknown) */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setReportTab(0)}
            style={[
              styles.tabBtn,
              reportTab === 0 && styles.tabBtnActive,
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                reportTab === 0 && styles.tabBtnTextActive,
              ]}
            >
              Overview
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setReportTab(1)}
            style={[
              styles.tabBtn,
              reportTab === 1 && styles.tabBtnActive,
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                reportTab === 1 && styles.tabBtnTextActive,
              ]}
            >
              Ingredients
            </Text>
          </Pressable>
        </View>

        {reportTab === 0 && (
          <>
        {/* Summary */}
        {summary.overallEvaluation?.trim() && (
          <View style={styles.sectionPlain}>
            <Text style={[styles.cardLabel, { marginTop: 0 }]}>The Real Talk</Text>
            <Text style={styles.cardText}>{summary.overallEvaluation}</Text>
          </View>
        )}

        {report.tips && report.tips.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Must-Knows</Text>
            <View style={[styles.card, styles.tipsHighlight]}>
              {report.tips.map((tip, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletEmoji}>ℹ️</Text>
                  <Text style={styles.bulletText}>{tip}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {summary.pros.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>The Wins</Text>
            <View style={styles.proHighlight}>
              {summary.pros.map((p, i) => (
                <View key={i} style={styles.proConBulletRow}>
                  <View style={styles.proBulletSpacer} />
                  <View style={styles.proConBulletTextWrap}>
                    <Text style={styles.proConBulletText}>
                      {ensureProConEmoji(p, "pro", i)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {showSuitabilityTop && (
          <View style={styles.sectionPlain}>
            {hasBestFor && (
              <View
                style={[
                  styles.suitabilitySectionBlock,
                  !hasSkinTypes &&
                    middleDynamicDetailRows.length === 0 &&
                    styles.blockLastInSection,
                ]}
              >
                <Text style={[styles.cardLabel, { marginTop: 0 }]}>The Perfect Match</Text>
                <View style={styles.tags}>
                  {suitability.best_for.map((b, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{b}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {hasSkinTypes && (
              <View
                style={[
                  styles.suitabilitySectionBlock,
                  middleDynamicDetailRows.length === 0 &&
                    styles.blockLastInSection,
                ]}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    !hasBestFor && { marginTop: 0 },
                    hasBestFor && styles.cardLabelAfterSuitabilityBlock,
                  ]}
                >
                  Skin types
                </Text>
                <View style={styles.tags}>
                  {suitability.skin_types.map((s, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>
                        {formatSkinTypeLabel(s)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {middleDynamicDetailRows.map(([key, label], idx) => (
              <View
                key={key}
                style={[
                  styles.detailBlock,
                  idx === middleDynamicDetailRows.length - 1 &&
                    styles.blockLastInSection,
                ]}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    idx === 0 &&
                      !hasBestFor &&
                      !hasSkinTypes && { marginTop: 0 },
                    idx === 0 &&
                      (hasBestFor || hasSkinTypes) && {
                        marginTop: 0,
                      },
                    idx > 0 && styles.cardLabelDetailFollow,
                  ]}
                >
                  {label}
                </Text>
                {key === "absorption_rate" ? (
                  <View style={[styles.card, styles.inlineScoreCard]}>
                    <ScorePercentBar
                      percent={dynamicDetails.absorption_rate ?? null}
                    />
                  </View>
                ) : key === "greasiness" ? (
                  <View style={styles.greasinessGaugeWrap}>
                    <GreasinessGauge
                      value={dynamicDetails.greasiness ?? null}
                    />
                  </View>
                ) : key === "optimal_timing" ? (
                  <View style={styles.tags}>
                    {typeof dynamicDetails.optimal_timing === "string"
                      ? meaningfulOptimalTimingParts(
                          dynamicDetails.optimal_timing
                        ).map((t, i) => (
                          <View key={i} style={styles.tag}>
                            <Text style={styles.tagText}>{t}</Text>
                          </View>
                        ))
                      : null}
                  </View>
                ) : (
                  <Text style={styles.cardText}>
                    {formatDynamicDetailValue(key, dynamicDetails)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {synergy.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Power Pairs</Text>
            <Text style={styles.ingredientHint}>
              Our engine detected Power Pairs. These ingredients unlock enhanced
              bioavailability, allowing the formula to perform far beyond the
              sum of its parts.
            </Text>
            <View style={styles.synergyList}>
              {synergy.map((s, i) => (
                <SynergyProductCard
                  key={`${s.partner_ingredient}-${s.benefit}-${i}`}
                  item={s}
                  isLast={i === synergy.length - 1}
                />
              ))}
            </View>
          </>
        )}

        {summary.cons.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>The Red Flags</Text>
            <View style={styles.consHighlight}>
              {summary.cons.map((c, i) => (
                <View key={i} style={styles.proConBulletRow}>
                  <View style={styles.proBulletSpacer} />
                  <View style={styles.proConBulletTextWrap}>
                    <Text style={styles.proConBulletText}>
                      {ensureProConEmoji(c, "con", i)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {suitability.avoid_groups.length > 0 && (
          <View style={styles.sectionPlain}>
            <Text style={[styles.cardLabel, { marginTop: 0 }]}>Not For You If...</Text>
            <View style={styles.tags}>
              {suitability.avoid_groups.map((a, i) => (
                <View key={i} style={[styles.tag, styles.avoidTag]}>
                  <Text style={styles.avoidTagText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {showIrritationLevel && (
          <View style={styles.sectionPlain}>
            <View style={[styles.detailBlock, styles.blockLastInSection]}>
              <Text style={[styles.cardLabel, { marginTop: 0 }]}>
                Irritation level
              </Text>
              <View style={[styles.card, styles.inlineScoreCard]}>
                <ScorePercentBar
                  percent={dynamicDetails.irritation_level ?? null}
                />
              </View>
            </View>
          </View>
        )}

        {conflicts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Bad Mixes</Text>
            <Text style={styles.ingredientHint}>
              Our engine flags Bad Mixes. These specific actives clash on a
              molecular level, potentially canceling out benefits or causing
              adverse reactions.
            </Text>
            {conflicts.map((c, i) => (
              <View key={`${c.ingredient}-${i}`} style={styles.card}>
                <View style={[styles.noteBlock, styles.noteBlockLast]}>
                  {c.ingredient ? (
                    <Text style={styles.cardTextStrong}>{c.ingredient}</Text>
                  ) : null}
                  {c.severity != null ? (
                    <ScorePercentBar percent={c.severity} />
                  ) : null}
                  {c.interaction ? (
                    <Text style={styles.cardText}>{c.interaction}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}
          </>
        )}

        {reportTab === 1 && (
          <>
            {/* Safety score distribution (weighted by Major/Trace) */}
            {report.category !== "unknown" && safetyBinTotalWeight > 0 && (
              <>
                <Text style={styles.sectionTitle}>
                  Safety Score Distribution
                </Text>
                <View style={styles.card}>
                  <SafetyScoreWeightedAreaLineChart
                    binPercents={safetyBinPercents}
                  />
                </View>
              </>
            )}

            {hasSafetyAudit && (
              <>
                <Text style={styles.sectionTitle}>Safety Audit</Text>
                <View style={styles.proHighlight}>
                  {!!safetyAudit?.formula_style?.trim() && (
                    <View>
                      <Text style={styles.safetyAuditSubTitle}>
                        Formula Style
                      </Text>
                      <Text style={styles.safetyAuditSubText}>
                        {safetyAudit.formula_style}
                      </Text>
                    </View>
                  )}
                  {!!safetyAudit?.safety_verdict?.trim() && (
                    <View>
                      <Text style={styles.safetyAuditSubTitle}>
                        Safety Verdict
                      </Text>
                      <Text style={styles.safetyAuditSubText}>
                        {safetyAudit.safety_verdict}
                      </Text>
                    </View>
                  )}
                  {!!safetyAudit?.unfiltered_risks?.trim() && (
                    <View>
                      <Text style={styles.safetyAuditSubTitle}>
                        Why Lower Score
                      </Text>
                      <Text style={styles.safetyAuditSubText}>
                        {safetyAudit.unfiltered_risks}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Ingredients</Text>
            {report.category !== "unknown" && (
              <Text style={styles.ingredientHint}>
                Our engine audits each ingredient by cross-referencing safety ratings and proven functions. We decode the formula to show you exactly what each component does and how it impacts your well-being.
              </Text>
            )}
            <View style={styles.card}>
              {report.ingredients.length === 0 ? (
                <Text style={styles.cardText}>
                  No ingredient breakdown available.
                </Text>
              ) : (
                ingredientGroups.map((group, gi) => {
                  const expanded = expandedIngredientGroups.has(gi);
                  return (
                    <View
                      key={group.tag}
                      style={[
                        styles.ingredientGroupDrawer,
                        gi > 0 && styles.ingredientGroupSpaced,
                      ]}
                    >
                      <Pressable
                        onPress={() => toggleIngredientGroup(gi)}
                        style={styles.ingredientGroupHeader}
                      >
                        <Text style={styles.ingredientGroupTitle}>
                          {group.tag}
                        </Text>
                        <Ionicons
                          name={expanded ? "chevron-down" : "chevron-forward"}
                          size={20}
                          color={TEXT_SECONDARY}
                        />
                      </Pressable>
                      {expanded && (
                        <View style={styles.ingredientGroupContent}>
                          {group.items.map((ing, ii) => (
                            <IngredientCard
                            key={`${group.tag}-${ing.name}-${ii}`}
                            name={ing.name}
                            feature_tag={ing.feature_tag}
                            description={ing.description}
                            is_major={ing.is_major}
                            safetyScore={ing.safetyScore}
                            hideFeatureTagBadge
                            isLast={
                              gi === ingredientGroups.length - 1 &&
                              ii === group.items.length - 1
                            }
                          />
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}

        {/* AI Disclaimer - scroll to bottom, collapsible */}
        <View style={styles.disclaimerDrawer}>
          <Pressable
            onPress={() => setDisclaimerExpanded((v) => !v)}
            style={styles.disclaimerHeader}
          >
            <Text style={styles.disclaimerTitle}>AI Disclaimer</Text>
            <Ionicons
              name={disclaimerExpanded ? "chevron-down" : "chevron-up"}
              size={20}
              color={TEXT_SECONDARY}
            />
          </Pressable>
          {disclaimerExpanded && (
            <View style={styles.disclaimerContent}>
              <Text style={styles.disclaimerParagraph}>
                AI-generated analysis for informational purposes only. Always
                check the physical label before use.
              </Text>
              <Text style={styles.disclaimerParagraph}>
                Based on AI analysis of visible ingredients. This is not medical
                advice. Consult a professional for skin or health concerns.
              </Text>
              <Text style={styles.disclaimerParagraph}>
                Analysis uses label order, declared INCI names, and a 1% line
                heuristic; it is not a laboratory assay. Results may vary by
                batch and region.
              </Text>
            </View>
          )}
        </View>

        <Pressable disabled style={styles.reportMistakesBtn}>
          <Text style={styles.reportMistakesBtnText}>Report mistakes</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 56,
    alignItems: "stretch",
    ...(Platform.OS === "web" ? ({ width: "100%" } as const) : null),
  },
  tabRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: MODULE_GAP,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME_BORDER_STRONG,
    backgroundColor: CARD_BG,
    alignItems: "center",
  },
  tabBtnActive: {
    borderColor: THEME,
    backgroundColor: THEME_SOFT,
  },
  tabBtnText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontWeight: "600",
  },
  tabBtnTextActive: {
    color: THEME,
  },
  disclaimerDrawer: {
    marginTop: MODULE_GAP,
    marginBottom: 48,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  disclaimerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 22,
  },
  disclaimerTitle: {
    color: THEME,
    fontSize: MODULE_TITLE_SIZE,
    fontWeight: "600",
  },
  disclaimerContent: {
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  disclaimerParagraph: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 14,
  },
  reportMistakesBtn: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: -20,
    marginBottom: 8,
  },
  reportMistakesBtnText: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: "500",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: MODULE_GAP,
  },
  backButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 16,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyText: {
    color: TEXT_MUTED,
    fontSize: 16,
    marginBottom: 16,
  },
  alertEmoji: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  unknownCard: {
    borderColor: "rgba(251, 191, 36, 0.5)",
    backgroundColor: "rgba(251, 191, 36, 0.1)",
  },
  unknownText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 22,
  },
  categoryTagSection: {
    marginTop: -22,
    marginBottom: 24,
  },
  categoryTagInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryEditLinearButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  categoryEditLinearText: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: "500",
  },
  categoryCurrentPill: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: THEME_SOFT,
    borderWidth: 1,
    borderColor: THEME_BORDER_STRONG,
  },
  categoryCurrentPillText: {
    color: THEME,
    fontSize: 12,
    fontWeight: "600",
  },
  categoryPickerWrap: {
    marginTop: 10,
  },
  categoryReanalyzeWrap: {
    marginTop: 10,
  },
  selectorLabel: {
    color: THEME,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  categoryOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME_BORDER_STRONG,
  },
  categoryOptionSelected: {
    backgroundColor: THEME_SOFT,
    borderColor: THEME,
  },
  categoryOptionText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
  categoryOptionTextSelected: {
    color: THEME,
    fontWeight: "600",
  },
  reanalyzeButton: {
    backgroundColor: THEME,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  reanalyzeButtonDisabled: {
    opacity: 0.5,
  },
  reanalyzeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  reanalyzeError: {
    color: "#f87171",
    fontSize: 14,
    marginTop: 8,
  },
  sectionPlain: {
    marginBottom: MODULE_GAP,
  },
  proConBulletTextWrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  proHighlight: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    alignItems: "flex-start",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 12,
    padding: 20,
    marginBottom: MODULE_GAP,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.25)",
    gap: 20,
  },
  consHighlight: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    alignItems: "flex-start",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    padding: 20,
    marginBottom: MODULE_GAP,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    gap: 20,
  },
  tipsHighlight: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderColor: "rgba(251, 191, 36, 0.25)",
  },
  coreTagsSection: {
    marginBottom: MODULE_GAP,
  },
  coreTagPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  coreTagText: {
    fontSize: 16,
    lineHeight: 22,
  },
  proBulletSpacer: {
    width: 22,
    height: 22,
  },
  dnaHint: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: MODULE_TITLE_TO_BODY,
  },
  sectionTitle: {
    alignSelf: "stretch",
    width: "100%",
    color: THEME,
    fontSize: MODULE_TITLE_SIZE,
    fontWeight: "600",
    marginBottom: MODULE_TITLE_TO_BODY,
    textAlign: "left",
  },
  synergyList: {
    marginBottom: MODULE_GAP,
  },
  ingredientHint: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginBottom: MODULE_TITLE_TO_BODY,
  },
  ingredientGroupDrawer: {},
  ingredientGroupTitle: {
    color: THEME,
    fontSize: MODULE_TITLE_SIZE,
    fontWeight: "600",
  },
  ingredientGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  ingredientGroupContent: {
    paddingTop: MODULE_TITLE_TO_BODY,
  },
  ingredientGroupSpaced: {
    marginTop: MODULE_INNER_GAP,
    paddingTop: MODULE_INNER_GAP,
    borderTopWidth: 1,
    borderTopColor: THEME_BORDER,
  },
  featureGroupTitle: {
    color: THEME,
    fontSize: MODULE_TITLE_SIZE,
    fontWeight: "600",
    marginBottom: MODULE_TITLE_TO_BODY,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 20,
    marginBottom: MODULE_GAP,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardLabel: {
    color: THEME,
    fontSize: MODULE_TITLE_SIZE,
    fontWeight: "600",
    marginTop: MODULE_INNER_GAP,
    marginBottom: MODULE_TITLE_TO_BODY,
  },
  cardText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 24,
  },
  cardTextStrong: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    marginBottom: 4,
  },
  safetyAuditSubTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    // Keep title-to-body compact so it reads as a single concept.
    marginBottom: 8, // must be < MODULE_INNER_GAP
  },
  safetyAuditSubText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    lineHeight: 24,
  },
  suitabilitySectionBlock: {
    marginBottom: MODULE_GAP,
  },
  cardLabelAfterSuitabilityBlock: {
    marginTop: 0,
  },
  cardLabelDetailFollow: {
    marginTop: 0,
  },
  detailBlock: {
    marginBottom: MODULE_GAP,
  },
  blockLastInSection: {
    marginBottom: 0,
  },
  greasinessGaugeWrap: {
    marginTop: 8,
  },
  noteBlock: {
    marginBottom: 24,
  },
  noteBlockLast: {
    marginBottom: 0,
  },
  inlineScoreCard: {
    marginBottom: 0,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    alignSelf: "stretch",
    gap: 10,
    marginTop: 8,
  },
  proConBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    alignSelf: "stretch",
    gap: 10,
  },
  bulletText: {
    flex: 1,
    minWidth: 0,
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "left",
  },
  bulletEmoji: {
    fontSize: 18,
    lineHeight: 22,
    color: THEME,
  },
  proConBulletText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "left",
    width: "100%",
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tag: {
    backgroundColor: THEME_SOFT,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  tagText: {
    color: THEME,
    fontSize: 14,
  },
  avoidTag: {
    backgroundColor: "rgba(248, 113, 113, 0.2)",
  },
  avoidTagText: {
    color: "#f87171",
    fontSize: 14,
  },
});
