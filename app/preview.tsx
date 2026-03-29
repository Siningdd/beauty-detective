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
  detectCriticalBannedIngredient,
} from "../services/ocrDetect";
import { loadUserCorrectionMap } from "../services/userOcrCorrections";
import { applyOcrCorrectionMapToText } from "../utils/ocrCorrectionApply";
import { HighRiskModal } from "../components/HighRiskModal";
import {
  getLoadingPhaseMessage,
  mapPhaseRatioToProgress,
  type LoadingPhase,
} from "../types/loadingPhase";
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
  const [unknownOcrRawText, setUnknownOcrRawText] = useState<string | null>(null);
  const [highRiskVisible, setHighRiskVisible] = useState(false);
  const [highRiskIngredient, setHighRiskIngredient] = useState("");
  const [previewLoadingPhase, setPreviewLoadingPhase] = useState<LoadingPhase>("compressing");
  const [previewLoadingProgress, setPreviewLoadingProgress] = useState(0);

  useEffect(() => {
    setPending(getPendingImage());
  }, []);

  const jumpToReport = () => {
    if (didNavigateRef.current) return;
    didNavigateRef.current = true;
    router.replace("/report");
  };

  const handleBack = () => {
    controllerRef.current.abort();
    didNavigateRef.current = false;
    setUnknownIngredientText(null);
    setUnknownOcrRawText(null);
    setHighRiskVisible(false);
    setHighRiskIngredient("");
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
      ocrRawText:
        unknownOcrRawText?.trim() || unknownIngredientText.trim() || undefined,
    });
    setUnknownIngredientText(null);
    setUnknownOcrRawText(null);
    setLoading(true);
    jumpToReport();
  };

  const handleConfirm = async () => {
    if (!pending) return;
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;
    didNavigateRef.current = false;

    setError(null);
    setLoading(true);
    setPendingImage({
      uri: pending.uri,
      base64: pending.base64,
      mimeType: pending.mimeType,
    });
    try {
      const detected = await detectOcrAndHints({
        uri: pending.uri,
        base64: pending.base64,
      });
      const map = await loadUserCorrectionMap();
      const rawLine = (detected.rawOcrText || "").trim();
      const corrLine = (detected.correctedText || "").trim();
      const mappedRaw = rawLine
        ? applyOcrCorrectionMapToText(rawLine, map)
        : "";
      const mappedCorr = corrLine
        ? applyOcrCorrectionMapToText(corrLine, map)
        : "";
      const ingredientText = mappedCorr || mappedRaw || "";
      const resolved = resolveHintDecision({
        confidenceHint: detected.confidenceHint,
        categoryHint: detected.categoryHint,
        thinkingHint: detected.thinkingHint,
      });
      const ocrForSafety = `${mappedRaw}\n${mappedCorr}`;
      const bannedHit = detectCriticalBannedIngredient(
        ocrForSafety,
        resolved?.categoryHint
      );
      if (bannedHit) {
        if (signal.aborted) return;
        didNavigateRef.current = false;
        setLoading(false);
        setHighRiskIngredient(bannedHit);
        setHighRiskVisible(true);
        return;
      }
      setPendingImage({
        uri: pending.uri,
        base64: pending.base64,
        mimeType: pending.mimeType,
        ingredientText,
        ocrRawText: mappedRaw || undefined,
      });
      if (!resolved) {
        setAnalysisParams({
          base64: pending.base64,
          mimeType: pending.mimeType,
          ingredientText,
          ocrRawText: mappedRaw || undefined,
        });
        if (signal.aborted) return;
        jumpToReport();
        return;
      }
      setAnalysisParams({
        base64: pending.base64,
        mimeType: pending.mimeType,
        categoryHint: resolved.categoryHint,
        thinkingHint: resolved.thinkingHint,
        ingredientText,
        ocrRawText: mappedRaw || undefined,
      });
      if (signal.aborted) return;
      jumpToReport();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      didNavigateRef.current = false;
      setError(e instanceof Error ? e.message : "Analysis failed");
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      controllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setPreviewLoadingPhase("compressing");
      setPreviewLoadingProgress(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 300) {
        setPreviewLoadingPhase("compressing");
        setPreviewLoadingProgress(mapPhaseRatioToProgress("compressing", elapsed / 300));
        return;
      }
      if (elapsed < 1200) {
        setPreviewLoadingPhase("uploading");
        setPreviewLoadingProgress(
          mapPhaseRatioToProgress("uploading", (elapsed - 300) / 900)
        );
        return;
      }
      if (elapsed < 2200) {
        setPreviewLoadingPhase("classifying");
        setPreviewLoadingProgress(
          mapPhaseRatioToProgress("classifying", (elapsed - 1200) / 1000)
        );
        return;
      }
      setPreviewLoadingPhase("processing");
      setPreviewLoadingProgress(
        mapPhaseRatioToProgress("processing", (elapsed - 2200) / 3200)
      );
    }, 120);
    return () => clearInterval(timer);
  }, [loading]);

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
            <Text style={styles.uploadingLabel}>
              {getLoadingPhaseMessage(previewLoadingPhase)}
            </Text>
            <Text style={styles.uploadingPercent}>
              {Math.round(previewLoadingProgress)}%
            </Text>
            <View style={styles.uploadingTrack}>
              <View
                style={[
                  styles.uploadingFill,
                  { width: `${Math.round(previewLoadingProgress)}%` },
                ]}
              />
            </View>
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
      <HighRiskModal
        visible={highRiskVisible}
        ingredient={highRiskIngredient}
        onClose={() => {
          setHighRiskVisible(false);
          setHighRiskIngredient("");
        }}
      />
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
                onPress={() => {
                  setUnknownIngredientText(null);
                  setUnknownOcrRawText(null);
                }}
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
    textAlign: "center",
  },
  uploadingPercent: {
    color: TEXT_MUTED,
    fontSize: 13,
  },
  uploadingTrack: {
    width: 220,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(148, 163, 184, 0.24)",
    borderWidth: 1,
    borderColor: THEME_BORDER,
  },
  uploadingFill: {
    height: "100%",
    backgroundColor: TEXT_PRIMARY,
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
