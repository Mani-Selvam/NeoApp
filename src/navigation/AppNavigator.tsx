import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer, TabActions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, DeviceEventEmitter, Modal, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import AddEnquiryScreen from "../screens/AddEnquiryScreen";
import ForgotPasswordScreen from "../screens/Auth/ForgotPasswordScreen";
import LoginScreen from "../screens/Auth/LoginScreen";
import SignupScreen from "../screens/Auth/SignupScreen";
import AutoCallScreen from "../screens/AutoCallScreen";
import CallLogScreen from "../screens/CallLogScreen";
import EnquiryScreen from "../screens/EnquiryScreen";
import FollowUpScreen from "../screens/FollowUpScreen";
import Home from "../screens/HomeScreen";
import IntroScreen from "../screens/IntroScreen";
import LeadSourceScreen from "../screens/LeadSourceScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import ProductScreen from "../screens/ProductScreen";
import PricingScreen from "../screens/PricingScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import RazorpayCheckoutScreen from "../screens/RazorpayCheckoutScreen";
import PaymentSuccessScreen from "../screens/PaymentSuccessScreen";
import EnterpriseContactScreen from "../screens/EnterpriseContactScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SupportHelpScreen from "../screens/SupportHelpScreen";
import ReportScreen from "../screens/ReportScreen";
import StaffScreen from "../screens/StaffScreen";
import WhatsAppSettingsScreen from "../screens/WhatsAppSettingsScreen";
import TargetsScreen from "../screens/TargetsScreen";
import {
    startCallMonitoring,
    stopCallMonitoring,
} from "../services/CallMonitorService";
import * as followupService from "../services/followupService";
import notificationService from "../services/notificationService";
import { navigationRef } from "./navigationRef";

import ChatScreen from "../screens/ChatScreen";
import MessageTemplateScreen from "../screens/MessageTemplateScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ROUTE_NAMES = ["Home", "Enquiry", "FollowUp", "CallLog", "Report"];

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
  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        popToTopOnBlur: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={Home}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Enquiry"
        component={EnquiryStackNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="FollowUp"
        component={FollowUpScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="CallLog"
        component={CallLogScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="call-outline" color={color} size={size} />
          ),
          tabBarLabel: "Call Logs",
        }}
      />
      <Tab.Screen
        name="Report"
        component={ReportScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isLoggedIn, onboardingCompleted, isLoading, user, billingPlan, billingLoading } = useAuth();
  const tabHistoryRef = useRef<string[]>(["Home"]);
  const lastTabRef = useRef<string>("Home");
  const [incomingMatch, setIncomingMatch] = useState<any>(null);
  const notificationsInitRef = useRef<boolean>(false);
  const hourlySyncRef = useRef<boolean>(false);

  // Initialize Socket & Call Monitor when logged in
  useEffect(() => {
    if (isLoggedIn && user) {
      import("../services/socketService").then(({ initSocket }) => {
        initSocket(user.id || user._id);
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
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];

        await notificationService.scheduleHourlyFollowUpRemindersForToday(list, {
          endHour: 21,
          channelId: "followups",
        });
        await notificationService.scheduleTimeFollowUpRemindersForToday?.(list, {
          channelId: "followups",
          missedAfterMinutes: 20,
        });
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

    const callLogSub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
      Promise.resolve(notificationService.acknowledgeHourlyFollowUpReminders?.()).catch(() => {});
    });

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
    const sub = DeviceEventEmitter.addListener("INCOMING_CRM_MATCH", (payload) => {
      if (!payload?.details) return;
      setIncomingMatch(payload);
    });
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
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (isLoggedIn && billingLoading && !billingPlan) {
    return (
      <View
        style={{
          flex: 1,
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

        const history = tabHistoryRef.current.filter((name) => name !== currentTab);
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
              <Text style={{ marginTop: 4, color: "#64748B", fontWeight: "700" }}>
                Enquiry: {incomingMatch.details.enqNo}
              </Text>
            ) : null}
            {incomingMatch?.details?.status ? (
              <Text style={{ marginTop: 4, color: "#64748B", fontWeight: "700" }}>
                Status: {incomingMatch.details.status}
              </Text>
            ) : null}
            {incomingMatch?.phoneNumber ? (
              <Text style={{ marginTop: 8, color: "#0F172A", fontWeight: "800" }}>
                {incomingMatch.phoneNumber}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
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
                <Text style={{ fontWeight: "900", color: "#334155" }}>Dismiss</Text>
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
                <Text style={{ fontWeight: "900", color: "#fff" }}>Open Enquiries</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
        </Stack.Navigator>
      ) : !billingPlan ? (
        // Billing-only Stack (trial expired / no active plan)
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="PricingScreen"
        >
          <Stack.Screen name="PricingScreen" component={PricingScreen as any} />
          <Stack.Screen name="CheckoutScreen" component={CheckoutScreen as any} />
          <Stack.Screen name="RazorpayCheckoutScreen" component={RazorpayCheckoutScreen as any} />
          <Stack.Screen name="PaymentSuccessScreen" component={PaymentSuccessScreen as any} />
          <Stack.Screen name="EnterpriseContactScreen" component={EnterpriseContactScreen as any} />
          <Stack.Screen name="ProfileScreen" component={ProfileScreen as any} />
          <Stack.Screen name="SupportHelp" component={SupportHelpScreen as any} />
        </Stack.Navigator>
      ) : (
        // App Stack (logged in + active plan)
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="Main"
        >
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Screen name="LeadSourceScreen" component={LeadSourceScreen} />
          <Stack.Screen name="ProductScreen" component={ProductScreen} />
          <Stack.Screen name="StaffScreen" component={StaffScreen} />
          <Stack.Screen name="TargetsScreen" component={TargetsScreen as any} />
          <Stack.Screen
            name="MessageTemplateScreen"
            component={MessageTemplateScreen as any}
          />
          <Stack.Screen name="WhatsAppChat" component={ChatScreen as any} />
          <Stack.Screen
            name="WhatsAppSettings"
            component={WhatsAppSettingsScreen as any}
          />
          <Stack.Screen
            name="AutoCallScreen"
            component={AutoCallScreen as any}
          />
          <Stack.Screen name="ProfileScreen" component={ProfileScreen as any} />
          <Stack.Screen name="SupportHelp" component={SupportHelpScreen as any} />
          <Stack.Screen name="PricingScreen" component={PricingScreen as any} />
          <Stack.Screen name="CheckoutScreen" component={CheckoutScreen as any} />
          <Stack.Screen name="RazorpayCheckoutScreen" component={RazorpayCheckoutScreen as any} />
          <Stack.Screen name="PaymentSuccessScreen" component={PaymentSuccessScreen as any} />
          <Stack.Screen name="EnterpriseContactScreen" component={EnterpriseContactScreen as any} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
