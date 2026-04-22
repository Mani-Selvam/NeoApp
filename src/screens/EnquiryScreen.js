import { Ionicons } from "@expo/vector-icons";
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
    Dimensions,
    Easing,
    FlatList,
    Image,
    Linking,
    Modal,
    PanResponder,
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
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import AppSideMenu from "../components/AppSideMenu";
import { EnquirySkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import { API_URL as GLOBAL_API_URL } from "../services/apiConfig";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    setCacheEntry,
} from "../services/appCache";
import * as enquiryService from "../services/enquiryService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import { getAuthToken } from "../services/secureTokenStorage";
import {
    APP_EVENTS,
    emitEnquiryCreated,
    emitFollowupChanged,
    onAppEvent,
} from "../services/appEvents";
import { cancelDebounceKey, debounceByKey } from "../services/debounce";
import {
    confirmPermissionRequest,
    getUserFacingError,
} from "../utils/appFeedback";
import { getImageUrl } from "../utils/imageHelper";
import {
    buildFeatureUpgradeMessage,
    hasPlanFeature,
} from "../utils/planFeatures";
import { useSilentRefresh } from "../hooks/useSilentRefresh";

const API_URL = `${GLOBAL_API_URL}/enquiries`;
const { width: SW, height: SH } = Dimensions.get("window");
const AUTO_SAVE_CALL_LOGS =
    String(process.env.EXPO_PUBLIC_CALL_AUTO_SAVE ?? "false")
        .trim()
        .toLowerCase() === "true";
const ENQUIRIES_CACHE_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_ENQUIRIES_MS || 60000,
);

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
    warm: [C.warning, "#B45309"],
    teal: [C.info, "#0E7490"],
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const toLocalIso = (d) => {
    const date = d ? new Date(d) : new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const safeDate = (raw, opts) => {
    if (!raw) return "-";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, opts);
};
const safeDateTime = (raw) => {
    if (!raw) return "-";
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString();
};
const fmtDur = (s) => {
    if (!s) return "0s";
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
};
const getInitials = (name = "") => name.substring(0, 2).toUpperCase() || "NA";
const avatarColors = (name = "") => {
    const h = name
        ? (name.charCodeAt(0) * 23 + (name.charCodeAt(1) || 0) * 7) % 360
        : 220;
    return [`hsl(${h},65%,52%)`, `hsl(${(h + 30) % 360},70%,42%)`];
};
const priorityCfg = (type) => {
    const t = (type || "").toLowerCase();
    if (t.includes("hot") || t.includes("high"))
        return { color: C.danger, bg: "#FEF2F2", label: "Hot" };
    if (t.includes("warm") || t.includes("med"))
        return { color: C.warning, bg: "#FFFBEB", label: "Warm" };
    return { color: C.primary, bg: C.primarySoft, label: type || "Normal" };
};
const displayStatusLabel = (status) => {
    if (status === "Converted") return "Sales";
    if (status === "Closed") return "Drop";
    return status || "New";
};

const getAssignedUserLabel = (assignedTo) => {
    if (!assignedTo) return "-";
    if (typeof assignedTo === "string") return assignedTo;
    return assignedTo?.name || assignedTo?.email || assignedTo?.mobile || "-";
};

// â”€â”€â”€ Compact enquiry card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EnquiryCard = React.memo(function EnquiryCard({
    item,
    index,
    onPress,
    onSwipe,
    onCall,
    onWhatsApp,
    onLongPress,
    deleteMode = false,
    deleting = false,
    onDeleteConfirm,
    onDeleteCancel,
    swipeResetTrigger = 0,
}) {
    const scale = useRef(new Animated.Value(1)).current;
    const translateX = useRef(new Animated.Value(0)).current;
    const swipeFallbackTimerRef = useRef(null);
    const swipeOpenedRef = useRef(false);
    const pCfg = priorityCfg(item.enqType);
    const colors = avatarColors(item.name);
    const swipeOpacity = translateX.interpolate({
        inputRange: [-SW, -SW * 0.35, 0],
        outputRange: [0.78, 0.92, 1],
        extrapolate: "clamp",
    });

    useEffect(() => {
        return () => {
            if (swipeFallbackTimerRef.current) {
                clearTimeout(swipeFallbackTimerRef.current);
                swipeFallbackTimerRef.current = null;
            }
        };
    }, []);

    // FlatList can recycle row components; ensure a previously swiped row never stays off-screen.
    useEffect(() => {
        translateX.setValue(0);
        scale.setValue(1);
        swipeOpenedRef.current = false;
        if (swipeFallbackTimerRef.current) {
            clearTimeout(swipeFallbackTimerRef.current);
            swipeFallbackTimerRef.current = null;
        }
    }, [item?._id, item?.enqNo, swipeResetTrigger]);

    // horizontal swipe LEFT to open detail page (RIGHT swipe = no action)
    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
            onMoveShouldSetPanResponderCapture: (_, g) =>
                Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: () => {
                translateX.setValue(0);
            },
            onPanResponderMove: (_, g) => {
                translateX.setValue(Math.min(0, g.dx));
            },
            onPanResponderRelease: (_, g) => {
                if (g.dx < -55) {
                    swipeOpenedRef.current = false;
                    if (swipeFallbackTimerRef.current) {
                        clearTimeout(swipeFallbackTimerRef.current);
                    }
                    // Fallback: ensure the card always resets back into view even if the animation callback is missed.
                    swipeFallbackTimerRef.current = setTimeout(() => {
                        translateX.setValue(0);
                        swipeFallbackTimerRef.current = null;
                        if (!swipeOpenedRef.current) {
                            swipeOpenedRef.current = true;
                            onSwipe?.(item);
                        }
                    }, 320);

                    Animated.timing(translateX, {
                        toValue: -SW,
                        duration: 240,
                        easing: Easing.out(Easing.cubic),
                        useNativeDriver: true,
                    }).start(() => {
                        translateX.setValue(0);
                        if (swipeFallbackTimerRef.current) {
                            clearTimeout(swipeFallbackTimerRef.current);
                            swipeFallbackTimerRef.current = null;
                        }
                        if (!swipeOpenedRef.current) {
                            swipeOpenedRef.current = true;
                            onSwipe?.(item);
                        }
                    });
                } else {
                    Animated.spring(translateX, {
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
        <MotiView
            from={{ opacity: 0, translateX: 24 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{
                type: "timing",
                duration: 280,
                delay: index < 8 ? index * 40 : 0,
            }}
            style={S.cardWrap}>
            <Animated.View
                style={{ transform: [{ translateX }], opacity: swipeOpacity }}
                {...pan.panHandlers}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPressIn={() =>
                        Animated.spring(scale, {
                            toValue: 0.98,
                            useNativeDriver: true,
                        }).start()
                    }
                    onPressOut={() =>
                        Animated.spring(scale, {
                            toValue: 1,
                            useNativeDriver: true,
                        }).start()
                    }
                    onPress={() => {
                        if (deleteMode) {
                            onDeleteCancel?.();
                            return;
                        }
                        onPress(item);
                    }}
                    onLongPress={() => onLongPress?.(item)}
                    delayLongPress={350}>
                    <Animated.View style={[S.card, { transform: [{ scale }] }]}>
                        {/* Left priority stripe */}
                        <View
                            style={[S.stripe, { backgroundColor: pCfg.color }]}
                        />

                        <View style={S.cardBody}>
                            {/* Top row */}
                            <View style={S.cardRow}>
                                {/* Avatar */}
                                <View style={S.avatarBox}>
                                    {item.image ? (
                                        <Image
                                            source={{
                                                uri: getImageUrl(item.image),
                                            }}
                                            style={S.avatarImg}
                                        />
                                    ) : (
                                        <LinearGradient
                                            colors={colors}
                                            style={S.avatarGrad}>
                                            <Text style={S.avatarText}>
                                                {getInitials(item.name)}
                                            </Text>
                                        </LinearGradient>
                                    )}
                                    <View
                                        style={[
                                            S.avatarDot,
                                            { backgroundColor: pCfg.color },
                                        ]}
                                    />
                                </View>

                                {/* Info */}
                                <View style={S.cardMid}>
                                    <View style={S.cardRowBetween}>
                                        <Text
                                            style={S.cardName}
                                            numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <Text style={S.cardDate}>
                                            {safeDate(
                                                item.enquiryDateTime ||
                                                    item.createdAt,
                                                {
                                                    month: "short",
                                                    day: "numeric",
                                                },
                                            )}
                                        </Text>
                                    </View>
                                    <View style={S.cardRowBetween}>
                                        <View style={S.productPill}>
                                            <Ionicons
                                                name="briefcase-outline"
                                                size={11}
                                                color={C.primary}
                                            />
                                            <Text
                                                style={S.productPillText}
                                                numberOfLines={1}>
                                                {item.product || "General"}
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                S.priorityPill,
                                                { backgroundColor: pCfg.bg },
                                            ]}>
                                            <View
                                                style={[
                                                    S.priorityDot,
                                                    {
                                                        backgroundColor:
                                                            pCfg.color,
                                                    },
                                                ]}
                                            />
                                            <Text
                                                style={[
                                                    S.priorityPillText,
                                                    { color: pCfg.color },
                                                ]}>
                                                {pCfg.label}
                                            </Text>
                                        </View>
                                    </View>
                                    {/* Mobile + status */}
                                    <View style={S.cardRowBetween}>
                                        <Text style={S.cardMobile}>
                                            {item.mobile}
                                        </Text>
                                        <Text style={S.cardStatus}>
                                            {displayStatusLabel(item.status)}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* Action bar */}
                            <View style={S.cardActions}>
                                {deleteMode ? (
                                    <View style={S.deleteBar}>
                                        <View style={S.deletePill}>
                                            <Ionicons
                                                name="trash-outline"
                                                size={14}
                                                color={C.danger}
                                            />
                                            <Text style={S.deletePillText}>
                                                Delete this enquiry?
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }} />
                                        <TouchableOpacity
                                            style={S.deleteGhostBtn}
                                            onPress={() => onDeleteCancel?.()}
                                            disabled={deleting}>
                                            <Text style={S.deleteGhostText}>
                                                Cancel
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                S.deleteDangerBtn,
                                                deleting &&
                                                    S.deleteDangerBtnDisabled,
                                            ]}
                                            onPress={() =>
                                                onDeleteConfirm?.(item)
                                            }
                                            disabled={deleting}>
                                            {deleting ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color="#fff"
                                                />
                                            ) : (
                                                <Text
                                                    style={S.deleteDangerText}>
                                                    Delete
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        <TouchableOpacity
                                            style={[
                                                S.actionChip,
                                                {
                                                    backgroundColor:
                                                        C.success + "18",
                                                },
                                            ]}
                                            onPress={() => onCall(item)}>
                                            <Ionicons
                                                name="call"
                                                size={15}
                                                color={C.success}
                                            />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                S.actionChip,
                                                {
                                                    backgroundColor:
                                                        C.whatsapp + "18",
                                                },
                                            ]}
                                            onPress={() => onWhatsApp(item)}>
                                            <Ionicons
                                                name="logo-whatsapp"
                                                size={15}
                                                color={C.whatsapp}
                                            />
                                        </TouchableOpacity>
                                        <View style={{ flex: 1 }} />
                                        {item.enqNo && (
                                            <View style={S.enqNoBadge}>
                                                <Text style={S.enqNoText}>
                                                    #{item.enqNo}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={S.swipeHint}>
                                            <Ionicons
                                                name="chevron-forward"
                                                size={13}
                                                color={C.textLight}
                                            />
                                            <Text style={S.swipeHintText}>
                                                Details
                                            </Text>
                                        </View>
                                    </>
                                )}
                            </View>
                        </View>
                    </Animated.View>
                </TouchableOpacity>
            </Animated.View>
        </MotiView>
    );
});

// â”€â”€â”€ Detail page (slides in from right) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DETAIL_TABS = ["Details"];

const EnquiryDetailPage = ({
    enquiry,
    logsLoading,
    onClose,
    onEdit,
    onMakeFollowUp,
    billingInfo,
    showUpgradePrompt,
}) => {
    const insets = useSafeAreaInsets();
    const slideX = useRef(new Animated.Value(SW)).current;
    const [tab, setTab] = useState(0);
    const tabSlideX = useRef(new Animated.Value(0)).current;
    const lastTabRef = useRef(0);
    const [taskModalVisible, setTaskModalVisible] = useState(false);
    const [followUpHistory, setFollowUpHistory] = useState([]);
    const [followUpLoading, setFollowUpLoading] = useState(false);
    const pCfg = priorityCfg(enquiry?.enqType);
    const colors = avatarColors(enquiry?.name);
    const changeTab = (nextTab) => {
        if (nextTab === 1 && !hasPlanFeature(billingInfo?.plan, "call_logs")) {
            showUpgradePrompt(buildFeatureUpgradeMessage("call_logs", "Calls"));
            return;
        }
        setTab(nextTab);
    };

    const followUpItems = useMemo(() => {
        return Array.isArray(followUpHistory) ? followUpHistory : [];
    }, [followUpHistory]);

    const pendingTasks = useMemo(() => {
        return followUpItems.filter((x) => {
            const s = String(x?.status || "")
                .trim()
                .toLowerCase();
            return s !== "completed";
        });
    }, [followUpItems]);

    const taskIcon = (type) => {
        const t = String(type || "")
            .trim()
            .toLowerCase();
        if (t === "whatsapp") return "logo-whatsapp";
        if (t === "email") return "mail-outline";
        if (t === "meeting") return "people-outline";
        if (t === "visit") return "navigate-outline";
        return "call-outline";
    };

    const taskStatusCfg = (status) => {
        const s = String(status || "")
            .trim()
            .toLowerCase();
        if (s === "completed") return { label: "Done", color: C.success };
        if (s === "missed") return { label: "Missed", color: C.danger };
        return { label: "Pending", color: C.warning };
    };

    const taskTimeLabel = (t) => {
        const dt = t?.dueAt || t?.activityTime;
        if (dt) {
            const d = new Date(dt);
            if (!isNaN(d.getTime()))
                return d.toLocaleString(undefined, {
                    month: "short",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                });
        }
        const dateStr = t?.nextFollowUpDate || t?.followUpDate || t?.date;
        const timeStr = String(t?.time || "").trim();
        if (dateStr && timeStr) return `${dateStr} ${timeStr}`;
        return dateStr || "-";
    };

    useEffect(() => {
        let alive = true;
        const load = async () => {
            if (!enquiry?._id && !enquiry?.enqNo) return;
            setFollowUpLoading(true);
            try {
                const key = enquiry?.enqNo || enquiry?._id;
                const res = await followupService.getFollowUpHistory(key, {
                    force: false,
                });
                const list = Array.isArray(res?.data)
                    ? res.data
                    : Array.isArray(res)
                      ? res
                      : [];
                if (alive) setFollowUpHistory(list);
            } catch {
                if (alive) setFollowUpHistory([]);
            } finally {
                if (alive) setFollowUpLoading(false);
            }
        };
        load();
        return () => {
            alive = false;
        };
    }, [enquiry?._id, enquiry?.enqNo]);

    useEffect(() => {
        Animated.timing(slideX, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [slideX]);

    useEffect(() => {
        const direction = tab >= lastTabRef.current ? 1 : -1;
        tabSlideX.setValue(direction * 26);
        Animated.timing(tabSlideX, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
        lastTabRef.current = tab;
    }, [tab, tabSlideX]);

    useEffect(() => {
        const handleHardwareBack = () => {
            if (tab > 0) {
                setTab((currentTab) => Math.max(0, currentTab - 1));
                return true;
            }
            handleClose();
            return true;
        };

        const subscription = BackHandler.addEventListener(
            "hardwareBackPress",
            handleHardwareBack,
        );

        return () => subscription.remove();
    }, [tab]);

    const handleClose = () => {
        Animated.timing(slideX, {
            toValue: SW,
            duration: 260,
            useNativeDriver: true,
        }).start(onClose);
    };

    if (!enquiry) return null;

    return (
        <Animated.View
            style={[SD.root, { transform: [{ translateX: slideX }] }]}>
            <StatusBar barStyle="dark-content" />

            {/* â”€â”€ Top card: white bg, decorative circles, circle avatar â”€â”€ */}
            <View style={[SD.topCard, { paddingTop: insets.top + 54 }]}>
                {/* Decorative background circles */}
                <View style={SD.deco1} />
                <View style={SD.deco2} />
                <View style={SD.deco3} />

                {/* Back button */}
                <TouchableOpacity
                    onPress={handleClose}
                    style={[SD.backBtn, { top: insets.top + 8 }]}>
                    <Ionicons name="arrow-back" size={19} color={C.textSub} />
                </TouchableOpacity>

                {/* Edit button top-right */}
                <TouchableOpacity
                    onPress={() => onEdit(enquiry)}
                    style={[SD.editBtn, { top: insets.top + 8 }]}>
                    <Ionicons
                        name="create-outline"
                        size={19}
                        color={C.textSub}
                    />
                </TouchableOpacity>

                {/* Avatar â€” large circle */}
                <View style={SD.avatarRing}>
                    <View style={SD.avatarOuter}>
                        {enquiry.image ? (
                            <Image
                                source={{ uri: getImageUrl(enquiry.image) }}
                                style={SD.avatarImg}
                            />
                        ) : (
                            <LinearGradient
                                colors={colors}
                                style={SD.avatarGrad}>
                                <Text style={SD.avatarText}>
                                    {getInitials(enquiry.name)}
                                </Text>
                            </LinearGradient>
                        )}
                    </View>
                    {/* Priority dot */}
                    <View
                        style={[SD.priDot, { backgroundColor: pCfg.color }]}
                    />
                </View>

                {/* Name & mobile */}
                <Text style={SD.heroName}>{enquiry.name}</Text>
                <Text style={SD.heroMobile}>{enquiry.mobile}</Text>

                {/* Info chips */}
                <View style={SD.chipsRow}>
                    <View style={[SD.chip, { backgroundColor: pCfg.bg }]}>
                        <View
                            style={[
                                SD.chipDot,
                                { backgroundColor: pCfg.color },
                            ]}
                        />
                        <Text style={[SD.chipText, { color: pCfg.color }]}>
                            {enquiry.enqType || "Normal"}
                        </Text>
                    </View>
                    {enquiry.status ? (
                        <View style={SD.chip}>
                            <Ionicons
                                name="radio-button-on"
                                size={9}
                                color={C.textMuted}
                            />
                            <Text style={SD.chipText}>
                                {displayStatusLabel(enquiry.status)}
                            </Text>
                        </View>
                    ) : null}
                    {enquiry.source ? (
                        <View style={SD.chip}>
                            <Ionicons
                                name="git-branch-outline"
                                size={9}
                                color={C.textMuted}
                            />
                            <Text style={SD.chipText}>{enquiry.source}</Text>
                        </View>
                    ) : null}
                    {enquiry.product ? (
                        <View style={SD.chip}>
                            <Ionicons
                                name="briefcase-outline"
                                size={9}
                                color={C.textMuted}
                            />
                            <Text style={SD.chipText} numberOfLines={1}>
                                {enquiry.product}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>

            {/* â”€â”€ Tabs â”€â”€ */}
            <View style={SD.tabBar}>
                {DETAIL_TABS.map((t, i) => (
                    <TouchableOpacity
                        key={t}
                        onPress={() => changeTab(i)}
                        style={[SD.tab, tab === i && SD.tabActive]}>
                        <Text
                            style={[SD.tabText, tab === i && SD.tabTextActive]}>
                            {t}
                        </Text>
                        {tab === i && <View style={SD.tabLine} />}
                    </TouchableOpacity>
                ))}
            </View>

            {/* â”€â”€ Tab content â€” swipeable â”€â”€ */}
            {(() => {
                const tabPan = PanResponder.create({
                    onStartShouldSetPanResponder: () => false,
                    // Only allow LEFT swipe gestures inside detail view (RIGHT swipe = no action)
                    onMoveShouldSetPanResponder: (_, g) =>
                        Math.abs(g.dx) > 10 &&
                        Math.abs(g.dx) > Math.abs(g.dy) * 1.1,
                    onMoveShouldSetPanResponderCapture: (_, g) =>
                        Math.abs(g.dx) > 10 &&
                        Math.abs(g.dx) > Math.abs(g.dy) * 1.1,
                    onPanResponderTerminationRequest: () => false,
                    onPanResponderRelease: (_, g) => {
                        // Close record on LEFT swipe. Right swipe does nothing.
                        if (g.dx < -60) handleClose();
                    },
                });
                return (
                    <Animated.View
                        style={{
                            flex: 1,
                            transform: [{ translateX: tabSlideX }],
                        }}
                        {...tabPan.panHandlers}>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{
                                padding: 14,
                                paddingBottom: 110,
                            }}
                            showsVerticalScrollIndicator={false}>
                            {tab === 0 && (
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
                                                ? `\u20B9${enquiry.cost}`
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
                                            value: getAssignedUserLabel(
                                                enquiry.assignedTo,
                                            ),
                                            icon: "person-circle-outline",
                                        },
                                        {
                                            label: "Date & Time",
                                            value: safeDateTime(
                                                enquiry.enquiryDateTime ||
                                                    enquiry.createdAt,
                                            ),
                                            icon: "time-outline",
                                        },
                                        {
                                            label: "Lead Source",
                                            value: enquiry.source || "-",
                                            icon: "git-branch-outline",
                                        },
                                    ].map((row) => (
                                        <View
                                            key={row.label}
                                            style={SD.detailRow}>
                                            <View style={SD.detailIconBox}>
                                                <Ionicons
                                                    name={row.icon}
                                                    size={14}
                                                    color={C.primary}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={SD.detailLabel}>
                                                    {row.label}
                                                </Text>
                                                <Text style={SD.detailValue}>
                                                    {row.value}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                    <TouchableOpacity
                                        style={SD.makeFollowupBtn}
                                        onPress={() => {
                                            onClose();
                                            setTimeout(
                                                () => onMakeFollowUp?.(enquiry),
                                                100,
                                            );
                                        }}
                                        activeOpacity={0.8}>
                                        <Ionicons
                                            name="add-circle-outline"
                                            size={16}
                                            color="#FFFFFF"
                                            style={{ marginRight: 6 }}
                                        />
                                        <Text style={SD.makeFollowupBtnText}>
                                            Make Follow-up
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    </Animated.View>
                );
            })()}
        </Animated.View>
    );
};

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function EnquiryListScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { user, logout, billingInfo, showUpgradePrompt } = useAuth();

    const [enquiries, setEnquiries] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedDate, setSelectedDate] = useState(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [datePickerVisible, setDatePickerVisible] = useState(false);
    const [deleteEnquiryId, setDeleteEnquiryId] = useState(null);
    const [deletingEnquiryId, setDeletingEnquiryId] = useState(null);
    const enquiriesFetchInFlightRef = useRef(false);

    // Detail page
    const [detailEnquiry, setDetailEnquiry] = useState(null);
    const [logsLoading, setLogsLoading] = useState(false);
    const [swipeResetTrigger, setSwipeResetTrigger] = useState(0);

    // Call state
    const [callEnquiry, setCallEnquiry] = useState(null);
    const [callStartTime, setCallStartTime] = useState(null);
    const [callStarted, setCallStarted] = useState(false);

    const [menuVisible, setMenuVisible] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    // URL Scraping state
    const [scrapeModalVisible, setScrapeModalVisible] = useState(false);
    const [scrapeUrl, setScrapeUrl] = useState("");
    const [isScraping, setIsScraping] = useState(false);
    const [scrapedData, setScrapedData] = useState(null);
    const [scrapeError, setScrapeError] = useState(null);

    const fabScale = useRef(new Animated.Value(1)).current;
    const isInitialMount = useRef(true);
    const skipNextSearch = useRef(false);
    const fetchRef = useRef(null);

    const getEnquiryKey = useCallback((item) => {
        const id = item?._id || item?.id;
        if (id) return `id:${String(id)}`;
        const no = item?.enqNo;
        if (no) return `no:${String(no)}`;
        const mobile = item?.mobile || item?.phone;
        if (mobile) return `m:${String(mobile)}`;
        return "";
    }, []);

    const dedupeEnquiries = useCallback(
        (items = []) => {
            const list = Array.isArray(items) ? items.filter(Boolean) : [];
            const seen = new Set();
            const out = [];
            for (const item of list) {
                const key = getEnquiryKey(item);
                if (!key) {
                    out.push(item);
                    continue;
                }
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(item);
            }
            return out;
        },
        [getEnquiryKey],
    );

    // â”€â”€ Data fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const fetchEnquiries = useCallback(
        async (refresh = false, opts = {}) => {
            const {
                showIndicator = false,
                force = false,
                allowCache = true,
            } = opts || {};

            if (enquiriesFetchInFlightRef.current) return;
            // Avoid entering "inFlight" when paginating but nothing to do.
            if (!refresh && (!hasMore || isLoadingMore)) return;

            enquiriesFetchInFlightRef.current = true;
            const cacheKey = buildCacheKey(
                "enquiries:list:v1",
                user?.id || user?._id || "",
                selectedDate || "",
                String(searchQuery || "")
                    .trim()
                    .toLowerCase(),
            );

            let cached = null;
            try {
                if (refresh && allowCache) {
                    cached = await getCacheEntry(cacheKey).catch(() => null);
                    if (cached?.value?.items) {
                        const cachedItems = Array.isArray(cached.value.items)
                            ? cached.value.items
                            : [];
                        setEnquiries(dedupeEnquiries(cachedItems));
                        setHasMore(Boolean(cached.value.hasMore));
                        setPage(Number(cached.value.page || 1));
                        if (!showIndicator) setIsLoading(false);
                    }
                }

                if (refresh) {
                    const shouldFetch =
                        force || !isFresh(cached, ENQUIRIES_CACHE_TTL_MS);
                    if (!shouldFetch) return;
                    if (showIndicator) setIsLoading(true);
                } else {
                    setIsLoadingMore(true);
                }

                // When refreshing, reload up to the current loaded page count so the
                // previously visible records don't "disappear" after coming back from detail.
                const PAGE_SIZE = 20;
                const loadedCount = Array.isArray(enquiries)
                    ? enquiries.length
                    : 0;
                const loadedPagesFromList = Math.max(
                    1,
                    Math.ceil(loadedCount / PAGE_SIZE),
                );
                const pagesToReload = refresh ? loadedPagesFromList : 1;

                if (refresh) {
                    let merged = [];
                    let totalPages = null;
                    let loadedPages = 0;

                    for (let pg = 1; pg <= pagesToReload; pg += 1) {
                        const res = await enquiryService.getAllEnquiries(
                            pg,
                            PAGE_SIZE,
                            searchQuery,
                            "",
                            selectedDate,
                        );

                        if (Array.isArray(res)) {
                            merged = res;
                            totalPages = 1;
                            loadedPages = 1;
                            break;
                        }

                        const data = Array.isArray(res?.data) ? res.data : [];
                        merged = [...merged, ...data];
                        loadedPages = pg;
                        totalPages = Number(res?.pagination?.pages || 1);
                        if (loadedPages >= totalPages) break;
                    }

                    const nextItems = dedupeEnquiries(merged);
                    const nextHasMore = totalPages
                        ? loadedPages < totalPages
                        : false;
                    const nextPage = totalPages
                        ? Math.min(loadedPages + 1, totalPages + 1)
                        : 1;

                    setEnquiries(nextItems);
                    setHasMore(nextHasMore);
                    setPage(nextPage);
                    await setCacheEntry(
                        cacheKey,
                        {
                            items: nextItems,
                            hasMore: nextHasMore,
                            page: nextPage,
                        },
                        { tags: ["enquiries"] },
                    ).catch(() => {});
                } else {
                    const pg = page;
                    const res = await enquiryService.getAllEnquiries(
                        pg,
                        PAGE_SIZE,
                        searchQuery,
                        "",
                        selectedDate,
                    );
                    let data = [];
                    let totalPages = 1;
                    if (Array.isArray(res)) {
                        data = res;
                        setHasMore(false);
                    } else if (res?.data) {
                        data = res.data;
                        totalPages = res.pagination?.pages || 1;
                        setHasMore(pg < totalPages);
                    }
                    const nextItems = dedupeEnquiries([
                        ...(enquiries || []),
                        ...data,
                    ]);
                    const nextHasMore = Array.isArray(res)
                        ? false
                        : pg < totalPages;
                    const nextPage = pg + 1;

                    setEnquiries(nextItems);
                    setHasMore(nextHasMore);
                    setPage(nextPage);
                    await setCacheEntry(
                        cacheKey,
                        {
                            items: nextItems,
                            hasMore: nextHasMore,
                            page: nextPage,
                        },
                        { tags: ["enquiries"] },
                    ).catch(() => {});
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
                setIsLoadingMore(false);
                enquiriesFetchInFlightRef.current = false;
            }
        },
        [
            enquiries,
            hasMore,
            isLoadingMore,
            page,
            searchQuery,
            selectedDate,
            dedupeEnquiries,
            user?.id,
            user?._id,
        ],
    );

    useEffect(() => {
        fetchRef.current = fetchEnquiries;
    }, [fetchEnquiries]);

    // Auto-refresh enquiries every 5 seconds while active
    useSilentRefresh(
        () => fetchEnquiries(true, { showIndicator: false, force: true }),
        5000,
    );
    useEffect(() => {
        fetchEnquiries(true, {
            showIndicator: false,
            force: false,
            allowCache: true,
        });
    }, []);
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        fetchEnquiries(true, {
            showIndicator: false,
            force: false,
            allowCache: true,
        });
    }, [selectedDate]);
    useEffect(() => {
        if (isInitialMount.current) return;
        if (skipNextSearch.current) {
            skipNextSearch.current = false;
            return;
        }
        const t = setTimeout(
            () =>
                fetchEnquiries(true, {
                    showIndicator: false,
                    force: false,
                    allowCache: true,
                }),
            500,
        );
        return () => clearTimeout(t);
    }, [searchQuery]);

    // â”€â”€ Call listeners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("CALL_ENDED", (data) => {
            if (callStarted && callEnquiry) {
                global.__callClaimedByScreen = true;

                // Call log feature has been removed
                setCallEnquiry(null);
                setCallStarted(false);
                setCallStartTime(null);
            }
        });
        return () => sub.remove();
    }, [callStarted, callEnquiry]);

    useEffect(() => {
        // Call log feature has been removed
        const sub = AppState.addEventListener("change", (next) => {
            if (
                next === "active" &&
                callStarted &&
                callStartTime &&
                callEnquiry
            ) {
                setCallEnquiry(null);
                setCallStarted(false);
                setCallStartTime(null);
            }
        });
        return () => sub.remove();
    }, [callStarted, callStartTime, callEnquiry]);

    useEffect(() => {
        const refresh = () =>
            debounceByKey(
                "enquiry-refresh",
                () =>
                    fetchEnquiries(true, {
                        showIndicator: false,
                        force: true,
                        allowCache: false,
                    }),
                300,
            );

        const unsub2 = onAppEvent(APP_EVENTS.ENQUIRY_CREATED, refresh);
        const unsub3 = onAppEvent(APP_EVENTS.ENQUIRY_UPDATED, refresh);
        const unsub4 = onAppEvent(APP_EVENTS.FOLLOWUP_CHANGED, refresh);

        return () => {
            cancelDebounceKey("enquiry-refresh");
            unsub2();
            unsub3();
            unsub4();
        };
    }, [fetchEnquiries]);

    useEffect(() => {
        const isNew = global.nativeFabricUIManager != null;
        if (
            Platform.OS === "android" &&
            !isNew &&
            UIManager.setLayoutAnimationEnabledExperimental
        )
            UIManager.setLayoutAnimationEnabledExperimental(true);
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener("blur", () => {
            setDetailEnquiry(null);
            setLogsLoading(false);
        });
        return unsubscribe;
    }, [navigation]);

    // â”€â”€ Action handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const openDetail = useCallback(async (enquiry) => {
        setSwipeResetTrigger((prev) => prev + 1);
        setDetailEnquiry(enquiry);
        setLogsLoading(false);
        try {
            const full = await enquiryService.getEnquiryById(enquiry._id);
            setDetailEnquiry(full || enquiry);
        } catch {
            setDetailEnquiry(enquiry);
        }
    }, []);

    const handleCall = useCallback(async (enquiry) => {
        if (!enquiry?.mobile) return;
        const raw = String(enquiry.mobile).replace(/\D/g, "");
        if (!raw) {
            Alert.alert("No phone", "No valid phone number.");
            return;
        }
        setCallEnquiry(enquiry);
        setCallStarted(true);
        setCallStartTime(Date.now());
        try {
            if (
                Platform.OS === "android" &&
                RNImmediatePhoneCall?.immediatePhoneCall
            ) {
                RNImmediatePhoneCall.immediatePhoneCall(raw);
                return;
            }
            await Linking.openURL(`tel:${raw}`);
        } catch (error) {
            setCallStarted(false);
            setCallStartTime(null);
            setCallEnquiry(null);
            Alert.alert(
                "Call failed",
                getUserFacingError(error, "Could not start the phone call."),
            );
        }
    }, []);

    const handleWhatsApp = useCallback(
        (enquiry) => {
            if (!enquiry?.mobile) return;
            navigation.navigate("WhatsAppChat", { enquiry });
        },
        [navigation],
    );

    const handleEdit = useCallback(
        (enquiry) => {
            setDetailEnquiry(null);
            navigation.navigate("AddEnquiry", { enquiry });
        },
        [navigation],
    );

    const handleMakeFollowUp = useCallback(
        (enquiry) => {
            if (!enquiry) return;
            setDetailEnquiry(null);
            navigation.navigate("FollowUp", {
                openComposer: true,
                composerToken: String(Date.now()),
                enquiry,
                autoOpenForm: true,
            });
        },
        [navigation],
    );

    const handleDelete = useCallback(async (enquiry) => {
        const id = enquiry?._id;
        if (!id) return;
        try {
            setDeletingEnquiryId(id);
            // Grab follow-up ids before deletion, so we can cancel any queued notifications even if enqId/enqNo is missing in old schedules.
            const followUpIds = await (async () => {
                try {
                    const key = enquiry?.enqNo || id;
                    const hist = await followupService.getFollowUpHistory(key);
                    const list = Array.isArray(hist?.data)
                        ? hist.data
                        : Array.isArray(hist)
                          ? hist
                          : [];
                    return list.map((x) => x?._id).filter(Boolean);
                } catch {
                    return [];
                }
            })();
            await enquiryService.deleteEnquiry(id);
            try {
                await notificationService.cancelNotificationsForEnquiry?.({
                    enqId: id,
                    enqNo: enquiry?.enqNo,
                });
                await notificationService.cancelNotificationsForFollowUpIds?.(
                    followUpIds,
                );
                await notificationService.cancelNextFollowUpPromptForEnquiry?.({
                    enqId: id,
                    enqNo: enquiry?.enqNo,
                });
            } catch (e) {}

            // Trigger a follow-up resync so hourly/time reminders reflect the deletion immediately.
            try {
                emitFollowupChanged({
                    item: {
                        status: "deleted",
                        enqId: id,
                        enqNo: enquiry?.enqNo,
                    },
                });
            } catch {}
            setEnquiries((p) => p.filter((e) => e._id !== id));
            setDeleteEnquiryId((current) => (current === id ? null : current));
        } catch (e) {
            Alert.alert("Failed", getUserFacingError(e, "Failed to delete."));
        } finally {
            setDeletingEnquiryId((current) =>
                current === id ? null : current,
            );
        }
    }, []);

    // â”€â”€ Web Scraping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleScrapeWebsite = async () => {
        if (!scrapeUrl.trim()) {
            setScrapeError("Please enter a valid URL");
            return;
        }

        setIsScraping(true);
        setScrapeError(null);
        setScrapedData(null);

        try {
            // Validate URL format
            try {
                new URL(scrapeUrl);
            } catch {
                throw new Error(
                    "Please enter a valid URL (e.g., https://example.com)",
                );
            }

            // Get the authentication token from secure storage
            const token = await getAuthToken();
            if (!token) {
                throw new Error("Not authenticated. Please log in again.");
            }

            const fullUrl = `${GLOBAL_API_URL}/enquiries/scrape-website`;
            console.log("[Scraping] Calling endpoint:", fullUrl);

            const response = await fetch(fullUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ url: scrapeUrl }),
            });

            const responseData = await response.json();
            console.log("[Scraping] Response status:", response.status);
            console.log("[Scraping] Response data:", responseData);

            if (!response.ok) {
                throw new Error(
                    responseData?.error ||
                        (response.status === 404
                            ? "Could not extract data from this website"
                            : `Server error (${response.status}): Failed to scrape website`),
                );
            }

            setScrapedData(responseData);
        } catch (error) {
            console.error("[Scraping Error]", error);
            const message = error.message || "Invalid URL or scraping failed";
            setScrapeError(message);
        } finally {
            setIsScraping(false);
        }
    };

    const handleSaveScrapedData = async () => {
        if (!scrapedData) return;

        try {
            // Get the authentication token from secure storage
            const token = await getAuthToken();
            if (!token) {
                throw new Error("Not authenticated. Please log in again.");
            }

            const enquiryPayload = {
                name: scrapedData.companyName || "",
                email: scrapedData.email || "",
                mobile: scrapedData.phone || "",
                address: scrapedData.location || "",
                product: "Website Scrape",
                cost: 0, // Default cost for web scraped leads
                requirements: Array.isArray(scrapedData.productDetails)
                    ? scrapedData.productDetails.join(" | ")
                    : scrapedData.productDetails || "",
                source: "Website Scraping",
                status: "New",
            };

            // Validate required fields
            if (!enquiryPayload.name) {
                throw new Error("Company name is required");
            }
            if (!enquiryPayload.mobile) {
                throw new Error("Phone number is required");
            }

            console.log("[Save] Payload:", enquiryPayload);
            console.log("[Save] API URL:", API_URL);

            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(enquiryPayload),
            });

            const responseData = await response.json();
            console.log("[Save] Response status:", response.status);
            console.log("[Save] Response data:", responseData);

            if (!response.ok) {
                throw new Error(
                    responseData?.message ||
                        responseData?.error ||
                        "Failed to save enquiry",
                );
            }

            // Notify other screens (Home/Report/etc.) to refresh immediately.
            try {
                emitEnquiryCreated(responseData);
            } catch (_e) {}

            Alert.alert(
                "\u2713 Success",
                `Enquiry saved for ${enquiryPayload.name || "company"}`,
                [
                    {
                        text: "Done",
                        onPress: () => {
                            handleCancelScrape();
                            fetchEnquiries(true, { force: true });
                        },
                    },
                ],
            );
        } catch (error) {
            console.error("[Save Error]", error);
            Alert.alert("Error", "Failed to save enquiry: " + error.message);
        }
    };

    const handleCancelScrape = () => {
        setScrapeModalVisible(false);
        setScrapeUrl("");
        setScrapedData(null);
        setScrapeError(null);
    };

    // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const renderItem = useCallback(
        ({ item, index }) => (
            <EnquiryCard
                item={item}
                index={index}
                onPress={openDetail}
                onSwipe={openDetail}
                onCall={handleCall}
                onWhatsApp={handleWhatsApp}
                onLongPress={(enquiry) =>
                    setDeleteEnquiryId((current) =>
                        current === enquiry._id ? null : enquiry._id,
                    )
                }
                deleteMode={deleteEnquiryId === item._id}
                deleting={deletingEnquiryId === item._id}
                onDeleteCancel={() => setDeleteEnquiryId(null)}
                onDeleteConfirm={(enquiry) => handleDelete(enquiry)}
                swipeResetTrigger={swipeResetTrigger}
            />
        ),
        [
            openDetail,
            handleCall,
            handleWhatsApp,
            handleDelete,
            deleteEnquiryId,
            deletingEnquiryId,
            swipeResetTrigger,
        ],
    );

    const listEnquiries = useMemo(() => {
        const arr = Array.isArray(enquiries) ? enquiries : [];
        return dedupeEnquiries(arr);
    }, [enquiries, dedupeEnquiries]);

    const keyExtractor = useCallback((item, index) => {
        const base = String(
            item?._id ||
                item?.id ||
                item?.enqNo ||
                item?.mobile ||
                item?.phone ||
                "enq",
        );
        // Use stable keys; duplicates are handled by dedupeEnquiries().
        return base || `enq-${index}`;
    }, []);

    return (
        <SafeAreaView style={S.root} edges={["top"]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

            <AppSideMenu
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
                navigation={navigation}
                user={user}
                onLogout={() => {
                    setMenuVisible(false);
                    setShowLogoutModal(true);
                }}
                activeRouteName="Enquiry"
                resolveImageUrl={getImageUrl}
            />

            {/* Logout modal */}
            <Modal
                visible={showLogoutModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowLogoutModal(false)}>
                <View style={S.modalBg}>
                    <MotiView
                        from={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={S.logoutBox}>
                        <View style={S.logoutIconWrap}>
                            <Ionicons
                                name="log-out-outline"
                                size={28}
                                color={C.danger}
                            />
                        </View>
                        <Text style={S.logoutTitle}>Sign Out?</Text>
                        <Text style={S.logoutSub}>
                            You&apos;ll need to log in again to access your
                            data.
                        </Text>
                        <View style={S.logoutBtns}>
                            <TouchableOpacity
                                style={S.logoutCancel}
                                onPress={() => setShowLogoutModal(false)}>
                                <Text style={S.logoutCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={async () => {
                                    setShowLogoutModal(false);
                                    await logout();
                                }}>
                                <LinearGradient
                                    colors={GRAD.danger}
                                    style={S.logoutConfirm}>
                                    <Text style={S.logoutConfirmText}>
                                        Sign Out
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </MotiView>
                </View>
            </Modal>

            {/* â”€â”€ Header â”€â”€ */}
            <View style={S.header}>
                <View style={S.headerTop}>
                    <TouchableOpacity
                        style={S.headerBtn}
                        onPress={() => setMenuVisible(true)}>
                        <Ionicons name="menu" size={21} color={C.textSub} />
                    </TouchableOpacity>
                    <View style={S.headerTitleBlock}>
                        <Text style={S.headerLabel}>Enquiry List</Text>
                        <View style={S.headerUserRow}>
                            <Ionicons
                                name="person-circle-outline"
                                size={18}
                                color={C.textMuted}
                                style={S.headerUserIcon}
                            />
                            <Text style={S.headerName} numberOfLines={1}>
                                {user?.name || "User"}
                            </Text>
                        </View>
                    </View>
                    <View style={S.headerRight}>
                        {/* <TouchableOpacity
                            style={[S.headerBtn, S.headerBtnPrimary]}
                            accessibilityRole="button"
                            accessibilityLabel="Add website URL"
                            onPress={() => setScrapeModalVisible(true)}>
                            <Ionicons
                                name="link-outline"
                                size={20}
                                color={C.primary}
                            />
                        </TouchableOpacity> */}

                        <TouchableOpacity
                            style={S.profileBtn}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityLabel="Open profile"
                            onPress={() =>
                                navigation.navigate("ProfileScreen")
                            }>
                            {user?.logo ? (
                                <Image
                                    source={{ uri: getImageUrl(user.logo) }}
                                    style={S.profileImg}
                                />
                            ) : (
                                <View style={S.profileFallback}>
                                    <Text style={S.profileFallbackText}>
                                        {user?.name?.[0]?.toUpperCase() || "U"}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Search */}
                <View style={S.searchBar}>
                    <Ionicons
                        name="search-outline"
                        size={17}
                        color={C.textMuted}
                        style={{ marginLeft: 12 }}
                    />
                    <TextInput
                        style={S.searchInput}
                        placeholder="Search name, phone..."
                        placeholderTextColor={C.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    <TouchableOpacity
                        onPress={() => setDatePickerVisible(true)}
                        style={S.calBtn}>
                        <Ionicons
                            name="calendar-outline"
                            size={17}
                            color={C.primary}
                        />
                    </TouchableOpacity>
                </View>

                <View style={S.headerMeta}>
                    <Text style={S.headerMetaText}>
                        {listEnquiries.length}{" "}
                        {listEnquiries.length === 1 ? "enquiry" : "enquiries"}
                    </Text>
                    {selectedDate && (
                        <TouchableOpacity
                            onPress={() => setSelectedDate(null)}
                            style={S.datePill}>
                            <Ionicons
                                name="close-circle"
                                size={12}
                                color={C.primary}
                            />
                            <Text style={S.datePillText}>{selectedDate}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* â”€â”€ List â”€â”€ */}
            <FlatList
                data={listEnquiries}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={[
                    S.list,
                    listEnquiries.length === 0 && { flex: 1 },
                ]}
                refreshing={isLoading && listEnquiries.length > 0}
                onRefresh={() =>
                    fetchEnquiries(true, {
                        showIndicator: true,
                        force: true,
                        allowCache: false,
                    })
                }
                onEndReached={() => {
                    if (!isLoading && !isLoadingMore && hasMore)
                        fetchEnquiries(false);
                }}
                onEndReachedThreshold={0.5}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={11}
                removeClippedSubviews={false}
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
                        <EnquirySkeleton />
                    ) : (
                        <View style={S.emptyWrap}>
                            <View style={S.emptyIcon}>
                                <Ionicons
                                    name="document-text-outline"
                                    size={36}
                                    color={C.primary}
                                />
                            </View>
                            <Text style={S.emptyTitle}>No enquiries found</Text>
                            <Text style={S.emptySubtext}>
                                Try adjusting your search or date filter
                            </Text>
                        </View>
                    )
                }
                showsVerticalScrollIndicator={false}
            />

            {/* â”€â”€ FAB â”€â”€ */}
            <Animated.View
                style={[S.fab, { transform: [{ scale: fabScale }] }]}>
                <TouchableOpacity
                    onPress={() => {
                        if (!billingInfo?.hasActivePlan || !billingInfo?.plan) {
                            showUpgradePrompt(
                                "Your free CRM trial has expired. Please upgrade to add a new enquiry.",
                            );
                            return;
                        }
                        Animated.sequence([
                            Animated.timing(fabScale, {
                                toValue: 0.85,
                                duration: 100,
                                useNativeDriver: true,
                            }),
                            Animated.spring(fabScale, {
                                toValue: 1,
                                useNativeDriver: true,
                            }),
                        ]).start();
                        navigation.navigate("AddEnquiry");
                    }}
                    activeOpacity={0.85}>
                    <LinearGradient colors={GRAD.primary} style={S.fabInner}>
                        <Ionicons name="add" size={24} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            </Animated.View>

            {/* â”€â”€ URL Scraping Modal (Centered Popup) â”€â”€ */}
            <Modal
                visible={scrapeModalVisible}
                transparent
                animationType="fade"
                onRequestClose={handleCancelScrape}>
                <View style={S.modalOverlay}>
                    <View style={S.scrapeModalContent}>
                        {/* Header with Icon */}
                        <View style={S.scrapeHeader}>
                            <View style={S.headerIconGroup}>
                                <LinearGradient
                                    colors={[C.primary, C.primaryDark]}
                                    style={S.headerIcon}>
                                    <Ionicons
                                        name="globe"
                                        size={26}
                                        color="#fff"
                                    />
                                </LinearGradient>
                                <View style={{ flex: 1 }}>
                                    <Text style={S.scrapeHeaderTitle}>
                                        Website Scraper
                                    </Text>
                                    <Text style={S.scrapeHeaderSubtitle}>
                                        Extract company data instantly
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={handleCancelScrape}
                                style={S.closeBtn}>
                                <Ionicons
                                    name="close-circle"
                                    size={28}
                                    color={C.textMuted}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Content Area */}
                        <ScrollView
                            scrollEnabled={true}
                            showsVerticalScrollIndicator={false}>
                            {!scrapedData ? (
                                <View
                                    style={{
                                        paddingHorizontal: 16,
                                        paddingVertical: 20,
                                    }}>
                                    {/* URL Input Section */}
                                    <View style={S.urlInputContainer}>
                                        <View style={S.urlInputBox}>
                                            <Ionicons
                                                name="link"
                                                size={18}
                                                color={C.primary}
                                                style={{ marginRight: 10 }}
                                            />
                                            <TextInput
                                                style={S.scrapeInput}
                                                placeholder="Enter website URL"
                                                placeholderTextColor={
                                                    C.textLight
                                                }
                                                value={scrapeUrl}
                                                onChangeText={(text) => {
                                                    setScrapeUrl(text);
                                                    setScrapeError(null);
                                                }}
                                                editable={!isScraping}
                                            />
                                        </View>
                                        {scrapeError && (
                                            <View style={S.errorBox}>
                                                <Ionicons
                                                    name="alert-circle"
                                                    size={16}
                                                    color={C.danger}
                                                />
                                                <Text style={S.errorText}>
                                                    {scrapeError}
                                                </Text>
                                            </View>
                                        )}

                                        {/* Scrape Button */}
                                        <TouchableOpacity
                                            style={[
                                                S.scrapeButton,
                                                isScraping
                                                    ? S.scrapeButtonDisabled
                                                    : {},
                                            ]}
                                            onPress={handleScrapeWebsite}
                                            disabled={isScraping}>
                                            {isScraping ? (
                                                <>
                                                    <ActivityIndicator
                                                        color="#fff"
                                                        size="small"
                                                    />
                                                    <Text
                                                        style={
                                                            S.scrapeButtonText
                                                        }>
                                                        Scraping...
                                                    </Text>
                                                </>
                                            ) : (
                                                <>
                                                    <Ionicons
                                                        name="search"
                                                        size={18}
                                                        color="#fff"
                                                    />
                                                    <Text
                                                        style={
                                                            S.scrapeButtonText
                                                        }>
                                                        Scrape Website
                                                    </Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    {/* Help Section */}
                                    <View style={S.helpSection}>
                                        <Text style={S.helpTitle}>
                                            Tips to get best results:
                                        </Text>
                                        <View style={S.helpItem}>
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={14}
                                                color={C.primary}
                                            />
                                            <Text style={S.helpText}>
                                                Use complete URL (with https://)
                                            </Text>
                                        </View>
                                        <View style={S.helpItem}>
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={14}
                                                color={C.primary}
                                            />
                                            <Text style={S.helpText}>
                                                Works best with company websites
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <View
                                    style={{
                                        paddingHorizontal: 16,
                                        paddingVertical: 20,
                                    }}>
                                    {/* Success Banner */}
                                    <View style={S.successBanner}>
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={24}
                                            color={C.success}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <Text style={S.successText}>
                                                Data Extracted Successfully!
                                            </Text>
                                            <Text
                                                style={{
                                                    fontSize: 11,
                                                    color: C.success,
                                                    marginTop: 2,
                                                }}>
                                                Review and save to enquiries
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Company Profile Card */}
                                    <View style={S.companyCard}>
                                        <View style={S.companyCardHeader}>
                                            <View style={S.companyIconBg}>
                                                <Ionicons
                                                    name="business"
                                                    size={28}
                                                    color={C.primary}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={S.companyName}
                                                    numberOfLines={2}>
                                                    {scrapedData.companyName ||
                                                        "Company Name"}
                                                </Text>
                                                <Text
                                                    style={S.companyUrl}
                                                    numberOfLines={1}>
                                                    {scrapeUrl}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Data List Section */}
                                    <View style={S.dataListSection}>
                                        <Text style={S.dataListTitle}>
                                            Extracted Information
                                        </Text>

                                        {/* Email */}
                                        {scrapedData.email && (
                                            <View style={S.dataItem}>
                                                <View style={S.dataItemIcon}>
                                                    <Ionicons
                                                        name="mail"
                                                        size={18}
                                                        color={C.primary}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text
                                                        style={S.dataItemLabel}>
                                                        Email
                                                    </Text>
                                                    <Text
                                                        style={S.dataItemValue}
                                                        numberOfLines={1}>
                                                        {scrapedData.email}
                                                    </Text>
                                                </View>
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={18}
                                                    color={C.success}
                                                />
                                            </View>
                                        )}

                                        {/* Phone */}
                                        {scrapedData.phone && (
                                            <View style={S.dataItem}>
                                                <View style={S.dataItemIcon}>
                                                    <Ionicons
                                                        name="call"
                                                        size={18}
                                                        color={C.primary}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text
                                                        style={S.dataItemLabel}>
                                                        Phone
                                                    </Text>
                                                    <Text
                                                        style={S.dataItemValue}
                                                        numberOfLines={1}>
                                                        {scrapedData.phone}
                                                    </Text>
                                                </View>
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={18}
                                                    color={C.success}
                                                />
                                            </View>
                                        )}

                                        {/* Location */}
                                        {scrapedData.location && (
                                            <View style={S.dataItem}>
                                                <View style={S.dataItemIcon}>
                                                    <Ionicons
                                                        name="location"
                                                        size={18}
                                                        color={C.primary}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text
                                                        style={S.dataItemLabel}>
                                                        Address
                                                    </Text>
                                                    <Text
                                                        style={S.dataItemValue}
                                                        numberOfLines={2}>
                                                        {scrapedData.location}
                                                    </Text>
                                                </View>
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={18}
                                                    color={C.success}
                                                />
                                            </View>
                                        )}

                                        {/* Services */}
                                        {scrapedData.productDetails && (
                                            <View style={S.dataItem}>
                                                <View style={S.dataItemIcon}>
                                                    <Ionicons
                                                        name="briefcase"
                                                        size={18}
                                                        color={C.primary}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text
                                                        style={S.dataItemLabel}>
                                                        Services
                                                    </Text>
                                                    {Array.isArray(
                                                        scrapedData.productDetails,
                                                    ) ? (
                                                        <Text
                                                            style={
                                                                S.dataItemValue
                                                            }
                                                            numberOfLines={2}>
                                                            {scrapedData.productDetails
                                                                .slice(0, 2)
                                                                .join(", ")}
                                                            {scrapedData
                                                                .productDetails
                                                                .length > 2
                                                                ? "..."
                                                                : ""}
                                                        </Text>
                                                    ) : (
                                                        <Text
                                                            style={
                                                                S.dataItemValue
                                                            }
                                                            numberOfLines={2}>
                                                            {
                                                                scrapedData.productDetails
                                                            }
                                                        </Text>
                                                    )}
                                                </View>
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={18}
                                                    color={C.success}
                                                />
                                            </View>
                                        )}

                                        {/* Social Media */}
                                        {scrapedData.socialMedia &&
                                            Object.keys(scrapedData.socialMedia)
                                                .length > 0 && (
                                                <View style={S.dataItem}>
                                                    <View
                                                        style={S.dataItemIcon}>
                                                        <Ionicons
                                                            name="share-social"
                                                            size={18}
                                                            color={C.primary}
                                                        />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text
                                                            style={
                                                                S.dataItemLabel
                                                            }>
                                                            Social Media
                                                        </Text>
                                                        <Text
                                                            style={
                                                                S.dataItemValue
                                                            }
                                                            numberOfLines={1}>
                                                            {Object.keys(
                                                                scrapedData.socialMedia,
                                                            ).join(", ")}
                                                        </Text>
                                                    </View>
                                                    <Ionicons
                                                        name="checkmark-circle"
                                                        size={18}
                                                        color={C.success}
                                                    />
                                                </View>
                                            )}
                                    </View>

                                    {/* Action Buttons */}
                                    <View style={S.actionButtonsContainer}>
                                        <TouchableOpacity
                                            style={S.secondaryButton}
                                            onPress={() => {
                                                setScrapedData(null);
                                                setScrapeUrl("");
                                            }}>
                                            <Ionicons
                                                name="arrow-back"
                                                size={18}
                                                color={C.primary}
                                            />
                                            <Text style={S.secondaryButtonText}>
                                                Back
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={S.primaryButton}
                                            onPress={handleSaveScrapedData}>
                                            <Ionicons
                                                name="save"
                                                size={18}
                                                color="#fff"
                                            />
                                            <Text style={S.primaryButtonText}>
                                                Save Enquiry
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* â”€â”€ Date picker â”€â”€ */}
            <Modal
                visible={datePickerVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDatePickerVisible(false)}>
                <View style={S.modalBg}>
                    <View style={S.datePicker}>
                        <View style={S.dragHandle} />
                        <View style={S.datePickerHeader}>
                            <TouchableOpacity
                                onPress={() => {
                                    const y = calendarMonth.getFullYear(),
                                        m = calendarMonth.getMonth();
                                    setCalendarMonth(new Date(y, m - 1, 1));
                                }}
                                style={S.calNavBtn}>
                                <Ionicons
                                    name="chevron-back"
                                    size={20}
                                    color={C.textSub}
                                />
                            </TouchableOpacity>
                            <Text style={S.datePickerTitle}>
                                {calendarMonth.toLocaleString(undefined, {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </Text>
                            <View style={S.datePickerHeaderActions}>
                                <TouchableOpacity
                                    onPress={() => {
                                        const y = calendarMonth.getFullYear(),
                                            m = calendarMonth.getMonth();
                                        setCalendarMonth(new Date(y, m + 1, 1));
                                    }}
                                    style={S.calNavBtn}>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={20}
                                        color={C.textSub}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setDatePickerVisible(false)}
                                    style={S.calCloseBtn}>
                                    <Ionicons
                                        name="close"
                                        size={18}
                                        color={C.textSub}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={S.clearDateBtn}
                            onPress={() => {
                                setSelectedDate(null);
                                setDatePickerVisible(false);
                            }}>
                            <Text style={S.clearDateText}>Show All Dates</Text>
                        </TouchableOpacity>
                        <View style={S.weekRow}>
                            {[
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                                "Sun",
                            ].map((d) => (
                                <Text key={d} style={S.weekDay}>
                                    {d}
                                </Text>
                            ))}
                        </View>
                        <View style={S.calGrid}>
                            {(() => {
                                const y = calendarMonth.getFullYear(),
                                    m = calendarMonth.getMonth();
                                const first =
                                    (new Date(y, m, 1, 12).getDay() + 6) % 7;
                                const days = new Date(y, m + 1, 0).getDate();
                                const cells = [];
                                for (let i = 0; i < first; i++)
                                    cells.push(
                                        <View
                                            key={`e${i}`}
                                            style={S.dayCell}
                                        />,
                                    );
                                for (let d = 1; d <= days; d++) {
                                    const iso = toLocalIso(new Date(y, m, d));
                                    const sel = selectedDate === iso;
                                    const tod = toLocalIso(new Date()) === iso;
                                    cells.push(
                                        <TouchableOpacity
                                            key={d}
                                            onPress={() => {
                                                setSelectedDate(iso);
                                                setDatePickerVisible(false);
                                            }}
                                            style={[
                                                S.dayCell,
                                                sel && S.daySel,
                                                tod && !sel && S.dayTod,
                                            ]}>
                                            {sel ? (
                                                <LinearGradient
                                                    colors={GRAD.primary}
                                                    style={S.daySelGrad}>
                                                    <Text
                                                        style={[
                                                            S.dayText,
                                                            {
                                                                color: "#fff",
                                                                fontWeight:
                                                                    "800",
                                                            },
                                                        ]}>
                                                        {d}
                                                    </Text>
                                                </LinearGradient>
                                            ) : (
                                                <Text
                                                    style={[
                                                        S.dayText,
                                                        tod && {
                                                            color: C.primary,
                                                            fontWeight: "800",
                                                        },
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
            </Modal>

            {/* â”€â”€ Detail page overlay â”€â”€ */}
            {detailEnquiry && (
                <View style={StyleSheet.absoluteFill}>
                    <EnquiryDetailPage
                        enquiry={detailEnquiry}
                        logsLoading={logsLoading}
                        onClose={() => setDetailEnquiry(null)}
                        onEdit={handleEdit}
                        onMakeFollowUp={handleMakeFollowUp}
                        billingInfo={billingInfo}
                        showUpgradePrompt={showUpgradePrompt}
                    />
                </View>
            )}
        </SafeAreaView>
    );
}

// â”€â”€â”€ Main screen styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const S = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    list: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 90 },
    modalBg: {
        flex: 1,
        backgroundColor: "rgba(15,23,42,0.5)",
        justifyContent: "flex-end",
    },

    // Header
    header: {
        backgroundColor: C.card,
        paddingHorizontal: 16,
        paddingBottom: 12,
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
        marginBottom: 12,
    },
    headerTitleBlock: { flex: 1, marginLeft: 10 },
    headerUserRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
    headerUserIcon: { marginRight: 6 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
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
    headerBtnPrimary: {
        backgroundColor: C.primarySoft,
        borderColor: "transparent",
    },
    headerLabel: {
        fontSize: 11,
        color: C.textMuted,
        fontWeight: "600",
        letterSpacing: 0.3,
    },
    headerName: {
        fontSize: 17,
        color: C.text,
        fontWeight: "800",
        letterSpacing: -0.3,
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
    profileImg: { width: "100%", height: "100%" },
    profileFallback: {
        flex: 1,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
    },
    profileFallbackText: {
        color: C.primaryDark,
        fontWeight: "900",
        fontSize: 15,
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

    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.bg,
        borderRadius: 12,
        height: 44,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 8,
    },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: C.text },
    calBtn: {
        width: 38,
        height: 36,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 4,
        borderRadius: 10,
        backgroundColor: C.primarySoft,
    },
    headerMeta: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerMetaText: { fontSize: 12, color: C.textMuted, fontWeight: "600" },
    datePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.primarySoft,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    datePillText: { fontSize: 12, color: C.primary, fontWeight: "700" },

    // Cards
    cardWrap: { marginBottom: 10 },
    card: {
        backgroundColor: C.card,
        borderRadius: 16,
        marginHorizontal: 0,
        overflow: "hidden",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 3,
    },
    stripe: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    cardBody: {
        paddingLeft: 16,
        paddingRight: 12,
        paddingTop: 11,
        paddingBottom: 9,
    },
    cardRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 8,
    },
    cardMid: { flex: 1, gap: 4 },
    cardRowBetween: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    cardName: {
        fontSize: 14,
        fontWeight: "700",
        color: C.text,
        flex: 1,
        letterSpacing: -0.2,
    },
    cardDate: { fontSize: 11, color: C.textMuted, fontWeight: "600" },
    cardMobile: { fontSize: 12, color: C.textMuted, fontWeight: "500" },
    cardStatus: { fontSize: 11, color: C.textLight, fontWeight: "600" },

    avatarBox: {
        width: 44,
        height: 44,
        borderRadius: 13,
        marginRight: 10,
        flexShrink: 0,
    },
    avatarImg: { width: "100%", height: "100%", borderRadius: 13 },
    avatarGrad: {
        width: "100%",
        height: "100%",
        borderRadius: 13,
        justifyContent: "center",
        alignItems: "center",
    },
    avatarText: { color: "#fff", fontSize: 15, fontWeight: "800" },
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

    productPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.primarySoft,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 7,
    },
    productPillText: {
        fontSize: 11,
        color: C.primaryDark,
        fontWeight: "700",
        maxWidth: SW * 0.3,
    },
    priorityPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 7,
    },
    priorityDot: { width: 5, height: 5, borderRadius: 3 },
    priorityPillText: {
        fontSize: 10,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.2,
    },

    cardActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        marginTop: 2,
    },
    actionChip: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    enqNoBadge: {
        backgroundColor: C.primarySoft,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: C.primaryMid,
    },
    enqNoText: { fontSize: 10, fontWeight: "800", color: C.primary },
    swipeHint: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        opacity: 0.55,
    },
    swipeHintText: { fontSize: 10, color: C.textLight, fontWeight: "600" },
    deleteBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        width: "100%",
        backgroundColor: "#FEF2F2",
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: "#FECACA",
    },
    deletePill: { flexDirection: "row", alignItems: "center", gap: 6 },
    deletePillText: { fontSize: 12, color: "#991B1B", fontWeight: "700" },
    deleteGhostBtn: {
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#F3D1D1",
    },
    deleteGhostText: { fontSize: 12, color: C.textMuted, fontWeight: "700" },
    deleteDangerBtn: {
        minWidth: 72,
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.danger,
    },
    deleteDangerBtnDisabled: { opacity: 0.7 },
    deleteDangerText: { fontSize: 12, color: "#fff", fontWeight: "800" },
    // FAB
    fab: { position: "absolute", bottom: 28, right: 18 },
    fabInner: {
        width: 54,
        height: 54,
        borderRadius: 27,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 8,
    },

    // Logout modal
    logoutBox: {
        backgroundColor: C.card,
        borderRadius: 24,
        padding: 24,
        width: "90%",
        maxWidth: 340,
        alignItems: "center",
        alignSelf: "center",
        marginBottom: 200,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 10,
    },
    logoutIconWrap: {
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: C.danger + "15",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 14,
    },
    logoutTitle: {
        fontSize: 19,
        fontWeight: "800",
        color: C.text,
        marginBottom: 6,
        letterSpacing: -0.3,
    },
    logoutSub: {
        fontSize: 13,
        color: C.textMuted,
        textAlign: "center",
        lineHeight: 20,
        marginBottom: 22,
    },
    logoutBtns: { flexDirection: "row", gap: 10, width: "100%" },
    logoutCancel: {
        flex: 1,
        height: 46,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: C.bg,
        borderWidth: 1.5,
        borderColor: C.border,
    },
    logoutCancelText: { fontSize: 14, fontWeight: "700", color: C.textMuted },
    logoutConfirm: {
        flex: 1,
        height: 46,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    logoutConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },

    // Date picker
    dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.border,
        alignSelf: "center",
        marginTop: 10,
        marginBottom: 8,
    },
    datePicker: {
        backgroundColor: C.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 28,
    },
    datePickerHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    datePickerHeaderActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    datePickerTitle: { fontSize: 15, fontWeight: "800", color: C.text },
    calNavBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: C.bg,
        justifyContent: "center",
        alignItems: "center",
    },
    calCloseBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: "#FEE2E2",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#FECACA",
    },
    clearDateBtn: {
        marginHorizontal: 20,
        paddingVertical: 11,
        borderRadius: 12,
        backgroundColor: C.primarySoft,
        alignItems: "center",
        marginBottom: 14,
        borderWidth: 1.5,
        borderColor: C.primaryMid,
    },
    clearDateText: { fontSize: 14, fontWeight: "700", color: C.primary },
    weekRow: { flexDirection: "row", paddingHorizontal: 8 },
    weekDay: {
        width: (SW - 16) / 7,
        textAlign: "center",
        fontSize: 11,
        fontWeight: "700",
        color: C.textLight,
        paddingVertical: 4,
    },
    calGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 },
    dayCell: {
        width: (SW - 16) / 7,
        height: 38,
        justifyContent: "center",
        alignItems: "center",
    },
    daySel: { borderRadius: 10 },
    dayTod: { borderWidth: 1.5, borderColor: C.primary, borderRadius: 10 },
    daySelGrad: {
        width: 34,
        height: 34,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    dayText: { fontSize: 14, color: C.text, fontWeight: "600" },

    // Empty
    emptyWrap: { alignItems: "center", marginTop: 60, gap: 8 },
    emptyIcon: {
        width: 68,
        height: 68,
        borderRadius: 20,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 6,
    },
    emptyTitle: { fontSize: 16, color: C.textSub, fontWeight: "700" },
    emptySubtext: { fontSize: 13, color: C.textLight },

    // â”€â”€ URL Scraping Modal (Centered Popup with Data List) â”€â”€
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 12,
    },
    scrapeModalContent: {
        width: "100%",
        maxWidth: 520,
        maxHeight: "90%",
        backgroundColor: C.card,
        borderRadius: 20,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    },
    scrapeHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
        backgroundColor: C.cardAlt,
    },
    headerIconGroup: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        gap: 14,
    },
    headerIcon: {
        width: 50,
        height: 50,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    scrapeHeaderTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: C.text,
        letterSpacing: 0.3,
    },
    scrapeHeaderSubtitle: {
        fontSize: 12,
        color: C.textMuted,
        marginTop: 2,
    },
    closeBtn: {
        padding: 8,
        borderRadius: 12,
    },
    scrapeContent: {
        paddingHorizontal: 16,
        paddingVertical: 20,
        paddingBottom: 28,
    },

    // URL Input Container
    urlInputContainer: {
        marginBottom: 22,
        alignItems: "center",
        width: "100%",
    },
    urlInputBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: C.border,
        paddingHorizontal: 12,
        marginBottom: 12,
        minHeight: 48,
        shadowColor: "rgba(0,0,0,0.05)",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 4,
        elevation: 1,
    },
    scrapeInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14,
        color: C.text,
        borderWidth: 0,
        minHeight: 45,
    },
    errorBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF2F2",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        borderLeftWidth: 3,
        borderLeftColor: C.danger,
        width: "100%",
    },
    errorText: {
        fontSize: 12,
        color: C.danger,
        fontWeight: "500",
        flex: 1,
    },
    scrapeButton: {
        backgroundColor: C.primary,
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        minHeight: 48,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    scrapeButtonDisabled: {
        opacity: 0.7,
    },
    scrapeButtonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 14,
        letterSpacing: 0.3,
    },

    // Help Section
    helpSection: {
        backgroundColor: C.primarySoft,
        borderRadius: 14,
        padding: 14,
        marginBottom: 22,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
    },
    helpTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: C.primary,
        marginBottom: 10,
    },
    helpItem: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: 8,
        gap: 8,
    },
    helpText: {
        fontSize: 12,
        color: C.textSub,
        flex: 1,
        lineHeight: 17,
    },

    // Success Banner
    successBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F0FDF4",
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        borderLeftWidth: 3,
        borderLeftColor: C.success,
    },
    successText: {
        fontSize: 14,
        fontWeight: "700",
        color: C.success,
        letterSpacing: 0.3,
    },

    // Company Card
    companyCard: {
        backgroundColor: C.bg,
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: C.border,
    },
    companyCardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
    },
    companyIconBg: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
    },
    companyName: {
        fontSize: 15,
        fontWeight: "700",
        color: C.text,
        lineHeight: 20,
    },
    companyUrl: {
        fontSize: 11,
        color: C.textMuted,
        marginTop: 4,
    },

    // Data List Section
    dataListSection: {
        marginBottom: 20,
    },
    dataListTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: C.text,
        marginBottom: 12,
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    dataItem: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        gap: 12,
        borderWidth: 1,
        borderColor: C.border,
    },
    dataItemIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
    },
    dataItemLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },
    dataItemValue: {
        fontSize: 13,
        fontWeight: "600",
        color: C.text,
        marginTop: 4,
        lineHeight: 17,
    },

    // Action Buttons Container
    actionButtonsContainer: {
        flexDirection: "row",
        gap: 10,
        marginTop: 6,
    },
    primaryButton: {
        flex: 1,
        backgroundColor: C.success,
        borderRadius: 12,
        paddingVertical: 13,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        shadowColor: C.success,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 3,
    },
    primaryButtonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 14,
        letterSpacing: 0.3,
    },
    secondaryButton: {
        flex: 1,
        backgroundColor: C.primarySoft,
        borderRadius: 12,
        paddingVertical: 13,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderWidth: 2,
        borderColor: C.primary,
    },
    secondaryButtonText: {
        color: C.primary,
        fontWeight: "700",
        fontSize: 14,
        letterSpacing: 0.3,
    },
});

// â”€â”€â”€ Detail page styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SD = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: C.bg,
        zIndex: 100,
    },

    // â”€â”€ Top card â”€â”€
    topCard: {
        backgroundColor: C.card,
        alignItems: "center",
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        overflow: "hidden",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 3,
    },

    // Decorative circles (no color change â€” just structure)
    deco1: {
        position: "absolute",
        top: -60,
        right: -50,
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: C.primarySoft,
        opacity: 0.7,
    },
    deco2: {
        position: "absolute",
        top: 20,
        right: 20,
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: C.primaryMid,
        opacity: 0.35,
    },
    deco3: {
        position: "absolute",
        bottom: -30,
        left: -40,
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: C.primarySoft,
        opacity: 0.5,
    },

    // Nav buttons
    backBtn: {
        position: "absolute",
        top: 0,
        left: 12,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    editBtn: {
        position: "absolute",
        top: 0,
        right: 12,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },

    // Circle avatar
    avatarRing: {
        position: "relative",
        marginTop: 12,
        marginBottom: 14,
        width: 86,
        height: 86,
        borderRadius: 43,
        borderWidth: 3,
        borderColor: C.border,
        padding: 3,
        backgroundColor: C.card,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
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
    avatarText: { color: "#fff", fontSize: 24, fontWeight: "900" },
    priDot: {
        position: "absolute",
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2.5,
        borderColor: C.card,
    },

    heroName: {
        fontSize: 18,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.3,
        marginBottom: 3,
    },
    heroMobile: {
        fontSize: 13,
        color: C.textMuted,
        fontWeight: "500",
        marginBottom: 12,
    },

    chipsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 6,
    },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.bg,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: C.border,
    },
    chipDot: { width: 6, height: 6, borderRadius: 3 },
    chipText: { fontSize: 11, color: C.textSub, fontWeight: "700" },

    // â”€â”€ Tabs â”€â”€
    tabBar: {
        flexDirection: "row",
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    tab: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 12,
        position: "relative",
    },
    tabActive: {},
    tabText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
    tabTextActive: { fontSize: 13, fontWeight: "800", color: C.primary },
    tabLine: {
        position: "absolute",
        bottom: 0,
        left: "15%",
        right: "15%",
        height: 2.5,
        backgroundColor: C.primary,
        borderRadius: 2,
    },

    // â”€â”€ Details tab â”€â”€
    detailRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: C.card,
        borderRadius: 13,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        gap: 10,
    },
    detailIconBox: {
        width: 30,
        height: 30,
        borderRadius: 15,
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
        marginBottom: 2,
    },
    detailValue: { fontSize: 13, color: C.text, fontWeight: "600" },

    // â”€â”€ Make Follow-up Button â”€â”€
    makeFollowupBtn: {
        backgroundColor: C.primary,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 12,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    makeFollowupBtnText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "600",
    },

    // â”€â”€ Calls tab â”€â”€
    logItem: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.card,
        borderRadius: 13,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 8,
    },
    logIconBox: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    logType: { fontSize: 13, fontWeight: "700", color: C.text },
    logDate: { fontSize: 11, color: C.textLight, marginTop: 2 },
    logDur: { fontSize: 14, fontWeight: "800" },
    logDurLabel: {
        fontSize: 9,
        color: C.textLight,
        fontWeight: "600",
        textTransform: "uppercase",
    },

    // â”€â”€ Empty â”€â”€
    emptyWrap: { alignItems: "center", paddingTop: 48, gap: 8 },
    emptyIconBox: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: C.primarySoft,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyText: { fontSize: 13, color: C.textLight, fontWeight: "500" },
});
