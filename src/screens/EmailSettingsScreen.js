import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, useRef } from "react";
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
    TouchableOpacity,
    View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getEmailSettings, saveEmailSettings } from "../services/emailService";

// ─── DESIGN TOKENS (matches EmailScreen) ─────────────────────────────────────
const T = {
    bg: "#FAF8F5",
    surface: "#FFFFFF",
    surface2: "#F5F2EE",
    surface3: "#EDE9E3",
    ink: "#1A1208",
    inkMid: "#5C4F3A",
    inkSoft: "#9A8E7B",
    line: "#E8E2D9",
    lineWarm: "#D6CEBC",
    gold: "#C07B2D",
    goldMid: "#A0601A",
    goldSoft: "rgba(192,123,45,0.12)",
    goldBorder: "rgba(192,123,45,0.30)",
    ok: "#2D7A4F",
    okBg: "rgba(45,122,79,0.10)",
    bad: "#B52A2A",
    badBg: "rgba(181,42,42,0.10)",
};

// ─── ANIMATED SECTION CARD ───────────────────────────────────────────────────
const SectionCard = ({ children, delay = 0 }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(16)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 400,
                delay,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 0,
                duration: 400,
                delay,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <View style={S.card}>{children}</View>
        </Animated.View>
    );
};

// ─── SECTION LABEL ───────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, subtitle }) => (
    <View style={S.sectionHeader}>
        <View style={S.sectionIconWrap}>
            <Ionicons name={icon} size={16} color={T.gold} />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={S.sectionTitle}>{title}</Text>
            {subtitle ? <Text style={S.sectionSub}>{subtitle}</Text> : null}
        </View>
    </View>
);

// ─── FIELD COMPONENT ─────────────────────────────────────────────────────────
const Field = ({
    label,
    value,
    onChangeText,
    placeholder,
    secureTextEntry,
    keyboardType,
    icon,
    hint,
    last = false,
}) => {
    const [focused, setFocused] = useState(false);
    const borderAnim = useRef(new Animated.Value(0)).current;

    const onFocus = () => {
        setFocused(true);
        Animated.timing(borderAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: false,
        }).start();
    };
    const onBlur = () => {
        setFocused(false);
        Animated.timing(borderAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: false,
        }).start();
    };

    const borderColor = borderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [T.line, T.gold],
    });

    return (
        <View style={{ marginBottom: last ? 0 : 20 }}>
            <View style={S.fieldLabelRow}>
                {icon ? (
                    <Ionicons
                        name={icon}
                        size={12}
                        color={T.inkSoft}
                        style={{ marginRight: 5 }}
                    />
                ) : null}
                <Text style={S.fieldLabel}>{label}</Text>
            </View>
            <Animated.View style={[S.inputWrap, { borderColor }]}>
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={T.inkSoft}
                    secureTextEntry={secureTextEntry}
                    keyboardType={keyboardType}
                    autoCapitalize="none"
                    onFocus={onFocus}
                    onBlur={onBlur}
                    style={S.input}
                />
                {secureTextEntry && (
                    <View style={S.inputSuffix}>
                        <Ionicons
                            name="lock-closed-outline"
                            size={14}
                            color={T.inkSoft}
                        />
                    </View>
                )}
            </Animated.View>
            {hint ? <Text style={S.fieldHint}>{hint}</Text> : null}
        </View>
    );
};

// ─── CONNECTION TOGGLE ───────────────────────────────────────────────────────
const ConnectionToggle = ({ value, onChange }) => (
    <View style={{ marginBottom: 0 }}>
        <View style={S.fieldLabelRow}>
            <Ionicons
                name="shield-checkmark-outline"
                size={12}
                color={T.inkSoft}
                style={{ marginRight: 5 }}
            />
            <Text style={S.fieldLabel}>ENCRYPTION</Text>
        </View>
        <View style={S.toggleRow}>
            <TouchableOpacity
                onPress={() => onChange(false)}
                activeOpacity={0.8}
                style={[S.toggleBtn, !value && S.toggleBtnActive]}>
                {!value && (
                    <Ionicons
                        name="checkmark"
                        size={13}
                        color={T.gold}
                        style={{ marginRight: 2 }}
                    />
                )}
                <Text
                    style={[S.toggleBtnText, !value && S.toggleBtnTextActive]}>
                    STARTTLS
                </Text>
                <View
                    style={[
                        S.togglePortBadge,
                        !value && {
                            backgroundColor: T.goldSoft,
                            borderColor: T.goldBorder,
                        },
                    ]}>
                    <Text
                        style={[S.togglePortText, !value && { color: T.gold }]}>
                        587
                    </Text>
                </View>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => onChange(true)}
                activeOpacity={0.8}
                style={[S.toggleBtn, value && S.toggleBtnActive]}>
                {value && (
                    <Ionicons
                        name="checkmark"
                        size={13}
                        color={T.gold}
                        style={{ marginRight: 2 }}
                    />
                )}
                <Text style={[S.toggleBtnText, value && S.toggleBtnTextActive]}>
                    SSL
                </Text>
                <View
                    style={[
                        S.togglePortBadge,
                        value && {
                            backgroundColor: T.goldSoft,
                            borderColor: T.goldBorder,
                        },
                    ]}>
                    <Text
                        style={[S.togglePortText, value && { color: T.gold }]}>
                        465
                    </Text>
                </View>
            </TouchableOpacity>
        </View>
        <Text style={S.toggleHint}>
            {value
                ? "SSL wraps the entire connection. Use port 465."
                : "STARTTLS upgrades to encrypted. Use port 587."}
        </Text>
    </View>
);

// ─── INFO ROW ────────────────────────────────────────────────────────────────
const InfoRow = ({ icon, text, type = "info" }) => (
    <View
        style={[
            S.infoRow,
            type === "warn" && {
                backgroundColor: T.okBg,
                borderColor: T.ok + "44",
            },
        ]}>
        <Ionicons
            name={icon}
            size={14}
            color={type === "warn" ? T.ok : T.gold}
            style={{ marginTop: 1 }}
        />
        <Text style={[S.infoText, type === "warn" && { color: T.ok }]}>
            {text}
        </Text>
    </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function EmailSettingsScreen({ navigation }) {
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [smtpHost, setSmtpHost] = useState("");
    const [smtpPort, setSmtpPort] = useState("587");
    const [smtpUser, setSmtpUser] = useState("");
    const [smtpPass, setSmtpPass] = useState("");
    const [fromName, setFromName] = useState("");
    const [fromEmail, setFromEmail] = useState("");
    const [smtpSecure, setSmtpSecure] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                const res = await getEmailSettings();
                const s = res?.settings || null;
                if (!mounted) return;
                if (s) {
                    setSmtpHost(s.smtpHost || "");
                    setSmtpPort(String(s.smtpPort || 587));
                    setSmtpSecure(Boolean(s.smtpSecure));
                    setSmtpUser(s.smtpUser || "");
                    setSmtpPass(s.hasPassword ? "••••••••" : "");
                    setFromName(s.fromName || "");
                    setFromEmail(s.fromEmail || "");
                }
            } catch (e) {
                Alert.alert(
                    "Email Settings",
                    e?.response?.data?.message ||
                        e.message ||
                        "Failed to load settings",
                );
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const onEncryptionChange = (val) => {
        setSmtpSecure(val);
        setSmtpPort(val ? "465" : "587");
    };

    const onSave = async () => {
        try {
            if (!smtpHost.trim() || !smtpPort.trim() || !smtpUser.trim())
                return Alert.alert(
                    "Missing",
                    "SMTP Host, Port and Username are required.",
                );
            if (!smtpPass.trim())
                return Alert.alert("Missing", "SMTP Password is required.");
            setSaving(true);
            await saveEmailSettings({
                smtpHost: smtpHost.trim(),
                smtpPort: Number(smtpPort || 587),
                smtpSecure: Boolean(smtpSecure),
                smtpUser: smtpUser.trim(),
                smtpPass: smtpPass.trim(),
                fromName: fromName.trim(),
                fromEmail: fromEmail.trim(),
            });
            Alert.alert("✓ Saved", "Email settings saved successfully.");
        } catch (e) {
            Alert.alert(
                "Save Failed",
                e?.response?.data?.message || e.message || "Failed to save",
            );
        } finally {
            setSaving(false);
        }
    };

    // ── RENDER ──────────────────────────────────────────────────────────────
    return (
        <View style={S.root}>
            {/* Background */}
            <LinearGradient
                colors={["#FAF8F5", "#F5F0E8", "#FAF8F5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* ── HEADER ────────────────────────────────────────────── */}
            <View style={[S.header, { paddingTop: (insets.top || 0) + 12 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={S.headerBtn}
                    activeOpacity={0.75}>
                    <Ionicons
                        name="arrow-back-outline"
                        size={20}
                        color={T.ink}
                    />
                </TouchableOpacity>
                <View style={{ alignItems: "center" }}>
                    <Text style={S.headerTitle}>Email Settings</Text>
                    <Text style={S.headerSub}>SMTP Configuration</Text>
                </View>
                {/* Save shortcut */}
                <TouchableOpacity
                    onPress={onSave}
                    disabled={saving}
                    style={S.headerSaveBtn}
                    activeOpacity={0.75}>
                    {saving ? (
                        <ActivityIndicator size="small" color={T.gold} />
                    ) : (
                        <Ionicons
                            name="checkmark-outline"
                            size={20}
                            color={T.gold}
                        />
                    )}
                </TouchableOpacity>
            </View>

            {/* ── LOADING ───────────────────────────────────────────── */}
            {loading ? (
                <View style={S.loadingWrap}>
                    <View style={S.loadingBox}>
                        <ActivityIndicator color={T.gold} size="large" />
                        <Text style={S.loadingText}>Loading settings…</Text>
                    </View>
                </View>
            ) : (
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}>
                    <ScrollView
                        contentContainerStyle={[
                            S.scroll,
                            { paddingBottom: 48 + (insets.bottom || 0) },
                        ]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled">
                        {/* ── SMTP SERVER ─────────────────────────── */}
                        <SectionCard delay={60}>
                            <SectionHeader
                                icon="server-outline"
                                title="SMTP Server"
                                subtitle="Outgoing mail server details"
                            />
                            <View style={S.cardDivider} />

                            <Field
                                label="SMTP HOST"
                                icon="globe-outline"
                                value={smtpHost}
                                onChangeText={setSmtpHost}
                                placeholder="smtp.gmail.com"
                                hint="Your mail provider's outgoing server address"
                            />
                            <Field
                                label="SMTP PORT"
                                icon="hardware-chip-outline"
                                value={smtpPort}
                                onChangeText={setSmtpPort}
                                placeholder="587"
                                keyboardType="number-pad"
                            />
                            <View style={{ marginTop: 4 }}>
                                <ConnectionToggle
                                    value={smtpSecure}
                                    onChange={onEncryptionChange}
                                />
                            </View>
                        </SectionCard>

                        {/* ── AUTHENTICATION ──────────────────────── */}
                        <SectionCard delay={140}>
                            <SectionHeader
                                icon="key-outline"
                                title="Authentication"
                                subtitle="Login credentials for your mail server"
                            />
                            <View style={S.cardDivider} />

                            <Field
                                label="USERNAME / EMAIL"
                                icon="person-outline"
                                value={smtpUser}
                                onChangeText={setSmtpUser}
                                placeholder="sales@company.com"
                            />
                            <Field
                                label="PASSWORD"
                                icon="lock-closed-outline"
                                value={smtpPass}
                                onChangeText={setSmtpPass}
                                placeholder="App password or SMTP password"
                                secureTextEntry
                                last
                            />
                            <View style={{ marginTop: 16 }}>
                                <InfoRow
                                    icon="shield-outline"
                                    text="Password is stored encrypted on the server — never in the app."
                                    type="warn"
                                />
                            </View>
                        </SectionCard>

                        {/* ── SENDER IDENTITY ─────────────────────── */}
                        <SectionCard delay={220}>
                            <SectionHeader
                                icon="mail-outline"
                                title="Sender Identity"
                                subtitle="How recipients see your emails"
                            />
                            <View style={S.cardDivider} />

                            <Field
                                label="FROM NAME"
                                icon="text-outline"
                                value={fromName}
                                onChangeText={setFromName}
                                placeholder="Sales Team"
                                hint="Displayed as the sender name"
                            />
                            <Field
                                label="FROM EMAIL"
                                icon="at-outline"
                                value={fromEmail}
                                onChangeText={setFromEmail}
                                placeholder="sales@company.com"
                                hint="Reply-to address for outgoing emails"
                                last
                            />
                        </SectionCard>

                        {/* ── PROVIDER HINTS ──────────────────────── */}
                        <SectionCard delay={300}>
                            <SectionHeader
                                icon="information-circle-outline"
                                title="Common Providers"
                                subtitle="Quick reference settings"
                            />
                            <View style={S.cardDivider} />
                            {[
                                {
                                    name: "Gmail",
                                    host: "smtp.gmail.com",
                                    port: "587 / 465",
                                    note: "Use App Password",
                                },
                                {
                                    name: "Outlook",
                                    host: "smtp.office365.com",
                                    port: "587",
                                    note: "Use account password",
                                },
                                {
                                    name: "Yahoo",
                                    host: "smtp.mail.yahoo.com",
                                    port: "587 / 465",
                                    note: "Use App Password",
                                },
                                {
                                    name: "Zoho",
                                    host: "smtp.zoho.com",
                                    port: "587 / 465",
                                    note: "Use account password",
                                },
                            ].map((p, i) => (
                                <View
                                    key={p.name}
                                    style={[
                                        S.providerRow,
                                        i > 0 && {
                                            borderTopWidth: 1,
                                            borderTopColor: T.line,
                                        },
                                    ]}>
                                    <View style={S.providerDot} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={S.providerName}>
                                            {p.name}
                                        </Text>
                                        <Text style={S.providerHost}>
                                            {p.host}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: "flex-end" }}>
                                        <View style={S.portChip}>
                                            <Text style={S.portChipText}>
                                                {p.port}
                                            </Text>
                                        </View>
                                        <Text style={S.providerNote}>
                                            {p.note}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </SectionCard>

                        {/* ── SAVE BUTTON ─────────────────────────── */}
                        <TouchableOpacity
                            disabled={saving}
                            onPress={onSave}
                            activeOpacity={0.85}
                            style={{ marginTop: 8 }}>
                            <LinearGradient
                                colors={[T.gold, T.goldMid]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={S.saveBtn}>
                                {saving ? (
                                    <ActivityIndicator color="#FFF9F0" />
                                ) : (
                                    <>
                                        <Ionicons
                                            name="save-outline"
                                            size={18}
                                            color="#FFF9F0"
                                        />
                                        <Text style={S.saveBtnText}>
                                            Save Settings
                                        </Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </View>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },

    // ── Header ──
    header: {
        paddingHorizontal: 18,
        paddingBottom: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: T.line,
        backgroundColor: T.bg,
        zIndex: 10,
    },
    headerBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.line,
        shadowColor: T.ink,
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    headerSaveBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    headerTitle: {
        color: T.ink,
        fontSize: 17,
        fontWeight: "800",
        letterSpacing: -0.4,
    },
    headerSub: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "700",
        marginTop: 2,
    },

    // ── Loading ──
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    loadingBox: {
        width: 140,
        padding: 28,
        borderRadius: 22,
        backgroundColor: T.surface,
        alignItems: "center",
        borderWidth: 1,
        borderColor: T.line,
        shadowColor: T.ink,
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
    },
    loadingText: {
        color: T.inkSoft,
        fontWeight: "700",
        marginTop: 12,
        fontSize: 13,
    },

    // ── Scroll ──
    scroll: {
        paddingHorizontal: 18,
        paddingTop: 24,
        paddingBottom: 48,
    },

    // ── Cards ──
    card: {
        backgroundColor: T.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 16,
        shadowColor: T.ink,
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
    },
    cardDivider: {
        height: 1,
        backgroundColor: T.line,
        marginTop: 16,
        marginBottom: 20,
    },

    // ── Section Header ──
    sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    sectionIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
        alignItems: "center",
        justifyContent: "center",
    },
    sectionTitle: {
        color: T.ink,
        fontSize: 15,
        fontWeight: "900",
        letterSpacing: -0.2,
        marginTop: 2,
    },
    sectionSub: {
        color: T.inkSoft,
        fontSize: 12,
        fontWeight: "600",
        marginTop: 3,
    },

    // ── Field ──
    fieldLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    fieldLabel: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 0.8,
    },
    inputWrap: {
        borderWidth: 1.5,
        borderRadius: 14,
        backgroundColor: T.surface2,
        flexDirection: "row",
        alignItems: "stretch",
        overflow: "hidden",
        minHeight: Platform.OS === "ios" ? 50 : 48,
    },
    input: {
        flex: 1,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === "ios" ? 14 : 12,
        color: T.ink,
        fontWeight: "700",
        fontSize: 15,
    },
    inputSuffix: {
        width: 44,
        alignItems: "center",
        justifyContent: "center",
        borderLeftWidth: 1,
        borderLeftColor: T.line,
        backgroundColor: T.surface3,
    },
    fieldHint: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "600",
        marginTop: 7,
        marginLeft: 2,
        lineHeight: 16,
    },

    // ── Connection Toggle ──
    toggleRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 10,
    },
    toggleBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 13,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: T.line,
        backgroundColor: T.surface2,
        gap: 6,
    },
    toggleBtnActive: { backgroundColor: T.goldSoft, borderColor: T.goldBorder },
    toggleBtnText: { color: T.inkSoft, fontWeight: "900", fontSize: 13 },
    toggleBtnTextActive: { color: T.gold },
    togglePortBadge: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: T.surface3,
        borderWidth: 1,
        borderColor: T.line,
    },
    togglePortText: { fontSize: 11, color: T.inkSoft, fontWeight: "800" },
    toggleHint: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "600",
        lineHeight: 16,
        marginTop: 4,
    },

    // ── Info Row ──
    infoRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        padding: 13,
        borderRadius: 12,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    infoText: {
        flex: 1,
        color: T.inkMid,
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 18,
    },

    // ── Provider hints ──
    providerRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 13,
        gap: 12,
    },
    providerDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: T.gold,
        marginTop: 2,
    },
    providerName: { color: T.ink, fontSize: 13, fontWeight: "800" },
    providerHost: {
        color: T.inkSoft,
        fontSize: 12,
        fontWeight: "600",
        marginTop: 2,
    },
    portChip: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
        marginBottom: 4,
    },
    portChipText: { color: T.gold, fontSize: 11, fontWeight: "900" },
    providerNote: { color: T.inkSoft, fontSize: 10, fontWeight: "600" },

    // ── Save Button ──
    saveBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 10,
        shadowColor: T.goldMid,
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
    },
    saveBtnText: {
        color: "#FFF9F0",
        fontWeight: "900",
        fontSize: 16,
        letterSpacing: 0.2,
    },
});
