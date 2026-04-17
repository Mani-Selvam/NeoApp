import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import Constants from "expo-constants";
import notificationService from "./notificationService";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";

const getFirebaseMessaging = () => {
    if (Constants.appOwnership === "expo") return null;
    try {
        return require("@react-native-firebase/messaging").default;
    } catch (_e) {
        return null;
    }
};

class FirebaseNotificationService {
    // Initialize Firebase messaging
    async initialize() {
        try {
            const messaging = getFirebaseMessaging();
            if (!messaging) {
                console.log(
                    "[FirebaseNotificationService] ⚠️ Skipping FCM init in Expo Go / unsupported environment",
                );
                return null;
            }

            console.log(
                "[FirebaseNotificationService] ✓ Firebase messaging available",
            );

            // Request permission
            const authStatus = await messaging().requestPermission();
            const enabled =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL;

            if (enabled) {
                const fcmToken = await messaging().getToken();
                console.log(
                    "[FirebaseNotificationService] ✓ FCM Token obtained:",
                    fcmToken?.substring(0, 20) + "...",
                );

                // Register token with backend
                await this.registerFCMToken(fcmToken);

                console.log(
                    "[FirebaseNotificationService] ✓ Background message handler set",
                );
                console.log(
                    "[FirebaseNotificationService] ✓ Foreground message handler set",
                );
                console.log(
                    "[FirebaseNotificationService] ✓ Notification opened handler set",
                );

                // Keep backend token fresh if Firebase rotates it.
                const unsubscribeTokenRefresh = messaging().onTokenRefresh(
                    async (nextToken) => {
                        await this.registerFCMToken(nextToken);
                    },
                );

                // Handle background messages
                messaging().setBackgroundMessageHandler(
                    this.handleBackgroundMessage,
                );

                // Handle foreground messages
                const unsubscribeMessage = messaging().onMessage(
                    this.handleForegroundMessage,
                );

                // Handle notification opened
                const unsubscribeOpened = messaging().onNotificationOpenedApp(
                    this.handleNotificationOpened,
                );

                return () => {
                    unsubscribeMessage?.();
                    unsubscribeOpened?.();
                    unsubscribeTokenRefresh?.();
                };
            } else {
                console.log("User declined notifications");
                return null;
            }
        } catch (error) {
            console.error("FCM initialization failed:", error);
            return null;
        }
    }

    // Register FCM token with backend
    async registerFCMToken(fcmToken) {
        try {
            const token = await getAuthToken();
            if (!token) return;

            const response = await fetch(`${API_URL}/auth/register-fcm-token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ fcmToken }),
            });

            const result = await response.json();
            if (result.success) {
                console.log("FCM token registered successfully");
            } else {
                console.error("FCM token registration failed:", result.error);
            }
        } catch (error) {
            console.error("Error registering FCM token:", error);
        }
    }

    // Determine proper channel ID from notification type and status
    getChannelFromNotificationType = (dataType, status = "") => {
        const typeStr = String(dataType || "").toLowerCase();
        const statusStr = String(status || "").toLowerCase();

        // Activity types: followup, phone, meeting, email, whatsapp
        const activityTypes = [
            "followup",
            "phone",
            "meeting",
            "email",
            "whatsapp",
        ];
        let activity = "followups";

        // Detect activity type
        for (const type of activityTypes) {
            if (typeStr.includes(type)) {
                activity = type === "followup" ? "followups" : type;
                break;
            }
        }

        // Detect status: missed, due, soon (CHECK MISSED FIRST!)
        if (typeStr.includes("missed") || statusStr.includes("missed")) {
            return `${activity}_missed_en`;
        } else if (typeStr.includes("due") || statusStr.includes("due")) {
            return `${activity}_due_en`;
        } else if (typeStr.includes("soon") || statusStr.includes("soon")) {
            return `${activity}_soon_en`;
        }

        // Fallback to enquiry or default
        if (typeStr.includes("enquiry")) {
            return "enquiries";
        }

        return "default";
    };

    // Handle foreground notifications with sound and vibration
    handleForegroundMessage = async (remoteMessage) => {
        console.log("Foreground Firebase notification:", remoteMessage);
        const { data, notification } = remoteMessage || {};

        if (!data) return;

        try {
            // Show Expo notification with proper channel and sound
            const title = notification?.title || data?.title || "Notification";
            const body = notification?.body || data?.body || "";

            // Determine channel based on notification type and status
            const channelId = this.getChannelFromNotificationType(
                data?.type,
                data?.status,
            );

            console.log(
                `[Firebase] Foreground - Type: ${data?.type}, Status: ${data?.status} → Channel: ${channelId}`,
            );

            // Use the notificationService to display the notification properly
            await notificationService.scheduleImmediateNotification({
                title,
                body,
                channelId,
                data: data || {},
            });

            // Also play voice notification if configured
            await this.playVoiceNotification(data);
        } catch (error) {
            console.error("Error handling foreground Firebase message:", error);
        }
    };

    // Handle background messages
    handleBackgroundMessage = async (remoteMessage) => {
        console.log("Background Firebase notification:", remoteMessage);
        const { data, notification } = remoteMessage || {};

        if (!data) return;

        try {
            // Show Expo notification with proper channel and sound for background
            const title = notification?.title || data?.title || "Notification";
            const body = notification?.body || data?.body || "";

            // Determine channel based on notification type and status
            const channelId = this.getChannelFromNotificationType(
                data?.type,
                data?.status,
            );

            console.log(
                `[Firebase] Background - Type: ${data?.type}, Status: ${data?.status} → Channel: ${channelId}`,
            );

            // Use the notificationService to display the notification with channel sound
            await notificationService.scheduleImmediateNotification({
                title,
                body,
                channelId,
                data: data || {},
            });

            // Play voice notification as well
            await this.playVoiceNotification(data);
        } catch (error) {
            console.error("Error handling background Firebase message:", error);
        }
    };

    // Handle notification tap
    handleNotificationOpened = (remoteMessage) => {
        console.log("Notification opened:", remoteMessage);
        const { data } = remoteMessage || {};

        // Navigate based on notification type
        // This would integrate with your navigation system
        if (data?.type === "followup-reminder") {
            // Navigate to follow-up screen
        } else if (data?.type === "new-enquiry") {
            // Navigate to enquiry screen
        }
    };

    // Voice notification playback
    async playVoiceNotification(data) {
        const {
            voiceLang = "en",
            audioType,
            audioUrl,
            ttsText,
            type,
            minutesLeft,
            activityType,
        } = data;

        try {
            if (audioType === "pre_recorded" && audioUrl) {
                // Play pre-recorded audio
                await this.playPreRecordedAudio(audioUrl, voiceLang);
            } else if (ttsText) {
                // Use TTS
                await this.playTTS(ttsText, voiceLang);
            } else {
                // Generate TTS based on notification type
                const generatedTTS = this.generateTTSForNotification(data);
                if (generatedTTS) {
                    await this.playTTS(generatedTTS, voiceLang);
                }
            }
        } catch (error) {
            console.error("Voice playback failed:", error);
        }
    }

    // Play pre-recorded audio files
    async playPreRecordedAudio(audioUrl, voiceLang) {
        try {
            const audioModules = notificationService.AUDIO_MODULES;
            const langPack = audioModules[voiceLang] || audioModules.en;

            // Try to find the audio file based on the URL pattern
            let soundObject = null;

            // Handle different audio URL formats
            if (audioUrl.includes("_")) {
                // Direct filename like 'phone_5min'
                const activity = audioUrl.split("_")[0]; // phone, whatsapp, email, meeting
                const timing = audioUrl.split("_").slice(1).join("_"); // 5min, due, missed, etc.

                if (langPack[activity] && langPack[activity][timing]) {
                    soundObject = langPack[activity][timing];
                }
            }

            if (soundObject) {
                const { sound } = await Audio.Sound.createAsync(soundObject);
                await sound.playAsync();
                // Clean up
                sound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish) {
                        sound.unloadAsync();
                    }
                });
            } else {
                console.warn(
                    `Audio file not found: ${audioUrl} for language ${voiceLang}`,
                );
                // Fallback to TTS if audio file not found
                const ttsText = this.generateTTSForNotification({
                    audioUrl,
                    voiceLang,
                });
                if (ttsText) {
                    await this.playTTS(ttsText, voiceLang);
                }
            }
        } catch (error) {
            console.error("Error playing pre-recorded audio:", error);
        }
    }

    // Text-to-Speech playback
    async playTTS(text, voiceLang) {
        const language = voiceLang === "ta" ? "ta-IN" : "en-IN";

        return new Promise((resolve) => {
            Speech.speak(text, {
                language,
                rate: 0.9,
                pitch: 1.0,
                onDone: () => {
                    console.log("TTS completed");
                    resolve();
                },
                onError: (error) => {
                    console.error("TTS error:", error);
                    resolve();
                },
            });
        });
    }

    // Generate TTS text based on notification type
    generateTTSForNotification(data) {
        const { type, voiceLang, minutesLeft, activityType } = data;
        const lang = voiceLang || "en";

        if (lang === "ta") {
            switch (type) {
                case "followup-soon":
                    const minText =
                        minutesLeft === 1
                            ? "ஒரு நிமிடத்தில்"
                            : `${minutesLeft} நிமிடங்களில்`;
                    return `வாடிக்கையாளர் காத்திருக்கிறார். ${minText} அழைக்கவும்.`;
                case "followup-due":
                    return "வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.";
                case "followup-missed":
                    return "நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார்...";
                case "followup-reminder":
                    return "உங்களுக்கு இன்று பின்தொடர்புகள் உள்ளன.";
                default:
                    return "புதிய அறிவிப்பு வந்துள்ளது.";
            }
        } else {
            switch (type) {
                case "followup-soon":
                    return `Customer is waiting. Call in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`;
                case "followup-due":
                    return "Customer is waiting. Please call now.";
                case "followup-missed":
                    return "You have missed a follow-up. Customer is waiting...";
                case "followup-reminder":
                    return "You have follow-ups for today.";
                default:
                    return "You have a new notification.";
            }
        }
    }

    // Get current FCM token
    async getFCMToken() {
        const messaging = getFirebaseMessaging();
        if (!messaging) return null;
        try {
            return await messaging().getToken();
        } catch (error) {
            console.error("Error getting FCM token:", error);
            return null;
        }
    }

    // Delete FCM token (logout)
    async deleteFCMToken() {
        const messaging = getFirebaseMessaging();
        if (!messaging) return;
        try {
            await messaging().deleteToken();
            console.log("FCM token deleted");
        } catch (error) {
            console.error("Error deleting FCM token:", error);
        }
    }
}

export default new FirebaseNotificationService();
