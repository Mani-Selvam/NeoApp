import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import InlineAlert from "../../components/InlineAlert";
import { API_URL } from "../../services/apiConfig";

const getUI = (w, h, insets) => {
  const usableHeight = h - insets.top - insets.bottom;
  const isTablet = w >= 768;
  const isLarge = w >= 414 && w < 768;
  const isMedium = w >= 360 && w < 414;
  const isShort = usableHeight < 760;
  const isVeryShort = usableHeight < 700;
  return {
    isTablet,
    isShort,
    isVeryShort,
    sidePadding: isTablet ? 80 : isLarge ? 28 : isMedium ? 22 : 18,
    cardMaxWidth: isTablet ? 520 : 480,
    logoSize: isTablet ? 88 : isLarge ? 76 : isMedium ? 68 : 60,
    titleSize: isTablet ? 32 : isLarge ? 27 : isMedium ? 25 : 23,
    subtitleSize: isTablet ? 15 : isLarge ? 13.5 : 13,
    inputHeight: isTablet ? 64 : isLarge ? 58 : isMedium ? 54 : 52,
    buttonHeight: isTablet ? 60 : isLarge ? 55 : isMedium ? 52 : 50,
    fieldGap: isTablet ? 22 : isLarge ? 18 : 16,
    formPadding: isTablet ? 40 : isVeryShort ? 18 : isLarge ? 28 : isMedium ? 24 : 20,
    radius: isTablet ? 18 : 14,
    topPad: isVeryShort ? Math.max(insets.top + 4, 12) : Math.max(insets.top + 8, 20),
    botPad: isVeryShort ? Math.max(insets.bottom + 12, 18) : Math.max(insets.bottom + 12, 24),
    minH: usableHeight,
    centerContent: !isShort,
  };
};

const Orb = ({ color, size, top, left, right, bottom, opacity = 0.3, delay = 0 }) => {
  const y = useSharedValue(0);
  const s = useSharedValue(1);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-16, { duration: 3800, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
          withTiming(0, { duration: 3800, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
        ),
        -1,
        false,
      ),
    );
    s.value = withDelay(
      delay + 200,
      withRepeat(
        withSequence(
          withTiming(1.07, { duration: 4400, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
          withTiming(1, { duration: 4400, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, s, y]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: s.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          top,
          left,
          right,
          bottom,
        },
        anim,
      ]}
    />
  );
};

const Field = ({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  secureTextEntry = false,
  showPwd,
  setShowPwd,
  autoCapitalize = "none",
  maxLength,
  ui,
  inputStyle,
}) => {
  const focus = useSharedValue(0);
  const [isFocused, setIsFocused] = useState(false);

  const onFocus = () => {
    setIsFocused(true);
    focus.value = withTiming(1, { duration: 220 });
  };

  const onBlur = () => {
    setIsFocused(false);
    focus.value = withTiming(0, { duration: 220 });
  };

  const wrapStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], ["rgba(203,213,225,0.8)", "#6366f1"]),
    borderWidth: interpolate(focus.value, [0, 1], [1.5, 2]),
    backgroundColor: interpolateColor(
      focus.value,
      [0, 1],
      ["rgba(248,250,252,0.9)", "rgba(99,102,241,0.05)"],
    ),
    shadowOpacity: interpolate(focus.value, [0, 1], [0, 0.2]),
    shadowRadius: interpolate(focus.value, [0, 1], [0, 16]),
    shadowColor: "#6366f1",
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], ["#94a3b8", "#6366f1"]),
    fontSize: interpolate(focus.value, [0, 1], [12.5, 11.5]),
  }));

  return (
    <View style={{ width: "100%" }}>
      <Animated.Text
        style={[
          {
            fontWeight: "700",
            marginBottom: 8,
            marginLeft: 2,
            letterSpacing: 0.5,
          },
          labelStyle,
        ]}
      >
        {label.toUpperCase()}
      </Animated.Text>
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            height: ui.inputHeight,
            borderRadius: ui.radius,
            paddingHorizontal: 16,
            overflow: "hidden",
          },
          wrapStyle,
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={isFocused ? "#6366f1" : "#94a3b8"}
          style={{ marginRight: 12 }}
        />
        <TextInput
          style={[
            {
              flex: 1,
              color: "#1e1b4b",
              fontSize: 15,
              fontWeight: "500",
              paddingVertical: 0,
              letterSpacing: 0.2,
            },
            inputStyle,
          ]}
          placeholder={placeholder}
          placeholderTextColor="rgba(148,163,184,0.7)"
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry && !showPwd}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          maxLength={maxLength}
          selectionColor="#6366f1"
        />
        {secureTextEntry ? (
          <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={{ padding: 6 }}>
            <Ionicons
              name={showPwd ? "eye-outline" : "eye-off-outline"}
              size={19}
              color={isFocused ? "#6366f1" : "#94a3b8"}
            />
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </View>
  );
};

const ActionButton = ({ onPress, loading, title, icon = "arrow-forward", ui }) => {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.4);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
        withTiming(0.4, { duration: 2200, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
      ),
      -1,
      false,
    );
  }, [glow]);

  const handleIn = () => {
    scale.value = withSpring(0.96, { damping: 14 });
  };

  const handleOut = () => {
    scale.value = withSpring(1, { damping: 12 });
    onPress();
  };

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: glow.value,
    shadowRadius: interpolate(glow.value, [0.4, 1], [14, 24]),
  }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handleIn}
      onPressOut={handleOut}
      disabled={loading}
      style={{ width: "100%" }}
    >
      <Animated.View
        style={[
          {
            height: ui.buttonHeight,
            borderRadius: ui.radius,
            overflow: "hidden",
            shadowColor: "#6366f1",
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
            marginTop: 4,
          },
          btnStyle,
        ]}
      >
        <LinearGradient
          colors={["#6366f1", "#818cf8", "#a5b4fc"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "900",
                  fontSize: ui.isTablet ? 16 : 15,
                  letterSpacing: 1.2,
                }}
              >
                {title}
              </Text>
              <Ionicons name={icon} size={17} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
};

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const ui = useMemo(() => getUI(width, height, insets), [width, height, insets]);

  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("error");

  const showAlert = (message, type = "error") => {
    const msg = String(message || "").replace(/\s+/g, " ").trim();
    setAlertType(type);
    setAlertMsg(msg);
    if (msg) setTimeout(() => setAlertMsg(""), 4000);
  };

  const getPayloadKey = () => {
    const trimmed = identifier.trim();
    const isEmail = trimmed.includes("@");
    return isEmail ? { email: trimmed.toLowerCase() } : { mobile: trimmed };
  };

  const isEmailIdentifier = identifier.trim().includes("@");

  const handleSendOTP = async () => {
    if (!identifier.trim()) {
      showAlert("Please enter your email or mobile number");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/send-otp`, {
        ...getPayloadKey(),
        type: "forgot_password",
        method: isEmailIdentifier ? "email" : "whatsapp",
      });

      if (response.data.success) {
        setStep(2);
        showAlert(response.data.message || "OTP sent successfully.", "info");
      }
    } catch (error) {
      showAlert(error.response?.data?.message || "Failed to send OTP. User may not exist.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      showAlert("Please enter the OTP");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/verify-otp`, {
        ...getPayloadKey(),
        otp,
      });

      if (response.data.success) {
        setStep(3);
        showAlert("OTP verified successfully.", "info");
      }
    } catch (error) {
      showAlert(error.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      showAlert("Please fill in all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      showAlert("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        ...getPayloadKey(),
        password: newPassword,
        otp,
      });
      showAlert("Password reset successfully. Please login.", "info");
      setTimeout(() => navigation.navigate("Login"), 800);
    } catch (error) {
      showAlert(error.response?.data?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const title =
    step === 1 ? "FORGOT PASSWORD" : step === 2 ? "VERIFY OTP" : "RESET PASSWORD";
  const subtitle =
    step === 1
      ? "Enter your email or mobile to receive an OTP"
      : step === 2
        ? `Enter the code sent to ${identifier}`
        : "Create a new secure password";

  return (
    <View style={S.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0f4ff" translucent />

      <LinearGradient colors={["#f0f4ff", "#fafbff", "#eef2ff"]} style={StyleSheet.absoluteFill} />

      <Orb color="#a5b4fc" size={420} top={-160} left={-160} opacity={0.45} delay={0} />
      <Orb color="#c4b5fd" size={340} bottom={-130} right={-130} opacity={0.35} delay={700} />
      <Orb color="#93c5fd" size={200} top="40%" left={-70} opacity={0.28} delay={350} />

      <View style={[S.ring, { width: 560, height: 560, top: -230, left: -210, borderRadius: 280 }]} />
      <View
        style={[
          S.ring,
          { width: 380, height: 380, bottom: -150, right: -150, borderRadius: 190 },
        ]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            {
              flexGrow: 1,
              justifyContent: ui.centerContent ? "center" : "flex-start",
              minHeight: ui.minH,
              paddingHorizontal: ui.sidePadding,
              paddingTop: ui.topPad,
              paddingBottom: ui.botPad,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        >
          <TouchableOpacity style={S.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#6366f1" />
          </TouchableOpacity>

          <Animated.View
            entering={FadeInDown.delay(80).duration(650).springify()}
            style={[S.header, { marginBottom: ui.isTablet ? 34 : ui.isVeryShort ? 18 : 26 }]}
          >
            <View
              style={[
                S.logoRing,
                {
                  width: ui.logoSize + 28,
                  height: ui.logoSize + 28,
                  borderRadius: (ui.logoSize + 28) / 2,
                  marginBottom: 20,
                },
              ]}
            >
              <View
                style={[
                  S.logoCircle,
                  {
                    width: ui.logoSize,
                    height: ui.logoSize,
                    borderRadius: ui.logoSize / 2,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="lock-reset"
                  size={Math.round(ui.logoSize * 0.46)}
                  color="#6366f1"
                />
              </View>
            </View>

            <Text style={[S.title, { fontSize: ui.titleSize }]}>{title}</Text>
            <View style={S.accentLine} />
            <Text style={[S.subtitle, { fontSize: ui.subtitleSize }]}>{subtitle}</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(220).duration(680).springify()}
            style={[
              S.card,
              {
                maxWidth: ui.cardMaxWidth,
                alignSelf: "center",
                width: "100%",
                borderRadius: ui.radius + 10,
              },
            ]}
          >
            <LinearGradient
              colors={["rgba(99,102,241,0.07)", "transparent"]}
              style={[
                S.cardTopGlow,
                {
                  borderTopLeftRadius: ui.radius + 10,
                  borderTopRightRadius: ui.radius + 10,
                },
              ]}
            />

            <View style={[S.cardInner, { padding: ui.formPadding }]}>
              <InlineAlert
                message={alertMsg}
                type={alertType}
                onClose={() => setAlertMsg("")}
              />

              {step === 1 ? (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <View style={{ marginBottom: ui.fieldGap }}>
                    <Field
                      label="Email Or Mobile"
                      icon="mail-outline"
                      value={identifier}
                      onChangeText={setIdentifier}
                      placeholder="Enter email or mobile"
                      keyboardType={identifier.includes("@") ? "email-address" : "default"}
                      ui={ui}
                    />
                  </View>

                  <ActionButton onPress={handleSendOTP} loading={loading} title="SEND OTP" ui={ui} />
                </Animated.View>
              ) : null}

              {step === 2 ? (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <View style={{ marginBottom: ui.fieldGap }}>
                    <Field
                      label="OTP Code"
                      icon="keypad-outline"
                      value={otp}
                      onChangeText={(value) => setOtp(value.replace(/\D/g, ""))}
                      placeholder="Enter 6-digit code"
                      keyboardType="number-pad"
                      maxLength={6}
                      inputStyle={{ letterSpacing: 5, fontSize: 17, fontWeight: "700" }}
                      ui={ui}
                    />
                  </View>

                  <ActionButton
                    onPress={handleVerifyOTP}
                    loading={loading}
                    title="VERIFY CODE"
                    icon="checkmark-circle-outline"
                    ui={ui}
                  />

                  <View style={S.actionRow}>
                    <TouchableOpacity disabled={loading} onPress={handleSendOTP} style={S.actionLink}>
                      <Text style={S.actionLinkText}>Resend OTP</Text>
                    </TouchableOpacity>
                    <View style={S.actionDivider} />
                    <TouchableOpacity disabled={loading} onPress={() => setStep(1)} style={S.actionLink}>
                      <Text style={[S.actionLinkText, { color: "#94a3b8" }]}>Change Details</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              ) : null}

              {step === 3 ? (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <View style={{ marginBottom: ui.fieldGap }}>
                    <Field
                      label="New Password"
                      icon="lock-closed-outline"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Create a new password"
                      secureTextEntry
                      showPwd={showPassword}
                      setShowPwd={setShowPassword}
                      ui={ui}
                    />
                  </View>

                  <View style={{ marginBottom: ui.fieldGap }}>
                    <Field
                      label="Confirm Password"
                      icon="shield-checkmark-outline"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Repeat your password"
                      secureTextEntry
                      showPwd={showPassword}
                      setShowPwd={setShowPassword}
                      ui={ui}
                    />
                  </View>

                  <ActionButton
                    onPress={handleResetPassword}
                    loading={loading}
                    title="RESET PASSWORD"
                    icon="refresh-outline"
                    ui={ui}
                  />
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(480).duration(550)}
            style={[S.footer, { marginTop: ui.isTablet ? 28 : ui.isVeryShort ? 14 : 20 }]}
          >
            <Text style={S.footerText}>Remembered your password? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={S.footerLink}>Sign In →</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f4ff" },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.12)",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.15)",
    marginBottom: 18,
  },
  header: { alignItems: "center" },
  logoRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(99,102,241,0.2)",
    backgroundColor: "rgba(99,102,241,0.06)",
  },
  logoCircle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.1)",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  title: {
    fontWeight: "900",
    color: "#1e1b4b",
    letterSpacing: 2.5,
    marginBottom: 10,
    textAlign: "center",
  },
  accentLine: {
    width: 40,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#6366f1",
    marginBottom: 12,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  subtitle: {
    color: "#64748b",
    fontWeight: "500",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  card: {
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.1)",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 36,
    elevation: 18,
    marginBottom: 4,
  },
  cardTopGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 70,
  },
  cardInner: {},
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  actionLink: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionLinkText: {
    color: "#6366f1",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  actionDivider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: { color: "#94a3b8", fontSize: 13.5, fontWeight: "500" },
  footerLink: {
    color: "#6366f1",
    fontWeight: "800",
    fontSize: 13.5,
    letterSpacing: 0.3,
  },
});
