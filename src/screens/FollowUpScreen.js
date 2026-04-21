import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    BackHandler,
    DeviceEventEmitter,
    Easing,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import RNImmediatePhoneCall from "react-native-immediate-phone-call";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import AppSideMenu from "../components/AppSideMenu";
import ConfettiBurst from "../components/ConfettiBurst";
import { useResponsiveTokens } from "../components/Responsiveutils";
import { FollowUpSkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    setCacheEntry,
} from "../services/appCache";
import {
    APP_EVENTS,
    emitEnquiryUpdated,
    onAppEvent,
} from "../services/appEvents";
import { cancelDebounceKey, debounceByKey } from "../services/debounce";
import * as emailService from "../services/emailService";
import * as enquiryService from "../services/enquiryService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import callLogService from "../services/callLogService";
import { initSocket } from "../services/socketService";
import {
    buildFeatureUpgradeMessage,
    hasPlanFeature,
} from "../utils/planFeatures";
import { getImageUrl } from "../utils/imageHelper";
import ChatScreen from "./ChatScreen";
import CallLogTabs from "../components/CallLogTabs";

const AUTO_SAVE_CALL_LOGS =
    String(process.env.EXPO_PUBLIC_CALL_AUTO_SAVE ?? "false")
        .trim()
        .toLowerCase() === "true";
const FOLLOWUPS_CACHE_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_FOLLOWUPS_MS || 300000,
); // FIX #4: Increased from 60000ms (1min) to 300000ms (5min)
const SEARCH_DEBOUNCE_MS = 500; // FIX #10: Debounce search/date changes
const MISSED_CHECK_INTERVAL_MS = 120000; // FIX #9: Increased from 60000ms to 120000ms (2min)
const PAGINATION_THRESHOLD = 0.5; // FlatList threshold: triggers at 50% scroll (Feature #2)
const PREFETCH_TABS = ["Today", "Missed", "Upcoming"]; // Tabs to prefetch (Feature #5)
const FOLLOWUPS_INSTANT_LOAD_TTL = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_FOLLOWUPS_INSTANT_MS || 600000,
); // 10 minutes for instant load without forcing refresh
const USE_NATIVE_DRIVER = Platform.OS !== "web";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: "#F1F5F9",
    card: "#FFFFFF",
    cardAlt: "#F8FAFF",
    primary: "#2563EB",
    primaryDark: "#1D4ED8",
    primarySoft: "#EFF6FF",
    primaryMid: "#BFDBFE",
    accent: "#7C3AED",
    violet: "#8B5CF6",
    success: "#059669",
    whatsapp: "#25D366",
    danger: "#DC2626",
    warning: "#D97706",
    info: "#0891B2",
    teal: "#0D9488",
    text: "#0F172A",
    textSub: "#334155",
    textMuted: "#64748B",
    textLight: "#94A3B8",
    border: "#E2E8F0",
    divider: "#F1F5F9",
    shadow: "#1E293B",
};
const GRAD = {
    primary: [C.primary, C.accent],
    success: [C.success, "#047857"],
    danger: [C.danger, "#991B1B"],
};

// ─── Responsive scale ─────────────────────────────────────────────────────────
const useScale = () => {
    const ui = useResponsiveTokens();
    return useMemo(() => {
        const isTablet = ui.isTablet;
        const isLarge = ui.width >= 414 && ui.width < 768;
        const isMed = ui.width >= 375 && ui.width < 414;
        return {
            isTablet,
            isLarge,
            isMed,
            isSmall: ui.width < 375,
            width: ui.width,
            height: ui.height,
            f: {
                xs: Math.round(ui.font.xs),
                sm: Math.round(ui.font.sm),
                base: Math.round(ui.font.base),
                md: Math.round(ui.font.lg),
                lg: Math.round(ui.font.xl),
                xl: Math.round(ui.font.xxl),
                xxl: Math.round(ui.font.xxxl),
            },
            sp: {
                xs: Math.round(ui.spacing.xs),
                sm: Math.round(ui.spacing.sm),
                md: Math.round(ui.spacing.md),
                lg: Math.round(ui.spacing.lg),
                xl: Math.round(ui.spacing.xl),
            },
            inputH: ui.size(isTablet ? 56 : isLarge ? 50 : isMed ? 48 : 46),
            radius: isTablet ? 16 : 12,
            cardR: isTablet ? 20 : 14,
            hPad: Math.round(ui.hPad),
            SW: ui.width,
        };
    }, [ui]);
};

// ─── Constants ────────────────────────────────────────────────────────────────
const ACTIVITY_OPTIONS = ["Phone Call", "WhatsApp", "Email", "Meeting"];
const STATUS_TABS = [
    { value: "All", label: "All", icon: "grid-outline", color: C.primary },
    {
        value: "Today",
        label: "Today",
        icon: "calendar-clear-outline",
        color: C.violet,
    },
    {
        value: "Sales",
        label: "Sales",
        icon: "cash-outline",
        color: C.success,
    },
];

const tabUsesExactDateFilter = (tab) =>
    tab === "Today" || tab === "Missed" || tab === "Sales";

// Detail tabs
const DETAIL_TABS = [
    { key: "followup", label: "Add Follow-up", icon: "add-circle-outline" },
    { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
    { key: "email", label: "Email", icon: "mail-outline" },
    { key: "contact", label: "Contact", icon: "person-outline" },
];

const DETAIL_TAB_FEATURES = {
    whatsapp: "whatsapp",
    email: "email",
    // contact tab is available to all users (no feature restriction)
};

const normalizePhone = (value) =>
    String(value || "")
        .replace(/\D/g, "")
        .slice(-10);

const formatCallDuration = (seconds) => {
    const total = Number(seconds || 0);
    const mins = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, "0");
    return `${mins}:${secs}`;
};

const formatShortDateTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
};

function FloatingInput({
    label,
    value,
    onChangeText,
    placeholder = "",
    multiline = false,
    keyboardType = "default",
    containerStyle,
    inputStyle,
    minHeight,
    scrollEnabled = true,
}) {
    const [focused, setFocused] = useState(false);
    const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: focused || String(value || "").trim().length > 0 ? 1 : 0,
            duration: 180,
            useNativeDriver: false,
        }).start();
    }, [anim, focused, value]);

    return (
        <View
            style={[
                FU.floatingWrap,
                multiline && FU.floatingWrapMultiline,
                containerStyle,
            ]}>
            <Animated.Text
                style={[
                    FU.floatingLabel,
                    {
                        pointerEvents: "none",
                        top: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [multiline ? 20 : 16, 6],
                        }),
                        fontSize: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [14, 11],
                        }),
                        color: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [C.textLight, C.primary],
                        }),
                    },
                ]}>
                {label}
            </Animated.Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={focused ? placeholder : ""}
                placeholderTextColor={C.textLight}
                style={[
                    FU.floatingInput,
                    multiline && FU.floatingInputMultiline,
                    minHeight ? { minHeight } : null,
                    inputStyle,
                ]}
                multiline={multiline}
                keyboardType={keyboardType}
                textAlignVertical={multiline ? "top" : "center"}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                scrollEnabled={scrollEnabled}
            />
        </View>
    );
}

function FollowUpCallPanel({ enquiry, onCallPress, refreshKey = 0 }) {
    const phoneKey = normalizePhone(enquiry?.mobile || enquiry?.phoneNumber);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [typeFilter, setTypeFilter] = useState("All");
    const loadLogs = useCallback(
        async ({ force = false, showSpinner = true } = {}) => {
            if (!phoneKey) {
                setLogs([]);
                setLoading(false);
                return;
            }
            if (showSpinner) setLoading(true);
            try {
                // Import callLogService at the top of the file if not already imported:
                // import callLogService from "../services/callLogService";
                const result = await callLogService.getCallLogsByPhone(
                    phoneKey,
                    null, // null = fetch all types (filter client-side via typeFilter)
                    1,
                    200,
                );
                if (result.success) {
                    setLogs(result.data || []);
                } else {
                    console.warn(
                        "[FollowUpCallPanel] Fetch error:",
                        result.error,
                    );
                    setLogs([]);
                }
            } catch (err) {
                console.error(
                    "[FollowUpCallPanel] loadLogs exception:",
                    err.message,
                );
                setLogs([]);
            } finally {
                setLoading(false);
            }
        },
        [phoneKey, enquiry?._id],
    );

    useEffect(() => {
        const { onAppEvent } = require("../services/appEvents");
        const unsub = onAppEvent("CALL_LOG_SYNCED", () => {
            loadLogs({ force: true, showSpinner: false });
        });
        return () => {
            if (typeof unsub === "function") unsub();
        };
    }, [loadLogs]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await loadLogs({ force: true, showSpinner: false });
        } finally {
            setRefreshing(false);
        }
    }, [loadLogs]);

    const counts = useMemo(() => {
        return logs.reduce(
            (acc, item) => {
                const type = String(item?.callType || "").toLowerCase();
                if (type.includes("miss")) acc.Missed += 1;
                else if (type.includes("incoming")) acc.Incoming += 1;
                else if (type.includes("outgoing")) acc.Outgoing += 1;
                return acc;
            },
            { Missed: 0, Incoming: 0, Outgoing: 0 },
        );
    }, [logs]);

    const visibleLogs = useMemo(() => {
        if (typeFilter === "All") return logs;
        return logs.filter(
            (item) =>
                String(item?.callType || "").toLowerCase() ===
                typeFilter.toLowerCase(),
        );
    }, [logs, typeFilter]);

    return (
        <View style={{ flex: 1 }}>
            <View style={DV.panelHero}>
                <View style={{ flex: 1 }}>
                    <Text style={DV.panelEyebrow}>Contact Call History</Text>
                    <Text style={DV.panelTitle}>{enquiry?.name || "Lead"}</Text>
                    <Text style={DV.panelSub}>
                        {enquiry?.mobile || "No number available"}
                    </Text>
                </View>
                <TouchableOpacity
                    style={DV.callPrimaryBtn}
                    onPress={onCallPress}
                    activeOpacity={0.86}>
                    <Ionicons name="call" size={16} color="#fff" />
                    <Text style={DV.callPrimaryText}>Call</Text>
                </TouchableOpacity>
            </View>

            <View style={DV.filterRow}>
                {["All", "Missed", "Incoming", "Outgoing"].map((label) => {
                    const active = typeFilter === label;
                    const count =
                        label === "All" ? logs.length : counts[label] || 0;
                    return (
                        <TouchableOpacity
                            key={label}
                            onPress={() => setTypeFilter(label)}
                            style={[
                                DV.filterChip,
                                active && DV.filterChipActive,
                            ]}
                            activeOpacity={0.86}>
                            <Text
                                style={[
                                    DV.filterChipText,
                                    active && DV.filterChipTextActive,
                                ]}>
                                {label}
                            </Text>
                            <View
                                style={[
                                    DV.filterCount,
                                    active && DV.filterCountActive,
                                ]}>
                                <Text
                                    style={[
                                        DV.filterCountText,
                                        active && DV.filterCountTextActive,
                                    ]}>
                                    {count}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <View style={DV.emptyWrap}>
                    <ActivityIndicator color={C.primary} />
                </View>
            ) : visibleLogs.length === 0 ? (
                <View style={DV.emptyWrap}>
                    <View style={DV.emptyIcon}>
                        <Ionicons
                            name="call-outline"
                            size={24}
                            color={C.textLight}
                        />
                    </View>
                    <Text style={DV.emptyText}>
                        No call records for this contact
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={visibleLogs}
                    keyExtractor={(item, index) =>
                        String(
                            item?._id ||
                                `${item?.phoneNumber || "call"}-${item?.callTime || index}`,
                        )
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor={C.primary}
                            colors={[C.primary, C.teal, C.info]}
                        />
                    }
                    contentContainerStyle={{
                        paddingHorizontal: 14,
                        paddingBottom: 24,
                        gap: 10,
                    }}
                    renderItem={({ item }) => {
                        const type = String(item?.callType || "Call");
                        const icon =
                            type === "Missed"
                                ? "close-circle-outline"
                                : type === "Incoming"
                                  ? "arrow-down-circle-outline"
                                  : "arrow-up-circle-outline";
                        const color =
                            type === "Missed"
                                ? C.danger
                                : type === "Incoming"
                                  ? C.info
                                  : C.success;
                        return (
                            <View style={DV.callRowCard}>
                                <View
                                    style={[
                                        DV.callIconWrap,
                                        { backgroundColor: `${color}18` },
                                    ]}>
                                    <Ionicons
                                        name={icon}
                                        size={18}
                                        color={color}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={DV.callRowTop}>
                                        <Text style={DV.callTypeText}>
                                            {type}
                                        </Text>
                                        <Text style={DV.callTimeText}>
                                            {formatShortDateTime(
                                                item?.callTime,
                                            )}
                                        </Text>
                                    </View>
                                    <Text style={DV.callMetaText}>
                                        {item?.callDuration
                                            ? `Duration: ${formatCallDuration(item.callDuration)}`
                                            : item?.callType === "missed" ||
                                                item?.callType === "rejected"
                                              ? "Not answered"
                                              : "0s"}
                                    </Text>
                                    {!!item?.note && (
                                        <Text
                                            style={DV.callNoteText}
                                            numberOfLines={2}>
                                            {item.note}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        );
                    }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

function FollowUpEmailPanel({ enquiry, refreshKey = 0 }) {
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState(
        enquiry?.name ? `Hello ${enquiry.name},\n\n` : "",
    );
    const [templates, setTemplates] = useState([]);
    const [showComposer, setShowComposer] = useState(false);
    const [subjectSelection, setSubjectSelection] = useState({
        start: 0,
        end: 0,
    });
    const [templateMatch, setTemplateMatch] = useState(null);
    const [sending, setSending] = useState(false);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const templateOptions = useMemo(() => {
        if (!templateMatch) return [];
        const query = String(templateMatch.query || "").toLowerCase();
        return (templates || [])
            .filter((item) => {
                const haystack =
                    `${item?.name || ""} ${item?.subject || ""} ${item?.body || ""}`.toLowerCase();
                return !query || haystack.includes(query);
            })
            .slice(0, 6);
    }, [templateMatch, templates]);

    useEffect(() => {
        setMessage(enquiry?.name ? `Hello ${enquiry.name},\n\n` : "");
        setSubject("");
        setTemplateMatch(null);
        setShowComposer(false);
    }, [enquiry?._id, enquiry?.name]);

    useEffect(() => {
        let active = true;
        const loadTemplates = async () => {
            try {
                const result = await emailService.getEmailTemplates({
                    force: Boolean(refreshKey),
                });
                if (!active) return;
                const items = Array.isArray(result?.templates)
                    ? result.templates
                    : Array.isArray(result?.data)
                      ? result.data
                      : [];
                setTemplates(items);
            } catch (_error) {
                if (active) setTemplates([]);
            }
        };
        loadTemplates();
        return () => {
            active = false;
        };
    }, [refreshKey]);

    useEffect(() => {
        let active = true;

        const loadLogs = async () => {
            if (!enquiry?.email && !enquiry?._id) {
                if (active) {
                    setLogs([]);
                    setLoadingLogs(false);
                }
                return;
            }

            setLoadingLogs(true);
            try {
                const result = await emailService.getEmailLogs(
                    {
                        page: 1,
                        limit: 50,
                    },
                    { force: Boolean(refreshKey) },
                );
                if (!active) return;
                const items = Array.isArray(result?.logs)
                    ? result.logs
                    : Array.isArray(result?.data)
                      ? result.data
                      : [];
                const filtered = items.filter((item) => {
                    const sameEnquiry =
                        enquiry?._id && item?.enquiryId
                            ? String(item.enquiryId) === String(enquiry._id)
                            : false;
                    const sameEmail =
                        enquiry?.email && item?.to
                            ? String(item.to).toLowerCase() ===
                              String(enquiry.email).toLowerCase()
                            : false;
                    return sameEnquiry || sameEmail;
                });
                filtered.sort(
                    (a, b) =>
                        new Date(b?.createdAt || b?.sentAt || 0) -
                        new Date(a?.createdAt || a?.sentAt || 0),
                );
                setLogs(filtered.slice(0, 10));
            } catch (_error) {
                if (active) setLogs([]);
            } finally {
                if (active) setLoadingLogs(false);
            }
        };

        loadLogs();
        return () => {
            active = false;
        };
    }, [enquiry?._id, enquiry?.email, refreshKey]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const [tmpl, result] = await Promise.all([
                emailService.getEmailTemplates({ force: true }),
                emailService.getEmailLogs(
                    { page: 1, limit: 50 },
                    { force: true },
                ),
            ]);
            const items = Array.isArray(tmpl?.templates)
                ? tmpl.templates
                : Array.isArray(tmpl?.data)
                  ? tmpl.data
                  : [];
            setTemplates(items);

            const logsItems = Array.isArray(result?.logs)
                ? result.logs
                : Array.isArray(result?.data)
                  ? result.data
                  : [];
            const filtered = logsItems.filter((item) => {
                const sameEnquiry =
                    enquiry?._id && item?.enquiryId
                        ? String(item.enquiryId) === String(enquiry._id)
                        : false;
                const sameEmail =
                    enquiry?.email && item?.to
                        ? String(item.to).toLowerCase() ===
                          String(enquiry.email).toLowerCase()
                        : false;
                return sameEnquiry || sameEmail;
            });
            filtered.sort(
                (a, b) =>
                    new Date(b?.createdAt || b?.sentAt || 0) -
                    new Date(a?.createdAt || a?.sentAt || 0),
            );
            setLogs(filtered.slice(0, 10));
        } catch (_error) {
            // ignore refresh errors
        } finally {
            setRefreshing(false);
        }
    }, [enquiry?._id, enquiry?.email]);

    const getTemplateMentionMatch = useCallback((text, cursor) => {
        const cur = Math.max(0, Number(cursor || 0));
        const before = String(text || "").slice(0, cur);
        const match = before.match(/@([a-zA-Z0-9_-]*)$/);
        if (!match) return null;
        return {
            query: String(match[1] || "").toLowerCase(),
            start: cur - match[0].length,
            end: cur,
        };
    }, []);

    const applyTemplateToComposer = useCallback((template) => {
        if (!template) return;
        setSubject(template.subject || template.name || "");
        setMessage(template.body || "");
        setTemplateMatch(null);
        setShowComposer(true);
    }, []);

    const onSubjectChange = useCallback(
        (nextText) => {
            setSubject(nextText);
            setTemplateMatch(
                getTemplateMentionMatch(
                    nextText,
                    subjectSelection?.start ?? nextText.length,
                ),
            );
        },
        [getTemplateMentionMatch, subjectSelection?.start],
    );

    const onSubjectSelectionChange = useCallback(
        (event) => {
            const nextSelection = event?.nativeEvent?.selection;
            if (!nextSelection) return;
            setSubjectSelection(nextSelection);
            setTemplateMatch(
                getTemplateMentionMatch(subject, nextSelection.start),
            );
        },
        [getTemplateMentionMatch, subject],
    );

    const handleSend = async () => {
        if (!enquiry?.email) {
            Alert.alert(
                "Missing email",
                "This enquiry does not have an email address.",
            );
            return;
        }
        if (!subject.trim()) {
            Alert.alert("Required", "Enter email subject.");
            return;
        }
        if (!message.trim()) {
            Alert.alert("Required", "Enter email message.");
            return;
        }

        setSending(true);
        try {
            await emailService.sendEmail({
                to: enquiry.email,
                subject: subject.trim(),
                message: message.trim(),
                enquiryId: enquiry?._id,
            });
            Alert.alert("Sent", "Email sent successfully.");
            setSubject("");
            setMessage(enquiry?.name ? `Hello ${enquiry.name},\n\n` : "");
            setLoadingLogs(true);
            const result = await emailService.getEmailLogs(
                { page: 1, limit: 20 },
                { force: true },
            );
            const items = Array.isArray(result?.logs)
                ? result.logs
                : Array.isArray(result?.data)
                  ? result.data
                  : [];
            const filtered = items.filter((item) => {
                const sameEnquiry =
                    enquiry?._id && item?.enquiryId
                        ? String(item.enquiryId) === String(enquiry._id)
                        : false;
                const sameEmail =
                    enquiry?.email && item?.to
                        ? String(item.to).toLowerCase() ===
                          String(enquiry.email).toLowerCase()
                        : false;
                return sameEnquiry || sameEmail;
            });
            filtered.sort(
                (a, b) =>
                    new Date(b?.createdAt || b?.sentAt || 0) -
                    new Date(a?.createdAt || a?.sentAt || 0),
            );
            setLogs(filtered.slice(0, 10));
        } catch (error) {
            Alert.alert(
                "Error",
                error?.response?.data?.message || "Could not send email.",
            );
        } finally {
            setSending(false);
            setLoadingLogs(false);
        }
    };

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: 28, gap: 12 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={C.primary}
                    colors={[C.primary, C.teal, C.info]}
                />
            }
            showsVerticalScrollIndicator={false}>
            <View style={DV.emailHero}>
                <View style={DV.emailHeroIcon}>
                    <Ionicons name="mail-outline" size={20} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={DV.panelTitle}>Email</Text>
                    <Text style={DV.panelSub}>
                        {enquiry?.email || "No email address available"}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={() => setShowComposer((prev) => !prev)}
                    activeOpacity={0.88}
                    style={DV.emailToggleBtn}>
                    <Ionicons
                        name={showComposer ? "chevron-up" : "add"}
                        size={16}
                        color="#fff"
                    />
                    <Text style={DV.emailToggleText}>
                        {showComposer ? "Close Form" : "Add Email"}
                    </Text>
                </TouchableOpacity>
            </View>

            {showComposer ? (
                <View style={DV.emailCard}>
                    <Text style={DV.emailLabel}>To</Text>
                    <Text style={DV.emailValue}>{enquiry?.email || "-"}</Text>

                    <Text style={DV.emailLabel}>Subject</Text>
                    <TextInput
                        value={subject}
                        onChangeText={onSubjectChange}
                        onSelectionChange={onSubjectSelectionChange}
                        selection={subjectSelection}
                        placeholder="Type subject or @template"
                        placeholderTextColor={C.textLight}
                        style={DV.emailInput}
                    />

                    {templateMatch && templateOptions.length > 0 ? (
                        <View style={DV.emailTemplateBox}>
                            <Text style={DV.emailTemplateTitle}>Templates</Text>
                            <ScrollView
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                                style={DV.emailTemplateScroll}
                                contentContainerStyle={{ gap: 8 }}>
                                {templateOptions.map((item, index) => (
                                    <TouchableOpacity
                                        key={String(
                                            item?._id
                                                ? `${item._id}-${item?.name || "template"}-${index}`
                                                : `${item?.name || "template"}-${index}`,
                                        )}
                                        onPress={() =>
                                            applyTemplateToComposer(item)
                                        }
                                        activeOpacity={0.8}
                                        style={DV.emailTemplateRow}>
                                        <View style={DV.emailTemplateBadge}>
                                            <Ionicons
                                                name="sparkles-outline"
                                                size={12}
                                                color={C.primary}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={DV.emailTemplateName}
                                                numberOfLines={1}>
                                                {item?.name || "Template"}
                                            </Text>
                                            <Text
                                                style={DV.emailTemplateSub}
                                                numberOfLines={1}>
                                                {item?.subject || "No subject"}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    ) : null}

                    <Text style={DV.emailHint}>
                        Type `@` in subject to pick a template quickly.
                    </Text>

                    <Text style={DV.emailLabel}>Message</Text>
                    <TextInput
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Write your message"
                        placeholderTextColor={C.textLight}
                        multiline
                        textAlignVertical="top"
                        style={DV.emailTextArea}
                    />

                    <TouchableOpacity
                        onPress={handleSend}
                        activeOpacity={0.88}
                        disabled={sending || !enquiry?.email}
                        style={[
                            DV.emailSendBtn,
                            (!enquiry?.email || sending) && { opacity: 0.7 },
                        ]}>
                        {sending ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <Ionicons name="send" size={16} color="#fff" />
                                <Text style={DV.emailSendText}>Send Email</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            ) : null}

            <View style={DV.emailLogsCard}>
                <View style={DV.emailSectionHead}>
                    <Text style={DV.emailSectionTitle}>Sent Emails</Text>
                    <Text style={DV.emailSectionMeta}>{logs.length}</Text>
                </View>

                {loadingLogs ? (
                    <View style={{ paddingVertical: 20 }}>
                        <ActivityIndicator color={C.primary} />
                    </View>
                ) : logs.length === 0 ? (
                    <View style={DV.emptyWrap}>
                        <View style={DV.emptyIcon}>
                            <Ionicons
                                name="mail-open-outline"
                                size={24}
                                color={C.textLight}
                            />
                        </View>
                        <Text style={DV.emptyText}>
                            No email history for this enquiry
                        </Text>
                    </View>
                ) : (
                    logs.map((item, index) => (
                        <View
                            key={String(
                                item?._id
                                    ? `${item._id}-${item?.to || "mail"}-${index}`
                                    : `${item?.to || "mail"}-${index}`,
                            )}
                            style={[
                                DV.emailLogRow,
                                index === logs.length - 1 && {
                                    marginBottom: 0,
                                },
                            ]}>
                            <View style={DV.emailLogDot} />
                            <View style={{ flex: 1 }}>
                                <View style={DV.callRowTop}>
                                    <Text
                                        style={DV.callTypeText}
                                        numberOfLines={1}>
                                        {item?.subject || "No subject"}
                                    </Text>
                                    <Text style={DV.callTimeText}>
                                        {formatShortDateTime(
                                            item?.createdAt || item?.sentAt,
                                        )}
                                    </Text>
                                </View>
                                <Text style={DV.callMetaText} numberOfLines={1}>
                                    {item?.to || enquiry?.email || "-"}
                                </Text>
                                {!!item?.message && (
                                    <Text
                                        style={DV.callNoteText}
                                        numberOfLines={2}>
                                        {item.message}
                                    </Text>
                                )}
                            </View>
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toIso = (d) => {
    const dt = d ? new Date(d) : new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const toMonthKey = (value) => {
    const dt = value ? new Date(value) : new Date();
    if (Number.isNaN(dt.getTime())) return "";
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
const getMonthDateRange = (value) => {
    const dt = value ? new Date(value) : new Date();
    if (Number.isNaN(dt.getTime())) return { dateFrom: "", dateTo: "" };
    const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
    const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
    return {
        dateFrom: toIso(start),
        dateTo: toIso(end),
    };
};
const getFollowUpCalendarDate = (item) => {
    const raw =
        item?.nextFollowUpDate ||
        item?.latestFollowUpDate ||
        item?.followUpDate ||
        item?.date ||
        "";
    if (!raw) return "";
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? "" : toIso(dt);
};
const safeLocale = (raw) => {
    if (!raw) return "-";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString();
};
const safeDate = (raw, opts) => {
    if (!raw) return "-";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, opts);
};
const fmtDate = (v) => {
    if (!v) return "Select date";
    const d = new Date(v);
    return isNaN(d.getTime())
        ? v
        : d.toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
          });
};
const fmtMonthYear = (v) => {
    if (!v) return "Select month";
    const d = new Date(v);
    return isNaN(d.getTime())
        ? v
        : d.toLocaleDateString(undefined, {
              month: "short",
              year: "numeric",
          });
};
const getInitials = (n = "") => n.substring(0, 2).toUpperCase() || "NA";
const avatarGrad = (name = "") => {
    const h = name
        ? (name.charCodeAt(0) * 23 + (name.charCodeAt(1) || 0) * 7) % 360
        : 220;
    return [`hsl(${h},65%,52%)`, `hsl(${(h + 30) % 360},70%,42%)`];
};
const statusCfg = (s) => {
    switch (s) {
        case "New":
            return { color: C.info, bg: "#EFF6FF" };
        case "Contacted":
            return { color: C.warning, bg: "#FFFBEB" };
        case "Interested":
            return { color: C.teal, bg: "#F0FDFA" };
        case "Not Interested":
            return { color: C.danger, bg: "#FEF2F2" };
        case "Converted":
            return { color: C.success, bg: "#F0FDF4" };
        case "Closed":
            return { color: C.textLight, bg: C.bg };
        default:
            return { color: C.primary, bg: C.primarySoft };
    }
};
const normalizeStatus = (s) => {
    const r = String(s || "")
        .trim()
        .toLowerCase();
    if (r === "missed") return "Missed";
    if (r === "in progress" || r === "contacted") return "Contacted";
    if (r === "dropped" || r === "drop" || r === "not interested")
        return "Not Interested";
    if (r === "new") return "New";
    if (r === "interested") return "Interested";
    if (r === "converted") return "Converted";
    if (r === "closed") return "Closed";
    return s || "New";
};
const displayStatusLabel = (status) => {
    if (status === "Converted") return "Sales";
    if (status === "Closed") return "Drop";
    return status;
};
const getRecommendedNextStatus = (currentStatus) => {
    const current = normalizeStatus(currentStatus);
    if (current === "New") return "Contacted";
    if (current === "Missed") return "Contacted";
    if (current === "Contacted") return "Interested";
    if (current === "Interested") return "Converted";
    return current;
};
const getForwardStatusOptions = (currentStatus) => {
    const current = normalizeStatus(currentStatus);
    if (current === "New")
        return ["New", "Contacted", "Interested", "Not Interested", "Closed"];
    if (current === "Contacted")
        return [
            "Contacted",
            "Interested",
            "Not Interested",
            "Converted",
            "Closed",
        ];
    if (current === "Interested")
        return ["Interested", "Converted", "Not Interested", "Closed"];
    if (current === "Not Interested") return ["Not Interested", "Closed"];
    if (current === "Converted") return ["Converted"];
    if (current === "Closed") return ["Closed"];
    return [
        "New",
        "Contacted",
        "Interested",
        "Not Interested",
        "Converted",
        "Closed",
    ];
};
const fmtDisplay = (v, fb = "N/A") => {
    if (v == null || v === "") return fb;
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (Array.isArray(v))
        return (
            v
                .map((e) => fmtDisplay(e, ""))
                .filter(Boolean)
                .join(", ") || fb
        );
    if (typeof v === "object")
        return v.name || v.title || v.label || v.value || fb;
    return fb;
};
const isMissed = (item) => {
    if (item?.isVirtualNew) return false;
    const raw =
        item?.nextFollowUpDate ||
        item?.latestFollowUpDate ||
        item?.followUpDate ||
        item?.date ||
        "";
    if (!raw)
        return !["converted", "closed"].includes(
            String(item?.status || "").toLowerCase(),
        );
    const d = new Date(raw);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
};
const formatTime = (d) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const MONGO_OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const isMongoObjectId = (value) =>
    MONGO_OBJECT_ID_REGEX.test(String(value || "").trim());
const getFollowUpDocumentId = (item = {}) => {
    const preferred = [item?.followUpId, item?.followupId, item?.id];
    for (const candidate of preferred) {
        const id = String(candidate || "").trim();
        if (isMongoObjectId(id)) return id;
    }

    const hasFollowUpShape = Boolean(
        item?.activityType ||
        item?.type ||
        item?.remarks ||
        item?.note ||
        item?.time ||
        item?.isCurrent != null,
    );
    const fallbackId = String(item?._id || "").trim();
    if (hasFollowUpShape && isMongoObjectId(fallbackId)) return fallbackId;
    return null;
};
const mapFollowUpItemToEnquiryCard = (item = {}) => {
    const displayStatus = getHistoryEditStatus(item);
    const followUpId = item?._id || item?.id || null;
    return {
        // NOTE: `_id` is used by edit/update actions; keep it as follow-up id when available.
        _id:
            followUpId ||
            item?.enqId ||
            item?.enqNo ||
            `${item?.name || "lead"}-${item?.date || ""}`,
        followUpId: followUpId,
        enqId: item?.enqId || null,
        enqNo: item?.enqNo || "",
        name: item?.name || "Unknown",
        mobile: item?.mobile || "N/A",
        status: displayStatus,
        product: item?.product || "General",
        image: item?.image || null,
        assignedTo:
            item?.assignedTo?.name ||
            item?.assignedTo ||
            item?.staffName ||
            null,
        latestFollowUpDate:
            item?.nextFollowUpDate || item?.followUpDate || item?.date || null,
        nextFollowUpDate: item?.nextFollowUpDate || item?.date || null,
        followUpDate: item?.followUpDate || item?.date || null,
        date: item?.date || null,
        activityTime: item?.activityTime || item?.createdAt || null,
        createdAt: item?.createdAt || null,
        updatedAt: item?.updatedAt || null,
        isCurrent: Boolean(item?.isCurrent),
        source: "",
        address: "",
        requirements: "",
    };
};
const mapEnquiryToFollowUpCard = (item = {}) => ({
    _id: item?._id || item?.enqNo || `new-${item?.name || "lead"}`,
    enqId: item?._id || null,
    enqNo: item?.enqNo || "",
    name: item?.name || "Unknown",
    mobile: item?.mobile || "N/A",
    status: normalizeStatus(
        item?.selectedEnquiryStatus || item?.status || "New",
    ),
    product: item?.product || "General",
    image: item?.image || null,
    assignedTo: item?.assignedTo || null,
    latestFollowUpDate:
        item?.latestFollowUpDate ||
        item?.selectedFollowUpDate ||
        item?.nextFollowUpDate ||
        item?.followUpDate ||
        item?.date ||
        null,
    nextFollowUpDate:
        item?.selectedFollowUpDate ||
        item?.latestFollowUpDate ||
        item?.nextFollowUpDate ||
        item?.followUpDate ||
        item?.date ||
        null,
    followUpDate: item?.followUpDate || item?.selectedFollowUpDate || null,
    date:
        item?.selectedFollowUpDate ||
        item?.date ||
        item?.latestFollowUpDate ||
        null,
    activityTime:
        item?.latestFollowUpAt ||
        item?.enquiryDateTime ||
        item?.createdAt ||
        null,
    createdAt: item?.createdAt || item?.enquiryDateTime || null,
    enquiryDateTime: item?.enquiryDateTime || null,
    lastContactedAt: item?.lastContactedAt || null,
    source: item?.source || "",
    address: item?.address || "",
    requirements: "",
    // FIX #13: isVirtualNew should be false if a follow-up date exists
    isVirtualNew: !(
        item?.selectedFollowUpDate ||
        item?.latestFollowUpDate ||
        item?.nextFollowUpDate ||
        item?.followUpDate ||
        item?.date
    ),
    // UI hint (Today tab): set during fetch when this enquiry has a missed follow-up today.
    hasMissedActivity: false,
});
const getHistoryEditStatus = (item = {}) => {
    const explicit = normalizeStatus(item?.enquiryStatus || item?.status || "");
    if (
        [
            "New",
            "Contacted",
            "Interested",
            "Not Interested",
            "Missed",
            "Converted",
            "Closed",
        ].includes(explicit)
    ) {
        return explicit;
    }
    const nextAction = String(item?.nextAction || "")
        .trim()
        .toLowerCase();
    if (nextAction === "sales") return "Converted";
    if (nextAction === "drop") return "Not Interested";
    if (explicit === "Completed") return "Converted";
    return "Contacted";
};
const getHistorySortTs = (item = {}) =>
    toTs(
        item?.updatedAt ||
            item?.createdAt ||
            item?.nextFollowUpDate ||
            item?.followUpDate ||
            item?.date ||
            item?.enquiryDateTime,
    );
const getFallbackEnquiryStatusFromHistory = (items = []) => {
    if (!Array.isArray(items) || items.length === 0) return "Contacted";
    const latest = [...items].sort(
        (a, b) => getHistorySortTs(b) - getHistorySortTs(a),
    )[0];
    const status = getHistoryEditStatus(latest);
    if (
        [
            "New",
            "Contacted",
            "Interested",
            "Not Interested",
            "Converted",
            "Closed",
        ].includes(status)
    ) {
        return status;
    }
    return "Contacted";
};
const getCalendarSummaryBucket = (item = {}) => {
    const status = getHistoryEditStatus(item);

    // Real-time missed: if today + time has already passed, treat as Missed instantly (no refresh needed).
    try {
        const iso = getFollowUpCalendarDate(item);
        const todayIso = toIso(new Date());
        if (
            iso &&
            iso === todayIso &&
            ["New", "Contacted", "Interested"].includes(status)
        ) {
            const timeStr = String(item?.time || "").trim();
            if (timeStr) {
                const m = timeStr.match(
                    /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
                );
                if (m) {
                    let hh = Number(m[1]);
                    const mm = Number(m[2] ?? "0");
                    const meridian = String(m[4] || "").toUpperCase();
                    if (
                        Number.isFinite(hh) &&
                        Number.isFinite(mm) &&
                        mm <= 59
                    ) {
                        if (meridian) {
                            if (hh >= 1 && hh <= 12) {
                                if (meridian === "AM") {
                                    if (hh === 12) hh = 0;
                                } else if (meridian === "PM") {
                                    if (hh !== 12) hh += 12;
                                }
                            }
                        }
                        const now = new Date();
                        const nowMinutes =
                            now.getHours() * 60 + now.getMinutes();
                        const dueMinutes = hh * 60 + mm;
                        if (dueMinutes <= nowMinutes) return "missed";
                    }
                }
            }
        }
    } catch {}

    if (status === "Missed") return "missed";
    if (["New", "Contacted", "Interested"].includes(status)) return "followup";
    if (status === "Converted") return "sales";
    if (status === "Closed") return "drop";
    if (status === "Not Interested") return "notInterested";
    return "followup";
};
const toTs = (value) => {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
};
const dedupeByLatestActivity = (items = []) => {
    const getEffectiveTs = (entry) => {
        const activityTs = Math.max(
            toTs(entry?.activityTime),
            toTs(entry?.updatedAt),
            toTs(entry?.createdAt),
            toTs(entry?.enquiryDateTime),
            toTs(entry?.lastContactedAt),
        );
        if (activityTs > 0) return activityTs;
        return Math.max(
            toTs(entry?.nextFollowUpDate),
            toTs(entry?.latestFollowUpDate),
            toTs(entry?.followUpDate),
            toTs(entry?.date),
        );
    };
    const latestByKey = new Map();
    for (const item of items) {
        const key = String(item?.enqId || item?.enqNo || item?._id || "");
        if (!key) continue;
        const prev = latestByKey.get(key);
        const itemCurrentRank = item?.isCurrent ? 1 : 0;
        const prevCurrentRank = prev?.isCurrent ? 1 : 0;
        const itemTs = getEffectiveTs(item);
        const prevTs = prev ? getEffectiveTs(prev) : -1;
        const shouldReplace =
            !prev ||
            itemCurrentRank > prevCurrentRank ||
            (itemCurrentRank === prevCurrentRank && itemTs >= prevTs);
        if (shouldReplace) {
            latestByKey.set(key, item);
        }
    }
    return Array.from(latestByKey.values());
};
const mergeUniqueFollowUpCards = (prevItems = [], nextItems = []) =>
    dedupeByLatestActivity([...(prevItems || []), ...(nextItems || [])]);

const getTabUniqueCount = async (
    tab,
    referenceDate = "",
    {
        followUpParams = {},
        includeNewEnquiries = false,
        enquiryParams = {},
        useEnquirySource = false,
        allowedStatuses = [],
    } = {},
) => {
    try {
        if (useEnquirySource) {
            // FIX #2,#6: Fetch only 50 items for counting instead of 500
            const enquiryResponse = await enquiryService.getAllEnquiries(
                1,
                50,
                "",
                "",
                "",
                referenceDate,
            );
            const enquiryItems = Array.isArray(enquiryResponse?.data)
                ? enquiryResponse.data
                : Array.isArray(enquiryResponse)
                  ? enquiryResponse
                  : [];
            const allowedStatusSet = new Set(
                allowedStatuses.map((status) => normalizeStatus(status)),
            );
            // FIX #3,#6: Single-pass counting without expensive dedup
            let count = 0;
            const seen = new Set();
            for (const item of enquiryItems) {
                const key = item?._id || item?.id;
                if (key && seen.has(key)) continue;
                if (key) seen.add(key);

                const mapped = mapEnquiryToFollowUpCard(item);
                if (
                    allowedStatusSet.size === 0 ||
                    allowedStatusSet.has(normalizeStatus(mapped?.status))
                ) {
                    count++;
                }
            }
            return count;
        }
        // FIX #2,#6: Fetch only 50 items for counting instead of 500
        const response = await followupService.getFollowUps(
            tab,
            1,
            50,
            referenceDate,
            followUpParams,
        );
        const rawItems = Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response)
              ? response
              : [];
        // FIX #3: Just count without dedup for performance
        let count = rawItems.length;

        if (tab === "All" && includeNewEnquiries) {
            try {
                const enquiryResponse = await enquiryService.getAllEnquiries(
                    1,
                    200,
                    "",
                    "",
                    "",
                    "",
                    enquiryParams,
                );
                const enquiryItems = Array.isArray(enquiryResponse?.data)
                    ? enquiryResponse.data
                    : Array.isArray(enquiryResponse)
                      ? enquiryResponse
                      : [];
                const followupKeys = new Set(
                    rawItems
                        .map((item) =>
                            String(
                                item?.enqId ||
                                    item?.enquiryId ||
                                    item?.enqNo ||
                                    item?._id ||
                                    "",
                            ).trim(),
                        )
                        .filter(Boolean),
                );
                const enquiryBackfillCount = enquiryItems
                    .map(mapEnquiryToFollowUpCard)
                    .filter((item) =>
                        [
                            "New",
                            "Contacted",
                            "Interested",
                            "Converted",
                        ].includes(normalizeStatus(item?.status)),
                    )
                    .filter((item) => {
                        const key = String(
                            item?.enqId || item?.enqNo || item?._id || "",
                        ).trim();
                        return key && !followupKeys.has(key);
                    }).length;
                count = followupKeys.size + enquiryBackfillCount;
            } catch (_error) {
                // Keep follow-up counts working even if enquiry lookup fails
            }
        }
        return count;
    } catch (error) {
        console.error(
            `[FollowUpScreen] Error getting count for tab ${tab}:`,
            error?.message,
        );
        return 0;
    }
};

// ─── FollowUp List Card (left-swipe → details) ────────────────────────────────
const FUCard = React.memo(function FUCard({ item, index, onSwipe, sc }) {
    const tx = useRef(new Animated.Value(0)).current;
    const norm = normalizeStatus(item?.status);
    const sCfg = statusCfg(norm);
    const cols = avatarGrad(item?.name);
    const missedAlert = Boolean(item?.hasMissedActivity);
    const overdueAlert = isMissed(item);

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dx) > 3 && Math.abs(g.dy) < 15 && g.dx < 0,
            onPanResponderGrant: () => tx.setValue(0),
            onPanResponderMove: (_, g) => {
                if (g.dx < 0) tx.setValue(g.dx);
            },
            onPanResponderRelease: (_, g) => {
                if (g.dx < -18) {
                    Animated.timing(tx, {
                        toValue: -36,
                        duration: 60,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: USE_NATIVE_DRIVER,
                    }).start(() => {
                        Animated.spring(tx, {
                            toValue: 0,
                            useNativeDriver: USE_NATIVE_DRIVER,
                            tension: 110,
                            friction: 9,
                        }).start(() => {
                            onSwipe?.(item);
                        });
                    });
                } else {
                    Animated.spring(tx, {
                        toValue: 0,
                        useNativeDriver: USE_NATIVE_DRIVER,
                        tension: 80,
                        friction: 10,
                    }).start();
                }
            },
        }),
    ).current;

    return (
        <Animated.View
            style={{
                transform: [{ translateX: tx }],
                marginBottom: sc.sp.sm,
                // Avoid animated opacity here (can cause Android text/card blur artifacts)
                // and keep rendering on the GPU to reduce "lines" while scrolling.
                renderToHardwareTextureAndroid: true,
                needsOffscreenAlphaCompositing: true,
            }}
            {...pan.panHandlers}>
            <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => onSwipe?.(item)}>
                <View style={[FCS.shadowWrap, { borderRadius: sc.cardR }]}>
                    <View
                        style={[
                            FCS.card,
                            {
                                borderRadius: sc.cardR,
                                backgroundColor:
                                    missedAlert || overdueAlert
                                        ? "#FFF7ED"
                                        : C.card,
                            },
                        ]}>
                        <View
                            style={[
                                FCS.stripe,
                                {
                                    backgroundColor: missedAlert
                                        ? C.danger
                                        : overdueAlert
                                          ? C.danger
                                          : sCfg.color,
                                    borderTopLeftRadius: sc.cardR,
                                    borderBottomLeftRadius: sc.cardR,
                                },
                            ]}
                        />
                        <View
                            style={{
                                paddingLeft: 16,
                                paddingRight: 12,
                                paddingTop: 11,
                                paddingBottom: 9,
                            }}>
                            {/* Top row */}
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "flex-start",
                                    marginBottom: sc.sp.sm,
                                }}>
                                <View
                                    style={[
                                        FCS.avatar,
                                        { borderRadius: sc.radius },
                                    ]}>
                                    {item.image ? (
                                        <Image
                                            source={{
                                                uri: getImageUrl(item.image),
                                            }}
                                            style={[
                                                FCS.avatarImg,
                                                { borderRadius: sc.radius },
                                            ]}
                                        />
                                    ) : (
                                        <LinearGradient
                                            colors={cols}
                                            style={[
                                                FCS.avatarGrad,
                                                { borderRadius: sc.radius },
                                            ]}>
                                            <Text
                                                style={{
                                                    color: "#fff",
                                                    fontSize: sc.f.md,
                                                    fontWeight: "800",
                                                }}>
                                                {getInitials(item.name)}
                                            </Text>
                                        </LinearGradient>
                                    )}
                                    <View
                                        style={[
                                            FCS.avatarDot,
                                            { backgroundColor: sCfg.color },
                                        ]}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            marginBottom: 3,
                                        }}>
                                        <Text
                                            style={[
                                                FCS.name,
                                                { fontSize: sc.f.md },
                                            ]}
                                            numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <View
                                            style={[
                                                FCS.statusPill,
                                                { backgroundColor: sCfg.bg },
                                            ]}>
                                            <View
                                                style={[
                                                    FCS.statusDot,
                                                    {
                                                        backgroundColor:
                                                            sCfg.color,
                                                    },
                                                ]}
                                            />
                                            <Text
                                                style={[
                                                    FCS.statusText,
                                                    {
                                                        color: sCfg.color,
                                                        fontSize: sc.f.xs,
                                                    },
                                                ]}>
                                                {norm === "Contacted"
                                                    ? "Connected"
                                                    : displayStatusLabel(norm)}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text
                                        style={[
                                            FCS.mobile,
                                            { fontSize: sc.f.sm },
                                        ]}>
                                        {item.mobile}
                                    </Text>
                                </View>
                            </View>
                            {/* Product + date */}
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    paddingTop: sc.sp.xs,
                                    borderTopWidth: 1,
                                    borderTopColor: C.divider,
                                    marginBottom: sc.sp.xs,
                                }}>
                                <View
                                    style={[
                                        FCS.productTag,
                                        { borderRadius: sc.sp.sm },
                                    ]}>
                                    <Ionicons
                                        name="briefcase-outline"
                                        size={sc.f.xs}
                                        color={C.primary}
                                    />
                                    <Text
                                        style={[
                                            FCS.productText,
                                            { fontSize: sc.f.xs },
                                        ]}
                                        numberOfLines={1}>
                                        {item.product || "General"}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        FCS.dateBadge,
                                        {
                                            backgroundColor: sCfg.bg,
                                            borderRadius: sc.sp.sm,
                                        },
                                    ]}>
                                    <Ionicons
                                        name="time-outline"
                                        size={sc.f.xs}
                                        color={sCfg.color}
                                    />
                                    <Text
                                        style={[
                                            FCS.dateText,
                                            {
                                                color: sCfg.color,
                                                fontSize: sc.f.xs,
                                            },
                                        ]}>
                                        {item.nextFollowUpDate ||
                                            item.latestFollowUpDate ||
                                            (item.isVirtualNew
                                                ? "No follow-up yet"
                                                : safeDate(
                                                      item.lastContactedAt ||
                                                          item.enquiryDateTime ||
                                                          item.createdAt,
                                                      {
                                                          month: "short",
                                                          day: "numeric",
                                                      },
                                                  ))}
                                    </Text>
                                </View>
                                {(missedAlert || overdueAlert) && (
                                    <View
                                        style={{
                                            backgroundColor: C.danger + "20",
                                            paddingHorizontal: 6,
                                            paddingVertical: 3,
                                            borderRadius: sc.sp.xs,
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 3,
                                        }}>
                                        <Ionicons
                                            name="alert-circle-outline"
                                            size={sc.f.xs}
                                            color={C.danger}
                                        />
                                        <Text
                                            style={{
                                                fontSize: sc.f.xs,
                                                fontWeight: "700",
                                                color: C.danger,
                                                textTransform: "uppercase",
                                                letterSpacing: 0.2,
                                            }}>
                                            {missedAlert ? "Missed" : "Overdue"}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            {/* Footer */}
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: sc.sp.xs,
                                    }}>
                                    <Ionicons
                                        name="person-outline"
                                        size={sc.f.xs}
                                        color={C.textMuted}
                                    />
                                    <Text
                                        style={{
                                            fontSize: sc.f.xs,
                                            color: C.textMuted,
                                            fontWeight: "500",
                                        }}
                                        numberOfLines={1}>
                                        {fmtDisplay(
                                            item.assignedTo,
                                            "Unassigned",
                                        )}
                                    </Text>
                                    {item.enqNo && (
                                        <View style={FCS.enqBadge}>
                                            <Text
                                                style={{
                                                    fontSize: sc.f.xs - 1,
                                                    color: C.primary,
                                                    fontWeight: "800",
                                                }}>
                                                #{item.enqNo}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 3,
                                        opacity: 0.55,
                                    }}>
                                    <Text
                                        style={{
                                            fontSize: sc.f.xs,
                                            color: C.textLight,
                                            fontWeight: "600",
                                        }}>
                                        Swipe left
                                    </Text>
                                    <Ionicons
                                        name="chevron-back"
                                        size={sc.f.sm}
                                        color={C.textLight}
                                    />
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
});

const FCS = StyleSheet.create({
    shadowWrap: {
        backgroundColor: C.card,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 3,
    },
    card: {
        backgroundColor: C.card,
        overflow: "hidden",
    },
    stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
    avatar: { width: 44, height: 44, marginRight: 10, flexShrink: 0 },
    avatarImg: { width: "100%", height: "100%" },
    avatarGrad: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
    },
    avatarDot: {
        position: "absolute",
        bottom: 1,
        right: 1,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: C.card,
    },
    name: { fontWeight: "700", color: C.text, flex: 1, letterSpacing: -0.2 },
    mobile: { color: C.textMuted, fontWeight: "500" },
    statusPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 99,
    },
    statusDot: { width: 5, height: 5, borderRadius: 3 },
    statusText: {
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.2,
    },
    productTag: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.primarySoft,
        paddingHorizontal: 8,
        paddingVertical: 4,
        flex: 1,
        marginRight: 8,
    },
    productText: { color: C.primaryDark, fontWeight: "700", flex: 1 },
    dateBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    dateText: { fontWeight: "700" },
    enqBadge: {
        backgroundColor: C.primarySoft,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: C.primaryMid,
    },
});

// ─── Detail View — full screen, tab-per-page swipe ────────────────────────────
const DetailView = ({
    enquiry,
    history,
    historyLoading,
    onClose,
    onDeleteEnquiry,
    deletingEnquiry,
    autoOpenFollowUpFormToken,
    // composer state
    selectedEnquiry,
    editRemarks,
    setEditRemarks,
    editActivityType,
    setEditActivityType,
    editStatus,
    setEditStatus,
    editNextDate,
    editNextTime,
    setEditNextTime,
    editAmount,
    setEditAmount,
    editFollowUpId,
    isSavingEdit,
    showDatePicker,
    setTimePickerValue,
    setTimePickerVisible,
    isTimePickerVisible,
    handleConfirmTime,
    setEditTimeMeridian,
    timePickerValue,
    onSaveFollowUp,
    onEditScheduledFollowUp,
    onCancelScheduledEdit,
    onStartCall,
    sc,
    currentStatus,
    billingInfo,
    showUpgradePrompt,
    activeTab = "Today",
    setFollowUps,
    lastFetch,
    onRefreshList,
    refreshDetailHistory,
    refreshDetailEnquiry,
    handlePullToRefresh,
}) => {
    const insets = useSafeAreaInsets();
    const { width: SW, height: SH } = useWindowDimensions();

    // Slide in from right on mount
    const mountX = useRef(new Animated.Value(SW)).current;
    const [tabIdx, setTabIdx] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
    const [showFollowUpForm, setShowFollowUpForm] = useState(false);
    const [deletingFollowUpId, setDeletingFollowUpId] = useState(null);
    const tabRef = useRef(0);
    const tabGestureLockedRef = useRef(false);
    const followUpFormScrollRef = useRef(null);

    const norm = normalizeStatus(enquiry?.status);
    const sCfg = statusCfg(norm);
    const cols = avatarGrad(enquiry?.name);
    const statusOptions = useMemo(
        () => [
            "New",
            "Contacted",
            "Interested",
            "Not Interested",
            "Converted",
            "Closed",
        ],
        [],
    );
    const isSalesEnquiry =
        normalizeStatus(selectedEnquiry?.status || enquiry?.status) ===
        "Converted";
    const salesAmount = useMemo(() => {
        const directAmount = Number(enquiry?.cost || 0);
        if (Number.isFinite(directAmount) && directAmount > 0) {
            return directAmount;
        }
        if (!Array.isArray(history)) return 0;
        const salesItem = [...history]
            .sort((a, b) => getHistorySortTs(b) - getHistorySortTs(a))
            .find((item) => getHistoryEditStatus(item) === "Converted");
        if (!salesItem) return 0;
        const amountFromField = Number(salesItem?.amount || 0);
        if (Number.isFinite(amountFromField) && amountFromField > 0) {
            return amountFromField;
        }
        const rawText = String(salesItem?.remarks || salesItem?.note || "");
        const match = rawText.match(
            /sales:\s*[^0-9]*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
        );
        if (!match?.[1]) return 0;
        return Number(match[1].replace(/,/g, "")) || 0;
    }, [enquiry?.cost, history]);
    const timelineRows = useMemo(
        () =>
            [...(Array.isArray(history) ? history : [])].sort(
                (a, b) => getHistorySortTs(a) - getHistorySortTs(b),
            ),
        [history],
    );

    // Mount animation
    useEffect(() => {
        Animated.timing(mountX, {
            toValue: 0,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
    }, []);

    // Auto-open Add Follow-up form (used by notification actions).
    useEffect(() => {
        if (!autoOpenFollowUpFormToken) return;
        tabRef.current = 0;
        setTabIdx(0);
        setShowFollowUpForm(true);
        setTimeout(() => {
            followUpFormScrollRef.current?.scrollTo?.({ y: 0, animated: true });
        }, 80);
    }, [autoOpenFollowUpFormToken]);

    const goClose = () => {
        if (tabGestureLockedRef.current) return;
        tabGestureLockedRef.current = true;
        Animated.timing(mountX, {
            toValue: SW,
            duration: 280,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
        }).start(onClose);
    };

    const goToTab = (idx) => {
        if (idx === tabRef.current || tabGestureLockedRef.current) return;
        const nextTab = DETAIL_TABS[idx];
        const requiredFeature = DETAIL_TAB_FEATURES[nextTab?.key];
        if (
            requiredFeature &&
            !hasPlanFeature(billingInfo?.plan, requiredFeature)
        ) {
            showUpgradePrompt(
                buildFeatureUpgradeMessage(requiredFeature, nextTab?.label),
            );
            return;
        }
        tabGestureLockedRef.current = true;
        tabRef.current = idx;
        setTabIdx(idx);
        setTimeout(
            () => {
                tabGestureLockedRef.current = false;
            },
            idx >= 3 ? 240 : 140,
        );
    };

    useEffect(() => {
        setShowFollowUpForm(false);
    }, [enquiry?._id, enquiry?.enqNo]);
    useEffect(() => {
        if (isSalesEnquiry) setShowFollowUpForm(false);
    }, [isSalesEnquiry]);

    // Swipe between tabs using left swipe only
    const swipePan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onStartShouldSetPanResponderCapture: () => false,
            onMoveShouldSetPanResponder: (_, g) => {
                const cur = tabRef.current;
                if (tabGestureLockedRef.current) return false;
                if (cur >= 2) {
                    const isEdgeStart = g.x0 < 34 || g.x0 > SW - 34;
                    if (!isEdgeStart) return false;
                    if (cur === 2 && g.y0 > SH - 220) return false;
                }
                return (
                    Math.abs(g.dx) > 28 &&
                    Math.abs(g.dx) > Math.abs(g.dy) * 1.35
                );
            },
            onMoveShouldSetPanResponderCapture: (_, g) => {
                const cur = tabRef.current;
                if (cur !== 2 || tabGestureLockedRef.current) return false;
                return Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy);
            },
            onPanResponderRelease: (_, g) => {
                if (tabGestureLockedRef.current) return;
                const cur = tabRef.current;
                if (g.dx < -56 && cur < DETAIL_TABS.length - 1) {
                    goToTab(cur + 1);
                    return;
                }
            },
        }),
    ).current;
    const detailPanHandlers = tabIdx === 1 ? {} : swipePan.panHandlers;
    const whatsappEdgePan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () =>
                tabRef.current === 1 && !tabGestureLockedRef.current,
            onStartShouldSetPanResponderCapture: () =>
                tabRef.current === 1 && !tabGestureLockedRef.current,
            onMoveShouldSetPanResponder: (_, g) => {
                if (tabRef.current !== 1 || tabGestureLockedRef.current)
                    return false;
                return (
                    Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1
                );
            },
            onMoveShouldSetPanResponderCapture: (_, g) => {
                if (tabRef.current !== 1 || tabGestureLockedRef.current)
                    return false;
                return (
                    Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1
                );
            },
            onPanResponderTerminationRequest: () => false,
            onPanResponderRelease: (_, g) => {
                if (tabGestureLockedRef.current || tabRef.current !== 1) return;
                if (g.dx < -56) {
                    goToTab(2);
                    return;
                }
            },
        }),
    ).current;

    // Hardware back
    useEffect(() => {
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            if (tabRef.current > 0) {
                goToTab(tabRef.current - 1);
                return true;
            }
            goClose();
            return true;
        });
        return () => sub.remove();
    }, []);

    if (!enquiry) return null;
    const lastContact = enquiry?.lastContactedAt;

    const getTypeIcon = (t) => {
        const s = (t || "").toLowerCase();
        if (s.includes("call")) return { icon: "call", color: C.success };
        if (s.includes("whatsapp"))
            return { icon: "logo-whatsapp", color: C.whatsapp };
        if (s.includes("email")) return { icon: "mail", color: C.info };
        if (s.includes("meeting")) return { icon: "people", color: C.accent };
        return { icon: "chatbubble-ellipses", color: C.primary };
    };
    const getHistStatus = (status) => {
        const s = (status || "").toLowerCase();
        if (s.includes("sales") || s.includes("converted"))
            return { color: C.success, label: "CONVERTED" };
        if (s.includes("drop") || s.includes("closed"))
            return { color: C.textLight, label: "CLOSED" };
        if (s.includes("not interest"))
            return { color: C.danger, label: "NOT INTERESTED" };
        return {
            color: C.primary,
            label: displayStatusLabel(status)?.toUpperCase() || "FOLLOW-UP",
        };
    };

    return (
        <Animated.View
            style={[DV.root, { transform: [{ translateX: mountX }] }]}>
            <StatusBar barStyle="dark-content" />

            {/* ── Fixed top bar: back + avatar + name + status chips ── */}
            <View
                style={[
                    DV.topBar,
                    { paddingTop: insets.top + 8, paddingBottom: 14 },
                ]}>
                {/* Decorative circles */}
                <View style={DV.deco1} />
                <View style={DV.deco2} />

                {/* Back button */}
                <TouchableOpacity
                    onPress={goClose}
                    style={[DV.backBtn, { top: insets.top + 8 }]}>
                    <Ionicons name="arrow-back" size={18} color={C.textSub} />
                </TouchableOpacity>

                {/* Avatar + name + mobile */}
                <View style={DV.topContent}>
                    <View style={DV.avatarRing}>
                        <View style={DV.avatarOuter}>
                            {enquiry.image ? (
                                <Image
                                    source={{ uri: getImageUrl(enquiry.image) }}
                                    style={DV.avatarImg}
                                />
                            ) : (
                                <LinearGradient
                                    colors={cols}
                                    style={DV.avatarGrad}>
                                    <Text style={DV.avatarText}>
                                        {getInitials(enquiry.name)}
                                    </Text>
                                </LinearGradient>
                            )}
                        </View>
                        <View
                            style={[DV.priDot, { backgroundColor: sCfg.color }]}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={DV.heroName} numberOfLines={1}>
                            {enquiry.name}
                        </Text>
                        <Text style={DV.heroMobile}>{enquiry.mobile}</Text>
                        {/* Chips row */}
                        <View style={DV.chipsRow}>
                            <View
                                style={[DV.chip, { backgroundColor: sCfg.bg }]}>
                                <View
                                    style={[
                                        DV.chipDot,
                                        { backgroundColor: sCfg.color },
                                    ]}
                                />
                                <Text
                                    style={[
                                        DV.chipText,
                                        { color: sCfg.color },
                                    ]}>
                                    {norm === "Contacted"
                                        ? "Connected"
                                        : displayStatusLabel(norm)}
                                </Text>
                            </View>
                            {enquiry.source ? (
                                <View style={DV.chip}>
                                    <Ionicons
                                        name="git-branch-outline"
                                        size={9}
                                        color={C.textMuted}
                                    />
                                    <Text style={DV.chipText}>
                                        {enquiry.source}
                                    </Text>
                                </View>
                            ) : null}
                            {enquiry.product ? (
                                <View style={DV.chip}>
                                    <Ionicons
                                        name="briefcase-outline"
                                        size={9}
                                        color={C.textMuted}
                                    />
                                    <Text style={DV.chipText} numberOfLines={1}>
                                        {enquiry.product}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                </View>
            </View>

            {/* ── Tab bar (horizontal scroll, fixed) ── */}
            <View style={DV.tabBar}>
                {DETAIL_TABS.map((t, i) => (
                    <TouchableOpacity
                        key={t.key}
                        onPress={() => goToTab(i)}
                        style={[
                            DV.tabBtn,
                            tabIdx === i && {
                                backgroundColor: C.primary,
                                borderColor: C.primary,
                            },
                        ]}
                        activeOpacity={0.8}>
                        <Ionicons
                            name={t.icon}
                            size={sc.f.xs}
                            color={tabIdx === i ? "#fff" : C.textMuted}
                        />
                        <Text
                            style={[
                                DV.tabBtnText,
                                tabIdx === i && {
                                    color: "#fff",
                                    fontWeight: "700",
                                },
                            ]}
                            numberOfLines={1}>
                            {t.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Full-screen tab content with slide animation ── */}
            <View style={{ flex: 1, minHeight: 0, position: "relative" }}>
                <View style={{ flex: 1, minHeight: 0 }} {...detailPanHandlers}>
                    {/* ── TAB 0: Details ── */}
                    {false && (
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{
                                padding: 14,
                                paddingBottom: 30,
                            }}
                            showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 8 }}>
                                {[
                                    {
                                        label: "Enquiry No",
                                        value: enquiry.enqNo || "-",
                                        icon: "document-text-outline",
                                    },
                                    {
                                        label: "Product",
                                        value: enquiry.product || "-",
                                        icon: "briefcase-outline",
                                    },
                                    {
                                        label: "Cost",
                                        value: enquiry.cost
                                            ? `₹${enquiry.cost}`
                                            : "-",
                                        icon: "pricetag-outline",
                                    },
                                    {
                                        label: "Email",
                                        value: enquiry.email || "-",
                                        icon: "mail-outline",
                                    },
                                    {
                                        label: "Address",
                                        value: enquiry.address || "-",
                                        icon: "location-outline",
                                    },
                                    {
                                        label: "Assigned To",
                                        value: fmtDisplay(
                                            enquiry.assignedTo,
                                            "-",
                                        ),
                                        icon: "person-circle-outline",
                                    },
                                    {
                                        label: "Status",
                                        value:
                                            displayStatusLabel(
                                                normalizeStatus(enquiry.status),
                                            ) || "-",
                                        icon: "flag-outline",
                                    },
                                    {
                                        label: "Last Contact",
                                        value: safeLocale(lastContact),
                                        icon: "time-outline",
                                    },
                                    {
                                        label: "Created",
                                        value: safeLocale(
                                            enquiry.enquiryDateTime ||
                                                enquiry.createdAt,
                                        ),
                                        icon: "calendar-outline",
                                    },
                                    {
                                        label: "Source",
                                        value: enquiry.source || "-",
                                        icon: "git-branch-outline",
                                    },
                                ].map((row) => (
                                    <View key={row.label} style={DV.detailRow}>
                                        <View style={DV.detailIcon}>
                                            <Ionicons
                                                name={row.icon}
                                                size={13}
                                                color={C.primary}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={DV.detailLabel}>
                                                {row.label}
                                            </Text>
                                            <Text style={DV.detailValue}>
                                                {row.value}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                    )}

                    {/* ── TAB 1: WhatsApp ── */}
                    {tabIdx === 1 && (
                        <View style={{ flex: 1, minHeight: 0 }}>
                            <ChatScreen
                                key={`followup-whatsapp-${enquiry?._id || enquiry?.enqNo || enquiry?.mobile || "chat"}-${panelRefreshNonce}`}
                                embedded
                                manualKeyboardLift={Platform.OS === "android"}
                                route={{ params: { enquiry } }}
                            />
                        </View>
                    )}

                    {/* ── TAB 2: Email ── */}
                    {tabIdx === 2 && (
                        <View style={{ flex: 1 }}>
                            <FollowUpEmailPanel
                                enquiry={enquiry}
                                refreshKey={panelRefreshNonce}
                            />
                        </View>
                    )}

                    {/* ── TAB 3: Contact & Call Logs ── */}
                    {tabIdx === 3 && (
                        <View style={{ flex: 1, minHeight: 0 }}>
                            <CallLogTabs
                                phoneNumber={enquiry?.mobile}
                                enquiry={enquiry}
                            />
                        </View>
                    )}

                    {/* ── TAB 0: Add Follow-up ── */}
                    {tabIdx === 0 && (
                        <KeyboardAvoidingView
                            style={{ flex: 1 }}
                            behavior={
                                Platform.OS === "ios" ? "padding" : "height"
                            }
                            keyboardVerticalOffset={
                                Platform.OS === "ios" ? insets.top + 96 : 24
                            }>
                            <ScrollView
                                ref={followUpFormScrollRef}
                                style={{ flex: 1 }}
                                refreshControl={
                                    <RefreshControl
                                        refreshing={isRefreshing}
                                        onRefresh={handlePullToRefresh}
                                        tintColor={C.primary}
                                        colors={[C.primary, C.teal, C.info]}
                                    />
                                }
                                contentContainerStyle={{
                                    padding: 14,
                                    paddingBottom: Math.max(
                                        insets.bottom + 180,
                                        220,
                                    ),
                                    flexGrow: 1,
                                }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode={
                                    Platform.OS === "ios"
                                        ? "interactive"
                                        : "on-drag"
                                }
                                nestedScrollEnabled>
                                {selectedEnquiry && (
                                    <View style={{ gap: 12 }}>
                                        {isSalesEnquiry && (
                                            <LinearGradient
                                                colors={[
                                                    "#052E16",
                                                    "#047857",
                                                    "#0F766E",
                                                ]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={FU.salesCongratsCard}>
                                                <View
                                                    style={
                                                        FU.salesCongratsHeader
                                                    }>
                                                    <View
                                                        style={
                                                            FU.salesCongratsIconWrap
                                                        }>
                                                        <Ionicons
                                                            name="trophy-outline"
                                                            size={16}
                                                            color="#D1FAE5"
                                                        />
                                                    </View>
                                                    <Text
                                                        style={
                                                            FU.salesCongratsTag
                                                        }>
                                                        SALES ACHIEVED
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={
                                                        FU.salesCongratsTitle
                                                    }>
                                                    Congratulations! Lead moved
                                                    to Sales.
                                                </Text>
                                                <Text
                                                    style={FU.salesCongratsSub}>
                                                    This enquiry is now closed
                                                    for follow-up scheduling.
                                                </Text>
                                                <View
                                                    style={
                                                        FU.salesCongratsStats
                                                    }>
                                                    <Text
                                                        style={
                                                            FU.salesCongratsAmountLabel
                                                        }>
                                                        Conversion Value
                                                    </Text>
                                                    <Text
                                                        style={
                                                            FU.salesCongratsAmount
                                                        }>
                                                        {salesAmount > 0
                                                            ? `₹${salesAmount.toLocaleString("en-IN")}`
                                                            : "Recorded"}
                                                    </Text>
                                                </View>
                                            </LinearGradient>
                                        )}

                                        {!isSalesEnquiry && (
                                            <TouchableOpacity
                                                onPress={() =>
                                                    setShowFollowUpForm(
                                                        (prev) => !prev,
                                                    )
                                                }
                                                style={FU.toggleBtn}
                                                activeOpacity={0.9}>
                                                <View style={FU.toggleBtnIcon}>
                                                    <Ionicons
                                                        name={
                                                            showFollowUpForm
                                                                ? "remove-outline"
                                                                : "add-outline"
                                                        }
                                                        size={18}
                                                        color={C.primary}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text
                                                        style={
                                                            FU.toggleBtnTitle
                                                        }>
                                                        Add Follow-up
                                                    </Text>
                                                    <Text
                                                        style={FU.toggleBtnSub}>
                                                        Tap to{" "}
                                                        {showFollowUpForm
                                                            ? "hide"
                                                            : "open"}{" "}
                                                        the follow-up form
                                                    </Text>
                                                </View>
                                                <Ionicons
                                                    name={
                                                        showFollowUpForm
                                                            ? "chevron-up"
                                                            : "chevron-down"
                                                    }
                                                    size={18}
                                                    color={C.textMuted}
                                                />
                                            </TouchableOpacity>
                                        )}

                                        {!isSalesEnquiry &&
                                            showFollowUpForm && (
                                                <>
                                                    {editFollowUpId && (
                                                        <View
                                                            style={
                                                                FU.editingBanner
                                                            }>
                                                            <Ionicons
                                                                name="create-outline"
                                                                size={15}
                                                                color={
                                                                    C.primary
                                                                }
                                                            />
                                                            <Text
                                                                style={
                                                                    FU.editingBannerText
                                                                }>
                                                                Editing
                                                                scheduled
                                                                follow-up
                                                            </Text>
                                                        </View>
                                                    )}
                                                    <View
                                                        style={FU.sectionCard}>
                                                        <Text
                                                            style={
                                                                FU.sectionTitle
                                                            }>
                                                            Conversation Notes
                                                        </Text>
                                                        <Text
                                                            style={
                                                                FU.sectionSub
                                                            }>
                                                            Capture the latest
                                                            update before
                                                            scheduling the next
                                                            action.
                                                        </Text>
                                                        <Text style={FU.label}>
                                                            Remarks *
                                                        </Text>
                                                        <FloatingInput
                                                            label="Follow-up notes"
                                                            value={editRemarks}
                                                            onChangeText={
                                                                setEditRemarks
                                                            }
                                                            placeholder="Add notes"
                                                            multiline
                                                            minHeight={88}
                                                            scrollEnabled={
                                                                false
                                                            }
                                                        />
                                                    </View>

                                                    <View
                                                        style={FU.sectionCard}>
                                                        <Text
                                                            style={
                                                                FU.sectionTitle
                                                            }>
                                                            Activity Type
                                                        </Text>
                                                        <ScrollView
                                                            horizontal
                                                            showsHorizontalScrollIndicator={
                                                                false
                                                            }
                                                            contentContainerStyle={{
                                                                gap: 8,
                                                                paddingBottom: 4,
                                                            }}>
                                                            {ACTIVITY_OPTIONS.map(
                                                                (a) => {
                                                                    const active =
                                                                        editActivityType ===
                                                                        a;
                                                                    const icon =
                                                                        a ===
                                                                        "Phone Call"
                                                                            ? "call-outline"
                                                                            : a ===
                                                                                "WhatsApp"
                                                                              ? "logo-whatsapp"
                                                                              : a ===
                                                                                  "Email"
                                                                                ? "mail-outline"
                                                                                : "people-outline";
                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={
                                                                                a
                                                                            }
                                                                            onPress={() =>
                                                                                setEditActivityType(
                                                                                    a,
                                                                                )
                                                                            }
                                                                            style={[
                                                                                FU.pill,
                                                                                active && {
                                                                                    borderColor:
                                                                                        C.primaryMid,
                                                                                    backgroundColor:
                                                                                        C.primarySoft,
                                                                                },
                                                                            ]}>
                                                                            <Ionicons
                                                                                name={
                                                                                    icon
                                                                                }
                                                                                size={
                                                                                    14
                                                                                }
                                                                                color={
                                                                                    active
                                                                                        ? C.primary
                                                                                        : C.textMuted
                                                                                }
                                                                            />
                                                                            <Text
                                                                                style={[
                                                                                    FU.pillText,
                                                                                    active && {
                                                                                        color: C.primary,
                                                                                    },
                                                                                ]}>
                                                                                {
                                                                                    a
                                                                                }
                                                                            </Text>
                                                                        </TouchableOpacity>
                                                                    );
                                                                },
                                                            )}
                                                        </ScrollView>
                                                    </View>

                                                    <View
                                                        style={FU.sectionCard}>
                                                        <Text
                                                            style={
                                                                FU.sectionTitle
                                                            }>
                                                            Status & Schedule
                                                        </Text>
                                                        <View
                                                            style={{
                                                                flexDirection:
                                                                    "row",
                                                                flexWrap:
                                                                    "wrap",
                                                                gap: 8,
                                                                marginBottom: 8,
                                                            }}>
                                                            {[
                                                                {
                                                                    id: "New",
                                                                    icon: "sparkles-outline",
                                                                    color: C.info,
                                                                },
                                                                {
                                                                    id: "Contacted",
                                                                    label: "Connected",
                                                                    icon: "call-outline",
                                                                    color: C.warning,
                                                                },
                                                                {
                                                                    id: "Interested",
                                                                    icon: "thumbs-up-outline",
                                                                    color: C.teal,
                                                                },
                                                                {
                                                                    id: "Not Interested",
                                                                    icon: "close-circle-outline",
                                                                    color: C.danger,
                                                                },
                                                                {
                                                                    id: "Converted",
                                                                    label: "Sales",
                                                                    icon: "cash-outline",
                                                                    color: C.success,
                                                                },
                                                                {
                                                                    id: "Closed",
                                                                    label: "Drop",
                                                                    icon: "archive-outline",
                                                                    color: C.textLight,
                                                                },
                                                            ]
                                                                .filter((s) =>
                                                                    statusOptions.includes(
                                                                        s.id,
                                                                    ),
                                                                )
                                                                .map((s) => {
                                                                    const active =
                                                                        editStatus ===
                                                                        s.id;
                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={
                                                                                s.id
                                                                            }
                                                                            onPress={() =>
                                                                                setEditStatus(
                                                                                    s.id,
                                                                                )
                                                                            }
                                                                            style={[
                                                                                FU.statusBtn,
                                                                                active && {
                                                                                    borderColor:
                                                                                        s.color,
                                                                                    backgroundColor:
                                                                                        s.color +
                                                                                        "12",
                                                                                },
                                                                            ]}>
                                                                            <Ionicons
                                                                                name={
                                                                                    s.icon
                                                                                }
                                                                                size={
                                                                                    14
                                                                                }
                                                                                color={
                                                                                    s.color
                                                                                }
                                                                            />
                                                                            <Text
                                                                                style={[
                                                                                    {
                                                                                        fontSize: 12,
                                                                                        fontWeight:
                                                                                            "600",
                                                                                        color: C.textMuted,
                                                                                    },
                                                                                    active && {
                                                                                        color: s.color,
                                                                                        fontWeight:
                                                                                            "700",
                                                                                    },
                                                                                ]}>
                                                                                {s.label ||
                                                                                    s.id}
                                                                            </Text>
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                        </View>

                                                        {[
                                                            "New",
                                                            "Contacted",
                                                            "Interested",
                                                        ].includes(
                                                            editStatus,
                                                        ) && (
                                                            <>
                                                                <Text
                                                                    style={
                                                                        FU.label
                                                                    }>
                                                                    Next Follow
                                                                    Up Date *
                                                                </Text>
                                                                <TouchableOpacity
                                                                    style={
                                                                        FU.datePicker
                                                                    }
                                                                    onPress={() =>
                                                                        showDatePicker(
                                                                            "add",
                                                                        )
                                                                    }>
                                                                    <Ionicons
                                                                        name="calendar-outline"
                                                                        size={
                                                                            18
                                                                        }
                                                                        color={
                                                                            C.primary
                                                                        }
                                                                    />
                                                                    <Text
                                                                        style={[
                                                                            FU.dateText,
                                                                            !editNextDate && {
                                                                                color: C.textLight,
                                                                            },
                                                                        ]}>
                                                                        {editNextDate ||
                                                                            "Select date"}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                                {editNextDate && (
                                                                    <>
                                                                        <Text
                                                                            style={
                                                                                FU.label
                                                                            }>
                                                                            Time
                                                                        </Text>
                                                                        <View
                                                                            style={
                                                                                FU.datePicker
                                                                            }>
                                                                            <Ionicons
                                                                                name="time-outline"
                                                                                size={
                                                                                    18
                                                                                }
                                                                                color={
                                                                                    C.primary
                                                                                }
                                                                            />
                                                                            <Text
                                                                                style={[
                                                                                    FU.dateText,
                                                                                    !editNextTime && {
                                                                                        color: C.textLight,
                                                                                    },
                                                                                ]}>
                                                                                {editNextTime ||
                                                                                    "Auto-selected"}
                                                                            </Text>
                                                                        </View>
                                                                        {isTimePickerVisible &&
                                                                            Platform.OS !==
                                                                                "web" && (
                                                                                <DateTimePicker
                                                                                    value={
                                                                                        timePickerValue
                                                                                    }
                                                                                    mode="time"
                                                                                    is24Hour={
                                                                                        false
                                                                                    }
                                                                                    display="default"
                                                                                    onChange={
                                                                                        handleConfirmTime
                                                                                    }
                                                                                />
                                                                            )}
                                                                    </>
                                                                )}
                                                            </>
                                                        )}
                                                    </View>

                                                    {editStatus ===
                                                        "Converted" && (
                                                        <View
                                                            style={
                                                                FU.sectionCard
                                                            }>
                                                            <Text
                                                                style={
                                                                    FU.label
                                                                }>
                                                                Amount (₹) *
                                                            </Text>
                                                            <FloatingInput
                                                                label="Amount"
                                                                value={
                                                                    editAmount
                                                                }
                                                                onChangeText={
                                                                    setEditAmount
                                                                }
                                                                placeholder="0.00"
                                                                keyboardType="numeric"
                                                                containerStyle={{
                                                                    marginTop: 4,
                                                                }}
                                                                inputStyle={{
                                                                    minHeight: 46,
                                                                }}
                                                            />
                                                        </View>
                                                    )}

                                                    <TouchableOpacity
                                                        onPress={onSaveFollowUp}
                                                        disabled={isSavingEdit}
                                                        style={{
                                                            marginTop: 16,
                                                        }}>
                                                        <LinearGradient
                                                            colors={
                                                                isSavingEdit
                                                                    ? [
                                                                          "#ccc",
                                                                          "#bbb",
                                                                      ]
                                                                    : GRAD.primary
                                                            }
                                                            style={
                                                                FU.btnPrimary
                                                            }>
                                                            <Text
                                                                style={{
                                                                    color: "#fff",
                                                                    fontWeight:
                                                                        "700",
                                                                    fontSize: 14,
                                                                }}>
                                                                {isSavingEdit
                                                                    ? "Saving…"
                                                                    : editFollowUpId
                                                                      ? "Update Scheduled Follow-up"
                                                                      : "Create Follow-up"}
                                                            </Text>
                                                        </LinearGradient>
                                                    </TouchableOpacity>
                                                    {editFollowUpId && (
                                                        <TouchableOpacity
                                                            onPress={
                                                                onCancelScheduledEdit
                                                            }
                                                            disabled={
                                                                isSavingEdit
                                                            }
                                                            style={
                                                                FU.btnSecondary
                                                            }>
                                                            <Text
                                                                style={
                                                                    FU.btnSecondaryText
                                                                }>
                                                                Cancel Edit
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </>
                                            )}

                                        <View style={FU.sectionCard}>
                                            <Text style={FU.sectionTitle}>
                                                Scheduled Timeline
                                            </Text>
                                            <Text style={FU.sectionSub}>
                                                Follow-up entries and next
                                                scheduled dates.
                                            </Text>
                                            {historyLoading ? (
                                                <ActivityIndicator
                                                    color={C.primary}
                                                    style={{
                                                        marginVertical: 18,
                                                    }}
                                                />
                                            ) : timelineRows.length === 0 ? (
                                                <View style={FU.timelineEmpty}>
                                                    <Ionicons
                                                        name="time-outline"
                                                        size={20}
                                                        color={C.textLight}
                                                    />
                                                    <Text
                                                        style={
                                                            FU.timelineEmptyText
                                                        }>
                                                        No scheduled follow-up
                                                        timeline yet
                                                    </Text>
                                                </View>
                                            ) : (
                                                timelineRows.map((h, i) => {
                                                    const tc = getTypeIcon(
                                                        h.type ||
                                                            h.activityType,
                                                    );
                                                    const nextDate =
                                                        h.nextFollowUpDate ||
                                                        h.followUpDate ||
                                                        h.date ||
                                                        "-";
                                                    const formatDateTimeDisplay =
                                                        (dateStr, timeStr) => {
                                                            if (
                                                                !dateStr ||
                                                                dateStr === "-"
                                                            )
                                                                return "-";
                                                            const dt = new Date(
                                                                dateStr,
                                                            );
                                                            if (
                                                                Number.isNaN(
                                                                    dt.getTime(),
                                                                )
                                                            )
                                                                return dateStr;
                                                            const date =
                                                                dt.toLocaleDateString(
                                                                    [],
                                                                    {
                                                                        day: "2-digit",
                                                                        month: "short",
                                                                        year: "numeric",
                                                                    },
                                                                );
                                                            // Use separate time field if available, otherwise extract from date
                                                            let time;
                                                            if (timeStr) {
                                                                // Parse and convert time string from 24-hour to 12-hour format
                                                                const timeParts =
                                                                    String(
                                                                        timeStr,
                                                                    ).split(
                                                                        ":",
                                                                    );
                                                                if (
                                                                    timeParts.length >=
                                                                    2
                                                                ) {
                                                                    const hours24 =
                                                                        parseInt(
                                                                            timeParts[0],
                                                                            10,
                                                                        );
                                                                    const minutes =
                                                                        String(
                                                                            timeParts[1],
                                                                        ).padStart(
                                                                            2,
                                                                            "0",
                                                                        );
                                                                    const meridiem =
                                                                        hours24 >=
                                                                        12
                                                                            ? "PM"
                                                                            : "AM";
                                                                    const displayHours =
                                                                        hours24 %
                                                                            12 ||
                                                                        12;
                                                                    time = `${displayHours}:${minutes} ${meridiem}`;
                                                                } else {
                                                                    time =
                                                                        timeStr; // Fallback if format is unexpected
                                                                }
                                                            } else {
                                                                // Extract time from date object
                                                                const hours =
                                                                    dt.getHours();
                                                                const minutes =
                                                                    String(
                                                                        dt.getMinutes(),
                                                                    ).padStart(
                                                                        2,
                                                                        "0",
                                                                    );
                                                                const meridiem =
                                                                    hours >= 12
                                                                        ? "PM"
                                                                        : "AM";
                                                                const displayHours =
                                                                    hours %
                                                                        12 ||
                                                                    12;
                                                                time = `${displayHours}:${minutes} ${meridiem}`;
                                                            }
                                                            return `${date} • ${time}`;
                                                        };
                                                    const displayDateTime =
                                                        formatDateTimeDisplay(
                                                            nextDate,
                                                            h.time,
                                                        );
                                                    const historyStatus =
                                                        getHistoryEditStatus(h);
                                                    const isSalesHistoryRow =
                                                        historyStatus ===
                                                        "Converted";
                                                    const timelineFollowupId =
                                                        getFollowUpDocumentId(
                                                            h,
                                                        );
                                                    const isEditable =
                                                        Boolean(
                                                            timelineFollowupId,
                                                        );
                                                    const handleDeleteFollowUp =
                                                        async () => {
                                                            // Try to delete the follow-up if it has an ID
                                                            const followupId =
                                                                timelineFollowupId;
                                                            if (!followupId) {
                                                                console.warn(
                                                                    "[FollowUpScreen] No followup ID to delete",
                                                                );
                                                                return;
                                                            }

                                                            // Show confirmation dialog
                                                            Alert.alert(
                                                                "Delete Follow-up?",
                                                                "Are you sure you want to delete this follow-up record? This action cannot be undone.",
                                                                [
                                                                    {
                                                                        text: "Cancel",
                                                                        onPress:
                                                                            () => {
                                                                                console.log(
                                                                                    "[FollowUpScreen] Delete cancelled by user",
                                                                                );
                                                                            },
                                                                        style: "cancel",
                                                                    },
                                                                    {
                                                                        text: "Delete",
                                                                        onPress:
                                                                            async () => {
                                                                                try {
                                                                                    console.log(
                                                                                        `[FollowUpScreen] Deleting follow-up: ${followupId}`,
                                                                                    );
                                                                                    setDeletingFollowUpId(
                                                                                        followupId,
                                                                                    );
                                                                                    await notificationService.cancelNotificationsForFollowUpIds?.(
                                                                                        [
                                                                                            followupId,
                                                                                        ],
                                                                                    );
                                                                                    await followupService.deleteFollowUp(
                                                                                        followupId,
                                                                                    );
                                                                                    if (
                                                                                        isSalesHistoryRow
                                                                                    ) {
                                                                                        const enqIdentifier =
                                                                                            enquiry?._id ||
                                                                                            enquiry?.enqId ||
                                                                                            enquiry?.enqNo;
                                                                                        if (
                                                                                            enqIdentifier
                                                                                        ) {
                                                                                            const remainingHistory =
                                                                                                await followupService.getFollowUpHistory(
                                                                                                    enqIdentifier,
                                                                                                    {
                                                                                                        force: true,
                                                                                                    },
                                                                                                );
                                                                                            const remainingRows =
                                                                                                Array.isArray(
                                                                                                    remainingHistory,
                                                                                                )
                                                                                                    ? remainingHistory
                                                                                                    : [];
                                                                                            const fallbackRow =
                                                                                                [
                                                                                                    ...remainingRows,
                                                                                                ].sort(
                                                                                                    (
                                                                                                        a,
                                                                                                        b,
                                                                                                    ) =>
                                                                                                        getHistorySortTs(
                                                                                                            b,
                                                                                                        ) -
                                                                                                        getHistorySortTs(
                                                                                                            a,
                                                                                                        ),
                                                                                                )[0] ||
                                                                                                null;
                                                                                            const fallbackStatus =
                                                                                                getFallbackEnquiryStatusFromHistory(
                                                                                                    remainingRows,
                                                                                                );
                                                                                            const fallbackFollowUpId =
                                                                                                fallbackRow?.followupId ||
                                                                                                fallbackRow?.id ||
                                                                                                fallbackRow?._id;
                                                                                            if (
                                                                                                fallbackFollowUpId
                                                                                            ) {
                                                                                                const nextAction =
                                                                                                    fallbackStatus ===
                                                                                                    "Converted"
                                                                                                        ? "Sales"
                                                                                                        : [
                                                                                                                "Not Interested",
                                                                                                                "Closed",
                                                                                                            ].includes(
                                                                                                                fallbackStatus,
                                                                                                            )
                                                                                                          ? "Drop"
                                                                                                          : "Followup";
                                                                                                const restoredFollowUpStatus =
                                                                                                    nextAction ===
                                                                                                    "Followup"
                                                                                                        ? "Scheduled"
                                                                                                        : nextAction ===
                                                                                                            "Drop"
                                                                                                          ? "Drop"
                                                                                                          : "Completed";
                                                                                                await followupService.updateFollowUp(
                                                                                                    fallbackFollowUpId,
                                                                                                    {
                                                                                                        isCurrent: true,
                                                                                                        enquiryStatus:
                                                                                                            fallbackStatus,
                                                                                                        nextAction,
                                                                                                        status: restoredFollowUpStatus,
                                                                                                    },
                                                                                                );
                                                                                            }
                                                                                            await enquiryService.updateEnquiry(
                                                                                                enqIdentifier,
                                                                                                {
                                                                                                    status: fallbackStatus,
                                                                                                },
                                                                                            );
                                                                                            emitEnquiryUpdated();
                                                                                        }
                                                                                    }
                                                                                    // Refresh after deletion
                                                                                    setFollowUps(
                                                                                        [],
                                                                                    );
                                                                                    lastFetch.current = 0;
                                                                                    await onRefreshList?.();
                                                                                    onEditScheduledFollowUp?.(
                                                                                        null,
                                                                                    );
                                                                                    // Refresh the detail view history + top status chips
                                                                                    await refreshDetailHistory?.();
                                                                                    await refreshDetailEnquiry?.();
                                                                                    console.log(
                                                                                        `[FollowUpScreen] ✓ Follow-up deleted and history refreshed`,
                                                                                    );
                                                                                    setDeletingFollowUpId(
                                                                                        null,
                                                                                    );
                                                                                } catch (error) {
                                                                                    console.error(
                                                                                        "[FollowUpScreen] Delete followup error:",
                                                                                        error,
                                                                                    );
                                                                                    setDeletingFollowUpId(
                                                                                        null,
                                                                                    );
                                                                                    Alert.alert(
                                                                                        "Error",
                                                                                        "Failed to delete follow-up. Please try again.",
                                                                                    );
                                                                                }
                                                                            },
                                                                        style: "destructive",
                                                                    },
                                                                ],
                                                                {
                                                                    cancelable: false,
                                                                },
                                                            );
                                                        };

                                                    return (
                                                        <View
                                                            key={`inline-${h?.followupId || h?.id || h._id || "history"}-${h.activityType || h.type || "row"}-${i}`}
                                                            style={[
                                                                FU.timelineCard,
                                                                i <
                                                                    timelineRows.length -
                                                                        1 &&
                                                                    FU.timelineCardGap,
                                                            ]}>
                                                            <View
                                                                style={[
                                                                    FU.timelineBadge,
                                                                    {
                                                                        backgroundColor: `${tc.color}18`,
                                                                    },
                                                                ]}>
                                                                <Ionicons
                                                                    name={
                                                                        tc.icon
                                                                    }
                                                                    size={14}
                                                                    color={
                                                                        tc.color
                                                                    }
                                                                />
                                                            </View>
                                                            <View
                                                                style={{
                                                                    flex: 1,
                                                                }}>
                                                                <Text
                                                                    style={
                                                                        FU.timelineTitle
                                                                    }>
                                                                    {h.activityType ||
                                                                        h.type ||
                                                                        "Follow-up"}
                                                                </Text>
                                                                <Text
                                                                    style={
                                                                        FU.timelineDate
                                                                    }>
                                                                    Next
                                                                    follow-up:{" "}
                                                                    {
                                                                        displayDateTime
                                                                    }
                                                                </Text>
                                                                <Text
                                                                    style={
                                                                        FU.timelineNote
                                                                    }>
                                                                    {h.remarks ||
                                                                        h.note ||
                                                                        "-"}
                                                                </Text>
                                                            </View>
                                                            {isEditable && (
                                                                <View
                                                                    style={{
                                                                        flexDirection:
                                                                            "row",
                                                                        gap: 6,
                                                                        marginTop: 10,
                                                                        justifyContent:
                                                                            "center",
                                                                    }}>
                                                                    {!isSalesHistoryRow && (
                                                                        <TouchableOpacity
                                                                            disabled={
                                                                                deletingFollowUpId ===
                                                                                (h?.followupId ||
                                                                                    h?.id ||
                                                                                    h?._id)
                                                                            }
                                                                            onPress={() => {
                                                                                setShowFollowUpForm(
                                                                                    true,
                                                                                );
                                                                                onEditScheduledFollowUp?.(
                                                                                    h,
                                                                                );
                                                                                setTimeout(
                                                                                    () => {
                                                                                        followUpFormScrollRef.current?.scrollTo?.(
                                                                                            {
                                                                                                y: 0,
                                                                                                animated: true,
                                                                                            },
                                                                                        );
                                                                                    },
                                                                                    50,
                                                                                );
                                                                            }}
                                                                            style={[
                                                                                FU.timelineEditBtn,
                                                                                deletingFollowUpId ===
                                                                                    (h?.followupId ||
                                                                                        h?.id ||
                                                                                        h?._id) && {
                                                                                    opacity: 0.5,
                                                                                },
                                                                            ]}
                                                                            activeOpacity={
                                                                                0.7
                                                                            }>
                                                                            <Ionicons
                                                                                name="create-outline"
                                                                                size={
                                                                                    13
                                                                                }
                                                                                color={
                                                                                    C.primary
                                                                                }
                                                                            />
                                                                        </TouchableOpacity>
                                                                    )}
                                                                    <TouchableOpacity
                                                                        disabled={
                                                                            deletingFollowUpId ===
                                                                            (h?.followupId ||
                                                                                h?.id ||
                                                                                h?._id)
                                                                        }
                                                                        onPress={
                                                                            handleDeleteFollowUp
                                                                        }
                                                                        style={[
                                                                            FU.timelineDeleteBtn,
                                                                            deletingFollowUpId ===
                                                                                (h?.followupId ||
                                                                                    h?.id ||
                                                                                    h?._id) && {
                                                                                opacity: 0.5,
                                                                            },
                                                                        ]}
                                                                        activeOpacity={
                                                                            0.7
                                                                        }>
                                                                        {deletingFollowUpId ===
                                                                        (h?.followupId ||
                                                                            h?.id ||
                                                                            h?._id) ? (
                                                                            <ActivityIndicator
                                                                                size="small"
                                                                                color={
                                                                                    C.danger
                                                                                }
                                                                            />
                                                                        ) : (
                                                                            <>
                                                                                <Ionicons
                                                                                    name="trash-outline"
                                                                                    size={
                                                                                        13
                                                                                    }
                                                                                    color={
                                                                                        C.danger
                                                                                    }
                                                                                />
                                                                            </>
                                                                        )}
                                                                    </TouchableOpacity>
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })
                                            )}
                                        </View>
                                    </View>
                                )}
                            </ScrollView>
                        </KeyboardAvoidingView>
                    )}
                </View>
                {tabIdx === 1 && (
                    <>
                        <View
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 92,
                                width: 34,
                                zIndex: 20,
                                elevation: 20,
                                backgroundColor: "transparent",
                                pointerEvents: "box-only",
                            }}
                            {...whatsappEdgePan.panHandlers}
                        />
                        <View
                            style={{
                                position: "absolute",
                                right: 0,
                                top: 0,
                                bottom: 92,
                                width: 34,
                                zIndex: 20,
                                elevation: 20,
                                backgroundColor: "transparent",
                                pointerEvents: "box-only",
                            }}
                            {...whatsappEdgePan.panHandlers}
                        />
                    </>
                )}
            </View>
        </Animated.View>
    );
};

// DetailView styles
const DV = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: C.bg,
        zIndex: 100,
    },

    // Top bar
    topBar: {
        backgroundColor: C.card,
        paddingHorizontal: 16,
        overflow: "hidden",
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 4,
    },
    deco1: {
        position: "absolute",
        top: -50,
        right: -40,
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: C.primarySoft,
        opacity: 0.6,
    },
    deco2: {
        position: "absolute",
        top: 10,
        right: 20,
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: C.primaryMid,
        opacity: 0.3,
    },
    backBtn: {
        position: "absolute",
        left: 14,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    topContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingLeft: 52,
        paddingTop: 4,
    },
    avatarRing: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 2.5,
        borderColor: C.border,
        padding: 2.5,
        backgroundColor: C.card,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    avatarOuter: {
        width: "100%",
        height: "100%",
        borderRadius: 999,
        overflow: "hidden",
    },
    avatarImg: { width: "100%", height: "100%", borderRadius: 999 },
    avatarGrad: {
        width: "100%",
        height: "100%",
        borderRadius: 999,
        justifyContent: "center",
        alignItems: "center",
    },
    avatarText: { color: "#fff", fontSize: 17, fontWeight: "900" },
    priDot: {
        position: "absolute",
        bottom: 1,
        right: 1,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: C.card,
    },
    heroName: {
        fontSize: 16,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.3,
    },
    heroMobile: {
        fontSize: 12,
        color: C.textMuted,
        fontWeight: "500",
        marginBottom: 5,
    },
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.bg,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: C.border,
    },
    chipDot: { width: 5, height: 5, borderRadius: 3 },
    chipText: { fontSize: 10, color: C.textSub, fontWeight: "700" },

    // Tab bar
    tabBar: {
        flexDirection: "row",
        alignItems: "stretch",
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 6,
    },
    tabBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        minHeight: 38,
        paddingHorizontal: 6,
        paddingVertical: 7,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: C.border,
        backgroundColor: C.bg,
    },
    tabBtnText: {
        flexShrink: 1,
        fontSize: 10,
        fontWeight: "600",
        color: C.textMuted,
        textAlign: "center",
    },

    // Content
    detailRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: C.card,
        borderRadius: 13,
        padding: 11,
        borderWidth: 1,
        borderColor: C.border,
        gap: 10,
    },
    detailIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
    },
    detailLabel: {
        fontSize: 10,
        color: C.textLight,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 1,
    },
    detailValue: { fontSize: 13, color: C.text, fontWeight: "600" },
    timelineDot: {
        width: 28,
        height: 28,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 2,
    },
    timelineLine: {
        position: "absolute",
        top: 28,
        bottom: -14,
        width: 2,
        backgroundColor: C.divider,
        zIndex: 1,
    },
    histCard: {
        backgroundColor: C.card,
        borderRadius: 13,
        padding: 12,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
    },
    histStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    histRemarks: {
        backgroundColor: C.bg,
        padding: 8,
        borderRadius: 8,
        marginTop: 4,
    },
    timelineMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
    },
    timelineMetaText: {
        flex: 1,
        fontSize: 11,
        color: C.textSub,
        fontWeight: "600",
    },
    emptyWrap: { alignItems: "center", paddingTop: 60, gap: 10 },
    emptyIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyText: { fontSize: 14, color: C.textMuted, fontWeight: "600" },
    panelHero: {
        margin: 14,
        marginBottom: 10,
        backgroundColor: C.card,
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: C.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    panelEyebrow: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        textTransform: "uppercase",
        letterSpacing: 0.7,
        marginBottom: 4,
    },
    panelTitle: { fontSize: 16, fontWeight: "800", color: C.text },
    panelSub: { fontSize: 12, color: C.textMuted, marginTop: 3 },
    callPrimaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: C.primary,
        paddingHorizontal: 14,
        minWidth: 86,
        height: 44,
        borderRadius: 12,
        justifyContent: "center",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    callPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        paddingHorizontal: 14,
        paddingBottom: 10,
    },
    filterChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.card,
    },
    filterChipActive: {
        borderColor: C.primaryMid,
        backgroundColor: C.primarySoft,
    },
    filterChipText: { fontSize: 12, fontWeight: "700", color: C.textMuted },
    filterChipTextActive: { color: C.primary },
    filterCount: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 6,
        backgroundColor: C.bg,
        alignItems: "center",
        justifyContent: "center",
    },
    filterCountActive: { backgroundColor: "#fff" },
    filterCountText: { fontSize: 10, fontWeight: "800", color: C.textSub },
    filterCountTextActive: { color: C.primary },
    callRowCard: {
        flexDirection: "row",
        gap: 12,
        backgroundColor: C.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        padding: 12,
    },
    callIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
    },
    callRowTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8,
    },
    callTypeText: { flex: 1, fontSize: 13, fontWeight: "800", color: C.text },
    callTimeText: { fontSize: 11, color: C.textLight, fontWeight: "600" },
    callMetaText: { fontSize: 12, color: C.textMuted, marginTop: 4 },
    callNoteText: {
        fontSize: 12,
        color: C.textSub,
        marginTop: 6,
        lineHeight: 18,
    },
    emailHero: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: C.card,
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: C.border,
    },
    emailHeroIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: C.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    emailToggleBtn: {
        height: 38,
        borderRadius: 12,
        backgroundColor: C.primary,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    emailToggleText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    emailCard: {
        backgroundColor: C.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
    },
    emailLabel: {
        fontSize: 11,
        fontWeight: "800",
        color: C.textLight,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 6,
        marginTop: 12,
    },
    emailValue: { fontSize: 14, fontWeight: "700", color: C.text },
    emailInput: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.bg,
        paddingHorizontal: 12,
        fontSize: 14,
        color: C.text,
    },
    emailHint: {
        marginTop: 8,
        fontSize: 11,
        color: C.textLight,
        fontWeight: "600",
    },
    emailTemplateBox: {
        marginTop: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.cardAlt,
        padding: 10,
        gap: 8,
    },
    emailTemplateScroll: {
        maxHeight: 210,
    },
    emailTemplateTitle: {
        fontSize: 11,
        color: C.textLight,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    emailTemplateRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: C.card,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: C.border,
    },
    emailTemplateBadge: {
        width: 26,
        height: 26,
        borderRadius: 8,
        backgroundColor: C.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    emailTemplateName: { fontSize: 13, fontWeight: "800", color: C.text },
    emailTemplateSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
    emailTextArea: {
        minHeight: 132,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.bg,
        paddingHorizontal: 12,
        paddingTop: 12,
        fontSize: 14,
        color: C.text,
    },
    emailSendBtn: {
        marginTop: 16,
        height: 44,
        borderRadius: 12,
        backgroundColor: C.primary,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    emailSendText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    emailLogsCard: {
        backgroundColor: C.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
    },
    emailSectionHead: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    emailSectionTitle: { fontSize: 14, fontWeight: "800", color: C.text },
    emailSectionMeta: { fontSize: 12, fontWeight: "800", color: C.primary },
    emailLogRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    emailLogDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: C.primary,
        marginTop: 6,
    },

    // Follow-up context
    followupContext: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.bg,
        padding: 12,
        borderRadius: 14,
        marginBottom: 4,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        gap: 12,
    },
    followupAvatar: {
        width: 44,
        height: 44,
        borderRadius: 13,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
    },
});

// Follow-up form styles (inside DetailView tab 5)
const FU = StyleSheet.create({
    salesCongratsCard: {
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: "#065F46",
        shadowColor: "#022C22",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 14,
        elevation: 8,
    },
    salesCongratsHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
    },
    salesCongratsIconWrap: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: "rgba(209,250,229,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
    salesCongratsTag: {
        fontSize: 10,
        fontWeight: "900",
        letterSpacing: 0.9,
        color: "#A7F3D0",
    },
    salesCongratsTitle: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "800",
        color: "#ECFDF5",
    },
    salesCongratsSub: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 18,
        color: "#CCFBF1",
    },
    salesCongratsStats: {
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(204,251,241,0.25)",
        backgroundColor: "rgba(6,95,70,0.35)",
        paddingHorizontal: 10,
        paddingVertical: 9,
    },
    salesCongratsAmountLabel: {
        fontSize: 10,
        color: "#99F6E4",
        letterSpacing: 0.6,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    salesCongratsAmount: {
        marginTop: 2,
        fontSize: 18,
        fontWeight: "900",
        color: "#F0FDFA",
    },
    toggleBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: C.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
    },
    toggleBtnIcon: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: C.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    toggleBtnTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: C.text,
    },
    toggleBtnSub: {
        fontSize: 11,
        color: C.textMuted,
        marginTop: 2,
    },
    floatingWrap: {
        position: "relative",
        backgroundColor: C.bg,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: C.border,
        paddingHorizontal: 12,
        minHeight: 52,
        justifyContent: "center",
    },
    floatingWrapMultiline: { paddingTop: 20, paddingBottom: 40 },
    floatingLabel: { position: "absolute", left: 12, fontWeight: "600" },
    floatingInput: {
        fontSize: 14,
        color: C.text,
        minHeight: 46,
        paddingTop: 20,
        paddingBottom: 8,
    },
    floatingInputMultiline: { minHeight: 88 },
    label: {
        fontSize: 12,
        fontWeight: "700",
        color: C.textSub,
        marginBottom: 6,
        marginTop: 14,
        letterSpacing: 0.2,
    },
    sectionCard: {
        backgroundColor: C.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: C.text,
        marginBottom: 4,
    },
    sectionSub: { fontSize: 12, color: C.textLight, marginBottom: 2 },
    textArea: {
        backgroundColor: C.bg,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: C.border,
        padding: 12,
        minHeight: 90,
    },
    pill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: C.border,
        backgroundColor: C.card,
    },
    pillText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
    statusBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: C.border,
        backgroundColor: C.card,
    },
    datePicker: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.primarySoft,
        paddingHorizontal: 14,
        borderRadius: 12,
        height: 46,
        marginTop: 4,
        borderWidth: 1.5,
        borderColor: C.primaryMid,
        gap: 8,
    },
    dateText: { fontSize: 14, color: C.text, fontWeight: "600" },
    btnPrimary: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    btnSecondary: {
        marginTop: 10,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
    },
    btnSecondaryText: {
        color: C.textMuted,
        fontWeight: "700",
        fontSize: 13,
    },
    editingBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: C.primarySoft,
        borderWidth: 1,
        borderColor: C.primaryMid,
    },
    editingBannerText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.primaryDark,
    },
    timelineEmpty: {
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 18,
    },
    timelineEmptyText: {
        fontSize: 12,
        color: C.textMuted,
        fontWeight: "600",
    },
    timelineCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        backgroundColor: C.bg,
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: C.border,
    },
    timelineCardGap: {
        marginBottom: 10,
    },
    timelineBadge: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
    },
    timelineTitle: {
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
    },
    timelineDate: {
        fontSize: 11,
        fontWeight: "700",
        color: C.primary,
        marginTop: 2,
    },
    timelineNote: {
        fontSize: 11,
        color: C.textMuted,
        lineHeight: 16,
        marginTop: 4,
    },
    timelineEditBtn: {
        minWidth: 20,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: C.primarySoft,
        borderWidth: 1,
        borderColor: C.primaryMid,
    },
    timelineDeleteBtn: {
        minWidth: 20,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: C.dangerSoft ?? "#FEE2E2",
        borderWidth: 1,
        borderColor: C.dangerMid ?? "#FECACA",
    },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FollowUpScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const sc = useScale();
    const { user, logout, billingInfo, showUpgradePrompt } = useAuth();

    const [menuVisible, setMenuVisible] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [activeTab, setActiveTab] = useState("All");
    const [followUps, setFollowUps] = useState([]);
    const [tabCounts, setTabCounts] = useState({
        All: 0,
        Today: 0,
        Missed: 0,
        Sales: 0,
        Dropped: 0,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDate, setSelectedDate] = useState(toIso(new Date()));
    const [showMissedModal, setShowMissedModal] = useState(false);
    const [missedModalItems, setMissedModalItems] = useState([]);
    const [showDroppedModal, setShowDroppedModal] = useState(false);
    const [droppedModalItems, setDroppedModalItems] = useState([]);

    // Detail view
    const [detailEnquiry, setDetailEnquiry] = useState(null);
    const [detailHistory, setDetailHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const detailLoadReqIdRef = useRef(0);
    const detailHistoryReqIdRef = useRef(0);
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [detailAutoOpenFormToken, setDetailAutoOpenFormToken] =
        useState(null);

    // Follow-up composer
    const [editRemarks, setEditRemarks] = useState("");
    const [editActivityType, setEditActivityType] = useState("Phone Call");
    const [editStatus, setEditStatus] = useState("Contacted");
    const [editNextDate, setEditNextDate] = useState("");
    const [editNextTime, setEditNextTime] = useState("");
    const [editTimeMeridian, setEditTimeMeridian] = useState("AM");
    const [editAmount, setEditAmount] = useState("");
    const [editFollowUpId, setEditFollowUpId] = useState(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDatePickerVisible, setDatePickerVisible] = useState(false);
    const [datePickerTarget, setDatePickerTarget] = useState("add");
    const [isTimePickerVisible, setTimePickerVisible] = useState(false);
    const [timePickerValue, setTimePickerValue] = useState(new Date());
    const [calendarMonth, setCalendarMonth] = useState(toMonthKey(new Date()));
    const [calendarDateSummary, setCalendarDateSummary] = useState({});

    // Call
    const [callEnquiry, setCallEnquiry] = useState(null);
    const [callStartTime, setCallStartTime] = useState(null);
    const [callStarted, setCallStarted] = useState(false);

    const confettiRef = useRef(null);
    const fetchIdRef = useRef(0);
    const lastFetch = useRef(0);
    const lastToken = useRef(null);
    const detailSourceFollowUpIdRef = useRef(null);
    const detailSourceWasMissedRef = useRef(false);
    const lastFocusDate = useRef(null);
    const lastFocusKey = useRef(null);
    const missedTimeCheckRef = useRef(null);
    const missedCheckIntervalRef = useRef(null);
    // FIX #5: Request cancellation for avoiding race conditions
    const requestAbortRef = useRef(null);
    // FIX #10: Debouncing refs for search and date changes
    const searchDebounceRef = useRef(null);
    const dateDebounceRef = useRef(null);
    // Feature #4: Socket.IO for real-time updates
    const socketRef = useRef(null);
    // Feature #5: Prefetch cache for other tabs
    const prefetchCacheRef = useRef({});

    const missedAlertCount = Number(tabCounts?.Missed || 0);
    const droppedAlertCount = Number(tabCounts?.Dropped || 0);
    const isRealTodaySelected = selectedDate === toIso(new Date());

    // Realtime refresh for missed count (no manual refresh).
    useEffect(() => {
        if (!isRealTodaySelected) return undefined;
        let alive = true;
        const tick = async () => {
            if (!alive) return;
            try {
                await fetchTabCounts(selectedDate);
                if (showMissedModal) {
                    await loadMissedModalItems(selectedDate);
                }
            } catch {}
        };

        tick();
        const id = setInterval(tick, 15000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, [isRealTodaySelected, selectedDate, showMissedModal]);

    // Real-time missed detection: run every 60 seconds and auto-refresh the list once a due time is reached.
    useEffect(() => {
        if (!isRealTodaySelected) return undefined;

        let alive = true;
        const checkMissedItems = () => {
            if (!alive || followUps.length === 0) return;

            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const minuteKey = `${selectedDate}:${currentMinutes}`;
            if (missedTimeCheckRef.current === minuteKey) return;

            const shouldRefresh = followUps.some((item) => {
                // Already treated as missed by UI logic.
                if (getCalendarSummaryBucket(item) === "missed") return false;

                // Only apply to real-today items with a time.
                const iso = getFollowUpCalendarDate(item);
                if (!iso || iso !== selectedDate) return false;

                const status = getHistoryEditStatus(item);
                if (!["New", "Contacted", "Interested"].includes(status))
                    return false;

                const timeStr = String(item?.time || "").trim();
                if (!timeStr) return false;

                const m = timeStr.match(
                    /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
                );
                if (!m) return false;

                let hh = Number(m[1]);
                const mm = Number(m[2] ?? "0");
                const meridian = String(m[4] || "").toUpperCase();

                if (meridian === "PM" && hh !== 12) hh += 12;
                if (meridian === "AM" && hh === 12) hh = 0;

                const itemMinutes = hh * 60 + mm;
                return itemMinutes <= currentMinutes;
            });

            if (!shouldRefresh) return;

            missedTimeCheckRef.current = minuteKey;
            console.log(
                "[FollowUp] Due time reached; refreshing missed status...",
            );

            // Server also auto-marks Missed on /followups, so refresh both list + counts.
            fetchFollowUps(focusTab || activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: false,
                selectedDate: focusDate,
            });
            fetchTabCounts(selectedDate).catch(() => {});
            if (showMissedModal) loadMissedModalItems(selectedDate);
        };

        checkMissedItems();
        // FIX #9: Increased from 60000ms to MISSED_CHECK_INTERVAL_MS (120000ms / 2min)
        missedCheckIntervalRef.current = setInterval(
            checkMissedItems,
            MISSED_CHECK_INTERVAL_MS,
        );

        return () => {
            alive = false;
            if (missedCheckIntervalRef.current) {
                clearInterval(missedCheckIntervalRef.current);
                missedCheckIntervalRef.current = null;
            }
        };
    }, [
        isRealTodaySelected,
        activeTab,
        followUps,
        selectedDate,
        showMissedModal,
    ]);

    // ── Focus ────────────────────────────────────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            Promise.resolve(
                notificationService.acknowledgeHourlyFollowUpReminders?.(),
            ).catch(() => {});
            const fd = route.params?.focusDate
                ? String(route.params.focusDate)
                : "";
            if (fd && lastFocusDate.current !== fd) {
                lastFocusDate.current = fd;
                setSelectedDate(fd);
            }

            // ⚡ INSTANT LOAD: Show cache immediately, then refresh in background
            // First, try to load cache instantly without blocking UI
            fetchFollowUps(activeTab, true, {
                force: false,
                showIndicator: false,
                allowCache: true,
            });

            // Then fetch fresh data in background if cache is stale
            const shouldRefreshInBackground =
                Date.now() - lastFetch.current > FOLLOWUPS_INSTANT_LOAD_TTL;
            if (shouldRefreshInBackground) {
                // Non-blocking background refresh
                Promise.resolve()
                    .then(() =>
                        fetchFollowUps(activeTab, true, {
                            force: true,
                            showIndicator: false,
                            allowCache: true,
                        }),
                    )
                    .catch(() => {});
            }
        }, [activeTab, route.params?.focusDate]),
    );

    // ── Param effects ─────────────────────────────────────────────────────────
    useEffect(() => {
        const token = route.params?.composerToken,
            enq = route.params?.enquiry;
        if (!route.params?.openComposer || !token || !enq) return;
        if (lastToken.current === token) return;
        lastToken.current = token;
        if (route.params?.autoOpenForm) {
            setDetailAutoOpenFormToken(token);
        } else {
            setDetailAutoOpenFormToken(null);
        }
        openDetail(enq);
    }, [
        route.params?.openComposer,
        route.params?.composerToken,
        route.params?.enquiry,
        route.params?.autoOpenForm,
    ]);

    useEffect(() => {
        const key =
            route.params?.focusKey ||
            [
                route.params?.focusTab,
                route.params?.focusDate,
                route.params?.openMissedModal ? "missed" : "",
            ]
                .filter(Boolean)
                .join(":");
        if (!key || lastFocusKey.current === key) return;
        lastFocusKey.current = key;
        if (route.params?.focusDate) {
            const d = String(route.params.focusDate);
            lastFocusDate.current = d;
            setSelectedDate(d);
        }
        if (
            route.params?.focusTab &&
            STATUS_TABS.some((t) => t.value === route.params.focusTab)
        )
            setActiveTab(route.params.focusTab);
        else setActiveTab("All");
        if (route.params?.focusSearch != null)
            setSearchQuery(String(route.params.focusSearch));
        if (route.params?.openMissedModal) setShowMissedModal(true);
    }, [
        route.params?.focusKey,
        route.params?.focusTab,
        route.params?.focusDate,
        route.params?.focusSearch,
        route.params?.openMissedModal,
    ]);

    useEffect(() => {
        // FIX #10: Add proper debouncing with useRef to prevent memory leaks
        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }
        searchDebounceRef.current = setTimeout(() => {
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true);
            searchDebounceRef.current = null;
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }
        };
    }, [searchQuery, activeTab]);

    useEffect(() => {
        // FIX #10: Add debouncing for date changes to prevent rapid API calls
        if (activeTab !== "All" && !tabUsesExactDateFilter(activeTab)) return;

        if (dateDebounceRef.current) {
            clearTimeout(dateDebounceRef.current);
        }
        dateDebounceRef.current = setTimeout(() => {
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true);
            dateDebounceRef.current = null;
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            if (dateDebounceRef.current) {
                clearTimeout(dateDebounceRef.current);
            }
        };
    }, [selectedDate, activeTab]);

    useEffect(() => {
        if (!showMissedModal) return;
        loadMissedModalItems(selectedDate);
    }, [showMissedModal, selectedDate]);

    useEffect(() => {
        if (!showDroppedModal) return;
        loadDroppedModalItems();
    }, [showDroppedModal]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("CALL_ENDED", (_data) => {
            if (callStarted && callEnquiry) {
                global.__callClaimedByScreen = true;

                // Sync call logs in background after call ends
                if (AUTO_SAVE_CALL_LOGS) {
                    try {
                        const callLogService =
                            require("../services/callLogService").default;
                        const {
                            requestAndCheckCallLog,
                        } = require("../utils/callLogPermissions");
                        Promise.resolve()
                            .then(async () => {
                                const status = await requestAndCheckCallLog();
                                if (!status?.enabled) return;
                                await callLogService.syncDeviceCallLogs();
                            })
                            .catch(() => {});
                    } catch {}
                }

                setCallEnquiry(null);
                setCallStarted(false);
                setCallStartTime(null);
            }
        });
        return () => sub.remove();
    }, [callStarted, callEnquiry]);

    useEffect(() => {
        const sub = AppState.addEventListener("change", async (next) => {
            if (
                next === "active" &&
                callStarted &&
                callStartTime &&
                callEnquiry
            ) {
                // App returned to foreground — the call has ended (or user switched back)
                // Trigger a background sync so the new call log appears immediately.
                if (AUTO_SAVE_CALL_LOGS) {
                    try {
                        const callLogService =
                            require("../services/callLogService").default;
                        const {
                            requestAndCheckCallLog,
                        } = require("../utils/callLogPermissions");
                        const status = await requestAndCheckCallLog();
                        if (status?.enabled) {
                            callLogService.syncDeviceCallLogs().catch(() => {});
                        }
                    } catch {}
                }
                setCallEnquiry(null);
                setCallStarted(false);
                setCallStartTime(null);
            }
        });
        return () => sub.remove();
    }, [callStarted, callStartTime, callEnquiry]);
    useEffect(() => {
        let pendingArgs = {
            clear: false,
            refreshCounts: false,
            refreshModals: false,
        };

        const flush = () => {
            const { clear, refreshCounts, refreshModals } = pendingArgs || {};
            if (clear) setFollowUps([]);
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: false,
            });
            if (refreshCounts) fetchTabCounts(selectedDate).catch(() => {});
            if (refreshModals) {
                if (showMissedModal) loadMissedModalItems(selectedDate);
                if (showDroppedModal) loadDroppedModalItems();
            }
        };

        const refresh = (args = {}) => {
            pendingArgs = {
                clear: pendingArgs.clear || Boolean(args.clear),
                refreshCounts:
                    pendingArgs.refreshCounts || Boolean(args.refreshCounts),
                refreshModals:
                    pendingArgs.refreshModals || Boolean(args.refreshModals),
            };
            debounceByKey("followup-refresh", flush, 300);
        };

        const unsubFollowup = onAppEvent(APP_EVENTS.FOLLOWUP_CHANGED, () =>
            refresh({ clear: false, refreshCounts: true, refreshModals: true }),
        );
        const unsubEnquiry = onAppEvent(APP_EVENTS.ENQUIRY_UPDATED, () =>
            refresh({ clear: true, refreshCounts: true, refreshModals: true }),
        );
        const unsubEnquiryCreated = onAppEvent(APP_EVENTS.ENQUIRY_CREATED, () =>
            refresh({ clear: true, refreshCounts: true, refreshModals: true }),
        );

        return () => {
            cancelDebounceKey("followup-refresh");
            unsubFollowup();
            unsubEnquiry();
            unsubEnquiryCreated();
        };
    }, [activeTab, selectedDate, showMissedModal, showDroppedModal]);

    useEffect(() => {
        const unsub = navigation.addListener("blur", () => {
            setDetailEnquiry(null);
            setDetailHistory([]);
            setHistoryLoading(false);
        });
        return unsub;
    }, [navigation]);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchTabCounts = async (referenceDate = selectedDate) => {
        try {
            const monthRange = getMonthDateRange(referenceDate);
            const todayIso = toIso(new Date());

            const getMissedCountWithRealtime = async () => {
                // For "today", some items can be considered missed by UI time logic
                // before the server marks them as Missed. Count the union so the
                // badge matches the Missed Activity list.
                const [missedRes, todayRes] = await Promise.all([
                    followupService.getFollowUps(
                        "Missed",
                        1,
                        50,
                        referenceDate,
                    ),
                    referenceDate === todayIso
                        ? followupService.getFollowUps(
                              "Today",
                              1,
                              50,
                              referenceDate,
                          )
                        : Promise.resolve(null),
                ]);

                const missedRaw = Array.isArray(missedRes?.data)
                    ? missedRes.data
                    : Array.isArray(missedRes)
                      ? missedRes
                      : [];

                if (referenceDate !== todayIso) return missedRaw.length;

                const todayRaw = Array.isArray(todayRes?.data)
                    ? todayRes.data
                    : Array.isArray(todayRes)
                      ? todayRes
                      : [];

                const ids = new Set(
                    missedRaw
                        .map((i) => String(i?._id || i?.id || ""))
                        .filter(Boolean),
                );

                for (const item of todayRaw) {
                    if (getFollowUpCalendarDate(item) !== referenceDate)
                        continue;
                    if (getCalendarSummaryBucket(item) !== "missed") continue;
                    const id = String(item?._id || item?.id || "");
                    if (id) ids.add(id);
                }

                return ids.size;
            };

            const [
                allCount,
                todayCount,
                missedCount,
                salesCount,
                droppedCount,
            ] = await Promise.all([
                getTabUniqueCount("All", "", {
                    followUpParams: monthRange,
                    includeNewEnquiries: true,
                    enquiryParams: monthRange,
                }),
                getTabUniqueCount("Today", referenceDate, {
                    useEnquirySource: true,
                    allowedStatuses: ["New", "Contacted", "Interested"],
                }),
                getMissedCountWithRealtime(),
                getTabUniqueCount("Sales", referenceDate, {
                    useEnquirySource: true,
                    allowedStatuses: ["Converted"],
                }),
                getTabUniqueCount("Dropped", ""),
            ]);
            setTabCounts({
                All: Number(allCount || 0),
                Today: Number(todayCount || 0),
                Missed: Number(missedCount || 0),
                Sales: Number(salesCount || 0),
                Dropped: Number(droppedCount || 0),
            });
        } catch (_error) {
            // Keep current tab counts if the summary request fails.
        }
    };

    const loadMissedModalItems = async (referenceDate = selectedDate) => {
        try {
            const todayIso = toIso(new Date());
            const [missedResponse, todayResponse] = await Promise.all([
                followupService.getFollowUps("Missed", 1, 50, referenceDate),
                referenceDate === todayIso
                    ? followupService.getFollowUps(
                          "Today",
                          1,
                          50,
                          referenceDate,
                      )
                    : Promise.resolve(null),
            ]);

            const missedRawItems = Array.isArray(missedResponse?.data)
                ? missedResponse.data
                : Array.isArray(missedResponse)
                  ? missedResponse
                  : [];

            const todayRawItems =
                referenceDate === todayIso
                    ? Array.isArray(todayResponse?.data)
                        ? todayResponse.data
                        : Array.isArray(todayResponse)
                          ? todayResponse
                          : []
                    : [];

            const realtimeMissedItems =
                referenceDate === todayIso
                    ? todayRawItems.filter(
                          (item) =>
                              getFollowUpCalendarDate(item) === referenceDate &&
                              getCalendarSummaryBucket(item) === "missed",
                      )
                    : [];

            const rawItems = [...missedRawItems, ...realtimeMissedItems];
            const items = dedupeByLatestActivity(
                rawItems.map(mapFollowUpItemToEnquiryCard),
            );
            setMissedModalItems(items);
        } catch (_error) {
            setMissedModalItems([]);
        }
    };

    const loadDroppedModalItems = async () => {
        try {
            const response = await followupService.getFollowUps(
                "Dropped",
                1,
                50,
                "",
            );
            const rawItems = Array.isArray(response?.data)
                ? response.data
                : Array.isArray(response)
                  ? response
                  : [];
            const items = dedupeByLatestActivity(
                rawItems.map(mapFollowUpItemToEnquiryCard),
            );
            setDroppedModalItems(items);
        } catch (_error) {
            setDroppedModalItems([]);
        }
    };

    // Feature #2: Auto-load next page on scroll
    const handleEndReached = useCallback(() => {
        // Important: don't set `isLoadingMore` here. `fetchFollowUps()` manages it.
        // Setting it early causes a deadlock where `fetchFollowUps()` exits immediately.
        if (isLoading || isRefreshing || isLoadingMore || !hasMore) return;
        fetchFollowUps(activeTab, false);
    }, [isLoading, isRefreshing, isLoadingMore, hasMore, activeTab]);

    // Feature #4: Initialize Socket.IO for real-time updates
    useEffect(() => {
        const setupSocket = async () => {
            try {
                const socket = await initSocket();
                if (!socket) return;
                socketRef.current = socket;

                // Listen for real-time followup updates
                socket.on("FOLLOWUP_UPDATED", (data) => {
                    console.log("[FollowUpScreen] Real-time update:", data?.id);
                    // Force refresh current tab data
                    lastFetch.current = 0;
                    fetchFollowUps(activeTab, true, {
                        force: true,
                        showIndicator: false,
                    });
                });

                socket.on("FOLLOWUP_CREATED", (data) => {
                    console.log(
                        "[FollowUpScreen] New followup created via socket",
                    );
                    lastFetch.current = 0;
                    fetchFollowUps(activeTab, true, {
                        force: true,
                        showIndicator: false,
                    });
                });
            } catch (error) {
                console.error(
                    "[FollowUpScreen] Socket setup error:",
                    error?.message,
                );
            }
        };
        setupSocket();

        return () => {
            if (socketRef.current) {
                socketRef.current.off("FOLLOWUP_UPDATED");
                socketRef.current.off("FOLLOWUP_CREATED");
            }
        };
    }, [activeTab]);

    // Feature #5: Smart prefetch adjacent tabs in background
    const prefetchTabs = useCallback(async () => {
        // Don't prefetch if already prefetched recently
        const now = Date.now();
        if (
            prefetchCacheRef.current.lastPrefetch &&
            now - prefetchCacheRef.current.lastPrefetch < 60000
        )
            return;

        console.log("[FollowUpScreen] Prefetching adjacent tabs...");
        prefetchCacheRef.current.lastPrefetch = now;

        try {
            // Prefetch other tabs in background
            for (const tabName of PREFETCH_TABS) {
                if (tabName === activeTab) continue; // Skip current tab

                const cacheKey = buildCacheKey(
                    "followups:list:v2",
                    user?.id || user?._id || "",
                    tabName,
                    selectedDate || "",
                    String(searchQuery || "")
                        .trim()
                        .toLowerCase(),
                );

                // Check if already cached and fresh
                const cached = await getCacheEntry(cacheKey).catch(() => null);
                if (cached && isFresh(cached, FOLLOWUPS_CACHE_TTL_MS)) {
                    console.log(
                        `[FollowUpScreen] Tab ${tabName} already cached`,
                    );
                    continue;
                }

                // Fetch in background (no UI update)
                try {
                    const monthRange = getMonthDateRange(selectedDate);
                    const filterDate = tabUsesExactDateFilter(tabName)
                        ? selectedDate
                        : "";

                    let items = [];
                    let hasMore = false;
                    let nextPage = 1;

                    if (tabName === "Today") {
                        const enquiryRes = await enquiryService.getAllEnquiries(
                            1,
                            20,
                            searchQuery.trim(),
                            "",
                            "",
                            selectedDate,
                        );
                        const data = Array.isArray(enquiryRes?.data)
                            ? enquiryRes.data
                            : Array.isArray(enquiryRes)
                              ? enquiryRes
                              : [];
                        const total = Array.isArray(enquiryRes)
                            ? 1
                            : Number(enquiryRes?.pagination?.pages || 1);
                        items = dedupeByLatestActivity(
                            data.map(mapEnquiryToFollowUpCard),
                        );
                        hasMore = Array.isArray(enquiryRes) ? false : 1 < total;
                        nextPage = hasMore ? 2 : 1;
                    } else {
                        const res = await followupService.getFollowUps(
                            tabName,
                            1,
                            20,
                            filterDate,
                            tabName === "All" ? monthRange : {},
                        );
                        const data = Array.isArray(res?.data)
                            ? res.data
                            : Array.isArray(res)
                              ? res
                              : [];
                        const total = Array.isArray(res)
                            ? 1
                            : Number(res?.pagination?.pages || 1);
                        items = data.map(mapFollowUpItemToEnquiryCard);
                        hasMore = Array.isArray(res) ? false : 1 < total;
                        nextPage = hasMore ? 2 : 1;

                        if (tabName === "All") {
                            try {
                                const enquiryRes =
                                    await enquiryService.getAllEnquiries(
                                        1,
                                        500,
                                        searchQuery.trim(),
                                        "New",
                                        "",
                                        "",
                                        monthRange,
                                    );
                                const enquiryItems = Array.isArray(
                                    enquiryRes?.data,
                                )
                                    ? enquiryRes.data
                                    : Array.isArray(enquiryRes)
                                      ? enquiryRes
                                      : [];
                                const newOnlyItems = enquiryItems
                                    .filter((item) => !item?.latestFollowUpDate)
                                    .map(mapEnquiryToFollowUpCard);
                                items = [...newOnlyItems, ...items];
                            } catch (_e) {
                                // ignore prefetch enrichment failures
                            }
                            if (searchQuery.trim()) {
                                const q = searchQuery.trim().toLowerCase();
                                items = items.filter(
                                    (item) =>
                                        String(item?.name || "")
                                            .toLowerCase()
                                            .includes(q) ||
                                        String(item?.mobile || "")
                                            .toLowerCase()
                                            .includes(q) ||
                                        String(item?.enqNo || "")
                                            .toLowerCase()
                                            .includes(q),
                                );
                            }
                            items = dedupeByLatestActivity(items);
                        }
                    }

                    await setCacheEntry(
                        cacheKey,
                        { items, hasMore, page: nextPage },
                        { tags: ["followups"] },
                    ).catch(() => {});

                    console.log(
                        `[FollowUpScreen] Prefetched ${tabName}: ${items.length} items`,
                    );
                } catch (err) {
                    console.log(
                        `[FollowUpScreen] Prefetch ${tabName} skipped:`,
                        err?.message,
                    );
                }
            }
        } catch (error) {
            console.error("[FollowUpScreen] Prefetch error:", error?.message);
        }
    }, [activeTab, selectedDate, searchQuery, user]);

    // Trigger prefetch when tab changes
    useEffect(() => {
        prefetchTabs();
    }, [activeTab, prefetchTabs]);

    const fetchFollowUps = async (tab, refresh = false, opts = {}) => {
        const rid = ++fetchIdRef.current;
        const { force = false, allowCache = true } = opts || {};
        const showIndicator =
            opts?.showIndicator ?? (refresh && followUps.length > 0);
        const effectiveSelectedDate =
            opts?.selectedDate != null
                ? String(opts.selectedDate)
                : selectedDate;
        const effectiveSearchQuery =
            opts?.searchQuery != null ? String(opts.searchQuery) : searchQuery;

        // FIX #5: Cancel previous request if still pending
        if (requestAbortRef.current) {
            requestAbortRef.current.abort();
        }
        requestAbortRef.current = new AbortController();

        const cacheKey = buildCacheKey(
            "followups:list:v2",
            user?.id || user?._id || "",
            tab,
            effectiveSelectedDate || "",
            String(effectiveSearchQuery || "")
                .trim()
                .toLowerCase(),
        );

        let cached = null;
        let cachedItemCount = null;
        if (refresh && allowCache) {
            cached = await getCacheEntry(cacheKey).catch(() => null);
            if (cached?.value?.items) {
                const cachedItems = Array.isArray(cached.value.items)
                    ? cached.value.items
                    : [];
                cachedItemCount = cachedItems.length;
                setFollowUps(cachedItems);
                setHasMore(Boolean(cached.value.hasMore));
                setPage(Number(cached.value.page || 1));
                if (typeof cached.t === "number") lastFetch.current = cached.t;
                if (!showIndicator) setIsLoading(false);
            }
        }

        if (refresh) {
            const shouldFetch =
                force ||
                !isFresh(cached, FOLLOWUPS_CACHE_TTL_MS) ||
                // If cache is empty, always fetch to avoid "blank list until manual refresh".
                cachedItemCount === 0;
            if (!shouldFetch) return;
            if (showIndicator) setIsLoading(true);
            setPage(1);
            setHasMore(true);
        } else {
            if (!hasMore || isLoadingMore) return;
            setIsLoadingMore(true);
        }
        try {
            const pg = refresh ? 1 : page;
            const monthRange = getMonthDateRange(effectiveSelectedDate);
            const filterDate = tabUsesExactDateFilter(tab)
                ? effectiveSelectedDate
                : "";
            if (tab === "Today" || tab === "Sales") {
                const loadMissedAlertForToday =
                    tab === "Today" &&
                    effectiveSelectedDate === toIso(new Date()) &&
                    refresh;

                const [enquiryRes, todayFuRes, missedFuRes] = await Promise.all(
                    [
                        enquiryService.getAllEnquiries(
                            pg,
                            20,
                            effectiveSearchQuery.trim(),
                            "",
                            "",
                            effectiveSelectedDate,
                        ),
                        loadMissedAlertForToday
                            ? followupService.getFollowUps(
                                  "Today",
                                  1,
                                  300,
                                  effectiveSelectedDate,
                              )
                            : Promise.resolve(null),
                        loadMissedAlertForToday
                            ? followupService.getFollowUps(
                                  "Missed",
                                  1,
                                  300,
                                  effectiveSelectedDate,
                              )
                            : Promise.resolve(null),
                    ],
                );
                let data = [],
                    total = 1;
                if (Array.isArray(enquiryRes)) {
                    data = enquiryRes;
                } else if (enquiryRes?.data) {
                    data = enquiryRes.data;
                    total = enquiryRes.pagination?.pages || 1;
                }
                if (rid !== fetchIdRef.current) return;

                const allowedStatuses =
                    tab === "Sales"
                        ? ["Converted"]
                        : ["New", "Contacted", "Interested"];

                let missedKeySet = null;
                if (loadMissedAlertForToday) {
                    missedKeySet = new Set();
                    const pick = (res) =>
                        Array.isArray(res?.data)
                            ? res.data
                            : Array.isArray(res)
                              ? res
                              : [];
                    const fuItems = [...pick(todayFuRes), ...pick(missedFuRes)];
                    for (const fu of fuItems) {
                        try {
                            const iso = getFollowUpCalendarDate(fu);
                            if (iso !== effectiveSelectedDate) continue;
                            if (getCalendarSummaryBucket(fu) !== "missed")
                                continue;
                            const key = String(
                                fu?.enqId || fu?.enqNo || fu?._id || "",
                            ).trim();
                            if (key) missedKeySet.add(key);
                        } catch {
                            /* ignore */
                        }
                    }
                }

                data = data
                    .map(mapEnquiryToFollowUpCard)
                    .map((item) => {
                        if (!missedKeySet) return item;
                        const key = String(
                            item?.enqId || item?.enqNo || item?._id || "",
                        ).trim();
                        return {
                            ...item,
                            hasMissedActivity: Boolean(
                                key && missedKeySet.has(key),
                            ),
                        };
                    })
                    .filter((item) =>
                        allowedStatuses.includes(normalizeStatus(item?.status)),
                    );
                data = dedupeByLatestActivity(data);
                const nextHasMore = Array.isArray(enquiryRes)
                    ? false
                    : pg < total;
                const nextItems = refresh
                    ? data
                    : mergeUniqueFollowUpCards(followUps, data);
                const nextPage = refresh
                    ? data.length > 0 && pg < total
                        ? 2
                        : 1
                    : pg + 1;

                setHasMore(nextHasMore);
                setFollowUps(nextItems);
                if (refresh) fetchTabCounts(effectiveSelectedDate);
                lastFetch.current = Date.now();
                setPage(nextPage);
                await setCacheEntry(
                    cacheKey,
                    {
                        items: nextItems,
                        hasMore: nextHasMore,
                        page: nextPage,
                    },
                    { tags: ["followups"] },
                ).catch(() => {});
                return;
            }
            const requestParams = tab === "All" ? monthRange : {};
            const res = await followupService.getFollowUps(
                tab,
                pg,
                20,
                filterDate,
                requestParams,
            );
            let data = [],
                total = 1;
            if (Array.isArray(res)) {
                data = res;
            } else if (res?.data) {
                data = res.data;
                total = res.pagination?.pages || 1;
            }
            if (rid !== fetchIdRef.current) return;
            if (tab === "All") {
                data = data.filter((item) => {
                    const s = String(item?.status || "").trim();
                    const es = String(item?.enquiryStatus || "").trim();
                    return !(s === "Completed" && es === "Missed");
                });
            }
            data = data.map(mapFollowUpItemToEnquiryCard);
            if (refresh && tab === "All") {
                try {
                    const enquiryRes = await enquiryService.getAllEnquiries(
                        1,
                        500,
                        effectiveSearchQuery.trim(),
                        "",
                        "",
                        "",
                        monthRange,
                    );
                    const enquiryItems = Array.isArray(enquiryRes?.data)
                        ? enquiryRes.data
                        : Array.isArray(enquiryRes)
                          ? enquiryRes
                          : [];
                    const existingKeys = new Set(
                        (data || [])
                            .map((item) =>
                                String(
                                    item?.enqId ||
                                        item?.enqNo ||
                                        item?._id ||
                                        "",
                                ).trim(),
                            )
                            .filter(Boolean),
                    );
                    const enquiryBackfillItems = enquiryItems
                        .map(mapEnquiryToFollowUpCard)
                        .filter((item) =>
                            [
                                "New",
                                "Contacted",
                                "Interested",
                                "Converted",
                            ].includes(normalizeStatus(item?.status)),
                        )
                        .filter((item) => {
                            const key = String(
                                item?.enqId || item?.enqNo || item?._id || "",
                            ).trim();
                            return key && !existingKeys.has(key);
                        });
                    data = [...enquiryBackfillItems, ...data];
                } catch (_error) {
                    // If enquiry-side fetch fails, keep follow-up data working normally.
                }
            }
            if (effectiveSearchQuery.trim()) {
                const q = effectiveSearchQuery.trim().toLowerCase();
                data = data.filter(
                    (item) =>
                        String(item?.name || "")
                            .toLowerCase()
                            .includes(q) ||
                        String(item?.mobile || "")
                            .toLowerCase()
                            .includes(q) ||
                        String(item?.enqNo || "")
                            .toLowerCase()
                            .includes(q),
                );
            }
            data = dedupeByLatestActivity(data);
            const nextHasMore = Array.isArray(res) ? false : pg < total;
            const nextItems = refresh
                ? data
                : mergeUniqueFollowUpCards(followUps, data);
            const nextPage = refresh
                ? data.length > 0 && pg < total
                    ? 2
                    : 1
                : pg + 1;

            setHasMore(nextHasMore);
            setFollowUps(nextItems);
            if (refresh) fetchTabCounts(filterDate || effectiveSelectedDate);
            lastFetch.current = Date.now();
            setPage(nextPage);
            await setCacheEntry(
                cacheKey,
                {
                    items: nextItems,
                    hasMore: nextHasMore,
                    page: nextPage,
                },
                { tags: ["followups"] },
            ).catch(() => {});
        } catch (e) {
            // FIX #5: Handle AbortError silently (expected when request cancelled)
            if (e?.name === "AbortError") {
                console.log(
                    "[FollowUpScreen] Request cancelled due to new request",
                );
                return;
            }
            console.error("[FollowUpScreen] fetchFollowUps error:", e);
        } finally {
            if (rid === fetchIdRef.current) {
                setIsLoading(false);
                setIsLoadingMore(false);
                setIsRefreshing(false);
            }
        }
    };

    const handleTabChange = (tab) => {
        if (tab === activeTab) return;
        fetchIdRef.current++;
        setFollowUps([]);
        setIsLoading(true);
        setPage(1);
        setHasMore(true);
        lastFetch.current = 0;
        setActiveTab(tab);
        fetchFollowUps(tab, true);
    };

    // ── Open detail ───────────────────────────────────────────────────────────
    const openDetail = useCallback(async (item) => {
        const reqId = ++detailLoadReqIdRef.current;
        setDetailHistory([]);
        setHistoryLoading(true);
        const sourceFollowUpId = getFollowUpDocumentId(item);
        detailSourceFollowUpIdRef.current = sourceFollowUpId;
        detailSourceWasMissedRef.current =
            Boolean(sourceFollowUpId) &&
            normalizeStatus(item?.status) === "Missed";
        const fb = {
            _id: item.enqId || item._id,
            enqId: item.enqId || item._id,
            name: item.name || "Unknown",
            mobile: item.mobile || "N/A",
            enqNo: item.enqNo || "N/A",
            status: item.status || "New",
            product: item.product || "N/A",
            source: item.source || "N/A",
            address: item.address || "N/A",
            image: item.image || null,
            createdAt: item.createdAt || null,
            enquiryDateTime: item.enquiryDateTime || null,
            lastContactedAt: item.lastContactedAt || null,
            nextFollowUpDate: item.nextFollowUpDate || null,
            latestFollowUpDate: item.latestFollowUpDate || null,
            requirements: item.requirements || "",
        };
        // reset composer state for this enquiry
        setEditRemarks("");
        setEditActivityType("Phone Call");
        setEditStatus(getRecommendedNextStatus(item?.status || "New"));
        setEditNextDate("");
        setEditNextTime("");
        setEditTimeMeridian("AM");
        setEditAmount("");
        setEditFollowUpId(null);
        setDetailEnquiry(fb);
        setSelectedEnquiry(fb);
        try {
            const full = await enquiryService.getEnquiryById(
                item.enqId || item._id || item.enqNo,
            );
            if (reqId === detailLoadReqIdRef.current) {
                setDetailEnquiry(full || fb);
                setSelectedEnquiry(full || fb);
                setEditStatus(
                    getRecommendedNextStatus((full || fb)?.status || "New"),
                );
            }
        } catch {
            if (reqId === detailLoadReqIdRef.current) {
                setDetailEnquiry(fb);
                setSelectedEnquiry(fb);
            }
        }
        try {
            const hist = await followupService.getFollowUpHistory(
                item.enqId || item._id || item.enqNo,
            );
            if (reqId === detailLoadReqIdRef.current) {
                setDetailHistory(Array.isArray(hist) ? hist : []);
            }
        } catch {
            if (reqId === detailLoadReqIdRef.current) setDetailHistory([]);
        } finally {
            if (reqId === detailLoadReqIdRef.current) setHistoryLoading(false);
        }
    }, []);

    const resetFollowUpComposer = useCallback(() => {
        setEditRemarks("");
        setEditActivityType("Phone Call");
        setEditStatus("Contacted");
        setEditNextDate("");
        setEditNextTime("");
        setEditTimeMeridian("AM");
        setEditAmount("");
        setEditFollowUpId(null);
    }, []);

    const refreshDetailHistory = useCallback(async () => {
        if (!detailEnquiry) return;
        const reqId = ++detailHistoryReqIdRef.current;
        try {
            setHistoryLoading(true);
            const hist = await followupService.getFollowUpHistory(
                detailEnquiry.enqId || detailEnquiry._id || detailEnquiry.enqNo,
                { force: true },
            );
            if (reqId === detailHistoryReqIdRef.current) {
                setDetailHistory(Array.isArray(hist) ? hist : []);
            }
            console.log(
                `[FollowUpScreen] ✓ Detail history refreshed: ${hist?.length || 0} items`,
            );
        } catch (error) {
            console.error(
                "[FollowUpScreen] Error refreshing history:",
                error?.message || error,
            );
            if (reqId === detailHistoryReqIdRef.current) setDetailHistory([]);
        } finally {
            if (reqId === detailHistoryReqIdRef.current)
                setHistoryLoading(false);
        }
    }, [detailEnquiry]);

    const refreshDetailEnquiry = useCallback(async () => {
        if (!detailEnquiry) return;
        try {
            const full = await enquiryService.getEnquiryById(
                detailEnquiry.enqId || detailEnquiry._id || detailEnquiry.enqNo,
                { force: true },
            );
            if (full) {
                setDetailEnquiry(full);
                setSelectedEnquiry(full);
            }
        } catch (_error) {
            // ignore refresh errors
        }
    }, [detailEnquiry]);

    useEffect(() => {
        if (!detailEnquiry) return undefined;

        const matchesDetail = (payload) => {
            const d = payload?.item || payload || {};
            const pEnqId = String(d?.enqId?._id || d?.enqId || "").trim();
            const pEnqNo = String(d?.enqNo || "").trim();
            const deqId = String(
                detailEnquiry?.enqId || detailEnquiry?._id || "",
            ).trim();
            const deqNo = String(detailEnquiry?.enqNo || "").trim();
            if (pEnqId && deqId && pEnqId === deqId) return true;
            if (pEnqNo && deqNo && pEnqNo === deqNo) return true;
            return false;
        };

        const unsub = onAppEvent(APP_EVENTS.FOLLOWUP_CHANGED, (payload) => {
            if (!matchesDetail(payload)) return;
            debounceByKey(
                "followup-detail-refresh",
                () => {
                    Promise.resolve(refreshDetailEnquiry?.()).catch(() => {});
                    Promise.resolve(refreshDetailHistory?.()).catch(() => {});
                },
                250,
            );
        });

        return () => {
            cancelDebounceKey("followup-detail-refresh");
            unsub();
        };
    }, [detailEnquiry, refreshDetailEnquiry, refreshDetailHistory]);

    const handleEditScheduledFollowUp = useCallback((item) => {
        if (!item) {
            setEditFollowUpId(null);
            return;
        }
        const followUpId = getFollowUpDocumentId(item);
        if (!followUpId) return;
        setEditFollowUpId(followUpId);
        setEditRemarks(String(item?.remarks || item?.note || ""));
        setEditActivityType(item?.activityType || item?.type || "Phone Call");
        setEditStatus(getHistoryEditStatus(item));
        const nextDate =
            item?.nextFollowUpDate || item?.followUpDate || item?.date || "";
        setEditNextDate(nextDate);
        const rawTime = String(item?.time || "").trim();
        setEditNextTime(rawTime);
        setEditAmount(
            item?.amount != null && item?.amount !== 0
                ? String(item.amount)
                : "",
        );
        if (rawTime) {
            const [hoursRaw, minutesRaw] = rawTime.split(":");
            const hours = Number(hoursRaw);
            const minutes = Number(minutesRaw);
            if (Number.isFinite(hours) && Number.isFinite(minutes)) {
                const nextTime = new Date();
                nextTime.setHours(hours, minutes, 0, 0);
                setTimePickerValue(nextTime);
                setEditTimeMeridian(hours >= 12 ? "PM" : "AM");
            }
        }
    }, []);

    // ── Save follow-up ────────────────────────────────────────────────────────
    const handleSaveEdit = async () => {
        if (!selectedEnquiry) return;
        if (!editRemarks.trim()) {
            Alert.alert("Required", "Enter follow-up remarks");
            return;
        }
        if (
            ["New", "Contacted", "Interested", "Missed"].includes(editStatus) &&
            !editNextDate
        ) {
            Alert.alert("Required", "Enter next follow-up date");
            return;
        }
        if (editStatus === "Converted" && !editAmount) {
            Alert.alert("Required", "Enter amount");
            return;
        }
        setIsSavingEdit(true);
        try {
            const sourceFollowUpId = detailSourceFollowUpIdRef.current;
            const sourceHistoryRow = Array.isArray(detailHistory)
                ? detailHistory.find(
                      (row) => getFollowUpDocumentId(row) === sourceFollowUpId,
                  )
                : null;
            const isRescheduleFromMissed =
                !editFollowUpId &&
                detailSourceWasMissedRef.current &&
                Boolean(sourceFollowUpId) &&
                Boolean(sourceHistoryRow) &&
                Boolean(editNextDate) &&
                ["New", "Contacted", "Interested"].includes(editStatus);
            const effectiveStatus = editStatus;
            const remarks =
                editStatus === "Converted"
                    ? editRemarks
                        ? `${editRemarks} | Sales: ₹${editAmount}`
                        : `Sales: ₹${editAmount}`
                    : editRemarks;
            const rawAT =
                selectedEnquiry.assignedTo?._id || selectedEnquiry.assignedTo;
            const atId = typeof rawAT === "string" ? rawAT : "";
            const todayIso = toIso(new Date());
            const usesScheduledDate = [
                "New",
                "Contacted",
                "Interested",
            ].includes(effectiveStatus);
            const effDate = usesScheduledDate
                ? editNextDate || todayIso
                : todayIso;
            const nextAction =
                effectiveStatus === "Converted"
                    ? "Sales"
                    : ["Not Interested", "Closed"].includes(effectiveStatus)
                      ? "Drop"
                      : "Followup";
            const fuState =
                nextAction === "Sales"
                    ? "Completed"
                    : nextAction === "Drop"
                      ? "Drop"
                      : "Scheduled";
            const payload = {
                enqId: selectedEnquiry._id,
                enqNo: selectedEnquiry.enqNo,
                name: selectedEnquiry.name,
                mobile: selectedEnquiry.mobile,
                product: selectedEnquiry.product,
                image: selectedEnquiry.image,
                ...(atId ? { assignedTo: atId } : {}),
                activityType: editActivityType,
                type: editActivityType,
                enquiryStatus: effectiveStatus,
                note: remarks,
                remarks,
                date: effDate,
                ...(editNextTime ? { time: editNextTime } : {}),
                followUpDate: effDate,
                nextFollowUpDate: effDate,
                nextAction,
                status: fuState,
                ...(effectiveStatus === "Converted"
                    ? {
                          amount:
                              Number(
                                  editAmount.toString().replace(/[^0-9.]/g, ""),
                              ) || 0,
                      }
                    : {}),
            };
            if (isRescheduleFromMissed) {
                // Create the new follow-up first (so the new timeline always exists),
                // then archive the old missed schedule so it no longer appears in Today/Missed.
                await followupService.createFollowUp(payload);
                try {
                    await followupService.updateFollowUp(sourceFollowUpId, {
                        status: "Completed",
                        enquiryStatus: "Missed",
                    });
                } catch (archiveError) {
                    const archiveStatus = Number(
                        archiveError?.response?.status || 0,
                    );
                    if (archiveStatus !== 404) throw archiveError;
                    console.warn(
                        "[FollowUpScreen] Source missed follow-up already unavailable during archive step",
                    );
                }
            } else if (editFollowUpId) {
                await followupService.updateFollowUp(editFollowUpId, payload);
            } else {
                await followupService.createFollowUp(payload);
            }
            await enquiryService.updateEnquiry(
                selectedEnquiry._id || selectedEnquiry.enqNo,
                {
                    status: effectiveStatus,
                    ...(effectiveStatus === "Converted"
                        ? {
                              cost:
                                  Number(
                                      editAmount
                                          .toString()
                                          .replace(/[^0-9.]/g, ""),
                                  ) || 0,
                              conversionDate: new Date(),
                          }
                        : {}),
                },
            );

            Promise.resolve(
                notificationService.cancelNotificationsForEnquiry?.({
                    enqId: selectedEnquiry._id,
                    enqNo: selectedEnquiry.enqNo,
                }),
            ).catch(() => {});
            // FIX #15b: Emit event so listeners refresh the list
            emitEnquiryUpdated();

            const focusDate = effDate || toIso(new Date());
            const today = toIso(new Date());
            const focusTab =
                focusDate === today
                    ? "Today"
                    : tabUsesExactDateFilter(activeTab)
                      ? activeTab
                      : "All";

            if (isRescheduleFromMissed) {
                setShowMissedModal(false);
                setSelectedDate(focusDate);
                setActiveTab(focusTab);
            }
            // FIX #14: Clear entire list and refresh to properly handle status changes
            // across tabs (e.g., drop → contacted). Old approach only refreshed activeTab,
            // but item stayed in old section if status changed to different category.
            setFollowUps([]);
            lastFetch.current = 0;
            fetchFollowUps(focusTab || activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: false,
                selectedDate: focusDate,
            });
            if (
                ["Contacted", "Interested", "Converted"].includes(
                    effectiveStatus,
                )
            )
                confettiRef.current?.play?.();
            resetFollowUpComposer();
            setSelectedEnquiry(null);
            setDetailEnquiry(null);
            Alert.alert(
                "Success",
                editFollowUpId
                    ? "Scheduled follow-up updated successfully."
                    : "Follow-up saved successfully.",
            );
        } catch (e) {
            const message =
                e?.response?.data?.message ||
                e?.response?.data?.error ||
                e?.message ||
                "Could not save";
            Alert.alert("Error", String(message));
        } finally {
            setIsSavingEdit(false);
        }
    };

    // ── Call / call log ───────────────────────────────────────────────────────
    const handlePullToRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                Promise.resolve(refreshDetailEnquiry?.()),
                Promise.resolve(refreshDetailHistory?.()),
            ]);
            setPanelRefreshNonce((n) => n + 1);
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshDetailEnquiry, refreshDetailHistory]);

    const handleStartContactCall = useCallback(async (enquiry) => {
        const digits = String(enquiry?.mobile || "").replace(/\D/g, "");
        if (!digits) {
            Alert.alert(
                "Missing number",
                "This enquiry does not have a valid phone number.",
            );
            return;
        }

        const resetCallState = () => {
            setCallStarted(false);
            setCallStartTime(null);
            setCallEnquiry(null);
        };

        setCallEnquiry(enquiry);
        setCallStarted(true);
        setCallStartTime(Date.now());
        try {
            if (
                Platform.OS === "android" &&
                RNImmediatePhoneCall?.immediatePhoneCall
            ) {
                const {
                    ensurePhoneCallPermission,
                } = require("../utils/phoneCallPermissions");
                const { granted } = await ensurePhoneCallPermission();
                if (!granted) {
                    Alert.alert(
                        "Permission required",
                        "Allow Phone permission to place direct calls from the app.",
                        [
                            {
                                text: "Cancel",
                                style: "cancel",
                                onPress: () => resetCallState(),
                            },
                            {
                                text: "Open dialer",
                                onPress: () =>
                                    Linking.openURL(`tel:${digits}`).catch(
                                        () => {},
                                    ),
                            },
                        ],
                    );
                    return;
                }
                RNImmediatePhoneCall.immediatePhoneCall(digits);
                return;
            }

            if (Platform.OS === "android") {
                const {
                    ensurePhoneCallPermission,
                } = require("../utils/phoneCallPermissions");
                const { granted } = await ensurePhoneCallPermission();
                if (granted) {
                    try {
                        const IntentLauncher = require("expo-intent-launcher");
                        await IntentLauncher.startActivityAsync(
                            "android.intent.action.CALL",
                            { data: `tel:${digits}` },
                        );
                        return;
                    } catch (_intentErr) {
                        // fall through to tel: scheme
                    }
                } else {
                    Alert.alert(
                        "Permission required",
                        "Allow Phone permission to place direct calls from the app.",
                        [
                            {
                                text: "Cancel",
                                style: "cancel",
                                onPress: () => resetCallState(),
                            },
                            {
                                text: "Open dialer",
                                onPress: () =>
                                    Linking.openURL(`tel:${digits}`).catch(
                                        () => {},
                                    ),
                            },
                        ],
                    );
                    return;
                }
            }

            await Linking.openURL(`tel:${digits}`);
        } catch (_error) {
            resetCallState();
            Alert.alert("Call failed", "Could not start the phone call.");
        }
    }, []);

    // ── Date/time pickers ─────────────────────────────────────────────────────
    const showDatePicker = (target = "add") => {
        setDatePickerTarget(target);
        const baseDate =
            target === "filter"
                ? selectedDate
                : editNextDate || selectedDate || toIso(new Date());
        setCalendarMonth(toMonthKey(baseDate || new Date()));
        setDatePickerVisible(true);
    };
    const handleConfirmDate = (date) => {
        const v = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        if (datePickerTarget === "filter") {
            setSelectedDate(v);
            const missedCount = Number(calendarDateSummary?.[v]?.missed || 0);
            if (missedCount > 0) {
                setShowMissedModal(true);
                loadMissedModalItems(v);
            }
        } else {
            setEditNextDate(v);
            const now = new Date();
            setTimePickerValue(now);
            setEditNextTime(formatTime(now));
            setEditTimeMeridian(now.getHours() >= 12 ? "PM" : "AM");
            if (Platform.OS !== "web") setTimePickerVisible(true);
        }
        setTimeout(() => setDatePickerVisible(false), 100);
    };
    // OPTIMIZATION: Cache for calendar summaries by month (FIX: Faster calendar updates)
    const calendarSummaryCacheRef = useRef({});

    useEffect(() => {
        if (!isDatePickerVisible) return;
        let active = true;
        const loadCalendarSummary = async () => {
            try {
                // OPTIMIZATION FIX: Check cache first (short TTL for current month so M+/F+ stays fresh)
                const cacheEntry =
                    calendarSummaryCacheRef.current[calendarMonth];
                const isCurrentMonth = calendarMonth === toMonthKey(new Date());
                const cacheTtlMs = isCurrentMonth ? 15000 : 5 * 60 * 1000;
                if (
                    cacheEntry?.value &&
                    Number.isFinite(cacheEntry?.at) &&
                    Date.now() - cacheEntry.at < cacheTtlMs
                ) {
                    setCalendarDateSummary(cacheEntry.value);
                    return;
                }

                const start = Date.now();
                const monthRange = getMonthDateRange(`${calendarMonth}-01`);

                // OPTIMIZATION FIX: Reduced from 250 → 100 items
                // Most months won't have more than 100 followups anyway
                const allRes = await followupService.getFollowUps(
                    "All",
                    1,
                    100,
                    "",
                    monthRange,
                );
                if (!active) return;
                const allItems = Array.isArray(allRes?.data) ? allRes.data : [];

                // OPTIMIZATION FIX: Build summary with optimized loop
                const summary = {};
                for (let i = 0; i < allItems.length; i++) {
                    const item = allItems[i];
                    const iso = getFollowUpCalendarDate(item);
                    if (!iso || toMonthKey(iso) !== calendarMonth) continue;

                    if (!summary[iso]) {
                        summary[iso] = {
                            followup: 0,
                            missed: 0,
                            sales: 0,
                            drop: 0,
                            notInterested: 0,
                        };
                    }

                    // Use the same bucket logic as list view so counts stay consistent
                    // (e.g., when a due time passes, M+ increases and F+ reduces).
                    const bucket = getCalendarSummaryBucket(item);
                    if (bucket === "missed") summary[iso].missed += 1;
                    else if (bucket === "sales") summary[iso].sales += 1;
                    else if (bucket === "drop") summary[iso].drop += 1;
                    else if (bucket === "notInterested")
                        summary[iso].notInterested += 1;
                    else summary[iso].followup += 1;
                }

                // OPTIMIZATION FIX: Cache the result per month
                calendarSummaryCacheRef.current[calendarMonth] = {
                    at: Date.now(),
                    value: summary,
                };
                const elapsed = Date.now() - start;
                console.log(
                    `[Calendar] Summary loaded: ${summary ? Object.keys(summary).length : 0} days (${elapsed}ms)`,
                );
                setCalendarDateSummary(summary);
            } catch (_error) {
                console.error("[Calendar] Load error:", _error.message);
                if (active) setCalendarDateSummary({});
            }
        };
        loadCalendarSummary();
        return () => {
            active = false;
        };
    }, [isDatePickerVisible, calendarMonth]);
    const handleConfirmTime = (event, d) => {
        if (Platform.OS === "android") {
            if (event?.type === "dismissed") {
                setTimePickerVisible(false);
                return;
            }
            if (d) {
                const t = formatTime(d);
                setEditNextTime(t);
                setEditTimeMeridian(d.getHours() >= 12 ? "PM" : "AM");
            }
            setTimePickerVisible(false);
            return;
        }
        if (d) {
            const t = formatTime(d);
            setEditNextTime(t);
            setEditTimeMeridian(d.getHours() >= 12 ? "PM" : "AM");
        }
    };
    const calMarkedDates = useMemo(() => {
        const target =
            datePickerTarget === "filter"
                ? selectedDate
                : editNextDate || selectedDate;
        const today = toIso(new Date());
        const m = {
            [target]: {
                selected: true,
                selectedColor: C.primary,
                selectedTextColor: "#fff",
            },
        };
        if (today !== target) m[today] = { marked: true, dotColor: C.teal };
        return m;
    }, [selectedDate, editNextDate, datePickerTarget]);

    const renderItem = useCallback(
        ({ item, index }) => (
            <FUCard item={item} index={index} onSwipe={openDetail} sc={sc} />
        ),
        [openDetail, sc],
    );
    const keyExtractor = useCallback((item, i) => {
        // Keep keys stable per enquiry to avoid unmount/mount flicker when status/date changes
        // (which can look like UI "blur" or broken separator lines on Android).
        return String(
            item?.listKey ||
                item?.enqId ||
                item?.enqNo ||
                item?._id ||
                `item-${i}`,
        );
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: C.bg }}
            edges={["top"]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
            <ConfettiBurst ref={confettiRef} topOffset={0} />

            <AppSideMenu
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
                navigation={navigation}
                user={user}
                onLogout={() => {
                    setMenuVisible(false);
                    setShowLogoutModal(true);
                }}
                activeRouteName="FollowUp"
                resolveImageUrl={getImageUrl}
            />

            {/* Logout */}
            <Modal
                visible={showLogoutModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowLogoutModal(false)}>
                <View style={MS.center}>
                    <MotiView
                        from={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={MS.logoutBox}>
                        <View style={MS.logoutIcon}>
                            <Ionicons
                                name="log-out-outline"
                                size={26}
                                color={C.danger}
                            />
                        </View>
                        <Text style={MS.logoutTitle}>Sign Out?</Text>
                        <Text style={MS.logoutSub}>
                            You&apos;ll need to log in again to access your
                            data.
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                gap: 10,
                                width: "100%",
                            }}>
                            <TouchableOpacity
                                style={MS.logoutCancel}
                                onPress={() => setShowLogoutModal(false)}>
                                <Text
                                    style={{
                                        fontSize: 14,
                                        fontWeight: "700",
                                        color: C.textMuted,
                                    }}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={async () => {
                                    setShowLogoutModal(false);
                                    await logout();
                                }}
                                style={{ flex: 1 }}>
                                <LinearGradient
                                    colors={GRAD.danger}
                                    style={MS.logoutConfirm}>
                                    <Text
                                        style={{
                                            fontSize: 14,
                                            fontWeight: "700",
                                            color: "#fff",
                                        }}>
                                        Sign Out
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </MotiView>
                </View>
            </Modal>

            {/* ── Header ── */}
            <View style={[MS.header, { paddingHorizontal: sc.hPad }]}>
                <View style={MS.headerTop}>
                    <TouchableOpacity
                        style={MS.headerBtn}
                        onPress={() => setMenuVisible(true)}>
                        <Ionicons name="menu" size={21} color={C.textSub} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text
                            style={{
                                fontSize: 11,
                                color: C.textMuted,
                                fontWeight: "600",
                                letterSpacing: 0.3,
                            }}>
                            Follow-up Center
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                            }}>
                            <Text
                                style={{
                                    fontSize: 17,
                                    color: C.text,
                                    fontWeight: "800",
                                    letterSpacing: -0.3,
                                }}>
                                {user?.name || "Follow-ups"}
                            </Text>
                            <View style={MS.resultChip}>
                                <Ionicons
                                    name="layers-outline"
                                    size={11}
                                    color={C.primaryDark}
                                />
                                <Text style={MS.resultChipText}>
                                    {followUps.length}
                                </Text>
                            </View>
                        </View>
                    </View>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                        }}>
                        <TouchableOpacity
                            style={MS.headerBtn}
                            onPress={() => {
                                setShowMissedModal(true);
                            }}>
                            <Ionicons
                                name="alert-circle-outline"
                                size={20}
                                color={
                                    missedAlertCount > 0 ? C.danger : C.textSub
                                }
                            />
                            {missedAlertCount > 0 && (
                                <View style={MS.notifBadge}>
                                    <Text style={MS.notifBadgeText}>
                                        {missedAlertCount > 9
                                            ? "9+"
                                            : missedAlertCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={MS.headerBtn}
                            onPress={() => {
                                setShowDroppedModal(true);
                            }}>
                            <Ionicons
                                name="archive-outline"
                                size={20}
                                color={
                                    droppedAlertCount > 0
                                        ? C.textMuted
                                        : C.textSub
                                }
                            />
                            {droppedAlertCount > 0 && (
                                <View style={[MS.notifBadge, MS.dropBadge]}>
                                    <Text style={MS.notifBadgeText}>
                                        {droppedAlertCount > 9
                                            ? "9+"
                                            : droppedAlertCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                {/* Search */}
                <View style={MS.searchBar}>
                    <Ionicons
                        name="search-outline"
                        size={17}
                        color={C.textMuted}
                        style={{ marginLeft: 12 }}
                    />
                    <TextInput
                        style={MS.searchInput}
                        placeholder="Search enquiries…"
                        placeholderTextColor={C.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    <TouchableOpacity
                        onPress={() => showDatePicker("filter")}
                        style={MS.dateBtn}>
                        <Ionicons
                            name="calendar-outline"
                            size={15}
                            color={C.primary}
                        />
                        <Text
                            style={{
                                fontSize: 11,
                                color: C.primaryDark,
                                fontWeight: "700",
                            }}>
                            {activeTab === "All"
                                ? fmtMonthYear(selectedDate)
                                : tabUsesExactDateFilter(activeTab)
                                  ? fmtDate(selectedDate)
                                  : "All dates"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Status pills ── */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={MS.tabScroll}
                contentContainerStyle={{
                    paddingHorizontal: sc.hPad,
                    paddingVertical: 8,
                    gap: 6,
                }}>
                {STATUS_TABS.map((t) => {
                    const active = activeTab === t.value;
                    const accent = t.color || C.primary;
                    const count = Number(tabCounts?.[t.value] || 0);
                    const isToday = t.value === "Today";
                    return (
                        <TouchableOpacity
                            key={t.value}
                            onPress={() => handleTabChange(t.value)}
                            style={[
                                MS.tabPill,
                                active && {
                                    backgroundColor: accent + "16",
                                    borderColor: accent,
                                    borderWidth: isToday && active ? 2 : 1,
                                    shadowColor:
                                        isToday && active
                                            ? accent
                                            : "transparent",
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: isToday && active ? 0.15 : 0,
                                    shadowRadius: 4,
                                    elevation: isToday && active ? 3 : 0,
                                },
                            ]}
                            activeOpacity={0.8}>
                            <View
                                style={[
                                    MS.tabIconWrap,
                                    {
                                        backgroundColor: active
                                            ? accent + "24"
                                            : C.divider,
                                    },
                                ]}>
                                <Ionicons
                                    name={t.icon}
                                    size={12}
                                    color={active ? accent : C.textMuted}
                                />
                            </View>
                            <Text
                                style={[
                                    MS.tabText,
                                    active && {
                                        color: accent,
                                        fontWeight: "800",
                                    },
                                ]}>
                                {t.label}
                            </Text>
                            <View
                                style={[
                                    MS.tabCount,
                                    {
                                        backgroundColor: active
                                            ? accent
                                            : C.divider,
                                    },
                                ]}>
                                <Text
                                    style={[
                                        MS.tabCountText,
                                        {
                                            color: active
                                                ? "#fff"
                                                : C.textMuted,
                                        },
                                    ]}>
                                    {count > 99 ? "99+" : count}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Feature #2: Auto-load pagination on scroll (using FlatList) */}
            <FlatList
                data={followUps}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={[
                    {
                        paddingHorizontal: sc.hPad,
                        paddingTop: 10,
                        paddingBottom: 90,
                        backgroundColor:
                            activeTab === "Today" ? "#F5F3FF" : C.bg,
                    },
                    followUps.length === 0 && { flexGrow: 1 },
                ]}
                refreshing={isRefreshing}
                onRefresh={() => {
                    setIsRefreshing(true);
                    fetchFollowUps(activeTab, true, {
                        force: true,
                        showIndicator: false,
                        allowCache: false,
                    }).finally(() => setIsRefreshing(false));
                }}
                // Feature #2: Auto-load pagination on scroll
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.5}
                numColumns={1}
                // Android + complex cards (shadows/animations) can flicker with clipping enabled.
                removeClippedSubviews={Platform.OS !== "android"}
                ListFooterComponent={
                    isLoadingMore ? (
                        <ActivityIndicator
                            size="small"
                            color={C.primary}
                            style={{ marginVertical: 16 }}
                        />
                    ) : null
                }
                ListEmptyComponent={
                    isLoading ? (
                        <FollowUpSkeleton />
                    ) : (
                        <View
                            style={{
                                alignItems: "center",
                                marginTop: 60,
                                gap: 8,
                            }}>
                            <View
                                style={{
                                    width: 68,
                                    height: 68,
                                    borderRadius: 20,
                                    backgroundColor: C.primarySoft,
                                    justifyContent: "center",
                                    alignItems: "center",
                                }}>
                                <Ionicons
                                    name="calendar-outline"
                                    size={32}
                                    color={C.primary}
                                />
                            </View>
                            <Text
                                style={{
                                    fontSize: 15,
                                    color: C.textSub,
                                    fontWeight: "700",
                                }}>
                                No enquiries found
                            </Text>
                            <Text style={{ fontSize: 13, color: C.textLight }}>
                                {tabUsesExactDateFilter(activeTab)
                                    ? `No ${activeTab} enquiries for this date`
                                    : `No ${activeTab} enquiries found`}
                            </Text>
                        </View>
                    )
                }
                showsVerticalScrollIndicator={false}
            />

            {/* ── Missed modal ── */}
            <Modal
                visible={showMissedModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowMissedModal(false)}>
                <TouchableOpacity
                    style={MS.center}
                    activeOpacity={1}
                    onPress={() => setShowMissedModal(false)}>
                    <TouchableOpacity activeOpacity={1} style={MS.missedCard}>
                        <View
                            style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 14,
                            }}>
                            <View>
                                <Text
                                    style={{
                                        fontSize: 17,
                                        fontWeight: "900",
                                        color: C.text,
                                    }}>
                                    Missed Activity
                                </Text>
                                <Text
                                    style={{
                                        fontSize: 12,
                                        color: C.textMuted,
                                        marginTop: 2,
                                    }}>
                                    {missedModalItems.length} items need
                                    attention
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowMissedModal(false)}
                                style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: 15,
                                    backgroundColor: C.bg,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}>
                                <Ionicons
                                    name="close"
                                    size={16}
                                    color={C.textMuted}
                                />
                            </TouchableOpacity>
                        </View>
                        {missedModalItems.length > 0 ? (
                            <ScrollView
                                style={{ maxHeight: 300 }}
                                showsVerticalScrollIndicator={false}>
                                {missedModalItems.map((item, i) => (
                                    <TouchableOpacity
                                        key={String(
                                            item?._id
                                                ? `${item._id}-${item?.status || "missed"}-${i}`
                                                : `missed-${i}`,
                                        )}
                                        onPress={() => {
                                            setShowMissedModal(false);
                                            openDetail(item);
                                        }}
                                        style={[
                                            {
                                                flexDirection: "row",
                                                alignItems: "center",
                                                paddingVertical: 11,
                                                gap: 10,
                                            },
                                            i < missedModalItems.length - 1 && {
                                                borderBottomWidth: 1,
                                                borderBottomColor: C.divider,
                                            },
                                        ]}>
                                        <View
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 10,
                                                backgroundColor:
                                                    C.danger + "12",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}>
                                            <Ionicons
                                                name="alert-circle"
                                                size={15}
                                                color={C.danger}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={{
                                                    fontSize: 13,
                                                    fontWeight: "800",
                                                    color: C.text,
                                                }}
                                                numberOfLines={1}>
                                                {item?.name || "Untitled"}
                                            </Text>
                                            <Text
                                                style={{
                                                    fontSize: 11,
                                                    color: C.textMuted,
                                                    marginTop: 2,
                                                }}
                                                numberOfLines={1}>
                                                {item?.product || "General"} ·{" "}
                                                {item?.latestFollowUpDate ||
                                                    item?.nextFollowUpDate ||
                                                    "No date"}
                                            </Text>
                                        </View>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={14}
                                            color={C.textMuted}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        ) : (
                            <View
                                style={{
                                    paddingVertical: 20,
                                    alignItems: "center",
                                    gap: 8,
                                }}>
                                <Ionicons
                                    name="checkmark-circle-outline"
                                    size={28}
                                    color={C.success}
                                />
                                <Text
                                    style={{
                                        fontSize: 14,
                                        fontWeight: "700",
                                        color: C.textSub,
                                    }}>
                                    No missed activity
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <Modal
                visible={showDroppedModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDroppedModal(false)}>
                <TouchableOpacity
                    style={MS.center}
                    activeOpacity={1}
                    onPress={() => setShowDroppedModal(false)}>
                    <TouchableOpacity activeOpacity={1} style={MS.missedCard}>
                        <View
                            style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 14,
                            }}>
                            <View>
                                <Text
                                    style={{
                                        fontSize: 17,
                                        fontWeight: "900",
                                        color: C.text,
                                    }}>
                                    Dropped Enquiries
                                </Text>
                                <Text
                                    style={{
                                        fontSize: 12,
                                        color: C.textMuted,
                                        marginTop: 2,
                                    }}>
                                    {droppedModalItems.length} items are dropped
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowDroppedModal(false)}
                                style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: 15,
                                    backgroundColor: C.bg,
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}>
                                <Ionicons
                                    name="close"
                                    size={16}
                                    color={C.textMuted}
                                />
                            </TouchableOpacity>
                        </View>
                        {droppedModalItems.length > 0 ? (
                            <ScrollView
                                style={{ maxHeight: 300 }}
                                showsVerticalScrollIndicator={false}>
                                {droppedModalItems.map((item, i) => (
                                    <TouchableOpacity
                                        key={String(
                                            item?._id
                                                ? `${item._id}-${item?.status || "dropped"}-${i}`
                                                : `dropped-${i}`,
                                        )}
                                        onPress={() => {
                                            setShowDroppedModal(false);
                                            openDetail(item);
                                        }}
                                        style={[
                                            {
                                                flexDirection: "row",
                                                alignItems: "center",
                                                paddingVertical: 11,
                                                gap: 10,
                                            },
                                            i <
                                                droppedModalItems.length -
                                                    1 && {
                                                borderBottomWidth: 1,
                                                borderBottomColor: C.divider,
                                            },
                                        ]}>
                                        <View
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 10,
                                                backgroundColor:
                                                    C.textLight + "18",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}>
                                            <Ionicons
                                                name="archive"
                                                size={15}
                                                color={C.textMuted}
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={{
                                                    fontSize: 13,
                                                    fontWeight: "800",
                                                    color: C.text,
                                                }}
                                                numberOfLines={1}>
                                                {item?.name ||
                                                    "Unnamed enquiry"}
                                            </Text>
                                            <Text
                                                style={{
                                                    fontSize: 12,
                                                    color: C.textMuted,
                                                    marginTop: 2,
                                                }}
                                                numberOfLines={1}>
                                                {[item?.enqNo, item?.mobile]
                                                    .filter(Boolean)
                                                    .join(" • ")}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        ) : (
                            <View
                                style={{
                                    paddingVertical: 18,
                                    alignItems: "center",
                                }}>
                                <Text
                                    style={{
                                        fontSize: 13,
                                        color: C.textMuted,
                                    }}>
                                    No dropped enquiries
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* ── Calendar ── */}
            <Modal
                visible={isDatePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setDatePickerVisible(false)}>
                <View style={MS.center}>
                    <View style={MS.calCard}>
                        <View style={MS.dragHandle} />
                        <Text
                            style={{
                                fontSize: 16,
                                fontWeight: "800",
                                color: C.text,
                                marginBottom: 12,
                                marginTop: 4,
                            }}>
                            {datePickerTarget === "filter"
                                ? "Filter by date"
                                : "Choose next date"}
                        </Text>
                        <Calendar
                            current={
                                datePickerTarget === "filter"
                                    ? selectedDate
                                    : editNextDate || selectedDate
                            }
                            markedDates={calMarkedDates}
                            onMonthChange={(month) => {
                                if (!month?.year || !month?.month) return;
                                setCalendarMonth(
                                    `${month.year}-${String(month.month).padStart(2, "0")}`,
                                );
                            }}
                            onDayPress={(day) => {
                                if (day?.dateString)
                                    handleConfirmDate(
                                        new Date(`${day.dateString}T00:00:00`),
                                    );
                            }}
                            enableSwipeMonths
                            hideExtraDays
                            dayComponent={({ date, state }) => {
                                const iso = date?.dateString || "";
                                const summary = calendarDateSummary[iso] || {
                                    followup: 0,
                                    missed: 0,
                                    sales: 0,
                                    drop: 0,
                                    notInterested: 0,
                                };
                                const target =
                                    datePickerTarget === "filter"
                                        ? selectedDate
                                        : editNextDate || selectedDate;
                                const isSelected = iso && iso === target;
                                const isToday = iso === toIso(new Date());
                                const isDisabled = state === "disabled";
                                return (
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        style={[
                                            MS.calDayWrap,
                                            isSelected && MS.calDayWrapSelected,
                                        ]}
                                        onPress={() => {
                                            if (!iso) return;
                                            handleConfirmDate(
                                                new Date(`${iso}T00:00:00`),
                                            );
                                        }}>
                                        <Text
                                            style={[
                                                MS.calDayText,
                                                isDisabled &&
                                                    MS.calDayTextDisabled,
                                                isToday &&
                                                    !isSelected &&
                                                    MS.calDayTextToday,
                                                isSelected &&
                                                    MS.calDayTextSelected,
                                            ]}>
                                            {date?.day}
                                        </Text>
                                        <View style={MS.calCountRow}>
                                            {/* OPTIMIZATION FIX: Show only top 3 badges (most important) */}
                                            {/* This reduces rendering complexity and speeds up calendar */}

                                            {/* Priority 1: Missed (red) - most critical */}
                                            {summary.missed > 0 ? (
                                                <View
                                                    style={[MS.calMissedBadge]}>
                                                    <Text
                                                        style={[
                                                            MS.calMissedBadgeText,
                                                        ]}>
                                                        M+{summary.missed}
                                                    </Text>
                                                </View>
                                            ) : null}

                                            {/* Priority 2: Followup (blue) - most common */}
                                            {summary.followup > 0 ? (
                                                <View
                                                    style={[
                                                        MS.calCountBadge,
                                                        isSelected &&
                                                            MS.calCountBadgeSelected,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            MS.calCountBadgeText,
                                                            isSelected &&
                                                                MS.calCountBadgeTextSelected,
                                                        ]}>
                                                        F+{summary.followup}
                                                    </Text>
                                                </View>
                                            ) : null}

                                            {/* Priority 3: Sales (green) - revenue */}
                                            {summary.sales > 0 ? (
                                                <View
                                                    style={[
                                                        MS.calSalesBadge,
                                                        isSelected &&
                                                            MS.calStatusBadgeSelected,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            MS.calSalesBadgeText,
                                                            isSelected &&
                                                                MS.calStatusBadgeTextSelected,
                                                        ]}>
                                                        S+{summary.sales}
                                                    </Text>
                                                </View>
                                            ) : null}

                                            {/* Show "+" indicator if there are hidden badges (Drop + Not Interested) */}
                                            {summary.drop > 0 ||
                                            summary.notInterested > 0 ? (
                                                <View
                                                    style={[
                                                        MS.calCountBadge,
                                                        isSelected &&
                                                            MS.calCountBadgeSelected,
                                                        {
                                                            minWidth: 16,
                                                            paddingHorizontal: 3,
                                                        },
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            MS.calCountBadgeText,
                                                            isSelected &&
                                                                MS.calCountBadgeTextSelected,
                                                            {
                                                                fontSize: 9,
                                                            },
                                                        ]}>
                                                        +
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                            theme={{
                                calendarBackground: C.card,
                                dayTextColor: C.text,
                                todayTextColor: C.primary,
                                arrowColor: C.primary,
                                textDisabledColor: "#D5DBE8",
                                selectedDayBackgroundColor: C.primary,
                                selectedDayTextColor: "#fff",
                                monthTextColor: C.text,
                                textMonthFontWeight: "800",
                                textDayHeaderFontWeight: "700",
                                textDayFontWeight: "600",
                                textMonthFontSize: 16,
                            }}
                            style={{ borderRadius: 14, overflow: "hidden" }}
                        />
                        <TouchableOpacity
                            onPress={() => setDatePickerVisible(false)}
                            style={{
                                marginTop: 14,
                                paddingVertical: 12,
                                alignItems: "center",
                                borderTopWidth: 1,
                                borderTopColor: C.divider,
                            }}>
                            <Text
                                style={{
                                    color: C.danger,
                                    fontWeight: "700",
                                    fontSize: 14,
                                }}>
                                Cancel
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Detail view overlay (full screen, replaces stack nav) ── */}
            {detailEnquiry && (
                <View style={StyleSheet.absoluteFill}>
                    <DetailView
                        enquiry={detailEnquiry}
                        history={detailHistory}
                        historyLoading={historyLoading}
                        onClose={() => setDetailEnquiry(null)}
                        autoOpenFollowUpFormToken={detailAutoOpenFormToken}
                        selectedEnquiry={selectedEnquiry || detailEnquiry}
                        editRemarks={editRemarks}
                        setEditRemarks={setEditRemarks}
                        editActivityType={editActivityType}
                        setEditActivityType={setEditActivityType}
                        editStatus={editStatus}
                        setEditStatus={setEditStatus}
                        editNextDate={editNextDate}
                        editNextTime={editNextTime}
                        setEditNextTime={setEditNextTime}
                        editAmount={editAmount}
                        setEditAmount={setEditAmount}
                        editFollowUpId={editFollowUpId}
                        isSavingEdit={isSavingEdit}
                        showDatePicker={showDatePicker}
                        setTimePickerValue={setTimePickerValue}
                        setTimePickerVisible={setTimePickerVisible}
                        isTimePickerVisible={isTimePickerVisible}
                        handleConfirmTime={handleConfirmTime}
                        setEditTimeMeridian={setEditTimeMeridian}
                        timePickerValue={timePickerValue}
                        onSaveFollowUp={handleSaveEdit}
                        onEditScheduledFollowUp={handleEditScheduledFollowUp}
                        onCancelScheduledEdit={resetFollowUpComposer}
                        onStartCall={() =>
                            handleStartContactCall(detailEnquiry)
                        }
                        sc={sc}
                        currentStatus={
                            selectedEnquiry?.status || detailEnquiry?.status
                        }
                        billingInfo={billingInfo}
                        showUpgradePrompt={showUpgradePrompt}
                        activeTab={activeTab}
                        setFollowUps={setFollowUps}
                        lastFetch={lastFetch}
                        onRefreshList={async () => {
                            lastFetch.current = 0;
                            await fetchFollowUps(activeTab, true, {
                                force: true,
                                showIndicator: false,
                                allowCache: false,
                            });
                            fetchTabCounts(selectedDate).catch(() => {});
                        }}
                        refreshDetailHistory={refreshDetailHistory}
                        refreshDetailEnquiry={refreshDetailEnquiry}
                        handlePullToRefresh={handlePullToRefresh}
                    />
                </View>
            )}
        </SafeAreaView>
    );
}

// ─── Main screen styles ───────────────────────────────────────────────────────
const MS = StyleSheet.create({
    center: {
        flex: 1,
        backgroundColor: "rgba(15,23,42,0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    header: {
        backgroundColor: C.card,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    headerTop: {
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 8,
        marginBottom: 10,
    },
    headerBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: C.bg,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.border,
    },
    profileBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: C.bg,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
    },
    profileFallback: {
        flex: 1,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
    },
    resultChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.primarySoft,
        borderWidth: 1,
        borderColor: C.primaryMid,
        borderRadius: 999,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    resultChipText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primaryDark,
        minWidth: 12,
        textAlign: "center",
    },
    notifDot: {
        position: "absolute",
        top: 8,
        right: 8,
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: C.danger,
        borderWidth: 1.5,
        borderColor: C.card,
    },
    notifBadge: {
        position: "absolute",
        top: -4,
        right: -5,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 8,
        backgroundColor: C.danger,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: C.card,
    },
    notifBadgeText: {
        fontSize: 9,
        color: "#fff",
        fontWeight: "800",
        lineHeight: 11,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.bg,
        borderRadius: 12,
        height: 42,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 2,
    },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
    dateBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.primarySoft,
        borderRadius: 10,
        paddingHorizontal: 8,
        height: 34,
        marginRight: 4,
    },
    tabScroll: {
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        maxHeight: 52,
    },
    tabPill: {
        minWidth: 90,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 18,
        borderWidth: 1.25,
        borderColor: C.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.bg,
    },
    tabIconWrap: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    tabText: { fontSize: 11, fontWeight: "700", color: C.textMuted, flex: 1 },
    tabCount: {
        minWidth: 22,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    tabCountText: {
        fontSize: 10,
        fontWeight: "800",
    },
    logoutBox: {
        backgroundColor: C.card,
        borderRadius: 22,
        padding: 22,
        width: "90%",
        maxWidth: 320,
        alignItems: "center",
    },
    logoutIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: C.danger + "15",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    logoutTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: C.text,
        marginBottom: 5,
    },
    logoutSub: {
        fontSize: 13,
        color: C.textMuted,
        textAlign: "center",
        lineHeight: 20,
        marginBottom: 20,
    },
    logoutCancel: {
        flex: 1,
        height: 44,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: C.bg,
        borderWidth: 1.5,
        borderColor: C.border,
    },
    logoutConfirm: {
        flex: 1,
        height: 44,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    missedCard: {
        backgroundColor: C.card,
        borderRadius: 20,
        padding: 16,
        width: "90%",
        maxWidth: 360,
        maxHeight: "70%",
    },
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.border,
        alignSelf: "center",
        marginTop: 10,
        marginBottom: 8,
    },
    calCard: {
        backgroundColor: C.card,
        width: "100%",
        maxWidth: 360,
        borderRadius: 24,
        padding: 18,
    },
    calDayWrap: {
        minHeight: 48,
        minWidth: 40,
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: 6,
        paddingBottom: 4,
        borderRadius: 12,
    },
    calDayWrapSelected: {
        backgroundColor: C.primary,
    },
    calDayText: {
        fontSize: 14,
        fontWeight: "700",
        color: C.text,
    },
    calDayTextSelected: {
        color: "#fff",
    },
    calDayTextToday: {
        color: C.primary,
    },
    calDayTextDisabled: {
        color: "#D5DBE8",
    },
    calCountRow: {
        marginTop: 4,
        alignItems: "center",
        gap: 2,
    },
    calCountBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 999,
        backgroundColor: C.primarySoft,
    },
    calCountBadgeSelected: {
        backgroundColor: "rgba(255,255,255,0.16)",
    },
    calCountBadgeText: {
        fontSize: 8,
        fontWeight: "800",
        color: C.primaryDark,
    },
    calCountBadgeTextSelected: {
        color: "#fff",
    },
    calStatusBadgeSelected: {
        backgroundColor: "rgba(255,255,255,0.22)",
    },
    calStatusBadgeTextSelected: {
        color: "#fff",
    },
    calMissedBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 999,
        backgroundColor: C.danger,
    },
    calMissedBadgeText: {
        fontSize: 8,
        fontWeight: "800",
        color: "#fff",
    },
    calSalesBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 999,
        backgroundColor: "#DCFCE7",
    },
    calSalesBadgeText: {
        fontSize: 8,
        fontWeight: "800",
        color: C.success,
    },
    calDropBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 999,
        backgroundColor: "#E5E7EB",
    },
    calDropBadgeText: {
        fontSize: 8,
        fontWeight: "800",
        color: C.textMuted,
    },
    calNotInterestedBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 999,
        backgroundColor: C.dangerSoft || "#FEE2E2",
    },
    calNotInterestedBadgeText: {
        fontSize: 8,
        fontWeight: "800",
        color: C.danger,
    },
});
