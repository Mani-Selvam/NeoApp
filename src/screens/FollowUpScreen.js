import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import * as callLogService from "../services/callLogService";
import * as enquiryService from "../services/enquiryService";
import * as followupService from "../services/followupService";

import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { getImageUrl } from "../utils/imageHelper";

const { width } = Dimensions.get("window");

// --- MODERN THEME COLORS ---
const COLORS = {
  bgApp: "#F8FAFC",
  bgCard: "#FFFFFF",

  primary: "#0EA5E9", // Cyan 500
  primaryDark: "#0284C7", // Cyan 600
  primaryLight: "#F0F9FF",

  secondary: "#F43F5E", // Rose 500
  accent: "#10B981", // Emerald 500

  textMain: "#1E293B", // Slate 800
  textMuted: "#475569", // Slate 600
  textLight: "#94A3B8", // Slate 400

  border: "#F1F5F9",

  success: "#10B981",
  whatsapp: "#25D366",
  danger: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",

  warningBg: "#FFFBEB",
  warningText: "#92400E",
  successBg: "#ECFDF5",
  successText: "#065F46",
  primaryBg: "#F0F9FF",
  primaryText: "#0369A1",

  gradients: {
    primary: ["#0EA5E9", "#2DD4BF"],
    success: ["#10B981", "#34D399"],
    danger: ["#F43F5E", "#E11D48"],
    info: ["#3B82F6", "#6366F1"],
    header: ["#0F172A", "#1E293B"],
  },
};

const toLocalIso = (d) => {
  const date = d ? new Date(d) : new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getFollowUpColor = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUpDate = new Date(date);
  followUpDate.setHours(0, 0, 0, 0);

  if (followUpDate < today) {
    return COLORS.danger; // Overdue - Red
  } else if (followUpDate.getTime() === today.getTime()) {
    return COLORS.warning; // Today - Orange
  } else {
    return COLORS.success; // Upcoming - Green
  }
};

export default function DashboardScreen({ navigation, route }) {
  // --- STATES ---
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
  const [previousScreen, setPreviousScreen] = useState("ENQUIRY_LIST");
  const [activeTab, setActiveTab] = useState("Today");
  const [followUps, setFollowUps] = useState([]);
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editRemarks, setEditRemarks] = useState("");
  const [editStatus, setEditStatus] = useState("Followup");
  const [editNextDate, setEditNextDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [enquiryHistory, setEnquiryHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // --- CALL LOG STATE ---
  const [callModalVisible, setCallModalVisible] = useState(false);
  const [callEnquiry, setCallEnquiry] = useState(null);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callStarted, setCallStarted] = useState(false);
  const [autoDuration, setAutoDuration] = useState(0);
  const [autoCallData, setAutoCallData] = useState(null);

  // --- EFFECTS ---
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const lastFetchTime = useRef(0);
  const lastFetchTab = useRef("");

  // Smart focus effect — only refetch if data is stale (>60s)
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const isStale = now - lastFetchTime.current > 60000;
      if (isStale || followUps.length === 0) {
        fetchFollowUps(activeTab, true);
      }
    }, [activeTab]),
  );

  // Listen for native CALL_ENDED events to auto-save call logs
  useEffect(() => {
    const callEndedSub = DeviceEventEmitter.addListener(
      "CALL_ENDED",
      (data) => {
        if (callStarted && callEnquiry) {
          // Claim this call so CallMonitorService doesn't auto-log it
          global.__callClaimedByScreen = true;

          console.log(
            "[FollowUpScreen] CALL_ENDED received, auto-saving:",
            data,
          );

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

  // Fallback: AppState-based detection (for Expo Go / when native module unavailable)
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
          // If autoCallData was already set by CALL_ENDED, skip AppState fallback
          if (autoCallData) return;

          const endTime = Date.now();
          const durationSeconds = Math.floor((endTime - callStartTime) / 1000);
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

  // Tab change is already handled by useEffect above

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
      lastFetchTime.current = 0; // Force stale
      fetchFollowUps(activeTab, true);
    });
    return () => sub.remove();
  }, [activeTab]);

  // ... (Notification effects remain same)

  // ... (Helpers remain same)

  // --- API HANDLERS ---
  const fetchFollowUps = async (tab, refresh = false) => {
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
      // [REMOVED DEBUG LOG]

      const response = await followupService.getFollowUps(tab, currentPage, 20);

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

      // [REMOVED DEBUG LOG]

      if (refresh) {
        setFollowUps(newData);
      } else {
        setFollowUps((prev) => [...prev, ...newData]);
      }

      // Track fetch metadata for smart refetching
      lastFetchTime.current = Date.now();
      lastFetchTab.current = tab;

      if (!refresh) {
        setPage((prev) => prev + 1);
      } else if (newData.length > 0 && currentPage < totalPages) {
        setPage(2);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!isLoading && !isLoadingMore && hasMore) {
      fetchFollowUps(activeTab, false);
    }
  };

  const handleOpenEdit = (item) => {
    setEditItem(item);
    setEditRemarks(item.remarks || "");
    setEditStatus("Followup");
    setEditNextDate("");
    setEditAmount("");
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    try {
      const validStatuses = ["Followup", "Sales", "Drop"];
      if (!validStatuses.includes(editStatus)) {
        return Alert.alert("Error", "Please select a valid status");
      }
      if (editStatus === "Followup" && !editNextDate) {
        return Alert.alert("Required", "Enter next follow-up date");
      }
      if (editStatus === "Sales" && !editAmount) {
        return Alert.alert("Required", "Enter amount");
      }

      let remarksValue = editRemarks;
      if (editStatus === "Sales") {
        remarksValue = editRemarks
          ? `${editRemarks} | Sales: ₹${editAmount}`
          : `Sales: ₹${editAmount}`;
      }

      const updatedData = {
        date: editStatus === "Followup" ? editNextDate : editItem.date,
        remarks: remarksValue,
        nextAction: editStatus,
        status:
          editStatus === "Drop"
            ? "Drop"
            : editStatus === "Sales"
              ? "Completed"
              : "Scheduled",
        ...(editStatus === "Sales" ? { amount: Number(editAmount) } : {}),
      };

      console.log("Saving update for ID:", editItem._id, updatedData);
      await followupService.updateFollowUp(editItem._id, updatedData);

      // Sync with Enquiry Status
      const enqId = editItem.enqId?._id || editItem.enqId || editItem.enqNo;
      if (enqId) {
        let enqStatus = "In Progress";
        let updatePayload = { status: enqStatus };

        if (editStatus === "Sales") {
          enqStatus = "Converted";
          const parsedAmount =
            Number(editAmount.toString().replace(/[^0-9.]/g, "")) || 0;
          updatePayload = {
            status: enqStatus,
            cost: parsedAmount,
            conversionDate: new Date(),
          };
        } else if (editStatus === "Drop") {
          enqStatus = "Dropped";
          updatePayload = { status: enqStatus };
        }

        await enquiryService.updateEnquiry(enqId, updatePayload);
      }

      setShowEditModal(false);
      setEditRemarks("");
      setEditNextDate("");
      setEditAmount("");
      setEditStatus("Followup");

      // Refresh current tab to show updated data
      lastFetchTime.current = 0; // Force fresh fetch
      fetchFollowUps(activeTab, true);

      Alert.alert("Success", "Interaction updated successfully");
    } catch (e) {
      console.error("Update follow-up error:", e);
      Alert.alert("Error", e.response?.data?.message || "Could not save");
    }
  };

  const handleOpenDetails = async (enq) => {
    if (!enq) return;

    // If enqId is already a fully populated object, just use it
    if (enq.enqId && typeof enq.enqId === "object" && enq.enqId.name) {
      setSelectedEnquiry(enq.enqId);
      setShowDetailsModal(true);
      return;
    }

    // Build the identifier to fetch the enquiry
    const enqIdentifier =
      (typeof enq.enqId === "string" ? enq.enqId : null) || enq.enqNo;

    if (!enqIdentifier) {
      // No enquiry link available — build a fallback object from the follow-up data
      setSelectedEnquiry({
        _id: enq._id,
        name: enq.name || "Unknown",
        mobile: enq.mobile || "N/A",
        enqNo: enq.enqNo || "N/A",
        status: enq.status || enq.nextAction || "Follow-up",
        requirements: enq.remarks || "No remarks",
        product: enq.product || "N/A",
        source: "N/A",
        address: "N/A",
      });
      setShowDetailsModal(true);
      return;
    }

    setIsLoading(true);
    try {
      console.log("[FollowUpScreen] Fetching full details for:", enqIdentifier);
      const data = await enquiryService.getEnquiryById(enqIdentifier);
      setSelectedEnquiry(data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error("Error fetching details:", error);
      // Fallback: show what we have from the follow-up item
      setSelectedEnquiry({
        _id: enq._id,
        name: enq.name || "Unknown",
        mobile: enq.mobile || "N/A",
        enqNo: enq.enqNo || "N/A",
        status: enq.status || enq.nextAction || "Follow-up",
        requirements: enq.remarks || "No remarks",
        product: enq.product || "N/A",
        source: "N/A",
        address: "N/A",
      });
      setShowDetailsModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenHistory = async (enq) => {
    if (!enq) return;

    setHistoryLoading(true);
    setShowHistoryModal(true);
    try {
      const enqIdentifier = enq.enqNo || enq._id;
      console.log("Fetching history for:", enqIdentifier);
      // Fetch actual follow-up history from server
      const historyData =
        await followupService.getFollowUpHistory(enqIdentifier);
      console.log("History data received:", historyData);
      setEnquiryHistory(Array.isArray(historyData) ? historyData : []);
    } catch (error) {
      console.error("Error fetching history:", error);
      // Show empty state instead of error alert
      setEnquiryHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const showDatePicker = () => {
    setCalendarMonth(new Date());
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirmDate = (date) => {
    // Format date in local timezone (not UTC)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const formattedDate = `${year}-${month}-${day}`;

    setEditNextDate(formattedDate);
    // Close calendar after a short delay to ensure state updates
    setTimeout(() => {
      setDatePickerVisibility(false);
    }, 100);
  };

  const handleCall = async (item) => {
    if (!item || !item.mobile) return;
    console.log(`[FollowUp] Attempting call to: ${item.mobile}`);

    // 1. Request Permissions
    if (Platform.OS === "android") {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      ]);
    }

    // 2. Try Direct Call
    let callTriggered = false;
    try {
      if (
        RNImmediatePhoneCall &&
        typeof RNImmediatePhoneCall.immediatePhoneCall === "function"
      ) {
        RNImmediatePhoneCall.immediatePhoneCall(item.mobile);
        callTriggered = true;
      }
    } catch (e) {
      console.error("[FollowUp] Direct Call Error:", e);
    }

    // 3. Fallback
    if (!callTriggered) {
      Linking.openURL(`tel:${item.mobile}`);
    }

    // Prepare enquiry object for modal (PostCallModal expects enquiry shape)
    // enqId is populated in the backend as an object
    const mockEnquiry = {
      _id: item.enqId?._id || item.enqId || item.enqNo || item._id,
      name: item.name,
      mobile: item.mobile,
    };

    setCallEnquiry(mockEnquiry);
    setCallStartTime(Date.now());
    setCallStarted(true);
  };

  const handleWhatsApp = (item) => {
    if (!item || !item.mobile) return;
    // Build enquiry shape for ChatScreen
    const enquiry = {
      _id: item.enqId?._id || item.enqId || item.enqNo || item._id,
      name: item.name,
      mobile: item.mobile,
    };
    navigation.navigate("WhatsAppChat", { enquiry });
  };

  const handleSaveCallLog = async (callData) => {
    try {
      const savedLog = await callLogService.createCallLog(callData);
      setCallModalVisible(false);
      setCallEnquiry(null);
      setAutoCallData(null);

      // Notify other screens (like CallLogScreen) immediately
      DeviceEventEmitter.emit("CALL_LOG_CREATED", savedLog);

      // Silent update
      fetchFollowUps(activeTab, true); // Refresh list
    } catch (error) {
      console.error("Error logging call:", error);
    }
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    const dayOfWeek = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    // Convert JS day (0=Sunday) to calendar day where Monday=0, Sunday=6
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(calendarMonth);
    const firstDay = getFirstDayOfMonth(calendarMonth);
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  // --- SIDE MENU ---
  const SideMenu = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={menuVisible}
      onRequestClose={() => setMenuVisible(false)}
    >
      <TouchableOpacity
        style={menuStyles.menuOverlay}
        activeOpacity={1}
        onPress={() => setMenuVisible(false)}
      >
        <View style={menuStyles.menuContent}>
          <LinearGradient
            colors={COLORS.gradients.primary}
            style={menuStyles.menuHeader}
          >
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
                <Ionicons name="person" size={40} color="#fff" />
              )}
            </View>
            <Text style={menuStyles.profileName}>{user?.name || "User"}</Text>
            <Text style={menuStyles.profileRole}>
              {user?.role || "Staff Member"}
            </Text>
          </LinearGradient>

          <ScrollView style={menuStyles.menuList}>
            <MenuItem
              icon="grid-outline"
              label="Dashboard"
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate("Home");
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

            {/* Logo Section at Bottom */}
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
                    <Ionicons name="business" size={28} color="#fff" />
                  </View>
                )}
                <Text style={menuStyles.logoText}>Neophorn Technologies</Text>
                <Text style={menuStyles.logoSubtext}>CRM System</Text>
              </View>
              <Text style={menuStyles.versionText}>v1.0.0</Text>
            </View>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // --- LOGOUT MODAL COMPONENT ---
  const LogoutConfirmModal = ({ visible, onClose, onConfirm }) => (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
        activeOpacity={1}
        onPress={onClose}
      >
        <MotiView
          from={{ opacity: 0, scale: 0.9, translateY: 20 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          style={styles.logoutModalContainer}
        >
          <View style={styles.logoutIconCenter}>
            <Ionicons name="log-out" size={32} color={COLORS.danger} />
          </View>
          <Text style={styles.logoutTitle}>Confirm Logout</Text>
          <Text style={styles.logoutMessage}>
            Are you sure you want to sign out? You will need to login again to
            access your data.
          </Text>

          <View style={styles.logoutActionRow}>
            <TouchableOpacity
              style={[styles.logoutBtn, styles.logoutCancelBtn]}
              onPress={onClose}
            >
              <Text style={styles.logoutCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logoutBtn, styles.logoutConfirmBtn]}
              onPress={onConfirm}
            >
              <Text style={styles.logoutConfirmText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </MotiView>
      </TouchableOpacity>
    </Modal>
  );

  const MenuItem = ({ icon, label, color = "#334155", onPress }) => (
    <TouchableOpacity style={menuStyles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[menuStyles.menuItemText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );

  // --- SUB-COMPONENTS ---

  const TopBar = ({
    title,
    showBack = false,
    onBack,
    showMenu = false,
    onMenuPress,
  }) => (
    <LinearGradient
      colors={COLORS.gradients.header}
      style={styles.headerGradient}
    >
      <View style={styles.headerTop}>
        <View style={styles.headerLeft}>
          {showMenu ? (
            <TouchableOpacity
              onPress={onMenuPress}
              style={styles.menuIconContainer}
            >
              {user?.logo ? (
                <Image
                  source={{ uri: getImageUrl(user.logo) }}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 12,
                  }}
                />
              ) : (
                <Ionicons name="grid-outline" size={24} color="#FFF" />
              )}
            </TouchableOpacity>
          ) : (
            showBack && (
              <TouchableOpacity
                onPress={
                  onBack ||
                  (() => {
                    if (
                      navigation &&
                      navigation.canGoBack &&
                      navigation.canGoBack()
                    ) {
                      navigation.goBack();
                    } else {
                      setScreen("ENQUIRY_LIST");
                    }
                  })
                }
                style={styles.menuIconContainer}
              >
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
            )
          )}
          <View>
            <Text style={styles.userNameHeader}>{title}</Text>
          </View>
        </View>
        {showMenu && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={styles.notifContainer}>
              <Ionicons name="notifications-outline" size={24} color="#FFF" />
              <View style={styles.notifBadge} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {showMenu && (
        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={20}
            color={COLORS.textLight}
            style={{ marginLeft: 15 }}
          />
          <TextInput
            placeholder="Search follow-ups..."
            style={styles.searchInput}
            placeholderTextColor={COLORS.textLight}
          />
        </View>
      )}
    </LinearGradient>
  );

  const TabBar = () => (
    <View style={styles.tabBarContainer}>
      {["Today", "Upcoming", "Missed", "Dropped", "All"].map((tab) => (
        <TouchableOpacity
          key={tab}
          onPress={() => setActiveTab(tab)}
          style={[
            styles.tabItem,
            activeTab === tab ? styles.activeTabItem : null,
          ]}
        >
          <Text
            style={[styles.tabText, activeTab === tab && styles.activeTabText]}
          >
            {tab}
          </Text>
          {activeTab === tab && (
            <MotiView
              style={styles.activeIndicator}
              from={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
            />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const FollowUpCard = React.memo(
    ({
      item,
      index,
      activeTab,
      handleOpenDetails,
      handleOpenHistory,
      handleOpenEdit,
      handleCall,
      handleWhatsApp,
      handleRefreshItem,
    }) => {
      if (!item) return null;

      const initials = item.name
        ? item.name.substring(0, 2).toUpperCase()
        : "NA";
      const isDrop = item.nextAction === "Drop" || item.status === "Drop";
      const followUpColor = isDrop
        ? COLORS.textLight
        : getFollowUpColor(item.date);

      return (
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{
            type: "timing",
            duration: 250,
            delay: index < 5 ? index * 40 : 0,
          }}
          style={styles.cardWrapper}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => handleOpenDetails(item)}
            style={[
              styles.cardContainer,
              {
                borderLeftColor: followUpColor,
                borderLeftWidth: 5,
              },
              isDrop ? { opacity: 0.8 } : null,
            ]}
          >
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.avatarContainer,
                  item.image || (item.enqId && item.enqId.image)
                    ? {
                        backgroundColor: "transparent",
                        overflow: "hidden",
                      }
                    : null,
                ]}
              >
                {item.image || (item.enqId && item.enqId.image) ? (
                  <Image
                    source={{
                      uri: getImageUrl(item.image || item.enqId?.image),
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
                      isDrop
                        ? [COLORS.textLight, "#CBD5E1"]
                        : COLORS.gradients.primary
                    }
                    style={styles.avatarGradient}
                  >
                    <Ionicons
                      name={isDrop ? "close-circle-outline" : "person-outline"}
                      size={20}
                      color="#FFF"
                      style={{ marginBottom: -2 }}
                    />
                  </LinearGradient>
                )}
              </View>

              <View style={styles.cardInfo}>
                <View style={styles.nameRow}>
                  <Text
                    style={[
                      styles.cardName,
                      isDrop && {
                        color: COLORS.textMuted,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View
                    style={[
                      styles.statusTag,
                      {
                        backgroundColor: followUpColor + "15",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.statusTagText, { color: followUpColor }]}
                    >
                      {isDrop
                        ? "DROPPED"
                        : activeTab === "Missed"
                          ? "OVERDUE"
                          : activeTab === "All"
                            ? (item.nextAction || "FOLLOWUP").toUpperCase()
                            : activeTab.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.subInfoRow}>
                  <Ionicons
                    name="call-outline"
                    size={12}
                    color={COLORS.textLight}
                  />
                  <Text style={styles.cardSubtext}>{item.mobile}</Text>
                  <View style={styles.dotSeparator} />
                  <Text style={styles.cardSubtext}>{item.enqNo}</Text>
                </View>
              </View>
            </View>

            <View style={styles.productSection}>
              <View style={styles.productTag}>
                <Ionicons
                  name="chatbubble-outline"
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={styles.productText} numberOfLines={1}>
                  {item.remarks || "No remarks"}
                </Text>
              </View>
              <View
                style={[
                  styles.dateBadge,
                  { backgroundColor: followUpColor + "15" },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={followUpColor}
                />
                <Text style={[styles.dateText, { color: followUpColor }]}>
                  {item.date}
                </Text>
              </View>
            </View>

            {/* Action Bar — same layout as EnquiryScreen */}
            <View style={styles.actionBar}>
              <View style={styles.actionLeft}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: COLORS.success + "15",
                    },
                  ]}
                  onPress={() => handleCall(item)}
                >
                  <Ionicons name="call" size={18} color={COLORS.success} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: COLORS.whatsapp + "15",
                    },
                  ]}
                  onPress={() => handleWhatsApp(item)}
                >
                  <Ionicons
                    name="logo-whatsapp"
                    size={18}
                    color={COLORS.whatsapp}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.actionRight}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: COLORS.accent + "15",
                    },
                  ]}
                  onPress={() => handleOpenHistory(item)}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={COLORS.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: COLORS.primary + "15",
                    },
                  ]}
                  onPress={() => {
                    if (isDrop && typeof handleRefreshItem === "function") {
                      handleRefreshItem(item);
                    } else {
                      handleOpenEdit(item);
                    }
                  }}
                >
                  <Ionicons
                    name={isDrop ? "refresh-outline" : "create-outline"}
                    size={18}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </MotiView>
      );
    },
  );

  const FollowUpList = () => (
    <View style={{ flex: 1, backgroundColor: COLORS.bgApp }}>
      <TopBar
        title="Follow-up Center"
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
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={[styles.emptyText, { marginTop: 16 }]}>
                Loading follow-ups...
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <Ionicons
                  name="calendar-outline"
                  size={40}
                  color={COLORS.textLight}
                />
              </View>
              <Text style={styles.emptyText}>
                No follow-ups for {activeTab}
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
            handleRefreshItem={() => fetchFollowUps(activeTab, true)}
          />
        )}
      />
    </View>
  );

  // Removed MyFollowUpsList component

  return (
    <SafeAreaView style={styles.safeArea} {...swipeHandlers}>
      <LogoutConfirmModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
      />
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.gradients.header[0]}
      />
      <SideMenu />

      {screen === "ENQUIRY_LIST" && <FollowUpList />}

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

      {/* Details Modal */}
      <Modal visible={showDetailsModal} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.detailsPopup}>
            <View style={styles.handleBar} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Enquiry Details</Text>
              <TouchableOpacity
                onPress={() => setShowDetailsModal(false)}
                style={styles.closeCircle}
              >
                <Ionicons name="close" size={20} color={COLORS.textMain} />
              </TouchableOpacity>
            </View>

            {selectedEnquiry && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ paddingHorizontal: 24 }}
              >
                <View
                  style={[
                    styles.contextCard,
                    selectedEnquiry.status === "Drop" && {
                      opacity: 0.6,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.contextAvatar,
                      selectedEnquiry.image && {
                        backgroundColor: "transparent",
                        overflow: "hidden",
                      },
                    ]}
                  >
                    {selectedEnquiry.image ? (
                      <Image
                        source={{
                          uri: getImageUrl(selectedEnquiry.image),
                        }}
                        style={{
                          width: "100%",
                          height: "100%",
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.contextAvatarText}>
                        {selectedEnquiry.name
                          ? selectedEnquiry.name.substring(0, 2).toUpperCase()
                          : "NA"}
                      </Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.contextName}>
                      {selectedEnquiry.name}
                    </Text>
                    <Text style={styles.contextDate}>
                      {selectedEnquiry.mobile}
                    </Text>
                  </View>
                  {selectedEnquiry.status === "Drop" && (
                    <View
                      style={[
                        styles.statusTag,
                        {
                          backgroundColor: COLORS.danger + "15",
                          marginLeft: "auto",
                        },
                      ]}
                    >
                      <Text
                        style={[styles.statusTagText, { color: COLORS.danger }]}
                      >
                        DROPPED
                      </Text>
                    </View>
                  )}
                </View>

                <DetailRow label="Product" value={selectedEnquiry.product} />
                <DetailRow label="Enquiry No" value={selectedEnquiry.enqNo} />
                <DetailRow label="Status" value={selectedEnquiry.status} />
                <DetailRow
                  label="Remarks"
                  value={selectedEnquiry.requirements || "No remarks"}
                />
                <DetailRow
                  label="Source"
                  value={selectedEnquiry.source || "N/A"}
                />
                <DetailRow
                  label="Address"
                  value={selectedEnquiry.address || "N/A"}
                />
                <View style={{ height: 30 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* History Modal */}
      <Modal visible={showHistoryModal} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.historyPopup}>
            <View style={styles.handleBar} />

            <View style={styles.historyModalHeader}>
              <View style={styles.historyHeaderIcon}>
                <Ionicons
                  name="time-outline"
                  size={24}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.historyHeaderText}>
                <Text style={styles.historyModalTitle}>Follow-up History</Text>
                <Text style={styles.historyModalSubtitle}>
                  All interactions & updates
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowHistoryModal(false)}
                style={styles.historyCloseButton}
              >
                <Ionicons name="close" size={22} color={COLORS.textMain} />
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading history...</Text>
              </View>
            ) : enquiryHistory.length === 0 ? (
              <View style={styles.historyEmptyContainer}>
                <View style={styles.historyEmptyIconBg}>
                  <Ionicons
                    name="document-text-outline"
                    size={48}
                    color={COLORS.textLight}
                  />
                </View>
                <Text style={styles.historyEmptyTitle}>No Activity Yet</Text>
                <Text style={styles.historyEmptyDesc}>
                  Historical interactions will appear here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={enquiryHistory}
                keyExtractor={(item, index) => item._id || `history-${index}`}
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

                  const getStatusConfig = (status) => {
                    const s = (status || "").toLowerCase();
                    if (s.includes("sales"))
                      return {
                        color: COLORS.success,
                        label: "CONVERTED",
                      };
                    if (s.includes("drop"))
                      return {
                        color: COLORS.danger,
                        label: "DROPPED",
                      };
                    return {
                      color: COLORS.primary,
                      label: status?.toUpperCase() || "FOLLOW-UP",
                    };
                  };

                  const typeConfig = getTypeConfig(item.type);
                  const statusConfig = getStatusConfig(item.status);

                  return (
                    <MotiView
                      from={{
                        opacity: 0,
                        translateX: -20,
                      }}
                      animate={{
                        opacity: 1,
                        translateX: 0,
                      }}
                      transition={{ delay: index * 100 }}
                      style={styles.historyTimelineItem}
                    >
                      <View style={styles.timelineLeft}>
                        <View
                          style={[
                            styles.timelineDot,
                            {
                              backgroundColor: typeConfig.color,
                            },
                          ]}
                        >
                          <Ionicons
                            name={typeConfig.icon}
                            size={12}
                            color="#FFF"
                          />
                        </View>
                        {index !== enquiryHistory.length - 1 && (
                          <View style={styles.timelineConnector} />
                        )}
                      </View>

                      <View style={styles.historyContentCard}>
                        <View style={styles.historyCardHeader}>
                          <View>
                            <Text style={styles.historyDateText}>
                              {item.date}
                            </Text>
                            <Text style={styles.historyTimeText}>
                              {item.time || ""}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.historyStatusPill,
                              {
                                backgroundColor: statusConfig.color + "15",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.historyStatusPillText,
                                {
                                  color: statusConfig.color,
                                },
                              ]}
                            >
                              {statusConfig.label}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.historyRemarksBox}>
                          <Text style={styles.historyRemarksText}>
                            {item.remarks}
                          </Text>
                          {item.amount > 0 && (
                            <Text
                              style={[
                                styles.historyRemarksText,
                                {
                                  color: COLORS.success,
                                  fontWeight: "800",
                                  marginTop: 4,
                                },
                              ]}
                            >
                              Revenue: ₹{item.amount.toLocaleString()}
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

      {/* Edit Modal (Update Follow-up) */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.editPopup}>
            <View style={styles.handleBar} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Update Follow-up</Text>
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                style={styles.closeCircle}
              >
                <Ionicons name="close" size={20} color={COLORS.textMain} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ paddingHorizontal: 24 }}
            >
              {editItem && (
                <>
                  <View style={styles.contextCard}>
                    <View style={styles.contextAvatar}>
                      <Text style={styles.contextAvatarText}>
                        {editItem.name?.substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.contextName}>{editItem.name}</Text>
                      <Text style={styles.contextDate}>{editItem.date}</Text>
                    </View>
                  </View>

                  <Text style={styles.label}>Remarks</Text>
                  <View style={styles.textAreaContainer}>
                    <TextInput
                      value={editRemarks}
                      onChangeText={(text) => {
                        console.log("Typing internal:", text);
                        setEditRemarks(text);
                      }}
                      placeholder="Write follow-up notes..."
                      style={[styles.textArea, { minHeight: 80 }]}
                      multiline
                      textAlignVertical="top"
                      scrollEnabled={false}
                    />
                  </View>

                  <Text style={styles.label}>Action</Text>
                  <View style={styles.actionGrid}>
                    {[
                      {
                        id: "Followup",
                        icon: "calendar-outline",
                        color: COLORS.primary,
                      },
                      {
                        id: "Sales",
                        icon: "cash-outline",
                        color: COLORS.success,
                      },
                      {
                        id: "Drop",
                        icon: "close-circle-outline",
                        color: COLORS.danger,
                      },
                    ].map((action) => (
                      <TouchableOpacity
                        key={action.id}
                        onPress={() => setEditStatus(action.id)}
                        style={[
                          styles.actionCard,
                          editStatus === action.id && {
                            borderColor: action.color,
                            backgroundColor: action.color + "10",
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.actionIconBox,
                            editStatus === action.id && {
                              backgroundColor: action.color,
                            },
                          ]}
                        >
                          <Ionicons
                            name={action.icon}
                            size={20}
                            color={
                              editStatus === action.id ? "#FFF" : action.color
                            }
                          />
                        </View>
                        <Text
                          style={[
                            styles.actionCardText,
                            editStatus === action.id && {
                              color: action.color,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {action.id}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {editStatus === "Followup" && (
                    <>
                      <Text style={styles.label}>Next Date</Text>
                      <TouchableOpacity
                        style={styles.datePickerButton}
                        onPress={showDatePicker}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={COLORS.textLight}
                        />
                        <Text
                          style={[
                            styles.datePickerText,
                            {
                              color: editNextDate
                                ? COLORS.textMain
                                : COLORS.textLight,
                            },
                          ]}
                        >
                          {editNextDate || "Select date"}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {editStatus === "Sales" && (
                    <>
                      <Text style={styles.label}>Amount (₹)</Text>
                      <TextInput
                        value={editAmount}
                        onChangeText={setEditAmount}
                        keyboardType="numeric"
                        placeholder="0.00"
                        style={styles.textInput}
                      />
                    </>
                  )}

                  <View style={styles.footerButtons}>
                    <TouchableOpacity
                      style={styles.btnSecondary}
                      onPress={() => setShowEditModal(false)}
                    >
                      <Text style={styles.btnSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnPrimary}
                      onPress={handleSaveEdit}
                    >
                      <Text style={styles.btnPrimaryText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ height: 30 }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Calendar Modal */}
      <Modal visible={isDatePickerVisible} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.calendarPopup}>
            <View style={styles.handleBar} />
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => {
                  const newDate = new Date(calendarMonth);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setCalendarMonth(newDate);
                }}
              >
                <Ionicons
                  name="chevron-back"
                  size={24}
                  color={COLORS.primary}
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
                  const newDate = new Date(calendarMonth);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setCalendarMonth(newDate);
                }}
              >
                <Ionicons
                  name="chevron-forward"
                  size={24}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {["M", "T", "W", "T", "F", "S", "S"].map((day, idx) => (
                <Text key={idx} style={styles.weekdayName}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {renderCalendarDays().map((day, idx) => (
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
                    day === new Date().getDate() &&
                      calendarMonth.getMonth() === new Date().getMonth() &&
                      styles.todayDay,
                  ]}
                >
                  {day && (
                    <Text
                      style={[
                        styles.calendarDayText,
                        day === new Date().getDate() &&
                          calendarMonth.getMonth() === new Date().getMonth() &&
                          styles.todayDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.calendarCancelBtn}
              onPress={hideDatePicker}
            >
              <Text style={styles.calendarCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const DetailRow = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgApp },
  headerGradient: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 10 : 10,
    paddingHorizontal: 20,
    paddingBottom: 25,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  tabBarContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgApp,
  },
  tabItem: {
    marginRight: 24,
    paddingVertical: 8,
    position: "relative",
  },
  activeTabItem: {},
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textLight,
  },
  activeTabText: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  greetingHeader: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "500",
  },
  userNameHeader: { fontSize: 20, color: "#FFF", fontWeight: "800" },
  notifContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  notifBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.5,
    borderColor: COLORS.gradients.header[1],
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    height: 50,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: COLORS.textMain,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 100 },
  cardWrapper: { marginBottom: 16 },
  cardContainer: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 15,
    elevation: 2,
  },
  avatarGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  cardInfo: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textMain,
    flex: 1,
  },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  statusTagText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  subInfoRow: { flexDirection: "row", alignItems: "center" },
  cardSubtext: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: "500",
    marginLeft: 4,
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textLight,
    marginHorizontal: 8,
  },
  productSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F8FAFC",
  },
  productTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
  },
  productText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginLeft: 6,
    fontWeight: "600",
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dateText: { fontSize: 12, fontWeight: "800", marginLeft: 4 },
  actionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionLeft: { flexDirection: "row", gap: 8 },
  actionRight: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: COLORS.textLight,
    fontWeight: "600",
  },

  // Modal / Popups
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  bottomSheet: {
    backgroundColor: "#FFF",
    width: "100%",
    height: "85%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
  },
  historyPopup: {
    backgroundColor: "#FFF",
    width: "92%",
    height: "80%",
    borderRadius: 32,
    paddingTop: 8,
    overflow: "hidden",
    elevation: 20,
  },
  detailsPopup: {
    backgroundColor: "#FFF",
    width: "92%",
    maxHeight: "70%",
    borderRadius: 32,
    paddingTop: 8,
    overflow: "hidden",
    elevation: 20,
  },
  editPopup: {
    backgroundColor: "#FFF",
    width: "92%",
    maxHeight: "85%",
    borderRadius: 32,
    paddingTop: 8,
    overflow: "hidden",
    elevation: 20,
  },
  calendarPopup: {
    backgroundColor: "#FFF",
    width: "90%",
    borderRadius: 32,
    padding: 20,
    elevation: 20,
  },

  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textMain },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgApp,
    justifyContent: "center",
    alignItems: "center",
  },

  contextCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgApp,
    padding: 16,
    borderRadius: 20,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  contextAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  contextAvatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
  },
  contextName: { fontSize: 16, fontWeight: "700", color: COLORS.textMain },
  contextDate: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMain,
    marginBottom: 8,
    marginTop: 16,
  },
  textAreaContainer: {
    backgroundColor: COLORS.bgApp,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 12,
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
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 15,
    color: COLORS.textMain,
  },

  actionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 8,
  },
  actionCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.bgApp,
    backgroundColor: "#FFF",
    marginHorizontal: 4,
    position: "relative",
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgApp,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  actionCardText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  checkBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.success,
    justifyContent: "center",
    alignItems: "center",
  },

  footerButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: COLORS.bgApp,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnSecondaryText: {
    color: COLORS.textMain,
    fontWeight: "700",
    fontSize: 15,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bgApp,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 52,
    marginTop: 8,
  },
  datePickerText: { fontSize: 15, color: COLORS.textMain, marginLeft: 12 },

  // History Modal
  historyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgApp,
  },
  historyHeaderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  historyHeaderText: { flex: 1 },
  historyModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textMain,
  },
  historyModalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  historyCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.bgApp,
    justifyContent: "center",
    alignItems: "center",
  },
  historyList: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  historyTimelineItem: { flexDirection: "column", marginBottom: 20 },
  timelineLeft: { width: 40, alignItems: "center" },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  timelineConnector: {
    position: "absolute",
    top: 26,
    bottom: -20,
    width: 2,
    backgroundColor: "#E2E8F0",
    zIndex: 1,
  },
  historyContentCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  historyDateText: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textMain,
  },
  historyTimeText: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
    fontWeight: "600",
  },
  historyStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  historyStatusPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  historyRemarksBox: {
    backgroundColor: COLORS.bgApp,
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  historyRemarksText: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    fontWeight: "500",
  },
  historyEmptyContainer: {
    flex: 0.8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    minHeight: 300,
  },
  historyEmptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: COLORS.bgApp,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  historyEmptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textMain,
    marginBottom: 8,
  },
  historyEmptyDesc: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "500",
  },
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

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginHorizontal: 24,
  },
  detailLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },
  detailValue: {
    fontSize: 14,
    color: COLORS.textMain,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
    marginLeft: 20,
  },

  // Calendar Specific
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  calendarTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain },
  weekdaysRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 10,
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
    height: 35,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 5,
    borderRadius: 10,
  },
  emptyDay: { backgroundColor: "transparent" },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMain,
  },
  todayDay: { backgroundColor: COLORS.primary },
  todayDayText: { color: "#FFF", fontWeight: "800" },
  calendarCancelBtn: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  calendarCancelText: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 15,
  },

  // Logout Modal Styles
  modalOverlayInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  logoutModalContainer: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  logoutIconCenter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.danger + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoutTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textMain,
    marginBottom: 8,
  },
  logoutMessage: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  logoutActionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  logoutBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutCancelBtn: {
    backgroundColor: COLORS.bgApp,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutConfirmBtn: {
    backgroundColor: COLORS.danger,
  },
  logoutCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  logoutConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

const menuStyles = StyleSheet.create({
  menuOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.5)" },
  menuContent: {
    width: "75%",
    backgroundColor: "#fff",
    height: "100%",
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    overflow: "hidden",
  },
  menuHeader: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 20 : 50,
    paddingBottom: 30,
    alignItems: "center",
  },
  profileCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  profileName: { color: "#fff", fontSize: 18, fontWeight: "800" },
  profileRole: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
  },
  menuList: { padding: 15 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemText: { marginLeft: 15, fontSize: 15, fontWeight: "700" },

  // Logo Section Styles
  logoSection: {
    marginTop: 30,
    paddingTop: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    alignItems: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  logoText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textMain,
    marginTop: 8,
  },
  logoSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  logoIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoImage: {
    width: 120,
    height: 40,
  },
  versionText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
});
