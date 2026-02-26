import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import getApiClient from "../services/apiClient";
import { getImageUrl } from "../services/apiConfig";
import * as dashboardService from "../services/dashboardService";

const { width } = Dimensions.get("window");

// 🌈 MODERN SAAS THEME
const COLORS = {
  bg: "#F8FAFC", // Slate 50
  surface: "#FFFFFF", // White
  primary: "#4F46E5", // Indigo 600
  primaryDark: "#4338CA",
  primaryLight: "#EEF2FF", // Indigo 50
  secondary: "#10B981", // Emerald 500
  accent: "#8B5CF6", // Violet 500
  success: "#10B981", // Emerald 500
  warning: "#F59E0B", // Amber 500
  danger: "#EF4444", // Red 500
  text: "#0F172A", // Slate 900
  textDim: "#475569", // Slate 600
  textMuted: "#94A3B8", // Slate 400
  border: "#E2E8F0", // Slate 200
  glass: "rgba(255, 255, 255, 0.7)",
  shadow: "rgba(15, 23, 42, 0.08)",
  gradients: {
    primary: ["#4F46E5", "#6366F1"],
    purple: ["#8B5CF6", "#A78BFA"],
    success: ["#059669", "#10B981"],
    danger: ["#DC2626", "#EF4444"],
    warning: ["#D97706", "#F59E0B"],
    blue: ["#2563EB", "#3B82F6"],
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: COLORS.bg,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  userName: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: "800",
    marginTop: 2,
  },
  profileBtn: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  profileGradient: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileInitial: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "800",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 100,
  },

  // HERO CARD
  heroCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 36,
    color: "#fff",
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
  },
  heroGrowth: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "700",
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginVertical: 20,
  },
  heroBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  heroStat: {
    alignItems: "center",
  },
  heroStatLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
    marginBottom: 4,
  },
  heroStatValue: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "800",
  },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  // STATS GRID
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: (width - 52) / 2,
  },
  statCardInner: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: "800",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textDim,
    fontWeight: "600",
  },

  // SECTION
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: "800",
  },
  seeAll: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "700",
  },

  // PIPELINE
  pipelineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  pipelineCard: {
    width: (width - 52) / 2,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  pipelineTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  pipelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pipelineLabel: {
    fontSize: 13,
    color: COLORS.textDim,
    fontWeight: "700",
  },
  pipelineValue: {
    fontSize: 20,
    color: COLORS.text,
    fontWeight: "800",
    marginVertical: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
    marginVertical: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  pipelinePercentage: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "700",
  },

  // QUICK ACTIONS
  actionsContainer: {
    marginBottom: 24,
  },
  actionItem: {
    alignItems: "center",
    marginRight: 20,
    width: 70,
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  actionText: {
    fontSize: 11,
    color: COLORS.textDim,
    fontWeight: "700",
    textAlign: "center",
  },

  // ACTIVITY
  activityItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 1,
  },
  activityLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  activityAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  activityInitial: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "800",
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  activityDetail: {
    fontSize: 12,
    color: COLORS.textDim,
    fontWeight: "500",
  },
  activityBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  // EMPTY STATE
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "600",
    marginTop: 12,
  },

  // Logout Modal Styles
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
  logoutIconCircle: {
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
    color: COLORS.text,
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
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutConfirmBtn: {
    backgroundColor: COLORS.danger,
  },
  logoutCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textDim,
  },
  logoutConfirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

const menuStyles = StyleSheet.create({
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  menuContent: {
    width: "75%",
    backgroundColor: "#fff",
    height: "100%",
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: -5, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 15,
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
  profileInitial: {
    fontSize: 28,
    color: "#fff",
    fontWeight: "800",
  },
  profileName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  profileRole: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "600",
  },
  menuList: {
    padding: 15,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  menuItemText: {
    marginLeft: 15,
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
    marginHorizontal: 14,
  },
  logoSection: {
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
    color: COLORS.text,
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
    marginTop: 10,
  },
  businessInfoCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 15,
    marginHorizontal: 15,
    marginTop: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  businessInfoTitle: {
    fontSize: 12,
    color: COLORS.textDim,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  businessInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10,
  },
  businessInfoLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  businessInfoValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "700",
  },
});

// MenuItem Component (Refactored outside)
const MenuItem = ({ icon, label, onPress, color = COLORS.text }) => (
  <TouchableOpacity
    style={menuStyles.menuItem}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Ionicons name={icon} size={22} color={color} />
    <Text style={[menuStyles.menuItemText, { color }]}>{label}</Text>
  </TouchableOpacity>
);

// Side Menu Component (Refactored outside)
const SideMenu = ({ visible, onClose, navigation, user, onLogout }) => (
  <Modal
    animationType="slide"
    transparent={true}
    visible={visible}
    onRequestClose={onClose}
  >
    <TouchableOpacity
      style={menuStyles.menuOverlay}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={menuStyles.menuContent}
        onPress={(e) => e.stopPropagation()}
      >
        <LinearGradient
          colors={COLORS.gradients?.primary || ["#4F46E5", "#6366F1"]}
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
              <Text style={menuStyles.profileInitial}>
                {user && user.name ? user.name[0].toUpperCase() : "M"}
              </Text>
            )}
          </View>
          <Text style={menuStyles.profileName}>{user?.name || "Manager"}</Text>
          <Text style={menuStyles.profileRole}>
            {user?.email || "Sales Manager"}
          </Text>
        </LinearGradient>

        <ScrollView style={menuStyles.menuList}>
          <MenuItem
            icon="home-outline"
            label="Dashboard"
            onPress={() => {
              onClose();
              navigation.navigate("Home");
            }}
          />
          <MenuItem
            icon="person-circle-outline"
            label="Profile Settings"
            onPress={() => {
              onClose();
              navigation.navigate("ProfileScreen");
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
                navigation.navigate("LeadSourceScreen");
              }}
            />
          )}
          {user?.role !== "Staff" && (
            <MenuItem
              icon="pricetags-outline"
              label="Products"
              onPress={() => {
                onClose();
                navigation.navigate("ProductScreen");
              }}
            />
          )}
          {user?.role !== "Staff" && (
            <MenuItem
              icon="people-circle-outline"
              label="Staff Management"
              onPress={() => {
                onClose();
                navigation.navigate("StaffScreen");
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
            icon="chatbubble-ellipses-outline"
            label="Message Templates"
            onPress={() => {
              onClose();
              navigation.navigate("MessageTemplateScreen");
            }}
          />
          <MenuItem
            icon="settings-outline"
            label="Settings"
            onPress={() => {
              onClose();
              navigation.navigate("WhatsAppSettings");
            }}
          />

          {/* Divider */}
          <View style={menuStyles.divider} />

          <MenuItem
            icon="log-out-outline"
            label="Logout"
            color="#ef4444"
            onPress={onLogout}
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
      </TouchableOpacity>
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
        <View style={styles.logoutIconCircle}>
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

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const swipeHandlers = useSwipeNavigation("Home", navigation);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // [REMOVED DEBUG LOGS]

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
  const [todayTasks, setTodayTasks] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // WhatsApp Config State
  const [waConfig, setWaConfig] = useState(null);
  const [isEditingWa, setIsEditingWa] = useState(false);
  const [waEditStep, setWaEditStep] = useState(1); // 1: Select Method, 2: OTP, 3: New Token
  const [otpMethod, setOtpMethod] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [savingWa, setSavingWa] = useState(false);
  const [showWaModal, setShowWaModal] = useState(false);
  const [skipAnimations, setSkipAnimations] = useState(false);

  // Check whether home intro animations were already shown for this app (persist across launches)
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("homeIntroPlayed")
      .then((val) => {
        if (!mounted) return;
        if (val === "1") setSkipAnimations(true);
        else {
          setSkipAnimations(false);
          // mark as shown so next app open won't replay
          AsyncStorage.setItem("homeIntroPlayed", "1").catch(() => {});
        }
      })
      .catch(() => {
        if (mounted) setSkipAnimations(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Handle logout
  const handleLogout = () => {
    setShowMenu(false);
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
  };

  const fetchData = async () => {
    try {
      // Only show loader if we have no stats yet to prevent "full loading" on every return
      if (stats.totalEnquiry === 0) {
        setLoading(true);
      }
      const [data, waData] = await Promise.all([
        dashboardService.getDashboardSummary(),
        getApiClient().then((client) =>
          client.get("/whatsapp/config").catch(() => ({ data: null })),
        ),
      ]);

      if (waData?.data?.config) {
        setWaConfig(waData.data.config);
        setNewUrl(waData.data.config.apiUrl || "");
      }
      // [REMOVED DEBUG LOG]

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
    } catch (err) {
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
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Calculate conversion rate
  const conversionRate =
    stats.totalEnquiry > 0
      ? ((stats.conv / stats.totalEnquiry) * 100).toFixed(1)
      : 0;
  const monthlyGrowth = stats.monthlyRevenue > 0 ? "+12%" : "0%"; // Placeholder for growth calculation

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
      if (resp.data.success) {
        setWaEditStep(2); // Move to OTP input
      } else {
        Alert.alert("Error", resp.data.message || "Failed to send OTP");
      }
    } catch (e) {
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
        setWaEditStep(3); // Move to Token input
        setNewToken("");
      } else {
        Alert.alert("Invalid code", "Please enter the correct OTP.");
      }
    } catch (e) {
      Alert.alert("Error", "Verification failed.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSaveNewConfig = async () => {
    if (!newToken) {
      Alert.alert("Error", "Please enter a new token");
      return;
    }
    try {
      setSavingWa(true);
      const client = await getApiClient();
      const payload = {
        apiUrl: newUrl || "https://app-server.wati.io",
        apiToken: newToken.trim(),
        provider: "WATI",
      };
      const resp = await client.put("/whatsapp/config", payload);
      if (resp.data && resp.data.ok) {
        Alert.alert("Success", "WhatsApp Configuration Updated");
        setShowWaModal(false);
        setWaConfig({ ...waConfig, apiToken: newToken, apiUrl: newUrl });
        setNewToken("");
        setWaEditStep(1);
      } else {
        Alert.alert("Error", resp.data.message || "Could not save");
      }
    } catch (e) {
      Alert.alert("Error", "Save failed");
    } finally {
      setSavingWa(false);
    }
  };

  return (
    <View style={styles.container} {...swipeHandlers}>
      <LogoutConfirmModal
        visible={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
      />
      <SideMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        navigation={navigation}
        user={user}
        onLogout={handleLogout}
      />

      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* FLOATING HEADER */}
      <LinearGradient
        colors={[COLORS.bg || "#F8FAFC", COLORS.bg || "#F8FAFC"]}
        style={styles.header}
      >
        <SafeAreaView edges={["top"]}>
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => setShowMenu(true)}
            >
              <LinearGradient
                colors={COLORS.gradients?.purple || ["#8B5CF6", "#A78BFA"]}
                style={styles.profileGradient}
              >
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
                  <Text style={styles.profileInitial}>
                    {user && user.name ? user.name[0].toUpperCase() : "M"}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <View>
              <Text style={styles.greeting}>Welcome back 👋</Text>
              <Text style={styles.userName}>{user?.name || "Manager"}</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchData();
            }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* HERO REVENUE CARD */}
        <MotiView
          from={
            skipAnimations
              ? { opacity: 1, scale: 1, translateY: 0 }
              : { opacity: 0, scale: 0.9, translateY: 20 }
          }
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: "spring", damping: 15, delay: 100 }}
        >
          <LinearGradient
            colors={COLORS.gradients?.primary || ["#4F46E5", "#6366F1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Abstract patterns in background */}
            <View
              style={{
                position: "absolute",
                top: -20,
                right: -20,
                opacity: 0.1,
              }}
            >
              <Ionicons name="stats-chart" size={150} color="#fff" />
            </View>

            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>Overall Revenue</Text>
                <Text style={styles.heroValue}>
                  ₹{(stats.overallSalesAmount || 0).toLocaleString("en-IN")}
                </Text>
                <View style={styles.heroSubRow}>
                  <View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.2)",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MaterialCommunityIcons
                      name="trending-up"
                      size={14}
                      color="#fff"
                    />
                    <Text style={styles.heroGrowth}>{monthlyGrowth}</Text>
                  </View>
                  <Text
                    style={[
                      styles.heroGrowth,
                      { opacity: 0.7, fontWeight: "400" },
                    ]}
                  >
                    {" "}
                    vs last month
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroBottom}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>MTD Revenue</Text>
                <Text style={styles.heroStatValue}>
                  ₹{(stats.monthlyRevenue || 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.heroDot} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Units Converted</Text>
                <Text style={styles.heroStatValue}>{stats.conv}</Text>
              </View>
              <View style={styles.heroDot} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>CR %</Text>
                <Text style={styles.heroStatValue}>{conversionRate}%</Text>
              </View>
            </View>
          </LinearGradient>
        </MotiView>

        {/* QUICK STATS GRID */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="people"
            label="Total Leads"
            value={stats.totalEnquiry}
            gradient={COLORS.gradients.primary}
            delay={200}
            skipAnimations={skipAnimations}
            onPress={() => navigation.navigate("Enquiry")}
          />
          <StatCard
            icon="flash"
            label="New Today"
            value={stats.todayEnquiry}
            gradient={COLORS.gradients.blue}
            delay={250}
            skipAnimations={skipAnimations}
          />
          <StatCard
            icon="calendar"
            label="Follow-ups"
            value={stats.todayFollowup}
            gradient={COLORS.gradients.success}
            delay={300}
            skipAnimations={skipAnimations}
            onPress={() => navigation.navigate("FollowUp")}
          />
          <StatCard
            icon="close-circle"
            label="Dropped"
            value={stats.drops}
            gradient={COLORS.gradients.danger}
            delay={350}
            skipAnimations={skipAnimations}
          />
        </View>

        {/* PIPELINE OVERVIEW */}
        <MotiView
          from={
            skipAnimations
              ? { opacity: 1, translateY: 0 }
              : { opacity: 0, translateY: 20 }
          }
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 400 }}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pipeline Overview</Text>
            <TouchableOpacity>
              <Feather
                name="more-horizontal"
                size={20}
                color={COLORS.textDim}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.pipelineGrid}>
            <PipelineCard
              label="New Leads"
              value={stats.new}
              color="#667EEA"
              percentage={
                stats.totalEnquiry > 0
                  ? ((stats.new / stats.totalEnquiry) * 100).toFixed(0)
                  : 0
              }
            />
            <PipelineCard
              label="In Progress"
              value={stats.ip}
              color="#4ECDC4"
              percentage={
                stats.totalEnquiry > 0
                  ? ((stats.ip / stats.totalEnquiry) * 100).toFixed(0)
                  : 0
              }
            />
            <PipelineCard
              label="Converted"
              value={stats.conv}
              color="#00D9A3"
              percentage={
                stats.totalEnquiry > 0
                  ? ((stats.conv / stats.totalEnquiry) * 100).toFixed(0)
                  : 0
              }
            />
            <PipelineCard
              label="Lost"
              value={stats.drops}
              color="#FF5757"
              percentage={
                stats.totalEnquiry > 0
                  ? ((stats.drops / stats.totalEnquiry) * 100).toFixed(0)
                  : 0
              }
            />
          </View>
        </MotiView>

        {/* QUICK ACTIONS */}
        <MotiView
          from={
            skipAnimations
              ? { opacity: 1, translateX: 0 }
              : { opacity: 0, translateX: 20 }
          }
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ delay: 500 }}
          style={styles.actionsContainer}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <QuickAction
              icon="person-add"
              label="New Lead"
              color={COLORS.primary}
              onPress={() => navigation.navigate("Enquiry")}
            />
            <QuickAction
              icon="call"
              label="Auto Dialer"
              color={COLORS.secondary}
              onPress={() => navigation.navigate("AutoCallScreen")}
            />
            <QuickAction
              icon="calendar-number"
              label="Follow-ups"
              color={COLORS.accent}
              onPress={() => navigation.navigate("FollowUp")}
            />
            <QuickAction
              icon="document-text"
              label="Reports"
              color={COLORS.warning}
              onPress={() => navigation.navigate("Report")}
            />
            <QuickAction
              icon="chatbubble-working"
              label="WhatsApp"
              color="#25D366"
              onPress={() => navigation.navigate("WhatsAppChat")}
            />
          </ScrollView>
        </MotiView>

        {/* WHATSAPP CONFIG SECTION - PREMIUM DESIGN */}
        <MotiView
          from={
            skipAnimations
              ? { opacity: 1, scale: 1 }
              : { opacity: 0, scale: 0.95 }
          }
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 550 }}
          style={[styles.section, { marginBottom: 30 }]}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Business Integration</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setShowWaModal(true)}
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 20,
              borderWidth: 1,
              borderColor: COLORS.border,
              flexDirection: "row",
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 20,
                backgroundColor: "#E8F5E9",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="logo-whatsapp" size={32} color="#25D366" />
            </View>

            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text
                style={{ fontSize: 17, fontWeight: "800", color: COLORS.text }}
              >
                WhatsApp API
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: waConfig ? "#10B981" : "#F59E0B",
                    marginRight: 6,
                  }}
                />
                <Text
                  style={{
                    fontSize: 13,
                    color: COLORS.textDim,
                    fontWeight: "600",
                  }}
                >
                  {waConfig ? "Connected & Active" : "Configuration Needed"}
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: COLORS.primaryLight,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 14,
              }}
            >
              <Text
                style={{
                  color: COLORS.primary,
                  fontWeight: "800",
                  fontSize: 13,
                }}
              >
                Edit
              </Text>
            </View>
          </TouchableOpacity>
        </MotiView>

        {/* WhatsApp Config Modal */}
        <Modal
          visible={showWaModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowWaModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              justifyContent: "flex-end",
            }}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => setShowWaModal(false)}
            />
            <MotiView
              from={skipAnimations ? { translateY: 0 } : { translateY: 300 }}
              animate={{ translateY: 0 }}
              style={{
                backgroundColor: "#fff",
                borderTopLeftRadius: 32,
                borderTopRightRadius: 32,
                padding: 24,
                paddingBottom: Platform.OS === "ios" ? 40 : 24,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 4,
                  backgroundColor: COLORS.border,
                  alignSelf: "center",
                  borderRadius: 2,
                  marginBottom: 20,
                }}
              />

              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "900",
                  color: COLORS.text,
                  marginBottom: 8,
                }}
              >
                {waEditStep === 1
                  ? "Security Verification"
                  : waEditStep === 2
                    ? "Verify OTP"
                    : "Update Token"}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: COLORS.textDim,
                  marginBottom: 24,
                  lineHeight: 20,
                }}
              >
                {waEditStep === 1
                  ? "To protect your business integration, we need to verify your identity before you can see or edit the API token."
                  : waEditStep === 2
                    ? `Enter the 6-digit code sent via ${otpMethod}.`
                    : "You can now enter your new WhatsApp Business API token and URL."}
              </Text>

              {waEditStep === 1 && (
                <View style={{ gap: 12 }}>
                  <OtpMethodOption
                    icon="mail"
                    label="Mail"
                    sub="Send to registered email"
                    color="#4F46E5"
                    onPress={() => handleRequestOtp("Email")}
                    loading={sendingOtp && otpMethod === "Email"}
                  />
                  <OtpMethodOption
                    icon="chatbubble-ellipses"
                    label="Message"
                    sub="Send via SMS"
                    color="#00D9A3"
                    onPress={() => handleRequestOtp("SMS")}
                    loading={sendingOtp && otpMethod === "SMS"}
                  />
                  <OtpMethodOption
                    icon="logo-whatsapp"
                    label="WhatsApp"
                    sub="Send via WhatsApp"
                    color="#25D366"
                    onPress={() => handleRequestOtp("WhatsApp")}
                    loading={sendingOtp && otpMethod === "WhatsApp"}
                  />
                </View>
              )}

              {waEditStep === 2 && (
                <View>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.bg,
                      borderRadius: 16,
                      padding: 16,
                      fontSize: 24,
                      fontWeight: "800",
                      textAlign: "center",
                      letterSpacing: 10,
                      borderWidth: 2,
                      borderColor: COLORS.primary + "30",
                    }}
                    placeholder="000000"
                    keyboardType="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={handleVerifyOtp}
                    disabled={verifyingOtp || otpCode.length < 6}
                    style={{
                      backgroundColor: COLORS.primary,
                      borderRadius: 16,
                      padding: 16,
                      alignItems: "center",
                      marginTop: 20,
                      opacity: verifyingOtp || otpCode.length < 6 ? 0.6 : 1,
                    }}
                  >
                    {verifyingOtp ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        Verify & Continue
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWaEditStep(1)}
                    style={{ marginTop: 16, alignItems: "center" }}
                  >
                    <Text
                      style={{ color: COLORS.textMuted, fontWeight: "700" }}
                    >
                      Change Method
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {waEditStep === 3 && (
                <View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: COLORS.textDim,
                      marginBottom: 8,
                    }}
                  >
                    API URL
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.bg,
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                    placeholder="https://app-server.wati.io"
                    value={newUrl}
                    onChangeText={setNewUrl}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: COLORS.textDim,
                      marginBottom: 8,
                    }}
                  >
                    API Token
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: COLORS.bg,
                      borderRadius: 14,
                      padding: 14,
                      marginBottom: 24,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      minHeight: 100,
                    }}
                    placeholder="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    multiline
                    value={newToken}
                    onChangeText={setNewToken}
                  />
                  <TouchableOpacity
                    onPress={handleSaveNewConfig}
                    disabled={savingWa}
                    style={{
                      backgroundColor: COLORS.secondary,
                      borderRadius: 16,
                      padding: 16,
                      alignItems: "center",
                    }}
                  >
                    {savingWa ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "800",
                          fontSize: 16,
                        }}
                      >
                        Update Integration
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </MotiView>
          </View>
        </Modal>

        {/* RECENT ACTIVITY */}
        <MotiView
          from={
            skipAnimations
              ? { opacity: 1, translateY: 0 }
              : { opacity: 0, translateY: 20 }
          }
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 600 }}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today's Activity</Text>
            <TouchableOpacity onPress={() => navigation.navigate("FollowUp")}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          {todayTasks.length > 0 ? (
            todayTasks
              .slice(0, 3)
              .map((item, idx) => (
                <ActivityItem
                  key={idx}
                  item={item}
                  delay={700 + idx * 50}
                  skipAnimations={skipAnimations}
                />
              ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="calendar-check"
                size={48}
                color={COLORS.textMuted}
              />
              <Text style={styles.emptyText}>
                No activities scheduled for today
              </Text>
            </View>
          )}
        </MotiView>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// 📊 STAT CARD COMPONENT
const StatCard = ({
  icon,
  label,
  value,
  gradient,
  delay,
  onPress,
  skipAnimations = false,
}) => (
  <MotiView
    from={
      skipAnimations ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }
    }
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: "spring", damping: 15, delay }}
    style={styles.statCard}
  >
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.statCardInner}
    >
      <View
        style={[styles.statIconBox, { backgroundColor: gradient[0] + "15" }]}
      >
        <Ionicons name={icon} size={20} color={gradient[0]} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  </MotiView>
);

// 🎯 PIPELINE CARD COMPONENT
const PipelineCard = ({ label, value, color, percentage }) => (
  <View style={styles.pipelineCard}>
    <View style={styles.pipelineTop}>
      <View style={[styles.pipelineDot, { backgroundColor: color }]} />
      <Text style={styles.pipelineLabel}>{label}</Text>
    </View>
    <Text style={styles.pipelineValue}>{value}</Text>
    <View style={styles.progressBar}>
      <View
        style={[
          styles.progressFill,
          { width: `${percentage}%`, backgroundColor: color },
        ]}
      />
    </View>
    <Text style={styles.pipelinePercentage}>{percentage}%</Text>
  </View>
);

// 🚀 QUICK ACTION COMPONENT
const QuickAction = ({ icon, label, color, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={styles.actionItem}
    activeOpacity={0.7}
  >
    <View style={styles.actionIconCircle}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.actionText}>{label}</Text>
  </TouchableOpacity>
);

// 🛡️ OTP METHOD OPTION COMPONENT
const OtpMethodOption = ({ icon, label, sub, color, onPress, loading }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={loading}
    style={{
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderRadius: 18,
      backgroundColor: COLORS.bg,
      borderWidth: 1,
      borderColor: COLORS.border,
    }}
  >
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: color + "15",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <View style={{ flex: 1, marginLeft: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "800", color: COLORS.text }}>
        {label}
      </Text>
      <Text
        style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: "600" }}
      >
        {sub}
      </Text>
    </View>
    {loading ? (
      <ActivityIndicator size="small" color={color} />
    ) : (
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    )}
  </TouchableOpacity>
);

// 📋 ACTIVITY ITEM COMPONENT
const ActivityItem = ({ item, delay, skipAnimations = false }) => (
  <MotiView
    from={
      skipAnimations
        ? { opacity: 1, translateX: 0 }
        : { opacity: 0, translateX: -20 }
    }
    animate={{ opacity: 1, translateX: 0 }}
    transition={{ delay }}
  >
    <View style={styles.activityItem}>
      <View style={styles.activityLeft}>
        <LinearGradient
          colors={COLORS.gradients?.blue || ["#2563EB", "#3B82F6"]}
          style={styles.activityAvatar}
        >
          <Text style={styles.activityInitial}>
            {item.name ? item.name[0].toUpperCase() : "?"}
          </Text>
        </LinearGradient>
        <View style={styles.activityInfo}>
          <Text style={styles.activityName}>{item.name}</Text>
          <Text style={styles.activityDetail}>
            {item.type} • {item.time || "Scheduled"}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.activityBadge,
          { backgroundColor: COLORS.primary + "20" },
        ]}
      >
        <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
      </View>
    </View>
  </MotiView>
);
