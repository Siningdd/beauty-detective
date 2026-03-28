import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CARD_BG, TEXT_PRIMARY } from "../constants/theme";

type Props = {
  visible: boolean;
  ingredient: string;
  onClose: () => void;
};

export function HighRiskModal({ visible, ingredient, onClose }: Props) {
  const message = `High risk ingredient ${ingredient} is detected, please stop use it right now.`;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>High risk ingredient</Text>
          <Text style={styles.body}>{message}</Text>
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(127, 29, 29, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#dc2626",
    padding: 16,
  },
  title: {
    color: "#dc2626",
    fontSize: 17,
    fontWeight: "700",
  },
  body: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
  button: {
    marginTop: 16,
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#dc2626",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
