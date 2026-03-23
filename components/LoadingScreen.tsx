import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MotiView, MotiText } from "moti";
import Svg, { Path, Circle } from "react-native-svg";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  THEME as THEME_COLOR,
  THEME_BORDER,
  THEME_BORDER_STRONG,
} from "../constants/theme";
const TUBE_WIDTH = 48;
const TUBE_HEIGHT = 200;
const TUBE_BORDER_WIDTH = 2;
const LIQUID_INSET = TUBE_BORDER_WIDTH;
const LIQUID_WIDTH = TUBE_WIDTH - LIQUID_INSET * 2;
const BUBBLE_COUNT = 14;
const BUBBLE_LANES = 5;

const STAGE_CONFIG = [
  { height: 0.3, text: "Investigating ingredients..." },
  { height: 0.6, text: "Evaluating effects..." },
  { height: 0.9, text: "Preparing advice..." },
  { height: 0.95, text: "Generating report..." },
];

type Props = {
  gotResult?: boolean;
  onFadeComplete?: () => void;
  onCancel?: () => void;
};

type BubbleSeed = {
  x: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  start: number;
  sway: number;
};

function seededUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildBubbleSeeds(count: number): BubbleSeed[] {
  return Array.from({ length: count }, (_, index) => {
    const size = 8 + Math.round(seededUnit(index, 1) * 4);
    const lane = index % BUBBLE_LANES;
    const laneStep = (LIQUID_WIDTH - 10) / (BUBBLE_LANES - 1);
    const laneCenter = 5 + lane * laneStep;
    const xJitter = -1.2 + seededUnit(index, 2) * 2.4;
    const rawX = laneCenter - size / 2 + xJitter;
    const x = Math.max(1, Math.min(LIQUID_WIDTH - size - 1, rawX));
    const duration = 1700 + Math.round(seededUnit(index, 3) * 900);
    // Slot-based staggering prevents all bubbles fading together.
    const delay = (index % 6) * 220 + Math.round(seededUnit(index, 4) * 120);
    const drift = -3 + seededUnit(index, 5) * 6;
    const start = 6 + seededUnit(index, 6) * 44;
    const sway = 1 + seededUnit(index, 7) * 2.2;
    return { x, size, duration, delay, drift, start, sway };
  });
}

function buildLiquidPath({
  width,
  height,
  phase,
}: {
  width: number;
  height: number;
  phase: number;
}): string {
  const amplitude = 5;
  const baseY = 9 + Math.sin(phase * 0.65) * 0.8;
  const wavelength = 22;
  const step = 3;
  const points: Array<{ x: number; y: number }> = [];
  for (let x = 0; x <= width; x += step) {
    const p = (x / wavelength) * Math.PI * 2;
    const y =
      baseY +
      Math.sin(p + phase) * amplitude +
      Math.sin(p * 0.5 + phase * 1.4) * amplitude * 0.35;
    points.push({ x, y: Math.max(2, Math.min(18, y)) });
  }
  if (points[points.length - 1]?.x !== width) {
    const p = (width / wavelength) * Math.PI * 2;
    const y =
      baseY +
      Math.sin(p + phase) * amplitude +
      Math.sin(p * 0.5 + phase * 1.4) * amplitude * 0.35;
    points.push({ x: width, y: Math.max(2, Math.min(18, y)) });
  }
  let d = `M 0 ${height} L ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  d += ` L ${width} ${height} Z`;
  return d;
}

export function LoadingScreen({ gotResult = false, onFadeComplete, onCancel }: Props) {
  const [currentStage, setCurrentStage] = useState(0);
  const [liquidHeight, setLiquidHeight] = useState(0.3);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [wavePhase, setWavePhase] = useState(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const bubbleSeeds = useMemo(() => buildBubbleSeeds(BUBBLE_COUNT), []);
  const liquidPath = useMemo(
    () => buildLiquidPath({ width: LIQUID_WIDTH, height: 100, phase: wavePhase }),
    [wavePhase]
  );

  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => {
    if (gotResult) {
      clearTimeouts();
      setLiquidHeight(1);
      setCurrentStage(4);
      const t = setTimeout(() => {
        setIsFadingOut(true);
        const t2 = setTimeout(() => onFadeComplete?.(), 400);
        timeoutsRef.current.push(t2);
      }, 450);
      timeoutsRef.current.push(t);
      return () => clearTimeouts();
    }

    const t1 = setTimeout(() => {
      setCurrentStage(1);
      setLiquidHeight(0.6);
    }, 2000);
    const t2 = setTimeout(() => {
      setCurrentStage(2);
      setLiquidHeight(0.9);
    }, 4000);
    const t3 = setTimeout(() => {
      setCurrentStage(3);
      setLiquidHeight(0.95);
    }, 6000);

    timeoutsRef.current = [t1, t2, t3];
    return () => clearTimeouts();
  }, [gotResult, onFadeComplete, clearTimeouts]);

  useEffect(() => {
    const timer = setInterval(() => {
      setWavePhase((prev) => prev + 0.25);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  const stageText = gotResult ? "Generating report..." : STAGE_CONFIG[currentStage]?.text ?? STAGE_CONFIG[3].text;
  const displayHeight = gotResult ? 1 : liquidHeight;

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
      <View style={styles.tubeWrapper}>
        {/* Transparent test tube with scale marks */}
        <View style={[styles.tube, styles.tubeBorder]}>
          {[0.25, 0.5, 0.75, 1].map((y) => (
            <View
              key={y}
              style={[
                styles.scaleMark,
                { bottom: `${(y - 0.05) * 100}%` },
              ]}
            />
          ))}

          {/* Liquid fill */}
          <MotiView
            style={styles.liquidContainer}
            from={{ height: TUBE_HEIGHT * 0.3 }}
            animate={{
              height: TUBE_HEIGHT * displayHeight,
            }}
            transition={{
              type: "timing",
              duration: gotResult ? 400 : 800,
            }}
          >
            <View style={styles.liquid}>
              <Svg
                width={LIQUID_WIDTH}
                height="100%"
                viewBox={`0 0 ${LIQUID_WIDTH} 100`}
                preserveAspectRatio="none"
                style={styles.liquidSvg}
              >
                <Path d={liquidPath} fill={THEME_COLOR} fillOpacity={0.92} />
              </Svg>
              {/* Bubbles */}
              {bubbleSeeds.map((seed, i) => (
                <Bubble key={i} seed={seed} />
              ))}
            </View>
          </MotiView>
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

function Bubble({ seed }: { seed: BubbleSeed }) {
  return (
    <MotiView
      style={[
        styles.bubble,
        {
          left: seed.x,
          bottom: seed.start,
        },
      ]}
      from={{
        translateY: 0,
        translateX: 0,
        opacity: 0,
        scale: 0.85,
      }}
      animate={{
        translateY: -TUBE_HEIGHT - 26,
        translateX: [0, seed.drift, seed.drift + seed.sway, 0],
        opacity: [0.35, 0.9, 0.88, 0.45],
        scale: [0.92, 1.1, 1.06, 0.96],
      }}
      transition={{
        type: "timing",
        duration: seed.duration,
        loop: true,
        delay: seed.delay,
      }}
    >
      <Svg width={seed.size} height={seed.size}>
        <Circle
          cx={seed.size / 2}
          cy={seed.size / 2}
          r={seed.size / 2.6}
          fill="rgba(255,255,255,0.62)"
        />
      </Svg>
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
  tubeWrapper: {
    marginBottom: 32,
  },
  tube: {
    width: TUBE_WIDTH,
    height: TUBE_HEIGHT,
    borderRadius: TUBE_WIDTH / 2,
    overflow: "hidden",
    backgroundColor: "rgba(113, 70, 232, 0.08)",
  },
  tubeBorder: {
    borderWidth: 2,
    borderColor: THEME_BORDER_STRONG,
  },
  scaleMark: {
    position: "absolute",
    left: -6,
    width: 4,
    height: 1,
    backgroundColor: THEME_BORDER,
  },
  liquidContainer: {
    position: "absolute",
    bottom: 0,
    left: LIQUID_INSET,
    right: LIQUID_INSET,
    borderBottomLeftRadius: LIQUID_WIDTH / 2,
    borderBottomRightRadius: LIQUID_WIDTH / 2,
    overflow: "hidden",
  },
  liquid: {
    flex: 1,
  },
  liquidSvg: {
    ...StyleSheet.absoluteFillObject,
  },
  bubble: {
    position: "absolute",
  },
  stageText: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    textAlign: "center",
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
});
