import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";
import {
    getFollowUpDueTexts,
    getFollowUpMissedTexts,
    getFollowUpSoonTexts,
} from "../constants/notificationPhrases";

// ─── Dev / prod mode flag ─────────────────────────────────────────────────────
const _isDevMode = () => {
    const flag = String(
        process.env.EXPO_PUBLIC_USE_SERVER_FOLLOWUP_REMINDERS || "",
    )
        .trim()
        .toLowerCase();
    // In dev mode (flag=false), we still process FCM but skip stale-drop
    return flag === "false";
};

const STORAGE_KEYS = {
    lastFcmToken: "fcmToken_v1",
    // Persisted dedup map to prevent "spam on restart" after reconnect
    lastProcessedNotifications: "lastProcessedNotifications_v1",
    // Per-login session boundary (rotated on every login)
    sessionId: "notifSessionId_v1",
    sessionStartedAtMs: "notifSessionStartedAtMs_v1",
    // Track which sessionId the server was last registered with
    lastRegisteredSessionId: "fcmRegisteredSessionId_v1",
};


const NOTIFICATION_DEDUP_WINDOW_MS = 90 * 1000; // 90 seconds

const _recentNotificationIds = new Map();
let _persistedDedupLoaded = false;
let _dedupPersistTimer = null;
const DEDUP_PERSIST_DEBOUNCE_MS = 1000;

const generateSessionId = () =>
    `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const ensureSession = async ({ rotate = false } = {}) => {
    const now = Date.now();
    if (rotate) {
        const next = generateSessionId();
        await AsyncStorage.multiSet([
            [STORAGE_KEYS.sessionId, next],
            [STORAGE_KEYS.sessionStartedAtMs, String(now)],
        ]);
        return { sessionId: next, startedAtMs: now };
    }

    const existing = String(
        (await AsyncStorage.getItem(STORAGE_KEYS.sessionId)) || "",
    ).trim();
    const startedAtRaw = await AsyncStorage.getItem(
        STORAGE_KEYS.sessionStartedAtMs,
    );
    const startedAtMs = Number(startedAtRaw || 0) || 0;

    if (existing) return { sessionId: existing, startedAtMs };

    const next = generateSessionId();
    await AsyncStorage.multiSet([
        [STORAGE_KEYS.sessionId, next],
        [STORAGE_KEYS.sessionStartedAtMs, String(now)],
    ]);
    return { sessionId: next, startedAtMs: now };
};

const clearSession = async () => {
    await AsyncStorage.multiRemove([
        STORAGE_KEYS.sessionId,
        STORAGE_KEYS.sessionStartedAtMs,
        STORAGE_KEYS.lastRegisteredSessionId,
    ]);
};

const loadPersistedDedupMap = async () => {
    if (_persistedDedupLoaded) return;
    _persistedDedupLoaded = true;
    try {
        const raw = await AsyncStorage.getItem(
            STORAGE_KEYS.lastProcessedNotifications,
        );
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return;
        const now = Date.now();
        const cutoff = now - NOTIFICATION_DEDUP_WINDOW_MS * 2;
        for (const [k, v] of Object.entries(parsed)) {
            const ts = Number(v);
            if (!k || !Number.isFinite(ts)) continue;
            if (ts < cutoff) continue;
            _recentNotificationIds.set(k, ts);
        }
    } catch {
        /* ignore */
    }
};

const persistDedupMap = () => {
    try {
        if (_dedupPersistTimer) return;
        _dedupPersistTimer = setTimeout(async () => {
            _dedupPersistTimer = null;
            try {
                const now = Date.now();
                const cutoff = now - NOTIFICATION_DEDUP_WINDOW_MS * 2;
                const entries = [..._recentNotificationIds.entries()]
                    .filter(([, ts]) => Number(ts) >= cutoff)
                    .sort((a, b) => Number(b[1]) - Number(a[1]))
                    .slice(0, 250);

                const out = {};
                for (const [k, ts] of entries) out[k] = Number(ts);

                await AsyncStorage.setItem(
                    STORAGE_KEYS.lastProcessedNotifications,
                    JSON.stringify(out),
                );
            } catch {
                /* ignore */
            }
        }, DEDUP_PERSIST_DEBOUNCE_MS);
    } catch {
        /* ignore */
    }
};

// Production FCM can be delayed up to ~5 min on some networks; use a generous window.
const STALE_MESSAGE_SKIP_MS = 5 * 60 * 1000; // 5 minutes

const getMessagingFactory = () => {
    if (Platform.OS === "web") return null;
    try {
        const mod = require("@react-native-firebase/messaging");
        return mod?.default || null;
    } catch (_error) {
        return null;
    }
};

const buildApiUrl = () => API_URL;

const pickTitleBody = (remoteMessage) => {
    const n = remoteMessage?.notification || {};
    const d = remoteMessage?.data || {};
    return {
        title: n?.title || d?.title || "Notification",
        body: n?.body || d?.body || "",
    };
};

const normalizeData = (value) => {
    try {
        if (!value || typeof value !== "object") return {};
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (v === undefined || v === null) continue;
            out[k] = typeof v === "string" ? v : String(v);
        }
        return out;
    } catch {
        return {};
    }
};


const buildDedupKey = (remoteMessage) => {
    const data = remoteMessage?.data || {};

    const followUpId = String(data?.followUpId || "").trim();
    const type = String(data?.type || "").trim().toLowerCase();
    const when = String(data?.when || "").trim();

    // For followup-soon: key on followUpId + type + minutesLeft (each slot is unique)
    if (
        followUpId &&
        type === "followup-soon" &&
        String(data?.minutesLeft ?? "").trim() !== ""
    ) {
        const minutesLeft = String(data.minutesLeft).trim();
        return `fu_${followUpId}_soon_${minutesLeft}`;
    }

    // For followup-due and followup-missed: key on followUpId + type + when
    if (
        followUpId &&
        (type === "followup-due" || type === "followup-missed") &&
        when
    ) {
        return `fu_${followUpId}_${type}_${when}`;
    }

    // Generic followup key (legacy / unknown type)
    if (followUpId && type) {
        const minutesLeft = String(data?.minutesLeft ?? "").trim();
        return minutesLeft
            ? `fu_${followUpId}_${type}_${minutesLeft}`
            : `fu_${followUpId}_${type}`;
    }

    const dataMessageId = String(data?.messageId || "").trim();
    if (dataMessageId) return `dm_${dataMessageId}`;

    const msgId = String(remoteMessage?.messageId || "").trim();
    if (msgId) return `rm_${msgId}`;

    // Last resort: hash-like key from title+body (not great but better than null)
    const { title, body } = pickTitleBody(remoteMessage);
    return `tb_${title}_${body}`.slice(0, 80);
};

const isRecentNotification = (dedupKey) => {
    if (!dedupKey) return false;
    const lastTime = _recentNotificationIds.get(dedupKey);
    const now = Date.now();

    if (lastTime && now - lastTime < NOTIFICATION_DEDUP_WINDOW_MS) {
        return true; // duplicate — skip
    }

    _recentNotificationIds.set(dedupKey, now);
    persistDedupMap();

    // Cleanup old entries
    if (_recentNotificationIds.size > 200) {
        const cutoff = now - NOTIFICATION_DEDUP_WINDOW_MS * 2;
        for (const [id, timestamp] of _recentNotificationIds.entries()) {
            if (timestamp < cutoff) _recentNotificationIds.delete(id);
        }
    }

    return false;
};

/**
 * FIX: Staleness check for follow-up reminder messages.
 *
 * Calculates when the notification SHOULD have been shown based on:
 *   - `data.when`        — ISO date of the follow-up due time
 *   - `data.minutesLeft` — how many minutes before due this fires
 *
 * If the expected fire time is more than STALE_MESSAGE_SKIP_MS in the
 * past, the message is stale (device was offline; it's now too late to
 * usefully show it).
 *
 * Returns true if the message is stale and should be skipped.
 */
const isStaleFcmMessage = (data) => {
    try {
        // In development mode (local scheduling), be lenient — don't drop FCM messages
        if (_isDevMode()) return false;

        const type = String(data?.type || "")
            .trim()
            .toLowerCase();
        if (
            type !== "followup-soon" &&
            type !== "followup-due" &&
            type !== "followup-missed"
        ) {
            return false; // not a timed reminder — never stale
        }

        const rawWhen = data?.when;
        if (!rawWhen) return false;

        const dueMs = new Date(String(rawWhen)).getTime();
        if (!Number.isFinite(dueMs) || dueMs <= 0) return false;

        let expectedFireMs;
        if (type === "followup-soon") {
            // Expected fire: dueMs - minutesLeft minutes
            const minutesLeft = Math.max(0, Math.round(Number(data?.minutesLeft ?? 0)));
            expectedFireMs = dueMs - minutesLeft * 60 * 1000;
        } else if (type === "followup-due") {
            // Expected fire: exactly at dueMs
            expectedFireMs = dueMs;
        } else {
            // followup-missed: expected fire = dueMs + missedDelayMinutes
            // If device was off and receives this late, it's still valid within the stale window
            const delayMins = Math.max(1, Math.round(Number(data?.missedDelayMinutes ?? 1)));
            expectedFireMs = dueMs + delayMins * 60 * 1000;
        }

        const staleness = Date.now() - expectedFireMs;
        if (staleness > STALE_MESSAGE_SKIP_MS) {
            console.log(
                `[FirebaseNotif] Dropping stale message: expected ${Math.round(staleness / 1000)}s ago`,
                { type, when: rawWhen, expectedFireMs: new Date(expectedFireMs).toISOString() },
            );
            return true;
        }

        return false;
    } catch {
        return false; // if anything fails, don't suppress
    }
};

const registerFcmTokenWithServer = async (fcmToken, sessionId = "") => {
    try {
        if (!fcmToken || typeof fcmToken !== "string" || fcmToken.length < 10) {
            return false;
        }
        const authToken = await getAuthToken();
        if (!authToken) return false;

        const apiURL = buildApiUrl();
        const response = await fetch(`${apiURL}/auth/register-fcm-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                fcmToken,
                sessionId: String(sessionId || "").trim(),
            }),
        });

        if (!response.ok) {
            const error = await response
                .json()
                .catch(() => ({ error: response.statusText }));
            console.warn(
                "[FirebaseNotif] Failed to register FCM token:",
                error?.error || response.statusText,
            );
            return false;
        }
        return true;
    } catch (error) {
        console.warn(
            "[FirebaseNotif] FCM token registration error:",
            error?.message,
        );
        return false;
    }
};

const unregisterNotificationTokensWithServer = async () => {
    try {
        const authToken = await getAuthToken();
        if (!authToken) return false;

        const apiURL = buildApiUrl();
        const response = await fetch(
            `${apiURL}/auth/unregister-notification-tokens`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({}),
            },
        );

        return Boolean(response.ok);
    } catch {
        return false;
    }
};

const validateFcmTokenWithServer = async () => {
    try {
        const authToken = await getAuthToken();
        if (!authToken) return { valid: null, shouldReRegister: false };

        const apiURL = buildApiUrl();
        const response = await fetch(`${apiURL}/auth/validate-fcm-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({}),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                valid: null,
                shouldReRegister: false,
                error: body?.error || body?.message || response.statusText,
            };
        }
        return {
            valid: Boolean(body?.valid),
            shouldReRegister: Boolean(body?.shouldReRegister),
        };
    } catch (error) {
        return {
            valid: null,
            shouldReRegister: false,
            error: error?.message,
        };
    }
};

// ─── Channel/Sound resolution (mirrors notificationService.js) ────────────────
const _FOLLOWUP_CHANNEL_MAP = {
    phone:    { soon: "phone_soon_en",    due: "phone_due_en",    missed: "phone_missed_en" },
    whatsapp: { soon: "whatsapp_soon_en", due: "whatsapp_due_en", missed: "whatsapp_missed_en" },
    email:    { soon: "email_soon_en",    due: "email_due_en",    missed: "email_missed_en" },
    meeting:  { soon: "meeting_soon_en",  due: "meeting_due_en",  missed: "meeting_missed_en" },
};
const _FOLLOWUP_CHANNEL_MAP_TA = {
    phone:    { soon: "phone_soon_ta",    due: "phone_due_ta",    missed: "phone_missed_ta" },
    whatsapp: { soon: "whatsapp_soon_ta", due: "whatsapp_due_ta", missed: "whatsapp_missed_ta" },
    email:    { soon: "email_soon_ta",    due: "email_due_ta",    missed: "email_missed_ta" },
    meeting:  { soon: "meeting_soon_ta",  due: "meeting_due_ta",  missed: "meeting_missed_ta" },
};

const _normalizeActivityKey = (activityType) => {
    const raw = String(activityType ?? "").trim().toLowerCase();
    if (raw === "phone call" || raw === "call" || raw === "phone") return "phone";
    if (raw === "whatsapp" || raw === "wa") return "whatsapp";
    if (raw === "email" || raw === "mail") return "email";
    if (raw === "meeting" || raw === "online meeting") return "meeting";
    return null; // use followup generic
};

const _resolveFollowupChannel = (activityType, statusKey, lang = "en") => {
    const actKey = _normalizeActivityKey(activityType);
    const channelMap = lang === "ta" ? _FOLLOWUP_CHANNEL_MAP_TA : _FOLLOWUP_CHANNEL_MAP;
    if (actKey && channelMap[actKey]) {
        return channelMap[actKey][statusKey] ?? `followups_${statusKey}_${lang === "ta" ? "ta" : "en"}`;
    }
    return `followups_${statusKey}_${lang === "ta" ? "ta" : "en"}`;
};

const _formatHHmm = (date) => {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
};

/**
 * Maps a channel key to the actual audio filename bundled in the app.
 */
const _resolveSoundFilename = (channelKey) => {
    const k = String(channelKey || "").toLowerCase();

    // Phone / Generic Follow-ups
    if (k.includes("phone_5min_en") || k.includes("followups_5min_en")) return "n5pmin";
    if (k.includes("phone_4min_en") || k.includes("followups_4min_en")) return "n4pmin";
    if (k.includes("phone_3min_en") || k.includes("followups_3min_en")) return "n3pmin";
    if (k.includes("phone_2min_en") || k.includes("followups_2min_en")) return "n2pmin";
    if (k.includes("phone_1min_en") || k.includes("followups_1min_en")) return "n1pmin";
    if (k.includes("phone_due_en") || k.includes("followups_due_en")) return "pdue";
    if (k.includes("phone_missed_en") || k.includes("followups_missed_en")) return "pmissed";

    // Tamil (Phone / Generic)
    if (k.includes("phone_5min_ta") || k.includes("followups_5min_ta")) return "t5min";
    if (k.includes("phone_4min_ta") || k.includes("followups_4min_ta")) return "t4min";
    if (k.includes("phone_3min_ta") || k.includes("followups_3min_ta")) return "t3min";
    if (k.includes("phone_2min_ta") || k.includes("followups_2min_ta")) return "t2min";
    if (k.includes("phone_1min_ta") || k.includes("followups_1min_ta")) return "t1min";
    if (k.includes("phone_due_ta") || k.includes("followups_due_ta")) return "tdue";
    if (k.includes("phone_missed_ta") || k.includes("followups_missed_ta")) return "tmissed";

    // Meeting
    if (k.includes("meeting_soon_en")) return "m5min";
    if (k.includes("meeting_due_en")) return "mdue";
    if (k.includes("meeting_missed_en")) return "emissed";
    if (k.includes("meeting_soon_ta")) return "mt5min";
    if (k.includes("meeting_due_ta")) return "mtdue";
    if (k.includes("meeting_missed_ta")) return "mtmissed";

    // Email
    if (k.includes("email_soon_en")) return "e5min";
    if (k.includes("email_due_en")) return "edue";
    if (k.includes("email_missed_en")) return "emissed";
    if (k.includes("email_soon_ta")) return "et5min";
    if (k.includes("email_due_ta")) return "etdue";
    if (k.includes("email_missed_ta")) return "etmissed";

    // WhatsApp
    if (k.includes("whatsapp_soon_en")) return "w5min";
    if (k.includes("whatsapp_due_en")) return "wdue";
    if (k.includes("whatsapp_missed_en")) return "wmissed";
    if (k.includes("whatsapp_soon_ta")) return "wt5min";
    if (k.includes("whatsapp_due_ta")) return "wtdue";
    if (k.includes("whatsapp_missed_ta")) return "wtmissed";

    return "default";
};

/**
 * Build and schedule a rich local notification for a FCM followup message received
 * in the foreground. Reconstructs title/body/channel from the data payload so that
 * even if the server omits notification.title/body, the alert still shows correct content.
 */
const _scheduleRichFollowupNotification = async (data, dedupKey) => {
    try {
        const type = String(data?.type || "").trim().toLowerCase();
        const name = String(data?.name || "Client").trim();
        const actorName = String(data?.actorName || "").trim();
        const activityType = String(data?.activityType || "Follow-up").trim();
        const lang = "en"; // Channel/phrase language — matches device setting; default en

        const whenRaw = String(data?.when || "").trim();
        const when = whenRaw ? new Date(whenRaw) : null;
        const timeLabel = when && !Number.isNaN(when.getTime()) ? _formatHHmm(when) : "";

        let title = "Follow-up reminder";
        let body = "";
        let channelKey = "followups";

        if (type === "followup-soon") {
            const minutesLeft = Math.max(1, Math.round(Number(data?.minutesLeft ?? 0)));
            const texts = getFollowUpSoonTexts({
                lang,
                name,
                actorName,
                activityType,
                minutesLeft,
            });
            title = texts.title;
            body = texts.body;
            // getFollowUpSoonTexts / channel uses numeric or "soon"
            channelKey = _resolveFollowupChannel(
                activityType,
                minutesLeft <= 5 && minutesLeft >= 1 ? `${minutesLeft}min` : "soon",
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
            channelKey = _resolveFollowupChannel(activityType, "due", lang);
        } else if (type === "followup-missed") {
            const texts = getFollowUpMissedTexts({
                lang,
                name,
                actorName,
                activityType,
                timeLabel: timeLabel ? `at ${timeLabel}` : "",
            });
            title = texts.title;
            body = texts.body;
            channelKey = _resolveFollowupChannel(activityType, "missed", lang);
        }

        // channelKey already resolved above; map to channel ID (same pattern as notificationService)
        const androidChannelId =
            typeof data?.androidChannelId === "string" && data.androidChannelId
                ? data.androidChannelId
                : typeof data?.channelId === "string" && data.channelId
                  ? data.channelId
                  : channelKey;

        const accentColor = type === "followup-missed" ? "#FF3B5C" : "#0EA5E9";

        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                subtitle: "Tap to open Follow-ups",
                data: {
                    ...data,
                    _fcmDedupKey: dedupKey,
                    // Mark as foreground-fallback so notifHandler allows it through
                    foregroundFallbackVisual: "1",
                },
                // Use explicit sound filename for foreground alerts to match channel setting.
                // Note: On Android, even if channel has a sound, scheduleNotificationAsync
                // may need it here specifically if custom sounds are desired.
                sound: _resolveSoundFilename(channelKey),
                vibrate: [0, 250, 250, 250],
                priority: Notifications.AndroidImportance.MAX,
                ...(Platform.OS === "android"
                    ? {
                          android: {
                              channelId: androidChannelId,
                              color: accentColor,
                              importance: Notifications.AndroidImportance.MAX,
                              vibrationPattern: [0, 250, 250, 250],
                          },
                      }
                    : {}),
                ...(Platform.OS === "ios"
                    ? {
                          ios: {
                              sound: `${_resolveSoundFilename(channelKey)}${_resolveSoundFilename(channelKey) === "default" ? "" : ".wav"}`,
                              interruptionLevel: "timeSensitive",
                          },
                      }
                    : {}),
            },
            trigger: null,
        });

        console.log(
            `[FirebaseNotif] Rich followup notification scheduled: ${type} | ch:${androidChannelId}`,
            { name, activityType, title },
        );
    } catch (err) {
        console.warn("[FirebaseNotif] _scheduleRichFollowupNotification error:", err?.message);
    }
};

class FirebaseNotificationService {
    _initialized = false;
    _unsubOnMessage = null;
    _unsubOnTokenRefresh = null;
    _messaging = null;

    async initialize() {
        if (this._initialized) return true;
        if (Platform.OS === "web") return false;

        const messagingFactory = getMessagingFactory();
        if (!messagingFactory) {
            console.log(
                "[FirebaseNotif] @react-native-firebase/messaging not available; skipping",
            );
            return false;
        }

        const messaging = messagingFactory();
        this._messaging = messaging;

        await loadPersistedDedupMap();

        try {
            await messaging.registerDeviceForRemoteMessages?.();
        } catch {
            /* ignore */
        }

        await this.syncAuthState().catch((error) => {
            console.warn("[FirebaseNotif] syncAuthState failed:", error?.message);
        });

        try {
            const check = await validateFcmTokenWithServer();
            if (check?.shouldReRegister) {
                console.warn(
                    "[FirebaseNotif] Server requested FCM re-register; refreshing token...",
                );
                try {
                    await messaging.deleteToken?.();
                } catch {
                    /* ignore */
                }
                const fresh = await messaging.getToken();
                if (fresh) {
                    await AsyncStorage.setItem(
                        STORAGE_KEYS.lastFcmToken,
                        fresh,
                    );
                    const { sessionId } = await ensureSession();
                    await AsyncStorage.setItem(
                        STORAGE_KEYS.lastRegisteredSessionId,
                        sessionId,
                    );
                    await registerFcmTokenWithServer(fresh, sessionId);
                }
            }
        } catch {
            /* ignore */
        }

        this._unsubOnTokenRefresh = messaging.onTokenRefresh?.(
            async (nextToken) => {
                try {
                    if (!nextToken) return;
                    const authToken = await getAuthToken();
                    if (!authToken) return;

                    const { sessionId } = await ensureSession();
                    const prev = await AsyncStorage.getItem(
                        STORAGE_KEYS.lastFcmToken,
                    );
                    if (prev !== nextToken) {
                        await AsyncStorage.setItem(
                            STORAGE_KEYS.lastFcmToken,
                            nextToken,
                        );
                    }
                    await AsyncStorage.setItem(
                        STORAGE_KEYS.lastRegisteredSessionId,
                        sessionId,
                    );
                    await registerFcmTokenWithServer(nextToken, sessionId);
                } catch {
                    /* ignore */
                }
            },
        );

        /**
         * onMessage fires ONLY when the app is in the FOREGROUND.
         * FCM does NOT call onMessage for background or killed-app messages —
         * those are handled by the OS using the `notification` field in the
         * FCM payload (see server-side fix in firebaseNotificationService.server.js).
         *
         * Checks before creating a local notification:
         *   1. Auth check      — skip if logged out
         *   2. Dedup key check — 90s window, keyed by followUpId+type+when/minutesLeft
         *   3. Session check   — drop messages from old login sessions
         *   4. Staleness check — skip if >5 min late (prod FCM delivery tolerance)
         *   5. Rich routing    — followup types get title/body rebuilt from data fields
         *                        (fixes "alert content has miss" when server omits notification field)
         */
        this._unsubOnMessage = messaging.onMessage?.(async (remoteMessage) => {
            try {
                // ✅ No notifications while logged out (foreground)
                const authToken = await getAuthToken();
                if (!authToken) return;

                // FIX: Build stable dedup key
                const dedupKey = buildDedupKey(remoteMessage);

                if (isRecentNotification(dedupKey)) {
                    console.log(
                        "[FirebaseNotif] Skipping duplicate notification:",
                        dedupKey,
                    );
                    return;
                }

                const data = normalizeData(remoteMessage?.data);
                const type = String(data?.type || "").trim().toLowerCase();
                const isFollowupType =
                    type === "followup-soon" ||
                    type === "followup-due" ||
                    type === "followup-missed";

                // ✅ Drop messages from a different login session (prevents stale after logout/login)
                const incomingSessionId = String(data?.sessionId || "").trim();
                if (incomingSessionId) {
                    const { sessionId: currentSessionId } = await ensureSession();
                    if (incomingSessionId !== currentSessionId) {
                        console.log(
                            "[FirebaseNotif] Dropping message from old session",
                            { dedupKey },
                        );
                        return;
                    }
                }

                // FIX: Drop stale reminders (device was offline, message is now irrelevant)
                if (isStaleFcmMessage(data)) {
                    return;
                }

                console.log(
                    "[FirebaseNotif] Creating foreground local notification:",
                    dedupKey,
                    { type, isFollowupType },
                );

                if (isFollowupType) {
                    // ✅ FIX: Build rich title/body for followup notifications from data fields.
                    // The server FCM payload may not include notification.title/body, or they may
                    // be empty strings. Always reconstruct from the data payload for consistency.
                    await _scheduleRichFollowupNotification(data, dedupKey);
                } else {
                    // For non-followup types, fall back to notification field or data fields
                    const { title, body } = pickTitleBody(remoteMessage);
                    const androidChannelId =
                        typeof data?.androidChannelId === "string" &&
                        data.androidChannelId
                            ? data.androidChannelId
                            : typeof data?.channelId === "string" && data.channelId
                              ? data.channelId
                              : null;

                    await Notifications.scheduleNotificationAsync({
                        content: {
                            title,
                            body,
                            data: {
                                ...data,
                                _fcmDedupKey: dedupKey,
                            },
                            ...(Platform.OS === "android" && androidChannelId
                                ? { android: { channelId: androidChannelId } }
                                : {}),
                        },
                        trigger: null,
                    });
                }
            } catch (err) {
                console.error("[FirebaseNotif] onMessage error:", err?.message);
            }
        });

        this._initialized = true;
        return true;
    }

    async syncAuthState({ forceRegister = false } = {}) {
        const messaging = this._messaging;
        if (!messaging) return { enabled: false, reason: "no-messaging" };

        const authToken = await getAuthToken();
        if (!authToken) {
            // Logged out: best-effort unregister on server + delete local token
            try {
                await unregisterNotificationTokensWithServer();
            } catch {
                /* ignore */
            }
            try {
                await messaging.deleteToken?.();
            } catch {
                /* ignore */
            }

            await AsyncStorage.multiRemove([
                STORAGE_KEYS.lastFcmToken,
                STORAGE_KEYS.lastProcessedNotifications,
                STORAGE_KEYS.lastRegisteredSessionId,
            ]).catch(() => {});
            _recentNotificationIds.clear();
            return { enabled: false, reason: "logged-out" };
        }

        const { sessionId } = await ensureSession();
        const token = await messaging.getToken();
        if (!token) return { enabled: false, reason: "no-token" };

        const prevToken = await AsyncStorage.getItem(STORAGE_KEYS.lastFcmToken);
        const prevSession = await AsyncStorage.getItem(
            STORAGE_KEYS.lastRegisteredSessionId,
        );

        const shouldRegister =
            forceRegister || prevToken !== token || prevSession !== sessionId;
        if (!shouldRegister) return { enabled: true, registered: true };

        await AsyncStorage.setItem(STORAGE_KEYS.lastFcmToken, token);
        await AsyncStorage.setItem(
            STORAGE_KEYS.lastRegisteredSessionId,
            sessionId,
        );

        const ok = await registerFcmTokenWithServer(token, sessionId);
        return { enabled: true, registered: ok };
    }

    async beginLoginSession() {
        await ensureSession({ rotate: true });
        await AsyncStorage.removeItem(STORAGE_KEYS.lastProcessedNotifications).catch(
            () => {},
        );
        _recentNotificationIds.clear();
        return this.syncAuthState({ forceRegister: true });
    }

    async endLogoutSession() {
        try {
            await unregisterNotificationTokensWithServer();
        } catch {
            /* ignore */
        }
        try {
            await this._messaging?.deleteToken?.();
        } catch {
            /* ignore */
        }
        await AsyncStorage.multiRemove([
            STORAGE_KEYS.lastFcmToken,
            STORAGE_KEYS.lastProcessedNotifications,
            STORAGE_KEYS.lastRegisteredSessionId,
        ]).catch(() => {});
        _recentNotificationIds.clear();
        await clearSession().catch(() => {});
        return true;
    }

    async resetLocalState() {
        _recentNotificationIds.clear();
        await AsyncStorage.removeItem(STORAGE_KEYS.lastProcessedNotifications).catch(
            () => {},
        );
    }

    cleanup() {
        try {
            this._unsubOnMessage?.();
        } catch {
            /* ignore */
        }
        try {
            this._unsubOnTokenRefresh?.();
        } catch {
            /* ignore */
        }
        this._unsubOnMessage = null;
        this._unsubOnTokenRefresh = null;
        this._initialized = false;
    }
}

export default new FirebaseNotificationService();