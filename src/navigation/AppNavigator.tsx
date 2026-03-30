import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DefaultTheme,
  NavigationContainer,
  TabActions,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import AddEnquiryScreen from "../screens/AddEnquiryScreen";
import ForgotPasswordScreen from "../screens/Auth/ForgotPasswordScreen";
import LoginScreen from "../screens/Auth/LoginScreen";
import OtpVerificationScreen from "../screens/Auth/OtpVerificationScreen";
import SignupScreen from "../screens/Auth/SignupScreen";
import CallLogScreen from "../screens/CallLogScreen";
import CommunicationScreen from "../screens/CommunicationScreen";
import EnquiryScreen from "../screens/EnquiryScreen";
import FollowUpScreen from "../screens/FollowUpScreen";
import Home from "../screens/HomeScreen";
import IntroScreen from "../screens/IntroScreen";
import LeadSourceScreen from "../screens/LeadSourceScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import ProductScreen from "../screens/ProductScreen";
import PricingScreen from "../screens/PricingScreen";
import PublicLeadFormScreen from "../screens/PublicLeadFormScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import RazorpayCheckoutScreen from "../screens/RazorpayCheckoutScreen";
import PaymentSuccessScreen from "../screens/PaymentSuccessScreen";
import EnterpriseContactScreen from "../screens/EnterpriseContactScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AboutScreen from "../screens/AboutScreen";
import SupportHelpScreen from "../screens/SupportHelpScreen";
import ReportScreen from "../screens/ReportScreen";
import StaffScreen from "../screens/StaffScreen";
import WhatsAppSettingsScreen from "../screens/WhatsAppSettingsScreen";
import TargetsScreen from "../screens/TargetsScreen";
import EmailScreen from "../screens/EmailScreen";
import EmailSettingsScreen from "../screens/EmailSettingsScreen";
import {
  startCallMonitoring,
  stopCallMonitoring,
} from "../services/CallMonitorService";
import { getCommunicationThreads } from "../services/communicationService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import {
  buildFeatureUpgradeMessage,
  getFeatureLabel,
  hasPlanFeature,
} from "../utils/planFeatures";
import { navigationRef } from "./navigationRef";

import ChatScreen from "../screens/ChatScreen";
import MessageTemplateScreen from "../screens/MessageTemplateScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ROUTE_NAMES = [
  "Home",
  "Enquiry",
  "FollowUp",
  "Communication",
  "Report",
];
const APP_NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#FFFFFF",
    card: "#FFFFFF",
  },
};

const getMainRoute = (state: any) => {
  if (!state?.routes?.length) return null;
  return state.routes[state.index ?? 0] || null;
};

const getCurrentTabRoute = (state: any) => {
  const mainRoute = getMainRoute(state);
  const tabState = mainRoute?.state;
  if (!tabState?.routes?.length) return null;
  return tabState.routes[tabState.index ?? 0] || null;
};

// Enquiry Stack Navigator
function EnquiryStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EnquiryList" component={EnquiryScreen} />
      <Stack.Screen name="AddEnquiry" component={AddEnquiryScreen} />
    </Stack.Navigator>
  );
}

function MainTabNavigator() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const { user, billingInfo, showUpgradePrompt } = useAuth();
  const selfId = String(user?.id || user?._id || "");
  const currentTabRef = useRef("Home");
  const [chatBadgeCount, setChatBadgeCount] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;

    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadChatBadge = async () => {
      try {
        const threads = await getCommunicationThreads();
        if (!active) return;
        const unread = (Array.isArray(threads) ? threads : []).reduce(
          (sum, item) => sum + Number(item?.unreadCount || 0),
          0,
        );
        setChatBadgeCount(unread);
      } catch (_error) {}
    };
    loadChatBadge();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selfId) return undefined;

    const sub = DeviceEventEmitter.addListener(
      "COMMUNICATION_MESSAGE_CREATED",
      (payload: any) => {
        const receiverId = String(
          payload?.receiverId?._id || payload?.receiverId || "",
        );
        const senderId = String(payload?.senderId?._id || payload?.senderId || "");
        if (receiverId !== selfId || senderId === selfId) return;
        if (currentTabRef.current === "Communication") return;
        setChatBadgeCount((prev) => prev + 1);
      },
    );

    return () => {
      sub.remove();
    };
  }, [selfId]);

  const baseTabBarStyle = {
    height: 68 + Math.min(insets.bottom, 10),
    paddingTop: 8,
    paddingBottom: Math.max(insets.bottom, 8),
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5EAF3",
    backgroundColor: "#FCFDFE",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  };

  const getTabOptions = (
    label: string,
    iconName: React.ComponentProps<typeof Ionicons>["name"],
    badgeCount = 0,
  ) => ({
    tabBarLabel: label,
    tabBarLabelStyle: navStyles.tabLabel,
    tabBarItemStyle: navStyles.tabItem,
    tabBarBadge: badgeCount > 0 ? (badgeCount > 99 ? "99+" : badgeCount) : undefined,
    tabBarBadgeStyle: navStyles.badge,
    tabBarIcon: ({
      color,
      focused,
    }: {
      color: string;
      focused: boolean;
      size: number;
    }) => (
      <View style={[navStyles.iconWrap, focused && navStyles.iconWrapActive]}>
        <Ionicons
          name={iconName}
          color={focused ? "#2563EB" : color}
          size={focused ? 21 : 20}
        />
      </View>
    ),
  });

  const buildLockedTabListeners = (
    routeName: string,
    featureKey: string,
    label: string,
    onFocus?: () => void,
  ) => ({
    tabPress: (e: any) => {
      if (!hasPlanFeature(billingInfo?.plan, featureKey)) {
        e.preventDefault();
        showUpgradePrompt(buildFeatureUpgradeMessage(featureKey, label));
      }
    },
    focus: () => {
      currentTabRef.current = routeName;
      onFocus?.();
    },
  });

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        popToTopOnBlur: false,
        tabBarHideOnKeyboard: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#64748B",
        tabBarAllowFontScaling: false,
        tabBarStyle: keyboardVisible
          ? { display: "none" }
          : baseTabBarStyle,
      }}
    >
      <Tab.Screen
        name="Home"
        component={Home}
        options={getTabOptions("Home", "home-outline")}
        listeners={{
          focus: () => {
            currentTabRef.current = "Home";
          },
        }}
      />
      <Tab.Screen
        name="Enquiry"
        component={EnquiryStackNavigator}
        options={getTabOptions("Enquiry", "help-circle-outline")}
        listeners={{
          focus: () => {
            currentTabRef.current = "Enquiry";
          },
        }}
      />
      <Tab.Screen
        name="FollowUp"
        component={FollowUpScreen}
        options={getTabOptions("FollowUp", "calendar-outline")}
        listeners={{
          focus: () => {
            currentTabRef.current = "FollowUp";
          },
        }}
      />
      <Tab.Screen
        name="Communication"
        component={CommunicationScreen}
        options={getTabOptions("Task", "chatbubbles-outline", chatBadgeCount)}
        listeners={buildLockedTabListeners(
          "Communication",
          "team_chat",
          "Team Chat",
          () => setChatBadgeCount(0),
        )}
      />
      <Tab.Screen
        name="Report"
        component={ReportScreen}
        options={getTabOptions("Report", "bar-chart-outline")}
        listeners={buildLockedTabListeners("Report", "reports", "Reports")}
      />
    </Tab.Navigator>
  );
}

function StaffRestrictedScreen({ navigation, title }: { navigation: any; title: string }) {
  return (
    <View style={guardStyles.root}>
      <View style={guardStyles.card}>
        <View style={guardStyles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={24} color="#DC2626" />
        </View>
        <Text style={guardStyles.title}>Access restricted</Text>
        <Text style={guardStyles.text}>
          {title} is available only for admin users in this company.
        </Text>
        <TouchableOpacity
          style={guardStyles.button}
          onPress={() => navigation.navigate("Main")}
        >
          <Text style={guardStyles.buttonText}>Back To Dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PlanRestrictedScreen({
  navigation,
  title,
  message,
}: {
  navigation: any;
  title: string;
  message: string;
}) {
  return (
    <View style={guardStyles.root}>
      <View style={guardStyles.card}>
        <View style={[guardStyles.iconWrap, { backgroundColor: "#EFF6FF" }]}>
          <Ionicons name="lock-closed-outline" size={24} color="#2563EB" />
        </View>
        <Text style={guardStyles.title}>{title} is locked</Text>
        <Text style={guardStyles.text}>{message}</Text>
        <TouchableOpacity
          style={guardStyles.button}
          onPress={() => navigation.navigate("PricingScreen")}
        >
          <Text style={guardStyles.buttonText}>View Plans</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStaffRestricted(title: string) {
  return function RestrictedScreen(props: any) {
    return <StaffRestrictedScreen {...props} title={title} />;
  };
}

function createPlanRestrictedScreen(
  Component: any,
  featureKey: string,
  title?: string,
) {
  return function RestrictedScreen(props: any) {
    const { billingInfo } = useAuth();
    if (!hasPlanFeature(billingInfo?.plan, featureKey)) {
      return (
        <PlanRestrictedScreen
          {...props}
          title={title || getFeatureLabel(featureKey)}
          message={buildFeatureUpgradeMessage(featureKey, title)}
        />
      );
    }
    return <Component {...props} />;
  };
}

function createAdminPlanRestrictedScreen(
  Component: any,
  featureKey: string,
  title?: string,
) {
  return function RestrictedScreen(props: any) {
    const { billingInfo, user } = useAuth();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    if (!hasPlanFeature(billingInfo?.plan, featureKey)) {
      return (
        <PlanRestrictedScreen
          {...props}
          title={title || getFeatureLabel(featureKey)}
          message={buildFeatureUpgradeMessage(featureKey, title)}
        />
      );
    }
    if (isStaffUser) {
      return <StaffRestrictedScreen {...props} title={title || "This screen"} />;
    }
    return <Component {...props} />;
  };
}

const LeadSourceAccessScreen = createPlanRestrictedScreen(
  LeadSourceScreen as any,
  "lead_sources",
  "Lead Sources",
);
const ProductAccessScreen = createPlanRestrictedScreen(
  ProductScreen as any,
  "products",
  "Products",
);
const StaffAccessScreen = createAdminPlanRestrictedScreen(
  StaffScreen as any,
  "staff_management",
  "Admin / Staff",
);
const CommunicationAccessScreen = createPlanRestrictedScreen(
  CommunicationScreen as any,
  "team_chat",
  "Team Chat",
);
const TargetsAccessScreen = createPlanRestrictedScreen(
  TargetsScreen as any,
  "targets",
  "Targets",
);
const EmailAccessScreen = createPlanRestrictedScreen(
  EmailScreen as any,
  "email",
  "Email",
);
const CallLogAccessScreen = createPlanRestrictedScreen(
  CallLogScreen as any,
  "call_logs",
  "Calls",
);
const ReportAccessScreen = createPlanRestrictedScreen(
  ReportScreen as any,
  "reports",
  "Reports",
);
const WhatsAppChatAccessScreen = createPlanRestrictedScreen(
  ChatScreen as any,
  "whatsapp",
  "WhatsApp",
);
const PricingStaffRestrictedScreen = makeStaffRestricted("Pricing");
const EmailSettingsStaffRestrictedScreen = makeStaffRestricted("Email Settings");
const MessageTemplateStaffRestrictedScreen = makeStaffRestricted("Templates");
const WhatsAppSettingsStaffRestrictedScreen = makeStaffRestricted(
  "WhatsApp Settings",
);
const EmailSettingsPlanAccessScreen = createPlanRestrictedScreen(
  EmailSettingsScreen as any,
  "email",
  "Email Settings",
);
const MessageTemplatePlanAccessScreen = createPlanRestrictedScreen(
  MessageTemplateScreen as any,
  "whatsapp",
  "Templates",
);
const WhatsAppSettingsPlanAccessScreen = createPlanRestrictedScreen(
  WhatsAppSettingsScreen as any,
  "whatsapp",
  "WhatsApp Settings",
);

export default function AppNavigator() {
  const {
    isLoggedIn,
    onboardingCompleted,
    isLoading,
    user,
    billingPlan,
    billingInfo,
    billingLoading,
    billingAlert,
    billingPrompt,
    dismissBillingPrompt,
    dismissBillingAlert,
  } = useAuth();
  const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
  const PricingAccessScreen = isStaffUser
    ? PricingStaffRestrictedScreen
    : (PricingScreen as any);
  const EmailSettingsAccessScreen = isStaffUser
    ? EmailSettingsStaffRestrictedScreen
    : EmailSettingsPlanAccessScreen;
  const MessageTemplateAccessScreen = isStaffUser
    ? MessageTemplateStaffRestrictedScreen
    : MessageTemplatePlanAccessScreen;
  const WhatsAppSettingsAccessScreen = isStaffUser
    ? WhatsAppSettingsStaffRestrictedScreen
    : WhatsAppSettingsPlanAccessScreen;
  const tabHistoryRef = useRef<string[]>(["Home"]);
  const lastTabRef = useRef<string>("Home");
  const [incomingMatch, setIncomingMatch] = useState<any>(null);
  const notificationsInitRef = useRef<boolean>(false);
  const hourlySyncRef = useRef<boolean>(false);

  // Initialize Socket & Call Monitor when logged in
  useEffect(() => {
    if (isLoggedIn && user) {
      import("../services/socketService").then(({ initSocket }) => {
        initSocket();
      });
      // Start Call Monitoring with user's mobile context
      startCallMonitoring(user).catch((err) =>
        console.error("Call monitor init error:", err),
      );
    } else {
      import("../services/socketService").then(({ disconnectSocket }) => {
        disconnectSocket();
      });
      stopCallMonitoring();
    }
  }, [isLoggedIn, user]);

  // Initialize local notifications + schedule hourly follow-up reminders
  useEffect(() => {
    if (!isLoggedIn || !user) return undefined;

    let disposed = false;

    const syncHourlyFollowUps = async () => {
      if (disposed) return;
      if (hourlySyncRef.current) return;
      hourlySyncRef.current = true;
      try {
        if (!notificationsInitRef.current) {
          await notificationService.initializeNotifications();
          notificationsInitRef.current = true;
        }

        const res: any = await followupService.getFollowUps("Today", 1, 200);
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res)
            ? res
            : [];

        await notificationService.scheduleHourlyFollowUpRemindersForToday(
          list,
          {
            endHour: 21,
            channelId: "followups",
          },
        );
        await notificationService.scheduleTimeFollowUpRemindersForToday?.(
          list,
          {
            channelId: "followups",
            missedAfterMinutes: 20,
          },
        );
      } catch (e) {
        console.warn("[Notifications] Hourly follow-up sync failed", e);
      } finally {
        hourlySyncRef.current = false;
      }
    };

    syncHourlyFollowUps();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") syncHourlyFollowUps();
    });

    const callLogSub = DeviceEventEmitter.addListener(
      "CALL_LOG_CREATED",
      () => {
        Promise.resolve(
          notificationService.acknowledgeHourlyFollowUpReminders?.(),
        ).catch(() => {});
      },
    );

    return () => {
      disposed = true;
      appStateSub?.remove?.();
      callLogSub?.remove?.();
    };
  }, [isLoggedIn, user]);

  // Setup global notification listener
  useEffect(() => {
    const subscription =
      notificationService.setupGlobalNotificationListener(navigationRef);
    return () => {
      subscription && subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    const sub = DeviceEventEmitter.addListener(
      "INCOMING_CRM_MATCH",
      (payload) => {
        if (!payload?.details) return;
        setIncomingMatch(payload);
      },
    );
    return () => sub.remove();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    const onBackPress = () => {
      const rootState = navigationRef.getRootState();
      const mainRoute = getMainRoute(rootState);

      if (mainRoute?.name !== "Main") {
        return false;
      }

      const currentTabRoute = getCurrentTabRoute(rootState);
      if (!currentTabRoute?.name) {
        return false;
      }

      if ((currentTabRoute.state?.index ?? 0) > 0) {
        return false;
      }

      const history = tabHistoryRef.current;
      if (history.length <= 1) {
        return false;
      }

      const previousTab = history[history.length - 2];
      tabHistoryRef.current = history.slice(0, -1);
      lastTabRef.current = previousTab;
      navigationRef.dispatch(TabActions.jumpTo(previousTab));
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress,
    );

    return () => subscription.remove();
  }, [isLoggedIn]);

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#FFFFFF",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (isLoggedIn && billingLoading && !billingPlan && !billingInfo?.reason) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#FFFFFF",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={APP_NAV_THEME}
      onStateChange={(state) => {
        const mainRoute = getMainRoute(state);
        if (mainRoute?.name !== "Main") {
          return;
        }

        const currentTabRoute = getCurrentTabRoute(state);
        const currentTab = currentTabRoute?.name;

        if (!currentTab || !TAB_ROUTE_NAMES.includes(currentTab)) {
          return;
        }

        if (lastTabRef.current === currentTab) {
          return;
        }

        const history = tabHistoryRef.current.filter(
          (name) => name !== currentTab,
        );
        tabHistoryRef.current = [...history, currentTab];
        lastTabRef.current = currentTab;
      }}
    >
      <Modal
        visible={Boolean(incomingMatch)}
        transparent
        animationType="fade"
        onRequestClose={() => setIncomingMatch(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setIncomingMatch(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(10,15,30,0.40)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: "#fff",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#0F172A" }}>
              Incoming call matched
            </Text>
            <Text style={{ marginTop: 8, color: "#475569", fontWeight: "700" }}>
              {incomingMatch?.details?.name || "Enquiry"}
            </Text>
            {incomingMatch?.details?.enqNo ? (
              <Text
                style={{ marginTop: 4, color: "#64748B", fontWeight: "700" }}
              >
                Enquiry: {incomingMatch.details.enqNo}
              </Text>
            ) : null}
            {incomingMatch?.details?.status ? (
              <Text
                style={{ marginTop: 4, color: "#64748B", fontWeight: "700" }}
              >
                Status: {incomingMatch.details.status}
              </Text>
            ) : null}
            {incomingMatch?.phoneNumber ? (
              <Text
                style={{ marginTop: 8, color: "#0F172A", fontWeight: "800" }}
              >
                {incomingMatch.phoneNumber}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setIncomingMatch(null)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <Text style={{ fontWeight: "900", color: "#334155" }}>
                  Dismiss
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIncomingMatch(null);
                  try {
                    navigationRef.dispatch(TabActions.jumpTo("Enquiry"));
                  } catch (_e) {}
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: "#4F46E5",
                }}
              >
                <Text style={{ fontWeight: "900", color: "#fff" }}>
                  Open Enquiries
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={Boolean(billingPrompt?.visible)}
        transparent
        animationType="fade"
        onRequestClose={dismissBillingPrompt}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={dismissBillingPrompt}
          style={{
            flex: 1,
            backgroundColor: "rgba(10,15,30,0.45)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: "#fff",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "900", color: "#0F172A" }}>
              {billingPrompt?.title || "Upgrade required"}
            </Text>
            <Text style={{ marginTop: 8, color: "#475569", lineHeight: 21 }}>
              {billingPrompt?.message || "Please upgrade your current plan to continue."}
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 18,
              }}
            >
              <TouchableOpacity
                onPress={dismissBillingPrompt}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <Text style={{ fontWeight: "900", color: "#334155" }}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  dismissBillingPrompt();
                  if (!isStaffUser) {
                    navigationRef.navigate("PricingScreen" as never);
                  }
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  backgroundColor: "#2563EB",
                }}
              >
                <Text style={{ fontWeight: "900", color: "#fff" }}>Upgrade</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {isLoggedIn && billingAlert && !billingPrompt?.visible ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            paddingHorizontal: 14,
            paddingTop: Platform.OS === "android" ? 42 : 54,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => navigationRef.navigate("PricingScreen" as never)}
            style={{
              backgroundColor:
                billingAlert.level === "expired"
                  ? "#7F1D1D"
                  : billingAlert.level === "warning"
                    ? "#92400E"
                    : "#1D4ED8",
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            }}
          >
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                dismissBillingAlert?.();
              }}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.18)",
              }}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
              {billingAlert.title}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.92)", marginTop: 2, fontSize: 12 }}>
              {billingAlert.message}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!isLoggedIn ? (
        // Auth Stack
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="Intro"
        >
          <Stack.Screen name="Intro" component={IntroScreen} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen
            name="OtpVerification"
            component={OtpVerificationScreen}
          />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
        </Stack.Navigator>
      ) : (
        // App Stack (logged in + active plan)
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="Main"
        >
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen name="LeadSourceScreen" component={LeadSourceAccessScreen} />
          <Stack.Screen name="ProductScreen" component={ProductAccessScreen} />
          <Stack.Screen name="StaffScreen" component={StaffAccessScreen} />
          <Stack.Screen
            name="CommunicationScreen"
            component={CommunicationAccessScreen}
          />
          <Stack.Screen name="TargetsScreen" component={TargetsAccessScreen} />
          <Stack.Screen name="EmailScreen" component={EmailAccessScreen} />
          <Stack.Screen
            name="EmailSettingsScreen"
            component={EmailSettingsAccessScreen}
          />
          <Stack.Screen
            name="MessageTemplateScreen"
            component={MessageTemplateAccessScreen}
          />
          <Stack.Screen name="WhatsAppChat" component={WhatsAppChatAccessScreen} />
          <Stack.Screen
            name="WhatsAppSettings"
            component={WhatsAppSettingsAccessScreen}
          />
          <Stack.Screen name="ProfileScreen" component={ProfileScreen as any} />
          <Stack.Screen
            name="PublicLeadFormScreen"
            component={PublicLeadFormScreen as any}
          />
          <Stack.Screen name="AboutScreen" component={AboutScreen as any} />
          <Stack.Screen
            name="SupportHelp"
            component={SupportHelpScreen as any}
          />
          <Stack.Screen name="CallLog" component={CallLogAccessScreen} />
          <Stack.Screen name="PricingScreen" component={PricingAccessScreen} />
          <Stack.Screen
            name="CheckoutScreen"
            component={CheckoutScreen as any}
          />
          <Stack.Screen
            name="RazorpayCheckoutScreen"
            component={RazorpayCheckoutScreen as any}
          />
          <Stack.Screen
            name="PaymentSuccessScreen"
            component={PaymentSuccessScreen as any}
          />
          <Stack.Screen
            name="EnterpriseContactScreen"
            component={EnterpriseContactScreen as any}
          />
          <Stack.Screen name="ReportScreen" component={ReportAccessScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

const guardStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
  },
  text: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
  },
  button: {
    marginTop: 18,
    backgroundColor: "#2563EB",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});

const navStyles = StyleSheet.create({
  tabItem: {
    paddingHorizontal: 0,
    paddingTop: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 0,
    letterSpacing: 0.1,
  },
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "#EAF2FF",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
    top: 4,
  },
});
