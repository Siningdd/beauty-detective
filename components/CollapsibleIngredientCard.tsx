import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AnalysisIngredient, Category } from "../types/analysis";
import { lookupIngredient } from "../constants/ingredientDict";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  THEME,
  THEME_SOFT,
} from "../constants/theme";
import { SimpleMarkdownText } from "./SimpleMarkdownText";
import { fetchIngredientDeepDive } from "../services/api";
import {
  getCachedDeepDive,
  setCachedDeepDive,
} from "../services/ingredientDeepDiveCache";
import {
  logInteraction,
  shouldShowFrequentBadge,
  shouldDefaultExpand,
  type IngredientInterestEntry,
} from "../services/userInterestService";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  rank: number;
  ingredient: AnalysisIngredient;
  category: Category;
  showSafetyScore: boolean;
  analysisSourceKey: string;
  base64Image: string;
  mimeType: string;
  interest: IngredientInterestEntry | null;
  editable?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onExpandedChange?: (expanded: boolean, name: string) => void;
  onRequestScrollToCard?: () => void;
  onInterestUpdated?: () => void;
};

const NO_DESC_TAGS = new Set([
  "Fragrance",
  "Preservative",
  "Base",
  "Fillers",
  "Capsule-Shell",
  "Flavor/Fragrance",
]);

const FALLBACK_SAFETY = 70;

function safetyBadgeStyle(score: number): { bg: string; text: string } {
  if (score >= 60) return { bg: "rgba(13, 148, 136, 0.2)", text: "#0d9488" };
  if (score > 30) return { bg: "rgba(249, 115, 22, 0.2)", text: "#f97316" };
  return { bg: "rgba(248, 113, 113, 0.2)", text: "#f87171" };
}

export function CollapsibleIngredientCard({
  rank,
  ingredient,
  category,
  showSafetyScore: _showSafetyScore,
  analysisSourceKey,
  base64Image,
  mimeType,
  interest,
  editable,
  onEdit,
  onDelete,
  onExpandedChange,
  onRequestScrollToCard,
  onInterestUpdated,
}: Props) {
  void _showSafetyScore;
  const [expanded, setExpanded] = useState(() => shouldDefaultExpand(interest));
  const [deepVisible, setDeepVisible] = useState(false);
  const [deepMd, setDeepMd] = useState<string | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);
  const prevExpandedRef = useRef(false);

  useEffect(() => {
    if (shouldDefaultExpand(interest)) setExpanded(true);
  }, [interest]);

  useEffect(() => {
    if (expanded && !prevExpandedRef.current) {
      prevExpandedRef.current = true;
      void (async () => {
        await logInteraction(ingredient.name, "view");
        onExpandedChange?.(true, ingredient.name);
      })();
      onRequestScrollToCard?.();
    } else if (!expanded && prevExpandedRef.current) {
      prevExpandedRef.current = false;
      onExpandedChange?.(false, ingredient.name);
    }
  }, [expanded, ingredient.name, onExpandedChange, onRequestScrollToCard]);

  const frequent = shouldShowFrequentBadge(interest);
  const omitDesc = NO_DESC_TAGS.has(ingredient.feature_tag);
  const displayDesc =
    omitDesc || !ingredient.description?.trim()
      ? null
      : ingredient.description.trim();

  const dictEntry = lookupIngredient(ingredient.name);
  const safetyScoreForDisplay =
    typeof ingredient.safetyScore === "number"
      ? ingredient.safetyScore
      : (dictEntry?.safetyScore ?? FALLBACK_SAFETY);
  const sbPanel = safetyBadgeStyle(safetyScoreForDisplay);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }, []);

  const runDeepDive = useCallback(async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDeepVisible(true);
    setDeepError(null);
    requestAnimationFrame(() => {
      onRequestScrollToCard?.();
    });

    const cached = await getCachedDeepDive(
      analysisSourceKey,
      ingredient.name
    );
    if (cached) {
      setDeepMd(cached);
      return;
    }

    if (category === "unknown") {
      setDeepError("Select a product category first.");
      return;
    }

    setDeepLoading(true);
    try {
      const md = await fetchIngredientDeepDive({
        base64Image,
        mimeType,
        category,
        ingredientName: ingredient.name,
        featureTag: ingredient.feature_tag,
        descriptionSnippet: displayDesc ?? "",
        isMajor: ingredient.is_major,
        ...(typeof ingredient.safetyScore === "number"
          ? { safetyScore: ingredient.safetyScore }
          : {}),
      });
      setDeepMd(md);
      await setCachedDeepDive(analysisSourceKey, ingredient.name, md);
      await logInteraction(ingredient.name, "ask");
      onInterestUpdated?.();
    } catch (e) {
      setDeepError(e instanceof Error ? e.message : "Deep dive failed");
    } finally {
      setDeepLoading(false);
    }
  }, [
    analysisSourceKey,
    base64Image,
    mimeType,
    category,
    ingredient,
    displayDesc,
    onRequestScrollToCard,
    onInterestUpdated,
  ]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.rankPill}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <View style={styles.headerNameBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>
              {ingredient.name}
            </Text>
            {editable && onEdit ? (
              <Pressable onPress={onEdit} hitSlop={10} style={styles.pencilHit}>
                <Ionicons name="pencil" size={18} color={THEME} />
              </Pressable>
            ) : null}
            {frequent ? <Text style={styles.fireBadge}>🔥</Text> : null}
          </View>
        </View>
        <Pressable
          onPress={toggle}
          hitSlop={12}
          style={styles.chevronHit}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Collapse" : "Expand"}
        >
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={22}
            color={TEXT_SECONDARY}
          />
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.metaPanel}>
            <View style={[styles.tagPill, { backgroundColor: THEME_SOFT }]}>
              <Text style={[styles.tagText, { color: THEME }]}>
                {ingredient.feature_tag}
              </Text>
            </View>
            <View
              style={[
                styles.levelPill,
                ingredient.is_major ? styles.levelMajor : styles.levelTrace,
              ]}
            >
              <Text
                style={[
                  styles.levelText,
                  ingredient.is_major
                    ? styles.levelTextMajor
                    : styles.levelTextTrace,
                ]}
              >
                {ingredient.is_major ? "Major" : "Trace"}
              </Text>
            </View>
            <View style={[styles.scorePill, { backgroundColor: sbPanel.bg }]}>
              <Text style={[styles.scoreText, { color: sbPanel.text }]}>
                Safety {safetyScoreForDisplay}
              </Text>
            </View>
          </View>

          {displayDesc ? (
            <Text style={styles.desc}>{displayDesc}</Text>
          ) : !omitDesc ? (
            <Text style={styles.descMuted}>
              No description for this ingredient.
            </Text>
          ) : null}

          <Pressable
            onPress={() => void runDeepDive()}
            style={({ pressed }) => [
              styles.deepBtn,
              pressed && styles.deepBtnPressed,
              deepLoading && styles.deepBtnDisabled,
            ]}
            disabled={deepLoading}
          >
            <Text style={styles.deepBtnText}>🔬 Deep Dive</Text>
          </Pressable>

          {deepVisible ? (
            <View style={styles.deepBox}>
              {deepLoading ? (
                <ActivityIndicator color={THEME} />
              ) : deepError ? (
                <Text style={styles.errText}>{deepError}</Text>
              ) : deepMd ? (
                <SimpleMarkdownText markdown={deepMd} />
              ) : null}
            </View>
          ) : null}

          {editable && onDelete ? (
            <Pressable onPress={onDelete} style={styles.deleteRow} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={TEXT_SECONDARY} />
              <Text style={styles.deleteText}>Remove from list</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    backgroundColor: "rgba(255,255,255,0.6)",
    marginBottom: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  rankPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { fontSize: 14, fontWeight: "800", color: THEME },
  headerNameBlock: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  pencilHit: { padding: 2 },
  fireBadge: { fontSize: 16 },
  chevronHit: { padding: 4, marginLeft: "auto" },
  metaPanel: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginTop: 2,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: { fontSize: 11, fontWeight: "600" },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  levelMajor: { backgroundColor: "rgba(13, 148, 136, 0.15)" },
  levelTrace: { backgroundColor: "rgba(148, 163, 184, 0.2)" },
  levelText: { fontSize: 11, fontWeight: "700" },
  levelTextMajor: { color: "#0d9488" },
  levelTextTrace: { color: TEXT_SECONDARY },
  scorePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreText: { fontSize: 11, fontWeight: "800" },
  body: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148, 163, 184, 0.35)",
  },
  desc: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_PRIMARY,
  },
  descMuted: {
    fontSize: 13,
    lineHeight: 20,
    color: TEXT_SECONDARY,
    fontStyle: "italic",
  },
  deepBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "rgba(124, 58, 237, 0.12)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.35)",
  },
  deepBtnPressed: { opacity: 0.85 },
  deepBtnDisabled: { opacity: 0.55 },
  deepBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5b21b6",
  },
  deepBox: {
    backgroundColor: "rgba(245, 243, 255, 0.9)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
  },
  errText: { color: "#dc2626", fontSize: 13 },
  deleteRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginTop: 6,
  },
  deleteText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
});
