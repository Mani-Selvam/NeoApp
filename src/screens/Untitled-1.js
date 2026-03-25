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
    Linking,
    Modal,
    PanResponder,
    Platform,
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
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import AppSideMenu from "../components/AppSideMenu";
import ConfettiBurst from "../components/ConfettiBurst";
import { PostCallModal } from "../components/PostCallModal";
import { FollowUpSkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import * as callLogService from "../services/callLogService";
import * as emailService from "../services/emailService";
import * as enquiryService from "../services/enquiryService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import { getImageUrl } from "../utils/imageHelper";
import ChatScreen from "./ChatScreen";

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
    label: "Today Follow-ups",
    icon: "calendar-clear-outline",
    color: C.violet,
  },
  {
    value: "Missed",
    label: "Missed",
    icon: "alert-circle-outline",
    color: C.danger,
  },
];

// Detail tabs
const DETAIL_TABS = [
  { key: "timeline", label: "Timeline", icon: "time-outline" },
  { key: "call", label: "Call Log", icon: "call-outline" },
  { key: "followup", label: "Follow-up", icon: "calendar-outline" },
  { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" },
  { key: "email", label: "Email", icon: "mail-outline" },
];

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
      ]}
    >
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
        ]}
      >
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

function FollowUpCallPanel({ enquiry, onCallPress }) {
  const phoneKey = normalizePhone(enquiry?.mobile || enquiry?.phoneNumber);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("All");

  useEffect(() => {
    let active = true;

    const loadLogs = async () => {
      if (!phoneKey) {
        if (active) {
          setLogs([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const result = await callLogService.getCallLogs({
          search: phoneKey,
          filter: "All",
          limit: 100,
        });
        if (!active) return;
        const items = Array.isArray(result?.data) ? result.data : [];
        const filtered = items.filter((item) => {
          const samePhone = normalizePhone(item?.phoneNumber) === phoneKey;
          const sameEnquiry =
            enquiry?._id && item?.enquiryId
              ? String(item.enquiryId) === String(enquiry._id)
              : false;
          return samePhone || sameEnquiry;
        });
        filtered.sort(
          (a, b) => new Date(b?.callTime || 0) - new Date(a?.callTime || 0),
        );
        setLogs(filtered);
      } catch (_error) {
        if (active) setLogs([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadLogs();
    return () => {
      active = false;
    };
  }, [phoneKey, enquiry?._id]);

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
        String(item?.callType || "").toLowerCase() === typeFilter.toLowerCase(),
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
          activeOpacity={0.86}
        >
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={DV.callPrimaryText}>Call</Text>
        </TouchableOpacity>
      </View>

      <View style={DV.filterRow}>
        {["All", "Missed", "Incoming", "Outgoing"].map((label) => {
          const active = typeFilter === label;
          const count = label === "All" ? logs.length : counts[label] || 0;
          return (
            <TouchableOpacity
              key={label}
              onPress={() => setTypeFilter(label)}
              style={[DV.filterChip, active && DV.filterChipActive]}
              activeOpacity={0.86}
            >
              <Text
                style={[DV.filterChipText, active && DV.filterChipTextActive]}
              >
                {label}
              </Text>
              <View style={[DV.filterCount, active && DV.filterCountActive]}>
                <Text
                  style={[
                    DV.filterCountText,
                    active && DV.filterCountTextActive,
                  ]}
                >
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
            <Ionicons name="call-outline" size={24} color={C.textLight} />
          </View>
          <Text style={DV.emptyText}>No call records for this contact</Text>
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
                  style={[DV.callIconWrap, { backgroundColor: `${color}18` }]}
                >
                  <Ionicons name={icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={DV.callRowTop}>
                    <Text style={DV.callTypeText}>{type}</Text>
                    <Text style={DV.callTimeText}>
                      {formatShortDateTime(item?.callTime)}
                    </Text>
                  </View>
                  <Text style={DV.callMetaText}>
                    {item?.duration
                      ? `Duration ${formatCallDuration(item.duration)}`
                      : "No duration"}
                  </Text>
                  {!!item?.note && (
                    <Text style={DV.callNoteText} numberOfLines={2}>
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

function FollowUpEmailPanel({ enquiry }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(
    enquiry?.name ? `Hello ${enquiry.name},\n\n` : "",
  );
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    setMessage(enquiry?.name ? `Hello ${enquiry.name},\n\n` : "");
    setSubject("");
  }, [enquiry?._id, enquiry?.name]);

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
        const result = await emailService.getEmailLogs({ page: 1, limit: 50 });
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
  }, [enquiry?._id, enquiry?.email]);

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
      const result = await emailService.getEmailLogs({ page: 1, limit: 20 });
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
      showsVerticalScrollIndicator={false}
    >
      <View style={DV.emailHero}>
        <View style={DV.emailHeroIcon}>
          <Ionicons name="mail-outline" size={20} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={DV.panelTitle}>Email Composer</Text>
          <Text style={DV.panelSub}>
            {enquiry?.email || "No email address available"}
          </Text>
        </View>
      </View>

      <View style={DV.emailCard}>
        <Text style={DV.emailLabel}>To</Text>
        <Text style={DV.emailValue}>{enquiry?.email || "-"}</Text>

        <Text style={DV.emailLabel}>Subject</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Enter subject"
          placeholderTextColor={C.textLight}
          style={DV.emailInput}
        />

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
          ]}
        >
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

      <View style={DV.emailLogsCard}>
        <View style={DV.emailSectionHead}>
          <Text style={DV.emailSectionTitle}>Recent Emails</Text>
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
            <Text style={DV.emptyText}>No email history for this enquiry</Text>
          </View>
        ) : (
          logs.map((item, index) => (
            <View
              key={String(item?._id || `${item?.to || "mail"}-${index}`)}
              style={[
                DV.emailLogRow,
                index === logs.length - 1 && { marginBottom: 0 },
              ]}
            >
              <View style={DV.emailLogDot} />
              <View style={{ flex: 1 }}>
                <View style={DV.callRowTop}>
                  <Text style={DV.callTypeText} numberOfLines={1}>
                    {item?.subject || "No subject"}
                  </Text>
                  <Text style={DV.callTimeText}>
                    {formatShortDateTime(item?.createdAt || item?.sentAt)}
                  </Text>
                </View>
                <Text style={DV.callMetaText} numberOfLines={1}>
                  {item?.to || enquiry?.email || "-"}
                </Text>
                {!!item?.message && (
                  <Text style={DV.callNoteText} numberOfLines={2}>
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
  if (r === "in progress" || r === "contacted") return "Contacted";
  if (r === "dropped" || r === "drop" || r === "not interested")
    return "Not Interested";
  if (r === "new") return "New";
  if (r === "interested") return "Interested";
  if (r === "converted") return "Converted";
  if (r === "closed") return "Closed";
  return s || "New";
};
const getRecommendedNextStatus = (currentStatus) => {
  const current = normalizeStatus(currentStatus);
  if (current === "New") return "Contacted";
  if (current === "Contacted") return "Interested";
  if (current === "Interested") return "Converted";
  return current;
};
const getForwardStatusOptions = (currentStatus) => {
  const current = normalizeStatus(currentStatus);
  if (current === "New")
    return ["New", "Contacted", "Interested", "Not Interested", "Closed"];
  if (current === "Contacted")
    return ["Contacted", "Interested", "Not Interested", "Converted", "Closed"];
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
  return {
    _id:
      item?.enqId ||
      item?.enqNo ||
      item?._id ||
      `${item?.name || "lead"}-${item?.date || ""}`,
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

// ─── FollowUp List Card (right-swipe → details) ───────────────────────────────
const FUCard = React.memo(function FUCard({ item, index, onSwipe, sc }) {
  const tx = useRef(new Animated.Value(0)).current;
  const norm = normalizeStatus(item?.status);
  const sCfg = statusCfg(norm);
  const cols = avatarGrad(item?.name);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dy) < 15 && g.dx > 0,
      onPanResponderGrant: () => tx.setValue(0),
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) tx.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 60) {
          Animated.timing(tx, {
            toValue: sc.SW,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            tx.setValue(0);
            onSwipe?.(item);
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
        opacity: tx.interpolate({
          inputRange: [0, sc.SW * 0.5, sc.SW],
          outputRange: [1, 0.9, 0.75],
          extrapolate: "clamp",
        }),
      }}
      {...pan.panHandlers}
    >
      <TouchableOpacity activeOpacity={0.92} onPress={() => onSwipe?.(item)}>
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
            }}
          >
            {/* Top row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: sc.sp.sm,
              }}
            >
              <View style={[FCS.avatar, { borderRadius: sc.radius }]}>
                {item.image ? (
                  <Image
                    source={{ uri: getImageUrl(item.image) }}
                    style={[FCS.avatarImg, { borderRadius: sc.radius }]}
                  />
                ) : (
                  <LinearGradient
                    colors={cols}
                    style={[FCS.avatarGrad, { borderRadius: sc.radius }]}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: sc.f.md,
                        fontWeight: "800",
                      }}
                    >
                      {getInitials(item.name)}
                    </Text>
                  </LinearGradient>
                )}
                <View
                  style={[FCS.avatarDot, { backgroundColor: sCfg.color }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 3,
                  }}
                >
                  <Text
                    style={[FCS.name, { fontSize: sc.f.md }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View style={[FCS.statusPill, { backgroundColor: sCfg.bg }]}>
                    <View
                      style={[FCS.statusDot, { backgroundColor: sCfg.color }]}
                    />
                    <Text
                      style={[
                        FCS.statusText,
                        { color: sCfg.color, fontSize: sc.f.xs },
                      ]}
                    >
                      {norm === "Contacted" ? "Connected" : norm}
                    </Text>
                  </View>
                </View>
                <Text style={[FCS.mobile, { fontSize: sc.f.sm }]}>
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
              }}
            >
              <View style={[FCS.productTag, { borderRadius: sc.sp.sm }]}>
                <Ionicons
                  name="briefcase-outline"
                  size={sc.f.xs}
                  color={C.primary}
                />
                <Text
                  style={[FCS.productText, { fontSize: sc.f.xs }]}
                  numberOfLines={1}
                >
                  {item.product || "General"}
                </Text>
              </View>
              <View
                style={[
                  FCS.dateBadge,
                  { backgroundColor: sCfg.bg, borderRadius: sc.sp.sm },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={sc.f.xs}
                  color={sCfg.color}
                />
                <Text
                  style={[
                    FCS.dateText,
                    { color: sCfg.color, fontSize: sc.f.xs },
                  ]}
                >
                  {item.latestFollowUpDate ||
                    safeDate(
                      item.lastContactedAt ||
                        item.enquiryDateTime ||
                        item.createdAt,
                      { month: "short", day: "numeric" },
                    )}
                </Text>
              </View>
            </View>
            {/* Footer */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sc.sp.xs,
                }}
              >
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
                  numberOfLines={1}
                >
                  {fmtDisplay(item.assignedTo, "Unassigned")}
                </Text>
                {item.enqNo && (
                  <View style={FCS.enqBadge}>
                    <Text
                      style={{
                        fontSize: sc.f.xs - 1,
                        color: C.primary,
                        fontWeight: "800",
                      }}
                    >
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
                }}
              >
                <Text
                  style={{
                    fontSize: sc.f.xs,
                    color: C.textLight,
                    fontWeight: "600",
                  }}
                >
                  Swipe
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={sc.f.sm}
                  color={C.textLight}
                />
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const FCS = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    overflow: "hidden",
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
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
  isSavingEdit,
  showDatePicker,
  setTimePickerValue,
  setTimePickerVisible,
  isTimePickerVisible,
  handleConfirmTime,
  setEditTimeMeridian,
  timePickerValue,
  onSaveFollowUp,
  onStartCall,
  sc,
  currentStatus,
}) => {
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();

  // Slide in from right on mount
  const mountX = useRef(new Animated.Value(SW)).current;
  const [tabIdx, setTabIdx] = useState(0);
  const tabRef = useRef(0);
  const tabGestureLockedRef = useRef(false);
  const tabScrollRef = useRef(null);

  const norm = normalizeStatus(enquiry?.status);
  const sCfg = statusCfg(norm);
  const cols = avatarGrad(enquiry?.name);
  const statusOptions = useMemo(
    () =>
      getForwardStatusOptions(
        currentStatus || selectedEnquiry?.status || enquiry?.status,
      ),
    [currentStatus, selectedEnquiry?.status, enquiry?.status],
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
    const x = Math.max(0, tabIdx * 92 - 24);
    tabScrollRef.current?.scrollTo({ x, animated: true });
  }, [tabIdx]);

  // Swipe between tabs (or close on leftmost tab swipe-right)
  const swipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => tabRef.current === 3,
      onStartShouldSetPanResponderCapture: () => tabRef.current === 3,
      onMoveShouldSetPanResponder: (_, g) => {
        const cur = tabRef.current;
        if (tabGestureLockedRef.current) return false;
        if (cur >= 3) {
          const isEdgeStart = g.x0 < 34 || g.x0 > SW - 34;
          if (!isEdgeStart) return false;
          if (cur === 3 && g.y0 > SH - 220) return false;
        }
        return Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35;
      },
      onMoveShouldSetPanResponderCapture: (_, g) => {
        const cur = tabRef.current;
        if (cur !== 3 || tabGestureLockedRef.current) return false;
        return Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (tabGestureLockedRef.current) return;
        const cur = tabRef.current;
        if (g.dx < -56 && cur < DETAIL_TABS.length - 1) {
          goToTab(cur + 1);
          return;
        }
        if (g.dx > 56) {
          if (cur > 0) {
            goToTab(cur - 1);
            return;
          }
          if (g.dx > 96) goClose();
        }
      },
    }),
  ).current;
  const detailPanHandlers = tabIdx === 3 ? {} : swipePan.panHandlers;
  const whatsappEdgePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        tabRef.current === 3 && !tabGestureLockedRef.current,
      onStartShouldSetPanResponderCapture: () =>
        tabRef.current === 3 && !tabGestureLockedRef.current,
      onMoveShouldSetPanResponder: (_, g) => {
        if (tabRef.current !== 3 || tabGestureLockedRef.current) return false;
        return Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1;
      },
      onMoveShouldSetPanResponderCapture: (_, g) => {
        if (tabRef.current !== 3 || tabGestureLockedRef.current) return false;
        return Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.1;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (tabGestureLockedRef.current || tabRef.current !== 3) return;
        if (g.dx < -56) {
          goToTab(4);
          return;
        }
        if (g.dx > 56) {
          goToTab(2);
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
    if (s.includes("sales")) return { color: C.success, label: "CONVERTED" };
    if (s.includes("drop") || s.includes("not interest"))
      return { color: C.danger, label: "NOT INTERESTED" };
    return { color: C.primary, label: status?.toUpperCase() || "FOLLOW-UP" };
  };

  return (
    <Animated.View style={[DV.root, { transform: [{ translateX: mountX }] }]}>
      <StatusBar barStyle="dark-content" />

      {/* ── Fixed top bar: back + avatar + name + status chips ── */}
      <View
        style={[DV.topBar, { paddingTop: insets.top + 8, paddingBottom: 14 }]}
      >
        {/* Decorative circles */}
        <View style={DV.deco1} />
        <View style={DV.deco2} />

        {/* Back button */}
        <TouchableOpacity
          onPress={goClose}
          style={[DV.backBtn, { top: insets.top + 8 }]}
        >
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
                <LinearGradient colors={cols} style={DV.avatarGrad}>
                  <Text style={DV.avatarText}>{getInitials(enquiry.name)}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={[DV.priDot, { backgroundColor: sCfg.color }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={DV.heroName} numberOfLines={1}>
              {enquiry.name}
            </Text>
            <Text style={DV.heroMobile}>{enquiry.mobile}</Text>
            {/* Chips row */}
            <View style={DV.chipsRow}>
              <View style={[DV.chip, { backgroundColor: sCfg.bg }]}>
                <View style={[DV.chipDot, { backgroundColor: sCfg.color }]} />
                <Text style={[DV.chipText, { color: sCfg.color }]}>
                  {norm === "Contacted" ? "Connected" : norm}
                </Text>
              </View>
              {enquiry.source ? (
                <View style={DV.chip}>
                  <Ionicons
                    name="git-branch-outline"
                    size={9}
                    color={C.textMuted}
                  />
                  <Text style={DV.chipText}>{enquiry.source}</Text>
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
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingRight: 56,
            gap: 4,
          }}
          style={{ flex: 1 }}
        >
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
              activeOpacity={0.8}
            >
              <Ionicons
                name={t.icon}
                size={sc.f.xs}
                color={tabIdx === i ? "#fff" : C.textMuted}
              />
              <Text
                style={[
                  DV.tabBtnText,
                  tabIdx === i && { color: "#fff", fontWeight: "700" },
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* Swipe hint */}
        <View pointerEvents="none" style={DV.swipeHint}>
          <Ionicons
            name="swap-horizontal-outline"
            size={12}
            color={C.textLight}
          />
        </View>
      </View>

      {/* ── Full-screen tab content with slide animation ── */}
      <View style={{ flex: 1, position: "relative" }}>
        <View style={{ flex: 1 }} {...detailPanHandlers}>
          {/* ── TAB 0: Details ── */}
          {false && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
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
                    value: enquiry.cost ? `₹${enquiry.cost}` : "-",
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
                    value: fmtDisplay(enquiry.assignedTo, "-"),
                    icon: "person-circle-outline",
                  },
                  {
                    label: "Status",
                    value: normalizeStatus(enquiry.status) || "-",
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
                      enquiry.enquiryDateTime || enquiry.createdAt,
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
                      <Ionicons name={row.icon} size={13} color={C.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={DV.detailLabel}>{row.label}</Text>
                      <Text style={DV.detailValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* ── TAB 1: History ── */}
          {tabIdx === 0 &&
            (historyLoading ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 50 }} />
            ) : history.length === 0 ? (
              <View style={DV.emptyWrap}>
                <View style={DV.emptyIcon}>
                  <Ionicons name="time-outline" size={26} color={C.textLight} />
                </View>
                <Text style={DV.emptyText}>No follow-up history yet</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 14, paddingBottom: 30 }}
                showsVerticalScrollIndicator={false}
              >
                {history.map((h, i) => {
                  const tc = getTypeIcon(h.type || h.activityType);
                  const hsc = getHistStatus(h.status);
                  return (
                    <View
                      key={h._id || i}
                      style={{ flexDirection: "row", marginBottom: 14 }}
                    >
                      <View
                        style={{
                          width: 34,
                          alignItems: "center",
                          marginRight: 10,
                        }}
                      >
                        <View
                          style={[
                            DV.timelineDot,
                            { backgroundColor: tc.color },
                          ]}
                        >
                          <Ionicons name={tc.icon} size={12} color="#fff" />
                        </View>
                        {i < history.length - 1 && (
                          <View style={DV.timelineLine} />
                        )}
                      </View>
                      <View style={[DV.histCard, { flex: 1 }]}>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 8,
                          }}
                        >
                          <View>
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: C.text,
                              }}
                            >
                              {h.date}
                            </Text>
                            {h.time && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: C.textLight,
                                  marginTop: 1,
                                }}
                              >
                                {h.time}
                              </Text>
                            )}
                          </View>
                          <View
                            style={[
                              DV.histStatus,
                              { backgroundColor: hsc.color + "18" },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "800",
                                color: hsc.color,
                                letterSpacing: 0.4,
                              }}
                            >
                              {hsc.label}
                            </Text>
                          </View>
                        </View>
                        <View style={DV.histRemarks}>
                          <Text
                            style={{
                              fontSize: 12,
                              color: C.textMuted,
                              lineHeight: 18,
                              fontWeight: "500",
                            }}
                          >
                            {h.remarks || h.note || "-"}
                          </Text>
                          {h.amount > 0 && (
                            <Text
                              style={{
                                fontSize: 12,
                                color: C.success,
                                fontWeight: "800",
                                marginTop: 4,
                              }}
                            >
                              Revenue: ₹{h.amount.toLocaleString()}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ))}

          {/* ── TAB 2: WhatsApp ── */}
          {tabIdx === 3 && (
            <View style={{ flex: 1 }}>
              <ChatScreen
                key={`followup-whatsapp-${enquiry?._id || enquiry?.enqNo || enquiry?.mobile || "chat"}`}
                embedded
                route={{ params: { enquiry } }}
              />
            </View>
          )}

          {/* ── TAB 3: Call Logs ── */}
          {tabIdx === 1 && (
            <View style={{ flex: 1 }}>
              <FollowUpCallPanel enquiry={enquiry} onCallPress={onStartCall} />
            </View>
          )}

          {/* ── TAB 4: Email ── */}
          {tabIdx === 4 && (
            <View style={{ flex: 1 }}>
              <FollowUpEmailPanel enquiry={enquiry} />
            </View>
          )}

          {/* ── TAB 5: Next Follow-up ── */}
          {tabIdx === 2 && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {selectedEnquiry && (
                <View style={{ gap: 12 }}>
                  {/* Context mini card */}
                  <View style={DV.followupContext}>
                    <LinearGradient
                      colors={GRAD.primary}
                      style={DV.followupAvatar}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "800",
                          color: "#fff",
                        }}
                      >
                        {getInitials(selectedEnquiry.name)}
                      </Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: C.text,
                        }}
                      >
                        {selectedEnquiry.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.textMuted }}>
                        {selectedEnquiry.enqNo || selectedEnquiry.mobile}
                      </Text>
                    </View>
                  </View>

                  <View style={FU.sectionCard}>
                    <Text style={FU.sectionTitle}>Conversation Notes</Text>
                    <Text style={FU.sectionSub}>
                      Capture the latest update before scheduling the next
                      action.
                    </Text>
                    <Text style={FU.label}>Remarks *</Text>
                    <FloatingInput
                      label="Follow-up notes"
                      value={editRemarks}
                      onChangeText={setEditRemarks}
                      placeholder="Add notes"
                      multiline
                      minHeight={88}
                      scrollEnabled={false}
                    />
                  </View>

                  <View style={FU.sectionCard}>
                    <Text style={FU.sectionTitle}>Activity Type</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                    >
                      {ACTIVITY_OPTIONS.map((a) => {
                        const active = editActivityType === a;
                        const icon =
                          a === "Phone Call"
                            ? "call-outline"
                            : a === "WhatsApp"
                              ? "logo-whatsapp"
                              : a === "Email"
                                ? "mail-outline"
                                : "people-outline";
                        return (
                          <TouchableOpacity
                            key={a}
                            onPress={() => setEditActivityType(a)}
                            style={[
                              FU.pill,
                              active && {
                                borderColor: C.primaryMid,
                                backgroundColor: C.primarySoft,
                              },
                            ]}
                          >
                            <Ionicons
                              name={icon}
                              size={14}
                              color={active ? C.primary : C.textMuted}
                            />
                            <Text
                              style={[
                                FU.pillText,
                                active && { color: C.primary },
                              ]}
                            >
                              {a}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={FU.sectionCard}>
                    <Text style={FU.sectionTitle}>Status & Schedule</Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      {[
                        { id: "New", icon: "sparkles-outline", color: C.info },
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
                          icon: "cash-outline",
                          color: C.success,
                        },
                        {
                          id: "Closed",
                          icon: "archive-outline",
                          color: C.textLight,
                        },
                      ]
                        .filter((s) => statusOptions.includes(s.id))
                        .map((s) => {
                          const active = editStatus === s.id;
                          return (
                            <TouchableOpacity
                              key={s.id}
                              onPress={() => setEditStatus(s.id)}
                              style={[
                                FU.statusBtn,
                                active && {
                                  borderColor: s.color,
                                  backgroundColor: s.color + "12",
                                },
                              ]}
                            >
                              <Ionicons
                                name={s.icon}
                                size={14}
                                color={s.color}
                              />
                              <Text
                                style={[
                                  {
                                    fontSize: 12,
                                    fontWeight: "600",
                                    color: C.textMuted,
                                  },
                                  active && {
                                    color: s.color,
                                    fontWeight: "700",
                                  },
                                ]}
                              >
                                {s.label || s.id}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>

                    {["New", "Contacted", "Interested"].includes(
                      editStatus,
                    ) && (
                      <>
                        <Text style={FU.label}>Next Date *</Text>
                        <TouchableOpacity
                          style={FU.datePicker}
                          onPress={() => showDatePicker("add")}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={18}
                            color={C.primary}
                          />
                          <Text
                            style={[
                              FU.dateText,
                              !editNextDate && { color: C.textLight },
                            ]}
                          >
                            {editNextDate || "Select date"}
                          </Text>
                        </TouchableOpacity>
                        {editNextDate && (
                          <>
                            <Text style={FU.label}>Time</Text>
                            <View style={FU.datePicker}>
                              <Ionicons
                                name="time-outline"
                                size={18}
                                color={C.primary}
                              />
                              <Text
                                style={[
                                  FU.dateText,
                                  !editNextTime && { color: C.textLight },
                                ]}
                              >
                                {editNextTime || "Auto-selected"}
                              </Text>
                            </View>
                            {isTimePickerVisible && Platform.OS !== "web" && (
                              <DateTimePicker
                                value={timePickerValue}
                                mode="time"
                                is24Hour={false}
                                display="default"
                                onChange={handleConfirmTime}
                              />
                            )}
                          </>
                        )}
                      </>
                    )}
                  </View>

                  {editStatus === "Converted" && (
                    <View style={FU.sectionCard}>
                      <Text style={FU.label}>Amount (₹) *</Text>
                      <FloatingInput
                        label="Amount"
                        value={editAmount}
                        onChangeText={setEditAmount}
                        placeholder="0.00"
                        keyboardType="numeric"
                        containerStyle={{ marginTop: 4 }}
                        inputStyle={{ minHeight: 46 }}
                      />
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={onSaveFollowUp}
                    disabled={isSavingEdit}
                    style={{ marginTop: 16 }}
                  >
                    <LinearGradient
                      colors={isSavingEdit ? ["#ccc", "#bbb"] : GRAD.primary}
                      style={FU.btnPrimary}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 14,
                        }}
                      >
                        {isSavingEdit ? "Saving…" : "Create Follow-up"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </View>
        {tabIdx === 3 && (
          <>
            <View
              pointerEvents="box-only"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 56,
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
                bottom: 0,
                width: 56,
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
    alignItems: "center",
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 8,
    position: "relative",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  tabBtnText: { fontSize: 11, fontWeight: "600", color: C.textMuted },
  swipeHint: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 10,
    opacity: 0.5,
    backgroundColor: "rgba(255,255,255,0.9)",
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
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: { fontSize: 13, color: C.textLight, fontWeight: "500" },
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
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  callPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
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
    height: 48,
    borderRadius: 14,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FollowUpScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const sc = useScale();
  const { user, logout } = useAuth();

  const [menuVisible, setMenuVisible] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [followUps, setFollowUps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(toIso(new Date()));
  const [showMissedModal, setShowMissedModal] = useState(false);

  // Detail view
  const [detailEnquiry, setDetailEnquiry] = useState(null);
  const [detailHistory, setDetailHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);

  // Follow-up composer
  const [editRemarks, setEditRemarks] = useState("");
  const [editActivityType, setEditActivityType] = useState("Phone Call");
  const [editStatus, setEditStatus] = useState("Contacted");
  const [editNextDate, setEditNextDate] = useState("");
  const [editNextTime, setEditNextTime] = useState("");
  const [editTimeMeridian, setEditTimeMeridian] = useState("AM");
  const [editAmount, setEditAmount] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState("add");
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerValue, setTimePickerValue] = useState(new Date());

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
  const lastFocusDate = useRef(null);
  const lastFocusKey = useRef(null);

  const missedItems = useMemo(() => followUps.filter(isMissed), [followUps]);

  // ── Focus ────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      Promise.resolve(
        notificationService.acknowledgeHourlyFollowUpReminders?.(),
      ).catch(() => {});
      const fd = route.params?.focusDate ? String(route.params.focusDate) : "";
      if (fd && lastFocusDate.current !== fd) {
        lastFocusDate.current = fd;
        setSelectedDate(fd);
      } else if (!fd) {
        lastFocusDate.current = null;
        setSelectedDate(toIso(new Date()));
      }
      const stale = Date.now() - lastFetch.current > 60000;
      if (stale || followUps.length === 0) fetchFollowUps(activeTab, true);
    }, [activeTab, route.params?.focusDate]),
  );

  // ── Param effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    const token = route.params?.composerToken,
      enq = route.params?.enquiry;
    if (!route.params?.openComposer || !token || !enq) return;
    if (lastToken.current === token) return;
    lastToken.current = token;
    openDetail(enq);
  }, [
    route.params?.openComposer,
    route.params?.composerToken,
    route.params?.enquiry,
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
    else if (route.params?.openMissedModal) setActiveTab("Missed");
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
    lastFetch.current = 0;
    fetchFollowUps(activeTab, true);
  }, [selectedDate]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("CALL_ENDED", (data) => {
      if (callStarted && callEnquiry) {
        global.__callClaimedByScreen = true;
        handleSaveCallLog({
          phoneNumber: data.phoneNumber,
          callType: data.callType,
          duration: data.duration,
          note: "Auto-logged",
          callTime: data.callTime || new Date(),
          enquiryId: callEnquiry?._id,
          contactName: callEnquiry?.name,
        });
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
        const dur = Math.max(
          0,
          Math.floor((Date.now() - callStartTime) / 1000) - 5,
        );
        handleSaveCallLog({
          phoneNumber: callEnquiry.mobile,
          callType: "Outgoing",
          duration: dur,
          note: "AppState fallback",
          callTime: new Date(),
          enquiryId: callEnquiry._id,
          contactName: callEnquiry.name,
        });
        setCallStarted(false);
        setCallStartTime(null);
      }
    });
    return () => sub.remove();
  }, [callStarted, callStartTime, callEnquiry, autoCallData]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
      lastFetch.current = 0;
      fetchFollowUps(activeTab, true);
    });
    return () => sub.remove();
  }, [activeTab]);

  useEffect(() => {
    const unsub = navigation.addListener("blur", () => {
      setDetailEnquiry(null);
      setDetailHistory([]);
      setHistoryLoading(false);
    });
    return unsub;
  }, [navigation]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchFollowUps = async (tab, refresh = false) => {
    const rid = ++fetchIdRef.current;
    if (refresh) {
      setIsLoading(true);
      setPage(1);
      setHasMore(true);
      setFollowUps([]);
    } else {
      if (!hasMore || isLoadingMore) return;
      setIsLoadingMore(true);
    }
    try {
      const pg = refresh ? 1 : page;
      const res = await followupService.getFollowUps(tab, pg, 20);
      let data = [],
        total = 1;
      if (Array.isArray(res)) {
        data = res;
      } else if (res?.data) {
        data = res.data;
        total = res.pagination?.pages || 1;
      }
      if (rid !== fetchIdRef.current) return;
      data = data.map(mapFollowUpItemToEnquiryCard);
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
      setHasMore(Array.isArray(res) ? false : pg < total);
      refresh ? setFollowUps(data) : setFollowUps((p) => [...p, ...data]);
      lastFetch.current = Date.now();
      if (!refresh) setPage((p) => p + 1);
      else if (data.length > 0 && pg < total) setPage(2);
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
    setDetailEnquiry(fb);
    setSelectedEnquiry(fb);
    try {
      const full = await enquiryService.getEnquiryById(
        item.enqId || item._id || item.enqNo,
      );
      setDetailEnquiry(full || fb);
      setSelectedEnquiry(full || fb);
      setEditStatus(getRecommendedNextStatus((full || fb)?.status || "New"));
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

  // ── Save follow-up ────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!selectedEnquiry) return;
    if (!editRemarks.trim()) {
      Alert.alert("Required", "Enter follow-up remarks");
      return;
    }
    if (
      ["New", "Contacted", "Interested"].includes(editStatus) &&
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
      const remarks =
        editStatus === "Converted"
          ? editRemarks
            ? `${editRemarks} | Sales: ₹${editAmount}`
            : `Sales: ₹${editAmount}`
          : editRemarks;
      const rawAT =
        selectedEnquiry.assignedTo?._id || selectedEnquiry.assignedTo;
      const atId = typeof rawAT === "string" ? rawAT : "";
      const effDate = editNextDate || toIso(new Date());
      const nextAction =
        editStatus === "Converted"
          ? "Sales"
          : ["Not Interested", "Closed"].includes(editStatus)
            ? "Drop"
            : "Followup";
      const fuState =
        nextAction === "Sales"
          ? "Completed"
          : nextAction === "Drop"
            ? "Drop"
            : "Scheduled";
      await followupService.createFollowUp({
        enqId: selectedEnquiry._id,
        enqNo: selectedEnquiry.enqNo,
        name: selectedEnquiry.name,
        mobile: selectedEnquiry.mobile,
        product: selectedEnquiry.product,
        image: selectedEnquiry.image,
        ...(atId ? { assignedTo: atId } : {}),
        activityType: editActivityType,
        type: editActivityType,
        enquiryStatus: editStatus,
        note: remarks,
        remarks,
        date: effDate,
        ...(editNextTime ? { time: editNextTime } : {}),
        followUpDate: effDate,
        nextFollowUpDate: effDate,
        nextAction,
        status: fuState,
        ...(editStatus === "Converted"
          ? {
              amount:
                Number(editAmount.toString().replace(/[^0-9.]/g, "")) || 0,
            }
          : {}),
      });
      await enquiryService.updateEnquiry(
        selectedEnquiry._id || selectedEnquiry.enqNo,
        {
          status: editStatus,
          ...(editStatus === "Converted"
            ? {
                cost:
                  Number(editAmount.toString().replace(/[^0-9.]/g, "")) || 0,
                conversionDate: new Date(),
              }
            : {}),
        },
      );
      lastFetch.current = 0;
      fetchFollowUps(activeTab, true);
      if (["Contacted", "Interested", "Converted"].includes(editStatus))
        confettiRef.current?.play?.();
      setEditRemarks("");
      setEditActivityType("Phone Call");
      setEditStatus("Contacted");
      setEditNextDate("");
      setEditNextTime("");
      setEditTimeMeridian("AM");
      setEditAmount("");
      setSelectedEnquiry(null);
      setDetailEnquiry(null);
      Alert.alert("Success", "Follow-up saved successfully.");
    } catch (e) {
      Alert.alert("Error", e.response?.data?.message || "Could not save");
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
      fetchFollowUps(activeTab, true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartContactCall = useCallback(async (enquiry) => {
    const digits = String(enquiry?.mobile || "").replace(/\D/g, "");
    if (!digits) {
      Alert.alert(
        "Missing number",
        "This enquiry does not have a valid phone number.",
      );
      return;
    }

    try {
      setCallEnquiry(enquiry);
      setCallStartTime(Date.now());
      setCallStarted(true);
      await Linking.openURL(`tel:${digits}`);
    } catch (_error) {
      setCallStarted(false);
      setCallEnquiry(null);
      Alert.alert("Error", "Unable to start the call.");
    }
  }, []);

  // ── Date/time pickers ─────────────────────────────────────────────────────
  const showDatePicker = (target = "add") => {
    setDatePickerTarget(target);
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
    (item, i) => item?._id?.toString() || `item-${i}`,
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top"]}>
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
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={MS.center}>
          <MotiView
            from={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            style={MS.logoutBox}
          >
            <View style={MS.logoutIcon}>
              <Ionicons name="log-out-outline" size={26} color={C.danger} />
            </View>
            <Text style={MS.logoutTitle}>Sign Out?</Text>
            <Text style={MS.logoutSub}>
              You&apos;ll need to log in again to access your data.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              <TouchableOpacity
                style={MS.logoutCancel}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: C.textMuted,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  setShowLogoutModal(false);
                  await logout();
                }}
                style={{ flex: 1 }}
              >
                <LinearGradient colors={GRAD.danger} style={MS.logoutConfirm}>
                  <Text
                    style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}
                  >
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
            onPress={() => setMenuVisible(true)}
          >
            <Ionicons name="menu" size={21} color={C.textSub} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text
              style={{
                fontSize: 11,
                color: C.textMuted,
                fontWeight: "600",
                letterSpacing: 0.3,
              }}
            >
              Follow-up Center
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  fontSize: 17,
                  color: C.text,
                  fontWeight: "800",
                  letterSpacing: -0.3,
                }}
              >
                {user?.name || "Follow-ups"}
              </Text>
              <View style={MS.resultChip}>
                <Ionicons
                  name="layers-outline"
                  size={11}
                  color={C.primaryDark}
                />
                <Text style={MS.resultChipText}>{followUps.length}</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              style={MS.headerBtn}
              onPress={() => setShowMissedModal(true)}
            >
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={missedItems.length > 0 ? C.danger : C.textSub}
              />
              {missedItems.length > 0 && (
                <View style={MS.notifBadge}>
                  <Text style={MS.notifBadgeText}>
                    {missedItems.length > 9 ? "9+" : missedItems.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={MS.profileBtn}
              onPress={() => navigation.navigate("ProfileScreen")}
            >
              {user?.logo ? (
                <Image
                  source={{ uri: getImageUrl(user.logo) }}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <View style={MS.profileFallback}>
                  <Text
                    style={{
                      color: C.primaryDark,
                      fontWeight: "900",
                      fontSize: 15,
                    }}
                  >
                    {user?.name?.[0]?.toUpperCase() || "U"}
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
            style={MS.dateBtn}
          >
            <Ionicons name="calendar-outline" size={15} color={C.primary} />
            <Text
              style={{ fontSize: 11, color: C.primaryDark, fontWeight: "700" }}
            >
              {fmtDate(selectedDate)
                .replace(/\d{4}/, "")
                .trim()
                .replace(/,$/, "")}
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
        }}
      >
        {STATUS_TABS.map((t) => {
          const active = activeTab === t.value;
          const accent = t.color || C.primary;
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
              activeOpacity={0.8}
            >
              <View
                style={[
                  MS.tabIconWrap,
                  { backgroundColor: active ? accent + "24" : C.divider },
                ]}
              >
                <Ionicons
                  name={t.icon}
                  size={12}
                  color={active ? accent : C.textMuted}
                />
              </View>
              <Text
                style={[
                  MS.tabText,
                  active && { color: accent, fontWeight: "800" },
                ]}
              >
                {t.label}
              </Text>
              {active && (
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: accent,
                  }}
                />
              )}
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
          { paddingHorizontal: sc.hPad, paddingTop: 10, paddingBottom: 90 },
          followUps.length === 0 && { flex: 1 },
        ]}
        refreshing={isLoading && followUps.length > 0}
        onRefresh={() => fetchFollowUps(activeTab, true)}
        onEndReached={() => {
          if (!isLoading && !isLoadingMore && hasMore)
            fetchFollowUps(activeTab, false);
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews
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
            <View style={{ alignItems: "center", marginTop: 60, gap: 8 }}>
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  backgroundColor: C.primarySoft,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="calendar-outline" size={32} color={C.primary} />
              </View>
              <Text
                style={{ fontSize: 15, color: C.textSub, fontWeight: "700" }}
              >
                No enquiries found
              </Text>
              <Text style={{ fontSize: 13, color: C.textLight }}>
                No {activeTab} enquiries for this date
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
        onRequestClose={() => setShowMissedModal(false)}
      >
        <TouchableOpacity
          style={MS.center}
          activeOpacity={1}
          onPress={() => setShowMissedModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={MS.missedCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 14,
              }}
            >
              <View>
                <Text
                  style={{ fontSize: 17, fontWeight: "900", color: C.text }}
                >
                  Missed Activity
                </Text>
                <Text
                  style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}
                >
                  {missedItems.length} items need attention
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
                }}
              >
                <Ionicons name="close" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {missedItems.length > 0 ? (
              <ScrollView
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
              >
                {missedItems.map((item, i) => (
                  <TouchableOpacity
                    key={item?._id || i}
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
                      i < missedItems.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: C.divider,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: C.danger + "12",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
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
                        numberOfLines={1}
                      >
                        {item?.name || "Untitled"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
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
                style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={28}
                  color={C.success}
                />
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: C.textSub }}
                >
                  No missed activity
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
        onRequestClose={() => setDatePickerVisible(false)}
      >
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
              }}
            >
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
              onDayPress={(day) => {
                if (day?.dateString)
                  handleConfirmDate(new Date(`${day.dateString}T00:00:00`));
              }}
              enableSwipeMonths
              hideExtraDays
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
              }}
            >
              <Text
                style={{ color: C.danger, fontWeight: "700", fontSize: 14 }}
              >
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
            isSavingEdit={isSavingEdit}
            showDatePicker={showDatePicker}
            setTimePickerValue={setTimePickerValue}
            setTimePickerVisible={setTimePickerVisible}
            isTimePickerVisible={isTimePickerVisible}
            handleConfirmTime={handleConfirmTime}
            setEditTimeMeridian={setEditTimeMeridian}
            timePickerValue={timePickerValue}
            onSaveFollowUp={handleSaveEdit}
            onStartCall={() => handleStartContactCall(detailEnquiry)}
            sc={sc}
            currentStatus={selectedEnquiry?.status || detailEnquiry?.status}
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
    maxHeight: 56,
  },
  tabPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.bg,
  },
  tabIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: { fontSize: 12, fontWeight: "600", color: C.textMuted },
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
});
