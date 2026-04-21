import { useEffect } from "react";
import { Platform, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
    SafeAreaProvider,
    initialWindowMetrics,
} from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import "./src/firebaseConfig"; // Initialize Firebase first
import AppNavigator from "./src/navigation/AppNavigator";
import { API_URL } from "./src/services/apiConfig";
import AppAlertHost from "./src/components/AppAlertHost";
import SuspensionModal from "./src/components/SuspensionModal";
import backgroundSyncManager from "./src/services/backgroundSyncManager";
import callLogPermissions from "./src/utils/callLogPermissions";
import notificationService from "./src/services/notificationService";

// ─── Firebase Background Message Handler ────────────────────────────────────
// MUST be registered at module root level, BEFORE React mounts.
// Firebase opens a headless JS thread from this file when the app is killed
// or in the background. If setBackgroundMessageHandler is not called here,
// FCM background/killed notifications silently fail on Android.
//
// CRITICAL: This handler runs in a SEPARATE JS CONTEXT from the app.
// - Firebase automatically displays the notification via the system tray
// - The notification channel ID + sound come from the FCM message payload
// - We log here for debugging, but cannot show app-level UI
if (Platform.OS !== "web") {
    try {
        const messaging = require("@react-native-firebase/messaging").default;
        messaging().setBackgroundMessageHandler(async (remoteMessage) => {
            // ✅ Log background message receipt for debugging
            const data = remoteMessage?.data || {};
            const notif = remoteMessage?.notification || {};

            console.log(
                "[FCM] Background notification received (app killed/background):",
            );
            console.log(`  Title: ${notif.title || data.title || "N/A"}`);
            console.log(`  Body: ${notif.body || data.body || "N/A"}`);
            console.log(`  ChannelId: ${data.channelId || "default"}`);
            console.log(`  Type: ${data.type || "unknown"}`);
            console.log(`  MessageId: ${remoteMessage?.messageId || "N/A"}`);

            // ✅ Return true to indicate message was handled
            // (Doesn't prevent system tray display — notification already queued by OS)
            return true;
        });
    } catch (_e) {
        // Native module unavailable in Expo Go or web — safe to ignore.
        console.warn("[FCM] setBackgroundMessageHandler unavailable");
    }
}

console.log("🛠️ App booting with API:", API_URL);

export default function App() {
    useEffect(() => {
        // Initialize notification system early (creates Android channels, sets up handlers)
        // This happens before login so channels are ready for notifications
        const initNotifications = async () => {
            try {
                console.log(
                    "[App] Initializing notification system on startup...",
                );
                const result =
                    await notificationService.initializeNotifications();
                if (result) {
                    console.log("[App] ✅ Notification system initialized");

                    // Validate audio assets are loaded
                    const audioCheck =
                        notificationService.validateAudioAssets();
                    if (!audioCheck.success) {
                        console.warn(
                            "[App] ⚠️  Some audio assets missing:",
                            audioCheck.missingAssets,
                        );
                    } else {
                        console.log(
                            `[App] ✅ Audio assets validated: ${audioCheck.loadedAssets}/${audioCheck.totalAssets}`,
                        );
                    }
                } else {
                    console.warn(
                        "[App] ⚠️  Notification initialization incomplete",
                    );
                }
            } catch (err) {
                console.error("[App] Notification init error:", err?.message);
            }
        };

        // Initialize on mount
        initNotifications();
    }, []);
    useEffect(() => {
        // Initialize call log background sync (enterprise mode only)
        const initializeCallLogSync = async () => {
            try {
                // Check if enterprise mode is enabled
                if (!callLogPermissions.isEnterpriseMode()) {
                    console.log(
                        "[CallLog] Enterprise mode disabled, skipping sync setup",
                    );
                    return;
                }

                // Check if permissions are granted
                const hasPermission =
                    await callLogPermissions.hasCallLogPermission();
                if (!hasPermission) {
                    // Request permission if not already granted
                    const result =
                        await callLogPermissions.requestCallLogPermission();
                    if (!result.granted) {
                        console.log(
                            "[CallLog] Permission not granted:",
                            result.reason,
                        );
                        return;
                    }
                }

                // Setup background sync
                const success =
                    await backgroundSyncManager.setupBackgroundSync();
                if (success) {
                    console.log("[CallLog] Background sync initialized");
                } else {
                    console.warn(
                        "[CallLog] Failed to initialize background sync",
                    );
                }
            } catch (err) {
                console.error("[CallLog] Initialization error:", err);
            }
        };

        // Delay initialization slightly to ensure app is fully loaded
        const timer = setTimeout(() => {
            initializeCallLogSync();
        }, 1500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
            <SafeAreaProvider
                initialMetrics={initialWindowMetrics}
                style={{ backgroundColor: "#FFFFFF" }}>
                <AuthProvider>
                    <StatusBar
                        barStyle="dark-content"
                        backgroundColor="#ffffff"
                    />
                    <AppNavigator />
                    <AppAlertHost />
                    <SuspensionModal />
                </AuthProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
