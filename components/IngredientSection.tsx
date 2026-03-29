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
import { TEXT_SECONDARY, THEME } from "../constants/theme";

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
  ingredientRow?: StyleProp<ViewStyle>;
  ingredientRowActions?: StyleProp<ViewStyle>;
  addIngredientButton?: StyleProp<ViewStyle>;
  addIngredientButtonText?: StyleProp<TextStyle>;
};

type Props = {
  category: Category;
  ingredientGroups: IngredientGroup[];
  expandedIngredientGroups: Set<number>;
  onToggleGroup: (gi: number) => void;
  isSafetyScoreUnlocked: boolean;
  styles: IngredientSectionStyles;
  editable?: boolean;
  onEditIngredient?: (groupIndex: number, itemIndex: number) => void;
  onDeleteIngredient?: (groupIndex: number, itemIndex: number) => void;
  onPressAddMissing?: () => void;
};

function isLastInGroups(
  groups: IngredientGroup[],
  gi: number,
  ii: number
): boolean {
  const lastG = groups.length - 1;
  if (gi !== lastG) return false;
  return ii === groups[lastG].items.length - 1;
}

function IngredientSectionInner({
  category,
  ingredientGroups,
  expandedIngredientGroups,
  onToggleGroup,
  isSafetyScoreUnlocked,
  styles: sx,
  editable = false,
  onEditIngredient,
  onDeleteIngredient,
  onPressAddMissing,
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
                      <View
                        key={`${group.tag}-${ing.name}-${ii}`}
                        style={[
                          { flexDirection: "row", alignItems: "flex-start", gap: 6 },
                          sx.ingredientRow,
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <IngredientCard
                            name={ing.name}
                            feature_tag={ing.feature_tag}
                            description={ing.description}
                            is_major={ing.is_major}
                            safetyScore={ing.safetyScore}
                            showSafetyScore={isSafetyScoreUnlocked}
                            hideFeatureTagBadge
                            isLast={
                              !editable &&
                              isLastInGroups(ingredientGroups, gi, ii)
                            }
                          />
                        </View>
                        {editable && onEditIngredient && onDeleteIngredient ? (
                          <View
                            style={[
                              {
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                paddingTop: 10,
                              },
                              sx.ingredientRowActions,
                            ]}
                          >
                            <Pressable
                              onPress={() => onEditIngredient(gi, ii)}
                              hitSlop={8}
                            >
                              <Ionicons
                                name="pencil"
                                size={20}
                                color={THEME}
                              />
                            </Pressable>
                            <Pressable
                              onPress={() => onDeleteIngredient(gi, ii)}
                              hitSlop={8}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={20}
                                color="#f87171"
                              />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
        {editable && onPressAddMissing && hasIngredients ? (
          <Pressable
            onPress={onPressAddMissing}
            style={[
              {
                marginTop: 14,
                paddingVertical: 10,
                alignItems: "center",
              },
              sx.addIngredientButton,
            ]}
          >
            <Text
              style={[
                { color: THEME, fontSize: 15, fontWeight: "600" },
                sx.addIngredientButtonText,
              ]}
            >
              ➕ Add Missing Ingredient
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const IngredientSection = memo(IngredientSectionInner);
