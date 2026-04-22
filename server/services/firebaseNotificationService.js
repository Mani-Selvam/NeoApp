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
    // ⚡ Primary: Server-optimized version (CommonJS)
    const phrases = require("../utils/notificationPhrasesServer");
    getFollowUpSoonTexts = phrases.getFollowUpSoonTexts;
    getFollowUpDueTexts = phrases.getFollowUpDueTexts;
    getFollowUpMissedTexts = phrases.getFollowUpMissedTexts;
} catch (e1) {
    console.error(`[FCMService] Failed to load server phrases: ${e1.message}`);
    try {
        // Fallback to shared constants if available
        const phrases = require("../../src/constants/notificationPhrases");
        getFollowUpSoonTexts = phrases.getFollowUpSoonTexts;
        getFollowUpDueTexts = phrases.getFollowUpDueTexts;
        getFollowUpMissedTexts = phrases.getFollowUpMissedTexts;
    } catch (e2) {
        console.error(`[FCMService] Failed to load secondary phrases: ${e2.message}`);
        console.warn(
            "[WARNING] notificationPhrases module not found - using basic fallback stubs",
        );
        const _prefix = (actor, name) => {
            const a = String(actor || "").trim();
            const n = String(name || "Client").trim();
            return a && a !== n ? `${a} • ${n}` : n;
        };

        getFollowUpSoonTexts = ({ lang, minutesLeft, name, actorName, activityType }) => ({
            title: `${actorName ? actorName + " • " : ""}${minutesLeft}min reminder`,
            body: `${_prefix(actorName, name)} • ${activityType || "Follow-up"} in ${minutesLeft} minutes.`,
        });
        getFollowUpDueTexts = ({ lang, name, actorName, activityType }) => ({
            title: `${actorName ? actorName + " • " : ""}Reminder`,
            body: `${_prefix(actorName, name)} • ${activityType || "Follow-up"} is due now.`,
        });
        getFollowUpMissedTexts = ({ lang, name, actorName, activityType }) => ({
            title: `${actorName ? actorName + " • " : ""}Missed`,
            body: `${_prefix(actorName, name)} • You might have missed this ${activityType || "activity"}.`,
        });
    }
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
        actorName: followUpData?.actorName,
        activityType,
    };

    if (minutesLeft > 0) {
        return getFollowUpSoonTexts({ ...shared, minutesLeft });
    }
    
    // For due and missed, we want to include the time label (e.g. "at 14:30")
    const timeLabel = followUpData?.when ? new Date(followUpData.when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : "";
    
    if (minutesLeft === 0) {
        return getFollowUpDueTexts({ ...shared, timeLabel });
    }
    // missed
    return getFollowUpMissedTexts({ ...shared, timeLabel });
};

// ─── Sound Filename Mapping ──────────────────────────────────────────────────

/**
 * Maps a channel key to the actual audio filename bundled in the app.
 * This ensures the OS (Android/iOS) plays the custom sound in background/closed states.
 */
const resolveSoundFilename = (channelKey) => {
    const k = String(channelKey || "").toLowerCase();

    // 1. Phone / Generic Follow-ups
    if (k.includes("phone_") || k.includes("followups_")) {
        if (k.includes("5min")) return "n5pmin";
        if (k.includes("4min")) return "n4pmin";
        if (k.includes("3min")) return "n3pmin";
        if (k.includes("2min")) return "n2pmin";
        if (k.includes("1min")) return "n1pmin";
        if (k.includes("due")) return k.includes("_ta") ? "tdue" : "pdue";
        if (k.includes("missed")) return k.includes("_ta") ? "tmissed" : "pmissed";
        
        // Tamil patterns
        if (k.includes("_ta")) {
            if (k.includes("5min")) return "t5min";
            if (k.includes("4min")) return "t4min";
            if (k.includes("3min")) return "t3min";
            if (k.includes("2min")) return "t2min";
            if (k.includes("1min")) return "t1min";
        }
    }

    // 2. Meeting
    if (k.includes("meeting_")) {
        const isTa = k.includes("_ta");
        if (k.includes("min")) return isTa ? "mt5min" : "m5min";
        if (k.includes("due")) return isTa ? "mtdue" : "mdue";
        if (k.includes("missed")) return isTa ? "mtmissed" : "emissed";
    }

    // 3. Email
    if (k.includes("email_")) {
        const isTa = k.includes("_ta");
        if (k.includes("min")) return isTa ? "et5min" : "e5min";
        if (k.includes("due")) return isTa ? "etdue" : "edue";
        if (k.includes("missed")) return isTa ? "etmissed" : "emissed";
    }

    // 4. WhatsApp
    if (k.includes("whatsapp_")) {
        const isTa = k.includes("_ta");
        if (k.includes("min")) return isTa ? "wt5min" : "w5min";
        if (k.includes("due")) return isTa ? "wtdue" : "wdue";
        if (k.includes("missed")) return isTa ? "wtmissed" : "wmissed";
    }

    return "default";
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
            .select("fcmToken notificationPreferences fcmSessionId")
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
                // Scope notifications to a login session to avoid stale delivery
                sessionId: String(user?.fcmSessionId || ""),
                sentAtMs: String(Date.now()),
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

                    // Use the specific custom sound filename (without extension).
                    // FCM needs the exact resource name to play it in background/killed.
                    sound: resolveSoundFilename(channelKey),

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
                        // FIX BUG 2: iOS requires the custom sound filename here.
                        // (iOS usually needs the extension, e.g. pdue.wav)
                        sound: `${resolveSoundFilename(channelKey)}${resolveSoundFilename(channelKey) === "default" ? "" : ".wav"}`,
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
            }).catch(() => { });
        }

        console.error(`[FCMService] ✗ Send failed for user ${userId}:`, msg);
        return { success: false, error: msg };
    }
};

// ─── Generic notification send (used by notificationRouter) ──────────────────

/**
 * Send a generic notification to a single user.
 *
 * @param {string} identifier - Either a userId (string) or an fcmToken (string)
 * @param {object} payload    - { title, body, data }
 * @param {object} options    - { priority, channelId, sound }
 */
const sendNotification = async (identifier, payload, options = {}) => {
    try {
        let fcmToken = null;
        let sessionId = "";

        // If identifier looks like a MongoDB ID, fetch the user
        if (typeof identifier === "string" && identifier.length === 24 && /^[0-9a-fA-F]+$/.test(identifier)) {
            const user = await User.findById(identifier).select("fcmToken fcmSessionId").lean();
            fcmToken = user?.fcmToken;
            sessionId = user?.fcmSessionId || "";
        } else {
            // Treat as direct token
            fcmToken = identifier;
        }

        if (!fcmToken) {
            return { success: false, error: "No FCM token" };
        }

        const channelId = options.channelId || "default_v5";
        const sound = options.sound || "default";

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
            android: {
                priority: options.priority || "high",
                notification: {
                    channelId,
                    sound,
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: sound === "default" ? "default" : `${sound}.wav`,
                    }
                },
            },
        };

        // Append session scoping info
        message.data = {
            ...(message.data || {}),
            sessionId: String(sessionId || ""),
            sentAtMs: String(Date.now()),
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
    buildTexts,
    resolveSoundFilename,
};