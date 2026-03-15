import { DeviceEventEmitter, Platform, ToastAndroid } from "react-native";
import { io } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig";

let socket = null;

export const initSocket = (userId) => {
    if (socket) return socket;

    console.log("Initializing socket connection to:", SOCKET_URL);

    socket = io(SOCKET_URL, {
        transports: ["websocket"],
        query: { userId },
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
