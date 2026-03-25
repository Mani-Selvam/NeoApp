import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { confirmPermissionRequest } from "../utils/appFeedback";

const HOURLY_FOLLOWUP_ACK_DATE_KEY = "hourlyFollowupAckDate";
const HOURLY_FOLLOWUP_SCHEDULE_KEY = "hourlyFollowupSchedule"; // JSON: { dateKey, ids: [] }
const TIME_FOLLOWUP_SCHEDULE_KEY = "timeFollowupSchedule"; // JSON: { dateKey, ids: [] }
const NOTIFICATION_PERMISSION_EXPLAINED_KEY = "notificationPermissionExplained";
const TRIGGER_TYPES = Notifications.SchedulableTriggerInputTypes || {};
const DATE_TRIGGER_TYPE = TRIGGER_TYPES.DATE || "date";
const DAILY_TRIGGER_TYPE = TRIGGER_TYPES.DAILY || "daily";

// Helper to check if notifications are supported
const isNotificationSupported = () => {
    if (Platform.OS === "web") {
        return false;
    }
    return true;
};

const buildDateTrigger = (date, channelId = "followups") => {
    const trigger = { type: DATE_TRIGGER_TYPE, date };
    if (Platform.OS === "android" && channelId) {
        trigger.channelId = channelId;
    }
    return trigger;
};

const buildDailyTrigger = (hour, minute, channelId = "followups") => {
    const trigger = {
        type: DAILY_TRIGGER_TYPE,
        hour,
        minute,
        repeats: true,
    };
    if (Platform.OS === "android" && channelId) {
        trigger.channelId = channelId;
    }
    return trigger;
};

// Configure notification behavior (only on supported platforms)
if (isNotificationSupported()) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
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
            // Still continue, but user won't see notifications
        }

        // For Android: Set notification channel
        if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync("default", {
                name: "default",
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#FF231F7C",
            });

            // Channel for follow-ups
            await Notifications.setNotificationChannelAsync("followups", {
                name: "Follow-ups",
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#0EA5E9",
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });

            // Channel for enquiries
            await Notifications.setNotificationChannelAsync("enquiries", {
                name: "Enquiries",
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 150, 150, 150],
                lightColor: "#16A34A",
                sound: "default",
                enableVibrate: true,
                enableLights: true,
            });
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
        // Skip notifications on web platform
        if (Platform.OS === "web") {
            return;
        }

        if (followUpCount === 0) return;

        const title = "📋 Today's Follow-ups";
        const body =
            followUpCount === 1
                ? `You have ${followUpCount} follow-up to complete today`
                : `You have ${followUpCount} follow-ups to complete today`;

        console.log("Sending follow-up notification...", {
            title,
            body,
            count: followUpCount,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: title,
                body: body,
                subtitle: followUpCount > 0 ? "Tap to view details" : "",
                data: {
                    followUpCount,
                    followUpList: JSON.stringify(followUpData),
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 250, 250, 250],
                badge: followUpCount,
                ios: {
                    sound: true,
                    Badge: followUpCount,
                },
                android: {
                    channelId: "followups",
                    smallIcon: "icon",
                    color: "#0EA5E9",
                    vibrate: [0, 250, 250, 250],
                    priority: "high",
                    sticky: false,
                },
            },
            trigger: null, // Send immediately
        });

        console.log(
            `📋 Follow-up notification sent: ${followUpCount} today (ID: ${notificationId})`,
        );
    } catch (error) {
        console.error("Failed to show notification:", error);
    }
};

// Show urgent follow-up notification (overdue)
export const showUrgentNotification = async (
    overdueCount,
    overdueData = [],
) => {
    try {
        // Skip notifications on web platform
        if (!isNotificationSupported()) {
            return;
        }

        if (overdueCount === 0) return;

        const title = "🚨 Overdue Follow-ups";
        const body =
            overdueCount === 1
                ? `You have ${overdueCount} overdue follow-up!`
                : `You have ${overdueCount} overdue follow-ups!`;

        console.log("Sending urgent notification...", {
            title,
            body,
            count: overdueCount,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: title,
                body: body,
                data: {
                    overdueCount,
                    overdueList: JSON.stringify(overdueData),
                    type: "urgent",
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 500, 250, 500],
                badge: overdueCount,
                ios: {
                    sound: true,
                    Badge: overdueCount,
                },
                android: {
                    channelId: "followups",
                    smallIcon: "icon",
                    color: "#DC2626",
                    vibrate: [0, 500, 250, 500],
                    priority: "high",
                    sticky: true,
                },
            },
            trigger: null, // Send immediately
        });

        console.log(
            `🚨 Urgent notification sent: ${overdueCount} overdue (ID: ${notificationId})`,
        );
    } catch (error) {
        console.error("Failed to show urgent notification:", error);
    }
};

// Show success notification for new enquiry
export const showEnquirySuccessNotification = async (enquiryData) => {
    try {
        // Skip notifications on web platform
        if (!isNotificationSupported()) {
            return;
        }

        const title = "✅ New Enquiry Added";
        const body = `${enquiryData.name} - ${enquiryData.product}`;

        console.log("Sending enquiry success notification...", { title, body });

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: title,
                body: body,
                subtitle: "Successfully recorded",
                data: {
                    type: "enquiry-success",
                    enquiryId: enquiryData.id || enquiryData._id,
                    enquiryName: enquiryData.name,
                    product: enquiryData.product,
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 200, 150, 200],
                badge: 1,
                ios: {
                    sound: true,
                    badge: 1,
                },
                android: {
                    channelId: "enquiries",
                    smallIcon: "icon",
                    color: "#16A34A",
                    vibrate: [0, 200, 150, 200],
                    priority: "high",
                    sticky: false,
                },
            },
            trigger: null, // Send immediately
        });

        console.log(
            `✅ Enquiry success notification sent: ${enquiryData.name} (ID: ${notificationId})`,
        );
        return notificationId;
    } catch (error) {
        console.error("Failed to show enquiry success notification:", error);
    }
};

// Show notification for new enquiry alert (admin/lead staff)
export const showNewEnquiryAlertNotification = async (enquiryData) => {
    try {
        // Skip notifications on web platform
        if (!isNotificationSupported()) {
            return;
        }

        const title = "📌 New Enquiry Alert";
        const body = `New enquiry from ${enquiryData.name}`;

        console.log("Sending new enquiry alert notification...", {
            title,
            body,
        });

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: title,
                body: body,
                subtitle: enquiryData.product,
                data: {
                    type: "new-enquiry-alert",
                    enquiryId: enquiryData.id || enquiryData._id,
                    enquiryName: enquiryData.name,
                    product: enquiryData.product,
                    source: enquiryData.source,
                    timestamp: new Date().toISOString(),
                },
                sound: "default",
                vibrate: [0, 250, 250, 250],
                badge: 1,
                ios: {
                    sound: true,
                    badge: 1,
                },
                android: {
                    channelId: "enquiries",
                    smallIcon: "icon",
                    color: "#0EA5E9",
                    vibrate: [0, 250, 250, 250],
                    priority: "high",
                    sticky: false,
                },
            },
            trigger: null, // Send immediately
        });

        console.log(
            `📌 New enquiry alert notification sent: ${enquiryData.name} (ID: ${notificationId})`,
        );
        return notificationId;
    } catch (error) {
        console.error("Failed to show new enquiry alert notification:", error);
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
                    sound: true,
                    badge: 1,
                },
                android: {
                    channelId: "enquiries",
                    smallIcon: "icon",
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
                    sound: true,
                    badge: 1,
                },
                android: {
                    channelId: "enquiries",
                    smallIcon: "icon",
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
        const trigger = buildDailyTrigger(hour, minute, "followups");

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
                ios: {
                    sound: true,
                },
                android: {
                    channelId: "followups",
                    smallIcon: "icon",
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
    if (type === "phone call") return `Call ${who}: 2 minutes to move this forward.`;
    return `Follow up with ${who} now.`;
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
        await cancelTodayFollowUpReminders();
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
        const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
        if (m24) {
            const hh = Math.min(23, Math.max(0, Number(m24[1])));
            const mm = Math.min(59, Math.max(0, Number(m24[2])));
            d.setHours(hh, mm, 0, 0);
        }
    }

    return d;
};

const buildDueAtContent = (item, when) => {
    const name = String(item?.name || "Client").trim();
    const activityType = String(item?.activityType || item?.type || "Follow-up").trim();
    const timeLabel = when ? formatHHmm(when) : "";

    const title =
        activityType.toLowerCase() === "meeting"
            ? "Meeting reminder"
            : activityType.toLowerCase() === "email"
              ? "Email follow-up"
              : activityType.toLowerCase() === "whatsapp"
                ? "WhatsApp follow-up"
                : activityType.toLowerCase() === "phone call"
                  ? "Call reminder"
                  : "Follow-up reminder";

    const line = getPrettyFollowUpLine(activityType, name);
    const body = timeLabel ? `${name} • ${timeLabel}. ${line}` : `${name}. ${line}`;

    return {
        title,
        body,
        data: {
            type: "followup-due",
            followUpId: String(item?._id || ""),
            enqId: String(item?.enqId || item?._id || ""),
            enqNo: String(item?.enqNo || ""),
            activityType,
            when: when ? when.toISOString() : null,
            timestamp: new Date().toISOString(),
        },
    };
};

const buildMissedContent = (item, when) => {
    const name = String(item?.name || "Client").trim();
    const activityType = String(item?.activityType || item?.type || "Follow-up").trim();
    const timeLabel = when ? formatHHmm(when) : "";

    const title = "You might have missed this";
    const t = activityType.toLowerCase();
    const actionText =
        t === "phone call"
            ? "Please make the call now."
            : t === "whatsapp"
              ? "Please send WhatsApp now."
              : t === "email"
                ? "Please send the email now."
                : t === "meeting"
                  ? "Please confirm and connect now."
                  : "Please follow up now.";

    const body = timeLabel
        ? `${name} • ${activityType} at ${timeLabel}. ${actionText}`
        : `${name} • ${activityType}. ${actionText}`;

    return {
        title,
        body,
        data: {
            type: "followup-missed",
            followUpId: String(item?._id || ""),
            enqId: String(item?.enqId || item?._id || ""),
            enqNo: String(item?.enqNo || ""),
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
                    ios: { sound: true },
                    android: {
                        channelId,
                        smallIcon: "icon",
                        color: "#0EA5E9",
                        priority: "high",
                        sticky: false,
                    },
                },
                trigger: buildDateTrigger(cursor, channelId),
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
    { channelId = "followups", missedAfterMinutes = 20 } = {},
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

        await cancelTimeFollowUpReminders();
        if (todayFollowUps.length === 0) {
            return { scheduled: 0, skipped: true, reason: "none-due" };
        }

        const now = new Date();
        const ids = [];

        for (const item of todayFollowUps) {
            const dateStr = item?.nextFollowUpDate || item?.followUpDate || item?.date;
            const timeStr = item?.time;
            if (!timeStr) continue; // optional time => skip time-based scheduling

            const when = parseLocalDateTime(dateStr, timeStr);
            if (!when) continue;

            // If time already passed today, schedule a "missed" nudge soon.
            if (when.getTime() <= now.getTime()) {
                const missed = buildMissedContent(item, when);
                const id = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: missed.title,
                        body: missed.body,
                        subtitle: "Tap to open Follow-ups",
                        data: missed.data,
                        sound: "default",
                        vibrate: [0, 250, 250, 250],
                        ios: { sound: true },
                        android: {
                            channelId,
                            smallIcon: "icon",
                            color: "#FF3B5C",
                            priority: "high",
                            sticky: false,
                        },
                    },
                    trigger: buildDateTrigger(
                        new Date(now.getTime() + 60 * 1000),
                        channelId,
                    ),
                });
                ids.push(id);
                continue;
            }

            const due = buildDueAtContent(item, when);
            const dueId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: due.title,
                    body: due.body,
                    subtitle: "Tap to open Follow-ups",
                    data: due.data,
                    sound: "default",
                    vibrate: [0, 250, 250, 250],
                    ios: { sound: true },
                    android: {
                        channelId,
                        smallIcon: "icon",
                        color: "#0EA5E9",
                        priority: "high",
                        sticky: false,
                    },
                },
                trigger: buildDateTrigger(when, channelId),
            });
            ids.push(dueId);

            // Extra nudge for missed meeting/call/etc.
            const missedWhen = new Date(when.getTime() + missedAfterMinutes * 60 * 1000);
            const missed = buildMissedContent(item, when);
            const missedId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: missed.title,
                    body: missed.body,
                    subtitle: "Tap to open Follow-ups",
                    data: missed.data,
                    sound: "default",
                    vibrate: [0, 250, 250, 250],
                    ios: { sound: true },
                    android: {
                        channelId,
                        smallIcon: "icon",
                        color: "#FF9500",
                        priority: "high",
                        sticky: false,
                    },
                },
                trigger: buildDateTrigger(missedWhen, channelId),
            });
            ids.push(missedId);
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
        console.log("Global notification tapped:", data);

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
                // User has acknowledged the reminder by tapping it.
                acknowledgeHourlyFollowUpReminders().catch(() => {});
                // Navigate to FollowUp screen
                // We need to navigate to the nested tab
                navigationRef.navigate('Main', {
                    screen: 'FollowUp',
                    params: { screen: 'ENQUIRY_LIST' }
                });
            } else if (data.type === 'enquiry-success' || data.type === 'new-enquiry-alert') {
                navigationRef.navigate('Main', {
                    screen: 'Enquiry',
                    params: { screen: 'EnquiryList' }
                });
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

export default {
    initializeNotifications,
    showFollowUpNotification,
    showUrgentNotification,
    showEnquirySuccessNotification,
    showNewEnquiryAlertNotification,
    showEnquiryErrorNotification,
    showEnquiryStatusNotification,
    scheduleDailyNotification,
    getPendingNotifications,
    cancelAllNotifications,
    cancelNotification,
    getDevicePushToken,
    setupNotificationListener,
    setupForegroundNotificationListener,
    checkAndNotifyTodayFollowUps,
    cancelFollowUpNotifications,
    scheduleHourlyFollowUpRemindersForToday,
    cancelHourlyFollowUpReminders,
    scheduleTimeFollowUpRemindersForToday,
    cancelTimeFollowUpReminders,
    cancelTodayFollowUpReminders,
    acknowledgeHourlyFollowUpReminders,
    setupGlobalNotificationListener,
};
