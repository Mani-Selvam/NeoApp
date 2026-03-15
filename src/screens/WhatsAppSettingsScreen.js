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
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import getApiClient from "../services/apiClient";

const COLORS = {
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    primary: "#0F766E",
    secondary: "#059669",
    accent: "#2563EB",
    text: "#0F172A",
    textDim: "#475569",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    soft: "#ECFDF5",
    warning: "#F59E0B",
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
    const [editStep, setEditStep] = useState(1);
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
                (form.neoApiKey.trim() || form.neoBearerToken.trim())
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
            Alert.alert("Error", "Please fill all required fields for the selected provider");
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
                neoBearerToken: form.neoBearerToken.trim(),
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
        } catch (_e) {
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
        <SafeAreaView
            style={[styles.container, { paddingTop: insets.top + 10 }]}>
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
                        {editStep === 1 ? "Business API Status" : editStep === 2 ? "Verification" : "Provider Configuration"}
                    </Text>
                    <Text style={styles.subtitle}>
                        {editStep === 1
                            ? "Choose how this account should send WhatsApp messages."
                            : editStep === 2
                              ? `Enter the 6-digit code sent to your registered ${otpMethod}.`
                              : "Save provider credentials from the form. No account tokens are hardcoded on the server."}
                    </Text>

                    {editStep === 1 && (
                        <View style={styles.overview}>
                            <View style={styles.statusRow}>
                                <Text style={styles.label}>Integration Status</Text>
                                <View
                                    style={[
                                        styles.badge,
                                        { backgroundColor: waConfig?.provider ? "#E8F5E9" : "#FFF8E1" },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.badgeText,
                                            { color: waConfig?.provider ? "#2E7D32" : "#B45309" },
                                        ]}
                                    >
                                        {waConfig?.provider ? `${waConfig.provider} Active` : "Not Configured"}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.tokenBox}>
                                <Text style={styles.label}>Saved Provider</Text>
                                <Text style={styles.maskedToken}>
                                    {waConfig?.provider || "No provider saved"}
                                </Text>
                            </View>

                            <Text style={styles.otpHeader}>Choose verification method to edit:</Text>
                            <View style={styles.methodGrid}>
                                <OtpMethod
                                    icon="mail"
                                    label="Email"
                                    color={COLORS.accent}
                                    onPress={() => handleRequestOtp("Email")}
                                    loading={sendingOtp && otpMethod === "Email"}
                                />
                                <OtpMethod
                                    icon="chatbubble-ellipses"
                                    label="SMS"
                                    color={COLORS.secondary}
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
                                {verifyingOtp ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify & Continue</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditStep(1)} style={{ marginTop: 20 }}>
                                <Text style={styles.retryText}>Try another method</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {editStep === 3 && (
                        <View style={{ width: "100%" }}>
                            <Text style={styles.inputLabel}>Provider</Text>
                            <View style={styles.providerRow}>
                                {Object.values(PROVIDERS).map((provider) => (
                                    <TouchableOpacity
                                        key={provider}
                                        onPress={() => updateField("provider", provider)}
                                        style={[
                                            styles.providerChip,
                                            form.provider === provider && styles.providerChipActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.providerChipText,
                                                form.provider === provider && styles.providerChipTextActive,
                                            ]}
                                        >
                                            {provider}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Default Country Code</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="91"
                                value={form.defaultCountry}
                                onChangeText={(value) => updateField("defaultCountry", value)}
                                keyboardType="numeric"
                            />

                            {form.provider === PROVIDERS.WATI && (
                                <>
                                    <Text style={styles.inputLabel}>WATI Base URL</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="https://live-server.wati.io"
                                        value={form.watiBaseUrl}
                                        onChangeText={(value) => updateField("watiBaseUrl", value)}
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.inputLabel}>WATI API Token</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Enter WATI API token"
                                        multiline
                                        value={form.watiApiToken}
                                        onChangeText={(value) => updateField("watiApiToken", value)}
                                        autoCapitalize="none"
                                    />
                                </>
                            )}

                            {form.provider === PROVIDERS.META && (
                                <>
                                    <Text style={styles.inputLabel}>Meta WhatsApp Token</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Enter Meta permanent token"
                                        multiline
                                        value={form.metaWhatsappToken}
                                        onChangeText={(value) => updateField("metaWhatsappToken", value)}
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.inputLabel}>Phone Number ID</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter phone number ID"
                                        value={form.metaPhoneNumberId}
                                        onChangeText={(value) => updateField("metaPhoneNumberId", value)}
                                        autoCapitalize="none"
                                    />
                                </>
                            )}

                            {form.provider === PROVIDERS.TWILIO && (
                                <>
                                    <Text style={styles.inputLabel}>Twilio Account SID</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter Twilio Account SID"
                                        value={form.twilioAccountSid}
                                        onChangeText={(value) => updateField("twilioAccountSid", value)}
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.inputLabel}>Twilio Auth Token</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Enter Twilio Auth Token"
                                        multiline
                                        value={form.twilioAuthToken}
                                        onChangeText={(value) => updateField("twilioAuthToken", value)}
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.inputLabel}>Twilio WhatsApp Number</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="+14155238886"
                                        value={form.twilioWhatsappNumber}
                                        onChangeText={(value) => updateField("twilioWhatsappNumber", value)}
                                        autoCapitalize="none"
                                    />
                                </>
                            )}

                            {form.provider === PROVIDERS.NEO && (
                                <>
                                    <Text style={styles.inputLabel}>Neo Name</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter Neo account name"
                                        value={form.neoAccountName}
                                        onChangeText={(value) => updateField("neoAccountName", value)}
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.inputLabel}>Neo API Key</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Enter Neo API key"
                                        multiline
                                        value={form.neoApiKey}
                                        onChangeText={(value) => updateField("neoApiKey", value)}
                                        autoCapitalize="none"
                                    />

                                    <Text style={styles.inputLabel}>Neo Phone Number</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter Neo WhatsApp number"
                                        value={form.neoPhoneNumber}
                                        onChangeText={(value) => updateField("neoPhoneNumber", value)}
                                        autoCapitalize="none"
                                        keyboardType="phone-pad"
                                    />

                                    <Text style={styles.inputLabel}>Neo Bearer Token</Text>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        placeholder="Enter Neo bearer token"
                                        multiline
                                        value={form.neoBearerToken}
                                        onChangeText={(value) => updateField("neoBearerToken", value)}
                                        autoCapitalize="none"
                                    />
                                </>
                            )}

                            <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Configuration</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                </MotiView>

                <View style={styles.infoCard}>
                    <Ionicons name="information-circle" size={24} color={COLORS.primary} />
                    <Text style={styles.infoText}>
                        Credentials are stored in the database for the logged-in account and used at send time based on the selected provider.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const OtpMethod = ({ icon, label, color, onPress, loading }) => (
    <TouchableOpacity style={styles.methodBtn} onPress={onPress} disabled={loading}>
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
    maskedToken: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginTop: 8 },
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
        marginBottom: 20,
    },
    primaryBtn: { backgroundColor: COLORS.primary, width: "100%", padding: 18, borderRadius: 20, alignItems: "center" },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    retryText: { color: COLORS.primary, fontWeight: "700" },
    inputLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textDim, marginBottom: 8, marginLeft: 4, marginTop: 6 },
    input: { backgroundColor: COLORS.bg, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
    textArea: { minHeight: 110, textAlignVertical: "top" },
    providerRow: { flexDirection: "row", gap: 10, marginBottom: 16, flexWrap: "wrap" },
    providerChip: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg,
    },
    providerChipActive: {
        backgroundColor: COLORS.soft,
        borderColor: COLORS.secondary,
    },
    providerChipText: { color: COLORS.textDim, fontWeight: "700" },
    providerChipTextActive: { color: COLORS.secondary },
    saveBtn: { backgroundColor: COLORS.secondary, width: "100%", padding: 18, borderRadius: 20, alignItems: "center", marginTop: 10 },
    infoCard: { flexDirection: "row", backgroundColor: COLORS.primary + "10", padding: 16, borderRadius: 20, marginTop: 20, alignItems: "center", gap: 12 },
    infoText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: "600", lineHeight: 18 },
});
