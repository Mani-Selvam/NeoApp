import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { useEffect, useMemo, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { MotiView } from "moti";

WebBrowser.maybeCompleteAuthSession();

import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { useAuth } from "../../contexts/AuthContext";
import { API_URL } from "../../services/apiConfig";

// ─── Responsive Metrics ───────────────────────────────────────────────────────
const getUI = (w, h, insets) => {
  const usableHeight = h - insets.top - insets.bottom;
  const isTablet = w >= 768;
  const isLarge = w >= 414 && w < 768;
  const isMedium = w >= 360 && w < 414;
  const isSmall = w < 360;
  const isShort = usableHeight < 760;
  const isVeryShort = usableHeight < 700;
  return {
    isTablet,
    isLarge,
    isMedium,
    isSmall,
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

// ─── Floating Orb ─────────────────────────────────────────────────────────────
const Orb = ({
  color,
  size,
  top,
  left,
  right,
  bottom,
  opacity = 0.3,
  delay = 0,
}) => {
  const y = useSharedValue(0);
  const s = useSharedValue(1);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-16, {
            duration: 3800,
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          withTiming(0, {
            duration: 3800,
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
        ),
        -1,
        false,
      ),
    );
    s.value = withDelay(
      delay + 200,
      withRepeat(
        withSequence(
          withTiming(1.07, {
            duration: 4400,
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
          withTiming(1, {
            duration: 4400,
            easing: Easing.bezier(0.45, 0, 0.55, 1),
          }),
        ),
        -1,
        false,
      ),
    );
  }, []);
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

// ─── Input Field ──────────────────────────────────────────────────────────────
const Field = ({
  label,
  icon,
  value,
  onChangeText,
  isPassword,
  showPwd,
  setShowPwd,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  ui,
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
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      ["rgba(203,213,225,0.8)", "#6366f1"],
    ),
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
          style={{
            flex: 1,
            color: "#1e1b4b",
            fontSize: 15,
            fontWeight: "500",
            paddingVertical: 0,
            letterSpacing: 0.2,
          }}
          placeholder={placeholder}
          placeholderTextColor="rgba(148,163,184,0.7)"
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          secureTextEntry={isPassword && !showPwd}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          selectionColor="#6366f1"
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPwd(!showPwd)}
            style={{ padding: 6 }}
          >
            <Ionicons
              name={showPwd ? "eye-outline" : "eye-off-outline"}
              size={19}
              color={isFocused ? "#6366f1" : "#94a3b8"}
            />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
};

// ─── Sign In Button ────────────────────────────────────────────────────────────
const SignInButton = ({ onPress, loading, ui }) => {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.4);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 2200,
          easing: Easing.bezier(0.45, 0, 0.55, 1),
        }),
        withTiming(0.4, {
          duration: 2200,
          easing: Easing.bezier(0.45, 0, 0.55, 1),
        }),
      ),
      -1,
      false,
    );
  }, []);

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
                  letterSpacing: 1.4,
                }}
              >
                SIGN IN
              </Text>
              <Ionicons name="arrow-forward" size={17} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── LoginScreen ───────────────────────────────────────────────────────────────
const LoginScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const ui = useMemo(
    () => getUI(width, height, insets),
    [width, height, insets],
  );
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("error");

  // Google first-time login mobile number collection states
  const [showMobileCollectModal, setShowMobileCollectModal] = useState(false);
  const [collectMobileValue, setCollectMobileValue] = useState("");
  const [googleToken, setGoogleToken] = useState("");
  const [googleUser, setGoogleUser] = useState(null);
  const [savingMobile, setSavingMobile] = useState(false);

  const showAlert = (m, type = "error") => {
    const msg = (m || "").toString().replace(/\s+/g, " ").trim();
    setAlertType(type);
    setAlertMsg(msg);
    if (msg) setTimeout(() => setAlertMsg(""), 4000);
  };

  const isExpoGo = Constants?.appOwnership === "expo";
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "953843416185-sihgmeq3lcv7ppt73b5ddkvni2d0cjio.apps.googleusercontent.com";
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "953843416185-j91ael3gcav98qip8bs7vk12gdiu2a4h.apps.googleusercontent.com";
  const googleExpoGoRedirectUri = process.env.EXPO_PUBLIC_GOOGLE_EXPO_GO_REDIRECT_URI || "https://auth.expo.io/@manibro29/neoapp-manibro29";

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: googleWebClientId,
    androidClientId: isExpoGo ? googleWebClientId : googleAndroidClientId,
    redirectUri: isExpoGo 
      ? googleExpoGoRedirectUri 
      : `com.googleusercontent.apps.953843416185-j91ael3gcav98qip8bs7vk12gdiu2a4h:/oauthredirect`,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      if (id_token) handleGoogleLogin(id_token);
    } else if (response?.type === "error" || response?.type === "cancel") {
      // Silently handle cancel or show alert if needed
    }
  }, [response]);

  const handleGoogleLogin = async (idToken) => {
    setLoading(true);
    try {
      const deviceModel = `${Platform.OS} ${String(Platform.Version)}`;
      const deviceName = String(
        Constants?.deviceName || Constants?.deviceModel || Constants?.expoConfig?.name || "NeoApp",
      );

      const res = await axios.post(
        `${API_URL}/auth/google-login`,
        { idToken },
        {
          headers: {
            "x-device-model": deviceModel,
            "x-device-name": deviceName,
          },
        },
      );
      
      const user = res.data.user;
      if (!user.mobile) {
        setGoogleToken(res.data.token);
        setGoogleUser(user);
        setCollectMobileValue("");
        setShowMobileCollectModal(true);
      } else {
        await login(res.data.token, user);
      }
    } catch (e) {
      showAlert(e.response?.data?.message || "Google authentication failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCollectedMobile = async () => {
    const val = collectMobileValue.trim();
    if (!val) {
      showAlert("Please enter your mobile number", "error");
      return;
    }
    if (val.length !== 10) {
      showAlert("Mobile number must be 10 digits", "error");
      return;
    }

    setSavingMobile(true);
    try {
      const res = await axios.put(
        `${API_URL}/users/profile`,
        { name: googleUser.name, mobile: val },
        {
          headers: {
            Authorization: `Bearer ${googleToken}`,
          },
        },
      );

      if (res.data.success) {
        setShowMobileCollectModal(false);
        await login(googleToken, res.data.user);
      } else {
        showAlert("Failed to save mobile number", "error");
      }
    } catch (err) {
      showAlert(err.response?.data?.message || "Failed to update mobile number", "error");
    } finally {
      setSavingMobile(false);
    }
  };

  const renderMobileCollectModal = () => (
    <Modal statusBarTranslucent visible={showMobileCollectModal} transparent animationType="fade">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: "rgba(15,23,42,0.55)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <MotiView
          from={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "timing", duration: 300 }}
          style={{
            backgroundColor: "#fff",
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 360,
            alignItems: "center",
            shadowColor: "#0f172a",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(79,70,229,0.08)",
              borderRadius: 30,
              width: 54,
              height: 54,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Ionicons name="phone-portrait-outline" size={28} color="#4F46E5" />
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: "#0F172A",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Enter Mobile Number
          </Text>
          
          <Text
            style={{
              fontSize: 13,
              color: "#475569",
              textAlign: "center",
              lineHeight: 18,
              marginBottom: 20,
              paddingHorizontal: 8,
            }}
          >
            Welcome to NeoApp! Please provide your 10-digit mobile number to complete your registration.
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#F8FAFC",
              borderWidth: 1.5,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              paddingHorizontal: 14,
              height: 52,
              width: "100%",
              marginBottom: 20,
            }}
          >
            <Ionicons name="call-outline" size={20} color="#94A3B8" style={{ marginRight: 10 }} />
            <TextInput
              style={{
                flex: 1,
                fontSize: 15,
                color: "#0F172A",
                fontWeight: "600",
                height: "100%",
              }}
              placeholder="Mobile Number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              maxLength={10}
              value={collectMobileValue}
              onChangeText={setCollectMobileValue}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            disabled={savingMobile}
            onPress={handleSaveCollectedMobile}
            style={{
              backgroundColor: "#4F46E5",
              borderRadius: 12,
              height: 50,
              width: "100%",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {savingMobile ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                Save & Continue
              </Text>
            )}
          </TouchableOpacity>
        </MotiView>
      </KeyboardAvoidingView>
    </Modal>
  );

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert("Please fill in all fields", "error");
      return;
    }
    if (email === "user" && password === "user@123") {
      setLoading(true);
      setTimeout(async () => {
        try {
          await login("demo-token-123", {
            id: "demo-user-123",
            email: "user",
            name: "Demo User",
            role: "demo",
          });
          showAlert("Demo login successful!", "info");
        } catch (_) { }
        setLoading(false);
      }, 1000);
      return;
    }
    setLoading(true);
    try {
      const deviceModel = `${Platform.OS} ${String(Platform.Version)}`;
      const deviceName = String(
        Constants?.deviceName ||
        Constants?.deviceModel ||
        Constants?.expoConfig?.name ||
        "NeoApp",
      );

      const res = await axios.post(
        `${API_URL}/auth/login`,
        {
          email: email.trim().toLowerCase(),
          password,
        },
        {
          headers: {
            "x-device-model": deviceModel,
            "x-device-name": deviceName,
          },
        },
      );
      await login(res.data.token, res.data.user);
    } catch (e) {
      const code = e?.response?.data?.code;
      showAlert(
        code === "AMBIGUOUS_COMPANY_LOGIN"
          ? "This email and password match multiple company accounts. Use a different password in each company."
          : e.response?.data?.message || "Invalid email or password",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={S.root}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#f0f4ff"
        translucent
      />

      {/* Background gradient */}
      <LinearGradient
        colors={["#f0f4ff", "#fafbff", "#eef2ff"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Orbs */}
      <Orb
        color="#a5b4fc"
        size={420}
        top={-160}
        left={-160}
        opacity={0.45}
        delay={0}
      />
      <Orb
        color="#c4b5fd"
        size={340}
        bottom={-130}
        right={-130}
        opacity={0.35}
        delay={700}
      />
      <Orb
        color="#93c5fd"
        size={200}
        top="40%"
        left={-70}
        opacity={0.28}
        delay={350}
      />

      {/* Subtle border rings */}
      <View
        style={[
          S.ring,
          { width: 560, height: 560, top: -230, left: -210, borderRadius: 280 },
        ]}
      />
      <View
        style={[
          S.ring,
          {
            width: 380,
            height: 380,
            bottom: -150,
            right: -150,
            borderRadius: 190,
          },
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
          {/* ── Header ── */}
          <Animated.View
            entering={FadeInDown.delay(80).duration(650).springify()}
            style={[S.header, { marginBottom: ui.isTablet ? 44 : ui.isVeryShort ? 22 : 34 }]}
          >
            {/* Logo */}
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
                <Image
                  source={require("../../assets/logo.png")}
                  style={{
                    width: ui.logoSize * 0.56,
                    height: ui.logoSize * 0.56,
                  }}
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text style={[S.title, { fontSize: ui.titleSize }]}>
              WELCOME BACK
            </Text>
            <View style={S.accentLine} />
            <Text style={[S.subtitle, { fontSize: ui.subtitleSize }]}>
              Sign in to access your dashboard
            </Text>
          </Animated.View>

          {/* ── Card ── */}
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
            {/* Top edge glow */}
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

              <View style={{ marginBottom: ui.fieldGap }}>
                <Field
                  label="Email Address"
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  ui={ui}
                />
              </View>

              <View style={{ marginBottom: 6 }}>
                <Field
                  label="Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  isPassword
                  showPwd={showPwd}
                  setShowPwd={setShowPwd}
                  placeholder="Enter your password"
                  ui={ui}
                />
              </View>

              <TouchableOpacity
                style={S.forgotRow}
                onPress={() => navigation.navigate("ForgotPassword")}
              >
                <Text style={S.forgotText}>Forgot Password?</Text>
                <Ionicons name="chevron-forward" size={13} color="#6366f1" />
              </TouchableOpacity>

              <SignInButton onPress={handleLogin} loading={loading} ui={ui} />
              
              <View style={S.dividerRow}>
                <View style={S.dividerLine} />
                <Text style={S.dividerText}>OR</Text>
                <View style={S.dividerLine} />
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!request || loading}
                onPress={() => promptAsync()}
                style={[S.googleButton, { height: ui.buttonHeight }]}
              >
                <Ionicons name="logo-google" size={20} color="#DB4437" />
                <Text style={S.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* ── Footer ── */}
          <Animated.View
            entering={FadeIn.delay(480).duration(550)}
            style={[S.footer, { marginTop: ui.isTablet ? 28 : ui.isVeryShort ? 14 : 20 }]}
          >
            <Text style={S.footerText}>New here? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
              <Text style={S.footerLink}>Create Account →</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      {renderMobileCollectModal()}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0f4ff" },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.12)",
  },
  // Header
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

  // Card
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

  // Forgot
  forgotRow: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 10,
    marginBottom: 2,
  },
  forgotText: {
    color: "#6366f1",
    fontWeight: "700",
    fontSize: 12.5,
    letterSpacing: 0.3,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },

  // Google Button
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.2)",
    borderRadius: 14,
    gap: 12,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  googleButtonText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Footer
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

export default LoginScreen;
