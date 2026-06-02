import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

const InlineAlert = ({ message, type = "error", onClose }) => {
  if (!message) return null;

  return (
    <View
      style={[styles.container, type === "error" ? styles.error : styles.info]}
    >
      <Text numberOfLines={1} style={styles.text}>
        {message.replace(/\s+/g, " ").trim()}
      </Text>
      <TouchableOpacity onPress={onClose} style={styles.close}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  error: {
    backgroundColor: "#fee2e2",
  },
  info: {
    backgroundColor: "#ecfeff",
  },
  text: {
    color: "#b91c1c",
    fontSize: 13,
    flex: 1,
    textAlign: "center",
  },
  close: {
    marginLeft: 8,
    padding: 4,
  },
  closeText: {
    color: "#6b7280",
    fontSize: 12,
  },
});

export default InlineAlert;
