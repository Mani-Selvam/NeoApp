import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { Platform } from "react-native";
import { confirmPermissionRequest } from "../utils/appFeedback";
import * as followupService from "./followupService";
import {
    getFollowUpDueTexts,
    getFollowUpMissedTexts,
    getFollowUpSoonTexts,
} from "../constants/notificationPhrases";

const HOURLY_FOLLOWUP_ACK_DATE_KEY = "hourlyFollowupAckDate";
const HOURLY_FOLLOWUP_SCHEDULE_KEY = "hourlyFollowupSchedule"; // JSON: { dateKey, ids: [] }
const TIME_FOLLOWUP_SCHEDULE_KEY = "timeFollowupSchedule"; // JSON: { dateKey, ids: [] }
const MISSED_FOLLOWUP_ALERT_STATE_KEY = "missedFollowupAlertState"; // JSON: { dateKey, count }
const NOTIFICATION_PERMISSION_EXPLAINED_KEY = "notificationPermissionExplained";
const NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY = "nextFollowupPromptSchedule"; // JSON: { idsByKey: { [enqKey]: id } }
const NOTIFICATION_VOICE_LANG_KEY = "notificationVoiceLang"; // "en" | "ta"
const DEFAULT_FOLLOWUP_PRE_REMIND_MINUTES = 60;
const DEFAULT_FOLLOWUP_PRE_REMIND_EVERY_MINUTES = 5;
const DEFAULT_FOLLOWUP_MISSED_FAST_MINUTES = 60;
const DEFAULT_FOLLOWUP_MISSED_FAST_EVERY_MINUTES = 5;
const DEFAULT_FOLLOWUP_MISSED_HOURLY_EVERY_MINUTES = 30;
const DEFAULT_FOLLOWUP_MISSED_HOURLY_MAX_HOURS = 12;
const DEFAULT_FOLLOWUP_DUE_REPEAT_FOR_MINUTES = 0;
const DEFAULT_FOLLOWUP_SCHEDULE_WINDOW_DAYS = 7;
const DEFAULT_FOLLOWUP_MISSED_LOOKBACK_DAYS = 2;
const MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC = 120;
const TRIGGER_TYPES = Notifications.SchedulableTriggerInputTypes || {};
const DATE_TRIGGER_TYPE = TRIGGER_TYPES.DATE || "date";
const DAILY_TRIGGER_TYPE = TRIGGER_TYPES.DAILY || "daily";
const CHANNEL_IDS = {
    default: "default_v4",
    followups: "followups_v4",
    // NOTE: Android notification channel sound cannot be changed after creation.
    // Bump the suffix whenever changing/bundling custom sound assets to ensure
    // devices recreate channels and pick up the new audio.
    followups_soon_en: "followups_soon_en_v2",
    followups_due_en: "followups_due_en_v2",
    followups_missed_en: "followups_missed_en_v2",
    followups_soon_ta: "followups_soon_ta_v2",
    followups_due_ta: "followups_due_ta_v2",
    followups_missed_ta: "followups_missed_ta_v2",
    enquiries: "enquiries_v4",
    coupons: "coupons_v4",
    team_chat: "team_chat_v1",
    billing: "billing_v4",
    reports: "reports_v1",
};
const CATEGORY_IDS = {
    followups: "FOLLOWUP_ACTIONS",
    next_followup: "NEXT_FOLLOWUP_PROMPT",
};
const NOTIFICATION_CHANNELS = {
    followups: {
        name: "Follow-ups",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
    },
    followups_soon_en: {
        name: "Follow-ups (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_en.mp3",
    },
    followups_due_en: {
        name: "Follow-ups (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_en.mp3",
    },
    followups_missed_en: {
        name: "Follow-ups (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_en.mp3",
    },
    followups_soon_ta: {
        name: "Follow-ups (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_ta.mp3",
    },
    followups_due_ta: {
        name: "Follow-ups (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_ta.mp3",
    },
    followups_missed_ta: {
        name: "Follow-ups (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_ta.mp3",
    },
    enquiries: {
        name: "Enquiries",
        lightColor: "#16A34A",
        vibrationPattern: [0, 180, 140, 180],
    },
    coupons: {
        name: "Coupons",
        lightColor: "#2563EB",
        vibrationPattern: [0, 180, 120, 180],
    },
    team_chat: {
        name: "Team Chat",
        lightColor: "#0F766E",
        vibrationPattern: [0, 180, 90, 180],
    },
    billing: {
        name: "Plan Alerts",
        lightColor: "#F59E0B",
        vibrationPattern: [0, 220, 160, 220],
    },
    reports: {
        name: "Reports",
        lightColor: "#B8892A",
        vibrationPattern: [0, 150, 120, 150],
    },
};

const openCsvFileUri = async (uri) => {
    const safeUri = String(uri || "").trim();
    if (!safeUri) return { opened: false, skipped: true, reason: "no-uri" };

    if (Platform.OS === "android") {
        let dataUri = safeUri;
        try {
            if (safeUri.startsWith("file://") && FileSystem.getContentUriAsync) {
                dataUri = await FileSystem.getContentUriAsync(safeUri);
            }
        } catch {}

        try {
            await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
                data: dataUri,
                flags: IntentLauncher.Flags?.GRANT_READ_URI_PERMISSION
                    ? IntentLauncher.Flags.GRANT_READ_URI_PERMISSION
                    : 1,
                type: "text/csv",
            });
            return { opened: true };
        } catch (error) {
            console.warn("Failed to open CSV via intent:", error?.message || error);
            try {
                const available = await Sharing.isAvailableAsync();
                if (!available) return { opened: false, error: true, reason: "no-sharing" };
                await Sharing.shareAsync(safeUri, {
                    mimeType: "text/csv",
                    UTI: "public.comma-separated-values-text",
                    dialogTitle: "Open report CSV",
                });
                return { opened: true, shared: true };
            } catch {
                return { opened: false, error: true };
            }
        }
    }

    try {
        const available = await Sharing.isAvailableAsync();
        if (!available) return { opened: false, skipped: true, reason: "no-sharing" };
        await Sharing.shareAsync(safeUri, {
            mimeType: "text/csv",
            UTI: "public.comma-separated-values-text",
            dialogTitle: "Open report CSV",
        });
        return { opened: true, shared: true };
    } catch (error) {
        console.warn("Failed to share/open CSV:", error?.message || error);
        return { opened: false, error: true };
    }
};

const getAndroidPackageName = () => {
    try {
        return (
            Constants?.expoConfig?.android?.package ||
            Constants?.manifest2?.android?.package ||
            Constants?.manifest?.android?.package ||
            ""
        );
    } catch {
        return "";
    }
};

export const openAndroidNotificationSettings = async () => {
    if (Platform.OS !== "android") return { opened: false, skipped: true, reason: "not-android" };
    try {
        const pkg = getAndroidPackageName();
        try {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
                pkg
                    ? {
                          extra: {
                              "android.provider.extra.APP_PACKAGE": pkg,
                          },
                      }
                    : undefined,
            );
            return { opened: true };
        } catch (_err) {
            // Fallback: open app details, user can enable notifications from there.
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
                pkg ? { data: `package:${pkg}` } : undefined,
            );
            return { opened: true, fallback: "app-details" };
        }
    } catch (error) {
        console.warn("Failed to open notification settings:", error?.message || error);
        return { opened: false, error: true };
    }
};

export const openAndroidExactAlarmSettings = async () => {
    if (Platform.OS !== "android") return { opened: false, skipped: true, reason: "not-android" };
    try {
        // Android 12+ exact alarm permission settings.
        await IntentLauncher.startActivityAsync("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
        return { opened: true };
    } catch (error) {
        console.warn("Failed to open exact alarm settings:", error?.message || error);
        return { opened: false, error: true };
    }
};

export const openAndroidBatteryOptimizationSettings = async () => {
    if (Platform.OS !== "android") return { opened: false, skipped: true, reason: "not-android" };
    try {
        await IntentLauncher.startActivityAsync("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
        return { opened: true };
    } catch (error) {
        console.warn("Failed to open battery optimization settings:", error?.message || error);
        return { opened: false, error: true };
    }
};

// Helper to check if notifications are supported
const isNotificationSupported = () => {
    if (Platform.OS === "web") {
        return false;
    }
    return true;
};

let cachedVoiceLang = null;
export const getNotificationVoiceLanguage = async () => {
    if (cachedVoiceLang) return cachedVoiceLang;
    try {
        const raw = await AsyncStorage.getItem(NOTIFICATION_VOICE_LANG_KEY);
        const value = String(raw || "").trim().toLowerCase();
        cachedVoiceLang = value === "ta" ? "ta" : "en";
    } catch {
        cachedVoiceLang = "en";
    }
    return cachedVoiceLang;
};

export const setNotificationVoiceLanguage = async (lang) => {
    const value = String(lang || "").trim().toLowerCase() === "ta" ? "ta" : "en";
    cachedVoiceLang = value;
    try {
        await AsyncStorage.setItem(NOTIFICATION_VOICE_LANG_KEY, value);
    } catch {
        // ignore
    }
    return value;
};

const safeSpeak = async (text) => {
    try {
        if (!text || Platform.OS === "web") return;
        const lang = await getNotificationVoiceLanguage();
        const isSpeaking = await Speech.isSpeakingAsync();
        if (isSpeaking) {
            await Speech.stop();
        }
        Speech.speak(String(text), {
            language: lang === "ta" ? "ta-IN" : "en-IN",
            rate: 0.95,
            pitch: 1.0,
        });
    } catch (_error) {
        // ignore voice issues
    }
	};

let activeFollowupSound = null;
let audioModeReady = false;

const ensureAudioMode = async () => {
    if (audioModeReady) return;
    audioModeReady = true;
    try {
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
    } catch {
        // ignore audio mode issues
    }
};

const stopActiveFollowupSound = async () => {
    const sound = activeFollowupSound;
    activeFollowupSound = null;
    if (!sound) return;
    try {
        await sound.stopAsync();
    } catch { }
    try {
        await sound.unloadAsync();
    } catch { }
};

const normalizeActivityKeyForAudio = (activityType) => {
    const raw = String(activityType || "").trim().toLowerCase();
    if (raw === "phone call" || raw === "call" || raw === "phone") return "phone";
    if (raw === "whatsapp" || raw === "wa") return "whatsapp";
    if (raw === "email" || raw === "mail") return "email";
    if (raw === "meeting" || raw === "online meeting") return "meeting";
    return "followup";
};

const AUDIO_MODULES = {
    en: {
        phone: {
            5: require("../assets/Audio/Phone/English/5Pmin.mp3"),
            4: require("../assets/Audio/Phone/English/4Pmin.mp3"),
            3: require("../assets/Audio/Phone/English/3Pmin.mp3"),
            2: require("../assets/Audio/Phone/English/2Pmin.mp3"),
            1: require("../assets/Audio/Phone/English/1Pmin.mp3"),
            due: require("../assets/Audio/Phone/English/Pdue.mp3"),
            missed: require("../assets/Audio/Phone/English/PMissed.mp3"),
        },
        whatsapp: {
            5: require("../assets/Audio/Whatsapp/English/W5min.mp3"),
            4: require("../assets/Audio/Whatsapp/English/W4min.mp3"),
            3: require("../assets/Audio/Whatsapp/English/W3min.mp3"),
            2: require("../assets/Audio/Whatsapp/English/W2min.mp3"),
            1: require("../assets/Audio/Whatsapp/English/W1min.mp3"),
            due: require("../assets/Audio/Whatsapp/English/Wdue.mp3"),
            missed: require("../assets/Audio/Whatsapp/English/WMissed.mp3"),
        },
        email: {
            5: require("../assets/Audio/Email/English/E5min.mp3"),
            4: require("../assets/Audio/Email/English/E4min.mp3"),
            3: require("../assets/Audio/Email/English/E3min.mp3"),
            2: require("../assets/Audio/Email/English/E2min.mp3"),
            1: require("../assets/Audio/Email/English/E1min.mp3"),
            due: require("../assets/Audio/Email/English/Edue.mp3"),
            missed: require("../assets/Audio/Email/English/EMissed.mp3"),
        },
        meeting: {
            5: require("../assets/Audio/Meeting/English/M5min.mp3"),
            4: require("../assets/Audio/Meeting/English/M4min.mp3"),
            3: require("../assets/Audio/Meeting/English/M3min.mp3"),
            2: require("../assets/Audio/Meeting/English/M2min.mp3"),
            1: require("../assets/Audio/Meeting/English/M1min.mp3"),
            due: require("../assets/Audio/Meeting/English/Mdue.mp3"),
            missed: require("../assets/Audio/Meeting/English/Emissed.mp3"),
        },
    },
    ta: {
        phone: {
            5: require("../assets/Audio/Phone/Tamil/T5min.mp3"),
            4: require("../assets/Audio/Phone/Tamil/T4min.mp3"),
            3: require("../assets/Audio/Phone/Tamil/T3min.mp3"),
            2: require("../assets/Audio/Phone/Tamil/T2min.mp3"),
            1: require("../assets/Audio/Phone/Tamil/T1min.mp3"),
            due: require("../assets/Audio/Phone/Tamil/TDue.mp3"),
            missed: require("../assets/Audio/Phone/Tamil/TMissed.mp3"),
        },
        whatsapp: {
            5: require("../assets/Audio/Whatsapp/Tamil/WT5min.mp3"),
            4: require("../assets/Audio/Whatsapp/Tamil/WT4min.mp3"),
            3: require("../assets/Audio/Whatsapp/Tamil/WT3min.mp3"),
            2: require("../assets/Audio/Whatsapp/Tamil/WT2min.mp3"),
            1: require("../assets/Audio/Whatsapp/Tamil/WT1min.mp3"),
            due: require("../assets/Audio/Whatsapp/Tamil/WTdue.mp3"),
            missed: require("../assets/Audio/Whatsapp/Tamil/WTMissed.mp3"),
        },
        email: {
            5: require("../assets/Audio/Email/Tamil/ET5min.mp3"),
            4: require("../assets/Audio/Email/Tamil/ET4min.mp3"),
            3: require("../assets/Audio/Email/Tamil/ET3min.mp3"),
            2: require("../assets/Audio/Email/Tamil/ET2min.mp3"),
            1: require("../assets/Audio/Email/Tamil/ET1min.mp3"),
            due: require("../assets/Audio/Email/Tamil/ETdue.mp3"),
            missed: require("../assets/Audio/Email/Tamil/ETMissed.mp3"),
        },
        meeting: {
            5: require("../assets/Audio/Meeting/Tamil/MT5min.mp3"),
            4: require("../assets/Audio/Meeting/Tamil/MT4min.mp3"),
            3: require("../assets/Audio/Meeting/Tamil/MT3min.mp3"),
            2: require("../assets/Audio/Meeting/Tamil/MT2min.mp3"),
            1: require("../assets/Audio/Meeting/Tamil/MT1min.mp3"),
            due: require("../assets/Audio/Meeting/Tamil/MTDue.mp3"),
            missed: require("../assets/Audio/Meeting/Tamil/MTMissed.mp3"),
        },
    },
};

const playAudioModule = async (moduleRef) => {
    try {
        if (!moduleRef || Platform.OS === "web") return false;
        await ensureAudioMode();
        await stopActiveFollowupSound();
        const { sound } = await Audio.Sound.createAsync(moduleRef, { shouldPlay: true });
        activeFollowupSound = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
            if (!status || !status.isLoaded) return;
            if (status.didJustFinish) {
                sound.unloadAsync().catch(() => { });
                if (activeFollowupSound === sound) activeFollowupSound = null;
            }
        });
        return true;
    } catch {
        return false;
    }
};

export const playAudioForNotificationData = async (data = {}) => {
    try {
        const type = String(data?.type || "").trim();
        if (!type) return false;
        if (Platform.OS === "web") return false;

        if (
            type !== "followup-soon" &&
            type !== "followup-due" &&
            type !== "followup-missed"
        ) {
            return false;
        }

        const lang = await getNotificationVoiceLanguage();
        const activityKey = normalizeActivityKeyForAudio(data?.activityType);
        const pack = AUDIO_MODULES[lang] || AUDIO_MODULES.en;
        const entry = pack?.[activityKey] || null;
        if (!entry) return false;

        if (type === "followup-soon") {
            const minutesLeft = Math.max(1, Math.round(Number(data?.minutesLeft || 0)));
            if (minutesLeft >= 1 && minutesLeft <= 5 && entry[minutesLeft]) {
                return await playAudioModule(entry[minutesLeft]);
            }
            return false;
        }

        if (type === "followup-due") {
            return await playAudioModule(entry.due);
        }

        if (type === "followup-missed") {
            return await playAudioModule(entry.missed);
        }

        return false;
    } catch {
        return false;
    }
};

const resolveChannelId = (channelId = "default") =>
    CHANNEL_IDS[channelId] || channelId;

const scheduleDateNotification = async ({
    when,
    title,
    body,
    subtitle = "Tap to open Follow-ups",
    data = {},
    channelId = "followups",
    color = "#0EA5E9",
    sound = "default",
    sticky = false,
    priority = "high",
    vibrate = [0, 250, 250, 250],
    categoryIdentifier = CATEGORY_IDS.followups,
}) => {
    const resolvedChannelId = resolveChannelId(channelId);
	    return Notifications.scheduleNotificationAsync({
	        content: {
	            title,
	            body,
	            subtitle,
	            data,
	            categoryIdentifier,
	            sound,
	            vibrate,
	            android: {
	                channelId: resolvedChannelId,
	                color,
	                priority,
	                sticky,
	            },
	        },
	        trigger: buildDateTrigger(when),
	    });
	};

const buildDateTrigger = (date) => ({ type: DATE_TRIGGER_TYPE, date });

const buildDailyTrigger = (hour, minute) => ({
    type: DAILY_TRIGGER_TYPE,
    hour,
    minute,
    repeats: true,
});

const getChannelMeta = (channelId = "default") =>
    NOTIFICATION_CHANNELS[channelId] || {
        name: "default",
        lightColor: "#2563EB",
        vibrationPattern: [0, 220, 160, 220],
    };

const scheduleImmediateNotification = async ({
    title,
    body,
    subtitle = "",
    data = {},
    channelId = "default",
    color = "#2563EB",
    badge = 1,
    sticky = false,
    priority = "high",
    vibrate,
}) => {
    if (!isNotificationSupported()) {
        return null;
    }

    const channelMeta = getChannelMeta(channelId);
    const vibrationPattern = vibrate || channelMeta.vibrationPattern;
    const resolvedChannelId = resolveChannelId(channelId);

    return Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            subtitle,
            data,
            sound: "default",
	            vibrate: vibrationPattern,
	            badge,
	            ios: {
	                badge,
	            },
	            android: {
	                channelId: resolvedChannelId,
	                color,
	                vibrate: vibrationPattern,
	                priority,
	                sticky,
	            },
	        },
	        trigger: null,
	    });
	};

// Configure notification behavior (only on supported platforms)
if (isNotificationSupported()) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}

// Initialize notifications
export const initializeNotifications = async () => {
    try {
        // Skip notifications on web platform
        if (Platform.OS === "web") {
            console.log("Notifications not supported on web platform");
            return false;
        }

        const existingPermission = await Notifications.getPermissionsAsync();
        if (existingPermission.status !== "granted" && existingPermission.canAskAgain !== false) {
            const hasExplained =
                (await AsyncStorage.getItem(NOTIFICATION_PERMISSION_EXPLAINED_KEY)) === "true";
            if (!hasExplained) {
                const confirmed = await confirmPermissionRequest({
                    title: "Allow notifications?",
                    message:
                        "We use notifications for follow-up reminders and important app alerts. You can change this later in device settings.",
                    confirmText: "Allow",
                });
                await AsyncStorage.setItem(NOTIFICATION_PERMISSION_EXPLAINED_KEY, "true");
                if (!confirmed) {
                    return false;
                }
            }
        }

        // Request permissions for both iOS and Android
        const { status } = await Notifications.requestPermissionsAsync();
        console.log(`Notification permission status: ${status}`);

        if (status !== "granted") {
            console.warn("Notification permission not granted");
            try {
                const latest = await Notifications.getPermissionsAsync();
                if (Platform.OS === "android" && latest?.canAskAgain === false) {
                    const openSettings = await confirmPermissionRequest({
                        title: "Notifications are off",
                        message:
                            "Notifications are disabled in device settings. Open settings to enable follow-up reminders?",
                        confirmText: "Open Settings",
                    });
                    if (openSettings) {
                        await openAndroidNotificationSettings();
                    }
                }
            } catch {
                // ignore
            }
            // Still continue, but user won't see notifications
        }

        // For Android: Set notification channel
        if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.default, {
                name: "default",
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#FF231F7C",
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });

            // Channel for follow-ups
            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.followups, {
                name: NOTIFICATION_CHANNELS.followups.name,
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: NOTIFICATION_CHANNELS.followups.vibrationPattern,
                lightColor: NOTIFICATION_CHANNELS.followups.lightColor,
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });

            // Follow-up voice channels (custom sounds). NOTE: Android channels cannot change sound after creation.
            for (const key of [
                "followups_soon_en",
                "followups_due_en",
                "followups_missed_en",
                "followups_soon_ta",
                "followups_due_ta",
                "followups_missed_ta",
            ]) {
                const meta = NOTIFICATION_CHANNELS[key];
                const id = CHANNEL_IDS[key];
                if (!meta || !id) continue;
                await Notifications.setNotificationChannelAsync(id, {
                    name: meta.name,
                    importance: Notifications.AndroidImportance.HIGH,
                    vibrationPattern: meta.vibrationPattern,
                    lightColor: meta.lightColor,
                    sound: meta.sound || "default",
                    enableVibrate: true,
                    enableLights: true,
                });
            }

            // Channel for enquiries
            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.enquiries, {
                name: NOTIFICATION_CHANNELS.enquiries.name,
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: NOTIFICATION_CHANNELS.enquiries.vibrationPattern,
                lightColor: NOTIFICATION_CHANNELS.enquiries.lightColor,
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });

            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.coupons, {
                name: NOTIFICATION_CHANNELS.coupons.name,
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: NOTIFICATION_CHANNELS.coupons.vibrationPattern,
                lightColor: NOTIFICATION_CHANNELS.coupons.lightColor,
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });

            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.team_chat, {
                name: NOTIFICATION_CHANNELS.team_chat.name,
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: NOTIFICATION_CHANNELS.team_chat.vibrationPattern,
                lightColor: NOTIFICATION_CHANNELS.team_chat.lightColor,
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });

	            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.billing, {
	                name: NOTIFICATION_CHANNELS.billing.name,
	                importance: Notifications.AndroidImportance.HIGH,
	                vibrationPattern: NOTIFICATION_CHANNELS.billing.vibrationPattern,
	                lightColor: NOTIFICATION_CHANNELS.billing.lightColor,
	                sound: "default",
	                enableVibrate: true,
	                enableLights: true,
	            });

	            await Notifications.setNotificationChannelAsync(CHANNEL_IDS.reports, {
	                name: NOTIFICATION_CHANNELS.reports.name,
	                importance: Notifications.AndroidImportance.DEFAULT,
	                vibrationPattern: NOTIFICATION_CHANNELS.reports.vibrationPattern,
	                lightColor: NOTIFICATION_CHANNELS.reports.lightColor,
	                sound: "default",
	                enableVibrate: true,
	                enableLights: true,
	            });
	        }

        // Actions (Complete / Cancel) for follow-up notifications.
        try {
            await Notifications.setNotificationCategoryAsync(
                CATEGORY_IDS.followups,
                [
                    {
                        identifier: "FOLLOWUP_COMPLETE",
                        buttonTitle: "Complete",
                        options: { opensAppToForeground: true },
                    },
                    {
                        identifier: "FOLLOWUP_CANCEL",
                        buttonTitle: "Cancel",
                        options: { opensAppToForeground: false },
                    },
                ],
                {
                    previewPlaceholder: "Update follow-up",
                },
            );
        } catch (_categoryError) {
            // ignore category errors
        }

        // Actions (Yes / No) prompt to add next follow-up.
        try {
            await Notifications.setNotificationCategoryAsync(
                CATEGORY_IDS.next_followup,
                [
                    {
                        identifier: "NEXT_FOLLOWUP_YES",
                        buttonTitle: "Yes",
                        options: { opensAppToForeground: true },
                    },
                    {
                        identifier: "NEXT_FOLLOWUP_NO",
                        buttonTitle: "No",
                        options: { opensAppToForeground: false },
                    },
                ],
                {
                    previewPlaceholder: "Add next follow-up",
                },
            );
        } catch (_categoryError) {
            // ignore category errors
        }

        console.log("Notifications initialized successfully");
        return true;
    } catch (error) {
        console.error("Failed to initialize notifications:", error);
        return false;
    }
};

// Show local notification for today's follow-ups
export const showFollowUpNotification = async (
    followUpCount,
    followUpData = [],
) => {
    try {
        if (followUpCount === 0) return null;

        return await scheduleImmediateNotification({
            title: "Today's follow-ups",
            body:
                followUpCount === 1
                    ? `You have ${followUpCount} follow-up to complete today`
                    : `You have ${followUpCount} follow-ups to complete today`,
            subtitle: "Tap to open follow-ups",
            channelId: "followups",
            color: "#0EA5E9",
            badge: followUpCount,
            data: {
                followUpCount,
                followUpList: JSON.stringify(followUpData),
                type: "followup-summary",
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show notification:", error);
        return null;
    }
};

// Show urgent follow-up notification (overdue)
export const showUrgentNotification = async (
    overdueCount,
    overdueData = [],
) => {
    try {
        if (overdueCount === 0) return null;

        return await scheduleImmediateNotification({
            title: "Overdue follow-ups",
            body:
                overdueCount === 1
                    ? `You have ${overdueCount} overdue follow-up!`
                    : `You have ${overdueCount} overdue follow-ups!`,
            subtitle: "Tap to review pending work",
            channelId: "followups",
            color: "#DC2626",
            badge: overdueCount,
            sticky: true,
            vibrate: [0, 500, 250, 500],
            data: {
                overdueCount,
                overdueList: JSON.stringify(overdueData),
                type: "urgent",
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show urgent notification:", error);
        return null;
    }
};

// Show success notification for new enquiry
export const showEnquirySuccessNotification = async (enquiryData) => {
    try {
        if (!isNotificationSupported()) {
            return;
        }

        return await scheduleImmediateNotification({
            title: "New enquiry added",
            body: `${enquiryData.name} - ${enquiryData.product}`,
            subtitle: "Successfully recorded",
            channelId: "enquiries",
            color: "#16A34A",
            data: {
                type: "enquiry-success",
                enquiryId: enquiryData.id || enquiryData._id,
                enquiryName: enquiryData.name,
                product: enquiryData.product,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show enquiry success notification:", error);
        return null;
    }
};

// Show notification for new enquiry alert (admin/lead staff)
export const showNewEnquiryAlertNotification = async (enquiryData) => {
    try {
        if (!isNotificationSupported()) {
            return;
        }

        return await scheduleImmediateNotification({
            title: "New enquiry alert",
            body: `New enquiry from ${enquiryData.name}`,
            subtitle: enquiryData.product,
            channelId: "enquiries",
            color: "#0EA5E9",
            data: {
                type: "new-enquiry-alert",
                enquiryId: enquiryData.id || enquiryData._id,
                enquiryName: enquiryData.name,
                product: enquiryData.product,
                source: enquiryData.source,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show new enquiry alert notification:", error);
        return null;
    }
};

export const showCouponOfferNotification = async (couponData) => {
    try {
        if (!isNotificationSupported()) {
            return;
        }

        const code = String(couponData?.code || "").toUpperCase();
        const title = couponData?.title || "Special offer available";
        const body =
            couponData?.body ||
            (code
                ? `You have a special offer today. Use coupon ${code}.`
                : "You have a special offer today. Please check now.");

        return await scheduleImmediateNotification({
            title,
            body,
            subtitle: code ? `Coupon ${code}` : "Coupon offer",
            channelId: "coupons",
            color: "#2563EB",
            data: {
                type: "coupon-offer",
                couponId: couponData?.couponId || "",
                code,
                discountType: couponData?.discountType || "",
                discountValue: Number(couponData?.discountValue || 0),
                expiryDate: couponData?.expiryDate || null,
                timestamp: couponData?.timestamp || new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show coupon notification:", error);
    }
};

export const showTeamChatNotification = async (messageData = {}) => {
    try {
        if (!isNotificationSupported()) {
            return null;
        }

        const senderName = String(
            messageData?.senderId?.name || messageData?.senderName || "Team member",
        ).trim();
        const messageType = String(messageData?.messageType || "text").trim().toLowerCase();
        const taskTitle = String(messageData?.taskId?.title || messageData?.taskTitle || "").trim();
        const bodyText = String(messageData?.message || "").trim();

        let title = senderName;
        let body = bodyText || "Sent a new message";

        if (messageType === "task") {
            title = `${senderName} assigned a task`;
            body = taskTitle || bodyText || "Tap to open team chat";
        } else if (messageType === "image") {
            body = "Sent an image";
        } else if (messageType === "audio") {
            body = "Sent a voice message";
        } else if (messageType === "document") {
            body = "Sent a document";
        } else if (messageType === "call") {
            body = bodyText || "Shared a call update";
        }

        return await scheduleImmediateNotification({
            title,
            body,
            subtitle: "Team Chat",
            channelId: "team_chat",
            color: "#0F766E",
            data: {
                type: "team-chat-message",
                senderId: String(messageData?.senderId?._id || messageData?.senderId || ""),
                receiverId: String(messageData?.receiverId?._id || messageData?.receiverId || ""),
                messageId: String(messageData?._id || ""),
                taskId: String(messageData?.taskId?._id || messageData?.taskId || ""),
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show team chat notification:", error);
        return null;
    }
};

export const showBillingPlanNotification = async ({
    title,
    body,
    code = "billing-alert",
    expiry = null,
    reason = "",
} = {}) => {
    try {
        if (!isNotificationSupported() || !title || !body) {
            return null;
        }

        return await scheduleImmediateNotification({
            title,
            body,
            subtitle: "Tap to review your plan",
            channelId: "billing",
            color: "#F59E0B",
            data: {
                type: "billing-alert",
                code,
                expiry,
                reason,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show billing notification:", error);
        return null;
    }
};

// Show error notification for failed enquiry creation
export const showEnquiryErrorNotification = async (errorMessage) => {
    try {
        // Skip notifications on web platform
        if (!isNotificationSupported()) {
            return;
        }

        console.log("Sending enquiry error notification...", errorMessage);

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: "❌ Enquiry Creation Failed",
                body:
                    errorMessage || "Could not save enquiry. Please try again.",
                data: {
                    type: "enquiry-error",
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 300, 150, 300],
                badge: 1,
	                ios: {
	                    badge: 1,
	                },
	                android: {
	                    channelId: resolveChannelId("enquiries"),
	                    color: "#DC2626",
	                    vibrate: [0, 300, 150, 300],
	                    priority: "high",
	                    sticky: true,
	                },
            },
            trigger: null, // Send immediately
        });

        console.log(
            "❌ Enquiry error notification sent (ID:",
            notificationId,
            ")",
        );
        return notificationId;
    } catch (error) {
        console.error("Failed to show enquiry error notification:", error);
    }
};

// Show notification for enquiry status change
export const showEnquiryStatusNotification = async (enquiryName, newStatus) => {
    try {
        const statusEmojis = {
            new: "🆕",
            "in progress": "⏳",
            converted: "✨",
            closed: "🔒",
            dropped: "❌",
        };

        const emoji = statusEmojis[newStatus?.toLowerCase()] || "📝";

        console.log("Sending status notification...", {
            enquiryName,
            newStatus,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: `${emoji} Enquiry Status Updated`,
                body: `${enquiryName}: ${newStatus}`,
                data: {
                    type: "enquiry-status",
                    enquiryName,
                    status: newStatus,
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 200, 200],
                badge: 1,
	                ios: {
	                    badge: 1,
	                },
	                android: {
	                    channelId: resolveChannelId("enquiries"),
	                    color: "#0EA5E9",
	                    vibrate: [0, 200, 200],
	                    priority: "default",
	                    sticky: false,
	                },
            },
            trigger: null, // Send immediately
        });

        console.log(
            `${emoji} Status notification sent: ${enquiryName} → ${newStatus} (ID: ${notificationId})`,
        );
    } catch (error) {
        console.error("Failed to show enquiry status notification:", error);
    }
};

// Schedule daily notification at specific time
export const scheduleDailyNotification = (hour = 9, minute = 0) => {
    try {
	        const trigger = buildDailyTrigger(hour, minute);

        Notifications.scheduleNotificationAsync({
            content: {
                title: "⏰ Daily Follow-up Reminder",
                body: "Check your follow-ups for today",
                data: {
                    type: "daily-reminder",
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 250, 250, 250],
	                ios: {},
	                android: {
	                    channelId: resolveChannelId("followups"),
	                    color: "#0EA5E9",
	                },
            },
            trigger,
        });

        console.log(`Daily notification scheduled for ${hour}:${minute}`);
    } catch (error) {
        console.error("Failed to schedule daily notification:", error);
    }
};

// Get all pending notifications
export const getPendingNotifications = async () => {
    try {
        const notifications =
            await Notifications.getAllScheduledNotificationsAsync();
        return notifications;
    } catch (error) {
        console.error("Failed to get pending notifications:", error);
        return [];
    }
};

// Cancel all pending notifications
export const cancelAllNotifications = async () => {
    try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        console.log("All notifications cancelled");
    } catch (error) {
        console.error("Failed to cancel notifications:", error);
    }
};

// Cancel specific notification
export const cancelNotification = async (notificationId) => {
    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        console.log(`Notification ${notificationId} cancelled`);
    } catch (error) {
        console.error("Failed to cancel notification:", error);
    }
};

// Get device push token (for remote notifications from server)
export const getDevicePushToken = async () => {
    try {
        // Check if running in Expo Go (storeClient)
        // Push notifications are removed from Expo Go in newer SDKs
        if (
            Constants.executionEnvironment === "storeClient" ||
            Constants.appOwnership === "expo"
        ) {
            console.log(
                "Push notifications are not supported in Expo Go. Skipping token fetch.",
            );
            return null;
        }

        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ||
            Constants?.easConfig?.projectId;

        if (!projectId) {
            console.log("Project ID not found - cannot get push token");
            return null;
        }

        const token = await Notifications.getExpoPushTokenAsync({
            projectId: projectId,
        });

        console.log("Push token:", token.data);
        return token.data;
    } catch (error) {
        console.error("Failed to get push token:", error);
        return null;
    }
};

// Listen for notification responses
export const setupNotificationListener = (callback) => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
            const notification = response.notification;
            console.log(
                "Notification tapped:",
                notification.request.content.data,
            );

            if (callback) {
                callback(notification.request.content.data);
            }
        },
    );

    return subscription;
};

// Setup notification received listener (for when app is in foreground)
export const setupForegroundNotificationListener = (callback) => {
    // Skip on web platform
    if (!isNotificationSupported()) {
        return { remove: () => { } }; // Return dummy subscription
    }

    const subscription = Notifications.addNotificationReceivedListener(
        (notification) => {
            console.log(
                "Notification received (foreground):",
                notification.request.content.data,
            );

            if (callback) {
                callback(notification.request.content.data);
            }
        },
    );

    return subscription;
};

export const speakForNotificationData = async (data = {}) => {
    const type = String(data?.type || "").trim();
    if (!type) return;
    const lang = await getNotificationVoiceLanguage();

    // Prefer pre-recorded MP3 reminders (when app is foreground) over TTS.
    const audioPlayed = await playAudioForNotificationData(data);
    if (audioPlayed) return;

    if (
        type === "hourly-followup-reminder" ||
        type === "daily-reminder" ||
        type === "followup-soon" ||
        type === "followup-due" ||
        type === "followup-missed"
    ) {
        const name = String(data?.name || "").trim();
        const activityType = String(data?.activityType || "follow-up").trim();
        if (type === "followup-soon") {
            const minutesLeft = Number(data?.minutesLeft || 0);
            if (minutesLeft > 0) {
                const t = String(activityType || "").trim().toLowerCase();
                if (t === "phone call") {
                    if (lang === "ta") {
                        const line = minutesLeft === 1
                            ? "வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் 1 நிமிடத்தில் அழைக்கவும்."
                            : `வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் ${minutesLeft} நிமிடங்களில் அழைக்கவும்.`;
                        await safeSpeak(line);
                    } else {
                        const line = name
                            ? `Your customer is waiting. Call ${name} in ${minutesLeft} minutes.`
                            : `Your customer is waiting. Call in ${minutesLeft} minutes.`;
                        await safeSpeak(line);
                    }
                } else {
                    if (lang === "ta") {
                        const minsLabel = minutesLeft === 1 ? "1 நிமிடத்தில்" : `${minutesLeft} நிமிடங்களில்`;
                        if (t === "whatsapp") {
                            await safeSpeak(`வாட்ஸ்அப் பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`);
                        } else if (t === "email") {
                            await safeSpeak(`மின்னஞ்சல் பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`);
                        } else if (t === "meeting") {
                            await safeSpeak(`ஆன்லைன் சந்திப்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`);
                        } else {
                            await safeSpeak(`பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`);
                        }
                    } else {
                        const line = name
                            ? `${activityType} for ${name} in ${minutesLeft} minutes.`
                            : `${activityType} in ${minutesLeft} minutes.`;
                        await safeSpeak(line);
                    }
                }
            }
            return;
        }
        if (type === "followup-missed") {
            const t = String(activityType || "").trim().toLowerCase();
            if (lang === "ta") {
                if (t === "phone call") {
                    await safeSpeak("நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.");
                } else if (t === "whatsapp") {
                    await safeSpeak("நீங்கள் வாட்ஸ்அப் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது வாட்ஸ்அப் செய்தி அனுப்பவும்.");
                } else if (t === "email") {
                    await safeSpeak("நீங்கள் மின்னஞ்சல் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது மின்னஞ்சல் அனுப்பவும்.");
                } else if (t === "meeting") {
                    await safeSpeak("நீங்கள் ஆன்லைன் சந்திப்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது இணைக.");
                } else {
                    await safeSpeak("நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது தொடரவும்.");
                }
            } else {
                const line = name ? `${name}, ${activityType} missed.` : `${activityType} missed.`;
                await safeSpeak(`${line} Please follow up now.`);
            }
            return;
        }
        if (type === "followup-due") {
            const t = String(activityType || "").trim().toLowerCase();
            if (lang === "ta") {
                if (t === "phone call") {
                    await safeSpeak("வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.");
                } else if (t === "whatsapp") {
                    await safeSpeak("இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம். தயவு செய்து வாட்ஸ்அப் செய்தி அனுப்பவும்.");
                } else if (t === "email") {
                    await safeSpeak("இப்போது மின்னஞ்சல் பின்தொடர்பு நேரம். தயவு செய்து மின்னஞ்சல் அனுப்பவும்.");
                } else if (t === "meeting") {
                    await safeSpeak("இப்போது ஆன்லைன் சந்திப்பு நேரம். தயவு செய்து இணைக.");
                } else {
                    await safeSpeak("இப்போது பின்தொடர்பு நேரம். தயவு செய்து தொடரவும்.");
                }
            } else {
                const line = name ? `${name}, ${activityType} due now.` : `${activityType} due now.`;
                await safeSpeak(line);
            }
            return;
        }
        if (type === "hourly-followup-reminder") {
            const count = Number(data?.followUpCount || 0);
            if (count > 0) {
                if (lang === "ta") await safeSpeak(`இன்று உங்களுக்கு ${count} பின்தொடர்புகள் உள்ளன.`);
                else await safeSpeak(`You have ${count} follow ups due today.`);
            }
            return;
        }
        if (type === "daily-reminder") {
            const count = Number(data?.followUpCount || 0);
            if (count > 0) {
                if (lang === "ta") await safeSpeak(`நினைவூட்டு. இன்று உங்களுக்கு ${count} பின்தொடர்புகள் உள்ளன.`);
                else await safeSpeak(`Reminder. You have ${count} follow ups today.`);
            }
            return;
        }
    }

    if (type === "followup-missed-summary" || data?.overdueCount) {
        const count = Number(data?.overdueCount || 0);
        if (count > 0) await safeSpeak(`You have ${count} missed follow ups.`);
    }

    if (
        type === "enquiry-success" ||
        type === "new-enquiry-alert" ||
        type === "enquiry-status" ||
        type === "enquiry-error"
    ) {
        const enquiryName = String(data?.enquiryName || "").trim();
        if (type === "enquiry-success") {
            await safeSpeak(enquiryName ? `New enquiry added. ${enquiryName}.` : "New enquiry added.");
            return;
        }
        if (type === "new-enquiry-alert") {
            await safeSpeak(enquiryName ? `New enquiry. ${enquiryName}.` : "New enquiry alert.");
            return;
        }
        if (type === "enquiry-status") {
            const status = String(data?.status || "").trim();
            await safeSpeak(
                enquiryName && status ? `${enquiryName} status updated to ${status}.` : "Enquiry status updated.",
            );
            return;
        }
        if (type === "enquiry-error") {
            await safeSpeak("Enquiry creation failed. Please try again.");
        }
    }
};

export const notifyMissedFollowUpsSummary = async (followUps = []) => {
    try {
        if (!isNotificationSupported()) return { notified: false, skipped: true };

        const list = Array.isArray(followUps) ? followUps : [];
        const count = list.filter(isActiveFollowUp).length;
        if (count <= 0) return { notified: false, skipped: true, reason: "none" };

        const todayKey = getTodayKey();
        const rawState = await AsyncStorage.getItem(MISSED_FOLLOWUP_ALERT_STATE_KEY);
        let prev = { dateKey: "", count: 0 };
        try {
            prev = rawState ? JSON.parse(rawState) : prev;
        } catch {}

        if (prev?.dateKey === todayKey && Number(prev?.count || 0) === count) {
            return { notified: false, skipped: true, reason: "no-change" };
        }

        await AsyncStorage.setItem(
            MISSED_FOLLOWUP_ALERT_STATE_KEY,
            JSON.stringify({ dateKey: todayKey, count }),
        );

        const body =
            count === 1
                ? "You have 1 missed follow-up. Tap to open Follow-ups."
                : `You have ${count} missed follow-ups. Tap to open Follow-ups.`;

        await scheduleImmediateNotification({
            title: "Missed follow-ups",
            body,
            channelId: "followups",
            color: "#FF9500",
            badge: count,
            data: {
                type: "followup-missed-summary",
                overdueCount: count,
                timestamp: new Date().toISOString(),
            },
        });

        // Speak only when app is active (foreground listener also covers it).
        await safeSpeak(
            count === 1 ? "You have 1 missed follow up." : `You have ${count} missed follow ups.`,
        );

        return { notified: true, skipped: false, count };
    } catch (error) {
        console.error("Failed to notify missed follow-ups:", error);
        return { notified: false, skipped: false, error: true };
    }
};

// Check for today's follow-ups and show notification
export const checkAndNotifyTodayFollowUps = async (followUps) => {
    try {
        if (!Array.isArray(followUps) || followUps.length === 0) {
            console.log("No follow-ups available");
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateString = today.toDateString();

        // Check if we already notified today
        const lastNotificationDate = await AsyncStorage.getItem("lastNotificationDate");
        if (lastNotificationDate === dateString) {
            console.log("Already notified today, skipping...");
            return;
        }

        // Filter today's follow-ups
        const todayFollowUps = followUps.filter((item) => {
            const followUpDate = new Date(item.date);
            followUpDate.setHours(0, 0, 0, 0);
            return followUpDate.getTime() === today.getTime();
        });

        // Filter overdue follow-ups
        const overdueFollowUps = followUps.filter((item) => {
            const followUpDate = new Date(item.date);
            followUpDate.setHours(0, 0, 0, 0);
            return followUpDate < today;
        });

        console.log(`Today's follow-ups: ${todayFollowUps.length}`);
        console.log(`Overdue follow-ups: ${overdueFollowUps.length}`);

        let notificationSent = false;

        // Show urgent notification if there are overdue
        if (overdueFollowUps.length > 0) {
            await showUrgentNotification(overdueFollowUps.length, overdueFollowUps);
            notificationSent = true;
        }

        // Show today's follow-ups notification
        if (todayFollowUps.length > 0) {
            await showFollowUpNotification(todayFollowUps.length, todayFollowUps);
            notificationSent = true;
        }

        // Mark as notified for today if any notification was sent
        if (notificationSent) {
            await AsyncStorage.setItem("lastNotificationDate", dateString);
        }

    } catch (error) {
        console.error("Failed to check and notify follow-ups:", error);
    }
};

const getTodayKey = () => new Date().toDateString();

const isActiveFollowUp = (item) => {
    const status = String(item?.status || "").toLowerCase();
    const nextAction = String(item?.nextAction || "").toLowerCase();
    if (!status) return true;
    if (status === "completed") return false;
    if (status === "drop" || status === "dropped") return false;
    if (nextAction === "drop" || nextAction === "dropped") return false;
    return true;
};

const isDueToday = (item) => {
    const raw = item?.date || item?.followUpDate || item?.nextFollowUpDate;
    if (!raw) return false;

    let d;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yy, mm, dd] = raw.split("-").map((n) => Number(n));
        d = new Date(yy, (mm || 1) - 1, dd || 1);
    } else {
        d = new Date(raw);
    }

    if (Number.isNaN(d.getTime())) return false;
    return d.toDateString() === getTodayKey();
};

const getPrettyFollowUpLine = (activityType, name) => {
    const who = (name || "your client").trim();
    const type = String(activityType || "").trim().toLowerCase();

    if (type === "whatsapp") return `WhatsApp ${who}: quick update + next step.`;
    if (type === "email") return `Email ${who}: short recap + ask for confirmation.`;
    if (type === "meeting") return `Meeting ${who}: confirm time + share agenda.`;
    if (type === "phone call") return `Your customer is waiting. Please call ${who} now.`;
    return `Follow up with ${who} now.`;
};

const resolveEnquiryKeyFromItem = (item) => {
    const rawId =
        item?.enqId ||
        item?.enquiryId ||
        item?.enquiry?._id ||
        item?.enquiry?.id ||
        item?.enquiry ||
        "";
    const rawNo = item?.enqNo || item?.enquiry?.enqNo || item?.enquiryNo || "";

    const normalizeId = (v) => {
        if (!v) return "";
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
            if (v._id) return String(v._id).trim();
            if (v.id) return String(v.id).trim();
            if (v.toString && v.toString !== Object.prototype.toString) {
                const s = String(v.toString()).trim();
                if (s && s !== "[object Object]") return s;
            }
        }
        const s = String(v).trim();
        return s === "[object Object]" ? "" : s;
    };

    return {
        enqId: normalizeId(rawId),
        enqNo: String(rawNo || "").trim(),
    };
};

const buildSoonContent = (item, when, minutesLeft, lang = "en") => {
    const name = String(item?.name || "Client").trim();
    const activityType = String(item?.activityType || item?.type || "Follow-up").trim();
    const mins = Math.max(1, Math.round(Number(minutesLeft || 0)));

    const texts = getFollowUpSoonTexts({ lang, name, activityType, minutesLeft: mins });
    const due = buildDueAtContent(item, when, lang);
    return {
        title: texts.title,
        body: texts.body,
        data: { ...due.data, type: "followup-soon", minutesLeft: mins, name, activityType },
    };
};

const buildHourlyFollowUpContent = (todayFollowUps, tipIndex = 0) => {
    const list = Array.isArray(todayFollowUps) ? todayFollowUps : [];
    const count = list.length;

    const safe = (v) => String(v || "").trim();
    const first = list[tipIndex % Math.max(1, list.length)] || list[0] || null;
    const firstName = safe(first?.name);
    const firstType = safe(first?.activityType || first?.type);
    const firstTime = safe(first?.time);
    const timeNote = firstTime ? ` at ${firstTime}` : "";

    const title = "Hourly follow-up reminder";
    const line = `${getPrettyFollowUpLine(firstType, firstName)}${timeNote}`;
    const body =
        count === 1
            ? `1 follow-up due today. ${line}`
            : `${count} follow-ups due today. ${line}`;

    return {
        title,
        body,
        data: {
            type: "hourly-followup-reminder",
            followUpCount: count,
            followUpList: JSON.stringify(list.slice(0, 25)),
            timestamp: new Date().toISOString(),
        },
    };
};

export const cancelHourlyFollowUpReminders = async () => {
    try {
        if (Platform.OS === "web") return;

        const raw = await AsyncStorage.getItem(HOURLY_FOLLOWUP_SCHEDULE_KEY);
        const schedule = raw ? JSON.parse(raw) : null;
        const ids = Array.isArray(schedule?.ids) ? schedule.ids : [];

        for (const id of ids) {
            try {
                await Notifications.cancelScheduledNotificationAsync(id);
            } catch (e) {
                // ignore per-id cancellation failures
            }
        }

        await AsyncStorage.removeItem(HOURLY_FOLLOWUP_SCHEDULE_KEY);
        console.log(`Cancelled ${ids.length} hourly follow-up reminders`);
    } catch (error) {
        console.error("Failed to cancel hourly follow-up reminders:", error);
    }
};

export const cancelTimeFollowUpReminders = async () => {
    try {
        if (Platform.OS === "web") return;

        const raw = await AsyncStorage.getItem(TIME_FOLLOWUP_SCHEDULE_KEY);
        const schedule = raw ? JSON.parse(raw) : null;
        const ids = Array.isArray(schedule?.ids) ? schedule.ids : [];

        for (const id of ids) {
            try {
                await Notifications.cancelScheduledNotificationAsync(id);
            } catch (e) {
                // ignore per-id cancellation failures
            }
        }

        await AsyncStorage.removeItem(TIME_FOLLOWUP_SCHEDULE_KEY);
        console.log(`Cancelled ${ids.length} time-based follow-up reminders`);
    } catch (error) {
        console.error("Failed to cancel time-based follow-up reminders:", error);
    }
};

export const cancelTodayFollowUpReminders = async () => {
    await Promise.allSettled([
        cancelHourlyFollowUpReminders(),
        cancelTimeFollowUpReminders(),
    ]);
};

export const acknowledgeHourlyFollowUpReminders = async () => {
    try {
        const todayKey = getTodayKey();
        await AsyncStorage.setItem(HOURLY_FOLLOWUP_ACK_DATE_KEY, todayKey);
        // Only cancel hourly reminders. Time-based "due/missed" reminders should continue to work.
        await cancelHourlyFollowUpReminders();
    } catch (error) {
        console.error("Failed to acknowledge hourly follow-up reminders:", error);
    }
};

const formatHHmm = (date) => {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
};

const parseLocalDateTime = (dateStr, timeStr) => {
    if (!dateStr) return null;

    let d;
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [yy, mm, dd] = dateStr.split("-").map((n) => Number(n));
        d = new Date(yy, (mm || 1) - 1, dd || 1, 9, 0, 0, 0);
    } else {
        d = new Date(dateStr);
    }
    if (Number.isNaN(d.getTime())) return null;

    if (timeStr && typeof timeStr === "string") {
        const t = timeStr.trim();
        // Supports: "HH:MM", "H:MM", "HH.MM", "HH:MM:SS", optional AM/PM ("11:30 PM", "11:30PM")
        const m = t.match(
            /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
        );
        if (m) {
            let hh = Number(m[1]);
            const mm = Number(m[2] ?? "0");
            const meridian = String(m[4] || "").toUpperCase();

            if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) {
                // ignore
            } else if (meridian) {
                if (hh >= 1 && hh <= 12) {
                    if (meridian === "AM") {
                        if (hh === 12) hh = 0;
                    } else if (meridian === "PM") {
                        if (hh !== 12) hh += 12;
                    }
                    d.setHours(Math.min(23, Math.max(0, hh)), Math.min(59, Math.max(0, mm)), 0, 0);
                }
            } else {
                d.setHours(Math.min(23, Math.max(0, hh)), Math.min(59, Math.max(0, mm)), 0, 0);
            }
        }
    }

    return d;
};

const buildDueAtContent = (item, when, lang = "en") => {
    const name = String(item?.name || "Client").trim();
    const activityType = String(item?.activityType || item?.type || "Follow-up").trim();
    const timeLabel = when ? formatHHmm(when) : "";
    const { enqId, enqNo } = resolveEnquiryKeyFromItem(item);

    const texts = getFollowUpDueTexts({ lang, name, activityType, timeLabel });
    return {
        title: texts.title,
        body: texts.body,
        data: {
            type: "followup-due",
            followUpId: String(item?._id || ""),
            enqId,
            enqNo,
            name,
            activityType,
            when: when ? when.toISOString() : null,
            timestamp: new Date().toISOString(),
        },
    };
};

const buildMissedContent = (item, when, lang = "en") => {
    const name = String(item?.name || "Client").trim();
    const activityType = String(item?.activityType || item?.type || "Follow-up").trim();
    const timeLabel = when ? formatHHmm(when) : "";
    const { enqId, enqNo } = resolveEnquiryKeyFromItem(item);

    const texts = getFollowUpMissedTexts({
        lang,
        name,
        activityType,
        timeLabel: timeLabel ? `at ${timeLabel}` : "",
    });

    return {
        title: texts.title,
        body: texts.body,
        data: {
            type: "followup-missed",
            followUpId: String(item?._id || ""),
            enqId,
            enqNo,
            name,
            activityType,
            when: when ? when.toISOString() : null,
            timestamp: new Date().toISOString(),
        },
    };
};

export const scheduleHourlyFollowUpRemindersForToday = async (
    followUps,
    { endHour = 21, channelId = "followups" } = {},
) => {
    try {
        if (Platform.OS === "web") return { scheduled: 0, skipped: true };

        const todayKey = getTodayKey();
        const ackDate = await AsyncStorage.getItem(HOURLY_FOLLOWUP_ACK_DATE_KEY);
        if (ackDate === todayKey) {
            return { scheduled: 0, skipped: true, reason: "acknowledged" };
        }

        const list = Array.isArray(followUps) ? followUps : [];
        const todayFollowUps = list.filter(isActiveFollowUp).filter(isDueToday);

        if (todayFollowUps.length === 0) {
            await cancelHourlyFollowUpReminders();
            return { scheduled: 0, skipped: true, reason: "none-due" };
        }

        // Replace previous schedule for today to avoid duplicates.
        await cancelHourlyFollowUpReminders();

        const now = new Date();
        const endAt = new Date();
        endAt.setHours(endHour, 0, 0, 0);
        if (now >= endAt) {
            return { scheduled: 0, skipped: true, reason: "after-hours" };
        }

        const first = new Date(now);
        first.setMinutes(0, 0, 0);
        first.setHours(first.getHours() + 1);

        const ids = [];
        let cursor = new Date(first);
        let tipIndex = 0;

        while (cursor <= endAt) {
            const { title, body, data } = buildHourlyFollowUpContent(
                todayFollowUps,
                tipIndex,
            );

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title,
                    body,
                    subtitle: "Tap to open Follow-ups",
	                    data,
	                    sound: "default",
	                    vibrate: [0, 250, 250, 250],
	                    android: {
	                        channelId: resolveChannelId(channelId),
	                        color: "#0EA5E9",
	                        priority: "high",
	                        sticky: false,
	                    },
	                },
	                trigger: buildDateTrigger(cursor),
	            });

            ids.push(id);
            tipIndex += 1;
            cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
        }

        await AsyncStorage.setItem(
            HOURLY_FOLLOWUP_SCHEDULE_KEY,
            JSON.stringify({ dateKey: todayKey, ids }),
        );

        console.log(
            `Scheduled ${ids.length} hourly follow-up reminders (today=${todayKey}, followUps=${todayFollowUps.length})`,
        );

        return { scheduled: ids.length, skipped: false };
    } catch (error) {
        console.error("Failed to schedule hourly follow-up reminders:", error);
        return { scheduled: 0, skipped: false, error: true };
    }
};

export const scheduleTimeFollowUpRemindersForToday = async (
    followUps,
    {
        channelId = "followups",
        preRemindMinutes = DEFAULT_FOLLOWUP_PRE_REMIND_MINUTES,
        preRemindEveryMinutes = DEFAULT_FOLLOWUP_PRE_REMIND_EVERY_MINUTES,
        missedFastMinutes = DEFAULT_FOLLOWUP_MISSED_FAST_MINUTES,
        missedFastEveryMinutes = DEFAULT_FOLLOWUP_MISSED_FAST_EVERY_MINUTES,
        missedHourlyEveryMinutes = DEFAULT_FOLLOWUP_MISSED_HOURLY_EVERY_MINUTES,
        missedHourlyMaxHours = DEFAULT_FOLLOWUP_MISSED_HOURLY_MAX_HOURS,
        endHour = 21,
        windowDays = DEFAULT_FOLLOWUP_SCHEDULE_WINDOW_DAYS,
        missedLookbackDays = DEFAULT_FOLLOWUP_MISSED_LOOKBACK_DAYS,
        dueRepeatForMinutes = DEFAULT_FOLLOWUP_DUE_REPEAT_FOR_MINUTES,
    } = {},
) => {
    try {
        if (Platform.OS === "web") return { scheduled: 0, skipped: true };

        const todayKey = getTodayKey();
        const list = Array.isArray(followUps) ? followUps : [];
        const now = new Date();
        const nowMs = now.getTime();
        const lookbackMs = Math.max(0, Number(missedLookbackDays || 0)) * 24 * 60 * 60 * 1000;
        const windowMs = Math.max(0, Number(windowDays || 0)) * 24 * 60 * 60 * 1000;
        const startMs = nowMs - lookbackMs;
        const endMs = nowMs + windowMs;

        const timeBasedFollowUps = list
            .filter(isActiveFollowUp)
            .map((item) => {
                const timeStr = item?.time;
                const dateStr = item?.nextFollowUpDate || item?.followUpDate || item?.date;
                const when = timeStr ? parseLocalDateTime(dateStr, timeStr) : null;
                const ms = when ? when.getTime() : NaN;
                return { item, when, ms };
            })
            .filter(({ when, ms }) => Boolean(when) && Number.isFinite(ms) && ms >= startMs && ms <= endMs)
            // Ensure we schedule the nearest reminders first (avoid hitting caps due to sorting by latest date).
            .sort((a, b) => a.ms - b.ms);

	        await cancelTimeFollowUpReminders();
	        if (timeBasedFollowUps.length === 0) {
	            return { scheduled: 0, skipped: true, reason: "none-due" };
	        }

	        const lang = await getNotificationVoiceLanguage();
	        const soundChannels =
	            lang === "ta"
	                ? {
	                      soon: "followups_soon_ta",
	                      due: "followups_due_ta",
	                      missed: "followups_missed_ta",
	                      soonSound: "followup_soon_ta.mp3",
	                      dueSound: "followup_due_ta.mp3",
	                      missedSound: "followup_missed_ta.mp3",
	                  }
	                : {
	                      soon: "followups_soon_en",
	                      due: "followups_due_en",
	                      missed: "followups_missed_en",
	                      soonSound: "followup_soon_en.mp3",
	                      dueSound: "followup_due_en.mp3",
	                      missedSound: "followup_missed_en.mp3",
	                  };

	        const ids = [];
        // Allow scheduling "right now" triggers (use a tiny past buffer to avoid missing exact-minute schedules).
        const safeNow = new Date(now.getTime() - 1000);

        for (const entry of timeBasedFollowUps) {
            if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) break;
            const item = entry.item;
            const when = entry.when;
            const scheduledAtMs = new Set();

            // Pre-reminders: start 1 hour before, repeat every 5 minutes until due time.
            if (when.getTime() > safeNow.getTime() && ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) {
                const preWindowMs = Math.max(0, Number(preRemindMinutes || 0)) * 60 * 1000;
                const preEveryMs = Math.max(1, Number(preRemindEveryMinutes || 5)) * 60 * 1000;
                const preStart = new Date(when.getTime() - preWindowMs);

                if (preWindowMs > 0) {
                    for (
                        let t = new Date(preStart);
                        t.getTime() < when.getTime() && ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC;
                        t = new Date(t.getTime() + preEveryMs)
                    ) {
                        if (t.getTime() <= safeNow.getTime()) continue;
                        if (scheduledAtMs.has(t.getTime())) continue;
                        const minutesLeft = Math.max(
                            1,
                            Math.round((when.getTime() - t.getTime()) / (60 * 1000)),
                        );
	                        const soon = buildSoonContent(item, when, minutesLeft, lang);
	                        const id = await scheduleDateNotification({
	                            when: t,
	                            title: soon.title,
	                            body: soon.body,
	                            data: soon.data,
	                            channelId: soundChannels.soon,
	                            sound: soundChannels.soonSound,
	                            color: "#0EA5E9",
	                        });
                        ids.push(id);
                        scheduledAtMs.add(t.getTime());
                    }
                }

                // Extra pre-reminders at 5/4/3/2/1 min before due (more reliable than 5-min grid).
                for (const minutesLeft of [5, 4, 3, 2, 1]) {
                    if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) break;
                    const t = new Date(when.getTime() - minutesLeft * 60 * 1000);
                    if (t.getTime() <= safeNow.getTime() || t.getTime() >= when.getTime()) continue;
                    if (scheduledAtMs.has(t.getTime())) continue;
	                    const soon = buildSoonContent(item, when, minutesLeft, lang);
	                    const id = await scheduleDateNotification({
	                        when: t,
	                        title: soon.title,
	                        body: soon.body,
	                        data: soon.data,
	                        channelId: soundChannels.soon,
	                        sound: soundChannels.soonSound,
	                        color: "#0EA5E9",
	                    });
                    ids.push(id);
                    scheduledAtMs.add(t.getTime());
                }

                // Due notification at exact time.
	                const due = buildDueAtContent(item, when, lang);
	                const dueId = await scheduleDateNotification({
	                    when,
	                    title: due.title,
	                    body: due.body,
	                    data: due.data,
	                    channelId: soundChannels.due,
	                    sound: soundChannels.dueSound,
	                    color: "#0EA5E9",
	                });
                ids.push(dueId);

                // Optional active reminder mode (disabled by default).
                const repeats = Math.max(0, Math.min(30, Number(dueRepeatForMinutes || 0)));
                if (repeats > 0) {
                    for (
                        let i = 1;
                        i <= repeats && ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC;
                        i += 1
                    ) {
                        const t = new Date(when.getTime() + i * 60 * 1000);
                        if (t.getTime() <= safeNow.getTime()) continue;
                        if (scheduledAtMs.has(t.getTime())) continue;
                        const id = await scheduleDateNotification({
                            when: t,
                            title: due.title,
                            body: due.body,
                            data: due.data,
                            channelId,
                            color: "#FF9500",
                        });
                        ids.push(id);
                        scheduledAtMs.add(t.getTime());
                    }
                }
            }

            // Missed reminders: every 5 minutes for 1 hour after due, then every 1 hour.
	            const missed = buildMissedContent(item, when, lang);
            const missedFastMs = Math.max(0, Number(missedFastMinutes || 0)) * 60 * 1000;
            const missedFastEveryMs = Math.max(1, Number(missedFastEveryMinutes || 5)) * 60 * 1000;
            const missedHourlyEveryMs = Math.max(1, Number(missedHourlyEveryMinutes || 60)) * 60 * 1000;
            const missedFastEnd = new Date(when.getTime() + missedFastMs);

            // Missed: send every 1 minute for the first 5 minutes after due time.
            for (const mins of [1, 2, 3, 4, 5]) {
                if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) break;
                const t = new Date(when.getTime() + mins * 60 * 1000);
                if (t.getTime() <= safeNow.getTime()) continue;
                if (scheduledAtMs.has(t.getTime())) continue;
	                const id = await scheduleDateNotification({
	                    when: t,
	                    title: missed.title,
	                    body: missed.body,
	                    data: missed.data,
	                    channelId: soundChannels.missed,
	                    sound: soundChannels.missedSound,
	                    color: "#FF3B5C",
	                });
                ids.push(id);
                scheduledAtMs.add(t.getTime());
            }

            for (
                let t = new Date(when.getTime() + Math.max(missedFastEveryMs, 10 * 60 * 1000));
                t.getTime() <= missedFastEnd.getTime() && ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC;
                t = new Date(t.getTime() + missedFastEveryMs)
            ) {
                if (t.getTime() <= safeNow.getTime()) continue;
                if (scheduledAtMs.has(t.getTime())) continue;
	                const id = await scheduleDateNotification({
	                    when: t,
	                    title: missed.title,
	                    body: missed.body,
	                    data: missed.data,
	                    channelId: soundChannels.missed,
	                    sound: soundChannels.missedSound,
	                    color: "#FF9500",
	                });
                ids.push(id);
                scheduledAtMs.add(t.getTime());
            }

            const hourlyMaxHours = Math.max(0, Number(missedHourlyMaxHours || 0));
            if (hourlyMaxHours > 0 && ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) {
                const hourlyEnd = new Date(when.getTime() + hourlyMaxHours * 60 * 60 * 1000);
                const dayEnd = new Date(when);
                dayEnd.setHours(Number(endHour || 21), 0, 0, 0);
                const stopAt = new Date(Math.min(hourlyEnd.getTime(), dayEnd.getTime()));

                for (
                    let t = new Date(missedFastEnd.getTime() + missedHourlyEveryMs);
                    t.getTime() <= stopAt.getTime() && ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC;
                    t = new Date(t.getTime() + missedHourlyEveryMs)
                ) {
                    if (t.getTime() <= safeNow.getTime()) continue;
                    const id = await scheduleDateNotification({
                        when: t,
                        title: missed.title,
                        body: missed.body,
                        data: missed.data,
                        channelId,
                        color: "#FF3B5C",
                    });
                    ids.push(id);
                }
            }
        }

        await AsyncStorage.setItem(
            TIME_FOLLOWUP_SCHEDULE_KEY,
            JSON.stringify({ dateKey: todayKey, ids }),
        );

        return { scheduled: ids.length, skipped: false };
    } catch (error) {
        console.error("Failed to schedule time follow-up reminders:", error);
        return { scheduled: 0, skipped: false, error: true };
    }
};

// Global notification handler for navigation
export const setupGlobalNotificationListener = (navigationRef) => {
    return Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        const actionId = response.actionIdentifier;
        console.log("Global notification tapped:", data);

        if (actionId === "FOLLOWUP_CANCEL") {
            return;
        }

        const isComplete = actionId === "FOLLOWUP_COMPLETE";
        const isDefaultAction =
            actionId === Notifications.DEFAULT_ACTION_IDENTIFIER ||
            actionId === "expo-notifications-default";

        // Avoid repeating voice when user taps action buttons (especially Complete).
        if (isDefaultAction) {
            Promise.resolve(speakForNotificationData(data)).catch(() => {});
        }

        if (navigationRef.isReady()) {
            // Handle different notification types
            if (
                data.followUpCount ||
                data.overdueCount ||
                data.type === "daily-reminder" ||
                data.type === "hourly-followup-reminder" ||
                data.type === "followup-due" ||
                data.type === "followup-missed"
            ) {
                if (isComplete) {
                    // Mark completed so it doesn't show in Missed list if user doesn't schedule next follow-up.
                    Promise.resolve(completeFollowUpFromNotification(data)).catch(() => {});
                    Promise.resolve(
                        cancelNotificationsForEnquiry?.({
                            enqId: data?.enqId,
                            enqNo: data?.enqNo,
                        }),
                    ).catch(() => {});
                    // If user doesn't add next follow-up, prompt them shortly.
                    Promise.resolve(
                        scheduleNextFollowUpPromptForEnquiry?.({
                            enqId: data?.enqId,
                            enqNo: data?.enqNo,
                            name: data?.name,
                            mobile: data?.mobile,
                            product: data?.product,
                            delayMinutes: 2,
                        }),
                    ).catch(() => {});
                }

                // Acknowledge hourly reminders only when user actually opens/acts.
                if (
                    actionId === "FOLLOWUP_COMPLETE" ||
                    isDefaultAction
                ) {
                    acknowledgeHourlyFollowUpReminders().catch(() => {});
                }

                const enquiry = {
                    enqId: data?.enqId || null,
                    _id: data?.enqId || null,
                    enqNo: data?.enqNo || "",
                    name: data?.name || "",
                    mobile: data?.mobile || "",
                    product: data?.product || "",
                };

                navigationRef.navigate("Main", {
                    screen: "FollowUp",
                    params: isComplete
                        ? {
                              openComposer: true,
                              composerToken: `${Date.now()}`,
                              enquiry,
                              focusTab: "Today",
                              focusSearch: data?.name || "",
                              autoOpenForm: true,
                          }
                        : data.type === "followup-missed"
                          ? {
                                openComposer: true,
                                composerToken: `${Date.now()}`,
                                enquiry,
                                focusTab: "Missed",
                                openMissedModal: true,
                                autoOpenForm: true,
                            }
                          : { focusTab: "Today" },
                });
            } else if (data.type === "next-followup-prompt") {
                if (actionId === "NEXT_FOLLOWUP_NO") {
                    Promise.resolve(
                        cancelNextFollowUpPromptForEnquiry?.({
                            enqId: data?.enqId,
                            enqNo: data?.enqNo,
                        }),
                    ).catch(() => {});
                    return;
                }
                // YES or tap => open composer directly.
                const enquiry = {
                    enqId: data?.enqId || null,
                    _id: data?.enqId || null,
                    enqNo: data?.enqNo || "",
                    name: data?.name || "",
                    mobile: data?.mobile || "",
                    product: data?.product || "",
                };
                navigationRef.navigate("Main", {
                    screen: "FollowUp",
                    params: {
                        openComposer: true,
                        composerToken: `${Date.now()}`,
                        enquiry,
                        focusTab: "Today",
                        focusSearch: data?.name || "",
                        autoOpenForm: true,
                    },
                });
            } else if (data.type === 'enquiry-success' || data.type === 'new-enquiry-alert') {
                navigationRef.navigate('Main', {
                    screen: 'Enquiry',
                    params: { screen: 'EnquiryList' }
                });
            } else if (data.type === "coupon-offer") {
                navigationRef.navigate("Main", {
                    screen: "Home",
                });
            } else if (data.type === "team-chat-message") {
                navigationRef.navigate("Main", {
                    screen: "Communication",
                });
            } else if (data.type === "billing-alert") {
                navigationRef.navigate("PricingScreen");
            } else if (data.type === "report-csv-ready") {
                Promise.resolve(openCsvFileUri(data?.uri)).catch(() => {});
            }
        }
    });
};

// Cleanup notifications
export const cancelFollowUpNotifications = async () => {
    try {
        const notifications = await getPendingNotifications();
        const followUpNotifications = notifications.filter(
            (notif) =>
                notif.content.data.followUpCount ||
                notif.content.data.overdueCount,
        );

        for (const notif of followUpNotifications) {
            await cancelNotification(notif.identifier);
        }

        console.log(
            `Cancelled ${followUpNotifications.length} follow-up notifications`,
        );
    } catch (error) {
        console.error("Failed to cancel follow-up notifications:", error);
    }
};

export const resetNotificationLocalState = async () => {
    try {
        await Promise.allSettled([
            AsyncStorage.removeItem(HOURLY_FOLLOWUP_ACK_DATE_KEY),
            AsyncStorage.removeItem(HOURLY_FOLLOWUP_SCHEDULE_KEY),
            AsyncStorage.removeItem(TIME_FOLLOWUP_SCHEDULE_KEY),
            AsyncStorage.removeItem(MISSED_FOLLOWUP_ALERT_STATE_KEY),
            AsyncStorage.removeItem("lastNotificationDate"),
        ]);
    } catch {
        // ignore
    }
};

const pruneStoredScheduleIds = async (storageKey, idsToRemove = []) => {
    try {
        const removeSet = new Set((Array.isArray(idsToRemove) ? idsToRemove : []).map(String));
        if (removeSet.size === 0) return;
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return;
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return;
        }
        const ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
        const nextIds = ids.filter((id) => !removeSet.has(String(id)));
        if (nextIds.length === ids.length) return;
        await AsyncStorage.setItem(storageKey, JSON.stringify({ ...(parsed || {}), ids: nextIds }));
    } catch {
        // ignore
    }
};

export const cancelNotificationsForEnquiry = async ({ enqId, enqNo } = {}) => {
    try {
        if (!isNotificationSupported()) return { cancelled: 0, skipped: true };
        const enqIdStr = enqId ? String(enqId) : "";
        const enqNoStr = enqNo ? String(enqNo).trim() : "";
        if (!enqIdStr && !enqNoStr) return { cancelled: 0, skipped: true, reason: "no-key" };

        // Also cancel the "add next follow-up" prompt for this enquiry.
        Promise.resolve(cancelNextFollowUpPromptForEnquiry({ enqId, enqNo })).catch(() => {});

        const pending = await getPendingNotifications();
        const matches = pending.filter((notif) => {
            const data = notif?.content?.data || {};
            const type = String(data?.type || "").trim();
            if (!type) return false;
            // Only cancel notifications that are tied to a single enquiry.
            if (
                type !== "followup-soon" &&
                type !== "followup-due" &&
                type !== "followup-missed" &&
                type !== "next-followup-prompt"
            ) return false;
            const dEnqId = data?.enqId ? String(data.enqId) : "";
            const dEnqNo = data?.enqNo ? String(data.enqNo).trim() : "";
            if (enqIdStr && dEnqId && dEnqId === enqIdStr) return true;
            if (enqNoStr && dEnqNo && dEnqNo === enqNoStr) return true;
            return false;
        });

        if (matches.length === 0) return { cancelled: 0, skipped: true, reason: "none" };

        const cancelledIds = [];
        for (const notif of matches) {
            const id = String(notif?.identifier || "");
            if (!id) continue;
            try {
                await cancelNotification(id);
                cancelledIds.push(id);
            } catch {
                // ignore per-id
            }
        }

        await Promise.allSettled([
            pruneStoredScheduleIds(TIME_FOLLOWUP_SCHEDULE_KEY, cancelledIds),
            pruneStoredScheduleIds(HOURLY_FOLLOWUP_SCHEDULE_KEY, cancelledIds),
        ]);

        return { cancelled: cancelledIds.length, skipped: false };
    } catch (error) {
        console.error("Failed to cancel enquiry notifications:", error);
        return { cancelled: 0, skipped: false, error: true };
    }
};

export const cancelNotificationsForFollowUpIds = async (followUpIds = []) => {
    try {
        if (!isNotificationSupported()) return { cancelled: 0, skipped: true };
        const ids = (Array.isArray(followUpIds) ? followUpIds : []).map((v) => String(v || "").trim()).filter(Boolean);
        if (ids.length === 0) return { cancelled: 0, skipped: true, reason: "no-ids" };
        const idSet = new Set(ids);

        const pending = await getPendingNotifications();
        const matches = pending.filter((notif) => {
            const data = notif?.content?.data || {};
            const type = String(data?.type || "").trim();
            if (
                type !== "followup-soon" &&
                type !== "followup-due" &&
                type !== "followup-missed"
            ) return false;
            const followUpId = String(data?.followUpId || "").trim();
            return Boolean(followUpId) && idSet.has(followUpId);
        });

        if (matches.length === 0) return { cancelled: 0, skipped: true, reason: "none" };

        const cancelledIds = [];
        for (const notif of matches) {
            const id = String(notif?.identifier || "");
            if (!id) continue;
            try {
                await cancelNotification(id);
                cancelledIds.push(id);
            } catch {}
        }

        await Promise.allSettled([
            pruneStoredScheduleIds(TIME_FOLLOWUP_SCHEDULE_KEY, cancelledIds),
            pruneStoredScheduleIds(HOURLY_FOLLOWUP_SCHEDULE_KEY, cancelledIds),
        ]);

        return { cancelled: cancelledIds.length, skipped: false };
    } catch (error) {
        console.error("Failed to cancel follow-up-id notifications:", error);
        return { cancelled: 0, skipped: false, error: true };
    }
};

const getEnqKey = ({ enqId, enqNo } = {}) => {
    const idStr = enqId ? String(enqId).trim() : "";
    if (idStr) return `id:${idStr}`;
    const noStr = enqNo ? String(enqNo).trim() : "";
    if (noStr) return `no:${noStr}`;
    return "";
};

export const cancelNextFollowUpPromptForEnquiry = async ({ enqId, enqNo } = {}) => {
    try {
        if (!isNotificationSupported()) return { cancelled: 0, skipped: true };
        const key = getEnqKey({ enqId, enqNo });
        if (!key) return { cancelled: 0, skipped: true, reason: "no-key" };

        const raw = await AsyncStorage.getItem(NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const idsByKey = parsed?.idsByKey && typeof parsed.idsByKey === "object" ? parsed.idsByKey : {};
        const id = idsByKey?.[key];
        if (!id) return { cancelled: 0, skipped: true, reason: "none" };

        try {
            await Notifications.cancelScheduledNotificationAsync(String(id));
        } catch {}

        const next = { ...idsByKey };
        delete next[key];
        await AsyncStorage.setItem(
            NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY,
            JSON.stringify({ idsByKey: next }),
        );
        return { cancelled: 1, skipped: false };
    } catch (error) {
        console.error("Failed to cancel next follow-up prompt:", error);
        return { cancelled: 0, skipped: false, error: true };
    }
};

export const scheduleNextFollowUpPromptForEnquiry = async ({
    enqId,
    enqNo,
    name,
    mobile,
    product,
    delayMinutes = 2,
} = {}) => {
    try {
        if (!isNotificationSupported()) return { scheduled: 0, skipped: true };
        const key = getEnqKey({ enqId, enqNo });
        if (!key) return { scheduled: 0, skipped: true, reason: "no-key" };

        // Replace previous prompt for this enquiry.
        await cancelNextFollowUpPromptForEnquiry({ enqId, enqNo });

        const when = new Date(Date.now() + Math.max(1, Number(delayMinutes || 2)) * 60 * 1000);
        const safeName = String(name || "Customer").trim();
        const body = `Please add next follow-up date and time for ${safeName}.`;

        const id = await scheduleDateNotification({
            when,
            title: "Add next follow-up",
            body,
            data: {
                type: "next-followup-prompt",
                enqId: enqId ? String(enqId) : "",
                enqNo: enqNo ? String(enqNo) : "",
                name: safeName,
                mobile: mobile ? String(mobile) : "",
                product: product ? String(product) : "",
                timestamp: new Date().toISOString(),
            },
            channelId: "followups",
            color: "#0EA5E9",
            categoryIdentifier: CATEGORY_IDS.next_followup,
        });

        const raw = await AsyncStorage.getItem(NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const idsByKey = parsed?.idsByKey && typeof parsed.idsByKey === "object" ? parsed.idsByKey : {};
        await AsyncStorage.setItem(
            NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY,
            JSON.stringify({ idsByKey: { ...idsByKey, [key]: id } }),
        );

        return { scheduled: 1, skipped: false, id };
    } catch (error) {
        console.error("Failed to schedule next follow-up prompt:", error);
        return { scheduled: 0, skipped: false, error: true };
    }
	};

export const showReportCsvReadyNotification = async ({ uri, fileName } = {}) => {
    try {
        if (!isNotificationSupported()) return { shown: 0, skipped: true };
        const safeName = String(fileName || "report.csv").trim() || "report.csv";
        const safeUri = String(uri || "").trim();
        const body = `Saved: ${safeName}. Tap to open.`;

        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Report CSV Ready",
                body,
                data: {
                    type: "report-csv-ready",
                    uri: safeUri,
                    fileName: safeName,
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                ...(Platform.OS === "android"
                    ? { channelId: CHANNEL_IDS.reports }
                    : {}),
            },
            trigger: null,
        });
        return { shown: 1, skipped: false };
    } catch (error) {
        console.error("Failed to show CSV ready notification:", error);
        return { shown: 0, skipped: false, error: true };
    }
};

const completeFollowUpFromNotification = async (data = {}) => {
    try {
        const followUpId = String(data?.followUpId || "").trim();
        if (!followUpId) return { completed: false, skipped: true, reason: "no-followup-id" };
        await followupService.updateFollowUp(followUpId, { status: "Completed" });
        return { completed: true };
    } catch (error) {
        console.warn("Failed to complete follow-up from notification:", error?.message || error);
        return { completed: false, error: true };
    }
};

export default {
    initializeNotifications,
    showFollowUpNotification,
    showUrgentNotification,
    showEnquirySuccessNotification,
    showNewEnquiryAlertNotification,
    showCouponOfferNotification,
    showTeamChatNotification,
    showBillingPlanNotification,
    showEnquiryErrorNotification,
    showEnquiryStatusNotification,
    scheduleDailyNotification,
    getPendingNotifications,
    cancelAllNotifications,
    cancelNotification,
    getDevicePushToken,
	    setupNotificationListener,
	    setupForegroundNotificationListener,
	    playAudioForNotificationData,
	    speakForNotificationData,
	    checkAndNotifyTodayFollowUps,
    cancelFollowUpNotifications,
    scheduleHourlyFollowUpRemindersForToday,
    cancelHourlyFollowUpReminders,
    scheduleTimeFollowUpRemindersForToday,
    cancelTimeFollowUpReminders,
    cancelTodayFollowUpReminders,
    acknowledgeHourlyFollowUpReminders,
    setupGlobalNotificationListener,
	    notifyMissedFollowUpsSummary,
	    cancelNotificationsForEnquiry,
	    cancelNotificationsForFollowUpIds,
	    cancelNextFollowUpPromptForEnquiry,
	    scheduleNextFollowUpPromptForEnquiry,
	    showReportCsvReadyNotification,
        openAndroidNotificationSettings,
        openAndroidExactAlarmSettings,
        openAndroidBatteryOptimizationSettings,
	    getNotificationVoiceLanguage,
	    setNotificationVoiceLanguage,
	    resetNotificationLocalState,
};
