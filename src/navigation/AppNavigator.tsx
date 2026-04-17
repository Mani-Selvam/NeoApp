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
    Alert,
    AppState,
    BackHandler,
    DeviceEventEmitter,
    Dimensions,
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
import TaskDashboardScreen from "../screens/TaskDashboardScreen";
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
import StaffPerformanceReportScreen from "../screens/StaffPerformanceReportScreen";
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
import notificationService, {
    getDevicePushToken,
    registerPushTokenWithServer,
} from "../services/notificationService";
import getApiClient from "../services/apiClient";
import { APP_EVENTS, onAppEvent } from "../services/appEvents";
import { cancelDebounceKey, debounceByKey } from "../services/debounce";
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

function CommunicationStackNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen
                name="CommunicationHome"
                component={CommunicationAccessScreen}
            />
            <Stack.Screen
                name="TaskDashboard"
                component={TaskDashboardAccessScreen}
            />
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
    const lastGoodBottomInsetRef = useRef(0);
    const lastGoodNavBarHeightRef = useRef(0);
    const [appActiveTick, setAppActiveTick] = useState(0);
    const [dimTick, setDimTick] = useState(0);
    const wentBackgroundRef = useRef(false);
    const resumeFixUntilRef = useRef(0);
    const resumeRecalcTimersRef = useRef<any[]>([]);

    // Some Android share/download flows (e.g. report CSV export) can temporarily
    // cause safe-area bottom inset to report `0` on return, which makes the tab
    // bar drop into the system navigation area. Keep the last known non-zero
    // bottom inset as a fallback.
    if (typeof insets?.bottom === "number" && insets.bottom > 0) {
        lastGoodBottomInsetRef.current = insets.bottom;
    }

    useEffect(() => {
        if (Platform.OS !== "android") return undefined;
        const sub = AppState.addEventListener("change", (next) => {
            if (next === "background" || next === "inactive") {
                wentBackgroundRef.current = true;
            }
            if (next === "active") {
                if (wentBackgroundRef.current) {
                    // After returning from external activities (Share/SAF),
                    // some devices briefly report bottom inset as 0.
                    resumeFixUntilRef.current = Date.now() + 4000;
                    wentBackgroundRef.current = false;
                }
                setAppActiveTick((t) => t + 1);

                // Force a couple of delayed recalculations because insets/window
                // sizes can update a bit later after the activity returns.
                try {
                    resumeRecalcTimersRef.current.forEach((id) =>
                        clearTimeout(id),
                    );
                    resumeRecalcTimersRef.current = [];
                    resumeRecalcTimersRef.current.push(
                        setTimeout(() => setAppActiveTick((t) => t + 1), 250),
                    );
                    resumeRecalcTimersRef.current.push(
                        setTimeout(() => setAppActiveTick((t) => t + 1), 1100),
                    );
                } catch (_e) {}
            }
        });
        return () => {
            try {
                resumeRecalcTimersRef.current.forEach((id) => clearTimeout(id));
                resumeRecalcTimersRef.current = [];
            } catch (_e) {}
            sub.remove();
        };
    }, []);

    useEffect(() => {
        if (Platform.OS !== "android") return undefined;
        const sub = Dimensions.addEventListener("change", () => {
            setDimTick((t) => t + 1);
        });
        return () => sub.remove();
    }, []);

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
            if (!hasPlanFeature(billingInfo?.plan, "team_chat")) {
                if (active) setChatBadgeCount(0);
                return;
            }
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
    }, [billingInfo?.plan]);

    useEffect(() => {
        if (!selfId) return undefined;

        const sub = DeviceEventEmitter.addListener(
            "COMMUNICATION_MESSAGE_CREATED",
            (payload: any) => {
                const receiverId = String(
                    payload?.receiverId?._id || payload?.receiverId || "",
                );
                const senderId = String(
                    payload?.senderId?._id || payload?.senderId || "",
                );
                if (receiverId !== selfId || senderId === selfId) return;
                if (currentTabRef.current === "Communication") return;
                setChatBadgeCount((prev) => prev + 1);
            },
        );

        return () => {
            sub.remove();
        };
    }, [selfId]);

    const currentInsetBottom = insets?.bottom || 0;
    const effectiveBottomInset =
        currentInsetBottom > 0
            ? currentInsetBottom
            : lastGoodBottomInsetRef.current || 0;

    // Extra Android fallback: sometimes after leaving to a system activity
    // (e.g. CSV download/share), `insets.bottom` becomes 0 even when a 3-button
    // nav bar is present. Use a conservative dimension-based estimate then.
    let navBarHeight = 0;
    if (Platform.OS === "android") {
        const window = Dimensions.get("window");
        const screen = Dimensions.get("screen");
        const raw = Math.max(0, (screen?.height || 0) - (window?.height || 0));
        // Treat >= 24 as a real 3-button navigation bar. Smaller values are
        // usually gesture indicator / transient and shouldn't move the tab bar.
        const clamped = raw >= 24 ? Math.min(raw, 56) : 0;
        if (clamped > 0) lastGoodNavBarHeightRef.current = clamped;
        navBarHeight = clamped || lastGoodNavBarHeightRef.current || 0;
    }

    // Force recompute on return from system activities.
    void appActiveTick;
    void dimTick;

    const isThreeButtonNav =
        Platform.OS === "android" &&
        (navBarHeight >= 24 || lastGoodNavBarHeightRef.current >= 24);

    // Gesture navigation: keep padding small/consistent.
    // 3-button navigation: ensure padding is enough to avoid overlap with system nav.
    let bottomPad = isThreeButtonNav
        ? Math.max(
              8,
              Math.min(
                  navBarHeight || lastGoodNavBarHeightRef.current || 0,
                  56,
              ),
          )
        : Math.max(8, Math.min(effectiveBottomInset || 0, 18));

    // Last-resort guard: right after returning from a system activity, if our computed
    // pad is still tiny AND we previously detected a nav bar height (3-button mode),
    // temporarily bump it so the tab bar doesn't overlap system navigation.
    if (
        isThreeButtonNav &&
        Date.now() < resumeFixUntilRef.current &&
        bottomPad < 24 &&
        (lastGoodNavBarHeightRef.current > 0 || navBarHeight > 0)
    ) {
        bottomPad = Math.max(
            bottomPad,
            Math.min(lastGoodNavBarHeightRef.current || navBarHeight, 56),
        );
    }

    const baseTabBarStyle = {
        height: 60 + bottomPad,
        paddingTop: 8,
        paddingBottom: bottomPad,
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
        tabBarBadge:
            badgeCount > 0 ? (badgeCount > 99 ? "99+" : badgeCount) : undefined,
        tabBarBadgeStyle: navStyles.badge,
        tabBarIcon: ({
            color,
            focused,
        }: {
            color: string;
            focused: boolean;
            size: number;
        }) => (
            <View
                style={[
                    navStyles.iconWrap,
                    focused && navStyles.iconWrapActive,
                ]}>
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
                showUpgradePrompt(
                    buildFeatureUpgradeMessage(featureKey, label),
                );
            }
        },
        focus: () => {
            currentTabRef.current = routeName;
            onFocus?.();
        },
    });
    const hiddenTabOptions = {
        tabBarButton: () => null,
        tabBarItemStyle: { display: "none" as const },
    };

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
            }}>
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
                component={CommunicationStackNavigator}
                options={getTabOptions(
                    "Task",
                    "chatbubbles-outline",
                    chatBadgeCount,
                )}
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
                listeners={buildLockedTabListeners(
                    "Report",
                    "reports",
                    "Reports",
                )}
            />
            <Tab.Screen
                name="LeadSourceScreen"
                component={LeadSourceAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="ProductScreen"
                component={ProductAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="StaffScreen"
                component={StaffAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="CommunicationScreen"
                component={CommunicationAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="TargetsScreen"
                component={TargetsAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="EmailScreen"
                component={EmailAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="EmailSettingsScreen"
                component={EmailSettingsAccessForTabs}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="MessageTemplateScreen"
                component={MessageTemplateAccessForTabs}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="WhatsAppChat"
                component={WhatsAppChatAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="WhatsAppSettings"
                component={WhatsAppSettingsAccessForTabs}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="ProfileScreen"
                component={ProfileScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="PublicLeadFormScreen"
                component={PublicLeadFormScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="AboutScreen"
                component={AboutScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="SupportHelp"
                component={SupportHelpScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="CallLog"
                component={CallLogAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="PricingScreen"
                component={PricingAccessForTabs}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="CheckoutScreen"
                component={CheckoutScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="RazorpayCheckoutScreen"
                component={RazorpayCheckoutScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="PaymentSuccessScreen"
                component={PaymentSuccessScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="EnterpriseContactScreen"
                component={EnterpriseContactScreen as any}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="ReportScreen"
                component={ReportAccessScreen}
                options={hiddenTabOptions}
            />
            <Tab.Screen
                name="StaffPerformanceReport"
                component={StaffPerformanceReportAccessScreen}
                options={hiddenTabOptions}
            />
        </Tab.Navigator>
    );
}

function StaffRestrictedScreen({
    navigation,
    title,
}: {
    navigation: any;
    title: string;
}) {
    return (
        <View style={guardStyles.root}>
            <View style={guardStyles.card}>
                <View style={guardStyles.iconWrap}>
                    <Ionicons
                        name="lock-closed-outline"
                        size={24}
                        color="#DC2626"
                    />
                </View>
                <Text style={guardStyles.title}>Access restricted</Text>
                <Text style={guardStyles.text}>
                    {title} is available only for admin users in this company.
                </Text>
                <TouchableOpacity
                    style={guardStyles.button}
                    onPress={() => navigation.navigate("Main")}>
                    <Text style={guardStyles.buttonText}>
                        Back To Dashboard
                    </Text>
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
                <View
                    style={[
                        guardStyles.iconWrap,
                        { backgroundColor: "#EFF6FF" },
                    ]}>
                    <Ionicons
                        name="lock-closed-outline"
                        size={24}
                        color="#2563EB"
                    />
                </View>
                <Text style={guardStyles.title}>{title} is locked</Text>
                <Text style={guardStyles.text}>{message}</Text>
                <TouchableOpacity
                    style={guardStyles.button}
                    onPress={() => navigation.navigate("PricingScreen")}>
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
            return (
                <StaffRestrictedScreen
                    {...props}
                    title={title || "This screen"}
                />
            );
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
const TaskDashboardAccessScreen = createPlanRestrictedScreen(
    TaskDashboardScreen as any,
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
const StaffPerformanceReportAccessScreen = createPlanRestrictedScreen(
    StaffPerformanceReportScreen as any,
    "reports",
    "Staff Performance",
);
const WhatsAppChatAccessScreen = createPlanRestrictedScreen(
    ChatScreen as any,
    "whatsapp",
    "WhatsApp",
);
const PricingStaffRestrictedScreen = makeStaffRestricted("Pricing");
const EmailSettingsStaffRestrictedScreen =
    makeStaffRestricted("Email Settings");
const MessageTemplateStaffRestrictedScreen = makeStaffRestricted("Templates");
const WhatsAppSettingsStaffRestrictedScreen =
    makeStaffRestricted("WhatsApp Settings");
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
const PricingAccessForTabs = (props: any) => {
    const { user } = useAuth();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const Component = isStaffUser
        ? PricingStaffRestrictedScreen
        : (PricingScreen as any);
    return <Component {...props} />;
};
const EmailSettingsAccessForTabs = (props: any) => {
    const { user } = useAuth();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const Component = isStaffUser
        ? EmailSettingsStaffRestrictedScreen
        : EmailSettingsPlanAccessScreen;
    return <Component {...props} />;
};
const MessageTemplateAccessForTabs = (props: any) => {
    const { user } = useAuth();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const Component = isStaffUser
        ? MessageTemplateStaffRestrictedScreen
        : MessageTemplatePlanAccessScreen;
    return <Component {...props} />;
};
const WhatsAppSettingsAccessForTabs = (props: any) => {
    const { user } = useAuth();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const Component = isStaffUser
        ? WhatsAppSettingsStaffRestrictedScreen
        : WhatsAppSettingsPlanAccessScreen;
    return <Component {...props} />;
};

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
    const tabHistoryRef = useRef<string[]>(["Home"]);
    const lastTabRef = useRef<string>("Home");
    const [incomingMatch, setIncomingMatch] = useState<any>(null);
    const openingIncomingRef = useRef(false);
    const notificationsInitRef = useRef<boolean>(false);
    const hourlySyncRef = useRef<boolean>(false);
    const hourlySyncPendingRef = useRef<boolean>(false);

    // Initialize Socket & Call Monitor when logged in
    useEffect(() => {
        if (isLoggedIn && user) {
            let cancelled = false;
            import("../services/socketService").then(
                ({ ensureSocketReady }) => {
                    if (cancelled) return;
                    ensureSocketReady({ timeoutMs: 60000 }).catch(() => {});
                },
            );
            // Start Call Monitoring with user's mobile context
            startCallMonitoring(user).catch((err) =>
                console.error("Call monitor init error:", err),
            );
            return () => {
                cancelled = true;
            };
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
            if (hourlySyncRef.current) {
                hourlySyncPendingRef.current = true;
                return;
            }
            hourlySyncRef.current = true;
            try {
                if (!notificationsInitRef.current) {
                    await notificationService.initializeNotifications();
                    notificationsInitRef.current = true;

                    // Register push token for closed-app notifications on app launch
                    try {
                        console.log(
                            "[AppNav] Registering push token on app launch...",
                        );
                        const pushToken = await getDevicePushToken();
                        if (pushToken) {
                            const registered =
                                await registerPushTokenWithServer(pushToken);
                            if (registered) {
                                console.log(
                                    "[AppNav] ✓ Push token registered on app launch - closed-app notifications enabled",
                                );
                            } else {
                                console.warn(
                                    "[AppNav] ⚠ Push token registration failed on app launch",
                                );
                            }
                        }
                    } catch (tokenError) {
                        console.error(
                            "[AppNav] ✗ Error registering push token on app launch:",
                            tokenError?.message,
                        );
                    }
                }

                const toIso = (d: Date) =>
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

                const todayIso = toIso(new Date());
                const now = new Date();
                const dateFrom = new Date(
                    now.getTime() - 2 * 24 * 60 * 60 * 1000,
                );
                const dateTo = new Date(
                    now.getTime() + 7 * 24 * 60 * 60 * 1000,
                );
                const dateFromIso = toIso(dateFrom);
                const dateToIso = toIso(dateTo);
                const [todayRes, missedRes, allRes]: any = await Promise.all([
                    followupService
                        .getFollowUps("Today", 1, 200, todayIso)
                        .catch(() => null),
                    followupService
                        .getFollowUps("Missed", 1, 200, todayIso)
                        .catch(() => null),
                    followupService
                        .getFollowUps("All", 1, 500, "", {
                            dateFrom: dateFromIso,
                            dateTo: dateToIso,
                        })
                        .catch(() => null),
                ]);
                const todayList = Array.isArray(todayRes?.data)
                    ? todayRes.data
                    : Array.isArray(todayRes)
                      ? todayRes
                      : [];
                const missedList = Array.isArray(missedRes?.data)
                    ? missedRes.data
                    : Array.isArray(missedRes)
                      ? missedRes
                      : [];
                const allList = Array.isArray(allRes?.data)
                    ? allRes.data
                    : Array.isArray(allRes)
                      ? allRes
                      : [];

                // Resilience: if "All" fails/returns empty, still schedule from
                // available Today/Missed payloads so time reminders don't stop.
                const combinedList = (() => {
                    const byId = new Map<string, any>();
                    for (const row of [
                        ...allList,
                        ...todayList,
                        ...missedList,
                    ]) {
                        const id = String(
                            row?._id ??
                                row?.id ??
                                `${row?.enqNo || ""}|${row?.nextFollowUpDate || row?.followUpDate || row?.date || ""}|${row?.time || row?.dueAt || ""}`,
                        ).trim();
                        if (!id) continue;
                        if (!byId.has(id)) byId.set(id, row);
                    }
                    return Array.from(byId.values());
                })();

                console.log("[AppNav] Follow-up sync counts", {
                    today: todayList.length,
                    missed: missedList.length,
                    all: allList.length,
                    combined: combinedList.length,
                });

                await notificationService.scheduleHourlyFollowUpRemindersForToday(
                    todayList,
                    {
                        endHour: 21,
                        channelId: "followups",
                    },
                );
                await notificationService.scheduleTimeFollowUpRemindersForToday?.(
                    combinedList,
                    {
                        channelId: "followups",
                        preRemindMinutes: 60,
                        preRemindEveryMinutes: 5,
                        missedFastMinutes: 60,
                        missedFastEveryMinutes: 5,
                        missedHourlyEveryMinutes: 30,
                        missedHourlyMaxHours: 12,
                        endHour: 21,
                        windowDays: 7,
                        missedLookbackDays: 2,
                        dueRepeatForMinutes: 0,
                    },
                );

                await notificationService.notifyMissedFollowUpsSummary?.(
                    missedList,
                );
            } catch (e) {
                console.warn("[Notifications] Hourly follow-up sync failed", e);
            } finally {
                hourlySyncRef.current = false;
                if (!disposed && hourlySyncPendingRef.current) {
                    hourlySyncPendingRef.current = false;
                    setTimeout(() => syncHourlyFollowUps(), 250);
                }
            }
        };

        syncHourlyFollowUps();

        const appStateSub = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                // App came to foreground - resync, reinitialize audio, and refresh push token
                syncHourlyFollowUps();
                // Periodically refresh push token to ensure it's valid for closed-app notifications
                (async () => {
                    try {
                        console.log(
                            "[AppNav] Refreshing push token on app foreground...",
                        );
                        const pushToken = await getDevicePushToken();
                        if (pushToken) {
                            const registered =
                                await registerPushTokenWithServer(pushToken);
                            if (registered) {
                                console.log("[AppNav] ✓ Push token refreshed");
                            }
                        }
                    } catch (error) {
                        console.error(
                            "[AppNav] ✗ Error refreshing push token:",
                            error?.message,
                        );
                    }
                })();
            } else if (state === "background" || state === "inactive") {
                // App going to background - reset audio mode so it's reconfigured on next foreground
                notificationService.resetAudioModeOnAppBackground?.();
            }
        });
        const periodicSync = setInterval(() => {
            syncHourlyFollowUps();
        }, 60 * 1000);

        // Periodic push token refresh (every 6 hours to ensure token validity)
        const pushTokenRefreshInterval = setInterval(
            () => {
                (async () => {
                    try {
                        console.log("[AppNav] Periodic push token refresh...");
                        const pushToken = await getDevicePushToken();
                        if (pushToken) {
                            const registered =
                                await registerPushTokenWithServer(pushToken);
                            if (registered) {
                                console.log(
                                    "[AppNav] ✓ Push token refreshed periodically",
                                );
                            }
                        }
                    } catch (error) {
                        console.error(
                            "[AppNav] ✗ Error in periodic push token refresh:",
                            error?.message,
                        );
                    }
                })();
            },
            6 * 60 * 60 * 1000,
        ); // 6 hours

        const callLogSub = DeviceEventEmitter.addListener(
            "CALL_LOG_CREATED",
            () => {
                Promise.resolve(
                    notificationService.acknowledgeHourlyFollowUpReminders?.(),
                ).catch(() => {});
            },
        );
        const followUpChangedSub = DeviceEventEmitter.addListener(
            "FOLLOWUP_CHANGED",
            (payload) => {
                const item = payload?.item || payload || {};
                const status = String(item?.status || "").toLowerCase();
                const action = String(payload?.action || "").toLowerCase();
                const followUpId = item?._id || item?.id;

                // FIX #15: Cancel notifications immediately when follow-up is deleted
                if (action === "delete" && followUpId) {
                    Promise.resolve(
                        notificationService.cancelNotificationsForFollowUpIds?.(
                            [followUpId],
                        ),
                    ).catch((err) => {
                        console.warn(
                            "[AppNav] Failed to cancel notifications for deleted follow-up:",
                            err,
                        );
                    });
                }

                // Cancel the "add next follow-up" prompt only when a new schedule is created (not when marking Completed).
                if (status === "scheduled") {
                    Promise.resolve(
                        notificationService.cancelNextFollowUpPromptForEnquiry?.(
                            {
                                enqId: item?.enqId,
                                enqNo: item?.enqNo,
                            },
                        ),
                    ).catch(() => {});
                }
                // Reschedule follow-up reminders with delay to allow server to process update.
                // Add 500ms delay to ensure server has persisted changes before client fetches.
                setTimeout(() => {
                    Promise.resolve(syncHourlyFollowUps()).catch((err) => {
                        console.warn(
                            "[AppNav] Failed to sync after follow-up change:",
                            err,
                        );
                    });
                }, 500);
            },
        );

        return () => {
            disposed = true;
            appStateSub?.remove?.();
            clearInterval(periodicSync);
            clearInterval(pushTokenRefreshInterval);
            callLogSub?.remove?.();
            followUpChangedSub?.remove?.();
        };
    }, [isLoggedIn, user]);

    // Setup global notification listener
    useEffect(() => {
        const subscription =
            notificationService.setupGlobalNotificationListener(navigationRef);
        console.log("[AppNav] Global notification listener set up");
        return () => {
            subscription && subscription.remove();
        };
    }, []);

    // Speak follow-up reminders while app is in foreground.
    useEffect(() => {
        const sub = notificationService.setupForegroundNotificationListener?.(
            (data) => {
                console.log("[AppNav] Foreground notification received:", data);
            },
        );
        return () => {
            sub?.remove?.();
        };
    }, []);

    useEffect(() => {
        if (!isLoggedIn) return undefined;
        const handler = (payload: any) => {
            if (!payload?.details) return;
            debounceByKey(
                "incoming-match",
                () => setIncomingMatch(payload),
                120,
            );
        };
        const unsub = onAppEvent(APP_EVENTS.INCOMING_CRM_MATCH, handler);
        return () => {
            cancelDebounceKey("incoming-match");
            unsub();
        };
    }, [isLoggedIn]);

    const resolveIncomingEnquiry = async (payload: any) => {
        const details = payload?.details || {};
        const enquiryId =
            details?.enquiryId || details?._id || details?.enqNo || "";
        if (!enquiryId) return null;
        const client = await getApiClient();
        const res = await client.get(`/enquiries/${enquiryId}`);
        return res.data;
    };

    const openIncomingEnquiry = async (mode: "open" | "note" | "followup") => {
        if (openingIncomingRef.current) return;
        const payload = incomingMatch;

        if (!payload?.details) {
            try {
                navigationRef.dispatch(TabActions.jumpTo("Enquiry"));
            } catch (_e) {}
            return;
        }

        openingIncomingRef.current = true;
        try {
            const enquiry = await resolveIncomingEnquiry(payload);
            if (!enquiry?._id) {
                navigationRef.dispatch(TabActions.jumpTo("Enquiry"));
                return;
            }

            if (mode === "open") {
                (navigationRef as any).navigate("Main", {
                    screen: "Enquiry",
                    params: { screen: "AddEnquiry", params: { enquiry } },
                });
                return;
            }

            (navigationRef as any).navigate("Main", {
                screen: "FollowUp",
                params: {
                    openComposer: true,
                    composerToken: Date.now(),
                    enquiry,
                    autoOpenForm: true,
                },
            });
        } catch (e: any) {
            Alert.alert(
                "Could not open enquiry",
                e?.message || "Please open Enquiry list and search by number.",
            );
            try {
                navigationRef.dispatch(TabActions.jumpTo("Enquiry"));
            } catch (_e) {}
        } finally {
            openingIncomingRef.current = false;
        }
    };

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
                }}>
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
                }}>
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
            }}>
            <Modal
                visible={Boolean(incomingMatch)}
                transparent
                animationType="fade"
                onRequestClose={() => setIncomingMatch(null)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setIncomingMatch(null)}
                    style={{
                        flex: 1,
                        backgroundColor: "rgba(10,15,30,0.40)",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 20,
                    }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            backgroundColor: "#fff",
                            borderRadius: 18,
                            padding: 16,
                        }}>
                        <Text
                            style={{
                                fontSize: 16,
                                fontWeight: "900",
                                color: "#0F172A",
                            }}>
                            Incoming call matched
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                color: "#475569",
                                fontWeight: "700",
                            }}>
                            {incomingMatch?.details?.name || "Enquiry"}
                        </Text>
                        {incomingMatch?.details?.product ? (
                            <Text
                                style={{
                                    marginTop: 4,
                                    color: "#64748B",
                                    fontWeight: "700",
                                }}>
                                Purpose: {incomingMatch.details.product}
                            </Text>
                        ) : null}
                        {incomingMatch?.details?.enqNo ? (
                            <Text
                                style={{
                                    marginTop: 4,
                                    color: "#64748B",
                                    fontWeight: "700",
                                }}>
                                Enquiry: {incomingMatch.details.enqNo}
                            </Text>
                        ) : null}
                        {incomingMatch?.details?.status ? (
                            <Text
                                style={{
                                    marginTop: 4,
                                    color: "#64748B",
                                    fontWeight: "700",
                                }}>
                                Status: {incomingMatch.details.status}
                            </Text>
                        ) : null}
                        {incomingMatch?.phoneNumber ? (
                            <Text
                                style={{
                                    marginTop: 8,
                                    color: "#0F172A",
                                    fontWeight: "800",
                                }}>
                                {incomingMatch.phoneNumber}
                            </Text>
                        ) : null}

                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 10,
                                marginTop: 14,
                                justifyContent: "flex-end",
                            }}>
                            <TouchableOpacity
                                onPress={() => setIncomingMatch(null)}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: "#E2E8F0",
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "900",
                                        color: "#334155",
                                    }}>
                                    Dismiss
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setIncomingMatch(null);
                                    openIncomingEnquiry("note");
                                }}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: "#E2E8F0",
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "900",
                                        color: "#0F172A",
                                    }}>
                                    Add Note
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setIncomingMatch(null);
                                    openIncomingEnquiry("followup");
                                }}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: "#E2E8F0",
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "900",
                                        color: "#0F172A",
                                    }}>
                                    Mark Followup
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    setIncomingMatch(null);
                                    openIncomingEnquiry("open");
                                }}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    backgroundColor: "#4F46E5",
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "900",
                                        color: "#fff",
                                    }}>
                                    Open Enquiry
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
                onRequestClose={dismissBillingPrompt}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={dismissBillingPrompt}
                    style={{
                        flex: 1,
                        backgroundColor: "rgba(10,15,30,0.45)",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 20,
                    }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 420,
                            backgroundColor: "#fff",
                            borderRadius: 18,
                            padding: 18,
                        }}>
                        <Text
                            style={{
                                fontSize: 17,
                                fontWeight: "900",
                                color: "#0F172A",
                            }}>
                            {billingPrompt?.title || "Upgrade required"}
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                color: "#475569",
                                lineHeight: 21,
                            }}>
                            {billingPrompt?.message ||
                                "Please upgrade your current plan to continue."}
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                justifyContent: "flex-end",
                                gap: 10,
                                marginTop: 18,
                            }}>
                            <TouchableOpacity
                                onPress={dismissBillingPrompt}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: "#E2E8F0",
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "900",
                                        color: "#334155",
                                    }}>
                                    Later
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    dismissBillingPrompt();
                                    if (!isStaffUser) {
                                        navigationRef.navigate("Main", {
                                            screen: "PricingScreen",
                                        } as never);
                                    }
                                }}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    backgroundColor: "#2563EB",
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "900",
                                        color: "#fff",
                                    }}>
                                    Upgrade
                                </Text>
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
                    }}>
                    <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() =>
                            navigationRef.navigate("Main", {
                                screen: "PricingScreen",
                            } as never)
                        }
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
                        }}>
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
                            }}>
                            <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                        <Text
                            style={{
                                color: "#fff",
                                fontWeight: "900",
                                fontSize: 13,
                            }}>
                            {billingAlert.title}
                        </Text>
                        <Text
                            style={{
                                color: "rgba(255,255,255,0.92)",
                                marginTop: 2,
                                fontSize: 12,
                            }}>
                            {billingAlert.message}
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            {!isLoggedIn ? (
                // Auth Stack
                <Stack.Navigator
                    screenOptions={{ headerShown: false }}
                    initialRouteName="Intro">
                    <Stack.Screen name="Intro" component={IntroScreen} />
                    <Stack.Screen
                        name="Onboarding"
                        component={OnboardingScreen}
                    />
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
                    initialRouteName="Main">
                    <Stack.Screen name="Main" component={MainTabNavigator} />
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
