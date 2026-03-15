import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    DeviceEventEmitter,
    Dimensions,
    Easing,
    FlatList,
    Image,
    Linking,
    Modal,
    PermissionsAndroid,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from "react-native";
import RNImmediatePhoneCall from "react-native-immediate-phone-call";
import { SafeAreaView } from "react-native-safe-area-context";
import { PostCallModal } from "../components/PostCallModal";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { API_URL as GLOBAL_API_URL } from "../services/apiConfig";
import * as callLogService from "../services/callLogService";
import * as enquiryService from "../services/enquiryService";
import { getImageUrl } from "../utils/imageHelper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// --- CONFIGURATION ---
const API_URL = `${GLOBAL_API_URL}/enquiries`;
const { width, height } = Dimensions.get("window");

// --- PREMIUM iOS LIGHT THEME ---
const COLORS = {
    // Base surfaces
    bgApp: "#F2F4F8",
    bgCard: "#FFFFFF",
    bgCardAlt: "#FAFBFF",

    // Primary — rich cobalt blue (iOS-style)
    primary: "#1A6BFF",
    primaryDark: "#0055E5",
    primaryLight: "#EBF2FF",
    primaryMid: "#C2D9FF",

    // Accents
    secondary: "#FF3B5C", // vivid rose
    accent: "#7B61FF", // soft purple
    teal: "#00C6A2", // mint

    // Text
    textMain: "#0A0F1E",
    textSub: "#3A4060",
    textMuted: "#7C85A3",
    textLight: "#B0BAD3",

    // UI
    border: "#E8ECF4",
    divider: "#F0F2F8",
    shadow: "#1A2560",

    // Semantic
    success: "#00C48C",
    whatsapp: "#25D366",
    danger: "#FF3B5C",
    warning: "#FF9500",
    info: "#1A6BFF",

    // Gradients
    gradients: {
        header: ["#FFFFFF", "#F2F4F8"],
        primary: ["#1A6BFF", "#7B61FF"],
        success: ["#00C48C", "#00A67A"],
        danger: ["#FF3B5C", "#E02040"],
        info: ["#1A6BFF", "#0055E5"],
        card: ["#FFFFFF", "#F7F9FF"],
        teal: ["#00C6A2", "#00A685"],
        warm: ["#FF9500", "#FF6B00"],
    },
};

// --- ANIMATION HOOK (unchanged) ---
const useFadeIn = (delay = 0) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(20)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1,
                duration: 600,
                delay,
                useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 0,
                duration: 600,
                delay,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            }),
        ]).start();
    }, []);
    return { opacity, translateY };
};

const safeLocaleDateString = (raw, options) => {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, options);
};

const safeLocaleString = (raw) => {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
};

// Helper: format a Date or date-string to local YYYY-MM-DD
const toLocalIso = (d) => {
    const date = d ? new Date(d) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

// --- PREMIUM CARD COMPONENT ---
const ModernCard = React.memo(
    ({
        item,
        index,
        onShowDetails,
        onEdit,
        onDelete,
        onFollowUp,
        onCall,
        onWhatsApp,
        onFilterByEmail,
    }) => {
        const scaleValue = useRef(new Animated.Value(1)).current;

        const handlePressIn = () =>
            Animated.spring(scaleValue, {
                toValue: 0.975,
                useNativeDriver: true,
            }).start();
        const handlePressOut = () =>
            Animated.spring(scaleValue, {
                toValue: 1,
                useNativeDriver: true,
            }).start();

        const initials = item.name
            ? item.name.substring(0, 2).toUpperCase()
            : "NA";

        const getItemDate = (it) => {
            if (!it) return null;
            if (it.createdAt) return toLocalIso(it.createdAt);
            if (it.date) return toLocalIso(it.date);
            if (it.enqDate) return toLocalIso(it.enqDate);
            if (it._id && it._id.length >= 8) {
                try {
                    const hex = it._id.substring(0, 8);
                    const ts = parseInt(hex, 16) * 1000;
                    return toLocalIso(new Date(ts));
                } catch (e) {
                    return null;
                }
            }
            return null;
        };

        const rawDate = getItemDate(item);
        const dateLabel = rawDate
            ? new Date(rawDate).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
              })
            : "";

        const getPriorityConfig = (type) => {
            const t = (type || "").toLowerCase();
            if (t.includes("hot") || t.includes("high"))
                return { color: COLORS.danger, bg: "#FFF0F3", label: "Hot" };
            if (t.includes("warm") || t.includes("medium"))
                return { color: COLORS.warning, bg: "#FFF5E6", label: "Warm" };
            return {
                color: COLORS.info,
                bg: COLORS.primaryLight,
                label: type || "Normal",
            };
        };

        const pCfg = getPriorityConfig(item.enqType);

        // Avatar color — derived from name for consistency
        const avatarHue = item.name
            ? (item.name.charCodeAt(0) * 23 +
                  item.name.charCodeAt(1 % item.name.length) * 7) %
              360
            : 220;
        const avatarColors = [
            `hsl(${avatarHue},70%,55%)`,
            `hsl(${(avatarHue + 30) % 360},75%,45%)`,
        ];

        return (
            <MotiView
                from={{ opacity: 0, translateY: 16 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{
                    type: "timing",
                    duration: 300,
                    delay: index < 6 ? index * 50 : 0,
                }}
                style={styles.cardWrapper}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onPress={() => onShowDetails(item)}>
                    <Animated.View
                        style={[
                            styles.cardContainer,
                            { transform: [{ scale: scaleValue }] },
                        ]}>
                        {/* Priority accent stripe */}
                        <View
                            style={[
                                styles.cardStripe,
                                { backgroundColor: pCfg.color },
                            ]}
                        />

                        {/* ── Top Row: Avatar + Info ── */}
                        <View style={styles.cardHeader}>
                            <View
                                style={[
                                    styles.avatarContainer,
                                    item.image && {
                                        backgroundColor: "transparent",
                                        overflow: "hidden",
                                    },
                                ]}>
                                {item.image ? (
                                    <Image
                                        source={{
                                            uri: getImageUrl(item.image),
                                        }}
                                        style={styles.avatarImg}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <LinearGradient
                                        colors={avatarColors}
                                        style={styles.avatarGradient}>
                                        <Text style={styles.avatarText}>
                                            {initials}
                                        </Text>
                                    </LinearGradient>
                                )}
                                {/* Online-style dot for priority */}
                                <View
                                    style={[
                                        styles.avatarDot,
                                        { backgroundColor: pCfg.color },
                                    ]}
                                />
                            </View>

                            <View style={styles.cardInfo}>
                                <View style={styles.nameRow}>
                                    <Text
                                        style={styles.cardName}
                                        numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <View style={styles.cardBadges}>
                                        {item.enqNo ? (
                                            <View style={styles.enqNoBadge}>
                                                <Text style={styles.enqNoText}>
                                                    #{item.enqNo}
                                                </Text>
                                            </View>
                                        ) : null}
                                        {dateLabel && (
                                            <View style={styles.dateBadge}>
                                                <Ionicons
                                                    name="calendar-outline"
                                                    size={9}
                                                    color={COLORS.textMuted}
                                                    style={{ marginRight: 3 }}
                                                />
                                                <Text style={styles.dateText}>
                                                    {dateLabel}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                <View style={styles.subInfoRow}>
                                    <View style={styles.subInfoChip}>
                                        <Ionicons
                                            name="call-outline"
                                            size={11}
                                            color={COLORS.primary}
                                        />
                                        <Text style={styles.cardSubtext}>
                                            {item.mobile}
                                        </Text>
                                    </View>
                                    <View style={styles.subInfoChip}>
                                        <Ionicons
                                            name="time-outline"
                                            size={11}
                                            color={
                                                item.lastContactedAt
                                                    ? COLORS.teal
                                                    : COLORS.textLight
                                            }
                                        />
                                        <Text
                                            style={[
                                                styles.cardSubtext,
                                                {
                                                    color: item.lastContactedAt
                                                        ? COLORS.teal
                                                        : COLORS.textLight,
                                                },
                                            ]}>
                                            {item.lastContactedAt
                                                ? new Date(
                                                      item.lastContactedAt,
                                                  ).toLocaleDateString([], {
                                                      month: "short",
                                                      day: "numeric",
                                                  })
                                                : "Not contacted"}
                                        </Text>
                                    </View>
                                </View>

                                {item.email ? (
                                    <TouchableOpacity
                                        onPress={() =>
                                            onFilterByEmail?.(item.email)
                                        }
                                        style={styles.emailRow}>
                                        <Ionicons
                                            name="mail-outline"
                                            size={11}
                                            color={COLORS.textLight}
                                        />
                                        <Text
                                            style={styles.emailText}
                                            numberOfLines={1}>
                                            {item.email}
                                        </Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>

                        {/* ── Product + Priority Row ── */}
                        <View style={styles.productSection}>
                            <View style={styles.productTag}>
                                <Ionicons
                                    name="briefcase-outline"
                                    size={13}
                                    color={COLORS.primary}
                                />
                                <Text
                                    style={styles.productText}
                                    numberOfLines={1}>
                                    {item.product || "General Enquiry"}
                                </Text>
                            </View>
                            {item.enqType && (
                                <View
                                    style={[
                                        styles.priorityBadge,
                                        { backgroundColor: pCfg.bg },
                                    ]}>
                                    <View
                                        style={[
                                            styles.priorityDot,
                                            { backgroundColor: pCfg.color },
                                        ]}
                                    />
                                    <Text
                                        style={[
                                            styles.priorityText,
                                            { color: pCfg.color },
                                        ]}>
                                        {item.enqType}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* ── Meta Info ── */}
                        <View style={styles.metaRow}>
                            <View style={styles.metaChip}>
                                <Ionicons
                                    name="person-outline"
                                    size={11}
                                    color={COLORS.textMuted}
                                />
                                <Text style={styles.metaChipText}>
                                    {item.assignedTo?.name || "Unassigned"}
                                </Text>
                            </View>
                            <View style={styles.metaChip}>
                                <Ionicons
                                    name="pricetag-outline"
                                    size={11}
                                    color={COLORS.textMuted}
                                />
                                <Text style={styles.metaChipText}>
                                    ₹{item.cost || 0}
                                </Text>
                            </View>
                            <View style={styles.metaChip}>
                                <Ionicons
                                    name="time-outline"
                                    size={11}
                                    color={COLORS.textMuted}
                                />
                                <Text style={styles.metaChipText}>
                                    {(item.enquiryDateTime || item.createdAt)
                                        ? safeLocaleDateString(
                                              item.enquiryDateTime ||
                                                  item.createdAt,
                                              {
                                                  month: "short",
                                                  day: "numeric",
                                              },
                                          )
                                        : "-"}
                                </Text>
                            </View>
                        </View>

                        {/* ── Divider ── */}
                        <View style={styles.cardDivider} />

                        {/* ── Action Bar ── */}
                        <View style={styles.actionBar}>
                            <TouchableOpacity
                                style={[
                                    styles.actionBtnPrimary,
                                    { backgroundColor: COLORS.success + "18" },
                                ]}
                                onPress={() => onCall(item)}>
                                <Ionicons
                                    name="call"
                                    size={16}
                                    color={COLORS.success}
                                />
                                <Text
                                    style={[
                                        styles.actionBtnLabel,
                                        { color: COLORS.success },
                                    ]}>
                                    Call
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.actionBtnPrimary,
                                    { backgroundColor: COLORS.whatsapp + "18" },
                                ]}
                                onPress={() => onWhatsApp(item)}>
                                <Ionicons
                                    name="logo-whatsapp"
                                    size={16}
                                    color={COLORS.whatsapp}
                                />
                                <Text
                                    style={[
                                        styles.actionBtnLabel,
                                        { color: COLORS.whatsapp },
                                    ]}>
                                    WhatsApp
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.actionRight}>
                                <TouchableOpacity
                                    style={[
                                        styles.actionIconBtn,
                                        {
                                            backgroundColor:
                                                COLORS.primary + "12",
                                        },
                                    ]}
                                    onPress={() => onEdit(item)}>
                                    <Ionicons
                                        name="create-outline"
                                        size={17}
                                        color={COLORS.primary}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.actionIconBtn,
                                        {
                                            backgroundColor:
                                                COLORS.danger + "12",
                                        },
                                    ]}
                                    onPress={() => onDelete(item._id)}>
                                    <Ionicons
                                        name="trash-outline"
                                        size={17}
                                        color={COLORS.danger}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Animated.View>
                </TouchableOpacity>
            </MotiView>
        );
    },
);

// --- MAIN SCREEN ---
export default function EnquiryListScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const swipeHandlers = useSwipeNavigation("Enquiry", navigation);
    const [enquiries, setEnquiries] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [detailsModal, setDetailsModal] = useState(false);
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [datePickerVisible, setDatePickerVisible] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [enquiryCallLogs, setEnquiryCallLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    const [callModalVisible, setCallModalVisible] = useState(false);
    const [callEnquiry, setCallEnquiry] = useState(null);
    const [callStartTime, setCallStartTime] = useState(null);
    const [callStarted, setCallStarted] = useState(false);
    const [autoDuration, setAutoDuration] = useState(0);
    const [autoCallData, setAutoCallData] = useState(null);

    const { user, logout } = useAuth();
    const [menuVisible, setMenuVisible] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const handleLogout = () => {
        setMenuVisible(false);
        setShowLogoutModal(true);
    };
    const confirmLogout = async () => {
        setShowLogoutModal(false);
        await logout();
    };

    const fabScale = useRef(new Animated.Value(1)).current;
    const animateFab = () => {
        Animated.sequence([
            Animated.timing(fabScale, {
                toValue: 0.85,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.spring(fabScale, { toValue: 1, useNativeDriver: true }),
        ]).start();
    };

    useEffect(() => {
        const isNewArchitectureEnabled =
            global.nativeFabricUIManager != null;
        if (Platform.OS === "android" && !isNewArchitectureEnabled) {
            if (UIManager.setLayoutAnimationEnabledExperimental) {
                UIManager.setLayoutAnimationEnabledExperimental(true);
            }
        }
    }, [route.params?.filter]);

	    const [page, setPage] = useState(1);
	    const [hasMore, setHasMore] = useState(true);
	    const [isLoadingMore, setIsLoadingMore] = useState(false);
	    const isInitialMount = useRef(true);
	    const skipNextSearchFetchRef = useRef(false);

    useEffect(() => {
        fetchEnquiries(true);
    }, []);

	    useEffect(() => {
	        if (isInitialMount.current) return;
	        if (skipNextSearchFetchRef.current) {
	            skipNextSearchFetchRef.current = false;
	            return;
	        }
	        const timer = setTimeout(() => {
	            fetchEnquiries(true);
	        }, 500);
	        return () => clearTimeout(timer);
	    }, [searchQuery]);

    useEffect(() => {
        const callEndedSub = DeviceEventEmitter.addListener(
            "CALL_ENDED",
            (data) => {
                if (callStarted && callEnquiry) {
                    global.__callClaimedByScreen = true;
                    const fullCallData = {
                        phoneNumber: data.phoneNumber,
                        callType: data.callType,
                        duration: data.duration,
                        note: data.note || "Auto-logged from Enquiry Screen",
                        callTime: data.callTime || new Date(),
                        enquiryId: callEnquiry._id,
                        contactName: callEnquiry.name,
                    };
                    handleSaveCallLog(fullCallData);
                    setCallStarted(false);
                    setCallStartTime(null);
                }
            },
        );
        return () => callEndedSub.remove();
    }, [callStarted, callEnquiry]);

    useEffect(() => {
        const subscription = AppState.addEventListener(
            "change",
            async (nextAppState) => {
                if (
                    nextAppState === "active" &&
                    callStarted &&
                    callStartTime &&
                    callEnquiry
                ) {
                    if (autoCallData) return;
                    const endTime = Date.now();
                    const durationSeconds = Math.floor(
                        (endTime - callStartTime) / 1000,
                    );
                    const realDuration = Math.max(0, durationSeconds - 5);
                    const fullCallData = {
                        phoneNumber: callEnquiry.mobile,
                        callType: "Outgoing",
                        duration: realDuration,
                        note: `Auto-logged (AppState fallback). Duration: ${realDuration}s`,
                        callTime: new Date(),
                        enquiryId: callEnquiry._id,
                        contactName: callEnquiry.name,
                    };
                    handleSaveCallLog(fullCallData);
                    setCallStarted(false);
                    setCallStartTime(null);
                }
            },
        );
        return () => subscription.remove();
    }, [callStarted, callStartTime, callEnquiry, autoCallData]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        fetchEnquiries(true);
    }, [selectedDate]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
            fetchEnquiries(true);
        });
        return () => sub.remove();
    }, []);

	    const fetchEnquiries = async (refresh = false) => {
        if (refresh) {
            setIsLoading(true);
            setPage(1);
            setHasMore(true);
        } else {
            if (!hasMore || isLoadingMore) return;
            setIsLoadingMore(true);
        }
        try {
            const currentPage = refresh ? 1 : page;
            const currentLimit = 20;
            const response = await enquiryService.getAllEnquiries(
                currentPage,
                currentLimit,
                searchQuery,
                "",
                selectedDate,
            );
            let newData = [];
            let totalPages = 1;
            if (Array.isArray(response)) {
                newData = response;
                setHasMore(false);
            } else if (response && response.data) {
                newData = response.data;
                totalPages = response.pagination?.pages || 1;
                setHasMore(currentPage < totalPages);
            }
            if (refresh) {
                setEnquiries(newData);
            } else {
                setEnquiries((prev) => [...prev, ...newData]);
            }
            if (!refresh) {
                setPage((prev) => prev + 1);
            } else if (newData.length > 0 && currentPage < totalPages) {
                setPage(2);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
	        }
	    };

	    const fetchEnquiriesRef = useRef(fetchEnquiries);
	    useEffect(() => {
	        fetchEnquiriesRef.current = fetchEnquiries;
	    }, [fetchEnquiries]);

    const handleLoadMore = () => {
        if (!isLoading && !isLoadingMore && hasMore) fetchEnquiries(false);
    };

	    const handleDelete = useCallback((id) => {
	        Alert.alert(
	            "Delete Enquiry",
	            "Are you sure you want to delete this enquiry?",
	            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await enquiryService.deleteEnquiry(id);
                            setEnquiries((prev) =>
                                prev.filter((e) => e._id !== id),
                            );
                            Alert.alert(
                                "Success",
                                "Enquiry deleted successfully",
                            );
                        } catch (err) {
                            const errorMsg =
                                err.response?.data?.message ||
                                err.message ||
                                "Failed to delete enquiry.";
                            Alert.alert("Delete Failed", errorMsg);
                        }
                    },
                },
	            ],
	        );
	    }, []);

	    const fetchEnquiryLogs = useCallback(async (enquiryId) => {
	        setLogsLoading(true);
	        try {
	            const res = await callLogService.getCallLogs({ enquiryId });
	            setEnquiryCallLogs(res.data || res);
	        } catch (e) {
	            console.error("Failed to fetch enquiry logs", e);
	        } finally {
	            setLogsLoading(false);
	        }
	    }, []);

	    const handleShowDetails = useCallback(
	        async (enquiry) => {
	            if (!enquiry) return;
	            setEnquiryCallLogs([]);
	            setSelectedEnquiry(enquiry);
	            setDetailsModal(true);
	            try {
	                const data = await enquiryService.getEnquiryById(enquiry._id);
	                setSelectedEnquiry(data || enquiry);
	            } catch (err) {
	                setSelectedEnquiry(enquiry);
	            }
	            fetchEnquiryLogs(enquiry._id);
	        },
	        [fetchEnquiryLogs],
	    );

	    const navigateToFollowUp = useCallback(
	        (enquiry) => {
	            if (!enquiry) return;
	            const enquiryContext = {
	                _id: enquiry._id,
	                enqNo: enquiry.enqNo,
	                name: enquiry.name,
	                mobile: enquiry.mobile,
	                product: enquiry.product,
	                image: enquiry.image,
	                status: enquiry.status,
	                source: enquiry.source,
	                address: enquiry.address,
	                requirements: enquiry.requirements,
	                assignedTo: enquiry.assignedTo,
	            };
	            navigation.navigate("FollowUp", {
	                openComposer: true,
	                composerToken: Date.now(),
	                enquiry: enquiryContext,
	            });
	        },
	        [navigation],
	    );

	    const formatLogDuration = (seconds) => {
	        if (!seconds || seconds === 0) return "0s";
	        if (seconds < 60) return `${seconds}s`;
	        const mins = Math.floor(seconds / 60);
	        const secs = seconds % 60;
	        return `${mins}m ${secs}s`;
	    };

	    const handleCall = useCallback(async (enquiry) => {
	        if (!enquiry || !enquiry.mobile) return;
	        try {
	            const raw = String(enquiry.mobile).replace(/\D/g, "");
	            if (!raw) {
	                Alert.alert(
	                    "No phone number",
	                    "This contact has no valid phone number.",
	                );
	                return;
	            }
	            if (Platform.OS === "android") {
	                try {
	                    await PermissionsAndroid.request(
	                        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
	                    );
	                } catch (err) {}
	            }
	            let callTriggered = false;
	            try {
	                if (
	                    RNImmediatePhoneCall &&
	                    typeof RNImmediatePhoneCall.immediatePhoneCall ===
	                        "function"
	                ) {
	                    RNImmediatePhoneCall.immediatePhoneCall(raw);
	                    callTriggered = true;
	                }
	            } catch (e) {}
	            if (!callTriggered) {
	                const telUrl = `tel:${raw}`;
	                const can = await Linking.canOpenURL(telUrl);
	                if (can) {
	                    await Linking.openURL(telUrl);
	                } else {
	                    Alert.alert(
	                        "Unsupported",
	                        "Calling is not supported on this device.",
	                    );
	                    return;
	                }
	            }
	            setCallEnquiry(enquiry);
	            setCallStartTime(Date.now());
	            setCallStarted(true);
	        } catch (err) {
	            Alert.alert(
	                "Error",
	                "Unable to start call. Please try manually.",
	            );
	        }
	    }, []);

    const handleSaveCallLog = async (callData) => {
        try {
            const savedLog = await callLogService.createCallLog(callData);
            if (!savedLog?._id) {
                console.log("Call log was not created:", savedLog);
                return;
            }
            setCallModalVisible(false);
            setCallEnquiry(null);
            setAutoCallData(null);
            DeviceEventEmitter.emit("CALL_LOG_CREATED", savedLog);
            fetchEnquiries(true);
        } catch (error) {
            console.error("Error logging call:", error);
        }
    };

	    const handleWhatsApp = useCallback(
	        (enquiry) => {
	            if (!enquiry || !enquiry.mobile) return;
	            navigation.navigate("WhatsAppChat", { enquiry });
	        },
	        [navigation],
	    );

	    const handleFilterByEmail = useCallback((email) => {
	        if (!email) return;
	        skipNextSearchFetchRef.current = true;
	        setSearchQuery(email);
	        fetchEnquiriesRef.current?.(true);
	    }, []);

	    const handleEnquirySaved = useCallback((...args) => {
	        fetchEnquiriesRef.current?.(...args);
	    }, []);

	    const handleEdit = useCallback(
	        (enquiry) => {
	            try {
	                navigation.navigate("AddEnquiry", {
	                    enquiry,
	                    onEnquirySaved: handleEnquirySaved,
	                });
	            } catch (e) {
	                navigation.navigate("Enquiry", {
	                    screen: "AddEnquiry",
	                    params: { enquiry, onEnquirySaved: handleEnquirySaved },
	                });
	            }
	        },
	        [handleEnquirySaved, navigation],
	    );

	    const handleFollowUp = useCallback(
	        (enquiry) => {
	            setDetailsModal(false);
	            navigateToFollowUp(enquiry);
	        },
	        [navigateToFollowUp],
	    );

	    const keyExtractor = useCallback(
	        (item) => item._id?.toString() || item.id?.toString(),
	        [],
	    );

	    const renderEnquiryItem = useCallback(
	        ({ item, index }) => (
	            <ModernCard
	                item={item}
	                index={index}
	                onShowDetails={handleShowDetails}
	                onEdit={handleEdit}
	                onDelete={handleDelete}
	                onFollowUp={handleFollowUp}
	                onCall={handleCall}
	                onWhatsApp={handleWhatsApp}
	                onFilterByEmail={handleFilterByEmail}
	            />
	        ),
	        [
	            handleCall,
	            handleDelete,
	            handleEdit,
	            handleFilterByEmail,
	            handleFollowUp,
	            handleShowDetails,
	            handleWhatsApp,
	        ],
	    );

    // --- SIDE MENU ---
    const SideMenu = () => (
        <Modal
            animationType="slide"
            transparent={true}
            visible={menuVisible}
            onRequestClose={() => setMenuVisible(false)}>
            <TouchableOpacity
                style={menuStyles.menuOverlay}
                activeOpacity={1}
                onPress={() => setMenuVisible(false)}>
                <View style={menuStyles.menuContent}>
                    {/* Menu header — premium frosted feel */}
                    <LinearGradient
                        colors={["#1A6BFF", "#7B61FF"]}
                        style={menuStyles.menuHeader}>
                        <View style={menuStyles.profileCircle}>
                            {user?.logo ? (
                                <Image
                                    source={{ uri: getImageUrl(user.logo) }}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: 35,
                                    }}
                                />
                            ) : (
                                <Ionicons
                                    name="person"
                                    size={38}
                                    color="#fff"
                                />
                            )}
                        </View>
                        <Text style={menuStyles.profileName}>
                            {user?.name || "User"}
                        </Text>
                        <View style={menuStyles.rolePill}>
                            <Text style={menuStyles.profileRole}>
                                {user?.role || "Staff Member"}
                            </Text>
                        </View>
                    </LinearGradient>

                    <ScrollView
                        style={menuStyles.menuList}
                        showsVerticalScrollIndicator={false}>
                        <MenuItem
                            icon="home-outline"
                            label="Dashboard"
                            onPress={() => {
                                setMenuVisible(false);
                                if (navigation.canGoBack()) navigation.goBack();
                                else navigation.navigate("Home");
                            }}
                        />
                        <MenuItem
                            icon="people-outline"
                            label="Enquiries"
                            onPress={() => setMenuVisible(false)}
                            active
                        />
                        <MenuItem
                            icon="call-outline"
                            label="Follow-ups"
                            onPress={() => {
                                setMenuVisible(false);
                                navigation.navigate("FollowUp");
                            }}
                        />
                        {user?.role !== "Staff" && (
                            <MenuItem
                                icon="link-outline"
                                label="Lead Sources"
                                onPress={() => {
                                    setMenuVisible(false);
                                    navigation.navigate("LeadSourceScreen");
                                }}
                            />
                        )}
                        {user?.role !== "Staff" && (
                            <MenuItem
                                icon="people-circle-outline"
                                label="Staff Management"
                                onPress={() => {
                                    setMenuVisible(false);
                                    navigation.navigate("StaffScreen");
                                }}
                            />
                        )}
                        {user?.role !== "Staff" && (
                            <MenuItem
                                icon="flag-outline"
                                label="Targets"
                                onPress={() => {
                                    setMenuVisible(false);
                                    navigation.navigate("TargetsScreen");
                                }}
                            />
                        )}
                        <MenuItem
                            icon="bar-chart-outline"
                            label="Reports"
                            onPress={() => {
                                setMenuVisible(false);
                                navigation.navigate("Report");
                            }}
                        />
                        <MenuItem
                            icon="list-outline"
                            label="Call Logs"
                            onPress={() => {
                                setMenuVisible(false);
                                navigation.navigate("CallLog");
                            }}
                        />
                        <MenuItem icon="settings-outline" label="Settings" />
                        <MenuItem
                            icon="log-out-outline"
                            label="Logout"
                            color={COLORS.danger}
                            onPress={handleLogout}
                        />

                        <View style={menuStyles.logoSection}>
                            <View style={menuStyles.logoContainer}>
                                {true ? (
                                    <Image
                                        source={require("../assets/logo.png")}
                                        style={menuStyles.logoImage}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <View style={menuStyles.logoIconCircle}>
                                        <Ionicons
                                            name="business"
                                            size={26}
                                            color="#fff"
                                        />
                                    </View>
                                )}
                                <Text style={menuStyles.logoText}>
                                    Neophorn Technologies
                                </Text>
                                <Text style={menuStyles.logoSubtext}>
                                    CRM System
                                </Text>
                            </View>
                            <Text style={menuStyles.versionText}>v1.0.0</Text>
                        </View>
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
    );

    const LogoutConfirmModal = ({ visible, onClose, onConfirm }) => (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}>
            <TouchableOpacity
                style={{
                    flex: 1,
                    backgroundColor: "rgba(10,15,30,0.45)",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 24,
                }}
                activeOpacity={1}
                onPress={onClose}>
                <MotiView
                    from={{ opacity: 0, scale: 0.88, translateY: 24 }}
                    animate={{ opacity: 1, scale: 1, translateY: 0 }}
                    style={styles.logoutModalContainer}>
                    <View style={styles.logoutIconRing}>
                        <LinearGradient
                            colors={[
                                COLORS.danger + "22",
                                COLORS.danger + "08",
                            ]}
                            style={styles.logoutIconGrad}>
                            <Ionicons
                                name="log-out-outline"
                                size={30}
                                color={COLORS.danger}
                            />
                        </LinearGradient>
                    </View>
                    <Text style={styles.logoutTitle}>Sign Out?</Text>
                    <Text style={styles.logoutMessage}>
                        You'll need to log in again to access your enquiries and
                        data.
                    </Text>
                    <View style={styles.logoutActionRow}>
                        <TouchableOpacity
                            style={styles.logoutCancelBtn}
                            onPress={onClose}>
                            <Text style={styles.logoutCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onConfirm}>
                            <LinearGradient
                                colors={[COLORS.danger, "#C5001F"]}
                                style={styles.logoutConfirmBtn}>
                                <Text style={styles.logoutConfirmText}>
                                    Sign Out
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </MotiView>
            </TouchableOpacity>
        </Modal>
    );

    const MenuItem = ({
        icon,
        label,
        color = COLORS.textSub,
        onPress,
        active,
    }) => (
        <TouchableOpacity
            style={[menuStyles.menuItem, active && menuStyles.menuItemActive]}
            onPress={onPress}
            activeOpacity={0.7}>
            <View
                style={[
                    menuStyles.menuIconWrap,
                    active && { backgroundColor: COLORS.primary + "18" },
                ]}>
                <Ionicons
                    name={icon}
                    size={21}
                    color={active ? COLORS.primary : color}
                />
            </View>
            <Text
                style={[
                    menuStyles.menuItemText,
                    { color: active ? COLORS.primary : color },
                    active && { fontWeight: "700" },
                ]}>
                {label}
            </Text>
            {active && <View style={menuStyles.menuActiveIndicator} />}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} {...swipeHandlers}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bgApp} />

            <LogoutConfirmModal
                visible={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={confirmLogout}
            />
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
            <SideMenu />

            {/* ── DETAILS MODAL ── */}
            <Modal
                visible={detailsModal}
                transparent
                animationType="slide"
                onRequestClose={() => setDetailsModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        {/* Drag handle */}
                        <View style={styles.modalDragHandle} />

                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Enquiry Details
                            </Text>
                            <TouchableOpacity
                                onPress={() => setDetailsModal(false)}
                                style={styles.closeBtn}>
                                <Ionicons
                                    name="close"
                                    size={20}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        {selectedEnquiry && (
                            <ScrollView
                                contentContainerStyle={styles.modalContent}
                                showsVerticalScrollIndicator={false}>
                                {/* Hero */}
                                <View style={styles.modalHero}>
                                    <View
                                        style={[
                                            styles.modalImageContainer,
                                            selectedEnquiry.image && {
                                                backgroundColor: "transparent",
                                                overflow: "hidden",
                                            },
                                        ]}>
                                        {selectedEnquiry.image ? (
                                            <Image
                                                source={{
                                                    uri: getImageUrl(
                                                        selectedEnquiry.image,
                                                    ),
                                                }}
                                                style={styles.modalImage}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <LinearGradient
                                                colors={
                                                    COLORS.gradients.primary
                                                }
                                                style={
                                                    styles.modalAvatarGradient
                                                }>
                                                <Text
                                                    style={
                                                        styles.modalAvatarText
                                                    }>
                                                    {selectedEnquiry.name
                                                        ?.substring(0, 2)
                                                        .toUpperCase()}
                                                </Text>
                                            </LinearGradient>
                                        )}
                                    </View>
                                    <Text style={styles.modalHeroName}>
                                        {selectedEnquiry.name}
                                    </Text>
                                    <Text style={styles.modalHeroSub}>
                                        {selectedEnquiry.mobile}
                                    </Text>
	                                    {selectedEnquiry.enqType && (
	                                        <View
	                                            style={[
	                                                styles.heroPriorityBadge,
                                                {
                                                    backgroundColor:
                                                        COLORS.primary + "15",
                                                },
                                            ]}>
                                            <Text
                                                style={[
                                                    styles.heroPriorityText,
                                                    { color: COLORS.primary },
                                                ]}>
	                                                {selectedEnquiry.enqType}
	                                            </Text>
	                                        </View>
	                                    )}
	                                    <View style={styles.heroChipsRow}>
	                                        {selectedEnquiry.status ? (
	                                            <View style={styles.heroChip}>
	                                                <Ionicons
	                                                    name="radio-button-on-outline"
	                                                    size={13}
	                                                    color={COLORS.textSub}
	                                                />
	                                                <Text
	                                                    style={
	                                                        styles.heroChipText
	                                                    }>
	                                                    {selectedEnquiry.status}
	                                                </Text>
	                                            </View>
	                                        ) : null}
	                                        {selectedEnquiry.assignedTo?.name ? (
	                                            <View style={styles.heroChip}>
	                                                <Ionicons
	                                                    name="person-circle-outline"
	                                                    size={13}
	                                                    color={COLORS.textSub}
	                                                />
	                                                <Text
	                                                    style={
	                                                        styles.heroChipText
	                                                    }>
	                                                    {selectedEnquiry.assignedTo
	                                                        ?.name}
	                                                </Text>
	                                            </View>
	                                        ) : null}
	                                        {selectedEnquiry.source ? (
	                                            <View style={styles.heroChip}>
	                                                <Ionicons
	                                                    name="git-branch-outline"
	                                                    size={13}
	                                                    color={COLORS.textSub}
	                                                />
	                                                <Text
	                                                    style={
	                                                        styles.heroChipText
	                                                    }>
	                                                    {selectedEnquiry.source}
	                                                </Text>
	                                            </View>
	                                        ) : null}
	                                    </View>
	                                </View>

	                                {/* Details */}
	                                <View style={styles.sectionBlock}>
	                                    <View style={styles.sectionHeaderRow}>
	                                        <View
	                                            style={
	                                                styles.sectionHeaderIcon
	                                            }>
	                                            <Ionicons
	                                                name="information-circle-outline"
	                                                size={15}
	                                                color={COLORS.primary}
	                                            />
	                                        </View>
	                                        <Text
	                                            style={styles.sectionHeaderTitle}>
	                                            Details
	                                        </Text>
	                                    </View>
	                                    <View style={styles.sectionCard}>
	                                    <DetailRow
	                                        label="Name"
	                                        value={selectedEnquiry.name}
	                                        icon="person-outline"
	                                    />
                                    <DetailRow
                                        label="Mobile"
                                        value={selectedEnquiry.mobile}
                                        icon="call-outline"
                                    />
                                    {selectedEnquiry.email && (
                                        <DetailRow
                                            label="Email"
                                            value={selectedEnquiry.email}
                                            icon="mail-outline"
                                        />
                                    )}
                                    <DetailRow
                                        label="Enquiry No"
                                        value={selectedEnquiry.enqNo || "-"}
                                        icon="document-text-outline"
                                    />
                                    <DetailRow
                                        label="Product"
                                        value={selectedEnquiry.product}
                                        icon="briefcase-outline"
                                    />
                                    {selectedEnquiry.cost && (
                                        <DetailRow
                                            label="Estimated Cost"
                                            value={`₹${selectedEnquiry.cost}`}
                                            icon="pricetag-outline"
                                        />
                                    )}
                                    <DetailRow
                                        label="Address"
                                        value={selectedEnquiry.address || "-"}
                                        icon="location-outline"
                                    />
                                    <DetailRow
                                        label="Assigned Staff"
                                        value={
                                            selectedEnquiry.assignedTo?.name ||
                                            "-"
                                        }
                                        icon="people-outline"
                                    />
                                    <DetailRow
                                        label="Enquiry Date Time"
                                        icon="time-outline"
                                        value={
                                            selectedEnquiry.enquiryDateTime
                                                ? safeLocaleString(
                                                      selectedEnquiry.enquiryDateTime,
                                                  )
                                                : safeLocaleString(
                                                      selectedEnquiry.createdAt,
                                                  )
                                        }
                                    />
                                    <DetailRow
                                        label="Priority"
                                        value={
                                            selectedEnquiry.enqType || "Normal"
                                        }
                                        icon="flag-outline"
                                    />
	                                    <DetailRow
	                                        label="Source"
	                                        value={selectedEnquiry.source || "-"}
	                                        icon="git-branch-outline"
	                                    />
	                                    </View>
	                                </View>

	                                {/* Call History */}
	                                <View style={styles.sectionBlock}>
	                                    <View style={styles.sectionHeaderRow}>
	                                        <View
	                                            style={
	                                                styles.sectionHeaderIcon
	                                            }>
	                                            <Ionicons
	                                                name="call-outline"
	                                                size={15}
	                                                color={COLORS.primary}
	                                            />
	                                        </View>
	                                        <Text
	                                            style={styles.sectionHeaderTitle}>
	                                            Call History
	                                        </Text>
	                                        <View style={{ flex: 1 }} />
	                                        <Text style={styles.logCount}>
	                                            {enquiryCallLogs.length} calls
	                                        </Text>
	                                    </View>

	                                    <View style={styles.sectionCard}>
	                                        {logsLoading ? (
	                                            <ActivityIndicator
	                                                size="small"
	                                                color={COLORS.primary}
	                                                style={{
	                                                    marginVertical: 24,
	                                                }}
	                                            />
	                                        ) : enquiryCallLogs.length > 0 ? (
	                                            enquiryCallLogs.map(
	                                                (log, idx) => (
	                                                    <View
	                                                        key={
	                                                            log._id || idx
	                                                        }
	                                                        style={
	                                                            styles.logItem
	                                                        }>
	                                            <View
	                                                style={[
	                                                    styles.logIconContainer,
                                                    {
                                                        backgroundColor:
                                                            log.callType ===
                                                            "Incoming"
                                                                ? COLORS.success +
                                                                  "18"
                                                                : log.callType ===
                                                                    "Outgoing"
                                                                  ? COLORS.primary +
                                                                    "18"
                                                                  : COLORS.danger +
                                                                    "18",
                                                    },
                                                ]}>
                                                <Ionicons
                                                    name={
                                                        log.callType ===
                                                        "Incoming"
                                                            ? "arrow-down-outline"
                                                            : log.callType ===
                                                                "Outgoing"
                                                              ? "arrow-up-outline"
                                                              : "close-outline"
                                                    }
                                                    size={14}
                                                    color={
                                                        log.callType ===
                                                        "Incoming"
                                                            ? COLORS.success
                                                            : log.callType ===
                                                                "Outgoing"
                                                              ? COLORS.primary
                                                              : COLORS.danger
                                                    }
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={styles.logTypeText}>
                                                    {log.callType}
                                                </Text>
                                                <Text
                                                    style={styles.logDateText}>
                                                    {new Date(
                                                        log.callTime,
                                                    ).toLocaleDateString([], {
                                                        month: "short",
                                                        day: "numeric",
                                                    })}{" "}
                                                    at{" "}
                                                    {new Date(
                                                        log.callTime,
                                                    ).toLocaleTimeString([], {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </Text>
                                            </View>
                                            <View style={styles.logRight}>
                                                <Text
                                                    style={
                                                        styles.logDurationText
                                                    }>
                                                    {formatLogDuration(
                                                        log.duration,
                                                    )}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.logStatusLabel
                                                    }>
                                                    Duration
                                                </Text>
                                            </View>
	                                                    </View>
	                                                ),
	                                            )
	                                        ) : (
	                                            <View style={styles.emptyLogs}>
	                                                <Ionicons
	                                                    name="call-outline"
	                                                    size={28}
	                                                    color={
	                                                        COLORS.textLight
	                                                    }
	                                                />
	                                                <Text
	                                                    style={
	                                                        styles.emptyLogsText
	                                                    }>
	                                                    No calls recorded yet
	                                                </Text>
	                                            </View>
	                                        )}
	                                    </View>
	                                </View>
                            </ScrollView>
                        )}

                        {/* Footer actions */}
                        <View style={styles.modalFooter}>
                            <TouchableOpacity
                                style={[
                                    styles.modalBtn,
                                    { backgroundColor: COLORS.success },
                                ]}
                                onPress={() => handleCall(selectedEnquiry)}>
                                <Ionicons name="call" color="#fff" size={18} />
                                <Text style={styles.modalBtnText}>Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.modalBtn,
                                    { backgroundColor: COLORS.whatsapp },
                                ]}
                                onPress={() => handleWhatsApp(selectedEnquiry)}>
                                <Ionicons
                                    name="logo-whatsapp"
                                    color="#fff"
                                    size={18}
                                />
                                <Text style={styles.modalBtnText}>
                                    WhatsApp
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleFollowUp(selectedEnquiry)}
                                style={{ flex: 1 }}>
                                <LinearGradient
                                    colors={COLORS.gradients.primary}
                                    style={styles.modalBtnGrad}>
                                    <Ionicons
                                        name="add-circle-outline"
                                        color="#fff"
                                        size={18}
                                    />
                                    <Text style={styles.modalBtnText}>
                                        Follow Up
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ── HEADER ── */}
            <View
                style={[styles.headerWrapper, { paddingTop: insets.top + -30 }]}>
                <View style={styles.headerTop}>
                    <TouchableOpacity
                        onPress={() => setMenuVisible(true)}
                        style={styles.menuIconContainer}>
                        <Ionicons
                            name="menu"
                            size={22}
                            color={COLORS.textSub}
                        />
                    </TouchableOpacity>

                    <View style={styles.headerCenter}>
                        <Text style={styles.greetingHeader}>Enquiry List</Text>
                        <Text style={styles.userNameHeader}>
                            {user?.name || "User"}
                        </Text>
                    </View>

                    <View style={styles.headerRight}>
                        <TouchableOpacity style={styles.notifContainer}>
                            <Ionicons
                                name="notifications-outline"
                                size={22}
                                color={COLORS.textSub}
                            />
                            <View style={styles.notifBadge} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate("ProfileScreen")}
                            activeOpacity={0.85}
                            style={styles.profileBtn}>
                            {user?.logo ? (
                                <Image
                                    source={{ uri: getImageUrl(user.logo) }}
                                    style={styles.profileAvatar}
                                />
                            ) : (
                                <View style={styles.profileFallback}>
                                    <Text style={styles.profileFallbackText}>
                                        {user?.name?.[0]?.toUpperCase?.() ||
                                            "U"}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Search bar */}
                <View style={styles.searchContainer}>
                    <Ionicons
                        name="search-outline"
                        size={18}
                        color={COLORS.textMuted}
                        style={{ marginLeft: 14 }}
                    />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search name, phone..."
                        placeholderTextColor={COLORS.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    <TouchableOpacity
                        onPress={() => setDatePickerVisible(true)}
                        style={styles.calendarTrigger}>
                        <Ionicons
                            name="calendar-outline"
                            size={18}
                            color={COLORS.primary}
                        />
                    </TouchableOpacity>
                </View>

                {/* Info row */}
                <View style={styles.headerInfoRow}>
                    <Text style={styles.headerInfoText}>
                        {enquiries.length} enqu
                        {enquiries.length === 1 ? "iry" : "iries"}
                    </Text>
                    {selectedDate ? (
                        <TouchableOpacity
                            style={styles.activeDatePill}
                            onPress={() => setSelectedDate(null)}>
                            <Ionicons
                                name="close-circle"
                                size={13}
                                color={COLORS.primary}
                            />
                            <Text style={styles.activeDateText}>
                                {selectedDate}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* ── LIST ── */}
	            <FlatList
	                data={enquiries}
	                keyExtractor={keyExtractor}
	                renderItem={renderEnquiryItem}
	                contentContainerStyle={[
	                    styles.listContent,
	                    enquiries.length === 0 && { flex: 1 },
	                ]}
                refreshing={isLoading && enquiries.length > 0}
                onRefresh={() => fetchEnquiries(true)}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                initialNumToRender={8}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={true}
                updateCellsBatchingPeriod={30}
                ListFooterComponent={
                    isLoadingMore ? (
                        <View style={{ paddingVertical: 20 }}>
                            <ActivityIndicator
                                size="small"
                                color={COLORS.primary}
                            />
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    isLoading ? (
                        <View style={styles.emptyContainer}>
                            <ActivityIndicator
                                size="large"
                                color={COLORS.primary}
                            />
                            <Text style={[styles.emptyText, { marginTop: 16 }]}>
                                Loading enquiries...
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconWrap}>
                                <Ionicons
                                    name="document-text-outline"
                                    size={40}
                                    color={COLORS.primary}
                                />
                            </View>
                            <Text style={styles.emptyTitle}>
                                No enquiries found
                            </Text>
                            <Text style={styles.emptySubtext}>
                                Try adjusting your search or date filter
                            </Text>
                        </View>
                    )
                }
                showsVerticalScrollIndicator={false}
            />

            {/* ── FAB ── */}
            {user?.role !== "Staff" && (
                <Animated.View
                    style={[
                        styles.fabContainer,
                        { transform: [{ scale: fabScale }] },
                    ]}>
                    <TouchableOpacity
                        onPress={() => {
                            animateFab();
                            try {
                                navigation.navigate("AddEnquiry", {
                                    onEnquirySaved: fetchEnquiries,
                                });
                            } catch (e) {
                                navigation.navigate("Enquiry", {
                                    screen: "AddEnquiry",
                                    params: { onEnquirySaved: fetchEnquiries },
                                });
                            }
                        }}
                        activeOpacity={0.85}>
                        <LinearGradient
                            colors={COLORS.gradients.primary}
                            style={styles.fab}>
                            <Ionicons name="add" size={26} color="#FFF" />
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* ── DATE PICKER MODAL ── */}
            <Modal
                visible={datePickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDatePickerVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.datePickerCard}>
                        <View style={styles.modalDragHandle} />
                        <View style={styles.dateHeader}>
                            <TouchableOpacity
                                onPress={() => {
                                    const y = calendarMonth.getFullYear();
                                    const m = calendarMonth.getMonth();
                                    setCalendarMonth(new Date(y, m - 1, 1));
                                }}
                                style={styles.calNavBtn}>
                                <Ionicons
                                    name="chevron-back"
                                    size={22}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                            <Text style={styles.dateTitle}>
                                {calendarMonth.toLocaleString(undefined, {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </Text>
                            <TouchableOpacity
                                onPress={() => {
                                    const y = calendarMonth.getFullYear();
                                    const m = calendarMonth.getMonth();
                                    setCalendarMonth(new Date(y, m + 1, 1));
                                }}
                                style={styles.calNavBtn}>
                                <Ionicons
                                    name="chevron-forward"
                                    size={22}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        <View
                            style={{
                                paddingHorizontal: 16,
                                paddingBottom: 24,
                                width: "100%",
                                alignItems: "center",
                            }}>
                            <TouchableOpacity
                                style={styles.clearDateBtn}
                                onPress={() => {
                                    setSelectedDate(null);
                                    setDatePickerVisible(false);
                                }}>
                                <Text style={styles.clearDateText}>
                                    Show All Dates
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.weekHeader}>
                                {[
                                    "Mon",
                                    "Tue",
                                    "Wed",
                                    "Thu",
                                    "Fri",
                                    "Sat",
                                    "Sun",
                                ].map((d, i) => (
                                    <Text key={i} style={styles.weekDay}>
                                        {d}
                                    </Text>
                                ))}
                            </View>

                            <View style={styles.calendarGrid}>
                                {(() => {
                                    const y = calendarMonth.getFullYear();
                                    const m = calendarMonth.getMonth();
                                    const firstDay = new Date(
                                        y,
                                        m,
                                        1,
                                        12,
                                    ).getDay();
                                    const firstDayIndex = (firstDay + 6) % 7;
                                    const daysInMonth = new Date(
                                        y,
                                        m + 1,
                                        0,
                                    ).getDate();
                                    const cells = [];
                                    for (let i = 0; i < firstDayIndex; i++)
                                        cells.push(
                                            <View
                                                key={`e-${i}`}
                                                style={styles.dayCell}
                                            />,
                                        );
                                    for (let d = 1; d <= daysInMonth; d++) {
                                        const cellDate = new Date(y, m, d);
                                        const iso = toLocalIso(cellDate);
                                        const isSelected = selectedDate === iso;
                                        const isToday =
                                            toLocalIso(new Date()) === iso;
                                        cells.push(
                                            <TouchableOpacity
                                                key={d}
                                                onPress={() => {
                                                    setSelectedDate(iso);
                                                    setDatePickerVisible(false);
                                                }}
                                                style={[
                                                    styles.dayCell,
                                                    isSelected &&
                                                        styles.daySelected,
                                                    isToday &&
                                                        !isSelected &&
                                                        styles.dayToday,
                                                ]}>
                                                {isSelected ? (
                                                    <LinearGradient
                                                        colors={
                                                            COLORS.gradients
                                                                .primary
                                                        }
                                                        style={
                                                            styles.daySelectedGrad
                                                        }>
                                                        <Text
                                                            style={[
                                                                styles.dayText,
                                                                styles.dayTextSelected,
                                                            ]}>
                                                            {d}
                                                        </Text>
                                                    </LinearGradient>
                                                ) : (
                                                    <Text
                                                        style={[
                                                            styles.dayText,
                                                            isToday &&
                                                                !isSelected &&
                                                                styles.dayTextToday,
                                                        ]}>
                                                        {d}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>,
                                        );
                                    }
                                    return cells;
                                })()}
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ── HELPER COMPONENTS ─────────────────────────────────────────────────────
const DetailRow = ({ label, value, icon }) => (
    <View style={styles.detailRow}>
        <View style={styles.detailIconWrap}>
            <Ionicons
                name={icon || "information-circle-outline"}
                size={15}
                color={COLORS.primary}
            />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue}>{value}</Text>
        </View>
    </View>
);

const StatCard = ({ label, value, icon, gradient }) => (
    <MotiView
        from={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={styles.statCardWrapper}>
        <LinearGradient colors={gradient} style={styles.statCard}>
            <View style={styles.statIconCircle}>
                <Ionicons name={icon} size={15} color="#FFF" />
            </View>
            <View>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
            </View>
        </LinearGradient>
    </MotiView>
);

// ── STYLES ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bgApp },

    // ── Header ──
    headerWrapper: {
        backgroundColor: COLORS.bgCard,
        paddingHorizontal: 18,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    headerTop: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    headerCenter: { flex: 1, marginLeft: 12 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
    menuIconContainer: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    menuIconInner: { gap: 4, alignItems: "flex-end" },
    hamburgerLine: {
        height: 2,
        width: 18,
        backgroundColor: COLORS.textSub,
        borderRadius: 2,
    },
    greetingHeader: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: "500",
        letterSpacing: 0.3,
    },
    userNameHeader: {
        fontSize: 18,
        color: COLORS.textMain,
        fontWeight: "700",
        letterSpacing: -0.3,
    },
    notifContainer: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    notifBadge: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLORS.secondary,
        borderWidth: 1.5,
        borderColor: COLORS.bgCard,
    },
    profileBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
    },
    profileAvatar: { width: "100%", height: "100%", borderRadius: 14 },
    profileFallback: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: COLORS.primaryLight,
    },
    profileFallbackText: {
        color: COLORS.primaryDark,
        fontWeight: "900",
        fontSize: 16,
    },

    // Search
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.bgApp,
        borderRadius: 14,
        height: 48,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        marginBottom: 10,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 15,
        color: COLORS.textMain,
        fontWeight: "400",
    },
    calendarTrigger: {
        width: 40,
        height: 36,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 6,
        borderRadius: 10,
        backgroundColor: COLORS.primaryLight,
    },
    headerInfoRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 2,
    },
    headerInfoText: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: "600",
    },
    activeDatePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: COLORS.primaryLight,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    activeDateText: { fontSize: 12, color: COLORS.primary, fontWeight: "700" },

    // ── Cards ──
    listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
    cardWrapper: { marginBottom: 14 },
    cardContainer: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 20,
        padding: 16,
        paddingLeft: 20,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 16,
        elevation: 3,
        overflow: "hidden",
    },
    cardStripe: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        borderTopLeftRadius: 20,
        borderBottomLeftRadius: 20,
    },

    cardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 12,
    },
    avatarContainer: {
        width: 50,
        height: 50,
        borderRadius: 15,
        marginRight: 12,
        flexShrink: 0,
    },
    avatarImg: { width: "100%", height: "100%", borderRadius: 15 },
    avatarGradient: {
        width: "100%",
        height: "100%",
        borderRadius: 15,
        justifyContent: "center",
        alignItems: "center",
    },
    avatarText: {
        color: "#FFF",
        fontSize: 17,
        fontWeight: "800",
        letterSpacing: 0.5,
    },
    avatarDot: {
        position: "absolute",
        bottom: 1,
        right: 1,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: COLORS.bgCard,
    },

    cardInfo: { flex: 1 },
    nameRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    cardName: {
        fontSize: 16,
        fontWeight: "700",
        color: COLORS.textMain,
        flex: 1,
        letterSpacing: -0.2,
    },
    cardBadges: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginLeft: 6,
    },
    enqNoBadge: {
        backgroundColor: COLORS.primaryLight,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: COLORS.primaryMid,
    },
    enqNoText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },
    dateBadge: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.bgApp,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
    },
    dateText: { fontSize: 10, fontWeight: "700", color: COLORS.textMuted },

    subInfoRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 4,
    },
    subInfoChip: { flexDirection: "row", alignItems: "center", gap: 4 },
    cardSubtext: { fontSize: 12, color: COLORS.textMuted, fontWeight: "500" },
    emailRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginTop: 2,
    },
    emailText: {
        fontSize: 11,
        color: COLORS.textLight,
        fontWeight: "500",
        flex: 1,
    },

    productSection: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 12,
        marginBottom: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.divider,
    },
    productTag: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.primaryLight,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 9,
        flex: 1,
        marginRight: 8,
    },
    productText: {
        fontSize: 12,
        color: COLORS.primaryDark,
        fontWeight: "700",
        flex: 1,
    },
    priorityBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 9,
    },
    priorityDot: { width: 6, height: 6, borderRadius: 3 },
    priorityText: {
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },

    metaRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 12,
        flexWrap: "wrap",
    },
    metaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: COLORS.bgApp,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 7,
    },
    metaChipText: { fontSize: 11, color: COLORS.textMuted, fontWeight: "600" },

    cardDivider: {
        height: 1,
        backgroundColor: COLORS.divider,
        marginBottom: 12,
    },
    actionBar: { flexDirection: "row", alignItems: "center", gap: 8 },
    actionBtnPrimary: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 9,
        borderRadius: 11,
    },
    actionBtnLabel: { fontSize: 13, fontWeight: "700" },
    actionRight: { flexDirection: "row", gap: 6 },
    actionIconBtn: {
        width: 38,
        height: 38,
        borderRadius: 11,
        justifyContent: "center",
        alignItems: "center",
    },

    // ── FAB ──
    fabContainer: { position: "absolute", bottom: 32, right: 22 },
    fab: {
        width: 58,
        height: 58,
        borderRadius: 29,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },

    // ── Modals ──
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(10,15,30,0.5)",
        justifyContent: "flex-end",
    },
    modalContainer: {
        backgroundColor: COLORS.bgCard,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: "90%",
        overflow: "hidden",
    },
    modalDragHandle: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.border,
        alignSelf: "center",
        marginTop: 10,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.divider,
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: COLORS.textMain,
        letterSpacing: -0.2,
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
    },

    modalContent: { padding: 20 },

    modalHero: { alignItems: "center", marginBottom: 24 },
    modalImageContainer: {
        width: 90,
        height: 90,
        borderRadius: 28,
        marginBottom: 14,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 5,
        backgroundColor: COLORS.bgApp,
    },
    modalImage: { width: "100%", height: "100%", borderRadius: 28 },
    modalAvatarGradient: {
        width: "100%",
        height: "100%",
        borderRadius: 28,
        justifyContent: "center",
        alignItems: "center",
    },
    modalAvatarText: { fontSize: 30, fontWeight: "800", color: "#FFF" },
    modalHeroName: {
        fontSize: 22,
        fontWeight: "800",
        color: COLORS.textMain,
        marginBottom: 4,
        letterSpacing: -0.4,
    },
    modalHeroSub: {
        fontSize: 14,
        color: COLORS.textMuted,
        fontWeight: "500",
        marginBottom: 10,
    },
	    heroPriorityBadge: {
	        paddingHorizontal: 12,
	        paddingVertical: 5,
	        borderRadius: 20,
	    },
	    heroPriorityText: { fontSize: 12, fontWeight: "700" },
	    heroChipsRow: {
	        flexDirection: "row",
	        flexWrap: "wrap",
	        justifyContent: "center",
	        gap: 8,
	        marginTop: 12,
	    },
	    heroChip: {
	        flexDirection: "row",
	        alignItems: "center",
	        gap: 6,
	        paddingHorizontal: 10,
	        paddingVertical: 6,
	        borderRadius: 999,
	        backgroundColor: COLORS.bgApp,
	        borderWidth: 1,
	        borderColor: COLORS.border,
	    },
	    heroChipText: {
	        fontSize: 12,
	        color: COLORS.textSub,
	        fontWeight: "700",
	    },

	    sectionBlock: { marginBottom: 16 },
	    sectionHeaderRow: {
	        flexDirection: "row",
	        alignItems: "center",
	        gap: 10,
	        marginBottom: 10,
	    },
	    sectionHeaderIcon: {
	        width: 28,
	        height: 28,
	        borderRadius: 9,
	        backgroundColor: COLORS.primaryLight,
	        justifyContent: "center",
	        alignItems: "center",
	    },
	    sectionHeaderTitle: {
	        fontSize: 14,
	        fontWeight: "900",
	        color: COLORS.textMain,
	        letterSpacing: -0.1,
	    },
	    sectionCard: {
	        backgroundColor: COLORS.bgCardAlt,
	        borderRadius: 18,
	        borderWidth: 1,
	        borderColor: COLORS.border,
	        paddingHorizontal: 14,
	        paddingVertical: 4,
	        overflow: "hidden",
	    },

	    detailsGrid: { gap: 4, marginBottom: 8 },
    detailRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.divider,
    },
    detailIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: COLORS.primaryLight,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
        flexShrink: 0,
    },
    detailLabel: {
        fontSize: 11,
        color: COLORS.textLight,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    detailValue: { fontSize: 14, color: COLORS.textMain, fontWeight: "600" },

    logHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 20,
        marginBottom: 12,
    },
    logHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
    logHeaderIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: COLORS.primaryLight,
        justifyContent: "center",
        alignItems: "center",
    },
    logSectionTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: COLORS.textMain,
        letterSpacing: -0.1,
    },
    logCount: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: "600",
        backgroundColor: COLORS.bgApp,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },

	    logItem: {
	        flexDirection: "row",
	        alignItems: "center",
	        paddingVertical: 12,
	        borderBottomWidth: 1,
	        borderBottomColor: COLORS.divider,
	    },
    logIconContainer: {
        width: 34,
        height: 34,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    logTypeText: { fontSize: 13, fontWeight: "700", color: COLORS.textMain },
    logDateText: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
    logRight: { alignItems: "flex-end" },
    logDurationText: { fontSize: 13, fontWeight: "800", color: COLORS.primary },
    logStatusLabel: {
        fontSize: 9,
        color: COLORS.textLight,
        fontWeight: "600",
        textTransform: "uppercase",
        marginTop: 2,
    },

    emptyLogs: { padding: 32, alignItems: "center", gap: 8 },
    emptyLogsText: { color: COLORS.textLight, fontSize: 13, fontWeight: "500" },

    modalFooter: {
        flexDirection: "row",
        padding: 16,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.divider,
    },
    modalBtn: {
        flex: 1,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 14,
        borderRadius: 14,
        gap: 6,
    },
    modalBtnGrad: {
        flex: 1,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 14,
        borderRadius: 14,
        gap: 6,
    },
    modalBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

    // Date Picker
    datePickerCard: {
        backgroundColor: COLORS.bgCard,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingBottom: 24,
        alignItems: "center",
    },
    dateHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        width: "100%",
    },
    calNavBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
    },
    dateTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textMain },
    clearDateBtn: {
        paddingVertical: 11,
        paddingHorizontal: 20,
        borderRadius: 14,
        backgroundColor: COLORS.primaryLight,
        marginBottom: 16,
        alignSelf: "stretch",
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: COLORS.primaryMid,
    },
    clearDateText: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
    weekHeader: { flexDirection: "row", width: 308, marginBottom: 6 },
    weekDay: {
        width: 44,
        textAlign: "center",
        fontSize: 11,
        fontWeight: "700",
        color: COLORS.textLight,
        paddingVertical: 6,
    },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap", width: 308 },
    dayCell: {
        width: 44,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
    },
    daySelected: { borderRadius: 12 },
    daySelectedGrad: {
        width: 36,
        height: 36,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    dayToday: {
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        borderRadius: 12,
    },
    dayText: { fontSize: 14, color: COLORS.textMain, fontWeight: "600" },
    dayTextSelected: { color: "#FFF", fontWeight: "800" },
    dayTextToday: { color: COLORS.primary, fontWeight: "800" },

    // Empty State
    emptyContainer: { alignItems: "center", marginTop: 70, gap: 10 },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 22,
        backgroundColor: COLORS.primaryLight,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 4,
    },
    emptyTitle: { fontSize: 17, color: COLORS.textSub, fontWeight: "700" },
    emptyText: { fontSize: 14, color: COLORS.textLight, fontWeight: "500" },
    emptySubtext: { fontSize: 13, color: COLORS.textLight, fontWeight: "400" },

    // Stats (kept for StatCard component)
    statCardWrapper: { width: 110, marginRight: 10 },
    statCard: {
        padding: 12,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    statIconCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    statValue: { color: "#FFF", fontSize: 16, fontWeight: "800" },
    statLabel: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 10,
        fontWeight: "600",
        textTransform: "uppercase",
    },

    // Logout
    logoutModalContainer: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 28,
        padding: 28,
        width: "100%",
        maxWidth: 340,
        alignItems: "center",
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 12,
    },
    logoutIconRing: { marginBottom: 18 },
    logoutIconGrad: {
        width: 68,
        height: 68,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
    },
    logoutTitle: {
        fontSize: 21,
        fontWeight: "800",
        color: COLORS.textMain,
        marginBottom: 8,
        letterSpacing: -0.3,
    },
    logoutMessage: {
        fontSize: 14,
        color: COLORS.textMuted,
        textAlign: "center",
        lineHeight: 21,
        marginBottom: 26,
    },
    logoutActionRow: { flexDirection: "row", gap: 12, width: "100%" },
    logoutCancelBtn: {
        flex: 1,
        height: 50,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: COLORS.bgApp,
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    logoutConfirmBtn: {
        flex: 1,
        height: 50,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
    },
    logoutCancelText: {
        fontSize: 15,
        fontWeight: "700",
        color: COLORS.textMuted,
    },
    logoutConfirmText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

const menuStyles = StyleSheet.create({
    menuOverlay: { flex: 1, backgroundColor: "rgba(10,15,30,0.45)" },
    menuContent: {
        width: "78%",
        backgroundColor: COLORS.bgCard,
        height: "100%",
        borderTopRightRadius: 32,
        borderBottomRightRadius: 32,
        overflow: "hidden",
    },
    menuHeader: {
        paddingTop:
            Platform.OS === "android"
                ? (StatusBar.currentHeight || 0) + 24
                : 54,
        paddingBottom: 28,
        alignItems: "center",
    },
    profileCircle: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.35)",
    },
    profileName: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
        letterSpacing: -0.3,
    },
    rolePill: {
        marginTop: 6,
        backgroundColor: "rgba(255,255,255,0.2)",
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    profileRole: {
        color: "rgba(255,255,255,0.9)",
        fontSize: 12,
        fontWeight: "600",
    },
    menuList: { padding: 14 },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 11,
        paddingHorizontal: 10,
        borderRadius: 14,
        marginBottom: 3,
    },
    menuItemActive: { backgroundColor: COLORS.primaryLight },
    menuIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 11,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    menuItemText: { fontSize: 15, fontWeight: "600", flex: 1 },
    menuActiveIndicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.primary,
    },

    logoSection: {
        marginTop: 20,
        paddingTop: 20,
        paddingBottom: 30,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        alignItems: "center",
    },
    logoContainer: { alignItems: "center", marginBottom: 10 },
    logoImage: { width: 120, height: 38 },
    logoIconCircle: {
        width: 50,
        height: 50,
        borderRadius: 16,
        backgroundColor: COLORS.primary,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    logoText: {
        fontSize: 15,
        fontWeight: "800",
        color: COLORS.textMain,
        marginTop: 8,
    },
    logoSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    versionText: { fontSize: 11, color: COLORS.textLight, fontWeight: "500" },
});
