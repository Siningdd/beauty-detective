import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CARD_BG,
  CARD_BORDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  THEME,
  THEME_SOFT,
  THEME_BORDER_STRONG,
} from "../constants/theme";

type PaywallCardProps = {
  onUnlock: () => void;
  /** Override header; default: Safety Audit */
  title?: string;
  body?: string;
  buttonText?: string;
};

export function PaywallCard({
  onUnlock,
  title = "Safety Audit",
  body = "Unlock Full Risk Analysis & Safety Verdicts.",
  buttonText = "$0.99 for 100% Safety",
}: PaywallCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="lock-closed" size={18} color={THEME} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      <Pressable onPress={onUnlock} style={styles.button}>
        <Text style={styles.buttonText}>{buttonText}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 20,
    marginBottom: 40,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    color: THEME,
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    lineHeight: 22,
  },
  button: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: THEME_SOFT,
    borderWidth: 1,
    borderColor: THEME_BORDER_STRONG,
  },
  buttonText: {
    color: TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: "600",
  },
});
