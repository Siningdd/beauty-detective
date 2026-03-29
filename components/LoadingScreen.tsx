import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing, Image, Platform } from "react-native";
import { MotiView, MotiText } from "moti";
import { isActiveWhitelistToken } from "../services/ocrDetect";
import {
  getLoadingPhaseMessage,
  type LoadingPhase,
} from "../types/loadingPhase";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  THEME as THEME_COLOR,
  THEME_BORDER,
  THEME_BORDER_STRONG,
} from "../constants/theme";

const STREAM_WIDTH = 320;
const STREAM_HEIGHT = 220;
const SCAN_DURATION_MS = 1700;
const AUTO_COMPLETE_MS = 18000;
const WORD_BATCH_MS = 100;
const WORD_TTL_MS = 2600;
const SERIF_FONT_FAMILY = Platform.select({
  ios: "Times New Roman",
  android: "serif",
  default: "serif",
});

type Props = {
  gotResult?: boolean;
  onFadeComplete?: () => void;
  onCancel?: () => void;
  streamTokens?: Array<{ id: string; text: string }>;
  allDetectedTokens?: string[];
  hasData?: boolean;
  highlightKeywords?: string[];
  backgroundImageUri?: string;
  phase?: LoadingPhase;
  phaseMessage?: string;
  externalProgress?: number;
};

type SpawnWord = {
  id: string;
  text: string;
  x: number;
  y: number;
  risePx: number;
  floatMs: number;
  size: number;
  bornAt: number;
};

function seededUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function normalizeKeyword(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stageTextByPercent(percent: number): string {
  if (percent < 30) return "scaning all the ingredients...";
  if (percent < 65) return "analysing all the ingredients...";
  if (percent < 85) return "writing summary... ";
  return "finalizing...";
}

function titleCaseToken(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function LoadingScreen({
  gotResult = false,
  onFadeComplete,
  onCancel,
  streamTokens: _streamTokens = [],
  allDetectedTokens = [],
  hasData: _hasData = false,
  highlightKeywords = [],
  backgroundImageUri,
  phase,
  phaseMessage,
  externalProgress,
}: Props) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [loadingPercent, setLoadingPercent] = useState(0);
  const [activeWords, setActiveWords] = useState<SpawnWord[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFadeCompleteRef = useRef(onFadeComplete);
  onFadeCompleteRef.current = onFadeComplete;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const finishStartedRef = useRef(false);
  const progressStartedAtRef = useRef<number>(Date.now());
  const loadingPercentRef = useRef(0);
  const prevGotResultRef = useRef<boolean | undefined>(undefined);
  const scanProgressRef = useRef(0);
  const currentIndexRef = useRef(0);
  const spawnStepRef = useRef(0);
  const keywordSet = useMemo(
    () => new Set(highlightKeywords.map((word) => normalizeKeyword(word))),
    [highlightKeywords]
  );
  // 仅真实 OCR 词池驱动词雨，无占位假词
  const tokenPool = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const token of allDetectedTokens) {
      const text = String(token ?? "").trim();
      if (!text) continue;
      const key = normalizeKeyword(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }, [allDetectedTokens]);
  const tokenPoolKey = useMemo(() => tokenPool.join("|"), [tokenPool]);
  const canStartWordStream = !gotResult && !isFadingOut && tokenPool.length > 0;
  const displayLoadingPercent =
    !gotResult && typeof externalProgress === "number"
      ? Math.max(0, Math.min(100, externalProgress))
      : loadingPercent;
  const stageText =
    phaseMessage?.trim() ||
    (phase ? getLoadingPhaseMessage(phase) : stageTextByPercent(displayLoadingPercent));
  loadingPercentRef.current = loadingPercent;

  useEffect(() => {
    progressStartedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    currentIndexRef.current = 0;
    spawnStepRef.current = 0;
  }, [tokenPoolKey]);

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
    if (finishIntervalRef.current) {
      clearInterval(finishIntervalRef.current);
      finishIntervalRef.current = null;
    }
  }, []);

  const triggerFinish = useCallback((onDone?: () => void) => {
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;
    if (finishIntervalRef.current) {
      clearInterval(finishIntervalRef.current);
      finishIntervalRef.current = null;
    }
    const startAt = Date.now();
    const startPercent = loadingPercentRef.current;
    finishIntervalRef.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - startAt) / 300);
      const next = Math.min(100, startPercent + (100 - startPercent) * t);
      setLoadingPercent(next);
      if (next >= 100) {
        if (finishIntervalRef.current) {
          clearInterval(finishIntervalRef.current);
          finishIntervalRef.current = null;
        }
        const t1 = setTimeout(() => {
          setIsFadingOut(true);
          const t2 = setTimeout(() => {
            onDone?.();
          }, 400);
          timeoutsRef.current.push(t2);
        }, 150);
        timeoutsRef.current.push(t1);
      }
    }, 16);
  }, []);

  const clearTimeoutsRef = useRef(clearTimeouts);
  clearTimeoutsRef.current = clearTimeouts;
  const triggerFinishRef = useRef(triggerFinish);
  triggerFinishRef.current = triggerFinish;

  useEffect(() => {
    const prev = prevGotResultRef.current;
    prevGotResultRef.current = gotResult;

    if (gotResult) {
      clearTimeoutsRef.current();
      finishStartedRef.current = false;
      triggerFinishRef.current(() => {
        onFadeCompleteRef.current?.();
      });
      return () => clearTimeoutsRef.current();
    }

    if (prev === true && !gotResult) {
      clearTimeoutsRef.current();
      finishStartedRef.current = false;
      setLoadingPercent(0);
      setIsFadingOut(false);
      setActiveWords([]);
      progressStartedAtRef.current = Date.now();
    }

    return undefined;
  }, [gotResult]);

  useEffect(() => {
    return () => clearTimeouts();
  }, [clearTimeouts]);

  useEffect(() => {
    if (gotResult || typeof externalProgress === "number") return;
    const timer = setInterval(() => {
      const elapsedMs = Date.now() - progressStartedAtRef.current;
      if (elapsedMs >= AUTO_COMPLETE_MS) {
        clearInterval(timer);
        return;
      }
      setLoadingPercent((prev) => {
        if (prev < 30) return prev + 0.3;
        if (prev < 90) return prev + (92 - prev) * 0.04;
        if (prev < 98) return prev + 0.08;
        return prev;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [gotResult, externalProgress]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: SCAN_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: SCAN_DURATION_MS,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    const id = scanAnim.addListener(({ value }) => {
      scanProgressRef.current = value;
    });
    return () => {
      scanAnim.removeListener(id);
      loop.stop();
    };
  }, [scanAnim]);

  useEffect(() => {
    if (!canStartWordStream) return;
    const timer = setInterval(() => {
      setActiveWords((prev) => {
        const now = Date.now();
        const pruned = prev.filter((item) => now - item.bornAt < WORD_TTL_MS);
        if (tokenPool.length === 0) return pruned;
        let index = currentIndexRef.current;
        if (index >= tokenPool.length) {
          index = 0;
          currentIndexRef.current = 0;
        }
        const batchSize = 3 + Math.floor(seededUnit(spawnStepRef.current, 9) * 3);
        const remaining = tokenPool.length - index;
        const spawnCount = Math.min(batchSize, remaining);
        if (spawnCount <= 0) return pruned;
        const scanY = Math.round(scanProgressRef.current * (STREAM_HEIGHT - 18)) + 8;
        const spawned: SpawnWord[] = [];
        for (let i = 0; i < spawnCount; i++) {
          const seq = spawnStepRef.current * 7 + i;
          const text = tokenPool[index + i];
          spawned.push({
            id: `spawn-${now}-${index + i}-${seq}`,
            text,
            x: Math.round(seededUnit(seq, 1) * (STREAM_WIDTH - 88)) + 18,
            y: scanY,
            risePx: 24 + Math.round(seededUnit(seq, 3) * 22),
            floatMs: 850 + Math.round(seededUnit(seq, 2) * 500),
            size: 12 + Math.round(seededUnit(seq, 4) * 4),
            bornAt: now,
          });
        }
        currentIndexRef.current = index + spawnCount;
        spawnStepRef.current += 1;
        return [...pruned, ...spawned].slice(-180);
      });
    }, WORD_BATCH_MS);
    return () => clearInterval(timer);
  }, [canStartWordStream, tokenPool]);

  const scanTop = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, STREAM_HEIGHT - 6],
  });

  return (
    <MotiView
      style={styles.container}
      animate={{
        opacity: isFadingOut ? 0 : 1,
      }}
      transition={{
        type: "timing",
        duration: 400,
      }}
    >
      <View style={styles.streamCard}>
        {backgroundImageUri ? (
          <Image
            source={{ uri: backgroundImageUri }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.streamBackdrop} />
        {activeWords.map((item) => {
          const tokenNorm = normalizeKeyword(item.text);
          const isHotKeyword = tokenNorm.length > 0 && keywordSet.has(tokenNorm);
          const isActiveToken = isActiveWhitelistToken(item.text);
          return (
            <MotiText
              key={item.id}
              style={[
                styles.streamWord,
                {
                  left: item.x,
                  top: item.y,
                  fontSize: item.size,
                  color: isActiveToken
                    ? "#57f7ff"
                    : isHotKeyword
                      ? "#ffdd7e"
                      : "rgba(236,229,255,0.78)",
                  fontWeight: isActiveToken ? "700" : "600",
                },
              ]}
              from={{ opacity: 0, translateY: 12, scale: 0.92 }}
              animate={{
                opacity: isActiveToken ? 0.98 : 0.84,
                translateY: -item.risePx,
                scale: isActiveToken || isHotKeyword ? 1.08 : 1,
              }}
              transition={{
                type: "timing",
                duration: item.floatMs,
              }}
            >
              {titleCaseToken(item.text)}
            </MotiText>
          );
        })}
        <Animated.View style={[styles.scanBar, { top: scanTop }]} />
      </View>

      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>{Math.round(displayLoadingPercent)}%</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${displayLoadingPercent}%` }]} />
        </View>
      </View>

      <MotiText
        style={styles.stageText}
        animate={{ opacity: 1 }}
        transition={{ type: "timing", duration: 300 }}
      >
        {stageText}
      </MotiText>
      {!gotResult && onCancel && (
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      )}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  streamCard: {
    width: STREAM_WIDTH,
    height: STREAM_HEIGHT,
    marginBottom: 18,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: THEME_BORDER_STRONG,
    backgroundColor: "rgba(40, 24, 84, 0.55)",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  streamBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(113, 70, 232, 0.36)",
  },
  streamWord: {
    position: "absolute",
    fontWeight: "600",
    fontFamily: SERIF_FONT_FAMILY,
  },
  scanBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(208, 246, 255, 0.95)",
    shadowColor: "#69f4ff",
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 4,
  },
  progressWrap: {
    width: STREAM_WIDTH,
    marginBottom: 14,
  },
  progressText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    marginBottom: 8,
    textAlign: "right",
    fontFamily: SERIF_FONT_FAMILY,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.24)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: THEME_BORDER,
  },
  progressFill: {
    height: "100%",
    backgroundColor: THEME_COLOR,
  },
  stageText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    textAlign: "center",
    fontFamily: SERIF_FONT_FAMILY,
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontFamily: SERIF_FONT_FAMILY,
  },
});
