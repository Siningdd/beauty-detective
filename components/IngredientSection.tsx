import { memo } from "react";
import {
  View,
  Text,
  Pressable,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AnalysisIngredient, Category } from "../types/analysis";
import { IngredientCard } from "./IngredientCard";
import { TEXT_SECONDARY } from "../constants/theme";

export type IngredientGroup = { tag: string; items: AnalysisIngredient[] };

type IngredientSectionStyles = {
  sectionTitle: StyleProp<TextStyle>;
  ingredientHint: StyleProp<TextStyle>;
  card: StyleProp<ViewStyle>;
  cardText: StyleProp<TextStyle>;
  ingredientGroupDrawer: StyleProp<ViewStyle>;
  ingredientGroupSpaced: StyleProp<ViewStyle>;
  ingredientGroupHeader: StyleProp<ViewStyle>;
  ingredientGroupTitle: StyleProp<TextStyle>;
  ingredientGroupContent: StyleProp<ViewStyle>;
};

type Props = {
  category: Category;
  ingredientGroups: IngredientGroup[];
  expandedIngredientGroups: Set<number>;
  onToggleGroup: (gi: number) => void;
  isSafetyScoreUnlocked: boolean;
  styles: IngredientSectionStyles;
};

function IngredientSectionInner({
  category,
  ingredientGroups,
  expandedIngredientGroups,
  onToggleGroup,
  isSafetyScoreUnlocked,
  styles: sx,
}: Props) {
  const hasIngredients = ingredientGroups.some((g) => g.items.length > 0);
  return (
    <View>
      <Text style={sx.sectionTitle}>Ingredients</Text>
      {category !== "unknown" && (
        <Text style={sx.ingredientHint}>
          Our engine audits each ingredient by cross-referencing safety ratings
          and proven functions. We decode the formula to show you exactly what
          each component does and how it impacts your well-being.
        </Text>
      )}
      <View style={sx.card}>
        {!hasIngredients ? (
          <Text style={sx.cardText}>No ingredient breakdown available.</Text>
        ) : (
          ingredientGroups.map((group, gi) => {
            const expanded = expandedIngredientGroups.has(gi);
            return (
              <View
                key={group.tag}
                style={[
                  sx.ingredientGroupDrawer,
                  gi > 0 && sx.ingredientGroupSpaced,
                ]}
              >
                <Pressable
                  onPress={() => onToggleGroup(gi)}
                  style={sx.ingredientGroupHeader}
                >
                  <Text style={sx.ingredientGroupTitle}>{group.tag}</Text>
                  <Ionicons
                    name={expanded ? "chevron-down" : "chevron-forward"}
                    size={20}
                    color={TEXT_SECONDARY}
                  />
                </Pressable>
                {expanded && (
                  <View style={sx.ingredientGroupContent}>
                    {group.items.map((ing, ii) => (
                      <IngredientCard
                        key={`${group.tag}-${ing.name}-${ii}`}
                        name={ing.name}
                        feature_tag={ing.feature_tag}
                        description={ing.description}
                        is_major={ing.is_major}
                        safetyScore={ing.safetyScore}
                        showSafetyScore={isSafetyScoreUnlocked}
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
    </View>
  );
}

export const IngredientSection = memo(IngredientSectionInner);
