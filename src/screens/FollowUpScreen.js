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
import { PostCallModal } from "../components/PostCallModal";
import { FollowUpSkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    setCacheEntry,
} from "../services/appCache";
import * as callLogService from "../services/callLogService";
import * as emailService from "../services/emailService";
import * as enquiryService from "../services/enquiryService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import { getLatestDeviceCallLogForNumber } from "../services/CallMonitorService";
import {
    buildFeatureUpgradeMessage,
    hasPlanFeature,
} from "../utils/planFeatures";
import { getImageUrl } from "../utils/imageHelper";
import ChatScreen from "./ChatScreen";

const AUTO_SAVE_CALL_LOGS =
    String(process.env.EXPO_PUBLIC_CALL_AUTO_SAVE ?? "false")
        .trim()
        .toLowerCase() === "true";
const FOLLOWUPS_CACHE_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_FOLLOWUPS_MS || 60000,
);

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
    const { width, height } = useWindowDimensions();
    return useMemo(() => {
        const isTablet = width >= 768;
        const isLarge = width >= 414 && width < 768;
        const isMed = width >= 375 && width < 414;
        const base = isTablet ? 16 : isLarge ? 15 : isMed ? 14 : 13;
        return {
            isTablet,
            isLarge,
            isMed,
            isSmall: width < 375,
            width,
            height,
            f: {
                xs: base - 3,
                sm: base - 1,
                base,
                md: base + 1,
                lg: base + 2,
                xl: base + 4,
                xxl: base + 7,
            },
            sp: {
                xs: isTablet ? 6 : 4,
                sm: isTablet ? 8 : 6,
                md: isTablet ? 14 : 10,
                lg: isTablet ? 20 : 14,
                xl: isTablet ? 28 : 20,
            },
            inputH: isTablet ? 56 : isLarge ? 50 : isMed ? 48 : 46,
            radius: isTablet ? 16 : 12,
            cardR: isTablet ? 20 : 14,
            hPad: isTablet ? 24 : isLarge ? 18 : 16,
            SW: width,
        };
    }, [width, height]);
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
    { key: "call", label: "Call Log", icon: "call-outline" },
    { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
    { key: "email", label: "Email", icon: "mail-outline" },
];

const DETAIL_TAB_FEATURES = {
    call: "call_logs",
    whatsapp: "whatsapp",
    email: "email",
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
                pointerEvents="none"
                style={[
                    FU.floatingLabel,
                    {
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

    const loadLogs = useCallback(async ({ force = false, showSpinner = true } = {}) => {
        if (!phoneKey && !enquiry?._id) {
            setLogs([]);
            setLoading(false);
            return;
        }

        if (showSpinner) setLoading(true);
        try {
            const result = await callLogService.getCallLogs(
                enquiry?._id
                    ? {
                          enquiryId: enquiry._id,
                          filter: "All",
                          limit: 100,
                      }
                    : {
                          search: phoneKey,
                          filter: "All",
                          limit: 100,
                      },
                { force },
            );
            const items = Array.isArray(result?.data) ? result.data : [];
            const filtered = items.filter((item) => {
                const sameEnquiry =
                    enquiry?._id && item?.enquiryId
                        ? String(item?.enquiryId?._id || item.enquiryId) ===
                          String(enquiry._id)
                        : false;
                const samePhone = phoneKey
                    ? normalizePhone(item?.phoneNumber) === phoneKey
                    : false;
                return enquiry?._id ? sameEnquiry : samePhone;
            });
            filtered.sort(
                (a, b) =>
                    new Date(b?.callTime || 0) - new Date(a?.callTime || 0),
            );
            setLogs(filtered);
        } catch (_error) {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [phoneKey, enquiry?._id]);

    useEffect(() => {
        loadLogs({ force: false }).catch(() => null);
    }, [loadLogs, refreshKey]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
            loadLogs({ force: true, showSpinner: false }).catch(() => null);
        });
        return () => sub.remove();
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
                                        {item?.duration
                                            ? `Duration ${formatCallDuration(item.duration)}`
                                            : "No duration"}
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
                const result = await emailService.getEmailLogs({
                    page: 1,
                    limit: 50,
                }, { force: Boolean(refreshKey) });
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
                emailService.getEmailLogs({ page: 1, limit: 50 }, { force: true }),
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
const mapFollowUpItemToEnquiryCard = (item = {}) => {
    const displayStatus = normalizeStatus(
        item?.enquiryStatus || item?.status || "New",
    );
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
        assignedTo: item?.assignedTo || item?.staffName || null,
        latestFollowUpDate:
            item?.nextFollowUpDate || item?.followUpDate || item?.date || null,
        nextFollowUpDate: item?.nextFollowUpDate || item?.date || null,
        followUpDate: item?.followUpDate || item?.date || null,
        date: item?.date || null,
        activityTime: item?.activityTime || item?.createdAt || null,
        createdAt: item?.createdAt || null,
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
    const latestByKey = new Map();
    for (const item of items) {
        const key = String(item?.enqId || item?.enqNo || item?._id || "");
        if (!key) continue;
        const prev = latestByKey.get(key);
        const itemTs = Math.max(
            toTs(item?.activityTime),
            toTs(item?.createdAt),
            toTs(item?.date),
        );
        const prevTs = prev
            ? Math.max(
                  toTs(prev?.activityTime),
                  toTs(prev?.createdAt),
                  toTs(prev?.date),
              )
            : -1;
        if (!prev || itemTs >= prevTs) {
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
    if (useEnquirySource) {
        const enquiryResponse = await enquiryService.getAllEnquiries(
            1,
            500,
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
        return dedupeByLatestActivity(
            enquiryItems
                .map(mapEnquiryToFollowUpCard)
                .filter((item) =>
                    allowedStatusSet.size > 0
                        ? allowedStatusSet.has(normalizeStatus(item?.status))
                        : true,
                ),
        ).length;
    }
    const response = await followupService.getFollowUps(
        tab,
        1,
        500,
        referenceDate,
        followUpParams,
    );
    const rawItems = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
    let items = rawItems.map(mapFollowUpItemToEnquiryCard);
    if (tab === "All" && includeNewEnquiries) {
        try {
            const enquiryResponse = await enquiryService.getAllEnquiries(
                1,
                500,
                "",
                "New",
                "",
                "",
                enquiryParams,
            );
            const enquiryItems = Array.isArray(enquiryResponse?.data)
                ? enquiryResponse.data
                : Array.isArray(enquiryResponse)
                  ? enquiryResponse
                  : [];
            items = [
                ...enquiryItems
                    .filter((item) => !item?.latestFollowUpDate)
                    .map(mapEnquiryToFollowUpCard),
                ...items,
            ];
        } catch (_error) {
            // Keep follow-up counts working even if enquiry lookup fails.
        }
    }
    return dedupeByLatestActivity(items).length;
};

// ─── FollowUp List Card (left-swipe → details) ────────────────────────────────
const FUCard = React.memo(function FUCard({ item, index, onSwipe, sc }) {
    const tx = useRef(new Animated.Value(0)).current;
    const norm = normalizeStatus(item?.status);
    const sCfg = statusCfg(norm);
    const cols = avatarGrad(item?.name);

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
                        useNativeDriver: true,
                    }).start(() => {
                        Animated.spring(tx, {
                            toValue: 0,
                            useNativeDriver: true,
                            tension: 110,
                            friction: 9,
                        }).start(() => {
                            onSwipe?.(item);
                        });
                    });
                } else {
                    Animated.spring(tx, {
                        toValue: 0,
                        useNativeDriver: true,
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
                    <View style={[FCS.card, { borderRadius: sc.cardR }]}>
                        <View
                            style={[
                                FCS.stripe,
                                {
                                    backgroundColor: sCfg.color,
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
                                                { backgroundColor: sCfg.color },
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
                                    style={[FCS.mobile, { fontSize: sc.f.sm }]}>
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
                                    {fmtDisplay(item.assignedTo, "Unassigned")}
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

    // Mount animation
    useEffect(() => {
        Animated.timing(mountX, {
            toValue: 0,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
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
            useNativeDriver: true,
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
    const detailPanHandlers = tabIdx === 2 ? {} : swipePan.panHandlers;
    const whatsappEdgePan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () =>
                tabRef.current === 2 && !tabGestureLockedRef.current,
            onStartShouldSetPanResponderCapture: () =>
                tabRef.current === 2 && !tabGestureLockedRef.current,
            onMoveShouldSetPanResponder: (_, g) => {
                if (tabRef.current !== 2 || tabGestureLockedRef.current)
                    return false;
                return (
                    Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1
                );
            },
            onMoveShouldSetPanResponderCapture: (_, g) => {
                if (tabRef.current !== 2 || tabGestureLockedRef.current)
                    return false;
                return (
                    Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1
                );
            },
            onPanResponderTerminationRequest: () => false,
            onPanResponderRelease: (_, g) => {
                if (tabGestureLockedRef.current || tabRef.current !== 2) return;
                if (g.dx < -56) {
                    goToTab(3);
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

                    {/* ── TAB 2: WhatsApp ── */}
                    {tabIdx === 2 && (
                        <View style={{ flex: 1, minHeight: 0 }}>
                            <ChatScreen
                                key={`followup-whatsapp-${enquiry?._id || enquiry?.enqNo || enquiry?.mobile || "chat"}-${panelRefreshNonce}`}
                                embedded
                                manualKeyboardLift={Platform.OS === "android"}
                                route={{ params: { enquiry } }}
                            />
                        </View>
                    )}

                    {/* ── TAB 2: Call Logs ── */}
                    {tabIdx === 1 && (
                        <View style={{ flex: 1 }}>
                            <FollowUpCallPanel
                                enquiry={enquiry}
                                onCallPress={onStartCall}
                                refreshKey={panelRefreshNonce}
                            />
                        </View>
                    )}

                    {/* ── TAB 4: Email ── */}
                    {tabIdx === 3 && (
                        <View style={{ flex: 1 }}>
                            <FollowUpEmailPanel enquiry={enquiry} refreshKey={panelRefreshNonce} />
                        </View>
                    )}

                    {/* ── TAB 1: Add Follow-up ── */}
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
                                                <Text style={FU.toggleBtnTitle}>
                                                    Add Follow-up
                                                </Text>
                                                <Text style={FU.toggleBtnSub}>
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

                                        {showFollowUpForm && (
                                            <>
                                                {editFollowUpId && (
                                                    <View
                                                        style={
                                                            FU.editingBanner
                                                        }>
                                                        <Ionicons
                                                            name="create-outline"
                                                            size={15}
                                                            color={C.primary}
                                                        />
                                                        <Text
                                                            style={
                                                                FU.editingBannerText
                                                            }>
                                                            Editing scheduled
                                                            follow-up
                                                        </Text>
                                                    </View>
                                                )}
                                                <View style={FU.sectionCard}>
                                                    <Text
                                                        style={FU.sectionTitle}>
                                                        Conversation Notes
                                                    </Text>
                                                    <Text style={FU.sectionSub}>
                                                        Capture the latest
                                                        update before scheduling
                                                        the next action.
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
                                                        scrollEnabled={false}
                                                    />
                                                </View>

                                                <View style={FU.sectionCard}>
                                                    <Text
                                                        style={FU.sectionTitle}>
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
                                                                        key={a}
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
                                                                            {a}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            },
                                                        )}
                                                    </ScrollView>
                                                </View>

                                                <View style={FU.sectionCard}>
                                                    <Text
                                                        style={FU.sectionTitle}>
                                                        Status & Schedule
                                                    </Text>
                                                    <View
                                                        style={{
                                                            flexDirection:
                                                                "row",
                                                            flexWrap: "wrap",
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
                                                    ].includes(editStatus) && (
                                                        <>
                                                            <Text
                                                                style={
                                                                    FU.label
                                                                }>
                                                                Next Date *
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
                                                                    size={18}
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

                                                {editStatus === "Converted" && (
                                                    <View
                                                        style={FU.sectionCard}>
                                                        <Text style={FU.label}>
                                                            Amount (₹) *
                                                        </Text>
                                                        <FloatingInput
                                                            label="Amount"
                                                            value={editAmount}
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
                                                    style={{ marginTop: 16 }}>
                                                    <LinearGradient
                                                        colors={
                                                            isSavingEdit
                                                                ? [
                                                                      "#ccc",
                                                                      "#bbb",
                                                                  ]
                                                                : GRAD.primary
                                                        }
                                                        style={FU.btnPrimary}>
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
                                                        disabled={isSavingEdit}
                                                        style={FU.btnSecondary}>
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
                                            ) : history.length === 0 ? (
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
                                                history.map((h, i) => {
                                                    const tc = getTypeIcon(
                                                        h.type ||
                                                            h.activityType,
                                                    );
                                                    const nextDate =
                                                        h.nextFollowUpDate ||
                                                        h.followUpDate ||
                                                        h.date ||
                                                        "-";
                                                    const isEditable = Boolean(
                                                        h?.followupId ||
                                                        h?.id ||
                                                        h?._id,
                                                    );
                                                    const handleDeleteFollowUp =
                                                        async () => {
                                                            // Try to delete the follow-up if it has an ID
                                                            const followupId =
                                                                h?.followupId ||
                                                                h?.id ||
                                                                h?._id;
                                                            if (!followupId) {
                                                                console.warn(
                                                                    "[FollowUpScreen] No followup ID to delete",
                                                                );
                                                                return;
                                                            }
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
                                                                // Refresh after deletion
                                                                setFollowUps(
                                                                    [],
                                                                );
                                                                lastFetch.current = 0;
                                                                onEditScheduledFollowUp?.(
                                                                    null,
                                                                );
                                                                // Refresh the detail view history
                                                                await refreshDetailHistory?.();
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
                                                            }
                                                        };

                                                    return (
                                                        <View
                                                            key={`inline-${h?.followupId || h?.id || h._id || "history"}-${h.activityType || h.type || "row"}-${i}`}
                                                            style={[
                                                                FU.timelineCard,
                                                                i <
                                                                    history.length -
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
                                                                    {nextDate}
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
                                                                    }}>
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
                                                                        <Text
                                                                            style={
                                                                                FU.timelineBtnText
                                                                            }>
                                                                            Edit
                                                                        </Text>
                                                                    </TouchableOpacity>
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
                                                                                <Text
                                                                                    style={
                                                                                        FU.timelineDeleteText
                                                                                    }>
                                                                                    Delete
                                                                                </Text>
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
                {tabIdx === 2 && (
                    <>
                        <View
                            pointerEvents="box-only"
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 92,
                                width: 34,
                                zIndex: 20,
                                elevation: 20,
                                backgroundColor: "transparent",
                            }}
                            {...whatsappEdgePan.panHandlers}
                        />
                        <View
                            pointerEvents="box-only"
                            style={{
                                position: "absolute",
                                right: 0,
                                top: 0,
                                bottom: 92,
                                width: 34,
                                zIndex: 20,
                                elevation: 20,
                                backgroundColor: "transparent",
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
        marginTop: 8,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: C.primarySoft,
        borderWidth: 1,
        borderColor: C.primaryMid,
    },
    timelineEditBtn: {
        minWidth: 70,
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
        minWidth: 70,
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
    timelineBtnText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.primary,
    },
    timelineDeleteText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.danger,
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
    const [callModalVisible, setCallModalVisible] = useState(false);
    const [autoDuration, setAutoDuration] = useState(0);
    const [autoCallData, setAutoCallData] = useState(null);

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
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: true,
            });
            fetchTabCounts(selectedDate).catch(() => {});
            if (showMissedModal) loadMissedModalItems(selectedDate);
        };

        checkMissedItems();
        missedCheckIntervalRef.current = setInterval(checkMissedItems, 60000);

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
            const stale = Date.now() - lastFetch.current > 60000;
            if (stale || followUps.length === 0)
                fetchFollowUps(activeTab, true);
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
        const t = setTimeout(() => {
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true);
        }, 300);
        return () => clearTimeout(t);
    }, [searchQuery]);
    useEffect(() => {
        if (activeTab !== "All" && !tabUsesExactDateFilter(activeTab)) return;
        lastFetch.current = 0;
        fetchFollowUps(activeTab, true);
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
	        const sub = DeviceEventEmitter.addListener("CALL_ENDED", (data) => {
	            if (callStarted && callEnquiry) {
	                global.__callClaimedByScreen = true;

	                if (AUTO_SAVE_CALL_LOGS) {
	                    const mobile = callEnquiry?.mobile || "";
	                    const digits = String(mobile).replace(/\D/g, "");
	                    const callType = data?.callType || "Outgoing";
	                    const duration = Number(data?.duration || 0);
	                    const callTime = data?.callTime || new Date();
	                    const note = data?.note || "";
	                    const deviceCallId = data?.deviceCallId || null;
	                    const enquiryId =
	                        callEnquiry?._id ||
	                        callEnquiry?.enquiryId?._id ||
	                        callEnquiry?.enquiryId ||
	                        callEnquiry?.enqId;

	                    Promise.resolve(
	                        callLogService.createCallLog({
	                            phoneNumber: digits,
	                            callType,
	                            duration,
	                            note,
	                            callTime,
	                            enquiryId,
	                            contactName: callEnquiry?.name,
	                            deviceCallId,
	                        }),
	                    )
	                        .then((saved) => {
	                            if (!saved?._id) return;
	                            DeviceEventEmitter.emit("CALL_LOG_CREATED", saved);
	                            lastFetch.current = 0;
	                            fetchFollowUps(activeTab, true, {
	                                force: true,
	                                showIndicator: false,
	                                allowCache: true,
	                            });
	                        })
	                        .catch(() => {});

	                    setCallModalVisible(false);
	                    setCallEnquiry(null);
	                    setAutoCallData(null);
	                    setAutoDuration(0);
	                    setCallStarted(false);
	                    setCallStartTime(null);
	                    return;
	                }

	                setAutoCallData({
	                    callType: data?.callType,
	                    duration: Number(data?.duration || 0),
	                    note: data?.note,
	                });
	                setAutoDuration(Number(data?.duration || 0));
	                setCallModalVisible(true);
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
                callEnquiry &&
                !autoCallData
            ) {
                const device = await getLatestDeviceCallLogForNumber({
                    phoneNumber: callEnquiry.mobile,
                    sinceMs: callStartTime,
                    limit: 10,
                });

                const durFallback = Math.max(
                    0,
                    Math.floor((Date.now() - callStartTime) / 1000) - 5,
                );

                const finalCallType =
                    device?.callType ||
                    (durFallback > 3 ? "Outgoing" : "Not Attended");
                const finalDuration = Number.isFinite(Number(device?.duration))
                    ? Number(device.duration)
                    : durFallback;

	                setAutoCallData({
	                    callType: finalCallType,
	                    duration: finalDuration,
	                    note: device
	                        ? "Auto-detected from device call log"
	                        : "AppState fallback",
	                });
	                setAutoDuration(finalDuration);

	                if (AUTO_SAVE_CALL_LOGS) {
	                    const mobile = callEnquiry?.mobile || "";
	                    const digits = String(mobile).replace(/\D/g, "");
	                    const enquiryId =
	                        callEnquiry?._id ||
	                        callEnquiry?.enquiryId?._id ||
	                        callEnquiry?.enquiryId ||
	                        callEnquiry?.enqId;
	                    const deviceCallId = device?.deviceCallId || null;

	                    try {
	                        const saved = await callLogService.createCallLog({
	                            phoneNumber: digits,
	                            callType: finalCallType,
	                            duration: finalDuration,
	                            note: device
	                                ? "Auto-detected from device call log"
	                                : "AppState fallback",
	                            callTime: device?.callTime || new Date(),
	                            enquiryId,
	                            contactName: callEnquiry?.name,
	                            deviceCallId,
	                        });
	                        if (saved?._id) {
	                            DeviceEventEmitter.emit("CALL_LOG_CREATED", saved);
	                            lastFetch.current = 0;
	                            fetchFollowUps(activeTab, true, {
	                                force: true,
	                                showIndicator: false,
	                                allowCache: true,
	                            });
	                        }
	                    } catch (_e) {}

	                    setCallModalVisible(false);
	                    setCallEnquiry(null);
	                    setAutoCallData(null);
	                    setAutoDuration(0);
	                    setCallStarted(false);
	                    setCallStartTime(null);
	                    return;
	                }

	                setCallModalVisible(true);
	                setCallStarted(false);
	                setCallStartTime(null);
	            }
	        });
	        return () => sub.remove();
	    }, [callStarted, callStartTime, callEnquiry, autoCallData]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: true,
            });
        });
        return () => sub.remove();
    }, [activeTab]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("FOLLOWUP_CHANGED", () => {
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: true,
            });
            if (showMissedModal) loadMissedModalItems(selectedDate);
            if (showDroppedModal) loadDroppedModalItems();
        });
        return () => sub.remove();
    }, [activeTab, selectedDate, showMissedModal, showDroppedModal]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("ENQUIRY_UPDATED", () => {
            // FIX #15: Clear list when enquiry is updated to properly handle
            // status changes across tabs (prevents stale items from old sections)
            setFollowUps([]);
            lastFetch.current = 0;
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: true,
            });
            fetchTabCounts(selectedDate).catch(() => {});
        });
        return () => sub.remove();
    }, [activeTab, selectedDate]);

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
                getTabUniqueCount("Missed", referenceDate),
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
            const response = await followupService.getFollowUps(
                "Missed",
                1,
                200,
                referenceDate,
            );
            const rawItems = Array.isArray(response?.data)
                ? response.data
                : Array.isArray(response)
                  ? response
                  : [];
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
                200,
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

    const fetchFollowUps = async (tab, refresh = false, opts = {}) => {
        const rid = ++fetchIdRef.current;
        const { force = false, allowCache = true } = opts || {};
        const showIndicator =
            opts?.showIndicator ?? (refresh && followUps.length > 0);

        const cacheKey = buildCacheKey(
            "followups:list:v1",
            user?.id || user?._id || "",
            tab,
            selectedDate || "",
            String(searchQuery || "").trim().toLowerCase(),
        );

        let cached = null;
        if (refresh && allowCache) {
            cached = await getCacheEntry(cacheKey).catch(() => null);
            if (cached?.value?.items) {
                const cachedItems = Array.isArray(cached.value.items)
                    ? cached.value.items
                    : [];
                setFollowUps(cachedItems);
                setHasMore(Boolean(cached.value.hasMore));
                setPage(Number(cached.value.page || 1));
                if (typeof cached.t === "number") lastFetch.current = cached.t;
                if (!showIndicator) setIsLoading(false);
            }
        }

        if (refresh) {
            const shouldFetch = force || !isFresh(cached, FOLLOWUPS_CACHE_TTL_MS);
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
            const monthRange = getMonthDateRange(selectedDate);
            const filterDate = tabUsesExactDateFilter(tab) ? selectedDate : "";
            if (tab === "Today" || tab === "Sales") {
                const enquiryRes = await enquiryService.getAllEnquiries(
                    pg,
                    20,
                    searchQuery.trim(),
                    "",
                    "",
                    selectedDate,
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
                data = data
                    .map(mapEnquiryToFollowUpCard)
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
                if (refresh) fetchTabCounts(selectedDate);
                lastFetch.current = Date.now();
                setPage(nextPage);
                await setCacheEntry(cacheKey, {
                    items: nextItems,
                    hasMore: nextHasMore,
                    page: nextPage,
                }).catch(() => {});
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
                        searchQuery.trim(),
                        "New",
                        "",
                        "",
                        monthRange,
                    );
                    const enquiryItems = Array.isArray(enquiryRes?.data)
                        ? enquiryRes.data
                        : Array.isArray(enquiryRes)
                          ? enquiryRes
                          : [];
                    const newOnlyItems = enquiryItems
                        .filter((item) => !item?.latestFollowUpDate)
                        .map(mapEnquiryToFollowUpCard);
                    data = [...newOnlyItems, ...data];
                } catch (_error) {
                    // If enquiry-side fetch fails, keep follow-up data working normally.
                }
            }
            if (searchQuery.trim()) {
                const q = searchQuery.trim().toLowerCase();
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
            if (refresh) fetchTabCounts(filterDate || selectedDate);
            lastFetch.current = Date.now();
            setPage(nextPage);
            await setCacheEntry(cacheKey, {
                items: nextItems,
                hasMore: nextHasMore,
                page: nextPage,
            }).catch(() => {});
        } catch (e) {
            console.error(e);
        } finally {
            if (rid === fetchIdRef.current) {
                setIsLoading(false);
                setIsLoadingMore(false);
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
        setDetailHistory([]);
        setHistoryLoading(true);
        detailSourceFollowUpIdRef.current =
            item?.followUpId || item?._id || null;
        detailSourceWasMissedRef.current =
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
            setDetailEnquiry(full || fb);
            setSelectedEnquiry(full || fb);
            setEditStatus(
                getRecommendedNextStatus((full || fb)?.status || "New"),
            );
        } catch {
            setDetailEnquiry(fb);
            setSelectedEnquiry(fb);
        }
        try {
            const hist = await followupService.getFollowUpHistory(
                item.enqNo || item.enqId || item._id,
            );
            setDetailHistory(Array.isArray(hist) ? hist : []);
        } catch {
            setDetailHistory([]);
        } finally {
            setHistoryLoading(false);
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
        try {
            setHistoryLoading(true);
            const hist = await followupService.getFollowUpHistory(
                detailEnquiry.enqNo || detailEnquiry.enqId || detailEnquiry._id,
                { force: true },
            );
            setDetailHistory(Array.isArray(hist) ? hist : []);
            console.log(
                `[FollowUpScreen] ✓ Detail history refreshed: ${hist?.length || 0} items`,
            );
        } catch (error) {
            console.error(
                "[FollowUpScreen] Error refreshing history:",
                error?.message || error,
            );
            setDetailHistory([]);
        } finally {
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

    const handleEditScheduledFollowUp = useCallback((item) => {
        if (!item?._id) return;
        setEditFollowUpId(item._id);
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
            const isRescheduleFromMissed =
                detailSourceWasMissedRef.current &&
                Boolean(sourceFollowUpId) &&
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
                await followupService.updateFollowUp(sourceFollowUpId, {
                    status: "Completed",
                    enquiryStatus: "Missed",
                });
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
            DeviceEventEmitter.emit("ENQUIRY_UPDATED");

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
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: true,
            });
            if (["Contacted", "Interested", "Converted"].includes(effectiveStatus))
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
    const handleSaveCallLog = async (data) => {
        try {
            const saved = await callLogService.createCallLog(data);
            if (!saved?._id) return;
            setCallModalVisible(false);
            setCallEnquiry(null);
            setAutoCallData(null);
            DeviceEventEmitter.emit("CALL_LOG_CREATED", saved);
            fetchFollowUps(activeTab, true, {
                force: true,
                showIndicator: false,
                allowCache: true,
            });
        } catch (e) {
            console.error(e);
        }
    };

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
        setCallEnquiry(enquiry);
        setAutoCallData(null);
        setAutoDuration(0);
        setCallStarted(true);
        setCallStartTime(Date.now());
        try {
            if (
                Platform.OS === "android" &&
                RNImmediatePhoneCall?.immediatePhoneCall
            ) {
                RNImmediatePhoneCall.immediatePhoneCall(digits);
                return;
            }
            await Linking.openURL(`tel:${digits}`);
        } catch (_error) {
            setCallStarted(false);
            setCallStartTime(null);
            setCallEnquiry(null);
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
    useEffect(() => {
        if (!isDatePickerVisible) return;
        let active = true;
        const loadCalendarSummary = async () => {
            try {
                const monthRange = getMonthDateRange(`${calendarMonth}-01`);
                const allRes = await followupService.getFollowUps(
                    "All",
                    1,
                    250,
                    "",
                    monthRange,
                );
                if (!active) return;
                const allItems = Array.isArray(allRes?.data) ? allRes.data : [];
                const summary = {};
                allItems.forEach((item) => {
                    const iso = getFollowUpCalendarDate(item);
                    if (!iso || toMonthKey(iso) !== calendarMonth) return;
                    if (!summary[iso]) {
                        summary[iso] = {
                            followup: 0,
                            missed: 0,
                            sales: 0,
                            drop: 0,
                            notInterested: 0,
                        };
                    }
                    const bucket = getCalendarSummaryBucket(item);
                    summary[iso][bucket] += 1;
                });
                setCalendarDateSummary(summary);
            } catch (_error) {
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
    const keyExtractor = useCallback(
        (item, i) => {
            // Keep keys stable per enquiry to avoid unmount/mount flicker when status/date changes
            // (which can look like UI "blur" or broken separator lines on Android).
            return String(
                item?.listKey ||
                    item?.enqId ||
                    item?.enqNo ||
                    item?._id ||
                    `item-${i}`,
            );
        },
        [],
    );

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: C.bg }}
            edges={["top"]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
            <ConfettiBurst ref={confettiRef} topOffset={0} />

            <PostCallModal
                visible={callModalVisible}
                enquiry={callEnquiry}
                onSave={handleSaveCallLog}
                initialDuration={autoDuration}
                autoCallData={autoCallData}
                onCancel={() => {
                    setCallModalVisible(false);
                    setCallEnquiry(null);
                    setCallStarted(false);
                    setAutoCallData(null);
                }}
            />

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
                    return (
                        <TouchableOpacity
                            key={t.value}
                            onPress={() => handleTabChange(t.value)}
                            style={[
                                MS.tabPill,
                                active && {
                                    backgroundColor: accent + "16",
                                    borderColor: accent,
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

            {/* ── List ── */}
            <FlatList
                data={followUps}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={[
                    {
                        paddingHorizontal: sc.hPad,
                        paddingTop: 10,
                        paddingBottom: 90,
                    },
                    followUps.length === 0 && { flex: 1 },
                ]}
                refreshing={isLoading && followUps.length > 0}
                onRefresh={() =>
                    fetchFollowUps(activeTab, true, {
                        force: true,
                        showIndicator: true,
                        allowCache: false,
                    })
                }
                onEndReached={() => {
                    if (!isLoading && !isLoadingMore && hasMore)
                        fetchFollowUps(activeTab, false);
                }}
                onEndReachedThreshold={0.5}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
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
                                            {summary.drop > 0 ? (
                                                <View
                                                    style={[
                                                        MS.calDropBadge,
                                                        isSelected &&
                                                            MS.calStatusBadgeSelected,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            MS.calDropBadgeText,
                                                            isSelected &&
                                                                MS.calStatusBadgeTextSelected,
                                                        ]}>
                                                        D+{summary.drop}
                                                    </Text>
                                                </View>
                                            ) : null}
                                            {summary.notInterested > 0 ? (
                                                <View
                                                    style={[
                                                        MS.calNotInterestedBadge,
                                                        isSelected &&
                                                            MS.calStatusBadgeSelected,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            MS.calNotInterestedBadgeText,
                                                            isSelected &&
                                                                MS.calStatusBadgeTextSelected,
                                                        ]}>
                                                        N+
                                                        {summary.notInterested}
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
