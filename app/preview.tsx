import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  getPendingImage,
  clearPendingImage,
  setPendingImage,
  setAnalysisParams,
} from "../services/store";
import {
  detectOcrAndHints,
  resolveHintDecision,
} from "../services/ocrDetect";
import {
  BG,
  BUTTON_GRADIENT,
  CARD_BG,
  TEXT_MUTED,
  TEXT_PRIMARY,
  THEME_BORDER,
} from "../constants/theme";

export default function PreviewScreen() {
  const router = useRouter();
  const controllerRef = useRef(new AbortController());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didNavigateRef = useRef(false);
  const [pending, setPending] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
    ingredientText?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknownIngredientText, setUnknownIngredientText] = useState<string | null>(
    null
  );

  useEffect(() => {
    setPending(getPendingImage());
  }, []);

  const clearJumpTimer = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const jumpToReport = () => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    clearJumpTimer();
    router.replace("/report");
  };

  const handleBack = () => {
    controllerRef.current.abort();
    clearJumpTimer();
    didNavigateRef.current = false;
    setUnknownIngredientText(null);
    setLoading(false);
    clearPendingImage();
    router.back();
  };

  const submitManualCategory = (options: {
    categoryHint: "skincare" | "supplement" | "haircare";
    thinkingHint?: "supplement" | "essence" | "cream";
  }) => {
    if (!pending || !unknownIngredientText) return;
    setAnalysisParams({
      base64: pending.base64,
      mimeType: pending.mimeType,
      categoryHint: options.categoryHint,
      thinkingHint: options.thinkingHint,
      ingredientText: unknownIngredientText,
    });
    setUnknownIngredientText(null);
    setLoading(true);
    jumpToReport();
  };

  const handleConfirm = async () => {
    if (!pending) return;
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    clearJumpTimer();
    didNavigateRef.current = false;

    setError(null);
    setLoading(true);
    // Always hand off the minimal payload so report can continue immediately.
    setPendingImage({
      uri: pending.uri,
      base64: pending.base64,
      mimeType: pending.mimeType,
    });
    setAnalysisParams({
      base64: pending.base64,
      mimeType: pending.mimeType,
    });
    timerRef.current = setTimeout(() => {
      if (signal.aborted) return;
      jumpToReport();
    }, 1500);
    try {
      const detected = await detectOcrAndHints({
        uri: pending.uri,
        base64: pending.base64,
      });
      const ingredientText = detected.correctedText || detected.rawOcrText;
      const resolved = resolveHintDecision({
        confidenceHint: detected.confidenceHint,
        categoryHint: detected.categoryHint,
        thinkingHint: detected.thinkingHint,
      });
      setPendingImage({
        uri: pending.uri,
        base64: pending.base64,
        mimeType: pending.mimeType,
        ingredientText,
      });
      if (!resolved) {
        if (signal.aborted || didNavigateRef.current) return;
        clearJumpTimer();
        setLoading(false);
        setUnknownIngredientText(ingredientText || "");
        return;
      }
      setAnalysisParams({
        base64: pending.base64,
        mimeType: pending.mimeType,
        categoryHint: resolved.categoryHint,
        thinkingHint: resolved.thinkingHint,
        ingredientText,
      });
      if (signal.aborted) return;
      jumpToReport();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      clearJumpTimer();
      didNavigateRef.current = false;
      setError(e instanceof Error ? e.message : "Analysis failed");
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      controllerRef.current.abort();
      clearJumpTimer();
    };
  }, []);

  if (!pending) {
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No image</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <View style={styles.content}>
          <Pressable onPress={handleBack} style={styles.topBar}>
            <Ionicons name="arrow-back" size={24} color={TEXT_PRIMARY} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <View style={styles.uploadingCenter}>
            <ActivityIndicator size="large" color={TEXT_PRIMARY} />
            <Text style={styles.uploadingLabel}>Uploading image</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: BG }]}>
      <View style={styles.content}>
        <Pressable onPress={handleBack} style={styles.topBar}>
          <Ionicons name="arrow-back" size={24} color={TEXT_PRIMARY} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: pending.uri }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.hint}>Confirm to upload this image for analysis?</Text>

        <Pressable
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirmButton,
            pressed && styles.confirmButtonPressed,
          ]}
        >
          <LinearGradient
            colors={[...BUTTON_GRADIENT]}
            style={styles.confirmButtonGradient}
          >
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.confirmButtonText}>Confirm upload</Text>
          </LinearGradient>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
      <Modal visible={!!unknownIngredientText} transparent animationType="fade">
        <View style={styles.selectorOverlay}>
          <View style={styles.selectorCard}>
            <Text style={styles.selectorTitle}>Unknown product type</Text>
            <Text style={styles.selectorHint}>
              OCR cannot confidently classify this image. Choose a category to continue.
            </Text>
            <View style={styles.selectorActions}>
              <Pressable
                style={styles.selectorButton}
                onPress={() =>
                  submitManualCategory({
                    categoryHint: "supplement",
                    thinkingHint: "supplement",
                  })
                }
              >
                <Text style={styles.selectorButtonText}>Supplement</Text>
              </Pressable>
              <Pressable
                style={styles.selectorButton}
                onPress={() =>
                  submitManualCategory({
                    categoryHint: "skincare",
                    thinkingHint: "essence",
                  })
                }
              >
                <Text style={styles.selectorButtonText}>Skincare (Essence)</Text>
              </Pressable>
              <Pressable
                style={styles.selectorButton}
                onPress={() =>
                  submitManualCategory({
                    categoryHint: "skincare",
                    thinkingHint: "cream",
                  })
                }
              >
                <Text style={styles.selectorButtonText}>Skincare (Cream)</Text>
              </Pressable>
              <Pressable
                style={styles.selectorButton}
                onPress={() => submitManualCategory({ categoryHint: "haircare" })}
              >
                <Text style={styles.selectorButtonText}>Haircare</Text>
              </Pressable>
              <Pressable
                style={styles.selectorCancel}
                onPress={() => setUnknownIngredientText(null)}
              >
                <Text style={styles.selectorCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  uploadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  uploadingLabel: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "500",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
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
  },
  imageWrapper: {
    flex: 1,
    minHeight: 200,
    maxHeight: 400,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: THEME_BORDER,
    marginBottom: 24,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  hint: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  confirmButton: {
    overflow: "hidden",
    borderRadius: 12,
    alignSelf: "stretch",
  },
  confirmButtonPressed: {
    opacity: 0.9,
  },
  confirmButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: "#f87171",
    marginTop: 16,
    fontSize: 14,
    textAlign: "center",
  },
  selectorOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  selectorCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME_BORDER,
    padding: 16,
  },
  selectorTitle: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "700",
  },
  selectorHint: {
    color: TEXT_MUTED,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  selectorActions: {
    marginTop: 14,
    gap: 10,
  },
  selectorButton: {
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME_BORDER,
    alignItems: "center",
  },
  selectorButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: "600",
  },
  selectorCancel: {
    alignItems: "center",
    paddingVertical: 6,
  },
  selectorCancelText: {
    color: TEXT_MUTED,
    fontSize: 13,
  },
});
