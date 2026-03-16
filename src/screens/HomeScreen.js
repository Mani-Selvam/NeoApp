import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import Svg, {
    Circle,
    Defs,
    Line,
    LinearGradient as SvgLinearGradient,
    Path,
    Rect,
    Stop,
    Text as SvgText,
} from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import getApiClient from "../services/apiClient";
import { getImageUrl } from "../services/apiConfig";
import * as dashboardService from "../services/dashboardService";
import { getBillingCoupons } from "../services/userService";

// ─────────────────────────────────────────────────────────────
// RESPONSIVE BREAKPOINTS
// ─────────────────────────────────────────────────────────────
// sm  = phone small   < 375px
// md  = phone large  375–767px
// lg  = tablet       768–1023px
// xl  = desktop     ≥ 1024px

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

const WA_PROVIDERS = {
    WATI: "WATI",
    META: "META",
    NEO: "NEO",
    TWILIO: "TWILIO",
};

const createWaForm = (config = {}) => ({
    provider: config.provider || WA_PROVIDERS.WATI,
    defaultCountry: config.defaultCountry || "91",
    watiBaseUrl: config.watiBaseUrl || config.apiUrl || "",
    watiApiToken: "",
    metaWhatsappToken: "",
    metaPhoneNumberId: config.metaPhoneNumberId || "",
    neoAccountName: config.neoAccountName || "",
    neoApiKey: "",
    neoPhoneNumber: config.neoPhoneNumber || "",
    neoBearerToken: "",
    twilioAccountSid: config.twilioAccountSid || "",
    twilioAuthToken: "",
    twilioWhatsappNumber: config.twilioWhatsappNumber || "",
});

// ─────────────────────────────────────────────────────────────
// DESIGN SYSTEM
// ─────────────────────────────────────────────────────────────
const C = {
    bg: "#EFF2F9",
    surface: "#FFFFFF",
    cardSoft: "#F7F9FD",
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

// ─────────────────────────────────────────────────────────────
// ANIMATED BAR CHART (Hero — white bars)
// ─────────────────────────────────────────────────────────────
const HeroBarChart = ({ data = [], h = 52 }) => {
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
                const isLast = i === data.length - 1;
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
                            {isLast && d.value > 0 && (
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
                                    backgroundColor: isLast
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

// ─────────────────────────────────────────────────────────────
// LIGHT BAR CHART (Sales — colored bars)
// ─────────────────────────────────────────────────────────────
const LightBarChart = ({ data = [], h = 84 }) => {
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
                const isLast = i === data.length - 1;
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
                            {isLast && d.value > 0 && (
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
                                    backgroundColor: isLast
                                        ? color
                                        : color + "4A",
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

// ─────────────────────────────────────────────────────────────
// TRADING STAGE CHART (SVG line chart)
// ─────────────────────────────────────────────────────────────
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
        const plottedHeight = Math.max(10, ratio * innerHeight);
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

// ─────────────────────────────────────────────────────────────
// PIPELINE ANIMATED BAR
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────────────────────────────
const Sparkline = ({ data = [], color = C.blue, w = 54, h = 24 }) => {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = max - min || 1;
    return (
        <View
            style={{
                width: w,
                height: h,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 2,
            }}>
            {data.map((v, i) => {
                const bh = Math.max(2, ((v - min) / range) * (h - 3) + 3);
                return (
                    <MotiView
                        key={i}
                        from={{ height: 0 }}
                        animate={{ height: bh }}
                        transition={{
                            type: "timing",
                            duration: 450,
                            delay: 200 + i * 35,
                        }}
                        style={{
                            flex: 1,
                            borderRadius: 2,
                            backgroundColor:
                                i === data.length - 1 ? color : color + "55",
                        }}
                    />
                );
            })}
        </View>
    );
};

// ─────────────────────────────────────────────────────────────
// PULSE DOT
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// RING METER
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// METRIC TILE  (responsive-aware)
// ─────────────────────────────────────────────────────────────
const MetricTile = ({
    icon,
    label,
    value,
    color,
    trend = [],
    delay = 0,
    onPress,
    tileWidth,
}) => (
    <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "spring", damping: 16, delay }}
        style={[S.tile, tileWidth ? { width: tileWidth } : {}]}>
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.85}
            style={{ flex: 1 }}>
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                }}>
                <View style={[S.tileIcon, { backgroundColor: color + "16" }]}>
                    <Ionicons name={icon} size={18} color={color} />
                </View>
                {trend.length > 1 && (
                    <Sparkline data={trend} color={color} w={52} h={22} />
                )}
            </View>
            <Text style={S.tileValue}>{value}</Text>
            <Text style={S.tileLabel}>{label}</Text>
        </TouchableOpacity>
    </MotiView>
);

// ─────────────────────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// ACTION PILL
// ─────────────────────────────────────────────────────────────
const ActionPill = ({ icon, label, colors: gc, onPress, pillSize = 58 }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={[S.actionPill, { width: pillSize + 10 }]}>
        <LinearGradient
            colors={gc}
            style={[
                S.actionPillGrad,
                {
                    width: pillSize,
                    height: pillSize,
                    borderRadius: pillSize * 0.31,
                },
            ]}>
            <Ionicons name={icon} size={pillSize * 0.38} color="#fff" />
        </LinearGradient>
        <Text style={S.actionPillLabel}>{label}</Text>
    </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────
// ACTIVITY ROW
// ─────────────────────────────────────────────────────────────
const ActivityRow = ({ item, delay, isLast }) => {
    const typeMap = {
        "Phone Call": ["call", C.emerald],
        WhatsApp: ["logo-whatsapp", "#25D366"],
        Email: ["mail", C.sky],
        Meeting: ["people", C.violet],
    };
    const [icon, color] = typeMap[item.type] ?? ["chatbubble-ellipses", C.blue];
    return (
        <MotiView
            from={{ opacity: 0, translateX: -10 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ delay }}>
            <View
                style={[
                    S.actRow,
                    !isLast && {
                        borderBottomWidth: 1,
                        borderBottomColor: C.divider,
                    },
                ]}>
                <View style={[S.actIcon, { backgroundColor: color + "14" }]}>
                    <Ionicons name={icon} size={16} color={color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                        style={{
                            fontSize: 14,
                            color: C.ink,
                            fontWeight: "700",
                        }}>
                        {item.name}
                    </Text>
                    <Text
                        style={{
                            fontSize: 12,
                            color: C.textDim,
                            marginTop: 2,
                        }}>
                        {item.type || "Follow-up"} · {item.time || "Today"}
                    </Text>
                </View>
                <View style={[S.actArrow, { backgroundColor: C.blueLight }]}>
                    <Ionicons name="chevron-forward" size={13} color={C.blue} />
                </View>
            </View>
        </MotiView>
    );
};

// ─────────────────────────────────────────────────────────────
// OTP OPTION
// ─────────────────────────────────────────────────────────────
const OtpOption = ({ icon, label, sub, color, onPress, loading }) => (
    <TouchableOpacity
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.8}
        style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 16,
            borderRadius: 16,
            backgroundColor: C.bg,
            borderWidth: 1.5,
            borderColor: C.border,
            marginBottom: 10,
        }}>
        <View
            style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                backgroundColor: color + "15",
                justifyContent: "center",
                alignItems: "center",
            }}>
            <Ionicons name={icon} size={22} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={{ fontSize: 15, color: C.ink, fontWeight: "800" }}>
                {label}
            </Text>
            <Text
                style={{
                    fontSize: 12,
                    color: C.textDim,
                    fontWeight: "500",
                    marginTop: 2,
                }}>
                {sub}
            </Text>
        </View>
        {loading ? (
            <ActivityIndicator size="small" color={color} />
        ) : (
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
        )}
    </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────
// SIDE MENU ITEM
// ─────────────────────────────────────────────────────────────
const MenuItem = ({ icon, label, onPress, color = C.textSub, active }) => (
    <TouchableOpacity
        style={[M.menuItem, active && { backgroundColor: C.blueLight }]}
        onPress={onPress}
        activeOpacity={0.75}>
        <View
            style={[
                M.menuIconBox,
                active && { backgroundColor: C.blue + "18" },
            ]}>
            <Ionicons name={icon} size={19} color={active ? C.blue : color} />
        </View>
        <Text
            style={[
                M.menuLabel,
                { color: active ? C.blue : color },
                active && { fontWeight: "700" },
            ]}>
            {label}
        </Text>
        {active && (
            <View
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: C.blue,
                }}
            />
        )}
    </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────
// SIDE MENU  (responsive width)
// ─────────────────────────────────────────────────────────────
const SideMenu = ({ visible, onClose, navigation, user, onLogout }) => {
    const { w, isTablet, isDesktop } = useResponsive();
    const panelWidth = isDesktop ? 360 : isTablet ? 340 : w * 0.78;
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            Animated.timing(progress, {
                toValue: 1,
                duration: 260,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        } else if (mounted) {
            Animated.timing(progress, {
                toValue: 0,
                duration: 200,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished) setMounted(false);
            });
        }
    }, [visible, mounted, progress]);

    const overlayOpacity = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });
    const panelTranslateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-panelWidth, 0],
    });
    const panelScale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.98, 1],
    });

    if (!mounted) return null;

    return (
        <Modal
            animationType="none"
            transparent
            visible={mounted}
            onRequestClose={onClose}>
            <View style={{ flex: 1 }}>
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        M.overlay,
                        { opacity: overlayOpacity },
                    ]}
                />

                <TouchableOpacity
                    style={{ flex: 1 }}
                    activeOpacity={1}
                    onPress={onClose}>
                    <Animated.View
                        style={[
                            M.panel,
                            {
                                width: panelWidth,
                                transform: [
                                    { translateX: panelTranslateX },
                                    { scale: panelScale },
                                ],
                            },
                        ]}>
                        <TouchableOpacity
                            activeOpacity={1}
                            style={{ flex: 1 }}
                            onPress={(e) => e.stopPropagation()}>
                            <LinearGradient
                                colors={["#0F3091", "#1A6BFF"]}
                                style={M.menuHeader}>
                                <View
                                    style={{
                                        position: "absolute",
                                        top: -30,
                                        right: -30,
                                        width: 130,
                                        height: 130,
                                        borderRadius: 65,
                                        backgroundColor:
                                            "rgba(255,255,255,0.07)",
                                    }}
                                />
                                <View style={M.avatarWrap}>
                                    {user?.logo ? (
                                        <Image
                                            source={{
                                                uri: getImageUrl(user.logo),
                                            }}
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                                borderRadius: 24,
                                            }}
                                        />
                                    ) : (
                                        <Text
                                            style={{
                                                fontSize: 28,
                                                color: "#fff",
                                                fontWeight: "900",
                                            }}>
                                            {user?.name?.[0]?.toUpperCase() ??
                                                "M"}
                                        </Text>
                                    )}
                                </View>
                                <Text
                                    style={{
                                        color: "#fff",
                                        fontSize: 17,
                                        fontWeight: "800",
                                        marginTop: 2,
                                    }}>
                                    {user?.name || "Manager"}
                                </Text>
                                <View
                                    style={{
                                        marginTop: 6,
                                        backgroundColor:
                                            "rgba(255,255,255,0.18)",
                                        paddingHorizontal: 12,
                                        paddingVertical: 4,
                                        borderRadius: 20,
                                    }}>
                                    <Text
                                        style={{
                                            color: "rgba(255,255,255,0.9)",
                                            fontSize: 11,
                                            fontWeight: "600",
                                        }}>
                                        {user?.email || "admin@crm.com"}
                                    </Text>
                                </View>
                            </LinearGradient>

                            <ScrollView
                                style={M.list}
                                showsVerticalScrollIndicator={false}>
                                <MotiView
                                    from={{ opacity: 0, translateY: 10 }}
                                    animate={{ opacity: 1, translateY: 0 }}
                                    transition={{
                                        delay: 120,
                                        type: "timing",
                                        duration: 260,
                                    }}
                                    style={M.upgradeCard}>
                                    <LinearGradient
                                        colors={["#0B1220", "#163B9A"]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={M.upgradeCardInner}>
                                        <View style={M.upgradeHeaderRow}>
                                            <Text style={M.upgradeTitle}>
                                                Upgrade to Pro
                                            </Text>
                                            <Text style={M.upgradeBadge}>
                                                PRO
                                            </Text>
                                        </View>
                                        <Text style={M.upgradeSub}>
                                            Unlock:
                                        </Text>
                                        {[
                                            "Unlimited Leads",
                                            "Advanced Reports",
                                            "Team Access",
                                        ].map((t) => (
                                            <View
                                                key={t}
                                                style={M.upgradeBulletRow}>
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={16}
                                                    color="#A7F3D0"
                                                />
                                                <Text
                                                    style={M.upgradeBulletText}>
                                                    {t}
                                                </Text>
                                            </View>
                                        ))}
                                        <TouchableOpacity
                                            activeOpacity={0.9}
                                            onPress={() => {
                                                onClose();
                                                setTimeout(() => {
                                                    navigation.navigate(
                                                        "PricingScreen",
                                                    );
                                                }, 220);
                                            }}>
                                            <LinearGradient
                                                colors={["#1A6BFF", "#7B61FF"]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={M.upgradeBtn}>
                                                <Text style={M.upgradeBtnText}>
                                                    Upgrade Now
                                                </Text>
                                                <Ionicons
                                                    name="arrow-forward"
                                                    size={16}
                                                    color="#fff"
                                                />
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </LinearGradient>
                                </MotiView>

                                <MenuItem
                                    active
                                    icon="home-outline"
                                    label="Dashboard"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("Home");
                                    }}
                                />
                                <MenuItem
                                    icon="help-circle-outline"
                                    label="Help & Support"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("SupportHelp");
                                    }}
                                />
                                <MenuItem
                                    icon="people-outline"
                                    label="Enquiries"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("Enquiry");
                                    }}
                                />
                                <MenuItem
                                    icon="repeat-outline"
                                    label="Auto Call"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("AutoCallScreen");
                                    }}
                                />
                                <MenuItem
                                    icon="call-outline"
                                    label="Follow-ups"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("FollowUp");
                                    }}
                                />
                                <MenuItem
                                    icon="mail-outline"
                                    label="Email"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("EmailScreen");
                                    }}
                                />
                                <MenuItem
                                    icon="list-outline"
                                    label="Call Logs"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("CallLog");
                                    }}
                                />
                                {user?.role !== "Staff" && (
                                    <MenuItem
                                        icon="link-outline"
                                        label="Lead Sources"
                                        onPress={() => {
                                            onClose();
                                            navigation.navigate(
                                                "LeadSourceScreen",
                                            );
                                        }}
                                    />
                                )}
                                {user?.role !== "Staff" && (
                                    <MenuItem
                                        icon="pricetags-outline"
                                        label="Products"
                                        onPress={() => {
                                            onClose();
                                            navigation.navigate(
                                                "ProductScreen",
                                            );
                                        }}
                                    />
                                )}
                                {user?.role !== "Staff" && (
                                    <MenuItem
                                        icon="people-circle-outline"
                                        label="Staff"
                                        onPress={() => {
                                            onClose();
                                            navigation.navigate("StaffScreen");
                                        }}
                                    />
                                )}
                                {user?.role !== "Staff" && (
                                    <MenuItem
                                        icon="flag-outline"
                                        label="Targets"
                                        onPress={() => {
                                            onClose();
                                            navigation.navigate(
                                                "TargetsScreen",
                                            );
                                        }}
                                    />
                                )}
                                <MenuItem
                                    icon="bar-chart-outline"
                                    label="Reports"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("Report");
                                    }}
                                />
                                <MenuItem
                                    icon="card-outline"
                                    label="Pricing"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("PricingScreen");
                                    }}
                                />
                                <MenuItem
                                    icon="chatbubble-ellipses-outline"
                                    label="Templates"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate(
                                            "MessageTemplateScreen",
                                        );
                                    }}
                                />
                                <MenuItem
                                    icon="settings-outline"
                                    label="WhatsApp Settings"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate("WhatsAppSettings");
                                    }}
                                />
                                <MenuItem
                                    icon="mail-open-outline"
                                    label="Email Settings"
                                    onPress={() => {
                                        onClose();
                                        navigation.navigate(
                                            "EmailSettingsScreen",
                                        );
                                    }}
                                />
                                <View
                                    style={{
                                        height: 1,
                                        backgroundColor: C.border,
                                        marginVertical: 8,
                                        marginHorizontal: 10,
                                    }}
                                />
                                <MenuItem
                                    icon="log-out-outline"
                                    label="Logout"
                                    color={C.rose}
                                    onPress={onLogout}
                                />
                                <View
                                    style={{
                                        alignItems: "center",
                                        paddingTop: 20,
                                        paddingBottom: 28,
                                        borderTopWidth: 1,
                                        borderTopColor: C.border,
                                        marginTop: 10,
                                    }}>
                                    <Image
                                        source={require("../assets/logo.png")}
                                        style={{
                                            width: 110,
                                            height: 34,
                                            marginBottom: 8,
                                        }}
                                        resizeMode="contain"
                                    />
                                    <Text
                                        style={{
                                            fontSize: 14,
                                            color: C.textSub,
                                            fontWeight: "700",
                                        }}>
                                        Neophorn Technologies
                                    </Text>
                                    <Text
                                        style={{
                                            fontSize: 11,
                                            color: C.textMuted,
                                            marginTop: 2,
                                        }}>
                                        CRM System · v1.0.0
                                    </Text>
                                </View>
                            </ScrollView>
                        </TouchableOpacity>
                    </Animated.View>
                </TouchableOpacity>
            </View>
        </Modal>
    );
};

// ─────────────────────────────────────────────────────────────
// LOGOUT MODAL
// ─────────────────────────────────────────────────────────────
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
                    You'll need to log back in to access your CRM data.
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

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmtInr = (n) => {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
    return `₹${n}`;
};
const makeTrend = (peak) => {
    const b = Math.max(1, peak);
    return [0.28, 0.44, 0.6, 0.5, 0.74, 0.88, 1].map((f) => Math.round(b * f));
};

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const swipeHandlers = useSwipeNavigation("Home", navigation);

    // Responsive values
    const { bp, w, isTablet, isDesktop, isPhone, isSmallPhone } =
        useResponsive();
    const hp = w - (isDesktop ? 48 : isTablet ? 36 : 36); // content width
    const hPad = isDesktop ? 24 : isTablet ? 18 : 18; // horizontal padding

    // Tile grid: 2 on phones, 3 on tablets, 4 on desktop
    const tileColumns = isDesktop ? 4 : isTablet ? 3 : 2;
    const tileGap = 12;
    const tileWidth = (hp - tileGap * (tileColumns - 1)) / tileColumns;

    // Legend pills: always 2 cards per row (all devices)

    // Coupon card width
    const couponCardWidth = isDesktop ? 320 : isTablet ? 280 : w - 60;

    // Action pill size
    const pillSize = isTablet || isDesktop ? 64 : isSmallPhone ? 50 : 58;

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
    const [stats, setStats] = useState({
        totalEnquiry: 0,
        todayEnquiry: 0,
        todayFollowup: 0,
        salesMonthly: 0,
        monthlyRevenue: 0,
        overallSalesAmount: 0,
        drops: 0,
        new: 0,
        ip: 0,
        conv: 0,
    });
    const [coupons, setCoupons] = useState([]);
    const [todayTasks, setTodayTasks] = useState([]);
    const [showMenu, setShowMenu] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    const [skipAnim, setSkipAnim] = useState(false);

    const [waConfig, setWaConfig] = useState(null);
    const [waEditStep, setWaEditStep] = useState(1);
    const [otpMethod, setOtpMethod] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [waForm, setWaForm] = useState(createWaForm());
    const [sendingOtp, setSendingOtp] = useState(false);
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [savingWa, setSavingWa] = useState(false);
    const [showWaModal, setShowWaModal] = useState(false);

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

    const handleLogout = () => {
        setShowMenu(false);
        setShowLogout(true);
    };
    const confirmLogout = async () => {
        setShowLogout(false);
        await logout();
    };

    const fetchData = async () => {
        try {
            if (stats.totalEnquiry === 0) setLoading(true);
            const [data, waData, couponData] = await Promise.all([
                dashboardService.getDashboardSummary(),
                getApiClient().then((c) =>
                    c.get("/whatsapp/config").catch(() => ({ data: null })),
                ),
                getBillingCoupons().catch(() => ({ coupons: [] })),
            ]);
            if (waData?.data?.config) {
                setWaConfig(waData.data.config);
                setWaForm(createWaForm(waData.data.config));
            }
            if (data) {
                setStats({
                    totalEnquiry: data.totalEnquiry || 0,
                    todayEnquiry: data.todayEnquiry || 0,
                    todayFollowup: data.todayFollowUps || 0,
                    salesMonthly: data.salesMonthly || 0,
                    monthlyRevenue: data.monthlyRevenue || 0,
                    overallSalesAmount: data.overallSalesAmount || 0,
                    drops: data.counts?.dropped || 0,
                    new: data.counts?.new || 0,
                    ip: data.counts?.inProgress || 0,
                    conv: data.counts?.converted || 0,
                });
                setTodayTasks(data.todayList || []);
            }
            setCoupons(couponData?.coupons || []);
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
                String(message).toLowerCase().includes("company is suspended")
            )
                return;
            console.error("HomeScreen fetchData error:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

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
            fetchData();
        }, []),
    );

    if (loading && !refreshing) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: C.bg,
                    justifyContent: "center",
                    alignItems: "center",
                }}>
                <ActivityIndicator size="large" color={C.blue} />
                <Text
                    style={{
                        color: C.textDim,
                        marginTop: 12,
                        fontSize: 13,
                        fontWeight: "600",
                    }}>
                    Loading dashboard...
                </Text>
            </View>
        );
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
            label: "Won",
            shortLabel: "Won",
            value: stats.conv,
            color: C.emerald,
            hint: "Converted",
        },
        {
            label: "Lost",
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
            : `₹${c?.discountValue || 0} OFF`;

    const handleCouponCopy = async (coupon) => {
        const code = coupon?.code || "";
        if (!code) return;
        try {
            if (
                Platform.OS === "web" &&
                globalThis?.navigator?.clipboard?.writeText
            ) {
                await globalThis.navigator.clipboard.writeText(code);
                Alert.alert("Copied!", `${code} copied`);
                return;
            }
            await Share.share({ message: `Use coupon: ${code}` });
        } catch {
            Alert.alert("Coupon Code", code);
        }
    };

    const handleRequestOtp = async (method) => {
        try {
            setOtpMethod(method);
            setSendingOtp(true);
            const client = await getApiClient();
            const resp = await client.post("/auth/send-otp", {
                email: user?.email,
                mobile: user?.mobile,
                type: "edit_whatsapp_token",
                method: method.toLowerCase(),
            });
            if (resp.data.success) setWaEditStep(2);
            else
                Alert.alert("Error", resp.data.message || "Failed to send OTP");
        } catch {
            Alert.alert("Error", "Failed to send OTP. Please try again.");
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
                setWaEditStep(3);
                setWaForm((prev) => ({
                    ...prev,
                    watiApiToken: "",
                    metaWhatsappToken: "",
                    neoApiKey: "",
                    neoBearerToken: "",
                    twilioAuthToken: "",
                }));
            } else Alert.alert("Invalid code", "Please enter the correct OTP.");
        } catch {
            Alert.alert("Error", "Verification failed.");
        } finally {
            setVerifyingOtp(false);
        }
    };

    const handleSaveNewConfig = async () => {
        const provider = waForm.provider;
        const valid =
            (provider === WA_PROVIDERS.WATI &&
                waForm.watiBaseUrl.trim() &&
                waForm.watiApiToken.trim()) ||
            (provider === WA_PROVIDERS.META &&
                waForm.metaWhatsappToken.trim() &&
                waForm.metaPhoneNumberId.trim()) ||
            (provider === WA_PROVIDERS.NEO &&
                waForm.neoAccountName.trim() &&
                waForm.neoPhoneNumber.trim() &&
                (waForm.neoApiKey.trim() || waForm.neoBearerToken.trim())) ||
            (provider === WA_PROVIDERS.TWILIO &&
                waForm.twilioAccountSid.trim() &&
                waForm.twilioAuthToken.trim() &&
                waForm.twilioWhatsappNumber.trim());
        if (!valid) {
            Alert.alert(
                "Error",
                "Please complete all required fields for the selected provider",
            );
            return;
        }
        try {
            setSavingWa(true);
            const client = await getApiClient();
            const resp = await client.put("/whatsapp/config", {
                provider: waForm.provider,
                defaultCountry: waForm.defaultCountry.trim() || "91",
                watiBaseUrl: waForm.watiBaseUrl.trim(),
                watiApiToken: waForm.watiApiToken.trim(),
                metaWhatsappToken: waForm.metaWhatsappToken.trim(),
                metaPhoneNumberId: waForm.metaPhoneNumberId.trim(),
                neoAccountName: waForm.neoAccountName.trim(),
                neoApiKey: waForm.neoApiKey.trim(),
                neoPhoneNumber: waForm.neoPhoneNumber.trim(),
                neoBearerToken: waForm.neoBearerToken.trim(),
                twilioAccountSid: waForm.twilioAccountSid.trim(),
                twilioAuthToken: waForm.twilioAuthToken.trim(),
                twilioWhatsappNumber: waForm.twilioWhatsappNumber.trim(),
            });
            if (resp.data?.ok) {
                Alert.alert("Success", "WhatsApp Configuration Updated");
                setShowWaModal(false);
                setWaConfig(resp.data.config || {});
                setWaForm(createWaForm(resp.data.config || {}));
                setWaEditStep(1);
            } else Alert.alert("Error", resp.data.message || "Could not save");
        } catch {
            Alert.alert("Error", "Save failed");
        } finally {
            setSavingWa(false);
        }
    };

    const weekBarData = [
        { value: Math.round(stats.conv * 0.3), label: "M" },
        { value: Math.round(stats.conv * 0.48), label: "T" },
        { value: Math.round(stats.conv * 0.62), label: "W" },
        { value: Math.round(stats.conv * 0.52), label: "T" },
        { value: Math.round(stats.conv * 0.76), label: "F" },
        { value: Math.round(stats.conv * 0.88), label: "S" },
        { value: stats.conv, label: "S" },
    ];
    const salesBarData = [
        {
            value: Math.round(stats.salesMonthly * 0.28),
            label: "M",
            color: C.emerald,
        },
        {
            value: Math.round(stats.salesMonthly * 0.44),
            label: "T",
            color: C.emerald,
        },
        {
            value: Math.round(stats.salesMonthly * 0.68),
            label: "W",
            color: C.emerald,
        },
        {
            value: Math.round(stats.salesMonthly * 0.5),
            label: "T",
            color: C.emerald,
        },
        {
            value: Math.round(stats.salesMonthly * 0.78),
            label: "F",
            color: C.emerald,
        },
        {
            value: Math.round(stats.salesMonthly * 0.9),
            label: "S",
            color: C.emerald,
        },
        { value: stats.salesMonthly, label: "S", color: C.emerald },
    ];

    // ─────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────
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
            <SideMenu
                visible={showMenu}
                onClose={() => setShowMenu(false)}
                navigation={navigation}
                user={user}
                onLogout={handleLogout}
            />

            {/* ── TOP BAR ── */}
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
                            {greeting} 👋
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

            {/* ── MAIN SCROLL ── */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            fetchData();
                        }}
                        tintColor={C.blue}
                        colors={[C.blue]}
                    />
                }>
                {/* ─── HERO CARD ─── */}
                <View
                    style={{
                        paddingHorizontal: hPad,
                        paddingTop: isTablet || isDesktop ? 22 : 18,
                    }}>
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
                                            Live · Overall Revenue
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
                                            name="trending-up"
                                            size={12}
                                            color="#fff"
                                        />
                                        <Text
                                            style={{
                                                fontSize: 11,
                                                color: "#fff",
                                                fontWeight: "700",
                                            }}>
                                            +12% vs last month
                                        </Text>
                                    </View>
                                </View>
                                <RingMeter
                                    pct={cr}
                                    size={isTablet || isDesktop ? 90 : 80}
                                />
                            </View>

                            {/* Week bar chart — only show on ≥ md */}
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
                                        This Week · Conversions
                                    </Text>
                                    <HeroBarChart
                                        data={weekBarData}
                                        h={isTablet || isDesktop ? 60 : 52}
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
                                        label: "MTD Revenue",
                                        val: fmtInr(stats.monthlyRevenue || 0),
                                    },
                                    { label: "Conversions", val: stats.conv },
                                    {
                                        label: "Today Leads",
                                        val: stats.todayEnquiry,
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

                {/* ─── BODY ─── */}
                <View style={[S.body, { paddingHorizontal: hPad }]}>
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
                                                    style={S.couponCopyBtn}
                                                    onPress={() =>
                                                        handleCouponCopy(coupon)
                                                    }>
                                                    <Ionicons
                                                        name="copy-outline"
                                                        size={12}
                                                        color="#fff"
                                                    />
                                                    <Text
                                                        style={{
                                                            color: "#fff",
                                                            fontSize: 11,
                                                            fontWeight: "800",
                                                        }}>
                                                        Copy
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
                                                        : "—"}
                                                </Text>
                                            </View>
                                        </View>
                                    </MotiView>
                                ))}
                            </ScrollView>
                        </MotiView>
                    )}

                    {/* KEY METRICS — responsive grid */}
                    <View style={S.section}>
                        <SH
                            title="Key Metrics"
                            sub="Real-time overview"
                            titleSize={sectionTitleSize}
                            right={<PulseDot color={C.emerald} size={7} />}
                        />
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: tileGap,
                            }}>
                            <MetricTile
                                icon="people"
                                label="Total Leads"
                                value={stats.totalEnquiry}
                                color={C.blue}
                                trend={makeTrend(stats.totalEnquiry)}
                                delay={180}
                                tileWidth={tileWidth}
                                onPress={() => navigation.navigate("Enquiry")}
                            />
                            <MetricTile
                                icon="flash"
                                label="New Today"
                                value={stats.todayEnquiry}
                                color={C.sky}
                                trend={makeTrend(stats.todayEnquiry)}
                                delay={230}
                                tileWidth={tileWidth}
                            />
                            <MetricTile
                                icon="calendar"
                                label="Follow-ups"
                                value={stats.todayFollowup}
                                color={C.violet}
                                trend={makeTrend(stats.todayFollowup)}
                                delay={280}
                                tileWidth={tileWidth}
                                onPress={() => navigation.navigate("FollowUp")}
                            />
                            <MetricTile
                                icon="close-circle"
                                label="Dropped"
                                value={stats.drops}
                                color={C.rose}
                                trend={makeTrend(stats.drops)}
                                delay={330}
                                tileWidth={tileWidth}
                            />
                            {/* Extra tiles on tablet/desktop */}
                            {(isTablet || isDesktop) && (
                                <>
                                    <MetricTile
                                        icon="checkmark-circle"
                                        label="Converted"
                                        value={stats.conv}
                                        color={C.emerald}
                                        trend={makeTrend(stats.conv)}
                                        delay={380}
                                        tileWidth={tileWidth}
                                    />
                                    <MetricTile
                                        icon="trending-up"
                                        label="In Progress"
                                        value={stats.ip}
                                        color={C.amber}
                                        trend={makeTrend(stats.ip)}
                                        delay={430}
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
                                                trend={makeTrend(
                                                    stats.monthlyRevenue,
                                                )}
                                                delay={480}
                                                tileWidth={tileWidth}
                                            />
                                            <MetricTile
                                                icon="stats-chart"
                                                label="Conv. Rate"
                                                value={`${cr}%`}
                                                color={C.violet}
                                                trend={[]}
                                                delay={530}
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
                            title="Pipeline"
                            sub="Lead stage breakdown"
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

                            {/* Legend — 2 cards per row */}
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
                                                    S.pipelineLegendValue,
                                                    { color: stage.color },
                                                ]}>
                                                {stage.value}
                                            </Text>
                                            <Text style={S.pipelineLegendMeta}>
                                                {pct}% · {stage.hint}
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
                                        Monthly Revenue
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
                                        name="trending-up"
                                        size={13}
                                        color={C.emerald}
                                    />
                                    <Text
                                        style={{
                                            fontSize: 12,
                                            color: C.emerald,
                                            fontWeight: "800",
                                        }}>
                                        +12%
                                    </Text>
                                </View>
                            </View>
                            <LightBarChart
                                data={salesBarData}
                                h={isTablet || isDesktop ? 100 : 88}
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

                    {/* QUICK ACTIONS */}
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
                            title="Quick Actions"
                            titleSize={sectionTitleSize}
                        />
                        {/* On tablet/desktop: wrap into a grid; on phones: horizontal scroll */}
                        {isTablet || isDesktop ? (
                            <View
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    gap: 16,
                                }}>
                                {[
                                    {
                                        icon: "person-add",
                                        label: "New Lead",
                                        colors: C.g.blue,
                                        nav: "Enquiry",
                                    },
                                    {
                                        icon: "call",
                                        label: "Auto Dial",
                                        colors: C.g.emerald,
                                        nav: "AutoCallScreen",
                                    },
                                    {
                                        icon: "calendar-number",
                                        label: "Follow-ups",
                                        colors: C.g.violet,
                                        nav: "FollowUp",
                                    },
                                    {
                                        icon: "document-text",
                                        label: "Reports",
                                        colors: C.g.amber,
                                        nav: "Report",
                                    },
                                    {
                                        icon: "card",
                                        label: "Pricing",
                                        colors: C.g.sky,
                                        nav: "PricingScreen",
                                    },
                                    {
                                        icon: "logo-whatsapp",
                                        label: "WhatsApp",
                                        colors: C.g.whatsapp,
                                        nav: "WhatsAppChat",
                                    },
                                ].map((a) => (
                                    <ActionPill
                                        key={a.label}
                                        icon={a.icon}
                                        label={a.label}
                                        colors={a.colors}
                                        pillSize={pillSize}
                                        onPress={() =>
                                            navigation.navigate(a.nav)
                                        }
                                    />
                                ))}
                            </View>
                        ) : (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{
                                    gap: 12,
                                    paddingRight: 4,
                                }}>
                                <ActionPill
                                    icon="person-add"
                                    label="New Lead"
                                    colors={C.g.blue}
                                    pillSize={pillSize}
                                    onPress={() =>
                                        navigation.navigate("Enquiry")
                                    }
                                />
                                <ActionPill
                                    icon="call"
                                    label="Auto Dial"
                                    colors={C.g.emerald}
                                    pillSize={pillSize}
                                    onPress={() =>
                                        navigation.navigate("AutoCallScreen")
                                    }
                                />
                                <ActionPill
                                    icon="calendar-number"
                                    label="Follow-ups"
                                    colors={C.g.violet}
                                    pillSize={pillSize}
                                    onPress={() =>
                                        navigation.navigate("FollowUp")
                                    }
                                />
                                <ActionPill
                                    icon="document-text"
                                    label="Reports"
                                    colors={C.g.amber}
                                    pillSize={pillSize}
                                    onPress={() =>
                                        navigation.navigate("Report")
                                    }
                                />
                                <ActionPill
                                    icon="card"
                                    label="Pricing"
                                    colors={C.g.sky}
                                    pillSize={pillSize}
                                    onPress={() =>
                                        navigation.navigate("PricingScreen")
                                    }
                                />
                                <ActionPill
                                    icon="logo-whatsapp"
                                    label="WhatsApp"
                                    colors={C.g.whatsapp}
                                    pillSize={pillSize}
                                    onPress={() =>
                                        navigation.navigate("WhatsAppChat")
                                    }
                                />
                            </ScrollView>
                        )}
                    </MotiView>

                    {/* WHATSAPP INTEGRATION */}
                    <MotiView
                        from={
                            skipAnim
                                ? { opacity: 1 }
                                : { opacity: 0, scale: 0.97 }
                        }
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 470 }}
                        style={S.section}>
                        <SH title="Integrations" titleSize={sectionTitleSize} />
                        <TouchableOpacity
                            activeOpacity={0.88}
                            onPress={() => setShowWaModal(true)}
                            style={S.waCard}>
                            <View
                                style={[
                                    S.waIconBox,
                                    isTablet || isDesktop
                                        ? {
                                              width: 64,
                                              height: 64,
                                              borderRadius: 20,
                                          }
                                        : {},
                                ]}>
                                <Ionicons
                                    name="logo-whatsapp"
                                    size={isTablet || isDesktop ? 32 : 28}
                                    color="#25D366"
                                />
                            </View>
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <Text
                                    style={{
                                        fontSize:
                                            isTablet || isDesktop ? 17 : 15,
                                        color: C.ink,
                                        fontWeight: "800",
                                    }}>
                                    WhatsApp Business API
                                </Text>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 7,
                                        marginTop: 5,
                                    }}>
                                    <PulseDot
                                        color={waConfig ? C.emerald : C.amber}
                                        size={6}
                                    />
                                    <Text
                                        style={{
                                            fontSize: 12,
                                            color: C.textDim,
                                            fontWeight: "600",
                                        }}>
                                        {waConfig
                                            ? "Connected & Active"
                                            : "Needs Configuration"}
                                    </Text>
                                </View>
                            </View>
                            <View style={S.waConfigChip}>
                                <Text
                                    style={{
                                        fontSize: 12,
                                        color: C.blue,
                                        fontWeight: "800",
                                    }}>
                                    Configure
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </MotiView>

                    {/* ── WhatsApp Config Modal ── */}
                    <Modal
                        visible={showWaModal}
                        transparent
                        animationType="slide"
                        onRequestClose={() => setShowWaModal(false)}>
                        <View
                            style={{
                                flex: 1,
                                backgroundColor: "rgba(10,15,30,0.50)",
                                justifyContent: "flex-end",
                            }}>
                            <TouchableOpacity
                                style={{ flex: 1 }}
                                onPress={() => setShowWaModal(false)}
                            />
                            <ScrollView
                                style={[
                                    S.sheet,
                                    isTablet || isDesktop
                                        ? {
                                              maxHeight: "80%",
                                              marginHorizontal: isDesktop
                                                  ? "20%"
                                                  : "10%",
                                              borderRadius: 28,
                                              marginBottom: 40,
                                          }
                                        : {},
                                ]}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                bounces={false}>
                                <View style={S.sheetHandle} />
                                <Text
                                    style={[
                                        S.sheetTitle,
                                        isTablet || isDesktop
                                            ? { fontSize: 22 }
                                            : {},
                                    ]}>
                                    {waEditStep === 1
                                        ? "🔒 Security Verification"
                                        : waEditStep === 2
                                          ? "📱 Enter OTP"
                                          : "⚙️ Update Config"}
                                </Text>
                                <Text style={S.sheetSub}>
                                    {waEditStep === 1
                                        ? "Verify your identity before editing the API token."
                                        : waEditStep === 2
                                          ? `Enter the 6-digit code sent via ${otpMethod}.`
                                          : "Enter your new API token and endpoint URL."}
                                </Text>

                                {waEditStep === 1 && (
                                    <>
                                        <OtpOption
                                            icon="mail"
                                            label="Email"
                                            sub="Send to registered email"
                                            color={C.blue}
                                            onPress={() =>
                                                handleRequestOtp("Email")
                                            }
                                            loading={
                                                sendingOtp &&
                                                otpMethod === "Email"
                                            }
                                        />
                                        <OtpOption
                                            icon="chatbubble-ellipses"
                                            label="SMS"
                                            sub="Send via text message"
                                            color={C.teal}
                                            onPress={() =>
                                                handleRequestOtp("SMS")
                                            }
                                            loading={
                                                sendingOtp &&
                                                otpMethod === "SMS"
                                            }
                                        />
                                        <OtpOption
                                            icon="logo-whatsapp"
                                            label="WhatsApp"
                                            sub="Send via WhatsApp"
                                            color="#25D366"
                                            onPress={() =>
                                                handleRequestOtp("WhatsApp")
                                            }
                                            loading={
                                                sendingOtp &&
                                                otpMethod === "WhatsApp"
                                            }
                                        />
                                    </>
                                )}
                                {waEditStep === 2 && (
                                    <View>
                                        <TextInput
                                            style={S.otpInput}
                                            placeholder="000000"
                                            placeholderTextColor={C.textMuted}
                                            keyboardType="numeric"
                                            maxLength={6}
                                            value={otpCode}
                                            onChangeText={setOtpCode}
                                            autoFocus
                                        />
                                        <TouchableOpacity
                                            onPress={handleVerifyOtp}
                                            disabled={
                                                verifyingOtp ||
                                                otpCode.length < 6
                                            }>
                                            <LinearGradient
                                                colors={C.g.blue}
                                                style={[
                                                    S.cta,
                                                    {
                                                        opacity:
                                                            verifyingOtp ||
                                                            otpCode.length < 6
                                                                ? 0.5
                                                                : 1,
                                                    },
                                                ]}>
                                                {verifyingOtp ? (
                                                    <ActivityIndicator color="#fff" />
                                                ) : (
                                                    <Text style={S.ctaText}>
                                                        Verify & Continue
                                                    </Text>
                                                )}
                                            </LinearGradient>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setWaEditStep(1)}
                                            style={{
                                                marginTop: 14,
                                                alignItems: "center",
                                            }}>
                                            <Text
                                                style={{
                                                    color: C.textMuted,
                                                    fontWeight: "700",
                                                }}>
                                                Change Method
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {waEditStep === 3 && (
                                    <View>
                                        <Text style={S.inputLabel}>
                                            Provider
                                        </Text>
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                marginBottom: 14,
                                            }}>
                                            {Object.values(WA_PROVIDERS).map(
                                                (provider) => (
                                                    <TouchableOpacity
                                                        key={provider}
                                                        onPress={() =>
                                                            setWaForm(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    provider,
                                                                }),
                                                            )
                                                        }
                                                        style={{
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 9,
                                                            borderRadius: 12,
                                                            borderWidth: 1,
                                                            borderColor:
                                                                waForm.provider ===
                                                                provider
                                                                    ? C.emerald
                                                                    : C.border,
                                                            backgroundColor:
                                                                waForm.provider ===
                                                                provider
                                                                    ? C.blueLight
                                                                    : C.bg,
                                                        }}>
                                                        <Text
                                                            style={{
                                                                color:
                                                                    waForm.provider ===
                                                                    provider
                                                                        ? C.emerald
                                                                        : C.textSub,
                                                                fontWeight:
                                                                    "800",
                                                            }}>
                                                            {provider}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ),
                                            )}
                                        </View>
                                        <Text style={S.inputLabel}>
                                            Default Country Code
                                        </Text>
                                        <TextInput
                                            style={S.textInput}
                                            placeholder="91"
                                            placeholderTextColor={C.textMuted}
                                            value={waForm.defaultCountry}
                                            onChangeText={(value) =>
                                                setWaForm((prev) => ({
                                                    ...prev,
                                                    defaultCountry: value,
                                                }))
                                            }
                                        />

                                        {waForm.provider ===
                                            WA_PROVIDERS.WATI && (
                                            <>
                                                <Text style={S.inputLabel}>
                                                    WATI Base URL
                                                </Text>
                                                <TextInput
                                                    style={S.textInput}
                                                    placeholder="https://live-server.wati.io"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    value={waForm.watiBaseUrl}
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            watiBaseUrl: value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    WATI API Token
                                                </Text>
                                                <TextInput
                                                    style={[
                                                        S.textInput,
                                                        { minHeight: 100 },
                                                    ]}
                                                    placeholder="Enter WATI API token"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    multiline
                                                    value={waForm.watiApiToken}
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            watiApiToken: value,
                                                        }))
                                                    }
                                                />
                                            </>
                                        )}

                                        {waForm.provider ===
                                            WA_PROVIDERS.META && (
                                            <>
                                                <Text style={S.inputLabel}>
                                                    Meta WhatsApp Token
                                                </Text>
                                                <TextInput
                                                    style={[
                                                        S.textInput,
                                                        { minHeight: 100 },
                                                    ]}
                                                    placeholder="Enter Meta permanent token"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    multiline
                                                    value={
                                                        waForm.metaWhatsappToken
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            metaWhatsappToken:
                                                                value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    Phone Number ID
                                                </Text>
                                                <TextInput
                                                    style={S.textInput}
                                                    placeholder="Enter phone number ID"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    value={
                                                        waForm.metaPhoneNumberId
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            metaPhoneNumberId:
                                                                value,
                                                        }))
                                                    }
                                                />
                                            </>
                                        )}

                                        {waForm.provider ===
                                            WA_PROVIDERS.NEO && (
                                            <>
                                                <Text style={S.inputLabel}>
                                                    Neo Name
                                                </Text>
                                                <TextInput
                                                    style={S.textInput}
                                                    placeholder="Enter Neo account name"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    value={
                                                        waForm.neoAccountName
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            neoAccountName:
                                                                value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    Neo API Key
                                                </Text>
                                                <TextInput
                                                    style={[
                                                        S.textInput,
                                                        { minHeight: 100 },
                                                    ]}
                                                    placeholder="Enter Neo API key"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    multiline
                                                    value={waForm.neoApiKey}
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            neoApiKey: value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    Neo Phone Number
                                                </Text>
                                                <TextInput
                                                    style={S.textInput}
                                                    placeholder="Enter Neo WhatsApp number"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    value={
                                                        waForm.neoPhoneNumber
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            neoPhoneNumber:
                                                                value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    Neo Bearer Token
                                                </Text>
                                                <TextInput
                                                    style={[
                                                        S.textInput,
                                                        { minHeight: 100 },
                                                    ]}
                                                    placeholder="Enter Neo bearer token"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    multiline
                                                    value={
                                                        waForm.neoBearerToken
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            neoBearerToken:
                                                                value,
                                                        }))
                                                    }
                                                />
                                            </>
                                        )}

                                        {waForm.provider ===
                                            WA_PROVIDERS.TWILIO && (
                                            <>
                                                <Text style={S.inputLabel}>
                                                    Twilio Account SID
                                                </Text>
                                                <TextInput
                                                    style={S.textInput}
                                                    placeholder="Enter Twilio Account SID"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    value={
                                                        waForm.twilioAccountSid
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            twilioAccountSid:
                                                                value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    Twilio Auth Token
                                                </Text>
                                                <TextInput
                                                    style={[
                                                        S.textInput,
                                                        { minHeight: 100 },
                                                    ]}
                                                    placeholder="Enter Twilio Auth Token"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    multiline
                                                    value={
                                                        waForm.twilioAuthToken
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            twilioAuthToken:
                                                                value,
                                                        }))
                                                    }
                                                />
                                                <Text style={S.inputLabel}>
                                                    Twilio WhatsApp Number
                                                </Text>
                                                <TextInput
                                                    style={S.textInput}
                                                    placeholder="+14155238886"
                                                    placeholderTextColor={
                                                        C.textMuted
                                                    }
                                                    value={
                                                        waForm.twilioWhatsappNumber
                                                    }
                                                    onChangeText={(value) =>
                                                        setWaForm((prev) => ({
                                                            ...prev,
                                                            twilioWhatsappNumber:
                                                                value,
                                                        }))
                                                    }
                                                />
                                            </>
                                        )}

                                        <TouchableOpacity
                                            onPress={handleSaveNewConfig}
                                            disabled={savingWa}>
                                            <LinearGradient
                                                colors={C.g.emerald}
                                                style={S.cta}>
                                                {savingWa ? (
                                                    <ActivityIndicator color="#fff" />
                                                ) : (
                                                    <Text style={S.ctaText}>
                                                        Update Integration
                                                    </Text>
                                                )}
                                            </LinearGradient>
                                        </TouchableOpacity>
                                        <View style={{ height: 20 }} />
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </Modal>

                    {/* TODAY'S ACTIVITY */}
                    <MotiView
                        from={
                            skipAnim
                                ? { opacity: 1 }
                                : { opacity: 0, translateY: 14 }
                        }
                        animate={{ opacity: 1, translateY: 0 }}
                        transition={{ delay: 500 }}
                        style={[S.section, { marginBottom: 8 }]}>
                        <SH
                            title="Today's Activity"
                            titleSize={sectionTitleSize}
                            sub={`${todayTasks.length} task${todayTasks.length !== 1 ? "s" : ""} scheduled`}
                            right={
                                <TouchableOpacity
                                    style={S.chip}
                                    onPress={() =>
                                        navigation.navigate("FollowUp")
                                    }>
                                    <Text style={S.chipText}>See all</Text>
                                </TouchableOpacity>
                            }
                        />
                        <View style={S.activityCard}>
                            {todayTasks.length > 0 ? (
                                todayTasks
                                    .slice(0, isTablet || isDesktop ? 8 : 5)
                                    .map((item, i, arr) => (
                                        <ActivityRow
                                            key={i}
                                            item={item}
                                            delay={540 + i * 55}
                                            isLast={
                                                i ===
                                                arr.slice(
                                                    0,
                                                    isTablet || isDesktop
                                                        ? 8
                                                        : 5,
                                                ).length -
                                                    1
                                            }
                                        />
                                    ))
                            ) : (
                                <View
                                    style={{
                                        padding: 36,
                                        alignItems: "center",
                                    }}>
                                    <View
                                        style={{
                                            width: 66,
                                            height: 66,
                                            borderRadius: 20,
                                            backgroundColor: C.blueLight,
                                            justifyContent: "center",
                                            alignItems: "center",
                                            marginBottom: 12,
                                        }}>
                                        <MaterialCommunityIcons
                                            name="calendar-check"
                                            size={32}
                                            color={C.blue}
                                        />
                                    </View>
                                    <Text
                                        style={{
                                            fontSize: 15,
                                            color: C.textSub,
                                            fontWeight: "700",
                                        }}>
                                        All Clear!
                                    </Text>
                                    <Text
                                        style={{
                                            fontSize: 13,
                                            color: C.textMuted,
                                            marginTop: 4,
                                        }}>
                                        No activities scheduled today
                                    </Text>
                                </View>
                            )}
                        </View>
                    </MotiView>
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
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
        backgroundColor: C.surface,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
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
        backgroundColor: C.cardSoft,
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
        backgroundColor: C.cardSoft,
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
        gap: 5,
    },
    pipelineLegendPill: {
        minHeight: 78,
        width: "48%",
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 13,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "space-between",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    pipelineLegendHead: { flexDirection: "row", alignItems: "center", gap: 2 },
    pipelineLegendDot: { width: 10, height: 10, borderRadius: 5 },
    pipelineLegendLabel: { fontSize: 13, color: C.ink, fontWeight: "800" },
    pipelineLegendValue: {
        fontSize: 22,
        fontWeight: "900",
        letterSpacing: -0.4,
        marginTop: 8,
    },
    pipelineLegendMeta: {
        fontSize: 11,
        color: C.textDim,
        fontWeight: "600",
        marginTop: 3,
    },
    tile: {
        backgroundColor: C.surface,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    tileIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    tileValue: {
        fontSize: 26,
        color: C.ink,
        fontWeight: "900",
        letterSpacing: -0.8,
    },
    tileLabel: {
        fontSize: 12,
        color: C.textDim,
        fontWeight: "600",
        marginTop: 3,
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
        backgroundColor: C.surface,
        borderRadius: 18,
        padding: 16,
        paddingLeft: 20,
        borderWidth: 1,
        borderColor: C.border,
        overflow: "hidden",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
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
    waCard: {
        backgroundColor: C.surface,
        borderRadius: 20,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
    },
    waIconBox: {
        width: 56,
        height: 56,
        borderRadius: 17,
        backgroundColor: "#E8F5E9",
        justifyContent: "center",
        alignItems: "center",
    },
    waConfigChip: {
        backgroundColor: C.blueLight,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.blueMid,
    },
    sheet: {
        backgroundColor: C.surface,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingBottom: Platform.OS === "ios" ? 40 : 24,
    },
    sheetHandle: {
        width: 38,
        height: 4,
        backgroundColor: C.border,
        alignSelf: "center",
        borderRadius: 2,
        marginBottom: 20,
    },
    sheetTitle: {
        fontSize: 20,
        color: C.ink,
        fontWeight: "900",
        marginBottom: 6,
    },
    sheetSub: {
        fontSize: 14,
        color: C.textDim,
        marginBottom: 20,
        lineHeight: 20,
    },
    otpInput: {
        backgroundColor: C.bg,
        borderRadius: 16,
        padding: 18,
        fontSize: 26,
        fontWeight: "800",
        textAlign: "center",
        letterSpacing: 12,
        borderWidth: 2,
        borderColor: C.blueMid,
        color: C.ink,
        marginBottom: 4,
    },
    cta: { borderRadius: 16, padding: 16, alignItems: "center", marginTop: 16 },
    ctaText: { color: "#fff", fontWeight: "800", fontSize: 16 },
    inputLabel: {
        fontSize: 12,
        color: C.textSub,
        fontWeight: "700",
        marginBottom: 8,
        marginTop: 14,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    textInput: {
        backgroundColor: C.bg,
        borderRadius: 14,
        padding: 14,
        borderWidth: 1.5,
        borderColor: C.border,
        fontSize: 14,
        color: C.ink,
    },
    activityCard: {
        backgroundColor: C.surface,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
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

const M = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(10,15,30,0.40)",
    },
    panel: {
        backgroundColor: C.surface,
        height: "100%",
        borderTopRightRadius: 32,
        borderBottomRightRadius: 32,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 14,
    },
    upgradeCard: {
        marginHorizontal: 8,
        marginTop: 6,
        marginBottom: 10,
        borderRadius: 18,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
    },
    upgradeCardInner: {
        padding: 14,
        borderRadius: 18,
    },
    upgradeHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 6,
    },
    upgradeTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "900",
        letterSpacing: -0.2,
    },
    upgradeBadge: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "900",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.16)",
        overflow: "hidden",
    },
    upgradeSub: {
        color: "rgba(255,255,255,0.85)",
        fontSize: 12,
        fontWeight: "700",
        marginBottom: 6,
    },
    upgradeBulletRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
    },
    upgradeBulletText: {
        color: "rgba(255,255,255,0.92)",
        fontSize: 13,
        fontWeight: "700",
    },
    upgradeBtn: {
        marginTop: 10,
        height: 42,
        borderRadius: 14,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    upgradeBtnText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "900",
    },
    menuHeader: {
        paddingTop:
            Platform.OS === "android"
                ? (StatusBar.currentHeight || 0) + 24
                : 54,
        paddingBottom: 28,
        alignItems: "center",
        overflow: "hidden",
    },
    avatarWrap: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.35)",
        overflow: "hidden",
    },
    list: { padding: 12 },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 14,
        marginBottom: 2,
    },
    menuIconBox: {
        width: 34,
        height: 34,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
        backgroundColor: C.bg,
    },
    menuLabel: { fontSize: 14, fontWeight: "600", flex: 1, color: C.textSub },
});
