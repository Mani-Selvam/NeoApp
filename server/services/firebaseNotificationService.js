/**
 * firebaseNotificationService.server.js  (SERVER SIDE)
 *
 * This file shows exactly how every FCM message to a reminder window MUST be
 * structured to get sound + alert in ALL three app states:
 *   ✅ Foreground  — onMessage fires, client creates local notification
 *   ✅ Background  — OS shows FCM notification field automatically
 *   ✅ Killed      — OS shows FCM notification field automatically
 *
 * KEY PRINCIPLE:
 *   FCM messages have two independent payloads:
 *     `notification` — OS uses this to display the alert + sound when your
 *                      app is in the background or killed. If this field is
 *                      missing, the OS shows NOTHING for background/killed.
 *     `data`         — Your app's custom payload. Always delivered regardless
 *                      of app state (subject to Doze/battery restrictions).
 *
 *   You MUST include BOTH for reliable cross-state delivery.
 *
 * FIX BUG 2 — "no sound/alert when app is background or killed":
 *   Every sendActivityReminder call now includes:
 *     - `notification: { title, body }` — required for background/killed display
 *     - `android.notification.channelId` — required for Android sound routing
 *     - `android.notification.sound` — 'default' uses the channel's configured sound
 *     - `apns.payload.aps.sound` — required for iOS sound
 *     - `apns.payload.aps.badge` — optional badge update
 *
 * FIX BUG 3 — "stale reminders arrive in a batch when device reconnects":
 *   Every FCM message is now sent with:
 *     - `android.ttl` — auto-expires the message after the window passes
 *     - `apns.headers['apns-expiration']` — same for iOS
 *     - `collapseKey` — FCM delivers only the LATEST message per follow-up
 *       when multiple queued messages arrive together. The collapseKey is
 *       per-followup (not per-window) so the most recent reminder replaces
 *       all older ones.
 *
 *   TTL values per window:
 *     5min → 270s  (expires 30s before due so device doesn't see "5min" when due)
 *     4min → 210s
 *     3min → 150s
 *     2min →  90s
 *     1min →  50s
 *     due  → 120s  (stays alive 2 min after due)
 *     missed → 600s (stays alive 10 min after due)
 */

const admin = require("../config/firebaseAdmin");
const User = require("../models/User");
const { resolveAndroidChannelId } = require("../utils/notificationChannels");

// Try to load notificationPhrases with fallback for different deployment structures
let getFollowUpSoonTexts, getFollowUpDueTexts, getFollowUpMissedTexts;
try {
    const phrases = require("../../src/constants/notificationPhrases");
    getFollowUpSoonTexts = phrases.getFollowUpSoonTexts;
    getFollowUpDueTexts = phrases.getFollowUpDueTexts;
    getFollowUpMissedTexts = phrases.getFollowUpMissedTexts;
} catch (err) {
    console.warn(
        "[WARNING] notificationPhrases module not found - using fallback stubs",
    );
    // Fallback stubs when module is not available
    getFollowUpSoonTexts = ({ lang, minutesLeft, name, activityType }) => ({
        title: `${minutesLeft}min reminder`,
        body: `${name || "Activity"} reminder in ${minutesLeft} minutes`,
        voice: `${name || "Activity"} reminder in ${minutesLeft} minutes`,
    });
    getFollowUpDueTexts = ({ lang, name, activityType }) => ({
        title: "Activity due now",
        body: `${name || "Activity"} is due now`,
        voice: `${name || "Activity"} is due now`,
    });
    getFollowUpMissedTexts = ({ lang, name, activityType }) => ({
        title: "Activity missed",
        body: `${name || "Activity"} was missed`,
        voice: `${name || "Activity"} was missed`,
    });
}

// ─── TTL per reminder window (seconds) ───────────────────────────────────────

const WINDOW_TTL_SECONDS = {
    5: 270, // 4m30s — expires before the next (4min) window fires
    4: 210,
    3: 150,
    2: 90,
    1: 50,
    0: 120, // due — stays for 2 minutes
    "-1": 600, // missed — stays for 10 minutes
};

const getTtlSeconds = (minutesLeft) => {
    const key = String(minutesLeft);
    return WINDOW_TTL_SECONDS[key] ?? 120;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeLang = (v) =>
    String(v || "en").toLowerCase() === "ta" ? "ta" : "en";

const resolveActivityTypeKey = (activityType = "followup") => {
    const raw = String(activityType || "")
        .trim()
        .toLowerCase();
    if (raw === "phone call" || raw === "phone" || raw === "call")
        return "phone";
    if (raw === "meeting") return "meeting";
    if (raw === "email") return "email";
    if (raw === "whatsapp" || raw === "wa") return "whatsapp";
    return "followups";
};

const resolveChannelKey = (activityType, minutesLeft, voiceLang) => {
    const typeKey = resolveActivityTypeKey(activityType);
    const lang = normalizeLang(voiceLang);
    if (minutesLeft === 0) return `${typeKey}_due_${lang}`;
    if (minutesLeft < 0) return `${typeKey}_missed_${lang}`;
    const m = Math.max(1, Math.min(5, Number(minutesLeft) || 1));
    return `${typeKey}_${m}min_${lang}`;
};

const buildTexts = ({ activityType, followUpData, minutesLeft, lang }) => {
    const shared = {
        lang,
        name: followUpData?.name,
        activityType,
    };

    if (minutesLeft > 0) {
        return getFollowUpSoonTexts({ ...shared, minutesLeft });
    }
    if (minutesLeft === 0) {
        return getFollowUpDueTexts({ ...shared });
    }
    // missed
    return getFollowUpMissedTexts({ ...shared });
};

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send an activity reminder via FCM.
 *
 * @param {string} userId         - MongoDB user _id
 * @param {string} activityType   - "phone call" | "meeting" | "email" | "whatsapp" | "followup"
 * @param {object} followUpData   - { followUpId, name, when, enquiryNumber, phoneNumber }
 * @param {number} minutesLeft    - 5|4|3|2|1|0|-1
 * @param {string} voiceLang      - "en" | "ta"
 * @returns {Promise<{success: boolean, provider?: string, error?: string}>}
 */
const sendActivityReminder = async (
    userId,
    activityType,
    followUpData,
    minutesLeft,
    voiceLang = "en",
) => {
    try {
        const user = await User.findById(userId)
            .select("fcmToken notificationPreferences")
            .lean();

        const fcmToken = user?.fcmToken;
        if (!fcmToken) {
            return { success: false, error: "No FCM token for user" };
        }

        const lang = normalizeLang(voiceLang);
        const texts = buildTexts({
            activityType,
            followUpData,
            minutesLeft,
            lang,
        });

        // Channel routing
        const channelKey = resolveChannelKey(activityType, minutesLeft, lang);
        const androidChannelId = resolveAndroidChannelId(channelKey);

        // FIX BUG 3: TTL expires stale messages automatically
        const ttlSeconds = getTtlSeconds(minutesLeft);

        // FIX BUG 3: collapseKey = one per followup — only newest survives delivery
        const collapseKey = `fu_${String(followUpData?.followUpId || "")}`;

        // Determine follow-up type label for the client
        const followupType =
            minutesLeft < 0
                ? "followup-missed"
                : minutesLeft === 0
                  ? "followup-due"
                  : "followup-soon";

        /**
         * FIX BUG 2: The FCM message MUST contain a `notification` field.
         *
         * When the app is in the background or killed, Firebase does NOT call
         * the app's message handler. Instead, the OS (Android/iOS) reads the
         * `notification` field directly and displays the alert with sound.
         *
         * If you omit `notification` and send data-only, the OS shows nothing
         * when the app is killed — this was the root cause of Bug 2.
         *
         * Structure:
         *   notification   → displayed by OS in background/killed (title + body)
         *   data           → delivered to the app handler in all states
         *   android.notification.channelId → routes to the correct Android channel
         *                                    (which has the custom sound configured)
         *   android.ttl    → auto-expire stale messages (Bug 3 fix)
         *   apns           → iOS equivalent settings
         */
        const message = {
            token: fcmToken,

            // ── OS-displayed notification (required for background/killed) ──
            notification: {
                title: texts.title,
                body: texts.body,
            },

            // ── App data payload (available in all states) ──
            data: {
                type: followupType,
                followUpId: String(followUpData?.followUpId || ""),
                name: String(followUpData?.name || ""),
                when: followUpData?.when || "",
                enquiryNumber: String(followUpData?.enquiryNumber || ""),
                phoneNumber: String(followUpData?.phoneNumber || ""),
                minutesLeft: String(minutesLeft),
                activityType: String(activityType || ""),
                voiceLang: lang,
                // Tell the client which Android channel to use for local notifications
                // (used by the foreground onMessage handler)
                androidChannelId,
                channelKey,
                // Voice text for TTS
                voiceText: texts.voice || texts.body,
            },

            // ── Android-specific settings ──
            android: {
                // FIX BUG 3: Auto-expire after window passes
                ttl: ttlSeconds * 1000, // FCM android.ttl is in milliseconds

                // FIX BUG 3: Only deliver the newest reminder per follow-up
                collapseKey,

                priority: "high",

                notification: {
                    // FIX BUG 2: Route to the correct Android channel.
                    // The channel must be registered in the app (app.config.js)
                    // with sound configured. If channelId is wrong or the channel
                    // has no sound, Android will silently use the default channel.
                    channelId: androidChannelId,

                    // Use the channel's configured sound (set in app.config.js)
                    sound: "default",

                    // Show notification immediately, even in Doze mode
                    priority: "high",

                    // Vibrate on delivery
                    vibrateTimingsMillis: [0, 250, 250, 250],
                },
            },

            // ── APNs (iOS) settings ──
            apns: {
                headers: {
                    // FIX BUG 3: Auto-expire on iOS
                    // apns-expiration is a Unix timestamp (seconds since epoch)
                    "apns-expiration": String(
                        Math.floor(Date.now() / 1000) + ttlSeconds,
                    ),
                    // FIX BUG 3: collapseKey equivalent for iOS
                    "apns-collapse-id": collapseKey,
                    // High priority delivery
                    "apns-priority": "10",
                    "apns-push-type": "alert",
                },
                payload: {
                    aps: {
                        // FIX BUG 2: iOS requires sound here for background delivery
                        sound: "default",
                        badge: 1,
                        // Allow iOS to modify notification content
                        "mutable-content": 1,
                    },
                },
            },
        };

        const messagingInstance = admin.messaging();
        await messagingInstance.send(message);

        console.log(
            `[FCMService] ✓ Sent ${minutesLeft}min reminder → ${userId} (channel: ${androidChannelId}, ttl: ${ttlSeconds}s)`,
        );

        return { success: true, provider: "firebase" };
    } catch (error) {
        const msg = error?.message || String(error);

        // Token is invalid/expired — clear it so the scheduler stops retrying
        if (
            msg.includes("registration-token-not-registered") ||
            msg.includes("invalid-registration-token") ||
            msg.includes("Requested entity was not found")
        ) {
            console.warn(
                `[FCMService] Invalid FCM token for user ${userId} — clearing`,
            );
            await User.findByIdAndUpdate(userId, {
                $unset: { fcmToken: 1 },
            }).catch(() => {});
        }

        console.error(`[FCMService] ✗ Send failed for user ${userId}:`, msg);
        return { success: false, error: msg };
    }
};

// ─── Generic notification send (used by notificationRouter) ──────────────────

/**
 * Send a generic notification to a single user by userId.
 * Fetches the FCM token from DB, then sends.
 */
const sendNotification = async (payload, userId, _options = {}) => {
    try {
        const user = await User.findById(userId).select("fcmToken").lean();
        const fcmToken = user?.fcmToken;
        if (!fcmToken) {
            return { success: false, error: "No FCM token" };
        }

        const message = {
            token: fcmToken,
            notification: {
                title: payload.title || "Notification",
                body: payload.body || "",
            },
            data: payload.data
                ? Object.fromEntries(
                      Object.entries(payload.data).map(([k, v]) => [
                          k,
                          typeof v === "string" ? v : String(v),
                      ]),
                  )
                : {},
            android: { priority: "high" },
            apns: {
                payload: { aps: { sound: "default" } },
            },
        };

        await admin.messaging().send(message);
        return { success: true, provider: "firebase" };
    } catch (error) {
        return { success: false, error: error?.message };
    }
};

/**
 * Send a notification to multiple users by userIds array.
 * Fetches FCM tokens in a single DB query, then uses sendEachForMulticast.
 */
const sendToUsers = async (userIds, payload, _options = {}) => {
    try {
        const users = await User.find({ _id: { $in: userIds } })
            .select("fcmToken")
            .lean();

        const tokens = users
            .map((u) => u?.fcmToken)
            .filter((t) => typeof t === "string" && t.length > 10);

        if (tokens.length === 0) {
            return { success: false, error: "No valid FCM tokens" };
        }

        const multicastMessage = {
            tokens,
            notification: {
                title: payload.title || "Notification",
                body: payload.body || "",
            },
            data: payload.data
                ? Object.fromEntries(
                      Object.entries(payload.data).map(([k, v]) => [
                          k,
                          typeof v === "string" ? v : String(v),
                      ]),
                  )
                : {},
            android: { priority: "high" },
            apns: {
                payload: { aps: { sound: "default" } },
            },
        };

        const batchResponse = await admin
            .messaging()
            .sendEachForMulticast(multicastMessage);
        const successCount = batchResponse.successCount;
        const failureCount = batchResponse.failureCount;

        console.log(
            `[FCMService] Batch: ${successCount} sent, ${failureCount} failed`,
        );

        return { success: true, successCount, failureCount };
    } catch (error) {
        return { success: false, error: error?.message };
    }
};

module.exports = {
    sendActivityReminder,
    sendNotification,
    sendToUsers,
};
