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

// ─── Firebase Background Message Handler ────────────────────────────────────
// MUST be registered at module root level, BEFORE React mounts.
// Firebase opens a headless JS thread from this file when the app is killed
// or in the background. If setBackgroundMessageHandler is not called here,
// FCM background/killed notifications silently fail on Android.
//
// The FCM payload already includes a `notification` object, so Android handles
// the system tray display automatically. We do NOT call expo-notifications here
// because it is unavailable in headless JS mode.
if (Platform.OS !== "web") {
    try {
        const messaging = require("@react-native-firebase/messaging").default;
        messaging().setBackgroundMessageHandler(async (_remoteMessage) => {
            // OS handles notification display via the FCM notification payload.
            // Custom sounds come from the Android notification channel (channelId).
        });
    } catch (_e) {
        // Native module unavailable in Expo Go or web — safe to ignore.
    }
}

console.log("🛠️ App booting with API:", API_URL);

export default function App() {
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
