import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  getPendingImage,
  clearPendingImage,
  setReport,
  setLastAnalyzedImage,
} from "../services/store";
import { analyzeImage } from "../services/api";
import {
  extractCorrectedIngredientText,
  guessThinkingHint,
} from "../services/ocrDetect";
import { LoadingScreen } from "../components/LoadingScreen";
import type { AnalysisResult } from "../types/analysis";
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
  const [pending, setPending] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
    ingredientText?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPending(getPendingImage());
  }, []);

  const handleBack = () => {
    controllerRef.current.abort();
    setLoading(false);
    clearPendingImage();
    router.back();
  };

  const handleConfirm = async () => {
    if (!pending) return;
    controllerRef.current.abort();
    controllerRef.current = new AbortController();
    const { signal } = controllerRef.current;

    setError(null);
    setLoading(true);
    setShowResult(false);
    try {
      const hintResult = await guessThinkingHint({
        uri: pending.uri,
        base64: pending.base64,
      });
      const corrected = await extractCorrectedIngredientText({
        uri: pending.uri,
        base64: pending.base64,
      });
      const ingredientText = corrected.correctedText || hintResult.ocrText;
      const shouldPassHint = corrected.confidenceHint !== "low";

      const report = (await analyzeImage(
        pending.base64,
        pending.mimeType,
        signal,
        shouldPassHint ? hintResult.categoryHint : undefined,
        shouldPassHint ? hintResult.thinkingHint : undefined,
        ingredientText
      )) as AnalysisResult;

      setReport(report);
      setLastAnalyzedImage({
        uri: pending.uri,
        base64: pending.base64,
        mimeType: pending.mimeType,
        ingredientText,
      });
      if (report.category !== "unknown") {
        clearPendingImage();
      }
      setLoading(false);
      setShowResult(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Analysis failed");
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => controllerRef.current.abort();
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

  if (loading || showResult) {
    return (
      <View style={[styles.container, { backgroundColor: BG }]}>
        <LoadingScreen
          gotResult={showResult}
          onFadeComplete={
            showResult
              ? () => {
                  setShowResult(false);
                  router.replace("/report");
                }
              : undefined
          }
          onCancel={loading ? handleBack : undefined}
        />
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
});
