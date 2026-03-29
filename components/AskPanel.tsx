import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
  Vibration,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  INTENT_MINI_CHIPS,
  type IntentProductCategory,
  type IntentMiniChip,
} from "../constants/intentQuestions";
import {
  getFavChipForCategory,
  trackCategoryOpen,
  trackQuestionSelect,
} from "../services/localStats";

const SEND_PURPLE = "#7C3AED";
const SEND_PURPLE_MUTED = "#C4B5FD";
const DRAWER_EXPANDED_HEIGHT = 240;

type Props = {
  productCategory: IntentProductCategory;
  language?: "cn" | "de";
  disabled?: boolean;
  onSend: (text: string, source: "chip" | "manual") => Promise<boolean>;
  /** When set, replaces default Ask placeholder (local intelligence). */
  inputPlaceholderOverride?: string | null;
};

export function AskPanel({
  productCategory,
  language = "cn",
  disabled = false,
  onSend,
  inputPlaceholderOverride,
}: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeChipId, setActiveChipId] = useState<string | null>(null);
  const [favChipId, setFavChipId] = useState<string | null>(null);
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const { width: windowWidth } = useWindowDimensions();

  const busy = disabled || submitting;
  const chips = INTENT_MINI_CHIPS[productCategory] ?? INTENT_MINI_CHIPS.skincare;

  useEffect(() => {
    let alive = true;
    void getFavChipForCategory(productCategory).then((fav) => {
      if (!alive) return;
      setFavChipId(fav);
    });
    return () => {
      alive = false;
    };
  }, [productCategory]);

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: activeChipId ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [activeChipId, drawerAnim]);

  const webLarge = Platform.OS === "web" && windowWidth > 768;
  const columnMaxWidth = webLarge
    ? Math.min(windowWidth * 0.7, 768)
    : undefined;

  const orderedChips = useMemo(() => {
    if (!favChipId) return chips;
    const fav = chips.find((c) => c.id === favChipId);
    if (!fav) return chips;
    return [fav, ...chips.filter((c) => c.id !== fav.id)];
  }, [chips, favChipId]);

  const activeChip =
    orderedChips.find((chip) => chip.id === activeChipId) ??
    chips.find((chip) => chip.id === activeChipId) ??
    null;
  const drawerMaxHeight = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, DRAWER_EXPANDED_HEIGHT],
  });

  const handleSend = async (content: string, source: "chip" | "manual") => {
    if (busy) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const success = await onSend(trimmed, source);
      if (success) setText("");
    } finally {
      setSubmitting(false);
    }
  };
  const onMiniChipPress = (chip: IntentMiniChip) => {
    if (busy) return;
    Vibration.vibrate(10);
    const shouldOpen = activeChipId !== chip.id;
    setActiveChipId((prev) => (prev === chip.id ? null : chip.id));
    if (!shouldOpen) return;
    void trackCategoryOpen(productCategory, chip.id).then((result) => {
      if (result.favChipId) setFavChipId(result.favChipId);
    });
  };

  const onQuestionPress = (question: string) => {
    if (busy || !activeChip) return;
    const selectedChip = activeChip;
    setActiveChipId(null);
    void trackQuestionSelect(productCategory, selectedChip.id, question);
    void handleSend(question, "chip");
  };

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
              {orderedChips.map((chip) => (
                <Pressable
                  key={chip.id}
                  style={({ pressed }) => [
                    styles.miniChip,
                    favChipId === chip.id && styles.miniChipFav,
                    activeChipId === chip.id && styles.miniChipActive,
                    busy && styles.miniChipDisabled,
                    pressed && !busy && styles.miniChipPressed,
                  ]}
                  disabled={busy}
                  onPress={() => onMiniChipPress(chip)}
                >
                  <Text style={styles.miniChipIcon}>{chip.icon}</Text>
                  <Text style={styles.miniChipText}>{chip.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Animated.View
              style={[
                styles.drawerAnimatedWrap,
                {
                  maxHeight: drawerMaxHeight,
                  opacity: drawerAnim,
                },
              ]}
            >
              <View style={styles.drawerCard}>
                {activeChip ? (
                  <>
                    <Text style={styles.drawerTitle}>
                      {activeChip.icon} {activeChip.label}
                    </Text>
                    {activeChip.questions.map((question) => (
                      <Pressable
                        key={`${activeChip.id}-${question}`}
                        style={({ pressed }) => [
                          styles.questionRow,
                          pressed && styles.questionRowPressed,
                        ]}
                        disabled={busy}
                        onPress={() => onQuestionPress(question)}
                      >
                        <Text style={styles.questionText}>{question}</Text>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color="#6B7280"
                        />
                      </Pressable>
                    ))}
                  </>
                ) : null}
              </View>
            </Animated.View>
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
                    inputPlaceholderOverride?.trim()
                      ? inputPlaceholderOverride.trim()
                      : language === "de"
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
                onPress={() => void handleSend(text, "manual")}
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
  },
  pillsScrollHost: {
    flexGrow: 0,
  },
  pillsScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    flexWrap: "nowrap",
    gap: 8,
  },
  miniChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 12,
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
  miniChipFav: {
    borderColor: "#C4B5FD",
    backgroundColor: "#F5F3FF",
  },
  miniChipActive: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F3F0FF",
  },
  miniChipDisabled: { opacity: 0.5 },
  miniChipPressed: { opacity: 0.85 },
  miniChipIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  miniChipText: { fontSize: 13, color: "#3C4043", fontWeight: "600" },
  drawerAnimatedWrap: {
    overflow: "hidden",
    marginTop: 8,
  },
  drawerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EAED",
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
  },
  drawerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECEFF3",
  },
  questionRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  questionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#1F2937",
    fontWeight: "500",
  },
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
