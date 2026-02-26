import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import getApiClient from "../services/apiClient";

const COLORS = {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    primary: "#4F46E5",
    secondary: "#10B981",
    text: "#0F172A",
    textDim: "#475569",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    gradients: {
        primary: ["#4F46E5", "#6366F1"],
        success: ["#059669", "#10B981"],
    }
};

export default function WhatsAppSettingsScreen({ navigation }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [waConfig, setWaConfig] = useState(null);
    const [editStep, setEditStep] = useState(1); // 1: Overview/Select Method, 2: OTP, 3: New Token
    const [otpMethod, setOtpMethod] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [newToken, setNewToken] = useState("");
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
            if (resp.data?.config) {
                setWaConfig(resp.data.config);
                setNewUrl(resp.data.config.apiUrl || "https://app-server.wati.io");
            }
        } catch (e) {
            console.warn("Load config error:", e);
        } finally {
            setLoading(false);
        }
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
                method: method.toLowerCase()
            });
            setEditStep(2);
        } catch (e) {
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
                otp: otpCode
            });
            if (resp.data.success) {
                setEditStep(3);
                setOtpCode("");
            } else {
                Alert.alert("Invalid", "Incorrect OTP code");
            }
        } catch (e) {
            Alert.alert("Error", "Verification failed");
        } finally {
            setVerifyingOtp(false);
        }
    };

    const handleSave = async () => {
        if (!newToken) return Alert.alert("Error", "Please enter new token");
        try {
            setSaving(true);
            const client = await getApiClient();
            const payload = {
                apiUrl: newUrl.trim(),
                apiToken: newToken.trim(),
                provider: "WATI",
            };
            const resp = await client.put("/whatsapp/config", payload);
            if (resp.data?.ok) {
                Alert.alert("Success", "WhatsApp Configuration Updated");
                navigation.goBack();
            } else {
                Alert.alert("Error", resp.data?.message || "Save failed");
            }
        } catch (e) {
            Alert.alert("Error", "An error occurred while saving");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>WhatsApp Settings</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                <MotiView
                    from={{ opacity: 0, translateY: 20 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    style={styles.card}
                >
                    <View style={styles.iconCircle}>
                        <Ionicons name="logo-whatsapp" size={40} color="#25D366" />
                    </View>

                    <Text style={styles.title}>
                        {editStep === 1 ? "Business API Status" : editStep === 2 ? "Verification" : "Update Configuration"}
                    </Text>
                    <Text style={styles.subtitle}>
                        {editStep === 1 ? "Manage your official WhatsApp Business API integration and token settings." :
                            editStep === 2 ? `Enter the 6-digit code sent to your registered ${otpMethod}.` :
                                "Enter the new API credentials for your WATI or WhatsApp provider."}
                    </Text>

                    {editStep === 1 && (
                        <View style={styles.overview}>
                            <View style={styles.statusRow}>
                                <Text style={styles.label}>Integration Status</Text>
                                <View style={[styles.badge, { backgroundColor: waConfig ? "#E8F5E9" : "#FFF8E1" }]}>
                                    <Text style={[styles.badgeText, { color: waConfig ? "#2E7D32" : "#F57F17" }]}>
                                        {waConfig ? "Active" : "Not Configured"}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.tokenBox}>
                                <Text style={styles.label}>API Token</Text>
                                <Text style={styles.maskedToken}>
                                    {waConfig?.apiToken ? "••••••••••••" + waConfig.apiToken.slice(-6) : "No token saved"}
                                </Text>
                            </View>

                            <Text style={styles.otpHeader}>Choose verification method to edit:</Text>
                            <View style={styles.methodGrid}>
                                <OtpMethod
                                    icon="mail"
                                    label="Email"
                                    color="#4F46E5"
                                    onPress={() => handleRequestOtp("Email")}
                                    loading={sendingOtp && otpMethod === "Email"}
                                />
                                <OtpMethod
                                    icon="chatbubble-ellipses"
                                    label="SMS"
                                    color="#00D9A3"
                                    onPress={() => handleRequestOtp("SMS")}
                                    loading={sendingOtp && otpMethod === "SMS"}
                                />
                                <OtpMethod
                                    icon="logo-whatsapp"
                                    label="WhatsApp"
                                    color="#25D366"
                                    onPress={() => handleRequestOtp("WhatsApp")}
                                    loading={sendingOtp && otpMethod === "WhatsApp"}
                                />
                            </View>
                        </View>
                    )}

                    {editStep === 2 && (
                        <View style={{ width: "100%", alignItems: "center" }}>
                            <TextInput
                                style={styles.otpInput}
                                placeholder="000000"
                                keyboardType="numeric"
                                maxLength={6}
                                value={otpCode}
                                onChangeText={setOtpCode}
                                autoFocus
                            />
                            <TouchableOpacity
                                onPress={handleVerifyOtp}
                                disabled={verifyingOtp || otpCode.length < 6}
                                style={[styles.primaryBtn, (verifyingOtp || otpCode.length < 6) && { opacity: 0.6 }]}
                            >
                                {verifyingOtp ? <ActivityIndicator color="#fff" /> :
                                    <Text style={styles.btnText}>Verify & Continue</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditStep(1)} style={{ marginTop: 20 }}>
                                <Text style={styles.retryText}>Try another method</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {editStep === 3 && (
                        <View style={{ width: "100%" }}>
                            <Text style={styles.inputLabel}>API URL</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="https://app-server.wati.io"
                                value={newUrl}
                                onChangeText={setNewUrl}
                                autoCapitalize="none"
                            />

                            <Text style={styles.inputLabel}>New API Token</Text>
                            <TextInput
                                style={[styles.input, { minHeight: 120, textAlignVertical: "top" }]}
                                placeholder="Bearer eyJhbGciOiJIUzI1Ni..."
                                multiline
                                value={newToken}
                                onChangeText={setNewToken}
                                autoCapitalize="none"
                            />

                            <TouchableOpacity
                                onPress={handleSave}
                                disabled={saving}
                                style={styles.saveBtn}
                            >
                                {saving ? <ActivityIndicator color="#fff" /> :
                                    <Text style={styles.btnText}>Save Configuration</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                </MotiView>

                <View style={styles.infoCard}>
                    <Ionicons name="information-circle" size={24} color={COLORS.primary} />
                    <Text style={styles.infoText}>
                        Tokens are encrypted and stored securely. Updating the token will immediately affect auto-replies and message campaigns.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const OtpMethod = ({ icon, label, color, onPress, loading }) => (
    <TouchableOpacity
        style={styles.methodBtn}
        onPress={onPress}
        disabled={loading}
    >
        <View style={[styles.methodIcon, { backgroundColor: color + "15" }]}>
            <Ionicons name={icon} size={24} color={color} />
        </View>
        <Text style={styles.methodLabel}>{label}</Text>
        {loading && <ActivityIndicator size="small" color={color} style={{ marginTop: 4 }} />}
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    centered: { justifyContent: "center", alignItems: "center" },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
    backBtn: { width: 40, height: 40, justifyContent: "center" },
    scroll: { padding: 20 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 28,
        padding: 24,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 5,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 30,
        backgroundColor: "#E8F5E9",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 20,
    },
    title: { fontSize: 24, fontWeight: "900", color: COLORS.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: COLORS.textDim, textAlign: "center", lineHeight: 22, marginBottom: 24 },
    overview: { width: "100%" },
    statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    label: { fontSize: 14, fontWeight: "700", color: COLORS.textDim },
    badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    badgeText: { fontSize: 12, fontWeight: "800" },
    tokenBox: { backgroundColor: COLORS.bg, padding: 16, borderRadius: 16, marginBottom: 24 },
    maskedToken: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginTop: 8, letterSpacing: 2 },
    otpHeader: { fontSize: 14, fontWeight: "800", color: COLORS.text, marginBottom: 16 },
    methodGrid: { flexDirection: "row", gap: 12 },
    methodBtn: { flex: 1, alignItems: "center", backgroundColor: COLORS.bg, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
    methodIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 8 },
    methodLabel: { fontSize: 12, fontWeight: "700", color: COLORS.text },
    otpInput: {
        backgroundColor: COLORS.bg,
        borderRadius: 20,
        padding: 20,
        fontSize: 32,
        fontWeight: "900",
        textAlign: "center",
        letterSpacing: 12,
        width: "100%",
        borderWidth: 2,
        borderColor: COLORS.primary + "30",
        marginBottom: 20
    },
    primaryBtn: { backgroundColor: COLORS.primary, width: "100%", padding: 18, borderRadius: 20, alignItems: "center" },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    retryText: { color: COLORS.primary, fontWeight: "700" },
    inputLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textDim, marginBottom: 8, marginLeft: 4 },
    input: { backgroundColor: COLORS.bg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
    saveBtn: { backgroundColor: COLORS.secondary, width: "100%", padding: 18, borderRadius: 20, alignItems: "center", marginTop: 10 },
    infoCard: { flexDirection: "row", backgroundColor: COLORS.primary + "10", padding: 16, borderRadius: 20, marginTop: 20, alignItems: "center", gap: 12 },
    infoText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: "600", lineHeight: 18 },
});
