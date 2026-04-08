import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    DeviceEventEmitter,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    PermissionsAndroid,
    Platform,
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
import RNImmediatePhoneCall from "react-native-immediate-phone-call";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ListSkeleton } from "../components/skeleton/screens";
import { SkeletonPulse } from "../components/skeleton/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import {
    createCommunicationTask,
    deleteCommunicationTask,
    getCommunicationTasks,
    getCommunicationTeam,
    getCommunicationThreads,
    getConversationMessages,
    sendCommunicationMessage,
    updateCommunicationTask,
    updateCommunicationTaskStatus,
} from "../services/communicationService";
import { ensureSocketReady, getSocket } from "../services/socketService";
import {
    confirmPermissionRequest,
    getUserFacingError,
} from "../utils/appFeedback";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
    bg: "#FFFFFF",
    bgSecondary: "#F0F2F5",
    bgChat: "#EDE5DA",
    ink: "#111B21",
    mid: "#54656F",
    mute: "#8696A0",
    line: "#E9EDEF",
    tabActive: "#00A884",
    tabIndicator: "#00A884",
    accent: "#00A884",
    accentDark: "#008069",
    accentSoft: "#D9FDD3",
    accentBorder: "#C8E6C9",
    bubbleOut: "#D9FDD3",
    bubbleOutBorder: "#C3E0BA",
    bubbleIn: "#FFFFFF",
    bubbleInBorder: "#E9EDEF",
    success: "#166534",
    successSoft: "#F0FDF4",
    successBorder: "#BBF7D0",
    warn: "#92400E",
    warnSoft: "#FFFBEB",
    warnBorder: "#FDE68A",
    danger: "#991B1B",
    dangerSoft: "#FFF1F2",
    dangerBorder: "#FECDD3",
    avatarColors: [
        "#E53935",
        "#D81B60",
        "#8E24AA",
        "#3949AB",
        "#1E88E5",
        "#00ACC1",
        "#00897B",
        "#43A047",
        "#F4511E",
        "#6D4C41",
    ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString().split("T")[0];
const getOrdinalWord = (n) =>
    ({ 1: "Main", 2: "Secondary", 3: "Third", 4: "Fourth" })[n] || `${n}th`;
const formatDate = (v) => {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d)
        ? v
        : d.toLocaleDateString(undefined, {
              month: "short",
              day: "2-digit",
              year: "numeric",
          });
};
const formatClock = (v) => {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d)
        ? ""
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const formatThreadTime = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d)) return "";
    const now = new Date();
    const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    return isToday
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
};
const formatCallDuration = (s) => {
    const t = Math.max(0, Number(s) || 0);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const sanitizePhone = (raw) => String(raw || "").replace(/\D/g, "");
const comparablePhone = (raw) => {
    const c = sanitizePhone(raw);
    return c.length > 10 ? c.slice(-10) : c;
};
const normalizeCallStatus = (value) => {
    const s = String(value || "")
        .trim()
        .toLowerCase();
    if (s === "incoming") return "incoming";
    if (s === "outgoing") return "outgoing";
    if (s === "missed") return "missed";
    if (s === "not attended" || s === "not_attended") return "not_attended";
    return "";
};
const getCallMeta = (status) => {
    switch (normalizeCallStatus(status)) {
        case "incoming":
            return {
                title: "Incoming call",
                icon: "call-outline",
                tint: T.accentDark,
                bg: "#E8F7F1",
                border: "#B7E4D3",
            };
        case "outgoing":
            return {
                title: "Outgoing call",
                icon: "arrow-up-outline",
                tint: "#166534",
                bg: "#ECFDF3",
                border: "#BBF7D0",
            };
        case "missed":
            return {
                title: "Missed call",
                icon: "close-outline",
                tint: T.danger,
                bg: T.dangerSoft,
                border: T.dangerBorder,
            };
        case "not_attended":
            return {
                title: "Not attended",
                icon: "remove-outline",
                tint: T.warn,
                bg: T.warnSoft,
                border: T.warnBorder,
            };
        default:
            return {
                title: "Call",
                icon: "call-outline",
                tint: T.mid,
                bg: T.bgSecondary,
                border: T.line,
            };
    }
};
const buildCallMessageText = ({ status, duration }) => {
    const meta = getCallMeta(status);
    const ns = normalizeCallStatus(status);
    if ((ns === "incoming" || ns === "outgoing") && duration > 0)
        return `${meta.title} • ${formatCallDuration(duration)}`;
    return meta.title;
};
const avatarText = (name) =>
    String(name || "?")
        .split(" ")
        .map((p) => p[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
const getAvatarColor = (name) => {
    let h = 0;
    for (let i = 0; i < String(name || "").length; i++)
        h = name.charCodeAt(i) + ((h << 5) - h);
    return T.avatarColors[Math.abs(h) % T.avatarColors.length];
};
const uniqueById = (items, getId) => {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter((item) => {
        const id = String(getId(item) || "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};
const uniqueMessages = (items) =>
    uniqueById(
        items,
        (i) => i?._id || `${i?.createdAt || ""}-${i?.message || ""}`,
    );
const resolveUserId = (value) =>
    String(value?._id || value?.id || value || "").trim();
const isOwnChatMessage = (item, selfId) => {
    const senderId = resolveUserId(item?.senderId);
    const receiverId = resolveUserId(item?.receiverId);
    if (senderId && selfId) return senderId === selfId;
    if (receiverId && selfId) return receiverId !== selfId;
    return Boolean(item?.isMine || item?.mine || item?.fromSelf);
};
const statusStyle = (s) => {
    if (s === "Completed")
        return { bg: T.successSoft, border: T.successBorder, text: T.success };
    if (s === "In Progress")
        return { bg: T.warnSoft, border: T.warnBorder, text: T.warn };
    if (s === "Cancelled")
        return { bg: T.dangerSoft, border: T.dangerBorder, text: T.danger };
    return { bg: T.accentSoft, border: T.accentBorder, text: T.accentDark };
};
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i;
const PDF_FILE_RE = /\.pdf$/i;
const inferAttachmentType = (asset = {}) => {
    if (asset?.mimeType) return asset.mimeType;
    const src = String(
        asset?.name ||
            asset?.fileName ||
            asset?.attachmentName ||
            asset?.attachmentUrl ||
            asset?.url ||
            asset?.uri ||
            "",
    );
    if (IMAGE_FILE_RE.test(src)) {
        const ext = src.split(".").pop()?.toLowerCase();
        return ext === "png"
            ? "image/png"
            : ext === "gif"
              ? "image/gif"
              : ext === "webp"
                ? "image/webp"
                : "image/jpeg";
    }
    if (PDF_FILE_RE.test(src)) return "application/pdf";
    return "application/octet-stream";
};
const isImageAttachment = (type, ...sources) =>
    String(type || "")
        .toLowerCase()
        .startsWith("image/") ||
    sources.some((s) => IMAGE_FILE_RE.test(String(s || "")));

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
const InitialsAvatar = ({ name, size = 42 }) => (
    <View
        style={[
            S.ava,
            {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: getAvatarColor(name),
            },
        ]}>
        <Text style={[S.avaTxt, { fontSize: size * 0.38 }]}>
            {avatarText(name)}
        </Text>
    </View>
);

const AttachmentPill = ({ attachment, onClear }) => {
    if (!attachment?.name) return null;
    return (
        <View style={S.attPill}>
            <View style={S.attPillIconWrap}>
                <Ionicons
                    name={
                        attachment.type?.startsWith("image/")
                            ? "image-outline"
                            : "document-outline"
                    }
                    size={14}
                    color={T.accent}
                />
            </View>
            <Text style={S.attPillText} numberOfLines={1}>
                {attachment.name}
            </Text>
            {onClear && (
                <TouchableOpacity onPress={onClear} style={S.attPillClose}>
                    <Ionicons name="close-circle" size={16} color={T.mute} />
                </TouchableOpacity>
            )}
        </View>
    );
};

// ─── KEYBOARD HOOK ────────────────────────────────────────────────────────────
/**
 * Returns an Animated.Value = keyboard height above the safe-area bottom.
 *
 * Key guarantees:
 *  - Never double-counts insetBottom (safe-area is already handled by SafeAreaView)
 *  - Skips updates < 10px to prevent flicker from rapid duplicate events
 *  - Clamps to 450px max to reject bogus events on some Android skins
 *  - iOS uses keyboardWillShow/Hide for pre-animation (silky smooth)
 *  - Android uses keyboardDidShow/Hide (fires after keyboard is fully placed)
 *  - Only one Animated.timing runs at a time; previous is stopped before starting new
 */
/* function useKeyboardOffset(insetBottom) {
  const kbOffset = useRef(new Animated.Value(0)).current;
  const currentKb = useRef(0);
  const animRef = useRef(null);

  useEffect(() => {
    const isIos = Platform.OS === "ios";
    const showEvent = isIos ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = isIos ? "keyboardWillHide" : "keyboardDidHide";
    const showDur = isIos ? 250 : 200;
    const hideDur = isIos ? 200 : 150;

    const animate = (toValue, duration) => {
      animRef.current?.stop();
      animRef.current = Animated.timing(kbOffset, {
        toValue,
        duration,
        useNativeDriver: false,
      });
      animRef.current.start();
    };

    const onShow = (e) => {
      const raw = (e?.endCoordinates?.height ?? 0) - insetBottom;
      // Clamp: real keyboards 180–450px; outside range = bogus event, ignore
      const kb = Math.max(0, Math.min(raw, 450));
      if (Math.abs(kb - currentKb.current) < 10) return; // skip tiny/duplicate
      currentKb.current = kb;
      animate(kb, showDur);
    };

    const onHide = () => {
      if (currentKb.current === 0) return; // already at 0, skip
      currentKb.current = 0;
      animate(0, hideDur);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
      animRef.current?.stop();
    };
  }, [insetBottom, kbOffset]);

  return kbOffset;
} */

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function CommunicationScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { height: windowHeight, width: windowWidth } = useWindowDimensions();
    const { user } = useAuth();
    const selfId = String(user?.id || user?._id || "");
    const isAdminUser = String(user?.role || "").toLowerCase() === "admin";
    const isCompactHeight = windowHeight < 760;
    const isWideLayout = windowWidth >= 768;

    const [view, setView] = useState("list");
    const [tab, setTab] = useState("Chats");
    const [searchQuery, setSearchQuery] = useState("");
    const [team, setTeam] = useState([]);
    const [threads, setThreads] = useState([]);
    const [selectedMemberId, setSelectedMemberId] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [messageLoading, setMessageLoading] = useState(false);
    const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [olderCursorBefore, setOlderCursorBefore] = useState("");
    const [olderCursorBeforeId, setOlderCursorBeforeId] = useState("");
    const [messageText, setMessageText] = useState("");
    const [messageAttachment, setMessageAttachment] = useState(null);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [previewImageUri, setPreviewImageUri] = useState("");
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [recordingDurationMs, setRecordingDurationMs] = useState(0);
    const [audioDraft, setAudioDraft] = useState(null);
    const [playingAudioId, setPlayingAudioId] = useState("");
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [pendingTasks, setPendingTasks] = useState([]);
    const [completedTasks, setCompletedTasks] = useState([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
    const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
    const [taskSaving, setTaskSaving] = useState(false);
    const [taskAttachment, setTaskAttachment] = useState(null);
    const [editingTaskId, setEditingTaskId] = useState("");
    const [highlightedTaskId, setHighlightedTaskId] = useState("");
    const [taskForm, setTaskForm] = useState({
        title: "",
        description: "",
        priority: "Medium",
        assignedTo: "",
    });

    const listRef = useRef(null);
    const lastCallEventRef = useRef("");
    const recordingRef = useRef(null);
    const soundRef = useRef(null);
    const swipeStartXRef = useRef(0);
    const swipeStartYRef = useRef(0);
    const messageSyncTimerRef = useRef(null);
    const loadingOlderRef = useRef(false);
    const lastOlderLoadAtRef = useRef(0);
    const isAtBottomRef = useRef(true);
    const shouldAutoScrollRef = useRef(true);

    const MESSAGE_PAGE_SIZE = 50;

    useEffect(() => {
        if (view !== "taskDetail") return;
        if (!selectedTaskForDetail?._id) return;
        const id = String(selectedTaskForDetail._id);
        const updated =
            [...pendingTasks, ...completedTasks].find(
                (t) => String(t?._id || "") === id,
            ) || null;
        if (updated) setSelectedTaskForDetail(updated);
    }, [view, pendingTasks, completedTasks, selectedTaskForDetail?._id]);

    // ── Single reliable keyboard offset ───────────────────────────────────────

    const scrollToEnd = useCallback((animated = true) => {
        listRef.current?.scrollToEnd?.({ animated });
    }, []);

    const closeImagePreview = useCallback(() => {
        setPreviewImageUri("");
    }, []);

    const resetRecordingState = useCallback(() => {
        recordingRef.current = null;
        setIsRecordingAudio(false);
        setRecordingDurationMs(0);
    }, []);

    const unloadCurrentSound = useCallback(async () => {
        const activeSound = soundRef.current;
        soundRef.current = null;
        setPlayingAudioId("");
        setIsPlayingAudio(false);
        if (activeSound) {
            try {
                await activeSound.unloadAsync();
            } catch {
                // ignore unload failures while switching audio
            }
        }
    }, []);

    // ── Android hardware back ──────────────────────────────────────────────────
    useEffect(() => {
        const onBack = () => {
            if (previewImageUri) {
                closeImagePreview();
                return true;
            }
            if (view === "chat") {
                unloadCurrentSound().catch(() => {});
                setAudioDraft(null);
                setView("list");
                setMessages([]);
                return true;
            }
            return false;
        };
        const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
        return () => sub.remove();
    }, [closeImagePreview, previewImageUri, unloadCurrentSound, view]);

    // ── Derived ────────────────────────────────────────────────────────────────
    const adminRoleLabelMap = useMemo(() => {
        const admins = [...team]
            .filter((m) => String(m?.role || "").toLowerCase() === "admin")
            .sort(
                (a, b) =>
                    new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0),
            );
        return admins.reduce((acc, item, i) => {
            acc[String(item._id)] = `${getOrdinalWord(i + 1)} Admin`;
            return acc;
        }, {});
    }, [team]);

    const teamMap = useMemo(
        () => new Map(team.map((m) => [String(m._id), m])),
        [team],
    );
    const selectedMember = teamMap.get(String(selectedMemberId)) || null;

    const memberPhoneMap = useMemo(() => {
        const map = new Map();
        team.forEach((m) => {
            const p = comparablePhone(m?.mobile);
            if (p) map.set(p, m);
        });
        return map;
    }, [team]);

    const taskAssigneeOptions = useMemo(
        () =>
            uniqueById(
                team.filter((m) => String(m._id) !== selfId),
                (m) => m?._id,
            ),
        [team, selfId],
    );

    const contactList = useMemo(() => {
        const threadMap = new Map(
            threads.map((t) => [String(t?.member?._id || ""), t]),
        );
        return team
            .filter((m) => String(m._id) !== selfId)
            .map((m) => ({
                member: m,
                thread: threadMap.get(String(m._id)) || null,
            }))
            .filter(
                (c) =>
                    !searchQuery.trim() ||
                    String(c.member?.name || "")
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()),
            );
    }, [team, threads, selfId, searchQuery]);

    const groupedContacts = useMemo(
        () => ({
            admins: contactList.filter(
                (c) => String(c.member?.role || "").toLowerCase() === "admin",
            ),
            staff: contactList.filter(
                (c) => String(c.member?.role || "").toLowerCase() !== "admin",
            ),
        }),
        [contactList],
    );

    const totalUnread = useMemo(
        () =>
            threads.reduce((sum, t) => sum + (Number(t?.unreadCount) || 0), 0),
        [threads],
    );

    // ── Thread helpers ─────────────────────────────────────────────────────────
    const getThreadPreview = useCallback((message) => {
        if (message?.messageType === "call")
            return buildCallMessageText({
                status: message?.callStatus,
                duration: message?.callDuration,
            });
        if (message?.messageType === "audio") return "Voice message";
        if (message?.messageType === "task") return "Task shared";
        return message?.message || message?.attachmentName || "Attachment";
    }, []);

    const upsertThreadFromMessage = useCallback(
        (payload, unreadIncrement = false) => {
            const senderId = String(
                payload?.senderId?._id || payload?.senderId || "",
            );
            const receiverId = String(
                payload?.receiverId?._id || payload?.receiverId || "",
            );
            if (!senderId || !receiverId) return;
            const teammateId = senderId === selfId ? receiverId : senderId;
            setThreads((prev) => {
                const member = teamMap.get(String(teammateId));
                const rest = prev.filter(
                    (i) => String(i?.member?._id || "") !== String(teammateId),
                );
                return [
                    {
                        member,
                        lastMessage: getThreadPreview(payload),
                        messageType: payload?.messageType || "text",
                        callStatus: payload?.callStatus || "",
                        lastMessageAt:
                            payload?.callTime ||
                            payload?.createdAt ||
                            new Date().toISOString(),
                        unreadCount: unreadIncrement
                            ? Number(
                                  prev.find(
                                      (i) =>
                                          String(i?.member?._id || "") ===
                                          String(teammateId),
                                  )?.unreadCount || 0,
                              ) + 1
                            : 0,
                    },
                    ...rest,
                ];
            });
        },
        [getThreadPreview, selfId, teamMap],
    );

    // ── Data loading ───────────────────────────────────────────────────────────
    const loadTasks = useCallback(async () => {
        setTasksLoading(true);
        try {
            const [pending, completed] = await Promise.all([
                getCommunicationTasks("pending"),
                getCommunicationTasks("completed"),
            ]);
            setPendingTasks(Array.isArray(pending) ? pending : []);
            setCompletedTasks(Array.isArray(completed) ? completed : []);
        } catch (e) {
            Alert.alert(
                "Error",
                e?.response?.data?.error || "Failed to load tasks",
            );
        } finally {
            setTasksLoading(false);
        }
    }, []);

    const loadMessages = useCallback(async (memberId) => {
        if (!memberId) {
            setMessages([]);
            setHasOlderMessages(false);
            setOlderCursorBefore("");
            setOlderCursorBeforeId("");
            return;
        }
        setMessageLoading(true);
        try {
            const r = await getConversationMessages(memberId, {
                limit: MESSAGE_PAGE_SIZE,
            });
            setMessages(uniqueMessages(r?.messages));
            setHasOlderMessages(Boolean(r?.page?.hasMore));
            setOlderCursorBefore(String(r?.page?.before || ""));
            setOlderCursorBeforeId(String(r?.page?.beforeId || ""));
            shouldAutoScrollRef.current = true;
        } catch (e) {
            Alert.alert(
                "Error",
                e?.response?.data?.error || "Failed to load messages",
            );
        } finally {
            setMessageLoading(false);
        }
    }, []);

    const loadOlder = useCallback(async () => {
        const memberId = String(selectedMemberId || "");
        if (!memberId) return;
        if (!hasOlderMessages) return;
        if (!olderCursorBefore) return;
        if (loadingOlderRef.current) return;

        const now = Date.now();
        if (now - lastOlderLoadAtRef.current < 800) return;
        lastOlderLoadAtRef.current = now;

        loadingOlderRef.current = true;
        setLoadingOlderMessages(true);
        shouldAutoScrollRef.current = false;
        try {
            const r = await getConversationMessages(memberId, {
                limit: MESSAGE_PAGE_SIZE,
                before: olderCursorBefore,
                beforeId: olderCursorBeforeId || undefined,
            });
            const older = uniqueMessages(r?.messages);
            if (older.length) {
                setMessages((prev) => uniqueMessages([...older, ...prev]));
            }
            setHasOlderMessages(Boolean(r?.page?.hasMore));
            setOlderCursorBefore(String(r?.page?.before || ""));
            setOlderCursorBeforeId(String(r?.page?.beforeId || ""));
        } catch (_e) {
            // ignore (user can retry by scrolling again)
        } finally {
            loadingOlderRef.current = false;
            setLoadingOlderMessages(false);
        }
    }, [
        MESSAGE_PAGE_SIZE,
        hasOlderMessages,
        olderCursorBefore,
        olderCursorBeforeId,
        selectedMemberId,
    ]);

    const syncLatestMessages = useCallback(
        async (memberId) => {
            if (!memberId) return;
            try {
                const r = await getConversationMessages(memberId, {
                    limit: MESSAGE_PAGE_SIZE,
                });
                const latest = uniqueMessages(r?.messages);
                setMessages((prev) => uniqueMessages([...prev, ...latest]));
            } catch {
                // ignore
            }
        },
        [MESSAGE_PAGE_SIZE],
    );

    const loadOverview = useCallback(async () => {
        try {
            setLoading(true);
            const [teamData, threadData] = await Promise.all([
                getCommunicationTeam(),
                getCommunicationThreads(),
            ]);
            setTeam(uniqueById(teamData, (m) => m?._id));
            setThreads(uniqueById(threadData, (t) => t?.member?._id));
            await loadTasks();
        } catch (e) {
            Alert.alert(
                "Error",
                e?.response?.data?.error || "Failed to load communication",
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [loadTasks]);

    const handleMessageScroll = useCallback(
        (e) => {
            const n = e?.nativeEvent || {};
            const y = Number(n?.contentOffset?.y || 0);
            const h = Number(n?.layoutMeasurement?.height || 0);
            const ch = Number(n?.contentSize?.height || 0);

            const distanceFromBottom = ch - (y + h);
            const atBottom = distanceFromBottom < 120;
            isAtBottomRef.current = atBottom;
            if (atBottom) {
                shouldAutoScrollRef.current = true;
            } else if (distanceFromBottom > 240) {
                shouldAutoScrollRef.current = false;
            }

            if (y < 60) {
                Promise.resolve(loadOlder()).catch(() => {});
            }
        },
        [loadOlder],
    );

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    const allTasks = useMemo(
        () => [...(pendingTasks || []), ...(completedTasks || [])],
        [pendingTasks, completedTasks],
    );

    const taskStatusCountsFor = useCallback((tasks = []) => {
        const counts = { pending: 0, inProgress: 0, completed: 0 };
        for (const t of Array.isArray(tasks) ? tasks : []) {
            const s = String(t?.status || "").trim();
            if (s === "Completed") counts.completed += 1;
            else if (s === "In Progress") counts.inProgress += 1;
            else if (s === "Cancelled") {
                // skip (not shown in header counts)
            } else counts.pending += 1;
        }
        return counts;
    }, []);

    // Header counts: only tasks assigned to the current user.
    // (Admin-created tasks assigned to staff should NOT increase admin header counts.)
    const assignedToMeTasks = useMemo(() => {
        return allTasks.filter((t) => {
            const assignedId = resolveUserId(t?.assignedTo);
            return assignedId && assignedId === selfId;
        });
    }, [allTasks, selfId]);

    const selfTaskCounts = useMemo(
        () => taskStatusCountsFor(assignedToMeTasks),
        [assignedToMeTasks, taskStatusCountsFor],
    );

    const openTaskDashboard = useCallback(() => {
        navigation.navigate("TaskDashboard");
    }, [navigation]);

    // ── Socket ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        let disposed = false;
        let sock = null;

        // Ensure socket is initialized so real-time events flow without manual refresh.
        Promise.resolve()
            .then(async () => {
                sock = getSocket();
                if (!sock) sock = await ensureSocketReady({ timeoutMs: 15000 });
                if (disposed || !sock) return;
                sock.on("COMMUNICATION_TASK_UPDATED", loadTasks);
            })
            .catch(() => {});

        const handleMsg = (payload) => {
            const senderId = String(
                payload?.senderId?._id || payload?.senderId || "",
            );
            const receiverId = String(
                payload?.receiverId?._id || payload?.receiverId || "",
            );
            if (!senderId || !receiverId) return;
            const teammateId = senderId === selfId ? receiverId : senderId;

            upsertThreadFromMessage(
                payload,
                receiverId === selfId &&
                    String(selectedMemberId) !== String(teammateId),
            );
            if (String(selectedMemberId) === String(teammateId)) {
                shouldAutoScrollRef.current =
                    isAtBottomRef.current || senderId === selfId;
                setMessages((prev) => uniqueMessages([...prev, payload]));

                // Hard guarantee: ensure we sync latest messages from server too.
                // This fixes cases where local append is missed due to state races.
                try {
                    if (messageSyncTimerRef.current) {
                        clearTimeout(messageSyncTimerRef.current);
                    }
                    messageSyncTimerRef.current = setTimeout(() => {
                        syncLatestMessages(String(selectedMemberId)).catch(
                            () => {},
                        );
                    }, 250);
                } catch {
                    /* ignore */
                }
            }
        };

        const msgSub = DeviceEventEmitter.addListener(
            "COMMUNICATION_MESSAGE_CREATED",
            handleMsg,
        );
        const taskSub = DeviceEventEmitter.addListener(
            "COMMUNICATION_TASK_UPDATED",
            () => loadTasks(),
        );

        return () => {
            disposed = true;
            msgSub?.remove?.();
            taskSub?.remove?.();
            if (sock) {
                sock.off("COMMUNICATION_TASK_UPDATED", loadTasks);
            }
            if (messageSyncTimerRef.current) {
                clearTimeout(messageSyncTimerRef.current);
                messageSyncTimerRef.current = null;
            }
        };
    }, [loadTasks, selectedMemberId, selfId, syncLatestMessages, upsertThreadFromMessage]);

    useEffect(
        () => () => {
            const activeRecording = recordingRef.current;
            if (activeRecording) {
                activeRecording.stopAndUnloadAsync().catch(() => {});
            }
            unloadCurrentSound().catch(() => {});
            Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            }).catch(() => {});
        },
        [unloadCurrentSound],
    );

    // Auto-scroll on new messages — single timeout, no retry chain
    useEffect(() => {
        if (!messages.length) return;
        if (!shouldAutoScrollRef.current) return;
        if (loadingOlderRef.current) return;
        const t = setTimeout(() => scrollToEnd(true), 80);
        return () => clearTimeout(t);
    }, [messages, scrollToEnd]);

    // ── Call events ────────────────────────────────────────────────────────────
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            "CALL_ENDED",
            async (event) => {
                const phone = comparablePhone(event?.phoneNumber);
                const member = memberPhoneMap.get(phone);
                const status = normalizeCallStatus(event?.callType);
                if (!member || !status) return;
                const eventAt = new Date(
                    event?.callTime || Date.now(),
                ).toISOString();
                const key = [
                    String(member._id),
                    status,
                    Number(event?.duration || 0),
                    eventAt,
                ].join("|");
                if (lastCallEventRef.current === key) return;
                lastCallEventRef.current = key;
                try {
                    const saved = await sendCommunicationMessage({
                        receiverId: String(member._id),
                        messageType: "call",
                        callStatus: status,
                        callDuration: Number(event?.duration || 0),
                        callTime: eventAt,
                        message: buildCallMessageText({
                            status,
                            duration: Number(event?.duration || 0),
                        }),
                    });
                    upsertThreadFromMessage(saved);
                    if (String(selectedMemberId) === String(member._id))
                        setMessages((prev) => uniqueMessages([...prev, saved]));
                } catch (error) {
                    console.warn("Call sync failed", error);
                }
            },
        );
        return () => sub.remove();
    }, [memberPhoneMap, selectedMemberId, upsertThreadFromMessage]);

    // ── Actions ────────────────────────────────────────────────────────────────
    const handleInitiateCall = useCallback(async (member) => {
        const rawPhone = sanitizePhone(member?.mobile);
        if (!rawPhone) {
            Alert.alert(
                "No phone number",
                "This team member has no phone number.",
            );
            return;
        }
        try {
            if (Platform.OS === "android") {
                const confirmed = await confirmPermissionRequest({
                    title: "Allow phone calls?",
                    message: "Phone permission is used only when you tap Call.",
                    confirmText: "Continue",
                });
                if (!confirmed) return;
                const result = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.CALL_PHONE,
                ]);
                if (
                    result[PermissionsAndroid.PERMISSIONS.CALL_PHONE] !==
                    PermissionsAndroid.RESULTS.GRANTED
                ) {
                    Alert.alert(
                        "Permission denied",
                        "Phone permission is required.",
                    );
                    return;
                }
            }
            let started = false;
            try {
                if (
                    RNImmediatePhoneCall &&
                    typeof RNImmediatePhoneCall.immediatePhoneCall ===
                        "function"
                ) {
                    RNImmediatePhoneCall.immediatePhoneCall(rawPhone);
                    started = true;
                }
            } catch {
                started = false;
            }
            if (!started) {
                const url = `tel:${rawPhone}`;
                if (!(await Linking.canOpenURL(url))) {
                    Alert.alert(
                        "Unsupported",
                        "Calling is not supported on this device.",
                    );
                    return;
                }
                await Linking.openURL(url);
            }
        } catch (error) {
            Alert.alert(
                "Call failed",
                getUserFacingError(error, "Unable to start the call."),
            );
        }
    }, []);

    const openChat = useCallback(
        async (memberId) => {
            await unloadCurrentSound();
            setAudioDraft(null);
            setHasOlderMessages(false);
            setOlderCursorBefore("");
            setOlderCursorBeforeId("");
            setSelectedMemberId(String(memberId));
            setView("chat");
            await loadMessages(String(memberId));
            setThreads((prev) =>
                prev.map((t) =>
                    String(t?.member?._id) === String(memberId)
                        ? { ...t, unreadCount: 0 }
                        : t,
                ),
            );
        },
        [loadMessages, unloadCurrentSound],
    );

    const pickMessageImage = useCallback(async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
            Alert.alert("Permission needed", "Please allow photo access.");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
        });
        if (!result.canceled && result.assets?.[0]) {
            const a = result.assets[0];
            setMessageAttachment({
                uri: a.uri,
                type: a.mimeType || "image/jpeg",
                name: a.fileName || "image.jpg",
            });
        }
    }, []);

    const pickDocument = useCallback(async (setter) => {
        const result = await DocumentPicker.getDocumentAsync({
            type: ["application/pdf", "image/*", "*/*"],
            copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const a = result.assets[0];
        setter({
            uri: a.uri,
            type: inferAttachmentType(a),
            name: a.name || "attachment",
        });
    }, []);

    const formatRecordingDuration = useCallback((durationMs) => {
        const totalSeconds = Math.max(
            0,
            Math.floor((Number(durationMs) || 0) / 1000),
        );
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }, []);

    const startAudioRecording = useCallback(async () => {
        try {
            const permission = await Audio.requestPermissionsAsync();
            if (!permission.granted) {
                Alert.alert(
                    "Permission needed",
                    "Please allow microphone access.",
                );
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                staysActiveInBackground: false,
                playThroughEarpieceAndroid: false,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY,
                (status) => {
                    if (status?.isRecording) {
                        setRecordingDurationMs(status.durationMillis || 0);
                    }
                },
            );

            recordingRef.current = recording;
            setRecordingDurationMs(0);
            setIsRecordingAudio(true);
        } catch (error) {
            resetRecordingState();
            Alert.alert(
                "Recording failed",
                getUserFacingError(error, "Unable to start voice recording."),
            );
        }
    }, [resetRecordingState]);

    const stopAndSendAudioRecording = useCallback(async () => {
        const activeRecording = recordingRef.current;
        if (!activeRecording) {
            resetRecordingState();
            return;
        }

        try {
            await activeRecording.stopAndUnloadAsync();
            const uri = activeRecording.getURI();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                staysActiveInBackground: false,
                playThroughEarpieceAndroid: false,
            });

            if (!uri) {
                throw new Error("Recording file not available");
            }

            setAudioDraft({
                uri,
                type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
                name: `voice-note-${Date.now()}.m4a`,
                durationMs: recordingDurationMs,
            });
        } catch (error) {
            Alert.alert(
                "Recording failed",
                error?.response?.data?.error ||
                    getUserFacingError(
                        error,
                        "Unable to send voice recording.",
                    ),
            );
        } finally {
            resetRecordingState();
        }
    }, [recordingDurationMs, resetRecordingState]);

    const resetTaskComposer = useCallback(() => {
        setEditingTaskId("");
        setTaskAttachment(null);
        setTaskForm({
            title: "",
            description: "",
            priority: "Medium",
            assignedTo: "",
        });
    }, []);
    const openCreateTaskModal = useCallback(
        (assignedTo = "") => {
            resetTaskComposer();
            if (assignedTo)
                setTaskForm((p) => ({ ...p, assignedTo: String(assignedTo) }));
            setShowTaskModal(true);
        },
        [resetTaskComposer],
    );
    const openTaskFromMessage = useCallback(
        (messageItem) => {
            const taskId = String(
                messageItem?.taskId?._id || messageItem?.taskId || "",
            );
            if (!taskId) return;

            const taskStatus = String(messageItem?.taskId?.status || "Pending");
            setView("list");
            setTab(taskStatus === "Completed" ? "Completed" : "Pending");
            setHighlightedTaskId(taskId);
            setTimeout(() => setHighlightedTaskId(""), 2200);
        },
        [setHighlightedTaskId, setTab, setView],
    );
    const openEditTaskModal = useCallback((task) => {
        if (!task?._id) return;
        setEditingTaskId(String(task._id));
        setTaskAttachment(
            task?.attachmentUrl
                ? {
                      uri: getImageUrl(task.attachmentUrl),
                      type:
                          task.attachmentMimeType || inferAttachmentType(task),
                      name: task.attachmentName || "attachment",
                      existing: true,
                  }
                : null,
        );
        setTaskForm({
            title: String(task?.title || ""),
            description: String(task?.description || ""),
            priority: String(task?.priority || "Medium"),
            assignedTo: String(task?.assignedTo?._id || task?.assignedTo || ""),
        });
        setShowTaskModal(true);
    }, []);

    const sendMessage = useCallback(async () => {
        if (!selectedMemberId || (!messageText.trim() && !messageAttachment))
            return;
        try {
            setSendingMessage(true);
            const sent = await sendCommunicationMessage({
                receiverId: selectedMemberId,
                message: messageText.trim(),
                attachment: messageAttachment,
            });
            setMessages((prev) => uniqueMessages([...prev, sent]));
            setMessageText("");
            setMessageAttachment(null);
            upsertThreadFromMessage(sent);
        } catch (e) {
            Alert.alert(
                "Error",
                e?.response?.data?.error || "Failed to send message",
            );
        } finally {
            setSendingMessage(false);
        }
    }, [
        messageAttachment,
        messageText,
        selectedMemberId,
        upsertThreadFromMessage,
    ]);

    const sendAudioDraft = useCallback(async () => {
        if (!selectedMemberId || !audioDraft?.uri) return;
        try {
            setSendingMessage(true);
            const sent = await sendCommunicationMessage({
                receiverId: selectedMemberId,
                messageType: "audio",
                attachment: {
                    uri: audioDraft.uri,
                    type: audioDraft.type || "audio/mp4",
                    name: audioDraft.name || `voice-note-${Date.now()}.m4a`,
                },
            });
            setMessages((prev) => uniqueMessages([...prev, sent]));
            setAudioDraft(null);
            upsertThreadFromMessage(sent);
        } catch (error) {
            Alert.alert(
                "Voice note failed",
                error?.response?.data?.error ||
                    getUserFacingError(
                        error,
                        "Unable to send voice recording.",
                    ),
            );
        } finally {
            setSendingMessage(false);
        }
    }, [audioDraft, selectedMemberId, upsertThreadFromMessage]);

    const discardAudioDraft = useCallback(() => {
        setAudioDraft(null);
    }, []);

    const handleComposerPrimaryPress = useCallback(async () => {
        if (audioDraft?.uri) {
            await sendAudioDraft();
            return;
        }
        if (messageText.trim() || messageAttachment) {
            await sendMessage();
            return;
        }
        if (isRecordingAudio) {
            await stopAndSendAudioRecording();
            return;
        }
        await startAudioRecording();
    }, [
        audioDraft,
        isRecordingAudio,
        messageAttachment,
        messageText,
        sendAudioDraft,
        sendMessage,
        startAudioRecording,
        stopAndSendAudioRecording,
    ]);

    const toggleAudioPlayback = useCallback(
        async (item) => {
            const messageId = String(item?._id || item?.attachmentUrl || "");
            const audioUri = item?.attachmentUrl
                ? getImageUrl(item.attachmentUrl)
                : "";
            if (!messageId || !audioUri) return;

            try {
                if (playingAudioId === messageId && soundRef.current) {
                    if (isPlayingAudio) {
                        await soundRef.current.pauseAsync();
                        setIsPlayingAudio(false);
                    } else {
                        await soundRef.current.playAsync();
                        setIsPlayingAudio(true);
                    }
                    return;
                }

                await unloadCurrentSound();
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    staysActiveInBackground: false,
                    playThroughEarpieceAndroid: false,
                });
                const { sound } = await Audio.Sound.createAsync(
                    { uri: audioUri },
                    { shouldPlay: true },
                    (status) => {
                        if (!status?.isLoaded) return;
                        if (status.didJustFinish) {
                            unloadCurrentSound().catch(() => {});
                            return;
                        }
                        setPlayingAudioId(messageId);
                        setIsPlayingAudio(Boolean(status.isPlaying));
                    },
                );
                soundRef.current = sound;
                setPlayingAudioId(messageId);
                setIsPlayingAudio(true);
            } catch (error) {
                await unloadCurrentSound();
                Alert.alert(
                    "Playback failed",
                    getUserFacingError(
                        error,
                        "Unable to play this voice message.",
                    ),
                );
            }
        },
        [isPlayingAudio, playingAudioId, unloadCurrentSound],
    );

    const submitTask = useCallback(async () => {
        if (!taskForm.title.trim()) {
            Alert.alert("Required", "Task title is required.");
            return;
        }
        try {
            setTaskSaving(true);
            const payload = {
                ...taskForm,
                title: taskForm.title.trim(),
                description: taskForm.description.trim(),
                dueDate: todayIso(),
                taskType: "General",
                attachment: taskAttachment,
            };
            if (editingTaskId) {
                await updateCommunicationTask(editingTaskId, payload);
            } else {
                await createCommunicationTask(payload);
            }
            setShowTaskModal(false);
            resetTaskComposer();
            await loadTasks();
            Alert.alert(
                "Success",
                editingTaskId
                    ? "Task updated successfully."
                    : "Task created successfully.",
            );
        } catch (e) {
            Alert.alert(
                "Error",
                e?.response?.data?.error ||
                    (editingTaskId
                        ? "Failed to update task"
                        : "Failed to create task"),
            );
        } finally {
            setTaskSaving(false);
        }
    }, [editingTaskId, loadTasks, resetTaskComposer, taskAttachment, taskForm]);

    const setTaskStatus = useCallback(
        async (taskId, status) => {
            try {
                await updateCommunicationTaskStatus(taskId, status);
                // Go back to list view
                setView("list");
                setSelectedTaskForDetail(null);
                // Auto-switch to completed tab when marking as complete
                if (status === "Completed" && tab === "Pending") {
                    setTab("Completed");
                }
                // Reload tasks after status change
                await loadTasks();
            } catch (e) {
                Alert.alert(
                    "Error",
                    e?.response?.data?.error || "Failed to update task",
                );
            }
        },
        [loadTasks, tab],
    );

    const deleteTask = useCallback(
        (task) => {
            if (!isAdminUser || !task?._id) return;
            Alert.alert(
                "Delete task",
                `Delete "${task.title || "this task"}"?`,
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                            try {
                                await deleteCommunicationTask(task._id);
                                await loadTasks();
                            } catch (e) {
                                Alert.alert(
                                    "Error",
                                    e?.response?.data?.error ||
                                        "Failed to delete task",
                                );
                            }
                        },
                    },
                ],
            );
        },
        [isAdminUser, loadTasks],
    );

    // ── LOADING ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <SafeAreaView style={S.screen} edges={["left", "right"]}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                <View
                    style={{
                        paddingHorizontal: 18,
                        paddingTop: insets.top + 18,
                    }}>
                    <SkeletonPulse>
                        <ListSkeleton count={8} itemHeight={68} withAvatar />
                    </SkeletonPulse>
                </View>
            </SafeAreaView>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAT SCREEN
    // ═══════════════════════════════════════════════════════════════════════════
    if (view === "chat" && selectedMember) {
        const roleLabel =
            String(selectedMember.role || "").toLowerCase() === "admin"
                ? adminRoleLabelMap[String(selectedMember._id)] || "Admin"
                : "Staff Member";

        const renderMessageItem = ({ item }) => {
            if (item?.messageType === "call") {
                const meta = getCallMeta(item?.callStatus);
                return (
                    <View style={S.callEventWrap}>
                        <View
                            style={[
                                S.callEventCard,
                                {
                                    backgroundColor: meta.bg,
                                    borderColor: meta.border,
                                },
                            ]}>
                            <View
                                style={[
                                    S.callEventIcon,
                                    {
                                        backgroundColor: "#fff",
                                        borderColor: meta.border,
                                    },
                                ]}>
                                <Ionicons
                                    name={meta.icon}
                                    size={15}
                                    color={meta.tint}
                                />
                            </View>
                            <View style={S.callEventTextWrap}>
                                <Text
                                    style={[
                                        S.callEventTitle,
                                        { color: meta.tint },
                                    ]}>
                                    {meta.title}
                                </Text>
                                <Text style={S.callEventMeta}>
                                    {formatClock(
                                        item?.callTime || item?.createdAt,
                                    )}
                                    {Number(item?.callDuration || 0) > 0
                                        ? ` • ${formatCallDuration(item.callDuration)}`
                                        : ""}
                                </Text>
                            </View>
                        </View>
                    </View>
                );
            }

            const isMine = isOwnChatMessage(item, selfId);
            const attachmentMime = String(item?.attachmentMimeType || "")
                .trim()
                .toLowerCase();
            const attachmentUri = item?.attachmentUrl
                ? getImageUrl(item.attachmentUrl)
                : "";
            const isImageMessage =
                String(item?.messageType || "").toLowerCase() === "image" ||
                attachmentMime.startsWith("image/");
            const isAudioMessage =
                item?.messageType === "audio" ||
                String(item?.attachmentMimeType || "")
                    .toLowerCase()
                    .startsWith("audio/");
            const isThisAudioPlaying =
                playingAudioId === String(item?._id || "") && isPlayingAudio;
            return (
                <View style={[S.msgRow, isMine ? S.msgRowOut : S.msgRowIn]}>
                    {!isMine && (
                        <InitialsAvatar
                            name={selectedMember?.name || "?"}
                            size={30}
                        />
                    )}
                    <View
                        style={[
                            S.msgBubble,
                            isMine ? S.msgBubbleOut : S.msgBubbleIn,
                        ]}>
                        {item.attachmentUrl ? (
                            isImageMessage ? (
                                <TouchableOpacity
                                    activeOpacity={0.92}
                                    onPress={() =>
                                        setPreviewImageUri(attachmentUri)
                                    }>
                                    <Image
                                        source={{ uri: attachmentUri }}
                                        style={S.msgImage}
                                    />
                                </TouchableOpacity>
                            ) : isAudioMessage ? (
                                <TouchableOpacity
                                    style={[
                                        S.audioBubble,
                                        isMine && S.audioBubbleOut,
                                    ]}
                                    activeOpacity={0.88}
                                    onPress={() => toggleAudioPlayback(item)}>
                                    <View
                                        style={[
                                            S.audioPlayBtn,
                                            isMine && S.audioPlayBtnOut,
                                        ]}>
                                        <Ionicons
                                            name={
                                                isThisAudioPlaying
                                                    ? "pause"
                                                    : "play"
                                            }
                                            size={18}
                                            color={
                                                isMine ? T.accentDark : T.accent
                                            }
                                        />
                                    </View>
                                    <View style={S.audioInfo}>
                                        <Text style={S.audioTitle}>
                                            Voice message
                                        </Text>
                                        <Text style={S.audioMeta}>
                                            {item?.callDuration > 0
                                                ? formatCallDuration(
                                                      item.callDuration,
                                                  )
                                                : item?.attachmentName ||
                                                  "Tap to play"}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <View style={S.docRow}>
                                    <View
                                        style={[
                                            S.docIconWrap,
                                            isMine && S.docIconWrapOut,
                                        ]}>
                                        <Ionicons
                                            name={
                                                String(
                                                    item?.attachmentMimeType ||
                                                        "",
                                                )
                                                    .toLowerCase()
                                                    .startsWith("audio/")
                                                    ? "mic-outline"
                                                    : "document-outline"
                                            }
                                            size={16}
                                            color={
                                                isMine ? T.accentDark : T.accent
                                            }
                                        />
                                    </View>
                                    <Text style={S.docLabel} numberOfLines={1}>
                                        {item.attachmentName || "Attachment"}
                                    </Text>
                                </View>
                            )
                        ) : null}
                        {item.message ? (
                            <Text style={S.msgTxt}>{item.message}</Text>
                        ) : null}
                        {item.taskId?.title ? (
                            <TouchableOpacity
                                activeOpacity={0.88}
                                style={S.taskInlineBubble}
                                onPress={() => openTaskFromMessage(item)}>
                                <Text style={S.taskInlineTitle}>
                                    {item.taskId.title}
                                </Text>
                                <Text style={S.taskInlineMeta}>
                                    {item.taskId.status} ·{" "}
                                    {item.taskId.priority}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                        <View style={S.msgMeta}>
                            <Text style={S.msgTime}>
                                {formatClock(item.createdAt)}
                            </Text>
                            {isMine && (
                                <Ionicons
                                    name="checkmark-done"
                                    size={14}
                                    color={T.accent}
                                    style={{ marginLeft: 2 }}
                                />
                            )}
                        </View>
                    </View>
                </View>
            );
        };

        return (
            <SafeAreaView
                style={[S.screen, { backgroundColor: T.bgChat }]}
                edges={["left", "right"]}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

                {/* ── Fixed header — NEVER inside Animated.View ── */}
                <View style={[S.chatHeader, { paddingTop: insets.top + 6 }]}>
                    <TouchableOpacity
                        onPress={() => {
                            if (previewImageUri) {
                                closeImagePreview();
                                return;
                            }
                            setView("list");
                            setMessages([]);
                            setHasOlderMessages(false);
                            setOlderCursorBefore("");
                            setOlderCursorBeforeId("");
                        }}
                        style={S.chatBackBtn}>
                        <Ionicons name="arrow-back" size={22} color={T.ink} />
                    </TouchableOpacity>
                    <View style={S.chatHeaderInfo}>
                        <Text style={S.chatHeaderName}>
                            {selectedMember.name}
                        </Text>
                        <Text style={S.chatHeaderRole}>{roleLabel}</Text>
                    </View>
                    <View style={S.chatHeaderActions}>
                        {isAdminUser && (
                            <TouchableOpacity
                                style={[
                                    S.chatHeaderIcon,
                                    S.chatHeaderIconPrimary,
                                ]}
                                onPress={() =>
                                    openCreateTaskModal(
                                        String(selectedMember._id),
                                    )
                                }>
                                <Ionicons
                                    name="create-outline"
                                    size={22}
                                    color={T.accentDark}
                                />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={S.chatHeaderIcon}
                            onPress={() => handleInitiateCall(selectedMember)}>
                            <Ionicons
                                name="call-outline"
                                size={20}
                                color={T.ink}
                            />
                        </TouchableOpacity>
                    </View>
                </View>

                {/*
         ┌──────────────────────────────────────────────────────────────┐
         │  Animated.View — paddingBottom = kbOffset                    │
         │                                                              │
         │  • kbOffset = keyboard height − insets.bottom               │
         │    (safe-area is already handled by SafeAreaView above)      │
         │  • When keyboard is closed → kbOffset = 0                   │
         │    Composer paddingBottom = insets.bottom handles home-bar   │
         │  • When keyboard opens → kbOffset fills the gap              │
         │    Composer paddingBottom = insets.bottom stays unchanged    │
         │    Net result: composer sits exactly above keyboard           │
         │  • No double-counting. No double-jump.                       │
         └──────────────────────────────────────────────────────────────┘
        */}
                <KeyboardAvoidingView
                    style={S.chatBody}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={0}>
                    {/* Messages */}
                    <View style={S.msgArea}>
                        {messageLoading ? (
                            <View style={S.msgLoadWrap}>
                                <ActivityIndicator
                                    size="small"
                                    color={T.accent}
                                />
                            </View>
                        ) : (
                            <FlatList
                                ref={listRef}
                                data={messages}
                                keyExtractor={(item, idx) =>
                                    `msg-${String(item?._id || `${item?.createdAt || "x"}-${idx}`)}`
                                }
                                renderItem={renderMessageItem}
                                contentContainerStyle={[
                                    S.msgList,
                                    {
                                        paddingBottom: messageAttachment
                                            ? 18
                                            : 10,
                                    },
                                ]}
                                keyboardShouldPersistTaps="handled"
                                maintainVisibleContentPosition={{
                                    minIndexForVisible: 1,
                                }}
                                scrollEventThrottle={16}
                                onScroll={handleMessageScroll}
                                ListHeaderComponent={
                                    hasOlderMessages || loadingOlderMessages ? (
                                        <View style={S.loadOlderWrap}>
                                            {loadingOlderMessages ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={T.accent}
                                                />
                                            ) : (
                                                <TouchableOpacity
                                                    onPress={loadOlder}
                                                    activeOpacity={0.9}>
                                                    <Text
                                                        style={
                                                            S.loadOlderText
                                                        }>
                                                        Load older messages
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ) : null
                                }
                                ListEmptyComponent={
                                    <View style={S.msgEmptyWrap}>
                                        <View style={S.msgEmptyBadge}>
                                            <Text style={S.msgEmptyText}>
                                                🔒 Messages are end-to-end
                                                encrypted
                                            </Text>
                                        </View>
                                    </View>
                                }
                            />
                        )}
                    </View>

                    {/* Attachment preview */}
                    {messageAttachment && (
                        <View style={S.attPreview}>
                            <AttachmentPill
                                attachment={messageAttachment}
                                onClear={() => setMessageAttachment(null)}
                            />
                        </View>
                    )}
                    {isRecordingAudio && (
                        <View style={S.recordingBanner}>
                            <View style={S.recordingDot} />
                            <Text style={S.recordingText}>
                                Recording voice note{" "}
                                {formatRecordingDuration(recordingDurationMs)}
                            </Text>
                        </View>
                    )}
                    {!isRecordingAudio && audioDraft?.uri && (
                        <View style={S.voiceDraftBar}>
                            <View style={S.voiceDraftInfo}>
                                <View style={S.voiceDraftIcon}>
                                    <Ionicons
                                        name="mic"
                                        size={16}
                                        color={T.accentDark}
                                    />
                                </View>
                                <View style={S.voiceDraftTextWrap}>
                                    <Text style={S.voiceDraftTitle}>
                                        Voice note ready
                                    </Text>
                                    <Text style={S.voiceDraftMeta}>
                                        {formatRecordingDuration(
                                            audioDraft.durationMs,
                                        )}
                                    </Text>
                                </View>
                            </View>
                            <View style={S.voiceDraftActions}>
                                <TouchableOpacity
                                    style={[
                                        S.voiceDraftBtn,
                                        S.voiceDraftDeleteBtn,
                                    ]}
                                    onPress={discardAudioDraft}
                                    disabled={sendingMessage}>
                                    <Ionicons
                                        name="trash-outline"
                                        size={18}
                                        color="#991B1B"
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        S.voiceDraftBtn,
                                        S.voiceDraftSendBtn,
                                    ]}
                                    onPress={sendAudioDraft}
                                    disabled={sendingMessage}>
                                    {sendingMessage ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#fff"
                                        />
                                    ) : (
                                        <Ionicons
                                            name="send"
                                            size={16}
                                            color="#fff"
                                        />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {/*
           Composer bar
           paddingBottom = insets.bottom handles the home indicator when keyboard is closed.
           When keyboard is open, kbOffset (on the parent) already lifts us above it,
           so insets.bottom here is effectively unreachable by the keyboard — correct.
          */}
                    <View
                        style={[
                            S.composer,
                            { paddingBottom: Math.max(insets.bottom, 8) },
                        ]}>
                        <View style={S.composerInputWrap}>
                            <TouchableOpacity
                                onPress={pickMessageImage}
                                style={S.composerIconBtn}>
                                <Ionicons
                                    name="happy-outline"
                                    size={22}
                                    color={T.mute}
                                />
                            </TouchableOpacity>
                            <TextInput
                                style={S.composerInput}
                                placeholder="Message"
                                placeholderTextColor={T.mute}
                                value={messageText}
                                onChangeText={setMessageText}
                                multiline
                                selectionColor={T.accent}
                                onFocus={() => scrollToEnd(true)}
                                // No onFocus scroll — kbOffset + onContentSizeChange handles it cleanly
                            />
                            <TouchableOpacity
                                onPress={() =>
                                    pickDocument(setMessageAttachment)
                                }
                                style={S.composerIconBtn}>
                                <Ionicons
                                    name="attach-outline"
                                    size={22}
                                    color={T.mute}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={pickMessageImage}
                                style={S.composerIconBtn}>
                                <Ionicons
                                    name="camera-outline"
                                    size={22}
                                    color={T.mute}
                                />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={[
                                S.composerSend,
                                (messageText.trim() ||
                                    messageAttachment ||
                                    isRecordingAudio) &&
                                    S.composerSendActive,
                                isRecordingAudio && S.composerSendRecording,
                            ]}
                            onPress={handleComposerPrimaryPress}
                            disabled={
                                sendingMessage || Boolean(audioDraft?.uri)
                            }>
                            {sendingMessage ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons
                                    name={
                                        isRecordingAudio
                                            ? "stop"
                                            : messageText.trim() ||
                                                messageAttachment
                                              ? "send"
                                              : "mic-outline"
                                    }
                                    size={18}
                                    color="#fff"
                                />
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {renderTaskModal()}

                <Modal
                    visible={Boolean(previewImageUri)}
                    transparent
                    animationType="fade"
                    onRequestClose={closeImagePreview}>
                    <View style={S.imagePreviewOverlay}>
                        <TouchableOpacity
                            style={S.imagePreviewBackdrop}
                            activeOpacity={1}
                            onPress={closeImagePreview}
                        />
                        <TouchableOpacity
                            style={S.imagePreviewClose}
                            activeOpacity={0.85}
                            onPress={closeImagePreview}>
                            <Ionicons name="close" size={24} color="#fff" />
                        </TouchableOpacity>
                        {previewImageUri ? (
                            <Image
                                source={{ uri: previewImageUri }}
                                style={S.imagePreviewFull}
                                resizeMode="contain"
                            />
                        ) : null}
                    </View>
                </Modal>
            </SafeAreaView>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONTACTS / TASKS LIST SCREEN
    // ═══════════════════════════════════════════════════════════════════════════
    const currentTaskList = tab === "Completed" ? completedTasks : pendingTasks;

    const renderContactRow = ({ item: { member, thread } }) => {
        const isAdmin = String(member?.role || "").toLowerCase() === "admin";
        const roleLabel = isAdmin
            ? adminRoleLabelMap[String(member._id)] || "Admin"
            : "Staff Member";
        const unread = Number(thread?.unreadCount || 0);
        const lastMsg = thread?.lastMessage || getThreadPreview(thread);
        const lastTime = formatThreadTime(thread?.lastMessageAt);
        return (
            <TouchableOpacity
                style={S.contactRow}
                onPress={() => openChat(member._id)}
                activeOpacity={0.7}>
                <View style={S.contactAvaWrap}>
                    <InitialsAvatar name={member.name} size={50} />
                    <View style={S.onlineDot} />
                </View>
                <View style={S.contactInfo}>
                    <View style={S.contactTopRow}>
                        <Text style={S.contactName} numberOfLines={1}>
                            {member.name}
                        </Text>
                        {lastTime ? (
                            <Text
                                style={[
                                    S.contactTime,
                                    unread > 0 && S.contactTimeUnread,
                                ]}>
                                {lastTime}
                            </Text>
                        ) : null}
                    </View>
                    <View style={S.contactBottomRow}>
                        <Text
                            style={[
                                S.contactPreview,
                                unread > 0 && S.contactPreviewUnread,
                            ]}
                            numberOfLines={1}>
                            {lastMsg || roleLabel}
                        </Text>
                        {unread > 0 ? (
                            <View style={S.unreadBadge}>
                                <Text style={S.unreadBadgeText}>
                                    {unread > 99 ? "99+" : unread}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderSectionHeader = (title, count) => (
        <View style={S.sectionHeader}>
            <Text style={S.sectionHeaderText}>{title}</Text>
            <Text style={S.sectionHeaderCount}>{count}</Text>
        </View>
    );

    const renderTaskCard = (item) => {
        const st = statusStyle(item.status);
        const isCompleted = item.status === "Completed";
        return (
            <TouchableOpacity
                key={item._id}
                activeOpacity={0.85}
                onPress={() => {
                    setSelectedTaskForDetail(item);
                    setView("taskDetail");
                }}
                style={[
                    S.compactTaskCard,
                    isCompleted && S.compactTaskCardDone,
                ]}>
                <View
                    style={[S.compactTaskAccent, { backgroundColor: st.text }]}
                />
                <View style={S.compactTaskContent}>
                    <View style={S.compactTaskMain}>
                        <Text
                            style={[
                                S.compactTaskTitle,
                                isCompleted && S.compactTaskTitleDone,
                            ]}
                            numberOfLines={1}>
                            {item.title}
                        </Text>
                        <View
                            style={[
                                S.compactStatusTag,
                                {
                                    backgroundColor: st.bg,
                                    borderColor: st.border,
                                },
                            ]}>
                            <Text
                                style={[
                                    S.compactStatusTagText,
                                    { color: st.text },
                                ]}>
                                {item.status}
                            </Text>
                        </View>
                    </View>
                    <View style={S.compactTaskMeta}>
                        <Text style={S.compactTaskMetaLabel}>
                            {item.assignedTo?.name || "Unassigned"}
                        </Text>
                        <View style={S.compactTaskDot} />
                        <Text style={S.compactTaskMetaLabel}>
                            {formatDate(item.dueDate)}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    function renderTaskModal() {
        const showTaskAttachmentImage = isImageAttachment(
            taskAttachment?.type,
            taskAttachment?.name,
            taskAttachment?.uri,
        );
        const isEditingTask = Boolean(editingTaskId);
        const sheetHeight = Math.max(
            420,
            Math.min(
                windowHeight - insets.top - insets.bottom - 24,
                Math.round(windowHeight * (isCompactHeight ? 0.92 : 0.82)),
            ),
        );
        return (
            <Modal
                visible={showTaskModal}
                transparent
                statusBarTranslucent
                animationType="fade"
                onRequestClose={() => {
                    if (taskSaving) return;
                    setShowTaskModal(false);
                    resetTaskComposer();
                }}>
                <View style={S.taskModalOverlay}>
                    <TouchableOpacity
                        style={S.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => {
                            if (taskSaving) return;
                            setShowTaskModal(false);
                            resetTaskComposer();
                        }}
                    />
                    <KeyboardAvoidingView
                        style={S.taskModalKav}
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        keyboardVerticalOffset={
                            Platform.OS === "ios" ? insets.top + 8 : 0
                        }>
                        <View
                            style={[
                                S.taskModalSheet,
                                isWideLayout && S.taskModalSheetWide,
                                { height: sheetHeight, paddingBottom: insets.bottom + 14 },
                            ]}>
                            <View
                                style={[
                                    S.taskModalCard,
                                    isWideLayout
                                        ? S.taskModalCardWide
                                        : S.taskModalCardPhone,
                                ]}>
                                 <View style={S.modalHdr}>
                                     <View style={S.modalHdrText}>
                                         <Text style={S.modalEye}>
                                             {isEditingTask
                                                 ? "EDIT TASK"
                                                 : "NEW TASK"}
                                         </Text>
                                         <Text style={S.modalTitle}>
                                             {isEditingTask
                                                 ? "Edit Task"
                                                 : "Create Task"}
                                         </Text>
                                     </View>
                                     <TouchableOpacity
                                         onPress={() => {
                                             if (taskSaving) return;
                                             setShowTaskModal(false);
                                             resetTaskComposer();
                                         }}
                                         style={S.modalClose}>
                                         <Ionicons
                                             name="close"
                                             size={18}
                                             color={T.mid}
                                         />
                                     </TouchableOpacity>
                                 </View>
                                 <View style={S.modalDivider} />
                                 <ScrollView
                                     style={S.taskModalScroll}
                                     contentContainerStyle={[
                                         S.taskModalBody,
                                         isCompactHeight && S.modalBodyCompact,
                                         { paddingBottom: insets.bottom + 26 },
                                     ]}
                                     keyboardShouldPersistTaps="always"
                                     keyboardDismissMode={
                                         Platform.OS === "ios"
                                             ? "interactive"
                                             : "on-drag"
                                     }
                                     showsVerticalScrollIndicator={false}>
                                     <Text style={S.fLbl}>TITLE</Text>
                                     <TextInput
                                         style={S.fInput}
                                         placeholder="Task title"
                                         placeholderTextColor={T.mute}
                                         value={taskForm.title}
                                         onChangeText={(v) =>
                                             setTaskForm((p) => ({
                                                 ...p,
                                                 title: v,
                                             }))
                                         }
                                     />
                                <Text style={S.fLbl}>DESCRIPTION</Text>
                                <TextInput
                                    style={[S.fInput, S.fInputArea]}
                                    placeholder="Describe the task…"
                                    placeholderTextColor={T.mute}
                                    multiline
                                    textAlignVertical="top"
                                    value={taskForm.description}
                                    onChangeText={(v) =>
                                        setTaskForm((p) => ({
                                            ...p,
                                            description: v,
                                        }))
                                    }
                                />
                                <Text style={S.fLbl}>PRIORITY</Text>
                                <View style={S.chipRow}>
                                    {["Low", "Medium", "High"].map((opt) => (
                                        <TouchableOpacity
                                            key={opt}
                                            style={[
                                                S.fChip,
                                                taskForm.priority === opt &&
                                                    S.fChipActive,
                                            ]}
                                            onPress={() =>
                                                setTaskForm((p) => ({
                                                    ...p,
                                                    priority: opt,
                                                }))
                                            }>
                                            <Text
                                                style={[
                                                    S.fChipTxt,
                                                    taskForm.priority === opt &&
                                                        S.fChipTxtActive,
                                                ]}>
                                                {opt}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <Text style={S.fLbl}>ASSIGN TO</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}>
                                    <View style={S.assignRow}>
                                        <TouchableOpacity
                                            style={[
                                                S.fChip,
                                                !taskForm.assignedTo &&
                                                    S.fChipActive,
                                            ]}
                                            onPress={() =>
                                                setTaskForm((p) => ({
                                                    ...p,
                                                    assignedTo: "",
                                                }))
                                            }>
                                            <Text
                                                style={[
                                                    S.fChipTxt,
                                                    !taskForm.assignedTo &&
                                                        S.fChipTxtActive,
                                                ]}>
                                                Optional
                                            </Text>
                                        </TouchableOpacity>
                                        {isAdminUser && selfId ? (
                                            <TouchableOpacity
                                                style={[
                                                    S.fChip,
                                                    String(
                                                        taskForm.assignedTo,
                                                    ) === String(selfId) &&
                                                        S.fChipActive,
                                                ]}
                                                onPress={() =>
                                                    setTaskForm((p) => ({
                                                        ...p,
                                                        assignedTo:
                                                            String(selfId),
                                                    }))
                                                }>
                                                <Text
                                                    style={[
                                                        S.fChipTxt,
                                                        String(
                                                            taskForm.assignedTo,
                                                        ) === String(selfId) &&
                                                            S.fChipTxtActive,
                                                    ]}>
                                                    Me
                                                </Text>
                                            </TouchableOpacity>
                                        ) : null}
                                        {taskAssigneeOptions.map((member) => (
                                            <TouchableOpacity
                                                key={member._id}
                                                style={[
                                                    S.fChip,
                                                    String(
                                                        taskForm.assignedTo,
                                                    ) === String(member._id) &&
                                                        S.fChipActive,
                                                ]}
                                                onPress={() =>
                                                    setTaskForm((p) => ({
                                                        ...p,
                                                        assignedTo: String(
                                                            member._id,
                                                        ),
                                                    }))
                                                }>
                                                <Text
                                                    style={[
                                                        S.fChipTxt,
                                                        String(
                                                            taskForm.assignedTo,
                                                        ) ===
                                                            String(
                                                                member._id,
                                                            ) &&
                                                            S.fChipTxtActive,
                                                    ]}>
                                                    {member.name}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>
                                <Text style={S.fLbl}>ATTACHMENT</Text>
                                <TouchableOpacity
                                    style={S.fFilePicker}
                                    onPress={() =>
                                        pickDocument(setTaskAttachment)
                                    }>
                                    <Ionicons
                                        name="attach-outline"
                                        size={16}
                                        color={T.mid}
                                    />
                                    <Text style={S.fFilePickerTxt}>
                                        Photo or PDF
                                    </Text>
                                </TouchableOpacity>
                                {showTaskAttachmentImage &&
                                taskAttachment?.uri ? (
                                    <View style={S.taskAttachmentPreviewWrap}>
                                        <Image
                                            source={{ uri: taskAttachment.uri }}
                                            style={S.taskAttachmentPreview}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ) : null}
                                <AttachmentPill
                                    attachment={taskAttachment}
                                    onClear={() => setTaskAttachment(null)}
                                />
                                <TouchableOpacity
                                    style={[
                                        S.submitBtn,
                                        taskSaving && { opacity: 0.55 },
                                    ]}
                                    onPress={submitTask}
                                    disabled={taskSaving}>
                                    {taskSaving ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#fff"
                                        />
                                    ) : (
                                        <Text style={S.submitBtnTxt}>
                                            {isEditingTask
                                                ? "Update Task"
                                                : "Create Task"}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        );
    }

    function renderTaskDetailModal() {
        if (!selectedTaskForDetail) return null;
        const allTasks = currentTaskList;
        const currentIndex = allTasks.findIndex(
            (t) => String(t._id) === String(selectedTaskForDetail._id),
        );

        if (currentIndex === -1) return null;

        const item = selectedTaskForDetail;
        const st = statusStyle(item.status);
        const isCompleted = item.status === "Completed";
        const isTaskReceiver =
            String(item?.assignedTo?._id || item?.assignedTo || "") === selfId;
        const canEditTask = isAdminUser;
        const canReopenTask = isCompleted && (isAdminUser || isTaskReceiver);
        const canUpdateStatus = isCompleted ? canReopenTask : isTaskReceiver;
        const attachmentSource = item.attachmentUrl
            ? getImageUrl(item.attachmentUrl)
            : "";
        const showTaskImage = isImageAttachment(
            item.attachmentMimeType,
            item.attachmentName,
            item.attachmentUrl,
        );

        const handleNavigatePrev = () => {
            if (currentIndex > 0) {
                setSelectedTaskForDetail(allTasks[currentIndex - 1]);
            }
        };

        const handleNavigateNext = () => {
            if (currentIndex < allTasks.length - 1) {
                setSelectedTaskForDetail(allTasks[currentIndex + 1]);
            }
        };

        const handleTouchStart = (e) => {
            swipeStartXRef.current = e.nativeEvent.pageX;
        };

        const handleTouchEnd = (e) => {
            const swipeEndX = e.nativeEvent.pageX;
            const swipeDifference = swipeStartXRef.current - swipeEndX;
            if (Math.abs(swipeDifference) > 40) {
                if (swipeDifference > 0) {
                    handleNavigateNext();
                } else {
                    handleNavigatePrev();
                }
            }
        };

        const sheetHeight = Math.max(
            420,
            Math.min(
                windowHeight - insets.top - 10,
                Math.round(windowHeight * (isCompactHeight ? 0.86 : 0.78)),
            ),
        );

        return (
            <Modal
                visible={showTaskDetailModal}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setShowTaskDetailModal(false);
                    setSelectedTaskForDetail(null);
                }}>
                <View style={S.modalOverlay}>
                    <TouchableOpacity
                        style={S.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => {
                            setShowTaskDetailModal(false);
                            setSelectedTaskForDetail(null);
                        }}
                    />
                    <View style={S.centeredModalContainer}>
                        <View
                            style={[
                                S.centeredModalContent,
                                {
                                    height: sheetHeight,
                                    paddingBottom: insets.bottom + 12,
                                },
                                isCompactHeight &&
                                    S.centeredModalContentCompact,
                            ]}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}>
                            {/* Header with Counter and Close */}
                            <View style={S.centeredModalHeader}>
                                <View style={S.centeredTaskCounter}>
                                    <Text style={S.centeredTaskCounterText}>
                                        {currentIndex + 1} / {allTasks.length}
                                    </Text>
                                </View>
                                <Text style={S.taskDetailHeaderTitle}>
                                    Task Details
                                </Text>
                                <TouchableOpacity
                                    style={S.modalCloseCenter}
                                    onPress={() => {
                                        setShowTaskDetailModal(false);
                                        setSelectedTaskForDetail(null);
                                    }}
                                    activeOpacity={0.7}>
                                    <Ionicons
                                        name="close"
                                        size={22}
                                        color={T.mid}
                                    />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                style={S.centeredScrollView}
                                contentContainerStyle={S.centeredScrollContent}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="always">
                                {/* Task Details Card */}
                                <View style={S.detailTaskCard}>
                                    <View
                                        style={[
                                            S.taskAccent,
                                            { backgroundColor: st.text },
                                        ]}
                                    />
                                    <View style={S.taskInner}>
                                        <View style={S.taskTopRowCard}>
                                            <Text
                                                style={[
                                                    S.taskTitle,
                                                    isCompleted &&
                                                        S.taskTitleDone,
                                                ]}
                                                numberOfLines={2}>
                                                {item.title}
                                            </Text>
                                            <View
                                                style={[
                                                    S.statusTag,
                                                    {
                                                        backgroundColor: st.bg,
                                                        borderColor: st.border,
                                                    },
                                                ]}>
                                                <Text
                                                    style={[
                                                        S.statusTagText,
                                                        { color: st.text },
                                                    ]}>
                                                    {item.status}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={S.taskMetaRow}>
                                            <Text style={S.taskMetaItem}>
                                                {item.taskType}
                                            </Text>
                                            <View style={S.taskMetaDot} />
                                            <Text style={S.taskMetaItem}>
                                                {item.priority}
                                            </Text>
                                            <View style={S.taskMetaDot} />
                                            <Text style={S.taskMetaItem}>
                                                {formatDate(item.dueDate)}
                                            </Text>
                                        </View>
                                        {item.description ? (
                                            <Text style={S.taskDesc}>
                                                {item.description}
                                            </Text>
                                        ) : null}
                                        <View style={S.taskPeople}>
                                            <View style={S.taskPersonRow}>
                                                <Text style={S.taskPersonLabel}>
                                                    Assigned
                                                </Text>
                                                <Text style={S.taskPersonName}>
                                                    {item.assignedTo?.name ||
                                                        "Unassigned"}
                                                </Text>
                                            </View>
                                            <View style={S.taskPersonRow}>
                                                <Text style={S.taskPersonLabel}>
                                                    By
                                                </Text>
                                                <Text style={S.taskPersonName}>
                                                    {item.createdBy?.name ||
                                                        "—"}
                                                </Text>
                                            </View>
                                        </View>
                                        {(item.attachmentUrl ||
                                            item.attachmentName) && (
                                            <View style={S.taskAttachmentBlock}>
                                                {showTaskImage &&
                                                attachmentSource ? (
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            setPreviewImageUri(
                                                                attachmentSource,
                                                            );
                                                            setShowTaskDetailModal(
                                                                false,
                                                            );
                                                            setSelectedTaskForDetail(
                                                                null,
                                                            );
                                                        }}
                                                        activeOpacity={0.92}>
                                                        <Image
                                                            source={{
                                                                uri: attachmentSource,
                                                            }}
                                                            style={
                                                                S.taskAttachmentImage
                                                            }
                                                            resizeMode="cover"
                                                        />
                                                    </TouchableOpacity>
                                                ) : null}
                                                <AttachmentPill
                                                    attachment={{
                                                        name:
                                                            item.attachmentName ||
                                                            "Attachment",
                                                        type:
                                                            item.attachmentMimeType ||
                                                            inferAttachmentType(
                                                                item,
                                                            ),
                                                    }}
                                                />
                                            </View>
                                        )}
                                        <View style={S.taskBtnRow}>
                                            {canEditTask && (
                                                <TouchableOpacity
                                                    style={[
                                                        S.taskAction,
                                                        S.taskActionGhost,
                                                    ]}
                                                    onPress={() => {
                                                        setShowTaskDetailModal(
                                                            false,
                                                        );
                                                        openEditTaskModal(item);
                                                    }}>
                                                    <Ionicons
                                                        name="create-outline"
                                                        size={13}
                                                        color={T.mid}
                                                    />
                                                    <Text
                                                        style={
                                                            S.taskActionTextGhost
                                                        }>
                                                        Edit
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                            {canUpdateStatus && (
                                                <TouchableOpacity
                                                    style={[
                                                        S.taskAction,
                                                        isCompleted
                                                            ? S.taskActionGhost
                                                            : S.taskActionPrimary,
                                                    ]}
                                                    onPress={() =>
                                                        setTaskStatus(
                                                            item._id,
                                                            isCompleted
                                                                ? "Pending"
                                                                : "Completed",
                                                        )
                                                    }>
                                                    <Ionicons
                                                        name={
                                                            isCompleted
                                                                ? "refresh-outline"
                                                                : "checkmark"
                                                        }
                                                        size={13}
                                                        color={
                                                            isCompleted
                                                                ? T.mid
                                                                : "#fff"
                                                        }
                                                    />
                                                    <Text
                                                        style={[
                                                            S.taskActionText,
                                                            isCompleted &&
                                                                S.taskActionTextGhost,
                                                        ]}>
                                                        {isCompleted
                                                            ? "Reopen"
                                                            : "Complete"}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                            {canUpdateStatus &&
                                                item.status !== "In Progress" &&
                                                !isCompleted && (
                                                    <TouchableOpacity
                                                        style={[
                                                            S.taskAction,
                                                            S.taskActionGhost,
                                                        ]}
                                                        onPress={() =>
                                                            setTaskStatus(
                                                                item._id,
                                                                "In Progress",
                                                            )
                                                        }>
                                                        <Text
                                                            style={
                                                                S.taskActionTextGhost
                                                            }>
                                                            Start
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>

                            {/* Footer with Navigation Hints */}
                            <View style={S.taskDetailFooter}>
                                <Ionicons
                                    name="chevron-back"
                                    size={16}
                                    color={currentIndex > 0 ? T.accent : T.mute}
                                />
                                <Text style={S.taskDetailFooterText}>
                                    Swipe or tap arrows to navigate
                                </Text>
                                <Ionicons
                                    name="chevron-forward"
                                    size={16}
                                    color={
                                        currentIndex < allTasks.length - 1
                                            ? T.accent
                                            : T.mute
                                    }
                                />
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    }

    function renderTaskDetailFullScreen() {
        if (!selectedTaskForDetail) return null;
        const allTasks = currentTaskList;
        const currentIndex = allTasks.findIndex(
            (t) => String(t._id) === String(selectedTaskForDetail._id),
        );
        if (currentIndex === -1) return null;

        const item = selectedTaskForDetail;
        const st = statusStyle(item.status);
        const isCompleted = item.status === "Completed";
        const isInProgress = item.status === "In Progress";
        const isTaskReceiver =
            String(item?.assignedTo?._id || item?.assignedTo || "") === selfId;
        const canEditTask = isAdminUser;
        const canReopenTask = isCompleted && (isAdminUser || isTaskReceiver);
        const canUpdateStatus = isCompleted ? canReopenTask : isTaskReceiver;
        const attachmentSource = item.attachmentUrl
            ? getImageUrl(item.attachmentUrl)
            : "";
        const showTaskImage = isImageAttachment(
            item.attachmentMimeType,
            item.attachmentName,
            item.attachmentUrl,
        );

        const handleNavigatePrev = () => {
            if (currentIndex > 0)
                setSelectedTaskForDetail(allTasks[currentIndex - 1]);
        };

        const handleNavigateNext = () => {
            if (currentIndex < allTasks.length - 1)
                setSelectedTaskForDetail(allTasks[currentIndex + 1]);
        };

        const handleTouchStart = (e) => {
            swipeStartXRef.current = e.nativeEvent.pageX;
            swipeStartYRef.current = e.nativeEvent.pageY;
        };

        const handleTouchEnd = (e) => {
            const swipeEndX = e.nativeEvent.pageX;
            const swipeEndY = e.nativeEvent.pageY;
            const dx = swipeStartXRef.current - swipeEndX;
            const dy = swipeStartYRef.current - swipeEndY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx > 50 && absDx > absDy * 1.2) {
                if (dx > 0) handleNavigateNext();
                else handleNavigatePrev();
            }
        };

        return (
            <SafeAreaView
                style={S.taskDetailFsScreen}
                edges={["bottom", "left", "right"]}>
                <StatusBar barStyle="dark-content" backgroundColor={T.bg} />

                <View
                    style={[
                        S.taskDetailFsHeader,
                        { paddingTop: insets.top + 10 },
                    ]}>
                    <TouchableOpacity
                        onPress={() => {
                            setView("list");
                            setSelectedTaskForDetail(null);
                        }}
                        style={S.listBackBtn}
                        activeOpacity={0.85}>
                        <Ionicons name="arrow-back" size={22} color={T.ink} />
                    </TouchableOpacity>

                    <View style={S.taskDetailFsHeaderCenter}>
                        <Text style={S.taskDetailFsTitle}>Task Details</Text>
                    </View>
                </View>

                <View
                    style={S.taskDetailFsBody}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={[
                            S.taskDetailFsScrollContent,
                            { paddingBottom: insets.bottom + 18 },
                        ]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="always">
                        <View style={S.detailTaskCard}>
                            <View
                                style={[
                                    S.taskAccent,
                                    { backgroundColor: st.text },
                                ]}
                            />
                            <View style={S.taskInner}>
                                <View style={S.taskTopRowCard}>
                                    <Text
                                        style={[
                                            S.taskTitle,
                                            isCompleted && S.taskTitleDone,
                                        ]}
                                        numberOfLines={3}>
                                        {item.title}
                                    </Text>
                                    <View
                                        style={[
                                            S.statusTag,
                                            {
                                                backgroundColor: st.bg,
                                                borderColor: st.border,
                                            },
                                        ]}>
                                        <Text
                                            style={[
                                                S.statusTagText,
                                                { color: st.text },
                                            ]}>
                                            {item.status}
                                        </Text>
                                    </View>
                                </View>

                                <View style={S.taskMetaRow}>
                                    <Text style={S.taskMetaItem}>
                                        {item.taskType}
                                    </Text>
                                    <View style={S.taskMetaDot} />
                                    <Text style={S.taskMetaItem}>
                                        {item.priority}
                                    </Text>
                                    <View style={S.taskMetaDot} />
                                    <Text style={S.taskMetaItem}>
                                        {formatDate(item.dueDate)}
                                    </Text>
                                </View>

                                {item.description ? (
                                    <Text style={S.taskDesc}>
                                        {item.description}
                                    </Text>
                                ) : null}

                                <View style={S.taskPeople}>
                                    <View style={S.taskPersonRow}>
                                        <Text style={S.taskPersonLabel}>
                                            Assigned
                                        </Text>
                                        <Text style={S.taskPersonName}>
                                            {item.assignedTo?.name ||
                                                "Unassigned"}
                                        </Text>
                                    </View>
                                    <View style={S.taskPersonRow}>
                                        <Text style={S.taskPersonLabel}>
                                            By
                                        </Text>
                                        <Text style={S.taskPersonName}>
                                            {item.createdBy?.name || "â€”"}
                                        </Text>
                                    </View>
                                </View>

                                {(item.attachmentUrl ||
                                    item.attachmentName) && (
                                    <View style={S.taskAttachmentBlock}>
                                        {showTaskImage && attachmentSource ? (
                                            <TouchableOpacity
                                                activeOpacity={0.92}
                                                onPress={() => {
                                                    setPreviewImageUri(
                                                        attachmentSource,
                                                    );
                                                    setView("list");
                                                    setSelectedTaskForDetail(
                                                        null,
                                                    );
                                                }}>
                                                <Image
                                                    source={{
                                                        uri: attachmentSource,
                                                    }}
                                                    style={
                                                        S.taskAttachmentImage
                                                    }
                                                    resizeMode="cover"
                                                />
                                            </TouchableOpacity>
                                        ) : null}
                                        <AttachmentPill
                                            attachment={{
                                                name:
                                                    item.attachmentName ||
                                                    "Attachment",
                                                type:
                                                    item.attachmentMimeType ||
                                                    inferAttachmentType(item),
                                            }}
                                        />
                                    </View>
                                )}

                                <View style={S.taskBtnRow}>
                                    {canEditTask && (
                                        <TouchableOpacity
                                            style={[
                                                S.taskAction,
                                                S.taskActionGhost,
                                            ]}
                                            onPress={() => {
                                                setView("list");
                                                openEditTaskModal(item);
                                            }}
                                            activeOpacity={0.85}>
                                            <Ionicons
                                                name="create-outline"
                                                size={13}
                                                color={T.mid}
                                            />
                                            <Text style={S.taskActionTextGhost}>
                                                Edit
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {canUpdateStatus && isInProgress && (
                                        <TouchableOpacity
                                            style={[
                                                S.taskAction,
                                                S.taskActionPrimary,
                                            ]}
                                            onPress={() =>
                                                setTaskStatus(
                                                    item._id,
                                                    "Completed",
                                                )
                                            }
                                            activeOpacity={0.9}>
                                            <Ionicons
                                                name="checkmark"
                                                size={13}
                                                color="#fff"
                                            />
                                            <Text style={S.taskActionText}>
                                                Complete
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {canUpdateStatus &&
                                        !isCompleted &&
                                        !isInProgress && (
                                            <TouchableOpacity
                                                style={[
                                                    S.taskAction,
                                                    S.taskActionGhost,
                                                ]}
                                                onPress={() =>
                                                    setTaskStatus(
                                                        item._id,
                                                        "In Progress",
                                                    )
                                                }
                                                activeOpacity={0.9}>
                                                <Ionicons
                                                    name="play"
                                                    size={13}
                                                    color={T.mid}
                                                />
                                                <Text
                                                    style={
                                                        S.taskActionTextGhost
                                                    }>
                                                    Start
                                                </Text>
                                            </TouchableOpacity>
                                        )}

                                    {canUpdateStatus && isCompleted && (
                                        <TouchableOpacity
                                            style={[
                                                S.taskAction,
                                                S.taskActionGhost,
                                            ]}
                                            onPress={() =>
                                                setTaskStatus(
                                                    item._id,
                                                    "Pending",
                                                )
                                            }
                                            activeOpacity={0.9}>
                                            <Ionicons
                                                name="refresh-outline"
                                                size={13}
                                                color={T.mid}
                                            />
                                            <Text style={S.taskActionTextGhost}>
                                                Reopen
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </SafeAreaView>
        );
    }

    if (view === "taskDetail") {
        return renderTaskDetailFullScreen();
    }

    return (
        <SafeAreaView style={S.screen} edges={["left", "right"]}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            <View style={[S.listHeader, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={S.listBackBtn}>
                    <Ionicons name="arrow-back" size={22} color={T.ink} />
                </TouchableOpacity>
                <Text style={S.listHeaderTitle}>
                    Team Chat{" "}
                    {totalUnread > 0 ? (
                        <Text style={S.listHeaderUnread}>({totalUnread})</Text>
                    ) : null}
                </Text>
                <View style={S.listHeaderRight}>
                    {/* Self task counts (staff + admin self) */}
                    <View style={S.taskCountRow}>
                        <View style={[S.taskCountPill, S.taskPillPending]}>
                            <Text style={S.taskCountTxt}>
                                P {selfTaskCounts.pending}
                            </Text>
                        </View>
                        <View style={[S.taskCountPill, S.taskPillProgress]}>
                            <Text style={S.taskCountTxt}>
                                I {selfTaskCounts.inProgress}
                            </Text>
                        </View>
                        <View style={[S.taskCountPill, S.taskPillDone]}>
                            <Text style={S.taskCountTxt}>
                                C {selfTaskCounts.completed}
                            </Text>
                        </View>
                    </View>

                    {isAdminUser && (
                        <>
                            <TouchableOpacity
                                style={S.listHeaderIcon}
                                onPress={openTaskDashboard}
                                activeOpacity={0.85}>
                                <Ionicons
                                    name="stats-chart-outline"
                                    size={21}
                                    color={T.accentDark}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[S.listHeaderIcon, S.listHeaderIconPrimary]}
                                onPress={() => openCreateTaskModal()}
                                activeOpacity={0.85}>
                                <Ionicons
                                    name="create-outline"
                                    size={22}
                                    color={T.accentDark}
                                />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            <View style={S.tabBar}>
                {["Chats", "Pending", "Completed"].map((item) => (
                    <TouchableOpacity
                        key={item}
                        style={[S.tabBtn, tab === item && S.tabBtnActive]}
                        onPress={() => setTab(item)}
                        activeOpacity={0.85}>
                        <Text
                            style={[S.tabTxt, tab === item && S.tabTxtActive]}>
                            {item}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {tab === "Chats" ? (
                <>
                    <View style={S.searchBar}>
                        <Ionicons
                            name="search"
                            size={16}
                            color={T.mute}
                            style={{ marginRight: 8 }}
                        />
                        <TextInput
                            style={S.searchInput}
                            placeholder="Search name or message"
                            placeholderTextColor={T.mute}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            selectionColor={T.accent}
                        />
                        {searchQuery ? (
                            <TouchableOpacity
                                onPress={() => setSearchQuery("")}>
                                <Ionicons
                                    name="close-circle"
                                    size={16}
                                    color={T.mute}
                                />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => {
                                    setRefreshing(true);
                                    loadOverview();
                                }}
                                tintColor={T.accent}
                                colors={[T.accent]}
                            />
                        }>
                        {groupedContacts.admins.length > 0 && (
                            <>
                                {renderSectionHeader(
                                    "ADMINS",
                                    groupedContacts.admins.length,
                                )}
                                <FlatList
                                    data={groupedContacts.admins}
                                    keyExtractor={(item) =>
                                        `admin-${String(item?.member?._id || "")}`
                                    }
                                    renderItem={renderContactRow}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => (
                                        <View style={S.separator} />
                                    )}
                                />
                            </>
                        )}
                        {groupedContacts.staff.length > 0 && (
                            <>
                                {renderSectionHeader(
                                    "STAFF MEMBERS",
                                    groupedContacts.staff.length,
                                )}
                                <FlatList
                                    data={groupedContacts.staff}
                                    keyExtractor={(item) =>
                                        `staff-${String(item?.member?._id || "")}`
                                    }
                                    renderItem={renderContactRow}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => (
                                        <View style={S.separator} />
                                    )}
                                />
                            </>
                        )}
                        {contactList.length === 0 && (
                            <View style={S.emptyWrap}>
                                <Ionicons
                                    name="people-outline"
                                    size={48}
                                    color={T.mute}
                                />
                                <Text style={S.emptyText}>
                                    {searchQuery
                                        ? "No results found"
                                        : "No team members yet"}
                                </Text>
                            </View>
                        )}
                        <View style={{ height: insets.bottom + 24 }} />
                    </ScrollView>
                </>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingBottom: insets.bottom + 24,
                    }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                setRefreshing(true);
                                loadOverview();
                            }}
                            tintColor={T.accent}
                            colors={[T.accent]}
                        />
                    }>
                    <View style={S.taskListHeader}>
                        <Text style={S.taskListTitle}>
                            {tab === "Completed"
                                ? "Completed Tasks"
                                : "Pending Tasks"}
                        </Text>
                        <Text style={S.taskListCount}>
                            {tasksLoading
                                ? "…"
                                : `${currentTaskList.length} task${currentTaskList.length !== 1 ? "s" : ""}`}
                        </Text>
                    </View>
                    {tasksLoading ? (
                        <ActivityIndicator
                            size="small"
                            color={T.accent}
                            style={{ marginVertical: 32 }}
                        />
                    ) : currentTaskList.length ? (
                        currentTaskList.map(renderTaskCard)
                    ) : (
                        <View style={S.taskEmpty}>
                            <Ionicons
                                name={
                                    tab === "Completed"
                                        ? "checkmark-done-outline"
                                        : "list-outline"
                                }
                                size={48}
                                color={T.mute}
                            />
                            <Text style={S.taskEmptyText}>
                                {tab === "Completed"
                                    ? "No completed tasks yet."
                                    : "No pending tasks. Tap the icon to create one."}
                            </Text>
                        </View>
                    )}
                </ScrollView>
            )}

            {tab === "Chats" && isAdminUser && (
                <TouchableOpacity
                    style={[S.fab, { bottom: insets.bottom + 10 }]}
                    onPress={() => openCreateTaskModal()}
                    activeOpacity={0.85}>
                    <Ionicons name="create-outline" size={22} color="#fff" />
                </TouchableOpacity>
            )}

            {renderTaskModal()}
            {renderTaskDetailModal()}
            <Modal
                visible={Boolean(previewImageUri)}
                transparent
                animationType="fade"
                onRequestClose={closeImagePreview}>
                <View style={S.imagePreviewOverlay}>
                    <TouchableOpacity
                        style={S.imagePreviewBackdrop}
                        activeOpacity={1}
                        onPress={closeImagePreview}
                    />
                    <TouchableOpacity
                        style={S.imagePreviewClose}
                        activeOpacity={0.85}
                        onPress={closeImagePreview}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    {previewImageUri ? (
                        <Image
                            source={{ uri: previewImageUri }}
                            style={S.imagePreviewFull}
                            resizeMode="contain"
                        />
                    ) : null}
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    ava: { alignItems: "center", justifyContent: "center" },
    avaTxt: { fontWeight: "800", color: "#fff" },

    listHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 6,
        paddingBottom: 12,
        backgroundColor: T.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: T.line,
    },
    listBackBtn: { padding: 8 },
    listHeaderTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: "700",
        color: T.ink,
        paddingLeft: 4,
    },
    listHeaderUnread: { color: T.accent, fontSize: 16, fontWeight: "700" },
    listHeaderRight: { flexDirection: "row", alignItems: "center" },
    listHeaderIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: T.bgSecondary,
        borderWidth: 1,
        borderColor: T.line,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 8,
    },
    listHeaderIconPrimary: {
        backgroundColor: T.accentSoft,
        borderColor: T.accentBorder,
    },

    taskCountRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginRight: 4,
    },
    taskCountPill: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
    },
    taskCountTxt: { fontSize: 11, fontWeight: "800", color: T.ink },
    taskPillPending: {
        backgroundColor: T.accentSoft,
        borderColor: T.accentBorder,
    },
    taskPillProgress: {
        backgroundColor: T.warnSoft,
        borderColor: T.warnBorder,
    },
    taskPillDone: {
        backgroundColor: T.successSoft,
        borderColor: T.successBorder,
    },

    tabBar: {
        flexDirection: "row",
        backgroundColor: T.bg,
        borderBottomWidth: 2,
        borderBottomColor: T.line,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 14,
        alignItems: "center",
        borderBottomWidth: 2,
        borderBottomColor: "transparent",
        marginBottom: -2,
    },
    tabBtnActive: { borderBottomColor: T.tabIndicator },
    tabTxt: {
        fontSize: 13,
        fontWeight: "700",
        color: T.mute,
        letterSpacing: 0.4,
        textTransform: "uppercase",
    },
    tabTxtActive: { color: T.tabActive },

    searchBar: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: T.bgSecondary,
        marginHorizontal: 10,
        marginVertical: 8,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    searchInput: { flex: 1, fontSize: 14, color: T.ink },

    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 6,
        backgroundColor: T.bgSecondary,
    },
    sectionHeaderText: {
        fontSize: 11,
        fontWeight: "700",
        color: T.mute,
        letterSpacing: 0.8,
        textTransform: "uppercase",
    },
    sectionHeaderCount: { fontSize: 11, fontWeight: "700", color: T.accent },

    contactRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: T.bg,
        gap: 12,
    },
    contactAvaWrap: { position: "relative" },
    onlineDot: {
        position: "absolute",
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: T.bg,
        backgroundColor: "#25D366",
    },
    contactInfo: { flex: 1 },
    contactTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 3,
    },
    contactName: { flex: 1, fontSize: 16, fontWeight: "600", color: T.ink },
    contactTime: { fontSize: 12, color: T.mute, marginLeft: 6 },
    contactTimeUnread: { color: T.accent, fontWeight: "700" },
    contactBottomRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    contactPreview: { flex: 1, fontSize: 13, color: T.mute, marginRight: 8 },
    contactPreviewUnread: { color: T.ink, fontWeight: "600" },
    unreadBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: T.accent,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 5,
    },
    unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: T.line,
        marginLeft: 78,
    },

    emptyWrap: { alignItems: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 15, color: T.mute },

    fab: {
        position: "absolute",
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: T.accent,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: T.accent,
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },

    // Chat
    chatHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 6,
        paddingBottom: 12,
        backgroundColor: T.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: T.line,
    },
    chatBackBtn: { padding: 8 },
    chatHeaderInfo: { flex: 1 },
    chatHeaderName: { fontSize: 16, fontWeight: "700", color: T.ink },
    chatHeaderRole: { fontSize: 12, color: T.mute, marginTop: 1 },
    chatHeaderActions: { flexDirection: "row" },
    chatHeaderIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: T.bgSecondary,
        borderWidth: 1,
        borderColor: T.line,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 8,
    },
    chatHeaderIconPrimary: {
        backgroundColor: T.accentSoft,
        borderColor: T.accentBorder,
    },

    // chatBody: the animated block that rises with the keyboard
    chatBody: { flex: 1 },
    msgArea: { flex: 1 },
    msgLoadWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
    },
    msgList: { paddingHorizontal: 10, paddingVertical: 10 },
    loadOlderWrap: { alignItems: "center", paddingVertical: 8 },
    loadOlderText: {
        fontSize: 12,
        fontWeight: "800",
        color: T.accentDark,
        backgroundColor: "rgba(0,168,132,0.08)",
        borderWidth: 1,
        borderColor: "rgba(0,168,132,0.18)",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        overflow: "hidden",
    },
    msgEmptyWrap: { alignItems: "center", paddingTop: 40 },
    msgEmptyBadge: {
        backgroundColor: "rgba(0,168,132,0.1)",
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    msgEmptyText: { fontSize: 12, color: T.mid, textAlign: "center" },

    callEventWrap: { alignItems: "center", marginBottom: 10, marginTop: 4 },
    callEventCard: {
        minWidth: 180,
        maxWidth: "86%",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    callEventIcon: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
    },
    callEventTextWrap: { flex: 1 },
    callEventTitle: { fontSize: 13, fontWeight: "700" },
    callEventMeta: { fontSize: 11, color: T.mid, marginTop: 2 },

    msgRow: {
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        marginBottom: 4,
        paddingHorizontal: 4,
    },
    msgRowIn: { justifyContent: "flex-start" },
    msgRowOut: { justifyContent: "flex-end" },
    msgBubble: {
        maxWidth: "75%",
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
        marginBottom: 2,
    },
    msgBubbleIn: {
        alignSelf: "flex-start",
        backgroundColor: T.bubbleIn,
        borderWidth: 1,
        borderColor: T.bubbleInBorder,
        borderTopLeftRadius: 0,
    },
    msgBubbleOut: {
        alignSelf: "flex-end",
        backgroundColor: T.bubbleOut,
        borderWidth: 1,
        borderColor: T.bubbleOutBorder,
        borderTopRightRadius: 0,
    },
    msgTxt: { fontSize: 15, color: T.ink, lineHeight: 21 },
    msgMeta: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        marginTop: 3,
        gap: 2,
    },
    msgTime: { fontSize: 11, color: T.mute },
    msgImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 4 },
    audioBubble: {
        minWidth: 190,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 4,
        marginBottom: 4,
    },
    audioBubbleOut: {
        alignSelf: "flex-end",
    },
    audioPlayBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.accentSoft,
        borderWidth: 1,
        borderColor: T.accentBorder,
    },
    audioPlayBtnOut: {
        backgroundColor: "rgba(0,128,105,0.12)",
        borderColor: T.bubbleOutBorder,
    },
    audioInfo: {
        flex: 1,
    },
    audioTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: T.ink,
    },
    audioMeta: {
        fontSize: 11,
        color: T.mid,
        marginTop: 2,
    },
    imagePreviewOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.94)",
        alignItems: "center",
        justifyContent: "center",
    },
    imagePreviewBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    imagePreviewClose: {
        position: "absolute",
        top: 52,
        right: 18,
        zIndex: 2,
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.14)",
    },
    imagePreviewFull: {
        width: "100%",
        height: "100%",
    },
    docRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 4,
    },
    docIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: T.accentSoft,
        alignItems: "center",
        justifyContent: "center",
    },
    docIconWrapOut: { backgroundColor: "rgba(0,128,105,0.12)" },
    docLabel: { fontSize: 13, color: T.ink, fontWeight: "600", flexShrink: 1 },
    taskInlineBubble: {
        marginTop: 4,
        borderRadius: 8,
        padding: 8,
        backgroundColor: "rgba(0,168,132,0.08)",
        borderWidth: 1,
        borderColor: T.accentBorder,
    },
    taskInlineTitle: { fontSize: 12, fontWeight: "700", color: T.ink },
    taskInlineMeta: { fontSize: 11, color: T.mid, marginTop: 2 },
    taskCardHighlight: {
        borderWidth: 2,
        borderColor: "#2563EB",
        shadowColor: "#2563EB",
        shadowOpacity: 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },

    attPreview: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: T.line,
        backgroundColor: T.bg,
    },
    recordingBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: T.line,
        backgroundColor: "#FFF3F3",
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#DC2626",
    },
    recordingText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#991B1B",
    },
    voiceDraftBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: T.line,
        backgroundColor: "#F8FFFB",
    },
    voiceDraftInfo: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    voiceDraftIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: T.accentSoft,
    },
    voiceDraftTextWrap: {
        flex: 1,
    },
    voiceDraftTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: T.ink,
    },
    voiceDraftMeta: {
        fontSize: 11,
        color: T.mid,
        marginTop: 2,
    },
    voiceDraftActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    voiceDraftBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    voiceDraftDeleteBtn: {
        backgroundColor: "#FFF1F2",
        borderWidth: 1,
        borderColor: "#FECDD3",
    },
    voiceDraftSendBtn: {
        backgroundColor: T.accent,
    },
    attPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        alignSelf: "flex-start",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: T.accentBorder,
        backgroundColor: T.accentSoft,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginTop: 4,
        maxWidth: "100%",
    },
    attPillIconWrap: { opacity: 0.8 },
    attPillText: {
        flexShrink: 1,
        fontSize: 12,
        fontWeight: "600",
        color: T.accentDark,
    },
    attPillClose: { marginLeft: 2 },

    composer: {
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 8,
        paddingHorizontal: 8,
        paddingTop: 8,
        backgroundColor: T.bgSecondary,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: T.line,
    },
    composerInputWrap: {
        flex: 1,
        flexDirection: "row",
        alignItems: "flex-end",
        backgroundColor: T.bg,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: T.line,
        paddingRight: 4,
    },
    composerIconBtn: {
        width: 40,
        height: 42,
        alignItems: "center",
        justifyContent: "center",
    },
    composerInput: {
        flex: 1,
        minHeight: 42,
        maxHeight: 120,
        paddingVertical: 10,
        paddingHorizontal: 4,
        color: T.ink,
        fontSize: 15,
    },
    composerSend: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: T.mute,
        alignItems: "center",
        justifyContent: "center",
    },
    composerSendActive: { backgroundColor: T.accent },
    composerSendRecording: { backgroundColor: "#DC2626" },

    // Tasks
    taskListHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 16,
        paddingBottom: 10,
    },
    taskListTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: T.ink,
        letterSpacing: -0.3,
    },
    taskListCount: {
        fontSize: 12,
        fontWeight: "700",
        color: T.mute,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    taskCard: {
        flexDirection: "row",
        backgroundColor: T.bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 10,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    taskCardDone: { opacity: 0.65 },
    taskAccent: { width: 3, flexShrink: 0 },
    taskInner: { flex: 1, padding: 12 },
    taskTopRowCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        marginBottom: 6,
    },
    taskTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: "700",
        color: T.ink,
        lineHeight: 20,
    },
    taskTitleDone: { textDecorationLine: "line-through", color: T.mute },
    statusTag: {
        borderRadius: 5,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderWidth: 1,
        flexShrink: 0,
    },
    statusTagText: {
        fontSize: 9,
        fontWeight: "800",
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    taskMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginBottom: 7,
        flexWrap: "wrap",
    },
    taskMetaItem: { fontSize: 10, fontWeight: "600", color: T.mute },
    taskMetaDot: {
        width: 2.5,
        height: 2.5,
        borderRadius: 1.25,
        backgroundColor: "#D0D7DB",
    },
    taskDesc: { fontSize: 12, lineHeight: 18, color: T.mid, marginBottom: 8 },
    taskPeople: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 8,
        flexWrap: "wrap",
    },
    taskPersonRow: { flexDirection: "row", gap: 5, alignItems: "center" },
    taskPersonLabel: { fontSize: 10, color: T.mute, fontWeight: "600" },
    taskPersonName: { fontSize: 11, color: T.ink, fontWeight: "700" },
    taskAttachmentBlock: { marginBottom: 8 },
    taskAttachmentImage: {
        width: "100%",
        height: 140,
        borderRadius: 10,
        marginBottom: 8,
        backgroundColor: T.bgSecondary,
    },
    taskBtnRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
    },
    taskAction: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 32,
        paddingHorizontal: 10,
        borderRadius: 7,
        minWidth: 80,
        justifyContent: "center",
        fontSize: 11,
    },
    taskActionPrimary: { backgroundColor: T.accent },
    taskActionGhost: {
        borderWidth: 1,
        borderColor: T.line,
        backgroundColor: T.bgSecondary,
    },
    taskActionText: { fontSize: 11, fontWeight: "700", color: "#fff" },
    taskActionTextGhost: { fontSize: 11, fontWeight: "700", color: T.mid },
    taskEmpty: { alignItems: "center", paddingVertical: 40, gap: 12 },
    taskEmptyText: {
        fontSize: 13,
        color: T.mute,
        textAlign: "center",
        maxWidth: 260,
        lineHeight: 19,
    },

    // Compact Task Card Styles
    compactTaskCard: {
        flexDirection: "row",
        backgroundColor: T.bg,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 8,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    compactTaskCardDone: { opacity: 0.6 },
    compactTaskAccent: { width: 3, flexShrink: 0 },
    compactTaskContent: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    compactTaskMain: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 4,
    },
    compactTaskTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: "700",
        color: T.ink,
    },
    compactTaskTitleDone: {
        textDecorationLine: "line-through",
        color: T.mute,
    },
    compactStatusTag: {
        borderRadius: 5,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderWidth: 1,
        flexShrink: 0,
    },
    compactStatusTagText: {
        fontSize: 9,
        fontWeight: "800",
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    compactTaskMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    compactTaskMetaLabel: {
        fontSize: 11,
        color: T.mute,
        fontWeight: "600",
    },
    compactTaskDot: {
        width: 2.5,
        height: 2.5,
        borderRadius: 1.25,
        backgroundColor: "#D0D7DB",
    },

    // Detail Modal Styles - Centered
    centeredModalContainer: {
        flex: 1,
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-end",
        paddingHorizontal: 0,
        paddingBottom: 0,
        gap: 0,
    },
    centeredModalContent: {
        width: "100%",
        maxWidth: "100%",
        backgroundColor: T.bg,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -6 },
        elevation: 14,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flexShrink: 1,
    },
    centeredModalContentCompact: {
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
    },
    centeredModalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: T.line,
    },
    modalCloseCenter: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: T.bgSecondary,
        borderWidth: 1,
        borderColor: T.line,
        alignItems: "center",
        justifyContent: "center",
    },
    centeredTaskCounter: {
        paddingVertical: 2,
    },
    centeredTaskCounterText: {
        fontSize: 12,
        fontWeight: "800",
        color: T.accent,
        letterSpacing: 0.5,
        textTransform: "uppercase",
    },
    taskDetailHeaderTitle: {
        flex: 1,
        textAlign: "center",
        fontSize: 13,
        fontWeight: "800",
        color: T.ink,
        letterSpacing: 0.1,
    },
    centeredScrollView: {
        flex: 1,
        paddingBottom: 0,
    },
    centeredScrollContent: {
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
    },
    taskDetailFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: T.line,
        backgroundColor: T.bgSecondary,
    },
    taskDetailFooterText: {
        fontSize: 11,
        color: T.mute,
        fontWeight: "700",
        letterSpacing: 0.2,
    },

    // Full-screen Task Detail
    taskDetailFsScreen: { flex: 1, backgroundColor: T.bgSecondary },
    taskDetailFsHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 6,
        paddingBottom: 12,
        backgroundColor: T.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: T.line,
    },
    taskDetailFsHeaderCenter: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    taskDetailFsHeaderRight: { width: 40, height: 40 },
    taskDetailFsTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: T.ink,
        letterSpacing: -0.2,
    },
    taskDetailFsSub: { marginTop: 2, fontSize: 12, color: T.mute },
    taskDetailHintBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: T.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: T.line,
    },
    taskDetailHintText: {
        fontSize: 12,
        color: T.mute,
        fontWeight: "700",
        letterSpacing: 0.2,
    },
    taskDetailFsBody: { flex: 1 },
    taskDetailFsScrollContent: { paddingHorizontal: 14, paddingTop: 14 },
    taskDetailFsFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingTop: 10,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: T.line,
        backgroundColor: T.bg,
    },
    sideNavBtn: {
        width: 56,
        height: 56,
        borderRadius: 14,
        backgroundColor: T.bg,
        borderWidth: 2,
        borderColor: T.accentBorder,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
        flexShrink: 0,
    },
    sideNavBtnDisabled: {
        opacity: 0.25,
    },
    detailModalSheet: {
        backgroundColor: T.bg,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingTop: 10,
        maxHeight: "92%",
        minHeight: "55vh",
        flex: 1,
        display: "flex",
        flexDirection: "column",
    },
    detailTaskScrollContainer: {
        flex: 1,
    },
    detailTaskScrollContent: {
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    detailTaskCard: {
        flexDirection: "row",
        backgroundColor: T.bg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: T.line,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
        marginBottom: 8,
    },
    detailTaskNavigation: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: T.line,
        marginTop: 0,
    },
    navBtn: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: T.bgSecondary,
        borderWidth: 1,
        borderColor: T.line,
        alignItems: "center",
        justifyContent: "center",
    },
    navBtnDisabled: {
        opacity: 0.25,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(11,20,28,0.38)",
        justifyContent: "flex-end",
    },
    taskModalOverlay: {
        flex: 1,
        backgroundColor: "rgba(11,20,28,0.38)",
        justifyContent: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalKav: { flex: 1, justifyContent: "flex-end" },
    taskModalKav: { flex: 1, justifyContent: "center" },
    modalSheet: {
        backgroundColor: T.bg,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingTop: 10,
        maxHeight: "90%",
        minHeight: 420,
    },
    modalSheetCompact: { maxHeight: "94%" },
    taskModalSheet: {
        width: "100%",
        alignSelf: "center",
        backgroundColor: "transparent",
    },
    taskModalSheetWide: {
        maxWidth: 780,
    },
    taskModalCard: {
        flex: 1,
        width: "100%",
        backgroundColor: T.bg,
        overflow: "hidden",
    },
    taskModalCardWide: {
        alignSelf: "center",
        maxWidth: 760,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: T.line,
    },
    taskModalCardPhone: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: T.line,
    },
    modalPull: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: T.line,
        alignSelf: "center",
        marginBottom: 16,
    },
    modalHdr: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 8,
    },
    modalHdrText: {
        flex: 1,
        paddingRight: 12,
    },
    modalEye: {
        fontSize: 10,
        fontWeight: "700",
        color: T.mute,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        marginBottom: 2,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: T.ink,
        letterSpacing: -0.4,
        lineHeight: 28,
    },
    modalClose: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: T.bgSecondary,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: T.line,
    },
    modalDivider: {
        height: 1,
        backgroundColor: T.line,
        marginTop: 16,
        marginBottom: 2,
    },
    modalBody: { paddingHorizontal: 20, paddingBottom: 18 },
    taskModalBody: { paddingHorizontal: 20, paddingBottom: 18 },
    modalBodyCompact: { paddingBottom: 10 },
    taskModalScroll: { flex: 1 },

    fLbl: {
        fontSize: 10,
        fontWeight: "700",
        color: T.mute,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginTop: 20,
        marginBottom: 8,
    },
    fInput: {
        borderWidth: 1,
        borderColor: T.line,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        backgroundColor: T.bgSecondary,
        color: T.ink,
        fontSize: 14,
        minHeight: 50,
    },
    fInputArea: { minHeight: 110, paddingTop: 12 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    fChip: {
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: T.line,
        backgroundColor: T.bgSecondary,
    },
    fChipActive: { backgroundColor: T.accent, borderColor: T.accent },
    fChipTxt: { fontSize: 13, fontWeight: "700", color: T.mid },
    fChipTxtActive: { color: "#fff" },
    assignRow: { flexDirection: "row", gap: 8 },
    fFilePicker: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#BDBDBD",
        backgroundColor: T.bgSecondary,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    fFilePickerTxt: { fontSize: 13, fontWeight: "600", color: T.mid },
    taskAttachmentPreviewWrap: {
        marginTop: 12,
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: T.line,
        backgroundColor: T.bgSecondary,
    },
    taskAttachmentPreview: {
        width: "100%",
        height: 180,
        backgroundColor: T.bgSecondary,
    },
    submitBtn: {
        marginTop: 24,
        height: 52,
        borderRadius: 12,
        backgroundColor: T.accent,
        alignItems: "center",
        justifyContent: "center",
    },
    submitBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
