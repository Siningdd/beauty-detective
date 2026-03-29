import { Text, View, StyleSheet, type TextStyle } from "react-native";
import { TEXT_PRIMARY, TEXT_SECONDARY } from "../constants/theme";

type Props = {
  markdown: string;
  baseStyle?: TextStyle;
};

/**
 * Minimal Markdown: ## headings, **bold**, - bullets, newlines.
 * No external markdown dependency.
 */
export function SimpleMarkdownText({ markdown, baseStyle }: Props) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  return (
    <View style={styles.wrap}>
      {lines.map((line, li) => (
        <View key={li} style={styles.lineWrap}>
          {renderLine(line, baseStyle)}
        </View>
      ))}
    </View>
  );
}

function renderLine(line: string, baseStyle?: TextStyle) {
  const trimmed = line.trim();
  const bx = baseStyle ? [baseStyle] : [];
  if (!trimmed) {
    return <Text style={[styles.text, ...bx]}> </Text>;
  }
  if (trimmed.startsWith("## ")) {
    return (
      <Text style={[styles.heading, ...bx]}>{trimmed.slice(3).trim()}</Text>
    );
  }
  if (trimmed.startsWith("### ")) {
    return (
      <Text style={[styles.subheading, ...bx]}>
        {trimmed.slice(4).trim()}
      </Text>
    );
  }
  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    return (
      <View style={styles.bulletRow}>
        <Text style={[styles.bullet, ...bx]}>•</Text>
        <View style={styles.bulletText}>
          {renderBoldSegments(trimmed.slice(2), [styles.text, ...bx])}
        </View>
      </View>
    );
  }
  return renderBoldSegments(trimmed, [styles.text, ...bx]);
}

function renderBoldSegments(text: string, base: TextStyle[]) {
  const parts = text.split(/\*\*/);
  if (parts.length === 1) {
    return <Text style={base}>{text}</Text>;
  }
  return (
    <Text style={base}>
      {parts.map((chunk, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={styles.bold}>
            {chunk}
          </Text>
        ) : (
          <Text key={i}>{chunk}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  lineWrap: { alignSelf: "stretch" },
  text: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_PRIMARY,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginTop: 4,
    marginBottom: 2,
  },
  subheading: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    marginTop: 2,
  },
  bold: { fontWeight: "700", color: TEXT_PRIMARY },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bullet: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT_SECONDARY,
    width: 14,
  },
  bulletText: { flex: 1, minWidth: 0 },
});
