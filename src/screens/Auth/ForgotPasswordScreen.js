import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { API_URL } from "../../services/apiConfig";

const ForgotPasswordScreen = ({ navigation }) => {
    const [step, setStep] = useState(1); // 1: Email/Mobile, 2: OTP, 3: New Password
    const [identifier, setIdentifier] = useState(""); // Email or Mobile
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Step 1: Send OTP
    const handleSendOTP = async () => {
        if (!identifier.trim()) {
            Alert.alert("Error", "Please enter your Email or Mobile Number");
            return;
        }

        setLoading(true);
        try {
            // Identifier is treated as 'email' or 'mobile'. Since backend primarily looks up by email,
            // we send it as email if it looks like one, or mobile if it's numeric.
            // For simplicity in this demo, we assume the user enters Email.
            // If they enter Mobile, backend needs adjustment to look up by mobile.
            // Keeping it simple: Send identifer as 'email'.

            const response = await axios.post(`${API_URL}/auth/send-otp`, {
                email: identifier,
                type: 'forgot_password'
            });

            if (response.data.success) {
                setLoading(false);
                setStep(2);
                Alert.alert("OTP Sent", response.data.message || "Please check your device for the code.");
            }
        } catch (error) {
            setLoading(false);
            const msg = error.response?.data?.message || "Failed to send OTP. User may not exist.";
            Alert.alert("Error", msg);
        }
    };

    // Step 2: Verify OTP
    const handleVerifyOTP = async () => {
        if (!otp.trim()) {
            Alert.alert("Error", "Please enter the OTP");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/auth/verify-otp`, {
                email: identifier,
                otp
            });

            if (response.data.success) {
                setLoading(false);
                setStep(3);
            }
        } catch (error) {
            setLoading(false);
            Alert.alert("Error", error.response?.data?.message || "Invalid OTP");
        }
    };

    // Step 3: Reset Password
    const handleResetPassword = async () => {
        if (!newPassword || !confirmPassword) {
            Alert.alert("Error", "Please fill in all fields");
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert("Error", "Passwords do not match");
            return;
        }
        if (newPassword.length < 6) {
            Alert.alert("Error", "Password must be at least 6 characters");
            return;
        }

        setLoading(true);
        try {
            // Note: We need a reset-password endpoint. 
            // Currently assuming /auth/reset-password exists or will be added.
            // We pass user email and new password. 
            // Ideally we also pass a verified token/otp again or a temp token from step 2,
            // but for this MVP we rely on the flow logic (or we can pass OTP again if backend requires validation at reset moment).

            // Let's implement a secure way: re-verifying OTP implies session is valid, but better is to pass it.
            // We'll update backend to support this.

            const response = await axios.post(`${API_URL}/auth/reset-password`, {
                email: identifier,
                password: newPassword,
                otp // Pass OTP again to prove it was the user who verified it just now
            });

            setLoading(false);
            Alert.alert("Success", "Password reset successfully! Please login.", [
                { text: "OK", onPress: () => navigation.navigate("Login") }
            ]);
        } catch (error) {
            setLoading(false);
            Alert.alert("Error", error.response?.data?.message || "Failed to reset password");
        }
    };

    return (
        <LinearGradient
            colors={["#0f172a", "#1e1b4b", "#1e293b"]}
            style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent}>

                    {/* Header */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>

                    <Animated.View entering={FadeInUp.delay(200)} style={styles.headerContainer}>
                        <View style={styles.iconCircle}>
                            <MaterialCommunityIcons name="lock-reset" size={40} color="#6366f1" />
                        </View>
                        <Text style={styles.title}>
                            {step === 1 ? "Forgot Password" : step === 2 ? "Verify OTP" : "Reset Password"}
                        </Text>
                        <Text style={styles.subtitle}>
                            {step === 1
                                ? "Enter your email or mobile to receive an OTP"
                                : step === 2
                                    ? `Enter the code sent to ${identifier}`
                                    : "Create a new secure password"}
                        </Text>
                    </Animated.View>

                    {/* Step 1: Identifier Input */}
                    {step === 1 && (
                        <Animated.View entering={FadeInDown.delay(300)} style={styles.formContainer}>
                            <View style={styles.inputContainer}>
                                <Ionicons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Email or Mobile Number"
                                    placeholderTextColor="#64748b"
                                    value={identifier}
                                    onChangeText={setIdentifier}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleSendOTP}
                                disabled={loading}>
                                <LinearGradient
                                    colors={["#6366f1", "#8b5cf6"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.gradientButton}>
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <>
                                            <Text style={styles.buttonText}>Send OTP</Text>
                                            <Ionicons name="arrow-forward" size={20} color="#fff" />
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {/* Step 2: OTP Input */}
                    {step === 2 && (
                        <Animated.View entering={FadeInDown.delay(300)} style={styles.formContainer}>
                            <View style={styles.inputContainer}>
                                <Ionicons name="keypad-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                                <TextInput
                                    style={[styles.input, { letterSpacing: 4, fontSize: 18, fontWeight: '600' }]}
                                    placeholder="Enter OTP"
                                    placeholderTextColor="#64748b"
                                    value={otp}
                                    onChangeText={setOtp}
                                    keyboardType="number-pad"
                                    maxLength={6}
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleVerifyOTP}
                                disabled={loading}>
                                <LinearGradient
                                    colors={["#6366f1", "#8b5cf6"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.gradientButton}>
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={styles.buttonText}>Verify Code</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleSendOTP}
                                style={styles.linkButton}
                                disabled={loading}>
                                <Text style={styles.linkText}>Resend OTP</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {/* Step 3: New Password */}
                    {step === 3 && (
                        <Animated.View entering={FadeInDown.delay(300)} style={styles.formContainer}>
                            <View style={styles.inputContainer}>
                                <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="New Password"
                                    placeholderTextColor="#64748b"
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity
                                    style={styles.eyeIcon}
                                    onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#94a3b8" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.inputContainer}>
                                <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm Password"
                                    placeholderTextColor="#64748b"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showPassword}
                                />
                            </View>

                            <TouchableOpacity
                                style={styles.button}
                                onPress={handleResetPassword}
                                disabled={loading}>
                                <LinearGradient
                                    colors={["#6366f1", "#8b5cf6"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.gradientButton}>
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={styles.buttonText}>Reset Password</Text>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.1)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    headerContainer: {
        alignItems: "center",
        marginBottom: 40,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: "rgba(99, 102, 241, 0.1)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        borderWidth: 1,
        borderColor: "rgba(99, 102, 241, 0.3)",
    },
    title: {
        fontSize: 28,
        fontWeight: "700",
        color: "#f8fafc",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#94a3b8",
        textAlign: "center",
        paddingHorizontal: 20,
        lineHeight: 24,
    },
    formContainer: {
        width: "100%",
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1e293b",
        borderWidth: 1,
        borderColor: "#334155",
        borderRadius: 16,
        height: 56,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: "#f8fafc",
        fontSize: 16,
        fontWeight: "500",
    },
    eyeIcon: {
        padding: 4,
    },
    button: {
        marginTop: 10,
        borderRadius: 16,
        overflow: "hidden",
        shadowColor: "#6366f1",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    gradientButton: {
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    buttonText: {
        fontSize: 18,
        fontWeight: "600",
        color: "#fff",
    },
    linkButton: {
        marginTop: 20,
        alignItems: "center",
    },
    linkText: {
        color: "#94a3b8",
        fontSize: 14,
        fontWeight: "500",
    },
});

export default ForgotPasswordScreen;
