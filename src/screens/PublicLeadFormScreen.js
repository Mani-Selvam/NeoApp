import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import * as userService from "../services/userService";
import { getUserFacingError } from "../utils/appFeedback";

const COLORS = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  sub: "#475569",
  border: "#E2E8F0",
  primary: "#2563EB",
  success: "#16A34A",
};

const createEmptyForm = () => ({
  enabled: true,
  slug: "",
  title: "",
  description: "",
  defaultSource: "Public Form",
  successMessage: "",
  url: "",
});

export default function PublicLeadFormScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdminUser = String(user?.role || "").toLowerCase() === "admin";
  const [form, setForm] = useState(createEmptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadForm = useCallback(async () => {
    try {
      setLoading(true);
      const res = await userService.getCompanyPublicForm();
      setForm({ ...createEmptyForm(), ...(res?.publicForm || {}) });
    } catch (error) {
      Alert.alert("Unable to load", getUserFacingError(error, "Failed to load the public lead form."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleCopy = useCallback(async () => {
    if (!form.url) return;
    await Clipboard.setStringAsync(form.url);
  }, [form.url]);

  const handleOpen = useCallback(async () => {
    if (!form.url) return;
    const supported = await Linking.canOpenURL(form.url);
    if (!supported) {
      Alert.alert("Link unavailable", "Unable to open the public lead form right now.");
      return;
    }
    await Linking.openURL(form.url);
  }, [form.url]);

  const handleSave = useCallback(async () => {
    if (!isAdminUser) return;
    try {
      setSaving(true);
      const res = await userService.updateCompanyPublicForm({
        enabled: form.enabled,
        title: form.title,
        description: form.description,
        defaultSource: form.defaultSource,
        successMessage: form.successMessage,
      });
      setForm({ ...createEmptyForm(), ...(res?.publicForm || {}) });
      Alert.alert("Saved", res?.message || "Public lead form updated.");
    } catch (error) {
      Alert.alert("Save failed", getUserFacingError(error, "Failed to update the public lead form."));
    } finally {
      setSaving(false);
    }
  }, [form, isAdminUser]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Public Lead Form</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={["#DBEAFE", "#EFF6FF"]} style={styles.hero}>
            <Text style={styles.heroTitle}>One link for every Social Media</Text>
            <Text style={styles.heroText}>
              Share this live form on Instagram, Facebook, WhatsApp, or your website. Every submission goes straight into your company enquiries.
            </Text>
          </LinearGradient>

          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Form status</Text>
                <Text style={styles.subLabel}>
                  {form.enabled ? "Public users can submit enquiries now." : "Form is hidden until you enable it."}
                </Text>
              </View>
              <Switch
                value={Boolean(form.enabled)}
                onValueChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))}
                disabled={!isAdminUser}
                trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
                thumbColor={form.enabled ? COLORS.primary : "#F8FAFC"}
              />
            </View>

            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyLabel}>Live URL</Text>
              <Text selectable style={styles.readonlyValue}>
                {form.url || "-"}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Copy Link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleOpen}>
                <Ionicons name="open-outline" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Open Form</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Public form content</Text>
            <TextInput
              style={styles.input}
              value={form.title}
              onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
              placeholder="Form title"
              editable={isAdminUser}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
              placeholder="Short description"
              multiline
              editable={isAdminUser}
            />
            <TextInput
              style={styles.input}
              value={form.defaultSource}
              onChangeText={(value) => setForm((prev) => ({ ...prev, defaultSource: value }))}
              placeholder="Default source"
              editable={isAdminUser}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.successMessage}
              onChangeText={(value) => setForm((prev) => ({ ...prev, successMessage: value }))}
              placeholder="Success message"
              multiline
              editable={isAdminUser}
            />

            {isAdminUser ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={saving}>
                <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save Changes"}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.staffNote}>
                Staff can share this link, but only admins can change the form settings.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  hero: { borderRadius: 24, padding: 20 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  heroText: { marginTop: 8, color: COLORS.sub, lineHeight: 21 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  subLabel: { marginTop: 4, color: COLORS.sub, lineHeight: 19 },
  readonlyBox: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  readonlyLabel: { fontSize: 12, fontWeight: "700", color: COLORS.sub, marginBottom: 6 },
  readonlyValue: { color: COLORS.text, lineHeight: 20 },
  actionRow: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingVertical: 12,
  },
  secondaryBtnText: { color: COLORS.primary, fontWeight: "700" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    backgroundColor: "#FFFFFF",
  },
  textArea: { minHeight: 88, textAlignVertical: "top" },
  primaryBtn: {
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  staffNote: { color: COLORS.sub, lineHeight: 20 },
});
