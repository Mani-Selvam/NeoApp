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
import { onAppEvent, APP_EVENTS } from "./src/services/appEvents";

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
        // ── Notification system init ──────────────────────────────────────
        // NOTE: initializeNotifications() is already called by AppNavigator
        // on first login (guarded by notificationsInitRef). Calling it here
        // again causes duplicate channel-creation logs on every app launch.
        // The App.js startup only validates audio assets (light check).
        const initNotifications = async () => {
            try {
                const audioCheck = notificationService.validateAudioAssets?.();
                if (audioCheck && !audioCheck.success) {
                    console.warn(
                        "[App] ⚠️  Some audio assets missing:",
                        audioCheck.missingAssets,
                    );
                } else if (audioCheck) {
                    console.log(
                        `[App] ✅ Audio assets validated: ${audioCheck.loadedAssets}/${audioCheck.totalAssets}`,
                    );
                }
            } catch (err) {
                console.warn("[App] Audio asset check error:", err?.message);
            }
        };

        // ── Call log permission + background sync ─────────────────────────
        // Triggers the call-log permission dialog on first launch. Also
        // deferred until after the intro animation, and queued AFTER the
        // notification prompt so the two system dialogs never stack on top
        // of each other and obscure the intro.
        const initializeCallLogSync = async () => {
            try {
                if (!callLogPermissions.isEnterpriseMode()) {
                    console.log(
                        "[CallLog] Enterprise mode disabled, skipping sync setup",
                    );
                    return;
                }

                const hasPermission =
                    await callLogPermissions.hasCallLogPermission();
                if (!hasPermission) {
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

        // ── Run startup tasks AFTER the intro animation ───────────────────
        // Run notifications first; once that prompt is dismissed, run the
        // call-log permission flow. This avoids two stacked system dialogs
        // covering the intro screen.
        let didRun = false;
        const runStartupTasks = async () => {
            if (didRun) return;
            didRun = true;

            // Small grace period so the intro screen has fully unmounted
            // before the OS dialog appears.
            await new Promise((r) => setTimeout(r, 250));
            await initNotifications();
            await initializeCallLogSync();
        };

        const unsubscribe = onAppEvent(
            APP_EVENTS.INTRO_FINISHED,
            runStartupTasks,
        );

        // Safety fallback: if for some reason the intro screen never emits
        // the event (e.g. deep-link skips it), still run startup after 4s.
        const fallback = setTimeout(runStartupTasks, 4000);

        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
            clearTimeout(fallback);
        };
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
