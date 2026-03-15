import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import {
    startCallMonitoring,
    stopCallMonitoring,
} from "../services/CallMonitorService";
import notificationService from "../services/notificationService";
import { API_URL } from "../services/apiConfig";
import { clearApiClient } from "../services/apiClient";
import { clearAuthErrorHandler, setAuthErrorHandler } from "../services/authErrorBus";
import { getEffectivePlan } from "../services/userService";

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
    const [billingPlan, setBillingPlan] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [suspensionInfo, setSuspensionInfo] = useState({
        visible: false,
        companyStatus: "",
        reason: "",
        name: "",
        email: "",
        mobile: "",
        submitting: false,
        submitted: false,
        submitError: "",
    });

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

                try {
                    const cachedPlan = await AsyncStorage.getItem("billingPlan");
                    if (cachedPlan) {
                        setBillingPlan(JSON.parse(cachedPlan));
                    }
                } catch (e) {
                    // ignore cached plan parse issues
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

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("FORCE_LOGOUT", async (payload) => {
            if (!isLoggedIn) return;
            const companyStatus = payload?.companyStatus || "Suspended";
            const reason = payload?.reason || "Company is suspended";

            let cachedUser = user;
            if (!cachedUser) {
                try {
                    const raw = await AsyncStorage.getItem("user");
                    cachedUser = raw ? JSON.parse(raw) : null;
                } catch (e) {
                    cachedUser = null;
                }
            }

            setSuspensionInfo((prev) => ({
                ...prev,
                visible: true,
                companyStatus,
                reason,
                name: cachedUser?.name || "",
                email: cachedUser?.email || "",
                mobile: cachedUser?.mobile || "",
                submitted: false,
                submitError: "",
            }));

            await doLogout();
        });

        return () => {
            sub?.remove?.();
        };
    }, [isLoggedIn, user]);

    useEffect(() => {
        // Global auth error handler (e.g., company suspended => 403)
        setAuthErrorHandler(async ({ status, message, data } = {}) => {
            if (!isLoggedIn) return;
            if (status !== 401 && status !== 403) return;

            const code = data?.code;
            const text = String(message || "");
            if (
                code === "COMPANY_NOT_ACTIVE" ||
                code === "COMPANY_NOT_FOUND" ||
                text.toLowerCase().includes("company is suspended") ||
                text.toLowerCase().includes("invalid or expired token") ||
                text.toLowerCase().includes("account is inactive")
            ) {
                if (code === "COMPANY_NOT_ACTIVE" || text.toLowerCase().includes("company is suspended")) {
                    let cachedUser = user;
                    if (!cachedUser) {
                        try {
                            const raw = await AsyncStorage.getItem("user");
                            cachedUser = raw ? JSON.parse(raw) : null;
                        } catch (e) {
                            cachedUser = null;
                        }
                    }

                    setSuspensionInfo((prev) => ({
                        ...prev,
                        visible: true,
                        companyStatus: data?.companyStatus || "Suspended",
                        reason: text || "Company is suspended",
                        name: cachedUser?.name || "",
                        email: cachedUser?.email || "",
                        mobile: cachedUser?.mobile || "",
                        submitted: false,
                        submitError: "",
                    }));
                }
                await doLogout();
            }
        });

        return () => {
            clearAuthErrorHandler();
        };
    }, [isLoggedIn, user]);

    const refreshBillingPlan = async () => {
        try {
            setBillingLoading(true);
            const res = await getEffectivePlan();
            const nextPlan = res?.plan || null;
            setBillingPlan(nextPlan);
            if (nextPlan) {
                await AsyncStorage.setItem("billingPlan", JSON.stringify(nextPlan));
            } else {
                await AsyncStorage.removeItem("billingPlan");
            }
        } catch (e) {
            const status = e?.response?.status;
            // 404/402 => no active plan (trial expired or not purchased)
            if (status === 404 || status === 402 || status === 403) {
                setBillingPlan(null);
                await AsyncStorage.removeItem("billingPlan");
            }
        } finally {
            setBillingLoading(false);
        }
    };

    useEffect(() => {
        if (isLoggedIn) {
            refreshBillingPlan().catch(() => {});
        }
    }, [isLoggedIn]);

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
                    if (res.status === 401 || res.status === 403) {
                        await doLogout();
                        return;
                    }

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
        refreshBillingPlan().catch(() => {});
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
        await AsyncStorage.removeItem("billingPlan");
        clearApiClient();
        setUser(null);
        setUserStatus("Active");
        setBillingPlan(null);
        setIsLoggedIn(false);
        try {
            stopCallMonitoring();
        } catch (e) {
            // ignore if native modules are not present
        }
        try {
            await notificationService.cancelTodayFollowUpReminders?.();
        } catch (e) {
            // ignore notification cancellation issues
        }
    };

    const clearSuspension = () => {
        setSuspensionInfo((prev) => ({
            ...prev,
            visible: false,
            submitting: false,
            submitted: false,
            submitError: "",
        }));
    };

    const submitSuspensionReport = async (reportMessage) => {
        try {
            setSuspensionInfo((prev) => ({ ...prev, submitting: true, submitError: "" }));
            const payload = {
                name: suspensionInfo?.name || "",
                email: suspensionInfo?.email || "",
                mobile: suspensionInfo?.mobile || "",
                message: reportMessage,
                source: "mobile_suspended_modal",
            };

            const url = `${API_URL}/support/tickets`;
            console.log("[Support] Submitting ticket...", { url });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let res;
            try {
                res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeoutId);
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.warn("[Support] Ticket submit failed", {
                    status: res.status,
                    data,
                });
                if (res.status === 404) {
                    throw new Error(
                        "Support API not found on this server. Please restart/update backend or check API URL.",
                    );
                }
                throw new Error(data.message || data.error || `Failed to submit report (HTTP ${res.status})`);
            }

            console.log("[Support] Ticket submitted", { ticketId: data?.ticketId || data?.ticketID || null });
            setSuspensionInfo((prev) => ({ ...prev, submitted: true }));
            return true;
        } catch (e) {
            console.error("[Support] Ticket submit error:", e?.message || e);
            const msg =
                e?.name === "AbortError"
                    ? "Request timed out. Please check internet / server and try again."
                    : e?.message || "Failed to submit report";
            setSuspensionInfo((prev) => ({ ...prev, submitError: msg }));
            return false;
        } finally {
            setSuspensionInfo((prev) => ({ ...prev, submitting: false }));
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
                billingPlan,
                billingLoading,
                suspensionInfo,
                login,
                logout,
                updateUser,
                refreshBillingPlan,
                completeOnboarding,
                clearSuspension,
                submitSuspensionReport,
            }}>
            {children}
        </AuthContext.Provider>
    );
};
