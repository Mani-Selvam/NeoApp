import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { AppState, Platform } from "react-native";
import { confirmPermissionRequest } from "../utils/appFeedback";
import * as followupService from "./followupService";
import firebaseNotificationService from "./firebaseNotificationService";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";
import {
    getFollowUpDueTexts,
    getFollowUpMissedTexts,
    getFollowUpSoonTexts,
} from "../constants/notificationPhrases";

const shouldUseServerFollowupReminders = () => {
    const flag = String(
        process.env.EXPO_PUBLIC_USE_SERVER_FOLLOWUP_REMINDERS || "",
    )
        .trim()
        .toLowerCase();
    if (flag === "true") return true;
    if (flag === "false") return false;
    // Default:
    // - Native builds (not Expo Go) have FCM and receive server reminders.
    // - Expo Go should use local scheduling as a fallback.
    return Constants.appOwnership !== "expo";
};

let _audioModule = null;
const getAudioModule = () => {
    if (Platform.OS === "web") return null;
    if (_audioModule) return _audioModule;
    try {
        const mod = require("expo-av");
        _audioModule = mod?.Audio || null;
    } catch {
        _audioModule = null;
    }
    return _audioModule;
};

// ─── Storage Keys ────────────────────────────────────────────────────────────
const HOURLY_FOLLOWUP_ACK_DATE_KEY = "hourlyFollowupAckDate";
const HOURLY_FOLLOWUP_SCHEDULE_KEY = "hourlyFollowupSchedule";
const TIME_FOLLOWUP_SCHEDULE_KEY = "timeFollowupSchedule";
const MISSED_FOLLOWUP_ALERT_STATE_KEY = "missedFollowupAlertState";
const NOTIFICATION_PERMISSION_EXPLAINED_KEY = "notificationPermissionExplained";
const NEXT_FOLLOWUP_PROMPT_SCHEDULE_KEY = "nextFollowupPromptSchedule";
const NOTIFICATION_VOICE_LANG_KEY = "notificationVoiceLang";
const ENQUIRY_MUTE_KEY = "followupEnquiryMuteMap_v1";
const TIME_FOLLOWUP_SCHEDULE_SCHEMA_VERSION = 6;

// ─── Timing Constants ────────────────────────────────────────────────────────
const DEFAULT_FOLLOWUP_PRE_REMIND_MINUTES = 60;
const DEFAULT_FOLLOWUP_PRE_REMIND_EVERY_MINUTES = 5;
const DEFAULT_FOLLOWUP_MISSED_FAST_MINUTES = 10; // ✅ FIX 5: Reduced from 60 → 10
const DEFAULT_FOLLOWUP_MISSED_FAST_EVERY_MINUTES = 4; // ✅ FIX 5: Not used anymore (hardcoded)
const DEFAULT_FOLLOWUP_MISSED_HOURLY_EVERY_MINUTES = 30;
const DEFAULT_FOLLOWUP_MISSED_HOURLY_MAX_HOURS = 12;
const DEFAULT_FOLLOWUP_DUE_REPEAT_FOR_MINUTES = 0;

const DEFAULT_FOLLOWUP_SCHEDULE_WINDOW_DAYS = 2;
const DEFAULT_FOLLOWUP_MISSED_LOOKBACK_DAYS = 2;

const MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC = 30;

// ─── FIX #8: Duplicate scheduling guard ──────────────────────────────────────
let _schedulingLock = false;
let _schedulingLockTs = 0;
const SCHEDULING_LOCK_TIMEOUT_MS = 15000;

// ─── FIX: Notification listener deduplication ────────────────────────────────
let _foregroundListenerRegistered = false;
let _responseListenerRegistered = false;
let _globalListenerRegistered = false;

const acquireSchedulingLock = () => {
    const now = Date.now();
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

const EARLY_FOLLOWUP_GUARD_MS = 20 * 1000;
const _followupCorrectionKeys = new Set();
const FOLLOWUP_AUDIO_DUPLICATE_WINDOW_MS = 20 * 1000;
const FOLLOWUP_SOON_DUPLICATE_WINDOW_MS = 90 * 1000;
const FOLLOWUP_DUE_DUPLICATE_WINDOW_MS = 90 * 1000;
const FOLLOWUP_MISSED_DUPLICATE_WINDOW_MS = 90 * 1000;
const _recentFollowupAudioKeys = new Map();
const FOLLOWUP_SOON_COALESCE_WINDOW_MS = 1200;
const FOLLOWUP_SOON_STALE_AUDIO_MS = 45 * 1000;
const FOLLOWUP_LATE_RECEIVED_AUDIO_SKIP_MS = 10 * 1000;
const _pendingSoonAudioByKey = new Map();
const _foregroundFollowupAudioTimers = new Map();
const FOREGROUND_FALLBACK_GRACE_MS = 650;
// Visual duplicates can arrive a few seconds apart (e.g., foreground fallback vs OS-delivered).
// Use a larger window so a follow-up reminder shows only once.
const FOLLOWUP_VISUAL_DEDUP_WINDOW_MS = 90 * 1000;
const _recentFollowupVisualKeys = new Map();
const _recentFollowupFallbackVisualKeys = new Map();

const markRecentKey = (map, key, nowMs) => {
    if (!key) return;
    map.set(key, Number(nowMs || Date.now()));
    if (map.size > 500) {
        const cutoff = Date.now() - 10 * 60 * 1000;
        for (const [k, ts] of map.entries()) {
            if (Number(ts) < cutoff) map.delete(k);
        }
    }
};

const wasRecentKey = (map, key, nowMs, windowMs) => {
    if (!key) return false;
    const last = Number(map.get(key) ?? 0);
    return last > 0 && Number(nowMs || Date.now()) - last < Number(windowMs);
};

const getExpectedFollowupFireMs = (data = {}) => {
    const type = String(data?.type ?? "")
        .trim()
        .toLowerCase();
    const rawWhen = data?.when ?? null;
    if (!rawWhen) return null;
    const whenMs = new Date(String(rawWhen)).getTime();
    if (!Number.isFinite(whenMs) || whenMs <= 0) return null;

    if (type === "followup-soon") {
        const mins = Math.max(1, Math.round(Number(data?.minutesLeft ?? 0)));
        return whenMs - mins * 60 * 1000;
    }
    if (type === "followup-due") return whenMs;
    if (type === "followup-missed") {
        const delayMins = Math.max(
            1,
            Math.round(Number(data?.missedDelayMinutes ?? 1)),
        );
        return whenMs + delayMins * 60 * 1000;
    }
    return null;
};

const getFollowupCorrectionKey = (data = {}) => {
    const type = String(data?.type ?? "")
        .trim()
        .toLowerCase();
    const when = String(data?.when ?? "").trim();
    if (
        type !== "followup-soon" &&
        type !== "followup-due" &&
        type !== "followup-missed"
    )
        return "";
    if (!when) return "";
    const followUpId = String(data?.followUpId ?? "").trim();
    const mins = String(data?.minutesLeft ?? "").trim();
    const missedDelay = String(data?.missedDelayMinutes ?? "").trim();
    return `${type}|${followUpId}|${when}|${mins}|${missedDelay}`;
};

const getFollowupAudioDedupKey = (data = {}) => {
    const type = String(data?.type ?? "")
        .trim()
        .toLowerCase();
    if (
        type !== "followup-soon" &&
        type !== "followup-due" &&
        type !== "followup-missed"
    )
        return "";
    const followUpId = String(data?.followUpId ?? "").trim();
    const when = String(data?.when ?? "").trim();
    const mins = Math.max(0, Math.round(Number(data?.minutesLeft ?? 0)));
    const missedDelay = Math.max(
        0,
        Math.round(Number(data?.missedDelayMinutes ?? 0)),
    );
    return `${type}|${followUpId}|${when}|${mins}|${missedDelay}`;
};

const scheduleForegroundFollowupAudioFallback = (data = {}, expectedMs) => {
    try {
        if (Platform.OS === "web") return;
        const appState = String(AppState.currentState ?? "").toLowerCase();
        if (appState !== "active") return;
        const key = getFollowupAudioDedupKey(data);
        if (!key || !Number.isFinite(Number(expectedMs))) return;
        const fireAtMs = Number(expectedMs) + FOREGROUND_FALLBACK_GRACE_MS;
        const delay = fireAtMs - Date.now();
        if (delay < 1500 || delay > 2 * 60 * 60 * 1000) return;

        const timerKey = `${key}|fg-fallback`;
        const prev = _foregroundFollowupAudioTimers.get(timerKey);
        if (prev) clearTimeout(prev);

        const timer = setTimeout(() => {
            _foregroundFollowupAudioTimers.delete(timerKey);
            const nowState = String(AppState.currentState ?? "").toLowerCase();
            if (nowState !== "active") return;
            if (!shouldPlayFollowupAudioNow(data)) return;
            Promise.resolve(
                showForegroundFollowupVisualNotification(data),
            ).catch(() => {});
            Promise.resolve(speakForNotificationData(data)).catch(() => {});
        }, delay);
        _foregroundFollowupAudioTimers.set(timerKey, timer);
    } catch {
        /* ignore */
    }
};

const shouldPlayFollowupAudioNow = (data = {}) => {
    if (String(data?.foregroundFallbackVisual ?? "") === "1") return false;
    const key = getFollowupAudioDedupKey(data);
    if (!key) return true;
    const type = String(data?.type ?? "")
        .trim()
        .toLowerCase();
    const duplicateWindowMs =
        type === "followup-soon"
            ? FOLLOWUP_SOON_DUPLICATE_WINDOW_MS
            : type === "followup-due"
              ? FOLLOWUP_DUE_DUPLICATE_WINDOW_MS
              : type === "followup-missed"
                ? FOLLOWUP_MISSED_DUPLICATE_WINDOW_MS
                : FOLLOWUP_AUDIO_DUPLICATE_WINDOW_MS;
    const now = Date.now();
    const last = Number(_recentFollowupAudioKeys.get(key) ?? 0);
    if (last > 0 && now - last < duplicateWindowMs) return false;
    _recentFollowupAudioKeys.set(key, now);
    if (_recentFollowupAudioKeys.size > 300) {
        for (const [k, ts] of _recentFollowupAudioKeys.entries()) {
            if (now - Number(ts) > 10 * 60 * 1000)
                _recentFollowupAudioKeys.delete(k);
        }
    }
    return true;
};

const clearForegroundFollowupAudioFallback = (data = {}) => {
    try {
        const key = getFollowupAudioDedupKey(data);
        if (!key) return;
        const timerKey = `${key}|fg-fallback`;
        const timer = _foregroundFollowupAudioTimers.get(timerKey);
        if (timer) {
            clearTimeout(timer);
            _foregroundFollowupAudioTimers.delete(timerKey);
        }
    } catch {
        /* ignore */
    }
};

const showForegroundFollowupVisualNotification = async (data = {}) => {
    try {
        if (Platform.OS === "web") return null;
        const type = String(data?.type ?? "")
            .trim()
            .toLowerCase();
        if (
            type !== "followup-soon" &&
            type !== "followup-due" &&
            type !== "followup-missed"
        )
            return null;

        const nowMs = Date.now();
        const dedupKey = getFollowupAudioDedupKey(data);
        if (
            dedupKey &&
            wasRecentKey(
                _recentFollowupVisualKeys,
                dedupKey,
                nowMs,
                FOLLOWUP_VISUAL_DEDUP_WINDOW_MS,
            )
        ) {
            return null;
        }
        if (dedupKey) {
            markRecentKey(_recentFollowupFallbackVisualKeys, dedupKey, nowMs);
        }

        const lang = await getNotificationVoiceLanguage();
        const name = String(data?.name ?? "Client").trim();
        const actorName = String(data?.actorName ?? "").trim();
        const activityType = String(data?.activityType ?? "Follow-up").trim();
        const whenRaw = String(data?.when ?? "").trim();
        const when = whenRaw ? new Date(whenRaw) : null;
        const timeLabel =
            when && !Number.isNaN(when.getTime()) ? formatHHmm(when) : "";

        let title = "Follow-up reminder";
        let body = "";
        let channelKey = "followups";

        if (type === "followup-soon") {
            const minutesLeft = Math.max(
                1,
                Math.round(Number(data?.minutesLeft ?? 0)),
            );
            const texts = getFollowUpSoonTexts({
                lang,
                name,
                actorName,
                activityType,
                minutesLeft,
            });
            title = texts.title;
            body = texts.body;
            channelKey = await selectChannelForNotification(
                activityType,
                minutesLeft,
                lang,
            );
        } else if (type === "followup-due") {
            const texts = getFollowUpDueTexts({
                lang,
                name,
                actorName,
                activityType,
                timeLabel,
            });
            title = texts.title;
            body = texts.body;
            channelKey = await selectChannelForNotification(
                activityType,
                "due",
                lang,
            );
        } else {
            const texts = getFollowUpMissedTexts({
                lang,
                name,
                actorName,
                activityType,
                timeLabel: timeLabel ? `at ${timeLabel}` : "",
            });
            title = texts.title;
            body = texts.body;
            channelKey = await selectChannelForNotification(
                activityType,
                "missed",
                lang,
            );
        }

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                subtitle: "Tap to open Follow-ups",
                data: { ...(data || {}), foregroundFallbackVisual: "1" },
                categoryIdentifier: CATEGORY_IDS.followups,
                sound: resolveContentSound(
                    getChannelMeta(channelKey)?.sound ?? "default",
                ),
                vibrate: [0, 250, 250, 250],
                priority: "max",
                android: {
                    channelId: resolveChannelId(channelKey),
                    color: type === "followup-missed" ? "#FF3B5C" : "#0EA5E9",
                    priority: "max",
                    vibrationPattern: [0, 250, 250, 250],
                },
                ios: { sound: true, interruptionLevel: "timeSensitive" },
            },
            trigger: null,
        });
        return id;
    } catch (_error) {
        return null;
    }
};

const getFollowupSoonGroupKey = (data = {}) => {
    const type = String(data?.type ?? "")
        .trim()
        .toLowerCase();
    if (type !== "followup-soon") return "";
    const followUpId = String(data?.followUpId ?? "").trim();
    const when = String(data?.when ?? "").trim();
    return `${followUpId}|${when}`;
};

const isStaleSoonForAudio = (data = {}, nowMs = Date.now()) => {
    const type = String(data?.type ?? "")
        .trim()
        .toLowerCase();
    if (type !== "followup-soon") return false;
    const expectedMs = getExpectedFollowupFireMs(data);
    if (!Number.isFinite(expectedMs)) return false;
    return nowMs - Number(expectedMs) > FOLLOWUP_SOON_STALE_AUDIO_MS;
};

const scheduleCorrectedFollowupNotification = async (
    notification,
    expectedMs,
) => {
    try {
        const content = notification?.request?.content ?? {};
        const data = content?.data ?? {};
        const key = getFollowupCorrectionKey(data);
        if (!key || _followupCorrectionKeys.has(key)) return false;

        const seconds = Math.max(
            1,
            Math.ceil((Number(expectedMs) - Date.now()) / 1000),
        );
        _followupCorrectionKeys.add(key);

        const androidChannelId =
            typeof content?.android?.channelId === "string" &&
            content.android.channelId
                ? content.android.channelId
                : resolveChannelId("followups");

        const correctedNotificationSound =
            getChannelMeta("followups")?.sound ?? "default";

        await Notifications.scheduleNotificationAsync({
            content: {
                title: String(content?.title ?? "Follow-up reminder"),
                body: String(content?.body ?? ""),
                subtitle: String(content?.subtitle ?? "Tap to open Follow-ups"),
                data: { ...(data || {}), corrected: "1" },
                categoryIdentifier:
                    content?.categoryIdentifier || CATEGORY_IDS.followups,
                sound: correctedNotificationSound,
                priority: "max",
                vibrate: [0, 250, 250, 250],
                ios: { sound: true, interruptionLevel: "timeSensitive" },
                android: {
                    channelId: androidChannelId,
                    color: "#0EA5E9",
                    priority: "max",
                    vibrationPattern: [0, 250, 250, 250],
                },
            },
            trigger: { type: "timeInterval", seconds, repeats: false },
        });
        console.log(
            `[NotifSvc] Corrected early follow-up scheduled in ${seconds}s (${key})`,
        );
        if (false && shouldUseServerFollowupReminders()) {
            await cancelTodayFollowUpReminders();
            console.log(
                "[NotifSvc] Server reminders enabled — cleared local follow-up schedules",
            );
        }
        if (false && shouldUseServerFollowupReminders()) {
            await cancelTodayFollowUpReminders();
            console.log(
                "[NotifSvc] Server reminders enabled â€” cleared local follow-up schedules",
            );
        }
        return true;
    } catch (error) {
        console.warn(
            "[NotifSvc] Failed to schedule corrected follow-up:",
            error?.message || error,
        );
        return false;
    }
};

const getEnquiryMuteKey = ({ enqId, enqNo } = {}) => {
    const id = enqId ? String(enqId).trim() : "";
    const no = enqNo ? String(enqNo).trim() : "";
    if (id) return `id:${id}`;
    if (no) return `no:${no}`;
    return "";
};

const loadEnquiryMuteMap = async () => {
    try {
        const raw = await AsyncStorage.getItem(ENQUIRY_MUTE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const map = parsed && typeof parsed === "object" ? parsed : {};
        const now = Date.now();
        let changed = false;
        for (const [k, v] of Object.entries(map)) {
            const until = Number(v?.until || 0);
            if (until && until > 0 && until < now) {
                delete map[k];
                changed = true;
            }
        }
        if (changed)
            await AsyncStorage.setItem(ENQUIRY_MUTE_KEY, JSON.stringify(map));
        return map;
    } catch {
        return {};
    }
};

const muteEnquiryNotifications = async ({
    enqId,
    enqNo,
    untilMs,
    whenMs,
} = {}) => {
    try {
        const key = getEnquiryMuteKey({ enqId, enqNo });
        if (!key) return { muted: false, skipped: true, reason: "no-key" };

        const now = Date.now();
        const until = Number.isFinite(Number(untilMs))
            ? Math.max(now + 60_000, Number(untilMs))
            : now + 24 * 60 * 60 * 1000;

        const map = await loadEnquiryMuteMap();
        const w = Number(whenMs);
        map[key] = {
            until,
            at: now,
            whenMs: Number.isFinite(w) && w > 0 ? w : undefined,
        };
        await AsyncStorage.setItem(ENQUIRY_MUTE_KEY, JSON.stringify(map));
        return { muted: true, skipped: false, until };
    } catch {
        return { muted: false, skipped: false, error: true };
    }
};

const isEnquiryMuted = (muteMap, { enqId, enqNo, whenMs } = {}) => {
    const key = getEnquiryMuteKey({ enqId, enqNo });
    if (!key) return false;
    const rec = muteMap?.[key];
    const until = Number(rec?.until || 0);
    if (!(until > Date.now())) return false;

    const mutedWhen = Number(rec?.whenMs || 0);
    const currentWhen = Number(whenMs || 0);
    if (
        mutedWhen > 0 &&
        Number.isFinite(currentWhen) &&
        currentWhen > 0 &&
        mutedWhen !== currentWhen
    ) {
        try {
            const next = { ...(muteMap || {}) };
            delete next[key];
            AsyncStorage.setItem(ENQUIRY_MUTE_KEY, JSON.stringify(next)).catch(
                () => {},
            );
        } catch {
            /* ignore */
        }
        return false;
    }
    return true;
};

// ─── Safe trigger type resolution ────────────────────────────────────────────
const TRIGGER_TYPES = Notifications.SchedulableTriggerInputTypes ?? {};
const DATE_TRIGGER_TYPE = "date";
const DAILY_TRIGGER_TYPE =
    TRIGGER_TYPES.DAILY ?? TRIGGER_TYPES.TIME_INTERVAL ?? "daily";

// ─── Channel IDs ─────────────────────────────────────────────────────────────
const CHANNEL_IDS = {
    default: "default_v5",
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

const MINUTE_CHANNEL_IDS = (() => {
    const out = {};
    const types = ["followups", "phone", "meeting", "email", "whatsapp"];
    const langs = ["en", "ta"];
    for (const t of types) {
        for (const l of langs) {
            for (const m of [5, 4, 3, 2, 1]) {
                const key = `${t}_${m}min_${l}`;
                out[key] = `${t}_${m}min_${l}`;
            }
            out[`${t}_due_${l}`] = `${t}_due_${l}`;
            out[`${t}_missed_${l}`] = `${t}_missed_${l}`;
        }
    }
    return out;
})();

const MINUTE_NOTIFICATION_CHANNELS = (() => {
    const meta = {};
    const typeLabels = {
        followups: "Follow-ups",
        phone: "Phone",
        meeting: "Meeting",
        email: "Email",
        whatsapp: "WhatsApp",
    };
    const langLabels = { en: "EN", ta: "TA" };

    const minuteSoundFile = (typeKey, langKey, marker) => {
        const map = {
            followups: {
                en: {
                    5: "n5pmin",
                    4: "n4pmin",
                    3: "n3pmin",
                    2: "n2pmin",
                    1: "n1pmin",
                    due: "pdue",
                    missed: "pmissed",
                },
                ta: {
                    5: "t5min",
                    4: "t4min",
                    3: "t3min",
                    2: "t2min",
                    1: "t1min",
                    due: "tdue",
                    missed: "tmissed",
                },
            },
            phone: {
                en: {
                    5: "n5pmin",
                    4: "n4pmin",
                    3: "n3pmin",
                    2: "n2pmin",
                    1: "n1pmin",
                    due: "pdue",
                    missed: "pmissed",
                },
                ta: {
                    5: "t5min",
                    4: "t4min",
                    3: "t3min",
                    2: "t2min",
                    1: "t1min",
                    due: "tdue",
                    missed: "tmissed",
                },
            },
            meeting: {
                en: {
                    5: "m5min",
                    4: "m4min",
                    3: "m3min",
                    2: "m2min",
                    1: "m1min",
                    due: "mdue",
                    missed: "emissed",
                },
                ta: {
                    5: "mt5min",
                    4: "mt4min",
                    3: "mt3min",
                    2: "mt2min",
                    1: "mt1min",
                    due: "mtdue",
                    missed: "mtmissed",
                },
            },
            email: {
                en: {
                    5: "e5min",
                    4: "e4min",
                    3: "e3min",
                    2: "e2min",
                    1: "e1min",
                    due: "edue",
                    missed: "emissed",
                },
                ta: {
                    5: "et5min",
                    4: "et4min",
                    3: "et3min",
                    2: "et2min",
                    1: "et1min",
                    due: "etdue",
                    missed: "etmissed",
                },
            },
            whatsapp: {
                en: {
                    5: "w5min",
                    4: "w4min",
                    3: "w3min",
                    2: "w2min",
                    1: "w1min",
                    due: "wdue",
                    missed: "wmissed",
                },
                ta: {
                    5: "wt5min",
                    4: "wt4min",
                    3: "wt3min",
                    2: "wt2min",
                    1: "wt1min",
                    due: "wtdue",
                    missed: "wtmissed",
                },
            },
        };
        return (
            map?.[typeKey]?.[langKey]?.[marker] ??
            map?.followups?.[langKey]?.[marker] ??
            "default"
        );
    };

    const mk = (name, sound) => ({
        name,
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound,
    });

    for (const t of Object.keys(typeLabels)) {
        for (const l of Object.keys(langLabels)) {
            for (const m of [5, 4, 3, 2, 1]) {
                const key = `${t}_${m}min_${l}`;
                meta[key] = mk(
                    `${typeLabels[t]} (${m} min) ${langLabels[l]}`,
                    minuteSoundFile(t, l, m),
                );
            }
            meta[`${t}_due_${l}`] = mk(
                `${typeLabels[t]} (Due) ${langLabels[l]}`,
                minuteSoundFile(t, l, "due"),
            );
            meta[`${t}_missed_${l}`] = mk(
                `${typeLabels[t]} (Missed) ${langLabels[l]}`,
                minuteSoundFile(t, l, "missed"),
            );
        }
    }
    return meta;
})();

const CATEGORY_IDS = {
    followups: "FOLLOWUP_ACTIONS_V3",
    next_followup: "NEXT_FOLLOWUP_PROMPT",
};

const NOTIFICATION_CHANNELS = {
    followups: {
        name: "Follow-ups",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "pdue", // Default sound for followups
    },
    followups_soon_en: {
        name: "Follow-ups (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "n5pmin",
    },
    followups_due_en: {
        name: "Follow-ups (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "pdue",
    },
    followups_missed_en: {
        name: "Follow-ups (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "pmissed",
    },
    followups_soon_ta: {
        name: "Follow-ups (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "t5min",
    },
    followups_due_ta: {
        name: "Follow-ups (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "tdue",
    },
    followups_missed_ta: {
        name: "Follow-ups (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "tmissed",
    },
    phone_soon_en: {
        name: "Phone (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "n5pmin",
    },
    phone_due_en: {
        name: "Phone (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "pdue",
    },
    phone_missed_en: {
        name: "Phone (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "pmissed",
    },
    meeting_soon_en: {
        name: "Meeting (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "m5min",
    },
    meeting_due_en: {
        name: "Meeting (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "mdue",
    },
    meeting_missed_en: {
        name: "Meeting (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "emissed",
    },
    email_soon_en: {
        name: "Email (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "e5min",
    },
    email_due_en: {
        name: "Email (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "edue",
    },
    email_missed_en: {
        name: "Email (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "emissed",
    },
    whatsapp_soon_en: {
        name: "WhatsApp (Soon) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "w5min",
    },
    whatsapp_due_en: {
        name: "WhatsApp (Due) EN",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "wdue",
    },
    whatsapp_missed_en: {
        name: "WhatsApp (Missed) EN",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "wmissed",
    },
    phone_soon_ta: {
        name: "Phone (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "t5min",
    },
    phone_due_ta: {
        name: "Phone (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "tdue",
    },
    phone_missed_ta: {
        name: "Phone (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "tmissed",
    },
    meeting_soon_ta: {
        name: "Meeting (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "mt5min",
    },
    meeting_due_ta: {
        name: "Meeting (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "mtdue",
    },
    meeting_missed_ta: {
        name: "Meeting (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "mtmissed",
    },
    email_soon_ta: {
        name: "Email (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "et5min",
    },
    email_due_ta: {
        name: "Email (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "etdue",
    },
    email_missed_ta: {
        name: "Email (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "etmissed",
    },
    whatsapp_soon_ta: {
        name: "WhatsApp (Soon) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "wt5min",
    },
    whatsapp_due_ta: {
        name: "WhatsApp (Due) TA",
        lightColor: "#0EA5E9",
        vibrationPattern: [0, 250, 250, 250],
        sound: "wtdue",
    },
    whatsapp_missed_ta: {
        name: "WhatsApp (Missed) TA",
        lightColor: "#FF3B5C",
        vibrationPattern: [0, 250, 250, 250],
        sound: "wtmissed",
    },
    enquiries: {
        name: "Enquiries",
        lightColor: "#16A34A",
        vibrationPattern: [0, 180, 140, 180],
        sound: "pdue",
    },
    coupons: {
        name: "Coupons",
        lightColor: "#2563EB",
        vibrationPattern: [0, 180, 120, 180],
        sound: "pdue",
    },
    team_chat: {
        name: "Team Chat",
        lightColor: "#0F766E",
        vibrationPattern: [0, 180, 90, 180],
        sound: "pdue",
    },
    billing: {
        name: "Plan Alerts",
        lightColor: "#F59E0B",
        vibrationPattern: [0, 220, 160, 220],
        sound: "pdue",
    },
    reports: {
        name: "Reports",
        lightColor: "#B8892A",
        vibrationPattern: [0, 150, 120, 150],
        sound: "pdue",
    },
};

// ─── Notification Handler ─────────────────────────────────────────────────────
if (Platform.OS !== "web") {
    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            const data = notification?.request?.content?.data ?? {};
            const isFollowup =
                data.type === "followup-soon" ||
                data.type === "followup-due" ||
                data.type === "followup-missed";
            const isForegroundFallbackVisual =
                String(data?.foregroundFallbackVisual ?? "") === "1";
            const nowMs = Date.now();
            const followupKey = isFollowup
                ? getFollowupAudioDedupKey(data)
                : "";

            // Guard: suppress any duplicate visual follow-up notification (same key) within the window.
            // This covers cases where the same reminder is emitted twice (e.g., reschedule glitches or
            // foreground fallback + OS delivered arriving seconds apart).
            if (
                isFollowup &&
                followupKey &&
                wasRecentKey(
                    _recentFollowupVisualKeys,
                    followupKey,
                    nowMs,
                    FOLLOWUP_VISUAL_DEDUP_WINDOW_MS,
                ) &&
                !isForegroundFallbackVisual
            ) {
                return {
                    shouldShowBanner: false,
                    shouldShowList: false,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                };
            }

            if (isFollowup && !isForegroundFallbackVisual && followupKey) {
                markRecentKey(_recentFollowupVisualKeys, followupKey, nowMs);
            }
            const expectedMs = getExpectedFollowupFireMs(data);
            const deltaMsFromExpected = Number.isFinite(expectedMs)
                ? Date.now() - Number(expectedMs)
                : null;
            const isEarly =
                isFollowup &&
                Number.isFinite(expectedMs) &&
                Number(expectedMs) - Date.now() > EARLY_FOLLOWUP_GUARD_MS;
            const isLateFollowupForeground =
                isFollowup &&
                !isForegroundFallbackVisual &&
                Number.isFinite(deltaMsFromExpected) &&
                Number(deltaMsFromExpected) >
                    FOLLOWUP_LATE_RECEIVED_AUDIO_SKIP_MS;

            if (
                isFollowup &&
                isForegroundFallbackVisual &&
                followupKey &&
                wasRecentKey(
                    _recentFollowupVisualKeys,
                    followupKey,
                    nowMs,
                    FOLLOWUP_VISUAL_DEDUP_WINDOW_MS,
                )
            ) {
                return {
                    shouldShowBanner: false,
                    shouldShowList: false,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                };
            }

            if (
                isFollowup &&
                !isForegroundFallbackVisual &&
                followupKey &&
                wasRecentKey(
                    _recentFollowupFallbackVisualKeys,
                    followupKey,
                    nowMs,
                    FOLLOWUP_VISUAL_DEDUP_WINDOW_MS,
                )
            ) {
                return {
                    shouldShowBanner: false,
                    shouldShowList: false,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                };
            }

            if (isEarly) {
                Promise.resolve(
                    scheduleCorrectedFollowupNotification(
                        notification,
                        Number(expectedMs),
                    ),
                ).catch(() => {});
                console.warn(
                    `[NotifSvc] Early follow-up suppressed (${data?.type}) for ${data?.when}`,
                );
                return {
                    shouldShowBanner: false,
                    shouldShowList: false,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                };
            }
            if (isLateFollowupForeground) {
                console.warn(
                    `[NotifSvc] Late follow-up visual suppressed (${data?.type}, delta=${deltaMsFromExpected}ms)`,
                );
                return {
                    shouldShowBanner: false,
                    shouldShowList: false,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                };
            }
            if (isForegroundFallbackVisual) {
                return {
                    shouldShowBanner: true,
                    shouldShowList: true,
                    shouldPlaySound: !(
                        isFollowup &&
                        followupKey &&
                        wasRecentKey(
                            _recentFollowupVisualKeys,
                            followupKey,
                            nowMs,
                            FOLLOWUP_VISUAL_DEDUP_WINDOW_MS,
                        )
                    ),
                    shouldSetBadge: true,
                    priority:
                        Notifications.AndroidNotificationPriority?.MAX ?? "max",
                };
            }
            return {
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                priority:
                    Notifications.AndroidNotificationPriority?.MAX ?? "max",
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
                { data: dataUri, flags: 1, type: "text/csv" },
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
let _isPlayingAudio = false;

export const resetAudioModeOnAppBackground = () => {
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
            console.log(
                "[NotifSvc] App foreground - ensuring audio mode ready",
            );
            await ensureAudioMode();
        }
    });
}

const ensureAudioMode = async () => {
    if (audioModeReady) return;
    const Audio = getAudioModule();
    if (!Audio?.setAudioModeAsync) return;
    try {
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            interruptionModeAndroid: 2,
            interruptionModeIOS: 2,
        });
        audioModeReady = true;
        console.log("[NotifSvc] ✓ Audio mode configured");
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
    return "followup"; // ✅ Returns "followup" — now handled in AUDIO_MODULES
};

// ─── AUDIO_MODULES ────────────────────────────────────────────────────────────
const AUDIO_MODULES = {
    en: {
        phone: {
            5: require("../assets/Audio/Phone/English/n5pmin.wav"),
            4: require("../assets/Audio/Phone/English/n4pmin.wav"),
            3: require("../assets/Audio/Phone/English/n3pmin.wav"),
            2: require("../assets/Audio/Phone/English/n2pmin.wav"),
            1: require("../assets/Audio/Phone/English/n1pmin.wav"),
            due: require("../assets/Audio/Phone/English/pdue.wav"),
            missed: require("../assets/Audio/Phone/English/pmissed.wav"),
        },
        whatsapp: {
            5: require("../assets/Audio/Whatsapp/English/w5min.wav"),
            4: require("../assets/Audio/Whatsapp/English/w4min.wav"),
            3: require("../assets/Audio/Whatsapp/English/w3min.wav"),
            2: require("../assets/Audio/Whatsapp/English/w2min.wav"),
            1: require("../assets/Audio/Whatsapp/English/w1min.wav"),
            due: require("../assets/Audio/Whatsapp/English/wdue.wav"),
            missed: require("../assets/Audio/Whatsapp/English/wmissed.wav"),
        },
        email: {
            5: require("../assets/Audio/Email/English/e5min.wav"),
            4: require("../assets/Audio/Email/English/e4min.wav"),
            3: require("../assets/Audio/Email/English/e3min.wav"),
            2: require("../assets/Audio/Email/English/e2min.wav"),
            1: require("../assets/Audio/Email/English/e1min.wav"),
            due: require("../assets/Audio/Email/English/edue.wav"),
            missed: require("../assets/Audio/Email/English/emissed.wav"),
        },
        meeting: {
            5: require("../assets/Audio/Meeting/English/m5min.wav"),
            4: require("../assets/Audio/Meeting/English/m4min.wav"),
            3: require("../assets/Audio/Meeting/English/m3min.wav"),
            2: require("../assets/Audio/Meeting/English/m2min.wav"),
            1: require("../assets/Audio/Meeting/English/m1min.wav"),
            due: require("../assets/Audio/Meeting/English/mdue.wav"),
            missed: require("../assets/Audio/Meeting/English/emissed.wav"),
        },
        // ✅ FIX 1: Added "followup" alias — uses phone audio for generic follow-up type
        followup: {
            5: require("../assets/Audio/Phone/English/n5pmin.wav"),
            4: require("../assets/Audio/Phone/English/n4pmin.wav"),
            3: require("../assets/Audio/Phone/English/n3pmin.wav"),
            2: require("../assets/Audio/Phone/English/n2pmin.wav"),
            1: require("../assets/Audio/Phone/English/n1pmin.wav"),
            due: require("../assets/Audio/Phone/English/pdue.wav"),
            missed: require("../assets/Audio/Phone/English/pmissed.wav"),
        },
    },
    ta: {
        phone: {
            5: require("../assets/Audio/Phone/Tamil/t5min.wav"),
            4: require("../assets/Audio/Phone/Tamil/t4min.wav"),
            3: require("../assets/Audio/Phone/Tamil/t3min.wav"),
            2: require("../assets/Audio/Phone/Tamil/t2min.wav"),
            1: require("../assets/Audio/Phone/Tamil/t1min.wav"),
            due: require("../assets/Audio/Phone/Tamil/tdue.wav"),
            missed: require("../assets/Audio/Phone/Tamil/tmissed.wav"),
        },
        whatsapp: {
            5: require("../assets/Audio/Whatsapp/Tamil/wt5min.wav"),
            4: require("../assets/Audio/Whatsapp/Tamil/wt4min.wav"),
            3: require("../assets/Audio/Whatsapp/Tamil/wt3min.wav"),
            2: require("../assets/Audio/Whatsapp/Tamil/wt2min.wav"),
            1: require("../assets/Audio/Whatsapp/Tamil/wt1min.wav"),
            due: require("../assets/Audio/Whatsapp/Tamil/wtdue.wav"),
            missed: require("../assets/Audio/Whatsapp/Tamil/wtmissed.wav"),
        },
        email: {
            5: require("../assets/Audio/Email/Tamil/et5min.wav"),
            4: require("../assets/Audio/Email/Tamil/et4min.wav"),
            3: require("../assets/Audio/Email/Tamil/et3min.wav"),
            2: require("../assets/Audio/Email/Tamil/et2min.wav"),
            1: require("../assets/Audio/Email/Tamil/et1min.wav"),
            due: require("../assets/Audio/Email/Tamil/etdue.wav"),
            missed: require("../assets/Audio/Email/Tamil/etmissed.wav"),
        },
        meeting: {
            5: require("../assets/Audio/Meeting/Tamil/mt5min.wav"),
            4: require("../assets/Audio/Meeting/Tamil/mt4min.wav"),
            3: require("../assets/Audio/Meeting/Tamil/mt3min.wav"),
            2: require("../assets/Audio/Meeting/Tamil/mt2min.wav"),
            1: require("../assets/Audio/Meeting/Tamil/mt1min.wav"),
            due: require("../assets/Audio/Meeting/Tamil/mtdue.wav"),
            missed: require("../assets/Audio/Meeting/Tamil/mtmissed.wav"),
        },
        // ✅ FIX 1: Added "followup" alias for Tamil too
        followup: {
            5: require("../assets/Audio/Phone/Tamil/t5min.wav"),
            4: require("../assets/Audio/Phone/Tamil/t4min.wav"),
            3: require("../assets/Audio/Phone/Tamil/t3min.wav"),
            2: require("../assets/Audio/Phone/Tamil/t2min.wav"),
            1: require("../assets/Audio/Phone/Tamil/t1min.wav"),
            due: require("../assets/Audio/Phone/Tamil/tdue.wav"),
            missed: require("../assets/Audio/Phone/Tamil/tmissed.wav"),
        },
    },
};

const playAudioModule = async (moduleRef, retries = 3) => {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        let sound = null;
        try {
            if (!moduleRef) {
                console.error(
                    "[NotifSvc] ✗ Audio module ref is null/undefined",
                );
                return false;
            }
            if (Platform.OS === "web") return false;
            const Audio = getAudioModule();
            if (!Audio?.Sound) return false;

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
                const delayMs = 500 * (attempt + 1);
                console.log(`[NotifSvc] Retrying audio in ${delayMs}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    console.error(
        `[NotifSvc] Audio failed after ${retries + 1} attempts:`,
        lastError?.message || lastError,
    );
    return false;
};

// ✅ FIX 2: playAudioForNotificationData — safe fallback chain for missing activity key
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

        // ✅ FIX 2: Fallback chain: activityKey → followup → phone → null
        const entry =
            pack?.[activityKey] ??
            pack?.["followup"] ??
            pack?.["phone"] ??
            null;

        if (!entry) {
            console.warn(
                `[NotifSvc] No audio entry for activity: ${activityKey} (lang: ${lang})`,
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
    MINUTE_CHANNEL_IDS[channelId] ?? CHANNEL_IDS[channelId] ?? channelId;

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
            5: "5min",
            4: "4min",
            3: "3min",
            2: "2min",
            1: "1min",
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
            if (MINUTE_CHANNEL_IDS[channelKey] || CHANNEL_IDS[channelKey]) {
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
    sound = null,
    sticky = false,
    priority = "max",
    vibrate = [0, 250, 250, 250],
    categoryIdentifier = CATEGORY_IDS.followups,
}) => {
    try {
        if (when.getTime() < Date.now() - 30000) {
            console.warn(
                `[NotifSvc] Skipping past-time notification: ${when.toISOString()}`,
            );
            return null;
        }

        const resolvedChannelId = resolveChannelId(channelId);
        const trigger = await buildReliableTrigger(when);
        const channelMeta = getChannelMeta(channelId);
        const finalSound = resolveContentSound(
            sound ?? channelMeta?.sound ?? "default",
        );

        const notifId = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                subtitle,
                data,
                categoryIdentifier,
                sound: finalSound,
                vibrate,
                priority,
                android: {
                    channelId: resolvedChannelId,
                    color,
                    priority,
                    sticky,
                    vibrationPattern: vibrate,
                },
                ios: { sound: true, interruptionLevel: "timeSensitive" },
            },
            trigger,
        });

        if (notifId)
            console.log(
                `[NotifSvc] ✓ Scheduled: ${notifId} (${when.toISOString()})`,
            );
        return notifId;
    } catch (error) {
        console.error(
            `[NotifSvc] ✗ Failed to schedule for ${when.toISOString()}:`,
            error?.message,
        );
        return null;
    }
};

const buildDateTrigger = (date) => ({
    type: DATE_TRIGGER_TYPE,
    date: new Date(date),
});

const buildReliableTrigger = async (when) => {
    const targetMs = new Date(when).getTime();
    const dateTrigger = buildDateTrigger(targetMs);

    if (typeof Notifications.getNextTriggerDateAsync === "function") {
        try {
            const nextMs =
                await Notifications.getNextTriggerDateAsync(dateTrigger);
            if (
                !Number.isFinite(nextMs) ||
                Math.abs(Number(nextMs) - targetMs) > 15 * 1000
            ) {
                console.warn(
                    `[NotifSvc] Date trigger mismatch — forcing absolute Date trigger`,
                );
                return buildDateTrigger(targetMs);
            }
        } catch (error) {
            console.warn(
                `[NotifSvc] Date trigger validation failed — forcing absolute:`,
                error?.message || error,
            );
            return buildDateTrigger(targetMs);
        }
    }
    return dateTrigger;
};

const buildDailyTrigger = (hour, minute) => ({
    type: DAILY_TRIGGER_TYPE,
    hour,
    minute,
    repeats: true,
});

const getChannelMeta = (channelId = "default") =>
    MINUTE_NOTIFICATION_CHANNELS[channelId] ??
    NOTIFICATION_CHANNELS[channelId] ?? {
        name: "default",
        lightColor: "#2563EB",
        vibrationPattern: [0, 220, 160, 220],
    };

const resolveContentSound = (sound = "default") => {
    const raw = String(sound || "").trim();
    if (!raw || raw.toLowerCase() === "default") return "default";
    if (Platform.OS === "ios") {
        return raw.toLowerCase().endsWith(".wav") ? raw : `${raw}.wav`;
    }
    // Android channels use raw resource name (no extension)
    return raw.replace(/\.wav$/i, "");
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
    priority = "max",
    vibrate,
}) => {
    if (!isNotificationSupported()) return null;

    const channelMeta = getChannelMeta(channelId);
    const vibrationPattern = vibrate ?? channelMeta.vibrationPattern;
    const notificationSound = resolveContentSound(
        channelMeta?.sound ?? "default",
    );
    const resolvedChannelId = resolveChannelId(channelId);

    return Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            subtitle,
            data,
            sound: notificationSound,
            vibrate: vibrationPattern,
            badge,
            priority,
            ios: { badge, sound: true, interruptionLevel: "timeSensitive" },
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

        if (Platform.OS === "android") {
            const setChannel = async (
                id,
                meta,
                importance = Notifications.AndroidImportance.MAX,
            ) => {
                try {
                    const soundToUse = meta.sound ?? "default";
                    await Notifications.setNotificationChannelAsync(id, {
                        name: meta.name ?? "Notifications",
                        importance,
                        vibrationPattern: meta.vibrationPattern ?? [
                            0, 250, 250, 250,
                        ],
                        lightColor: meta.lightColor ?? "#0EA5E9",
                        sound: soundToUse,
                        enableVibrate: true,
                        enableLights: true,
                        lockscreenVisibility:
                            Notifications.AndroidNotificationVisibility
                                ?.PUBLIC ?? 1,
                        showBadge: true,
                    });
                    console.log(
                        `[NotifSvc] ✓ Channel: ${id} (sound: ${soundToUse})`,
                    );
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
                    sound: "pdue",
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

            for (const [key, channelId] of Object.entries(MINUTE_CHANNEL_IDS)) {
                const meta = MINUTE_NOTIFICATION_CHANNELS[key];
                if (!meta) continue;
                await setChannel(
                    channelId,
                    meta,
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

        try {
            await Notifications.setNotificationCategoryAsync(
                CATEGORY_IDS.followups,
                [
                    {
                        identifier: "FOLLOWUP_CANCEL",
                        buttonTitle: "Cancel",
                        options: { opensAppToForeground: true },
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

        if (Constants.appOwnership !== "expo") {
            try {
                // ✅ FIX 3: Guard against missing initialize() method
                if (
                    typeof firebaseNotificationService?.initialize ===
                    "function"
                ) {
                    await firebaseNotificationService.initialize();
                    console.log(
                        "[NotifSvc] ✓ Firebase notifications initialized",
                    );

                    // Enforce auth-gated behavior (logged-out: delete token; logged-in: ensure registered)
                    if (
                        typeof firebaseNotificationService?.syncAuthState ===
                        "function"
                    ) {
                        await firebaseNotificationService.syncAuthState();
                    }
                } else {
                    console.log(
                        "[NotifSvc] ⚠ firebaseNotificationService.initialize not available — skipping",
                    );
                }
            } catch (firebaseError) {
                console.warn(
                    "[NotifSvc] ⚠ Firebase init failed:",
                    firebaseError?.message,
                );
            }
        } else {
            console.log(
                "[NotifSvc] ⚠ Running in Expo Go - native Firebase messaging skipped",
            );
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
        const dailySound = getChannelMeta("followups")?.sound ?? "default";
        Notifications.scheduleNotificationAsync({
            content: {
                title: "⏰ Daily Follow-up Reminder",
                body: "Check your follow-ups for today",
                data: {
                    type: "daily-reminder",
                    timestamp: new Date().toISOString(),
                },
                sound: dailySound,
                priority: "max",
                vibrate: [0, 250, 250, 250],
                ios: { sound: true, interruptionLevel: "timeSensitive" },
                android: {
                    channelId: resolveChannelId("followups"),
                    color: "#0EA5E9",
                    priority: "max",
                    vibrationPattern: [0, 250, 250, 250],
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

export const cancelAllNotifications = async () => {
    try {
        if (!isNotificationSupported()) return;
        await Notifications.cancelAllScheduledNotificationsAsync();
        console.log("All notifications cancelled");
    } catch (error) {
        console.error("Failed to cancel notifications:", error);
    }
};

export const dismissAllDeliveredNotifications = async () => {
    try {
        if (!isNotificationSupported()) return;
        await Notifications.dismissAllNotificationsAsync();
        try {
            await Notifications.setBadgeCountAsync(0);
        } catch {
            /* ignore */
        }
    } catch (error) {
        console.error("Failed to dismiss delivered notifications:", error);
    }
};

export const cancelNotification = async (notificationId) => {
    try {
        if (!isNotificationSupported()) return;
        await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
        console.error("Failed to cancel notification:", error);
    }
};

export const getDevicePushToken = async () => {
    try {
        if (Platform.OS === "web") {
            console.log(
                "[NotifSvc] Web push token listener is limited; skipping",
            );
            return null;
        }
        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ??
            Constants?.easConfig?.projectId;
        const options = projectId ? { projectId } : undefined;
        const token = await Notifications.getExpoPushTokenAsync(options);
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
        const authToken = await getAuthToken();
        if (!authToken) {
            console.warn("[NotifSvc] ⚠ No auth token");
            return false;
        }

        const response = await fetch(`${API_URL}/auth/register-push-token`, {
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
    // FIX: Prevent duplicate listener registration
    if (_responseListenerRegistered) {
        console.warn(
            "[NotifSvc] Response listener already registered, skipping",
        );
        return { remove: () => {} };
    }

    _responseListenerRegistered = true;

    return Notifications.addNotificationResponseReceivedListener((response) => {
        const notification = response.notification;
        console.log("Notification tapped:", notification.request.content.data);
        if (callback) callback(notification.request.content.data);
    });
};

export const setupForegroundNotificationListener = (callback) => {
    if (!isNotificationSupported()) return { remove: () => {} };

    // FIX: Prevent duplicate listener registration
    if (_foregroundListenerRegistered) {
        console.warn(
            "[NotifSvc] Foreground listener already registered, skipping",
        );
        return { remove: () => {} };
    }

    _foregroundListenerRegistered = true;

    return Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        const type = String(data?.type ?? "")
            .trim()
            .toLowerCase();
        const isFollowup =
            type === "followup-soon" ||
            type === "followup-due" ||
            type === "followup-missed";
        const isForegroundFallbackVisual =
            String(data?.foregroundFallbackVisual ?? "") === "1";
        const expectedMs = getExpectedFollowupFireMs(data);
        const nowMs = Date.now();
        const followupKey = isFollowup ? getFollowupAudioDedupKey(data) : "";
        const deltaMsFromExpected = Number.isFinite(expectedMs)
            ? nowMs - Number(expectedMs)
            : null;
        console.log("Notification received (foreground):", {
            ...data,
            receivedAt: new Date(nowMs).toISOString(),
            expectedAt: Number.isFinite(expectedMs)
                ? new Date(Number(expectedMs)).toISOString()
                : null,
            deltaMsFromExpected,
        });

        if (isFollowup) clearForegroundFollowupAudioFallback(data);

        if (isForegroundFallbackVisual) {
            if (
                followupKey &&
                wasRecentKey(
                    _recentFollowupVisualKeys,
                    followupKey,
                    nowMs,
                    FOLLOWUP_VISUAL_DEDUP_WINDOW_MS,
                )
            ) {
                return;
            }
            if (callback) callback(data);
            return;
        }

        if (isFollowup && followupKey) {
            markRecentKey(_recentFollowupVisualKeys, followupKey, nowMs);
        }

        const isEarly =
            isFollowup &&
            Number.isFinite(expectedMs) &&
            Number(expectedMs) - nowMs > EARLY_FOLLOWUP_GUARD_MS;
        if (isEarly) {
            console.warn(
                `[NotifSvc] Foreground early follow-up suppressed (${type})`,
            );
            if (callback) callback(data);
            return;
        }

        if (
            isFollowup &&
            Number.isFinite(deltaMsFromExpected) &&
            Number(deltaMsFromExpected) > FOLLOWUP_LATE_RECEIVED_AUDIO_SKIP_MS
        ) {
            console.log(
                `[NotifSvc] Late follow-up audio replay skipped (${type}, delta=${deltaMsFromExpected}ms)`,
            );
            if (callback) callback(data);
            return;
        }

        const playNow = (payload) => {
            Promise.resolve(speakForNotificationData(payload)).catch((err) => {
                console.warn(
                    "[NotifSvc] Foreground audio playback error:",
                    err,
                );
            });
        };

        if (type === "followup-soon") {
            if (isStaleSoonForAudio(data, nowMs)) {
                const adjusted = { ...data };
                if (shouldPlayFollowupAudioNow(adjusted)) playNow(adjusted);
            } else {
                const groupKey = getFollowupSoonGroupKey(data);
                if (!groupKey) {
                    if (shouldPlayFollowupAudioNow(data)) playNow(data);
                } else {
                    const prev = _pendingSoonAudioByKey.get(groupKey);
                    const prevMins = Number(prev?.data?.minutesLeft ?? 99);
                    const curMins = Number(data?.minutesLeft ?? 99);
                    const nextData = curMins <= prevMins ? data : prev?.data;
                    if (prev?.timer) clearTimeout(prev.timer);
                    const timer = setTimeout(() => {
                        const finalRec = _pendingSoonAudioByKey.get(groupKey);
                        _pendingSoonAudioByKey.delete(groupKey);
                        const finalData = finalRec?.data ?? nextData;
                        if (shouldPlayFollowupAudioNow(finalData))
                            playNow(finalData);
                        else
                            console.log(
                                `[NotifSvc] Foreground duplicate follow-up audio skipped (followup-soon)`,
                            );
                    }, FOLLOWUP_SOON_COALESCE_WINDOW_MS);
                    _pendingSoonAudioByKey.set(groupKey, {
                        data: nextData,
                        timer,
                    });
                }
            }
        } else if (
            data?.type &&
            (!isFollowup || shouldPlayFollowupAudioNow(data))
        ) {
            playNow(data);
        } else if (isFollowup) {
            console.log(
                `[NotifSvc] Foreground duplicate follow-up audio skipped (${type})`,
            );
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
                    if (lang === "ta")
                        await safeSpeak(
                            minutesLeft === 1
                                ? "வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் 1 நிமிடத்தில் அழைக்கவும்."
                                : `வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் ${minutesLeft} நிமிடங்களில் அழைக்கவும்.`,
                        );
                    else
                        await safeSpeak(
                            name
                                ? `Your customer is waiting. Call ${name} in ${minutesLeft} minutes.`
                                : `Your customer is waiting. Call in ${minutesLeft} minutes.`,
                        );
                } else {
                    if (lang === "ta") {
                        const minsLabel =
                            minutesLeft === 1
                                ? "1 நிமிடத்தில்"
                                : `${minutesLeft} நிமிடங்களில்`;
                        if (t === "whatsapp")
                            await safeSpeak(
                                `வாட்ஸ்அப் பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது.`,
                            );
                        else if (t === "email")
                            await safeSpeak(
                                `மின்னஞ்சல் பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது.`,
                            );
                        else if (t === "meeting")
                            await safeSpeak(
                                `ஆன்லைன் சந்திப்பு இன்னும் ${minsLabel} உள்ளது.`,
                            );
                        else
                            await safeSpeak(
                                `பின்தொடர்பு இன்னும் ${minsLabel} உள்ளது.`,
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
                        "நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது அழைக்கவும்.",
                    );
                else if (t === "whatsapp")
                    await safeSpeak(
                        "நீங்கள் வாட்ஸ்அப் பின்தொடர்பை தவறவிட்டீர்கள்.",
                    );
                else if (t === "email")
                    await safeSpeak(
                        "நீங்கள் மின்னஞ்சல் பின்தொடர்பை தவறவிட்டீர்கள்.",
                    );
                else if (t === "meeting")
                    await safeSpeak(
                        "நீங்கள் ஆன்லைன் சந்திப்பை தவறவிட்டீர்கள்.",
                    );
                else await safeSpeak("நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள்.");
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
                    await safeSpeak("இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம்.");
                else if (t === "email")
                    await safeSpeak("இப்போது மின்னஞ்சல் பின்தொடர்பு நேரம்.");
                else if (t === "meeting")
                    await safeSpeak("இப்போது ஆன்லைன் சந்திப்பு நேரம்.");
                else await safeSpeak("இப்போது பின்தொடர்பு நேரம்.");
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
        if (type === "enquiry-error")
            await safeSpeak("Enquiry creation failed. Please try again.");
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

        if (prev?.dateKey === todayKey && Number(prev?.count ?? 0) === count)
            return { notified: false, skipped: true, reason: "no-change" };

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

const getFollowUpActorName = (item) => {
    const candidate =
        item?.staffName ||
        item?.createdBy?.name ||
        item?.assignedTo?.name ||
        item?.assignedToName ||
        item?.createdBy ||
        "";
    const actorName = String(candidate || "").trim();
    return actorName && actorName !== "undefined" && actorName !== "null"
        ? actorName
        : "";
};

const buildSoonContent = (item, when, minutesLeft, lang = "en") => {
    const name = String(item?.name ?? "Client").trim();
    const activityType = String(
        item?.activityType ?? item?.type ?? "Follow-up",
    ).trim();
    const actorName = getFollowUpActorName(item);
    const mins = Math.max(1, Math.round(Number(minutesLeft ?? 0)));
    const texts = getFollowUpSoonTexts({
        lang,
        name,
        actorName,
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
            actorName,
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
                /* invalid */
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
    const actorName = getFollowUpActorName(item);
    const timeLabel = when ? formatHHmm(when) : "";
    const { enqId, enqNo } = resolveEnquiryKeyFromItem(item);
    const texts = getFollowUpDueTexts({
        lang,
        name,
        actorName,
        activityType,
        timeLabel,
    });
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
            actorName,
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
    const actorName = getFollowUpActorName(item);
    const timeLabel = when ? formatHHmm(when) : "";
    const { enqId, enqNo } = resolveEnquiryKeyFromItem(item);
    const texts = getFollowUpMissedTexts({
        lang,
        name,
        actorName,
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
            actorName,
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
        if (shouldUseServerFollowupReminders()) {
            await cancelHourlyFollowUpReminders();
            console.log(
                "[NotifSvc] Server reminders enabled — skipping hourly local scheduling",
            );
            return { scheduled: 0, skipped: true, reason: "server_reminders" };
        }
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
                    sound: resolveContentSound(
                        getChannelMeta(channelId)?.sound ?? "default",
                    ),
                    priority: "max",
                    vibrate: [0, 250, 250, 250],
                    ios: { sound: true, interruptionLevel: "timeSensitive" },
                    android: {
                        channelId: resolveChannelId(channelId),
                        color: "#0EA5E9",
                        priority: "max",
                        vibrationPattern: [0, 250, 250, 250],
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
export const scheduleTimeFollowUpRemindersForToday = async (
    followUps,
    {
        channelId = "followups",
        endHour = 21,
        windowDays = DEFAULT_FOLLOWUP_SCHEDULE_WINDOW_DAYS,
        missedLookbackDays = DEFAULT_FOLLOWUP_MISSED_LOOKBACK_DAYS,
    } = {},
) => {
    if (!acquireSchedulingLock()) {
        console.warn(
            "[NotifSvc] Scheduling already in progress — skipping duplicate call",
        );
        return { scheduled: 0, skipped: true, reason: "lock" };
    }

    try {
        if (Platform.OS === "web") return { scheduled: 0, skipped: true };

        // IMPORTANT: Prevent double notifications.
        // In native (FCM) builds we rely on server-side reminders; local time scheduling would duplicate
        // the same 5/4/3/2/1/due/missed alerts.
        if (shouldUseServerFollowupReminders()) {
            await cancelTimeFollowUpReminders();
            console.log(
                "[NotifSvc] Server reminders enabled — skipping time-based local scheduling",
            );
            return { scheduled: 0, skipped: true, reason: "server_reminders" };
        }

        const muteMap = await loadEnquiryMuteMap();
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
                const timeStr =
                    item?.time ??
                    item?.dueTime ??
                    item?.followUpTime ??
                    item?.nextFollowUpTime ??
                    "";
                const dateStr =
                    item?.nextFollowUpDate ?? item?.followUpDate ?? item?.date;
                let when = timeStr
                    ? parseLocalDateTime(dateStr, timeStr)
                    : null;
                if (
                    !when &&
                    item?.dueAt &&
                    !Number.isNaN(new Date(item.dueAt).getTime())
                )
                    when = new Date(item.dueAt);
                const ms = when ? when.getTime() : NaN;
                const enqId =
                    item?.enqId?._id || item?.enqId || item?.enquiryId;
                const enqNo = item?.enqNo || item?.enquiryNo;
                return { item, when, ms, enqId, enqNo };
            })
            .filter(
                ({ when, ms }) =>
                    Boolean(when) &&
                    Number.isFinite(ms) &&
                    ms >= startMs &&
                    ms <= endMs,
            )
            .filter(
                ({ enqId, enqNo, ms }) =>
                    !isEnquiryMuted(muteMap, { enqId, enqNo, whenMs: ms }),
            )
            .sort((a, b) => a.ms - b.ms);

        const scheduleSignature = JSON.stringify({
            dateKey: todayKey,
            schemaVersion: TIME_FOLLOWUP_SCHEDULE_SCHEMA_VERSION,
            endHour: Number(endHour ?? 21),
            windowDays: Number(
                windowDays ?? DEFAULT_FOLLOWUP_SCHEDULE_WINDOW_DAYS,
            ),
            missedLookbackDays: Number(
                missedLookbackDays ?? DEFAULT_FOLLOWUP_MISSED_LOOKBACK_DAYS,
            ),
            followUps: timeBasedFollowUps.map(({ ms, enqId, enqNo, item }) => ({
                ms,
                enqId: enqId ? String(enqId) : "",
                enqNo: enqNo ? String(enqNo) : "",
                activityType: String(item?.activityType ?? "")
                    .trim()
                    .toLowerCase(),
            })),
        });

        let prevSchedule = null;
        try {
            const rawPrev = await AsyncStorage.getItem(
                TIME_FOLLOWUP_SCHEDULE_KEY,
            );
            prevSchedule = rawPrev ? JSON.parse(rawPrev) : null;
        } catch {
            prevSchedule = null;
        }

        const prevIds = Array.isArray(prevSchedule?.ids)
            ? prevSchedule.ids
            : [];
        const prevSignature = String(prevSchedule?.signature ?? "");
        const prevSchemaVersion = Number(prevSchedule?.schemaVersion ?? 0);

        const scheduleChanged = !(
            prevIds.length > 0 &&
            prevSchedule?.dateKey === todayKey &&
            prevSchemaVersion === TIME_FOLLOWUP_SCHEDULE_SCHEMA_VERSION &&
            prevSignature &&
            prevSignature === scheduleSignature
        );

        if (!scheduleChanged) {
            console.log(
                `[NotifSvc] Schedule unchanged (${prevIds.length} existing) - keeping current`,
            );
            return {
                scheduled: prevIds.length,
                skipped: true,
                reason: "no-change",
            };
        }

        await cancelTimeFollowUpReminders();

        // Cleanup orphaned notifications
        try {
            const pending = await getPendingNotifications();
            const orphanedIds = [];
            for (const notif of pending) {
                const data = notif?.content?.data ?? {};
                const type = String(data?.type ?? "").trim();
                if (
                    (type === "followup-soon" ||
                        type === "followup-due" ||
                        type === "followup-missed") &&
                    !prevIds.includes(String(notif?.identifier ?? ""))
                ) {
                    orphanedIds.push(String(notif?.identifier ?? ""));
                }
            }
            if (orphanedIds.length > 0) {
                console.warn(
                    `[NotifSvc] Cleaning up ${orphanedIds.length} orphaned notifications`,
                );
                await Promise.allSettled(
                    orphanedIds.map((id) =>
                        Notifications.cancelScheduledNotificationAsync(id),
                    ),
                );
            }
        } catch (e) {
            console.warn(
                "[NotifSvc] Failed to cleanup orphaned notifications:",
                e,
            );
        }

        if (timeBasedFollowUps.length === 0) {
            console.log("[NotifSvc] No time-based follow-ups to schedule");
            return { scheduled: 0, skipped: true, reason: "none-due" };
        }

        console.log(
            `[NotifSvc] Scheduling for ${timeBasedFollowUps.length} follow-ups`,
        );

        const lang = await getNotificationVoiceLanguage();
        const ids = [];
        const _scheduledFollowUpKeys = new Set();
        const safeNow = new Date(now.getTime() - 30000);

        console.log(
            `[NotifSvc] Scheduling at: ${now.toISOString()} (safeNow: ${safeNow.toISOString()})`,
        );

        for (const entry of timeBasedFollowUps) {
            if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC) break;

            const item = entry.item;
            const when = entry.when;

            const followUpKey = `${String(item?._id || item?.enqId || "unknown")}-${when.getTime()}`;
            if (_scheduledFollowUpKeys?.has(followUpKey)) {
                console.log(`[NotifSvc] Skipping duplicate: ${followUpKey}`);
                continue;
            }
            _scheduledFollowUpKeys?.add(followUpKey);

            // ✅ FIX 4: Removed unused soonChannelKey
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

            const timeUntilDue = when.getTime() - now.getTime();
            console.log(
                `[NotifSvc] Follow-up: ${item?.name || "Unknown"} at ${when.toISOString()} (${Math.round(timeUntilDue / 60000)}min from now)`,
            );

            // 1. Pre-reminders: 5, 4, 3, 2, 1 min before due
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
                if (t.getTime() - now.getTime() < 3000) {
                    console.warn(
                        `[NotifSvc] Skipping ${minutesLeft}min (too close): ${t.toISOString()}`,
                    );
                    continue;
                }

                const soon = buildSoonContent(item, when, minutesLeft, lang);
                const minuteChannelKey = await selectChannelForNotification(
                    item?.activityType,
                    minutesLeft,
                    lang,
                );
                const id = await scheduleDateNotification({
                    when: t,
                    title: soon.title,
                    body: soon.body,
                    data: soon.data,
                    channelId: minuteChannelKey,
                    priority: "max",
                    color: "#0EA5E9",
                });
                if (id) {
                    console.log(
                        `[NotifSvc] ✓ ${minutesLeft}min: ${t.toISOString()} (ID: ${id})`,
                    );
                    ids.push(id);
                    scheduleForegroundFollowupAudioFallback(
                        soon.data,
                        t.getTime(),
                    );
                } else {
                    console.warn(
                        `[NotifSvc] ✗ Failed ${minutesLeft}min: ${t.toISOString()}`,
                    );
                }
            }

            // 2. Due at exact time
            if (
                ids.length < MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC &&
                when.getTime() > safeNow.getTime()
            ) {
                const due = buildDueAtContent(item, when, lang);
                const dueId = await scheduleDateNotification({
                    when,
                    title: due.title,
                    body: due.body,
                    data: due.data,
                    channelId: dueChannelKey,
                    priority: "max",
                    color: "#0EA5E9",
                });
                if (dueId) {
                    console.log(
                        `[NotifSvc] ✓ Due: ${when.toISOString()} (ID: ${dueId})`,
                    );
                    ids.push(dueId);
                    scheduleForegroundFollowupAudioFallback(
                        due.data,
                        when.getTime(),
                    );
                } else {
                    console.warn(
                        `[NotifSvc] ✗ Failed due: ${when.toISOString()}`,
                    );
                }
            }

            // 3. ✅ FIX 5: Missed alerts — ONLY +1, +5, +10 min
            // Before: 20+ alerts (1,5,10,15...60 + hourly) → hit Android 30-notif limit
            // After: exactly 3 missed alerts per follow-up → 9 total (5+1+3), supports ~3 follow-ups safely
            const missed = buildMissedContent(item, when, lang);
            const missedDelayMinutes = [1, 5, 10]; // ✅ FIXED

            let missedScheduledCount = 0;
            for (const delayMinutes of missedDelayMinutes) {
                if (ids.length >= MAX_TIME_FOLLOWUP_NOTIFICATIONS_PER_SYNC)
                    break;

                const t = new Date(when.getTime() + delayMinutes * 60 * 1000);
                if (t.getTime() <= safeNow.getTime()) {
                    console.log(
                        `[NotifSvc] Skipping missed +${delayMinutes}min (past)`,
                    );
                    continue;
                }

                // +1 always fires; +5 and +10 respect end-of-day
                const dayEnd = new Date(when);
                dayEnd.setHours(Number(endHour ?? 21), 0, 0, 0);
                if (delayMinutes > 1 && t.getTime() > dayEnd.getTime()) {
                    console.log(
                        `[NotifSvc] Skipping missed +${delayMinutes}min (past end-of-day ${formatHHmm(dayEnd)})`,
                    );
                    break;
                }

                const id = await scheduleDateNotification({
                    when: t,
                    title: missed.title,
                    body: missed.body,
                    data: { ...missed.data, missedDelayMinutes: delayMinutes },
                    channelId: missedChannelKey,
                    priority: "max",
                    color: "#FF3B5C",
                });
                if (id) {
                    console.log(
                        `[NotifSvc] ✓ Missed +${delayMinutes}min: ${t.toISOString()} (ID: ${id})`,
                    );
                    ids.push(id);
                    missedScheduledCount += 1;
                    scheduleForegroundFollowupAudioFallback(
                        { ...missed.data, missedDelayMinutes: delayMinutes },
                        t.getTime(),
                    );
                } else {
                    console.warn(
                        `[NotifSvc] ✗ Failed missed +${delayMinutes}min: ${t.toISOString()}`,
                    );
                }
            }

            console.log(
                `[NotifSvc] Follow-up ${item?._id || item?.enqNo}: 5min+4min+3min+2min+1min → due → +1min+${missedScheduledCount > 1 ? "+5min" : ""}${missedScheduledCount > 2 ? "+10min" : ""} missed`,
            );
        }

        await AsyncStorage.setItem(
            TIME_FOLLOWUP_SCHEDULE_KEY,
            JSON.stringify({
                dateKey: todayKey,
                ids,
                signature: scheduleSignature,
                schemaVersion: TIME_FOLLOWUP_SCHEDULE_SCHEMA_VERSION,
                totalScheduled: ids.length,
                scheduledAt: new Date().toISOString(),
            }),
        );
        console.log(
            `[NotifSvc] ✓ Scheduled ${ids.length} notifications (5,4,3,2,1min + due + +1,+5,+10min missed)`,
        );
        return { scheduled: ids.length, skipped: false };
    } catch (error) {
        console.error("[NotifSvc] ✗ Failed to schedule time reminders:", error);
        return { scheduled: 0, skipped: false, error: true };
    } finally {
        releaseSchedulingLock();
    }
};

// ─── Global Notification Response Listener ───────────────────────────────────
export const setupGlobalNotificationListener = (navigationRef) => {
    // FIX: Prevent duplicate listener registration
    if (_globalListenerRegistered) {
        console.warn("[NotifSvc] Global listener already registered, skipping");
        return { remove: () => {} };
    }

    _globalListenerRegistered = true;

    return Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const actionId = response.actionIdentifier;
        console.log("Global notification tapped:", data);

        if (actionId === "FOLLOWUP_CANCEL") {
            const whenMs = (() => {
                const rawWhen = data?.when ?? data?.timestamp ?? null;
                if (!rawWhen) return undefined;
                const ms = new Date(String(rawWhen)).getTime();
                return Number.isFinite(ms) && ms > 0 ? ms : undefined;
            })();
            Promise.resolve(
                muteEnquiryNotifications({
                    enqId: data?.enqId,
                    enqNo: data?.enqNo,
                    whenMs,
                }),
            ).catch(() => {});
            Promise.resolve(
                cancelNotificationsForEnquiry?.({
                    enqId: data?.enqId,
                    enqNo: data?.enqNo,
                }),
            ).catch(() => {});
            return;
        }

        const isDefaultAction =
            actionId === Notifications.DEFAULT_ACTION_IDENTIFIER ||
            actionId === "expo-notifications-default";
        if (isDefaultAction)
            Promise.resolve(speakForNotificationData(data)).catch(() => {});
        if (!navigationRef.isReady()) return;

        if (
            data.followUpCount ||
            data.overdueCount ||
            data.type === "daily-reminder" ||
            data.type === "hourly-followup-reminder" ||
            data.type === "followup-due" ||
            data.type === "followup-missed"
        ) {
            if (isDefaultAction)
                acknowledgeHourlyFollowUpReminders().catch(() => {});
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
                params:
                    data.type === "followup-missed"
                        ? {
                              openComposer: true,
                              composerToken: `${Date.now()}`,
                              enquiry,
                              focusTab: "Missed",
                              openMissedModal: true,
                              autoOpenForm: true,
                          }
                        : data.type === "followup-due"
                          ? {
                                openComposer: true,
                                composerToken: `${Date.now()}`,
                                enquiry,
                                focusTab: "Today",
                                focusSearch: data?.name ?? "",
                                autoOpenForm: true,
                            }
                          : {
                                focusTab: "Today",
                                focusSearch: data?.name ?? "",
                            },
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
            navigationRef.navigate("Main", { screen: "PricingScreen" });
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
        for (const notif of followUpNotifications)
            await cancelNotification(notif.identifier);
        console.log(
            `Cancelled ${followUpNotifications.length} follow-up notifications`,
        );
    } catch (error) {
        console.error("Failed to cancel follow-up notifications:", error);
    }
};

export const resetNotificationLocalState = async () => {
    try {
        // Reset listener registration flags (FIX: Prevent duplicate listeners)
        _foregroundListenerRegistered = false;
        _responseListenerRegistered = false;
        _globalListenerRegistered = false;

        // Clear deduplication maps
        _recentFollowupAudioKeys.clear();
        _recentFollowupVisualKeys.clear();
        _recentFollowupFallbackVisualKeys.clear();
        _foregroundFollowupAudioTimers.clear();
        _pendingSoonAudioByKey.clear();
        _followupCorrectionKeys.clear();

        try {
            await firebaseNotificationService?.resetLocalState?.();
        } catch {
            /* ignore */
        }

        await Promise.allSettled([
            AsyncStorage.removeItem(HOURLY_FOLLOWUP_ACK_DATE_KEY),
            AsyncStorage.removeItem(HOURLY_FOLLOWUP_SCHEDULE_KEY),
            AsyncStorage.removeItem(TIME_FOLLOWUP_SCHEDULE_KEY),
            AsyncStorage.removeItem(MISSED_FOLLOWUP_ALERT_STATE_KEY),
            AsyncStorage.removeItem("lastNotificationDate"),
        ]);

        console.log("[NotifSvc] ✓ Local notification state reset");
    } catch (err) {
        console.error("[NotifSvc] Error resetting state:", err?.message);
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

        const id = await scheduleDateNotification({
            when,
            title: "Add next follow-up",
            body: `Please add next follow-up date and time for ${safeName}.`,
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
        const reportSound = getChannelMeta("reports")?.sound ?? "default";
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "📊 Report CSV Ready",
                body: `Saved: ${safeName}. Tap to open.`,
                data: {
                    type: "report-csv-ready",
                    uri: safeUri,
                    fileName: safeName,
                    timestamp: new Date().toISOString(),
                },
                sound: reportSound,
                priority: "max",
                vibrate: [0, 250, 250, 250],
                ios: { sound: true, interruptionLevel: "timeSensitive" },
                android: {
                    channelId: CHANNEL_IDS.reports,
                    priority: "max",
                    color: "#2563EB",
                    vibrationPattern: [0, 250, 250, 250],
                },
            },
            trigger: null,
        });
        return { shown: 1, skipped: false };
    } catch (error) {
        console.error("Failed to show CSV ready notification:", error);
        return { shown: 0, skipped: false, error: true };
    }
};

// ─── DIAGNOSTIC ───────────────────────────────────────────────────────────────
export const diagnoseAudioSetup = async () => {
    console.log("=== AUDIO SETUP DIAGNOSIS ===");
    try {
        console.log(`Platform: ${Platform.OS}`);
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
        const perms = await Notifications.getPermissionsAsync();
        console.log(`Notification Permission: ${perms.status}`);
        const voiceLang = await getNotificationVoiceLanguage();
        console.log(`Voice Language: ${voiceLang}`);
        console.log(`Audio Mode Ready: ${audioModeReady}`);
        await ensureAudioMode();
        console.log("=== DIAGNOSIS COMPLETE ===");
        return { success: true, audioModulesOk, audioModulesFailed };
    } catch (error) {
        console.error("Diagnosis error:", error?.message || error);
        return { success: false, error: error?.message || error };
    }
};

// ─── Audio Asset Validation ────────────────────────────────────────────────────
// Validates that all required audio files are loaded
export const validateAudioAssets = () => {
    if (Platform.OS === "web") return { success: true, platform: "web" };

    const results = {
        success: true,
        totalAssets: 0,
        loadedAssets: 0,
        missingAssets: [],
        timestamp: new Date().toISOString(),
    };

    for (const [lang, activities] of Object.entries(AUDIO_MODULES)) {
        for (const [activity, versions] of Object.entries(activities)) {
            for (const [version, file] of Object.entries(versions)) {
                results.totalAssets += 1;
                if (file) {
                    results.loadedAssets += 1;
                } else {
                    results.success = false;
                    results.missingAssets.push(
                        `${lang}/${activity}/${version}`,
                    );
                }
            }
        }
    }

    if (results.success) {
        console.log(
            `[NotifSvc] ✅ Audio validation: ${results.loadedAssets}/${results.totalAssets} assets`,
        );
    } else {
        console.error(
            `[NotifSvc] ❌ Missing audio assets:`,
            results.missingAssets,
        );
    }

    return results;
};

// ─── Test Notification Channels & Sound Setup ─────────────────────────────────
export const testNotificationChannels = async () => {
    if (Platform.OS === "web") {
        console.log("[NotifSvc] Test skipped on web");
        return { platform: "web" };
    }

    console.log("[NotifSvc] === Testing Notification Channels ===");

    try {
        // Test 0: Permissions
        try {
            const perms = await Notifications.getPermissionsAsync();
            console.log(
                `[NotifSvc] Permission status: ${perms?.status} (canAskAgain=${String(perms?.canAskAgain)})`,
            );
        } catch (permError) {
            console.warn(
                "[NotifSvc] Failed to read permissions:",
                permError?.message,
            );
        }

        // Test 1: Check channels exist
        let channels = [];
        if (Platform.OS === "android") {
            channels = await Notifications.getNotificationChannelsAsync();
            if (channels && channels.length > 0) {
                console.log(
                    `[NotifSvc] ✅ Found ${channels.length} notification channels`,
                );
                const followupChannels = channels.filter((ch) =>
                    ch.id.includes("followup"),
                );
                const minuteChannels = channels.filter((ch) =>
                    /\d+min/.test(ch.id),
                );

                console.log(
                    `    - Follow-up channels: ${followupChannels.length}`,
                );
                console.log(
                    `    - Minute channels (1-5min): ${minuteChannels.length}`,
                );
                console.log(
                    `    - Other channels: ${channels.length - followupChannels.length - minuteChannels.length}`,
                );

                // Check if channels have sound
                const noSound = channels.filter(
                    (ch) => !ch.sound || ch.sound === "",
                );
                if (noSound.length > 0) {
                    console.warn(
                        `[NotifSvc] ⚠ ${noSound.length} channels have no sound configured:`,
                    );
                    noSound.forEach((ch) => console.warn(`    - ${ch.id}`));
                }

                // Sample channel details
                const dueChannel = channels.find(
                    (ch) => ch.id === "followups_due_en_v2",
                );
                if (dueChannel) {
                    console.log(
                        `[NotifSvc] Sample channel "followups_due_en_v2": sound="${dueChannel.sound}", importance=${dueChannel.importance}`,
                    );
                }
            } else {
                console.warn("[NotifSvc] ⚠ No notification channels found");
            }
        }

        // Test 2: Send test notification
        console.log("[NotifSvc] Sending test notification...");

        const content = {
            title: "🧪 Alert Test",
            body: "You should see an alert/banner AND hear sound.",
            sound: "default",
            data: { type: "debug-test" },
            ...(Platform.OS === "android"
                ? {
                      android: {
                          channelId: CHANNEL_IDS.default,
                          priority: "max",
                      },
                  }
                : { ios: { sound: true, interruptionLevel: "active" } }),
        };

        let testId = null;
        // eslint-disable-next-line import/namespace
        const presentFn = Notifications?.presentNotificationAsync;
        if (typeof presentFn === "function") {
            testId = await presentFn(content);
            console.log(`[NotifSvc] ✅ Test notification presented: ${testId}`);
        } else {
            testId = await Notifications.scheduleNotificationAsync({
                content,
                trigger: null,
            });
            console.log(`[NotifSvc] ✅ Test notification scheduled: ${testId}`);
        }

        return {
            success: true,
            channelsFound: channels?.length || 0,
            timestamp: new Date().toISOString(),
        };
    } catch (error) {
        console.error("[NotifSvc] Test failed:", error?.message);
        return {
            success: false,
            error: error?.message,
            timestamp: new Date().toISOString(),
        };
    }
};

// ─── Default Export ───────────────────────────────────────────────────────────
// Auth-gating helpers (login/logout)
export const beginNotificationSessionForLogin = async () => {
    try {
        await firebaseNotificationService?.beginLoginSession?.();
    } catch {
        /* ignore */
    }
};

export const endNotificationSessionForLogout = async () => {
    try {
        await firebaseNotificationService?.endLogoutSession?.();
    } catch {
        /* ignore */
    }
};

export const syncRemoteNotificationAuthState = async () => {
    try {
        await firebaseNotificationService?.syncAuthState?.();
    } catch {
        /* ignore */
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
    dismissAllDeliveredNotifications,
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
    beginNotificationSessionForLogin,
    endNotificationSessionForLogout,
    syncRemoteNotificationAuthState,
    resetAudioModeOnAppBackground,
    diagnoseAudioSetup,
    validateAudioAssets,
    testNotificationChannels,
    AUDIO_MODULES,
    scheduleImmediateNotification,
};
