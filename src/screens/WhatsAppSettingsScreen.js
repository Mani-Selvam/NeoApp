import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Importing your existing skeleton components
import {
    FormSkeleton,
    HeaderSkeleton,
    ScreenSkeleton,
} from "../components/skeleton/screens";
import {
    SkeletonCard,
    SkeletonLine,
    SkeletonSpacer,
} from "../components/skeleton/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import getApiClient from "../services/apiClient";

// --- Responsive Scaling Utility ---
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

// Horizontal Scale
const hs = (size) => (SCREEN_WIDTH / BASE_WIDTH) * size;
// Vertical Scale
const vs = (size) => (SCREEN_HEIGHT / BASE_HEIGHT) * size;
// Moderate Scale (for fonts)
const ms = (size, factor = 0.5) => size + (hs(size) - size) * factor;

const COLORS = {
  bg: "#F1F5F9", // Lighter slate background
  surface: "#FFFFFF",
  primary: "#0F766E", // Teal
  secondary: "#059669",
  accent: "#2563EB",
  text: "#0F172A",
  textDim: "#475569",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  softGreen: "#ECFDF5",
  softYellow: "#FEF9C3",
  warning: "#D97706",
  error: "#DC2626",
  whatsapp: "#25D366",
  shadow: "rgba(0, 0, 0, 0.06)",
};

const PROVIDERS = {
  WATI: "WATI",
  META: "META",
  NEO: "NEO",
  TWILIO: "TWILIO",
};

const emptyForm = {
  provider: PROVIDERS.WATI,
  defaultCountry: "91",
  watiBaseUrl: "",
  watiApiToken: "",
  metaWhatsappToken: "",
  metaPhoneNumberId: "",
  neoAccountName: "",
  neoApiKey: "",
  neoPhoneNumber: "",
  neoBearerToken: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioWhatsappNumber: "",
};

const mergeConfigToForm = (config = {}) => ({
  ...emptyForm,
  provider: config.provider || PROVIDERS.WATI,
  defaultCountry: config.defaultCountry || "91",
  watiBaseUrl: config.watiBaseUrl || config.apiUrl || "",
  metaPhoneNumberId: config.metaPhoneNumberId || "",
  neoAccountName: config.neoAccountName || "",
  neoPhoneNumber: config.neoPhoneNumber || "",
  neoBearerToken: "",
  twilioAccountSid: config.twilioAccountSid || "",
  twilioWhatsappNumber: config.twilioWhatsappNumber || "",
});

export default function WhatsAppSettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [waConfig, setWaConfig] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editStep, setEditStep] = useState(1); // 1: Overview, 2: OTP, 3: Form
  const [otpMethod, setOtpMethod] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const client = await getApiClient();
      const resp = await client.get("/whatsapp/config");
      const config = resp.data?.config || {};
      setWaConfig(config);
      setForm(mergeConfigToForm(config));
      setEditStep(1);
    } catch (e) {
      console.warn("Load config error:", e);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRequestOtp = async (method) => {
    try {
      setOtpMethod(method);
      setSendingOtp(true);
      const client = await getApiClient();
      await client.post("/auth/send-otp", {
        email: user?.email,
        mobile: user?.mobile,
        type: "edit_whatsapp_token",
        method: method.toLowerCase(),
      });
      setEditStep(2);
    } catch (_e) {
      Alert.alert("Error", "Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setVerifyingOtp(true);
      const client = await getApiClient();
      const resp = await client.post("/auth/verify-otp", {
        email: user?.email,
        mobile: user?.mobile,
        otp: otpCode,
      });
      if (resp.data.success) {
        await client.post("/whatsapp/config/mark-verified");
        setEditStep(3);
        setOtpCode("");
      } else {
        Alert.alert("Invalid", "Incorrect OTP code");
      }
    } catch (_e) {
      Alert.alert("Error", "Verification failed");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const validateForm = () => {
    if (form.provider === PROVIDERS.WATI) {
      return form.watiBaseUrl.trim() && form.watiApiToken.trim();
    }
    if (form.provider === PROVIDERS.META) {
      return form.metaWhatsappToken.trim() && form.metaPhoneNumberId.trim();
    }
    if (form.provider === PROVIDERS.NEO) {
      return (
        form.neoAccountName.trim() &&
        form.neoPhoneNumber.trim() &&
        form.neoApiKey.trim()
      );
    }
    if (form.provider === PROVIDERS.TWILIO) {
      return (
        form.twilioAccountSid.trim() &&
        form.twilioAuthToken.trim() &&
        form.twilioWhatsappNumber.trim()
      );
    }
    return false;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert(
        "Error",
        "Please fill all required fields for the selected provider",
      );
      return;
    }
    try {
      setSaving(true);
      const client = await getApiClient();
      const payload = {
        provider: form.provider,
        defaultCountry: form.defaultCountry.trim() || "91",
        watiBaseUrl: form.watiBaseUrl.trim(),
        watiApiToken: form.watiApiToken.trim(),
        metaWhatsappToken: form.metaWhatsappToken.trim(),
        metaPhoneNumberId: form.metaPhoneNumberId.trim(),
        neoAccountName: form.neoAccountName.trim(),
        neoApiKey: form.neoApiKey.trim(),
        neoPhoneNumber: form.neoPhoneNumber.trim(),
        twilioAccountSid: form.twilioAccountSid.trim(),
        twilioAuthToken: form.twilioAuthToken.trim(),
        twilioWhatsappNumber: form.twilioWhatsappNumber.trim(),
      };
      const resp = await client.put("/whatsapp/config", payload);
      if (resp.data?.ok) {
        setWaConfig(resp.data.config || {});
        setForm((prev) => mergeConfigToForm({ ...resp.data.config, ...prev }));
        Alert.alert("Success", "WhatsApp configuration updated");
        navigation.goBack();
      } else {
        Alert.alert("Error", resp.data?.message || "Save failed");
      }
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.message || "An error occurred while saving",
      );
    } finally {
      setSaving(false);
    }
  };

  // --- Loading Skeleton State ---
  if (loading) {
    return (
      <ScreenSkeleton bg={COLORS.bg}>
        <View style={{ paddingTop: insets.top }}>
          <HeaderSkeleton withAvatar={false} />
        </View>
        <View style={{ paddingHorizontal: hs(16) }}>
          <SkeletonCard>
            <SkeletonLine width="54%" height={vs(14)} />
            <SkeletonSpacer h={vs(14)} />
            <FormSkeleton fields={4} />
          </SkeletonCard>
        </View>
      </ScreenSkeleton>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Modern Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={ms(24)} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>WhatsApp Settings</Text>
            <Text style={styles.headerSubtitle}>Configure API Provider</Text>
          </View>
          <View style={{ width: hs(40) }} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + hs(30) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            from={{ opacity: 0, translateY: 30 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 500 }}
            style={styles.mainCard}
          >
            {/* Card Header Visual */}
            <View style={styles.cardVisualHeader}>
              <LinearGradient
                colors={[COLORS.whatsapp, "#128C7E"]}
                style={styles.iconCircle}
              >
                <Ionicons name="logo-whatsapp" size={ms(36)} color="#fff" />
              </LinearGradient>

              <View style={styles.statusBadgeContainer}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: waConfig?.provider
                        ? COLORS.secondary
                        : COLORS.warning,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: waConfig?.provider
                        ? COLORS.secondary
                        : COLORS.warning,
                    },
                  ]}
                >
                  {waConfig?.provider ? "Connected" : "Not Configured"}
                </Text>
              </View>
            </View>

            <Text style={styles.title}>
              {editStep === 1
                ? "Integration Status"
                : editStep === 2
                  ? "Security Check"
                  : "Edit Configuration"}
            </Text>
            <Text style={styles.subtitle}>
              {editStep === 1
                ? "Manage your business API provider for automated messaging."
                : editStep === 2
                  ? `We've sent a 6-digit code to your ${otpMethod}.`
                  : "Update your provider credentials below."}
            </Text>

            {/* --- STEP 1: OVERVIEW --- */}
            {editStep === 1 && (
              <View style={styles.contentSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Active Provider</Text>
                  <View style={styles.infoValueBox}>
                    <Text style={styles.infoValueText}>
                      {waConfig?.provider || "None Selected"}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.sectionTitle}>Actions</Text>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    if (waConfig?.editVerificationActive) {
                      setEditStep(3);
                      return;
                    }
                    handleRequestOtp("WhatsApp");
                  }}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={["#FFFFFF", "#F8FAFC"]}
                    style={styles.actionBtnGradient}
                  >
                    <View style={styles.actionIconBox}>
                      <Ionicons
                        name="create-outline"
                        size={ms(22)}
                        color={COLORS.primary}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: hs(12) }}>
                      <Text style={styles.actionTitle}>Edit Configuration</Text>
                      <Text style={styles.actionDesc}>
                        Change provider or update tokens
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={ms(20)}
                      color={COLORS.textMuted}
                    />
                  </LinearGradient>
                  {sendingOtp && otpMethod === "WhatsApp" && (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator color={COLORS.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* --- STEP 2: OTP --- */}
            {editStep === 2 && (
              <View style={styles.contentSection}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  autoFocus
                  selectionColor={COLORS.primary}
                />

                <TouchableOpacity
                  onPress={handleVerifyOtp}
                  disabled={verifyingOtp || otpCode.length < 6}
                  style={styles.primaryBtnWrapper}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[
                      verifyingOtp || otpCode.length < 6
                        ? "#94A3B8"
                        : COLORS.primary,
                      COLORS.secondary,
                    ]}
                    style={styles.primaryBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {verifyingOtp ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnText}>Verify & Continue</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setEditStep(1)}
                  style={styles.retryBtn}
                >
                  <Text style={styles.retryText}>Cancel & Go Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* --- STEP 3: FORM --- */}
            {editStep === 3 && (
              <View style={styles.contentSection}>
                <Text style={styles.inputLabelTop}>Select Provider</Text>
                <View style={styles.providerGrid}>
                  {Object.values(PROVIDERS).map((provider) => (
                    <TouchableOpacity
                      key={provider}
                      onPress={() => updateField("provider", provider)}
                      style={[
                        styles.providerCard,
                        form.provider === provider && styles.providerCardActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.providerCardText,
                          form.provider === provider &&
                            styles.providerCardTextActive,
                        ]}
                      >
                        {provider}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabelTop}>Default Country Code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 91"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.defaultCountry}
                  onChangeText={(value) => updateField("defaultCountry", value)}
                  keyboardType="numeric"
                />

                {/* Dynamic Provider Fields */}
                {form.provider === PROVIDERS.WATI && (
                  <>
                    <InputField
                      label="WATI Base URL"
                      value={form.watiBaseUrl}
                      onChange={(v) => updateField("watiBaseUrl", v)}
                      placeholder="https://live-server.wati.io"
                    />
                    <InputField
                      label="API Token"
                      value={form.watiApiToken}
                      onChange={(v) => updateField("watiApiToken", v)}
                      placeholder="Enter API token"
                      multiline
                    />
                  </>
                )}

                {form.provider === PROVIDERS.META && (
                  <>
                    <InputField
                      label="WhatsApp Token"
                      value={form.metaWhatsappToken}
                      onChange={(v) => updateField("metaWhatsappToken", v)}
                      placeholder="Permanent token"
                      multiline
                    />
                    <InputField
                      label="Phone Number ID"
                      value={form.metaPhoneNumberId}
                      onChange={(v) => updateField("metaPhoneNumberId", v)}
                      placeholder="ID from Meta dashboard"
                    />
                  </>
                )}

                {form.provider === PROVIDERS.TWILIO && (
                  <>
                    <InputField
                      label="Account SID"
                      value={form.twilioAccountSid}
                      onChange={(v) => updateField("twilioAccountSid", v)}
                      placeholder="ACxxxxxxxxx"
                    />
                    <InputField
                      label="Auth Token"
                      value={form.twilioAuthToken}
                      onChange={(v) => updateField("twilioAuthToken", v)}
                      placeholder="Enter Auth Token"
                      multiline
                    />
                    <InputField
                      label="WhatsApp Number"
                      value={form.twilioWhatsappNumber}
                      onChange={(v) => updateField("twilioWhatsappNumber", v)}
                      placeholder="+14155238886"
                    />
                  </>
                )}

                {form.provider === PROVIDERS.NEO && (
                  <>
                    <InputField
                      label="Account Name"
                      value={form.neoAccountName}
                      onChange={(v) => updateField("neoAccountName", v)}
                      placeholder="Neo account name"
                    />
                    <InputField
                      label="API Key"
                      value={form.neoApiKey}
                      onChange={(v) => updateField("neoApiKey", v)}
                      placeholder="Enter API key"
                      multiline
                    />
                    <InputField
                      label="Phone Number"
                      value={form.neoPhoneNumber}
                      onChange={(v) => updateField("neoPhoneNumber", v)}
                      placeholder="WhatsApp number"
                      keyboardType="phone-pad"
                    />
                  </>
                )}

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={styles.saveBtnWrapper}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={
                      saving
                        ? ["#94A3B8", "#64748B"]
                        : [COLORS.primary, COLORS.secondary]
                    }
                    style={styles.saveBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle"
                          size={ms(20)}
                          color="#fff"
                          style={{ marginRight: hs(8) }}
                        />
                        <Text style={styles.btnText}>Save Configuration</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </MotiView>

          <View style={styles.securityNote}>
            <Ionicons
              name="shield-checkmark"
              size={ms(20)}
              color={COLORS.primary}
            />
            <Text style={styles.securityNoteText}>
              Your credentials are encrypted and stored securely. We never share
              your keys.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// --- Sub-Components for Cleaner Code ---

const InputField = ({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  keyboardType,
}) => (
  <>
    <Text style={styles.inputLabelTop}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.textArea]}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      multiline={multiline}
      keyboardType={keyboardType || "default"}
    />
  </>
);

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: hs(16),
    paddingBottom: vs(12),
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: hs(40),
    height: hs(40),
    borderRadius: hs(12),
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: hs(12),
  },
  headerTitle: {
    fontSize: ms(18),
    fontWeight: "800",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: ms(12),
    color: COLORS.textMuted,
    fontWeight: "500",
    marginTop: vs(2),
  },

  // Scroll
  scrollContent: {
    padding: hs(20),
  },

  // Main Card
  mainCard: {
    backgroundColor: COLORS.surface,
    borderRadius: hs(24),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: vs(10) },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
    marginBottom: vs(16),
  },
  cardVisualHeader: {
    alignItems: "center",
    paddingTop: vs(30),
    paddingBottom: vs(20),
    backgroundColor: "#F8FAFC", // Subtle background separation
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    width: "100%",
  },
  iconCircle: {
    width: hs(72),
    height: hs(72),
    borderRadius: hs(36),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: vs(12),
    shadowColor: COLORS.whatsapp,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  statusBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.8)",
    paddingHorizontal: hs(12),
    paddingVertical: vs(4),
    borderRadius: hs(20),
  },
  statusDot: {
    width: hs(8),
    height: hs(8),
    borderRadius: hs(4),
    marginRight: hs(6),
  },
  statusText: {
    fontSize: ms(12),
    fontWeight: "700",
  },
  title: {
    fontSize: ms(22),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: vs(20),
    marginHorizontal: hs(20),
    textAlign: "center",
  },
  subtitle: {
    fontSize: ms(14),
    color: COLORS.textDim,
    textAlign: "center",
    lineHeight: ms(22),
    marginBottom: vs(10),
    marginTop: vs(8),
    marginHorizontal: hs(20),
  },

  // Content Sections
  contentSection: {
    padding: hs(20),
    width: "100%",
  },
  sectionTitle: {
    fontSize: ms(13),
    fontWeight: "700",
    color: COLORS.textMuted,
    marginBottom: vs(12),
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  infoRow: {
    marginBottom: vs(16),
  },
  infoLabel: {
    fontSize: ms(12),
    fontWeight: "600",
    color: COLORS.textMuted,
    marginBottom: vs(6),
  },
  infoValueBox: {
    backgroundColor: COLORS.bg,
    padding: hs(16),
    borderRadius: hs(12),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoValueText: {
    fontSize: ms(16),
    fontWeight: "700",
    color: COLORS.text,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: vs(20),
  },

  // Action Button
  actionBtn: {
    marginBottom: vs(12),
    borderRadius: hs(16),
    overflow: "hidden",
    position: "relative",
  },
  actionBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: hs(16),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: hs(16),
  },
  actionIconBox: {
    width: hs(44),
    height: hs(44),
    borderRadius: hs(12),
    backgroundColor: COLORS.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  actionTitle: {
    fontSize: ms(15),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: vs(2),
  },
  actionDesc: {
    fontSize: ms(12),
    color: COLORS.textMuted,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },

  // OTP
  otpInput: {
    backgroundColor: COLORS.bg,
    borderRadius: hs(16),
    padding: hs(16),
    fontSize: ms(32),
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: hs(12),
    width: "100%",
    borderWidth: 2,
    borderColor: COLORS.border,
    marginBottom: vs(20),
    color: COLORS.text,
  },
  primaryBtnWrapper: {
    marginTop: vs(8),
    borderRadius: hs(16),
    overflow: "hidden",
  },
  primaryBtn: {
    paddingVertical: vs(16),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnText: {
    color: "#fff",
    fontSize: ms(15),
    fontWeight: "800",
  },
  retryBtn: {
    marginTop: vs(20),
    alignItems: "center",
  },
  retryText: {
    color: COLORS.textMuted,
    fontWeight: "700",
    fontSize: ms(14),
  },

  // Forms
  inputLabelTop: {
    fontSize: ms(12),
    fontWeight: "700",
    color: COLORS.textDim,
    marginBottom: vs(6),
    marginTop: vs(10),
    marginLeft: hs(4),
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: hs(12),
    padding: hs(14),
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: ms(14),
    color: COLORS.text,
    fontWeight: "500",
  },
  textArea: {
    minHeight: vs(100),
    textAlignVertical: "top",
    paddingTop: vs(14),
  },

  // Provider Grid
  providerGrid: {
    flexDirection: "row",
    gap: hs(10),
    marginBottom: vs(10),
    flexWrap: "wrap",
  },
  providerCard: {
    flex: 1,
    minWidth: "45%",
    paddingVertical: vs(12),
    paddingHorizontal: hs(10),
    borderRadius: hs(12),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  providerCardActive: {
    backgroundColor: COLORS.softGreen,
    borderColor: COLORS.secondary,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  providerCardText: {
    color: COLORS.textMuted,
    fontWeight: "700",
    fontSize: ms(13),
  },
  providerCardTextActive: {
    color: COLORS.secondary,
  },

  // Save Button
  saveBtnWrapper: {
    marginTop: vs(30),
    borderRadius: hs(16),
    overflow: "hidden",
  },
  saveBtn: {
    paddingVertical: vs(16),
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  // Security Note
  securityNote: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    padding: hs(16),
    borderRadius: hs(16),
    alignItems: "center",
    gap: hs(12),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  securityNoteText: {
    flex: 1,
    fontSize: ms(12),
    color: COLORS.textDim,
    fontWeight: "600",
    lineHeight: ms(18),
  },
});
