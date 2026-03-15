import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function SuspensionModal() {
  const { suspensionInfo, clearSuspension, submitSuspensionReport } = useAuth();
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState("");

  const visible = Boolean(suspensionInfo?.visible);
  const title = useMemo(() => {
    if (suspensionInfo?.companyStatus === "Suspended") return "Account Suspended";
    return "Account Restricted";
  }, [suspensionInfo?.companyStatus]);

  const onClose = () => {
    setShowHelp(false);
    setMessage("");
    clearSuspension();
  };

  const onSubmit = async () => {
    const msg = message.trim();
    if (!msg) return;
    const ok = await submitSuspensionReport(msg);
    if (ok) {
      setMessage("");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="lock-closed" size={18} color="#fff" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{suspensionInfo?.reason || "Company is suspended"}</Text>
            </View>
          </View>

          <View style={styles.notice}>
            <Ionicons name="information-circle" size={16} color="#0ea5e9" />
            <Text style={styles.noticeText}>
              Access is blocked. Use Help to contact support and request reactivation.
            </Text>
          </View>

          {showHelp ? (
            <View style={styles.helpBox}>
              <Text style={styles.helpLabel}>Report to Support</Text>
              {suspensionInfo?.submitted ? (
                <Text style={styles.successLine}>Sent. Support will reply to your email.</Text>
              ) : (
                <>
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Describe the issue..."
                    multiline
                    style={styles.input}
                  />
                  {suspensionInfo?.submitError ? (
                    <Text style={styles.error}>{suspensionInfo.submitError}</Text>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          <View style={styles.actions}>
            {showHelp ? (
              <>
                {suspensionInfo?.submitted ? (
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
                    <Text style={styles.btnPrimaryText}>OK</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
                      <Text style={styles.btnGhostText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.btn,
                        styles.btnPrimary,
                        (!message.trim() || suspensionInfo?.submitting) ? styles.btnDisabled : null,
                      ]}
                      disabled={!message.trim() || suspensionInfo?.submitting}
                      onPress={onSubmit}
                    >
                      <Text style={styles.btnPrimaryText}>
                        {suspensionInfo?.submitting ? "Submitting..." : "Submit"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </>
            ) : (
              <>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
                  <Text style={styles.btnGhostText}>OK</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => setShowHelp(true)}
                >
                  <Text style={styles.btnPrimaryText}>Help</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  notice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(14, 165, 233, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.22)",
    marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 12, color: "#0f172a", lineHeight: 16 },
  helpBox: { marginTop: 6, marginBottom: 10 },
  helpLabel: { fontSize: 13, fontWeight: "600", color: "#0f172a", marginBottom: 8 },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.12)",
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: "#0f172a",
    textAlignVertical: "top",
    backgroundColor: "rgba(2, 6, 23, 0.02)",
  },
  error: { color: "#b91c1c", marginTop: 8, fontSize: 12 },
  successLine: { color: "#047857", marginTop: 8, fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnGhost: { backgroundColor: "rgba(15, 23, 42, 0.06)" },
  btnGhostText: { color: "#0f172a", fontWeight: "600" },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  btnDisabled: { opacity: 0.55 },
});
