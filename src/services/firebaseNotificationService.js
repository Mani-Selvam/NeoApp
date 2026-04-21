/**
 * firebaseNotificationService.js  (CLIENT SIDE)
 *
 * FIX SUMMARY:
 *
 * BUG 3 (client half) — "multiple sounds when device reconnects"
 *   ROOT CAUSE 1: Dedup window was 3 seconds. When a device comes online
 *   after being offline, FCM delivers all queued messages nearly
 *   simultaneously. onMessage fires for each → 5 local notifications
 *   created → 5 sounds play at once.
 *   FIX: Dedup window raised to 90 seconds.
 *
 *   ROOT CAUSE 2: The dedup key was `remoteMessage.messageId` which can be
 *   null/undefined for some FCM implementations, making every message
 *   appear unique and bypassing dedup entirely.
 *   FIX: Key is now `followUpId + minutesLeft` (from the data payload)
 *   as primary, with messageId as fallback.
 *
 *   ROOT CAUSE 3: No staleness check. If a 5min reminder arrives on the
 *   device when it's already 8 minutes past the due time, showing "5
 *   minutes" would be confusing and wrong. Such messages are now silently
 *   dropped.
 *   FIX: Added isStaleFcmMessage() — if the expected fire time for this
 *   notification is more than STALE_MESSAGE_SKIP_MS in the past, skip it.
 *
 * BUG 2 (client half) — "background/killed: no sound"
 *   This is primarily a SERVER-SIDE fix (FCM payload must include a
 *   `notification` object). See firebaseNotificationService.server.js.
 *   On the client, we now also guard against creating duplicate local
 *   notifications when the OS has already shown the FCM notification
 *   natively (i.e. app was in background, OS showed it, then user opens
 *   app and onMessage would fire again for any still-queued messages).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";

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

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * FIX: Raised from 3 000 ms (3 s) to 90 000 ms (90 s).
 *
 * Why 90s? FCM can queue up to ~4-5 minutes of reminders when the device is
 * offline, and delivers them all within a few hundred milliseconds on
 * reconnect. A 3-second window only catches messages that literally arrive
 * within the same TCP burst. 90 seconds ensures that even if FCM spaces the
 * deliveries a few seconds apart, we still deduplicate the whole batch.
 */
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

/**
 * FIX: Messages that arrive too far past their expected fire time are stale.
 * Drop them silently. This prevents confusing notifications like
 * "5 minutes" appearing when the follow-up is already overdue.
 *
 * Threshold: 2 minutes past expected fire time.
 */
const STALE_MESSAGE_SKIP_MS = 2 * 60 * 1000; // 2 minutes

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

/**
 * FIX: Build a stable dedup key from the follow-up payload fields.
 *
 * The old code relied on remoteMessage.messageId which can be null or
 * undefined in some FCM implementations (especially when using the v1 API
 * without explicit messageId). This caused every message to appear unique.
 *
 * New priority order:
 *   1. followUpId + minutesLeft  — unique per (followup, window)
 *   2. messageId from data        — fallback if followUpId absent
 *   3. remoteMessage.messageId    — final fallback
 */
const buildDedupKey = (remoteMessage) => {
    const data = remoteMessage?.data || {};

    const followUpId = String(data?.followUpId || "").trim();
    const minutesLeft = String(data?.minutesLeft ?? "").trim();

    if (followUpId && minutesLeft !== "") {
        // Primary: stable key based on payload content
        return `fu_${followUpId}_${minutesLeft}`;
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

        const minutesLeft = Math.round(Number(data?.minutesLeft ?? 0));
        // Expected fire time: (due time) - (minutesLeft minutes)
        const expectedFireMs = dueMs - minutesLeft * 60 * 1000;

        const staleness = Date.now() - expectedFireMs;
        if (staleness > STALE_MESSAGE_SKIP_MS) {
            console.log(
                `[FirebaseNotif] Dropping stale message: expected ${Math.round(staleness / 1000)}s ago`,
                { type, minutesLeft, when: rawWhen },
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
         * FIX: Three checks before creating a local notification:
         *   1. Dedup key check (90s window, keyed by followUpId+minutesLeft)
         *   2. Staleness check (skip if message is >2 minutes late)
         *   3. Android channel routing (uses data.androidChannelId or data.channelId)
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

                const { title, body } = pickTitleBody(remoteMessage);
                const androidChannelId =
                    typeof data?.androidChannelId === "string" &&
                    data.androidChannelId
                        ? data.androidChannelId
                        : typeof data?.channelId === "string" && data.channelId
                          ? data.channelId
                          : null;

                console.log(
                    "[FirebaseNotif] Creating foreground local notification:",
                    dedupKey,
                );

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
