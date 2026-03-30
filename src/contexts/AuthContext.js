import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import {
    stopCallMonitoring,
} from "../services/CallMonitorService";
import notificationService, {
    showBillingPlanNotification,
} from "../services/notificationService";
import { API_URL } from "../services/apiConfig";
import { clearApiClient } from "../services/apiClient";
import { clearAuthErrorHandler, setAuthErrorHandler } from "../services/authErrorBus";
import { deleteAuthToken, getAuthToken, setAuthToken } from "../services/secureTokenStorage";
import { getEffectivePlan } from "../services/userService";

const AuthContext = createContext();
const BILLING_INFO_KEY = "billingInfo";
const BILLING_ALERT_KEY_PREFIX = "billingAlert";
const BILLING_ALERT_SNOOZE_MINUTES = 10;

const normalizeBillingInfo = (payload, fallbackReason = "") => {
    const plan = payload?.plan || null;
    const subscription = payload?.subscription || null;
    const expiry =
        subscription?.endDate ||
        subscription?.effectiveEndDate ||
        subscription?.manualOverrideExpiry ||
        subscription?.originalEndDate ||
        null;

    return {
        plan,
        subscription,
        hasActivePlan: Boolean(plan),
        reason: fallbackReason || "",
        expiry,
    };
};

const getBillingAlertState = (billingInfo) => {
    const expiryValue = billingInfo?.expiry;
    if (!expiryValue) return null;

    const expiry = new Date(expiryValue);
    const diffMs = expiry.getTime() - Date.now();
    if (!Number.isFinite(diffMs)) return null;

    if (diffMs <= 0) {
        return {
            level: "expired",
            code: "expired",
            title: "Plan expired",
            message: "Your current plan has expired. Upgrade to continue using app actions.",
        };
    }

    const planName = `${billingInfo?.plan?.code || ""} ${billingInfo?.plan?.name || ""}`.toLowerCase();
    const isFreeLike =
        planName.includes("free") ||
        String(billingInfo?.subscription?.status || "").toLowerCase().includes("trial") ||
        Number(billingInfo?.plan?.basePrice || 0) <= 0;

    if (isFreeLike) {
        if (diffMs <= 60 * 60 * 1000) {
            return {
                level: "warning",
                code: "free-1h",
                title: "Free plan expiring soon",
                message: "Your current free plan will expire within 1 hour. Please upgrade now.",
            };
        }
        return null;
    }

    if (diffMs <= 60 * 60 * 1000) {
        return {
            level: "warning",
            code: "paid-1h",
            title: "Plan expiring in 1 hour",
            message: "Your current plan will expire within 1 hour. Please upgrade now.",
        };
    }

    if (diffMs <= 24 * 60 * 60 * 1000) {
        return {
            level: "notice",
            code: "paid-1d",
            title: "Plan expiring tomorrow",
            message: "Your current plan will expire within 1 day. Please renew or upgrade soon.",
        };
    }

    return null;
};

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
    const [billingInfo, setBillingInfo] = useState({
        plan: null,
        subscription: null,
        hasActivePlan: false,
        reason: "",
        expiry: null,
    });
    const [billingAlert, setBillingAlert] = useState(null);
    const [billingPrompt, setBillingPrompt] = useState({
        visible: false,
        title: "",
        message: "",
        kind: "upgrade",
        alertKey: "",
    });
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

    const fetchLatestProfile = useCallback(async (tokenOverride = "") => {
        const token = tokenOverride || (await getAuthToken());
        if (!token) return null;

        const res = await fetch(`${API_URL}/users/profile`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        if (!res.ok) {
            throw new Error(`Profile fetch failed (${res.status})`);
        }

        const data = await res.json();
        return data?.user || null;
    }, []);

    const syncBillingUiState = useCallback(async (nextInfo, { forcePrompt = false } = {}) => {
        setBillingInfo(nextInfo);
        setBillingPlan(nextInfo?.plan || null);

        if (nextInfo?.plan) {
            await AsyncStorage.setItem("billingPlan", JSON.stringify(nextInfo.plan));
        } else {
            await AsyncStorage.removeItem("billingPlan");
        }
        await AsyncStorage.setItem(BILLING_INFO_KEY, JSON.stringify(nextInfo));

        const nextAlert = getBillingAlertState(nextInfo);
        if (!nextAlert) {
            setBillingAlert(null);
            return;
        }

        const entityKey = nextInfo?.subscription?.id || nextInfo?.plan?.id || "billing";
        const expiryKey = nextInfo?.expiry ? new Date(nextInfo.expiry).toISOString() : "none";
        const alertStorageKey = `${BILLING_ALERT_KEY_PREFIX}:${entityKey}:${nextAlert.code}:${expiryKey}`;
        const snoozeUntilRaw = await AsyncStorage.getItem(`${alertStorageKey}:snoozeUntil`);
        const snoozeUntil = Number(snoozeUntilRaw || 0);

        if (!forcePrompt && Number.isFinite(snoozeUntil) && snoozeUntil > Date.now()) {
            setBillingAlert(null);
            return;
        }

        setBillingAlert(nextAlert);

        const lastNotifiedRaw = await AsyncStorage.getItem(
            `${alertStorageKey}:lastNotifiedAt`,
        );
        const lastNotifiedAt = Number(lastNotifiedRaw || 0);
        const notificationCooldownMs = BILLING_ALERT_SNOOZE_MINUTES * 60 * 1000;

        if (
            forcePrompt ||
            !Number.isFinite(lastNotifiedAt) ||
            Date.now() - lastNotifiedAt >= notificationCooldownMs
        ) {
            await showBillingPlanNotification({
                title: nextAlert.title,
                body: nextAlert.message,
                code: nextAlert.code,
                expiry: nextInfo?.expiry || null,
                reason: nextInfo?.reason || "",
            });
            await AsyncStorage.setItem(
                `${alertStorageKey}:lastNotifiedAt`,
                String(Date.now()),
            );
        }

        if (forcePrompt || !billingPrompt?.visible || billingPrompt?.alertKey !== alertStorageKey) {
            setBillingPrompt({
                visible: true,
                title: nextAlert.title,
                message: nextAlert.message,
                kind: "alert",
                alertKey: alertStorageKey,
            });
        }
    }, [billingPrompt?.alertKey, billingPrompt?.visible]);

    const refreshBillingPlan = useCallback(async () => {
        try {
            setBillingLoading(true);
            const res = await getEffectivePlan();
            await syncBillingUiState(normalizeBillingInfo(res));
        } catch (e) {
            const status = e?.response?.status;
            const code = e?.response?.data?.code;
            const reason =
                e?.response?.data?.message ||
                e?.response?.data?.error ||
                e?.message ||
                "No active subscription";
            if (status === 404 || status === 402 || code === "NO_ACTIVE_PLAN") {
                await syncBillingUiState(normalizeBillingInfo(null, reason), {
                    forcePrompt: true,
                });
            }
        } finally {
            setBillingLoading(false);
        }
    }, [syncBillingUiState]);

    useEffect(() => {
        const checkStatus = async () => {
            const token = await getAuthToken();
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
                    const latestUser = await fetchLatestProfile(token);
                    if (latestUser) {
                        await AsyncStorage.setItem("user", JSON.stringify(latestUser));
                        setUser(latestUser);
                        setUserStatus(latestUser.status || "Active");
                    }
                } catch (_error) {
                    console.log("Failed to refresh latest profile", _error?.message || _error);
                }

                try {
                    const cachedPlan = await AsyncStorage.getItem("billingPlan");
                    if (cachedPlan) {
                        setBillingPlan(JSON.parse(cachedPlan));
                    }
                } catch (e) {
                    // ignore cached plan parse issues
                }

                try {
                    const cachedBillingInfo = await AsyncStorage.getItem(BILLING_INFO_KEY);
                    if (cachedBillingInfo) {
                        const parsedBillingInfo = JSON.parse(cachedBillingInfo);
                        setBillingInfo(parsedBillingInfo);
                        setBillingAlert(getBillingAlertState(parsedBillingInfo));
                    }
                } catch (e) {
                    // ignore cached billing info parse issues
                }
            }
            const onboarded = await AsyncStorage.getItem("onboardingCompleted");
            if (onboarded === "true") {
                setOnboardingCompleted(true);
            }
            setIsLoading(false);
        };
        checkStatus();
    }, [fetchLatestProfile]);

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
        const sub = DeviceEventEmitter.addListener("SUBSCRIPTION_UPDATED", () => {
            if (!isLoggedIn) return;
            refreshBillingPlan().catch(() => {});
        });

        return () => {
            sub?.remove?.();
        };
    }, [isLoggedIn, refreshBillingPlan]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("PROFILE_UPDATED", async (payload) => {
            const incomingUserId = String(payload?.id || payload?._id || payload?.userId || "");
            const selfUserId = String(user?.id || user?._id || "");
            if (!isLoggedIn || !incomingUserId || !selfUserId || incomingUserId !== selfUserId) {
                return;
            }

            try {
                const latestUser = await fetchLatestProfile();
                const nextUser = latestUser || { ...user, ...payload };
                await AsyncStorage.setItem("user", JSON.stringify(nextUser));
                setUser(nextUser);
                setUserStatus(nextUser.status || "Active");
            } catch (_error) {
                const nextUser = { ...user, ...payload };
                await AsyncStorage.setItem("user", JSON.stringify(nextUser));
                setUser(nextUser);
                setUserStatus(nextUser.status || "Active");
            }
        });

        return () => {
            sub?.remove?.();
        };
    }, [fetchLatestProfile, isLoggedIn, user]);

    useEffect(() => {
        // Global auth error handler (e.g., company suspended => 403)
        setAuthErrorHandler(async ({ status, message, data } = {}) => {
            if (!isLoggedIn) return;
            if (status !== 401 && status !== 402 && status !== 403) return;

            const code = data?.code;
            const text = String(message || "");
            if (status === 402 || code === "NO_ACTIVE_PLAN" || code === "FEATURE_DISABLED") {
                await refreshBillingPlan().catch(() => {});
                setBillingPrompt({
                    visible: true,
                    title: code === "FEATURE_DISABLED" ? "Upgrade required" : "Plan expired",
                    message:
                        text ||
                        (code === "FEATURE_DISABLED"
                            ? "This feature is not available in your current plan."
                            : "Your current plan has expired. Please upgrade to continue."),
                });
                return;
            }
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
    }, [isLoggedIn, refreshBillingPlan, user]);

    useEffect(() => {
        if (isLoggedIn) {
            refreshBillingPlan().catch(() => {});
        }
    }, [isLoggedIn, refreshBillingPlan]);

    useEffect(() => {
        if (!isLoggedIn) return undefined;

        const appStateSub = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                refreshBillingPlan().catch(() => {});
            }
        });

        const intervalId = setInterval(() => {
            refreshBillingPlan().catch(() => {});
        }, 60000);

        return () => {
            appStateSub?.remove?.();
            clearInterval(intervalId);
        };
    }, [isLoggedIn, refreshBillingPlan]);

    // Poll user status periodically while logged in (every 60s)
    useEffect(() => {
        let id;
        if (isLoggedIn && user && user.id) {
            const poll = async () => {
                try {
                    const token = await getAuthToken();
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
        if (token) {
            await setAuthToken(token);
            clearApiClient();
        }
        if (userObj) {
            await AsyncStorage.setItem("user", JSON.stringify(userObj));
            setUser(userObj);
            setUserStatus(userObj.status || "Active");
        }
        try {
            const latestUser = await fetchLatestProfile(token);
            if (latestUser) {
                await AsyncStorage.setItem("user", JSON.stringify(latestUser));
                setUser(latestUser);
                setUserStatus(latestUser.status || "Active");
            }
        } catch (_error) {
            // keep login resilient even if profile refresh fails
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
        await deleteAuthToken();
        await AsyncStorage.removeItem("user");
        await AsyncStorage.removeItem("billingPlan");
        await AsyncStorage.removeItem(BILLING_INFO_KEY);
        clearApiClient();
        setUser(null);
        setUserStatus("Active");
        setBillingPlan(null);
        setBillingInfo({
            plan: null,
            subscription: null,
            hasActivePlan: false,
            reason: "",
            expiry: null,
        });
        setBillingAlert(null);
        setBillingPrompt({ visible: false, title: "", message: "" });
        setIsLoggedIn(false);
        try {
            stopCallMonitoring();
        } catch (e) {
            // ignore if native modules are not present
        }
        try {
            await notificationService.cancelAllNotifications?.();
            await notificationService.resetNotificationLocalState?.();
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
            const token = await getAuthToken();
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

    const localLogout = async () => {
        await doLogout();
    };

    const completeOnboarding = async () => {
        await AsyncStorage.setItem("onboardingCompleted", "true");
        setOnboardingCompleted(true);
    };

    const dismissBillingPrompt = async () => {
        const currentPrompt = billingPrompt;
        setBillingPrompt((prev) => ({ ...prev, visible: false }));
        if (currentPrompt?.kind === "alert" && currentPrompt?.alertKey) {
            const snoozeUntil =
                Date.now() + BILLING_ALERT_SNOOZE_MINUTES * 60 * 1000;
            await AsyncStorage.setItem(
                `${currentPrompt.alertKey}:snoozeUntil`,
                String(snoozeUntil),
            );
            setBillingAlert(null);
        }
    };

    const dismissBillingAlert = async () => {
        const nextAlert = getBillingAlertState(billingInfo);
        const entityKey =
            billingInfo?.subscription?.id || billingInfo?.plan?.id || "billing";
        const expiryKey = billingInfo?.expiry
            ? new Date(billingInfo.expiry).toISOString()
            : "none";
        const alertCode = nextAlert?.code || "billing";
        const alertStorageKey = `${BILLING_ALERT_KEY_PREFIX}:${entityKey}:${alertCode}:${expiryKey}`;
        const snoozeUntil =
            Date.now() + BILLING_ALERT_SNOOZE_MINUTES * 60 * 1000;
        await AsyncStorage.setItem(
            `${alertStorageKey}:snoozeUntil`,
            String(snoozeUntil),
        );
        setBillingAlert(null);
        setBillingPrompt((prev) => ({ ...prev, visible: false }));
    };

    const showUpgradePrompt = (message = "Please upgrade your current plan to continue.") => {
        setBillingPrompt({
            visible: true,
            title: "Upgrade required",
            message,
            kind: "upgrade",
            alertKey: "",
        });
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
                billingInfo,
                billingLoading,
                billingAlert,
                billingPrompt,
                suspensionInfo,
                login,
                logout,
                localLogout,
                updateUser,
                refreshBillingPlan,
                dismissBillingPrompt,
                dismissBillingAlert,
                showUpgradePrompt,
                completeOnboarding,
                clearSuspension,
                submitSuspensionReport,
            }}>
            {children}
        </AuthContext.Provider>
    );
};
