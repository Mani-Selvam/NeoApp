const admin = require("../config/firebaseAdmin");

const sanitizeData = (data = {}) => {
    const entries = Object.entries(data || {});
    const out = {};

    for (const [key, value] of entries) {
        if (value === undefined || value === null) continue;
        if (typeof value === "string") {
            out[key] = value;
            continue;
        }
        if (typeof value === "number" || typeof value === "boolean") {
            out[key] = String(value);
            continue;
        }
        try {
            out[key] = JSON.stringify(value);
        } catch (_error) {
            out[key] = String(value);
        }
    }

    return out;
};

// FIX #27: Helper to map activity type to notification channel and sound
const getActivitySound = (activityType) => {
    const soundMap = {
        phone: "phone_notification",
        meeting: "meeting_notification",
        email: "email_notification",
        whatsapp: "whatsapp_notification",
        followup: "followup_notification",
    };
    return (
        soundMap[String(activityType || "followup").toLowerCase()] || "default"
    );
};

// FIX #27: Helper to remove dead FCM token
const removeDeadToken = async (userId) => {
    try {
        const User = require("../models/User");
        const result = await User.updateOne(
            { _id: userId },
            { $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 } },
        );
        console.log(`[FCM] Removed dead token for user ${userId}`);
        return result;
    } catch (error) {
        console.error(
            `[FCM] Error removing dead token for user ${userId}:`,
            error.message,
        );
    }
};

class FirebaseNotificationService {
    // Send FCM notification with voice data and sound
    // FIX #27: Added sound payload for all app states (closed, background, foreground)
    async sendNotification(fcmToken, payload, userId = null) {
        const dataPayload = sanitizeData({
            type: payload.type,
            voiceLang: payload.voiceLang || "en",
            audioType: payload.audioType, // 'pre_recorded' or 'tts'
            audioUrl: payload.audioUrl, // For pre-recorded
            ttsText: payload.ttsText, // For TTS
            minutesLeft: payload.minutesLeft,
            activityType: payload.activityType,
            timestamp: Date.now(), // For foreground deduplication (20-sec window)
            ...payload.data,
        });

        // FIX #27: Add activity-specific sound to payload
        const activitySound = getActivitySound(payload.activityType);

        const message = {
            token: fcmToken,
            notification: {
                title: payload.title,
                body: payload.body,
                sound: activitySound, // Activity-specific sound
            },
            data: dataPayload,
            android: {
                priority: payload.priority || "high",
                notification: {
                    title: payload.title,
                    body: payload.body,
                    // On Android 8.0+ (Oreo) the channel controls the sound —
                    // the sound field here is for Android < 8. Do NOT set
                    // defaultSound:true or it overrides the channel's custom sound.
                    channelId: payload.channelId || "followups_en",
                    notificationPriority: "PRIORITY_MAX",
                    tag: "notification",
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: activitySound || "default", // Activity-specific sound for iOS
                        badge: 1,
                        alert: {
                            title: payload.title,
                            body: payload.body,
                        },
                    },
                },
            },
        };

        try {
            const response = await admin.messaging().send(message);
            console.log(
                `[FCM] Notification sent (${activitySound}): ${response}`,
            );
            return { success: true, messageId: response };
        } catch (error) {
            // FIX #27: Auto-cleanup dead tokens on 400 errors
            if (
                error.code === "messaging/invalid-registration-token" ||
                error.code === "messaging/third-party-auth-error"
            ) {
                console.error(`[FCM] Invalid token error: ${error.message}`);
                if (userId) {
                    await removeDeadToken(userId);
                }
                return {
                    success: false,
                    error: "Invalid token (removed)",
                    deadToken: true,
                };
            }
            console.error(`[FCM] Send error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Send to multiple users
    // FIX #27: Added batch cleanup of dead tokens
    async sendToUsers(userIds, payload) {
        const User = require("../models/User");
        const users = await User.find({
            _id: { $in: userIds },
            fcmToken: { $exists: true, $ne: null },
        });

        const results = await Promise.allSettled(
            users.map((user) =>
                this.sendNotification(user.fcmToken, payload, user._id),
            ),
        );

        // FIX #27: Collect and cleanup dead tokens in background
        const deadTokens = [];
        results.forEach((result, index) => {
            if (result.status === "fulfilled" && result.value.deadToken) {
                deadTokens.push(users[index]._id);
            }
        });

        if (deadTokens.length > 0) {
            console.log(
                `[FCM] Batch cleanup: ${deadTokens.length} dead tokens collected`,
            );
            // Clean up in background (don't block API response)
            deadTokens.forEach((userId) => {
                removeDeadToken(userId).catch((e) =>
                    console.error(
                        `[FCM] Cleanup failed for ${userId}:`,
                        e.message,
                    ),
                );
            });
        }

        return {
            total: users.length,
            successful: results.filter(
                (r) => r.status === "fulfilled" && r.value.success,
            ).length,
            failed: results.filter(
                (r) => r.status === "rejected" || !r.value.success,
            ).length,
            deadTokensRemoved: deadTokens.length,
        };
    }

    // Send follow-up reminder
    async sendFollowUpReminder(userId, followUpData) {
        const User = require("../models/User");
        const user = await User.findById(userId);

        if (!user?.fcmToken) {
            return { success: false, error: "FCM token not found" };
        }

        const voiceLang = user.notificationPreferences?.voiceLang || "en";

        const payload = {
            title: "📋 Follow-up Reminder",
            body: `You have a follow-up due soon`,
            type: "followup-reminder",
            voiceLang,
            audioType: "pre_recorded",
            audioUrl: `followup_reminder_${voiceLang}`,
            channelId: "followups",
            priority: "default",
            data: followUpData,
        };

        return await this.sendNotification(user.fcmToken, payload);
    }

    // Send urgent reminder
    async sendUrgentReminder(userId, followUpData) {
        const User = require("../models/User");
        const user = await User.findById(userId);

        if (!user?.fcmToken) {
            return { success: false, error: "FCM token not found" };
        }

        const voiceLang = user.notificationPreferences?.voiceLang || "en";

        const payload = {
            title: "🚨 Overdue Follow-ups!",
            body: `You have overdue follow-ups. Please complete them now!`,
            type: "urgent",
            voiceLang,
            audioType: "pre_recorded",
            audioUrl: `followup_urgent_${voiceLang}`,
            channelId: "followups",
            priority: "high",
            data: followUpData,
        };

        return await this.sendNotification(user.fcmToken, payload);
    }

    // Send enquiry alert
    async sendEnquiryAlert(userId, enquiryData) {
        const User = require("../models/User");
        const user = await User.findById(userId);

        if (!user?.fcmToken) {
            return { success: false, error: "FCM token not found" };
        }

        const payload = {
            title: "📌 New Enquiry Alert",
            body: `New enquiry from ${enquiryData.name} regarding ${enquiryData.product}`,
            type: "new-enquiry",
            channelId: "enquiries",
            priority: "default",
            data: enquiryData,
        };

        return await this.sendNotification(user.fcmToken, payload);
    }

    // Broadcast to all users
    async broadcastNotification(title, body, data = {}) {
        const User = require("../models/User");
        const users = await User.find({
            fcmToken: { $exists: true, $ne: null },
        });

        if (users.length === 0) {
            return { message: "No users with FCM tokens" };
        }

        const results = await Promise.allSettled(
            users.map((user) => {
                const payload = {
                    title,
                    body,
                    type: "broadcast",
                    channelId: "default",
                    priority: "default",
                    data,
                };
                return this.sendNotification(user.fcmToken, payload);
            }),
        );

        const successful = results.filter(
            (r) => r.status === "fulfilled" && r.value.success,
        ).length;
        const failed = results.filter(
            (r) => r.status === "rejected" || !r.value.success,
        ).length;

        return {
            success: true,
            message: "Broadcast completed",
            sent: successful,
            failed: failed,
        };
    }
}

module.exports = new FirebaseNotificationService();
