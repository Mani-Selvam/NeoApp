import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    createEmailTemplate,
    deleteEmailTemplate,
    getEmailLogs,
    getEmailTemplates,
    sendEmail,
    updateEmailTemplate,
} from "../services/emailService";

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
    // Warm ivory-cream base
    bg: "#F2F4F8",
    surface: "#FFFFFF",
    surface2: "#FAFBFF",
    surface3: "#EEF2FF",

    // Rich ink text
    ink: "#0A0F1E",
    inkMid: "#3A4060",
    inkSoft: "#7C85A3",

    // Borders
    line: "#E8ECF4",
    lineWarm: "#F0F2F8",

    // Accent — deep amber/gold
    gold: "#1A6BFF",
    goldMid: "#0055E5",
    goldSoft: "rgba(26,107,255,0.12)",
    goldBorder: "rgba(26,107,255,0.28)",

    // Status
    ok: "#00C48C",
    okBg: "rgba(0,196,140,0.12)",
    warn: "#FF9500",
    warnBg: "rgba(255,149,0,0.12)",
    bad: "#FF3B5C",
    badBg: "rgba(255,59,92,0.12)",
};

// ─── ANIMATED TAB BUTTON ──────────────────────────────────────────────────────
const TabBtn = ({ label, active, onPress, icon }) => {
    const scale = useRef(new Animated.Value(1)).current;

    const handlePress = () => {
        Animated.sequence([
            Animated.timing(scale, {
                toValue: 0.94,
                duration: 80,
                useNativeDriver: true,
            }),
            Animated.timing(scale, {
                toValue: 1,
                duration: 120,
                useNativeDriver: true,
            }),
        ]).start();
        onPress();
    };

    return (
        <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
            <TouchableOpacity
                onPress={handlePress}
                activeOpacity={0.85}
                style={[S.tabBtn, active && S.tabBtnActive]}>
                <Ionicons
                    name={icon}
                    size={15}
                    color={active ? T.ink : T.inkSoft}
                />
                <Text style={[S.tabText, active && S.tabTextActive]}>
                    {label}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
};

// ─── FIELD COMPONENT ─────────────────────────────────────────────────────────
const Field = ({
    label,
    value,
    onChangeText,
    placeholder,
    multiline,
    keyboardType,
    icon,
}) => (
    <View style={{ marginBottom: 20 }}>
        <View style={S.labelRow}>
            {icon ? (
                <Ionicons
                    name={icon}
                    size={12}
                    color={T.inkSoft}
                    style={{ marginRight: 5 }}
                />
            ) : null}
            <Text style={S.label}>{label}</Text>
        </View>
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={T.inkSoft}
            autoCapitalize="none"
            keyboardType={keyboardType}
            multiline={multiline}
            style={[
                S.input,
                multiline && {
                    minHeight: 130,
                    textAlignVertical: "top",
                    paddingTop: 14,
                },
            ]}
        />
    </View>
);

// ─── SECTION DIVIDER ─────────────────────────────────────────────────────────
const Divider = ({ label }) => (
    <View style={S.dividerRow}>
        <View style={S.dividerLine} />
        {label ? <Text style={S.dividerLabel}>{label}</Text> : null}
        {label ? <View style={S.dividerLine} /> : null}
    </View>
);

// ─── VARIABLE OPTIONS ────────────────────────────────────────────────────────
const VAR_OPTIONS = [
    { key: "name", label: "Lead Name", token: "{{name}}" },
    { key: "company", label: "Company", token: "{{company}}" },
    { key: "staff", label: "Staff Name", token: "{{staff}}" },
    { key: "product", label: "Product", token: "{{product}}" },
    { key: "date", label: "Date", token: "{{date}}" },
];

const getVarMatch = (text, cursor) => {
    const cur = Math.max(0, Number(cursor || 0));
    const before = String(text || "").slice(0, cur);
    const m = before.match(/{{\s*([a-zA-Z_]*)$/);
    if (!m) return null;
    const query = String(m[1] || "").toLowerCase();
    const start = cur - m[0].length;
    return { query, start, end: cur };
};

const TEMPLATE_USAGE_KEY = "emailTemplateUsage:v1";
const normalizeSearch = (v) =>
    String(v || "")
        .trim()
        .toLowerCase();
const getTemplateSearchHaystack = (t) =>
    normalizeSearch(`${t?.name || ""} ${t?.subject || ""} ${t?.body || ""}`);
const formatCount = (n) => {
    const num = Number(n || 0);
    if (!Number.isFinite(num) || num <= 0) return "";
    if (num < 1000) return String(num);
    if (num < 1000000) return `${Math.floor(num / 1000)}k`;
    return `${Math.floor(num / 1000000)}m`;
};
const applyVarInsert = ({ text, match, token }) => {
    const t = String(text || "");
    const start = Math.max(0, match?.start ?? 0);
    const end = Math.max(start, match?.end ?? start);
    const next = t.slice(0, start) + token + t.slice(end);
    return { next, cursor: start + token.length };
};
const formatDateTime = (v) => {
    if (!v) return "–";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "–";
    return d.toLocaleString();
};

// ─────────────────────────────────────────────────────────────────────────────
export default function EmailScreen({ navigation, route, embedded = false }) {
    const insets = useSafeAreaInsets();
    const initialTo = route?.params?.toEmail || route?.params?.email || "";
    const initialEnquiryId =
        route?.params?.enquiryId || route?.params?._id || null;
    const initialLeadName =
        route?.params?.leadName || route?.params?.name || "";

    const [tab, setTab] = useState("compose");
    const [loading, setLoading] = useState(false);

    // Compose
    const [to, setTo] = useState(initialTo);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState(
        initialLeadName ? `Hello ${initialLeadName},\n\n` : "",
    );
    const [file, setFile] = useState(null);
    const [templateId, setTemplateId] = useState(null);
    const [trackOpen, setTrackOpen] = useState(false);
    const [trackLinks, setTrackLinks] = useState(false);

    // Templates
    const [templates, setTemplates] = useState([]);
    const [tplModal, setTplModal] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [tplName, setTplName] = useState("");
    const [tplSubject, setTplSubject] = useState("");
    const [tplBody, setTplBody] = useState("");

    // Logs
    const [logs, setLogs] = useState([]);
    const [logsPage, setLogsPage] = useState(1);
    const [logsHasMore, setLogsHasMore] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);

    const composeEnquiryIdRef = useRef(initialEnquiryId);

    // Autocomplete
    const composeMsgRef = useRef(null);
    const [composeSel, setComposeSel] = useState({ start: 0, end: 0 });
    const [composeVarMatch, setComposeVarMatch] = useState(null);

    const tplMsgRef = useRef(null);
    const [tplSel, setTplSel] = useState({ start: 0, end: 0 });
    const [tplVarMatch, setTplVarMatch] = useState(null);

    // Template picker
    const [templateSearch, setTemplateSearch] = useState("");
    const [templateUsage, setTemplateUsage] = useState({});
    const [showAllTemplates, setShowAllTemplates] = useState(false);

    const handleBackPress = useCallback(() => {
        if (navigation?.canGoBack?.()) {
            navigation.goBack();
            return;
        }
        if (tab !== "compose") {
            setTab("compose");
            return;
        }
        navigation?.navigate?.("Home");
    }, [navigation, tab]);

    const composeVarOptions = useMemo(() => {
        if (!composeVarMatch) return [];
        const q = composeVarMatch.query || "";
        return VAR_OPTIONS.filter((v) => (q ? v.key.startsWith(q) : true));
    }, [composeVarMatch]);

    const tplVarOptions = useMemo(() => {
        if (!tplVarMatch) return [];
        const q = tplVarMatch.query || "";
        return VAR_OPTIONS.filter((v) => (q ? v.key.startsWith(q) : true));
    }, [tplVarMatch]);

    const selectedTemplate = useMemo(
        () =>
            templates.find((t) => String(t._id) === String(templateId)) || null,
        [templates, templateId],
    );

    const templateSearchKey = useMemo(
        () => normalizeSearch(templateSearch),
        [templateSearch],
    );

    const filteredTemplates = useMemo(() => {
        if (!templateSearchKey) return templates;
        return (templates || []).filter((t) =>
            getTemplateSearchHaystack(t).includes(templateSearchKey),
        );
    }, [templates, templateSearchKey]);

    const sortedTemplates = useMemo(() => {
        const usage = templateUsage || {};
        return [...(filteredTemplates || [])].sort((a, b) => {
            const ua = usage?.[String(a?._id)] || {};
            const ub = usage?.[String(b?._id)] || {};
            const ca = Number(ua.count || 0),
                cb = Number(ub.count || 0);
            if (cb !== ca) return cb - ca;
            const la = Number(ua.lastUsedAt || 0),
                lb = Number(ub.lastUsedAt || 0);
            if (lb !== la) return lb - la;
            return String(a?.name || "").localeCompare(String(b?.name || ""));
        });
    }, [filteredTemplates, templateUsage]);

    const mostUsedTemplates = useMemo(() => {
        if (templateSearchKey) return [];
        const usage = templateUsage || {};
        return [...(templates || [])]
            .sort((a, b) => {
                const ua = usage?.[String(a?._id)] || {},
                    ub = usage?.[String(b?._id)] || {};
                const ca = Number(ua.count || 0),
                    cb = Number(ub.count || 0);
                if (cb !== ca) return cb - ca;
                return Number(ub.lastUsedAt || 0) - Number(ua.lastUsedAt || 0);
            })
            .filter((t) => Number(usage?.[String(t?._id)]?.count || 0) > 0)
            .slice(0, 5);
    }, [templates, templateUsage, templateSearchKey]);

    const loadTemplates = useCallback(async () => {
        const res = await getEmailTemplates();
        if (!res?.ok)
            throw new Error(res?.message || "Failed to load templates");
        setTemplates(res.templates || []);
    }, []);

    const loadTemplateUsage = useCallback(async () => {
        try {
            const raw = await AsyncStorage.getItem(TEMPLATE_USAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") setTemplateUsage(parsed);
        } catch (_e) {}
    }, []);

    const bumpTemplateUsage = useCallback(
        async (id) => {
            const key = String(id || "");
            if (!key) return;
            const now = Date.now();
            const next = {
                ...(templateUsage || {}),
                [key]: {
                    count: Number(templateUsage?.[key]?.count || 0) + 1,
                    lastUsedAt: now,
                },
            };
            setTemplateUsage(next);
            try {
                await AsyncStorage.setItem(
                    TEMPLATE_USAGE_KEY,
                    JSON.stringify(next),
                );
            } catch (_e) {}
        },
        [templateUsage],
    );

    const loadLogs = useCallback(
        async ({ reset = false, status = "" } = {}) => {
            const page = reset ? 1 : logsPage;
            const res = await getEmailLogs({ status, page, limit: 20 });
            if (!res?.ok)
                throw new Error(res?.message || "Failed to load logs");
            const nextItems = res.logs || [];
            const totalPages = res.pagination?.pages || 1;
            if (reset) {
                setLogs(nextItems);
                setLogsPage(2);
            } else {
                setLogs((prev) => [...prev, ...nextItems]);
                setLogsPage((p) => p + 1);
            }
            setLogsHasMore(page < totalPages);
        },
        [logsPage],
    );

    const onPickFile = async () => {
        try {
            const res = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                multiple: false,
            });
            if (res.canceled) return;
            const asset = res.assets?.[0];
            if (!asset?.uri) return;
            setFile({
                uri: asset.uri,
                name: asset.name,
                type: asset.mimeType || "application/octet-stream",
            });
        } catch (e) {
            Alert.alert("Attachment", e.message || "Failed to pick file");
        }
    };

    const onSend = async () => {
        try {
            if (!String(to || "").trim())
                return Alert.alert("Missing", "To Email is required.");
            if (!String(subject || "").trim())
                return Alert.alert("Missing", "Subject is required.");
            if (!String(message || "").trim())
                return Alert.alert("Missing", "Message is required.");
            setLoading(true);
            const res = await sendEmail({
                to: String(to).trim(),
                subject: String(subject).trim(),
                message: String(message),
                enquiryId: composeEnquiryIdRef.current,
                templateId,
                trackOpen,
                trackLinks,
                file,
            });
            if (!res?.ok) throw new Error(res?.message || "Send failed");
            Alert.alert("✓ Sent", "Your email was delivered.");
            setFile(null);
            setTemplateId(null);
            setSubject("");
            setMessage(initialLeadName ? `Hello ${initialLeadName},\n\n` : "");
            setTab("sent");
            await loadLogs({ reset: true, status: "Sent" });
        } catch (e) {
            Alert.alert(
                "Send Failed",
                e?.response?.data?.message || e.message || "Send failed",
            );
        } finally {
            setLoading(false);
        }
    };

    const onRefreshLogs = async (status = "") => {
        try {
            setRefreshing(true);
            await loadLogs({ reset: true, status });
        } catch (e) {
            Alert.alert(
                "Logs",
                e?.response?.data?.message || e.message || "Failed",
            );
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                await loadTemplateUsage();
                await loadTemplates();
            } catch (_e) {}
            if (!mounted) return;
        })();
        return () => {
            mounted = false;
        };
    }, [loadTemplates, loadTemplateUsage]);

    useEffect(() => {
        (async () => {
            try {
                if (tab === "sent")
                    await loadLogs({ reset: true, status: "Sent" });
                if (tab === "logs") await loadLogs({ reset: true, status: "" });
            } catch (_e) {}
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const openCreateTemplate = () => {
        setEditing(null);
        setTplName("");
        setTplSubject("");
        setTplBody("");
        setEditModal(true);
    };
    const openEditTemplate = (tpl) => {
        setEditing(tpl);
        setTplName(tpl?.name || "");
        setTplSubject(tpl?.subject || "");
        setTplBody(tpl?.body || "");
        setEditModal(true);
    };

    const saveTemplate = async () => {
        try {
            const payload = {
                name: tplName.trim(),
                subject: tplSubject.trim(),
                body: tplBody,
            };
            if (!payload.name)
                return Alert.alert("Missing", "Template Name is required.");
            setLoading(true);
            if (editing?._id) {
                const res = await updateEmailTemplate(editing._id, payload);
                if (!res?.ok) throw new Error(res?.message || "Update failed");
            } else {
                const res = await createEmailTemplate(payload);
                if (!res?.ok) throw new Error(res?.message || "Create failed");
            }
            setEditModal(false);
            await loadTemplates();
            Alert.alert("Saved", "Template saved successfully.");
        } catch (e) {
            Alert.alert(
                "Template",
                e?.response?.data?.message || e.message || "Failed",
            );
        } finally {
            setLoading(false);
        }
    };

    const removeTemplate = async (tpl) => {
        Alert.alert("Delete Template", `Delete "${tpl?.name}"?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        setLoading(true);
                        const res = await deleteEmailTemplate(tpl._id);
                        if (!res?.ok)
                            throw new Error(res?.message || "Delete failed");
                        await loadTemplates();
                    } catch (e) {
                        Alert.alert(
                            "Delete Failed",
                            e?.response?.data?.message || e.message || "Failed",
                        );
                    } finally {
                        setLoading(false);
                    }
                },
            },
        ]);
    };

    const applySelectedTemplateToCompose = (tpl) => {
        if (!tpl) return;
        setTemplateId(tpl._id);
        if (!subject.trim()) setSubject(tpl.subject || "");
        if (
            !message.trim() ||
            message === (initialLeadName ? `Hello ${initialLeadName},\n\n` : "")
        )
            setMessage(tpl.body || "");
        bumpTemplateUsage(tpl._id);
        setTplModal(false);
    };

    const onComposeMessageChange = (nextText) => {
        setMessage(nextText);
        setComposeVarMatch(getVarMatch(nextText, composeSel?.start ?? 0));
    };
    const onComposeSelectionChange = (e) => {
        const sel = e?.nativeEvent?.selection;
        if (!sel) return;
        setComposeSel(sel);
        setComposeVarMatch(getVarMatch(message, sel.start));
    };
    const onPickComposeVar = (opt) => {
        if (!composeVarMatch) return;
        const { next, cursor } = applyVarInsert({
            text: message,
            match: composeVarMatch,
            token: opt.token,
        });
        setMessage(next);
        setComposeVarMatch(null);
        setComposeSel({ start: cursor, end: cursor });
    };

    const onTplBodyChange = (nextText) => {
        setTplBody(nextText);
        setTplVarMatch(getVarMatch(nextText, tplSel?.start ?? 0));
    };
    const onTplSelectionChange = (e) => {
        const sel = e?.nativeEvent?.selection;
        if (!sel) return;
        setTplSel(sel);
        setTplVarMatch(getVarMatch(tplBody, sel.start));
    };
    const onPickTplVar = (opt) => {
        if (!tplVarMatch) return;
        const { next, cursor } = applyVarInsert({
            text: tplBody,
            match: tplVarMatch,
            token: opt.token,
        });
        setTplBody(next);
        setTplVarMatch(null);
        setTplSel({ start: cursor, end: cursor });
    };

    const statusColor = (s) =>
        s === "Sent"
            ? T.ok
            : s === "Queued"
              ? T.warn
              : s === "Failed"
                ? T.bad
                : T.inkSoft;
    const statusBg = (s) =>
        s === "Sent"
            ? T.okBg
            : s === "Queued"
              ? T.warnBg
              : s === "Failed"
                ? T.badBg
                : T.surface3;

    const renderTemplateRow = ({ item }) => (
        <TouchableOpacity
            onPress={() => openEditTemplate(item)}
            activeOpacity={0.75}
            style={S.listRow}>
            <View style={S.listRowIcon}>
                <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={T.gold}
                />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={S.rowTitle}>{item.name}</Text>
                <Text style={S.rowSub} numberOfLines={1}>
                    {item.subject || "–"}
                </Text>
            </View>
            <TouchableOpacity
                onPress={() => removeTemplate(item)}
                style={S.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={16} color={T.bad} />
            </TouchableOpacity>
            <Ionicons
                name="chevron-forward"
                size={16}
                color={T.inkSoft}
                style={{ marginLeft: 4 }}
            />
        </TouchableOpacity>
    );

    const renderLogRow = ({ item }) => (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedLog(item)}
            style={S.listRow}>
            <View
                style={[
                    S.listRowIcon,
                    { backgroundColor: statusBg(item.status) },
                ]}>
                <Ionicons
                    name={
                        item.status === "Sent"
                            ? "checkmark-circle-outline"
                            : item.status === "Failed"
                              ? "close-circle-outline"
                              : "time-outline"
                    }
                    size={16}
                    color={statusColor(item.status)}
                />
            </View>
            <View style={{ flex: 1 }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                    }}>
                    <View
                        style={[
                            S.badge,
                            {
                                backgroundColor: statusBg(item.status),
                                borderColor: statusColor(item.status) + "44",
                            },
                        ]}>
                        <Text
                            style={[
                                S.badgeText,
                                { color: statusColor(item.status) },
                            ]}>
                            {item.status}
                        </Text>
                    </View>
                    <Text style={S.rowTitle} numberOfLines={1}>
                        {item.to}
                    </Text>
                </View>
                <Text style={S.rowSub} numberOfLines={1}>
                    {item.subject || "–"}
                </Text>
                <Text style={S.rowMeta}>
                    {formatDateTime(item.sentAt || item.createdAt)}
                    {item.openCount ? `  ·  Opened ${item.openCount}×` : ""}
                    {item.clickCount ? `  ·  ${item.clickCount} clicks` : ""}
                </Text>
                {item.status === "Failed" && item.error ? (
                    <Text
                        style={[S.rowMeta, { color: T.bad, marginTop: 2 }]}
                        numberOfLines={2}>
                        {item.error}
                    </Text>
                ) : null}
                {item.smtpResponse ? (
                    <Text style={[S.rowMeta, { marginTop: 2 }]} numberOfLines={2}>
                        SMTP: {item.smtpResponse}
                    </Text>
                ) : null}
            </View>
            <Ionicons
                name="chevron-forward"
                size={16}
                color={T.inkSoft}
                style={{ marginLeft: 4 }}
            />
        </TouchableOpacity>
    );

    const logsStatusFilter = tab === "sent" ? "Sent" : "";

    return (
        <View style={S.root}>
            {/* Warm gradient background */}
            <LinearGradient
                colors={[T.bg, T.bg, T.bg]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* ── HEADER ─────────────────────────────────────────────── */}
            {!embedded ? (
                <View
                    style={[
                        S.header,
                        { paddingTop: insets.top, height: 68 + (insets.top || 0) },
                    ]}>
                <TouchableOpacity
                    onPress={handleBackPress}
                    style={S.headerBtn}
                    activeOpacity={0.75}>
                    <Ionicons
                        name="arrow-back-outline"
                        size={20}
                        color={T.ink}
                    />
                </TouchableOpacity>

                <View style={{ alignItems: "center" }}>
                    <Text style={S.headerTitle}>Inbox Studio</Text>
                    <View style={S.headerPill}>
                        <View style={S.headerDot} />
                        <Text style={S.headerSub}>Ready to send</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={() => navigation.navigate("EmailSettingsScreen")}
                    style={S.headerBtn}
                    activeOpacity={0.75}>
                    <Ionicons name="settings-outline" size={20} color={T.ink} />
                </TouchableOpacity>
            </View>
            ) : null}

            {/* ── TABS ───────────────────────────────────────────────── */}
            <View style={S.tabBar}>
                <TabBtn
                    label="Compose"
                    icon="create-outline"
                    active={tab === "compose"}
                    onPress={() => setTab("compose")}
                />
                <TabBtn
                    label="Templates"
                    icon="document-text-outline"
                    active={tab === "templates"}
                    onPress={() => setTab("templates")}
                />
                <TabBtn
                    label="Sent"
                    icon="paper-plane-outline"
                    active={tab === "sent"}
                    onPress={() => setTab("sent")}
                />
                <TabBtn
                    label="Logs"
                    icon="pulse-outline"
                    active={tab === "logs"}
                    onPress={() => setTab("logs")}
                />
            </View>

            {/* ── COMPOSE TAB ────────────────────────────────────────── */}
            {tab === "compose" ? (
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                            paddingHorizontal: 18,
                            paddingTop: 14,
                            paddingBottom: 40 + (insets.bottom || 0),
                        }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled">
                        {/* Template Picker Row */}
                        <TouchableOpacity
                            onPress={() => {
                                setTemplateSearch("");
                                setShowAllTemplates(false);
                                setTplModal(true);
                            }}
                            activeOpacity={0.8}
                            style={S.templatePickRow}>
                            <LinearGradient
                                colors={
                                    selectedTemplate
                                        ? [T.goldSoft, "rgba(192,123,45,0.06)"]
                                        : [T.surface2, T.surface3]
                                }
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={S.templatePickGrad}>
                                <View style={S.templatePickIcon}>
                                    <Ionicons
                                        name="sparkles-outline"
                                        size={16}
                                        color={T.gold}
                                    />
                                </View>
                                <Text
                                    style={[
                                        S.templatePickText,
                                        selectedTemplate && { color: T.gold },
                                    ]}
                                    numberOfLines={1}>
                                    {selectedTemplate
                                        ? selectedTemplate.name
                                        : "Use a template"}
                                </Text>
                                {selectedTemplate ? (
                                    <TouchableOpacity
                                        onPress={() => setTemplateId(null)}
                                        style={S.clearChip}
                                        hitSlop={{
                                            top: 10,
                                            bottom: 10,
                                            left: 10,
                                            right: 10,
                                        }}>
                                        <Ionicons
                                            name="close"
                                            size={14}
                                            color={T.inkSoft}
                                        />
                                    </TouchableOpacity>
                                ) : (
                                    <Ionicons
                                        name="chevron-forward-outline"
                                        size={16}
                                        color={T.inkSoft}
                                    />
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Card */}
                        <View style={S.card}>
                            <Field
                                label="TO"
                                icon="person-outline"
                                value={to}
                                onChangeText={setTo}
                                placeholder="ravi@example.com"
                                keyboardType="email-address"
                            />
                            <Field
                                label="SUBJECT"
                                icon="text-outline"
                                value={subject}
                                onChangeText={setSubject}
                                placeholder="Subject line…"
                            />

                            {/* Message */}
                            <View style={{ marginBottom: 20 }}>
                                <View style={S.labelRow}>
                                    <Ionicons
                                        name="chatbubble-ellipses-outline"
                                        size={12}
                                        color={T.inkSoft}
                                        style={{ marginRight: 5 }}
                                    />
                                    <Text style={S.label}>MESSAGE</Text>
                                </View>
                                <TextInput
                                    ref={composeMsgRef}
                                    value={message}
                                    onChangeText={onComposeMessageChange}
                                    placeholder="Start writing…"
                                    placeholderTextColor={T.inkSoft}
                                    autoCapitalize="none"
                                    multiline
                                    selection={composeSel}
                                    onSelectionChange={onComposeSelectionChange}
                                    style={[
                                        S.input,
                                        {
                                            minHeight: 140,
                                            textAlignVertical: "top",
                                            paddingTop: 14,
                                        },
                                    ]}
                                />
                                {composeVarMatch &&
                                composeVarOptions.length > 0 ? (
                                    <View style={S.suggestBox}>
                                        <Text style={S.suggestHeader}>
                                            Insert variable
                                        </Text>
                                        {composeVarOptions.map((opt) => (
                                            <TouchableOpacity
                                                key={opt.key}
                                                onPress={() =>
                                                    onPickComposeVar(opt)
                                                }
                                                style={S.suggestRow}>
                                                <Text style={S.suggestTitle}>
                                                    {opt.label}
                                                </Text>
                                                <View style={S.tokenPill}>
                                                    <Text
                                                        style={S.suggestToken}>
                                                        {opt.token}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : null}
                            </View>

                            <Divider label="OPTIONS" />

                            {/* Attachment row */}
                            <View style={[S.rowBetween, { marginTop: 16 }]}>
                                <TouchableOpacity
                                    onPress={onPickFile}
                                    activeOpacity={0.8}
                                    style={S.optionBtn}>
                                    <Ionicons
                                        name="attach-outline"
                                        size={17}
                                        color={T.inkMid}
                                    />
                                    <Text style={S.optionBtnText}>
                                        {file ? "Change file" : "Attach"}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setTrackOpen((v) => !v)}
                                    activeOpacity={0.8}
                                    style={[
                                        S.optionBtn,
                                        trackOpen && S.optionBtnActive,
                                    ]}>
                                    <Ionicons
                                        name="eye-outline"
                                        size={17}
                                        color={trackOpen ? T.gold : T.inkMid}
                                    />
                                    <Text
                                        style={[
                                            S.optionBtnText,
                                            trackOpen && S.optionBtnTextActive,
                                        ]}>
                                        Track Opens
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setTrackLinks((v) => !v)}
                                    activeOpacity={0.8}
                                    style={[
                                        S.optionBtn,
                                        trackLinks && S.optionBtnActive,
                                    ]}>
                                    <Ionicons
                                        name="link-outline"
                                        size={17}
                                        color={trackLinks ? T.gold : T.inkMid}
                                    />
                                    <Text
                                        style={[
                                            S.optionBtnText,
                                            trackLinks && S.optionBtnTextActive,
                                        ]}>
                                        Track Links
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {file ? (
                                <View style={S.fileChip}>
                                    <Ionicons
                                        name="document-attach-outline"
                                        size={15}
                                        color={T.gold}
                                    />
                                    <Text
                                        style={S.fileChipText}
                                        numberOfLines={1}>
                                        {file.name}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => setFile(null)}
                                        hitSlop={{
                                            top: 8,
                                            bottom: 8,
                                            left: 8,
                                            right: 8,
                                        }}>
                                        <Ionicons
                                            name="close-circle"
                                            size={16}
                                            color={T.inkSoft}
                    />
                </TouchableOpacity>
            </View>
                            ) : null}
                        </View>

                        {/* Send Button */}
                        <TouchableOpacity
                            disabled={loading}
                            onPress={onSend}
                            activeOpacity={0.85}
                            style={{ marginTop: 24 }}>
                            <LinearGradient
                                colors={[T.gold, T.goldMid]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={S.sendBtn}>
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <>
                                        <Ionicons
                                            name="paper-plane-outline"
                                            size={18}
                                            color="#FFFFFF"
                                        />
                                        <Text style={S.sendText}>
                                            Send Email
                                        </Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            ) : null}

            {/* ── TEMPLATES TAB ─────────────────────────────────────── */}
            {tab === "templates" ? (
                <View
                    style={{ flex: 1, paddingHorizontal: 18, paddingTop: 20 }}>
                    <TouchableOpacity
                        onPress={openCreateTemplate}
                        activeOpacity={0.85}
                        style={{ marginBottom: 14 }}>
                        <LinearGradient
                            colors={[T.gold, T.goldMid]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={S.addBtn}>
                            <Ionicons
                                name="add-circle-outline"
                                size={18}
                                color="#FFFFFF"
                            />
                            <Text style={S.addText}>New Template</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    <FlatList
                        data={templates}
                        keyExtractor={(i) => String(i._id)}
                        renderItem={renderTemplateRow}
                        contentContainerStyle={{
                            paddingBottom: 30 + (insets.bottom || 0),
                        }}
                        ListEmptyComponent={
                            <View style={S.empty}>
                                <View style={S.emptyIconWrap}>
                                    <Ionicons
                                        name="document-text-outline"
                                        size={28}
                                        color={T.gold}
                                    />
                                </View>
                                <Text style={S.emptyTitle}>
                                    No templates yet
                                </Text>
                                <Text style={S.emptyHint}>
                                    Create your first to save time.
                                </Text>
                            </View>
                        }
                    />
                </View>
            ) : null}

            {/* ── SENT / LOGS TABS ──────────────────────────────────── */}
            {tab === "sent" || tab === "logs" ? (
                <View
                    style={{ flex: 1, paddingHorizontal: 18, paddingTop: 20 }}>
                    <FlatList
                        data={logs}
                        keyExtractor={(i) => String(i._id)}
                        renderItem={renderLogRow}
                        onEndReached={() => {
                            if (refreshing || loading || !logsHasMore) return;
                            loadLogs({
                                reset: false,
                                status: logsStatusFilter,
                            }).catch(() => null);
                        }}
                        onEndReachedThreshold={0.3}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() =>
                                    onRefreshLogs(logsStatusFilter)
                                }
                                tintColor={T.gold}
                            />
                        }
                        ListEmptyComponent={
                            <View style={S.empty}>
                                <View style={S.emptyIconWrap}>
                                    <Ionicons
                                        name="mail-open-outline"
                                        size={28}
                                        color={T.gold}
                                    />
                                </View>
                                <Text style={S.emptyTitle}>
                                    Nothing here yet
                                </Text>
                                <Text style={S.emptyHint}>
                                    Your sent emails will appear here.
                                </Text>
                            </View>
                        }
                        contentContainerStyle={{
                            paddingBottom: 30 + (insets.bottom || 0),
                        }}
                    />
                </View>
            ) : null}

            {/* ── TEMPLATE PICKER MODAL ────────────────────────────── */}
            <Modal
                visible={Boolean(selectedLog)}
                transparent
                animationType="fade"
                onRequestClose={() => setSelectedLog(null)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setSelectedLog(null)}
                    style={S.overlay}>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {}}
                        style={S.sheet}>
                        <View style={S.sheetHandle} />
                        <View style={S.sheetHeaderRow}>
                            <Text style={S.sheetTitle}>Delivery Details</Text>
                            <View
                                style={[
                                    S.badge,
                                    {
                                        backgroundColor: statusBg(selectedLog?.status),
                                        borderColor:
                                            statusColor(selectedLog?.status) + "44",
                                    },
                                ]}>
                                <Text
                                    style={[
                                        S.badgeText,
                                        { color: statusColor(selectedLog?.status) },
                                    ]}>
                                    {selectedLog?.status || "Log"}
                                </Text>
                            </View>
                        </View>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 8 }}>
                            <View style={S.detailCard}>
                                <Text style={S.detailLabel}>To</Text>
                                <Text style={S.detailValue}>{selectedLog?.to || "â€“"}</Text>
                                <Text style={S.detailLabel}>Subject</Text>
                                <Text style={S.detailValue}>{selectedLog?.subject || "â€“"}</Text>
                                <Text style={S.detailLabel}>Sent At</Text>
                                <Text style={S.detailValue}>
                                    {formatDateTime(
                                        selectedLog?.sentAt || selectedLog?.createdAt,
                                    )}
                                </Text>
                                <Text style={S.detailLabel}>Message ID</Text>
                                <Text style={S.detailCode}>
                                    {selectedLog?.messageId || "â€“"}
                                </Text>
                                <Text style={S.detailLabel}>SMTP Response</Text>
                                <Text style={S.detailCode}>
                                    {selectedLog?.smtpResponse || "â€“"}
                                </Text>
                                <Text style={S.detailLabel}>Accepted</Text>
                                <Text style={S.detailValue}>
                                    {(selectedLog?.acceptedRecipients || []).length
                                        ? selectedLog.acceptedRecipients.join(", ")
                                        : "â€“"}
                                </Text>
                                <Text style={S.detailLabel}>Rejected</Text>
                                <Text style={S.detailValue}>
                                    {(selectedLog?.rejectedRecipients || []).length
                                        ? selectedLog.rejectedRecipients.join(", ")
                                        : "â€“"}
                                </Text>
                                <Text style={S.detailLabel}>Error</Text>
                                <Text
                                    style={[
                                        S.detailValue,
                                        selectedLog?.error ? { color: T.bad } : null,
                                    ]}>
                                    {selectedLog?.error || "â€“"}
                                </Text>
                            </View>
                        </ScrollView>
                        <TouchableOpacity
                            onPress={() => setSelectedLog(null)}
                            style={S.sheetClose}>
                            <Text style={S.sheetCloseText}>Close</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <Modal
                visible={tplModal}
                transparent
                animationType="fade"
                onRequestClose={() => setTplModal(false)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setTplModal(false)}
                    style={S.overlay}>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {}}
                        style={S.sheet}>
                        {/* Sheet handle */}
                        <View style={S.sheetHandle} />

                        <View style={S.sheetHeaderRow}>
                            <Text style={S.sheetTitle}>Templates</Text>
                            {!templateSearchKey ? (
                                <TouchableOpacity
                                    onPress={() =>
                                        setShowAllTemplates((v) => !v)
                                    }
                                    style={S.pillBtn}>
                                    <Ionicons
                                        name={
                                            showAllTemplates
                                                ? "flame-outline"
                                                : "list-outline"
                                        }
                                        size={14}
                                        color={T.gold}
                                    />
                                    <Text style={S.pillBtnText}>
                                        {showAllTemplates ? "Most used" : "All"}
                                    </Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {/* Search */}
                        <View style={S.searchWrap}>
                            <Ionicons
                                name="search-outline"
                                size={16}
                                color={T.inkSoft}
                            />
                            <TextInput
                                value={templateSearch}
                                onChangeText={setTemplateSearch}
                                placeholder="Search templates…"
                                placeholderTextColor={T.inkSoft}
                                style={S.searchInput}
                                autoCapitalize="none"
                            />
                            {templateSearch ? (
                                <TouchableOpacity
                                    onPress={() => setTemplateSearch("")}>
                                    <Ionicons
                                        name="close-circle"
                                        size={16}
                                        color={T.inkSoft}
                                    />
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {/* Most used */}
                        {mostUsedTemplates.length > 0 &&
                        !templateSearchKey &&
                        !showAllTemplates ? (
                            <View style={{ marginBottom: 12 }}>
                                <Text style={S.sectionLabel}>⚡ Most Used</Text>
                                {mostUsedTemplates.map((item) => {
                                    const u =
                                        templateUsage?.[String(item._id)] || {};
                                    return (
                                        <TouchableOpacity
                                            key={String(item._id)}
                                            onPress={() =>
                                                applySelectedTemplateToCompose(
                                                    item,
                                                )
                                            }
                                            activeOpacity={0.75}
                                            style={S.modalRow}>
                                            <Text
                                                style={[
                                                    S.rowTitle,
                                                    { flex: 1 },
                                                ]}
                                                numberOfLines={1}>
                                                {item.name}
                                            </Text>
                                            {u?.count ? (
                                                <View style={S.usagePill}>
                                                    <Text style={S.usageText}>
                                                        {formatCount(u.count)}×
                                                    </Text>
                                                </View>
                                            ) : null}
                                            <Ionicons
                                                name="chevron-forward"
                                                size={16}
                                                color={T.inkSoft}
                                                style={{ marginLeft: 6 }}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ) : null}

                        {/* All list */}
                        {templateSearchKey ||
                        showAllTemplates ||
                        mostUsedTemplates.length === 0 ? (
                            <>
                                <Text style={S.sectionLabel}>
                                    {templateSearchKey
                                        ? "Results"
                                        : "All Templates"}
                                </Text>
                                <FlatList
                                    data={sortedTemplates}
                                    keyExtractor={(i) => String(i._id)}
                                    renderItem={({ item }) => {
                                        const u =
                                            templateUsage?.[String(item._id)] ||
                                            {};
                                        return (
                                            <TouchableOpacity
                                                onPress={() =>
                                                    applySelectedTemplateToCompose(
                                                        item,
                                                    )
                                                }
                                                activeOpacity={0.75}
                                                style={S.modalRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={S.rowTitle}>
                                                        {item.name}
                                                    </Text>
                                                    <Text
                                                        style={S.rowSub}
                                                        numberOfLines={1}>
                                                        {item.subject || "–"}
                                                    </Text>
                                                </View>
                                                {u?.count ? (
                                                    <View style={S.usagePill}>
                                                        <Text
                                                            style={S.usageText}>
                                                            {formatCount(
                                                                u.count,
                                                            )}
                                                            ×
                                                        </Text>
                                                    </View>
                                                ) : null}
                                                <Ionicons
                                                    name="chevron-forward"
                                                    size={16}
                                                    color={T.inkSoft}
                                                    style={{ marginLeft: 6 }}
                                                />
                                            </TouchableOpacity>
                                        );
                                    }}
                                    ListEmptyComponent={
                                        <Text
                                            style={[
                                                S.emptyHint,
                                                {
                                                    textAlign: "center",
                                                    marginTop: 20,
                                                },
                                            ]}>
                                            No templates found
                                        </Text>
                                    }
                                    contentContainerStyle={{ paddingBottom: 6 }}
                                    keyboardShouldPersistTaps="handled"
                                />
                            </>
                        ) : (
                            <Text
                                style={[
                                    S.emptyHint,
                                    { textAlign: "center", marginVertical: 16 },
                                ]}>
                                Tap All to browse all templates
                            </Text>
                        )}

                        <TouchableOpacity
                            onPress={() => setTplModal(false)}
                            style={S.sheetClose}>
                            <Text style={S.sheetCloseText}>Dismiss</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* ── CREATE/EDIT TEMPLATE MODAL ───────────────────────── */}
            <Modal
                visible={editModal}
                transparent
                animationType="fade"
                onRequestClose={() => setEditModal(false)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setEditModal(false)}
                    style={S.overlay}>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {}}
                        style={S.sheetLarge}>
                        <View style={S.sheetHandle} />
                        <Text style={S.sheetTitle}>
                            {editing ? "Edit Template" : "New Template"}
                        </Text>
                        <View
                            style={{
                                height: 1,
                                backgroundColor: T.line,
                                marginVertical: 14,
                            }}
                        />

                        <Field
                            label="TEMPLATE NAME"
                            icon="bookmark-outline"
                            value={tplName}
                            onChangeText={setTplName}
                            placeholder="Lead Follow-up"
                        />
                        <Field
                            label="SUBJECT"
                            icon="text-outline"
                            value={tplSubject}
                            onChangeText={setTplSubject}
                            placeholder="Following up on your enquiry"
                        />

                        <View style={{ marginBottom: 14 }}>
                            <View style={S.labelRow}>
                                <Ionicons
                                    name="chatbubble-ellipses-outline"
                                    size={12}
                                    color={T.inkSoft}
                                    style={{ marginRight: 5 }}
                                />
                                <Text style={S.label}>BODY</Text>
                            </View>
                            <TextInput
                                ref={tplMsgRef}
                                value={tplBody}
                                onChangeText={onTplBodyChange}
                                placeholder={
                                    "Hello {{name}},\nThank you for reaching out to {{company}}.\n\nBest,\n{{staff}}"
                                }
                                placeholderTextColor={T.inkSoft}
                                autoCapitalize="none"
                                multiline
                                selection={tplSel}
                                onSelectionChange={onTplSelectionChange}
                                style={[
                                    S.input,
                                    {
                                        minHeight: 130,
                                        textAlignVertical: "top",
                                        paddingTop: 14,
                                    },
                                ]}
                            />
                            {tplVarMatch && tplVarOptions.length > 0 ? (
                                <View style={S.suggestBox}>
                                    <Text style={S.suggestHeader}>
                                        Insert variable
                                    </Text>
                                    {tplVarOptions.map((opt) => (
                                        <TouchableOpacity
                                            key={opt.key}
                                            onPress={() => onPickTplVar(opt)}
                                            style={S.suggestRow}>
                                            <Text style={S.suggestTitle}>
                                                {opt.label}
                                            </Text>
                                            <View style={S.tokenPill}>
                                                <Text style={S.suggestToken}>
                                                    {opt.token}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : null}
                        </View>

                        {/* Variables hint */}
                        <View style={S.varsHintBox}>
                            <Ionicons
                                name="information-circle-outline"
                                size={14}
                                color={T.gold}
                            />
                            <Text style={S.varsHintText}>
                                Type {"{{"} to insert: name · company · staff ·
                                product · date
                            </Text>
                        </View>

                        <TouchableOpacity
                            disabled={loading}
                            onPress={saveTemplate}
                            activeOpacity={0.85}
                            style={{ marginTop: 14 }}>
                            <LinearGradient
                                colors={[T.gold, T.goldMid]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={S.saveBtn}>
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={S.saveBtnText}>
                                        Save Template
                                    </Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setEditModal(false)}
                            style={S.sheetClose}>
                            <Text style={S.sheetCloseText}>Cancel</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
    root: { flex: 1, flexDirection: "column", backgroundColor: T.bg },

    topAccent: {}, // removed

    // Header
    header: {
        height: 98,
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: T.line,
        backgroundColor: T.surface,
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
    headerTitle: {
        color: T.ink,
        fontSize: 17,
        fontWeight: "800",
        letterSpacing: -0.4,
    },
    headerPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginTop: 3,
    },
    headerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.ok },
    headerSub: { color: T.inkSoft, fontSize: 11, fontWeight: "700" },

    // Tabs
    tabBar: {
        height: 80,
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 14,
        backgroundColor: T.surface,
        zIndex: 10,
        borderBottomWidth: 1,
        borderBottomColor: T.line,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 1,
        minHeight: 46,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.line,
        shadowColor: T.ink,
        shadowOpacity: 0.04,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    tabBtnActive: {
        backgroundColor: "#ffffff",
        borderColor: T.goldBorder,
    },
    tabText: {
        color: T.inkSoft,
        fontWeight: "800",
        fontSize: 10,
        letterSpacing: 0.2,
    },
    tabTextActive: { color: T.ink },

    // Card
    card: {
        padding: 20,
        borderRadius: 20,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.line,
        shadowColor: T.ink,
        shadowOpacity: 0.07,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
    },

    // Labels
    labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    label: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 0.8,
    },

    // Input
    input: {
        backgroundColor: T.surface2,
        borderWidth: 1,
        borderColor: T.line,
        borderRadius: 13,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === "ios" ? 13 : 11,
        color: T.ink,
        fontWeight: "700",
        fontSize: 15,
    },

    // Divider
    dividerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginVertical: 12,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: T.line },
    dividerLabel: {
        color: T.inkSoft,
        fontSize: 10,
        fontWeight: "900",
        letterSpacing: 1,
    },

    // Template pick row (above card)
    templatePickRow: {
        marginBottom: 20,
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: T.lineWarm,
        shadowColor: T.ink,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    templatePickGrad: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    templatePickIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: T.goldSoft,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    templatePickText: {
        flex: 1,
        color: T.inkMid,
        fontWeight: "800",
        fontSize: 14,
    },
    clearChip: {
        width: 28,
        height: 28,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.line,
    },

    // Option buttons (track, attach)
    rowBetween: { flexDirection: "row", alignItems: "center", gap: 8 },
    optionBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 40,
        borderRadius: 12,
        backgroundColor: T.surface2,
        borderWidth: 1,
        borderColor: T.line,
    },
    optionBtnActive: { backgroundColor: T.goldSoft, borderColor: T.goldBorder },
    optionBtnText: { color: T.inkMid, fontWeight: "800", fontSize: 11 },
    optionBtnTextActive: { color: T.gold },

    // File chip
    fileChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        padding: 10,
        borderRadius: 12,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    fileChipText: { flex: 1, color: T.inkMid, fontWeight: "700", fontSize: 13 },

    // Send button
    sendBtn: {
        height: 54,
        borderRadius: 16,
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
    sendText: {
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 16,
        letterSpacing: 0.2,
    },

    // Add button
    addBtn: {
        height: 50,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        shadowColor: T.goldMid,
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 4,
    },
    addText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },

    // List rows
    listRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 10,
        shadowColor: T.ink,
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
        elevation: 1,
    },
    listRowIcon: {
        width: 36,
        height: 36,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.goldSoft,
    },
    rowTitle: { color: T.ink, fontWeight: "800", fontSize: 14 },
    rowSub: { color: T.inkSoft, fontWeight: "600", fontSize: 13, marginTop: 2 },
    rowMeta: {
        color: T.inkSoft,
        fontWeight: "600",
        fontSize: 12,
        marginTop: 4,
    },
    detailCard: {
        padding: 14,
        borderRadius: 16,
        backgroundColor: T.surface2,
        borderWidth: 1,
        borderColor: T.line,
    },
    detailLabel: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 0.6,
        marginTop: 12,
    },
    detailValue: {
        color: T.ink,
        fontSize: 14,
        fontWeight: "700",
        marginTop: 4,
    },
    detailCode: {
        color: T.inkMid,
        fontSize: 13,
        fontWeight: "700",
        marginTop: 4,
    },
    iconBtn: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(181,42,42,0.07)",
        borderWidth: 1,
        borderColor: "rgba(181,42,42,0.18)",
    },

    // Badge
    badge: {
        paddingVertical: 3,
        paddingHorizontal: 9,
        borderRadius: 999,
        borderWidth: 1,
    },
    badgeText: { fontWeight: "900", fontSize: 10, letterSpacing: 0.3 },

    // Empty state
    empty: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 52,
    },
    emptyIconWrap: {
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: T.goldSoft,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    emptyTitle: { color: T.ink, fontWeight: "800", fontSize: 16 },
    emptyHint: {
        color: T.inkSoft,
        fontWeight: "600",
        fontSize: 14,
        marginTop: 6,
    },

    // Modals
    overlay: {
        flex: 1,
        backgroundColor: "rgba(26,18,8,0.55)",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: 0,
    },
    sheet: {
        width: "100%",
        maxHeight: "72%",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: T.surface,
        borderTopWidth: 1,
        borderColor: T.line,
        padding: 18,
        paddingTop: 10,
    },
    sheetLarge: {
        width: "100%",
        maxHeight: "88%",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: T.surface,
        borderTopWidth: 1,
        borderColor: T.line,
        padding: 18,
        paddingTop: 10,
    },
    sheetHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: T.lineWarm,
        alignSelf: "center",
        marginBottom: 16,
    },
    sheetHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    sheetTitle: {
        color: T.ink,
        fontWeight: "900",
        fontSize: 18,
        letterSpacing: -0.3,
    },
    sheetClose: {
        marginTop: 8,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    sheetCloseText: { color: T.inkSoft, fontWeight: "800", fontSize: 14 },

    // Pill button
    pillBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        height: 32,
        borderRadius: 999,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    pillBtnText: { color: T.gold, fontWeight: "900", fontSize: 12 },

    // Search bar
    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        height: 44,
        borderRadius: 13,
        backgroundColor: T.surface2,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 12,
    },
    searchInput: { flex: 1, color: T.ink, fontWeight: "700", fontSize: 14 },

    // Section label
    sectionLabel: {
        color: T.inkSoft,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 0.8,
        marginBottom: 8,
    },

    // Modal row
    modalRow: {
        flexDirection: "row",
        alignItems: "center",
        padding: 13,
        borderRadius: 13,
        backgroundColor: T.surface2,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 8,
    },

    // Usage pill
    usagePill: {
        paddingHorizontal: 9,
        height: 24,
        borderRadius: 999,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
        alignItems: "center",
        justifyContent: "center",
    },
    usageText: { color: T.gold, fontWeight: "900", fontSize: 11 },

    // Suggest / autocomplete
    suggestBox: {
        marginTop: 8,
        borderRadius: 14,
        backgroundColor: T.surface,
        borderWidth: 1,
        borderColor: T.line,
        overflow: "hidden",
        shadowColor: T.ink,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    suggestHeader: {
        color: T.inkSoft,
        fontSize: 10,
        fontWeight: "900",
        letterSpacing: 0.8,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 4,
    },
    suggestRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: T.line,
    },
    suggestTitle: { color: T.ink, fontWeight: "800", fontSize: 14 },
    tokenPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    suggestToken: { color: T.gold, fontWeight: "900", fontSize: 12 },

    // Save button (modal)
    saveBtn: {
        height: 50,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: T.goldMid,
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
        elevation: 4,
    },
    saveBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },

    // Variables hint
    varsHintBox: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 7,
        padding: 10,
        borderRadius: 12,
        backgroundColor: T.goldSoft,
        borderWidth: 1,
        borderColor: T.goldBorder,
    },
    varsHintText: {
        flex: 1,
        color: T.inkMid,
        fontWeight: "700",
        fontSize: 12,
        lineHeight: 18,
    },
});
