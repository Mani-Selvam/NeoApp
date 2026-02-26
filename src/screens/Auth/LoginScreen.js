import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeInUp,
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useAuth } from "../../contexts/AuthContext";
import { API_URL } from "../../services/apiConfig";

const { width, height } = Dimensions.get("window");

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
          placeholder={focused ? placeholder : ""}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isPassword && !showPassword}
          autoCapitalize="none"
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

const CustomButton = ({ onPress, loading, title }) => {
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
      <Animated.View style={[styles.loginButton, animatedStyle]}>
        <LinearGradient
          colors={["#6366f1", "#8b5cf6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientButton}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.loginButtonText}>{title}</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
};

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    // Demo Login Check
    if (email === "user" && password === "user@123") {
      setLoading(true);
      setTimeout(async () => {
        const demoUser = {
          id: "demo-user-123",
          email: "user",
          name: "Demo User",
          role: "demo",
        };
        try {
          await login("demo-token-123", demoUser);
          Alert.alert("Success", "Demo login successful!");
        } catch (e) {}
        setLoading(false);
      }, 1000);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });

      await login(response.data.token, response.data.user);
    } catch (error) {
      console.error("Login error:", error.response?.data || error.message);
      Alert.alert(
        "Login Failed",
        error.response?.data?.message || "Invalid email or password",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
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
              <Image
                source={require("../../assets/logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>
              Sign in to access your dashboard
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(200)}
            style={styles.formWrapper}
          >
            <BlurView intensity={20} tint="light" style={styles.blurContainer}>
              <View style={styles.formContent}>
                <CustomInput
                  label="Email Address"
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                />

                <CustomInput
                  label="Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  isPassword
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  placeholder="Enter your password"
                />

                <TouchableOpacity
                  style={styles.forgotPassword}
                  onPress={() => navigation.navigate("ForgotPassword")}
                >
                  <Text style={styles.forgotPasswordText}>
                    Forgot Password?
                  </Text>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={14}
                    color="#6366f1"
                  />
                </TouchableOpacity>

                <CustomButton
                  onPress={handleLogin}
                  loading={loading}
                  title="Sign In"
                />
              </View>
            </BlurView>
          </Animated.View>

          {/* Demo Info */}
          {/* <Animated.View entering={FadeInUp.delay(300)} style={styles.demoContainer}>
                        <View style={styles.demoBadge}>
                            <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
                            <Text style={styles.demoText}>Demo: user / user@123</Text>
                        </View>
                    </Animated.View> */}

          {/* Footer */}
          <Animated.View entering={FadeInUp.delay(400)} style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
              <Text style={styles.footerLink}>Sign Up</Text>
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
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoCircle: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 50,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  logo: {
    width: "80%",
    height: "80%",
  },
  title: {
    fontSize: 28,
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
    marginBottom: 20,
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
    color: "#0f172a", // Dark text
    fontSize: 16,
    fontWeight: "500",
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 30,
    marginTop: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  forgotPasswordText: {
    color: "#6366f1",
    fontWeight: "600",
    fontSize: 14,
  },
  loginButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginTop: 10,
  },
  gradientButton: {
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  demoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  demoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  demoText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
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

export default LoginScreen;
