// Backend Integration Example for Push Notifications
// This shows how to send and receive push notifications from your Node.js/Express backend

// ============================================
// BACKEND SETUP (server/routes)
// ============================================

/**
 * Route to register device push token
 * Endpoint: POST /api/auth/register-push-token
 */
exports.registerPushToken = async (req, res) => {
    try {
        const { pushToken } = req.body;
        const userId = req.user.id; // From auth middleware

        if (!pushToken) {
            return res.status(400).json({ error: "Push token required" });
        }

        // Update user with push token
        await User.findByIdAndUpdate(
            userId,
            {
                pushToken,
                lastTokenUpdate: new Date(),
            },
            { new: true },
        );

        res.json({
            success: true,
            message: "Push token registered successfully",
        });
    } catch (error) {
        console.error("Error registering push token:", error);
        res.status(500).json({ error: "Failed to register push token" });
    }
};

/**
 * Send notification for today's follow-ups
 * Endpoint: POST /api/notifications/send-followup-reminder
 */
exports.sendFollowUpReminder = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user with push token
        const user = await User.findById(userId);
        if (!user || !user.pushToken) {
            return res
                .status(400)
                .json({ error: "User or push token not found" });
        }

        // Get today's follow-ups
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayFollowUps = await FollowUp.find({
            userId,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
            },
        }).limit(10);

        if (todayFollowUps.length === 0) {
            return res.json({ message: "No follow-ups for today" });
        }

        // Send notification
        const response = await sendExpoNotification(user.pushToken, {
            title: "📋 Today's Follow-ups",
            body: `You have ${todayFollowUps.length} follow-ups to complete today`,
            data: {
                followUpCount: todayFollowUps.length,
                followUpList: JSON.stringify(todayFollowUps),
                type: "followup-reminder",
            },
        });

        res.json({
            success: true,
            message: "Notification sent",
            notificationId: response.id,
        });
    } catch (error) {
        console.error("Error sending follow-up reminder:", error);
        res.status(500).json({ error: "Failed to send notification" });
    }
};

/**
 * Send notification for overdue follow-ups
 * Endpoint: POST /api/notifications/send-urgent-reminder
 */
exports.sendUrgentReminder = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user || !user.pushToken) {
            return res
                .status(400)
                .json({ error: "User or push token not found" });
        }

        // Get overdue follow-ups
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdueFollowUps = await FollowUp.find({
            userId,
            date: {
                $lt: today,
            },
            status: { $ne: "completed" },
        });

        if (overdueFollowUps.length === 0) {
            return res.json({ message: "No overdue follow-ups" });
        }

        // Send urgent notification
        const response = await sendExpoNotification(
            user.pushToken,
            {
                title: "🚨 Overdue Follow-ups!",
                body: `You have ${overdueFollowUps.length} overdue follow-ups. Please complete them now!`,
                data: {
                    overdueCount: overdueFollowUps.length,
                    overdueList: JSON.stringify(overdueFollowUps),
                    type: "urgent",
                },
            },
            "high", // High priority
        );

        res.json({
            success: true,
            message: "Urgent notification sent",
            notificationId: response.id,
        });
    } catch (error) {
        console.error("Error sending urgent reminder:", error);
        res.status(500).json({ error: "Failed to send notification" });
    }
};

/**
 * Send notification for new enquiry assignment
 * Endpoint: POST /api/notifications/send-enquiry-alert
 */
exports.sendEnquiryAlert = async (req, res) => {
    try {
        const { userId, enquiryId } = req.body;

        const user = await User.findById(userId);
        if (!user || !user.pushToken) {
            return res
                .status(400)
                .json({ error: "User or push token not found" });
        }

        const enquiry = await Enquiry.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ error: "Enquiry not found" });
        }

        const response = await sendExpoNotification(user.pushToken, {
            title: "📌 New Enquiry Alert",
            body: `New enquiry from ${enquiry.name} regarding ${enquiry.product}`,
            data: {
                enquiryId: enquiry._id.toString(),
                enquiryName: enquiry.name,
                type: "new-enquiry",
            },
        });

        res.json({
            success: true,
            message: "Enquiry alert sent",
            notificationId: response.id,
        });
    } catch (error) {
        console.error("Error sending enquiry alert:", error);
        res.status(500).json({ error: "Failed to send notification" });
    }
};

/**
 * Broadcast notification to all users (admin only)
 * Endpoint: POST /api/notifications/broadcast
 */
exports.broadcastNotification = async (req, res) => {
    try {
        const { title, body, data } = req.body;

        // Get all users with push tokens
        const users = await User.find({
            pushToken: { $exists: true, $ne: null },
        });

        if (users.length === 0) {
            return res.json({ message: "No users with push tokens" });
        }

        const pushTokens = users.map((user) => user.pushToken);

        // Send to all tokens
        const results = await Promise.allSettled(
            pushTokens.map((token) =>
                sendExpoNotification(token, { title, body, data }),
            ),
        );

        const successful = results.filter(
            (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;

        res.json({
            success: true,
            message: "Broadcast completed",
            sent: successful,
            failed: failed,
        });
    } catch (error) {
        console.error("Error broadcasting notification:", error);
        res.status(500).json({ error: "Failed to broadcast notification" });
    }
};

// ============================================
// HELPER FUNCTION: Send to Expo
// ============================================

async function sendExpoNotification(
    pushToken,
    notification,
    priority = "default",
) {
    try {
        const message = {
            to: pushToken,
            sound: "default",
            priority: priority,
            ...notification,
        };

        const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Accept-encoding": "gzip, deflate",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
        });

        const data = await response.json();

        if (data.errors) {
            console.error("Expo API errors:", data.errors);
            throw new Error(data.errors[0].message);
        }

        console.log("Notification sent successfully:", data.data.id);
        return data.data;
    } catch (error) {
        console.error("Error sending to Expo:", error);
        throw error;
    }
}

// ============================================
// ROUTES CONFIGURATION
// ============================================

// Add these to your routes file (e.g., server/routes/notificationRoutes.js)

router.post("/register-push-token", authenticateUser, registerPushToken);

router.post("/send-followup-reminder", authenticateUser, sendFollowUpReminder);

router.post("/send-urgent-reminder", authenticateUser, sendUrgentReminder);

router.post("/send-enquiry-alert", authenticateUser, sendEnquiryAlert);

router.post(
    "/broadcast",
    authenticateUser,
    authorizeAdmin,
    broadcastNotification,
);

module.exports = router;

// ============================================
// DATABASE SCHEMA UPDATES
// ============================================

// Update your User schema to include push token:
const userSchema = new Schema({
    // ... existing fields ...
    pushToken: {
        type: String,
        default: null,
        sparse: true,
    },
    lastTokenUpdate: {
        type: Date,
        default: null,
    },
    notificationPreferences: {
        pushEnabled: { type: Boolean, default: true },
        dailyReminder: { type: Boolean, default: true },
        overdueAlerts: { type: Boolean, default: true },
        enquiryAlerts: { type: Boolean, default: true },
    },
});

// ============================================
// FRONTEND INTEGRATION
// ============================================

// In your frontend API config or service:

// Register push token on login
export const registerPushToken = async (pushToken) => {
    try {
        const response = await api.post(
            "/api/notifications/register-push-token",
            {
                pushToken,
            },
        );
        return response.data;
    } catch (error) {
        console.error("Failed to register push token:", error);
    }
};

// Update FollowUpScreen.js to register token on app load:
// Add this in initializeNotificationsAsync()

const initializeNotificationsAsync = async () => {
    try {
        await notificationService.initializeNotifications();

        const pushToken = await notificationService.getDevicePushToken();
        if (pushToken) {
            // Send token to backend
            await registerPushToken(pushToken);
            console.log("Push token registered with backend");
        }

        // ... rest of initialization
    } catch (error) {
        console.error("Failed to initialize notifications:", error);
    }
};

// ============================================
// TESTING WITH POSTMAN
// ============================================

/**
POST http://localhost:5000/api/notifications/register-push-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}

POST http://localhost:5000/api/notifications/send-followup-reminder
Authorization: Bearer <token>
Content-Type: application/json

{}

POST http://localhost:5000/api/notifications/send-urgent-reminder
Authorization: Bearer <token>
Content-Type: application/json

{}

POST http://localhost:5000/api/notifications/broadcast
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "title": "📢 Company Announcement",
  "body": "Important update about new features!",
  "data": {
    "type": "broadcast",
    "url": "https://yourapp.com/announcements"
  }
}
*/

// ============================================
// CRON JOB FOR AUTOMATIC REMINDERS
// ============================================

// Install: npm install node-cron

const cron = require("node-cron");

// Run every day at 9:00 AM
cron.schedule("0 9 * * *", async () => {
    try {
        console.log("Running daily follow-up reminder job...");

        const users = await User.find({
            pushToken: { $exists: true, $ne: null },
            "notificationPreferences.dailyReminder": true,
        });

        for (const user of users) {
            await sendFollowUpReminderForUser(user._id, user.pushToken);
        }

        console.log(`Daily reminders sent to ${users.length} users`);
    } catch (error) {
        console.error("Error in daily reminder job:", error);
    }
});

async function sendFollowUpReminderForUser(userId, pushToken) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayFollowUps = await FollowUp.find({
        userId,
        date: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
    });

    if (todayFollowUps.length > 0) {
        await sendExpoNotification(pushToken, {
            title: "📋 Daily Follow-up Reminder",
            body: `You have ${todayFollowUps.length} follow-up${
                todayFollowUps.length > 1 ? "s" : ""
            } today!`,
            data: {
                followUpCount: todayFollowUps.length,
                type: "daily-reminder",
            },
        });
    }
}
