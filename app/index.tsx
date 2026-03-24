import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import {
  manipulateAsync,
  SaveFormat,
} from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Animated } from "react-native";
import { clearReport, setReport, setPendingImage } from "../services/store";
import { MOCK_REPORT } from "../services/mockReport";
import {
  BG,
  BUTTON_GRADIENT,
  TEXT_MUTED,
  TEXT_SECONDARY,
  THEME,
  THEME_BORDER_STRONG,
} from "../constants/theme";

const BUTTON_SIZE = 200;
const RIPPLE_COUNT = 3;
const OCR_TARGET_SHORT_EDGE = 1600;
const OCR_NO_RESIZE_SHORT_EDGE = 1200;
const OCR_JPEG_COMPRESS = 0.9;

export default function HomeScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const rippleAnims = useRef(
    Array.from({ length: RIPPLE_COUNT }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const animations = rippleAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            delay: i * 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  const pickImage = async (useCamera: boolean) => {
    setError(null);
    clearReport();
    try {
      const launcher = useCamera
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;

      const result = await launcher({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
        base64: false,
      });

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const w = asset.width ?? 0;
      const h = asset.height ?? 0;
      const shortEdge = Math.min(w || 0, h || 0);
      const isLandscape = w >= h;
      const shouldSkipResize = shortEdge > 0 && shortEdge <= OCR_NO_RESIZE_SHORT_EDGE;
      const actions = shouldSkipResize
        ? []
        : isLandscape
          ? [{ resize: { height: OCR_TARGET_SHORT_EDGE } }]
          : [{ resize: { width: OCR_TARGET_SHORT_EDGE } }];
      const manipulated = await manipulateAsync(asset.uri, actions, {
        compress: OCR_JPEG_COMPRESS,
        format: SaveFormat.JPEG,
        base64: true,
      });

      if (!manipulated.base64) return;

      setPendingImage({
        uri: manipulated.uri,
        base64: manipulated.base64,
        mimeType: "image/jpeg",
      });
      router.push("/preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    }
  };

  const handleMainButton = () => pickImage(true);
  const handleGalleryButton = () => pickImage(false);

  return (
    <View style={[styles.container, { backgroundColor: BG }]}>
      <View style={styles.content}>
        <View style={styles.buttonWrapper}>
          {rippleAnims.map((anim, i) => {
            const scale = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 2.2],
            });
            const opacity = anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.4, 0.2, 0],
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.ripple,
                  {
                    transform: [{ scale }],
                    opacity,
                  },
                ]}
              />
            );
          })}
          <Pressable
            onPress={handleMainButton}
            style={({ pressed }) => [
              styles.mainButton,
              pressed && styles.mainButtonPressed,
            ]}
          >
            <LinearGradient
              colors={[...BUTTON_GRADIENT]}
              style={styles.mainButtonGradient}
            >
              <Ionicons name="camera" size={64} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>

        <Text style={styles.hint}>Tap to scan ingredients</Text>

        <Pressable
          onPress={handleGalleryButton}
          style={({ pressed }) => [
            styles.galleryButton,
            pressed && styles.galleryButtonPressed,
          ]}
        >
          <Text style={styles.galleryButtonText}>Pick from gallery</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setReport(MOCK_REPORT);
            router.push("/report");
          }}
          style={({ pressed }) => [
            styles.galleryButton,
            pressed && styles.galleryButtonPressed,
            { marginTop: 12 },
          ]}
        >
          <Text style={styles.galleryButtonText}>Test report (Mock)</Text>
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  buttonWrapper: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  ripple: {
    position: "absolute",
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 2,
    borderColor: `${THEME}99`,
  },
  mainButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    overflow: "hidden",
    shadowColor: THEME,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  mainButtonPressed: {
    opacity: 0.9,
  },
  mainButtonGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: TEXT_MUTED,
    fontSize: 16,
    marginBottom: 20,
  },
  galleryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: THEME_BORDER_STRONG,
    borderRadius: 8,
  },
  galleryButtonPressed: {
    opacity: 0.8,
  },
  galleryButtonText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
  error: {
    color: "#f87171",
    marginTop: 16,
    fontSize: 14,
  },
});
