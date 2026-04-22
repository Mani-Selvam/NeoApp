import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  // Backgrounds
  bg: "#F0F4F8",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",

  // Brand — WA-adjacent teal spectrum
  brand: "#00A884", // WhatsApp teal
  brandDeep: "#007A63", // darker
  brandLight: "#E8F8F5", // tint
  brandBorder: "#B2DFDB",

  // Semantic
  success: "#00A884",
  successBg: "#E8F8F5",
  warn: "#F59E0B",
  warnBg: "#FFFBEB",
  danger: "#EF4444",

  // Text
  ink: "#0D1B2A",
  mid: "#4A5568",
  mute: "#9AA5B4",
  placeholder: "#CBD5E0",

  // UI
  line: "#E8EDF2",
  lineDeep: "#CBD5E0",
  inputBg: "#F7F9FB",
  inputBorder: "#DDE3EA",
  inputFocus: "#00A884",

  // Provider accent map
  providerColors: {
    WATI: { bg: "#E6F7FF", border: "#91D5FF", text: "#0050B3", dot: "#1890FF" },
    META: { bg: "#F0F0FF", border: "#B7B7FF", text: "#4F46E5", dot: "#5856D6" },
    NEO: { bg: "#FFF0F6", border: "#FFB8D1", text: "#C41D7F", dot: "#EB2F96" },
    TWILIO: {
      bg: "#FFF7E6",
      border: "#FFD591",
      text: "#874D00",
      dot: "#FA8C16",
    },
  },
};

const PROVIDERS = { WATI: "WATI", META: "META", NEO: "NEO", TWILIO: "TWILIO" };

const PROVIDER_META = {
  WATI: { icon: "globe-outline", label: "WATI", sub: "Live server" },
  META: { icon: "logo-facebook", label: "Meta", sub: "Cloud API" },
  NEO: { icon: "flash-outline", label: "Neo", sub: "Custom API" },
  TWILIO: { icon: "call-outline", label: "Twilio", sub: "Messaging" },
};

const emptyForm = {
  provider: PROVIDERS.WATI,
  defaultCountry: "91",
  watiBaseUrl: "",
  watiApiToken: "",
  metaWhatsappToken: "",
  metaPhoneNumberId: "",
  neoBaseUrl: "",
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
  watiApiToken: config.watiApiToken || "",
  metaWhatsappToken: config.metaWhatsappToken || "",
  metaPhoneNumberId: config.metaPhoneNumberId || "",
  neoBaseUrl: config.neoBaseUrl || "",
  neoAccountName: config.neoAccountName || "",
  neoApiKey: config.neoApiKey || "",
  neoPhoneNumber: config.neoPhoneNumber || "",
  neoBearerToken: config.neoBearerToken || "",
  twilioAccountSid: config.twilioAccountSid || "",
  twilioAuthToken: config.twilioAuthToken || "",
  twilioWhatsappNumber: config.twilioWhatsappNumber || "",
});

// ─── STEP CONFIG ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Status" },
  { id: 2, label: "Verify" },
  { id: 3, label: "Config" },
];

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

/** Floating-label text input */
const FloatingInput = ({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  keyboardType = "default",
  secureTextEntry = false,
  autoCapitalize = "none",
}) => {
  const [focused, setFocused] = useState(false);
  const hasValue = value && value.length > 0;

  return (
    <View style={FI.wrap}>
      <Text
        style={[
          FI.label,
          (focused || hasValue) && FI.labelActive,
          focused && FI.labelFocused,
        ]}
      >
        {label}
      </Text>
      <TextInput
        style={[
          FI.input,
          multiline && FI.inputMulti,
          focused && FI.inputFocused,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={focused ? placeholder : ""}
        placeholderTextColor={T.placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        textAlignVertical={multiline ? "top" : "center"}
        selectionColor={T.brand}
      />
    </View>
  );
};

const FI = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: T.mute,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  labelActive: { color: T.mid },
  labelFocused: { color: T.brand },
  input: {
    backgroundColor: T.inputBg,
    borderWidth: 1.5,
    borderColor: T.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: T.ink,
    fontWeight: "500",
    minHeight: 50,
  },
  inputFocused: {
    borderColor: T.inputFocus,
    backgroundColor: "#FAFFFE",
  },
  inputMulti: {
    minHeight: 100,
    paddingTop: 13,
  },
});

/** Step progress indicator */
const StepBar = ({ current }) => (
  <View style={SB.wrap}>
    {STEPS.map((step, idx) => {
      const done = current > step.id;
      const active = current === step.id;
      return (
        <View key={step.id} style={SB.item}>
          <View
            style={[
              SB.circle,
              done && SB.circleDone,
              active && SB.circleActive,
            ]}
          >
            {done ? (
              <Ionicons name="checkmark" size={13} color="#fff" />
            ) : (
              <Text style={[SB.num, active && SB.numActive]}>{step.id}</Text>
            )}
          </View>
          <Text
            style={[SB.label, active && SB.labelActive, done && SB.labelDone]}
          >
            {step.label}
          </Text>
          {idx < STEPS.length - 1 && (
            <View style={[SB.connector, done && SB.connectorDone]} />
          )}
        </View>
      );
    })}
  </View>
);

const SB = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 0,
  },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.lineDeep,
    backgroundColor: T.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  circleActive: {
    borderColor: T.brand,
    backgroundColor: T.brand,
  },
  circleDone: {
    borderColor: T.brand,
    backgroundColor: T.brand,
  },
  num: { fontSize: 12, fontWeight: "700", color: T.mute },
  numActive: { color: "#fff" },
  label: { fontSize: 12, fontWeight: "600", color: T.mute },
  labelActive: { color: T.brand, fontWeight: "700" },
  labelDone: { color: T.brand },
  connector: {
    width: 32,
    height: 1.5,
    backgroundColor: T.lineDeep,
    marginHorizontal: 4,
  },
  connectorDone: { backgroundColor: T.brand },
});

/** Provider selector card */
const ProviderCard = ({ id, selected, onPress }) => {
  const meta = PROVIDER_META[id];
  const colors = T.providerColors[id];
  const isActive = selected === id;
  return (
    <TouchableOpacity
      style={[
        PC.card,
        isActive && { borderColor: colors.border, backgroundColor: colors.bg },
      ]}
      onPress={() => onPress(id)}
      activeOpacity={0.75}
    >
      <View style={[PC.dot, { backgroundColor: colors.dot }]} />
      <Ionicons
        name={meta.icon}
        size={18}
        color={isActive ? colors.text : T.mute}
        style={{ marginBottom: 4 }}
      />
      <Text style={[PC.label, isActive && { color: colors.text }]}>
        {meta.label}
      </Text>
      <Text style={[PC.sub, isActive && { color: colors.text, opacity: 0.7 }]}>
        {meta.sub}
      </Text>
      {isActive && (
        <View style={[PC.check, { backgroundColor: colors.dot }]}>
          <Ionicons name="checkmark" size={9} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const PC = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "22%",
    borderWidth: 1.5,
    borderColor: T.inputBorder,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    backgroundColor: T.surface,
    position: "relative",
  },
  dot: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  label: { fontSize: 12, fontWeight: "700", color: T.mid, marginTop: 2 },
  sub: { fontSize: 10, fontWeight: "500", color: T.mute, marginTop: 1 },
  check: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function WhatsAppSettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [waConfig, setWaConfig] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editStep, setEditStep] = useState(1);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [saving, setSaving] = useState(false);

  // OTP input refs for 6-box UX
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);

  // Fade animation on step change
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateStep = (cb) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    setTimeout(cb, 120);
  };

  const loadConfig = useCallback(async () => {
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConfig();
      return () => { };
    }, [loadConfig]),
  );

  const updateField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── OTP digit box logic ───────────────────────────────────────────────────
  const handleOtpDigit = (idx, val) => {
    const digits = [...otpDigits];
    digits[idx] = val.slice(-1);
    setOtpDigits(digits);
    setOtpCode(digits.join(""));
    if (val && idx < 5) otpRefs[idx + 1].current?.focus();
    if (!val && idx > 0) otpRefs[idx - 1].current?.focus();
  };

  const clearOtp = () => {
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpCode("");
    otpRefs[0].current?.focus();
  };

  const handleRequestOtp = async () => {
    try {
      setSendingOtp(true);
      const client = await getApiClient();
      await client.post("/auth/send-otp", {
        email: user?.email,
        mobile: user?.mobile,
        type: "edit_whatsapp_token",
        method: "whatsapp",
      });
      animateStep(() => {
        setEditStep(2);
        clearOtp();
      });
    } catch {
      Alert.alert("Error", "Failed to send OTP. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length < 6) return;
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
        animateStep(() => setEditStep(3));
        clearOtp();
      } else {
        Alert.alert(
          "Invalid OTP",
          "The code you entered is incorrect. Please try again.",
        );
      }
    } catch {
      Alert.alert("Error", "Verification failed. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const validateForm = () => {
    if (form.provider === PROVIDERS.WATI)
      return form.watiBaseUrl.trim() && form.watiApiToken.trim();
    if (form.provider === PROVIDERS.META)
      return form.metaWhatsappToken.trim() && form.metaPhoneNumberId.trim();
    if (form.provider === PROVIDERS.NEO)
      return (
        form.neoBaseUrl.trim() &&
        form.neoAccountName.trim() &&
        form.neoPhoneNumber.trim() &&
        (form.neoApiKey.trim() || form.neoBearerToken.trim())
      );
    if (form.provider === PROVIDERS.TWILIO)
      return (
        form.twilioAccountSid.trim() &&
        form.twilioAuthToken.trim() &&
        form.twilioWhatsappNumber.trim()
      );
    return false;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert(
        "Missing Fields",
        "Please fill all required fields for the selected provider.",
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
        neoBaseUrl: form.neoBaseUrl.trim(),
        neoAccountName: form.neoAccountName.trim(),
        neoApiKey: form.neoApiKey.trim(),
        neoBearerToken: form.neoBearerToken.trim(),
        neoPhoneNumber: form.neoPhoneNumber.trim(),
        twilioAccountSid: form.twilioAccountSid.trim(),
        twilioAuthToken: form.twilioAuthToken.trim(),
        twilioWhatsappNumber: form.twilioWhatsappNumber.trim(),
      };
      const resp = await client.put("/whatsapp/config", payload);
      if (resp.data?.ok) {
        setWaConfig(resp.data.config || {});
        setForm((prev) => mergeConfigToForm({ ...resp.data.config, ...prev }));
        await loadConfig();
        Alert.alert("Saved!", "WhatsApp configuration updated successfully.", [
          { text: "Done", onPress: () => navigation.goBack() },
        ]);
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

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <ScreenSkeleton bg={T.bg}>
        <View style={{ paddingTop: insets.top }}>
          <HeaderSkeleton withAvatar={false} />
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <SkeletonCard>
            <SkeletonLine width="54%" height={14} />
            <SkeletonSpacer h={14} />
            <FormSkeleton fields={4} />
          </SkeletonCard>
        </View>
      </ScreenSkeleton>
    );
  }

  const isConnected = Boolean(waConfig?.provider);
  const isWide = W >= 480;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={S.headerBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={T.brand} />
        </TouchableOpacity>

        <View style={S.headerCenter}>
          <Text style={S.headerTitle}>WhatsApp</Text>
          <Text style={S.headerSub}>API Configuration</Text>
        </View>

        {/* Status pill */}
        <View
          style={[
            S.headerStatusPill,
            isConnected ? S.headerStatusPillOn : S.headerStatusPillOff,
          ]}
        >
          <View
            style={[
              S.headerStatusDot,
              { backgroundColor: isConnected ? T.brand : T.warn },
            ]}
          />
          <Text
            style={[
              S.headerStatusText,
              { color: isConnected ? T.brandDeep : T.warn },
            ]}
          >
            {isConnected ? "Live" : "Off"}
          </Text>
        </View>
      </View>

      {/* ── Step Bar ── */}
      <View style={S.stepBarWrap}>
        <StepBar current={editStep} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={[
            S.scroll,
            {
              paddingHorizontal: isWide ? 32 : 16,
              paddingBottom: insets.bottom + 40,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* ══════════════ STEP 1: STATUS ══════════════ */}
            {editStep === 1 && (
              <MotiView
                from={{ opacity: 0, translateY: 16 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 340 }}
              >
                {/* Hero strip */}
                <LinearGradient
                  colors={["#00A884", "#007A63"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={S.hero}
                >
                  <View style={S.heroIconWrap}>
                    <Ionicons name="logo-whatsapp" size={36} color="#fff" />
                  </View>
                  <View style={S.heroText}>
                    <Text style={S.heroTitle}>WhatsApp Business API</Text>
                    <Text style={S.heroSub}>
                      Automate messaging via your CRM
                    </Text>
                  </View>
                </LinearGradient>

                {/* Status card */}
                <View style={S.statusCard}>
                  <View style={S.statusCardRow}>
                    <View
                      style={[
                        S.statusIconWrap,
                        {
                          backgroundColor: isConnected
                            ? T.brandLight
                            : T.warnBg,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isConnected ? "checkmark-circle" : "alert-circle"}
                        size={22}
                        color={isConnected ? T.brand : T.warn}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.statusLabel}>
                        {isConnected ? "Integration Active" : "Not Configured"}
                      </Text>
                      <Text style={S.statusSub}>
                        {isConnected
                          ? `Provider: ${waConfig.provider}`
                          : "Set up your WhatsApp API provider to start sending messages."}
                      </Text>
                    </View>
                    <View
                      style={[
                        S.liveChip,
                        {
                          backgroundColor: isConnected
                            ? T.brandLight
                            : T.warnBg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          S.liveChipText,
                          { color: isConnected ? T.brand : T.warn },
                        ]}
                      >
                        {isConnected ? "Active" : "Setup"}
                      </Text>
                    </View>
                  </View>

                  {isConnected && (
                    <View style={S.providerInfoRow}>
                      <View style={S.providerInfoItem}>
                        <Text style={S.providerInfoLabel}>Provider</Text>
                        <Text style={S.providerInfoValue}>
                          {waConfig.provider}
                        </Text>
                      </View>
                      <View style={S.providerInfoDivider} />
                      <View style={S.providerInfoItem}>
                        <Text style={S.providerInfoLabel}>Country</Text>
                        <Text style={S.providerInfoValue}>
                          +{waConfig.defaultCountry || "91"}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Edit action */}
                <TouchableHighlight
                  style={S.editActionCard}
                  underlayColor="#F0FDFB"
                  onPress={() => {
                    if (waConfig?.editVerificationActive) {
                      animateStep(() => setEditStep(3));
                      return;
                    }
                    handleRequestOtp();
                  }}
                >
                  <View style={S.editActionInner}>
                    <View style={S.editActionIcon}>
                      <Ionicons
                        name="create-outline"
                        size={20}
                        color={T.brand}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={S.editActionTitle}>Edit Configuration</Text>
                      <Text style={S.editActionSub}>
                        {sendingOtp
                          ? "Sending OTP…"
                          : "Verify identity to change provider or update tokens"}
                      </Text>
                    </View>
                    {sendingOtp ? (
                      <ActivityIndicator size="small" color={T.brand} />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={T.mute}
                      />
                    )}
                  </View>
                </TouchableHighlight>

                {/* Security note */}
                <View style={S.secNote}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={15}
                    color={T.brand}
                  />
                  <Text style={S.secNoteText}>
                    Your credentials are end-to-end encrypted and never shared.
                  </Text>
                </View>
              </MotiView>
            )}

            {/* ══════════════ STEP 2: OTP ══════════════ */}
            {editStep === 2 && (
              <MotiView
                from={{ opacity: 0, translateY: 16 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 340 }}
              >
                {/* OTP hero */}
                <View style={S.otpHero}>
                  <View style={S.otpHeroIcon}>
                    <Ionicons name="lock-closed" size={28} color={T.brand} />
                  </View>
                  <Text style={S.otpHeroTitle}>Security Verification</Text>
                  <Text style={S.otpHeroSub}>
                    Enter the 6-digit code sent to your{"\n"}registered WhatsApp
                    number
                  </Text>
                </View>

                {/* 6-box OTP input */}
                <View style={S.otpBoxRow}>
                  {otpDigits.map((digit, idx) => (
                    <TextInput
                      key={idx}
                      ref={otpRefs[idx]}
                      style={[S.otpBox, digit && S.otpBoxFilled]}
                      value={digit}
                      onChangeText={(v) => handleOtpDigit(idx, v)}
                      keyboardType="number-pad"
                      maxLength={1}
                      autoFocus={idx === 0}
                      selectionColor={T.brand}
                      textAlign="center"
                    />
                  ))}
                </View>

                {/* Verify button */}
                <TouchableOpacity
                  style={[
                    S.primaryBtn,
                    otpCode.length < 6 && S.primaryBtnDisabled,
                  ]}
                  onPress={handleVerifyOtp}
                  disabled={verifyingOtp || otpCode.length < 6}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={
                      otpCode.length < 6
                        ? [T.mute, T.lineDeep]
                        : [T.brand, T.brandDeep]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={S.primaryBtnGrad}
                  >
                    {verifyingOtp ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          color="#fff"
                          style={{ marginRight: 8 }}
                        />
                        <Text style={S.primaryBtnText}>Verify & Continue</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Back link */}
                <TouchableOpacity
                  style={S.backLink}
                  onPress={() => animateStep(() => setEditStep(1))}
                >
                  <Ionicons
                    name="arrow-back-outline"
                    size={15}
                    color={T.mute}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={S.backLinkText}>Go back</Text>
                </TouchableOpacity>
              </MotiView>
            )}

            {/* ══════════════ STEP 3: CONFIG FORM ══════════════ */}
            {editStep === 3 && (
              <MotiView
                from={{ opacity: 0, translateY: 16 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: "timing", duration: 340 }}
              >
                {/* Section: Provider */}
                <View style={S.formSection}>
                  <Text style={S.formSectionTitle}>Select Provider</Text>
                  <View style={S.providerGrid}>
                    {Object.keys(PROVIDERS).map((id) => (
                      <ProviderCard
                        key={id}
                        id={id}
                        selected={form.provider}
                        onPress={(v) => updateField("provider", v)}
                      />
                    ))}
                  </View>
                </View>

                {/* Section: General */}
                <View style={S.formSection}>
                  <Text style={S.formSectionTitle}>General</Text>
                  <View style={S.formCard}>
                    <FloatingInput
                      label="Default Country Code"
                      value={form.defaultCountry}
                      onChange={(v) => updateField("defaultCountry", v)}
                      placeholder="91"
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Section: Provider credentials */}
                <View style={S.formSection}>
                  <Text style={S.formSectionTitle}>
                    {PROVIDER_META[form.provider].label} Credentials
                  </Text>
                  <View style={S.formCard}>
                    {form.provider === PROVIDERS.WATI && (
                      <>
                        <FloatingInput
                          label="Base URL"
                          value={form.watiBaseUrl}
                          onChange={(v) => updateField("watiBaseUrl", v)}
                          placeholder="https://live-server.wati.io"
                        />
                        <FloatingInput
                          label="API Token"
                          value={form.watiApiToken}
                          onChange={(v) => updateField("watiApiToken", v)}
                          placeholder="Bearer token"
                          multiline
                        />
                      </>
                    )}

                    {form.provider === PROVIDERS.META && (
                      <>
                        <FloatingInput
                          label="WhatsApp Token"
                          value={form.metaWhatsappToken}
                          onChange={(v) => updateField("metaWhatsappToken", v)}
                          placeholder="Permanent token"
                          multiline
                        />
                        <FloatingInput
                          label="Phone Number ID"
                          value={form.metaPhoneNumberId}
                          onChange={(v) => updateField("metaPhoneNumberId", v)}
                          placeholder="ID from Meta dashboard"
                        />
                      </>
                    )}

                    {form.provider === PROVIDERS.TWILIO && (
                      <>
                        <FloatingInput
                          label="Account SID"
                          value={form.twilioAccountSid}
                          onChange={(v) => updateField("twilioAccountSid", v)}
                          placeholder="ACxxxxxxxxx"
                        />
                        <FloatingInput
                          label="Auth Token"
                          value={form.twilioAuthToken}
                          onChange={(v) => updateField("twilioAuthToken", v)}
                          placeholder="Auth token"
                          multiline
                        />
                        <FloatingInput
                          label="WhatsApp Number"
                          value={form.twilioWhatsappNumber}
                          onChange={(v) =>
                            updateField("twilioWhatsappNumber", v)
                          }
                          placeholder="+14155238886"
                          keyboardType="phone-pad"
                        />
                      </>
                    )}

                    {form.provider === PROVIDERS.NEO && (
                      <>
                        <FloatingInput
                          label="Endpoint / Base URL"
                          value={form.neoBaseUrl}
                          onChange={(v) => updateField("neoBaseUrl", v)}
                          placeholder="https://aiwhatsappapi......"
                        />
                        <FloatingInput
                          label="Account Name"
                          value={form.neoAccountName}
                          onChange={(v) => updateField("neoAccountName", v)}
                          placeholder="Neo account name"
                        />
                        <FloatingInput
                          label="API Key"
                          value={form.neoApiKey}
                          onChange={(v) => updateField("neoApiKey", v)}
                          placeholder="Enter API key"
                          multiline
                        />

                        <FloatingInput
                          label="Phone Number"
                          value={form.neoPhoneNumber}
                          onChange={(v) => updateField("neoPhoneNumber", v)}
                          placeholder="WhatsApp number"
                          keyboardType="phone-pad"
                        />
                      </>
                    )}
                  </View>
                </View>

                {/* Save button */}
                <TouchableOpacity
                  style={[S.saveBtn, saving && S.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={
                      saving ? [T.mute, T.lineDeep] : [T.brand, T.brandDeep]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={S.saveBtnGrad}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={18}
                          color="#fff"
                          style={{ marginRight: 8 }}
                        />
                        <Text style={S.saveBtnText}>Save Configuration</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Back */}
                <TouchableOpacity
                  style={S.backLink}
                  onPress={() => animateStep(() => setEditStep(1))}
                >
                  <Ionicons
                    name="arrow-back-outline"
                    size={15}
                    color={T.mute}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={S.backLinkText}>Cancel</Text>
                </TouchableOpacity>
              </MotiView>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: T.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, paddingLeft: 4 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: T.ink,
    letterSpacing: -0.3,
  },
  headerSub: { fontSize: 12, color: T.mute, marginTop: 1 },
  headerStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginRight: 8,
  },
  headerStatusPillOn: { backgroundColor: T.brandLight },
  headerStatusPillOff: { backgroundColor: T.warnBg },
  headerStatusDot: { width: 7, height: 7, borderRadius: 4 },
  headerStatusText: { fontSize: 12, fontWeight: "700" },

  // ── Step bar
  stepBarWrap: {
    backgroundColor: T.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
  },

  // ── Scroll
  scroll: { paddingTop: 20 },

  // ── Hero strip (step 1)
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.3,
  },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 3 },

  // ── Status card (step 1)
  statusCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusCardRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  statusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusLabel: { fontSize: 15, fontWeight: "700", color: T.ink },
  statusSub: { fontSize: 12, color: T.mid, marginTop: 2, lineHeight: 18 },
  liveChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },
  liveChipText: { fontSize: 11, fontWeight: "800" },
  providerInfoRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
  },
  providerInfoItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  providerInfoLabel: {
    fontSize: 11,
    color: T.mute,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  providerInfoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: T.ink,
    marginTop: 2,
  },
  providerInfoDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: T.line,
    marginVertical: 10,
  },

  // ── Edit action card (step 1)
  editActionCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  editActionInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  editActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: T.brandLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editActionTitle: { fontSize: 15, fontWeight: "700", color: T.ink },
  editActionSub: { fontSize: 12, color: T.mid, marginTop: 2 },

  // ── Security note
  secNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: T.brandLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  secNoteText: { flex: 1, fontSize: 12, color: T.mid, lineHeight: 18 },

  // ── OTP step
  otpHero: { alignItems: "center", paddingVertical: 24 },
  otpHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: T.brandLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  otpHeroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: T.ink,
    letterSpacing: -0.4,
  },
  otpHeroSub: {
    fontSize: 14,
    color: T.mid,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },

  // 6-box OTP
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 28,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: T.inputBorder,
    backgroundColor: T.inputBg,
    fontSize: 24,
    fontWeight: "800",
    color: T.ink,
    textAlign: "center",
  },
  otpBoxFilled: { borderColor: T.brand, backgroundColor: "#FAFFFE" },

  // ── Primary action button
  primaryBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 14 },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },

  // ── Back link
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  backLinkText: { fontSize: 14, fontWeight: "600", color: T.mute },

  // ── Form sections
  formSection: { marginBottom: 20 },
  formSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: T.mute,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  formCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  providerGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  // ── Save button
  saveBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 14 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
});
