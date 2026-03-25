import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import InlineAlert from "../../components/InlineAlert";
import { useAuth } from "../../contexts/AuthContext";
import { API_URL } from "../../services/apiConfig";
import {
  clearPhoneVerificationSession,
  getPhoneVerificationSession,
} from "../../services/phoneVerificationSession";

const getOtpError = (error) => {
  const code = String(error?.code || "").trim();
  const serverMessage = error?.response?.data?.message;

  if (serverMessage) return serverMessage;
  if (code === "ERR_NETWORK") return "Network error. Please check your internet connection.";

  return error?.message || "OTP verification failed.";
};

export default function OtpVerificationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [alert, setAlert] = useState({ message: "", type: "error" });
  const routePhoneNumber = route.params?.phoneNumber;

  const showAlert = (message, type = "error") => setAlert({ message, type });

  const verifyOtp = async () => {
    const session = getPhoneVerificationSession();
    const signupData = session?.signupData;

    if (!signupData) {
      showAlert("Signup session expired. Please start again.");
      return;
    }

    if (code.trim().length < 6) {
      showAlert("Enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    setAlert({ message: "", type: "error" });

    try {
      await axios.post(`${API_URL}/auth/verify-otp`, {
        email: signupData.email,
        mobile: signupData.mobile,
        otp: code.trim(),
      });

      const response = await axios.post(`${API_URL}/auth/signup`, {
        ...signupData,
        otp: code.trim(),
      });

      await login(response.data.token, response.data.user);
      clearPhoneVerificationSession();
    } catch (error) {
      showAlert(getOtpError(error));
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    const session = getPhoneVerificationSession();
    const signupData = session?.signupData;
    const targetPhone = signupData?.mobile || routePhoneNumber;

    if (!targetPhone) {
      showAlert("Phone number is missing. Please start signup again.");
      return;
    }

    setResending(true);
    setAlert({ message: "", type: "error" });

    try {
      await axios.post(`${API_URL}/auth/send-otp`, {
        email: signupData?.email,
        mobile: targetPhone,
        type: "signup",
        method: "whatsapp",
      });
      showAlert("A new OTP has been sent.", "info");
    } catch (error) {
      showAlert(getOtpError(error));
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#eef4ff" />

      <LinearGradient colors={["#eef4ff", "#f8fbff"]} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
          ]}
        >
          <View style={styles.card}>
            <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color="#2563eb" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Enter the code sent to {routePhoneNumber || "your phone number"}.
            </Text>

            <InlineAlert
              message={alert.message}
              type={alert.type}
              onClose={() => setAlert({ message: "", type: "error" })}
            />

            <Text style={styles.label}>OTP code</Text>
            <View style={styles.codeWrap}>
              <Ionicons name="keypad-outline" size={18} color="#64748b" style={styles.codeIcon} />
              <TextInput
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
                placeholder="Enter 6-digit OTP"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.codeInput}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={verifyOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Verify OTP</Text>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={resendOtp}
              disabled={resending}
            >
              {resending ? (
                <ActivityIndicator color="#2563eb" />
              ) : (
                <Text style={styles.secondaryText}>Resend OTP</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef4ff" },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#dbeafe",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  backRow: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
  },
  backText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    marginBottom: 7,
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  codeWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#fff",
    minHeight: 56,
    paddingHorizontal: 14,
  },
  codeIcon: {
    marginRight: 10,
  },
  codeInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 18,
    paddingVertical: 14,
    letterSpacing: 6,
  },
  button: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
  },
  secondaryText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "700",
  },
});
