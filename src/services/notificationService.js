import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Helper to check if notifications are supported
const isNotificationSupported = () => {
    if (Platform.OS === "web") {
        return false;
    }
    return true;
};

// Configure notification behavior (only on supported platforms)
if (isNotificationSupported()) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
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
        const trigger = {
            hour,
            minute,
            repeats: true,
        };

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

// Global notification handler for navigation
export const setupGlobalNotificationListener = (navigationRef) => {
    return Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        console.log("Global notification tapped:", data);

        if (navigationRef.isReady()) {
            // Handle different notification types
            if (data.followUpCount || data.overdueCount || data.type === 'daily-reminder') {
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
    setupGlobalNotificationListener,
};
