import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useState } from "react";
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

// --- Responsive Scaling Utilities ---
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Base design width (standard iPhone width ~375)
const BASE_WIDTH = 375;

// Horizontal Scale (for widths, margins, paddings)
const hs = (size) => (SCREEN_WIDTH / BASE_WIDTH) * size;

// Vertical Scale (for heights, top/bottom margins)
const vs = (size) => (SCREEN_HEIGHT / 812) * size;

// Moderate Scale (for fonts - scales less aggressively)
const ms = (size, factor = 0.5) => size + (hs(size) - size) * factor;

// -------------------------------------

const getOtpError = (error) => {
    const code = String(error?.code || "").trim();
    const serverMessage = error?.response?.data?.message;

    if (serverMessage) return serverMessage;
    if (code === "ERR_NETWORK")
        return "Network error. Please check your internet connection.";

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

            <LinearGradient
                colors={["#eef4ff", "#f8fbff"]}
                style={StyleSheet.absoluteFill}
            />

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[
                        styles.content,
                        {
                            paddingTop: insets.top + vs(24),
                            paddingBottom: insets.bottom + vs(24),
                        },
                    ]}>
                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.backRow}
                            onPress={() => navigation.goBack()}>
                            <Ionicons
                                name="arrow-back"
                                size={hs(18)}
                                color="#2563eb"
                            />
                            <Text style={styles.backText}>Back</Text>
                        </TouchableOpacity>

                        <Text style={styles.title}>Verify OTP</Text>
                        <Text style={styles.subtitle}>
                            OTP sent to your whatsApp{" "}
                            {routePhoneNumber || "your phone number"}.
                        </Text>

                        <InlineAlert
                            message={alert.message}
                            type={alert.type}
                            onClose={() =>
                                setAlert({ message: "", type: "error" })
                            }
                        />

                        {/* <Text style={styles.label}>OTP code</Text> */}
                        <View style={styles.codeWrap}>
                            <Ionicons
                                name="keypad-outline"
                                size={hs(18)}
                                color="#64748b"
                                style={styles.codeIcon}
                            />
                            <TextInput
                                value={code}
                                onChangeText={(value) =>
                                    setCode(value.replace(/\D/g, ""))
                                }
                                placeholder="Enter 6-digit OTP"
                                placeholderTextColor="#94a3b8"
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.codeInput}
                            />
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.button,
                                loading && styles.buttonDisabled,
                            ]}
                            onPress={verifyOtp}
                            disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Text style={styles.buttonText}>
                                        Verify OTP
                                    </Text>
                                    <Ionicons
                                        name="checkmark-circle-outline"
                                        size={hs(18)}
                                        color="#fff"
                                    />
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={resendOtp}
                            disabled={resending}>
                            {resending ? (
                                <ActivityIndicator color="#2563eb" />
                            ) : (
                                <Text style={styles.secondaryText}>
                                    Resend OTP
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#eef4ff",
    },
    flex: {
        flex: 1,
    },
    content: {
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: hs(20),
    },
    card: {
        backgroundColor: "rgba(255,255,255,0.96)",
        borderRadius: hs(24),
        padding: hs(22),
        borderWidth: 1,
        borderColor: "#dbeafe",
        shadowColor: "#2563eb",
        shadowOffset: { width: 0, height: hs(12) },
        shadowOpacity: 0.1,
        shadowRadius: hs(24),
        elevation: 8,
        // Responsive width constraint for larger screens (tablets)
        maxWidth: 500,
        width: "100%",
        alignSelf: "center",
    },
    backRow: {
        marginBottom: vs(10),
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: hs(6),
    },
    backText: {
        color: "#2563eb",
        fontSize: ms(14),
        fontWeight: "700",
    },
    title: {
        fontSize: ms(28),
        fontWeight: "800",
        color: "#0f172a",
    },
    subtitle: {
        marginTop: vs(8),
        marginBottom: vs(18),
        color: "#475569",
        fontSize: ms(14),
        lineHeight: ms(20),
    },
    label: {
        marginBottom: vs(7),
        color: "#334155",
        fontSize: ms(13),
        fontWeight: "700",
    },
    codeWrap: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#cbd5e1",
        borderRadius: hs(14),
        backgroundColor: "#fff",
        minHeight: vs(56),
        paddingHorizontal: hs(14),
    },
    codeIcon: {
        marginRight: hs(10),
    },
    codeInput: {
        flex: 1,
        color: "#0f172a",
        fontSize: ms(18),
        paddingVertical: vs(14),
        letterSpacing: hs(1),
    },
    button: {
        marginTop: vs(18),
        minHeight: vs(52),
        borderRadius: hs(14),
        backgroundColor: "#256aeb",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: hs(8),
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: "#fff",
        fontSize: ms(15),
        fontWeight: "800",
    },
    secondaryButton: {
        marginTop: vs(14),
        minHeight: vs(48),
        borderRadius: hs(14),
        borderWidth: 1,
        borderColor: "#bfdbfe",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#eff6ff",
    },
    secondaryText: {
        color: "#2563eb",
        fontSize: ms(15),
        fontWeight: "700",
    },
});
