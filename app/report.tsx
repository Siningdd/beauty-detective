import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";
import {
  getActiveAnalysisSessionId,
  getAnalysisParams,
  clearAnalysisParams,
  getPendingImage,
  getLastAnalyzedImage,
  getReport,
  getReportMeta,
  makeAnalysisSourceKey,
  MOCK_REPORT_SOURCE_KEY,
  setReport,
  setLastAnalyzedImage,
  clearPendingImage,
  type PendingAnalysisParams,
} from "../services/store";
import { analyzeImage, HIGH_RISK_INGREDIENT_CODE } from "../services/api";
import {
  buildFallbackStreamTokens,
  detectOcrAndHints,
  extractHighlightKeywords,
  extractRawTextFast,
  extractRawTextLate,
  mergeOcrStreamTokens,
  resolveHintDecision,
  tokenizeOcrStream,
  type OcrStreamToken,
} from "../services/ocrDetect";
import { applyOcrCorrectionMapToText } from "../utils/ocrCorrectionApply";
import {
  appendCorrectionEvent,
  loadUserCorrectionMap,
  mergeCorrectionEntry,
  type CorrectionTrackAction,
} from "../services/userOcrCorrections";
import {
  loadUserInterestMap,
  shouldUseCuriousPlaceholder,
  type UserInterestMap,
} from "../services/userInterestService";
import { AnalyticsService } from "../services/AnalyticsService";
import type {
  AnalysisIngredient,
  AnalysisResult,
  Category,
  CoreTagItem,
  DynamicDetails,
  GreasinessLevel,
  SkinTypeToken,
} from "../types/analysis";
import {
  getLoadingPhaseRange,
  type LoadingPhase,
} from "../types/loadingPhase";
import { IngredientAuditList } from "../components/IngredientAuditList";
import { AskPanel } from "../components/AskPanel";
import { GreasinessGauge } from "../components/GreasinessGauge";
import { SynergyProductCard } from "../components/SynergyProductCard";
import { LoadingScreen } from "../components/LoadingScreen";
import { HighRiskModal } from "../components/HighRiskModal";
import { PaywallCard } from "../components/PaywallCard";
import { SkeletonBlock, SkeletonLine, SkeletonPill } from "../components/SkeletonBlock";
import { normalizeSkinTypes } from "../utils/skinTypes";
import { buildChartSegments } from "../utils/formulationChart";
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
const PLACEHOLDER_DONUT_DATA = [
  { name: "Loading", value: 1 },
  { name: "Loading", value: 1 },
  { name: "Loading", value: 1 },
  { name: "Loading", value: 1 },
];

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
type EnrichedAnalysisParams = PendingAnalysisParams & {
  needsCategoryConfirm?: boolean;
  suggestedCategoryHint?: EditableCategory;
};
const LOW_CONFIDENCE_CATEGORY_MESSAGE =
  "识别不确定，请先确认产品类型再继续分析。";

const AI_RESPONSE_PREFIX = "[Pro Insight]:";

function getHighRiskIngredientFromError(e: unknown): string | null {
  if (!(e instanceof Error)) return null;
  const ex = e as Error & { code?: string; ingredient?: string };
  if (
    ex.code === HIGH_RISK_INGREDIENT_CODE &&
    typeof ex.ingredient === "string" &&
    ex.ingredient.length > 0
  ) {
    return ex.ingredient;
  }
  return null;
}

function getExpertAdviceLines(r: AnalysisResult): string[] {
  const ex = r.expert_advice;
  const tp = r.tips;
  const raw =
    Array.isArray(ex) && ex.length > 0
      ? ex
      : Array.isArray(tp)
        ? tp
        : [];
  return raw.map((x) => String(x ?? "")).filter(Boolean);
}

function isAiResponseAdviceLine(text: string): boolean {
  return text.trimStart().startsWith(AI_RESPONSE_PREFIX);
}

function sanitizeAdviceDisplayLine(line: string): string {
  return line.replace(/^\[Pro\s?Insight\]:\s*/i, "").trimStart();
}

type AdviceMciGlyph =
  | "shield-check-outline"
  | "information-outline"
  | "flask-outline";

function adviceLineMciName(raw: string, aiLine: boolean): AdviceMciGlyph {
  if (aiLine) return "shield-check-outline";
  const t = raw.toLowerCase();
  if (
    /\b(ingredient|formula|inci|%|acid|retinol|peptide|serum|spf|uv)\b/i.test(
      t
    )
  ) {
    return "flask-outline";
  }
  return "information-outline";
}

const MAX_REVEAL_STEP = 5;
const CHAT_STORAGE_PREFIX = "chat_";

function suffixPrefixSplit(
  current: string[],
  oldLines: string[]
): number | null {
  if (oldLines.length === 0) {
    if (current.length === 0) return 0;
    return null;
  }
  if (current.length < oldLines.length) return null;
  const start = current.length - oldLines.length;
  for (let j = 0; j < oldLines.length; j++) {
    if (current[start + j] !== oldLines[j]) return null;
  }
  return start;
}

function prependUniqueOrdered(newItems: string[], prev: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of newItems) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  for (const line of prev) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

function extractNewAdviceLines(
  currentLines: string[],
  oldLines: string[]
): string[] {
  const start = suffixPrefixSplit(currentLines, oldLines);
  if (start !== null) {
    const prefix = currentLines.slice(0, start);
    if (prefix.length > 0) return prefix;
  }
  const aiOnly = currentLines.filter((line) => isAiResponseAdviceLine(line));
  if (aiOnly.length > 0) return prependUniqueOrdered(aiOnly, []);
  if (currentLines.length > 0) return [currentLines[0]];
  return [];
}

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

function dedupeIngredientNames(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const n = raw.trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

function buildVerifiedIngredientDirective(
  category: Category,
  list: string[]
): string {
  const joined = list.join(", ");
  let text =
    "Note: The user has manually corrected the ingredient list. IGNORE all previous OCR artifacts and hallucinations. " +
    "Focus strictly on this updated list: " +
    joined +
    ". If a key active ingredient was added, ensure its functional impact is reflected in the safety audit and efficacy summary.";
  if (category === "supplement") {
    text +=
      " [Supplement]: Re-apply DIVIDER_RULE on this ordered list. User-added core actives (vitamins, minerals, botanicals, extracts) must be considered for is_major:true using position/divider heuristics even without dosage on the label.";
  } else if (category === "skincare" || category === "haircare") {
    text +=
      " [Skincare/Haircare]: If the user added preservatives or other high-risk ingredients, downgrade safety_score and safety_audit accordingly.";
  }
  return text;
}

async function enrichAnalysisParamsIfNeeded(
  params: PendingAnalysisParams,
  _signal: AbortSignal
): Promise<EnrichedAnalysisParams> {
  const map = await loadUserCorrectionMap();
  if (params.ingredientText?.trim()) {
    const ing = applyOcrCorrectionMapToText(params.ingredientText.trim(), map);
    let ocrRaw =
      params.ocrRawText?.trim() ||
      getPendingImage()?.ocrRawText?.trim() ||
      undefined;
    if (ocrRaw) ocrRaw = applyOcrCorrectionMapToText(ocrRaw, map);
    return {
      ...params,
      ingredientText: ing,
      ...(ocrRaw ? { ocrRawText: ocrRaw } : {}),
    };
  }
  const pending = getPendingImage();
  if (!pending?.uri || !pending.base64 || !pending.mimeType) return params;

  const detected = await detectOcrAndHints({
    uri: pending.uri,
    base64: pending.base64,
  });
  let ingredientText = detected.correctedText || detected.rawOcrText;
  ingredientText = applyOcrCorrectionMapToText(ingredientText, map);
  let ocrRawText = detected.rawOcrText?.trim() || undefined;
  if (ocrRawText) ocrRawText = applyOcrCorrectionMapToText(ocrRawText, map);
  const resolved = resolveHintDecision({
    confidenceHint: detected.confidenceHint,
    categoryHint: detected.categoryHint,
    thinkingHint: detected.thinkingHint,
  });
  const suggestedCategoryHint =
    (resolved?.categoryHint ?? detected.suggestedCategoryHint) as
      | EditableCategory
      | undefined;
  const needsCategoryConfirm = detected.needsCategoryConfirm;
  return {
    ...params,
    categoryHint: resolved?.categoryHint,
    thinkingHint: resolved?.thinkingHint,
    ingredientText,
    ocrRawText,
    needsCategoryConfirm,
    suggestedCategoryHint,
  };
}

function FormulationDonut({
  chartData,
  highlightSegmentIndex,
  loading = false,
}: {
  chartData: Array<{ name: string; value: number }>;
  highlightSegmentIndex?: number | null;
  loading?: boolean;
}) {
  const progressAnim = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const [progress, setProgress] = useState(loading ? 0 : 1);
  const activeChartData = loading ? PLACEHOLDER_DONUT_DATA : chartData;
  const { total, segments } = buildChartSegments(activeChartData);

  useEffect(() => {
    const listenerId = progressAnim.addListener(({ value }) => {
      setProgress(value);
    });
    return () => progressAnim.removeListener(listenerId);
  }, [progressAnim]);

  useEffect(() => {
    if (loading) {
      progressAnim.stopAnimation();
      progressAnim.setValue(0);
      return;
    }
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [loading, progressAnim]);

  if (total <= 0 || segments.length === 0) {
    return (
      <Text style={donutStyles.emptyChart}>No formulation tags to chart</Text>
    );
  }
  const cx = DONUT_SIZE / 2;
  const cy = DONUT_SIZE / 2;
  const rOuter = DONUT_SIZE / 2 - 8;
  const rInner = rOuter * 0.52;
  const placeholderValues = segments.map(() => 1 / segments.length);
  const realValues = segments.map((seg) => seg.value / total);
  let angle = 0;
  const dim =
    !loading &&
    highlightSegmentIndex !== null &&
    highlightSegmentIndex !== undefined &&
    highlightSegmentIndex >= 0;

  return (
    <View style={donutStyles.donutBlock}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
        {segments.map((seg, i) => {
          const mixedValue =
            placeholderValues[i] + (realValues[i] - placeholderValues[i]) * progress;
          const sweep = mixedValue * 360;
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
              fill={loading ? CARD_BORDER : seg.color}
              stroke={BG}
              strokeWidth={2}
              opacity={faded}
            />
          );
        })}
      </Svg>
      <View style={[donutStyles.legend, { opacity: loading ? 0 : progress }]}>
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
  const reportScrollRef = useRef<ScrollView | null>(null);
  const adviceSectionYRef = useRef(0);
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [report, setReportState] = useState<AnalysisResult | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isSafetyAuditUnlocked, setSafetyAuditUnlocked] = useState(false);
  const [isSafetyScoreUnlocked, setSafetyScoreUnlocked] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const [categoryOverride, setCategoryOverride] = useState<EditableCategory | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [reAnalyzeError, setReAnalyzeError] = useState<string | null>(null);
  const [highRiskModalVisible, setHighRiskModalVisible] = useState(false);
  const [highRiskIngredientName, setHighRiskIngredientName] = useState("");
  const [panelThinkingHint, setPanelThinkingHint] = useState<
    PendingAnalysisParams["thinkingHint"] | undefined
  >(undefined);
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [reportTab, setReportTab] = useState<0 | 1>(0);
  const [chatHistory, setChatHistory] = useState<string[]>([]);
  const lastLinesRef = useRef<string[]>([]);
  const threadAnchorRef = useRef<{ sessionId: number; base64: string } | null>(
    null
  );
  const chatSessionForStorageRef = useRef<number | null>(null);
  const [highlightedDonutIndex, setHighlightedDonutIndex] = useState<
    number | null
  >(null);
  const [loadingStreamTokens, setLoadingStreamTokens] = useState<OcrStreamToken[]>([]);
  const [loadingHighlightKeywords, setLoadingHighlightKeywords] = useState<string[]>([]);
  const [loadingBackgroundUri, setLoadingBackgroundUri] = useState<string | undefined>(undefined);
  const [loadingGotResult, setLoadingGotResult] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("compressing");
  const [loadingExternalProgress, setLoadingExternalProgress] = useState(0);
  const [allDetectedTokens, setAllDetectedTokens] = useState<string[]>([]);
  const [loadingHasData, setLoadingHasData] = useState(false);
  const [workingIngredients, setWorkingIngredients] = useState<
    AnalysisIngredient[] | null
  >(null);
  const [ingredientModal, setIngredientModal] = useState<
    null | { mode: "add" } | { mode: "edit"; flatIndex: number }
  >(null);
  const [ingredientModalDraft, setIngredientModalDraft] = useState("");
  const baselineIngredientNamesRef = useRef<string[] | null>(null);
  const lastCorrectionActionRef = useRef<CorrectionTrackAction | null>(null);
  const [userInterestMap, setUserInterestMap] = useState<UserInterestMap>({});
  const [askPlaceholderIngredient, setAskPlaceholderIngredient] = useState<
    string | null
  >(null);
  const ingredientsAnchorYRef = useRef(0);
  const loadingRawPreviewRef = useRef("");
  const pendingLoadingReportRef = useRef<{
    result: AnalysisResult;
    base64: string;
    mimeType: string;
    ingredientText?: string;
    ocrRawText?: string;
    thinkingHint?: PendingAnalysisParams["thinkingHint"];
  } | null>(null);
  const pendingConfirmParamsRef = useRef<EnrichedAnalysisParams | null>(null);
  const commitLoadingSuccessRef = useRef<
    (payload: {
      result: AnalysisResult;
      base64: string;
      mimeType: string;
      ingredientText?: string;
      ocrRawText?: string;
      thinkingHint?: PendingAnalysisParams["thinkingHint"];
    }) => void
  >(() => {});

  const clearRevealTimers = () => {
    revealTimersRef.current.forEach((timer) => clearTimeout(timer));
    revealTimersRef.current = [];
  };

  const switchLoadingPhase = useCallback((phase: LoadingPhase) => {
    setLoadingPhase(phase);
    setLoadingExternalProgress((prev) => {
      const start = getLoadingPhaseRange(phase).start;
      return Number.isFinite(prev) ? Math.max(prev, start) : start;
    });
  }, []);

  const beginRevealSequence = () => {
    clearRevealTimers();
    setRevealStep(0);
    [0, 120, 240, 360, 480].forEach((delay, index) => {
      const timer = setTimeout(() => {
        setRevealStep(index + 1);
      }, delay);
      revealTimersRef.current.push(timer);
    });
  };

  const buildDetectedTokenPool = (rawText: string): string[] => {
    const words = String(rawText ?? "")
      .replace(/\s+/g, " ")
      .split(/[\s,;:|/\\]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const word of words) {
      const key = word.toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(word);
      if (out.length >= 240) break;
    }
    return out;
  };

  const commitLoadingSuccess = (payload: {
    result: AnalysisResult;
    base64: string;
    mimeType: string;
    ingredientText?: string;
    ocrRawText?: string;
    thinkingHint?: PendingAnalysisParams["thinkingHint"];
  }) => {
    setReportState(payload.result);
    setPanelThinkingHint(payload.thinkingHint);
    const sid = getActiveAnalysisSessionId();
    setReport(payload.result, {
      sessionId: sid,
      isFollowUpResponse: false,
      thinkingHint: payload.thinkingHint,
      analysisSourceKey: makeAnalysisSourceKey(sid, payload.base64),
    });
    beginRevealSequence();
    setSafetyAuditUnlocked(false);
    setSafetyScoreUnlocked(false);
    setWorkingIngredients(null);
    baselineIngredientNamesRef.current = null;
    lastCorrectionActionRef.current = null;
    setAskPlaceholderIngredient(null);
    const initialLines = getExpertAdviceLines(payload.result);
    setChatHistory(initialLines);
    lastLinesRef.current = initialLines;
    chatSessionForStorageRef.current = sid;
    threadAnchorRef.current = { sessionId: sid, base64: payload.base64 };
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(`${CHAT_STORAGE_PREFIX}${sid}`);
      }
    } catch {
      /* ignore */
    }
    setLastAnalyzedImage({
      uri: getPendingImage()?.uri ?? "",
      base64: payload.base64,
      mimeType: payload.mimeType,
      ingredientText: payload.ingredientText,
      ocrRawText: payload.ocrRawText,
    });
    if (payload.result.category !== "unknown") {
      clearPendingImage();
    }
    clearAnalysisParams();
    pendingConfirmParamsRef.current = null;
    setShowCategoryPicker(false);
    pendingLoadingReportRef.current = null;
    setLoadingGotResult(false);
    setLoadingPhase("compressing");
    setLoadingExternalProgress(0);
    setLoadingInitial(false);
  };
  commitLoadingSuccessRef.current = commitLoadingSuccess;

  const handleLoadingFadeComplete = useCallback(() => {
    const pending = pendingLoadingReportRef.current;
    if (!pending) return;
    commitLoadingSuccessRef.current(pending);
  }, []);

  const kickOffLoadingFirstPass = (params: PendingAnalysisParams, signal: AbortSignal) => {
    switchLoadingPhase("uploading");
    const fallbackTokens = buildFallbackStreamTokens();
    setLoadingStreamTokens([]);
    setLoadingHighlightKeywords([]);
    setLoadingBackgroundUri(undefined);
    setAllDetectedTokens([]);
    setLoadingHasData(false);
    loadingRawPreviewRef.current = "";
    const pending = getPendingImage();
    setLoadingBackgroundUri(pending?.uri || undefined);
    const ocrOptions = {
      uri: pending?.uri,
      base64: params.base64,
    };
    let appliedRealTokens = false;
    const applyRawTokens = (raw: string) => {
      if (signal.aborted) return;
      if (!raw.trim()) return;
      loadingRawPreviewRef.current = raw;
      const pool = buildDetectedTokenPool(raw);
      if (pool.length > 0) {
        setAllDetectedTokens(pool);
        setLoadingHasData(true);
      }
      const liveTokens = tokenizeOcrStream(raw);
      if (liveTokens.length === 0) return;
      appliedRealTokens = true;
      setLoadingStreamTokens(
        mergeOcrStreamTokens({
          primary: liveTokens,
          secondary: fallbackTokens,
          limit: 250,
        })
      );
      setLoadingHighlightKeywords(
        extractHighlightKeywords({
          rawText: raw,
          limit: 18,
        })
      );
    };
    void extractRawTextFast(ocrOptions, 750).then((raw) => {
      applyRawTokens(raw);
    });
    void extractRawTextLate(ocrOptions, 5000).then((raw) => {
      if (appliedRealTokens) return;
      applyRawTokens(raw);
    });
  };

  useEffect(() => {
    if (!loadingInitial || loadingGotResult) return;
    const range = getLoadingPhaseRange(loadingPhase);
    const target = loadingPhase === "finishing" ? 99 : range.end;
    const timer = setInterval(() => {
      setLoadingExternalProgress((prev) => {
        const current = Number.isFinite(prev) ? prev : 0;
        if (current >= target) return current;
        const delta = Math.max(0.2, (target - current) * 0.08);
        return Math.min(target, current + delta);
      });
    }, 120);
    return () => clearInterval(timer);
  }, [loadingPhase, loadingGotResult, loadingInitial]);

  useEffect(() => {
    if (loadingInitial) return;
    setLoadingPhase("compressing");
    setLoadingExternalProgress(0);
  }, [loadingInitial]);

  const applyResolvedIngredientToLoading = (ingredientText?: string) => {
    const text = ingredientText?.trim() ?? "";
    if (!text) return;
    const prevRaw = loadingRawPreviewRef.current;
    loadingRawPreviewRef.current = text;
    const pool = buildDetectedTokenPool(text);
    if (pool.length > 0) {
      setAllDetectedTokens(pool);
      setLoadingHasData(true);
    }
    const liveTokens = tokenizeOcrStream(text);
    if (liveTokens.length > 0) {
      setLoadingStreamTokens(
        mergeOcrStreamTokens({
          primary: liveTokens,
          secondary: buildFallbackStreamTokens(),
          limit: 120,
        })
      );
    }
    setLoadingHighlightKeywords(
      extractHighlightKeywords({
        correctedText: text,
        rawText: prevRaw || text,
        limit: 18,
      })
    );
  };

  const lastFocusedParamsSigRef = useRef<string | null>(null);
  const reportSnapshotRef = useRef<AnalysisResult | null>(null);
  reportSnapshotRef.current = report;

  useFocusEffect(
    useCallback(() => {
      const params = getAnalysisParams();
      if (params) {
        const sid = params.sessionId ?? getActiveAnalysisSessionId();
        const sig = `${sid}:${params.base64.length}:${params.base64.slice(0, 80)}`;
        if (
          lastFocusedParamsSigRef.current === sig &&
          reportSnapshotRef.current != null
        ) {
          return undefined;
        }
        lastFocusedParamsSigRef.current = sig;
        setReportState(null);
        controllerRef.current.abort();
        controllerRef.current = new AbortController();
        const { signal } = controllerRef.current;
        pendingLoadingReportRef.current = null;
        setLoadingGotResult(false);
        setLoadingPhase("uploading");
        setLoadingExternalProgress(getLoadingPhaseRange("uploading").start);
        setAllDetectedTokens([]);
        setLoadingHasData(false);
        setLoadingInitial(true);
        setInitialError(null);
        kickOffLoadingFirstPass(params, signal);
        switchLoadingPhase("classifying");
        enrichAnalysisParamsIfNeeded(params, signal)
          .then((resolved) => {
            applyResolvedIngredientToLoading(resolved.ingredientText);
            if (resolved.needsCategoryConfirm) {
              pendingConfirmParamsRef.current = resolved;
              setCategoryOverride(
                resolved.suggestedCategoryHint ??
                  resolved.categoryHint ??
                  "skincare"
              );
              setShowCategoryPicker(true);
              setInitialError(LOW_CONFIDENCE_CATEGORY_MESSAGE);
              setLoadingInitial(false);
              return null;
            }
            switchLoadingPhase("processing");
            return analyzeImage(
              resolved.base64,
              resolved.mimeType,
              signal,
              resolved.categoryHint,
              resolved.thinkingHint,
              resolved.ingredientText,
              undefined,
              resolved.ocrRawText
            ).then((result) => ({ result, resolved }));
          })
          .then((result) => {
            if (signal.aborted || !result) return;
            const r = result.resolved;
            const apiIngredientText =
              result.result.resolvedIngredientText?.trim() || r.ingredientText;
            const apiOcrRawText =
              result.result.resolvedOcrRawText?.trim() || r.ocrRawText;
            applyResolvedIngredientToLoading(apiIngredientText);
            const keySid = r.sessionId ?? getActiveAnalysisSessionId();
            setReport(result.result, {
              sessionId: keySid,
              isFollowUpResponse: false,
              thinkingHint: r.thinkingHint,
              analysisSourceKey: makeAnalysisSourceKey(keySid, r.base64),
            });
            pendingLoadingReportRef.current = {
              result: result.result,
              base64: r.base64,
              mimeType: r.mimeType,
              ingredientText: apiIngredientText,
              ocrRawText: apiOcrRawText,
              thinkingHint: r.thinkingHint,
            };
            switchLoadingPhase("finishing");
            setLoadingGotResult(true);
          })
          .catch((e) => {
            if (e instanceof Error && e.name === "AbortError") return;
            pendingLoadingReportRef.current = null;
            setLoadingGotResult(false);
            const hr = getHighRiskIngredientFromError(e);
            if (hr) {
              setHighRiskIngredientName(hr);
              setHighRiskModalVisible(true);
              return;
            }
            setInitialError(e instanceof Error ? e.message : "Analysis failed");
          })
          .finally(() => {
            if (signal.aborted) return;
            if (!pendingLoadingReportRef.current) {
              setLoadingInitial(false);
            }
          });
        return undefined;
      }

      lastFocusedParamsSigRef.current = null;
      const cached = getReport();
      const cachedMeta = getReportMeta();
      const active = getActiveAnalysisSessionId();
      const sid = cachedMeta?.sessionId;
      const cacheSourceKey = cachedMeta?.analysisSourceKey;
      const keyOk =
        cachedMeta &&
        (cacheSourceKey === MOCK_REPORT_SOURCE_KEY ||
          cacheSourceKey == null ||
          (() => {
            const img = getLastAnalyzedImage();
            if (!img?.base64 || sid == null) return false;
            return (
              makeAnalysisSourceKey(img.sessionId, img.base64) ===
              cacheSourceKey
            );
          })());
      if (cached && cachedMeta && sid === active && keyOk) {
        setReportState(cached);
        beginRevealSequence();
        setSafetyAuditUnlocked(false);
        setSafetyScoreUnlocked(false);
        chatSessionForStorageRef.current = sid;
        const baseline = getExpertAdviceLines(cached);
        lastLinesRef.current = baseline;
        const img = getLastAnalyzedImage();
        if (img?.base64 && img.sessionId === sid) {
          threadAnchorRef.current = {
            sessionId: img.sessionId,
            base64: img.base64,
          };
        } else {
          threadAnchorRef.current = null;
        }
        setChatHistory(baseline);
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem(`${CHAT_STORAGE_PREFIX}${sid}`);
          }
        } catch {
          /* ignore */
        }
        setPanelThinkingHint(cachedMeta.thinkingHint);
      }
      return undefined;
    }, [])
  );

  const sessionImageForAudit =
    getPendingImage() ?? getLastAnalyzedImage();
  const ingredientAuditSourceKey =
    getReportMeta()?.analysisSourceKey ??
    (sessionImageForAudit
      ? makeAnalysisSourceKey(
          sessionImageForAudit.sessionId,
          sessionImageForAudit.base64
        )
      : "");

  const isIngredientListDirty = useMemo(() => {
    if (!report || workingIngredients == null) return false;
    const a = report.ingredients.map((i) => i.name.trim());
    const b = workingIngredients.map((i) => i.name.trim()).filter(Boolean);
    if (a.length !== b.length) return true;
    return a.some((n, i) => n !== b[i]);
  }, [report, workingIngredients]);

  const reportInterestKey = getReportMeta()?.analysisSourceKey;
  useEffect(() => {
    let alive = true;
    void loadUserInterestMap().then((m) => {
      if (alive) setUserInterestMap(m);
    });
    return () => {
      alive = false;
    };
  }, [reportInterestKey]);

  const refreshUserInterestMap = useCallback(() => {
    void loadUserInterestMap().then(setUserInterestMap);
  }, []);

  const onExpandedIngredientCard = useCallback(
    (expanded: boolean, name: string) => {
      if (!expanded) {
        setAskPlaceholderIngredient(null);
        return;
      }
      void loadUserInterestMap().then((m) => {
        setUserInterestMap(m);
        const ent = m[name.trim()] ?? null;
        setAskPlaceholderIngredient(
          shouldUseCuriousPlaceholder(ent) ? name : null
        );
      });
    },
    []
  );

  const scrollToAdviceSection = useCallback(() => {
    if (Platform.OS === "web") {
      const target = document.getElementById("report-must-knows-advice");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    reportScrollRef.current?.scrollTo({
      y: Math.max(0, adviceSectionYRef.current - 16),
      animated: true,
    });
  }, []);
  const openEditIngredientFlat = useCallback(
    (flatIndex: number) => {
      if (!report) return;
      const next =
        workingIngredients ?? report.ingredients.map((x) => ({ ...x }));
      if (workingIngredients == null) {
        baselineIngredientNamesRef.current = report.ingredients.map((i) =>
          i.name.trim()
        );
      }
      setWorkingIngredients(next);
      setIngredientModalDraft(next[flatIndex]?.name?.trim() ?? "");
      setIngredientModal({ mode: "edit", flatIndex: flatIndex });
    },
    [report, workingIngredients]
  );

  const openAddIngredient = useCallback(() => {
    if (!report) return;
    const productCategory = report.category === "unknown" ? undefined : report.category;
    AnalyticsService.trackIngredientModified(
      "add",
      undefined,
      undefined,
      productCategory
    );
    const next =
      workingIngredients ?? report.ingredients.map((x) => ({ ...x }));
    if (workingIngredients == null) {
      baselineIngredientNamesRef.current = report.ingredients.map((i) =>
        i.name.trim()
      );
    }
    setWorkingIngredients(next);
    setIngredientModalDraft("");
    setIngredientModal({ mode: "add" });
  }, [report, workingIngredients]);

  const deleteIngredientFlat = useCallback(
    (flatIndex: number) => {
      if (!report) return;
      const nextBase =
        workingIngredients ?? report.ingredients.map((x) => ({ ...x }));
      const originalName = nextBase[flatIndex]?.name?.trim() || undefined;
      const productCategory = report.category === "unknown" ? undefined : report.category;
      AnalyticsService.trackIngredientModified(
        "delete",
        originalName,
        undefined,
        productCategory
      );
      if (workingIngredients == null) {
        baselineIngredientNamesRef.current = report.ingredients.map((i) =>
          i.name.trim()
        );
      }
      const copy = [...nextBase];
      copy.splice(flatIndex, 1);
      setWorkingIngredients(copy);
      lastCorrectionActionRef.current = "delete";
    },
    [report, workingIngredients]
  );

  const saveIngredientModal = useCallback(async () => {
    const name = ingredientModalDraft.trim();
    if (!ingredientModal || !report) {
      setIngredientModal(null);
      return;
    }
    if (!name) {
      setIngredientModal(null);
      return;
    }
    if (ingredientModal.mode === "add") {
      const base =
        workingIngredients ?? report.ingredients.map((x) => ({ ...x }));
      if (workingIngredients == null) {
        baselineIngredientNamesRef.current = report.ingredients.map((i) =>
          i.name.trim()
        );
      }
      const newIng: AnalysisIngredient = {
        name,
        feature_tag: "Base",
        description: "",
        is_major: true,
      };
      setWorkingIngredients([...base, newIng]);
      lastCorrectionActionRef.current = "add";
      const productCategory = report.category === "unknown" ? undefined : report.category;
      AnalyticsService.trackIngredientModified(
        "add",
        undefined,
        name,
        productCategory
      );
    } else {
      const idx = ingredientModal.flatIndex;
      const base =
        workingIngredients ?? report.ingredients.map((x) => ({ ...x }));
      if (workingIngredients == null) {
        baselineIngredientNamesRef.current = report.ingredients.map((i) =>
          i.name.trim()
        );
      }
      const oldName = base[idx]?.name?.trim() ?? "";
      if (oldName && oldName !== name) {
        await mergeCorrectionEntry(oldName, name);
      }
      const copy = [...base];
      copy[idx] = { ...copy[idx], name };
      setWorkingIngredients(copy);
      lastCorrectionActionRef.current = "edit";
      const productCategory = report.category === "unknown" ? undefined : report.category;
      AnalyticsService.trackIngredientModified(
        "edit",
        oldName || undefined,
        name,
        productCategory
      );
    }
    setIngredientModal(null);
  }, [ingredientModal, ingredientModalDraft, report, workingIngredients]);


  const submitUserQuestion = async (
    rawQuestion: string,
    source: "chip" | "manual" = "manual"
  ): Promise<boolean> => {
    if (!report || reAnalyzing) return false;
    const userQuestion = rawQuestion.trim();
    if (!userQuestion) return false;
    const imageForAsk = getPendingImage() ?? getLastAnalyzedImage();
    if (!imageForAsk?.base64) {
      Alert.alert(
        "Session expired",
        "Session expired, please re-scan the product."
      );
      return false;
    }
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    setReAnalyzeError(null);
    setReAnalyzing(true);
    const cat = categoryOverride ?? report.category;
    const categoryHint = cat === "unknown" ? undefined : cat;
    AnalyticsService.trackQuerySubmitted(source, userQuestion, String(cat));
    if (!categoryHint) {
      setShowCategoryPicker(true);
      setReAnalyzeError("请先选择产品类型，再继续提问。");
      if (categoryOverride == null) setCategoryOverride("skincare");
      return false;
    }
    const mergedHint =
      panelThinkingHint ??
      (cat === "supplement" ? ("supplement" as const) : undefined);
    const ingredientText = imageForAsk.ingredientText?.trim() || undefined;
    try {
      const followUpSessionId = imageForAsk.sessionId;
      const anchor = threadAnchorRef.current;
      const threadMismatch =
        anchor != null &&
        (imageForAsk.sessionId !== anchor.sessionId ||
          imageForAsk.base64 !== anchor.base64);
      if (threadMismatch) {
        const baseline = getExpertAdviceLines(report);
        setChatHistory(baseline);
        lastLinesRef.current = baseline;
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem(
              `${CHAT_STORAGE_PREFIX}${getActiveAnalysisSessionId()}`
            );
          }
        } catch {
          /* ignore */
        }
      }
      if (anchor == null || threadMismatch) {
        threadAnchorRef.current = {
          sessionId: imageForAsk.sessionId,
          base64: imageForAsk.base64,
        };
      }
      const newData = await analyzeImage(
        imageForAsk.base64,
        imageForAsk.mimeType,
        signal,
        categoryHint,
        mergedHint,
        ingredientText,
        userQuestion,
        imageForAsk.ocrRawText
      );
      if (signal.aborted) return false;
      const currentLines = getExpertAdviceLines(newData);
      const newItems = extractNewAdviceLines(currentLines, lastLinesRef.current);
      setChatHistory((prev) => prependUniqueOrdered(newItems, prev));
      lastLinesRef.current = currentLines;
      threadAnchorRef.current = {
        sessionId: imageForAsk.sessionId,
        base64: imageForAsk.base64,
      };
      setReportState((prev) => {
        const next =
          prev != null
            ? {
                ...newData,
                ingredients: prev.ingredients,
                chartData: prev.chartData,
              }
            : newData;
        setReport(next, {
          sessionId: followUpSessionId,
          isFollowUpResponse: true,
          thinkingHint: mergedHint,
        });
        return next;
      });
      setRevealStep(MAX_REVEAL_STEP);
      const scheduleAdviceScroll = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToAdviceSection();
          });
        });
      };
      if (reportTab !== 0) {
        setReportTab(0);
      }
      scheduleAdviceScroll();
      setTimeout(scheduleAdviceScroll, 80);
      if (newData.category !== "unknown") {
        clearPendingImage();
      }
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return false;
      const hr = getHighRiskIngredientFromError(e);
      if (hr) {
        setHighRiskIngredientName(hr);
        setHighRiskModalVisible(true);
        return false;
      }
      setReAnalyzeError(
        e instanceof Error ? e.message : "Follow-up request failed"
      );
      return false;
    } finally {
      if (!signal.aborted) setReAnalyzing(false);
    }
  };

  const handleReAnalyze = async () => {
    if (reAnalyzing) return;
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
    clearRevealTimers();
    setRevealStep(0);
    try {
      const reAnalyzeThinkingHint =
        targetCategory === "supplement" ? "supplement" : undefined;
      const reIng = imageForReanalyze.ingredientText?.trim() || undefined;
      const newReport = await analyzeImage(
        imageForReanalyze.base64,
        imageForReanalyze.mimeType,
        signal,
        targetCategory,
        reAnalyzeThinkingHint,
        reIng,
        undefined,
        imageForReanalyze.ocrRawText
      );
      setPanelThinkingHint(reAnalyzeThinkingHint);
      setReport(newReport, {
        sessionId: imageForReanalyze.sessionId,
        isFollowUpResponse: false,
        thinkingHint: reAnalyzeThinkingHint,
        analysisSourceKey: makeAnalysisSourceKey(
          imageForReanalyze.sessionId,
          imageForReanalyze.base64
        ),
      });
      setReportState(newReport);
      const reLines = getExpertAdviceLines(newReport);
      setChatHistory(reLines);
      lastLinesRef.current = reLines;
      chatSessionForStorageRef.current = imageForReanalyze.sessionId;
      threadAnchorRef.current = {
        sessionId: imageForReanalyze.sessionId,
        base64: imageForReanalyze.base64,
      };
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(
            `${CHAT_STORAGE_PREFIX}${imageForReanalyze.sessionId}`
          );
        }
      } catch {
        /* ignore */
      }
      beginRevealSequence();
      setSafetyAuditUnlocked(false);
      setSafetyScoreUnlocked(false);
      setCategoryOverride(null);
      setShowCategoryPicker(false);
      setWorkingIngredients(null);
      baselineIngredientNamesRef.current = null;
      lastCorrectionActionRef.current = null;
      if (newReport.category !== "unknown") {
        clearPendingImage();
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      const hr = getHighRiskIngredientFromError(e);
      if (hr) {
        setHighRiskIngredientName(hr);
        setHighRiskModalVisible(true);
        return;
      }
      setReAnalyzeError(e instanceof Error ? e.message : "Re-analysis failed");
    } finally {
      setReAnalyzing(false);
    }
  };

  const handleConfirmReanalyzeFromCorrections = async () => {
    if (reAnalyzing) return;
    if (!report || workingIngredients == null || !isIngredientListDirty) return;
    const names = dedupeIngredientNames(
      workingIngredients.map((i) => i.name.trim())
    );
    if (names.length === 0) {
      Alert.alert(
        "Empty list",
        "Add at least one ingredient before re-analysis."
      );
      return;
    }
    const ingredientText = names.join(", ");
    if (ingredientText.length < 12) {
      Alert.alert("List too short", "Ingredient list is too short to analyze.");
      return;
    }
    const imageForReanalyze = getPendingImage() ?? getLastAnalyzedImage();
    if (!imageForReanalyze?.base64) {
      setReAnalyzeError("Image expired, please scan again");
      return;
    }
    const targetCategory: EditableCategory | null =
      categoryOverride ?? (report.category === "unknown" ? null : report.category);
    if (!targetCategory) {
      setReAnalyzeError("请先选择产品类型");
      setShowCategoryPicker(true);
      return;
    }
    const directive = buildVerifiedIngredientDirective(report.category, names);
    const before =
      baselineIngredientNamesRef.current ??
      report.ingredients.map((i) => i.name.trim());
    const action: CorrectionTrackAction =
      lastCorrectionActionRef.current ?? "edit";
    await appendCorrectionEvent({ before, after: names, action });

    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    setReAnalyzeError(null);
    setReAnalyzing(true);
    clearRevealTimers();
    setRevealStep(0);
    try {
      const reAnalyzeThinkingHint =
        targetCategory === "supplement" ? "supplement" : undefined;
      const correctionMap = await loadUserCorrectionMap();
      const newReport = await analyzeImage(
        imageForReanalyze.base64,
        imageForReanalyze.mimeType,
        signal,
        targetCategory,
        reAnalyzeThinkingHint,
        ingredientText,
        undefined,
        imageForReanalyze.ocrRawText,
        directive,
        correctionMap
      );
      setPanelThinkingHint(reAnalyzeThinkingHint);
      setReport(newReport, {
        sessionId: imageForReanalyze.sessionId,
        isFollowUpResponse: false,
        thinkingHint: reAnalyzeThinkingHint,
        analysisSourceKey: makeAnalysisSourceKey(
          imageForReanalyze.sessionId,
          imageForReanalyze.base64
        ),
      });
      setReportState(newReport);
      const reLines = getExpertAdviceLines(newReport);
      setChatHistory(reLines);
      lastLinesRef.current = reLines;
      chatSessionForStorageRef.current = imageForReanalyze.sessionId;
      threadAnchorRef.current = {
        sessionId: imageForReanalyze.sessionId,
        base64: imageForReanalyze.base64,
      };
      setLastAnalyzedImage({
        uri: imageForReanalyze.uri,
        base64: imageForReanalyze.base64,
        mimeType: imageForReanalyze.mimeType,
        ingredientText,
        ocrRawText: imageForReanalyze.ocrRawText,
      });
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(
            `${CHAT_STORAGE_PREFIX}${imageForReanalyze.sessionId}`
          );
        }
      } catch {
        /* ignore */
      }
      beginRevealSequence();
      setSafetyAuditUnlocked(false);
      setSafetyScoreUnlocked(false);
      setWorkingIngredients(null);
      baselineIngredientNamesRef.current = null;
      lastCorrectionActionRef.current = null;
      setCategoryOverride(null);
      setShowCategoryPicker(false);
      if (newReport.category !== "unknown") {
        clearPendingImage();
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      const hr = getHighRiskIngredientFromError(e);
      if (hr) {
        setHighRiskIngredientName(hr);
        setHighRiskModalVisible(true);
        return;
      }
      setReAnalyzeError(
        e instanceof Error ? e.message : "Re-analysis failed"
      );
    } finally {
      setReAnalyzing(false);
    }
  };

  const handleInitialRetry = async () => {
    const params = getAnalysisParams();
    if (!params) return;
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    pendingLoadingReportRef.current = null;
    setLoadingGotResult(false);
    setLoadingPhase("uploading");
    setLoadingExternalProgress(getLoadingPhaseRange("uploading").start);
    setAllDetectedTokens([]);
    setLoadingHasData(false);
    setInitialError(null);
    setLoadingInitial(true);
    clearRevealTimers();
    setRevealStep(0);
    kickOffLoadingFirstPass(params, signal);
    switchLoadingPhase("classifying");
    try {
      const resolved = await enrichAnalysisParamsIfNeeded(params, signal);
      applyResolvedIngredientToLoading(resolved.ingredientText);
      if (resolved.needsCategoryConfirm) {
        pendingConfirmParamsRef.current = resolved;
        setCategoryOverride(
          resolved.suggestedCategoryHint ?? resolved.categoryHint ?? "skincare"
        );
        setShowCategoryPicker(true);
        setInitialError(LOW_CONFIDENCE_CATEGORY_MESSAGE);
        setLoadingInitial(false);
        return;
      }
      switchLoadingPhase("processing");
      const result = await analyzeImage(
        resolved.base64,
        resolved.mimeType,
        signal,
        resolved.categoryHint,
        resolved.thinkingHint,
        resolved.ingredientText,
        undefined,
        resolved.ocrRawText
      );
      if (signal.aborted) return;
      const retrySid = resolved.sessionId ?? getActiveAnalysisSessionId();
      setReport(result, {
        sessionId: retrySid,
        isFollowUpResponse: false,
        thinkingHint: resolved.thinkingHint,
        analysisSourceKey: makeAnalysisSourceKey(retrySid, resolved.base64),
      });
      pendingLoadingReportRef.current = {
        result,
        base64: resolved.base64,
        mimeType: resolved.mimeType,
        ingredientText: resolved.ingredientText,
        ocrRawText: resolved.ocrRawText,
        thinkingHint: resolved.thinkingHint,
      };
      switchLoadingPhase("finishing");
      setLoadingGotResult(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      pendingLoadingReportRef.current = null;
      setLoadingGotResult(false);
      const hr = getHighRiskIngredientFromError(e);
      if (hr) {
        setHighRiskIngredientName(hr);
        setHighRiskModalVisible(true);
        return;
      }
      setInitialError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      if (signal.aborted) return;
      if (!pendingLoadingReportRef.current) {
        setLoadingInitial(false);
      }
    }
  };

  const handleInitialCategoryConfirm = async () => {
    const pending = pendingConfirmParamsRef.current;
    if (!pending) return;
    const categoryHint: EditableCategory =
      categoryOverride ?? pending.suggestedCategoryHint ?? "skincare";
    const thinkingHint: PendingAnalysisParams["thinkingHint"] =
      categoryHint === "supplement"
        ? "supplement"
        : categoryHint === "skincare" &&
            (pending.thinkingHint === "essence" || pending.thinkingHint === "cream")
          ? pending.thinkingHint
          : undefined;
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    pendingLoadingReportRef.current = null;
    setLoadingGotResult(false);
    setLoadingPhase("uploading");
    setLoadingExternalProgress(getLoadingPhaseRange("uploading").start);
    setAllDetectedTokens([]);
    setLoadingHasData(false);
    setInitialError(null);
    setLoadingInitial(true);
    setShowCategoryPicker(false);
    clearRevealTimers();
    setRevealStep(0);
    kickOffLoadingFirstPass(pending, signal);
    applyResolvedIngredientToLoading(pending.ingredientText);
    try {
      switchLoadingPhase("processing");
      const result = await analyzeImage(
        pending.base64,
        pending.mimeType,
        signal,
        categoryHint,
        thinkingHint,
        pending.ingredientText,
        undefined,
        pending.ocrRawText
      );
      if (signal.aborted) return;
      const sid = pending.sessionId ?? getActiveAnalysisSessionId();
      setReport(result, {
        sessionId: sid,
        isFollowUpResponse: false,
        thinkingHint,
        analysisSourceKey: makeAnalysisSourceKey(sid, pending.base64),
      });
      pendingLoadingReportRef.current = {
        result,
        base64: pending.base64,
        mimeType: pending.mimeType,
        ingredientText: pending.ingredientText,
        ocrRawText: pending.ocrRawText,
        thinkingHint,
      };
      switchLoadingPhase("finishing");
      setLoadingGotResult(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      pendingLoadingReportRef.current = null;
      setLoadingGotResult(false);
      const hr = getHighRiskIngredientFromError(e);
      if (hr) {
        setHighRiskIngredientName(hr);
        setHighRiskModalVisible(true);
        return;
      }
      setInitialError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      if (signal.aborted) return;
      if (!pendingLoadingReportRef.current) {
        setLoadingInitial(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      controllerRef.current.abort();
      clearRevealTimers();
    };
  }, []);

  if (!report) {
    if (loadingInitial) {
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
              <View style={styles.tags}>
                <SkeletonPill width={84} />
                <SkeletonPill width={62} />
              </View>
            </View>
            <View style={styles.sectionPlain}>
              <SkeletonLine width="86%" />
              <SkeletonLine width="94%" style={{ marginTop: 10 }} />
              <SkeletonLine width="72%" style={{ marginTop: 10 }} />
            </View>
            <View style={styles.tabRow}>
              <SkeletonBlock height={46} style={{ flex: 1 }} />
              <SkeletonBlock height={46} style={{ flex: 1 }} />
            </View>
            <View style={styles.card}>
              <Text style={styles.dnaHint}>Preparing formulation profile...</Text>
              <FormulationDonut chartData={[]} loading />
            </View>
          </ScrollView>
          <View style={styles.loadingOverlay}>
            <LoadingScreen
              key={`loading-${getAnalysisParams()?.sessionId ?? getActiveAnalysisSessionId()}`}
              {...({
                onCancel: () => controllerRef.current.abort(),
                gotResult: loadingGotResult,
                onFadeComplete: handleLoadingFadeComplete,
                streamTokens: loadingStreamTokens,
                allDetectedTokens,
                hasData: loadingHasData,
                highlightKeywords: loadingHighlightKeywords,
                backgroundImageUri: loadingBackgroundUri,
                phase: loadingPhase,
                externalProgress: loadingExternalProgress,
              } as any)}
            />
          </View>
          <HighRiskModal
            visible={highRiskModalVisible}
            ingredient={highRiskIngredientName}
            onClose={() => setHighRiskModalVisible(false)}
          />
        </View>
      );
    }
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {initialError ? initialError : "No report"}
          </Text>
          {showCategoryPicker && pendingConfirmParamsRef.current ? (
            <View style={styles.categoryPickerWrap}>
              <View style={styles.categoryRow}>
                {(["skincare", "supplement", "haircare"] as const).map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      const detectedType =
                        pendingConfirmParamsRef.current?.suggestedCategoryHint ??
                        "unknown";
                      AnalyticsService.trackCategoryCorrected(detectedType, cat);
                      setCategoryOverride(cat);
                      setReAnalyzeError(null);
                    }}
                    style={[
                      styles.categoryOption,
                      categoryOverride === cat && styles.categoryOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        categoryOverride === cat && styles.categoryOptionTextSelected,
                      ]}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={handleInitialCategoryConfirm}
                style={styles.reanalyzeButton}
              >
                <Text style={styles.reanalyzeButtonText}>Continue Analysis</Text>
              </Pressable>
            </View>
          ) : initialError ? (
            <Pressable onPress={handleInitialRetry} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
        <HighRiskModal
          visible={highRiskModalVisible}
          ingredient={highRiskIngredientName}
          onClose={() => setHighRiskModalVisible(false)}
        />
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

  const { totalWeight: safetyBinTotalWeight, binPercents: safetyBinPercents } =
    computeSafetyScoreWeightedBinPercents(report.ingredients);

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
        ref={reportScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={TEXT_PRIMARY} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        {revealStep >= 1 ? (
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
                        AnalyticsService.trackCategoryCorrected(report.category, cat);
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
        ) : (
          <View style={styles.categoryTagSection}>
            <View style={styles.tags}>
              <SkeletonPill width={84} />
              <SkeletonPill width={62} />
            </View>
          </View>
        )}

        {/* Core tags — first module */}
        {revealStep >= 1 && (coreTags.length > 0 || safetyFormulaTag) ? (
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
                loading={revealStep < 3}
              />
            </View>
          </>
        )}

        {/* Tabs below chart (or below unknown card when category is unknown) */}
        {revealStep >= 4 ? (
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
        ) : (
          <View style={styles.tabRow}>
            <SkeletonBlock height={46} style={{ flex: 1 }} />
            <SkeletonBlock height={46} style={{ flex: 1 }} />
          </View>
        )}

        {reportTab === 0 && (
          <>
        {/* Summary */}
        {revealStep >= 2 ? (
          summary.overallEvaluation?.trim() ? (
            <View style={styles.sectionPlain}>
              <Text style={[styles.cardLabel, { marginTop: 0 }]}>The Real Talk</Text>
              <Text style={styles.cardText}>{summary.overallEvaluation}</Text>
            </View>
          ) : null
        ) : (
          <View style={styles.sectionPlain}>
            <SkeletonLine width="86%" />
            <SkeletonLine width="94%" style={{ marginTop: 10 }} />
            <SkeletonLine width="72%" style={{ marginTop: 10 }} />
          </View>
        )}

        {revealStep >= 4 && chatHistory.length > 0 && (
          <View
            collapsable={false}
            nativeID="report-must-knows-advice"
            onLayout={(e) => {
              adviceSectionYRef.current = e.nativeEvent.layout.y;
            }}
            style={
              Platform.OS === "web"
                ? ({ scrollMarginTop: 12, scrollMarginBottom: 180 } as any)
                : undefined
            }
          >
            <Text style={styles.sectionTitle}>Must-Knows</Text>
            <View style={styles.adviceCardList}>
              {chatHistory.map((tip, i) => {
                const aiLine = isAiResponseAdviceLine(tip);
                const display = sanitizeAdviceDisplayLine(tip);
                const iconName = adviceLineMciName(tip, aiLine);
                return (
                  <View
                    key={`${i}-${display.slice(0, 24)}`}
                    style={styles.adviceCard}
                  >
                    <View style={styles.adviceIconCircle}>
                      <MaterialCommunityIcons
                        name={iconName}
                        size={20}
                        color="#7C3AED"
                      />
                    </View>
                    <Text style={styles.adviceCardText}>{display}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {revealStep >= 4 && summary.pros.length > 0 && (
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

        {revealStep >= 5 && showSuitabilityTop && (
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
                  <>
                    <Text style={styles.ingredientHint}>
                      High absorption ensures nutrients reach your bloodstream, while low-grade forms often lead to digestive discomfort and poor results.
                    </Text>
                    <View style={[styles.card, styles.inlineScoreCard]}>
                      <ScorePercentBar
                        percent={dynamicDetails.absorption_rate ?? null}
                      />
                    </View>
                  </>
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

        {revealStep >= 5 && synergy.length > 0 && (
          <View>
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
          </View>
        )}

        {revealStep >= 5 && summary.cons.length > 0 && (
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

        {revealStep >= 5 && suitability.avoid_groups.length > 0 && (
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

        {revealStep >= 5 && showIrritationLevel && (
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

        {revealStep >= 5 && conflicts.length > 0 && (
          <View>
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
          </View>
        )}
          </>
        )}

        {reportTab === 1 && (
          <>
            {/* Ingredients tab: not gated on revealStep — tabs unlock at step 4; step-5-only content caused permanent skeleton. */}
            {/* Safety score distribution (weighted by Major/Trace) */}
            {report.category !== "unknown" && safetyBinTotalWeight > 0 && (
              <View>
                <Text style={styles.sectionTitle}>
                  Safety Score Distribution
                </Text>
                {isSafetyScoreUnlocked ? (
                  <View style={styles.card}>
                    <SafetyScoreWeightedAreaLineChart
                      binPercents={safetyBinPercents}
                    />
                  </View>
                ) : (
                  <PaywallCard
                    onUnlock={() => setSafetyScoreUnlocked(true)}
                    title="Safety Score"
                    body="Unlock the weighted distribution chart and per-ingredient safety scores."
                    buttonText="$0.99 for 100% Safety"
                  />
                )}
              </View>
            )}

            {hasSafetyAudit && (
              <>
                <Text style={styles.sectionTitle}>Safety Audit</Text>
                {isSafetyAuditUnlocked ? (
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
                ) : (
                  <PaywallCard onUnlock={() => setSafetyAuditUnlocked(true)} />
                )}
              </>
            )}

            {!isSafetyScoreUnlocked &&
              report.ingredients.length > 0 &&
              (report.category === "unknown" || safetyBinTotalWeight <= 0) && (
                <PaywallCard
                  onUnlock={() => setSafetyScoreUnlocked(true)}
                  title="Ingredient Safety Scores"
                  body="Unlock numeric safety ratings for each ingredient in the list below."
                  buttonText="Reveal scores"
                />
              )}

            <View
              onLayout={(e) => {
                ingredientsAnchorYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <IngredientAuditList
                category={report.category}
                ingredients={workingIngredients ?? report.ingredients}
                showSafetyScore={isSafetyScoreUnlocked}
                analysisSourceKey={ingredientAuditSourceKey}
                base64Image={sessionImageForAudit?.base64 ?? ""}
                mimeType={sessionImageForAudit?.mimeType ?? "image/jpeg"}
                interestByName={userInterestMap}
                editable={report.category !== "unknown"}
                onEditFlatIndex={openEditIngredientFlat}
                onDeleteFlatIndex={deleteIngredientFlat}
                onPressAddMissing={openAddIngredient}
                onExpandedCardChange={onExpandedIngredientCard}
                onInterestUpdated={refreshUserInterestMap}
                onRequestScrollToListY={(yInList) => {
                  reportScrollRef.current?.scrollTo({
                    y: Math.max(
                      0,
                      ingredientsAnchorYRef.current + yInList - 24
                    ),
                    animated: true,
                  });
                }}
              />
            </View>
            {workingIngredients != null && isIngredientListDirty ? (
              <View style={styles.confirmReanalyzeFromListWrap}>
                <Pressable
                  onPress={handleConfirmReanalyzeFromCorrections}
                  disabled={reAnalyzing}
                  style={[
                    styles.confirmReanalyzeFromListButton,
                    reAnalyzing && styles.reanalyzeButtonDisabled,
                  ]}
                >
                  {reAnalyzing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.reanalyzeButtonText}>
                      Confirm & Re-analyze
                    </Text>
                  )}
                </Pressable>
                {reAnalyzeError ? (
                  <Text style={styles.reanalyzeError}>{reAnalyzeError}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {/* AI Disclaimer — pinned to bottom of scroll content */}
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
        <View style={styles.scrollBottomSpacer} />
      </ScrollView>
      <AskPanel
        productCategory={currentCategory ?? "skincare"}
        language="cn"
        disabled={reAnalyzing}
        onSend={submitUserQuestion}
        inputPlaceholderOverride={
          askPlaceholderIngredient
            ? `Still curious about ${askPlaceholderIngredient}? Ask for more details...`
            : null
        }
      />
      <Modal
        visible={ingredientModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setIngredientModal(null)}
      >
        <View style={styles.ingredientModalBackdrop}>
          <Pressable
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: "rgba(0,0,0,0.45)" },
            ]}
            onPress={() => setIngredientModal(null)}
          />
          <View style={styles.ingredientModalCard}>
            <Text style={styles.ingredientModalTitle}>
              {ingredientModal?.mode === "add"
                ? "Add ingredient"
                : "Edit ingredient"}
            </Text>
            <TextInput
              value={ingredientModalDraft}
              onChangeText={setIngredientModalDraft}
              placeholder="INCI / name"
              placeholderTextColor={TEXT_MUTED}
              style={styles.ingredientModalInput}
              autoFocus
              autoCorrect={false}
            />
            <View style={styles.ingredientModalActions}>
              <Pressable
                onPress={() => setIngredientModal(null)}
                style={styles.ingredientModalCancel}
              >
                <Text style={styles.ingredientModalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveIngredientModal()}
                style={styles.ingredientModalSave}
              >
                <Text style={styles.ingredientModalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <HighRiskModal
        visible={highRiskModalVisible}
        ingredient={highRiskIngredientName}
        onClose={() => setHighRiskModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
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
  scrollBottomSpacer: {
    height: 160,
    width: "100%",
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
    marginBottom: 0,
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
    textAlign: "center",
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: THEME_SOFT,
    borderWidth: 1,
    borderColor: THEME_BORDER_STRONG,
    marginBottom: 12,
  },
  retryButtonText: {
    color: THEME,
    fontSize: 14,
    fontWeight: "600",
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
  confirmReanalyzeFromListWrap: {
    marginTop: 20,
    marginBottom: MODULE_GAP,
    alignSelf: "stretch",
  },
  confirmReanalyzeFromListButton: {
    backgroundColor: "#7c3aed",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  ingredientModalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  ingredientModalCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  ingredientModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  ingredientModalInput: {
    borderWidth: 1,
    borderColor: THEME_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: TEXT_PRIMARY,
    marginBottom: 18,
  },
  ingredientModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  ingredientModalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ingredientModalCancelText: {
    color: TEXT_SECONDARY,
    fontSize: 16,
  },
  ingredientModalSave: {
    backgroundColor: THEME,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  ingredientModalSaveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  adviceCardList: {
    alignSelf: "stretch",
  },
  adviceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F5F3FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E9E4FF",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#8B5CF6",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 8px rgba(139, 92, 246, 0.08)",
        } as object)
      : {}),
  },
  adviceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  adviceCardText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: "#4C1D95",
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
