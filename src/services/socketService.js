import { DeviceEventEmitter, Platform, ToastAndroid } from "react-native";
import { io } from "socket.io-client";
import { SOCKET_URL } from "./apiConfig";

let socket = null;

export const initSocket = (userId) => {
    if (socket) return socket;

    console.log("🔌 Initializing Socket Connection to:", SOCKET_URL);

    socket = io(SOCKET_URL, {
        transports: ["websocket"],
        query: { userId }
    });

    socket.on("connect", () => {
        console.log("✅ Socket Connected!");
    });

    socket.on("CALL_LOG_CREATED", (log) => {
        console.log("📥 New Call Log via Socket:", log);

        // Show Toast if on Android
        if (Platform.OS === 'android') {
            const message = log.contactName
                ? `📞 New ${log.callType} from ${log.contactName}`
                : `📞 New ${log.callType} from ${log.phoneNumber}`;
            ToastAndroid.show(message, ToastAndroid.LONG);
        }

        // Notify APP UI
        DeviceEventEmitter.emit('CALL_LOG_CREATED', log);
    });

    socket.on("disconnect", () => {
        console.log("❌ Socket Disconnected");
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
