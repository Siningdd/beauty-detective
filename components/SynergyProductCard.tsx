import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
} from "react-native";
import type { SynergyItem } from "../types/analysis";
import {
  CARD_BG,
  CARD_BORDER,
  TEXT_PRIMARY,
  THEME,
  THEME_SOFT,
} from "../constants/theme";

const DEFAULT_PRODUCT_NAME = "La Roche-Posay Thermal Spring Water";
const TAG_FALLBACK = "partner_ingredient";

interface SynergyProductCardProps {
  item: SynergyItem;
  isLast?: boolean;
}

function buildBuySearchUrl(productTitle: string): string {
  const q = encodeURIComponent(productTitle);
  return `https://www.google.com/search?tbm=shop&q=${q}`;
}

export function SynergyProductCard({ item, isLast }: SynergyProductCardProps) {
  const productTitle =
    item.benefit?.trim() || DEFAULT_PRODUCT_NAME;
  const tagText =
    item.partner_ingredient?.trim() || TAG_FALLBACK;
  const whyText = item.description?.trim();

  const onBuy = () => {
    const url = buildBuySearchUrl(productTitle);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.card, isLast && styles.cardLast]}>
      <View style={styles.body}>
        <View style={styles.bodyMain}>
          <Text style={styles.title} numberOfLines={2}>
            {productTitle}
          </Text>
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{tagText}</Text>
          </View>
          {whyText ? (
            <>
              <Text style={styles.whyBody}>{whyText}</Text>
            </>
          ) : null}
        </View>
        <Pressable
          onPress={onBuy}
          style={({ pressed }) => [
            styles.buyBtn,
            pressed && styles.buyBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${productTitle}`}
          hitSlop={6}
        >
          <Text style={styles.buyBtnText}>Buy</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 100,
    backgroundColor: CARD_BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardLast: {
    marginBottom: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 10,
    gap: 10,
  },
  bodyMain: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    minHeight: 36,
    marginBottom: 4,
  },
  tagPill: {
    alignSelf: "flex-start",
    backgroundColor: THEME_SOFT,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  tagText: {
    color: THEME,
    fontSize: 11,
    fontWeight: "600",
  },
  whyLabel: {
    color: THEME,
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  whyBody: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    lineHeight: 17,
  },
  buyBtn: {
    flexShrink: 0,
    alignSelf: "center",
    backgroundColor: THEME,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 72,
    alignItems: "center",
  },
  buyBtnPressed: {
    opacity: 0.88,
  },
  buyBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
