import { useEffect } from "react";
import { StatusBar } from "react-native";
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
