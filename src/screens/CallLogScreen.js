import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    DeviceEventEmitter,
    FlatList,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    ToastAndroid,
    TouchableOpacity,
    useWindowDimensions,
    Vibration,
    View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import RNImmediatePhoneCall from "react-native-immediate-phone-call";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import * as callLogService from "../services/callLogService";
import { PostCallModal } from "../components/PostCallModal";
import {
    getInCallControlSupport,
    sendCallDtmf,
    setCallHold,
    setCallMuted,
    setCallSpeaker,
} from "../services/inCallControlService";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
    bg: "#F4F6F9",
    surface: "#FFFFFF",
    outline: "#E8ECF0",
    text: "#111827",
    textSec: "#4B5563",
    textTer: "#9CA3AF",
    primary: "#2563EB",
    primaryLight: "#EFF6FF",
    primaryMid: "#BFDBFE",
    green: "#059669",
    greenLight: "#ECFDF5",
    greenCall: "#10B981",
    red: "#DC2626",
    redLight: "#FEF2F2",
    redCall: "#EF4444",
    amber: "#D97706",
    amberLight: "#FFFBEB",
    violet: "#7C3AED",
    violetLight: "#F5F3FF",
    callBg1: "#0F172A",
    callBg2: "#1B3A5C",
    callBg3: "#0D1F36",
    white: "#FFFFFF",
    overlay: "rgba(0,0,0,0.5)",
};

const FILTER_TYPES = ["All", "Missed", "Incoming", "Outgoing"];
const TIME_PERIODS = [
    { key: "All", label: "All" },
    { key: "Today", label: "Today" },
    { key: "This Week", label: "Week" },
];
const isExpoGo = () =>
    Constants.executionEnvironment === "storeClient" ||
    Constants.appOwnership === "expo";

// ─── Utils ────────────────────────────────────────────────────────────────────
const formatPhoneNumber = (v) => {
    const d = (v || "").replace(/\D/g, "");
    return d.length > 10 ? d.slice(-10) : d;
};
const formatTime = (v) =>
    new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const formatDate = (v) => {
    const d = new Date(v),
        now = new Date(),
        diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate()) return formatTime(v);
    if (diff < 172800000) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const formatDuration = (s) =>
    `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;
const formatCallTimer = (s) => {
    const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        sec = s % 60;
    if (h > 0)
        return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const matchesTimeFilter = (callTime, filter) => {
    if (!callTime || filter === "All") return true;
    const v = new Date(callTime),
        now = new Date();
    if (filter === "Today") return v.toDateString() === now.toDateString();
    if (filter === "This Week") {
        const w = new Date();
        w.setDate(w.getDate() - 7);
        return v >= w;
    }
    return true;
};
const matchesSearchFilter = (log, q) => {
    if (!q?.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
        String(log?.contactName || "")
            .toLowerCase()
            .includes(s) ||
        String(log?.phoneNumber || "")
            .toLowerCase()
            .includes(s)
    );
};
const getTypeConfig = (callType) => {
    switch (callType) {
        case "Incoming":
            return {
                label: "Incoming",
                color: C.primary,
                bg: C.primaryLight,
                icon: "arrow-down-outline",
            };
        case "Outgoing":
            return {
                label: "Outgoing",
                color: C.green,
                bg: C.greenLight,
                icon: "arrow-up-outline",
            };
        case "Missed":
            return {
                label: "Missed",
                color: C.red,
                bg: C.redLight,
                icon: "close-outline",
            };
        case "Not Attended":
            return {
                label: "No Answer",
                color: C.amber,
                bg: C.amberLight,
                icon: "remove-outline",
            };
        default:
            return {
                label: callType || "Call",
                color: C.textSec,
                bg: C.outline,
                icon: "call-outline",
            };
    }
};
const showToast = (msg, isError = false) => {
    if (Platform.OS === "android")
        ToastAndroid.show(
            msg,
            isError ? ToastAndroid.LONG : ToastAndroid.SHORT,
        );
    else Alert.alert(isError ? "Error" : "Info", msg);
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = ({ name, size = 44 }) => {
    const initials = (name || "?")
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    const palette = [
        "#6366F1",
        "#8B5CF6",
        "#EC4899",
        "#F59E0B",
        "#10B981",
        "#3B82F6",
        "#EF4444",
        "#14B8A6",
    ];
    const bg = palette[initials.charCodeAt(0) % palette.length];
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: bg,
                alignItems: "center",
                justifyContent: "center",
            }}>
            <Text
                style={{
                    color: "#fff",
                    fontSize: size * 0.36,
                    fontWeight: "700",
                }}>
                {initials}
            </Text>
        </View>
    );
};

// ─── Pulse Ring ───────────────────────────────────────────────────────────────
const PulseRing = ({ size, color, delay = 0 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.delay(delay),
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 1800,
                    useNativeDriver: true,
                }),
                Animated.timing(anim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, []);
    return (
        <Animated.View
            style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 1.5,
                borderColor: color,
                opacity: anim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, 0.5, 0],
                }),
                transform: [
                    {
                        scale: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.4],
                        }),
                    },
                ],
            }}
        />
    );
};

// ─── Active Call Overlay ──────────────────────────────────────────────────────
const ActiveCallScreen = ({ call, onEnd, onMinimize }) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(false);
    const [isOnHold, setIsOnHold] = useState(false);
    const [showKp, setShowKp] = useState(false);
    const [kpInput, setKpInput] = useState("");
    const [callSecs, setCallSecs] = useState(0);
    const [status, setStatus] = useState("Connecting…");

    useEffect(() => {
        const t = setTimeout(() => setStatus("Active"), 2200);
        return () => clearTimeout(t);
    }, []);
    useEffect(() => {
        if (status !== "Active") return;
        const id = setInterval(() => setCallSecs((s) => s + 1), 1000);
        return () => clearInterval(id);
    }, [status]);

    const slideY = useRef(new Animated.Value(60)).current;
    const fadeA = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.parallel([
            Animated.spring(slideY, {
                toValue: 0,
                useNativeDriver: true,
                friction: 9,
            }),
            Animated.timing(fadeA, {
                toValue: 1,
                duration: 280,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleEnd = () => {
        Vibration.vibrate(50);
        Animated.parallel([
            Animated.timing(slideY, {
                toValue: 80,
                duration: 220,
                useNativeDriver: true,
            }),
            Animated.timing(fadeA, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start(() => onEnd?.());
    };

    const CtrlBtn = ({ icon, label, active, activeColor, danger, onPress }) => (
        <TouchableOpacity
            style={st.ctrlItem}
            onPress={() => {
                onPress?.();
                Vibration.vibrate(20);
            }}
            activeOpacity={0.75}>
            <View
                style={[
                    st.ctrlCircle,
                    active && {
                        backgroundColor:
                            activeColor || "rgba(255,255,255,0.22)",
                    },
                    danger && { backgroundColor: C.redCall },
                ]}>
                <Ionicons
                    name={icon}
                    size={23}
                    color={
                        danger
                            ? "#FFF"
                            : active
                              ? "#FFF"
                              : "rgba(255,255,255,0.8)"
                    }
                />
            </View>
            <Text style={[st.ctrlLbl, active && { color: "#FFF" }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: fadeA, zIndex: 999 }]}>
            <LinearGradient
                colors={[C.callBg1, C.callBg2, C.callBg3]}
                style={{ flex: 1 }}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}>
                {/* Top bar */}
                <View style={st.callTopBar}>
                    <TouchableOpacity
                        style={st.minimizeBtn}
                        onPress={onMinimize}>
                        <Ionicons
                            name="chevron-down"
                            size={18}
                            color="rgba(255,255,255,0.5)"
                        />
                        <Text
                            style={{
                                fontSize: 12,
                                color: "rgba(255,255,255,0.5)",
                            }}>
                            Minimize
                        </Text>
                    </TouchableOpacity>
                    <View
                        style={[
                            st.callPill,
                            {
                                backgroundColor:
                                    status === "Active"
                                        ? "rgba(16,185,129,0.18)"
                                        : "rgba(255,255,255,0.08)",
                            },
                        ]}>
                        {status === "Active" && (
                            <View
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: C.greenCall,
                                    marginRight: 5,
                                }}
                            />
                        )}
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color:
                                    status === "Active"
                                        ? C.greenCall
                                        : "rgba(255,255,255,0.5)",
                            }}>
                            {status === "Active" ? "On Call" : status}
                        </Text>
                    </View>
                </View>

                {/* Avatar area with pulse */}
                <View style={st.callAvatarArea}>
                    {status === "Active" && (
                        <>
                            <PulseRing
                                size={120}
                                color={C.greenCall}
                                delay={0}
                            />
                            <PulseRing
                                size={120}
                                color={C.greenCall}
                                delay={700}
                            />
                            <PulseRing
                                size={120}
                                color={C.greenCall}
                                delay={1400}
                            />
                        </>
                    )}
                    <View style={st.callAvatarBorder}>
                        <Avatar
                            name={call?.contactName || call?.phoneNumber || "?"}
                            size={96}
                        />
                    </View>
                </View>

                {/* Identity */}
                <View style={st.callIdentity}>
                    <Text style={st.callName}>
                        {call?.contactName || "Unknown"}
                    </Text>
                    <Text style={st.callPhone}>{call?.phoneNumber || ""}</Text>
                    <Text style={st.callTimer}>
                        {status === "Active"
                            ? formatCallTimer(callSecs)
                            : status}
                    </Text>
                    {isOnHold && (
                        <View style={st.holdBadge}>
                            <Ionicons
                                name="pause-circle-outline"
                                size={13}
                                color={C.amber}
                            />
                            <Text
                                style={{
                                    fontSize: 12,
                                    fontWeight: "700",
                                    color: C.amber,
                                }}>
                                On Hold
                            </Text>
                        </View>
                    )}
                </View>

                {/* Keypad or Controls */}
                {showKp ? (
                    <View style={st.kpWrap}>
                        <View style={st.kpDisplay}>
                            <Text style={st.kpDisplayTxt}>
                                {kpInput || " "}
                            </Text>
                            {kpInput.length > 0 && (
                                <TouchableOpacity
                                    onPress={() =>
                                        setKpInput((p) => p.slice(0, -1))
                                    }>
                                    <Ionicons
                                        name="backspace-outline"
                                        size={20}
                                        color="rgba(255,255,255,0.55)"
                                    />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={st.kpGrid}>
                            {[
                                ["1", ""],
                                ["2", "ABC"],
                                ["3", "DEF"],
                                ["4", "GHI"],
                                ["5", "JKL"],
                                ["6", "MNO"],
                                ["7", "PQRS"],
                                ["8", "TUV"],
                                ["9", "WXYZ"],
                                ["*", ""],
                                ["0", "+"],
                                ["#", ""],
                            ].map(([l, s]) => (
                                <TouchableOpacity
                                    key={l}
                                    style={st.kpKey}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        setKpInput((p) => p + l);
                                        Vibration.vibrate(15);
                                    }}>
                                    <Text style={st.kpKeyLabel}>{l}</Text>
                                    {s ? (
                                        <Text style={st.kpKeySub}>{s}</Text>
                                    ) : null}
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={{ alignSelf: "center", padding: 10 }}
                            onPress={() => setShowKp(false)}>
                            <Ionicons
                                name="chevron-down"
                                size={22}
                                color="rgba(255,255,255,0.6)"
                            />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <Animated.View
                        style={[
                            st.ctrlGrid,
                            { transform: [{ translateY: slideY }] },
                        ]}>
                        <CtrlBtn
                            icon={isMuted ? "mic-off" : "mic-outline"}
                            label={isMuted ? "Unmute" : "Mute"}
                            active={isMuted}
                            activeColor="rgba(220,38,38,0.45)"
                            onPress={() => setIsMuted((m) => !m)}
                        />
                        <CtrlBtn
                            icon={
                                isSpeaker
                                    ? "volume-high"
                                    : "volume-medium-outline"
                            }
                            label="Speaker"
                            active={isSpeaker}
                            activeColor="rgba(37,99,235,0.45)"
                            onPress={() => setIsSpeaker((s) => !s)}
                        />
                        <CtrlBtn
                            icon="keypad-outline"
                            label="Keypad"
                            onPress={() => setShowKp(true)}
                        />
                        <CtrlBtn
                            icon={
                                isOnHold
                                    ? "play-circle-outline"
                                    : "pause-circle-outline"
                            }
                            label={isOnHold ? "Resume" : "Hold"}
                            active={isOnHold}
                            activeColor="rgba(217,119,6,0.45)"
                            onPress={() => setIsOnHold((h) => !h)}
                        />
                        <CtrlBtn
                            icon="people-outline"
                            label="Add Call"
                            onPress={() => {}}
                        />
                        <CtrlBtn
                            icon="recording-outline"
                            label="Record"
                            onPress={() => {}}
                        />
                    </Animated.View>
                )}

                {/* End call */}
                {!showKp && (
                    <View style={st.endCallWrap}>
                        <TouchableOpacity
                            style={st.endCallBtn}
                            onPress={handleEnd}
                            activeOpacity={0.85}>
                            <Ionicons
                                name="call"
                                size={30}
                                color="#FFF"
                                style={{ transform: [{ rotate: "135deg" }] }}
                            />
                        </TouchableOpacity>
                        <Text
                            style={{
                                fontSize: 12,
                                color: "rgba(255,255,255,0.4)",
                                marginTop: 8,
                            }}>
                            End Call
                        </Text>
                    </View>
                )}
            </LinearGradient>
        </Animated.View>
    );
};

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
const EnhancedActiveCallScreen = ({
    call,
    onEnd,
    onMinimize,
    onToggleMute,
    onToggleSpeaker,
    onToggleHold,
    onToggleKeypad,
    onPressKeypad,
}) => {
    const seconds = useMemo(() => {
        if (!call?.startedAt) return 0;
        const startedAt = new Date(call.startedAt).getTime();
        if (Number.isNaN(startedAt)) return 0;
        return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    }, [call?.startedAt, call?.tick]);
    const statusLabel =
        call?.status === "held"
            ? "On Hold"
            : call?.status === "active"
              ? "On Call"
              : call?.status === "ended"
                ? "Call Ended"
                : "Connecting...";
    const controls = {
        muted: !!call?.muted,
        speaker: !!call?.speaker,
        onHold: !!call?.onHold,
        keypadVisible: !!call?.keypadVisible,
        keypadDigits: call?.keypadDigits || "",
    };
    const nativeSupport = call?.nativeSupport || {};
    const slideY = useRef(new Animated.Value(60)).current;
    const fadeA = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(slideY, {
                toValue: 0,
                useNativeDriver: true,
                friction: 9,
            }),
            Animated.timing(fadeA, {
                toValue: 1,
                duration: 280,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleEnd = () => {
        Vibration.vibrate(50);
        Animated.parallel([
            Animated.timing(slideY, {
                toValue: 80,
                duration: 220,
                useNativeDriver: true,
            }),
            Animated.timing(fadeA, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start(() => onEnd?.());
    };

    const CtrlBtn = ({ icon, label, active, activeColor, onPress }) => (
        <TouchableOpacity
            style={st.ctrlItem}
            onPress={() => {
                onPress?.();
                Vibration.vibrate(20);
            }}
            activeOpacity={0.75}>
            <View
                style={[
                    st.ctrlCircle,
                    active && {
                        backgroundColor:
                            activeColor || "rgba(255,255,255,0.22)",
                    },
                ]}>
                <Ionicons
                    name={icon}
                    size={23}
                    color={active ? "#FFF" : "rgba(255,255,255,0.8)"}
                />
            </View>
            <Text style={[st.ctrlLbl, active && { color: "#FFF" }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: fadeA, zIndex: 999 }]}>
            <LinearGradient
                colors={[C.callBg1, C.callBg2, C.callBg3]}
                style={{ flex: 1 }}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}>
                <View style={st.callGlowTop} />
                <View style={st.callGlowBottom} />
                <View style={st.callTopBar}>
                    <TouchableOpacity
                        style={st.minimizeBtn}
                        onPress={onMinimize}>
                        <Ionicons
                            name="chevron-down"
                            size={18}
                            color="rgba(255,255,255,0.5)"
                        />
                        <Text style={st.minimizeText}>Minimize</Text>
                    </TouchableOpacity>
                    <View
                        style={[
                            st.callPill,
                            {
                                backgroundColor:
                                    call?.status === "active"
                                        ? "rgba(16,185,129,0.18)"
                                        : "rgba(255,255,255,0.08)",
                            },
                        ]}>
                        {call?.status === "active" && (
                            <View style={st.liveDot} />
                        )}
                        <Text
                            style={[
                                st.callPillText,
                                call?.status === "active" && {
                                    color: C.greenCall,
                                },
                            ]}>
                            {statusLabel}
                        </Text>
                    </View>
                </View>

                <View style={st.callHeroBlock}>
                    <Text style={st.callHeroEyebrow}>Active Conversation</Text>
                    <View style={st.callHeroDivider} />
                </View>

                <View style={st.callAvatarArea}>
                    {call?.status === "active" && (
                        <>
                            <PulseRing
                                size={120}
                                color={C.greenCall}
                                delay={0}
                            />
                            <PulseRing
                                size={120}
                                color={C.greenCall}
                                delay={700}
                            />
                            <PulseRing
                                size={120}
                                color={C.greenCall}
                                delay={1400}
                            />
                        </>
                    )}
                    <View style={st.callAvatarBorder}>
                        <Avatar
                            name={call?.contactName || call?.phoneNumber || "?"}
                            size={96}
                        />
                    </View>
                </View>

                <View style={st.activeCallIdentity}>
                    <Text style={st.activeCallName}>
                        {call?.contactName || "Unknown"}
                    </Text>
                    <Text style={st.activeCallPhone}>
                        {call?.phoneNumber || ""}
                    </Text>
                    <Text style={st.activeCallTimer}>
                        {formatCallTimer(seconds)}
                    </Text>
                    <Text style={st.activeCallHint}>
                        Manage the live call controls from here while the device
                        dialer stays connected.
                    </Text>
                    <View style={st.activeMetaRow}>
                        <View style={st.activeMetaChip}>
                            <Ionicons
                                name="cellular-outline"
                                size={13}
                                color="rgba(255,255,255,0.75)"
                            />
                            <Text style={st.activeMetaText}>
                                {call?.direction || "Outgoing"}
                            </Text>
                        </View>
                        <View style={st.activeMetaChip}>
                            <Ionicons
                                name={
                                    nativeSupport.mute || nativeSupport.speaker
                                        ? "settings-outline"
                                        : "cloud-done-outline"
                                }
                                size={13}
                                color="rgba(255,255,255,0.75)"
                            />
                            <Text style={st.activeMetaText}>
                                {nativeSupport.mute || nativeSupport.speaker
                                    ? "Device audio linked"
                                    : "Server sync active"}
                            </Text>
                        </View>
                    </View>
                    {controls.onHold && (
                        <View style={st.holdBadge}>
                            <Ionicons
                                name="pause-circle-outline"
                                size={13}
                                color={C.amber}
                            />
                            <Text style={st.holdBadgeText}>On Hold</Text>
                        </View>
                    )}
                </View>

                {controls.keypadVisible ? (
                    <View style={st.controlsPanel}>
                        <View style={st.panelHeader}>
                            <Text style={st.panelTitle}>Dial Pad</Text>
                            <Text style={st.panelSubTitle}>
                                Tap digits to send input
                            </Text>
                        </View>
                        <View style={st.kpWrap}>
                            <View style={st.kpDisplay}>
                                <Text style={st.kpDisplayTxt}>
                                    {controls.keypadDigits || " "}
                                </Text>
                                {controls.keypadDigits.length > 0 && (
                                    <TouchableOpacity
                                        onPress={() => onToggleKeypad?.(false)}>
                                        <Ionicons
                                            name="close-outline"
                                            size={20}
                                            color="rgba(255,255,255,0.55)"
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={st.kpGrid}>
                                {[
                                    ["1", ""],
                                    ["2", "ABC"],
                                    ["3", "DEF"],
                                    ["4", "GHI"],
                                    ["5", "JKL"],
                                    ["6", "MNO"],
                                    ["7", "PQRS"],
                                    ["8", "TUV"],
                                    ["9", "WXYZ"],
                                    ["*", ""],
                                    ["0", "+"],
                                    ["#", ""],
                                ].map(([l, s]) => (
                                    <TouchableOpacity
                                        key={l}
                                        style={st.kpKey}
                                        activeOpacity={0.7}
                                        onPress={() => onPressKeypad?.(l)}>
                                        <Text style={st.kpKeyLabel}>{l}</Text>
                                        {s ? (
                                            <Text style={st.kpKeySub}>{s}</Text>
                                        ) : null}
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity
                                style={{ alignSelf: "center", padding: 10 }}
                                onPress={() => onToggleKeypad?.(false)}>
                                <Ionicons
                                    name="chevron-down"
                                    size={22}
                                    color="rgba(255,255,255,0.6)"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={st.controlsPanel}>
                        <View style={st.panelHeader}>
                            <Text style={st.panelTitle}>Call Controls</Text>
                            <Text style={st.panelSubTitle}>
                                Quick access to audio and keypad actions
                            </Text>
                        </View>
                        <Animated.View
                            style={[
                                st.ctrlGrid,
                                { transform: [{ translateY: slideY }] },
                            ]}>
                            <CtrlBtn
                                icon={
                                    controls.muted ? "mic-off" : "mic-outline"
                                }
                                label={controls.muted ? "Unmute" : "Mute"}
                                active={controls.muted}
                                activeColor="rgba(220,38,38,0.45)"
                                onPress={() => onToggleMute?.(!controls.muted)}
                            />
                            <CtrlBtn
                                icon={
                                    controls.speaker
                                        ? "volume-high"
                                        : "volume-medium-outline"
                                }
                                label="Speaker"
                                active={controls.speaker}
                                activeColor="rgba(37,99,235,0.45)"
                                onPress={() =>
                                    onToggleSpeaker?.(!controls.speaker)
                                }
                            />
                            <CtrlBtn
                                icon="keypad-outline"
                                label="Keypad"
                                onPress={() => onToggleKeypad?.(true)}
                            />
                            <CtrlBtn
                                icon={
                                    controls.onHold
                                        ? "play-circle-outline"
                                        : "pause-circle-outline"
                                }
                                label={controls.onHold ? "Resume" : "Hold"}
                                active={controls.onHold}
                                activeColor="rgba(217,119,6,0.45)"
                                onPress={() => onToggleHold?.(!controls.onHold)}
                            />
                            <CtrlBtn
                                icon="call-outline"
                                label="Dialer"
                                onPress={onMinimize}
                            />
                            <CtrlBtn
                                icon="radio-outline"
                                label="Live Sync"
                                active
                                activeColor="rgba(16,185,129,0.32)"
                            />
                        </Animated.View>
                    </View>
                )}

                {!controls.keypadVisible && (
                    <View style={st.endCallWrap}>
                        <TouchableOpacity
                            style={st.endCallBtn}
                            onPress={handleEnd}
                            activeOpacity={0.85}>
                            <Ionicons
                                name="call"
                                size={30}
                                color="#FFF"
                                style={{ transform: [{ rotate: "135deg" }] }}
                            />
                        </TouchableOpacity>
                        <Text style={st.endCallText}>Close Panel</Text>
                    </View>
                )}
            </LinearGradient>
        </Animated.View>
    );
};

export default function CallLogScreen({ navigation }) {
    const swipeHandlers = useSwipeNavigation("CallLog", navigation);
    const { user } = useAuth();
    const debounceRef = useRef(null);
    const hasLoadedRef = useRef(false);
    const skipFocusRef = useRef(true);
    const activeCallRef = useRef(null);
    const unsupportedToastRef = useRef(false);
    const { width: W, height: H } = useWindowDimensions();

    const [callLogs, setCallLogs] = useState([]);
    const [statistics, setStatistics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [callTypeFilter, setCallTypeFilter] = useState("All");
    const [timePeriodFilter, setTimePeriodFilter] = useState("All");
    const [historyVisible, setHistoryVisible] = useState(false);
    const [historyTitle, setHistoryTitle] = useState("");
    const [historyLogs, setHistoryLogs] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [activeCall, setActiveCall] = useState(null);
    const [callMinimized, setCallMinimized] = useState(false);
    const [callTick, setCallTick] = useState(0);

    // post‑call modal state (triggered after outgoing/incoming call ends)
    const [callModalVisible, setCallModalVisible] = useState(false);
    const [callEnquiry, setCallEnquiry] = useState(null);
    const [autoCallData, setAutoCallData] = useState(null);
    const [autoDuration, setAutoDuration] = useState(0);
    const [pendingCall, setPendingCall] = useState(null);

    useEffect(() => {
        activeCallRef.current = activeCall;
    }, [activeCall]);

    useEffect(() => {
        if (!activeCall) return undefined;
        const id = setInterval(() => setCallTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [activeCall]);

    useEffect(() => {
        if (activeCall?.status !== "dialing") return undefined;
        const id = setTimeout(() => {
            setActiveCall((prev) =>
                prev ? { ...prev, status: "active", tick: Date.now() } : prev,
            );
        }, 1800);
        return () => clearTimeout(id);
    }, [activeCall?.status]);

    const fetchCallData = useCallback(
        async ({ refresh = false } = {}) => {
            try {
                if (refresh) setIsRefreshing(true);
                else if (!hasLoadedRef.current) setIsLoading(true);
                const [logsRes, statsRes] = await Promise.all([
                    callLogService.getCallLogs({
                        type: callTypeFilter === "All" ? "" : callTypeFilter,
                        filter: timePeriodFilter,
                        search: searchQuery,
                        limit: 200,
                    }),
                    callLogService.getCallStats({ filter: timePeriodFilter }),
                ]);
                setCallLogs(Array.isArray(logsRes?.data) ? logsRes.data : []);
                setStatistics(statsRes?.summary || statsRes || null);
                hasLoadedRef.current = true;
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [callTypeFilter, timePeriodFilter, searchQuery],
    );

    useEffect(() => {
        const t = setTimeout(fetchCallData, 300);
        return () => clearTimeout(t);
    }, [fetchCallData]);
    useFocusEffect(
        useCallback(() => {
            if (skipFocusRef.current) {
                skipFocusRef.current = false;
                return;
            }
            fetchCallData();
        }, [fetchCallData]),
    );
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            "CALL_LOG_CREATED",
            (payload) => {
                if (payload?.type === "BATCH_SYNC") {
                    clearTimeout(debounceRef.current);
                    debounceRef.current = setTimeout(fetchCallData, 300);
                    return;
                }
                if (!payload?._id && !payload?.phoneNumber) return;
                setCallLogs((prev) => {
                    const idx = prev.findIndex(
                        (i) =>
                            (payload?._id && i?._id === payload._id) ||
                            (i?.phoneNumber === payload?.phoneNumber &&
                                String(i?.callTime) ===
                                    String(payload?.callTime)),
                    );
                    if (idx !== -1) {
                        const n = [...prev];
                        n[idx] = { ...n[idx], ...payload };
                        return n;
                    }
                    return [payload, ...prev].slice(0, 200);
                });
            },
        );
        return () => {
            sub.remove();
            clearTimeout(debounceRef.current);
        };
    }, [fetchCallData]);

    const updateActiveCallState = useCallback((patch) => {
        setActiveCall((prev) => (prev ? { ...prev, ...patch } : prev));
    }, []);

    const closeActiveSession = useCallback(async (reason, payload = {}) => {
        const currentCall = activeCallRef.current;
        if (!currentCall?.sessionId) {
            setActiveCall(null);
            setCallMinimized(false);
            return;
        }

        try {
            await callLogService.endCallSession(currentCall.sessionId, {
                reason,
                status: reason === "dismissed" ? "dismissed" : "ended",
                duration: payload.duration,
                callType: payload.callType,
                endedAt: payload.endedAt || new Date().toISOString(),
            });
        } catch (error) {
            console.error("End call session failed:", error);
        } finally {
            setActiveCall(null);
            setCallMinimized(false);
        }
    }, []);

    // --- helper to persist call log after modal
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
            setAutoDuration(0);
            DeviceEventEmitter.emit("CALL_LOG_CREATED", savedLog);
            fetchCallData({ refresh: true });
        } catch (error) {
            console.error("Error logging call:", error);
        }
    };

    useEffect(() => {
        const sessionSub = DeviceEventEmitter.addListener(
            "CALL_SESSION_UPDATED",
            (payload) => {
                if (!payload?._id) return;
                const currentCall = activeCallRef.current;
                if (
                    !currentCall?.sessionId ||
                    currentCall.sessionId !== payload._id
                )
                    return;

                updateActiveCallState({
                    status: payload.status || currentCall.status,
                    muted: !!payload.controls?.muted,
                    speaker: !!payload.controls?.speaker,
                    onHold: !!payload.controls?.onHold,
                    keypadVisible: !!payload.controls?.keypadVisible,
                    keypadDigits: payload.controls?.keypadDigits || "",
                    tick: Date.now(),
                });
            },
        );

        const endSub = DeviceEventEmitter.addListener(
            "CALL_ENDED",
            (payload) => {
                const endedDigits = formatPhoneNumber(payload?.phoneNumber);
                // if we were waiting for an outgoing/incoming call to finish
                if (
                    pendingCall &&
                    endedDigits &&
                    endedDigits === formatPhoneNumber(pendingCall.phoneNumber)
                ) {
                    // claim event so monitor doesn't auto-log
                    global.__callClaimedByScreen = true;
                    setAutoCallData({
                        callType: payload.callType,
                        duration: payload.duration,
                    });
                    setAutoDuration(payload.duration || 0);
                    setCallEnquiry(pendingCall.enquiry);
                    setCallModalVisible(true);
                    setPendingCall(null);
                    return;
                }

                const currentCall = activeCallRef.current;
                if (!currentCall?.phoneNumber) return;
                const currentDigits = formatPhoneNumber(
                    currentCall.phoneNumber,
                );
                if (
                    currentDigits &&
                    endedDigits &&
                    currentDigits !== endedDigits
                )
                    return;
                closeActiveSession("completed", payload || {});
            },
        );

        return () => {
            sessionSub.remove();
            endSub.remove();
        };
    }, [closeActiveSession, updateActiveCallState, pendingCall, fetchCallData]);

    const flatData = useMemo(() => {
        const sorted = [...callLogs].sort(
            (a, b) => new Date(b?.callTime || 0) - new Date(a?.callTime || 0),
        );
        const groups = {};
        sorted.forEach((item) => {
            const d = new Date(item?.callTime),
                now = new Date();
            let sec = "Earlier";
            if (d.toDateString() === now.toDateString()) sec = "Today";
            else if (
                d.toDateString() === new Date(now - 86400000).toDateString()
            )
                sec = "Yesterday";
            if (!groups[sec]) groups[sec] = [];
            groups[sec].push(item);
        });
        const flat = [];
        ["Today", "Yesterday", "Earlier"].forEach((key) => {
            if (groups[key]) {
                flat.push({ type: "header", title: key, key: `h-${key}` });
                groups[key].forEach((item) =>
                    flat.push({
                        type: "item",
                        ...item,
                        key: item._id || `${item.phoneNumber}-${item.callTime}`,
                    }),
                );
            }
        });
        return flat;
    }, [callLogs]);

    const warnControlFallback = () => {
        if (unsupportedToastRef.current) return;
        unsupportedToastRef.current = true;
        showToast("Server synced. Native audio control needs in-call manager.");
    };

    const syncSessionControl = useCallback(
        async (action, value, extra = {}) => {
            const currentCall = activeCallRef.current;
            if (!currentCall?.sessionId) return;

            const patch = { tick: Date.now() };
            if (action === "mute") patch.muted = !!value;
            if (action === "speaker") patch.speaker = !!value;
            if (action === "hold") {
                patch.onHold = !!value;
                patch.status = value ? "held" : "active";
            }
            if (action === "keypad") patch.keypadVisible = !!value;
            if (action === "dtmf") {
                patch.keypadDigits =
                    `${currentCall.keypadDigits || ""}${String(value || "")}`.slice(
                        -32,
                    );
            }

            updateActiveCallState(patch);

            try {
                const session = await callLogService.updateCallSessionControl(
                    currentCall.sessionId,
                    {
                        action,
                        value,
                        digits: extra.digits,
                        nativeApplied: extra.nativeApplied,
                        nativeSupported: extra.nativeSupported,
                        status: extra.status,
                    },
                );
                if (session?._id) {
                    updateActiveCallState({
                        status: session.status,
                        muted: !!session.controls?.muted,
                        speaker: !!session.controls?.speaker,
                        onHold: !!session.controls?.onHold,
                        keypadVisible: !!session.controls?.keypadVisible,
                        keypadDigits: session.controls?.keypadDigits || "",
                        tick: Date.now(),
                    });
                }
            } catch (error) {
                console.error("Call session control update failed:", error);
                showToast("Could not sync call control", true);
            }
        },
        [updateActiveCallState],
    );

    const initiateCall = async (item) => {
        const digits = (item?.phoneNumber || "").replace(/\D/g, "");
        if (!digits) return;
        // remember enquiry so we can show post‑call modal when call ends
        setPendingCall({ phoneNumber: digits, enquiry: item });
        try {
            if (
                Platform.OS === "android" &&
                RNImmediatePhoneCall?.immediatePhoneCall
            )
                return RNImmediatePhoneCall.immediatePhoneCall(digits);
            await Linking.openURL(`tel:${digits}`);
        } catch {
            showToast("Could not initiate call", true);
        }
    };

    const openCallHistory = async (callItem) => {
        const phoneKey = formatPhoneNumber(callItem?.phoneNumber);
        if (!phoneKey) return;
        setHistoryTitle(
            callItem?.contactName || callItem?.phoneNumber || "History",
        );
        setHistoryVisible(true);
        setHistoryLoading(true);
        try {
            const res = await callLogService.getCallLogs({
                search: phoneKey,
                filter: "All",
                limit: 500,
            });
            const data = Array.isArray(res?.data) ? res.data : [];
            setHistoryLogs(
                data
                    .filter(
                        (i) => formatPhoneNumber(i?.phoneNumber) === phoneKey,
                    )
                    .sort(
                        (a, b) => new Date(b.callTime) - new Date(a.callTime),
                    ),
            );
        } catch {
            setHistoryLogs([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleMuteToggle = async (enabled) => {
        const nativeApplied = await setCallMuted(enabled);
        if (!nativeApplied) warnControlFallback();
        syncSessionControl("mute", enabled, {
            nativeApplied,
            nativeSupported: getInCallControlSupport().mute,
        });
    };

    const handleSpeakerToggle = async (enabled) => {
        const nativeApplied = await setCallSpeaker(enabled);
        if (!nativeApplied) warnControlFallback();
        syncSessionControl("speaker", enabled, {
            nativeApplied,
            nativeSupported: getInCallControlSupport().speaker,
        });
    };

    const handleHoldToggle = async (enabled) => {
        const nativeApplied = await setCallHold(enabled);
        if (!nativeApplied) warnControlFallback();
        syncSessionControl("hold", enabled, {
            nativeApplied,
            nativeSupported: getInCallControlSupport().hold,
            status: enabled ? "held" : "active",
        });
    };

    const handleKeypadToggle = (enabled) => {
        syncSessionControl("keypad", enabled, {
            nativeApplied: true,
            nativeSupported: true,
            status:
                activeCallRef.current?.status === "dialing"
                    ? "active"
                    : undefined,
        });
    };

    const handleKeypadPress = async (digit) => {
        const nativeApplied = await sendCallDtmf(digit);
        if (!nativeApplied && getInCallControlSupport().dtmf) {
            showToast("DTMF tone could not be sent", true);
        }
        syncSessionControl("dtmf", digit, {
            digits: digit,
            nativeApplied,
            nativeSupported: getInCallControlSupport().dtmf,
            status:
                activeCallRef.current?.status === "dialing"
                    ? "active"
                    : undefined,
        });
    };

    const syncCallLogs = async () => {
        if (Platform.OS === "web") return;
        if (isExpoGo()) {
            showToast("Sync needs a production build", true);
            return;
        }
        setIsSyncing(true);
        try {
            const { default: CallLog } = require("react-native-call-log");
            if (!CallLog?.load) throw new Error("Not available");
            const logs = await CallLog.load(200, {
                minTimestamp: Date.now() - 7 * 86400000,
            });
            if (!logs?.length) return showToast("No new records");
            const r = await callLogService.syncCallLogs(logs);
            showToast(`Synced ${r?.synced || 0} calls`);
            fetchCallData();
        } catch (e) {
            showToast(`Sync failed: ${e?.message || "Unknown"}`, true);
        } finally {
            setIsSyncing(false);
        }
    };

    const renderRightAction = (item) => (
        <TouchableOpacity
            style={st.swipeCall}
            activeOpacity={0.85}
            onPress={() => initiateCall(item)}>
            <View style={st.swipeCallInner}>
                <Ionicons name="call" size={20} color={C.white} />
            </View>
        </TouchableOpacity>
    );

    const renderItem = ({ item }) => {
        if (item.type === "header")
            return <Text style={st.sectionHeader}>{item.title}</Text>;
        const type = getTypeConfig(item?.callType);
        const name = item?.contactName || item?.phoneNumber || "Unknown";
        const isUnknown = !item?.contactName;
        return (
            <Swipeable
                overshootRight={false}
                renderRightActions={() => renderRightAction(item)}>
                <TouchableOpacity
                    style={st.callRow}
                    activeOpacity={0.72}
                    onPress={() => openCallHistory(item)}>
                    <View style={st.callAvatarWrap}>
                        {isUnknown ? (
                            <View style={st.unknownAv}>
                                <Ionicons
                                    name="person-outline"
                                    size={18}
                                    color={C.textTer}
                                />
                            </View>
                        ) : (
                            <Avatar name={name} size={44} />
                        )}
                        <View
                            style={[
                                st.typeDot,
                                { backgroundColor: type.color },
                            ]}
                        />
                    </View>
                    <View style={st.callInfo}>
                        <Text
                            style={[
                                st.rowCallName,
                                item?.callType === "Missed" && { color: C.red },
                            ]}
                            numberOfLines={1}>
                            {name}
                        </Text>
                        <View style={st.callMeta}>
                            <View
                                style={[
                                    st.typePill,
                                    { backgroundColor: type.bg },
                                ]}>
                                <Ionicons
                                    name={type.icon}
                                    size={10}
                                    color={type.color}
                                />
                                <Text
                                    style={[
                                        st.typePillText,
                                        { color: type.color },
                                    ]}>
                                    {type.label}
                                </Text>
                            </View>
                            {item?.duration > 0 && (
                                <Text style={st.durText}>
                                    {formatDuration(item.duration)}
                                </Text>
                            )}
                        </View>
                        <Text style={st.phoneText} numberOfLines={1}>
                            {isUnknown
                                ? item?.phoneNumber
                                : item?.phoneNumber || "–"}
                        </Text>
                    </View>
                    <View style={st.callRight}>
                        <Text style={st.callTime}>
                            {formatDate(item?.callTime)}
                        </Text>
                        <TouchableOpacity
                            style={st.callBtnSmall}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => initiateCall(item)}>
                            <Ionicons name="call" size={15} color={C.green} />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    const StatsHeader = () => (
        <View style={st.statsHeader}>
            <LinearGradient
                colors={["#EFF6FF", "#DBEAFE", "#F0F9FF"]}
                style={st.heroCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}>
                <View>
                    <Text style={st.heroEyebrow}>CRM Call Logs</Text>
                    <Text style={st.heroValue}>
                        {statistics?.totalCalls || 0}
                    </Text>
                    <Text style={st.heroLabel}>
                        Total Calls · {timePeriodFilter}
                    </Text>
                </View>
                <View style={{ gap: 8, alignItems: "flex-end" }}>
                    <View style={st.realtimeBadge}>
                        <View
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: C.greenCall,
                            }}
                        />
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: C.green,
                            }}>
                            Realtime
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={st.syncBtn}
                        onPress={syncCallLogs}
                        activeOpacity={0.8}>
                        {isSyncing ? (
                            <ActivityIndicator size="small" color={C.primary} />
                        ) : (
                            <>
                                <Ionicons
                                    name="sync-outline"
                                    size={14}
                                    color={C.primary}
                                />
                                <Text
                                    style={{
                                        fontSize: 12,
                                        fontWeight: "700",
                                        color: C.primary,
                                    }}>
                                    Sync
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            <View style={st.statsRow}>
                {[
                    {
                        key: "today",
                        label: "Today",
                        value: statistics?.todayCalls || 0,
                        color: C.primary,
                        bg: C.primaryLight,
                        icon: "today-outline",
                    },
                    {
                        key: "missed",
                        label: "Missed",
                        value: statistics?.missed || 0,
                        color: C.red,
                        bg: C.redLight,
                        icon: "close-circle-outline",
                    },
                    {
                        key: "outgoing",
                        label: "Outgoing",
                        value: statistics?.outgoing || 0,
                        color: C.green,
                        bg: C.greenLight,
                        icon: "arrow-up-circle-outline",
                    },
                ].map((s) => (
                    <View
                        key={s.key}
                        style={[st.statCard, { borderTopColor: s.color }]}>
                        <View style={[st.statIcon, { backgroundColor: s.bg }]}>
                            <Ionicons name={s.icon} size={15} color={s.color} />
                        </View>
                        <Text style={[st.statValue, { color: s.color }]}>
                            {s.value}
                        </Text>
                        <Text style={st.statLabel}>{s.label}</Text>
                    </View>
                ))}
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.timeRow}>
                {TIME_PERIODS.map((p) => {
                    const active = timePeriodFilter === p.key;
                    return (
                        <TouchableOpacity
                            key={p.key}
                            style={[st.timeChip, active && st.timeChipActive]}
                            onPress={() => setTimePeriodFilter(p.key)}>
                            <Text
                                style={[
                                    st.timeChipTxt,
                                    active && st.timeChipTxtActive,
                                ]}>
                                {p.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );

    return (
        <SafeAreaView style={st.container} edges={["top"]} {...swipeHandlers}>
            <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

            {/* Search */}
            <View style={st.searchWrap}>
                <View
                    style={[
                        st.searchBar,
                        searchFocused && st.searchBarFocused,
                    ]}>
                    <Ionicons
                        name="search-outline"
                        size={17}
                        color={C.textTer}
                        style={{ marginRight: 8 }}
                    />
                    <TextInput
                        style={st.searchInput}
                        placeholder="Search name or number…"
                        placeholderTextColor={C.textTer}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                    />
                    {searchQuery ? (
                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                            <Ionicons
                                name="close-circle"
                                size={17}
                                color={C.textTer}
                            />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Type Chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.chipsRow}
                style={st.chipsScroll}>
                {FILTER_TYPES.map((type) => {
                    const active = callTypeFilter === type;
                    return (
                        <TouchableOpacity
                            key={type}
                            style={[st.chip, active && st.chipActive]}
                            onPress={() => setCallTypeFilter(type)}
                            activeOpacity={0.8}>
                            <Text
                                style={[
                                    st.chipTxt,
                                    active && st.chipTxtActive,
                                ]}>
                                {type}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {isLoading && !isRefreshing ? (
                <View style={st.loadingWrap}>
                    <ActivityIndicator size="large" color={C.primary} />
                    <Text style={st.loadingTxt}>Loading calls…</Text>
                </View>
            ) : (
                <FlatList
                    data={flatData}
                    renderItem={renderItem}
                    keyExtractor={(item, i) => item.key || item._id || `${i}`}
                    contentContainerStyle={st.listContent}
                    ListHeaderComponent={<StatsHeader />}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={() => fetchCallData({ refresh: true })}
                            tintColor={C.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View style={st.emptyWrap}>
                            <View style={st.emptyIcon}>
                                <Ionicons
                                    name="call-outline"
                                    size={28}
                                    color={C.textTer}
                                />
                            </View>
                            <Text style={st.emptyTitle}>No calls found</Text>
                            <Text style={st.emptyTxt}>
                                Adjust filters or sync your device calls.
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Minimized Call Bar */}
            {activeCall && callMinimized && (
                <TouchableOpacity
                    style={st.miniBar}
                    onPress={() => setCallMinimized(false)}
                    activeOpacity={0.9}>
                    <LinearGradient
                        colors={[C.callBg1, C.callBg2]}
                        style={st.miniGrad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                            }}>
                            <View
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 4,
                                    backgroundColor: C.greenCall,
                                }}
                            />
                            <Avatar
                                name={
                                    activeCall.contactName ||
                                    activeCall.phoneNumber
                                }
                                size={30}
                            />
                            <View>
                                <Text
                                    style={{
                                        fontSize: 14,
                                        fontWeight: "700",
                                        color: "#FFF",
                                    }}>
                                    {activeCall.contactName || "Unknown"}
                                </Text>
                                <Text
                                    style={{
                                        fontSize: 11,
                                        color: "rgba(255,255,255,0.5)",
                                    }}>
                                    On Call · tap to open
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={st.miniEndBtn}
                            onPress={() => closeActiveSession("dismissed")}>
                            <Ionicons
                                name="call"
                                size={16}
                                color="#FFF"
                                style={{ transform: [{ rotate: "135deg" }] }}
                            />
                        </TouchableOpacity>
                    </LinearGradient>
                </TouchableOpacity>
            )}

            {/* Active Call Overlay */}
            {activeCall && !callMinimized && (
                <Modal
                    visible
                    transparent
                    animationType="none"
                    statusBarTranslucent>
                    <EnhancedActiveCallScreen
                        call={{ ...activeCall, tick: callTick }}
                        onEnd={() => closeActiveSession("dismissed")}
                        onMinimize={() => setCallMinimized(true)}
                        onToggleMute={handleMuteToggle}
                        onToggleSpeaker={handleSpeakerToggle}
                        onToggleHold={handleHoldToggle}
                        onToggleKeypad={handleKeypadToggle}
                        onPressKeypad={handleKeypadPress}
                    />
                </Modal>
            )}

            {/* Post‑call modal (appears after outgoing/incoming calls) */}
            <PostCallModal
                visible={callModalVisible}
                enquiry={callEnquiry}
                onSave={handleSaveCallLog}
                autoCallData={autoCallData}
                initialDuration={autoDuration}
                onCancel={() => {
                    setCallModalVisible(false);
                    setCallEnquiry(null);
                    setAutoCallData(null);
                    setAutoDuration(0);
                    setPendingCall(null);
                }}
            />

            {/* History Modal */}
            <Modal
                visible={historyVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setHistoryVisible(false)}>
                <View style={st.modalOverlay}>
                    <View
                        style={[
                            st.modalSheet,
                            {
                                maxHeight: H * 0.85,
                                width: Math.min(W - 16, 600),
                            },
                        ]}>
                        <View style={st.sheetHandle} />
                        <View style={st.modalHead}>
                            <View>
                                <Text style={st.modalName}>{historyTitle}</Text>
                                <Text style={st.modalSub}>Call history</Text>
                            </View>
                            <TouchableOpacity
                                style={st.modalClose}
                                onPress={() => setHistoryVisible(false)}>
                                <Ionicons
                                    name="close"
                                    size={17}
                                    color={C.textSec}
                                />
                            </TouchableOpacity>
                        </View>
                        <View style={st.modalActions}>
                            {[
                                {
                                    icon: "call",
                                    label: "Call back",
                                    color: C.greenCall,
                                    bg: C.greenLight,
                                    action: () => {
                                        const n = historyLogs[0];
                                        if (n) {
                                            setHistoryVisible(false);
                                            initiateCall(n);
                                        }
                                    },
                                },
                                {
                                    icon: "chatbubble-outline",
                                    label: "Message",
                                    color: C.primary,
                                    bg: C.primaryLight,
                                    action: () => setHistoryVisible(false),
                                },
                                {
                                    icon: "person-add-outline",
                                    label: "Add Contact",
                                    color: C.violet,
                                    bg: C.violetLight,
                                    action: () => {},
                                },
                            ].map((a) => (
                                <TouchableOpacity
                                    key={a.label}
                                    style={st.modalAction}
                                    onPress={a.action}>
                                    <View
                                        style={[
                                            st.modalActionIcon,
                                            { backgroundColor: a.bg },
                                        ]}>
                                        <Ionicons
                                            name={a.icon}
                                            size={20}
                                            color={a.color}
                                        />
                                    </View>
                                    <Text style={st.modalActionLbl}>
                                        {a.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={st.divider} />
                        {historyLoading ? (
                            <View
                                style={{
                                    paddingVertical: 24,
                                    alignItems: "center",
                                }}>
                                <ActivityIndicator
                                    size="small"
                                    color={C.primary}
                                />
                            </View>
                        ) : (
                            <FlatList
                                data={historyLogs}
                                style={{ maxHeight: Math.min(H * 0.4, 360) }}
                                keyExtractor={(item, i) =>
                                    item?._id || `${item?.callTime}-${i}`
                                }
                                renderItem={({ item }) => {
                                    const type = getTypeConfig(item?.callType);
                                    return (
                                        <View style={st.histRow}>
                                            <View
                                                style={[
                                                    st.histIcon,
                                                    {
                                                        backgroundColor:
                                                            type.bg,
                                                    },
                                                ]}>
                                                <Ionicons
                                                    name={type.icon}
                                                    size={13}
                                                    color={type.color}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={[
                                                        st.histType,
                                                        {
                                                            color:
                                                                item?.callType ===
                                                                "Missed"
                                                                    ? C.red
                                                                    : C.text,
                                                        },
                                                    ]}>
                                                    {type.label}
                                                </Text>
                                                <Text style={st.histMeta}>
                                                    {formatDate(item?.callTime)}{" "}
                                                    ·{" "}
                                                    {formatTime(item?.callTime)}
                                                    {item?.duration > 0
                                                        ? ` · ${formatDuration(item.duration)}`
                                                        : ""}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                style={st.histCallBtn}
                                                onPress={() => {
                                                    setHistoryVisible(false);
                                                    initiateCall(item);
                                                }}>
                                                <Ionicons
                                                    name="call-outline"
                                                    size={15}
                                                    color={C.green}
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                }}
                                ListEmptyComponent={
                                    <Text
                                        style={{
                                            textAlign: "center",
                                            padding: 24,
                                            color: C.textSec,
                                            fontSize: 13,
                                        }}>
                                        No history available.
                                    </Text>
                                }
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },

    searchWrap: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 6,
        backgroundColor: C.surface,
    },
    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.bg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.outline,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    searchBarFocused: { borderColor: C.primary, backgroundColor: C.surface },
    searchInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 0 },

    chipsScroll: { maxHeight: 46, backgroundColor: C.surface },
    chipsRow: {
        paddingHorizontal: 14,
        paddingBottom: 8,
        paddingTop: 2,
        gap: 8,
        alignItems: "center",
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.outline,
    },
    chipActive: { backgroundColor: C.primaryLight, borderColor: C.primary },
    chipTxt: { fontSize: 13, fontWeight: "500", color: C.textSec },
    chipTxtActive: { color: C.primary, fontWeight: "700" },

    statsHeader: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 8,
        gap: 12,
    },
    heroCard: {
        borderRadius: 22,
        padding: 18,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        borderWidth: 1,
        borderColor: C.primaryMid,
    },
    heroEyebrow: {
        fontSize: 11,
        fontWeight: "700",
        color: C.primary,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    heroValue: {
        fontSize: 40,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -1,
    },
    heroLabel: {
        fontSize: 13,
        fontWeight: "500",
        color: C.textSec,
        marginTop: 2,
    },
    realtimeBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.greenLight,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    syncBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.primaryLight,
        borderWidth: 1,
        borderColor: C.primaryMid,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },

    statsRow: { flexDirection: "row", gap: 10 },
    statCard: {
        flex: 1,
        backgroundColor: C.surface,
        borderRadius: 18,
        padding: 12,
        alignItems: "center",
        gap: 5,
        borderWidth: 1,
        borderColor: C.outline,
        borderTopWidth: 3,
    },
    statIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
    },
    statValue: { fontSize: 22, fontWeight: "800" },
    statLabel: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textSec,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },

    timeRow: { gap: 8, paddingVertical: 2 },
    timeChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.outline,
    },
    timeChipActive: { backgroundColor: C.primaryLight, borderColor: C.primary },
    timeChipTxt: { fontSize: 12, fontWeight: "500", color: C.textSec },
    timeChipTxtActive: { color: C.primary, fontWeight: "700" },

    sectionHeader: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textTer,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: C.bg,
    },

    listContent: { paddingBottom: 100 },
    callRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 11,
        backgroundColor: C.surface,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.outline,
    },
    callAvatarWrap: { position: "relative" },
    unknownAv: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: C.bg,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: C.outline,
    },
    typeDot: {
        position: "absolute",
        bottom: 1,
        right: 1,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: C.surface,
    },
    callInfo: { flex: 1, minWidth: 0, gap: 3 },
    rowCallName: { fontSize: 15, fontWeight: "600", color: C.text },
    callMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
    typePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 10,
    },
    typePillText: { fontSize: 10, fontWeight: "700" },
    durText: { fontSize: 11, color: C.textTer },
    phoneText: { fontSize: 12, color: C.textTer },
    callRight: { alignItems: "flex-end", gap: 6 },
    callTime: { fontSize: 11, color: C.textSec },
    callBtnSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.greenLight,
        alignItems: "center",
        justifyContent: "center",
    },

    swipeCall: {
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
    },
    swipeCallInner: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: C.greenCall,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: C.greenCall,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 4,
    },

    loadingWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
        gap: 10,
    },
    loadingTxt: { fontSize: 13, color: C.textTer },
    emptyWrap: {
        paddingTop: 60,
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 32,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: C.bg,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    emptyTitle: { fontSize: 16, fontWeight: "600", color: C.text },
    emptyTxt: { fontSize: 13, color: C.textSec, textAlign: "center" },

    // Minimized bar
    miniBar: {
        position: "absolute",
        bottom: 16,
        left: 12,
        right: 12,
        borderRadius: 18,
        overflow: "hidden",
        elevation: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
    },
    miniGrad: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    miniEndBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.redCall,
        alignItems: "center",
        justifyContent: "center",
    },

    // Active call overlay
    callTopBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        paddingTop: Platform.OS === "ios" ? 50 : 30,
        paddingHorizontal: 20,
    },
    callGlowTop: {
        position: "absolute",
        top: -60,
        right: -20,
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: "rgba(37,99,235,0.16)",
    },
    callGlowBottom: {
        position: "absolute",
        bottom: 140,
        left: -50,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: "rgba(16,185,129,0.10)",
    },
    minimizeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    minimizeText: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
    callPill: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: C.greenCall,
        marginRight: 5,
    },
    callPillText: {
        fontSize: 11,
        fontWeight: "700",
        color: "rgba(255,255,255,0.5)",
    },
    callAvatarArea: {
        alignItems: "center",
        justifyContent: "center",
        height: 150,
        marginBottom: 20,
    },
    callHeroBlock: {
        alignItems: "center",
        paddingHorizontal: 20,
        marginBottom: 14,
    },
    callHeroEyebrow: {
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 1.6,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.48)",
    },
    callHeroDivider: {
        width: 64,
        height: 4,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.12)",
        marginTop: 10,
    },
    callAvatarBorder: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
    callIdentity: { alignItems: "center", gap: 5, marginBottom: 36 },
    callName: {
        fontSize: 30,
        fontWeight: "700",
        color: "#FFF",
        letterSpacing: -0.5,
    },
    callPhone: { fontSize: 15, color: "rgba(255,255,255,0.55)" },
    callTimer: {
        fontSize: 24,
        fontWeight: "200",
        color: "rgba(255,255,255,0.9)",
        letterSpacing: 3,
        marginTop: 4,
    },
    activeCallIdentity: {
        alignItems: "center",
        gap: 6,
        marginBottom: 26,
        paddingHorizontal: 22,
    },
    activeCallName: {
        fontSize: 30,
        fontWeight: "700",
        color: "#FFF",
        letterSpacing: -0.5,
    },
    activeCallPhone: { fontSize: 15, color: "rgba(255,255,255,0.55)" },
    activeCallTimer: {
        fontSize: 24,
        fontWeight: "200",
        color: "rgba(255,255,255,0.9)",
        letterSpacing: 3,
        marginTop: 4,
    },
    activeCallHint: {
        maxWidth: 280,
        textAlign: "center",
        fontSize: 12,
        lineHeight: 18,
        color: "rgba(255,255,255,0.52)",
        marginTop: 2,
        marginBottom: 4,
    },
    activeMetaRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 8,
        marginTop: 6,
    },
    activeMetaChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    activeMetaText: {
        fontSize: 11,
        fontWeight: "700",
        color: "rgba(255,255,255,0.8)",
    },
    holdBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "rgba(217,119,6,0.18)",
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        marginTop: 4,
    },
    holdBadgeText: { fontSize: 12, fontWeight: "700", color: C.amber },
    controlsPanel: {
        marginHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 18,
        borderRadius: 28,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: 8,
    },
    panelHeader: {
        alignItems: "center",
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    panelTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: "#FFF",
    },
    panelSubTitle: {
        fontSize: 12,
        color: "rgba(255,255,255,0.5)",
        marginTop: 4,
        textAlign: "center",
    },

    ctrlGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 14,
        paddingHorizontal: 14,
    },
    ctrlItem: { width: "30%", alignItems: "center", gap: 7 },
    ctrlCircle: {
        width: 66,
        height: 66,
        borderRadius: 33,
        backgroundColor: "rgba(255,255,255,0.09)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
    },
    ctrlLbl: {
        fontSize: 11,
        fontWeight: "700",
        color: "rgba(255,255,255,0.45)",
        textAlign: "center",
    },

    endCallWrap: { alignItems: "center", marginTop: 18 },
    endCallBtn: {
        width: 74,
        height: 74,
        borderRadius: 37,
        backgroundColor: C.redCall,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: C.redCall,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
        elevation: 10,
    },
    endCallText: {
        fontSize: 12,
        color: "rgba(255,255,255,0.4)",
        marginTop: 8,
    },

    kpWrap: { paddingHorizontal: 20, gap: 10 },
    kpDisplay: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        paddingBottom: 10,
        marginHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.1)",
    },
    kpDisplayTxt: {
        fontSize: 28,
        fontWeight: "200",
        color: "#FFF",
        letterSpacing: 6,
        minWidth: 120,
        textAlign: "center",
    },
    kpGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        paddingTop: 6,
    },
    kpKey: {
        width: "33.33%",
        alignItems: "center",
        paddingVertical: 12,
        gap: 1,
    },
    kpKeyLabel: { fontSize: 26, fontWeight: "300", color: "#FFF" },
    kpKeySub: {
        fontSize: 9,
        fontWeight: "700",
        color: "rgba(255,255,255,0.35)",
        letterSpacing: 1,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: C.overlay,
        justifyContent: "flex-end",
        alignItems: "center",
    },
    modalSheet: {
        backgroundColor: C.surface,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 12,
        paddingBottom: Platform.OS === "ios" ? 34 : 24,
        width: "100%",
    },
    sheetHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.outline,
        alignSelf: "center",
        marginBottom: 14,
    },
    modalHead: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: 20,
        marginBottom: 14,
    },
    modalName: { fontSize: 20, fontWeight: "700", color: C.text },
    modalSub: { fontSize: 13, color: C.textSec, marginTop: 2 },
    modalClose: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: C.bg,
        alignItems: "center",
        justifyContent: "center",
    },
    modalActions: {
        flexDirection: "row",
        gap: 24,
        paddingHorizontal: 20,
        marginBottom: 14,
    },
    modalAction: { alignItems: "center", gap: 6 },
    modalActionIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
    },
    modalActionLbl: { fontSize: 11, fontWeight: "600", color: C.textSec },
    divider: { height: 1, backgroundColor: C.outline, marginBottom: 6 },
    histRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: C.outline,
    },
    histIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    histType: { fontSize: 14, fontWeight: "600" },
    histMeta: { fontSize: 12, color: C.textSec, marginTop: 2 },
    histCallBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.greenLight,
        alignItems: "center",
        justifyContent: "center",
    },
});
