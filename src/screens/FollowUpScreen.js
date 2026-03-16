import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
    ActivityIndicator,
    Alert,
    AppState,
    DeviceEventEmitter,
    Dimensions,
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
    View,
} from "react-native";
import RNImmediatePhoneCall from "react-native-immediate-phone-call";
import { SafeAreaView } from "react-native-safe-area-context";
import { PostCallModal } from "../components/PostCallModal";
import ConfettiBurst from "../components/ConfettiBurst";
import * as callLogService from "../services/callLogService";
import * as enquiryService from "../services/enquiryService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { getImageUrl } from "../utils/imageHelper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
const { width } = Dimensions.get("window");

const FOLLOWUP_ACTIVITY_OPTIONS = [
    "Phone Call",
    "WhatsApp",
    "Email",
    "Meeting",
];
const ENQUIRY_STATUS_TABS = [
    { value: "All", label: "All" },
    { value: "New", label: "New" },
    { value: "Contacted", label: "Connected" },
    { value: "Interested", label: "Interested" },
    { value: "Not Interested", label: "Not Interested" },
    { value: "Converted", label: "Converted" },
    { value: "Closed", label: "Closed" },
];

// ── PREMIUM iOS LIGHT THEME (matches EnquiryListScreen) ───────────────────
const COLORS = {
    bgApp: "#F2F4F8",
    bgCard: "#FFFFFF",
    bgCardAlt: "#FAFBFF",

    primary: "#1A6BFF",
    primaryDark: "#0055E5",
    primaryLight: "#EBF2FF",
    primaryMid: "#C2D9FF",

    secondary: "#FF3B5C",
    accent: "#7B61FF",
    teal: "#00C6A2",

    textMain: "#0A0F1E",
    textSub: "#3A4060",
    textMuted: "#7C85A3",
    textLight: "#B0BAD3",

    border: "#E8ECF4",
    divider: "#F0F2F8",
    shadow: "#1A2560",

    success: "#00C48C",
    whatsapp: "#25D366",
    danger: "#FF3B5C",
    warning: "#FF9500",
    info: "#1A6BFF",

    warningBg: "#FFF5E6",
    warningText: "#92400E",
    successBg: "#E6FBF5",
    successText: "#065F46",
    primaryBg: "#EBF2FF",
    primaryText: "#0055E5",

    gradients: {
        primary: ["#1A6BFF", "#7B61FF"],
        success: ["#00C48C", "#00A67A"],
        danger: ["#FF3B5C", "#C5001F"],
        info: ["#1A6BFF", "#0055E5"],
        header: ["#FFFFFF", "#F2F4F8"],
        teal: ["#00C6A2", "#00A685"],
    },
};

// ── HELPERS ────────────────────────────────────────────────────────────────
const toLocalIso = (d) => {
    const date = d ? new Date(d) : new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const safeLocaleString = (raw) => {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString();
};

const safeLocaleDateString = (raw, options) => {
    if (!raw) return "-";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, options);
};

const getStatusConfig = (status) => {
    switch (status) {
        case "New":
            return { color: COLORS.info, bg: COLORS.primaryLight };
        case "Contacted":
            return { color: COLORS.warning, bg: "#FFF5E6" };
        case "Interested":
            return { color: COLORS.teal, bg: "#E6FBF5" };
        case "Not Interested":
            return { color: COLORS.danger, bg: "#FFF0F3" };
        case "Converted":
            return { color: COLORS.success, bg: "#E6FBF5" };
        case "Closed":
            return { color: COLORS.textLight, bg: COLORS.bgApp };
        default:
            return { color: COLORS.primary, bg: COLORS.primaryLight };
    }
};

const normalizeStatusValue = (status) => {
    const raw = String(status || "")
        .trim()
        .toLowerCase();
    if (raw === "in progress") return "Contacted";
    if (raw === "dropped" || raw === "drop") return "Not Interested";
    if (raw === "contacted") return "Contacted";
    if (raw === "new") return "New";
    if (raw === "interested") return "Interested";
    if (raw === "not interested") return "Not Interested";
    if (raw === "converted") return "Converted";
    if (raw === "closed") return "Closed";
    return status || "New";
};

const matchesStatusTab = (item, tab) =>
    tab === "All" ? true : normalizeStatusValue(item?.status) === tab;

const formatDisplayValue = (value, fallback = "N/A") => {
    if (value == null || value === "") return fallback;
    if (typeof value === "string" || typeof value === "number")
        return String(value);
    if (value instanceof Date) return value.toLocaleDateString();
    if (Array.isArray(value)) {
        const formatted = value
            .map((entry) => formatDisplayValue(entry, ""))
            .filter(Boolean)
            .join(", ");
        return formatted || fallback;
    }
    if (typeof value === "object") {
        if (typeof value.name === "string" && value.name.trim())
            return value.name;
        if (typeof value.title === "string" && value.title.trim())
            return value.title;
        if (typeof value.label === "string" && value.label.trim())
            return value.label;
        if (typeof value.value === "string" && value.value.trim())
            return value.value;
    }
    return fallback;
};

// ── MAIN SCREEN ────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { user, logout } = useAuth();
    const swipeHandlers = useSwipeNavigation("FollowUp", navigation);
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

    const [screen, setScreen] = useState("ENQUIRY_LIST");
    const [activeTab, setActiveTab] = useState("New");
    const [followUps, setFollowUps] = useState([]);
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [editRemarks, setEditRemarks] = useState("");
    const [editActivityType, setEditActivityType] = useState("Phone Call");
    const [editStatus, setEditStatus] = useState("Contacted");
    const [editNextDate, setEditNextDate] = useState("");
    const [editNextTime, setEditNextTime] = useState("");
    const [editAmount, setEditAmount] = useState("");
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [datePickerTarget, setDatePickerTarget] = useState("add"); // "add" | "history"
    const [isTimePickerVisible, setTimePickerVisibility] = useState(false);
    const [timePickerValue, setTimePickerValue] = useState(new Date());
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [enquiryHistory, setEnquiryHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const historyEnqIdentifierRef = useRef(null);
    const [showHistoryEditModal, setShowHistoryEditModal] = useState(false);
    const [historyEditItem, setHistoryEditItem] = useState(null);
    const [historyEditRemarks, setHistoryEditRemarks] = useState("");
    const [historyEditActivityType, setHistoryEditActivityType] =
        useState("Phone Call");
    const [historyEditStatus, setHistoryEditStatus] = useState("Connected");
    const [historyEditDate, setHistoryEditDate] = useState("");
    const [historyEditTime, setHistoryEditTime] = useState("");
    const [isHistoryTimePickerVisible, setHistoryTimePickerVisibility] =
        useState(false);
    const [historyTimePickerValue, setHistoryTimePickerValue] = useState(
        new Date(),
    );
    const [isSavingHistoryEdit, setIsSavingHistoryEdit] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const [callModalVisible, setCallModalVisible] = useState(false);
    const [callEnquiry, setCallEnquiry] = useState(null);
    const [callStartTime, setCallStartTime] = useState(null);
    const [callStarted, setCallStarted] = useState(false);
    const [autoDuration, setAutoDuration] = useState(0);
    const [autoCallData, setAutoCallData] = useState(null);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const lastFetchTime = useRef(0);
    const lastComposerToken = useRef(null);
    const fetchRequestIdRef = useRef(0);
    const confettiRef = useRef(null);
    const detailsRequestIdRef = useRef(0);

    useFocusEffect(
        useCallback(() => {
            // Stop hourly reminders once the user has viewed the follow-ups screen.
            Promise.resolve(
                notificationService.acknowledgeHourlyFollowUpReminders?.(),
            ).catch(() => {});

            const now = Date.now();
            const isStale = now - lastFetchTime.current > 60000;
            if (isStale || followUps.length === 0)
                fetchFollowUps(activeTab, true);
        }, [activeTab, searchQuery]),
    );

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
                        note: data.note || "Auto-logged from Follow-up Screen",
                        callTime: data.callTime || new Date(),
                        enquiryId: callEnquiry?._id,
                        contactName: callEnquiry?.name,
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
        const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
            lastFetchTime.current = 0;
            fetchFollowUps(activeTab, true);
        });
        return () => sub.remove();
    }, [activeTab]);

    useEffect(() => {
        const timer = setTimeout(() => {
            lastFetchTime.current = 0;
            fetchFollowUps(activeTab, true);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        const composerToken = route.params?.composerToken;
        const enquiry = route.params?.enquiry;
        if (!route.params?.openComposer || !composerToken || !enquiry) return;
        if (lastComposerToken.current === composerToken) return;
        lastComposerToken.current = composerToken;
        openCreateComposer(enquiry);
    }, [
        route.params?.openComposer,
        route.params?.composerToken,
        route.params?.enquiry,
    ]);

    // ── API HANDLERS (unchanged) ───────────────────────────────────────────
    const fetchFollowUps = async (tab, refresh = false) => {
        const requestId = ++fetchRequestIdRef.current;
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
            const currentPage = refresh ? 1 : page;
            const response = await enquiryService.getAllEnquiries(
                currentPage,
                20,
                searchQuery,
                tab === "All" ? "" : tab,
                "",
            );
            let newData = [];
            let totalPages = 1;
            if (Array.isArray(response)) {
                newData = response;
            } else if (response && response.data) {
                newData = response.data;
                totalPages = response.pagination?.pages || 1;
            }
            if (requestId !== fetchRequestIdRef.current) return;
            newData = newData
                .filter((item) => matchesStatusTab(item, tab))
                .filter(
                    (item, index, arr) =>
                        arr.findIndex(
                            (c) => String(c?._id) === String(item?._id),
                        ) === index,
                );
            setHasMore(
                Array.isArray(response) ? false : currentPage < totalPages,
            );
            if (refresh) {
                setFollowUps(newData);
            } else {
                setFollowUps((prev) => [...prev, ...newData]);
            }
            lastFetchTime.current = Date.now();
            if (!refresh) {
                setPage((prev) => prev + 1);
            } else if (newData.length > 0 && currentPage < totalPages) {
                setPage(2);
            }
        } catch (error) {
            console.error(error);
        } finally {
            if (requestId === fetchRequestIdRef.current) {
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        }
    };

    const handleLoadMore = () => {
        if (!isLoading && !isLoadingMore && hasMore)
            fetchFollowUps(activeTab, false);
    };

    const handleTabChange = (tab) => {
        if (tab === activeTab) return;
        fetchRequestIdRef.current += 1;
        setFollowUps([]);
        setIsLoading(true);
        setPage(1);
        setHasMore(true);
        lastFetchTime.current = 0;
        setActiveTab(tab);
    };

    const handleOpenEdit = useCallback((item) => {
        setEditItem(null);
        setSelectedEnquiry(item);
        setEditRemarks("");
        setEditActivityType("Phone Call");
        setEditStatus(item?.status || "Contacted");
        setEditNextDate("");
        setEditNextTime("");
        setTimePickerVisibility(false);
        setEditAmount("");
        setShowEditModal(true);
    }, []);

    const openCreateComposer = (enquiry) => {
        setSelectedEnquiry(enquiry);
        setEditItem(null);
        setEditRemarks("");
        setEditActivityType("Phone Call");
        setEditStatus(enquiry?.status || "Contacted");
        setEditNextDate("");
        setEditNextTime("");
        setTimePickerVisibility(false);
        setEditAmount("");
        setCalendarMonth(new Date());
        setShowEditModal(true);
        if (route.params?.openComposer)
            navigation.setParams({ openComposer: false, composerToken: null });
    };

    const closeEditModal = () => {
        setShowEditModal(false);
        setEditItem(null);
        setEditRemarks("");
        setEditActivityType("Phone Call");
        setEditStatus("Contacted");
        setEditNextDate("");
        setEditNextTime("");
        setTimePickerVisibility(false);
        setEditAmount("");
    };

    const handleSaveEdit = async () => {
        if (!selectedEnquiry) return;
        try {
            const validStatuses = ENQUIRY_STATUS_TABS.map((item) => item.value)
                .filter((v) => v !== "All");
            if (!validStatuses.includes(editStatus))
                return Alert.alert("Error", "Please select a valid status");
            if (!editRemarks.trim())
                return Alert.alert("Required", "Enter follow-up remarks");
            if (
                ["New", "Contacted", "Interested"].includes(editStatus) &&
                !editNextDate
            )
                return Alert.alert("Required", "Enter next follow-up date");
            if (editStatus === "Converted" && !editAmount)
                return Alert.alert("Required", "Enter amount");
            setIsSavingEdit(true);
            let remarksValue = editRemarks;
            if (editStatus === "Converted")
                remarksValue = editRemarks
                    ? `${editRemarks} | Sales: ₹${editAmount}`
                    : `Sales: ₹${editAmount}`;
            const rawAssignedTo =
                selectedEnquiry.assignedTo?._id ||
                selectedEnquiry.assignedTo?.id ||
                selectedEnquiry.assignedTo;
            const assignedToId =
                typeof rawAssignedTo === "string"
                    ? rawAssignedTo
                    : rawAssignedTo && typeof rawAssignedTo === "object"
                      ? rawAssignedTo.toString?.()
                      : "";
            const effectiveDate = editNextDate || toLocalIso(new Date());
            const followUpAction =
                editStatus === "Converted"
                    ? "Sales"
                    : ["Not Interested", "Closed"].includes(editStatus)
                      ? "Drop"
                      : "Followup";
            const followUpState =
                followUpAction === "Sales"
                    ? "Completed"
                    : followUpAction === "Drop"
                      ? "Drop"
                      : "Scheduled";
            const createPayload = {
                enqId: selectedEnquiry._id,
                enqNo: selectedEnquiry.enqNo,
                name: selectedEnquiry.name,
                mobile: selectedEnquiry.mobile,
                product: selectedEnquiry.product,
                image: selectedEnquiry.image,
                ...(assignedToId ? { assignedTo: assignedToId } : {}),
                activityType: editActivityType,
                type: editActivityType,
                note: remarksValue,
                remarks: remarksValue,
                date: effectiveDate,
                ...(editNextTime ? { time: editNextTime } : {}),
                followUpDate: effectiveDate,
                nextFollowUpDate: effectiveDate,
                nextAction: followUpAction,
                status: followUpState,
                ...(editStatus === "Converted"
                    ? {
                          amount:
                              Number(
                                  editAmount.toString().replace(/[^0-9.]/g, ""),
                              ) || 0,
                      }
                    : {}),
            };
            await followupService.createFollowUp(createPayload);
            const parsedAmount =
                Number(editAmount.toString().replace(/[^0-9.]/g, "")) || 0;
            const updatePayload = {
                status: editStatus,
                ...(editStatus === "Converted"
                    ? { cost: parsedAmount, conversionDate: new Date() }
                    : {}),
            };
            await enquiryService.updateEnquiry(
                selectedEnquiry._id || selectedEnquiry.enqNo,
                updatePayload,
            );
            closeEditModal();
            lastFetchTime.current = 0;
            fetchFollowUps(activeTab, true);
            const newStatus = String(editStatus || "");
            const celebrateStatuses = new Set([
                "Contacted",
                "Interested",
                "Converted",
            ]);
            if (celebrateStatuses.has(newStatus)) {
                confettiRef.current?.play?.();
            }
        } catch (e) {
            Alert.alert("Error", e.response?.data?.message || "Could not save");
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleOpenDetails = useCallback(async (enq) => {
        if (!enq) return;
        const requestId = ++detailsRequestIdRef.current;
        const fallbackEnquiry = {
            _id: enq._id,
            name: enq.name || "Unknown",
            mobile: enq.mobile || "N/A",
            enqNo: enq.enqNo || "N/A",
            status: enq.status || "New",
            requirements: enq.requirements || "No remarks",
            product: enq.product || "N/A",
            source: enq.source || "N/A",
            address: enq.address || "N/A",
            image: enq.image || null,
            createdAt: enq.createdAt || null,
            enquiryDateTime: enq.enquiryDateTime || null,
            lastContactedAt: enq.lastContactedAt || null,
        };
        if (enq.enqId && typeof enq.enqId === "object" && enq.enqId.name) {
            setSelectedEnquiry(enq.enqId);
            setShowDetailsModal(true);
            return;
        }
        const enqIdentifier = enq._id || enq.enqNo;
        if (!enqIdentifier) {
            setSelectedEnquiry(fallbackEnquiry);
            setShowDetailsModal(true);
            return;
        }
        setSelectedEnquiry(fallbackEnquiry);
        setShowDetailsModal(true);
        setDetailsLoading(true);
        try {
            const data = await enquiryService.getEnquiryById(enqIdentifier);
            if (requestId !== detailsRequestIdRef.current) return;
            setSelectedEnquiry(data);
        } catch (error) {
            if (requestId !== detailsRequestIdRef.current) return;
            setSelectedEnquiry(fallbackEnquiry);
        } finally {
            if (requestId === detailsRequestIdRef.current)
                setDetailsLoading(false);
        }
    }, []);

    const handleOpenHistory = useCallback(async (enq) => {
        if (!enq) return;
        setHistoryLoading(true);
        setShowHistoryModal(true);
        try {
            const enqIdentifier = enq.enqNo || enq._id;
            historyEnqIdentifierRef.current = enqIdentifier;
            const historyData =
                await followupService.getFollowUpHistory(enqIdentifier);
            setEnquiryHistory(Array.isArray(historyData) ? historyData : []);
        } catch (error) {
            setEnquiryHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const openHistoryEdit = (item) => {
        if (!item) return;
        const normalizedNextAction = String(item?.nextAction || "")
            .trim()
            .toLowerCase();
        const inferredEnquiryStatus =
            normalizedNextAction === "sales"
                ? "Converted"
                : normalizedNextAction === "drop"
                  ? "Not Interested"
                  : "Connected";

        setHistoryEditItem(item);
        setHistoryEditRemarks(item?.remarks || item?.note || "");
        setHistoryEditActivityType(item?.activityType || item?.type || "Phone Call");
        setHistoryEditStatus(inferredEnquiryStatus);
        setHistoryEditDate(
            item?.nextFollowUpDate || item?.followUpDate || item?.date || "",
        );
        setHistoryEditTime(item?.time || "");
        setHistoryTimePickerVisibility(false);
        setShowHistoryEditModal(true);
    };

    const closeHistoryEdit = () => {
        setShowHistoryEditModal(false);
        setHistoryEditItem(null);
        setHistoryEditRemarks("");
        setHistoryEditActivityType("Phone Call");
        setHistoryEditStatus("Connected");
        setHistoryEditDate("");
        setHistoryEditTime("");
        setHistoryTimePickerVisibility(false);
        setIsSavingHistoryEdit(false);
    };

    const showHistoryTimePicker = () => {
        if (Platform.OS === "web") return;
        if (historyEditTime && /^\d{1,2}:\d{2}$/.test(historyEditTime)) {
            const [hh, mm] = historyEditTime.split(":").map((n) => Number(n));
            const base = new Date();
            base.setHours(hh || 0, mm || 0, 0, 0);
            setHistoryTimePickerValue(base);
        } else {
            setHistoryTimePickerValue(new Date());
        }
        setHistoryTimePickerVisibility(true);
    };

    const hideHistoryTimePicker = () => setHistoryTimePickerVisibility(false);

    const handleConfirmHistoryTime = (event, selectedDate) => {
        if (Platform.OS === "android") {
            if (event?.type === "dismissed") return hideHistoryTimePicker();
            if (selectedDate) setHistoryEditTime(formatTime(selectedDate));
            return hideHistoryTimePicker();
        }
        if (selectedDate) setHistoryEditTime(formatTime(selectedDate));
    };

    const handleSaveHistoryEdit = async () => {
        if (!historyEditItem?._id) return;
        try {
            if (!historyEditRemarks.trim())
                return Alert.alert("Required", "Enter follow-up remarks");
            if (!historyEditDate)
                return Alert.alert("Required", "Select follow-up date");

            setIsSavingHistoryEdit(true);

            const followUpAction =
                historyEditStatus === "Converted"
                    ? "Sales"
                    : ["Not Interested", "Closed"].includes(historyEditStatus)
                      ? "Drop"
                      : "Followup";
            const followUpState =
                followUpAction === "Sales"
                    ? "Completed"
                    : followUpAction === "Drop"
                      ? "Drop"
                      : "Scheduled";

            const payload = {
                remarks: historyEditRemarks,
                note: historyEditRemarks,
                activityType: historyEditActivityType,
                type: historyEditActivityType,
                date: historyEditDate,
                followUpDate: historyEditDate,
                nextFollowUpDate: historyEditDate,
                ...(historyEditTime ? { time: historyEditTime } : { time: "" }),
                nextAction: followUpAction,
                status: followUpState,
            };

            await followupService.updateFollowUp(historyEditItem._id, payload);

            // Keep enquiry status aligned (for New/Interested/Closed selections).
            try {
                const enqIdentifier =
                    historyEditItem?.enqId?._id ||
                    historyEditItem?.enqId ||
                    historyEditItem?.enqNo;
                if (enqIdentifier) {
                    const mapped =
                        historyEditStatus === "Connected"
                            ? "Contacted"
                            : historyEditStatus;
                    await enquiryService.updateEnquiry(enqIdentifier, {
                        status: mapped,
                    });
                }
            } catch (e) {}

            // Refresh history list
            const enqIdentifier = historyEnqIdentifierRef.current;
            if (enqIdentifier) {
                const historyData =
                    await followupService.getFollowUpHistory(enqIdentifier);
                setEnquiryHistory(
                    Array.isArray(historyData) ? historyData : [],
                );
            }

            // Resync today's reminders immediately (date/time might have changed)
            try {
                const res = await followupService.getFollowUps("Today", 1, 200);
                const list = Array.isArray(res?.data)
                    ? res.data
                    : Array.isArray(res)
                      ? res
                      : [];
                await notificationService.scheduleTimeFollowUpRemindersForToday?.(
                    list,
                    { channelId: "followups", missedAfterMinutes: 20 },
                );
                await notificationService.scheduleHourlyFollowUpRemindersForToday?.(
                    list,
                    { endHour: 21, channelId: "followups" },
                );
            } catch (e) {}

            closeHistoryEdit();
            const celebrateStatuses = new Set([
                "Connected",
                "Interested",
                "Converted",
            ]);
            if (celebrateStatuses.has(String(historyEditStatus || ""))) {
                confettiRef.current?.play?.();
            }
        } catch (e) {
            Alert.alert("Error", e?.response?.data?.message || "Could not save");
            setIsSavingHistoryEdit(false);
        }
    };

    const showDatePicker = (target = "add") => {
        setDatePickerTarget(target);
        setCalendarMonth(new Date());
        setDatePickerVisibility(true);
    };
    const hideDatePicker = () => setDatePickerVisibility(false);
    const handleConfirmDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const value = `${year}-${month}-${day}`;
        if (datePickerTarget === "history") setHistoryEditDate(value);
        else setEditNextDate(value);
        setTimeout(() => setDatePickerVisibility(false), 100);
    };

    const formatTime = (d) => {
        const h = String(d.getHours()).padStart(2, "0");
        const m = String(d.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    };

    const showTimePicker = () => {
        if (Platform.OS === "web") return;
        if (editNextTime && /^\d{1,2}:\d{2}$/.test(editNextTime)) {
            const [hh, mm] = editNextTime.split(":").map((n) => Number(n));
            const base = new Date();
            base.setHours(hh || 0, mm || 0, 0, 0);
            setTimePickerValue(base);
        } else {
            setTimePickerValue(new Date());
        }
        setTimePickerVisibility(true);
    };
    const hideTimePicker = () => setTimePickerVisibility(false);
    const handleConfirmTime = (event, selectedDate) => {
        if (Platform.OS === "android") {
            if (event?.type === "dismissed") return hideTimePicker();
            if (selectedDate) setEditNextTime(formatTime(selectedDate));
            return hideTimePicker();
        }
        if (selectedDate) setEditNextTime(formatTime(selectedDate));
    };

    const handleCall = useCallback(async (item) => {
        if (!item || !item.mobile) return;
        if (Platform.OS === "android") {
            await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.CALL_PHONE,
                PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
                PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
            ]);
        }
        let callTriggered = false;
        try {
            if (
                RNImmediatePhoneCall &&
                typeof RNImmediatePhoneCall.immediatePhoneCall === "function"
            ) {
                RNImmediatePhoneCall.immediatePhoneCall(item.mobile);
                callTriggered = true;
            }
        } catch (e) {}
        if (!callTriggered) Linking.openURL(`tel:${item.mobile}`);
        const mockEnquiry = {
            _id: item._id || item.enqNo,
            name: item.name,
            mobile: item.mobile,
        };
        setCallEnquiry(mockEnquiry);
        setCallStartTime(Date.now());
        setCallStarted(true);
    }, []);

    const handleWhatsApp = useCallback(
        (item) => {
            if (!item || !item.mobile) return;
            navigation.navigate("WhatsAppChat", {
                enquiry: {
                    _id: item._id || item.enqNo,
                name: item.name,
                mobile: item.mobile,
                },
            });
        },
        [navigation],
    );

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
            fetchFollowUps(activeTab, true);
        } catch (error) {
            console.error("Error logging call:", error);
        }
    };

    const getDaysInMonth = (date) =>
        new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const getFirstDayOfMonth = (date) => {
        const d = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
        return d === 0 ? 6 : d - 1;
    };
    const renderCalendarDays = () => {
        const daysInMonth = getDaysInMonth(calendarMonth);
        const firstDay = getFirstDayOfMonth(calendarMonth);
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let day = 1; day <= daysInMonth; day++) days.push(day);
        return days;
    };

    // ── SIDE MENU ──────────────────────────────────────────────────────────
    const SideMenu = () => (
        <Modal
            animationType="fade"
            transparent
            visible={menuVisible}
            onRequestClose={() => setMenuVisible(false)}>
            <TouchableOpacity
                style={menuStyles.menuOverlay}
                activeOpacity={1}
                onPress={() => setMenuVisible(false)}>
                <View style={menuStyles.menuContent}>
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
                            icon="grid-outline"
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
                            onPress={() => {
                                setMenuVisible(false);
                                navigation.navigate("Enquiry");
                            }}
                        />
	                        <MenuItem
	                            icon="call-outline"
	                            label="Follow-ups"
	                            onPress={() => setMenuVisible(false)}
	                            active
	                        />
	                        <MenuItem
	                            icon="mail-outline"
	                            label="Email"
	                            onPress={() => {
	                                setMenuVisible(false);
	                                navigation.navigate("EmailScreen");
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
	                        <MenuItem
	                            icon="settings-outline"
	                            label="WhatsApp Settings"
	                            onPress={() => {
	                                setMenuVisible(false);
	                                navigation.navigate("WhatsAppSettings");
	                            }}
	                        />
	                        <MenuItem
	                            icon="mail-open-outline"
	                            label="Email Settings"
	                            onPress={() => {
	                                setMenuVisible(false);
	                                navigation.navigate("EmailSettingsScreen");
	                            }}
	                        />
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
                        You'll need to log in again to access your follow-ups
                        and data.
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

    // ── TOP BAR ────────────────────────────────────────────────────────────
    const TopBar = ({
        title,
        showBack = false,
        onBack,
        showMenu = false,
        onMenuPress,
    }) => (
        <View style={[styles.headerWrapper, { paddingTop: insets.top + -30 }]}>
            <View style={styles.headerTop}>
                <View style={styles.headerLeft}>
                    {showMenu ? (
                        <TouchableOpacity
                            onPress={onMenuPress}
                            style={styles.menuIconContainer}>
                            <Ionicons
                                name="menu"
                                size={22}
                                color={COLORS.textSub}
                            />
                        </TouchableOpacity>
                    ) : showBack ? (
                        <TouchableOpacity
                            onPress={
                                onBack ||
                                (() => {
                                    if (navigation?.canGoBack?.())
                                        navigation.goBack();
                                    else setScreen("ENQUIRY_LIST");
                                })
                            }
                            style={styles.menuIconContainer}>
                            <Ionicons
                                name="arrow-back"
                                size={22}
                                color={COLORS.textSub}
                            />
                        </TouchableOpacity>
                    ) : null}

                    <View style={{ marginLeft: 12 }}>
                        <Text style={styles.headerSubLabel}>
                            Follow-up Center
                        </Text>
                        <Text style={styles.headerTitle}>{title}</Text>
                    </View>
                </View>

                {showMenu && (
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
                            onPress={() =>
                                navigation.navigate("ProfileScreen")
                            }
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
                )}
            </View>

            {showMenu && (
                <View style={styles.searchContainer}>
                    <Ionicons
                        name="search-outline"
                        size={18}
                        color={COLORS.textMuted}
                        style={{ marginLeft: 14 }}
                    />
                    <TextInput
                        placeholder="Search enquiries..."
                        style={styles.searchInput}
                        placeholderTextColor={COLORS.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            )}
        </View>
    );

    // ── TAB BAR ────────────────────────────────────────────────────────────
    const TabBar = () => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBarScroll}
            contentContainerStyle={styles.tabBarContent}>
            {ENQUIRY_STATUS_TABS.map((tab) => {
                const isActive = activeTab === tab.value;
                const cfg = getStatusConfig(tab.value);
                return (
                    <TouchableOpacity
                        key={tab.value}
                        onPress={() => handleTabChange(tab.value)}
                        style={[
                            styles.tabPill,
                            isActive && {
                                backgroundColor: cfg.color,
                                borderColor: cfg.color,
                            },
                        ]}
                        activeOpacity={0.75}>
                        <Text
                            style={[
                                styles.tabText,
                                isActive && styles.activeTabText,
                            ]}>
                            {tab.label}
                        </Text>
                        {isActive && (
                            <MotiView
                                from={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={[
                                    styles.tabDot,
                                    { backgroundColor: "#fff" },
                                ]}
                            />
                        )}
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );

    // ── FOLLOW-UP CARD ─────────────────────────────────────────────────────
    const FollowUpCard = useMemo(() => React.memo(
        ({
            item,
            index,
            activeTab,
            handleOpenDetails,
            handleOpenHistory,
            handleOpenEdit,
            handleCall,
            handleWhatsApp,
        }) => {
            if (!item) return null;
            const initials = item.name
                ? item.name.substring(0, 2).toUpperCase()
                : "NA";
            const normalizedStatus = normalizeStatusValue(item.status);
            const sCfg = getStatusConfig(normalizedStatus);
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
                    from={{ opacity: 0, translateY: 14 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{
                        type: "timing",
                        duration: 280,
                        delay: index < 6 ? index * 50 : 0,
                    }}
                    style={styles.cardWrapper}>
                    <TouchableOpacity
                        activeOpacity={0.95}
                        onPress={() => handleOpenDetails(item)}>
                        <View style={styles.cardContainer}>
                            {/* Left accent stripe */}
                            <View
                                style={[
                                    styles.cardStripe,
                                    { backgroundColor: sCfg.color },
                                ]}
                            />

                            {/* Header */}
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
                                </View>

                                <View style={styles.cardInfo}>
                                    <View style={styles.nameRow}>
                                        <Text
                                            style={styles.cardName}
                                            numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <View
                                            style={[
                                                styles.statusTag,
                                                { backgroundColor: sCfg.bg },
                                            ]}>
                                            <View
                                                style={[
                                                    styles.statusDot,
                                                    {
                                                        backgroundColor:
                                                            sCfg.color,
                                                    },
                                                ]}
                                            />
                                            <Text
                                                style={[
                                                    styles.statusTagText,
                                                    { color: sCfg.color },
                                                ]}>
                                                {normalizedStatus ===
                                                "Contacted"
                                                    ? "Connected"
                                                    : normalizedStatus ||
                                                      activeTab}
                                            </Text>
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
                                        {item.enqNo ? (
                                            <View style={styles.enqNoBadge}>
                                                <Text style={styles.enqNoText}>
                                                    #{item.enqNo}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                </View>
                            </View>

                            {/* Product + Date */}
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
                                        {item.product || "No product"}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.dateBadge,
                                        { backgroundColor: sCfg.bg },
                                    ]}>
                                    <Ionicons
                                        name="time-outline"
                                        size={11}
                                        color={sCfg.color}
                                    />
                                    <Text
                                        style={[
                                            styles.dateText,
                                            { color: sCfg.color },
                                        ]}>
                                        {item.latestFollowUpDate
                                            ? item.latestFollowUpDate
                                            : item.lastContactedAt
                                              ? safeLocaleDateString(
                                                    item.lastContactedAt,
                                                )
                                              : (item.enquiryDateTime ||
                                                    item.createdAt)
                                                ? safeLocaleDateString(
                                                      item.enquiryDateTime ||
                                                          item.createdAt,
                                                  )
                                                : "-"}
                                    </Text>
                                </View>
                            </View>

                            {/* Meta */}
                            <View style={styles.metaRow}>
                                <View style={styles.metaChip}>
                                    <Ionicons
                                        name="person-outline"
                                        size={11}
                                        color={COLORS.textMuted}
                                    />
                                    <Text style={styles.metaChipText}>
                                        {formatDisplayValue(
                                            item.assignedTo,
                                            "Unassigned",
                                        )}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.cardDivider} />

                            {/* Actions */}
                            <View style={styles.actionBar}>
                                <TouchableOpacity
                                    style={[
                                        styles.actionBtnPrimary,
                                        {
                                            backgroundColor:
                                                COLORS.success + "18",
                                        },
                                    ]}
                                    onPress={() => handleCall(item)}>
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
                                        {
                                            backgroundColor:
                                                COLORS.whatsapp + "18",
                                        },
                                    ]}
                                    onPress={() => handleWhatsApp(item)}>
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
                                                    COLORS.teal + "18",
                                            },
                                        ]}
                                        onPress={() => handleOpenHistory(item)}>
                                        <Ionicons
                                            name="time-outline"
                                            size={17}
                                            color={COLORS.teal}
                                        />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.actionIconBtn,
                                            {
                                                backgroundColor:
                                                    COLORS.primary + "12",
                                            },
                                        ]}
                                        onPress={() => handleOpenEdit(item)}>
                                        <Ionicons
                                            name="create-outline"
                                            size={17}
                                            color={COLORS.primary}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </TouchableOpacity>
                </MotiView>
            );
        },
    ), []);

    // ── FOLLOW-UP LIST ─────────────────────────────────────────────────────
    const renderFollowUpList = () => (
        <View style={{ flex: 1, backgroundColor: COLORS.bgApp }}>
            <TopBar
                title={user?.name || "Follow-ups"}
                showMenu
                onMenuPress={() => setMenuVisible(true)}
            />
            <TabBar />
            <FlatList
                data={followUps}
                keyExtractor={(item, index) =>
                    item?.id
                        ? item.id.toString()
                        : item?._id?.toString() || `item-${index}`
                }
                contentContainerStyle={[
                    styles.listContent,
                    followUps.length === 0 && { flex: 1 },
                ]}
                refreshing={isLoading && followUps.length > 0}
                onRefresh={() => fetchFollowUps(activeTab, true)}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                removeClippedSubviews={true}
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
                                    name="calendar-outline"
                                    size={38}
                                    color={COLORS.primary}
                                />
                            </View>
                            <Text style={styles.emptyTitle}>No enquiries</Text>
                            <Text style={styles.emptyText}>
                                No {activeTab} enquiries found
                            </Text>
                        </View>
                    )
                }
                renderItem={({ item, index }) => (
                    <FollowUpCard
                        item={item}
                        index={index}
                        activeTab={activeTab}
                        handleOpenDetails={handleOpenDetails}
                        handleOpenHistory={handleOpenHistory}
                        handleOpenEdit={handleOpenEdit}
                        handleCall={handleCall}
                        handleWhatsApp={handleWhatsApp}
                    />
                )}
            />
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea} {...swipeHandlers}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bgApp} />
            <ConfettiBurst ref={confettiRef} topOffset={0} />
            <LogoutConfirmModal
                visible={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={confirmLogout}
            />
            <SideMenu />

            {screen === "ENQUIRY_LIST" && renderFollowUpList()}

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

            {/* ── DETAILS MODAL ── */}
            <Modal visible={showDetailsModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.handleBar} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>
                                Enquiry Details
                            </Text>
                            {detailsLoading ? (
                                <ActivityIndicator
                                    size="small"
                                    color={COLORS.primary}
                                    style={{ marginLeft: 10 }}
                                />
                            ) : null}
                            <TouchableOpacity
                                onPress={() => setShowDetailsModal(false)}
                                style={styles.closeCircle}>
                                <Ionicons
                                    name="close"
                                    size={20}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        {selectedEnquiry && (
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                style={{ paddingHorizontal: 20 }}>
                                <View
                                    style={[
                                        styles.contextCard,
                                        [
                                            "drop",
                                            "dropped",
                                            "not interested",
                                        ].includes(
                                            String(
                                                selectedEnquiry.status || "",
                                            ).toLowerCase(),
                                        ) && { opacity: 0.6 },
                                    ]}>
                                    <View
                                        style={[
                                            styles.contextAvatar,
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
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                }}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <LinearGradient
                                                colors={
                                                    COLORS.gradients.primary
                                                }
                                                style={{
                                                    width: "100%",
                                                    height: "100%",
                                                    borderRadius: 20,
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                }}>
                                                <Text
                                                    style={
                                                        styles.contextAvatarText
                                                    }>
                                                    {selectedEnquiry.name
                                                        ? selectedEnquiry.name
                                                              .substring(0, 2)
                                                              .toUpperCase()
                                                        : "NA"}
                                                </Text>
                                            </LinearGradient>
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.contextName}>
                                            {selectedEnquiry.name}
                                        </Text>
                                        <Text style={styles.contextDate}>
                                            {selectedEnquiry.mobile}
                                        </Text>
                                    </View>
                                    {[
                                        "drop",
                                        "dropped",
                                        "not interested",
                                    ].includes(
                                        String(
                                            selectedEnquiry.status || "",
                                        ).toLowerCase(),
	                                    ) && (
	                                        <View
	                                            style={[
	                                                styles.statusTag,
                                                {
                                                    backgroundColor:
                                                        COLORS.danger + "15",
                                                    marginLeft: "auto",
                                                },
                                            ]}>
                                            <Text
                                                style={[
                                                    styles.statusTagText,
                                                    { color: COLORS.danger },
                                                ]}>
                                                NOT INTERESTED
                                            </Text>
	                                        </View>
	                                    )}
	                                </View>

	                                <View style={styles.heroChipsRow}>
	                                    {selectedEnquiry.status ? (
	                                        <View style={styles.heroChip}>
	                                            <Ionicons
	                                                name="radio-button-on-outline"
	                                                size={13}
	                                                color={COLORS.textSub}
	                                            />
	                                            <Text style={styles.heroChipText}>
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
	                                            <Text style={styles.heroChipText}>
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
	                                            <Text style={styles.heroChipText}>
	                                                {selectedEnquiry.source}
	                                            </Text>
	                                        </View>
	                                    ) : null}
	                                </View>

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
	                                            label="Product"
	                                            value={selectedEnquiry.product}
	                                            icon="briefcase-outline"
	                                        />
	                                        <DetailRow
	                                            label="Enquiry No"
	                                            value={selectedEnquiry.enqNo}
	                                            icon="document-text-outline"
	                                        />
	                                        <DetailRow
	                                            label="Enquiry Date Time"
	                                            value={
	                                                selectedEnquiry.enquiryDateTime
	                                                    ? safeLocaleString(
	                                                          selectedEnquiry.enquiryDateTime,
	                                                      )
	                                                    : safeLocaleString(
	                                                          selectedEnquiry.createdAt,
	                                                      )
	                                            }
	                                            icon="time-outline"
	                                        />
	                                        <DetailRow
	                                            label="Status"
	                                            value={selectedEnquiry.status}
	                                            icon="flag-outline"
	                                        />
	                                        <DetailRow
	                                            label="Remarks"
	                                            value={
	                                                selectedEnquiry.requirements ||
	                                                "No remarks"
	                                            }
	                                            icon="chatbubble-outline"
	                                        />
	                                        <DetailRow
	                                            label="Source"
	                                            value={
	                                                selectedEnquiry.source ||
	                                                "N/A"
	                                            }
	                                            icon="git-branch-outline"
	                                        />
	                                        <DetailRow
	                                            label="Address"
	                                            value={
	                                                selectedEnquiry.address ||
	                                                "N/A"
	                                            }
	                                            icon="location-outline"
	                                        />
	                                    </View>
	                                </View>
	                                <View style={{ height: 32 }} />
	                            </ScrollView>
	                        )}
                    </View>
                </View>
            </Modal>

            {/* ── HISTORY MODAL ── */}
            <Modal visible={showHistoryModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.handleBar} />
                        <View style={styles.historyModalHeader}>
                            <View style={styles.historyHeaderIcon}>
                                <Ionicons
                                    name="time-outline"
                                    size={22}
                                    color={COLORS.primary}
                                />
                            </View>
                            <View style={styles.historyHeaderText}>
                                <Text style={styles.sheetTitle}>
                                    Follow-up History
                                </Text>
                                <Text style={styles.historyModalSubtitle}>
                                    All interactions & updates
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowHistoryModal(false)}
                                style={styles.closeCircle}>
                                <Ionicons
                                    name="close"
                                    size={20}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        {historyLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator
                                    size="large"
                                    color={COLORS.primary}
                                />
                                <Text style={styles.loadingText}>
                                    Loading history...
                                </Text>
                            </View>
                        ) : enquiryHistory.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <View style={styles.emptyIconWrap}>
                                    <Ionicons
                                        name="document-text-outline"
                                        size={38}
                                        color={COLORS.primary}
                                    />
                                </View>
                                <Text style={styles.emptyTitle}>
                                    No Activity Yet
                                </Text>
                                <Text style={styles.emptyText}>
                                    Historical interactions will appear here.
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={enquiryHistory}
                                keyExtractor={(item, index) =>
                                    item._id || `history-${index}`
                                }
                                contentContainerStyle={styles.historyList}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item, index }) => {
                                    const getTypeConfig = (type) => {
                                        const t = (type || "").toLowerCase();
                                        if (t.includes("call"))
                                            return {
                                                icon: "call",
                                                color: COLORS.success,
                                            };
                                        if (t.includes("whatsapp"))
                                            return {
                                                icon: "logo-whatsapp",
                                                color: COLORS.whatsapp,
                                            };
                                        if (t.includes("email"))
                                            return {
                                                icon: "mail",
                                                color: COLORS.info,
                                            };
                                        if (t.includes("meeting"))
                                            return {
                                                icon: "people",
                                                color: COLORS.accent,
                                            };
                                        return {
                                            icon: "chatbubble-ellipses",
                                            color: COLORS.primary,
                                        };
                                    };
                                    const getHistoryStatusConfig = (status) => {
                                        const s = (status || "").toLowerCase();
                                        if (s.includes("sales"))
                                            return {
                                                color: COLORS.success,
                                                label: "CONVERTED",
                                            };
                                        if (
                                            s.includes("drop") ||
                                            s.includes("not interested")
                                        )
                                            return {
                                                color: COLORS.danger,
                                                label: "NOT INTERESTED",
                                            };
                                        return {
                                            color: COLORS.primary,
                                            label:
                                                status?.toUpperCase() ||
                                                "FOLLOW-UP",
                                        };
                                    };
                                    const typeConfig = getTypeConfig(item.type);
                                    const statusCfg = getHistoryStatusConfig(
                                        item.status,
                                    );
                                    return (
                                        <MotiView
                                            from={{
                                                opacity: 0,
                                                translateX: -16,
                                            }}
                                            animate={{
                                                opacity: 1,
                                                translateX: 0,
                                            }}
                                            transition={{ delay: index * 80 }}
                                            style={styles.historyTimelineItem}>
                                            <View style={styles.timelineLeft}>
                                                <View
                                                    style={[
                                                        styles.timelineDot,
                                                        {
                                                            backgroundColor:
                                                                typeConfig.color,
                                                        },
                                                    ]}>
                                                    <Ionicons
                                                        name={typeConfig.icon}
                                                        size={12}
                                                        color="#FFF"
                                                    />
                                                </View>
                                                {index !==
                                                    enquiryHistory.length -
                                                        1 && (
                                                    <View
                                                        style={
                                                            styles.timelineConnector
                                                        }
                                                    />
                                                )}
                                            </View>
                                            <View
                                                style={
                                                    styles.historyContentCard
                                                }>
                                                <View
                                                    style={
                                                        styles.historyCardHeader
                                                    }>
                                                    <View>
                                                        <Text
                                                            style={
                                                                styles.historyDateText
                                                            }>
                                                            {item.date}
                                                        </Text>
                                                        <Text
                                                            style={
                                                                styles.historyTimeText
                                                            }>
                                                            {item.time || ""}
                                                        </Text>
                                                    </View>
                                                    <View
                                                        style={{
                                                            flexDirection:
                                                                "row",
                                                            alignItems:
                                                                "center",
                                                            gap: 10,
                                                        }}>
                                                        <View
                                                            style={[
                                                                styles.historyStatusPill,
                                                                {
                                                                    backgroundColor:
                                                                        statusCfg.color +
                                                                        "15",
                                                                },
                                                            ]}>
                                                            <Text
                                                                style={[
                                                                    styles.historyStatusPillText,
                                                                    {
                                                                        color: statusCfg.color,
                                                                    },
                                                                ]}>
                                                                {
                                                                    statusCfg.label
                                                                }
                                                            </Text>
                                                        </View>
                                                        <TouchableOpacity
                                                            onPress={() =>
                                                                openHistoryEdit(
                                                                    item,
                                                                )
                                                            }
                                                            style={{
                                                                width: 34,
                                                                height: 34,
                                                                borderRadius: 12,
                                                                backgroundColor:
                                                                    COLORS.bgApp,
                                                                borderWidth: 1,
                                                                borderColor:
                                                                    COLORS.border,
                                                                justifyContent:
                                                                    "center",
                                                                alignItems:
                                                                    "center",
                                                            }}>
                                                            <Ionicons
                                                                name="pencil-outline"
                                                                size={16}
                                                                color={
                                                                    COLORS.textSub
                                                                }
                                                            />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                                <View
                                                    style={
                                                        styles.historyRemarksBox
                                                    }>
                                                    <Text
                                                        style={
                                                            styles.historyRemarksText
                                                        }>
                                                        {item.remarks}
                                                    </Text>
                                                    {item.amount > 0 && (
                                                        <Text
                                                            style={[
                                                                styles.historyRemarksText,
                                                                {
                                                                    color: COLORS.success,
                                                                    fontWeight:
                                                                        "800",
                                                                    marginTop: 4,
                                                                },
                                                            ]}>
                                                            Revenue: ₹
                                                            {item.amount.toLocaleString()}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                        </MotiView>
                                    );
                                }}
                            />
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── EDIT / ADD FOLLOW-UP MODAL ── */}
            <Modal
                visible={showHistoryEditModal}
                transparent
                animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.handleBar} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Edit Follow-up</Text>
                            <TouchableOpacity
                                onPress={closeHistoryEdit}
                                style={styles.closeCircle}>
                                <Ionicons
                                    name="close"
                                    size={20}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            style={{ paddingHorizontal: 20 }}>
                            {!!historyEditItem && (
                                <>
                                    <View style={styles.contextCard}>
                                        <LinearGradient
                                            colors={COLORS.gradients.primary}
                                            style={styles.contextAvatar}>
                                            <Text style={styles.contextAvatarText}>
                                                {String(
                                                    historyEditItem?.name ||
                                                        "NA",
                                                )
                                                    .substring(0, 2)
                                                    .toUpperCase()}
                                            </Text>
                                        </LinearGradient>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.contextName}>
                                                {historyEditItem?.name ||
                                                    "Client"}
                                            </Text>
                                            <Text style={styles.contextDate}>
                                                {historyEditItem?.enqNo ||
                                                    historyEditItem?.mobile ||
                                                    ""}
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={styles.label}>Remarks</Text>
                                    <View style={styles.textAreaContainer}>
                                        <TextInput
                                            value={historyEditRemarks}
                                            onChangeText={setHistoryEditRemarks}
                                            placeholder="Write follow-up notes..."
                                            style={[
                                                styles.textArea,
                                                { minHeight: 80 },
                                            ]}
                                            multiline
                                            textAlignVertical="top"
                                            scrollEnabled={false}
                                        />
                                    </View>

                                    <Text style={styles.label}>
                                        Activity Type
                                    </Text>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.choiceRow}>
                                        {FOLLOWUP_ACTIVITY_OPTIONS.map(
                                            (activity) => {
                                                const isActive =
                                                    historyEditActivityType ===
                                                    activity;
                                                const icon =
                                                    activity === "Phone Call"
                                                        ? "call-outline"
                                                        : activity === "WhatsApp"
                                                          ? "logo-whatsapp"
                                                          : activity === "Email"
                                                            ? "mail-outline"
                                                            : "people-outline";
                                                return (
                                                    <TouchableOpacity
                                                        key={activity}
                                                        onPress={() =>
                                                            setHistoryEditActivityType(
                                                                activity,
                                                            )
                                                        }
                                                        activeOpacity={0.9}
                                                        style={[
                                                            styles.choicePill,
                                                            isActive &&
                                                                styles.choicePillActive,
                                                        ]}>
                                                        <Ionicons
                                                            name={icon}
                                                            size={16}
                                                            color={
                                                                isActive
                                                                    ? COLORS.primary
                                                                    : COLORS.textMuted
                                                            }
                                                        />
                                                        <Text
                                                            style={[
                                                                styles.choicePillText,
                                                                isActive &&
                                                                    styles.choicePillTextActive,
                                                            ]}>
                                                            {activity}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            },
                                        )}
                                    </ScrollView>

                                    <Text style={styles.label}>
                                        Follow-up Date
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.datePickerButton}
                                        onPress={() =>
                                            showDatePicker("history")
                                        }>
                                        <Ionicons
                                            name="calendar-outline"
                                            size={20}
                                            color={COLORS.primary}
                                        />
                                        <Text
                                            style={[
                                                styles.datePickerText,
                                                {
                                                    color: historyEditDate
                                                        ? COLORS.textMain
                                                        : COLORS.textLight,
                                                },
                                            ]}>
                                            {historyEditDate || "Select date"}
                                        </Text>
                                    </TouchableOpacity>

                                    <Text style={styles.label}>
                                        Follow-up Time (Optional)
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.datePickerButton}
                                        onPress={showHistoryTimePicker}>
                                        <Ionicons
                                            name="time-outline"
                                            size={20}
                                            color={COLORS.primary}
                                        />
                                        <Text
                                            style={[
                                                styles.datePickerText,
                                                {
                                                    color: historyEditTime
                                                        ? COLORS.textMain
                                                        : COLORS.textLight,
                                                },
                                            ]}>
                                            {historyEditTime || "Select time"}
                                        </Text>
                                        {!!historyEditTime && (
                                            <TouchableOpacity
                                                onPress={() =>
                                                    setHistoryEditTime("")
                                                }
                                                style={{
                                                    marginLeft: "auto",
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                }}>
                                                <Text
                                                    style={{
                                                        color: COLORS.danger,
                                                        fontWeight: "700",
                                                    }}>
                                                    Clear
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    </TouchableOpacity>

                                    {isHistoryTimePickerVisible &&
                                        Platform.OS !== "web" && (
                                            <View>
                                                <DateTimePicker
                                                    value={
                                                        historyTimePickerValue
                                                    }
                                                    mode="time"
                                                    is24Hour={true}
                                                    display="default"
                                                    onChange={
                                                        handleConfirmHistoryTime
                                                    }
                                                />
                                                {Platform.OS === "ios" && (
                                                    <TouchableOpacity
                                                        onPress={
                                                            hideHistoryTimePicker
                                                        }
                                                        style={{
                                                            marginTop: 8,
                                                            alignSelf:
                                                                "flex-end",
                                                        }}>
                                                        <Text
                                                            style={{
                                                                color: COLORS.primary,
                                                                fontWeight:
                                                                    "800",
                                                            }}>
                                                            Done
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        )}

                                    <Text style={styles.label}>Status</Text>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            flexWrap: "wrap",
                                            gap: 10,
                                            marginBottom: 10,
                                        }}>
                                        {[
                                            "New",
                                            "Connected",
                                            "Interested",
                                            "Not Interested",
                                            "Converted",
                                            "Closed",
                                        ].map(
                                            (s) => {
                                                const active =
                                                    historyEditStatus === s;
                                                return (
                                                    <TouchableOpacity
                                                        key={s}
                                                        onPress={() =>
                                                            setHistoryEditStatus(
                                                                s,
                                                            )
                                                        }
                                                        style={{
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 10,
                                                            borderRadius: 14,
                                                            borderWidth: 1.5,
                                                            borderColor: active
                                                                ? COLORS.primary
                                                                : COLORS.border,
                                                            backgroundColor: active
                                                                ? COLORS.primaryLight
                                                                : COLORS.bgCard,
                                                            minWidth: 120,
                                                            flexGrow: 1,
                                                            alignItems:
                                                                "center",
                                                        }}>
                                                        <Text
                                                            style={{
                                                                color: active
                                                                    ? COLORS.primaryDark
                                                                    : COLORS.textSub,
                                                                fontWeight:
                                                                    active
                                                                        ? "800"
                                                                        : "700",
                                                            }}>
                                                            {s}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            },
                                        )}
                                    </View>

                                    <View style={styles.footerButtons}>
                                        <TouchableOpacity
                                            style={styles.btnSecondary}
                                            onPress={closeHistoryEdit}
                                            disabled={isSavingHistoryEdit}>
                                            <Text style={styles.btnSecondaryText}>
                                                Cancel
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleSaveHistoryEdit}
                                            disabled={isSavingHistoryEdit}
                                            style={{ flex: 1 }}>
                                            <LinearGradient
                                                colors={
                                                    isSavingHistoryEdit
                                                        ? ["#ccc", "#bbb"]
                                                        : COLORS.gradients
                                                              .primary
                                                }
                                                style={styles.btnPrimary}>
                                                <Text style={styles.btnPrimaryText}>
                                                    {isSavingHistoryEdit
                                                        ? "Saving..."
                                                        : "Update"}
                                                </Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ height: 32 }} />
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={showEditModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.handleBar} />
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Add Follow-up</Text>
                            <TouchableOpacity
                                onPress={closeEditModal}
                                style={styles.closeCircle}>
                                <Ionicons
                                    name="close"
                                    size={20}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            style={{ paddingHorizontal: 20 }}>
                            {(editItem || selectedEnquiry) && (
                                <>
                                    {/* Context card */}
                                    <View style={styles.contextCard}>
                                        <LinearGradient
                                            colors={COLORS.gradients.primary}
                                            style={styles.contextAvatar}>
                                            <Text
                                                style={
                                                    styles.contextAvatarText
                                                }>
                                                {(
                                                    editItem?.name ||
                                                    selectedEnquiry?.name ||
                                                    "NA"
                                                )
                                                    .substring(0, 2)
                                                    .toUpperCase()}
                                            </Text>
                                        </LinearGradient>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.contextName}>
                                                {editItem?.name ||
                                                    selectedEnquiry?.name}
                                            </Text>
                                            <Text style={styles.contextDate}>
                                                {editItem?.date ||
                                                    selectedEnquiry?.enqNo ||
                                                    selectedEnquiry?.mobile}
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={styles.label}>Remarks</Text>
                                    <View style={styles.textAreaContainer}>
                                        <TextInput
                                            value={editRemarks}
                                            onChangeText={setEditRemarks}
                                            placeholder="Write follow-up notes..."
                                            style={[
                                                styles.textArea,
                                                { minHeight: 80 },
                                            ]}
                                            multiline
                                            textAlignVertical="top"
                                            scrollEnabled={false}
                                        />
                                    </View>

                                    <Text style={styles.label}>
                                        Activity Type
                                    </Text>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.choiceRow}>
                                        {FOLLOWUP_ACTIVITY_OPTIONS.map(
                                            (activity) => {
                                                const isActive =
                                                    editActivityType ===
                                                    activity;
                                                const icon =
                                                    activity === "Phone Call"
                                                        ? "call-outline"
                                                        : activity === "WhatsApp"
                                                          ? "logo-whatsapp"
                                                          : activity === "Email"
                                                            ? "mail-outline"
                                                            : "people-outline";
                                                return (
                                                    <TouchableOpacity
                                                        key={activity}
                                                        onPress={() =>
                                                            setEditActivityType(
                                                                activity,
                                                            )
                                                        }
                                                        activeOpacity={0.9}
                                                        style={[
                                                            styles.choicePill,
                                                            isActive &&
                                                                styles.choicePillActive,
                                                        ]}>
                                                        <Ionicons
                                                            name={icon}
                                                            size={16}
                                                            color={
                                                                isActive
                                                                    ? COLORS.primary
                                                                    : COLORS.textMuted
                                                            }
                                                        />
                                                        <Text
                                                            style={[
                                                                styles.choicePillText,
                                                                isActive &&
                                                                    styles.choicePillTextActive,
                                                            ]}>
                                                            {activity}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            },
                                        )}
                                    </ScrollView>

                                    <Text style={styles.label}>Status</Text>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.choiceRow}>
                                        {[
                                            {
                                                id: "New",
                                                icon: "sparkles-outline",
                                                color: COLORS.info,
                                            },
                                            {
                                                id: "Contacted",
                                                label: "Connected",
                                                icon: "call-outline",
                                                color: COLORS.warning,
                                            },
                                            {
                                                id: "Interested",
                                                icon: "thumbs-up-outline",
                                                color: COLORS.teal,
                                            },
                                            {
                                                id: "Not Interested",
                                                label: "Not Interested",
                                                icon: "close-circle-outline",
                                                color: COLORS.danger,
                                            },
                                            {
                                                id: "Converted",
                                                icon: "cash-outline",
                                                color: COLORS.success,
                                            },
                                            {
                                                id: "Closed",
                                                icon: "archive-outline",
                                                color: COLORS.textLight,
                                            },
                                        ].map((action) => (
                                            <TouchableOpacity
                                                key={action.id}
                                                onPress={() =>
                                                    setEditStatus(action.id)
                                                }
                                                activeOpacity={0.9}
                                                style={[
                                                    styles.statusPill,
                                                    editStatus === action.id &&
                                                        styles.statusPillActive,
                                                    editStatus === action.id && {
                                                        borderColor: action.color,
                                                        backgroundColor:
                                                            action.color + "12",
                                                    },
                                                ]}>
                                                <View style={styles.statusPillIcon}>
                                                    <Ionicons
                                                        name={action.icon}
                                                        size={16}
                                                        color={
                                                            editStatus ===
                                                            action.id
                                                                ? action.color
                                                                : action.color
                                                        }
                                                    />
                                                </View>
                                                <Text
                                                    style={[
                                                        styles.statusPillText,
                                                        editStatus ===
                                                            action.id && {
                                                            color: action.color,
                                                            fontWeight: "700",
                                                        },
                                                    ]}>
                                                    {action.label || action.id}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>

                                    {[
                                        "New",
                                        "Contacted",
                                        "Interested",
                                    ].includes(editStatus) && (
                                        <>
                                            <Text style={styles.label}>
                                                Next Date
                                            </Text>
                                            <TouchableOpacity
                                                style={styles.datePickerButton}
                                                onPress={() =>
                                                    showDatePicker("add")
                                                }>
                                                <Ionicons
                                                    name="calendar-outline"
                                                    size={20}
                                                    color={COLORS.primary}
                                                />
                                                <Text
                                                    style={[
                                                        styles.datePickerText,
                                                        {
                                                            color: editNextDate
                                                                ? COLORS.textMain
                                                                : COLORS.textLight,
                                                        },
                                                    ]}>
                                                    {editNextDate ||
                                                        "Select date"}
                                                </Text>
                                            </TouchableOpacity>

                                            <Text style={styles.label}>
                                                Next Time (Optional)
                                            </Text>
                                            <TouchableOpacity
                                                style={styles.datePickerButton}
                                                onPress={showTimePicker}>
                                                <Ionicons
                                                    name="time-outline"
                                                    size={20}
                                                    color={COLORS.primary}
                                                />
                                                <Text
                                                    style={[
                                                        styles.datePickerText,
                                                        {
                                                            color: editNextTime
                                                                ? COLORS.textMain
                                                                : COLORS.textLight,
                                                        },
                                                    ]}>
                                                    {editNextTime ||
                                                        "Select time"}
                                                </Text>
                                                {!!editNextTime && (
                                                    <TouchableOpacity
                                                        onPress={() =>
                                                            setEditNextTime("")
                                                        }
                                                        style={{
                                                            marginLeft: "auto",
                                                            paddingHorizontal: 10,
                                                            paddingVertical: 6,
                                                        }}>
                                                        <Text
                                                            style={{
                                                                color: COLORS.danger,
                                                                fontWeight: "700",
                                                            }}>
                                                            Clear
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </TouchableOpacity>

                                            {isTimePickerVisible &&
                                                Platform.OS !== "web" && (
                                                    <View>
                                                        <DateTimePicker
                                                            value={
                                                                timePickerValue
                                                            }
                                                            mode="time"
                                                            is24Hour={true}
                                                            display="default"
                                                            onChange={
                                                                handleConfirmTime
                                                            }
                                                        />
                                                        {Platform.OS ===
                                                            "ios" && (
                                                            <TouchableOpacity
                                                                onPress={
                                                                    hideTimePicker
                                                                }
                                                                style={{
                                                                    marginTop: 8,
                                                                    alignSelf:
                                                                        "flex-end",
                                                                }}>
                                                                <Text
                                                                    style={{
                                                                        color: COLORS.primary,
                                                                        fontWeight:
                                                                            "800",
                                                                    }}>
                                                                    Done
                                                                </Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                )}
                                        </>
                                    )}

                                    {editStatus === "Converted" && (
                                        <>
                                            <Text style={styles.label}>
                                                Amount (₹)
                                            </Text>
                                            <TextInput
                                                value={editAmount}
                                                onChangeText={setEditAmount}
                                                keyboardType="numeric"
                                                placeholder="0.00"
                                                style={styles.textInput}
                                                placeholderTextColor={
                                                    COLORS.textLight
                                                }
                                            />
                                        </>
                                    )}

                                    <View style={styles.footerButtons}>
                                        <TouchableOpacity
                                            style={styles.btnSecondary}
                                            onPress={closeEditModal}>
                                            <Text
                                                style={styles.btnSecondaryText}>
                                                Cancel
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleSaveEdit}
                                            disabled={isSavingEdit}
                                            style={{ flex: 1 }}>
                                            <LinearGradient
                                                colors={
                                                    isSavingEdit
                                                        ? ["#ccc", "#bbb"]
                                                        : COLORS.gradients
                                                              .primary
                                                }
                                                style={styles.btnPrimary}>
                                                <Text
                                                    style={
                                                        styles.btnPrimaryText
                                                    }>
                                                    {isSavingEdit
                                                        ? "Saving..."
                                                        : "Create"}
                                                </Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ height: 32 }} />
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── CALENDAR MODAL ── */}
            <Modal
                visible={isDatePickerVisible}
                transparent
                animationType="fade">
                <View style={styles.modalOverlayCenter}>
                    <View style={styles.calendarPopup}>
                        <View style={styles.handleBar} />
                        <View style={styles.calendarHeader}>
                            <TouchableOpacity
                                onPress={() => {
                                    const d = new Date(calendarMonth);
                                    d.setMonth(d.getMonth() - 1);
                                    setCalendarMonth(d);
                                }}
                                style={styles.calNavBtn}>
                                <Ionicons
                                    name="chevron-back"
                                    size={22}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                            <Text style={styles.calendarTitle}>
                                {calendarMonth.toLocaleString("default", {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </Text>
                            <TouchableOpacity
                                onPress={() => {
                                    const d = new Date(calendarMonth);
                                    d.setMonth(d.getMonth() + 1);
                                    setCalendarMonth(d);
                                }}
                                style={styles.calNavBtn}>
                                <Ionicons
                                    name="chevron-forward"
                                    size={22}
                                    color={COLORS.textSub}
                                />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.weekdaysRow}>
                            {["M", "T", "W", "T", "F", "S", "S"].map(
                                (day, idx) => (
                                    <Text key={idx} style={styles.weekdayName}>
                                        {day}
                                    </Text>
                                ),
                            )}
                        </View>

                        <View style={styles.calendarGrid}>
                            {renderCalendarDays().map((day, idx) => {
                                const isToday =
                                    day === new Date().getDate() &&
                                    calendarMonth.getMonth() ===
                                        new Date().getMonth() &&
                                    calendarMonth.getFullYear() ===
                                        new Date().getFullYear();
                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        disabled={!day}
                                        onPress={() =>
                                            day &&
                                            handleConfirmDate(
                                                new Date(
                                                    calendarMonth.getFullYear(),
                                                    calendarMonth.getMonth(),
                                                    day,
                                                ),
                                            )
                                        }
                                        style={[
                                            styles.calendarDay,
                                            !day && styles.emptyDay,
                                        ]}>
                                        {day ? (
                                            isToday ? (
                                                <LinearGradient
                                                    colors={
                                                        COLORS.gradients.primary
                                                    }
                                                    style={styles.todayDayGrad}>
                                                    <Text
                                                        style={
                                                            styles.todayDayText
                                                        }>
                                                        {day}
                                                    </Text>
                                                </LinearGradient>
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.calendarDayText
                                                    }>
                                                    {day}
                                                </Text>
                                            )
                                        ) : null}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={styles.calendarCancelBtn}
                            onPress={hideDatePicker}>
                            <Text style={styles.calendarCancelText}>
                                Cancel
                            </Text>
                        </TouchableOpacity>
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
            <Text style={styles.detailValue}>
                {formatDisplayValue(value)}
            </Text>
        </View>
    </View>
);

// ── STYLES ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: COLORS.bgApp },

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
    headerTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
    },
    headerLeft: { flexDirection: "row", alignItems: "center" },
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
    headerSubLabel: {
        fontSize: 11,
        color: COLORS.textMuted,
        fontWeight: "500",
        letterSpacing: 0.5,
    },
    headerTitle: {
        fontSize: 18,
        color: COLORS.textMain,
        fontWeight: "700",
        letterSpacing: -0.3,
    },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
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

    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.bgApp,
        borderRadius: 14,
        height: 48,
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 15,
        color: COLORS.textMain,
    },

    // ── Tab Bar ──
    tabBarScroll: {
        backgroundColor: COLORS.bgCard,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        maxHeight: 60,
    },
    tabBarContent: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 8,
        flexDirection: "row",
        alignItems: "center",
    },
    tabPill: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: COLORS.bgApp,
    },
    tabText: { fontSize: 13, fontWeight: "600", color: COLORS.textMuted },
    activeTabText: { color: "#fff", fontWeight: "700" },
    tabDot: { width: 5, height: 5, borderRadius: 2.5 },

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
    avatarText: { color: "#FFF", fontSize: 17, fontWeight: "800" },

    cardInfo: { flex: 1 },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
        gap: 6,
    },
    cardName: {
        fontSize: 16,
        fontWeight: "700",
        color: COLORS.textMain,
        flex: 1,
        letterSpacing: -0.2,
    },
    statusTag: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 20,
        gap: 4,
    },
    statusDot: { width: 5, height: 5, borderRadius: 2.5 },
    statusTagText: {
        fontSize: 10,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    subInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    subInfoChip: { flexDirection: "row", alignItems: "center", gap: 4 },
    cardSubtext: { fontSize: 12, color: COLORS.textMuted, fontWeight: "500" },
    enqNoBadge: {
        backgroundColor: COLORS.primaryLight,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: COLORS.primaryMid,
    },
    enqNoText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },

    productSection: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 10,
        marginBottom: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.divider,
    },
    productTag: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.primaryLight,
        paddingVertical: 5,
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
    dateBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 9,
    },
    dateText: { fontSize: 11, fontWeight: "700" },

    metaRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
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
        marginBottom: 10,
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

    // ── Empty ──
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
    emptyText: { fontSize: 13, color: COLORS.textLight, fontWeight: "500" },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        minHeight: 200,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: COLORS.textMuted,
        fontWeight: "600",
    },

    // ── Modals (bottom sheet) ──
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(10,15,30,0.5)",
        justifyContent: "flex-end",
    },
    modalOverlayCenter: {
        flex: 1,
        backgroundColor: "rgba(10,15,30,0.45)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    sheetContainer: {
        backgroundColor: COLORS.bgCard,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        maxHeight: "90%",
        overflow: "hidden",
    },

    handleBar: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.border,
        alignSelf: "center",
        marginTop: 10,
        marginBottom: 4,
    },
    sheetHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.divider,
    },
    sheetTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: COLORS.textMain,
        letterSpacing: -0.2,
    },
    closeCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
    },

    // Context card (in modals)
    contextCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.bgApp,
        padding: 14,
        borderRadius: 16,
        marginBottom: 20,
        marginTop: 8,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.primary,
    },
    contextAvatar: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: COLORS.primaryLight,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 14,
        overflow: "hidden",
    },
    contextAvatarText: { fontSize: 17, fontWeight: "800", color: "#fff" },
	    contextName: { fontSize: 15, fontWeight: "700", color: COLORS.textMain },
	    contextDate: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
	    heroChipsRow: {
	        flexDirection: "row",
	        flexWrap: "wrap",
	        justifyContent: "flex-start",
	        gap: 8,
	        marginBottom: 16,
	        marginTop: -6,
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

	    // Detail rows
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

    // Form elements
    label: {
        fontSize: 13,
        fontWeight: "700",
        color: COLORS.textSub,
        marginBottom: 8,
        marginTop: 16,
        letterSpacing: 0.2,
    },
    textAreaContainer: {
        backgroundColor: COLORS.bgApp,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        padding: 14,
        minHeight: 100,
    },
    textArea: {
        fontSize: 15,
        color: COLORS.textMain,
        textAlignVertical: "top",
        paddingTop: 0,
    },
    textInput: {
        backgroundColor: COLORS.bgApp,
        borderRadius: 14,
        paddingHorizontal: 16,
        height: 50,
        fontSize: 15,
        color: COLORS.textMain,
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    datePickerButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.primaryLight,
        paddingHorizontal: 16,
        borderRadius: 14,
        height: 50,
        marginTop: 8,
        borderWidth: 1.5,
        borderColor: COLORS.primaryMid,
    },
    datePickerText: { fontSize: 15, marginLeft: 10 },

    actionGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 8,
        marginBottom: 8,
    },
    actionCard: {
        width: (width - 56) / 4,
        alignItems: "center",
        justifyContent: "center",
        padding: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bgCard,
    },
    actionIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 7,
    },
    actionCardText: {
        fontSize: 11,
        fontWeight: "600",
        color: COLORS.textMuted,
        textAlign: "center",
    },
    actionCardActive: {
        borderColor: COLORS.primaryMid,
        backgroundColor: COLORS.primaryLight,
    },
    choiceRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 8,
        marginBottom: 8,
        paddingRight: 8,
    },
    choicePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bgCard,
    },
    choicePillActive: {
        borderColor: COLORS.primaryMid,
        backgroundColor: COLORS.primaryLight,
    },
    choicePillText: {
        fontSize: 13,
        fontWeight: "800",
        color: COLORS.textMuted,
    },
    choicePillTextActive: {
        color: COLORS.primary,
    },
    statusPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bgCard,
    },
    statusPillActive: {
        borderColor: COLORS.primaryMid,
        backgroundColor: COLORS.primaryLight,
    },
    statusPillIcon: {
        width: 28,
        height: 28,
        borderRadius: 10,
        backgroundColor: COLORS.bgApp,
        alignItems: "center",
        justifyContent: "center",
    },
    statusPillText: {
        fontSize: 13,
        fontWeight: "800",
        color: COLORS.textMuted,
    },

    footerButtons: {
        flexDirection: "row",
        gap: 12,
        marginTop: 24,
        marginBottom: 8,
    },
    btnSecondary: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 14,
        backgroundColor: COLORS.bgApp,
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    btnSecondaryText: {
        color: COLORS.textSub,
        fontWeight: "700",
        fontSize: 15,
    },
    btnPrimary: {
        flex: 1,
        paddingVertical: 15,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    btnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

    // History
    historyModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.divider,
    },
    historyHeaderIcon: {
        width: 44,
        height: 44,
        borderRadius: 13,
        backgroundColor: COLORS.primaryLight,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    historyHeaderText: { flex: 1 },
    historyModalSubtitle: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: "500",
        marginTop: 2,
    },
    historyList: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    historyTimelineItem: { flexDirection: "row", marginBottom: 16 },
    timelineLeft: { width: 36, alignItems: "center", marginRight: 12 },
    timelineDot: {
        width: 28,
        height: 28,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    timelineConnector: {
        position: "absolute",
        top: 28,
        bottom: -16,
        width: 2,
        backgroundColor: COLORS.divider,
        zIndex: 1,
    },
    historyContentCard: {
        flex: 1,
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 14,
        borderLeftWidth: 3,
        borderLeftColor: COLORS.primary,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    historyCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 10,
    },
    historyDateText: {
        fontSize: 13,
        fontWeight: "700",
        color: COLORS.textMain,
    },
    historyTimeText: {
        fontSize: 11,
        color: COLORS.textLight,
        marginTop: 2,
        fontWeight: "500",
    },
    historyStatusPill: {
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 20,
    },
    historyStatusPillText: {
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0.4,
    },
    historyRemarksBox: {
        backgroundColor: COLORS.bgApp,
        padding: 10,
        borderRadius: 10,
    },
    historyRemarksText: {
        fontSize: 13,
        color: COLORS.textMuted,
        lineHeight: 18,
        fontWeight: "500",
    },

    // Calendar
    calendarPopup: {
        backgroundColor: COLORS.bgCard,
        width: "100%",
        borderRadius: 28,
        padding: 20,
        maxWidth: 380,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 12,
    },
    calendarHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        marginTop: 8,
    },
    calNavBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: COLORS.bgApp,
        justifyContent: "center",
        alignItems: "center",
    },
    calendarTitle: { fontSize: 16, fontWeight: "800", color: COLORS.textMain },
    weekdaysRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 8,
    },
    weekdayName: {
        fontSize: 12,
        fontWeight: "700",
        color: COLORS.textLight,
        width: 35,
        textAlign: "center",
    },
    calendarGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-around",
    },
    calendarDay: {
        width: 35,
        height: 38,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 4,
        borderRadius: 10,
    },
    emptyDay: { backgroundColor: "transparent" },
    calendarDayText: {
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.textMain,
    },
    todayDayGrad: {
        width: 35,
        height: 35,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    todayDayText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
    calendarCancelBtn: {
        marginTop: 18,
        paddingVertical: 12,
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: COLORS.divider,
    },
    calendarCancelText: {
        color: COLORS.danger,
        fontWeight: "700",
        fontSize: 15,
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
