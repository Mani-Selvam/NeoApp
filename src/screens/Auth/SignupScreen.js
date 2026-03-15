import { Ionicons } from "@expo/vector-icons";
// import auth from '@react-native-firebase/auth'; // Removed for conditional require
import axios from "axios";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import Animated, {
    Easing,
    FadeInDown,
    FadeInUp,
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import InlineAlert from "../../components/InlineAlert";
import { useAuth } from "../../contexts/AuthContext";
import { API_URL } from "../../services/apiConfig";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebaseConfig";

const { width } = Dimensions.get("window");

const AnimatedBlob = ({ style }) => {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(-20, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    scale.value = withRepeat(
      withTiming(1.1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]} />;
};

const CustomInput = ({
  label,
  icon,
  value,
  onChangeText,
  isPassword,
  showPassword,
  setShowPassword,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}) => {
  const isFocused = useSharedValue(0);
  const [focused, setFocused] = useState(false);

  const handleFocus = () => {
    setFocused(true);
    isFocused.value = withTiming(1, { duration: 300 });
  };

  const handleBlur = () => {
    setFocused(false);
    isFocused.value = withTiming(0, { duration: 300 });
  };

  const labelStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: interpolate(isFocused.value, [0, 1], [0, -4]) },
        { translateX: interpolate(isFocused.value, [0, 1], [0, 0]) },
      ],
      fontSize: interpolate(isFocused.value, [0, 1], [14, 13]),
      color: interpolateColor(isFocused.value, [0, 1], ["#334155", "#6366f1"]),
    };
  });

  const borderStyle = useAnimatedStyle(() => {
    return {
      borderColor: interpolateColor(
        isFocused.value,
        [0, 1],
        ["#e2e8f0", "#6366f1"],
      ),
      borderWidth: interpolate(isFocused.value, [0, 1], [1, 2]),
      shadowOpacity: interpolate(isFocused.value, [0, 1], [0, 0.1]),
      shadowRadius: interpolate(isFocused.value, [0, 1], [0, 8]),
    };
  });

  return (
    <View style={styles.inputWrapper}>
      <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
      <Animated.View style={[styles.inputContainer, borderStyle]}>
        <Ionicons
          name={icon}
          size={20}
          color={focused ? "#6366f1" : "#64748b"}
          style={styles.inputIcon}
        />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isPassword && !showPassword}
          keyboardType={keyboardType || "default"}
          autoCapitalize={autoCapitalize || "none"}
          autoCorrect={false}
          maxLength={maxLength}
        />
        {isPassword && (
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons
              name={showPassword ? "eye-outline" : "eye-off-outline"}
              size={20}
              color="#64748b"
            />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
};

const CustomButton = ({ onPress, loading, title, icon }) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={loading}
    >
      <Animated.View style={[styles.signupButton, animatedStyle]}>
        <LinearGradient
          colors={
            icon === "checkmark-circle-outline"
              ? ["#10b981", "#34d399"]
              : ["#6366f1", "#8b5cf6"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientButton}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.signupButtonText}>{title}</Text>
              <Ionicons name={icon || "arrow-forward"} size={20} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
};

const SignupScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [step, setStep] = useState(1); // 1: Details, 2: OTP
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("error");

  const showInline = (m, type = "error") => {
    const msg = (m || "").toString().replace(/\s+/g, " ").trim();
    setAlertType(type);
    setAlertMsg(msg);
    if (msg) setTimeout(() => setAlertMsg(""), 4000);
  };

  // OTP State
  const [otp, setOtp] = useState("");
  const [confirm, setConfirm] = useState(null);
  // const recaptchaVerifier = useRef(null); // Removed recaptcha verifier

  // Enable Auto-Verification Listener
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!auth) {
      console.warn(
        "Firebase auth not initialized; skipping auto-verification listener.",
      );
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && step === 2) {
        console.log(
          "[Auto-Verify] User authenticated via Firebase:",
          user.phoneNumber,
        );
        try {
          const idToken = await user.getIdToken();
          await handleFirebaseLogin(idToken);
        } catch (e) {
          console.error("Auto-login error:", e);
        }
      }
    });
    return unsubscribe;
  }, [step]);

  const handleFirebaseLogin = async (idToken) => {
    setLoading(true);
    try {
      const loginResponse = await axios.post(`${API_URL}/auth/login-phone`, {
        idToken,
      });
      await login(loginResponse.data.token, loginResponse.data.user);
      showInline("Verified automatically & logged in!", "info");
    } catch (error) {
      console.error("Firebase Backend Login Error:", error);
      showInline("Failed to login with verified phone.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Password strength live checks
  const [pwChecks, setPwChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
  });

  const evaluatePassword = (pw) => {
    const length = pw.length >= 8;
    const upper = /[A-Z]/.test(pw);
    const lower = /[a-z]/.test(pw);
    const number = /[0-9]/.test(pw);
    const special = /[^A-Za-z0-9]/.test(pw);
    return { length, upper, lower, number, special };
  };

  // Update checks whenever password changes
  useEffect(() => {
    setPwChecks(evaluatePassword(password));
  }, [password]);

  // Step 1: Validate & Send OTP (Via Backend & Firebase)
  const handleSendOTP = async () => {
    if (!fullName || !email || !mobile || !password || !confirmPassword) {
      showInline("Please fill in all fields", "error");
      return;
    }

    if (password !== confirmPassword) {
      showInline("Passwords do not match", "error");
      return;
    }

    // Enforce stronger password rules
    const currentChecks = evaluatePassword(password);
    const allGood = Object.values(currentChecks).every(Boolean);
    if (!allGood) {
      const missing = [];
      if (!currentChecks.length) missing.push("8 characters");
      if (!currentChecks.upper) missing.push("an uppercase letter");
      if (!currentChecks.lower) missing.push("a lowercase letter");
      if (!currentChecks.number) missing.push("a number");
      if (!currentChecks.special) missing.push("a special character");
      showInline(`Password must contain ${missing.join(", ")}.`, "error");
      return;
    }

    // Basic Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showInline("Invalid email address", "error");
      return;
    }

    const formattedMobile = mobile.startsWith("+") ? mobile : `+91${mobile}`; // Default to India if no code

    setLoading(true);
    try {
      const preferredMethod = Platform.OS === "web" ? "email" : "sms";

      // 1. Send Email OTP (Both Web & Native)
      // User requested option: Auto-get Mobile OTP OR enter Email OTP manually.
      // So we send the Email OTP in parallel.
      const backendResponse = await axios.post(`${API_URL}/auth/send-otp`, {
        email,
        mobile: formattedMobile,
        type: "signup",
        method: preferredMethod,
      });

      if (!backendResponse.data.success) {
        setLoading(false);
        showInline(
          backendResponse.data.message || "User check failed.",
          "error",
        );
        return;
      }

      // 2. Call Firebase for Mobile OTP
      // 2. Call Firebase for Mobile OTP
      if (Platform.OS === "web") {
        // Web Logic (Email Only)
        setLoading(false);
        setStep(2);
        showInline("Sent email OTP. Mobile SMS skipped.", "info");
        setConfirm({
          verificationId: "web-mock-id",
          confirm: async () => true,
        });
      } else {
        // Native/Expo Logic: Use backend OTP (no recaptcha)
        // Backend already sent OTP above (email + optional SMS). We'll rely on
        // backend verification flow instead of Firebase Recaptcha for native.
        setConfirm({ type: "backend-verify" });
        showInline("We have sent a verification code via SMS.", "info");
        setLoading(false);
        setStep(2);
      }
    } catch (error) {
      setLoading(false);
      console.error("Setup Error:", error);
      showInline(
        error.response?.data?.message || "Failed to initialize signup.",
        "error",
      );
    }
  };

  // Step 2: Verify & Signup (Via Backend)
  const handleVerifyAndSignup = async () => {
    if (!otp) {
      showInline("Please enter the OTP", "error");
      return;
    }

    if (!confirm) {
      showInline("Session expired. Please resend OTP.", "error");
      return;
    }

    setLoading(true);
    try {
      // If we're using backend verification (default now)
      if (Platform.OS === "web" || confirm.type === "backend-verify") {
        const formattedMobile = mobile.startsWith("+") ? mobile : `+91${mobile}`;
        const verifyPayload =
          Platform.OS === "web"
            ? { email, otp }
            : { mobile: formattedMobile, otp };

        const verifyResponse = await axios.post(
          `${API_URL}/auth/verify-otp`,
          verifyPayload,
        );
        if (!verifyResponse.data.success) {
          throw new Error("Invalid OTP (Backend Verification)");
        }
        console.log("Backend OTP Verification Successful");
      } else {
        // If confirm is a Firebase confirmation (unlikely in current flow)
        await confirm.confirm(otp);
        console.log("Firebase Phone Auth Successful");
      }

      // Proceed to Signup on Backend
      const signupResponse = await axios.post(`${API_URL}/auth/signup`, {
        name: fullName,
        email,
        password,
        confirmPassword,
        mobile, // Passed for record
      });

      await login(signupResponse.data.token, signupResponse.data.user);
      showInline("Account verified and created successfully!", "info");
      // Auto navigation managed by AuthContext
    } catch (error) {
      console.error(error);
      const msg =
        error.response?.data?.message ||
        error.message ||
        "Signup failed or Invalid OTP";
      showInline(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    try {
      const formattedMobile = mobile.startsWith("+") ? mobile : `+91${mobile}`;

      if (Platform.OS === "web") {
        showInline("Resent email OTP.", "info");
        await axios.post(`${API_URL}/auth/send-otp`, {
          email,
          mobile: formattedMobile,
          method: "email",
        });
      } else {
        // Resend via backend (email + SMS if configured)
        const backendResponse = await axios.post(`${API_URL}/auth/send-otp`, {
          email,
          mobile: formattedMobile,
          method: "sms",
        });
        if (!backendResponse.data.success) {
          throw new Error(
            backendResponse.data.message || "Failed to resend OTP",
          );
        }
        setConfirm({ type: "backend-verify" });
        showInline("Verification code resent via SMS.", "info");
      }
    } catch (error) {
      console.error(error);
      showInline("Failed to resend OTP. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      {/* Recaptcha removed — using backend OTP instead */}
      {/* Abstract Background Elements - Enhanced */}
      <AnimatedBlob style={styles.blobTopLeft} />
      <AnimatedBlob style={styles.blobBottomRight} />
      <AnimatedBlob style={styles.blobCenter} />

      <LinearGradient
        colors={["rgba(255,255,255,0.4)", "rgba(255,255,255,0.7)"]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInUp.delay(100)} style={styles.header}>
            <View style={styles.logoCircle}>
              <Ionicons name="person-add" size={32} color="#6366f1" />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              {step === 1
                ? "Start your journey with us"
                : "Verify your contact details"}
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(200)}
            style={styles.formWrapper}
          >
            <BlurView intensity={20} tint="light" style={styles.blurContainer}>
              <View style={styles.formContent}>
                <InlineAlert
                  message={alertMsg}
                  type={alertType}
                  onClose={() => setAlertMsg("")}
                />
                {step === 1 && (
                  <Animated.View entering={FadeInDown}>
                    <CustomInput
                      label="Full Name"
                      icon="person-outline"
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Enter full name"
                      autoCapitalize="words"
                    />
                    <CustomInput
                      label="Email Address"
                      icon="mail-outline"
                      value={email}
                      onChangeText={setEmail}
                      placeholder="Enter your email"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <CustomInput
                      label="Mobile Number"
                      icon="call-outline"
                      value={mobile}
                      onChangeText={(text) =>
                        setMobile(text.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Enter 10-digit mobile number"
                      keyboardType="numeric"
                      maxLength={10}
                    />
                    <CustomInput
                      label="Password"
                      icon="lock-closed-outline"
                      value={password}
                      onChangeText={setPassword}
                      isPassword
                      showPassword={showPassword}
                      setShowPassword={setShowPassword}
                      placeholder="Create password"
                    />
                    {/* Password strength checklist */}
                    {password.length > 0 && (
                      <View style={styles.pwChecklist}>
                        <View style={styles.pwRow}>
                          <Ionicons
                            name={
                              pwChecks.length
                                ? "checkmark-circle"
                                : "close-circle"
                            }
                            size={16}
                            color={pwChecks.length ? "#10B981" : "#EF4444"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pwText}>
                            At least 8 characters
                          </Text>
                        </View>
                        <View style={styles.pwRow}>
                          <Ionicons
                            name={
                              pwChecks.upper
                                ? "checkmark-circle"
                                : "close-circle"
                            }
                            size={16}
                            color={pwChecks.upper ? "#10B981" : "#EF4444"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pwText}>1 uppercase letter</Text>
                        </View>
                        <View style={styles.pwRow}>
                          <Ionicons
                            name={
                              pwChecks.lower
                                ? "checkmark-circle"
                                : "close-circle"
                            }
                            size={16}
                            color={pwChecks.lower ? "#10B981" : "#EF4444"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pwText}>1 lowercase letter</Text>
                        </View>
                        <View style={styles.pwRow}>
                          <Ionicons
                            name={
                              pwChecks.number
                                ? "checkmark-circle"
                                : "close-circle"
                            }
                            size={16}
                            color={pwChecks.number ? "#10B981" : "#EF4444"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pwText}>1 number</Text>
                        </View>
                        <View style={styles.pwRow}>
                          <Ionicons
                            name={
                              pwChecks.special
                                ? "checkmark-circle"
                                : "close-circle"
                            }
                            size={16}
                            color={pwChecks.special ? "#10B981" : "#EF4444"}
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.pwText}>1 special character</Text>
                        </View>
                      </View>
                    )}
                    <CustomInput
                      label="Confirm Password"
                      icon="lock-closed-outline"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      isPassword
                      showPassword={showConfirmPassword}
                      setShowPassword={setShowConfirmPassword}
                      placeholder="Confirm password"
                    />

                    <CustomButton
                      onPress={handleSendOTP}
                      loading={loading}
                      title="Send OTP"
                    />
                  </Animated.View>
                )}

                {step === 2 && (
                  <Animated.View entering={FadeInUp}>
                    <View style={styles.otpInfoContainer}>
                      <Text style={styles.otpInfoText}>
                        We sent a code to{" "}
                        <Text style={styles.highlight}>{mobile}</Text> and{" "}
                        <Text style={styles.highlight}>{email}</Text>.{"\n"}If
                        SMS auto-verifies, you'll be logged in automatically.
                        {"\n"}Otherwise, enter the code from Email or SMS below.
                      </Text>
                    </View>

                    <View style={styles.inputWrapper}>
                      <View style={styles.inputContainer}>
                        <Ionicons
                          name="keypad-outline"
                          size={20}
                          color="#64748b"
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={[
                            styles.input,
                            {
                              letterSpacing: 8,
                              fontSize: 20,
                              textAlign: "center",
                            },
                          ]}
                          placeholder=" - - - - - - "
                          placeholderTextColor="#94a3b8"
                          value={otp}
                          onChangeText={setOtp}
                          keyboardType="number-pad"
                          maxLength={6}
                        />
                      </View>
                    </View>

                    <CustomButton
                      onPress={handleVerifyAndSignup}
                      loading={loading}
                      title="Verify & Sign Up"
                      icon="checkmark-circle-outline"
                    />

                    <TouchableOpacity
                      onPress={handleResendOTP}
                      style={styles.backLink}
                      disabled={loading}
                    >
                      <Text
                        style={[
                          styles.backLinkText,
                          { marginBottom: 15, color: "#6366f1" },
                        ]}
                      >
                        Resend OTP
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setStep(1)}
                      style={styles.backLink}
                    >
                      <Text style={styles.backLinkText}>Change Details</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>
            </BlurView>
          </Animated.View>

          {/* Footer */}
          <Animated.View entering={FadeInUp.delay(300)} style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  blobTopLeft: {
    position: "absolute",
    top: -150,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "#6366f1", // Indigo
    opacity: 0.25,
    transform: [{ scale: 1.2 }],
  },
  blobBottomRight: {
    position: "absolute",
    bottom: -150,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "#a855f7", // Purple
    opacity: 0.25,
    transform: [{ scale: 1.2 }],
  },
  blobCenter: {
    position: "absolute",
    top: "30%",
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#3b82f6", // Blue
    opacity: 0.2,
    transform: [{ scale: 1.5 }],
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingTop: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
  },
  formWrapper: {
    width: "100%",
    marginBottom: 24,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  blurContainer: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
  },
  formContent: {
    padding: 24,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
    color: "#64748b",
  },
  input: {
    flex: 1,
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "500",
  },
  eyeIcon: {
    padding: 4,
  },
  signupButton: {
    marginTop: 10,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  gradientButton: {
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signupButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  otpInfoContainer: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  otpInfoText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  highlight: {
    color: "#6366f1",
    fontWeight: "700",
  },
  backLink: {
    alignItems: "center",
    marginTop: 20,
  },
  backLinkText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  pwChecklist: {
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  pwRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  pwText: {
    color: "#334155",
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  footerText: {
    color: "#64748b",
    fontSize: 15,
  },
  footerLink: {
    color: "#6366f1",
    fontWeight: "700",
    fontSize: 15,
  },
});

export default SignupScreen;

