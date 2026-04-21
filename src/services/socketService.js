import { DeviceEventEmitter, Platform, ToastAndroid } from "react-native";
import { io } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    showCouponOfferNotification,
    showTeamChatNotification,
} from "./notificationService";
import { getAuthToken } from "./secureTokenStorage";
import { invalidateCacheTags } from "./appCache";
import { APP_EVENTS, emitAppEvent } from "./appEvents";

let socket = null;
let currentSocketUserId = "";
let listenersAttached = false;
let lastSocketAuthToken = "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureSocketListeners = () => {
    if (!socket || listenersAttached) return;
    listenersAttached = true;

    socket.on("connect", () => {
        console.log("Socket connected");
        if (currentSocketUserId) {
            try {
                socket.emit("join_user_room", currentSocketUserId);
            } catch (_error) {
                // ignore
            }
        }
    });

    socket.on("connect_error", (error) => {
        const msg = String(error?.message || "");
        const desc = String(error?.description || "");
        const ctx = error?.context;
        const ctxStatus = ctx?.statusCode ?? ctx?.status ?? "";
        const ctxUrl = ctx?.url || "";

        console.warn(
            "Socket connect error:",
            msg || error,
            desc ? `| ${desc}` : "",
            ctxStatus ? `| status=${ctxStatus}` : "",
            ctxUrl ? `| url=${ctxUrl}` : "",
            `| base=${SOCKET_URL}`,
        );

        const isSessionRevoked = /session\s*(revoked|expired)/i.test(msg);
        if (
            isSessionRevoked ||
            /authentication|required|token|jwt|unauthorized|invalid/i.test(msg)
        ) {
            try {
                socket.disconnect();
            } catch (_err) {
                // ignore
            }
            socket = null;
            listenersAttached = false;
            lastSocketAuthToken = "";

            // If the server rejected the handshake because another device
            // logged in (single-device login enforcement), trigger the same
            // FORCE_LOGOUT flow that AuthContext uses — otherwise the old
            // device would keep retrying forever without logging the user out.
            if (isSessionRevoked) {
                try {
                    DeviceEventEmitter.emit("FORCE_LOGOUT", {
                        code: "SESSION_REVOKED",
                        reason: "Logged in on another device",
                    });
                } catch (_emitErr) {
                    // ignore
                }
            }
        }
    });
};

const loadCurrentSocketUserId = async () => {
    try {
        const rawUser = await AsyncStorage.getItem("user");
        const parsed = rawUser ? JSON.parse(rawUser) : null;
        currentSocketUserId = String(parsed?.id || parsed?._id || "");
    } catch (_error) {
        currentSocketUserId = "";
    }
    return currentSocketUserId;
};

const getCurrentSocketUserId = async () => {
    if (currentSocketUserId) {
        return currentSocketUserId;
    }
    return loadCurrentSocketUserId();
};

export const initSocket = async () => {
    const token = await getAuthToken();
    if (!token) return null;
    await loadCurrentSocketUserId();

    if (socket) {
        if (lastSocketAuthToken !== token) {
            socket.auth = { token };
            lastSocketAuthToken = token;
        }
        ensureSocketListeners();
        if (!socket.connected) {
            try {
                socket.connect();
            } catch (_error) {
                // ignore
            }
        }
        if (currentSocketUserId) {
            try {
                socket.emit("join_user_room", currentSocketUserId);
            } catch (_error) {
                // ignore
            }
        }
        return socket;
    }

    console.log("Initializing socket connection to:", SOCKET_URL);

    lastSocketAuthToken = token;
    socket = io(SOCKET_URL, {
        // IMPORTANT: Keep default transport order (polling -> websocket upgrade).
        // Forcing websocket first often fails on some networks/dev setups and
        // prevents fallback to polling, causing "websocket error" loops.
        transports: ["polling", "websocket"],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        timeout: 10000,
    });

    ensureSocketListeners();

    socket.on("COMPANY_STATUS_CHANGED", (payload) => {
        DeviceEventEmitter.emit("COMPANY_STATUS_CHANGED", payload);
    });

    socket.on("FORCE_LOGOUT", (payload) => {
        console.log("Force logout via socket:", payload);
        DeviceEventEmitter.emit("FORCE_LOGOUT", payload);
    });

    socket.on("SUBSCRIPTION_UPDATED", (payload) => {
        console.log("Subscription update via socket:", payload);
        DeviceEventEmitter.emit("SUBSCRIPTION_UPDATED", payload);
    });

    socket.on("PROFILE_UPDATED", (payload) => {
        console.log("Profile update via socket:", payload);
        DeviceEventEmitter.emit("PROFILE_UPDATED", payload);
    });

    socket.on("ENQUIRY_CREATED", (payload) => {
        console.log("Enquiry created via socket:", payload);
        Promise.resolve(
            invalidateCacheTags([
                "dashboard",
                "enquiries",
                "followups",
                "reports",
            ]),
        ).catch(() => { });
        emitAppEvent(APP_EVENTS.ENQUIRY_CREATED, payload);
    });

    socket.on("ENQUIRY_UPDATED", (payload) => {
        console.log("Enquiry updated via socket:", payload);
        Promise.resolve(
            invalidateCacheTags([
                "dashboard",
                "enquiries",
                "followups",
                "reports",
            ]),
        ).catch(() => { });
        emitAppEvent(APP_EVENTS.ENQUIRY_UPDATED, payload);
    });

    socket.on("FOLLOWUP_CHANGED", (payload) => {
        console.log("Follow-up changed via socket:", payload);
        Promise.resolve(
            invalidateCacheTags([
                "dashboard",
                "followups",
                "enquiries",
                "reports",
            ]),
        ).catch(() => { });
        emitAppEvent(APP_EVENTS.FOLLOWUP_CHANGED, payload);
    });

    socket.on("COUPON_ANNOUNCEMENT", (payload) => {
        console.log("Coupon announcement via socket:", payload);
        emitAppEvent(APP_EVENTS.COUPON_ANNOUNCEMENT, payload);

        Promise.resolve(showCouponOfferNotification(payload)).catch(() => { });

        if (Platform.OS === "android") {
            const code = String(payload?.code || "").trim();
            const message = code
                ? `New coupon available: ${code}`
                : "A new coupon offer is available";
            ToastAndroid.show(message, ToastAndroid.LONG);
        }
    });

    socket.on("COUPON_SYNC", (payload) => {
        console.log("Coupon sync via socket:", payload);
        emitAppEvent(APP_EVENTS.COUPON_SYNC, payload);
    });

    socket.on("COMMUNICATION_MESSAGE_CREATED", async (payload) => {
        DeviceEventEmitter.emit("COMMUNICATION_MESSAGE_CREATED", payload);

        const activeUserId = await getCurrentSocketUserId();
        const receiverId = String(
            payload?.receiverId?._id || payload?.receiverId || "",
        );
        const senderId = String(
            payload?.senderId?._id || payload?.senderId || "",
        );
        const isIncoming = Boolean(
            activeUserId &&
            receiverId === activeUserId &&
            senderId !== activeUserId,
        );

        if (!isIncoming) {
            return;
        }

        Promise.resolve(showTeamChatNotification(payload)).catch(() => { });

        if (Platform.OS === "android") {
            const senderName = String(
                payload?.senderId?.name || "Team member",
            ).trim();
            const preview =
                String(payload?.message || "").trim() || "Sent a new message";
            ToastAndroid.show(`${senderName}: ${preview}`, ToastAndroid.LONG);
        }
    });

    socket.on("COMMUNICATION_TASK_UPDATED", (payload) => {
        DeviceEventEmitter.emit("COMMUNICATION_TASK_UPDATED", payload);
    });

    socket.on("disconnect", (reason) => {
        console.log("Socket disconnected", reason);
        if (reason === "io server disconnect") {
            try {
                socket.connect();
            } catch (_error) {
                // ignore
            }
        }
    });

    return socket;
};

export const getSocket = () => socket;

// Best-effort helper to avoid "socket not ready yet" races after login/app resume.
export const ensureSocketReady = async ({
    timeoutMs = 60000,
    initialDelayMs = 250,
    maxDelayMs = 5000,
} = {}) => {
    const start = Date.now();
    let delay = Math.max(50, Number(initialDelayMs) || 250);
    const maxDelay = Math.max(delay, Number(maxDelayMs) || 5000);

    // Try immediately first
    try {
        const s = await initSocket();
        if (s) return s;
    } catch (_error) {
        // ignore
    }

    while (Date.now() - start < timeoutMs) {
        await sleep(delay);
        try {
            const s = await initSocket();
            if (s) return s;
        } catch (_error) {
            // ignore
        }
        delay = Math.min(maxDelay, Math.floor(delay * 1.6));
    }

    return getSocket();
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
        listenersAttached = false;
        lastSocketAuthToken = "";
    }
};
