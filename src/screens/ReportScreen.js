import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "react-native-calendars";
import {
    Alert,
    Animated,
    DeviceEventEmitter,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import Svg, { Circle, G, Path } from "react-native-svg";
import AppSideMenu from "../components/AppSideMenu";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    setCacheEntry,
} from "../services/appCache";
import { APP_EVENTS, onAppEvent } from "../services/appEvents";
import { cancelDebounceKey, debounceByKey } from "../services/debounce";
import {
    SkeletonBox,
    SkeletonCard,
    SkeletonLine,
    SkeletonPulse,
    SkeletonSpacer,
} from "../components/skeleton/Skeleton";
import { getCallLogs } from "../services/callLogService";
import { getAllEnquiries } from "../services/enquiryService";
import { getFollowUps } from "../services/followupService";
import notificationService from "../services/notificationService";

// â”€â”€â”€ Premium Light Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const C = {
    bg: "#F5F3EF",
    surface: "#FFFFFF",
    surfaceWarm: "#FFFAF4",
    border: "#EAE6DF",
    borderStrong: "#D6D0C8",
    text: "#1A1714",
    textSec: "#5C574F",
    textMuted: "#9B958C",
    gold: "#B8892A",
    goldLight: "#F5E9C8",
    goldMid: "#E8D4A0",
    teal: "#1A7A6E",
    tealLight: "#E0F2EF",
    rose: "#C0443A",
    roseLight: "#FDE8E6",
    violet: "#6045A8",
    violetLight: "#EDE8F9",
    sky: "#1868B7",
    skyLight: "#E3EEFF",
    amber: "#C07820",
    amberLight: "#FEF3E2",
    emerald: "#1B7A48",
    emeraldLight: "#E3F5EC",
};

const CHART_COLORS = [
    C.gold,
    C.teal,
    C.rose,
    C.violet,
    C.sky,
    C.amber,
    C.emerald,
];
const ALL_STAFF = "All Staff";
const ALL_STATUS = "All Statuses";
const REPORT_STATUS_OPTIONS = [
    "New",
    "Contacted",
    "Interested",
    "Not Interested",
    "Converted",
    "Closed",
];
const REPORT_CSV_DIR_KEY = "reportCsvDirectoryUri";
const REPORT_CACHE_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_REPORT_MS || 300000,
);
const saveCsvToDevice = async ({ fileName, content }) => {
    const localDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!localDir) throw new Error("Export directory not available");
    const localUri = `${localDir}${fileName}`;
    await FileSystem.writeAsStringAsync(localUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
    });

    if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
        const writeToDirectory = async (directoryUri) => {
            const targetUri =
                await FileSystem.StorageAccessFramework.createFileAsync(
                    directoryUri,
                    fileName,
                    "text/csv",
                );
            await FileSystem.writeAsStringAsync(targetUri, content, {
                encoding: FileSystem.EncodingType.UTF8,
            });
            return targetUri;
        };

        // Reuse last chosen folder if available (no prompt).
        try {
            const existingDir = await AsyncStorage.getItem(REPORT_CSV_DIR_KEY);
            const dirUri = String(existingDir || "").trim();
            if (dirUri) {
                const targetUri = await writeToDirectory(dirUri);
                return { uri: targetUri, downloaded: true };
            }
        } catch {}

        try {
            const permission =
                await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permission.granted && permission.directoryUri) {
                try {
                    await AsyncStorage.setItem(
                        REPORT_CSV_DIR_KEY,
                        String(permission.directoryUri),
                    );
                } catch {}
                const targetUri = await writeToDirectory(
                    permission.directoryUri,
                );
                return { uri: targetUri, downloaded: true };
            }
        } catch (error) {
            console.error("Direct CSV download failed", error);
        }
    }

    return { uri: localUri, downloaded: false };
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const normalizeList = (p) =>
    Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
const safeDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};
const fmt = (v) =>
    `\u20B9${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const toDayRange = (value = new Date()) => {
    const d = safeDate(value) || new Date();
    return {
        start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0),
        end: new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            23,
            59,
            59,
            999,
        ),
    };
};
const toIsoDate = (value = new Date()) => {
    const d = safeDate(value) || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const formatDayLabel = (value) => {
    const d = safeDate(value) || new Date();
    return d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};
const formatShortDate = (value) => {
    const d = safeDate(value);
    if (!d) return "-";
    return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};
const inRange = (v, r) => {
    if (!r) return true;
    const p = safeDate(v);
    if (!p) return false;
    return p >= r.start && p <= r.end;
};
const getEnqDate = (i) => i?.enquiryDateTime || i?.date || i?.createdAt || null;
const getFupDate = (i) =>
    i?.nextFollowUpDate || i?.followUpDate || i?.date || i?.createdAt || null;
const getCallDate = (i) => i?.callTime || i?.createdAt || null;
const normalizeStaffLabel = (name, adminName = "Admin") => {
    const v = String(name || "").trim();
    if (!v || v === "Unassigned") return adminName;
    return v;
};
const getStaffName = (item, adminName = "Admin") =>
    normalizeStaffLabel(
        item?.staffName ||
            item?.staffId?.name ||
            item?.assignedTo?.name ||
            item?.assignedToName ||
            item?.enqBy ||
            "Unassigned",
        adminName,
    );
const normalizeStatusValue = (status) => {
    if (!status) return "";
    if (status === "Sales") return "Converted";
    if (status === "Drop") return "Closed";
    return status;
};
const getItemStatus = (item) =>
    normalizeStatusValue(
        item?.status || item?.enqId?.status || item?.enquiryStatus || "",
    );
const buildExplicitDateRange = (fromDate, toDate) => {
    const from = safeDate(fromDate) || new Date();
    const to = safeDate(toDate) || from;
    const safeFrom = from <= to ? from : to;
    const safeTo = to >= from ? to : from;
    return {
        start: new Date(
            safeFrom.getFullYear(),
            safeFrom.getMonth(),
            safeFrom.getDate(),
            0,
            0,
            0,
            0,
        ),
        end: new Date(
            safeTo.getFullYear(),
            safeTo.getMonth(),
            safeTo.getDate(),
            23,
            59,
            59,
            999,
        ),
    };
};
const formatAppliedRangeLabel = (fromDate, toDate) =>
    `${formatShortDate(fromDate)} - ${formatShortDate(toDate)}`;
const formatDurationSec = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds || 0)));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0) return `${hh}h ${mm}m`;
    if (mm > 0) return `${mm}m ${ss}s`;
    return `${ss}s`;
};
const isSameIsoDate = (left, right) =>
    String(left || "") === String(right || "");
const normalizeId = (value) => String(value?._id || value || "").trim();
const getStaffId = (item) =>
    normalizeId(
        item?.assignedTo?._id ||
            item?.assignedTo ||
            item?.staffId?._id ||
            item?.staffId ||
            item?.assignedToId ||
            item?.enqId?.assignedTo?._id ||
            item?.enqId?.assignedTo ||
            item?.enquiryId?.assignedTo?._id ||
            item?.enquiryId?.assignedTo,
    );
const matchesStaffFilter = (item, staffFilter, adminName) =>
    staffFilter === ALL_STAFF || getStaffName(item, adminName) === staffFilter;
const matchesStatusFilter = (item, statusFilter) =>
    statusFilter === ALL_STATUS || getItemStatus(item) === statusFilter;
const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: cx + radius * Math.cos(angleInRadians),
        y: cy + radius * Math.sin(angleInRadians),
    };
};
const describeSlice = (cx, cy, radius, startAngle, endAngle) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
        `M ${cx} ${cy}`,
        `L ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
        "Z",
    ].join(" ");
};
const statusColor = (s) => {
    const v = String(s || "").toLowerCase();
    if (v.includes("converted") || v.includes("closed")) return C.emerald;
    if (v.includes("interest") || v.includes("contact")) return C.sky;
    if (v.includes("not") || v.includes("lost")) return C.rose;
    return C.amber;
};
const displayStatusLabel = (status) => {
    if (status === "Converted") return "Sales";
    if (status === "Closed") return "Drop";
    return status;
};

// â”€â”€â”€ Animated Counter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AnimCounter = ({ value, style, prefix = "" }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        Animated.timing(anim, {
            toValue: value,
            duration: 900,
            useNativeDriver: false,
        }).start();
        const id = anim.addListener(({ value: v }) =>
            setDisplay(Math.round(v)),
        );
        return () => anim.removeListener(id);
    }, [value]);
    return (
        <Text style={style}>
            {prefix}
            {display}
        </Text>
    );
};

// â”€â”€â”€ Donut Chart (pure RN view layers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Animated Bar Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LeadPieChart = ({ data, size = 162 }) => {
    const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
    if (total <= 0) {
        return (
            <View
                style={{
                    width: size,
                    height: size,
                    alignItems: "center",
                    justifyContent: "center",
                }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <Circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size / 2 - 8}
                        fill={C.border}
                    />
                </Svg>
                <View style={st.pieCenterLabel}>
                    <Text style={st.pieCenterValue}>0</Text>
                    <Text style={st.pieCenterText}>LEADS</Text>
                </View>
            </View>
        );
    }

    let cumulative = 0;
    const segments = data.map((d, i) => {
        const pct = (Number(d.value) || 0) / total;
        const seg = {
            ...d,
            pct,
            startPct: cumulative,
            color: d.color || CHART_COLORS[i % CHART_COLORS.length],
        };
        cumulative += pct;
        return seg;
    });

    return (
        <View
            style={{
                width: size,
                height: size,
                alignItems: "center",
                justifyContent: "center",
            }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G>
                    {segments.map((seg, i) => {
                        const start = seg.startPct * 360;
                        const end = start + seg.pct * 360;
                        return (
                            <Path
                                key={seg.label || i}
                                d={describeSlice(
                                    size / 2,
                                    size / 2,
                                    size / 2 - 6,
                                    start,
                                    end,
                                )}
                                fill={seg.color}
                                stroke={C.surface}
                                strokeWidth={2}
                            />
                        );
                    })}
                </G>
            </Svg>
            <View style={st.pieCenterLabel}>
                <Text style={st.pieCenterValue}>{total}</Text>
                <Text style={st.pieCenterText}>LEADS</Text>
            </View>
        </View>
    );
};

const BarChart = ({ data, height = 90, color = C.teal }) => {
    const max = Math.max(...data.map((d) => d.value), 1);
    const anims = useRef(data.map(() => new Animated.Value(0))).current;
    useEffect(() => {
        Animated.stagger(
            55,
            data.map((d, i) =>
                Animated.spring(anims[i], {
                    toValue: d.value / max,
                    useNativeDriver: false,
                    friction: 6,
                }),
            ),
        ).start();
    }, []);
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "flex-end",
                height,
                gap: 5,
            }}>
            {data.map((d, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 3 }}>
                    <Animated.View
                        style={{
                            width: "80%",
                            borderRadius: 5,
                            backgroundColor:
                                i === data.length - 1 ? color : `${color}55`,
                            height: anims[i].interpolate({
                                inputRange: [0, 1],
                                outputRange: [4, height - 20],
                            }),
                        }}
                    />
                    <Text
                        style={{
                            fontSize: 9,
                            color: C.textMuted,
                            fontWeight: "600",
                        }}>
                        {d.label}
                    </Text>
                </View>
            ))}
        </View>
    );
};

// â”€â”€â”€ Animated Progress Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AnimProgressBar = ({ value, total, color, delay = 0 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const pct =
        total > 0
            ? Math.min(100, Math.max(3, Math.round((value / total) * 100)))
            : 0;
    useEffect(() => {
        const t = setTimeout(() => {
            Animated.timing(anim, {
                toValue: pct,
                duration: 750,
                useNativeDriver: false,
            }).start();
        }, delay);
        return () => clearTimeout(t);
    }, [pct]);
    return (
        <View style={st.progressTrack}>
            <Animated.View
                style={[
                    st.progressFill,
                    {
                        backgroundColor: color,
                        width: anim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ["0%", "100%"],
                        }),
                    },
                ]}
            />
        </View>
    );
};

// â”€â”€â”€ Fade + slide in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FadeIn = ({ children, delay = 0 }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(18)).current;
    useEffect(() => {
        const t = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 480,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 480,
                    useNativeDriver: true,
                }),
            ]).start();
        }, delay);
        return () => clearTimeout(t);
    }, []);
    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            {children}
        </Animated.View>
    );
};

// â”€â”€â”€ Filter Pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FilterPill = ({ label, value, onPress, icon, accent, isOpen }) => (
    <TouchableOpacity
        style={[
            st.filterPill,
            {
                borderColor: `${accent || C.gold}35`,
                backgroundColor: `${accent || C.gold}08`,
            },
        ]}
        onPress={onPress}
        activeOpacity={0.75}>
        <Ionicons name={icon} size={13} color={accent || C.gold} />
        <View style={{ flex: 1 }}>
            <Text style={st.filterPillLabel}>{label}</Text>
            <Text
                style={[st.filterPillValue, { color: accent || C.text }]}
                numberOfLines={1}>
                {value}
            </Text>
        </View>
        <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={12}
            color={C.textMuted}
        />
    </TouchableOpacity>
);

const FilterDropdownMenu = ({
    options,
    selectedValue,
    onSelect,
    accent,
    getOptionLabel,
}) => (
    <View style={[st.filterMenu, { borderColor: `${accent || C.gold}30` }]}>
        {options.map((option) => {
            const isSelected = option === selectedValue;
            const label =
                typeof getOptionLabel === "function"
                    ? getOptionLabel(option)
                    : option;
            return (
                <TouchableOpacity
                    key={option}
                    style={[
                        st.filterMenuItem,
                        isSelected && {
                            backgroundColor: `${accent || C.gold}14`,
                        },
                    ]}
                    onPress={() => onSelect(option)}
                    activeOpacity={0.75}>
                    <Text
                        style={[
                            st.filterMenuText,
                            isSelected && {
                                color: accent || C.gold,
                                fontWeight: "700",
                            },
                        ]}>
                        {label}
                    </Text>
                    {isSelected && (
                        <Ionicons
                            name="checkmark"
                            size={14}
                            color={accent || C.gold}
                        />
                    )}
                </TouchableOpacity>
            );
        })}
    </View>
);

// â”€â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Card = ({ children, style }) => (
    <View style={[st.card, style]}>{children}</View>
);

const CardHeader = ({ title, icon, accent, right }) => (
    <View style={st.cardHeader}>
        <View
            style={[
                st.cardIconBg,
                { backgroundColor: `${accent || C.gold}18` },
            ]}>
            <Ionicons name={icon} size={16} color={accent || C.gold} />
        </View>
        <Text style={st.cardTitle}>{title}</Text>
        {right && <View style={{ marginLeft: "auto" }}>{right}</View>}
    </View>
);

// â”€â”€â”€ MAIN SCREEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ReportScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const reportFetchInFlightRef = useRef(false);
    const selfId = useMemo(
        () => normalizeId(user?.id || user?._id),
        [user?.id, user?._id],
    );
    const reportCacheKey = useMemo(
        () => buildCacheKey("reportData:v1", selfId || "anon"),
        [selfId],
    );
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const adminName = useMemo(
        () => (isStaffUser ? "Admin" : user?.name || "Admin"),
        [isStaffUser, user?.name],
    );
    const todayIso = useMemo(() => toIsoDate(new Date()), []);
    const { width: windowWidth } = useWindowDimensions();
    const leadLayoutStacked = windowWidth < 360;

    const [selectedDate, setSelectedDate] = useState(() =>
        toIsoDate(new Date()),
    );
    const [calendarVisible, setCalendarVisible] = useState(false);
    const [calendarTarget, setCalendarTarget] = useState("from");
    const [menuVisible, setMenuVisible] = useState(false);
    const [openFilterMenu, setOpenFilterMenu] = useState(null);
    const [draftFromDate, setDraftFromDate] = useState(todayIso);
    const [draftToDate, setDraftToDate] = useState(todayIso);
    const [fromDate, setFromDate] = useState(todayIso);
    const [toDate, setToDate] = useState(todayIso);
    const [staffFilter, setStaffFilter] = useState(
        user?.role === "Staff" ? user?.name || "Unassigned" : ALL_STAFF,
    );
    const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [reportData, setReportData] = useState({
        enquiries: [],
        followups: [],
        callLogs: [],
    });

    const loadReportData = useCallback(
        async ({ force = false, showLoading = true } = {}) => {
            if (reportFetchInFlightRef.current) return;
            reportFetchInFlightRef.current = true;
            let usedCache = false;
            const cached = await getCacheEntry(reportCacheKey).catch(
                () => null,
            );
            if (cached?.value) {
                setReportData(cached.value);
                usedCache = true;
                if (!showLoading) setIsLoading(false);
            }

            const shouldFetch = force || !isFresh(cached, REPORT_CACHE_TTL_MS);
            if (!shouldFetch) {
                setIsLoading(false);
                return;
            }

            if (showLoading && !usedCache) setIsLoading(true);
            try {
                const [enqR, fupR, callR] = await Promise.all([
                    getAllEnquiries(1, 1000, "", "", ""),
                    getFollowUps("All", 1, 1000),
                    getCallLogs({ limit: 500 }),
                ]);
                const payload = {
                    enquiries: normalizeList(enqR),
                    followups: normalizeList(fupR),
                    callLogs: normalizeList(callR),
                };
                setReportData(payload);
                await setCacheEntry(reportCacheKey, payload, {
                    tags: ["reports"],
                }).catch(() => {});
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
                reportFetchInFlightRef.current = false;
            }
        },
        [reportCacheKey],
    );

    useFocusEffect(
        useCallback(() => {
            loadReportData({ force: false, showLoading: true });
        }, [loadReportData]),
    );

    useEffect(() => {
        const refresh = () =>
            debounceByKey(
                "report-refresh",
                () => loadReportData({ force: true, showLoading: false }),
                300,
            );

        const unsub1 = onAppEvent(APP_EVENTS.ENQUIRY_UPDATED, refresh);
        const unsub2 = onAppEvent(APP_EVENTS.FOLLOWUP_CHANGED, refresh);
        const unsub3 = onAppEvent(APP_EVENTS.ENQUIRY_CREATED, refresh);
        const unsub4 = onAppEvent(APP_EVENTS.CALL_LOG_CREATED, refresh);
        return () => {
            cancelDebounceKey("report-refresh");
            unsub1();
            unsub2();
            unsub3();
            unsub4();
        };
    }, [loadReportData]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await loadReportData({ force: true, showLoading: false });
        } finally {
            setIsRefreshing(false);
        }
    }, [loadReportData]);

    const filterRange = useMemo(
        () => buildExplicitDateRange(fromDate, toDate),
        [fromDate, toDate],
    );
    const rangeLabel = useMemo(
        () => formatAppliedRangeLabel(fromDate, toDate),
        [fromDate, toDate],
    );
    const hasPendingDateChanges = useMemo(
        () =>
            !isSameIsoDate(draftFromDate, fromDate) ||
            !isSameIsoDate(draftToDate, toDate),
        [draftFromDate, draftToDate, fromDate, toDate],
    );
    const staffOptions = useMemo(() => {
        const uniqueStaff = Array.from(
            new Set(
                [
                    ...reportData.enquiries,
                    ...reportData.followups,
                    ...reportData.callLogs,
                ]
                    .map((item) => getStaffName(item, adminName))
                    .filter(Boolean),
            ),
        ).sort((a, b) => a.localeCompare(b));
        if (user?.role === "Staff") {
            return [user?.name || "Staff"];
        }
        return [ALL_STAFF, ...uniqueStaff];
    }, [
        adminName,
        reportData.callLogs,
        reportData.enquiries,
        reportData.followups,
        user?.name,
        user?.role,
    ]);
    const statusOptions = useMemo(
        () => [ALL_STATUS, ...REPORT_STATUS_OPTIONS],
        [],
    );
    useEffect(() => {
        if (user?.role === "Staff") {
            if (user?.name) setStaffFilter(user.name);
        }
    }, [adminName, user?.name, user?.role]);
    const applyDateRange = useCallback(() => {
        const fromValue =
            safeDate(draftFromDate) || safeDate(todayIso) || new Date();
        const toValue = safeDate(draftToDate) || fromValue;
        const normalizedFrom =
            fromValue > toValue ? draftToDate : draftFromDate;
        const normalizedTo = toValue < fromValue ? draftFromDate : draftToDate;
        setFromDate(normalizedFrom);
        setToDate(normalizedTo);
        setSelectedDate(normalizedTo);
    }, [draftFromDate, draftToDate, todayIso]);
    const setQuickRange = useCallback((type) => {
        const baseDate = new Date();
        let nextFrom = toIsoDate(baseDate);
        let nextTo = toIsoDate(baseDate);
        if (type === "week") {
            const start = new Date(baseDate);
            start.setDate(baseDate.getDate() - 6);
            nextFrom = toIsoDate(start);
        } else if (type === "month") {
            const start = new Date(
                baseDate.getFullYear(),
                baseDate.getMonth(),
                1,
            );
            nextFrom = toIsoDate(start);
        }
        setDraftFromDate(nextFrom);
        setDraftToDate(nextTo);
        setFromDate(nextFrom);
        setToDate(nextTo);
        setSelectedDate(nextTo);
        setOpenFilterMenu(null);
        setCalendarVisible(false);
    }, []);
    const activeQuickRange = useMemo(() => {
        const today = todayIso;
        const baseDate = new Date();
        const weekStart = new Date(baseDate);
        weekStart.setDate(baseDate.getDate() - 6);
        const monthStart = new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            1,
        );
        const weekStartIso = toIsoDate(weekStart);
        const monthStartIso = toIsoDate(monthStart);
        if (fromDate === today && toDate === today) return "today";
        if (fromDate === weekStartIso && toDate === today) return "week";
        if (fromDate === monthStartIso && toDate === today) return "month";
        return "";
    }, [fromDate, toDate, todayIso]);

    const filteredEnq = useMemo(
        () =>
            reportData.enquiries.filter((item) => {
                if (isStaffUser && getStaffId(item) !== selfId) return false;
                if (!inRange(getEnqDate(item), filterRange)) return false;
                if (!matchesStaffFilter(item, staffFilter, adminName))
                    return false;
                if (!matchesStatusFilter(item, statusFilter)) return false;
                return true;
            }),
        [
            adminName,
            filterRange,
            isStaffUser,
            reportData.enquiries,
            selfId,
            staffFilter,
            statusFilter,
        ],
    );

    const filteredFups = useMemo(
        () =>
            reportData.followups.filter((item) => {
                if (isStaffUser && getStaffId(item) !== selfId) return false;
                if (!inRange(getFupDate(item), filterRange)) return false;
                if (!matchesStaffFilter(item, staffFilter, adminName))
                    return false;
                if (!matchesStatusFilter(item, statusFilter)) return false;
                return true;
            }),
        [
            adminName,
            filterRange,
            isStaffUser,
            reportData.followups,
            selfId,
            staffFilter,
            statusFilter,
        ],
    );

    const filteredCalls = useMemo(
        () =>
            reportData.callLogs.filter((item) => {
                if (isStaffUser && getStaffId(item) !== selfId) return false;
                if (!inRange(getCallDate(item), filterRange)) return false;
                if (!matchesStaffFilter(item, staffFilter, adminName))
                    return false;
                const itemStatus = getItemStatus(item);
                if (
                    statusFilter !== ALL_STATUS &&
                    itemStatus &&
                    itemStatus !== statusFilter
                )
                    return false;
                return true;
            }),
        [
            adminName,
            filterRange,
            isStaffUser,
            reportData.callLogs,
            selfId,
            staffFilter,
            statusFilter,
        ],
    );

    const leadM = useMemo(() => {
        const counts = filteredEnq.reduce((a, i) => {
            const k = i?.status || "New";
            a[k] = (a[k] || 0) + 1;
            return a;
        }, {});
        const chartData = [
            { label: "New", value: counts.New || 0, color: C.amber },
            { label: "Connected", value: counts.Contacted || 0, color: C.sky },
            {
                label: "Followup",
                value: counts.Interested || 0,
                color: C.violet,
            },
            { label: "Sales", value: counts.Converted || 0, color: C.emerald },
            {
                label: "Lost",
                value: (counts["Not Interested"] || 0) + (counts.Closed || 0),
                color: C.rose,
            },
        ];
        return {
            total: filteredEnq.length,
            new: counts.New || 0,
            connected: counts.Contacted || 0,
            followup: counts.Interested || 0,
            qualified: counts.Interested || 0,
            lost: (counts["Not Interested"] || 0) + (counts.Closed || 0),
            converted: counts.Converted || 0,
            counts,
            chartData,
        };
    }, [filteredEnq]);

    const staffPerf = useMemo(() => {
        if (isStaffUser) {
            const selfName = user?.name || "Staff";
            return [
                {
                    name: selfName,
                    enquiriesCreated: filteredEnq.length,
                    followupsDone: filteredFups.length,
                    salesLeads: filteredEnq.filter(
                        (i) => i?.status === "Converted",
                    ).length,
                },
            ];
        }

        const map = {};
        const ensure = (name) => {
            const n = normalizeStaffLabel(name, adminName);
            if (!map[n])
                map[n] = {
                    name: n,
                    enquiriesCreated: 0,
                    followupsDone: 0,
                    salesLeads: 0,
                };
            return map[n];
        };

        // Enquiries Created -> credited to enquiry creator (adminName when admin created)
        filteredEnq.forEach((i) => {
            const creator = normalizeStaffLabel(i?.enqBy || "", adminName);
            ensure(creator).enquiriesCreated += 1;

            // Sales Leads -> credited to assigned staff when converted, else creator/admin
            const assigneeName = normalizeStaffLabel(
                i?.assignedTo?.name || i?.assignedToName || "",
                creator,
            );
            ensure(assigneeName); // ensure assignee row exists even if zero actions yet
            if (i?.status === "Converted") {
                ensure(assigneeName).salesLeads += 1;
            }
        });

        // Followups Done -> credited to followup creator (staffName first)
        filteredFups.forEach((i) => {
            const actor = normalizeStaffLabel(
                i?.staffName || i?.assignedTo?.name || i?.assignedToName || "",
                adminName,
            );
            ensure(actor).followupsDone += 1;
        });
        return Object.values(map).sort((a, b) => {
            if (b.salesLeads !== a.salesLeads)
                return b.salesLeads - a.salesLeads;
            if (b.enquiriesCreated !== a.enquiriesCreated)
                return b.enquiriesCreated - a.enquiriesCreated;
            return b.followupsDone - a.followupsDone;
        });
    }, [adminName, filteredEnq, filteredFups]);

    const staffCallPerf = useMemo(() => {
        const toRow = (name) => ({
            name,
            totalCalls: 0,
            incoming: 0,
            outgoing: 0,
            missed: 0,
            notAttended: 0,
            totalDuration: 0,
        });

        if (isStaffUser) {
            const selfName = user?.name || "Staff";
            const row = toRow(selfName);
            filteredCalls.forEach((i) => {
                const t = String(i?.callType || "").trim();
                row.totalCalls += 1;
                if (t === "Incoming") row.incoming += 1;
                else if (t === "Outgoing") row.outgoing += 1;
                else if (t === "Missed") row.missed += 1;
                else if (t === "Not Attended") row.notAttended += 1;
                row.totalDuration += Number(i?.duration || 0) || 0;
            });
            return [row];
        }

        const map = {};
        const ensure = (name) => {
            const n = normalizeStaffLabel(name, adminName);
            if (!map[n]) map[n] = toRow(n);
            return map[n];
        };

        filteredCalls.forEach((i) => {
            const name = getStaffName(i, adminName);
            const row = ensure(name);
            const t = String(i?.callType || "").trim();
            row.totalCalls += 1;
            if (t === "Incoming") row.incoming += 1;
            else if (t === "Outgoing") row.outgoing += 1;
            else if (t === "Missed") row.missed += 1;
            else if (t === "Not Attended") row.notAttended += 1;
            row.totalDuration += Number(i?.duration || 0) || 0;
        });

        return Object.values(map).sort((a, b) => {
            if (b.totalCalls !== a.totalCalls)
                return b.totalCalls - a.totalCalls;
            return b.totalDuration - a.totalDuration;
        });
    }, [adminName, filteredCalls, isStaffUser, user?.name]);

    const revenueM = useMemo(() => {
        const convertedEnquiries = filteredEnq.filter(
            (i) => i?.status === "Converted",
        );
        const total = convertedEnquiries.reduce(
            (s, i) => s + Number(i?.cost || 0),
            0,
        );
        const anchorDate = safeDate(toDate) || safeDate(fromDate) || new Date();
        const month = reportData.enquiries
            .filter((i) => {
                const d = safeDate(getEnqDate(i));
                return (
                    d &&
                    i?.status === "Converted" &&
                    matchesStaffFilter(i, staffFilter, adminName) &&
                    matchesStatusFilter(i, statusFilter) &&
                    d.getMonth() === anchorDate.getMonth() &&
                    d.getFullYear() === anchorDate.getFullYear()
                );
            })
            .reduce((s, i) => s + Number(i?.cost || 0), 0);
        const today = reportData.enquiries
            .filter((i) => i?.status === "Converted")
            .filter((i) => matchesStaffFilter(i, staffFilter, adminName))
            .filter((i) => matchesStatusFilter(i, statusFilter))
            .filter((i) => inRange(getEnqDate(i), toDayRange(toDate)))
            .reduce((s, i) => s + Number(i?.cost || 0), 0);
        return { total, month, today };
    }, [
        adminName,
        filteredEnq,
        reportData.enquiries,
        fromDate,
        toDate,
        staffFilter,
        statusFilter,
    ]);

    const exportReport = async () => {
        try {
            const available = await Sharing.isAvailableAsync();
            const exportDate = toIsoDate(new Date());
            const leadRows = filteredEnq.map((item) => ({
                EnquiryNo: item?.enqNo || "-",
                Name: item?.name || "-",
                Mobile: item?.mobile || "-",
                Status: displayStatusLabel(item?.status || "New"),
                Staff: getStaffName(item, adminName),
                Product: item?.product || "-",
                Source: item?.source || "-",
                Date: formatShortDate(getEnqDate(item)),
                Cost: Number(item?.cost || 0),
            }));
            const csvEscape = (value) =>
                `"${String(value ?? "").replace(/"/g, '""')}"`;
            const csvText = [
                [
                    "Enquiry No",
                    "Name",
                    "Mobile",
                    "Status",
                    "Staff",
                    "Product",
                    "Source",
                    "Date",
                    "Cost",
                ]
                    .map(csvEscape)
                    .join(","),
                ...leadRows.map((row) =>
                    [
                        row.EnquiryNo,
                        row.Name,
                        row.Mobile,
                        row.Status,
                        row.Staff,
                        row.Product,
                        row.Source,
                        row.Date,
                        row.Cost,
                    ]
                        .map(csvEscape)
                        .join(","),
                ),
            ].join("\n");
            const fileName = `report-leads-${exportDate}.csv`;
            const savedFile = await saveCsvToDevice({
                fileName,
                content: csvText,
            });

            Promise.resolve(
                notificationService.showReportCsvReadyNotification?.({
                    uri: savedFile?.uri,
                    fileName,
                }),
            ).catch(() => {});

            if (savedFile.downloaded) {
                Alert.alert(
                    "Download Complete",
                    `${fileName} saved successfully.`,
                );
            } else if (available) {
                await Sharing.shareAsync(savedFile.uri, {
                    mimeType: "text/csv",
                    dialogTitle: "Download report CSV",
                    UTI: "public.comma-separated-values-text",
                });
            } else {
                Alert.alert("Export Ready", `CSV saved at:\n${savedFile.uri}`);
            }
        } catch (e) {
            console.error(e);
            Alert.alert(
                "Export Failed",
                e?.message || "Unable to export report",
            );
        }
    };

    const exportStaffActivityCsv = async () => {
        try {
            const available = await Sharing.isAvailableAsync();
            const exportDate = toIsoDate(new Date());
            const csvEscape = (value) =>
                `"${String(value ?? "").replace(/"/g, '""')}"`;

            const map = {};
            const ensure = (name) => {
                const key = String(name || "").trim() || "Staff";
                if (!map[key]) {
                    map[key] = {
                        Staff: key,
                        EnquiriesCreated: 0,
                        FollowupsDone: 0,
                        SalesLeads: 0,
                        Calls: 0,
                        Incoming: 0,
                        Outgoing: 0,
                        Missed: 0,
                        NotAttended: 0,
                        DurationSec: 0,
                    };
                }
                return map[key];
            };

            (Array.isArray(staffPerf) ? staffPerf : []).forEach((r) => {
                const row = ensure(r?.name);
                row.EnquiriesCreated = Number(r?.enquiriesCreated || 0);
                row.FollowupsDone = Number(r?.followupsDone || 0);
                row.SalesLeads = Number(r?.salesLeads || 0);
            });
            (Array.isArray(staffCallPerf) ? staffCallPerf : []).forEach((r) => {
                const row = ensure(r?.name);
                row.Calls = Number(r?.totalCalls || 0);
                row.Incoming = Number(r?.incoming || 0);
                row.Outgoing = Number(r?.outgoing || 0);
                row.Missed = Number(r?.missed || 0);
                row.NotAttended = Number(r?.notAttended || 0);
                row.DurationSec = Number(r?.totalDuration || 0);
            });

            const rows = Object.values(map).sort((a, b) => {
                if (b.Calls !== a.Calls) return b.Calls - a.Calls;
                if (b.SalesLeads !== a.SalesLeads)
                    return b.SalesLeads - a.SalesLeads;
                return b.DurationSec - a.DurationSec;
            });

            const header = [
                "Staff Name",
                "Enquiries Created",
                "Followups Done",
                "Sales Leads",
                "Total Calls",
                "Incoming",
                "Outgoing",
                "Missed",
                "Not Attended",
                "Total Duration (sec)",
                "Total Duration (formatted)",
                "From Date",
                "To Date",
                "Staff Filter",
                "Status Filter",
            ]
                .map(csvEscape)
                .join(",");

            const csvText = [
                header,
                ...rows.map((r) =>
                    [
                        r.Staff,
                        r.EnquiriesCreated,
                        r.FollowupsDone,
                        r.SalesLeads,
                        r.Calls,
                        r.Incoming,
                        r.Outgoing,
                        r.Missed,
                        r.NotAttended,
                        r.DurationSec,
                        formatDurationSec(r.DurationSec),
                        fromDate,
                        toDate,
                        staffFilter,
                        statusFilter,
                    ]
                        .map(csvEscape)
                        .join(","),
                ),
            ].join("\n");

            const fileName = `report-staff-activity-${exportDate}.csv`;
            const savedFile = await saveCsvToDevice({
                fileName,
                content: csvText,
            });

            Promise.resolve(
                notificationService.showReportCsvReadyNotification?.({
                    uri: savedFile?.uri,
                    fileName,
                }),
            ).catch(() => {});

            if (savedFile.downloaded) {
                Alert.alert(
                    "Download Complete",
                    `${fileName} saved successfully.`,
                );
            } else if (available) {
                await Sharing.shareAsync(savedFile.uri, {
                    mimeType: "text/csv",
                    dialogTitle: "Download staff activity CSV",
                    UTI: "public.comma-separated-values-text",
                });
            } else {
                Alert.alert("Export Ready", `CSV saved at:\n${savedFile.uri}`);
            }
        } catch (e) {
            console.error(e);
            Alert.alert(
                "Export Failed",
                e?.message || "Unable to export staff activity",
            );
        }
    };

    return (
        <SafeAreaView style={st.container} edges={["top"]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
            <AppSideMenu
                visible={menuVisible}
                onClose={() => setMenuVisible(false)}
                navigation={navigation}
                user={user}
                onLogout={logout}
                activeRouteName="Report"
                resolveImageUrl={getImageUrl}
            />

            <View
                style={[st.topHeader, { paddingTop: insets.top > 0 ? 8 : 14 }]}>
                <TouchableOpacity
                    style={st.topHeaderBtn}
                    onPress={() => setMenuVisible(true)}
                    activeOpacity={0.85}>
                    <Ionicons name="menu" size={20} color={C.text} />
                </TouchableOpacity>
                <Text style={st.topHeaderTitle}>Reports</Text>
                <View style={st.topHeaderRight}>
                    <View style={st.topHeaderRightRow}>
                        <TouchableOpacity
                            style={st.exportHeaderBtn}
                            onPress={exportReport}
                            activeOpacity={0.85}>
                            <Ionicons
                                name="download-outline"
                                size={15}
                                color={C.gold}
                            />
                            <Text style={st.exportHeaderText}>CSV</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={st.exportHeaderBtn}
                            onPress={exportStaffActivityCsv}
                            activeOpacity={0.85}>
                            <Ionicons
                                name="people-outline"
                                size={15}
                                color={C.violet}
                            />
                            <Text style={st.exportHeaderText}>Staff</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={st.avatarBtn}
                            activeOpacity={0.85}
                            onPress={() =>
                                navigation.navigate("ProfileScreen")
                            }>
                            <LinearGradient
                                colors={[C.sky, C.teal]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={st.avatarGrad}>
                                {user?.logo ? (
                                    <Image
                                        source={{ uri: getImageUrl(user.logo) }}
                                        style={st.avatarImg}
                                    />
                                ) : (
                                    <Text style={st.avatarText}>
                                        {user?.name?.[0]?.toUpperCase?.() ??
                                            "M"}
                                    </Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={C.gold}
                        colors={[C.gold, C.teal, C.sky]}
                    />
                }
                contentContainerStyle={[
                    st.scroll,
                    { paddingTop: insets.top > 0 ? 4 : 12 },
                ]}>
                {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <FadeIn delay={0}>
                    <LinearGradient
                        colors={["#FBF7F0", "#EEE7D8", "#E8DEC9"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={st.hero}>
                        {/* Decorative circles */}
                        <View style={st.decCircle1} />
                        <View style={st.decCircle2} />

                        <View style={st.heroTop}>
                            <View>
                                <View style={st.heroPill}>
                                    <View style={st.heroPillDot} />
                                    <Text style={st.heroPillText}>
                                        CRM Analytics
                                    </Text>
                                </View>
                                <Text style={st.heroTitle}>Reports</Text>
                                <Text style={st.heroSub}>
                                    {rangeLabel} - {filteredEnq.length} leads
                                </Text>
                            </View>
                        </View>

                        {/* 4-KPI strip */}
                        <View style={st.heroKpis}>
                            {[
                                {
                                    label: "Leads",
                                    value: leadM.total,
                                    color: C.gold,
                                    icon: "people-outline",
                                },
                                {
                                    label: "Sales",
                                    value: leadM.converted,
                                    color: C.emerald,
                                    icon: "checkmark-circle-outline",
                                },
                                {
                                    label: "Drop",
                                    value: leadM.lost,
                                    color: C.rose,
                                    icon: "close-circle-outline",
                                },
                                {
                                    label: "Revenue",
                                    value: fmt(revenueM.total),
                                    color: C.violet,
                                    icon: "cash-outline",
                                },
                            ].map((k, i) => (
                                <View
                                    key={i}
                                    style={[
                                        st.heroKpi,
                                        i < 3 && st.heroKpiBorder,
                                    ]}>
                                    <View
                                        style={[
                                            st.heroKpiIcon,
                                            { backgroundColor: `${k.color}20` },
                                        ]}>
                                        <Ionicons
                                            name={k.icon}
                                            size={12}
                                            color={k.color}
                                        />
                                    </View>
                                    <Text
                                        style={[
                                            st.heroKpiVal,
                                            { color: k.color },
                                        ]}>
                                        {k.value}
                                    </Text>
                                    <Text style={st.heroKpiLabel}>
                                        {k.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </LinearGradient>
                </FadeIn>

                {/* â”€â”€ FILTER CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <FadeIn delay={70}>
                    <Card>
                        <View style={st.filterCardTop}>
                            <Ionicons
                                name="calendar-outline"
                                size={15}
                                color={C.gold}
                            />
                            <Text style={st.filterCardTitle}>
                                Report Filters
                            </Text>
                        </View>
                        <View style={st.rangeSummary}>
                            <View style={st.rangeSummaryMain}>
                                <Text style={st.rangeSummaryLabel}>
                                    Applied Range
                                </Text>
                                <Text style={st.rangeSummaryValue}>
                                    {rangeLabel}
                                </Text>
                            </View>
                            {hasPendingDateChanges ? (
                                <View style={st.pendingBadge}>
                                    <Text style={st.pendingBadgeText}>
                                        Pending changes
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                        <View style={st.dayActions}>
                            <TouchableOpacity
                                style={[
                                    st.todayBtn,
                                    activeQuickRange === "today" &&
                                        st.quickRangeBtnActive,
                                ]}
                                onPress={() => {
                                    setQuickRange("today");
                                }}
                                activeOpacity={0.8}>
                                <Ionicons
                                    name="flash-outline"
                                    size={14}
                                    color={
                                        activeQuickRange === "today"
                                            ? "#FFFFFF"
                                            : C.gold
                                    }
                                />
                                <Text
                                    style={[
                                        st.todayBtnText,
                                        activeQuickRange === "today" &&
                                            st.quickRangeBtnTextActive,
                                    ]}>
                                    Today
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    st.quickRangeBtn,
                                    activeQuickRange === "week" &&
                                        st.quickRangeBtnActive,
                                ]}
                                onPress={() => setQuickRange("week")}
                                activeOpacity={0.8}>
                                <Text
                                    style={[
                                        st.quickRangeBtnText,
                                        activeQuickRange === "week" &&
                                            st.quickRangeBtnTextActive,
                                    ]}>
                                    Last 7 Days
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    st.quickRangeBtn,
                                    activeQuickRange === "month" &&
                                        st.quickRangeBtnActive,
                                ]}
                                onPress={() => setQuickRange("month")}
                                activeOpacity={0.8}>
                                <Text
                                    style={[
                                        st.quickRangeBtnText,
                                        activeQuickRange === "month" &&
                                            st.quickRangeBtnTextActive,
                                    ]}>
                                    This Month
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={st.filterGroup}>
                            <View style={st.dateRow}>
                                <View style={st.dateWrap}>
                                    <Text style={st.dateLabel}>From Date</Text>
                                    <TouchableOpacity
                                        style={st.dateInput}
                                        onPress={() => {
                                            setCalendarTarget("from");
                                            setSelectedDate(draftFromDate);
                                            setCalendarVisible(true);
                                        }}
                                        activeOpacity={0.85}>
                                        <Text style={st.dateInputText}>
                                            {formatShortDate(draftFromDate)}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={st.dateWrap}>
                                    <Text style={st.dateLabel}>To Date</Text>
                                    <TouchableOpacity
                                        style={st.dateInput}
                                        onPress={() => {
                                            setCalendarTarget("to");
                                            setSelectedDate(draftToDate);
                                            setCalendarVisible(true);
                                        }}
                                        activeOpacity={0.85}>
                                        <Text style={st.dateInputText}>
                                            {formatShortDate(draftToDate)}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <TouchableOpacity
                                style={st.applyFilterBtn}
                                onPress={applyDateRange}
                                activeOpacity={0.85}>
                                <Ionicons
                                    name="filter-outline"
                                    size={15}
                                    color="#FFFFFF"
                                />
                                <Text style={st.applyFilterText}>
                                    Apply Filter
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={st.filterGrid}>
                            <View style={st.filterGroup}>
                                <FilterPill
                                    label="Staff"
                                    value={staffFilter}
                                    icon="person-outline"
                                    accent={C.sky}
                                    isOpen={openFilterMenu === "staff"}
                                    onPress={() =>
                                        setOpenFilterMenu((prev) =>
                                            prev === "staff" ? null : "staff",
                                        )
                                    }
                                />
                                {openFilterMenu === "staff" ? (
                                    <FilterDropdownMenu
                                        options={staffOptions}
                                        selectedValue={staffFilter}
                                        onSelect={(option) => {
                                            setStaffFilter(option);
                                            setOpenFilterMenu(null);
                                        }}
                                        accent={C.sky}
                                    />
                                ) : null}
                            </View>
                            <View style={st.filterGroup}>
                                <FilterPill
                                    label="Status"
                                    value={
                                        statusFilter === ALL_STATUS
                                            ? ALL_STATUS
                                            : displayStatusLabel(statusFilter)
                                    }
                                    icon="git-branch-outline"
                                    accent={C.emerald}
                                    isOpen={openFilterMenu === "status"}
                                    onPress={() =>
                                        setOpenFilterMenu((prev) =>
                                            prev === "status" ? null : "status",
                                        )
                                    }
                                />
                                {openFilterMenu === "status" ? (
                                    <FilterDropdownMenu
                                        options={statusOptions}
                                        selectedValue={statusFilter}
                                        getOptionLabel={(option) =>
                                            option === ALL_STATUS
                                                ? ALL_STATUS
                                                : option === "Contacted"
                                                  ? "Connected"
                                                  : displayStatusLabel(option)
                                        }
                                        onSelect={(option) => {
                                            setStatusFilter(option);
                                            setOpenFilterMenu(null);
                                        }}
                                        accent={C.emerald}
                                    />
                                ) : null}
                            </View>
                        </View>
                    </Card>
                </FadeIn>

                <Modal
                    visible={calendarVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setCalendarVisible(false)}>
                    <TouchableOpacity
                        style={st.calendarOverlay}
                        activeOpacity={1}
                        onPress={() => setCalendarVisible(false)}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={(e) => e.stopPropagation()}
                            style={st.calendarModalCard}>
                            <View style={st.calendarModalHeader}>
                                <View>
                                    <Text style={st.calendarModalTitle}>
                                        {calendarTarget === "from"
                                            ? "Select From Date"
                                            : "Select To Date"}
                                    </Text>
                                    <Text style={st.calendarModalSub}>
                                        {formatDayLabel(selectedDate)}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={st.calendarCloseBtn}
                                    onPress={() => setCalendarVisible(false)}
                                    activeOpacity={0.8}>
                                    <Ionicons
                                        name="close"
                                        size={18}
                                        color={C.text}
                                    />
                                </TouchableOpacity>
                            </View>
                            <Calendar
                                current={selectedDate}
                                onDayPress={(day) => {
                                    if (day?.dateString) {
                                        setSelectedDate(day.dateString);
                                        if (calendarTarget === "from") {
                                            setDraftFromDate(day.dateString);
                                        } else {
                                            setDraftToDate(day.dateString);
                                        }
                                        setCalendarVisible(false);
                                    }
                                }}
                                markedDates={{
                                    [calendarTarget === "from"
                                        ? draftFromDate
                                        : draftToDate]: {
                                        selected: true,
                                        selectedColor: C.gold,
                                        selectedTextColor: "#FFFFFF",
                                    },
                                }}
                                theme={{
                                    calendarBackground: C.surface,
                                    textSectionTitleColor: C.textMuted,
                                    selectedDayBackgroundColor: C.gold,
                                    selectedDayTextColor: "#FFFFFF",
                                    todayTextColor: C.teal,
                                    dayTextColor: C.text,
                                    textDisabledColor: C.borderStrong,
                                    monthTextColor: C.text,
                                    arrowColor: C.gold,
                                    textDayFontWeight: "600",
                                    textMonthFontWeight: "800",
                                    textDayHeaderFontWeight: "700",
                                }}
                                hideExtraDays={false}
                                enableSwipeMonths
                                firstDay={1}
                                style={st.calendar}
                            />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>

                {isLoading ? (
                    <SkeletonPulse>
                        <View
                            style={{
                                paddingHorizontal: 16,
                                paddingTop: 4,
                                gap: 12,
                            }}>
                            <SkeletonCard style={{ borderRadius: 20 }}>
                                <SkeletonLine width="46%" height={14} />
                                <SkeletonSpacer h={14} />
                                <SkeletonBox height={140} radius={18} />
                                <SkeletonSpacer h={14} />
                                <View
                                    style={{
                                        flexDirection: "row",
                                        justifyContent: "space-between",
                                    }}>
                                    <SkeletonLine width="28%" height={10} />
                                    <SkeletonLine width="20%" height={10} />
                                    <SkeletonLine width="16%" height={10} />
                                </View>
                            </SkeletonCard>
                            <SkeletonCard style={{ borderRadius: 20 }}>
                                <SkeletonLine width="38%" height={14} />
                                <SkeletonSpacer h={14} />
                                <SkeletonBox height={180} radius={18} />
                            </SkeletonCard>
                        </View>
                    </SkeletonPulse>
                ) : (
                    <>
                        {/* â”€â”€ LEAD OVERVIEW â€” Donut + Legend + Bars â”€â”€ */}
                        <FadeIn delay={100}>
                            <Card>
                                <CardHeader
                                    title="Lead Overview"
                                    icon="people-outline"
                                    accent={C.sky}
                                />
                                <Text style={st.subHeading}>
                                    Lead Status Overview
                                </Text>
                                <View
                                    style={[
                                        st.donutRow,
                                        leadLayoutStacked && st.donutRowStacked,
                                    ]}>
                                    <View style={st.donutChartWrap}>
                                        <LeadPieChart
                                            size={162}
                                            data={leadM.chartData}
                                        />
                                    </View>
                                    <View
                                        style={[
                                            st.donutLegend,
                                            leadLayoutStacked &&
                                                st.donutLegendStacked,
                                        ]}>
                                        {leadM.chartData.map((item) => (
                                            <View
                                                key={item.label}
                                                style={[
                                                    st.legendRow,
                                                    {
                                                        borderColor: `${item.color}20`,
                                                        backgroundColor: `${item.color}08`,
                                                    },
                                                ]}>
                                                <View
                                                    style={[
                                                        st.legendDot,
                                                        {
                                                            backgroundColor:
                                                                item.color,
                                                        },
                                                    ]}
                                                />
                                                <Text
                                                    style={st.legendLabel}
                                                    numberOfLines={1}
                                                    ellipsizeMode="tail">
                                                    {item.label}
                                                </Text>
                                                <Text
                                                    style={[
                                                        st.legendVal,
                                                        { color: item.color },
                                                    ]}>
                                                    {item.value}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                {/* Status breakdown bars */}
                                <View style={st.divider} />
                                <Text style={st.subHeading}>
                                    Status Breakdown
                                </Text>
                                {Object.entries(leadM.counts).map(
                                    ([lbl, val], i) => (
                                        <View key={lbl} style={st.pRow}>
                                            <View style={st.pLabelRow}>
                                                <Text style={st.pLabel}>
                                                    {displayStatusLabel(lbl)}
                                                </Text>
                                                <Text
                                                    style={[
                                                        st.pValText,
                                                        {
                                                            color: statusColor(
                                                                lbl,
                                                            ),
                                                        },
                                                    ]}>
                                                    {val}
                                                </Text>
                                            </View>
                                            <AnimProgressBar
                                                value={val}
                                                total={leadM.total || 1}
                                                color={statusColor(lbl)}
                                                delay={i * 80}
                                            />
                                        </View>
                                    ),
                                )}
                            </Card>
                        </FadeIn>

                        {/* â”€â”€ TEAM PERFORMANCE â€” colored table â”€â”€ */}
                        <FadeIn delay={140}>
                            <Card>
                                <CardHeader
                                    title="Staff Performance Report"
                                    icon="podium-outline"
                                    accent={C.rose}
                                />
                                <View style={st.tableHead}>
                                    {[
                                        "Staff Name",
                                        "Enquiries Created",
                                        "Followups Done",
                                        "Sales Leads",
                                    ].map((h, i) => (
                                        <Text
                                            key={h}
                                            style={[
                                                st.thCell,
                                                i === 0 && st.thNameCell,
                                            ]}>
                                            {h}
                                        </Text>
                                    ))}
                                </View>
                                {staffPerf.length === 0 ? (
                                    <Text style={st.emptyNote}>
                                        No performance data
                                    </Text>
                                ) : (
                                    staffPerf.map((item, idx) => (
                                        <View
                                            key={item.name}
                                            style={[
                                                st.tableRow,
                                                idx % 2 === 1 && {
                                                    backgroundColor: `${C.gold}08`,
                                                },
                                            ]}>
                                            <View
                                                style={[
                                                    st.thNameCell,
                                                    {
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        gap: 8,
                                                    },
                                                ]}>
                                                <View
                                                    style={[
                                                        st.teamAvatar,
                                                        {
                                                            backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}22`,
                                                        },
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            st.teamAvatarText,
                                                            {
                                                                color: CHART_COLORS[
                                                                    idx %
                                                                        CHART_COLORS.length
                                                                ],
                                                            },
                                                        ]}>
                                                        {(
                                                            item.name[0] || "?"
                                                        ).toUpperCase()}
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={st.tdName}
                                                    numberOfLines={1}>
                                                    {item.name}
                                                </Text>
                                            </View>
                                            <Text style={st.tdCell}>
                                                {item.enquiriesCreated}
                                            </Text>
                                            <Text style={st.tdCell}>
                                                {item.followupsDone}
                                            </Text>
                                            <View
                                                style={[
                                                    st.tdCell,
                                                    { alignItems: "center" },
                                                ]}>
                                                <View
                                                    style={[
                                                        st.wonBadge,
                                                        {
                                                            backgroundColor:
                                                                item.salesLeads >
                                                                0
                                                                    ? C.emeraldLight
                                                                    : C.border,
                                                        },
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            st.wonText,
                                                            {
                                                                color:
                                                                    item.salesLeads >
                                                                    0
                                                                        ? C.emerald
                                                                        : C.textMuted,
                                                            },
                                                        ]}>
                                                        {item.salesLeads}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))
                                )}
                            </Card>
                        </FadeIn>

                        <FadeIn delay={160}>
                            <Card>
                                <CardHeader
                                    title="Staff Call Activity"
                                    icon="call-outline"
                                    accent={C.violet}
                                />
                                <View style={st.tableHead}>
                                    {[
                                        "Staff Name",
                                        "Calls",
                                        "Duration",
                                        "Missed",
                                    ].map((h, i) => (
                                        <Text
                                            key={h}
                                            style={[
                                                st.thCell,
                                                i === 0 && st.thNameCell,
                                            ]}>
                                            {h}
                                        </Text>
                                    ))}
                                </View>
                                {staffCallPerf.length === 0 ? (
                                    <Text style={st.emptyNote}>
                                        No call activity
                                    </Text>
                                ) : (
                                    staffCallPerf.map((item, idx) => (
                                        <View
                                            key={item.name}
                                            style={[
                                                st.tableRow,
                                                idx % 2 === 1 && {
                                                    backgroundColor: `${C.violet}08`,
                                                },
                                            ]}>
                                            <View
                                                style={[
                                                    st.thNameCell,
                                                    {
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        gap: 8,
                                                    },
                                                ]}>
                                                <View
                                                    style={[
                                                        st.teamAvatar,
                                                        {
                                                            backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}22`,
                                                        },
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            st.teamAvatarText,
                                                            {
                                                                color: CHART_COLORS[
                                                                    idx %
                                                                        CHART_COLORS.length
                                                                ],
                                                            },
                                                        ]}>
                                                        {(
                                                            item.name[0] || "?"
                                                        ).toUpperCase()}
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={st.tdName}
                                                    numberOfLines={1}>
                                                    {item.name}
                                                </Text>
                                            </View>
                                            <Text style={st.tdCell}>
                                                {item.totalCalls}
                                            </Text>
                                            <Text style={st.tdCell}>
                                                {formatDurationSec(
                                                    item.totalDuration,
                                                )}
                                            </Text>
                                            <Text style={st.tdCell}>
                                                {item.missed + item.notAttended}
                                            </Text>
                                        </View>
                                    ))
                                )}
                            </Card>
                        </FadeIn>

                        {/* â”€â”€ REVENUE â€” gradient hero + 2 stat cards â”€â”€ */}
                        <FadeIn delay={180}>
                            <Card>
                                <CardHeader
                                    title="Revenue"
                                    icon="cash-outline"
                                    accent={C.emerald}
                                />
                                <LinearGradient
                                    colors={["#EEF9F3", "#E2F5EA"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={st.revHero}>
                                    <View style={st.revHeroInner}>
                                        <Text style={st.revLabel}>
                                            Total Revenue
                                        </Text>
                                        <Text style={st.revValue}>
                                            {fmt(revenueM.total)}
                                        </Text>
                                        <View style={st.revSubRow}>
                                            <Ionicons
                                                name="arrow-up-outline"
                                                size={12}
                                                color={C.emerald}
                                            />
                                            <Text
                                                style={[
                                                    st.revSubText,
                                                    { color: C.emerald },
                                                ]}>
                                                This month:{" "}
                                                {fmt(revenueM.month)}
                                            </Text>
                                        </View>
                                        <Text style={st.revTodayText}>
                                            Selected day: {fmt(revenueM.today)}
                                        </Text>
                                    </View>
                                </LinearGradient>
                                <View style={st.revStatRow}>
                                    {[
                                        {
                                            label: "Sales Deals",
                                            value: leadM.converted,
                                            color: C.emerald,
                                            icon: "checkmark-circle-outline",
                                            isNum: true,
                                        },
                                        {
                                            label: "Avg Deal Value",
                                            value:
                                                leadM.converted > 0
                                                    ? fmt(
                                                          Math.round(
                                                              revenueM.total /
                                                                  leadM.converted,
                                                          ),
                                                      )
                                                    : fmt(0),
                                            color: C.gold,
                                            icon: "trending-up-outline",
                                            isNum: false,
                                        },
                                    ].map((s, i) => (
                                        <View
                                            key={i}
                                            style={[
                                                st.revStat,
                                                {
                                                    backgroundColor: `${s.color}0E`,
                                                    borderColor: `${s.color}25`,
                                                },
                                            ]}>
                                            <Ionicons
                                                name={s.icon}
                                                size={20}
                                                color={s.color}
                                            />
                                            {s.isNum ? (
                                                <AnimCounter
                                                    value={s.value}
                                                    style={[
                                                        st.revStatVal,
                                                        { color: s.color },
                                                    ]}
                                                />
                                            ) : (
                                                <Text
                                                    style={[
                                                        st.revStatVal,
                                                        { color: s.color },
                                                    ]}>
                                                    {s.value}
                                                </Text>
                                            )}
                                            <Text style={st.revStatLabel}>
                                                {s.label}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                                <Text style={st.helperNote}>
                                    * Based on cost values from converted
                                    enquiries in your CRM.
                                </Text>
                            </Card>
                        </FadeIn>

                        <View style={{ height: 20 }} />
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 14, paddingBottom: 40, gap: 14 },
    topHeader: {
        backgroundColor: C.surface,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        zIndex: 20,
    },
    topHeaderBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surfaceWarm,
        alignItems: "center",
        justifyContent: "center",
    },
    topHeaderTitle: {
        flex: 1,
        marginLeft: 12,
        fontSize: 20,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.4,
    },
    topHeaderRight: {
        position: "relative",
        alignItems: "flex-end",
    },
    topHeaderRightRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    exportHeaderBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${C.gold}35`,
        backgroundColor: `${C.gold}10`,
        paddingHorizontal: 12,
        height: 40,
    },
    exportHeaderText: {
        fontSize: 13,
        fontWeight: "700",
        color: C.gold,
    },
    avatarBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
    },
    avatarGrad: {
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarImg: {
        width: "100%",
        height: "100%",
    },
    avatarText: {
        color: "#fff",
        fontWeight: "900",
        fontSize: 16,
    },
    exportMenu: {
        position: "absolute",
        top: 46,
        right: 0,
        width: 154,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surface,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    exportMenuItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    exportMenuItemLast: {
        borderBottomWidth: 0,
    },
    exportMenuText: {
        fontSize: 13,
        fontWeight: "600",
        color: C.text,
    },

    // Hero
    hero: {
        borderRadius: 24,
        padding: 20,
        gap: 14,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
        position: "relative",
    },
    decCircle1: {
        position: "absolute",
        width: 160,
        height: 160,
        borderRadius: 80,
        borderWidth: 1.5,
        borderColor: `${C.gold}20`,
        right: -40,
        top: -40,
    },
    decCircle2: {
        position: "absolute",
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 1,
        borderColor: `${C.gold}15`,
        right: 10,
        top: 30,
    },
    heroTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
    },
    heroPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginBottom: 5,
    },
    heroPillDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: C.gold,
    },
    heroPillText: {
        fontSize: 10,
        fontWeight: "700",
        color: C.gold,
        letterSpacing: 1.3,
        textTransform: "uppercase",
    },
    heroTitle: {
        fontSize: 36,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.8,
    },
    heroSub: { fontSize: 13, color: C.textSec, marginTop: 2 },
    heroKpis: {
        flexDirection: "row",
        backgroundColor: "rgba(255,255,255,0.75)",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
    },
    heroKpi: { flex: 1, alignItems: "center", paddingVertical: 11, gap: 3 },
    heroKpiBorder: { borderRightWidth: 1, borderRightColor: C.border },
    heroKpiIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 1,
    },
    heroKpiVal: { fontSize: 13, fontWeight: "800" },
    heroKpiLabel: {
        fontSize: 9,
        color: C.textMuted,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.4,
    },

    // Filters
    filterCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    filterCardTitle: { fontSize: 16, fontWeight: "700", color: C.text },
    rangeSummary: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${C.gold}22`,
        backgroundColor: `${C.gold}0D`,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    rangeSummaryMain: { flex: 1 },
    rangeSummaryLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    rangeSummaryValue: {
        fontSize: 15,
        fontWeight: "800",
        color: C.text,
        marginTop: 4,
    },
    pendingBadge: {
        borderRadius: 999,
        backgroundColor: `${C.rose}12`,
        borderWidth: 1,
        borderColor: `${C.rose}28`,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    pendingBadgeText: { fontSize: 11, fontWeight: "700", color: C.rose },
    dayNav: { flexDirection: "row", alignItems: "center", gap: 12 },
    dayNavBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surfaceWarm,
        alignItems: "center",
        justifyContent: "center",
    },
    dayNavCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
    dayNavLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    dayNavValue: {
        fontSize: 15,
        fontWeight: "800",
        color: C.text,
        marginTop: 4,
    },
    calendarTrigger: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${C.gold}35`,
        backgroundColor: `${C.gold}10`,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    calendarTriggerText: { fontSize: 13, fontWeight: "700", color: C.gold },
    calendarWrap: {
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surface,
    },
    calendar: {
        borderRadius: 18,
    },
    calendarOverlay: {
        flex: 1,
        backgroundColor: "rgba(14, 18, 24, 0.36)",
        justifyContent: "center",
        padding: 20,
    },
    calendarModalCard: {
        backgroundColor: C.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        gap: 14,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    calendarModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    calendarModalTitle: { fontSize: 17, fontWeight: "800", color: C.text },
    calendarModalSub: { fontSize: 12, color: C.textSec, marginTop: 4 },
    calendarCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.surfaceWarm,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
        justifyContent: "center",
    },
    dayActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
    },
    todayBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${C.gold}35`,
        backgroundColor: `${C.gold}10`,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    quickRangeBtn: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${C.sky}28`,
        backgroundColor: `${C.sky}0C`,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    quickRangeBtnText: { fontSize: 12, fontWeight: "700", color: C.sky },
    todayBtnText: { fontSize: 13, fontWeight: "700", color: C.gold },
    quickRangeBtnActive: {
        backgroundColor: C.sky,
        borderColor: C.sky,
    },
    quickRangeBtnTextActive: { color: "#FFFFFF" },
    filterGrid: { gap: 10 },
    filterGroup: { gap: 6 },
    filterPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    filterPillLabel: {
        fontSize: 10,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    filterPillValue: { fontSize: 14, fontWeight: "700", marginTop: 1 },
    filterMenu: {
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: C.surfaceWarm,
        overflow: "hidden",
    },
    filterMenuItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    filterMenuText: { fontSize: 13, color: C.textSec, fontWeight: "600" },
    dateRow: { flexDirection: "row", gap: 10 },
    dateWrap: { flex: 1, gap: 4 },
    dateLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
    },
    dateInput: {
        backgroundColor: C.bg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    dateInputText: { color: C.text, fontSize: 14, fontWeight: "700" },
    applyFilterBtn: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: C.gold,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    applyFilterText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },

    // Card base
    card: {
        backgroundColor: C.surface,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        gap: 14,
        shadowColor: "#A09070",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 2,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
    cardIconBg: {
        width: 32,
        height: 32,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
    },
    cardTitle: { fontSize: 17, fontWeight: "800", color: C.text, flex: 1 },
    divider: { height: 1, backgroundColor: C.border },
    subHeading: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.8,
    },

    // Lead overview
    donutRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 18,
        paddingVertical: 4,
    },
    donutRowStacked: { flexDirection: "column", alignItems: "stretch" },
    donutChartWrap: { alignSelf: "center" },
    donutLegend: { flex: 1, gap: 10 },
    donutLegendStacked: { width: "100%" },
    pieCenterLabel: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.86)",
        width: 74,
        height: 74,
        borderRadius: 37,
        borderWidth: 1,
        borderColor: C.border,
    },
    pieCenterValue: { fontSize: 20, fontWeight: "800", color: C.text },
    pieCenterText: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 0.7,
        marginTop: 2,
    },
    legendRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    legendDot: { width: 9, height: 9, borderRadius: 5 },
    legendLabel: {
        flex: 1,
        flexShrink: 1,
        fontSize: 13,
        color: C.textSec,
        fontWeight: "600",
    },
    legendVal: { fontSize: 14, fontWeight: "800" },

    // Progress rows
    pRow: { gap: 6 },
    pLabelRow: { flexDirection: "row", justifyContent: "space-between" },
    pLabel: { fontSize: 13, color: C.textSec, fontWeight: "500" },
    pValText: { fontSize: 13, fontWeight: "700" },
    progressTrack: {
        height: 7,
        borderRadius: 999,
        backgroundColor: C.bg,
        overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 999 },

    // 2Ã—2 Tiles
    tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tile: {
        minWidth: "47%",
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        padding: 14,
        gap: 6,
    },
    tileIcon: {
        width: 32,
        height: 32,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 2,
    },
    tileValue: { fontSize: 28, fontWeight: "800" },
    tileLabel: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textSec,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    completionWrap: { borderRadius: 14, padding: 12, gap: 8 },
    completionLabel: { fontSize: 13, fontWeight: "600", color: C.textSec },

    // Conversion funnel
    rateBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    rateBadgeText: { fontSize: 12, fontWeight: "800" },
    funnelOuter: { alignItems: "center" },
    funnelBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    funnelBarLabel: { fontSize: 13, fontWeight: "700", flex: 1 },
    funnelBarVal: { fontSize: 18, fontWeight: "800" },

    // Call stats
    callStatRow: { flexDirection: "row", gap: 8 },
    callStat: {
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        alignItems: "center",
        gap: 4,
    },
    callStatIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 2,
    },
    callStatVal: { fontSize: 22, fontWeight: "800" },
    callStatLabel: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textMuted,
        textTransform: "uppercase",
    },
    avgDurBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        padding: 10,
        borderRadius: 12,
    },
    avgDurText: { fontSize: 13, fontWeight: "700" },

    // Lead Sources
    sourceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    sourceRank: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
    },
    sourceRankText: { fontSize: 11, fontWeight: "800" },
    sourceLabelRow: { flexDirection: "row", justifyContent: "space-between" },
    sourceLabel: { fontSize: 13, color: C.textSec, fontWeight: "500" },
    sourceVal: { fontSize: 13, fontWeight: "800" },

    // Team table
    tableHead: {
        flexDirection: "row",
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
    },
    thCell: {
        flex: 1,
        fontSize: 10,
        fontWeight: "700",
        color: C.textMuted,
        textTransform: "uppercase",
        textAlign: "center",
        letterSpacing: 0.5,
    },
    thNameCell: { flex: 2, textAlign: "left" },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 10,
    },
    tdCell: {
        flex: 1,
        fontSize: 13,
        color: C.textSec,
        fontWeight: "600",
        textAlign: "center",
    },
    tdName: { fontSize: 13, fontWeight: "700", color: C.text, flex: 1 },
    teamAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    teamAvatarText: { fontSize: 12, fontWeight: "800" },
    wonBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    wonText: { fontSize: 12, fontWeight: "800" },

    // Revenue
    revHero: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: `${C.emerald}25`,
        flexDirection: "row",
        alignItems: "center",
    },
    revHeroInner: { flex: 1, gap: 3 },
    revLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: C.teal,
        textTransform: "uppercase",
        letterSpacing: 0.8,
    },
    revValue: { fontSize: 32, fontWeight: "800", color: C.emerald },
    revSubRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    revSubText: { fontSize: 13, fontWeight: "600" },
    revTodayText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.textSec,
        marginTop: 4,
    },
    revStatRow: { flexDirection: "row", gap: 10 },
    revStat: {
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        alignItems: "center",
        gap: 6,
    },
    revStatVal: { fontSize: 18, fontWeight: "800" },
    revStatLabel: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textSec,
        textAlign: "center",
    },
    helperNote: { fontSize: 11, color: C.textMuted, lineHeight: 16 },

    // Loading / empty
    loadingWrap: { paddingVertical: 80, alignItems: "center", gap: 12 },
    loadingText: { fontSize: 14, color: C.textMuted, fontWeight: "600" },
    emptyNote: {
        fontSize: 13,
        color: C.textMuted,
        textAlign: "center",
        paddingVertical: 10,
    },
});
