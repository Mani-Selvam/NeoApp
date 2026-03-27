const rawApiBaseUrl = import.meta.env.VITE_API_URL;
const WEB_SESSION_TOKEN_KEY = "superadminSessionToken";

function resolveApiBaseUrl() {
    if (typeof rawApiBaseUrl === "string" && rawApiBaseUrl.trim()) {
        return rawApiBaseUrl.replace(/\/+$/, "");
    }

    if (import.meta.env.DEV) {
        return "http://localhost:5000/api";
    }

    return "/api";
}

const API_BASE_URL = resolveApiBaseUrl();

async function request(path, options = {}) {
    const sessionToken =
        typeof window !== "undefined"
            ? window.sessionStorage.getItem(WEB_SESSION_TOKEN_KEY)
            : "";

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(data.message || data.error || "Request failed");
        err.status = response.status;
        err.data = data;
        err.path = path;
        throw err;
    }

    return data;
}

export function setWebSessionToken(token) {
    if (typeof window === "undefined") return;
    if (token) {
        window.sessionStorage.setItem(WEB_SESSION_TOKEN_KEY, token);
    } else {
        window.sessionStorage.removeItem(WEB_SESSION_TOKEN_KEY);
    }
}

export const api = {
    superadminLogin: (payload) =>
        request("/auth/superadmin/login", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    superadminLogout: () =>
        request("/auth/logout", {
            method: "POST",
        }),

    getSuperadmin2faStatus: () => request("/auth/superadmin/2fa/status"),
    setupSuperadmin2fa: () =>
        request("/auth/superadmin/2fa/setup", {
            method: "POST",
            body: JSON.stringify({}),
        }),
    enableSuperadmin2fa: (payload) =>
        request("/auth/superadmin/2fa/enable", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    disableSuperadmin2fa: (payload) =>
        request("/auth/superadmin/2fa/disable", {
            method: "POST",
            body: JSON.stringify(payload),
        }),

    getSuperadminDashboard: () => request("/superadmin/dashboard"),

    getSuperadminCompanies: () => request("/superadmin/companies"),
    updateCompanyStatus: (companyId, status) =>
        request(`/superadmin/companies/${companyId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
    deleteCompany: (companyId) =>
        request(`/superadmin/companies/${companyId}`, { method: "DELETE" }),
    getCompanyEffectivePlan: (companyId) =>
        request(`/superadmin/companies/${companyId}/effective-plan`),

    getSuperadminUsers: () => request("/superadmin/users"),
    updateUserStatus: (userId, status) =>
        request(`/superadmin/users/${userId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
    updateUserRole: (userId, role) =>
        request(`/superadmin/users/${userId}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
        }),
    resetUserPassword: (userId, password) =>
        request(`/superadmin/users/${userId}/reset-password`, {
            method: "POST",
            body: JSON.stringify({ password }),
        }),

    getPlans: () => request("/superadmin/plans"),
    createPlan: (payload) =>
        request("/superadmin/plans", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    updatePlan: (planId, payload) =>
        request(`/superadmin/plans/${planId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),
    deletePlan: (planId) =>
        request(`/superadmin/plans/${planId}`, {
            method: "DELETE",
        }),

    getCoupons: () => request("/superadmin/coupons"),
    createCoupon: (payload) =>
        request("/superadmin/coupons", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    updateCoupon: (couponId, payload) =>
        request(`/superadmin/coupons/${couponId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),
    deleteCoupon: (couponId) =>
        request(`/superadmin/coupons/${couponId}`, {
            method: "DELETE",
        }),

    getOverrides: () => request("/superadmin/overrides"),
    upsertOverride: (payload) =>
        request("/superadmin/overrides", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    deleteOverride: (overrideId) =>
        request(`/superadmin/overrides/${overrideId}`, { method: "DELETE" }),

    getSuperadminSubscriptions: () => request("/superadmin/subscriptions"),
    assignSubscription: (payload) =>
        request("/superadmin/subscriptions", {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    updateSubscription: (subscriptionId, payload) =>
        request(`/superadmin/subscriptions/${subscriptionId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),
    deleteSubscription: (subscriptionId) =>
        request(`/superadmin/subscriptions/${subscriptionId}`, {
            method: "DELETE",
        }),

    getSuperadminRevenue: () => request("/superadmin/revenue"),
    getSuperadminLogs: () => request("/superadmin/logs"),

    getSupportTickets: ({ status = "", q = "" } = {}) => {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (q) params.set("q", q);
        const suffix = params.toString() ? `?${params.toString()}` : "";
        return request(`/superadmin/support/tickets${suffix}`);
    },
    respondSupportTicket: (ticketId, payload) =>
        request(`/superadmin/support/tickets/${ticketId}/respond`, {
            method: "POST",
            body: JSON.stringify(payload),
        }),

    getExchangeRates: () => request("/superadmin/settings/exchange-rates"),
    updateExchangeRates: (payload) =>
        request("/superadmin/settings/exchange-rates", {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),

    getWorkspaceSettings: () => request("/superadmin/settings/workspace"),
    updateWorkspaceSettings: (payload) =>
        request("/superadmin/settings/workspace", {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),

    getSecurityPolicy: () => request("/superadmin/settings/security-policy"),
    updateSecurityPolicy: (payload) =>
        request("/superadmin/settings/security-policy", {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),

    getRazorpaySettings: () => request("/superadmin/settings/razorpay"),
    updateRazorpaySettings: (payload) =>
        request("/superadmin/settings/razorpay", {
            method: "PATCH",
            body: JSON.stringify(payload),
        }),
};
