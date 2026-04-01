import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
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
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import * as callLogService from "../services/callLogService";
import {
  getInCallControlSupport,
  sendCallDtmf,
  setCallHold,
  setCallMuted,
  setCallSpeaker,
} from "../services/inCallControlService";
import {
  ensureCallLogPermissions,
  getLatestDeviceCallLogForNumber,
  isRestrictedCallMonitoringEnabled,
} from "../services/CallMonitorService";

// ─── Design tokens (matches app design system) ────────────────────────────────
const C = {
  bg: "#F1F5F9",
  card: "#FFFFFF",
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF6FF",
  primaryMid: "#BFDBFE",
  accent: "#7C3AED",
  success: "#059669",
  successSoft: "#F0FDF4",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  warning: "#D97706",
  warningSoft: "#FFFBEB",
  info: "#0891B2",
  text: "#0F172A",
  textSub: "#334155",
  textMuted: "#64748B",
  textLight: "#94A3B8",
  border: "#E2E8F0",
  divider: "#F1F5F9",
  shadow: "#1E293B",
  // call screen
  callDark1: "#0F172A",
  callDark2: "#1E3A5F",
  callDark3: "#0D1F36",
  greenCall: "#10B981",
  redCall: "#EF4444",
  amber: "#F59E0B",
};

const GRAD = {
  primary: [C.primary, C.accent],
  danger: [C.danger, "#991B1B"],
  call: [C.callDark1, C.callDark2, C.callDark3],
};

const FILTER_TYPES = ["All", "Missed", "Incoming", "Outgoing"];
const TIME_PERIODS = [
  { key: "All", label: "All" },
  { key: "Today", label: "Today" },
  { key: "This Week", label: "Week" },
];
const DEVICE_SYNC_ENABLED = isRestrictedCallMonitoringEnabled();
const isExpoGo = () =>
  Constants.executionEnvironment === "storeClient" ||
  Constants.appOwnership === "expo";

// ─── Responsive scale ────────────────────────────────────────────────────────
const useScale = () => {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const isTablet = width >= 768;
    const isLarge = width >= 414 && width < 768;
    const base = isTablet ? 16 : isLarge ? 15 : 14;
    return {
      isTablet,
      isLarge,
      width,
      height,
      f: {
        xs: base - 3,
        sm: base - 1,
        base,
        md: base + 1,
        lg: base + 2,
        xl: base + 4,
      },
      sp: { xs: 4, sm: 6, md: 10, lg: 16, xl: 24 },
      hPad: isTablet ? 24 : 16,
      cardR: isTablet ? 18 : 14,
    };
  }, [width, height]);
};

// ─── Utils ────────────────────────────────────────────────────────────────────
const fmtTime = (v) =>
  new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = (v) => {
  const d = new Date(v),
    now = new Date(),
    diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return fmtTime(v);
  if (diff < 172800000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const fmtDur = (s) =>
  `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;
const fmtTimer = (s) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const fmtPhone = (v) => {
  const d = (v || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};

const typeCfg = (t) => {
  switch (t) {
    case "Incoming":
      return {
        label: "Incoming",
        color: C.primary,
        bg: C.primarySoft,
        icon: "arrow-down-outline",
      };
    case "Outgoing":
      return {
        label: "Outgoing",
        color: C.success,
        bg: C.successSoft,
        icon: "arrow-up-outline",
      };
    case "Missed":
      return {
        label: "Missed",
        color: C.danger,
        bg: C.dangerSoft,
        icon: "close-outline",
      };
    case "Not Attended":
      return {
        label: "No Answer",
        color: C.warning,
        bg: C.warningSoft,
        icon: "remove-outline",
      };
    default:
      return {
        label: t || "Call",
        color: C.textMuted,
        bg: C.bg,
        icon: "call-outline",
      };
  }
};

const toast = (msg, err = false) => {
  if (Platform.OS === "android")
    ToastAndroid.show(msg, err ? ToastAndroid.LONG : ToastAndroid.SHORT);
  else Alert.alert(err ? "Error" : "Info", msg);
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
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.36, fontWeight: "700" }}>
        {initials}
      </Text>
    </View>
  );
};

// ─── Pulse ring (call screen) ─────────────────────────────────────────────────
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
          outputRange: [0, 0.45, 0],
        }),
        transform: [
          {
            scale: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 2.3],
            }),
          },
        ],
      }}
    />
  );
};

// ─── Active Call Overlay ──────────────────────────────────────────────────────
const CallOverlay = ({
  call,
  onEnd,
  onMinimize,
  onToggleMute,
  onToggleSpeaker,
  onToggleHold,
  onToggleKeypad,
  onPressKeypad,
}) => {
  const insets = useSafeAreaInsets();
  const sc = useScale();
  const slideY = useRef(new Animated.Value(50)).current;
  const fadeA = useRef(new Animated.Value(0)).current;
  const [kpInput, setKpInput] = useState("");

  const seconds = useMemo(() => {
    if (!call?.startedAt) return 0;
    const t = new Date(call.startedAt).getTime();
    return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 1000));
  }, [call?.startedAt, call?.tick]);

  const status =
    call?.status === "held"
      ? "On Hold"
      : call?.status === "active"
        ? "On Call"
        : call?.status === "ended"
          ? "Call Ended"
          : "Connecting…";
  const isActive = call?.status === "active";
  const ctrl = {
    muted: !!call?.muted,
    speaker: !!call?.speaker,
    onHold: !!call?.onHold,
    keypad: !!call?.keypadVisible,
    digits: call?.keypadDigits || "",
  };

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

  const Btn = ({ icon, label, active, color, onPress }) => (
    <TouchableOpacity
      style={CS.ctrlItem}
      onPress={() => {
        onPress?.();
        Vibration.vibrate(18);
      }}
      activeOpacity={0.75}
    >
      <View
        style={[
          CS.ctrlCircle,
          active && { backgroundColor: color || "rgba(255,255,255,0.22)" },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={active ? "#fff" : "rgba(255,255,255,0.75)"}
        />
      </View>
      <Text style={[CS.ctrlLabel, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fadeA, zIndex: 999 }]}
    >
      <LinearGradient
        colors={GRAD.call}
        style={{ flex: 1 }}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      >
        {/* Glow blobs */}
        <View
          style={{
            position: "absolute",
            top: -60,
            right: -20,
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: "rgba(37,99,235,0.14)",
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 160,
            left: -50,
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: "rgba(16,185,129,0.09)",
          }}
        />

        {/* Nav bar */}
        <View style={[CS.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={CS.minBtn} onPress={onMinimize}>
            <Ionicons
              name="chevron-down"
              size={17}
              color="rgba(255,255,255,0.5)"
            />
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              Minimize
            </Text>
          </TouchableOpacity>
          <View
            style={[
              CS.statusPill,
              {
                backgroundColor: isActive
                  ? "rgba(16,185,129,0.18)"
                  : "rgba(255,255,255,0.08)",
              },
            ]}
          >
            {isActive && (
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
              style={[CS.statusPillText, isActive && { color: C.greenCall }]}
            >
              {status}
            </Text>
          </View>
        </View>

        {/* Avatar + pulse */}
        <View style={CS.avatarArea}>
          {isActive && (
            <>
              <PulseRing size={110} color={C.greenCall} delay={0} />
              <PulseRing size={110} color={C.greenCall} delay={700} />
              <PulseRing size={110} color={C.greenCall} delay={1400} />
            </>
          )}
          <View style={CS.avatarRing}>
            <Avatar
              name={call?.contactName || call?.phoneNumber || "?"}
              size={88}
            />
          </View>
        </View>

        {/* Identity */}
        <View style={CS.identity}>
          <Text style={CS.callName}>{call?.contactName || "Unknown"}</Text>
          <Text style={CS.callPhone}>{call?.phoneNumber || ""}</Text>
          <Text style={CS.callTimer}>
            {isActive ? fmtTimer(seconds) : status}
          </Text>
          {ctrl.onHold && (
            <View style={CS.holdBadge}>
              <Ionicons name="pause-circle-outline" size={12} color={C.amber} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.amber }}>
                On Hold
              </Text>
            </View>
          )}
        </View>

        {/* Controls panel */}
        <View style={CS.panel}>
          {ctrl.keypad ? (
            <View style={{ paddingHorizontal: 16 }}>
              <View style={CS.kpDisplay}>
                <Text style={CS.kpDisplayText}>{ctrl.digits || " "}</Text>
                {ctrl.digits.length > 0 && (
                  <TouchableOpacity onPress={() => onToggleKeypad?.(false)}>
                    <Ionicons
                      name="close-outline"
                      size={19}
                      color="rgba(255,255,255,0.5)"
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View style={CS.kpGrid}>
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
                    style={CS.kpKey}
                    onPress={() => {
                      onPressKeypad?.(l);
                      Vibration.vibrate(14);
                    }}
                  >
                    <Text style={CS.kpKeyLabel}>{l}</Text>
                    {s ? <Text style={CS.kpKeySub}>{s}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={{ alignSelf: "center", paddingVertical: 8 }}
                onPress={() => onToggleKeypad?.(false)}
              >
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color="rgba(255,255,255,0.55)"
                />
              </TouchableOpacity>
            </View>
          ) : (
            <Animated.View
              style={[CS.ctrlGrid, { transform: [{ translateY: slideY }] }]}
            >
              <Btn
                icon={ctrl.muted ? "mic-off" : "mic-outline"}
                label={ctrl.muted ? "Unmute" : "Mute"}
                active={ctrl.muted}
                color="rgba(220,38,38,0.45)"
                onPress={() => onToggleMute?.(!ctrl.muted)}
              />
              <Btn
                icon={ctrl.speaker ? "volume-high" : "volume-medium-outline"}
                label="Speaker"
                active={ctrl.speaker}
                color="rgba(37,99,235,0.45)"
                onPress={() => onToggleSpeaker?.(!ctrl.speaker)}
              />
              <Btn
                icon="keypad-outline"
                label="Keypad"
                active={false}
                onPress={() => onToggleKeypad?.(true)}
              />
              <Btn
                icon={
                  ctrl.onHold ? "play-circle-outline" : "pause-circle-outline"
                }
                label={ctrl.onHold ? "Resume" : "Hold"}
                active={ctrl.onHold}
                color="rgba(245,158,11,0.45)"
                onPress={() => onToggleHold?.(!ctrl.onHold)}
              />
              <Btn
                icon="call-outline"
                label="Dialer"
                active={false}
                onPress={onMinimize}
              />
              <Btn
                icon="radio-outline"
                label="Live Sync"
                active
                color="rgba(16,185,129,0.32)"
                onPress={() => {}}
              />
            </Animated.View>
          )}
        </View>

        {/* End call */}
        {!ctrl.keypad && (
          <View style={CS.endWrap}>
            <TouchableOpacity
              style={CS.endBtn}
              onPress={handleEnd}
              activeOpacity={0.85}
            >
              <Ionicons
                name="call"
                size={28}
                color="#fff"
                style={{ transform: [{ rotate: "135deg" }] }}
              />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.35)",
                marginTop: 6,
              }}
            >
              End Call
            </Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
};

const CS = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  minBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
  },
  avatarArea: {
    alignItems: "center",
    justifyContent: "center",
    height: 140,
    marginBottom: 16,
  },
  avatarRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    alignItems: "center",
    gap: 4,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  callName: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.4,
  },
  callPhone: { fontSize: 14, color: "rgba(255,255,255,0.55)" },
  callTimer: {
    fontSize: 22,
    fontWeight: "200",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 3,
    marginTop: 2,
  },
  holdBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(245,158,11,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 4,
  },
  panel: {
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  ctrlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 12,
  },
  ctrlItem: { width: "30%", alignItems: "center", gap: 6 },
  ctrlCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  ctrlLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
  },
  endWrap: { alignItems: "center", marginTop: 20 },
  endBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.redCall,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.redCall,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  kpDisplay: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.09)",
    marginBottom: 6,
  },
  kpDisplayText: {
    fontSize: 26,
    fontWeight: "200",
    color: "#fff",
    letterSpacing: 5,
    minWidth: 110,
    textAlign: "center",
  },
  kpGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  kpKey: { width: "33.33%", alignItems: "center", paddingVertical: 11, gap: 1 },
  kpKeyLabel: { fontSize: 24, fontWeight: "300", color: "#fff" },
  kpKeySub: {
    fontSize: 8,
    fontWeight: "700",
    color: "rgba(255,255,255,0.3)",
    letterSpacing: 1,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CallLogScreen({ navigation, route, embedded = false }) {
  const swipeHandlers = useSwipeNavigation("CallLog", navigation);
  const insets = useSafeAreaInsets();
  const sc = useScale();
  const { user } = useAuth();

  const debounceRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const skipFocusRef = useRef(true);
  const lastAutoSyncRef = useRef(0);
  const hasWarnedPermissionRef = useRef(false);
  const syncLogsRef = useRef(async () => {});
  const activeCallRef = useRef(null);
  const unsupportedToastRef = useRef(false);
  const lastStartCallTokenRef = useRef(null);

  const [callLogs, setCallLogs] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState(route?.params?.initialSearch || "");
  const [typeFilter, setTypeFilter] = useState("All");
  const [periodFilter, setPeriodFilter] = useState("All");
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const [callTick, setCallTick] = useState(0);

  const [pendingCall, setPendingCall] = useState(null);
  const pendingCallRef = useRef(null);
  const pendingCallSavingRef = useRef(false);

  useEffect(() => {
    pendingCallRef.current = pendingCall;
  }, [pendingCall]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);
  useEffect(() => {
    if (!activeCall) return;
    const id = setInterval(() => setCallTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeCall]);
  useEffect(() => {
    if (activeCall?.status !== "dialing") return;
    const id = setTimeout(
      () =>
        setActiveCall((p) =>
          p ? { ...p, status: "active", tick: Date.now() } : p,
        ),
      1800,
    );
    return () => clearTimeout(id);
  }, [activeCall?.status]);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(
    async ({ refresh = false } = {}) => {
      try {
        if (refresh) setIsRefreshing(true);
        else if (!hasLoadedRef.current) setIsLoading(true);
        const [logsRes, statsRes] = await Promise.all([
          callLogService.getCallLogs({
            type: typeFilter === "All" ? "" : typeFilter,
            filter: periodFilter,
            search: searchQuery,
            limit: 200,
          }),
          callLogService.getCallStats({ filter: periodFilter }),
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
    [typeFilter, periodFilter, searchQuery],
  );

  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);
  useEffect(() => {
    if (route?.params?.initialSearch) {
      setSearchQuery(String(route.params.initialSearch));
    }
  }, [route?.params?.initialSearch]);
  useFocusEffect(
    useCallback(() => {
      if (skipFocusRef.current) {
        skipFocusRef.current = false;
        return;
      }
      fetchData();
      const now = Date.now();
      if (
        isRestrictedCallMonitoringEnabled() &&
        now - lastAutoSyncRef.current > 2 * 60 * 1000
      ) {
        lastAutoSyncRef.current = now;
        syncLogsRef.current?.({ silent: true });
      }
    }, [fetchData]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      "CALL_LOG_CREATED",
      (payload) => {
        if (!payload?.type && !payload?._id && !payload?.phoneNumber) return;
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchData({ refresh: true }), 300);
      },
    );
    return () => {
      sub.remove();
      clearTimeout(debounceRef.current);
    };
  }, [fetchData]);

  // ── Call session management ───────────────────────────────────────────────
  const updateCall = useCallback((patch) => {
    setActiveCall((p) => (p ? { ...p, ...patch } : p));
  }, []);

  const closeSession = useCallback(async (reason, payload = {}) => {
    const cur = activeCallRef.current;
    if (!cur?.sessionId) {
      setActiveCall(null);
      setCallMinimized(false);
      return;
    }
    try {
      await callLogService.endCallSession(cur.sessionId, {
        reason,
        status: reason === "dismissed" ? "dismissed" : "ended",
        duration: payload.duration,
        callType: payload.callType,
        endedAt: payload.endedAt || new Date().toISOString(),
      });
    } catch {}
    setActiveCall(null);
    setCallMinimized(false);
  }, []);

  const buildDefaultNote = (callType, durationSeconds) => {
    const dur = Number(durationSeconds || 0);
    const safeDur = Number.isFinite(dur) ? Math.max(0, Math.floor(dur)) : 0;
    if (callType === "Incoming")
      return safeDur > 0 ? `Incoming call • ${safeDur}s` : "Incoming call";
    if (callType === "Outgoing")
      return safeDur > 0 ? `Outgoing call • ${safeDur}s` : "Outgoing call";
    if (callType === "Missed") return "Missed call";
    if (callType === "Not Attended") return "Outgoing not attended";
    return "Call auto-logged";
  };

  const handleSaveCallLog = useCallback(
    async (data) => {
      try {
        const saved = await callLogService.createCallLog(data);
        if (!saved?._id) return;
        DeviceEventEmitter.emit("CALL_LOG_CREATED", saved);
        fetchData({ refresh: true });
      } catch (e) {
        console.error(e);
      }
    },
    [fetchData],
  );

	  const autoSavePendingCall = useCallback(
	    async (pc, payload = {}) => {
	      if (!pc?.phoneNumber) return;
	      if (pendingCallSavingRef.current) return;
	      pendingCallSavingRef.current = true;

	      try {
	        const enquiry = pc?.enquiry || null;
	        const phoneNumber = pc.phoneNumber;
	        const sinceMs = pc.startedAtMs || null;

	        const device = await getLatestDeviceCallLogForNumber({
	          phoneNumber,
	          sinceMs,
	          limit: 10,
	        });

	        const fallbackDur =
	          sinceMs != null
	            ? Math.max(0, Math.floor((Date.now() - Number(sinceMs)) / 1000) - 5)
	            : Number(payload?.duration || 0);

	        const callType =
	          device?.callType ||
	          payload?.callType ||
	          (fallbackDur > 3 ? "Outgoing" : "Not Attended");

	        const duration = Number.isFinite(Number(device?.duration))
	          ? Number(device.duration)
	          : Number.isFinite(Number(payload?.duration))
	            ? Number(payload.duration)
	            : fallbackDur;

	        const callTime = device?.callTime || payload?.callTime || new Date();
	        const deviceCallId = device?.deviceCallId || device?.id || null;

	        const linkedEnquiryId =
	          enquiry?._id ||
	          enquiry?.enquiryId?._id ||
	          enquiry?.enquiryId ||
	          enquiry?.enqId;
	        const contactName =
	          enquiry?.name || enquiry?.contactName || pc?.contactName;

		        await handleSaveCallLog({
		          phoneNumber,
		          callType,
		          duration,
		          note: buildDefaultNote(callType, duration),
		          callTime,
		          deviceCallId,
		          enquiryId: linkedEnquiryId,
		          contactName,
		        });
	      } finally {
	        pendingCallSavingRef.current = false;
	      }
	    },
	    [handleSaveCallLog],
	  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      if (next !== "active") return;
      const pc = pendingCallRef.current;
      if (!pc?.phoneNumber) return;
      await autoSavePendingCall(pc, {});
      setPendingCall(null);
    });
    return () => sub.remove();
  }, [autoSavePendingCall]);

  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener(
      "CALL_SESSION_UPDATED",
      (payload) => {
        if (!payload?._id) return;
        const cur = activeCallRef.current;
        if (!cur?.sessionId || cur.sessionId !== payload._id) return;
        updateCall({
          status: payload.status || cur.status,
          muted: !!payload.controls?.muted,
          speaker: !!payload.controls?.speaker,
          onHold: !!payload.controls?.onHold,
          keypadVisible: !!payload.controls?.keypadVisible,
          keypadDigits: payload.controls?.keypadDigits || "",
          tick: Date.now(),
        });
      },
    );
    const s2 = DeviceEventEmitter.addListener("CALL_ENDED", (payload) => {
      const endedDigits = fmtPhone(payload?.phoneNumber);
      const pc = pendingCallRef.current;
      if (pc && endedDigits && endedDigits === fmtPhone(pc.phoneNumber)) {
        global.__callClaimedByScreen = true;
        autoSavePendingCall(pc, payload || {}).catch(() => {});
        setPendingCall(null);
        return;
      }
      const cur = activeCallRef.current;
      if (!cur?.phoneNumber) return;
      const curDigits = fmtPhone(cur.phoneNumber);
      if (curDigits && endedDigits && curDigits !== endedDigits) return;
      closeSession("completed", payload || {});
    });
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [closeSession, updateCall, autoSavePendingCall]);

  // ── Call controls ─────────────────────────────────────────────────────────
  const warnFallback = () => {
    if (unsupportedToastRef.current) return;
    unsupportedToastRef.current = true;
    toast("Server synced. Native audio control needs in-call manager.");
  };
  const syncControl = useCallback(
    async (action, value, extra = {}) => {
      const cur = activeCallRef.current;
      if (!cur?.sessionId) return;
      const patch = { tick: Date.now() };
      if (action === "mute") patch.muted = !!value;
      if (action === "speaker") patch.speaker = !!value;
      if (action === "hold") {
        patch.onHold = !!value;
        patch.status = value ? "held" : "active";
      }
      if (action === "keypad") patch.keypadVisible = !!value;
      if (action === "dtmf")
        patch.keypadDigits =
          `${cur.keypadDigits || ""}${String(value || "")}`.slice(-32);
      updateCall(patch);
      try {
        const sess = await callLogService.updateCallSessionControl(
          cur.sessionId,
          {
            action,
            value,
            digits: extra.digits,
            nativeApplied: extra.nativeApplied,
            nativeSupported: extra.nativeSupported,
            status: extra.status,
          },
        );
        if (sess?._id)
          updateCall({
            status: sess.status,
            muted: !!sess.controls?.muted,
            speaker: !!sess.controls?.speaker,
            onHold: !!sess.controls?.onHold,
            keypadVisible: !!sess.controls?.keypadVisible,
            keypadDigits: sess.controls?.keypadDigits || "",
            tick: Date.now(),
          });
      } catch {
        toast("Could not sync call control", true);
      }
    },
    [updateCall],
  );

  const initiateCall = async (item) => {
    const digits = String(item?.phoneNumber || item?.mobile || "").replace(
      /\D/g,
      "",
    );
    if (!digits) return;
    setPendingCall({ phoneNumber: digits, enquiry: item, startedAtMs: Date.now() });
    try {
      if (Platform.OS === "android" && RNImmediatePhoneCall?.immediatePhoneCall)
        return RNImmediatePhoneCall.immediatePhoneCall(digits);
      await Linking.openURL(`tel:${digits}`);
    } catch {
      setPendingCall(null);
      toast("Could not initiate call", true);
    }
  };

  useEffect(() => {
    const token = route?.params?.startCallToken;
    const startCall = route?.params?.startCall;
    if (!token || !startCall) return;
    if (lastStartCallTokenRef.current === token) return;
    lastStartCallTokenRef.current = token;
    initiateCall(startCall);
  }, [route?.params?.startCallToken, route?.params?.startCall]);

  const openHistory = async (item) => {
    const key = fmtPhone(item?.phoneNumber);
    const enquiryId = item?.enquiryId?._id || item?.enquiryId || "";
    if (!key && !enquiryId) return;
    setHistoryTitle(item?.contactName || item?.phoneNumber || "History");
    setHistoryVisible(true);
    setHistoryLoading(true);
    try {
      const res = await callLogService.getCallLogs(
        enquiryId
          ? {
              enquiryId,
              filter: "All",
              limit: 500,
            }
          : {
              search: key,
              filter: "All",
              limit: 500,
            },
      );
      const data = Array.isArray(res?.data) ? res.data : [];
      setHistoryLogs(
        data
          .filter((i) => {
            if (enquiryId) {
              return String(i?.enquiryId?._id || i?.enquiryId || "") === String(enquiryId);
            }
            return fmtPhone(i?.phoneNumber) === key;
          })
          .sort((a, b) => new Date(b.callTime) - new Date(a.callTime)),
      );
    } catch {
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const syncLogs = async ({ silent = false } = {}) => {
    if (Platform.OS === "web") return;
    if (isExpoGo()) {
      if (!silent) toast("Sync needs a production build", true);
      return;
    }
    if (!isRestrictedCallMonitoringEnabled()) {
      if (!silent) {
        toast(
          "Device call-log sync is disabled in this build (enable EXPO_PUBLIC_PLAY_STORE_SAFE_MODE=false)",
          true,
        );
      }
      return;
    }
    const ok = await ensureCallLogPermissions();
    if (!ok) {
      if (!hasWarnedPermissionRef.current && !silent) {
        hasWarnedPermissionRef.current = true;
        toast("Call-log permission denied", true);
      }
      return;
    }
    setIsSyncing(true);
    try {
      const { default: CallLog } = require("react-native-call-log");
      if (!CallLog?.load) throw new Error("Not available");
      const logs = await CallLog.load(200, {
        minTimestamp: Date.now() - 7 * 86400000,
      });
      if (!logs?.length) {
        if (!silent) toast("No new records");
        return;
      }
      const r = await callLogService.syncCallLogs(logs);
      if (!silent) toast(`Synced ${r?.synced || 0} calls`);
      fetchData();
    } catch (e) {
      if (!silent) toast(`Sync failed: ${e?.message || "Unknown"}`, true);
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Grouped flat list data ────────────────────────────────────────────────
  syncLogsRef.current = syncLogs;

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
      else if (d.toDateString() === new Date(now - 86400000).toDateString())
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

  // ── Render call row ───────────────────────────────────────────────────────
  const renderCallRow = ({ item }) => {
    if (item.type === "header") {
      return (
        <View style={[R.sectionHead, { paddingHorizontal: sc.hPad }]}>
          <Text style={R.sectionText}>{item.title}</Text>
          <View style={R.sectionLine} />
        </View>
      );
    }
    const cfg = typeCfg(item?.callType);
    const name = item?.contactName || item?.phoneNumber || "Unknown";
    const isUnknown = !item?.contactName;
    const isMissed = item?.callType === "Missed";

    return (
      <Swipeable
        overshootRight={false}
        renderRightActions={() => (
          <TouchableOpacity
            style={R.swipeAction}
            onPress={() => initiateCall(item)}
          >
            <View style={R.swipeCircle}>
              <Ionicons name="call" size={18} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
      >
        <TouchableOpacity
          style={[R.row, { paddingHorizontal: sc.hPad }]}
          activeOpacity={0.75}
          onPress={() => openHistory(item)}
        >
          {/* Avatar */}
          <View style={{ position: "relative" }}>
            {isUnknown ? (
              <View style={R.unknownAvatar}>
                <Ionicons name="person-outline" size={18} color={C.textLight} />
              </View>
            ) : (
              <Avatar name={name} size={44} />
            )}
            <View style={[R.typeDot, { backgroundColor: cfg.color }]} />
          </View>

          {/* Info */}
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={[R.rowName, isMissed && { color: C.danger }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View style={[R.typePill, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon} size={9} color={cfg.color} />
                <Text style={[R.typePillText, { color: cfg.color }]}>
                  {cfg.label}
                </Text>
              </View>
              {item?.duration > 0 && (
                <Text style={R.durText}>{fmtDur(item.duration)}</Text>
              )}
            </View>
            <Text style={R.phoneText} numberOfLines={1}>
              {isUnknown ? item?.phoneNumber : item?.phoneNumber || "—"}
            </Text>
          </View>

          {/* Right */}
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text style={R.timeText}>{fmtDate(item?.callTime)}</Text>
            <TouchableOpacity
              style={R.callBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => initiateCall(item)}
            >
              <Ionicons name="call" size={14} color={C.success} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  // ── Stats + filters header ────────────────────────────────────────────────
  const ListHeader = () => (
    <View
      style={{
        paddingHorizontal: sc.hPad,
        paddingTop: 14,
        paddingBottom: 6,
        gap: 12,
      }}
    >
      {/* Compact stats row — 3 small cards, no big hero card */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[
          {
            label: "Total",
            value: statistics?.totalCalls || 0,
            color: C.primary,
            bg: C.primarySoft,
            icon: "call-outline",
          },
          {
            label: "Missed",
            value: statistics?.missed || 0,
            color: C.danger,
            bg: C.dangerSoft,
            icon: "close-circle-outline",
          },
          {
            label: "Outgoing",
            value: statistics?.outgoing || 0,
            color: C.success,
            bg: C.successSoft,
            icon: "arrow-up-circle-outline",
          },
        ].map((s) => (
          <View key={s.label} style={[R.statCard, { borderRadius: sc.cardR }]}>
            <View style={[R.statIcon, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={15} color={s.color} />
            </View>
            <Text style={[R.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={R.statLabel}>{s.label}</Text>
          </View>
        ))}

        {/* Sync button as 4th card */}
        <TouchableOpacity
          onPress={syncLogs}
          activeOpacity={0.8}
          style={[
            R.statCard,
            { borderRadius: sc.cardR, justifyContent: "center" },
          ]}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <>
              <View style={[R.statIcon, { backgroundColor: C.primarySoft }]}>
                <Ionicons name="sync-outline" size={15} color={C.primary} />
              </View>
              <Text
                style={[R.statLabel, { color: C.primary, fontWeight: "700" }]}
              >
                Sync
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {!DEVICE_SYNC_ENABLED && Platform.OS === "android" ? (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            backgroundColor: "#FFFBEB",
            borderWidth: 1,
            borderColor: "#FDE68A",
          }}
        >
          <Text style={{ fontSize: 12, color: "#92400E", fontWeight: "700" }}>
            Auto call-log sync is disabled in this build.
          </Text>
          <Text style={{ fontSize: 11, color: "#92400E", marginTop: 4 }}>
            Set `EXPO_PUBLIC_PLAY_STORE_SAFE_MODE=false` and rebuild the Android app
            to enable Incoming/Outgoing/Missed sync like the Phone app.
          </Text>
        </View>
      ) : null}

      {/* Period chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 7 }}
      >
        {TIME_PERIODS.map((p) => {
          const active = periodFilter === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPeriodFilter(p.key)}
              style={[
                R.chip,
                active && {
                  backgroundColor: C.primarySoft,
                  borderColor: C.primary,
                },
              ]}
            >
              <Text
                style={[
                  R.chipText,
                  active && { color: C.primary, fontWeight: "700" },
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: C.bg }}
      edges={["top"]}
      {...(embedded ? {} : swipeHandlers)}
    >
      {!embedded ? <StatusBar barStyle="dark-content" backgroundColor={C.card} /> : null}

      {/* ── Header ── */}
      {!embedded ? <View style={[R.header, { paddingHorizontal: sc.hPad }]}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              color: C.textMuted,
              fontWeight: "600",
              letterSpacing: 0.3,
            }}
          >
            Call Logs
          </Text>
          <Text
            style={{
              fontSize: 17,
              color: C.text,
              fontWeight: "800",
              letterSpacing: -0.3,
            }}
          >
            {user?.name || "Calls"}
          </Text>
        </View>
      </View> : null}

      {/* ── Search + type filter ── */}
      <View style={[R.searchWrap, { paddingHorizontal: sc.hPad }]}>
        <View style={R.searchBar}>
          <Ionicons
            name="search-outline"
            size={16}
            color={C.textLight}
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={R.searchInput}
            placeholder="Search name or number…"
            placeholderTextColor={C.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color={C.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 7, marginTop: 8 }}
        >
          {FILTER_TYPES.map((type) => {
            const active = typeFilter === type;
            const cfg = type !== "All" ? typeCfg(type) : null;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => setTypeFilter(type)}
                style={[
                  R.chip,
                  active &&
                    cfg && { backgroundColor: cfg.bg, borderColor: cfg.color },
                  active &&
                    !cfg && {
                      backgroundColor: C.primarySoft,
                      borderColor: C.primary,
                    },
                ]}
              >
                {cfg && (
                  <Ionicons
                    name={cfg.icon}
                    size={11}
                    color={active ? cfg.color : C.textMuted}
                    style={{ marginRight: 2 }}
                  />
                )}
                <Text
                  style={[
                    R.chipText,
                    active && {
                      color: cfg ? cfg.color : C.primary,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {isLoading && !isRefreshing ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ fontSize: 13, color: C.textMuted }}>
            Loading calls…
          </Text>
        </View>
      ) : (
        <FlatList
          data={flatData}
          renderItem={renderCallRow}
          keyExtractor={(item, i) => item.key || item._id || `${i}`}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={<ListHeader />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchData({ refresh: true })}
              tintColor={C.primary}
            />
          }
          ListEmptyComponent={
            <View
              style={{
                paddingTop: 60,
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 32,
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: C.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: C.border,
                }}
              >
                <Ionicons name="call-outline" size={26} color={C.textLight} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
                No calls found
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: C.textMuted,
                  textAlign: "center",
                }}
              >
                Adjust filters or sync device calls.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Minimized call bar ── */}
      {activeCall && callMinimized && (
        <TouchableOpacity
          style={R.miniBar}
          onPress={() => setCallMinimized(false)}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[C.callDark1, C.callDark2]}
            style={R.miniGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: C.greenCall,
                }}
              />
              <Avatar
                name={activeCall.contactName || activeCall.phoneNumber}
                size={28}
              />
              <View>
                <Text
                  style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}
                >
                  {activeCall.contactName || "Unknown"}
                </Text>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  On Call · tap to open
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={R.miniEndBtn}
              onPress={() => closeSession("dismissed")}
            >
              <Ionicons
                name="call"
                size={14}
                color="#fff"
                style={{ transform: [{ rotate: "135deg" }] }}
              />
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── Active call overlay ── */}
      {activeCall && !callMinimized && (
        <Modal visible transparent animationType="none" statusBarTranslucent>
          <CallOverlay
            call={{ ...activeCall, tick: callTick }}
            onEnd={() => closeSession("dismissed")}
            onMinimize={() => setCallMinimized(true)}
            onToggleMute={async (v) => {
              const n = await setCallMuted(v);
              if (!n) warnFallback();
              syncControl("mute", v, {
                nativeApplied: n,
                nativeSupported: getInCallControlSupport().mute,
              });
            }}
            onToggleSpeaker={async (v) => {
              const n = await setCallSpeaker(v);
              if (!n) warnFallback();
              syncControl("speaker", v, {
                nativeApplied: n,
                nativeSupported: getInCallControlSupport().speaker,
              });
            }}
            onToggleHold={async (v) => {
              const n = await setCallHold(v);
              if (!n) warnFallback();
              syncControl("hold", v, {
                nativeApplied: n,
                nativeSupported: getInCallControlSupport().hold,
                status: v ? "held" : "active",
              });
            }}
            onToggleKeypad={(v) =>
              syncControl("keypad", v, {
                nativeApplied: true,
                nativeSupported: true,
              })
            }
            onPressKeypad={async (d) => {
              const n = await sendCallDtmf(d);
              syncControl("dtmf", d, {
                digits: d,
                nativeApplied: n,
                nativeSupported: getInCallControlSupport().dtmf,
              });
            }}
          />
        </Modal>
      )}

      {/* ── Post-call modal ── */}


      {/* ── Call history modal ── */}
      <Modal
        visible={historyVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={[
              R.histSheet,
              {
                maxHeight: sc.height * 0.82,
                width: Math.min(sc.width - 0, 600),
              },
            ]}
          >
            <View style={R.dragHandle} />

            {/* Header */}
            <View style={[R.histHead, { paddingHorizontal: sc.hPad }]}>
              <View style={{ flex: 1 }}>
                <Text style={R.histTitle}>{historyTitle}</Text>
                <Text style={R.histSub}>Call history</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={R.histCallBtn}
                  onPress={() => {
                    const n = historyLogs[0];
                    if (n) {
                      setHistoryVisible(false);
                      initiateCall(n);
                    }
                  }}
                >
                  <Ionicons name="call" size={16} color={C.success} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={R.histCloseBtn}
                  onPress={() => setHistoryVisible(false)}
                >
                  <Ionicons name="close" size={16} color={C.textSub} />
                </TouchableOpacity>
              </View>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: C.border,
                marginHorizontal: sc.hPad,
              }}
            />

            {historyLoading ? (
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <ActivityIndicator size="small" color={C.primary} />
              </View>
            ) : (
              <FlatList
                data={historyLogs}
                keyExtractor={(item, i) =>
                  item?._id || `${item?.callTime}-${i}`
                }
                contentContainerStyle={{ padding: sc.hPad, paddingBottom: 32 }}
                style={{ maxHeight: Math.min(sc.height * 0.5, 380) }}
                renderItem={({ item }) => {
                  const cfg = typeCfg(item?.callType);
                  return (
                    <View style={R.histRow}>
                      <View style={[R.histIcon, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon} size={13} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            R.histType,
                            {
                              color:
                                item?.callType === "Missed" ? C.danger : C.text,
                            },
                          ]}
                        >
                          {cfg.label}
                        </Text>
                        <Text style={R.histMeta}>
                          {fmtDate(item?.callTime)} · {fmtTime(item?.callTime)}
                          {item?.duration > 0
                            ? ` · ${fmtDur(item.duration)}`
                            : ""}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={R.histRowCallBtn}
                        onPress={() => {
                          setHistoryVisible(false);
                          initiateCall(item);
                        }}
                      >
                        <Ionicons
                          name="call-outline"
                          size={14}
                          color={C.success}
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
                      color: C.textMuted,
                      fontSize: 13,
                    }}
                  >
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
const R = StyleSheet.create({
  // Header
  header: {
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  searchWrap: {
    paddingTop: 10,
    backgroundColor: C.card,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 0 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  chipText: { fontSize: 12, fontWeight: "500", color: C.textMuted },

  // Stats row
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    alignItems: "center",
    gap: 4,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // Section header
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  sectionText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textLight,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: C.border },

  // Call row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: C.card,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  rowName: { fontSize: 14, fontWeight: "600", color: C.text },
  typeDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: C.card,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typePillText: { fontSize: 10, fontWeight: "700" },
  durText: { fontSize: 11, color: C.textLight },
  phoneText: { fontSize: 12, color: C.textLight },
  timeText: { fontSize: 11, color: C.textMuted },
  callBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  unknownAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },

  // Swipe action
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  swipeCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.greenCall,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.greenCall,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },

  // Mini call bar
  miniBar: {
    position: "absolute",
    bottom: 16,
    left: 12,
    right: 12,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  miniGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  miniEndBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.redCall,
    alignItems: "center",
    justifyContent: "center",
  },

  // History modal
  histSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 0,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 12,
  },
  histHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  histTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  histSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  histCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  histCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  histRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  histIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  histType: { fontSize: 13, fontWeight: "600" },
  histMeta: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  histRowCallBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
