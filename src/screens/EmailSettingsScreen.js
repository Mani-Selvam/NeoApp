import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { FormSkeleton } from "../components/skeleton/screens";
import { SkeletonCard, SkeletonLine, SkeletonPulse, SkeletonSpacer } from "../components/skeleton/Skeleton";
import { getEmailSettings, saveEmailSettings } from "../services/emailService";

// ─── DESIGN TOKENS (matches EmailScreen) ─────────────────────────────────────
const T = {
    bg: "#F2F4F8",
    surface: "#FFFFFF",
    surface2: "#FAFBFF",
    surface3: "#EEF2FF",
    ink: "#0A0F1E",
    inkMid: "#3A4060",
    inkSoft: "#7C85A3",
    line: "#E8ECF4",
    lineWarm: "#F0F2F8",
    gold: "#1A6BFF",
    goldMid: "#0055E5",
    goldSoft: "rgba(26,107,255,0.12)",
    goldBorder: "rgba(26,107,255,0.28)",
    ok: "#00C48C",
    okBg: "rgba(0,196,140,0.12)",
    bad: "#FF3B5C",
    badBg: "rgba(255,59,92,0.12)",
};

const PASSWORD_MASK = "********";

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
    }, [delay, opacity, translateY]);

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            <View style={S.card}>{children}</View>
        </Animated.View>
    );
};

// ─── SECTION LABEL ───────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title }) => (
    <View style={S.sectionHeader}>
        <View style={S.sectionIconWrap}>
            <Ionicons name={icon} size={16} color={T.gold} />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={S.sectionTitle}>{title}</Text>
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
    onToggleSecureEntry,
    last = false,
}) => {
    const borderAnim = useRef(new Animated.Value(0)).current;

    const onFocus = () => {
        Animated.timing(borderAnim, {
            toValue: 1,
            duration: 180,
            useNativeDriver: false,
        }).start();
    };
    const onBlur = () => {
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
                    key={secureTextEntry ? "secure-on" : "secure-off"}
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={T.inkSoft}
                    secureTextEntry={secureTextEntry}
                    keyboardType={keyboardType}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType={secureTextEntry ? "password" : "none"}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    style={S.input}
                />
                {(typeof onToggleSecureEntry === "function" || secureTextEntry) && (
                    <TouchableOpacity
                        onPress={onToggleSecureEntry}
                        style={S.inputSuffix}
                        activeOpacity={0.7}
                        disabled={!onToggleSecureEntry}>
                        <Ionicons
                            name={
                                onToggleSecureEntry
                                    ? secureTextEntry
                                        ? "eye-outline"
                                        : "eye-off-outline"
                                    : "lock-closed-outline"
                            }
                            size={16}
                            color={T.inkSoft}
                        />
                    </TouchableOpacity>
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
    const [showSmtpPass, setShowSmtpPass] = useState(false);
    const [saveSentCopy, setSaveSentCopy] = useState(false);
    const [imapHost, setImapHost] = useState("");
    const [imapPort, setImapPort] = useState("993");
    const [imapUser, setImapUser] = useState("");
    const [imapPass, setImapPass] = useState("");
    const [showImapPass, setShowImapPass] = useState(false);
    const [imapSecure, setImapSecure] = useState(true);
    const [sentFolder, setSentFolder] = useState("Sent");
    const [fromName, setFromName] = useState("");
    const [fromEmail, setFromEmail] = useState("");
    const [smtpSecure, setSmtpSecure] = useState(false);

    const applyEmailSettings = (s = null) => {
        if (!s) return;
        setSmtpHost(s.smtpHost || "");
        setSmtpPort(String(s.smtpPort || 587));
        setSmtpSecure(Boolean(s.smtpSecure));
        setSmtpUser(s.smtpUser || "");
        setSmtpPass(s.hasPassword ? PASSWORD_MASK : "");
        setSaveSentCopy(Boolean(s.saveSentCopy));
        setImapHost(s.imapHost || "");
        setImapPort(String(s.imapPort || 993));
        setImapSecure(s.imapSecure !== false);
        setImapUser(s.imapUser || "");
        setImapPass(s.hasImapPassword ? PASSWORD_MASK : "");
        setSentFolder(s.sentFolder || "Sent");
        setFromName(s.fromName || "");
        setFromEmail(s.fromEmail || "");
    };

    const loadEmailSettings = async ({ showError = true } = {}) => {
        try {
            setLoading(true);
            const res = await getEmailSettings();
            applyEmailSettings(res?.settings || null);
        } catch (e) {
            if (showError) {
                Alert.alert(
                    "Email Settings",
                    e?.response?.data?.message ||
                        e.message ||
                        "Failed to load settings",
                );
            }
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadEmailSettings({ showError: true });
            return () => {};
        }, [])
    );

    const onEncryptionChange = (val) => {
        setSmtpSecure(val);
        setSmtpPort(val ? "465" : "587");
    };

    const onImapEncryptionChange = (val) => {
        setImapSecure(val);
        setImapPort(val ? "993" : "143");
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
            const normalizedPassword = smtpPass.trim();
            const isMaskedPassword =
                normalizedPassword === PASSWORD_MASK ||
                /^[*•]+$/.test(normalizedPassword);
            const normalizedImapPassword = imapPass.trim();
            const isMaskedImapPassword =
                normalizedImapPassword === PASSWORD_MASK ||
                /^[*â€¢]+$/.test(normalizedImapPassword);
            setSaving(true);
            await saveEmailSettings({
                smtpHost: smtpHost.trim(),
                smtpPort: Number(smtpPort || 587),
                smtpSecure: Boolean(smtpSecure),
                smtpUser: smtpUser.trim(),
                smtpPass: isMaskedPassword ? PASSWORD_MASK : normalizedPassword,
                saveSentCopy: Boolean(saveSentCopy),
                imapHost: imapHost.trim(),
                imapPort: Number(imapPort || 993),
                imapSecure: Boolean(imapSecure),
                imapUser: imapUser.trim(),
                imapPass: isMaskedImapPassword ? PASSWORD_MASK : normalizedImapPassword,
                sentFolder: sentFolder.trim() || "Sent",
                fromName: fromName.trim(),
                fromEmail: fromEmail.trim(),
            });
            await loadEmailSettings({ showError: false });
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
                colors={[T.bg, T.bg, T.bg]}
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
                <SkeletonPulse>
                    <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                        <SkeletonCard style={{ borderRadius: 20 }}>
                            <SkeletonLine width="52%" height={14} />
                            <SkeletonSpacer h={14} />
                            <FormSkeleton fields={7} />
                        </SkeletonCard>
                    </View>
                </SkeletonPulse>
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
                            />
                            <View style={S.cardDivider} />

                            <Field
                                label="SMTP HOST"
                                icon="globe-outline"
                                value={smtpHost}
                                onChangeText={setSmtpHost}
                                placeholder="smtp.gmail.com"
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
                                secureTextEntry={!showSmtpPass}
                                onToggleSecureEntry={() =>
                                    setShowSmtpPass((prev) => !prev)
                                }
                                last
                            />
                        </SectionCard>

                        {/* ── SENDER IDENTITY ─────────────────────── */}
                        <SectionCard delay={220}>
                            <SectionHeader
                                icon="mail-outline"
                                title="Sender Identity"
                            />
                            <View style={S.cardDivider} />

                            <Field
                                label="FROM NAME"
                                icon="text-outline"
                                value={fromName}
                                onChangeText={setFromName}
                                placeholder="Sales Team"
                            />
                            <Field
                                label="FROM EMAIL"
                                icon="at-outline"
                                value={fromEmail}
                                onChangeText={setFromEmail}
                                placeholder="sales@company.com"
                                hint="Best delivery: use the same email or same domain as the SMTP username. Leave this blank to use the SMTP email automatically."
                                last
                            />
                        </SectionCard>

                        {/* ── PROVIDER HINTS ──────────────────────── */}
                        {/* ── SAVE BUTTON ─────────────────────────── */}
                        <SectionCard delay={300}>
                            <SectionHeader
                                icon="folder-open-outline"
                                title="Mailbox Sent Sync"
                            />
                            <View style={S.cardDivider} />

                            <View style={S.fieldLabelRow}>
                                <Ionicons
                                    name="archive-outline"
                                    size={12}
                                    color={T.inkSoft}
                                    style={{ marginRight: 5 }}
                                />
                                <Text style={S.fieldLabel}>SAVE TO WEBMAIL SENT</Text>
                            </View>
                            <View style={S.toggleRow}>
                                <TouchableOpacity
                                    onPress={() => setSaveSentCopy(false)}
                                    activeOpacity={0.8}
                                    style={[S.toggleBtn, !saveSentCopy && S.toggleBtnActive]}>
                                    {!saveSentCopy ? (
                                        <Ionicons name="checkmark" size={13} color={T.gold} />
                                    ) : null}
                                    <Text style={[S.toggleBtnText, !saveSentCopy && S.toggleBtnTextActive]}>
                                        Off
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setSaveSentCopy(true)}
                                    activeOpacity={0.8}
                                    style={[S.toggleBtn, saveSentCopy && S.toggleBtnActive]}>
                                    {saveSentCopy ? (
                                        <Ionicons name="checkmark" size={13} color={T.gold} />
                                    ) : null}
                                    <Text style={[S.toggleBtnText, saveSentCopy && S.toggleBtnTextActive]}>
                                        On
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={S.toggleHint}>
                                Turn this on to save every app-sent email into your domain mailbox Sent folder using IMAP.
                            </Text>

                            {saveSentCopy ? (
                                <View style={{ marginTop: 18 }}>
                                    <Field
                                        label="IMAP HOST"
                                        icon="cloud-outline"
                                        value={imapHost}
                                        onChangeText={setImapHost}
                                        placeholder="imap.yourdomain.com"
                                        hint="Leave blank to auto-guess from SMTP host if your provider supports it."
                                    />
                                    <Field
                                        label="IMAP PORT"
                                        icon="hardware-chip-outline"
                                        value={imapPort}
                                        onChangeText={setImapPort}
                                        placeholder="993"
                                        keyboardType="number-pad"
                                    />
                                    <View style={{ marginTop: 4, marginBottom: 20 }}>
                                        <ConnectionToggle
                                            value={imapSecure}
                                            onChange={onImapEncryptionChange}
                                        />
                                    </View>
                                    <Field
                                        label="IMAP USERNAME / EMAIL"
                                        icon="person-circle-outline"
                                        value={imapUser}
                                        onChangeText={setImapUser}
                                        placeholder="Leave blank to use SMTP username"
                                    />
                                    <Field
                                        label="IMAP PASSWORD"
                                        icon="lock-closed-outline"
                                        value={imapPass}
                                        onChangeText={setImapPass}
                                        placeholder="Leave blank to use SMTP password"
                                        secureTextEntry={!showImapPass}
                                        onToggleSecureEntry={() =>
                                            setShowImapPass((prev) => !prev)
                                        }
                                    />
                                    <Field
                                        label="SENT FOLDER NAME"
                                        icon="file-tray-full-outline"
                                        value={sentFolder}
                                        onChangeText={setSentFolder}
                                        placeholder="Sent"
                                        hint="Common values: Sent, Sent Items, INBOX.Sent"
                                        last
                                    />
                                </View>
                            ) : null}
                        </SectionCard>

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
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Ionicons
                                            name="save-outline"
                                            size={18}
                                            color="#FFFFFF"
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
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 16,
        letterSpacing: 0.2,
    },
});
