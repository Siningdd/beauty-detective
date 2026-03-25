import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import type { PendingAnalysisParams } from "../services/store";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const SEND_PURPLE = "#7C3AED";
const SEND_PURPLE_MUTED = "#C4B5FD";

type PillConfig = { cn: string[]; de: string[] };

const PILL_CONFIG: Record<
  "essence" | "cream" | "supplement" | "default",
  PillConfig
> = {
  essence: {
    cn: ["How to layer?", "Sensitive skin safe?", "Daytime use?"],
    de: ["Anwendung?", "Für sensible Haut?", "Tagespflege?"],
  },
  cream: {
    cn: ["Does it pill", "Is it greasy?", "Too heavy?"],
    de: ["Krümelt es?", "Fettig?", "Okklusiv?"],
  },
  supplement: {
    cn: ["How to take it?", "Before or after meal?", "Any conflicts?"],
    de: ["Einnahme?", "Vor/nach Essen?", "Wechselwirkungen?"],
  },
  default: {
    cn: ["Side effects?", "Is it for me?", "Safe ingredients?"],
    de: ["Nebenwirkungen?", "Für mich?", "Inhaltsstoffe?"],
  },
};

type ExtraChip = { label: string; query: string };

type Props = {
  thinkingHint?: PendingAnalysisParams["thinkingHint"];
  language?: "cn" | "de";
  disabled?: boolean;
  onSend: (text: string) => Promise<boolean>;
  extraChips?: ExtraChip[];
};

export function AskPanel({
  thinkingHint,
  language = "cn",
  disabled = false,
  onSend,
  extraChips = [],
}: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { width: windowWidth } = useWindowDimensions();

  const busy = disabled || submitting;

  const pillKey: keyof typeof PILL_CONFIG =
    thinkingHint === "essence" ||
    thinkingHint === "cream" ||
    thinkingHint === "supplement"
      ? thinkingHint
      : "default";
  const starterLines =
    language === "de" ? PILL_CONFIG[pillKey].de : PILL_CONFIG[pillKey].cn;

  const webLarge = Platform.OS === "web" && windowWidth > 768;
  const columnMaxWidth = webLarge
    ? Math.min(windowWidth * 0.7, 768)
    : undefined;

  const handleSend = async (content: string) => {
    if (busy) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const success = await onSend(trimmed);
      if (success) setText("");
    } finally {
      setSubmitting(false);
    }
  };

  const pillNodes = [
    ...extraChips.map((c) => ({ key: `x-${c.label}`, label: c.label, q: c.query })),
    ...starterLines.map((p, i) => ({ key: `s-${i}-${p}`, label: p, q: p })),
  ];

  const kavBehavior = Platform.OS === "ios" ? "padding" : undefined;
  const kavOffset = Platform.OS === "ios" ? 90 : 0;

  return (
    <View style={styles.positionShell} pointerEvents="box-none">
      <KeyboardAvoidingView
        behavior={kavBehavior}
        keyboardVerticalOffset={kavOffset}
        style={styles.kav}
      >
        <View
          style={[styles.column, columnMaxWidth != null && { maxWidth: columnMaxWidth }]}
          pointerEvents="box-none"
        >
          <View style={styles.pillsBlock} pointerEvents="auto">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillsScrollHost}
              contentContainerStyle={styles.pillsScroll}
              keyboardShouldPersistTaps="handled"
            >
              {pillNodes.map((p) => (
                <Pressable
                  key={p.key}
                  style={({ pressed }) => [
                    styles.pill,
                    busy && styles.pillDisabled,
                    pressed && !busy && styles.pillPressed,
                  ]}
                  disabled={busy}
                  onPress={() => void handleSend(p.q)}
                >
                  <Text style={styles.pillText}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.capsuleRow} pointerEvents="auto">
            <View
              style={[styles.inputCapsule, busy && styles.inputCapsuleDisabled]}
            >
              <View
                style={styles.inputWrap}
                pointerEvents={busy ? "none" : "auto"}
              >
                <TextInput
                  style={[styles.input, busy && styles.inputDisabled]}
                  placeholder={
                    language === "de"
                      ? "Fragen..."
                      : "🎁 Limited Offer: Pro Expert Q&A is Free Today"
                  }
                  placeholderTextColor="#9AA0A6"
                  multiline
                  value={text}
                  onChangeText={setText}
                  editable={!busy}
                  readOnly={busy}
                  {...(Platform.OS === "web"
                    ? ({ tabIndex: busy ? -1 : 0 } as any)
                    : {})}
                />
              </View>
              <Pressable
                style={[
                  busy ? styles.sendButtonBusy : styles.sendButton,
                  !busy && {
                    backgroundColor: text.trim() ? SEND_PURPLE : "#F1F3F4",
                  },
                ]}
                disabled={busy || !text.trim()}
                onPress={() => void handleSend(text)}
              >
                {busy ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.thinkingLabel}>thinking</Text>
                  </>
                ) : (
                  <MaterialCommunityIcons
                    name="send"
                    size={20}
                    color={text.trim() ? "#FFFFFF" : SEND_PURPLE_MUTED}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  positionShell: {
    ...Platform.select({
      web: {
        position: "fixed" as any,
        bottom: 0,
        left: 0,
        right: 0,
      },
      default: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
      },
    }),
    zIndex: 1000,
    backgroundColor:
      Platform.OS === "web" ? "rgba(255,255,255,0.95)" : "transparent",
    borderTopWidth: Platform.OS === "web" ? StyleSheet.hairlineWidth : 0,
    borderTopColor: "#E8EAED",
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    paddingTop: 8,
    alignItems: "center",
  },
  kav: {
    width: "100%",
    alignItems: "center",
  },
  column: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  pillsBlock: {
    marginBottom: 10,
    maxHeight: 52,
    overflow: "hidden",
  },
  pillsScrollHost: {
    flexGrow: 0,
    maxHeight: 52,
  },
  pillsScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    flexWrap: "nowrap",
    gap: 8,
  },
  pill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E8EAED",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
      default: {},
    }),
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
        } as object)
      : {}),
  },
  pillDisabled: { opacity: 0.5 },
  pillPressed: { opacity: 0.85 },
  pillText: { fontSize: 13, color: "#3C4043", fontWeight: "500" },
  capsuleRow: {
    width: "100%",
  },
  inputCapsule: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E8EAED",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        } as object)
      : {}),
  },
  inputCapsuleDisabled: {
    backgroundColor: "#F1F3F4",
    borderColor: "#DADCE0",
    ...Platform.select({
      ios: {
        shadowOpacity: 0.04,
      },
      android: { elevation: 2 },
      default: {},
    }),
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        } as object)
      : {}),
  },
  inputWrap: {
    flex: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    color: "#202124",
    paddingTop: Platform.OS === "ios" ? 8 : 4,
    paddingBottom: Platform.OS === "ios" ? 8 : 4,
  },
  inputDisabled: {
    color: "#80868B",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  sendButtonBusy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: SEND_PURPLE,
    marginLeft: 10,
  },
  thinkingLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
