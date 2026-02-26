import { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/contexts/AuthContext";
import "./src/firebaseConfig"; // Initialize Firebase first
import AppNavigator from "./src/navigation/AppNavigator";
import { API_URL } from "./src/services/apiConfig";

console.log("🛠️ App booting with API:", API_URL);

export default function App() {
    useEffect(() => {
        // Call monitoring moved to AppNavigator to start after login
    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AuthProvider>
                    <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
                    <AppNavigator />
                </AuthProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
