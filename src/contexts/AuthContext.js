import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import {
    startCallMonitoring,
    stopCallMonitoring,
} from "../services/CallMonitorService";
import { API_URL } from "../services/apiConfig";

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [onboardingCompleted, setOnboardingCompleted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [userStatus, setUserStatus] = useState("Active");

    useEffect(() => {
        const checkStatus = async () => {
            const token = await AsyncStorage.getItem("token");
            if (token) {
                setIsLoggedIn(true);
                // Try to load cached user
                try {
                    const userData = await AsyncStorage.getItem("user");
                    if (userData) {
                        const parsed = JSON.parse(userData);
                        setUser(parsed);
                        setUserStatus(parsed.status || "Active");
                    }
                } catch (e) {
                    console.log("Failed to parse cached user", e);
                }
            }
            const onboarded = await AsyncStorage.getItem("onboardingCompleted");
            if (onboarded === "true") {
                setOnboardingCompleted(true);
            }
            setIsLoading(false);
        };
        checkStatus();
    }, []);

    // Poll user status periodically while logged in (every 60s)
    useEffect(() => {
        let id;
        if (isLoggedIn && user && user.id) {
            const poll = async () => {
                try {
                    const token = await AsyncStorage.getItem("token");
                    if (!token) return;
                    const res = await fetch(`${API_URL}/staff/${user.id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status && data.status !== userStatus) {
                            setUserStatus(data.status);
                            if (data.status === "Inactive") {
                                // Force logout
                                await doLogout();
                            }
                        }
                    }
                } catch (e) {
                    // ignore polling errors
                }
            };
            id = setInterval(poll, 60000);
            // run once immediately
            poll();
        }
        return () => {
            if (id) clearInterval(id);
        };
    }, [isLoggedIn, user, userStatus]);

    const login = async (token, userObj) => {
        if (token) await AsyncStorage.setItem("token", token);
        if (userObj) {
            await AsyncStorage.setItem("user", JSON.stringify(userObj));
            setUser(userObj);
            setUserStatus(userObj.status || "Active");
            try {
                startCallMonitoring(userObj).catch(() => {});
            } catch (e) {
                // ignore if native modules are not present (Expo Go)
            }
        }
        setIsLoggedIn(true);
    };

    const updateUser = async (updatedObj) => {
        const newUser = { ...user, ...updatedObj };
        await AsyncStorage.setItem("user", JSON.stringify(newUser));
        setUser(newUser);
        if (newUser.status) setUserStatus(newUser.status);
    };

    // internal logout used by polling
    const doLogout = async () => {
        await AsyncStorage.removeItem("token");
        await AsyncStorage.removeItem("user");
        setUser(null);
        setUserStatus("Active");
        setIsLoggedIn(false);
        try {
            stopCallMonitoring();
        } catch (e) {
            // ignore if native modules are not present
        }
    };

    const logout = async () => {
        try {
            const token = await AsyncStorage.getItem("token");
            if (token && token !== "demo-token-123") {
                try {
                    await fetch(`${API_URL}/auth/logout`, {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                    });
                } catch (apiError) {
                    // ignore server logout errors
                }
            }
        } catch (error) {
            console.log("Logout error:", error);
        } finally {
            await doLogout();
        }
    };

    const completeOnboarding = async () => {
        await AsyncStorage.setItem("onboardingCompleted", "true");
        setOnboardingCompleted(true);
    };

    return (
        <AuthContext.Provider
            value={{
                isLoggedIn,
                onboardingCompleted,
                isLoading,
                user,
                userStatus,
                login,
                logout,
                updateUser,
                completeOnboarding,
            }}>
            {children}
        </AuthContext.Provider>
    );
};
