import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { MotiView } from "moti";
import { CARD_BG, CARD_BORDER } from "../constants/theme";

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({
  width = "100%",
  height,
  borderRadius = 10,
  style,
}: SkeletonBlockProps) {
  return (
    <MotiView
      from={{ opacity: 0.35 }}
      animate={{ opacity: 0.75 }}
      transition={{ type: "timing", duration: 900, loop: true }}
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius,
        },
        style,
      ]}
    />
  );
}

type SkeletonLineProps = {
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonLine({ width = "100%", style }: SkeletonLineProps) {
  return <SkeletonBlock width={width} height={14} borderRadius={7} style={style} />;
}

type SkeletonPillProps = {
  width?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonPill({ width = 88, style }: SkeletonPillProps) {
  return <SkeletonBlock width={width} height={32} borderRadius={999} style={style} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
});
