# Push Notification Delivery System Analysis - Closed App Scenarios

**NeoApp (React Native + Expo + Node.js/Express)**

---

## Executive Summary

NeoApp uses **Expo Push Notifications** (NOT Firebase Cloud Messaging) to deliver notifications to both Android and iOS when the app is closed. The system consists of:

- **Frontend**: Expo's `expo-notifications` library
- **Backend**: Node.js/Express + Expo Push API (`https://exp.host/--/api/v2/push/send`)
- **Storage**: MongoDB with User model for push tokens
- **Scheduling**: Node-cron for daily reminders + on-device local scheduling
- **Android**: Native notification channels with custom sounds
- **iOS**: APNs via Expo EAS Build

---

## 1. PUSH TOKEN MANAGEMENT

### 1.1 Token Acquisition & Registration

**How tokens are obtained:**

- Location: [src/services/notificationService.js](src/services/notificationService.js#L1319)
- Gets Expo push token via `Notifications.getExpoPushTokenAsync(projectId)`
- Returns format: `ExponentPushToken[...]`

**Token registration endpoint:**

- Route: `POST /api/auth/register-push-token`
- Code: [server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js#L1)
- Auth: Bearer JWT required
- Operation: Stores token + timestamp in database

### 1.2 Token Storage in Database

**Schema Definition (Expected):**

```javascript
// From: server/BACKEND_NOTIFICATIONS.js lines 290-310
pushToken: { type: String, default: null, sparse: true }
lastTokenUpdate: { type: Date, default: null }
notificationPreferences: {
    pushEnabled: { type: Boolean, default: true },
    dailyReminder: { type: Boolean, default: true },
    overdueAlerts: { type: Boolean, default: true }
}
```

**⚠️ ISSUE**: The User.js schema file ([server/models/User.js](server/models/User.js)) does NOT declare these fields. They may be dynamically added or missing.

### 1.3 Token Refresh & Validity

**Current Implementation:**

- Token obtained once during app initialization
- Stored with `lastTokenUpdate` timestamp
- NO automatic refresh mechanism
- NO token validation/testing before send

**Vulnerability**: Stale tokens accumulate; no mechanism to detect or remove expired tokens

### 1.4 User-Token Association

**Stored in**: User model (MongoDB)

- One-to-one relationship (one user → one push token)
- Token linked to userId during registration
- Used for lookups: `User.find({ pushToken: { $exists: true, $ne: null } })`

---

## 2. FIREBASE / FCM SETUP

### 2.1 Firebase Admin SDK Configuration

**Location**: [server/config/firebaseAdmin.js](server/config/firebaseAdmin.js)

**Initialization Code:**

```javascript
try {
    if (!admin.apps.length) {
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (serviceAccountPath) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath)),
            });
            console.log("[Firebase Admin] Initialized with service account");
        } else {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
            console.log(
                "[Firebase Admin] Using Application Default Credentials",
            );
        }
    }
} catch (error) {
    console.warn("[Firebase Admin] Initialization failed:", error.message);
}
```

**Environment Requirements:**

- `GOOGLE_APPLICATION_CREDENTIALS`: Path to JSON keyfile (or not set for ADC)
- Service account permissions must include Cloud Messaging

**⚠️ CRITICAL**: Firebase is initialized but **NOT USED for push notifications**. Only authentication uses Firebase.

### 2.2 Firebase Configuration in App

**Frontend Config** ([src/firebaseConfig.js](src/firebaseConfig.js)):

```javascript
const firebaseConfig = Constants.expoConfig?.extra?.firebase || {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
let auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
});
```

**Purpose**: Authentication ONLY (firebase/auth)

### 2.3 google-services.json Configuration

**Location**: [google-services.json](google-services.json)

```json
{
    "project_info": {
        "project_number": "168810107337",
        "project_id": "login-form-39e3e"
    },
    "client": [
        {
            "client_info": {
                "mobilesdk_app_id": "1:168810107337:android:c9a244da23185c7a9e9818",
                "android_client_info": {
                    "package_name": "com.mycompany.myapp"
                }
            }
        }
    ]
}
```

**app.json reference** ([app.json](app.json#L15)):

```json
"android": {
    "package": "com.mycompany.myapp",
    "googleServicesFile": "./google-services.json"
}
```

**Purpose**: Android OAuth configuration and API credentials (NOT for messaging)

### 2.4 FCM Status

| Item                | Status         | Note                             |
| ------------------- | -------------- | -------------------------------- |
| Firebase Admin SDK  | ✓ Initialized  | Not used for messaging           |
| Messaging service   | ❌ Not used    | Using Expo instead               |
| Cloud Messaging API | ❌ Not enabled | Would require FCM tokens         |
| Credentials in .env | ⚠️ Check       | Env vars loaded but not verified |

---

## 3. NOTIFICATION SERVICE BACKEND

### 3.1 Notification Sending Mechanism

**Core Function** ([server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js#L240)):

```javascript
async function sendExpoNotification(
    pushToken,
    notification,
    priority = "default",
) {
    const message = {
        to: pushToken, // ExponentPushToken[xxx]
        sound: "default",
        priority: priority, // "high" or "default"
        ...notification, // Merge title, body, data
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
    });

    const data = await response.json();
    if (data.errors) {
        console.error("Expo API errors:", data.errors);
        throw new Error(data.errors[0].message);
    }
    return data.data;
}
```

**Push Service Used**: `https://exp.host/--/api/v2/push/send` (Expo's official API)

### 3.2 Notification Payload Structure

**Example - Daily Follow-up Reminder** ([server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js#L74)):

```javascript
{
    title: "📋 Today's Follow-ups",
    body: `You have ${todayFollowUps.length} follow-ups to complete today`,
    data: {
        followUpCount: todayFollowUps.length,
        followUpList: JSON.stringify(todayFollowUps),
        type: "followup-reminder",
        timestamp: new Date().toISOString()
    }
}
```

**Common Data Fields:**
| Field | Purpose | Used for |
|-------|---------|----------|
| `type` | Notification category | Routing/handling in app |
| `followUpCount` | Count of items | Badge display |
| `followUpList` | Serialized data | Content when notification tapped |
| `enquiryId` | Reference ID | Deep linking |
| `timestamp` | When sent | Deduplication |

### 3.3 Available Notification Endpoints

| Endpoint                                         | Purpose        | Priority | Auth  |
| ------------------------------------------------ | -------------- | -------- | ----- |
| `POST /api/notifications/send-followup-reminder` | Daily count    | default  | User  |
| `POST /api/notifications/send-urgent-reminder`   | Overdue items  | **high** | User  |
| `POST /api/notifications/send-enquiry-alert`     | New assignment | default  | User  |
| `POST /api/notifications/broadcast`              | All users      | default  | Admin |

### 3.4 Sound Configuration in Payload

**Backend specifies**:

```javascript
const message = {
    to: pushToken,
    sound: "default", // ← Always "default" in backend
    ...notification,
};
```

**Actual sound selection** happens on Android via channel configuration (separate from payload)

### 3.5 Retry Logic

**Current Status**: ❌ NOT IMPLEMENTED

**Code for broadcast** ([server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js#L210)):

```javascript
const results = await Promise.allSettled(
    pushTokens.map((token) =>
        sendExpoNotification(token, { title, body, data }),
    ),
);
const successful = results.filter((r) => r.status === "fulfilled").length;
const failed = results.filter((r) => r.status === "rejected").length;
```

**What happens if send fails**: Exception thrown, not retried. Failed notifications are silently lost.

**Recommendation**: Implement exponential backoff + Redis queue for failed tokens

---

## 4. ANDROID NOTIFICATION CHANNELS

### 4.1 Channel Configuration

**Defined in** [src/services/notificationService.js](src/services/notificationService.js#L50):

```javascript
const CHANNEL_IDS = {
    default: "default_v4",
    followups: "followups_v4",
    followups_soon_en: "followups_soon_en_v2",
    followups_due_en: "followups_due_en_v2",
    followups_missed_en: "followups_missed_en_v2",
    followups_soon_ta: "followups_soon_ta_v2",
    followups_due_ta: "followups_due_ta_v2",
    followups_missed_ta: "followups_missed_ta_v2",
    enquiries: "enquiries_v4",
    coupons: "coupons_v4",
    team_chat: "team_chat_v1",
    billing: "billing_v4",
    reports: "reports_v1",
};
```

**Channel Metadata** [src/services/notificationService.js](src/services/notificationService.js#L100):

```javascript
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
    // ... Tamil variants (_ta)
};
```

### 4.2 Channel Creation (Initialization)

**When**: Called during app startup when user is logged in
**Location**: [src/services/notificationService.js](src/services/notificationService.js#L750)

```javascript
// Main follow-up channel
await Notifications.setNotificationChannelAsync(CHANNEL_IDS.followups, {
    name: "Follow-ups",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0EA5E9",
    sound: "default",
    enableVibrate: true,
    enableLights: true,
    bypassDnd: true
})

// Voice channels with custom sounds
for (const key of ["followups_soon_en", "followups_due_en", "followups_missed_en", ...]) {
    const meta = NOTIFICATION_CHANNELS[key]
    const id = CHANNEL_IDS[key]
    await Notifications.setNotificationChannelAsync(id, {
        name: meta.name,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: meta.vibrationPattern,
        lightColor: meta.lightColor,
        sound: meta.sound || "default",  // e.g., "followup_soon_en.mp3"
        enableVibrate: true,
        enableLights: true,
        bypassDnd: true  // Bypass Do Not Disturb
    })
}
```

### 4.3 Sound File Configuration

**Files registered in** [app.config.js](app.config.js#L74):

```javascript
plugins = upsertPlugin(plugins, "expo-notifications", {
    mode: iosNotificationsMode, // "production" or "development"
    sounds: [
        "./assets/notification_sounds/followup_soon_en.mp3",
        "./assets/notification_sounds/followup_due_en.mp3",
        "./assets/notification_sounds/followup_missed_en.mp3",
        "./assets/notification_sounds/followup_soon_ta.mp3",
        "./assets/notification_sounds/followup_due_ta.mp3",
        "./assets/notification_sounds/followup_missed_ta.mp3",
    ],
});
```

**How it works**:

1. Expo plugin copies sounds into Android `res/raw/` directory
2. Sounds are bundled in the APK
3. Channels reference sounds by filename (e.g., "followup_soon_en.mp3")
4. When notification arrives on that channel, Android plays the sound

### 4.4 Closed App Sound Playback

**When app is CLOSED**:

- Android reads channel ID from notification payload
- Plays sound defined in that channel
- Uses LED light and vibration from channel config
- **Sound plays automatically** without app running

**When app is OPEN**:

- Foreground handler can play custom audio
- See: [playAudioForNotificationData()](#audio-playback)

### 4.5 Default Sound Configuration

- Type: MP3 format
- Max size: ~100KB (typical)
- Codec: MP3 (44.1kHz)
- Location in app: Bundled with APK in `res/raw/`

---

## 5. iOS APNs SETUP

### 5.1 APNs Notification Modes

**Configuration** [app.config.js](app.config.js#L10):

```javascript
const easBuildProfile = String(process.env.EAS_BUILD_PROFILE || "").toLowerCase()
const iosNotificationsMode = easBuildProfile === "production" ? "production" : "development"

plugins = upsertPlugin(plugins, "expo-notifications", {
    mode: iosNotificationsMode,  // ← Determines APNs environment
    sounds: [...]
})
```

**Two APNs Environments**:
| Environment | Cert Type | EAS Profile | Apple Server |
|-------------|-----------|-------------|--------------|
| `development` | Development | `preview`, `development` | api.sandbox.push.apple.com:2197 |
| `production` | Production | `production` | api.push.apple.com:2443 |

### 5.2 Certificate Management

**Handled by**: Expo EAS Build

- Users upload APNs certificates to Apple Developer Portal
- Expo stores credentials securely
- Certificates sent automatically when building

**Verification**: Checked when `eas build -p ios` runs

### 5.3 Sound File Configuration for iOS

**Same as Android** [app.config.js](app.config.js#L74):

```javascript
sounds: [
    "./assets/notification_sounds/followup_soon_en.mp3",
    ...
]
```

**What happens**:

1. During build, Expo copies files into Xcode project
2. Bundled into app resources
3. iOS loads sounds from app bundle
4. Channels reference by filename

### 5.4 iOS Permissions

**Requested via**: [src/services/notificationService.js](src/services/notificationService.js#L715)

```javascript
const { status } = await Notifications.requestPermissionsAsync();
```

**iOS Dialog**: "Allow 'NeoApp' to send you notifications?"

- User must grant to receive notifications
- Can be revoked in Settings → Notifications

---

## 6. CLOSED APP HANDLING - COMPLETE FLOW

### 6.1 App Cold Start After Notification

**Sequence:**

```mermaid
1. [Device receives push notification]
   ↓
2. APNs/FCM receives from Expo API
   ↓
3. [App is CLOSED] → System shows native notification
   ├─ Android: Notification bar in status bar
   └─ iOS: Banner or Alert
   ↓
4. [User taps notification]
   ↓
5. [System launches app]
   ↓
6. App.js → AuthProvider → AuthContext
   ├─ Check stored auth token
   └─ If valid, restore user session
   ↓
7. AppNavigator → Initialize notifications
   ├─ initializeNotifications()
   ├─ Setup listeners
   └─ Schedule reminders
   ↓
8. setupGlobalNotificationListener fires
   ├─ Gets notification data
   ├─ Routes based on type
   └─ Navigates to relevant screen
```

### 6.2 Notification Listeners Setup

**Location**: [src/services/notificationService.js](src/services/notificationService.js#L1356)

**When app opens (after being closed):**

```javascript
// Handler for notification response (tapped)
export const setupNotificationListener = (callback) => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
            const { notification, actionIdentifier } = response;
            const data = notification.request.content.data;
            console.log("Notification tapped:", data);
            if (callback) callback(data);
        },
    );
    return subscription;
};

// Handler for foreground notifications (app open)
export const setupForegroundNotificationListener = (callback) => {
    const subscription = Notifications.addNotificationReceivedListener(
        (notification) => {
            console.log(
                "Notification received (foreground):",
                notification.request.content.data,
            );
            if (callback) callback(notification.request.content.data);
        },
    );
    return subscription;
};
```

### 6.3 Global Navigation Handler

**Location**: [src/services/notificationService.js](src/services/notificationService.js#L2389)

```javascript
export const setupGlobalNotificationListener = (navigationRef) => {
    return Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const actionId = response.actionIdentifier;

        console.log("Global notification tapped:", data);

        if (navigationRef.isReady()) {
            // Route based on notification type
            if (data.followUpCount || data.type === "followup-reminder") {
                navigationRef.navigate("FollowUp");
            } else if (data.type === "new-enquiry") {
                navigationRef.navigate("Enquiry");
            } else if (data.type === "team-chat-message") {
                navigationRef.navigate("Communication");
            } else if (data.type === "enquiry-status") {
                navigationRef.navigate("EnquiryList");
            }

            // Speak notification content if in foreground
            if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
                Promise.resolve(speakForNotificationData(data)).catch(() => {});
            }
        }
    });
};
```

### 6.4 App State Monitoring for Reminders

**Location**: [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L600)

```javascript
// Syncs hourly follow-up reminders when app comes to foreground
const appStateSub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
        // App entered foreground - resync notifications
        syncHourlyFollowUps();
    } else if (state === "background" || state === "inactive") {
        // App going to background
        notificationService.resetAudioModeOnAppBackground?.();
    }
});
```

### 6.5 Boot Completion Permission

**For Android cold start after device reboot:**

[app.config.js](app.config.js#L31):

```javascript
const safeAndroidPermissions = [
    "CALL_PHONE",
    "POST_NOTIFICATIONS",
    "VIBRATE",
    "RECEIVE_BOOT_COMPLETED", // ← Receive boot events
    "SCHEDULE_EXACT_ALARM",
    "USE_EXACT_ALARM",
];
```

**What this enables**:

- App can wake up after device reboot
- Can reschedule notifications or sync data

**⚠️ Note**: Expo doesn't provide built-in boot handler for React Native. Notifications rely on system rescheduling, not app-level handling.

### 6.6 Initial Setup When App Starts

**Location**: [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L300)

```javascript
useEffect(() => {
    if (!isLoggedIn || !user) return

    // 1. Initialize notification service
    if (!notificationsInitRef.current) {
        await notificationService.initializeNotifications()
        notificationsInitRef.current = true
    }

    // 2. Fetch today's follow-ups
    const todayRes = await followupService.getFollowUps("Today", 1, 200, todayIso)
    const missedRes = await followupService.getFollowUps("Missed", 1, 200, todayIso)
    const allRes = await followupService.getFollowUps("All", 1, 500, "", { dateFrom, dateTo })

    // 3. Schedule hourly reminders
    await notificationService.scheduleHourlyFollowUpRemindersForToday(todayList, {...})
    await notificationService.scheduleTimeFollowUpRemindersForToday(allList, {...})

    // 4. Notify about missed items
    await notificationService.notifyMissedFollowUpsSummary(missedList)

    // 5. Resync every 60 seconds
    const periodicSync = setInterval(() => syncHourlyFollowUps(), 60 * 1000)

    return () => clearInterval(periodicSync)
}, [isLoggedIn, user])
```

---

## 7. DEEP LINKING CONFIGURATION

### 7.1 Scheme Setup

**File**: [app.json](app.json#L7)

```json
{
    "scheme": "myapp"
}
```

**Deep link format**: `myapp://followup/123`

### 7.2 Navigation Container Setup

**Location**: [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L1000+)

The NavigationContainer handles deep links but the linking configuration is not fully visible in the provided code. Typically implemented as:

```javascript
<NavigationContainer
    ref={navigationRef}
    theme={APP_NAV_THEME}
    linking={{
        prefixes: ["myapp://"],
        config: {
            screens: {
                FollowUp: "followup/:id",
                Enquiry: "enquiry/:id",
                Communication: "chat/:threadId",
            },
        },
    }}>
    {/* stack/tab navigator */}
</NavigationContainer>
```

### 7.3 Integration with Notifications

**In notification data**:

```javascript
{
    type: "enquiry-status",
    enquiryId: "123456",
    followUpCount: 1
}
```

**Router uses**: `data.enquiryId` to construct deep link

---

## 8. BACKGROUND TASK SCHEDULING

### 8.1 Node-Cron for Backend Reminders

**Location**: [server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js#L426)

```javascript
const cron = require("node-cron");

// Run daily reminder at 9:00 AM
cron.schedule("0 9 * * *", async () => {
    try {
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
            body: `You have ${todayFollowUps.length} follow-ups today!`,
            data: {
                followUpCount: todayFollowUps.length,
                type: "daily-reminder",
            },
        });
    }
}
```

### 8.2 Client-Side Scheduling

**Location**: [src/services/notificationService.js](src/services/notificationService.js#L1255)

```javascript
// Schedule daily notification at specific time
export const scheduleDailyNotification = (hour = 9, minute = 0) => {
    try {
        const trigger = buildDailyTrigger(hour, minute);

        Notifications.scheduleNotificationAsync({
            content: {
                title: "⏰ Daily Follow-up Reminder",
                body: "Check your follow-ups for today",
                data: { type: "daily-reminder" },
                sound: "default",
                android: { channelId: "followups" },
            },
            trigger,
        });
    } catch (error) {
        console.error("Failed to schedule daily notification:", error);
    }
};
```

### 8.3 Hourly Follow-up Reminders

Scheduled dynamically based on:

- Follow-ups due within next 60 minutes
- Reminders every 5 minutes
- Missed items checked every 30 minutes (up to 12 hours)

---

## 9. AUDIO & VOICE CONFIGURATION

### 9.1 Audio Files

**Location**: `src/assets/Audio/Phone/English/` and `Tamil/`

- `ENotAuth.mp3`, `ESoon.mp3`, `EDue.mp3`, `EMissed.mp3`
- Tamil variants: `TNot...`, `TSoon...`, etc.

### 9.2 Audio Playback When App in Foreground

**Location**: [src/services/notificationService.js](src/services/notificationService.js#L530)

```javascript
export const playAudioForNotificationData = async (data = {}) => {
    const type = String(data?.type || "").toLowerCase();
    const lang = await getNotificationVoiceLanguage();

    let audioPlayed = false;
    const entry = lang === "ta" ? tamilAudioMap : englishAudioMap;

    if (type === "followup-soon") {
        audioPlayed = await playAudioModule(entry.soon);
    } else if (type === "followup-due") {
        audioPlayed = await playAudioModule(entry.due);
    } else if (type === "followup-missed") {
        audioPlayed = await playAudioModule(entry.missed);
    }

    // Fallback to text-to-speech if audio failed
    if (!audioPlayed) {
        const ttsText = buildTextToSpeechForNotification(data, lang);
        if (ttsText) await safeSpeak(ttsText);
    }

    return audioPlayed;
};
```

### 9.3 Text-to-Speech Fallback

```javascript
const buildTextToSpeechForNotification = (data = {}, lang = "en") => {
    const type = String(data?.type || "").toLowerCase();
    const minutesLeft = Math.round(Number(data?.minutesLeft || 0));

    if (lang === "ta") {
        if (type === "followup-soon") {
            return `${minutesLeft} நிமிடத்தில் ${data?.activityType}`;
        }
    } else {
        if (type === "followup-soon") {
            return `${minutesLeft} minute alert for ${data?.activityType}`;
        }
    }
};

const safeSpeak = async (text) => {
    if (!text || Platform.OS === "web") return;
    const lang = await getNotificationVoiceLanguage();
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) await Speech.stop();
    Speech.speak(String(text), {
        language: lang === "ta" ? "ta-IN" : "en-IN",
        rate: 0.95,
    });
};
```

### 9.4 Audio Mode Reset on Background

**Called when**: App moves to background

```javascript
notificationService.resetAudioModeOnAppBackground?.();
```

**Purpose**: Resets audio session so alerts work properly on next foreground

---

## 10. CRITICAL ISSUES & GAPS

| #   | Issue                                         | File                                                                       | Line | Impact                                            | Severity    |
| --- | --------------------------------------------- | -------------------------------------------------------------------------- | ---- | ------------------------------------------------- | ----------- |
| 1   | `pushToken` field missing from User.js schema | [server/models/User.js](server/models/User.js)                             | -    | Tokens may not persist                            | ⚠️ HIGH     |
| 2   | No retry logic for failed sends               | [server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js)         | 240  | Notifications silently lost                       | ❌ CRITICAL |
| 3   | No token validation/testing                   | All                                                                        | -    | Stale tokens accumulate                           | ⚠️ MEDIUM   |
| 4   | No automatic token refresh                    | [src/services/notificationService.js](src/services/notificationService.js) | -    | Dead tokens never removed                         | ⚠️ MEDIUM   |
| 5   | Audio only plays in foreground                | [src/services/notificationService.js](src/services/notificationService.js) | 530  | Sound always from channel when closed             | ℹ️ DESIGN   |
| 6   | No boot handler after reboot                  | All                                                                        | -    | Notifications may not reschedule                  | ⚠️ MEDIUM   |
| 7   | Deep link routing incomplete                  | [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx)         | -    | Some notification types may not navigate properly | ⚠️ MEDIUM   |
| 8   | Firebase initialized but unused               | [server/config/firebaseAdmin.js](server/config/firebaseAdmin.js)           | -    | Wasted resources, unclear architecture            | ℹ️ NOTE     |

---

## 11. DIAGRAM: Complete Closed App Flow

```
╔═════════════════════════════════════════════════════════════════════════╗
║                    CLOSED APP NOTIFICATION FLOW                         ║
╠═════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  [TRIGGER]                                                             ║
║     ↓                                                                   ║
║  ┌─ App sends push token to backend:                                   ║
║  │  POST /api/auth/register-push-token                                 ║
║  │  { pushToken: "ExponentPushToken[xxx]" }                           ║
║  │                                                                     ║
║  └─ Backend stores in User.pushToken                                    ║
║     ↓                                                                   ║
║  [SEND PHASE]                                                          ║
║     ↓                                                                   ║
║  ┌─ Backend sends notification:                                        ║
║  │  POST https://exp.host/--/api/v2/push/send                         ║
║  │  {                                                                  ║
║  │    to: "ExponentPushToken[xxx]",                                   ║
║  │    title: "📋 Today's Follow-ups",                                 ║
║  │    sound: "default",                                               ║
║  │    priority: "default",                                            ║
║  │    data: { type: "followup-reminder", ... }                       ║
║  │  }                                                                  ║
║  │                                                                     ║
║  └─ Expo forwards to APNs (iOS) or FCM (Android)                       ║
║     ↓                                                                   ║
║  [DELIVERY PHASE]                                                      ║
║     ↓                                                                   ║
║  ┌─ Device receives                                                    ║
║  │  └─ [APP CLOSED]                                                   ║
║  │     ├─ Android: Notification bar shows                             ║
║  │     │  ├─ Uses channel ID (e.g., "followups_v4")                  ║
║  │     │  ├─ Plays sound from channel config                         ║
║  │     │  ├─ Vibrates (channel pattern)                              ║
║  │     │  └─ Shows LED light (channel color)                         ║
║  │     │                                                              ║
║  │     └─ iOS: Notification badge/banner shown                        ║
║  │        ├─ Plays APNs sound (bundled file)                         ║
║  │        └─ May vibrate (device settings)                           ║
║  │                                                                     ║
║  └─ User sees notification in status bar / lock screen                 ║
║     ↓                                                                   ║
║  [TAP NOTIFICATION]                                                    ║
║     ↓                                                                   ║
║  ┌─ System launches app                                                ║
║  │     ├─ App.js → AuthProvider → RestoreUserSession                  ║
║  │     ├─ AppNavigator → LoadingScreen (checks auth)                  ║
║  │     └─ InitializeNotifications() called                            ║
║  │                                                                     ║
║  └─ `setupGlobalNotificationListener()` fires                          ║
║     ├─ Retrieved notification data: { type: "followup-reminder", ... }│
║     ├─ Router checks `data.type`                                      ║
║     └─ Navigates to appropriate screen (FollowUp, Enquiry, etc.)     ║
║        ↓                                                               ║
║        └─ [USER ROUTED TO RELEVANT SCREEN]                           ║
║                                                                         ║
╚═════════════════════════════════════════════════════════════════════════╝
```

---

## 12. TESTING ENDPOINTS

### Push Token Registration

```bash
POST http://localhost:5000/api/auth/register-push-token
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "pushToken": "ExponentPushToken[abc123def456...]"
}
```

### Send Follow-up Reminder

```bash
POST http://localhost:5000/api/notifications/send-followup-reminder
Authorization: Bearer <jwt_token>
Content-Type: application/json

{}
```

### Send Urgent Reminder

```bash
POST http://localhost:5000/api/notifications/send-urgent-reminder
Authorization: Bearer <jwt_token>
Content-Type: application/json

{}
```

### Broadcast to All

```bash
POST http://localhost:5000/api/notifications/broadcast
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "title": "📢 Test Broadcast",
  "body": "Testing notification system",
  "data": {
    "type": "broadcast",
    "version": "1.0"
  }
}
```

---

## 13. QUICK REFERENCE: Key Files

| Purpose                    | File                                                                       | Line Range |
| -------------------------- | -------------------------------------------------------------------------- | ---------- |
| Firebase Admin Config      | [server/config/firebaseAdmin.js](server/config/firebaseAdmin.js)           | 1-30       |
| Push Token Registration    | [server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js)         | 1-40       |
| Send Notification          | [server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js)         | 240-270    |
| Cron for Daily Reminders   | [server/BACKEND_NOTIFICATIONS.js](server/BACKEND_NOTIFICATIONS.js)         | 426-465    |
| Android Channel Setup      | [src/services/notificationService.js](src/services/notificationService.js) | 750-850    |
| Get Push Token             | [src/services/notificationService.js](src/services/notificationService.js) | 1319-1350  |
| Initialize Notifications   | [src/services/notificationService.js](src/services/notificationService.js) | 905        |
| Global Notification Router | [src/services/notificationService.js](src/services/notificationService.js) | 2389+      |
| App Notification Setup     | [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx)         | 300-450    |
| Notification Mode Config   | [app.config.js](app.config.js)                                             | 10-90      |
| Sound Registration         | [app.config.js](app.config.js)                                             | 74-85      |

---

## 14. SUMMARY TABLE: Closed App Notification Journey

| Stage                | Technology             | Status | Notes                         |
| -------------------- | ---------------------- | ------ | ----------------------------- |
| **Registration**     | Expo Push Token API    | ✓      | ExponentPushToken[...] format |
| **Storage**          | MongoDB User.pushToken | ⚠️     | Field missing from schema     |
| **Sending**          | Expo API (exp.host)    | ✓      | NOT Firebase                  |
| **Android Delivery** | Notification channels  | ✓      | Custom sounds per channel     |
| **iOS Delivery**     | APNs                   | ✓      | Expo-managed certificates     |
| **Closed App Sound** | Native channel config  | ✓      | Auto-plays from channel       |
| **Opening App**      | Navigation deep link   | ⚠️     | Routing incomplete            |
| **User Navigation**  | React Navigation       | ✓      | Routes to relevant screen     |
| **Daily Scheduling** | Node-cron + on-device  | ✓      | 9 AM backend + hourly client  |
| **Retry Logic**      | None                   | ❌     | MISSING - critical gap        |

---

**Generated**: March 31, 2026 | **Analysis Depth**: Thorough exploration of all 6 areas requested
