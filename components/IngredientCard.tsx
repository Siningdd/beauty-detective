import { View, Text, StyleSheet } from "react-native";
import { lookupIngredient } from "../constants/ingredientDict";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  THEME,
  THEME_SOFT,
} from "../constants/theme";

const FALLBACK_DESCRIPTION = "Supporting formula component";
const FALLBACK_SAFETY = 70;

/** feature_tags for which we omit actions/description display */
const NO_ACTIONS_TAGS = new Set([
  "Fragrance",
  "Preservative",
  "Base",
  "Fillers",
  "Capsule-Shell",
  "Flavor/Fragrance",
]);

function safetyBadgeStyle(score: number): { bg: string; text: string } {
  if (score >= 60) return { bg: "rgba(13, 148, 136, 0.2)", text: "#0d9488" };
  if (score > 30) return { bg: "rgba(249, 115, 22, 0.2)", text: "#f97316" };
  return { bg: "rgba(248, 113, 113, 0.2)", text: "#f87171" };
}

interface IngredientCardProps {
  name: string;
  feature_tag: string;
  description?: string;
  is_major: boolean;
  safetyScore?: number;
  isLast?: boolean;
  /** When list is grouped by feature_tag, hide the duplicate tag pill */
  hideFeatureTagBadge?: boolean;
  /** When false, safety badge shows a placeholder (paywall) */
  showSafetyScore?: boolean;
}

export function IngredientCard({
  name,
  feature_tag,
  description: aiDesc,
  is_major,
  safetyScore: aiSafety,
  isLast,
  hideFeatureTagBadge,
  showSafetyScore = true,
}: IngredientCardProps) {
  const dictEntry = lookupIngredient(name);
  const omitActions = NO_ACTIONS_TAGS.has(feature_tag);
  const displayDesc = omitActions
    ? null
    : (aiDesc && aiDesc.trim()) || dictEntry?.description || FALLBACK_DESCRIPTION;
  const safetyScore =
    typeof aiSafety === "number"
      ? aiSafety
      : (dictEntry?.safetyScore ?? FALLBACK_SAFETY);
  const sb = showSafetyScore
    ? safetyBadgeStyle(safetyScore)
    : { bg: "rgba(148, 163, 184, 0.2)", text: TEXT_SECONDARY };

  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.name}>{name}</Text>
      <View style={styles.meta}>
        <View style={styles.badgeRow}>
          {!hideFeatureTagBadge && (
            <View style={[styles.tagBadge, { backgroundColor: THEME_SOFT }]}>
              <Text style={[styles.tagText, { color: THEME }]}>{feature_tag}</Text>
            </View>
          )}
          <View
            style={[
              styles.levelBadge,
              is_major ? styles.levelMajor : styles.levelTrace,
            ]}
          >
            <Text
              style={[
                styles.levelText,
                is_major ? styles.levelTextMajor : styles.levelTextTrace,
              ]}
            >
              {is_major ? "Major" : "Trace"}
            </Text>
          </View>
          <View style={[styles.safetyBadge, { backgroundColor: sb.bg }]}>
            <Text style={[styles.safetyText, { color: sb.text }]}>
              Safety: {showSafetyScore ? safetyScore : "—"}
            </Text>
          </View>
        </View>
        {displayDesc != null && (
          <Text style={styles.desc}>{displayDesc}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 41, 59, 0.08)",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  name: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  meta: {
    gap: 4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    marginBottom: 4,
  },
  tagBadge: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  levelBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  levelMajor: {
    backgroundColor: "rgba(94, 234, 212, 0.15)",
  },
  levelTrace: {
    backgroundColor: "rgba(148, 163, 184, 0.2)",
  },
  levelText: {
    fontSize: 11,
    fontWeight: "600",
  },
  levelTextMajor: {
    color: THEME,
  },
  levelTextTrace: {
    color: TEXT_SECONDARY,
  },
  safetyBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  safetyText: {
    fontSize: 11,
    fontWeight: "600",
  },
  desc: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 20,
  },
});
