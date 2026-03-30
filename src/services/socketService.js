import { DeviceEventEmitter, Platform, ToastAndroid } from "react-native";
import { io } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    showCouponOfferNotification,
    showTeamChatNotification,
} from "./notificationService";
import { getAuthToken } from "./secureTokenStorage";

let socket = null;
let currentSocketUserId = "";

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
    if (socket) return socket;
    const token = await getAuthToken();
    if (!token) return null;
    await loadCurrentSocketUserId();

    console.log("Initializing socket connection to:", SOCKET_URL);

    socket = io(SOCKET_URL, {
        transports: ["websocket"],
        auth: { token },
    });

    socket.on("connect", () => {
        console.log("Socket connected");
    });

    socket.on("CALL_LOG_CREATED", (log) => {
        console.log("New call log via socket:", log);

        if (Platform.OS === "android" && log?.callType) {
            const message = log.contactName
                ? `New ${log.callType} from ${log.contactName}`
                : `New ${log.callType} from ${log.phoneNumber || "Unknown"}`;
            ToastAndroid.show(message, ToastAndroid.LONG);
        }

        DeviceEventEmitter.emit("CALL_LOG_CREATED", log);
    });

    socket.on("CALL_LOG_REFRESH", (payload) => {
        console.log("Call log refresh via socket:", payload);
        DeviceEventEmitter.emit("CALL_LOG_CREATED", payload);
    });

    socket.on("CALL_SESSION_UPDATED", (session) => {
        console.log("Call session update via socket:", session);
        DeviceEventEmitter.emit("CALL_SESSION_UPDATED", session);
    });

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
        DeviceEventEmitter.emit("ENQUIRY_CREATED", payload);
    });

    socket.on("ENQUIRY_UPDATED", (payload) => {
        console.log("Enquiry updated via socket:", payload);
        DeviceEventEmitter.emit("ENQUIRY_UPDATED", payload);
    });

    socket.on("FOLLOWUP_CHANGED", (payload) => {
        console.log("Follow-up changed via socket:", payload);
        DeviceEventEmitter.emit("FOLLOWUP_CHANGED", payload);
    });

    socket.on("COUPON_ANNOUNCEMENT", (payload) => {
        console.log("Coupon announcement via socket:", payload);
        DeviceEventEmitter.emit("COUPON_ANNOUNCEMENT", payload);

        Promise.resolve(showCouponOfferNotification(payload)).catch(() => {});

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
        DeviceEventEmitter.emit("COUPON_SYNC", payload);
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
            activeUserId && receiverId === activeUserId && senderId !== activeUserId,
        );

        if (!isIncoming) {
            return;
        }

        Promise.resolve(showTeamChatNotification(payload)).catch(() => {});

        if (Platform.OS === "android") {
            const senderName = String(payload?.senderId?.name || "Team member").trim();
            const preview = String(payload?.message || "").trim() || "Sent a new message";
            ToastAndroid.show(`${senderName}: ${preview}`, ToastAndroid.LONG);
        }
    });

    socket.on("disconnect", () => {
        console.log("Socket disconnected");
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
