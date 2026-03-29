import { useCallback, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from "react-native";
import type { AnalysisIngredient, Category } from "../types/analysis";
import { CollapsibleIngredientCard } from "./CollapsibleIngredientCard";
import type { IngredientInterestEntry } from "../services/userInterestService";
import { TEXT_SECONDARY } from "../constants/theme";

const MODULE_GAP_LOCAL = 40;
const MODULE_TITLE_SIZE_LOCAL = 16;

type Props = {
  category: Category;
  ingredients: AnalysisIngredient[];
  showSafetyScore: boolean;
  analysisSourceKey: string;
  base64Image: string;
  mimeType: string;
  interestByName: Record<string, IngredientInterestEntry | null>;
  editable?: boolean;
  onEditFlatIndex?: (index: number) => void;
  onDeleteFlatIndex?: (index: number) => void;
  onPressAddMissing?: () => void;
  onExpandedCardChange?: (expanded: boolean, name: string) => void;
  onRequestScrollToListY?: (yInList: number) => void;
  onInterestUpdated?: () => void;
};

export function IngredientAuditList({
  category,
  ingredients,
  showSafetyScore,
  analysisSourceKey,
  base64Image,
  mimeType,
  interestByName,
  editable,
  onEditFlatIndex,
  onDeleteFlatIndex,
  onPressAddMissing,
  onExpandedCardChange,
  onRequestScrollToListY,
  onInterestUpdated,
}: Props) {
  const rowYRef = useRef<number[]>([]);
  const rowRefs = useRef<Array<View | null>>([]);
  const listRootRef = useRef<View | null>(null);
  const [listH, setListH] = useState(0);

  const data = useMemo(() => ingredients, [ingredients]);

  const onRowLayout = useCallback((index: number, e: LayoutChangeEvent) => {
    rowYRef.current[index] = e.nativeEvent.layout.y;
  }, []);

  const scrollToRow = useCallback(
    (index: number) => {
      const fallbackY = rowYRef.current[index];
      const rowRef = rowRefs.current[index];
      const listRoot = listRootRef.current;

      if (
        rowRef &&
        listRoot &&
        typeof rowRef.measureLayout === "function"
      ) {
        rowRef.measureLayout(
          listRoot,
          (_x, measuredY) => {
            onRequestScrollToListY?.(measuredY);
          },
          () => {
            if (typeof fallbackY === "number") {
              onRequestScrollToListY?.(fallbackY);
            }
          }
        );
        return;
      }

      if (typeof fallbackY === "number") onRequestScrollToListY?.(fallbackY);
    },
    [onRequestScrollToListY]
  );

  const renderItem = useCallback(
    ({
      item,
      index,
    }: {
      item: AnalysisIngredient;
      index: number;
    }) => (
      <View
        ref={(el) => {
          rowRefs.current[index] = el;
        }}
        onLayout={(e) => onRowLayout(index, e)}
        collapsable={false}
      >
        <CollapsibleIngredientCard
          rank={index + 1}
          ingredient={item}
          category={category}
          showSafetyScore={showSafetyScore}
          analysisSourceKey={analysisSourceKey}
          base64Image={base64Image}
          mimeType={mimeType}
          interest={interestByName[item.name.trim()] ?? null}
          editable={editable}
          onEdit={
            onEditFlatIndex ? () => onEditFlatIndex(index) : undefined
          }
          onDelete={
            onDeleteFlatIndex ? () => onDeleteFlatIndex(index) : undefined
          }
          onExpandedChange={onExpandedCardChange}
          onInterestUpdated={onInterestUpdated}
          onRequestScrollToCard={() => scrollToRow(index)}
        />
      </View>
    ),
    [
      category,
      showSafetyScore,
      analysisSourceKey,
      base64Image,
      mimeType,
      interestByName,
      editable,
      onEditFlatIndex,
      onDeleteFlatIndex,
      onExpandedCardChange,
      onInterestUpdated,
      onRowLayout,
      scrollToRow,
    ]
  );

  const hasItems = data.length > 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Ingredients</Text>
      {category !== "unknown" && (
        <Text style={styles.hint}>
          Tap a card to expand. Use Deep Dive for a focused AI note on that
          ingredient (cached per product). Your opens are remembered on-device
          to personalize badges and defaults.
        </Text>
      )}
      {!hasItems ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No ingredient breakdown available.
          </Text>
          {editable && onPressAddMissing ? (
            <Pressable onPress={onPressAddMissing} style={styles.addBtn}>
              <Text style={styles.addBtnText}>➕ Add Missing Ingredient</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View ref={listRootRef} collapsable={false}>
          <FlatList
            data={data}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            renderItem={renderItem}
            scrollEnabled={false}
            nestedScrollEnabled
            onContentSizeChange={(_, h) => setListH(h)}
            style={{ minHeight: listH > 0 ? listH : 1 }}
            ListFooterComponent={
              editable && onPressAddMissing ? (
                <Pressable
                  onPress={onPressAddMissing}
                  style={styles.addBtnFooter}
                >
                  <Text style={styles.addBtnText}>➕ Add Missing Ingredient</Text>
                </Pressable>
              ) : null
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: MODULE_GAP_LOCAL,
    alignSelf: "stretch",
  },
  sectionTitle: {
    fontSize: MODULE_TITLE_SIZE_LOCAL,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  hint: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_SECONDARY,
    marginBottom: 16,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  emptyText: { color: TEXT_SECONDARY, fontSize: 14 },
  addBtn: { marginTop: 14, alignItems: "center", paddingVertical: 10 },
  addBtnFooter: { marginTop: 14, marginBottom: 8, alignItems: "center" },
  addBtnText: { fontSize: 15, fontWeight: "600", color: "#7c3aed" },
});
