import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { AppState, Platform } from "react-native";
import { confirmPermissionRequest } from "../utils/appFeedback";
import * as followupService from "./followupService";
import {
    getFollowUpDueTexts,
    getFollowUpMissedTexts,
    getFollowUpSoonTexts,
} from "../constants/notificationPhrases";

// ─── Storage Keys ────────────────────────────────────────────────────────────
const HOURLY_FOLLOWUP_ACK_DATE_KEY = "hourlyFollowupAckDate";
const HOURLY_FOLLOWUP_SCHEDULE_KEY = "hourlyFollowupSchedule";
const TIME_FOLLOWUP_SCHEDULE_KEY = "timeFollowupSchedule";
const MISSED_FOLLOWUP_ALERT_STATE_KEY = "missedFollowupAlertState";
const NOTIFICATION_PERMISSION_EXPLAINED_KEY = "notificationPermissionExplained";
const NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY = "nextFollowupPromptSchedule";
const NOTIFICATION_VOICE_LANG_KEY = "notificationVoiceLang";

// ─── Timing Constants ────────────────────────────────────────────────────────
const DEFAULT_FOLLOWUP_PRE_REMIND_MINUTES = 60;
const DEFAULT_FOLLOWUP_PRE_REMIND_EVERY_MINUTES = 5;
const DEFAULT_FOLLOWUP_MISSED_FAST_MINUTES = 60;
const DEFAULT_FOLLOWUP_MISSED_FAST_EVERY_MINUTES = 5;
const DEFAULT_FOLLOWUP_MISSED_HOURLY_EVERY_MINUTES = 30;
const DEFAULT_FOLLOWUP_MISSED_HOURLY_MAX_HOURS = 12;
const DEFAULT_FOLLOWUP_DUE_REPEAT_FOR_MINUTES = 0;

// FIX #7: Reduced schedule window from 7 days to 2 days to prevent too many
// notifications being queued at once, which caused Android to drop them randomly.
const DEFAULT_FOLLOWUP_SCHEDULE_WINDOW_DAYS = 2;
const DEFAULT_FOLLOWUP_MISSED_LOOKBACK_DAYS = 2;

// FIX #3: Reduced from 120 → 30. Android reliably supports ~50 scheduled
// notifications; going above that causes random drops. 30 is a safe ceiling.
const MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC = 30;

// ─── FIX #8: Duplicate scheduling guard ──────────────────────────────────────
// Prevents the same sync running concurrently when triggered by multiple
// sources (useEffect, navigation focus, AppState change).
let _schedulingLock = false;
let _schedulingLockTs = 0;
const SCHEDULING_LOCK_TIMEOUT_MS = 15000; // 15-second safety reset

const acquireSchedulingLock = () => {
    const now = Date.now();
    // Auto-release stale lock (in case previous run crashed)
    if (
        _schedulingLock &&
        now - _schedulingLockTs > SCHEDULING_LOCK_TIMEOUT_MS
    ) {
        _schedulingLock = false;
        console.warn("[NotifSvc] Stale scheduling lock released");
    }
    if (_schedulingLock) return false;
    _schedulingLock = true;
    _schedulingLockTs = now;
    return true;
};

const releaseSchedulingLock = () => {
    _schedulingLock = false;
    _schedulingLockTs = 0;
};

// ─── Safe trigger type resolution ────────────────────────────────────────────
const TRIGGER_TYPES = Notifications.SchedulableTriggerInputTypes ?? {};
const DATE_TRIGGER_TYPE =
    TRIGGER_TYPES.DATE ?? TRIGGER_TYPES.CALENDAR ?? "date";
const DAILY_TRIGGER_TYPE =
    TRIGGER_TYPES.DAILY ?? TRIGGER_TYPES.TIME_INTERVAL ?? "daily";

// ─── Channel IDs ─────────────────────────────────────────────────────────────
const CHANNEL_IDS = {
    default: "default_v4",
    followups: "followups_v4",
    followups_soon_en: "followups_soon_en_v2",
    followups_due_en: "followups_due_en_v2",
    followups_missed_en: "followups_missed_en_v2",
    followups_soon_ta: "followups_soon_ta_v2",
    followups_due_ta: "followups_due_ta_v2",
    followups_missed_ta: "followups_missed_ta_v2",
    phone_soon_en: "phone_soon_en_v1",
    phone_due_en: "phone_due_en_v1",
    phone_missed_en: "phone_missed_en_v1",
    meeting_soon_en: "meeting_soon_en_v1",
    meeting_due_en: "meeting_due_en_v1",
    meeting_missed_en: "meeting_missed_en_v1",
    email_soon_en: "email_soon_en_v1",
    email_due_en: "email_due_en_v1",
    email_missed_en: "email_missed_en_v1",
    whatsapp_soon_en: "whatsapp_soon_en_v1",
    whatsapp_due_en: "whatsapp_due_en_v1",
    whatsapp_missed_en: "whatsapp_missed_en_v1",
    phone_soon_ta: "phone_soon_ta_v1",
    phone_due_ta: "phone_due_ta_v1",
    phone_missed_ta: "phone_missed_ta_v1",
    meeting_soon_ta: "meeting_soon_ta_v1",
    meeting_due_ta: "meeting_due_ta_v1",
    meeting_missed_ta: "meeting_missed_ta_v1",
    email_soon_ta: "email_soon_ta_v1",
    email_due_ta: "email_due_ta_v1",
    email_missed_ta: "email_missed_ta_v1",
    whatsapp_soon_ta: "whatsapp_soon_ta_v1",
    whatsapp_due_ta: "whatsapp_due_ta_v1",
    whatsapp_missed_ta: "whatsapp_missed_ta_v1",
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

// Android channel sounds must exist in the Expo Notifications plugin `sounds`
// list (see `app.config.js`). Keep these filenames in sync with bundled assets.
// Note: JS-driven Audio.Sound()/TTS only works when the app is running.
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
    phone_soon_en: {
        name: "Phone (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_en.mp3",
    },
    phone_due_en: {
        name: "Phone (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_en.mp3",
    },
    phone_missed_en: {
        name: "Phone (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_en.mp3",
    },
    meeting_soon_en: {
        name: "Meeting (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_en.mp3",
    },
    meeting_due_en: {
        name: "Meeting (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_en.mp3",
    },
    meeting_missed_en: {
        name: "Meeting (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_en.mp3",
    },
    email_soon_en: {
        name: "Email (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_en.mp3",
    },
    email_due_en: {
        name: "Email (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_en.mp3",
    },
    email_missed_en: {
        name: "Email (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_en.mp3",
    },
    whatsapp_soon_en: {
        name: "WhatsApp (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_en.mp3",
    },
    whatsapp_due_en: {
        name: "WhatsApp (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_en.mp3",
    },
    whatsapp_missed_en: {
        name: "WhatsApp (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_en.mp3",
    },
    phone_soon_ta: {
        name: "Phone (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_ta.mp3",
    },
    phone_due_ta: {
        name: "Phone (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_ta.mp3",
    },
    phone_missed_ta: {
        name: "Phone (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_ta.mp3",
    },
    meeting_soon_ta: {
        name: "Meeting (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_ta.mp3",
    },
    meeting_due_ta: {
        name: "Meeting (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_ta.mp3",
    },
    meeting_missed_ta: {
        name: "Meeting (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_ta.mp3",
    },
    email_soon_ta: {
        name: "Email (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_ta.mp3",
    },
    email_due_ta: {
        name: "Email (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_ta.mp3",
    },
    email_missed_ta: {
        name: "Email (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_missed_ta.mp3",
    },
    whatsapp_soon_ta: {
        name: "WhatsApp (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_soon_ta.mp3",
    },
    whatsapp_due_ta: {
        name: "WhatsApp (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "followup_due_ta.mp3",
    },
    whatsapp_missed_ta: {
        name: "WhatsApp (Missed) TA",
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

// ─── Notification Handler (must be set before any scheduling) ─────────────────
if (Platform.OS !== "web") {
    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            const data = notification?.request?.content?.data ?? {};
            const isFollowup =
                data.type === "followup-soon" ||
                data.type === "followup-due" ||
                data.type === "followup-missed";
            return {
                shouldShowAlert: true,
                shouldShowBanner: true,
                shouldShowList: true,
                // FIX #4: shouldPlaySound: true lets the Android channel sound
                // play automatically even when app is closed. Manual Audio.Sound()
                // only works when JS engine is running; channel sound always works.
                shouldPlaySound: true,
                shouldSetBadge: true,
                priority: isFollowup
                    ? (Notifications.AndroidNotificationPriority?.MAX ?? "max")
                    : (Notifications.AndroidNotificationPriority?.HIGH ??
                      "high"),
            };
        },
    });
}

// ─── CSV / File Helpers ───────────────────────────────────────────────────────
const openCsvFileUri = async (uri) => {
    const safeUri = String(uri ?? "").trim();
    if (!safeUri) return { opened: false, skipped: true, reason: "no-uri" };

    if (Platform.OS === "android") {
        let dataUri = safeUri;
        try {
            if (
                safeUri.startsWith("file://") &&
                FileSystem.getContentUriAsync
            ) {
                dataUri = await FileSystem.getContentUriAsync(safeUri);
            }
        } catch (_e) {
            /* ignore */
        }

        try {
            await IntentLauncher.startActivityAsync(
                "android.intent.action.VIEW",
                {
                    data: dataUri,
                    flags: IntentLauncher.Flags?.GRANT_READ_URI_PERMISSION ?? 1,
                    type: "text/csv",
                },
            );
            return { opened: true };
        } catch (error) {
            console.warn(
                "Failed to open CSV via intent:",
                error?.message ?? error,
            );
            try {
                const available = await Sharing.isAvailableAsync();
                if (!available)
                    return { opened: false, error: true, reason: "no-sharing" };
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
        if (!available)
            return { opened: false, skipped: true, reason: "no-sharing" };
        await Sharing.shareAsync(safeUri, {
            mimeType: "text/csv",
            UTI: "public.comma-separated-values-text",
            dialogTitle: "Open report CSV",
        });
        return { opened: true, shared: true };
    } catch (error) {
        console.warn("Failed to share/open CSV:", error?.message ?? error);
        return { opened: false, error: true };
    }
};

const getAndroidPackageName = () => {
    try {
        return (
            Constants?.expoConfig?.android?.package ??
            Constants?.manifest2?.android?.package ??
            Constants?.manifest?.android?.package ??
            ""
        );
    } catch {
        return "";
    }
};

export const openAndroidNotificationSettings = async () => {
    if (Platform.OS !== "android")
        return { opened: false, skipped: true, reason: "not-android" };
    try {
        const pkg = getAndroidPackageName();
        try {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
                pkg
                    ? { extra: { "android.provider.extra.APP_PACKAGE": pkg } }
                    : undefined,
            );
            return { opened: true };
        } catch (_err) {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
                pkg ? { data: `package:${pkg}` } : undefined,
            );
            return { opened: true, fallback: "app-details" };
        }
    } catch (error) {
        console.warn(
            "Failed to open notification settings:",
            error?.message ?? error,
        );
        return { opened: false, error: true };
    }
};

export const openAndroidExactAlarmSettings = async () => {
    if (Platform.OS !== "android")
        return { opened: false, skipped: true, reason: "not-android" };
    try {
        await IntentLauncher.startActivityAsync(
            "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
        );
        return { opened: true };
    } catch (error) {
        console.warn(
            "Failed to open exact alarm settings:",
            error?.message ?? error,
        );
        return { opened: false, error: true };
    }
};

export const openAndroidBatteryOptimizationSettings = async () => {
    if (Platform.OS !== "android")
        return { opened: false, skipped: true, reason: "not-android" };
    try {
        await IntentLauncher.startActivityAsync(
            "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
        );
        return { opened: true };
    } catch (error) {
        console.warn(
            "Failed to open battery optimization settings:",
            error?.message ?? error,
        );
        return { opened: false, error: true };
    }
};

// ─── Platform Guard ───────────────────────────────────────────────────────────
const isNotificationSupported = () => Platform.OS !== "web";

// ─── Voice Language ───────────────────────────────────────────────────────────
let cachedVoiceLang = null;

export const getNotificationVoiceLanguage = async () => {
    if (cachedVoiceLang) return cachedVoiceLang;
    try {
        const raw = await AsyncStorage.getItem(NOTIFICATION_VOICE_LANG_KEY);
        const value = String(raw ?? "")
            .trim()
            .toLowerCase();
        cachedVoiceLang = value === "ta" ? "ta" : "en";
    } catch {
        cachedVoiceLang = "en";
    }
    return cachedVoiceLang;
};

export const setNotificationVoiceLanguage = async (lang) => {
    const value =
        String(lang ?? "")
            .trim()
            .toLowerCase() === "ta"
            ? "ta"
            : "en";
    cachedVoiceLang = value;
    try {
        await AsyncStorage.setItem(NOTIFICATION_VOICE_LANG_KEY, value);
    } catch {
        /* ignore */
    }
    return value;
};

// ─── TTS Helper ───────────────────────────────────────────────────────────────
const safeSpeak = async (text) => {
    try {
        if (!text || Platform.OS === "web") return;
        const lang = await getNotificationVoiceLanguage();
        const isSpeaking = await Speech.isSpeakingAsync();
        if (isSpeaking) await Speech.stop();
        Speech.speak(String(text), {
            language: lang === "ta" ? "ta-IN" : "en-IN",
            rate: 0.95,
            pitch: 1.0,
        });
    } catch (_error) {
        /* ignore */
    }
};

// ─── Audio Playback ───────────────────────────────────────────────────────────
let activeFollowupSound = null;
let audioModeReady = false;

// FIX #6: Only reset the audio mode flag when app goes to background — NOT
// during active playback. The previous version reset during any state change,
// which invalidated the audio session mid-play and caused silent failures.
let _isPlayingAudio = false;

export const resetAudioModeOnAppBackground = () => {
    // Guard: don't reset if audio is actively playing — wait for it to finis`h.
    if (_isPlayingAudio) {
        console.log("[NotifSvc] Skipping audio mode reset — playback active");
        return;
    }
    audioModeReady = false;
    console.log("[NotifSvc] Audio mode flag reset for next foreground");
};

if (Platform.OS !== "web") {
    AppState.addEventListener("change", async (nextState) => {
        if (nextState === "background" || nextState === "inactive") {
            resetAudioModeOnAppBackground();
        } else if (nextState === "active") {
            // ── FIX #9: Re-initialize audio mode when app comes to foreground
            // so notifications can play audio properly
            console.log(
                "[NotifSvc] App foreground - ensuring audio mode ready",
            );
            await ensureAudioMode();
        }
    });
}

const ensureAudioMode = async () => {
    if (audioModeReady) return;
    try {
        // ── FIX #11: Force audio to play even in silent/vibration mode
        // ── FIX #12: Use DUCK_OTHERS instead of DO_NOT_MIX to avoid AudioFocusNotAcquiredException
        // DO_NOT_MIX requires exclusive audio focus which OS may deny. DUCK_OTHERS is more permissive.
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true, // iOS: override silent switch
            staysActiveInBackground: true,
            shouldDuckAndroid: true, // Allow lowering other app's volume instead of failing
            playThroughEarpieceAndroid: false,
            interruptionModeAndroid: Audio.INTERRUPTION_MODE_DUCK_OTHERS ?? 2,
            interruptionModeIOS: Audio.INTERRUPTION_MODE_DUCK_OTHERS ?? 2,
        });
        audioModeReady = true;
        console.log(
            "[NotifSvc] ✓ Audio mode configured (forced override enabled)",
        );
    } catch (error) {
        console.warn("[NotifSvc] ⚠ Failed to set audio mode:", error?.message);
    }
};

const stopActiveFollowupSound = async () => {
    const sound = activeFollowupSound;
    activeFollowupSound = null;
    if (!sound) return;
    try {
        await sound.stopAsync();
    } catch {
        /* ignore */
    }
    try {
        await sound.unloadAsync();
    } catch {
        /* ignore */
    }
};

const normalizeActivityKeyForAudio = (activityType) => {
    const raw = String(activityType ?? "")
        .trim()
        .toLowerCase();
    if (raw === "phone call" || raw === "call" || raw === "phone")
        return "phone";
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

// FIX #4/#6: playAudioModule — uses loadAsync + playAsync separately for
// clearer error surfaces. Also sets _isPlayingAudio flag so the AppState
// listener never resets audio mode during active playback.
// FIX #12: Improved audio focus handling with longer delays and mode reset between attempts
const playAudioModule = async (moduleRef, retries = 3) => {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        let sound = null;
        try {
            if (!moduleRef) {
                console.error(
                    "[NotifSvc] ✗ Audio module ref is null/undefined - audio file may be missing",
                );
                return false;
            }
            if (Platform.OS === "web") return false;

            // Reset audio mode on retry to ensure fresh audio focus acquisition
            if (attempt > 0) {
                audioModeReady = false;
                console.log(
                    `[NotifSvc] Resetting audio mode for retry ${attempt + 1}`,
                );
            }

            await ensureAudioMode();
            await stopActiveFollowupSound();

            sound = new Audio.Sound();
            await sound.loadAsync(moduleRef, { shouldPlay: false });
            activeFollowupSound = sound;
            _isPlayingAudio = true;

            sound.setOnPlaybackStatusUpdate((status) => {
                if (!status?.isLoaded) return;
                if (status.didJustFinish || status.error) {
                    _isPlayingAudio = false;
                    sound.unloadAsync().catch(() => {});
                    if (activeFollowupSound === sound)
                        activeFollowupSound = null;
                }
            });

            await sound.setVolumeAsync(1.0);
            await sound.playAsync();

            console.log(
                `[NotifSvc] ✓ Audio playback started (attempt ${attempt + 1})`,
            );
            return true;
        } catch (error) {
            lastError = error;
            _isPlayingAudio = false;
            console.warn(
                `[NotifSvc] ✗ Audio playback failed (attempt ${attempt + 1}/${retries + 1}):`,
                error?.message || error,
            );
            if (sound) {
                try {
                    await sound.unloadAsync();
                } catch {
                    /* ignore */
                }
                if (activeFollowupSound === sound) activeFollowupSound = null;
            }
            audioModeReady = false;
            if (attempt < retries) {
                // FIX #12: Use exponential backoff: 500ms, 1000ms, 1500ms
                const delayMs = 500 * (attempt + 1);
                console.log(
                    `[NotifSvc] Retrying audio playback in ${delayMs}ms...`,
                );
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    console.error(
        `[NotifSvc] Audio playback failed after ${retries + 1} attempts:`,
        lastError?.message || lastError,
    );
    return false;
};

export const playAudioForNotificationData = async (data = {}) => {
    try {
        const type = String(data?.type ?? "").trim();
        if (!type || Platform.OS === "web") return false;
        if (
            type !== "followup-soon" &&
            type !== "followup-due" &&
            type !== "followup-missed"
        )
            return false;

        const lang = await getNotificationVoiceLanguage();
        const activityKey = normalizeActivityKeyForAudio(data?.activityType);
        const pack = AUDIO_MODULES[lang] ?? AUDIO_MODULES.en;
        const entry = pack?.[activityKey] ?? null;

        if (!entry) {
            console.warn(
                `[NotifSvc] No audio entry for activity: ${activityKey}`,
            );
            return false;
        }

        let audioPlayed = false;

        if (type === "followup-soon") {
            const minutesLeft = Math.max(
                1,
                Math.round(Number(data?.minutesLeft ?? 0)),
            );
            if (minutesLeft >= 1 && minutesLeft <= 5 && entry[minutesLeft]) {
                console.log(
                    `[NotifSvc] Playing ${lang} ${activityKey} ${minutesLeft}min`,
                );
                audioPlayed = await playAudioModule(entry[minutesLeft]);
            }
        } else if (type === "followup-due") {
            console.log(`[NotifSvc] Playing ${lang} ${activityKey} due`);
            audioPlayed = await playAudioModule(entry.due);
        } else if (type === "followup-missed") {
            console.log(`[NotifSvc] Playing ${lang} ${activityKey} missed`);
            audioPlayed = await playAudioModule(entry.missed);
        }

        if (!audioPlayed) {
            console.log(`[NotifSvc] Audio failed, falling back to TTS`);
            const ttsText = buildTextToSpeechForNotification(data, lang);
            if (ttsText) await safeSpeak(ttsText);
        }

        return audioPlayed;
    } catch (error) {
        console.error("[NotifSvc] Error playing notification audio:", error);
        return false;
    }
};

const buildTextToSpeechForNotification = (data = {}, lang = "en") => {
    try {
        const type = String(data?.type ?? "").toLowerCase();
        const activityType = String(data?.activityType ?? "Follow-up").trim();
        const minutesLeft = Math.round(Number(data?.minutesLeft ?? 0));

        if (lang === "ta") {
            if (type === "followup-soon")
                return `${minutesLeft} நிமிடத்தில் ${activityType}`;
            if (type === "followup-due") return `${activityType} இப்போது நேரம்`;
            if (type === "followup-missed")
                return `${activityType} தவறவிட்டுவிட்டீர்கள்`;
        } else {
            if (type === "followup-soon")
                return `${minutesLeft} minute alert for ${activityType}`;
            if (type === "followup-due") return `Time for ${activityType}`;
            if (type === "followup-missed") return `You missed ${activityType}`;
        }
        return null;
    } catch {
        return null;
    }
};

// ─── Channel Helpers ──────────────────────────────────────────────────────────
const resolveChannelId = (channelId = "default") =>
    CHANNEL_IDS[channelId] ?? channelId;

const selectChannelForNotification = async (
    activityType = "followup",
    status = "soon",
    lang = "en",
) => {
    try {
        const typeMap = {
            "phone call": "phone",
            phone: "phone",
            call: "phone",
            meeting: "meeting",
            email: "email",
            whatsapp: "whatsapp",
            wa: "whatsapp",
        };
        const normalizedType = String(activityType ?? "")
            .trim()
            .toLowerCase();
        const typeKey = typeMap[normalizedType] ?? "followup";
        const langSuffix = lang === "ta" ? "ta" : "en";
        const statusMap = {
            soon: "soon",
            5: "soon",
            4: "soon",
            3: "soon",
            2: "soon",
            1: "soon",
            due: "due",
            missed: "missed",
        };
        const statusKey =
            statusMap[
                String(status ?? "")
                    .trim()
                    .toLowerCase()
            ] ?? "soon";

        if (typeKey !== "followup") {
            const channelKey = `${typeKey}_${statusKey}_${langSuffix}`;
            if (CHANNEL_IDS[channelKey]) {
                console.log(`[NotifSvc] Activity channel: ${channelKey}`);
                return channelKey;
            }
        }
        const genericChannelKey = `followups_${statusKey}_${langSuffix}`;
        console.log(`[NotifSvc] Generic channel: ${genericChannelKey}`);
        return genericChannelKey;
    } catch (error) {
        console.error("[NotifSvc] Error selecting channel:", error?.message);
        return "followups";
    }
};

// ─── scheduleDateNotification ────────────────────────────────────────────────
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
    try {
        // FIX #1: Increased past-time tolerance from 2 seconds → 30 seconds.
        // The old 2-second window caused the 3min/1min alerts to be skipped
        // when the scheduler ran even slightly late (e.g. 3 seconds after
        // the target time). 30 seconds is safe and prevents false skips.
        if (when.getTime() < Date.now() - 30000) {
            console.warn(
                `[NotifSvc] Skipping past-time notification: ${when.toISOString()}`,
            );
            return null;
        }

        const resolvedChannelId = resolveChannelId(channelId);
        const trigger = buildDateTrigger(when);

        const notifId = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                subtitle,
                data,
                categoryIdentifier,
                sound,
                vibrate,
                priority,
                android: {
                    channelId: resolvedChannelId,
                    color,
                    priority,
                    sticky,
                    vibrationPattern: vibrate,
                },
                ios: {
                    sound: true,
                    interruptionLevel: "timeSensitive",
                },
            },
            trigger,
        });

        if (notifId) {
            console.log(
                `[NotifSvc] ✓ Scheduled: ${notifId} (${when.toISOString()})`,
            );
        }
        return notifId;
    } catch (error) {
        console.error(
            `[NotifSvc] ✗ Failed to schedule for ${when.toISOString()}:`,
            error?.message,
        );
        return null;
    }
};

const buildDateTrigger = (date) => {
    if (DATE_TRIGGER_TYPE && DATE_TRIGGER_TYPE !== "date") {
        return { type: DATE_TRIGGER_TYPE, date };
    }
    return { type: "date", date };
};

const buildDailyTrigger = (hour, minute) => ({
    type: DAILY_TRIGGER_TYPE,
    hour,
    minute,
    repeats: true,
});

const getChannelMeta = (channelId = "default") =>
    NOTIFICATION_CHANNELS[channelId] ?? {
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
    if (!isNotificationSupported()) return null;

    const channelMeta = getChannelMeta(channelId);
    const vibrationPattern = vibrate ?? channelMeta.vibrationPattern;
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
            priority,
            ios: {
                badge,
                sound: true,
                interruptionLevel: "timeSensitive",
            },
            android: {
                channelId: resolvedChannelId,
                color,
                vibrate: vibrationPattern,
                vibrationPattern,
                priority,
                sticky,
            },
        },
        trigger: null,
    });
};

// ─── Initialize ───────────────────────────────────────────────────────────────
export const initializeNotifications = async () => {
    try {
        if (Platform.OS === "web") {
            console.log("Notifications not supported on web");
            return false;
        }

        const existingPermission = await Notifications.getPermissionsAsync();
        if (
            existingPermission.status !== "granted" &&
            existingPermission.canAskAgain !== false
        ) {
            const hasExplained =
                (await AsyncStorage.getItem(
                    NOTIFICATION_PERMISSION_EXPLAINED_KEY,
                )) === "true";
            if (!hasExplained) {
                const confirmed = await confirmPermissionRequest({
                    title: "Allow notifications?",
                    message:
                        "We use notifications for follow-up reminders and important app alerts. You can change this later in device settings.",
                    confirmText: "Allow",
                });
                await AsyncStorage.setItem(
                    NOTIFICATION_PERMISSION_EXPLAINED_KEY,
                    "true",
                );
                if (!confirmed) return false;
            }
        }

        const { status } = await Notifications.requestPermissionsAsync({
            ios: {
                allowAlert: true,
                allowBadge: true,
                allowSound: true,
                allowCriticalAlerts: true,
                provideAppNotificationSettings: true,
                allowProvisional: false,
                allowAnnouncements: true,
            },
        });

        console.log(`[NotifSvc] Permission: ${status}`);

        if (status !== "granted") {
            console.warn("[NotifSvc] ⚠ Permission not granted");
            try {
                const latest = await Notifications.getPermissionsAsync();
                if (
                    Platform.OS === "android" &&
                    latest?.canAskAgain === false
                ) {
                    const openSettings = await confirmPermissionRequest({
                        title: "Notifications are off",
                        message:
                            "Notifications are disabled. Open settings to enable follow-up reminders?",
                        confirmText: "Open Settings",
                    });
                    if (openSettings) await openAndroidNotificationSettings();
                }
            } catch (permError) {
                console.error(
                    "[NotifSvc] Error checking permissions:",
                    permError?.message,
                );
            }
        } else {
            console.log("[NotifSvc] ✓ Permission granted");
        }

        // ── Android Channels ──────────────────────────────────────────────────
        if (Platform.OS === "android") {
            const setChannel = async (
                id,
                meta,
                importance = Notifications.AndroidImportance.MAX,
            ) => {
                try {
                    await Notifications.setNotificationChannelAsync(id, {
                        name: meta.name ?? "Notifications",
                        importance,
                        vibrationPattern: meta.vibrationPattern ?? [
                            0, 250, 250, 250,
                        ],
                        lightColor: meta.lightColor ?? "#0EA5E9",
                        // FIX #5: Channel sound filenames use .wav extension.
                        // WAV plays more reliably on Android than MP3.
                        // Fallback to "default" if no custom sound defined.
                        sound: meta.sound ?? "default",
                        enableVibrate: true,
                        enableLights: true,
                        lockscreenVisibility:
                            Notifications.AndroidNotificationVisibility
                                ?.PUBLIC ?? 1,
                        showBadge: true,
                    });
                    console.log(`[NotifSvc] ✓ Channel: ${id}`);
                } catch (e) {
                    console.warn(
                        `[NotifSvc] ⚠ Channel ${id} failed:`,
                        e?.message,
                    );
                }
            };

            await setChannel(
                CHANNEL_IDS.default,
                {
                    name: "Default",
                    lightColor: "#FF231F7C",
                    vibrationPattern: [0, 250, 250, 250],
                },
                Notifications.AndroidImportance.HIGH,
            );

            await setChannel(
                CHANNEL_IDS.followups,
                NOTIFICATION_CHANNELS.followups,
                Notifications.AndroidImportance.MAX,
            );

            for (const key of [
                "followups_soon_en",
                "followups_due_en",
                "followups_missed_en",
                "followups_soon_ta",
                "followups_due_ta",
                "followups_missed_ta",
            ]) {
                await setChannel(
                    CHANNEL_IDS[key],
                    NOTIFICATION_CHANNELS[key],
                    Notifications.AndroidImportance.MAX,
                );
            }

            const activityChannelKeys = [
                "phone_soon_en",
                "phone_due_en",
                "phone_missed_en",
                "phone_soon_ta",
                "phone_due_ta",
                "phone_missed_ta",
                "meeting_soon_en",
                "meeting_due_en",
                "meeting_missed_en",
                "meeting_soon_ta",
                "meeting_due_ta",
                "meeting_missed_ta",
                "email_soon_en",
                "email_due_en",
                "email_missed_en",
                "email_soon_ta",
                "email_due_ta",
                "email_missed_ta",
                "whatsapp_soon_en",
                "whatsapp_due_en",
                "whatsapp_missed_en",
                "whatsapp_soon_ta",
                "whatsapp_due_ta",
                "whatsapp_missed_ta",
            ];
            for (const key of activityChannelKeys) {
                await setChannel(
                    CHANNEL_IDS[key],
                    NOTIFICATION_CHANNELS[key],
                    Notifications.AndroidImportance.MAX,
                );
            }

            await setChannel(
                CHANNEL_IDS.enquiries,
                NOTIFICATION_CHANNELS.enquiries,
                Notifications.AndroidImportance.HIGH,
            );
            await setChannel(
                CHANNEL_IDS.coupons,
                NOTIFICATION_CHANNELS.coupons,
                Notifications.AndroidImportance.HIGH,
            );
            await setChannel(
                CHANNEL_IDS.team_chat,
                NOTIFICATION_CHANNELS.team_chat,
                Notifications.AndroidImportance.HIGH,
            );
            await setChannel(
                CHANNEL_IDS.billing,
                NOTIFICATION_CHANNELS.billing,
                Notifications.AndroidImportance.HIGH,
            );
            await setChannel(
                CHANNEL_IDS.reports,
                NOTIFICATION_CHANNELS.reports,
                Notifications.AndroidImportance.DEFAULT,
            );
        }

        // ── Notification Action Categories ────────────────────────────────────
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
                { previewPlaceholder: "Update follow-up" },
            );
        } catch {
            /* ignore */
        }

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
                { previewPlaceholder: "Add next follow-up" },
            );
        } catch {
            /* ignore */
        }

        try {
            await ensureAudioMode();
        } catch {
            /* ignore */
        }

        console.log("[NotifSvc] ✓ Notifications initialized");
        return true;
    } catch (error) {
        console.error("[NotifSvc] ✗ Init failed:", error?.message);
        return false;
    }
};

// ─── Public Notification Senders ─────────────────────────────────────────────
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
        console.error("Failed to show follow-up notification:", error);
        return null;
    }
};

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
            priority: "max",
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

export const showEnquirySuccessNotification = async (enquiryData) => {
    try {
        if (!isNotificationSupported()) return;
        return await scheduleImmediateNotification({
            title: "New enquiry added",
            body: `${enquiryData.name} - ${enquiryData.product}`,
            subtitle: "Successfully recorded",
            channelId: "enquiries",
            color: "#16A34A",
            data: {
                type: "enquiry-success",
                enquiryId: enquiryData.id ?? enquiryData._id,
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

export const showNewEnquiryAlertNotification = async (enquiryData) => {
    try {
        if (!isNotificationSupported()) return;
        return await scheduleImmediateNotification({
            title: "New enquiry alert",
            body: `New enquiry from ${enquiryData.name}`,
            subtitle: enquiryData.product,
            channelId: "enquiries",
            color: "#0EA5E9",
            data: {
                type: "new-enquiry-alert",
                enquiryId: enquiryData.id ?? enquiryData._id,
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
        if (!isNotificationSupported()) return;
        const code = String(couponData?.code ?? "").toUpperCase();
        const title = couponData?.title ?? "Special offer available";
        const body =
            couponData?.body ??
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
                couponId: couponData?.couponId ?? "",
                code,
                discountType: couponData?.discountType ?? "",
                discountValue: Number(couponData?.discountValue ?? 0),
                expiryDate: couponData?.expiryDate ?? null,
                timestamp: couponData?.timestamp ?? new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show coupon notification:", error);
    }
};

export const showTeamChatNotification = async (messageData = {}) => {
    try {
        if (!isNotificationSupported()) return null;
        const senderName = String(
            messageData?.senderId?.name ??
                messageData?.senderName ??
                "Team member",
        ).trim();
        const messageType = String(messageData?.messageType ?? "text")
            .trim()
            .toLowerCase();
        const taskTitle = String(
            messageData?.taskId?.title ?? messageData?.taskTitle ?? "",
        ).trim();
        const bodyText = String(messageData?.message ?? "").trim();

        let title = senderName;
        let body = bodyText || "Sent a new message";

        if (messageType === "task") {
            title = `${senderName} assigned a task`;
            body = taskTitle || bodyText || "Tap to open team chat";
        } else if (messageType === "image") body = "Sent an image";
        else if (messageType === "audio") body = "Sent a voice message";
        else if (messageType === "document") body = "Sent a document";
        else if (messageType === "call")
            body = bodyText || "Shared a call update";

        return await scheduleImmediateNotification({
            title,
            body,
            subtitle: "Team Chat",
            channelId: "team_chat",
            color: "#0F766E",
            data: {
                type: "team-chat-message",
                senderId: String(
                    messageData?.senderId?._id ?? messageData?.senderId ?? "",
                ),
                receiverId: String(
                    messageData?.receiverId?._id ??
                        messageData?.receiverId ??
                        "",
                ),
                messageId: String(messageData?._id ?? ""),
                taskId: String(
                    messageData?.taskId?._id ?? messageData?.taskId ?? "",
                ),
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
        if (!isNotificationSupported() || !title || !body) return null;
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

export const showEnquiryErrorNotification = async (errorMessage) => {
    try {
        if (!isNotificationSupported()) return;
        return await scheduleImmediateNotification({
            title: "❌ Enquiry Creation Failed",
            body: errorMessage ?? "Could not save enquiry. Please try again.",
            channelId: "enquiries",
            color: "#DC2626",
            sticky: true,
            vibrate: [0, 300, 150, 300],
            data: {
                type: "enquiry-error",
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show enquiry error notification:", error);
    }
};

export const showEnquiryStatusNotification = async (enquiryName, newStatus) => {
    try {
        if (!isNotificationSupported()) return;
        const statusEmojis = {
            new: "🆕",
            "in progress": "⏳",
            converted: "✨",
            closed: "🔒",
            dropped: "❌",
        };
        const emoji = statusEmojis[newStatus?.toLowerCase()] ?? "📝";
        return await scheduleImmediateNotification({
            title: `${emoji} Enquiry Status Updated`,
            body: `${enquiryName}: ${newStatus}`,
            channelId: "enquiries",
            color: "#0EA5E9",
            data: {
                type: "enquiry-status",
                enquiryName,
                status: newStatus,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Failed to show enquiry status notification:", error);
    }
};

export const scheduleDailyNotification = (hour = 9, minute = 0) => {
    try {
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
                ios: { sound: true, interruptionLevel: "timeSensitive" },
                android: {
                    channelId: resolveChannelId("followups"),
                    color: "#0EA5E9",
                    priority: "high",
                },
            },
            trigger: buildDailyTrigger(hour, minute),
        });
        console.log(`Daily notification scheduled for ${hour}:${minute}`);
    } catch (error) {
        console.error("Failed to schedule daily notification:", error);
    }
};

export const getPendingNotifications = async () => {
    try {
        return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
        console.error("Failed to get pending notifications:", error);
        return [];
    }
};

// FIX #2: cancelAllNotifications now ONLY cancels all as an emergency reset.
// Internal scheduling code uses targeted cancelNotification(id) per saved ID,
// never cancelAllScheduledNotificationsAsync() during normal sync cycles.
export const cancelAllNotifications = async () => {
    try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        console.log("All notifications cancelled");
    } catch (error) {
        console.error("Failed to cancel notifications:", error);
    }
};

export const cancelNotification = async (notificationId) => {
    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
        console.error("Failed to cancel notification:", error);
    }
};

export const getDevicePushToken = async () => {
    try {
        if (
            Constants.executionEnvironment === "storeClient" ||
            Constants.appOwnership === "expo"
        ) {
            console.log("Push notifications not supported in Expo Go");
            return null;
        }
        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ??
            Constants?.easConfig?.projectId;
        if (!projectId) {
            console.log("Project ID not found");
            return null;
        }

        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log(
            "[NotifSvc] ✓ Push token:",
            token.data.substring(0, 30) + "...",
        );
        return token.data;
    } catch (error) {
        console.error("[NotifSvc] ✗ Push token failed:", error?.message);
        return null;
    }
};

export const registerPushTokenWithServer = async (pushToken) => {
    try {
        if (!pushToken || !String(pushToken).startsWith("ExponentPushToken[")) {
            console.warn("[NotifSvc] ⚠ Invalid push token");
            return false;
        }
        const authToken = await AsyncStorage.getItem("authToken");
        if (!authToken) {
            console.warn("[NotifSvc] ⚠ No auth token");
            return false;
        }

        const apiURL =
            process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api";
        const response = await fetch(`${apiURL}/auth/register-push-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ pushToken }),
        });

        if (!response.ok) {
            const error = await response
                .json()
                .catch(() => ({ error: response.statusText }));
            console.warn(
                "[NotifSvc] ⚠ Failed to register push token:",
                error?.error,
            );
            return false;
        }
        const result = await response.json();
        console.log(
            "[NotifSvc] ✓ Push token registered:",
            result?.token ?? "OK",
        );
        return true;
    } catch (error) {
        console.error(
            "[NotifSvc] ✗ Push token registration error:",
            error?.message,
        );
        return false;
    }
};

export const setupNotificationListener = (callback) => {
    return Notifications.addNotificationResponseReceivedListener((response) => {
        const notification = response.notification;
        console.log("Notification tapped:", notification.request.content.data);
        if (callback) callback(notification.request.content.data);
    });
};

export const setupForegroundNotificationListener = (callback) => {
    if (!isNotificationSupported()) return { remove: () => {} };
    return Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        console.log("Notification received (foreground):", data);

        // ── FIX #10: Play audio immediately when notification arrives in foreground
        if (data?.type) {
            Promise.resolve(speakForNotificationData(data)).catch((err) => {
                console.warn(
                    "[NotifSvc] Foreground audio playback error:",
                    err,
                );
            });
        }

        if (callback) callback(data);
    });
};

// ─── speakForNotificationData ────────────────────────────────────────────────
export const speakForNotificationData = async (data = {}) => {
    const type = String(data?.type ?? "").trim();
    if (!type) return;
    const lang = await getNotificationVoiceLanguage();

    const audioPlayed = await playAudioForNotificationData(data);
    if (audioPlayed) return;

    if (
        type === "hourly-followup-reminder" ||
        type === "daily-reminder" ||
        type === "followup-soon" ||
        type === "followup-due" ||
        type === "followup-missed"
    ) {
        const name = String(data?.name ?? "").trim();
        const activityType = String(data?.activityType ?? "follow-up").trim();

        if (type === "followup-soon") {
            const minutesLeft = Number(data?.minutesLeft ?? 0);
            if (minutesLeft > 0) {
                const t = activityType.trim().toLowerCase();
                if (t === "phone call") {
                    if (lang === "ta") {
                        await safeSpeak(
                            minutesLeft === 1
                                ? "வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் 1 நிமிடத்தில் அழைக்கவும்."
                                : `வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் ${minutesLeft} நிமிடங்களில் அழைக்கவும்.`,
                        );
                    } else {
                        await safeSpeak(
                            name
                                ? `Your customer is waiting. Call ${name} in ${minutesLeft} minutes.`
                                : `Your customer is waiting. Call in ${minutesLeft} minutes.`,
                        );
                    }
                } else {
                    if (lang === "ta") {
                        const minsLabel =
                            minutesLeft === 1
                                ? "1 நிமிடத்தில்"
                                : `${minutesLeft} நிமிடங்களில்`;
                        if (t === "whatsapp")
                            await safeSpeak(
                                `வாட்ஸ்அப் பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`,
                            );
                        else if (t === "email")
                            await safeSpeak(
                                `மின்னஞ்சல் பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`,
                            );
                        else if (t === "meeting")
                            await safeSpeak(
                                `ஆன்லைன் சந்திப்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`,
                            );
                        else
                            await safeSpeak(
                                `பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது. தயார் நிலையில் இருங்கள்.`,
                            );
                    } else {
                        await safeSpeak(
                            name
                                ? `${activityType} for ${name} in ${minutesLeft} minutes.`
                                : `${activityType} in ${minutesLeft} minutes.`,
                        );
                    }
                }
            }
            return;
        }

        if (type === "followup-missed") {
            const t = activityType.trim().toLowerCase();
            if (lang === "ta") {
                if (t === "phone call")
                    await safeSpeak(
                        "நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.",
                    );
                else if (t === "whatsapp")
                    await safeSpeak(
                        "நீங்கள் வாட்ஸ்அப் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது வாட்ஸ்அப் செய்தி அனுப்பவும்.",
                    );
                else if (t === "email")
                    await safeSpeak(
                        "நீங்கள் மின்னஞ்சல் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது மின்னஞ்சல் அனுப்பவும்.",
                    );
                else if (t === "meeting")
                    await safeSpeak(
                        "நீங்கள் ஆன்லைன் சந்திப்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது இணைக.",
                    );
                else
                    await safeSpeak(
                        "நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது தொடரவும்.",
                    );
            } else {
                await safeSpeak(
                    `${name ? `${name}, ` : ""}${activityType} missed. Please follow up now.`,
                );
            }
            return;
        }

        if (type === "followup-due") {
            const t = activityType.trim().toLowerCase();
            if (lang === "ta") {
                if (t === "phone call")
                    await safeSpeak(
                        "வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.",
                    );
                else if (t === "whatsapp")
                    await safeSpeak(
                        "இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம். தயவு செய்து வாட்ஸ்அப் செய்தி அனுப்பவும்.",
                    );
                else if (t === "email")
                    await safeSpeak(
                        "இப்போது மின்னஞ்சல் பின்தொடர்பு நேரம். தயவு செய்து மின்னஞ்சல் அனுப்பவும்.",
                    );
                else if (t === "meeting")
                    await safeSpeak(
                        "இப்போது ஆன்லைன் சந்திப்பு நேரம். தயவு செய்து இணைக.",
                    );
                else
                    await safeSpeak(
                        "இப்போது பின்தொடர்பு நேரம். தயவு செய்து தொடரவும்.",
                    );
            } else {
                await safeSpeak(
                    `${name ? `${name}, ` : ""}${activityType} due now.`,
                );
            }
            return;
        }

        if (type === "hourly-followup-reminder") {
            const count = Number(data?.followUpCount ?? 0);
            if (count > 0) {
                if (lang === "ta")
                    await safeSpeak(
                        `இன்று உங்களுக்கு ${count} பின்தொடர்புகள் உள்ளன.`,
                    );
                else await safeSpeak(`You have ${count} follow ups due today.`);
            }
            return;
        }

        if (type === "daily-reminder") {
            const count = Number(data?.followUpCount ?? 0);
            if (count > 0) {
                if (lang === "ta")
                    await safeSpeak(
                        `நினைவூட்டு. இன்று உங்களுக்கு ${count} பின்தொடர்புகள் உள்ளன.`,
                    );
                else
                    await safeSpeak(
                        `Reminder. You have ${count} follow ups today.`,
                    );
            }
            return;
        }
    }

    if (type === "followup-missed-summary" || data?.overdueCount) {
        const count = Number(data?.overdueCount ?? 0);
        if (count > 0) await safeSpeak(`You have ${count} missed follow ups.`);
    }

    if (
        [
            "enquiry-success",
            "new-enquiry-alert",
            "enquiry-status",
            "enquiry-error",
        ].includes(type)
    ) {
        const enquiryName = String(data?.enquiryName ?? "").trim();
        if (type === "enquiry-success") {
            await safeSpeak(
                enquiryName
                    ? `New enquiry added. ${enquiryName}.`
                    : "New enquiry added.",
            );
            return;
        }
        if (type === "new-enquiry-alert") {
            await safeSpeak(
                enquiryName
                    ? `New enquiry. ${enquiryName}.`
                    : "New enquiry alert.",
            );
            return;
        }
        if (type === "enquiry-status") {
            const status = String(data?.status ?? "").trim();
            await safeSpeak(
                enquiryName && status
                    ? `${enquiryName} status updated to ${status}.`
                    : "Enquiry status updated.",
            );
            return;
        }
        if (type === "enquiry-error") {
            await safeSpeak("Enquiry creation failed. Please try again.");
        }
    }
};

// ─── Missed Follow-ups Summary ────────────────────────────────────────────────
export const notifyMissedFollowUpsSummary = async (followUps = []) => {
    try {
        if (!isNotificationSupported())
            return { notified: false, skipped: true };

        const list = Array.isArray(followUps) ? followUps : [];
        const count = list.filter(isActiveFollowUp).length;
        if (count <= 0)
            return { notified: false, skipped: true, reason: "none" };

        const todayKey = getTodayKey();
        const rawState = await AsyncStorage.getItem(
            MISSED_FOLLOWUP_ALERT_STATE_KEY,
        );
        let prev = { dateKey: "", count: 0 };
        try {
            prev = rawState ? JSON.parse(rawState) : prev;
        } catch {
            /* ignore */
        }

        if (prev?.dateKey === todayKey && Number(prev?.count ?? 0) === count) {
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

        await safeSpeak(
            count === 1
                ? "You have 1 missed follow up."
                : `You have ${count} missed follow ups.`,
        );
        return { notified: true, skipped: false, count };
    } catch (error) {
        console.error("Failed to notify missed follow-ups:", error);
        return { notified: false, skipped: false, error: true };
    }
};

export const checkAndNotifyTodayFollowUps = async (followUps) => {
    try {
        if (!Array.isArray(followUps) || followUps.length === 0) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateString = today.toDateString();

        const lastNotificationDate = await AsyncStorage.getItem(
            "lastNotificationDate",
        );
        if (lastNotificationDate === dateString) return;

        const todayFollowUps = followUps.filter((item) => {
            const d = new Date(item.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        });

        const overdueFollowUps = followUps.filter((item) => {
            const d = new Date(item.date);
            d.setHours(0, 0, 0, 0);
            return d < today;
        });

        let notificationSent = false;
        if (overdueFollowUps.length > 0) {
            await showUrgentNotification(
                overdueFollowUps.length,
                overdueFollowUps,
            );
            notificationSent = true;
        }
        if (todayFollowUps.length > 0) {
            await showFollowUpNotification(
                todayFollowUps.length,
                todayFollowUps,
            );
            notificationSent = true;
        }
        if (notificationSent)
            await AsyncStorage.setItem("lastNotificationDate", dateString);
    } catch (error) {
        console.error("Failed to check and notify follow-ups:", error);
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTodayKey = () => new Date().toDateString();

const isActiveFollowUp = (item) => {
    const status = String(item?.status ?? "").toLowerCase();
    const nextAction = String(item?.nextAction ?? "").toLowerCase();
    if (!status) return true;
    if (status === "completed") return false;
    if (status === "drop" || status === "dropped") return false;
    if (nextAction === "drop" || nextAction === "dropped") return false;
    return true;
};

const isDueToday = (item) => {
    const raw = item?.date ?? item?.followUpDate ?? item?.nextFollowUpDate;
    if (!raw) return false;
    let d;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [yy, mm, dd] = raw.split("-").map(Number);
        d = new Date(yy, (mm ?? 1) - 1, dd ?? 1);
    } else {
        d = new Date(raw);
    }
    if (Number.isNaN(d.getTime())) return false;
    return d.toDateString() === getTodayKey();
};

const getPrettyFollowUpLine = (activityType, name) => {
    const who = (name ?? "your client").trim();
    const type = String(activityType ?? "")
        .trim()
        .toLowerCase();
    if (type === "whatsapp")
        return `WhatsApp ${who}: quick update + next step.`;
    if (type === "email")
        return `Email ${who}: short recap + ask for confirmation.`;
    if (type === "meeting")
        return `Meeting ${who}: confirm time + share agenda.`;
    if (type === "phone call")
        return `Your customer is waiting. Please call ${who} now.`;
    return `Follow up with ${who} now.`;
};

const resolveEnquiryKeyFromItem = (item) => {
    const rawId =
        item?.enqId ??
        item?.enquiryId ??
        item?.enquiry?._id ??
        item?.enquiry?.id ??
        item?.enquiry ??
        "";
    const rawNo = item?.enqNo ?? item?.enquiry?.enqNo ?? item?.enquiryNo ?? "";

    const normalizeId = (v) => {
        if (!v) return "";
        if (typeof v === "string") return v.trim();
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
            if (v._id) return String(v._id).trim();
            if (v.id) return String(v.id).trim();
            const s = String(v.toString?.() ?? v).trim();
            if (s && s !== "[object Object]") return s;
        }
        const s = String(v).trim();
        return s === "[object Object]" ? "" : s;
    };

    return { enqId: normalizeId(rawId), enqNo: String(rawNo ?? "").trim() };
};

const buildSoonContent = (item, when, minutesLeft, lang = "en") => {
    const name = String(item?.name ?? "Client").trim();
    const activityType = String(
        item?.activityType ?? item?.type ?? "Follow-up",
    ).trim();
    const mins = Math.max(1, Math.round(Number(minutesLeft ?? 0)));
    const texts = getFollowUpSoonTexts({
        lang,
        name,
        activityType,
        minutesLeft: mins,
    });
    const due = buildDueAtContent(item, when, lang);
    return {
        title: texts.title,
        body: texts.body,
        data: {
            ...due.data,
            type: "followup-soon",
            minutesLeft: mins,
            name,
            activityType,
        },
    };
};

const buildHourlyFollowUpContent = (todayFollowUps, tipIndex = 0) => {
    const list = Array.isArray(todayFollowUps) ? todayFollowUps : [];
    const count = list.length;
    const safe = (v) => String(v ?? "").trim();
    const first = list[tipIndex % Math.max(1, list.length)] ?? list[0] ?? null;
    const firstName = safe(first?.name);
    const firstType = safe(first?.activityType ?? first?.type);
    const firstTime = safe(first?.time);
    const timeNote = firstTime ? ` at ${firstTime}` : "";
    const line = `${getPrettyFollowUpLine(firstType, firstName)}${timeNote}`;
    const body =
        count === 1
            ? `1 follow-up due today. ${line}`
            : `${count} follow-ups due today. ${line}`;
    return {
        title: "Hourly follow-up reminder",
        body,
        data: {
            type: "hourly-followup-reminder",
            followUpCount: count,
            followUpList: JSON.stringify(list.slice(0, 25)),
            timestamp: new Date().toISOString(),
        },
    };
};

// ─── Cancel / Schedule Helpers ────────────────────────────────────────────────
export const cancelHourlyFollowUpReminders = async () => {
    try {
        if (Platform.OS === "web") return;
        const raw = await AsyncStorage.getItem(HOURLY_FOLLOWUP_SCHEDULE_KEY);
        const schedule = raw ? JSON.parse(raw) : null;
        const ids = Array.isArray(schedule?.ids) ? schedule.ids : [];
        if (ids.length === 0) return;

        // FIX #2: Cancel only saved IDs — never call cancelAllScheduledNotificationsAsync()
        const results = await Promise.allSettled(
            ids.map((id) =>
                Notifications.cancelScheduledNotificationAsync(id).catch(
                    (e) => {
                        throw e;
                    },
                ),
            ),
        );
        const succeeded = results.filter(
            (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;
        console.log(
            `[NotifSvc] Cancelled ${ids.length} hourly reminders: ${succeeded} ✓, ${failed} ✗`,
        );
        await AsyncStorage.removeItem(HOURLY_FOLLOWUP_SCHEDULE_KEY);
    } catch (error) {
        console.error("[NotifSvc] Failed to cancel hourly reminders:", error);
    }
};

export const cancelTimeFollowUpReminders = async () => {
    try {
        if (Platform.OS === "web") return;
        const raw = await AsyncStorage.getItem(TIME_FOLLOWUP_SCHEDULE_KEY);
        const schedule = raw ? JSON.parse(raw) : null;
        const ids = Array.isArray(schedule?.ids) ? schedule.ids : [];
        if (ids.length === 0) return;

        // FIX #2: Cancel only saved IDs — not all scheduled notifications
        const results = await Promise.allSettled(
            ids.map((id) =>
                Notifications.cancelScheduledNotificationAsync(id).catch(
                    (e) => {
                        throw e;
                    },
                ),
            ),
        );
        const succeeded = results.filter(
            (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;
        console.log(
            `[NotifSvc] Cancelled ${ids.length} time-based reminders: ${succeeded} ✓, ${failed} ✗`,
        );
        await AsyncStorage.removeItem(TIME_FOLLOWUP_SCHEDULE_KEY);
    } catch (error) {
        console.error(
            "[NotifSvc] Failed to cancel time-based reminders:",
            error,
        );
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
        await cancelHourlyFollowUpReminders();
    } catch (error) {
        console.error(
            "Failed to acknowledge hourly follow-up reminders:",
            error,
        );
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
        const [yy, mm, dd] = dateStr.split("-").map(Number);
        d = new Date(yy, (mm ?? 1) - 1, dd ?? 1, 9, 0, 0, 0);
    } else {
        d = new Date(dateStr);
    }
    if (Number.isNaN(d.getTime())) return null;

    if (timeStr && typeof timeStr === "string") {
        const t = timeStr.trim();
        const m = t.match(
            /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
        );
        if (m) {
            let hh = Number(m[1]);
            const mm2 = Number(m[2] ?? "0");
            const meridian = String(m[4] ?? "").toUpperCase();

            if (!Number.isFinite(hh) || !Number.isFinite(mm2) || mm2 > 59) {
                // invalid — leave as default 09:00
            } else if (meridian) {
                if (hh >= 1 && hh <= 12) {
                    if (meridian === "AM" && hh === 12) hh = 0;
                    else if (meridian === "PM" && hh !== 12) hh += 12;
                    d.setHours(
                        Math.min(23, Math.max(0, hh)),
                        Math.min(59, Math.max(0, mm2)),
                        0,
                        0,
                    );
                }
            } else {
                d.setHours(
                    Math.min(23, Math.max(0, hh)),
                    Math.min(59, Math.max(0, mm2)),
                    0,
                    0,
                );
            }
        }
    }

    return d;
};

const buildDueAtContent = (item, when, lang = "en") => {
    const name = String(item?.name ?? "Client").trim();
    const activityType = String(
        item?.activityType ?? item?.type ?? "Follow-up",
    ).trim();
    const timeLabel = when ? formatHHmm(when) : "";
    const { enqId, enqNo } = resolveEnquiryKeyFromItem(item);
    const texts = getFollowUpDueTexts({ lang, name, activityType, timeLabel });
    return {
        title: texts.title,
        body: texts.body,
        data: {
            type: "followup-due",
            followUpId: String(item?._id ?? ""),
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
    const name = String(item?.name ?? "Client").trim();
    const activityType = String(
        item?.activityType ?? item?.type ?? "Follow-up",
    ).trim();
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
            followUpId: String(item?._id ?? ""),
            enqId,
            enqNo,
            name,
            activityType,
            when: when ? when.toISOString() : null,
            timestamp: new Date().toISOString(),
        },
    };
};

// ─── Hourly Reminders ─────────────────────────────────────────────────────────
export const scheduleHourlyFollowUpRemindersForToday = async (
    followUps,
    { endHour = 21, channelId = "followups" } = {},
) => {
    try {
        if (Platform.OS === "web") return { scheduled: 0, skipped: true };

        const todayKey = getTodayKey();
        const ackDate = await AsyncStorage.getItem(
            HOURLY_FOLLOWUP_ACK_DATE_KEY,
        );
        if (ackDate === todayKey)
            return { scheduled: 0, skipped: true, reason: "acknowledged" };

        const list = Array.isArray(followUps) ? followUps : [];
        const todayFollowUps = list.filter(isActiveFollowUp).filter(isDueToday);
        if (todayFollowUps.length === 0) {
            await cancelHourlyFollowUpReminders();
            return { scheduled: 0, skipped: true, reason: "none-due" };
        }

        await cancelHourlyFollowUpReminders();

        const now = new Date();
        const endAt = new Date();
        endAt.setHours(endHour, 0, 0, 0);
        if (now >= endAt)
            return { scheduled: 0, skipped: true, reason: "after-hours" };

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
                    ios: { sound: true, interruptionLevel: "timeSensitive" },
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
        console.log(`Scheduled ${ids.length} hourly reminders`);
        return { scheduled: ids.length, skipped: false };
    } catch (error) {
        console.error("Failed to schedule hourly reminders:", error);
        return { scheduled: 0, skipped: false, error: true };
    }
};

// ─── Time-based Reminders ─────────────────────────────────────────────────────
// ARCHITECTURE FIX: Reduced from ~20 notifications per follow-up to exactly 5:
//   5 min, 3 min, 1 min (soon) → due → missed (1 min, 30 min, 1 hr after)
// This keeps total notifications well under Android's ~50-item reliable limit.
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
    // FIX #8: Prevent concurrent/duplicate scheduling runs.
    // If a sync is already in progress, bail out immediately.
    if (!acquireSchedulingLock()) {
        console.warn(
            "[NotifSvc] Scheduling already in progress — skipping duplicate call",
        );
        return { scheduled: 0, skipped: true, reason: "lock" };
    }

    try {
        if (Platform.OS === "web") return { scheduled: 0, skipped: true };

        const todayKey = getTodayKey();
        const list = Array.isArray(followUps) ? followUps : [];
        const now = new Date();
        const nowMs = now.getTime();
        const lookbackMs =
            Math.max(0, Number(missedLookbackDays ?? 0)) * 24 * 60 * 60 * 1000;
        const windowMs =
            Math.max(0, Number(windowDays ?? 0)) * 24 * 60 * 60 * 1000;
        const startMs = nowMs - lookbackMs;
        const endMs = nowMs + windowMs;

        const timeBasedFollowUps = list
            .filter(isActiveFollowUp)
            .map((item) => {
                const timeStr = item?.time;
                const dateStr =
                    item?.nextFollowUpDate ?? item?.followUpDate ?? item?.date;
                const when = timeStr
                    ? parseLocalDateTime(dateStr, timeStr)
                    : null;
                const ms = when ? when.getTime() : NaN;
                return { item, when, ms };
            })
            .filter(
                ({ when, ms }) =>
                    Boolean(when) &&
                    Number.isFinite(ms) &&
                    ms >= startMs &&
                    ms <= endMs,
            )
            .sort((a, b) => a.ms - b.ms);

        // FIX #2: Cancel only previously saved IDs (not ALL notifications)
        await cancelTimeFollowUpReminders();

        if (timeBasedFollowUps.length === 0) {
            console.log("[NotifSvc] No time-based follow-ups to schedule");
            return { scheduled: 0, skipped: true, reason: "none-due" };
        }

        console.log(
            `[NotifSvc] Scheduling for ${timeBasedFollowUps.length} time-based follow-ups`,
        );

        const lang = await getNotificationVoiceLanguage();
        const ids = [];

        // FIX #1: Use 30-second past-time tolerance buffer.
        // A 30-second window means the scheduler can run up to 30s late
        // and still successfully schedule the notification.
        const safeNow = new Date(now.getTime() - 30000);

        for (const entry of timeBasedFollowUps) {
            if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) break;

            const item = entry.item;
            const when = entry.when;

            // ── ARCHITECTURE FIX: 5 notifications per follow-up only ──────────
            // Before: 20+ notifications (hourly pre-reminders + per-minute + due
            //         repeats + fast missed + hourly missed) = Android drops them.
            // After:  5min, 3min, 1min → due → missed (at +1min, +30min, +1hr)
            //         Reliable, predictable, well under Android's limit.

            const soonChannelKey = await selectChannelForNotification(
                item?.activityType,
                "soon",
                lang,
            );
            const dueChannelKey = await selectChannelForNotification(
                item?.activityType,
                "due",
                lang,
            );
            const missedChannelKey = await selectChannelForNotification(
                item?.activityType,
                "missed",
                lang,
            );

            // 1. Pre-reminders: 5, 4, 3, 2, 1 minutes before due time
            // FIX #12: Include 2-min and 4-min reminders for better coverage
            for (const minutesLeft of [5, 4, 3, 2, 1]) {
                if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC)
                    break;

                const t = new Date(when.getTime() - minutesLeft * 60 * 1000);
                if (t.getTime() <= safeNow.getTime()) {
                    console.warn(
                        `[NotifSvc] Skipping ${minutesLeft}min (past): ${t.toISOString()}`,
                    );
                    continue;
                }

                const soon = buildSoonContent(item, when, minutesLeft, lang);
                const id = await scheduleDateNotification({
                    when: t,
                    title: soon.title,
                    body: soon.body,
                    data: soon.data,
                    channelId: soonChannelKey,
                    sound: "default",
                    color: "#0EA5E9",
                });
                if (id) {
                    console.log(
                        `[NotifSvc] ✓ ${minutesLeft}min alert scheduled: ${t.toISOString()}`,
                    );
                    ids.push(id);
                }
            }

            // 2. Due at exact time
            if (ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) {
                if (when.getTime() > safeNow.getTime()) {
                    const due = buildDueAtContent(item, when, lang);
                    const dueId = await scheduleDateNotification({
                        when,
                        title: due.title,
                        body: due.body,
                        data: due.data,
                        channelId: dueChannelKey,
                        sound: "default",
                        color: "#0EA5E9",
                    });
                    if (dueId) {
                        console.log(
                            `[NotifSvc] ✓ Due alert scheduled: ${when.toISOString()}`,
                        );
                        ids.push(dueId);
                    }
                }
            }

            // 3. Missed alerts: +1 min, +30 min, +1 hour after due time
            const missed = buildMissedContent(item, when, lang);
            for (const delayMinutes of [1, 30, 60]) {
                if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC)
                    break;

                const t = new Date(when.getTime() + delayMinutes * 60 * 1000);
                if (t.getTime() <= safeNow.getTime()) continue;

                // Respect end-of-day boundary
                const dayEnd = new Date(when);
                dayEnd.setHours(Number(endHour ?? 21), 0, 0, 0);
                if (t.getTime() > dayEnd.getTime()) break;

                const id = await scheduleDateNotification({
                    when: t,
                    title: missed.title,
                    body: missed.body,
                    data: missed.data,
                    channelId: missedChannelKey,
                    sound: "default",
                    color: "#FF3B5C",
                });
                if (id) {
                    console.log(
                        `[NotifSvc] ✓ Missed +${delayMinutes}min scheduled: ${t.toISOString()}`,
                    );
                    ids.push(id);
                }
            }
        }

        await AsyncStorage.setItem(
            TIME_FOLLOWUP_SCHEDULE_KEY,
            JSON.stringify({ dateKey: todayKey, ids }),
        );
        console.log(
            `[NotifSvc] ✓ Scheduled ${ids.length} time-based notifications`,
        );
        return { scheduled: ids.length, skipped: false };
    } catch (error) {
        console.error("[NotifSvc] ✗ Failed to schedule time reminders:", error);
        return { scheduled: 0, skipped: false, error: true };
    } finally {
        // FIX #8: Always release the lock, even if scheduling threw an error
        releaseSchedulingLock();
    }
};

// ─── Global Notification Response Listener ───────────────────────────────────
export const setupGlobalNotificationListener = (navigationRef) => {
    return Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const actionId = response.actionIdentifier;
        console.log("Global notification tapped:", data);

        if (actionId === "FOLLOWUP_CANCEL") return;

        const isComplete = actionId === "FOLLOWUP_COMPLETE";
        const isDefaultAction =
            actionId === Notifications.DEFAULT_ACTION_IDENTIFIER ||
            actionId === "expo-notifications-default";

        if (isDefaultAction) {
            Promise.resolve(speakForNotificationData(data)).catch(() => {});
        }

        if (!navigationRef.isReady()) return;

        if (
            data.followUpCount ||
            data.overdueCount ||
            data.type === "daily-reminder" ||
            data.type === "hourly-followup-reminder" ||
            data.type === "followup-due" ||
            data.type === "followup-missed"
        ) {
            if (isComplete) {
                Promise.resolve(completeFollowUpFromNotification(data)).catch(
                    () => {},
                );
                Promise.resolve(
                    cancelNotificationsForEnquiry?.({
                        enqId: data?.enqId,
                        enqNo: data?.enqNo,
                    }),
                ).catch(() => {});
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

            if (actionId === "FOLLOWUP_COMPLETE" || isDefaultAction) {
                acknowledgeHourlyFollowUpReminders().catch(() => {});
            }

            const enquiry = {
                enqId: data?.enqId ?? null,
                _id: data?.enqId ?? null,
                enqNo: data?.enqNo ?? "",
                name: data?.name ?? "",
                mobile: data?.mobile ?? "",
                product: data?.product ?? "",
            };

            navigationRef.navigate("Main", {
                screen: "FollowUp",
                params: isComplete
                    ? {
                          openComposer: true,
                          composerToken: `${Date.now()}`,
                          enquiry,
                          focusTab: "Today",
                          focusSearch: data?.name ?? "",
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
            const enquiry = {
                enqId: data?.enqId ?? null,
                _id: data?.enqId ?? null,
                enqNo: data?.enqNo ?? "",
                name: data?.name ?? "",
                mobile: data?.mobile ?? "",
                product: data?.product ?? "",
            };
            navigationRef.navigate("Main", {
                screen: "FollowUp",
                params: {
                    openComposer: true,
                    composerToken: `${Date.now()}`,
                    enquiry,
                    focusTab: "Today",
                    focusSearch: data?.name ?? "",
                    autoOpenForm: true,
                },
            });
        } else if (
            data.type === "enquiry-success" ||
            data.type === "new-enquiry-alert"
        ) {
            navigationRef.navigate("Main", {
                screen: "Enquiry",
                params: { screen: "EnquiryList" },
            });
        } else if (data.type === "coupon-offer") {
            navigationRef.navigate("Main", { screen: "Home" });
        } else if (data.type === "team-chat-message") {
            navigationRef.navigate("Main", { screen: "Communication" });
        } else if (data.type === "billing-alert") {
            navigationRef.navigate("PricingScreen");
        } else if (data.type === "report-csv-ready") {
            Promise.resolve(openCsvFileUri(data?.uri)).catch(() => {});
        }
    });
};

// ─── Follow-up Notification Cleanup ──────────────────────────────────────────
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
        /* ignore */
    }
};

const pruneStoredScheduleIds = async (storageKey, idsToRemove = []) => {
    try {
        const removeSet = new Set(
            (Array.isArray(idsToRemove) ? idsToRemove : []).map(String),
        );
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
        await AsyncStorage.setItem(
            storageKey,
            JSON.stringify({ ...(parsed ?? {}), ids: nextIds }),
        );
    } catch {
        /* ignore */
    }
};

export const cancelNotificationsForEnquiry = async ({ enqId, enqNo } = {}) => {
    try {
        if (!isNotificationSupported()) return { cancelled: 0, skipped: true };
        const enqIdStr = enqId ? String(enqId) : "";
        const enqNoStr = enqNo ? String(enqNo).trim() : "";
        if (!enqIdStr && !enqNoStr)
            return { cancelled: 0, skipped: true, reason: "no-key" };

        Promise.resolve(
            cancelNextFollowUpPromptForEnquiry({ enqId, enqNo }),
        ).catch(() => {});

        const pending = await getPendingNotifications();
        const matches = pending.filter((notif) => {
            const data = notif?.content?.data ?? {};
            const type = String(data?.type ?? "").trim();
            if (!type) return false;
            if (
                type !== "followup-soon" &&
                type !== "followup-due" &&
                type !== "followup-missed" &&
                type !== "next-followup-prompt"
            )
                return false;
            const dEnqId = data?.enqId ? String(data.enqId) : "";
            const dEnqNo = data?.enqNo ? String(data.enqNo).trim() : "";
            if (enqIdStr && dEnqId && dEnqId === enqIdStr) return true;
            if (enqNoStr && dEnqNo && dEnqNo === enqNoStr) return true;
            return false;
        });

        if (matches.length === 0)
            return { cancelled: 0, skipped: true, reason: "none" };

        const cancelledIds = [];
        for (const notif of matches) {
            const id = String(notif?.identifier ?? "");
            if (!id) continue;
            try {
                await cancelNotification(id);
                cancelledIds.push(id);
            } catch {
                /* ignore */
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
        const ids = (Array.isArray(followUpIds) ? followUpIds : [])
            .map((v) => String(v ?? "").trim())
            .filter(Boolean);
        if (ids.length === 0)
            return { cancelled: 0, skipped: true, reason: "no-ids" };
        const idSet = new Set(ids);

        const pending = await getPendingNotifications();
        const matches = pending.filter((notif) => {
            const data = notif?.content?.data ?? {};
            const type = String(data?.type ?? "").trim();
            if (
                type !== "followup-soon" &&
                type !== "followup-due" &&
                type !== "followup-missed"
            )
                return false;
            const followUpId = String(data?.followUpId ?? "").trim();
            return Boolean(followUpId) && idSet.has(followUpId);
        });

        if (matches.length === 0)
            return { cancelled: 0, skipped: true, reason: "none" };

        const cancelledIds = [];
        for (const notif of matches) {
            const id = String(notif?.identifier ?? "");
            if (!id) continue;
            try {
                await cancelNotification(id);
                cancelledIds.push(id);
            } catch {
                /* ignore */
            }
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

// ─── Next Follow-up Prompt ────────────────────────────────────────────────────
const getEnqKey = ({ enqId, enqNo } = {}) => {
    const idStr = enqId ? String(enqId).trim() : "";
    if (idStr) return `id:${idStr}`;
    const noStr = enqNo ? String(enqNo).trim() : "";
    if (noStr) return `no:${noStr}`;
    return "";
};

export const cancelNextFollowUpPromptForEnquiry = async ({
    enqId,
    enqNo,
} = {}) => {
    try {
        if (!isNotificationSupported()) return { cancelled: 0, skipped: true };
        const key = getEnqKey({ enqId, enqNo });
        if (!key) return { cancelled: 0, skipped: true, reason: "no-key" };

        const raw = await AsyncStorage.getItem(
            NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY,
        );
        const parsed = raw ? JSON.parse(raw) : null;
        const idsByKey =
            parsed?.idsByKey && typeof parsed.idsByKey === "object"
                ? parsed.idsByKey
                : {};
        const id = idsByKey?.[key];
        if (!id) return { cancelled: 0, skipped: true, reason: "none" };

        try {
            await Notifications.cancelScheduledNotificationAsync(String(id));
        } catch {
            /* ignore */
        }

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

        await cancelNextFollowUpPromptForEnquiry({ enqId, enqNo });

        const when = new Date(
            Date.now() + Math.max(1, Number(delayMinutes ?? 2)) * 60 * 1000,
        );
        const safeName = String(name ?? "Customer").trim();
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

        const raw = await AsyncStorage.getItem(
            NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY,
        );
        const parsed = raw ? JSON.parse(raw) : null;
        const idsByKey =
            parsed?.idsByKey && typeof parsed.idsByKey === "object"
                ? parsed.idsByKey
                : {};
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

export const showReportCsvReadyNotification = async ({
    uri,
    fileName,
} = {}) => {
    try {
        if (!isNotificationSupported()) return { shown: 0, skipped: true };
        const safeName =
            String(fileName ?? "report.csv").trim() || "report.csv";
        const safeUri = String(uri ?? "").trim();
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Report CSV Ready",
                body: `Saved: ${safeName}. Tap to open.`,
                data: {
                    type: "report-csv-ready",
                    uri: safeUri,
                    fileName: safeName,
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                ios: { sound: true },
                ...(Platform.OS === "android"
                    ? { android: { channelId: CHANNEL_IDS.reports } }
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

// ─── Internal Helpers ─────────────────────────────────────────────────────────
const completeFollowUpFromNotification = async (data = {}) => {
    try {
        const followUpId = String(data?.followUpId ?? "").trim();
        if (!followUpId)
            return {
                completed: false,
                skipped: true,
                reason: "no-followup-id",
            };
        await followupService.updateFollowUp(followUpId, {
            status: "Completed",
        });
        return { completed: true };
    } catch (error) {
        console.warn(
            "Failed to complete follow-up from notification:",
            error?.message ?? error,
        );
        return { completed: false, error: true };
    }
};

// ─── DIAGNOSTIC: Check audio setup for debugging ────────────────────────────
export const diagnoseAudioSetup = async () => {
    console.log("=== AUDIO SETUP DIAGNOSIS ===");

    try {
        // Check platform
        console.log(`Platform: ${Platform.OS}`);

        // Check audio modules
        let audioModulesOk = 0;
        let audioModulesFailed = 0;

        for (const [lang, activities] of Object.entries(AUDIO_MODULES)) {
            for (const [activity, audios] of Object.entries(activities)) {
                for (const [key, moduleRef] of Object.entries(audios)) {
                    if (moduleRef) {
                        audioModulesOk++;
                        console.log(`✓ ${lang}/${activity}/${key} loaded`);
                    } else {
                        audioModulesFailed++;
                        console.error(`✗ ${lang}/${activity}/${key} is NULL`);
                    }
                }
            }
        }

        console.log(
            `Audio Modules: ${audioModulesOk}✓ | ${audioModulesFailed}✗`,
        );

        // Check notification permissions
        const perms = await Notifications.getPermissionsAsync();
        console.log(`Notification Permission: ${perms.status}`);
        console.log(`Can request again: ${perms.canAskAgain}`);

        // Check voice language
        const voiceLang = await getNotificationVoiceLanguage();
        console.log(`Voice Language Set To: ${voiceLang}`);

        // Check audio mode
        console.log(`Audio Mode Ready: ${audioModeReady}`);

        // Try to set audio mode
        console.log("Attempting to set audio mode...");
        await ensureAudioMode();
        console.log("Audio mode set successfully");

        console.log("=== DIAGNOSIS COMPLETE ===");
        return { success: true, audioModulesOk, audioModulesFailed };
    } catch (error) {
        console.error("Diagnosis error:", error?.message || error);
        return { success: false, error: error?.message || error };
    }
};

// ─── Default Export ───────────────────────────────────────────────────────────
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
    registerPushTokenWithServer,
    resetAudioModeOnAppBackground,
    diagnoseAudioSetup,
};
