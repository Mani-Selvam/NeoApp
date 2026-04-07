import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Calendar } from "react-native-calendars";
import {
    Animated,
    DeviceEventEmitter,
    Easing,
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
import Svg, {
    Circle,
    Defs,
    Line,
    Path,
    Rect,
    Stop,
    LinearGradient as SvgLinearGradient,
    Text as SvgText,
} from "react-native-svg";
import AppSideMenu from "../components/AppSideMenu";
import { HomeSkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { getImageUrl } from "../services/apiConfig";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    setCacheEntry,
} from "../services/appCache";
import { APP_EVENTS, onAppEvent } from "../services/appEvents";
import { cancelDebounceKey, debounceByKey } from "../services/debounce";
import * as dashboardService from "../services/dashboardService";
import { getBillingCoupons } from "../services/userService";
import notificationService from "../services/notificationService";

// -----------------------------------------------------------------------------
// RESPONSIVE BREAKPOINTS
// -----------------------------------------------------------------------------
// sm  = phone small   < 375px
// md  = phone large  375-767px
// lg  = tablet       768-1023px
// xl  = desktop      >= 1024px

const getBreakpoint = (w) => {
    if (w >= 1024) return "xl";
    if (w >= 768) return "lg";
    if (w >= 375) return "md";
    return "sm";
};

// Scale a base value by breakpoint multiplier
const rs = (base, bp) => {
    const multipliers = { sm: 0.85, md: 1, lg: 1.2, xl: 1.35 };
    return Math.round(base * (multipliers[bp] ?? 1));
};

const toLocalIsoDate = (value = new Date()) => {
    const d = value instanceof Date ? value : new Date(value);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const isoToDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
};

const getRangeBounds = (
    range = "day",
    anchorIso = toLocalIsoDate(new Date()),
) => {
    const dt = isoToDate(anchorIso) || new Date();
    const r = String(range || "day")
        .trim()
        .toLowerCase();

    if (r === "year") {
        const from = new Date(dt.getFullYear(), 0, 1);
        const to = new Date(dt.getFullYear(), 11, 31);
        return { rangeFrom: toLocalIsoDate(from), rangeTo: toLocalIsoDate(to) };
    }
    if (r === "month") {
        const from = new Date(dt.getFullYear(), dt.getMonth(), 1);
        const to = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
        return { rangeFrom: toLocalIsoDate(from), rangeTo: toLocalIsoDate(to) };
    }
    if (r === "week") {
        const day = dt.getDay(); // 0 Sun .. 6 Sat
        const diffToMonday = (day + 6) % 7;
        const from = new Date(dt);
        from.setDate(dt.getDate() - diffToMonday);
        const to = new Date(from);
        to.setDate(from.getDate() + 6);
        return { rangeFrom: toLocalIsoDate(from), rangeTo: toLocalIsoDate(to) };
    }

    const iso = toLocalIsoDate(dt);
    return { rangeFrom: iso, rangeTo: iso };
};

const fmtShortDate = (iso) => {
    const dt = isoToDate(iso);
    if (!dt) return String(iso || "");
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
};

const fmtMonthYear = (iso) => {
    const dt = isoToDate(iso);
    if (!dt) return String(iso || "");
    return dt.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
    });
};

const fmtWeekday3 = (iso) => {
    const dt = isoToDate(iso);
    if (!dt) return "";
    return dt.toLocaleDateString(undefined, { weekday: "short" }); // Mon, Tue...
};

const HOME_CACHE_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_HOME_MS || 300000,
); // 5 minutes for instant loading

// Hook: returns { bp, w, h, isTablet, isDesktop, isSmallPhone }
const useResponsive = () => {
    const { width: w, height: h } = useWindowDimensions();
    const bp = getBreakpoint(w);
    return {
        bp,
        w,
        h,
        isSmallPhone: bp === "sm",
        isPhone: bp === "sm" || bp === "md",
        isTablet: bp === "lg",
        isDesktop: bp === "xl",
    };
};

// -----------------------------------------------------------------------------
// DESIGN SYSTEM
// -----------------------------------------------------------------------------
const C = {
    bg: "#EEF3F8",
    surface: "#FBFCFF",
    cardSoft: "#F4F8FF",
    blue: "#1A6BFF",
    blueDark: "#0050D8",
    blueLight: "#EBF2FF",
    blueMid: "#C2D9FF",
    teal: "#00C6A2",
    emerald: "#00C48C",
    amber: "#FF9500",
    rose: "#FF3B5C",
    violet: "#7B61FF",
    sky: "#29B6F6",
    ink: "#0A0F1E",
    textSub: "#3A4060",
    textDim: "#7C85A3",
    textMuted: "#B0BAD3",
    border: "#E4E9F2",
    divider: "#F0F3FA",
    shadow: "#1A2560",
    g: {
        hero: ["#0F3091", "#1A6BFF", "#4D94FF"],
        blue: ["#1A6BFF", "#4D94FF"],
        teal: ["#009F83", "#00C6A2"],
        emerald: ["#00A678", "#00C48C"],
        rose: ["#C5001F", "#FF3B5C"],
        amber: ["#D46A00", "#FF9500"],
        violet: ["#5740D6", "#7B61FF"],
        sky: ["#0277BD", "#29B6F6"],
        whatsapp: ["#128C7E", "#25D366"],
        header: ["#FFFFFF", "#F7F9FD"],
    },
};

// -----------------------------------------------------------------------------
// ANIMATED BAR CHART (Hero - white bars)
// -----------------------------------------------------------------------------
const HeroBarChart = ({ data = [], h = 52, highlightIndex = null }) => {
    const anims = useRef(data.map(() => new Animated.Value(0))).current;
    useEffect(() => {
        Animated.stagger(
            55,
            anims.map((a, i) =>
                Animated.timing(a, {
                    toValue: 1,
                    duration: 520 + i * 50,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: false,
                    delay: i * 45,
                }),
            ),
        ).start();
    }, [JSON.stringify(data)]);
    const max = Math.max(...data.map((d) => d.value), 1);
    return (
        <View
            style={{
                height: h + 20,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 5,
            }}>
            {data.map((d, i) => {
                const isHighlighted =
                    typeof highlightIndex === "number" && highlightIndex >= 0
                        ? i === highlightIndex
                        : i === data.length - 1;
                const barH = anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.max(4, (d.value / max) * h)],
                });
                return (
                    <View
                        key={i}
                        style={{
                            flex: 1,
                            alignItems: "center",
                            height: h + 20,
                            justifyContent: "flex-end",
                        }}>
                        <View
                            style={{
                                flex: 1,
                                width: "100%",
                                justifyContent: "flex-end",
                            }}>
                            {isHighlighted && d.value > 0 && (
                                <Text
                                    style={{
                                        fontSize: 8,
                                        color: "#fff",
                                        fontWeight: "800",
                                        textAlign: "center",
                                        marginBottom: 2,
                                        opacity: 0.85,
                                    }}>
                                    {d.value}
                                </Text>
                            )}
                            <Animated.View
                                style={{
                                    height: barH,
                                    width: "100%",
                                    borderRadius: 5,
                                    backgroundColor: isHighlighted
                                        ? "rgba(255,255,255,0.95)"
                                        : "rgba(255,255,255,0.3)",
                                }}
                            />
                        </View>
                        <Text
                            style={{
                                fontSize: 9,
                                color: "rgba(255,255,255,0.5)",
                                fontWeight: "700",
                                marginTop: 5,
                            }}>
                            {d.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};

// -----------------------------------------------------------------------------
// LIGHT BAR CHART (Sales - colored bars)
// -----------------------------------------------------------------------------
const LightBarChart = ({ data = [], h = 84, highlightIndex = null }) => {
    const anims = useRef(data.map(() => new Animated.Value(0))).current;
    useEffect(() => {
        Animated.stagger(
            55,
            anims.map((a, i) =>
                Animated.timing(a, {
                    toValue: 1,
                    duration: 560 + i * 55,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: false,
                    delay: 120 + i * 45,
                }),
            ),
        ).start();
    }, [JSON.stringify(data)]);
    const max = Math.max(...data.map((d) => d.value), 1);
    return (
        <View
            style={{
                height: h + 22,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 6,
            }}>
            {data.map((d, i) => {
                const isHighlighted =
                    typeof highlightIndex === "number" && highlightIndex >= 0
                        ? i === highlightIndex
                        : i === data.length - 1;
                const barH = anims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, Math.max(5, (d.value / max) * h)],
                });
                const color = d.color ?? C.emerald;
                return (
                    <View
                        key={i}
                        style={{
                            flex: 1,
                            alignItems: "center",
                            height: h + 22,
                            justifyContent: "flex-end",
                        }}>
                        <View
                            style={{
                                flex: 1,
                                width: "100%",
                                justifyContent: "flex-end",
                            }}>
                            {isHighlighted && d.value > 0 && (
                                <Text
                                    style={{
                                        fontSize: 9,
                                        color,
                                        fontWeight: "800",
                                        textAlign: "center",
                                        marginBottom: 3,
                                    }}>
                                    {d.value}
                                </Text>
                            )}
                            <Animated.View
                                style={{
                                    height: barH,
                                    width: "100%",
                                    borderRadius: 6,
                                    backgroundColor: isHighlighted
                                        ? color
                                        : color + "2E",
                                }}
                            />
                        </View>
                        <Text
                            style={{
                                fontSize: 9,
                                color: C.textMuted,
                                fontWeight: "600",
                                marginTop: 5,
                            }}>
                            {d.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
};

// -----------------------------------------------------------------------------
// TRADING STAGE CHART (SVG line chart)
// -----------------------------------------------------------------------------
const TradingStageChart = ({ data = [], h = 170, chartWidth = 340 }) => {
    const paddingX = 24;
    const paddingTop = 18;
    const paddingBottom = 36;
    const innerWidth = chartWidth - paddingX * 2;
    const innerHeight = h - paddingTop - paddingBottom;
    const max = Math.max(...data.map((d) => d.value), 1);
    const baselineY = paddingTop + innerHeight;
    const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;
    const points = data.map((stage, index) => {
        const ratio = max > 0 ? stage.value / max : 0;
        const plottedHeight =
            stage.value > 0 ? Math.max(10, ratio * innerHeight) : 0;
        return {
            ...stage,
            x: paddingX + stepX * index,
            y: baselineY - plottedHeight,
        };
    });
    const linePath = points.length
        ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
        : "";
    const areaPath = points.length
        ? [
              `M ${points[0].x} ${baselineY}`,
              ...points.map((p) => `L ${p.x} ${p.y}`),
              `L ${points[points.length - 1].x} ${baselineY}`,
              "Z",
          ].join(" ")
        : "";
    return (
        <View>
            <Svg
                width="100%"
                height={h + 30}
                viewBox={`0 0 ${chartWidth} ${h + 30}`}>
                <Defs>
                    <SvgLinearGradient
                        id="tradingBg"
                        x1="0%"
                        y1="0%"
                        x2="100%"
                        y2="0%">
                        <Stop offset="0%" stopColor="#DCE4F0" />
                        <Stop offset="50%" stopColor="#F7F9FD" />
                        <Stop offset="100%" stopColor="#D7E8F7" />
                    </SvgLinearGradient>
                    <SvgLinearGradient
                        id="tradingFill"
                        x1="0%"
                        y1="0%"
                        x2="0%"
                        y2="100%">
                        <Stop
                            offset="0%"
                            stopColor="#73AEEA"
                            stopOpacity="0.42"
                        />
                        <Stop
                            offset="100%"
                            stopColor="#73AEEA"
                            stopOpacity="0.08"
                        />
                    </SvgLinearGradient>
                </Defs>
                <Rect
                    x="0"
                    y="0"
                    width={chartWidth}
                    height={h}
                    rx="22"
                    fill="url(#tradingBg)"
                />
                {[0, 1, 2].map((line) => (
                    <Line
                        key={line}
                        x1={paddingX}
                        x2={chartWidth - paddingX}
                        y1={paddingTop + (innerHeight / 2) * line}
                        y2={paddingTop + (innerHeight / 2) * line}
                        stroke="#C9D6E5"
                        strokeOpacity="0.65"
                        strokeDasharray="4 6"
                    />
                ))}
                {areaPath ? (
                    <Path d={areaPath} fill="url(#tradingFill)" />
                ) : null}
                {linePath ? (
                    <Path
                        d={linePath}
                        fill="none"
                        stroke="#2558D9"
                        strokeWidth="3.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                ) : null}
                {points.map((p) => (
                    <Circle
                        key={`${p.label}-dot`}
                        cx={p.x}
                        cy={p.y}
                        r="6"
                        fill="#F7F9FD"
                        stroke={p.color}
                        strokeWidth="3"
                    />
                ))}
                {points.map((p) => (
                    <SvgText
                        key={`${p.label}-value`}
                        x={p.x}
                        y={p.y - 12}
                        fill={p.color}
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle">
                        {p.label}
                    </SvgText>
                ))}
                {points.map((p) => (
                    <SvgText
                        key={`${p.label}-axis`}
                        x={p.x}
                        y={h + 14}
                        fill="#6F829C"
                        fontSize="11"
                        fontWeight="600"
                        textAnchor="middle">
                        {p.label}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
};

// -----------------------------------------------------------------------------
// PIPELINE ANIMATED BAR
// -----------------------------------------------------------------------------
const PipelineBar = ({ label, value, total, color, delay }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const pct = total > 0 ? (value / total) * 100 : 0;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: pct / 100,
            duration: 700,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [value, total]);
    const barW = anim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
    });
    return (
        <View style={{ marginBottom: 14 }}>
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 6,
                }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 7,
                    }}>
                    <View
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: 3,
                            backgroundColor: color,
                        }}
                    />
                    <Text
                        style={{
                            fontSize: 13,
                            color: C.textSub,
                            fontWeight: "600",
                        }}>
                        {label}
                    </Text>
                </View>
                <Text style={{ fontSize: 13, color, fontWeight: "800" }}>
                    {value}
                </Text>
            </View>
            <View
                style={{
                    height: 7,
                    backgroundColor: C.divider,
                    borderRadius: 4,
                    overflow: "hidden",
                }}>
                <Animated.View
                    style={{
                        height: "100%",
                        width: barW,
                        backgroundColor: color,
                        borderRadius: 4,
                    }}
                />
            </View>
            <Text
                style={{
                    fontSize: 10,
                    color: C.textMuted,
                    marginTop: 4,
                    fontWeight: "600",
                }}>
                {pct.toFixed(0)}% of pipeline
            </Text>
        </View>
    );
};

// -----------------------------------------------------------------------------
// SPARKLINE
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// PULSE DOT
// -----------------------------------------------------------------------------
const PulseDot = ({ color = C.emerald, size = 8 }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(scale, {
                        toValue: 2.4,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacity, {
                        toValue: 0,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.parallel([
                    Animated.timing(scale, {
                        toValue: 1,
                        duration: 0,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacity, {
                        toValue: 1,
                        duration: 0,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.delay(500),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, []);
    return (
        <View
            style={{
                width: size + 8,
                height: size + 8,
                justifyContent: "center",
                alignItems: "center",
            }}>
            <Animated.View
                style={{
                    position: "absolute",
                    width: size + 4,
                    height: size + 4,
                    borderRadius: (size + 4) / 2,
                    backgroundColor: color,
                    opacity,
                    transform: [{ scale }],
                }}
            />
            <View
                style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                }}
            />
        </View>
    );
};

// -----------------------------------------------------------------------------
// RING METER
// -----------------------------------------------------------------------------
const RingMeter = ({ pct = 0, size = 78 }) => {
    const segments = 18;
    const filled = Math.round(
        (Math.min(100, Math.max(0, pct)) / 100) * segments,
    );
    const r = (size - 14) / 2;
    return (
        <View
            style={{
                width: size,
                height: size,
                justifyContent: "center",
                alignItems: "center",
            }}>
            {Array.from({ length: segments }).map((_, i) => {
                const angle = ((i / segments) * 360 - 90) * (Math.PI / 180);
                const cx = size / 2 + r * Math.cos(angle);
                const cy = size / 2 + r * Math.sin(angle);
                return (
                    <View
                        key={i}
                        style={{
                            position: "absolute",
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor:
                                i < filled ? "#fff" : "rgba(255,255,255,0.2)",
                            left: cx - 3,
                            top: cy - 3,
                        }}
                    />
                );
            })}
            <View style={{ alignItems: "center" }}>
                <Text
                    style={{
                        fontSize: 15,
                        color: "#fff",
                        fontWeight: "900",
                        letterSpacing: -0.4,
                    }}>
                    {pct}%
                </Text>
                <Text
                    style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.6)",
                        fontWeight: "700",
                    }}>
                    CR
                </Text>
            </View>
        </View>
    );
};

// -----------------------------------------------------------------------------
// METRIC TILE  (responsive-aware)
// -----------------------------------------------------------------------------
const MetricTile = ({ icon, label, value, color, onPress, tileWidth }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.85 : 1}
        style={[
            S.tile,
            S.metricTileRedesign,
            tileWidth ? { width: tileWidth } : {},
        ]}>
        <View style={[S.metricGlow, { backgroundColor: color + "10" }]} />
        <View style={S.metricTileTopRow}>
            <Text style={S.tileValue} numberOfLines={1}>
                {value}
            </Text>
            <View
                style={[
                    S.tileIcon,
                    S.metricTileIcon,
                    { backgroundColor: color + "14" },
                ]}>
                <Ionicons name={icon} size={20} color={color} />
            </View>
        </View>
        <View style={[S.metricLabelBand, { backgroundColor: color + "10" }]}>
            <View style={[S.metricAccent, { backgroundColor: color }]} />
            <Text style={[S.tileLabel, { color }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    </TouchableOpacity>
);

// -----------------------------------------------------------------------------
// SECTION HEADER
// -----------------------------------------------------------------------------
const SH = ({ title, sub, right, titleSize = 17 }) => (
    <View
        style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 14,
        }}>
        <View style={{ flex: 1 }}>
            <Text
                style={{
                    fontSize: titleSize,
                    color: C.ink,
                    fontWeight: "800",
                    letterSpacing: -0.3,
                }}>
                {title}
            </Text>
            {sub && (
                <Text
                    style={{
                        fontSize: 11,
                        color: C.textDim,
                        fontWeight: "600",
                        marginTop: 2,
                    }}>
                    {sub}
                </Text>
            )}
        </View>
        {right}
    </View>
);

// -----------------------------------------------------------------------------
// ACTION PILL
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// ACTIVITY ROW
// -----------------------------------------------------------------------------
const getActivityFocusTab = (status) => {
    const raw = String(status || "")
        .trim()
        .toLowerCase();
    if (raw === "contacted" || raw === "connected" || raw === "in progress") {
        return "Contacted";
    }
    if (raw === "interested") return "Interested";
    if (raw === "not interested" || raw === "dropped" || raw === "drop") {
        return "Not Interested";
    }
    if (raw === "converted") return "Sales";
    if (raw === "closed") return "Drop";
    return "New";
};

// -----------------------------------------------------------------------------
// SIDE MENU ITEM
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// LOGOUT MODAL
// -----------------------------------------------------------------------------
const LogoutConfirmModal = ({ visible, onClose, onConfirm }) => (
    <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}>
        <TouchableOpacity
            style={{
                flex: 1,
                backgroundColor: "rgba(10,15,30,0.40)",
                justifyContent: "center",
                alignItems: "center",
                padding: 24,
            }}
            activeOpacity={1}
            onPress={onClose}>
            <MotiView
                from={{ opacity: 0, scale: 0.9, translateY: 20 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                style={S.logoutCard}>
                <LinearGradient
                    colors={[C.rose + "22", C.rose + "06"]}
                    style={S.logoutIconBox}>
                    <Ionicons name="log-out-outline" size={28} color={C.rose} />
                </LinearGradient>
                <Text
                    style={{
                        fontSize: 20,
                        color: C.ink,
                        fontWeight: "900",
                        marginBottom: 8,
                    }}>
                    Sign Out?
                </Text>
                <Text
                    style={{
                        fontSize: 14,
                        color: C.textDim,
                        textAlign: "center",
                        lineHeight: 20,
                        marginBottom: 24,
                    }}>
                    You&apos;ll need to log back in to access your CRM data.
                </Text>
                <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                    <TouchableOpacity
                        onPress={onClose}
                        style={{
                            flex: 1,
                            height: 50,
                            borderRadius: 14,
                            justifyContent: "center",
                            alignItems: "center",
                            backgroundColor: C.bg,
                            borderWidth: 1.5,
                            borderColor: C.border,
                        }}>
                        <Text
                            style={{
                                fontSize: 15,
                                fontWeight: "700",
                                color: C.textDim,
                            }}>
                            Cancel
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onConfirm} style={{ flex: 1 }}>
                        <LinearGradient
                            colors={C.g.rose}
                            style={{
                                height: 50,
                                borderRadius: 14,
                                justifyContent: "center",
                                alignItems: "center",
                            }}>
                            <Text
                                style={{
                                    fontSize: 15,
                                    fontWeight: "700",
                                    color: "#fff",
                                }}>
                                Sign Out
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </MotiView>
        </TouchableOpacity>
    </Modal>
);

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
const fmtInr = (n) => {
    if (n >= 1e7) return `Rs ${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `Rs ${(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `Rs ${(n / 1e3).toFixed(1)}K`;
    return `Rs ${n}`;
};
// -----------------------------------------------------------------------------
// MAIN SCREEN
// -----------------------------------------------------------------------------
export default function HomeScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const swipeHandlers = useSwipeNavigation("Home", navigation);

    // Responsive values
    const { bp, w, h, isTablet, isDesktop, isPhone, isSmallPhone } =
        useResponsive();
    const hp = w - (isDesktop ? 48 : isTablet ? 36 : 36); // content width
    const hPad = isDesktop ? 24 : isTablet ? 18 : 18; // horizontal padding

    // Tile grid: 2 on phones, 3 on tablets, 4 on desktop
    const tileColumns = isDesktop ? 4 : isTablet ? 3 : 2;
    const tileGap = 10;
    const tileWidth = (hp - tileGap * (tileColumns - 1)) / tileColumns;

    // Legend pills: always 2 cards per row (all devices)

    // Coupon card width
    const couponCardWidth = isDesktop ? 320 : isTablet ? 280 : w - 60;

    // Hero chart width for SVG
    const svgChartWidth = hp - 36; // inside card padding

    // Font scaling
    const heroRevFontSize = isDesktop
        ? 42
        : isTablet
          ? 38
          : isSmallPhone
            ? 28
            : 36;
    const sectionTitleSize = isTablet || isDesktop ? 19 : 17;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [rangeType, setRangeType] = useState("year"); // day | week | month | year
    const [rangeAnchor, setRangeAnchor] = useState(() =>
        toLocalIsoDate(new Date()),
    );
    const [filterOpen, setFilterOpen] = useState(false);
    const [draftRangeType, setDraftRangeType] = useState("year");
    const [draftRangeAnchor, setDraftRangeAnchor] = useState(() =>
        toLocalIsoDate(new Date()),
    );
    const [stats, setStats] = useState({
        totalEnquiry: 0,
        todayFollowup: 0,
        missedFollowup: 0,
        salesMonthly: 0,
        monthlyRevenue: 0,
        overallSalesAmount: 0,
        prevRevenue: 0,
        revenueChangePct: null,
        weekSales: [],
        drops: 0,
        new: 0,
        ip: 0,
        conv: 0,
    });
    const [coupons, setCoupons] = useState([]);
    const [copiedCouponCode, setCopiedCouponCode] = useState("");
    const [todayTasks, setTodayTasks] = useState([]);
    const [missedTasks, setMissedTasks] = useState([]);
    const [showMenu, setShowMenu] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    const [skipAnim, setSkipAnim] = useState(false);
    const couponCopyResetRef = useRef(null);
    const dashboardFetchInFlightRef = useRef(false);
    useEffect(() => {
        AsyncStorage.getItem("homeIntroPlayed")
            .then((val) => {
                if (val === "1") setSkipAnim(true);
                else {
                    setSkipAnim(false);
                    AsyncStorage.setItem("homeIntroPlayed", "1").catch(
                        () => {},
                    );
                }
            })
            .catch(() => setSkipAnim(false));
    }, []);

    useEffect(() => {
        return () => {
            if (couponCopyResetRef.current) {
                clearTimeout(couponCopyResetRef.current);
            }
        };
    }, []);

    const handleLogout = () => {
        setShowMenu(false);
        setShowLogout(true);
    };
    const confirmLogout = async () => {
        setShowLogout(false);
        await logout();
    };

    const { rangeFrom, rangeTo } = getRangeBounds(rangeType, rangeAnchor);
    const rangeLabel =
        rangeType === "day"
            ? fmtShortDate(rangeAnchor)
            : rangeType === "week"
              ? `${fmtShortDate(rangeFrom)} - ${fmtShortDate(rangeTo)}`
              : rangeType === "month"
                ? fmtMonthYear(rangeAnchor)
                : String((isoToDate(rangeAnchor) || new Date()).getFullYear());

    const prevLabel =
        rangeType === "day"
            ? "yesterday"
            : rangeType === "week"
              ? "last week"
              : rangeType === "month"
                ? "last month"
                : "last year";

    const revenueDeltaLabel = (() => {
        const now = Number(stats.overallSalesAmount || 0);
        const prev = Number(stats.prevRevenue || 0);
        if (prev === 0 && now > 0) return "+∞%";
        if (prev === 0 && now === 0) return "0%";
        if (stats.revenueChangePct == null) return "0%";
        const pct = Number(stats.revenueChangePct || 0);
        return `${pct > 0 ? "+" : ""}${pct}%`;
    })();

    const dashboardCacheKey = useMemo(
        () =>
            buildCacheKey(
                "homeDashboard:v1",
                user?.id || user?._id || "",
                rangeType,
                rangeAnchor,
            ),
        [rangeAnchor, rangeType, user?.id, user?._id],
    );

    const hydrateDashboard = useCallback((payload) => {
        const data = payload?.dashboard;
        const couponData = payload?.coupons;
        if (data) {
            setStats({
                totalEnquiry: data.totalEnquiry || 0,
                todayFollowup: Number(data.todayFollowUps || 0),
                missedFollowup: Number(data.missedFollowUps || 0),
                salesMonthly: data.salesMonthly || 0,
                monthlyRevenue: data.monthlyRevenue || 0,
                overallSalesAmount: data.overallSalesAmount || 0,
                prevRevenue: Number(data.prevRevenue || 0),
                revenueChangePct:
                    data.revenueChangePct === null ||
                    data.revenueChangePct === undefined
                        ? null
                        : Number(data.revenueChangePct),
                weekSales: Array.isArray(data.weekSales) ? data.weekSales : [],
                // "Lost" = Dropped + Closed (both are drop outcomes in FollowUp flow)
                drops:
                    Number(data.counts?.dropped || 0) +
                    Number(data.counts?.closed || 0),
                new: data.counts?.new || 0,
                ip: data.counts?.inProgress || 0,
                conv: data.counts?.converted || 0,
            });
            setTodayTasks(data.todayList || []);
            setMissedTasks(data.missedList || []);
        }
        if (Array.isArray(couponData)) setCoupons(couponData);
    }, []);

    const fetchData = useCallback(
        async ({ force = false, showLoading = true } = {}) => {
            if (dashboardFetchInFlightRef.current) return;
            dashboardFetchInFlightRef.current = true;
            try {
                let usedCache = false;
                const cached = await getCacheEntry(dashboardCacheKey).catch(
                    () => null,
                );

                // ⚡ INSTANT LOAD: Show cached data immediately, never block UI
                if (cached?.value) {
                    hydrateDashboard(cached.value);
                    usedCache = true;
                    // Don't set loading=true if we have cache; just show data instantly
                    if (setLoading) setLoading(false);
                }

                const shouldFetch =
                    force || !isFresh(cached, HOME_CACHE_TTL_MS);
                if (!shouldFetch) return;

                // ⚡ BACKGROUND SYNC: Fetch fresh data without blocking UI
                // Only show loading if no cache AND first time
                if (showLoading && !usedCache) setLoading(true);

                const [data, couponData] = await Promise.all([
                    dashboardService.getDashboardSummary({
                        range: rangeType,
                        date: rangeAnchor,
                    }),
                    getBillingCoupons().catch(() => ({ coupons: [] })),
                ]);
                const payload = {
                    dashboard: data || null,
                    coupons: couponData?.coupons || [],
                };
                hydrateDashboard(payload);
                await setCacheEntry(dashboardCacheKey, payload, {
                    tags: ["dashboard"],
                }).catch(() => {});
            } catch (err) {
                const status = err?.response?.status;
                const code = err?.response?.data?.code;
                const message =
                    err?.response?.data?.message ||
                    err?.response?.data?.error ||
                    err?.message ||
                    "";
                if (
                    err?.isAuthError === true ||
                    status === 401 ||
                    status === 403 ||
                    code === "COMPANY_NOT_ACTIVE" ||
                    code === "COMPANY_NOT_FOUND" ||
                    String(message)
                        .toLowerCase()
                        .includes("company is suspended")
                )
                    return;
                console.error("HomeScreen fetchData error:", err);
            } finally {
                setLoading(false);
                setRefreshing(false);
                dashboardFetchInFlightRef.current = false;
            }
        },
        [dashboardCacheKey, hydrateDashboard, rangeType, rangeAnchor],
    );

    useLayoutEffect(() => {
        navigation.setOptions({
            headerShown: false,
            headerLeft: () => null,
            gestureEnabled: false,
            drawerLockMode: "locked-closed",
            swipeEnabled: false,
        });
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            // ⚡ Always fetch fresh data in background, but show cache instantly
            fetchData({ force: false, showLoading: false });
        }, [fetchData]),
    );

    useEffect(() => {
        const refreshDashboard = () =>
            debounceByKey(
                "home-refresh",
                () => fetchData({ force: true, showLoading: false }),
                300,
            );

        const unsubAnnouncement = onAppEvent(
            APP_EVENTS.COUPON_ANNOUNCEMENT,
            refreshDashboard,
        );
        const unsubSync = onAppEvent(APP_EVENTS.COUPON_SYNC, refreshDashboard);
        const unsubFollowup = onAppEvent(
            APP_EVENTS.FOLLOWUP_CHANGED,
            refreshDashboard,
        );
        const unsubEnquiry = onAppEvent(
            APP_EVENTS.ENQUIRY_UPDATED,
            refreshDashboard,
        );
        return () => {
            cancelDebounceKey("home-refresh");
            unsubAnnouncement();
            unsubSync();
            unsubFollowup();
            unsubEnquiry();
        };
    }, [fetchData]);

    if (loading && !refreshing) {
        return <HomeSkeleton />;
    }

    const cr =
        stats.totalEnquiry > 0
            ? Math.round((stats.conv / stats.totalEnquiry) * 100)
            : 0;
    const pipelineStages = [
        {
            label: "New",
            shortLabel: "New",
            value: stats.new,
            color: C.blue,
            hint: "Fresh leads",
        },
        {
            label: "Active",
            shortLabel: "Act",
            value: stats.ip,
            color: C.teal,
            hint: "In progress",
        },
        {
            label: "Sales",
            shortLabel: "Won",
            value: stats.conv,
            color: C.emerald,
            hint: "Sales",
        },
        {
            label: "Dropped",
            shortLabel: "Lost",
            value: stats.drops,
            color: C.rose,
            hint: "Dropped",
        },
    ];
    const pipelineLeader = pipelineStages.reduce(
        (leader, stage) => (stage.value > leader.value ? stage : leader),
        pipelineStages[0],
    );
    const hour = new Date().getHours();
    const greeting =
        hour < 12
            ? "Good morning"
            : hour < 17
              ? "Good afternoon"
              : "Good evening";

    const getCouponValueLabel = (c) =>
        c?.discountType === "percentage"
            ? `${c.discountValue}% OFF`
            : `Rs ${c?.discountValue || 0} OFF`;

    const handleCouponCopy = async (coupon) => {
        const code = coupon?.code || "";
        if (!code) return;
        try {
            if (
                Platform.OS === "web" &&
                globalThis?.navigator?.clipboard?.writeText
            ) {
                await globalThis.navigator.clipboard.writeText(code);
            } else {
                await Clipboard.setStringAsync(code);
            }
            setCopiedCouponCode(code);
            if (couponCopyResetRef.current) {
                clearTimeout(couponCopyResetRef.current);
            }
            couponCopyResetRef.current = setTimeout(() => {
                setCopiedCouponCode((current) =>
                    current === code ? "" : current,
                );
            }, 1600);
        } catch {}
    };

    const todayActivityCount = Math.max(
        Number(stats.todayFollowup || 0),
        Number(todayTasks.length || 0),
    );
    const missedActivityCount = Math.max(
        Number(stats.missedFollowup || 0),
        Number(missedTasks.length || 0),
    );

    const weekSeries = Array.isArray(stats.weekSales) ? stats.weekSales : [];
    const highlightIdx = weekSeries.length
        ? weekSeries.findIndex(
              (d) => String(d?.date || "") === String(rangeAnchor),
          )
        : -1;
    const chartHighlightIndex = highlightIdx >= 0 ? highlightIdx : null;
    const weekBarData = weekSeries.length
        ? weekSeries.map((d) => ({
              value: Number(d?.convertedCount || 0),
              label: fmtWeekday3(d?.date) || "",
          }))
        : [
              { value: 0, label: "Mon" },
              { value: 0, label: "Tue" },
              { value: 0, label: "Wed" },
              { value: 0, label: "Thu" },
              { value: 0, label: "Fri" },
              { value: 0, label: "Sat" },
              { value: 0, label: "Sun" },
          ];
    const salesBarData = weekSeries.length
        ? weekSeries.map((d) => ({
              value: Number(d?.convertedCount || 0),
              label: fmtWeekday3(d?.date) || "",
              color: C.emerald,
          }))
        : [
              { value: 0, label: "Mon", color: C.emerald },
              { value: 0, label: "Tue", color: C.emerald },
              { value: 0, label: "Wed", color: C.emerald },
              { value: 0, label: "Thu", color: C.emerald },
              { value: 0, label: "Fri", color: C.emerald },
              { value: 0, label: "Sat", color: C.emerald },
              { value: 0, label: "Sun", color: C.emerald },
          ];

    // -----------------------------------------------------------------------------
    // RENDER
    // -----------------------------------------------------------------------------
    return (
        <View
            style={{
                flex: 1,
                backgroundColor: C.bg,
                // paddingTop: insets.top + 10,
            }}
            {...swipeHandlers}>
            <StatusBar barStyle="dark-content" backgroundColor={C.surface} />
            <LogoutConfirmModal
                visible={showLogout}
                onClose={() => setShowLogout(false)}
                onConfirm={confirmLogout}
            />
            <AppSideMenu
                visible={showMenu}
                onClose={() => setShowMenu(false)}
                navigation={navigation}
                user={user}
                onLogout={handleLogout}
                activeRouteName="Home"
                resolveImageUrl={getImageUrl}
            />

            {/* TOP BAR */}
            <SafeAreaView edges={["top"]} style={S.topBar}>
                <View
                    style={[
                        S.topBarInner,
                        isTablet || isDesktop
                            ? { paddingHorizontal: hPad, paddingVertical: 14 }
                            : {},
                    ]}>
                    <TouchableOpacity
                        style={S.menuBtn}
                        onPress={() => setShowMenu(true)}
                        activeOpacity={0.85}>
                        <Ionicons name="menu" size={22} color={C.textSub} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
                        <Text
                            style={[
                                S.topGreet,
                                isTablet || isDesktop ? { fontSize: 12 } : {},
                            ]}>
                            {greeting}
                        </Text>
                        <Text
                            style={[
                                S.topName,
                                isTablet || isDesktop ? { fontSize: 22 } : {},
                            ]}
                            numberOfLines={1}>
                            {user?.name || "Manager"}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={S.filterBtn}
                        activeOpacity={0.85}
                        onPress={() => {
                            setDraftRangeType(rangeType);
                            setDraftRangeAnchor(rangeAnchor);
                            setFilterOpen(true);
                        }}>
                        <Ionicons
                            name="calendar-outline"
                            size={18}
                            color={C.textSub}
                        />
                        <Text style={S.filterBtnText} numberOfLines={1}>
                            {rangeType === "day"
                                ? "Day"
                                : rangeType === "week"
                                  ? "Week"
                                  : rangeType === "month"
                                    ? "Month"
                                    : "Year"}{" "}
                            • {rangeLabel}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={S.avatarBtn}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate("ProfileScreen")}>
                        <LinearGradient
                            colors={C.g.blue}
                            style={[
                                S.avatarGrad,
                                isTablet || isDesktop
                                    ? {
                                          width: 50,
                                          height: 50,
                                          borderRadius: 16,
                                      }
                                    : {},
                            ]}>
                            {user?.logo ? (
                                <Image
                                    source={{ uri: getImageUrl(user.logo) }}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: 14,
                                    }}
                                />
                            ) : (
                                <Text
                                    style={{
                                        color: "#fff",
                                        fontWeight: "900",
                                        fontSize: isTablet ? 18 : 16,
                                    }}>
                                    {user?.name?.[0]?.toUpperCase() ?? "M"}
                                </Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <Modal
                visible={filterOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setFilterOpen(false)}>
                <TouchableOpacity
                    style={S.filterOverlay}
                    activeOpacity={1}
                    onPress={() => setFilterOpen(false)}>
                    <TouchableOpacity
                        style={S.filterCard}
                        activeOpacity={1}
                        onPress={() => {}}>
                        <View style={S.filterHeaderRow}>
                            <Text style={S.filterTitle}>Date Filter</Text>
                            <TouchableOpacity
                                onPress={() => setFilterOpen(false)}
                                style={S.filterCloseBtn}
                                activeOpacity={0.85}>
                                <Ionicons
                                    name="close"
                                    size={18}
                                    color={C.textSub}
                                />
                            </TouchableOpacity>
                        </View>
                        <View style={S.rangeRow}>
                            {[
                                { k: "day", label: "Day" },
                                { k: "week", label: "Week" },
                                { k: "month", label: "Month" },
                                { k: "year", label: "Year" },
                            ].map((opt) => {
                                const active = draftRangeType === opt.k;
                                return (
                                    <TouchableOpacity
                                        key={opt.k}
                                        onPress={() => setDraftRangeType(opt.k)}
                                        style={[
                                            S.rangePill,
                                            active && S.rangePillActive,
                                        ]}
                                        activeOpacity={0.85}>
                                        <Text
                                            style={[
                                                S.rangePillText,
                                                active && S.rangePillTextActive,
                                            ]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={S.rangeMetaRow}>
                            {(() => {
                                const b = getRangeBounds(
                                    draftRangeType,
                                    draftRangeAnchor,
                                );
                                const title =
                                    draftRangeType === "day"
                                        ? fmtShortDate(draftRangeAnchor)
                                        : draftRangeType === "week"
                                          ? `${fmtShortDate(b.rangeFrom)} - ${fmtShortDate(b.rangeTo)}`
                                          : draftRangeType === "month"
                                            ? fmtMonthYear(draftRangeAnchor)
                                            : String(
                                                  (
                                                      isoToDate(
                                                          draftRangeAnchor,
                                                      ) || new Date()
                                                  ).getFullYear(),
                                              );
                                return (
                                    <Text style={S.rangeMetaText}>
                                        Selected: {title}
                                    </Text>
                                );
                            })()}
                        </View>
                        <Calendar
                            current={draftRangeAnchor}
                            markedDates={{
                                [draftRangeAnchor]: {
                                    selected: true,
                                    selectedColor: C.blue,
                                    selectedTextColor: "#fff",
                                },
                            }}
                            onDayPress={(d) =>
                                setDraftRangeAnchor(d.dateString)
                            }
                            firstDay={1}
                            enableSwipeMonths
                            style={S.calendar}
                            theme={{
                                backgroundColor: "#fff",
                                calendarBackground: "#fff",
                                textSectionTitleColor: C.textDim,
                                selectedDayBackgroundColor: C.blue,
                                selectedDayTextColor: "#FFFFFF",
                                todayTextColor: C.blue,
                                dayTextColor: C.ink,
                                textDisabledColor: C.textMuted,
                                monthTextColor: C.ink,
                                arrowColor: C.blue,
                                textDayFontWeight: "600",
                                textMonthFontWeight: "800",
                                textDayHeaderFontWeight: "700",
                            }}
                        />
                        <View style={S.filterActionsRow}>
                            <TouchableOpacity
                                style={S.filterGhostBtn}
                                onPress={() => setFilterOpen(false)}
                                activeOpacity={0.85}>
                                <Text style={S.filterGhostText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={S.filterApplyBtn}
                                onPress={() => {
                                    setFilterOpen(false);
                                    setRangeType(draftRangeType);
                                    setRangeAnchor(draftRangeAnchor);
                                }}
                                activeOpacity={0.9}>
                                <Text style={S.filterApplyText}>Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            {/* MAIN SCROLL */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            fetchData({ force: true, showLoading: false });
                        }}
                        tintColor={C.blue}
                        colors={[C.blue]}
                    />
                }>
                {/* HERO CARD */}
                <View
                    style={{
                        paddingHorizontal: hPad,
                        paddingTop: isTablet || isDesktop ? 22 : 18,
                    }}>
                    {/* COUPONS */}
                    {coupons.length > 0 && (
                        <MotiView
                            from={
                                skipAnim
                                    ? { opacity: 1 }
                                    : { opacity: 0, translateY: 12 }
                            }
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ delay: 140 }}
                            style={S.section}>
                            <SH
                                title="Active Coupons"
                                sub={`${coupons.length} offers available`}
                                titleSize={sectionTitleSize}
                                right={
                                    <View style={S.chip}>
                                        <Text style={S.chipText}>Offers</Text>
                                    </View>
                                }
                            />
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{
                                    gap: 12,
                                    paddingRight: 4,
                                }}>
                                {coupons.slice(0, 10).map((coupon, i) => (
                                    <MotiView
                                        key={coupon.id}
                                        from={{ opacity: 0, translateX: 14 }}
                                        animate={{ opacity: 1, translateX: 0 }}
                                        transition={{ delay: 160 + i * 60 }}>
                                        <View
                                            style={[
                                                S.couponCard,
                                                { width: couponCardWidth },
                                            ]}>
                                            <View
                                                style={{
                                                    position: "absolute",
                                                    left: 0,
                                                    top: 0,
                                                    bottom: 0,
                                                    width: 4,
                                                    backgroundColor: C.blue,
                                                    borderTopLeftRadius: 18,
                                                    borderBottomLeftRadius: 18,
                                                }}
                                            />
                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems: "flex-start",
                                                    marginBottom: 10,
                                                }}>
                                                <View>
                                                    <Text
                                                        style={[
                                                            S.couponCode,
                                                            isTablet ||
                                                            isDesktop
                                                                ? {
                                                                      fontSize: 22,
                                                                  }
                                                                : {},
                                                        ]}>
                                                        {coupon.code}
                                                    </Text>
                                                    <Text style={S.couponScope}>
                                                        {coupon.planScopeLabel}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity
                                                    style={[
                                                        S.couponCopyBtn,
                                                        copiedCouponCode ===
                                                            coupon.code && {
                                                            backgroundColor:
                                                                C.emerald,
                                                        },
                                                    ]}
                                                    onPress={() =>
                                                        handleCouponCopy(coupon)
                                                    }>
                                                    <Ionicons
                                                        name={
                                                            copiedCouponCode ===
                                                            coupon.code
                                                                ? "checkmark-outline"
                                                                : "copy-outline"
                                                        }
                                                        size={12}
                                                        color="#fff"
                                                    />
                                                    <Text
                                                        style={{
                                                            color: "#fff",
                                                            fontSize: 11,
                                                            fontWeight: "800",
                                                        }}>
                                                        {copiedCouponCode ===
                                                        coupon.code
                                                            ? "Copied"
                                                            : "Copy"}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View
                                                style={{
                                                    height: 1,
                                                    backgroundColor: C.divider,
                                                    marginBottom: 10,
                                                }}
                                            />
                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems: "center",
                                                }}>
                                                <View style={S.couponValueChip}>
                                                    <Text
                                                        style={{
                                                            fontSize: 13,
                                                            color: C.blue,
                                                            fontWeight: "900",
                                                        }}>
                                                        {getCouponValueLabel(
                                                            coupon,
                                                        )}
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={{
                                                        fontSize: 11,
                                                        color: C.textMuted,
                                                        fontWeight: "600",
                                                    }}>
                                                    Exp:{" "}
                                                    {coupon.expiryDate
                                                        ? new Date(
                                                              coupon.expiryDate,
                                                          ).toLocaleDateString()
                                                        : "-"}
                                                </Text>
                                            </View>
                                        </View>
                                    </MotiView>
                                ))}
                            </ScrollView>
                        </MotiView>
                    )}

                    <MotiView
                        from={
                            skipAnim
                                ? { opacity: 1 }
                                : { opacity: 0, translateX: 14 }
                        }
                        animate={{ opacity: 1, translateX: 0 }}
                        transition={{ delay: 440 }}
                        style={S.section}>
                        <SH
                            title="Follow-up Activity"
                            titleSize={sectionTitleSize}
                            sub={`For ${fmtShortDate(rangeAnchor)} and overdue`}
                        />
                        <View style={S.activityCard}>
                            <View style={S.countRow}>
                                <TouchableOpacity
                                    style={[
                                        S.countPill,
                                        { borderColor: C.violet + "55" },
                                    ]}
                                    activeOpacity={0.88}
                                    onPress={() =>
                                        navigation.navigate("FollowUp", {
                                            focusKey: `today-followup-count-${todayActivityCount}`,
                                            focusTab: "Today",
                                            focusDate: rangeAnchor,
                                        })
                                    }>
                                    <View
                                        style={[
                                            S.countIconWrap,
                                            {
                                                backgroundColor:
                                                    C.violet + "20",
                                            },
                                        ]}>
                                        <Ionicons
                                            name="calendar-clear-outline"
                                            size={15}
                                            color={C.violet}
                                        />
                                    </View>
                                    <Text
                                        style={[
                                            S.countValue,
                                            { color: C.violet },
                                        ]}>
                                        {todayActivityCount}
                                    </Text>
                                    <Text style={S.countLabel}>Follow-ups</Text>
                                    <Text style={S.countHint}>
                                        Due on selected day
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        S.countPill,
                                        { borderColor: C.rose + "55" },
                                    ]}
                                    activeOpacity={0.88}
                                    onPress={() =>
                                        navigation.navigate("FollowUp", {
                                            focusKey: `missed-followup-count-${missedActivityCount}`,
                                            focusTab: "Missed",
                                            openMissedModal: true,
                                            focusDate: rangeAnchor,
                                        })
                                    }>
                                    <View
                                        style={[
                                            S.countIconWrap,
                                            { backgroundColor: C.rose + "20" },
                                        ]}>
                                        <Ionicons
                                            name="alert-circle-outline"
                                            size={15}
                                            color={C.rose}
                                        />
                                    </View>
                                    <Text
                                        style={[
                                            S.countValue,
                                            { color: C.rose },
                                        ]}>
                                        {missedActivityCount}
                                    </Text>
                                    <Text style={S.countLabel}>Missed</Text>
                                    <Text style={S.countHint}>
                                        Before selected day
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </MotiView>
                    <SH
                        title="Revenue & Conversion"
                        sub={`Filtered: ${rangeType} • ${rangeLabel}`}
                        titleSize={sectionTitleSize}
                    />
                    <MotiView
                        from={
                            skipAnim
                                ? { opacity: 1, translateY: 0 }
                                : { opacity: 0, translateY: 22 }
                        }
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ type: "spring", damping: 14, delay: 60 }}>
                        <LinearGradient
                            colors={C.g.hero}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                                S.heroCard,
                                isTablet || isDesktop ? { padding: 28 } : {},
                            ]}>
                            <View
                                style={{
                                    position: "absolute",
                                    top: -50,
                                    right: -50,
                                    width: 190,
                                    height: 190,
                                    borderRadius: 95,
                                    backgroundColor: "rgba(255,255,255,0.07)",
                                }}
                            />
                            <View
                                style={{
                                    position: "absolute",
                                    bottom: -30,
                                    left: -30,
                                    width: 130,
                                    height: 130,
                                    borderRadius: 65,
                                    backgroundColor: "rgba(74,144,255,0.14)",
                                }}
                            />

                            {/* Revenue + Ring row */}
                            <View
                                style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                }}>
                                <View style={{ flex: 1 }}>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 7,
                                            marginBottom: 8,
                                        }}>
                                        <PulseDot color={C.teal} size={7} />
                                        <Text
                                            style={{
                                                fontSize: 10,
                                                color: "rgba(255,255,255,0.6)",
                                                fontWeight: "700",
                                                letterSpacing: 1,
                                                textTransform: "uppercase",
                                            }}>
                                            Revenue
                                        </Text>
                                    </View>
                                    <Text
                                        style={[
                                            S.heroRevValue,
                                            { fontSize: heroRevFontSize },
                                        ]}>
                                        {fmtInr(stats.overallSalesAmount || 0)}
                                    </Text>
                                    <View style={S.heroGrowthChip}>
                                        <MaterialCommunityIcons
                                            name={
                                                Number(
                                                    stats.prevRevenue || 0,
                                                ) === 0 &&
                                                Number(
                                                    stats.overallSalesAmount ||
                                                        0,
                                                ) > 0
                                                    ? "trending-up"
                                                    : stats.revenueChangePct ==
                                                        null
                                                      ? "trending-neutral"
                                                      : stats.revenueChangePct >=
                                                          0
                                                        ? "trending-up"
                                                        : "trending-down"
                                            }
                                            size={12}
                                            color="#fff"
                                        />
                                        <Text
                                            style={{
                                                fontSize: 11,
                                                color: "#fff",
                                                fontWeight: "700",
                                            }}>
                                            {revenueDeltaLabel} vs {prevLabel}
                                        </Text>
                                    </View>
                                </View>
                                <RingMeter
                                    pct={cr}
                                    size={isTablet || isDesktop ? 90 : 80}
                                />
                            </View>

                            {/* Week bar chart - only show on >= md */}
                            {!isSmallPhone && (
                                <View
                                    style={{ marginTop: 18, marginBottom: 2 }}>
                                    <Text
                                        style={{
                                            fontSize: 9,
                                            color: "rgba(255,255,255,0.45)",
                                            fontWeight: "700",
                                            letterSpacing: 1,
                                            textTransform: "uppercase",
                                            marginBottom: 6,
                                        }}>
                                        This Week Conversions
                                    </Text>
                                    <HeroBarChart
                                        data={weekBarData}
                                        h={isTablet || isDesktop ? 60 : 52}
                                        highlightIndex={chartHighlightIndex}
                                    />
                                </View>
                            )}

                            {/* 3-stat footer */}
                            <View
                                style={{
                                    height: 1,
                                    backgroundColor: "rgba(255,255,255,0.15)",
                                    marginVertical: isSmallPhone ? 12 : 16,
                                }}
                            />
                            <View
                                style={{
                                    flexDirection: "row",
                                    justifyContent: "space-around",
                                }}>
                                {[
                                    {
                                        label: "Revenue",
                                        val: fmtInr(stats.monthlyRevenue || 0),
                                    },
                                    { label: "Conversions", val: stats.conv },
                                    {
                                        label:
                                            rangeType === "day"
                                                ? `Leads (${fmtShortDate(rangeAnchor)})`
                                                : `Leads (${rangeType})`,
                                        val: stats.totalEnquiry,
                                    },
                                ].map((s, i) => (
                                    <View
                                        key={i}
                                        style={{ alignItems: "center" }}>
                                        <Text
                                            style={{
                                                fontSize:
                                                    isTablet || isDesktop
                                                        ? 18
                                                        : 16,
                                                color: "#fff",
                                                fontWeight: "900",
                                                letterSpacing: -0.3,
                                            }}>
                                            {s.val}
                                        </Text>
                                        <Text
                                            style={{
                                                fontSize: isSmallPhone ? 9 : 10,
                                                color: "rgba(255,255,255,0.55)",
                                                fontWeight: "600",
                                                marginTop: 3,
                                                textTransform: "uppercase",
                                                letterSpacing: 0.5,
                                            }}>
                                            {s.label}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </LinearGradient>
                    </MotiView>
                </View>

                {/* BODY */}
                <View style={[S.body, { paddingHorizontal: hPad }]}>
                    {/* KEY METRICS - responsive grid */}
                    <View style={S.section}>
                        <SH
                            title="Lead Overview"
                            sub="Lead status and conversion summary"
                            titleSize={sectionTitleSize}
                            right={<PulseDot color={C.emerald} size={7} />}
                        />
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                justifyContent: "space-between",
                                gap: tileGap,
                                marginTop: 12,
                            }}>
                            <MetricTile
                                icon="people"
                                label="Total Leads"
                                value={stats.totalEnquiry}
                                color={C.blue}
                                tileWidth={tileWidth}
                                onPress={() => navigation.navigate("Enquiry")}
                            />
                            <MetricTile
                                icon="flash"
                                label="New"
                                value={stats.new}
                                color={C.sky}
                                tileWidth={tileWidth}
                            />
                            <MetricTile
                                icon="checkmark-circle"
                                label="Sales"
                                value={stats.conv}
                                color={C.emerald}
                                tileWidth={tileWidth}
                                onPress={() => navigation.navigate("Report")}
                            />
                            <MetricTile
                                icon="close-circle"
                                label="Dropped"
                                value={stats.drops}
                                color={C.rose}
                                tileWidth={tileWidth}
                            />
                            {/* Extra tiles on tablet/desktop */}
                            {(isTablet || isDesktop) && (
                                <>
                                    <MetricTile
                                        icon="trending-up"
                                        label="In Progress"
                                        value={stats.ip}
                                        color={C.amber}
                                        tileWidth={tileWidth}
                                    />
                                    {isDesktop && (
                                        <>
                                            <MetricTile
                                                icon="cash"
                                                label="MTD Revenue"
                                                value={fmtInr(
                                                    stats.monthlyRevenue,
                                                )}
                                                color={C.teal}
                                                tileWidth={tileWidth}
                                            />
                                            <MetricTile
                                                icon="stats-chart"
                                                label="Conv. Rate"
                                                value={`${cr}%`}
                                                color={C.violet}
                                                tileWidth={tileWidth}
                                            />
                                        </>
                                    )}
                                </>
                            )}
                        </View>
                    </View>

                    {/* PIPELINE */}
                    <MotiView
                        from={
                            skipAnim
                                ? { opacity: 1 }
                                : { opacity: 0, translateY: 14 }
                        }
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ delay: 360 }}
                        style={S.section}>
                        <SH
                            title="Lead Pipeline"
                            sub={
                                rangeType === "day"
                                    ? "Today's lead distribution"
                                    : rangeType === "week"
                                      ? "This week's lead distribution"
                                      : rangeType === "month"
                                        ? "This month's lead distribution"
                                        : "This year's lead distribution"
                            }
                            titleSize={sectionTitleSize}
                        />
                        <View style={S.card}>
                            <View style={S.pipelineHeroRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={S.pipelineEyebrow}>
                                        Lead momentum
                                    </Text>
                                    <Text
                                        style={[
                                            S.pipelineTotalValue,
                                            isTablet || isDesktop
                                                ? { fontSize: 38 }
                                                : {},
                                        ]}>
                                        {stats.totalEnquiry}
                                    </Text>
                                    <Text style={S.pipelineTotalMeta}>
                                        Total leads in pipeline
                                    </Text>
                                </View>
                                <View style={S.pipelineLeaderCard}>
                                    <Text style={S.pipelineLeaderLabel}>
                                        Top stage
                                    </Text>
                                    <Text
                                        style={[
                                            S.pipelineLeaderValue,
                                            {
                                                color:
                                                    pipelineLeader?.color ||
                                                    C.blue,
                                            },
                                        ]}>
                                        {pipelineLeader?.label || "New"}
                                    </Text>
                                    <Text style={S.pipelineLeaderMeta}>
                                        {cr}% conversion rate
                                    </Text>
                                </View>
                            </View>

                            <View style={S.pipelineChartCard}>
                                <TradingStageChart
                                    data={pipelineStages.map((s) => ({
                                        label: s.label,
                                        shortLabel: s.shortLabel,
                                        value: s.value,
                                        color: s.color,
                                        hint: s.hint,
                                    }))}
                                    h={isTablet || isDesktop ? 180 : 150}
                                    chartWidth={Math.max(svgChartWidth, 280)}
                                />
                            </View>

                            {/* Legend - 2 cards per row */}
                            <View style={S.pipelineLegendGrid}>
                                {pipelineStages.map((stage) => {
                                    const pct =
                                        stats.totalEnquiry > 0
                                            ? Math.round(
                                                  (stage.value /
                                                      stats.totalEnquiry) *
                                                      100,
                                              )
                                            : 0;
                                    return (
                                        <View
                                            key={stage.label}
                                            style={S.pipelineLegendPill}>
                                            <View style={S.pipelineLegendHead}>
                                                <View
                                                    style={
                                                        S.pipelineLegendLabelRow
                                                    }>
                                                    <View
                                                        style={[
                                                            S.pipelineLegendDot,
                                                            {
                                                                backgroundColor:
                                                                    stage.color,
                                                            },
                                                        ]}
                                                    />
                                                    <Text
                                                        style={
                                                            S.pipelineLegendLabel
                                                        }>
                                                        {stage.label}
                                                    </Text>
                                                </View>
                                                <Text
                                                    style={[
                                                        S.pipelineLegendPct,
                                                        { color: stage.color },
                                                    ]}>
                                                    {pct}%
                                                </Text>
                                            </View>
                                            <Text
                                                style={[
                                                    S.pipelineLegendValue,
                                                    { color: stage.color },
                                                ]}>
                                                {stage.value}
                                            </Text>
                                            <View
                                                style={
                                                    S.pipelineLegendBarTrack
                                                }>
                                                <View
                                                    style={[
                                                        S.pipelineLegendBarFill,
                                                        {
                                                            backgroundColor:
                                                                stage.color,
                                                            width: `${pct}%`,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <Text style={S.pipelineLegendMeta}>
                                                {stage.hint}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    </MotiView>

                    {/* SALES CHART */}
                    <MotiView
                        from={
                            skipAnim
                                ? { opacity: 1 }
                                : { opacity: 0, translateY: 14 }
                        }
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ delay: 400 }}
                        style={S.section}>
                        <SH
                            title="Sales Performance"
                            sub="Weekly breakdown"
                            titleSize={sectionTitleSize}
                        />
                        <View style={S.card}>
                            <View
                                style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    marginBottom: 20,
                                }}>
                                <View>
                                    <Text
                                        style={{
                                            fontSize: 12,
                                            color: C.textDim,
                                            fontWeight: "600",
                                            textTransform: "uppercase",
                                            letterSpacing: 0.5,
                                            marginBottom: 4,
                                        }}>
                                        Revenue
                                    </Text>
                                    <Text
                                        style={{
                                            fontSize:
                                                isTablet || isDesktop ? 28 : 24,
                                            color: C.emerald,
                                            fontWeight: "900",
                                            letterSpacing: -0.5,
                                        }}>
                                        {fmtInr(stats.monthlyRevenue || 0)}
                                    </Text>
                                </View>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 5,
                                        backgroundColor: C.emerald + "14",
                                        paddingHorizontal: 10,
                                        paddingVertical: 7,
                                        borderRadius: 20,
                                    }}>
                                    <MaterialCommunityIcons
                                        name={
                                            Number(stats.prevRevenue || 0) ===
                                                0 &&
                                            Number(
                                                stats.overallSalesAmount || 0,
                                            ) > 0
                                                ? "trending-up"
                                                : stats.revenueChangePct == null
                                                  ? "trending-neutral"
                                                  : stats.revenueChangePct >= 0
                                                    ? "trending-up"
                                                    : "trending-down"
                                        }
                                        size={13}
                                        color={C.emerald}
                                    />
                                    <Text
                                        style={{
                                            fontSize: 12,
                                            color: C.emerald,
                                            fontWeight: "800",
                                        }}>
                                        {revenueDeltaLabel}
                                    </Text>
                                </View>
                            </View>
                            <LightBarChart
                                data={salesBarData}
                                h={isTablet || isDesktop ? 100 : 88}
                                highlightIndex={chartHighlightIndex}
                            />
                            <View
                                style={{
                                    flexDirection: "row",
                                    marginTop: 18,
                                    paddingTop: 16,
                                    borderTopWidth: 1,
                                    borderTopColor: C.divider,
                                }}>
                                {[
                                    {
                                        label: "Sales MTD",
                                        val: stats.salesMonthly,
                                        color: C.emerald,
                                    },
                                    {
                                        label: "Conv. Rate",
                                        val: `${cr}%`,
                                        color: C.blue,
                                    },
                                    {
                                        label: "Follow-ups",
                                        val: stats.todayFollowup,
                                        color: C.violet,
                                    },
                                ].map((s, i) => (
                                    <View
                                        key={i}
                                        style={{
                                            flex: 1,
                                            alignItems: "center",
                                            borderRightWidth: i < 2 ? 1 : 0,
                                            borderRightColor: C.divider,
                                        }}>
                                        <Text
                                            style={{
                                                fontSize:
                                                    isTablet || isDesktop
                                                        ? 22
                                                        : 18,
                                                fontWeight: "900",
                                                color: s.color,
                                                letterSpacing: -0.3,
                                            }}>
                                            {s.val}
                                        </Text>
                                        <Text
                                            style={{
                                                fontSize: 10,
                                                color: C.textMuted,
                                                fontWeight: "600",
                                                marginTop: 4,
                                                textAlign: "center",
                                            }}>
                                            {s.label}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </MotiView>

                    {/* WHATSAPP INTEGRATION */}
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// -----------------------------------------------------------------------------
// STYLES
// -----------------------------------------------------------------------------
const S = StyleSheet.create({
    topBar: {
        backgroundColor: C.surface,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 4,
        zIndex: 10,
    },
    topBarInner: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingVertical: 12,
    },
    topGreet: {
        fontSize: 11,
        color: C.textDim,
        fontWeight: "600",
        letterSpacing: 0.5,
        textTransform: "uppercase",
    },
    topName: {
        fontSize: 19,
        color: C.ink,
        fontWeight: "800",
        letterSpacing: -0.4,
        marginTop: 1,
    },
    avatarBtn: {
        shadowColor: C.blue,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
        elevation: 4,
    },
    filterBtn: {
        maxWidth: 170,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        height: 44,
        borderRadius: 14,
        backgroundColor: C.bg,
        borderWidth: 1.5,
        borderColor: C.border,
        marginRight: 10,
    },
    notifBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: C.bg,
        borderWidth: 1.5,
        borderColor: C.border,
        marginRight: 10,
    },
    notifLangPill: {
        position: "absolute",
        right: 5,
        bottom: 5,
        paddingHorizontal: 5,
        height: 16,
        borderRadius: 8,
        backgroundColor: C.blue,
        alignItems: "center",
        justifyContent: "center",
    },
    notifLangText: { fontSize: 9, fontWeight: "900", color: "#fff" },
    filterBtnText: {
        fontSize: 11,
        color: C.textSub,
        fontWeight: "800",
    },
    menuBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: C.bg,
        borderWidth: 1.5,
        borderColor: C.border,
    },
    avatarGrad: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.9)",
    },
    langModalBg: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
    },
    langModalCard: {
        width: "100%",
        maxWidth: 420,
        backgroundColor: C.surface,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: C.border,
    },
    langModalTitle: { fontSize: 16, fontWeight: "900", color: C.ink },
    langModalSub: {
        marginTop: 6,
        fontSize: 12,
        color: C.textDim,
        fontWeight: "600",
    },
    langRow: { flexDirection: "row", gap: 10, marginTop: 14 },
    langChip: {
        flex: 1,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
    },
    langChipActive: { backgroundColor: C.blue, borderColor: C.blue },
    langChipText: { fontSize: 13, fontWeight: "900", color: C.textSub },
    langChipTextActive: { color: "#fff" },
    langClose: {
        marginTop: 14,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: C.border,
    },
    langCloseText: { fontSize: 13, fontWeight: "900", color: C.textSub },
    filterOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "center",
        paddingHorizontal: 18,
    },
    filterCard: {
        backgroundColor: C.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
    },
    filterHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    filterTitle: {
        fontSize: 15,
        fontWeight: "900",
        color: C.ink,
    },
    filterCloseBtn: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
    },
    rangeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    rangePill: {
        flex: 1,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.bg,
    },
    rangePillActive: { backgroundColor: C.blue, borderColor: C.blue },
    rangePillText: { fontSize: 12, fontWeight: "800", color: C.textSub },
    rangePillTextActive: { color: "#fff" },
    rangeMetaRow: { marginBottom: 10 },
    rangeMetaText: { fontSize: 12, color: C.textDim, fontWeight: "700" },
    calendar: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
    },
    filterActionsRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 12,
    },
    filterGhostBtn: {
        flex: 1,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
    },
    filterGhostText: { fontSize: 13, fontWeight: "800", color: C.textSub },
    filterApplyBtn: {
        flex: 1,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.blue,
    },
    filterApplyText: { fontSize: 13, fontWeight: "900", color: "#fff" },
    heroCard: {
        borderRadius: 24,
        padding: 22,
        marginBottom: 4,
        overflow: "hidden",
        shadowColor: C.blue,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 22,
        elevation: 10,
    },
    heroRevValue: {
        fontSize: 36,
        color: "#fff",
        fontWeight: "900",
        letterSpacing: -1.2,
    },
    heroGrowthChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginTop: 8,
        backgroundColor: "rgba(255,255,255,0.15)",
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    body: { paddingTop: 22 },
    section: { marginBottom: 26 },
    chip: {
        backgroundColor: C.blueLight,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    chipText: { fontSize: 12, color: C.blue, fontWeight: "700" },
    card: {
        backgroundColor: "#F9FBFF",
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 18,
        elevation: 4,
    },
    pipelineHeroRow: {
        flexDirection: "row",
        alignItems: "stretch",
        gap: 12,
        marginBottom: 18,
    },
    pipelineEyebrow: {
        fontSize: 11,
        color: C.textDim,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    pipelineTotalValue: {
        fontSize: 34,
        color: C.ink,
        fontWeight: "900",
        letterSpacing: -1,
    },
    pipelineTotalMeta: {
        fontSize: 13,
        color: C.textDim,
        fontWeight: "600",
        marginTop: 4,
    },
    pipelineLeaderCard: {
        minWidth: 116,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 13,
        backgroundColor: "#F2F7FF",
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "space-between",
    },
    pipelineLeaderLabel: {
        fontSize: 11,
        color: C.textMuted,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    pipelineLeaderValue: {
        fontSize: 22,
        fontWeight: "900",
        letterSpacing: -0.4,
        marginTop: 8,
    },
    pipelineLeaderMeta: {
        fontSize: 12,
        color: C.textDim,
        fontWeight: "600",
        marginTop: 4,
    },
    pipelineChartCard: {
        backgroundColor: "#F3F8FF",
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingTop: 14,
        paddingBottom: 12,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 14,
    },
    pipelineLegendGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 8,
    },
    pipelineLegendPill: {
        minHeight: 102,
        width: "48%",
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: "#F9FBFF",
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "space-between",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
        elevation: 3,
    },
    pipelineLegendHead: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    pipelineLegendLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },
    pipelineLegendDot: { width: 10, height: 10, borderRadius: 5 },
    pipelineLegendLabel: { fontSize: 13, color: C.ink, fontWeight: "800" },
    pipelineLegendPct: {
        fontSize: 11,
        fontWeight: "900",
    },
    pipelineLegendValue: {
        fontSize: 24,
        fontWeight: "900",
        letterSpacing: -0.4,
        marginTop: 10,
    },
    pipelineLegendBarTrack: {
        height: 7,
        borderRadius: 999,
        backgroundColor: C.divider,
        overflow: "hidden",
        marginTop: 8,
    },
    pipelineLegendBarFill: {
        height: "100%",
        borderRadius: 999,
    },
    pipelineLegendMeta: {
        fontSize: 11,
        color: C.textDim,
        fontWeight: "600",
        marginTop: 8,
    },
    tile: {
        backgroundColor: "#F9FBFF",
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
        elevation: 3,
    },
    metricTileRedesign: {
        minHeight: 122,
        justifyContent: "space-between",
        overflow: "hidden",
        position: "relative",
    },
    metricGlow: {
        position: "absolute",
        width: 88,
        height: 88,
        borderRadius: 44,
        top: -26,
        right: -20,
    },
    metricTileTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    tileIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    metricTileIcon: {
        width: 42,
        height: 42,
        borderRadius: 12,
    },
    metricAccent: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    tileValue: {
        fontSize: 24,
        color: C.ink,
        fontWeight: "900",
        letterSpacing: -0.9,
    },
    metricLabelBand: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginHorizontal: -16,
        marginBottom: -16,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: C.border,
    },
    tileLabel: {
        flex: 1,
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 0.2,
        textTransform: "uppercase",
    },
    metricFooter: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingTop: 10,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: C.divider,
    },
    metricFooterDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    metricFooterText: {
        fontSize: 11,
        color: C.textMuted,
        fontWeight: "700",
    },
    actionPill: { alignItems: "center", gap: 8 },
    actionPillGrad: {
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 8,
        elevation: 4,
    },
    actionPillLabel: {
        fontSize: 11,
        color: C.textDim,
        fontWeight: "700",
        textAlign: "center",
    },
    couponCard: {
        backgroundColor: "#FAFCFF",
        borderRadius: 18,
        padding: 16,
        paddingLeft: 20,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
        elevation: 3,
    },
    couponCode: {
        fontSize: 20,
        color: C.ink,
        fontWeight: "900",
        letterSpacing: 0.5,
    },
    couponScope: {
        fontSize: 11,
        color: C.textDim,
        fontWeight: "600",
        marginTop: 3,
    },
    couponCopyBtn: {
        backgroundColor: C.blue,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    couponValueChip: {
        backgroundColor: C.blueLight,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    activityCard: {
        backgroundColor: "#F9FBFF",
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 18,
        elevation: 4,
    },
    countRow: {
        flexDirection: "row",
        gap: 12,
        padding: 14,
    },
    countPill: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        backgroundColor: C.surface,
        gap: 2,
    },
    countIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 2,
    },
    countValue: {
        fontSize: 22,
        fontWeight: "900",
        letterSpacing: -0.3,
    },
    countLabel: {
        fontSize: 10,
        color: C.textMuted,
        fontWeight: "600",
        marginTop: 4,
        textAlign: "center",
    },
    countHint: {
        fontSize: 10,
        color: C.textLight,
        fontWeight: "600",
    },
    priorityRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 16,
    },
    priorityRowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
    },
    priorityBadge: {
        minWidth: 66,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    priorityBadgeText: {
        fontSize: 11,
        fontWeight: "900",
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    priorityName: {
        fontSize: 14,
        color: C.ink,
        fontWeight: "800",
    },
    priorityMeta: {
        fontSize: 12,
        color: C.textDim,
        marginTop: 3,
    },
    priorityEmpty: {
        padding: 28,
        alignItems: "center",
    },
    priorityEmptyTitle: {
        fontSize: 15,
        color: C.textSub,
        fontWeight: "800",
        marginTop: 10,
    },
    priorityEmptySub: {
        fontSize: 12,
        color: C.textMuted,
        marginTop: 4,
        textAlign: "center",
    },
    actRow: { flexDirection: "row", alignItems: "center", padding: 14 },
    actIcon: {
        width: 40,
        height: 40,
        borderRadius: 13,
        justifyContent: "center",
        alignItems: "center",
    },
    actArrow: {
        width: 30,
        height: 30,
        borderRadius: 9,
        justifyContent: "center",
        alignItems: "center",
    },
    logoutCard: {
        backgroundColor: C.surface,
        borderRadius: 28,
        padding: 28,
        width: "100%",
        maxWidth: 340,
        alignItems: "center",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.1,
        shadowRadius: 32,
        elevation: 12,
    },
    logoutIconBox: {
        width: 68,
        height: 68,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 18,
    },
});
