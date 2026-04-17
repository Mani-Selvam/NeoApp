# Background Notification Delivery System - Complete Analysis

## Overview

NeoApp uses Expo's notification system with React Native for cross-platform push/local notifications, featuring multi-language voice notifications, custom notification channels, and sophisticated background scheduling.

---

## 1. BACKGROUND NOTIFICATION CONFIGURATION

### 1.1 Notification Plugin Setup

**File:** [app.config.js](app.config.js#L32-L46)

```javascript
// Custom notification sounds (needed for background/killed sound on Android/iOS)
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

### 1.2 Notification Handler Configuration

**File:** [src/services/notificationService.js](src/services/notificationService.js#L640-L649)

```javascript
// Configure notification behavior (only on supported platforms)
if (isNotificationSupported()) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}
```

**Behavior:**

- Shows alert, banner, and notification list when app is backgrounded
- Automatically plays notification sound
- Sets badge count

### 1.3 Notification Channels (Android)

**File:** [src/services/notificationService.js](src/services/notificationService.js#L37-L61)

```javascript
const CHANNEL_IDS = {
    default: "default_v4",
    followups: "followups_v4",
    // NOTE: Channel sound cannot be changed after creation - bump suffix when changing audio
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

### 1.4 Channel Configuration Details

**File:** [src/services/notificationService.js](src/services/notificationService.js#L63-L125)

```javascript
const NOTIFICATION_CHANNELS = {
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
    // + Tamil versions with keys ending in _ta
    enquiries: {
        name: "Enquiries",
        lightColor: "#16A34A",
        vibrationPattern: [0, 180, 140, 180],
    },
    billing: {
        name: "Plan Alerts",
        lightColor: "#F59E0B",
        vibrationPattern: [0, 220, 160, 220],
    },
    // ... other channels
};
```

### 1.5 Channel Initialization

**File:** [src/services/notificationService.js](src/services/notificationService.js#L790-L900)

```javascript
// Android: Set notification channel
if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_IDS.default, {
        name: "default",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        sound: "default",
        enableVibrate: true,
        enableLights: true,
    });

    // Follow-up voice channels (custom sounds)
    for (const key of [
        "followups_soon_en",
        "followups_due_en",
        "followups_missed_en",
        "followups_soon_ta",
        "followups_due_ta",
        "followups_missed_ta",
    ]) {
        const meta = NOTIFICATION_CHANNELS[key];
        const id = CHANNEL_IDS[key];
        if (!meta || !id) continue;
        await Notifications.setNotificationChannelAsync(id, {
            name: meta.name,
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: meta.vibrationPattern,
            lightColor: meta.lightColor,
            sound: meta.sound || "default",
            enableVibrate: true,
            enableLights: true,
        });
    }
}
```

---

## 2. VOICE NOTIFICATION SETTINGS

### 2.1 Voice Language Configuration

**File:** [src/services/notificationService.js](src/services/notificationService.js#L278-L296)

```javascript
const NOTIFICATION_VOICE_LANG_KEY = "notificationVoiceLang"; // "en" | "ta"

let cachedVoiceLang = null;
export const getNotificationVoiceLanguage = async () => {
    if (cachedVoiceLang) return cachedVoiceLang;
    try {
        const raw = await AsyncStorage.getItem(NOTIFICATION_VOICE_LANG_KEY);
        const value = String(raw || "")
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
        String(lang || "")
            .trim()
            .toLowerCase() === "ta"
            ? "ta"
            : "en";
    cachedVoiceLang = value;
    try {
        await AsyncStorage.setItem(NOTIFICATION_VOICE_LANG_KEY, value);
    } catch {
        // ignore
    }
    return value;
};
```

### 2.2 Audio Mode Setup (Background Playback)

**File:** [src/services/notificationService.js](src/services/notificationService.js#L307-L320)

```javascript
const ensureAudioMode = async () => {
    if (audioModeReady) return;
    audioModeReady = true;
    try {
        await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true, // Play through silent switch on iOS
            staysActiveInBackground: false, // Don't interfere with other apps
            shouldDuckAndroid: true, // Lower other audio when notification plays
            playThroughEarpieceAndroid: false, // Use speaker
        });
    } catch {
        // ignore audio mode issues
    }
};
```

**Key Settings:**

- **iOS:** Plays notifications even in silent mode
- **Android:** Ducks (lowers) other audio, uses speaker not earpiece
- **Background:** Doesn't keep radio active after notification

### 2.3 Audio Modules Library

**File:** [src/services/notificationService.js](src/services/notificationService.js#L337-L420)

```javascript
const AUDIO_MODULES = {
    en: {
        phone: {
            5: require("../assets/Audio/Phone/English/5Pmin.mp3"),
            4: require("../assets/Audio/Phone/English/4Pmin.mp3"),
            3: require("../assets/Audio/Phone/English/3Pmin.mp3"),
            2: require("../assets/Audio/Phone/English/2Pmin.mp3"),
            1: require("../assets/Audio/Phone/English/1Pmin.mp3"),
            due: require("../assets/Audio/Phone/English/Pdue.mp3"),
            missed: require("../assets/Audio/Phone/English/PMissed.mp3"),
        },
        whatsapp: {
            /* 5,4,3,2,1,due,missed */
        },
        email: {
            /* 5,4,3,2,1,due,missed */
        },
        meeting: {
            /* 5,4,3,2,1,due,missed */
        },
    },
    ta: {
        phone: {
            /* Tamil versions */
        },
        whatsapp: {
            /* Tamil versions */
        },
        email: {
            /* Tamil versions */
        },
        meeting: {
            /* Tamil versions */
        },
    },
};
```

**Audio Types by Activity:**

- Phone Call - "5/4/3/2/1 minute warning", "due", "missed"
- WhatsApp - "5/4/3/2/1 minute warning", "due", "missed"
- Email - "5/4/3/2/1 minute warning", "due", "missed"
- Meeting - "5/4/3/2/1 minute warning", "due", "missed"

### 2.4 Audio Playback with Retry

**File:** [src/services/notificationService.js](src/services/notificationService.js#L422-L482)

```javascript
const playAudioModule = async (moduleRef, retries = 2) => {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            if (!moduleRef || Platform.OS === "web") return false;
            await ensureAudioMode();
            await stopActiveFollowupSound();
            const { sound } = await Audio.Sound.createAsync(moduleRef, {
                shouldPlay: true,
            });
            activeFollowupSound = sound;
            sound.setOnPlaybackStatusUpdate((status) => {
                if (!status || !status.isLoaded) return;
                if (status.didJustFinish) {
                    sound.unloadAsync().catch(() => {});
                    if (activeFollowupSound === sound)
                        activeFollowupSound = null;
                }
            });
            console.log(
                `[NotifSvc] ✓ Audio playback started (attempt ${attempt + 1})`,
            );
            return true;
        } catch (error) {
            lastError = error;
            console.warn(
                `[NotifSvc] ✗ Audio playback failed (attempt ${attempt + 1}/${retries + 1}):`,
                error.message,
            );
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
    }
    return false;
};
```

**Fallback Strategy:** If audio playback fails, falls back to Text-to-Speech (TTS)

### 2.5 Text-to-Speech (TTS) Fallback

**File:** [src/services/notificationService.js](src/services/notificationService.js#L298-L305)

```javascript
const safeSpeak = async (text) => {
    try {
        if (!text || Platform.OS === "web") return;
        const lang = await getNotificationVoiceLanguage();
        const isSpeaking = await Speech.isSpeakingAsync();
        if (isSpeaking) {
            await Speech.stop();
        }
        Speech.speak(String(text), {
            language: lang === "ta" ? "ta-IN" : "en-IN", // Tamil or English India
            rate: 0.95,
            pitch: 1.0,
        });
    } catch (_error) {
        // ignore voice issues
    }
};
```

### 2.6 Voice Notification for Different Types

**File:** [src/services/notificationService.js](src/services/notificationService.js#L1318-L1520)

```javascript
// Examples from speakForNotificationData function:

// "SOON" warnings (Tamil example)
if (type === "followup-soon") {
    const line =
        minutesLeft === 1
            ? "வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் 1 நிமிடத்தில் அழைக்கவும்."
            : `வாடிக்கையாளர் காத்திருக்கிறார். இன்னும் ${minutesLeft} நிமிடங்களில் அழைக்கவும்.`;
    await safeSpeak(line);
}

// "DUE" notifications
if (type === "followup-due") {
    if (lang === "ta") {
        if (t === "phone call") {
            await safeSpeak(
                "வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.",
            );
        } else if (t === "whatsapp") {
            await safeSpeak("இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம்...");
        }
    }
}

// "MISSED" notifications
if (type === "followup-missed") {
    if (lang === "ta") {
        await safeSpeak(
            "நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார்...",
        );
    }
}
```

---

## 3. APP LIFECYCLE & NOTIFICATION LISTENERS

### 3.1 Notification Listener Setup (Global Handler)

**File:** [src/services/notificationService.js](src/services/notificationService.js#L2330-L2418)

```javascript
export const setupGlobalNotificationListener = (navigationRef) => {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    const actionId = response.actionIdentifier;
    console.log("Global notification tapped:", data);

    // Handle FOLLOWUP_COMPLETE action
    if (actionId === "FOLLOWUP_COMPLETE") {
      Promise.resolve(completeFollowUpFromNotification(data)).catch(() => {});
      Promise.resolve(
        cancelNotificationsForEnquiry?.({
          enqId: data?.enqId,
          enqNo: data?.enqNo,
        }),
      ).catch(() => {});
    }

    // Navigate to follow-up screen with pre-filled data
    if (navigationRef.isReady()) {
      navigationRef.navigate("Main", {
        screen: "FollowUp",
        params: {
          openComposer: true,
          enquiry: { enqId: data?.enqId, name: data?.name, ... },
          focusTab: "Today",
        },
      });
    }
  });
};
```

### 3.2 Foreground Notification Listener

**File:** [src/services/notificationService.js](src/services/notificationService.js#L1309-L1327)

```javascript
// Setup notification received listener (for when app is in foreground)
export const setupForegroundNotificationListener = (callback) => {
    if (!isNotificationSupported()) {
        return { remove: () => {} }; // Return dummy subscription
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
```

### 3.3 App Lifecycle Integration (Background Sync)

**File:** [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L547-L646)

```typescript
// Initialize local notifications + schedule hourly follow-up reminders
useEffect(() => {
    if (!isLoggedIn || !user) return undefined;

    let disposed = false;

    const syncHourlyFollowUps = async () => {
        if (disposed) return;
        if (hourlySyncRef.current) {
            hourlySyncPendingRef.current = true;
            return;
        }
        hourlySyncRef.current = true;
        try {
            if (!notificationsInitRef.current) {
                await notificationService.initializeNotifications();
                notificationsInitRef.current = true;
            }

            // Fetch today, missed, and future follow-ups
            const todayIso = new Date().toISOString().slice(0, 10);
            const [todayRes, missedRes, allRes]: any = await Promise.all([
                followupService
                    .getFollowUps("Today", 1, 200, todayIso)
                    .catch(() => null),
                followupService
                    .getFollowUps("Missed", 1, 200, todayIso)
                    .catch(() => null),
                followupService
                    .getFollowUps("All", 1, 500, "", { dateFrom, dateTo })
                    .catch(() => null),
            ]);

            // Schedule hourly reminders (every hour until 9 PM)
            await notificationService.scheduleHourlyFollowUpRemindersForToday(
                todayList,
                { endHour: 21, channelId: "followups" },
            );

            // Schedule time-based reminders (for specific times)
            await notificationService.scheduleTimeFollowUpRemindersForToday?.(
                allList,
                {
                    channelId: "followups",
                    preRemindMinutes: 60,
                    preRemindEveryMinutes: 5,
                    missedFastMinutes: 60,
                    missedFastEveryMinutes: 5,
                    missedHourlyEveryMinutes: 30,
                    missedHourlyMaxHours: 12,
                    endHour: 21,
                    windowDays: 7,
                    missedLookbackDays: 2,
                    dueRepeatForMinutes: 0,
                },
            );
        } catch (e) {
            console.warn("[Notifications] Hourly follow-up sync failed", e);
        } finally {
            hourlySyncRef.current = false;
        }
    };

    syncHourlyFollowUps();

    // App state listener - resync when app comes to foreground
    const appStateSub = AppState.addEventListener("change", (state) => {
        if (state === "active") syncHourlyFollowUps(); // Resync on foreground
    });

    // Periodic resync every 60 seconds
    const periodicSync = setInterval(() => {
        syncHourlyFollowUps();
    }, 60 * 1000);

    return () => {
        disposed = true;
        appStateSub?.remove?.();
        clearInterval(periodicSync);
    };
}, [isLoggedIn, user]);
```

### 3.4 Setup Global Notification Listener in Navigator

**File:** [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L680-L690)

```typescript
// Setup global notification listener
useEffect(() => {
    const subscription =
        notificationService.setupGlobalNotificationListener(navigationRef);
    return () => {
        subscription && subscription.remove();
    };
}, []);
```

### 3.5 Speak Voice in Foreground

**File:** [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L692-L703)

```typescript
// Speak follow-up reminders while app is in foreground
useEffect(() => {
    const sub = notificationService.setupForegroundNotificationListener?.(
        (data: any) => {
            notificationService.speakForNotificationData?.(data); // Speak via TTS
        },
    );
    return () => {
        sub?.remove?.();
    };
}, []);
```

### 3.6 Device Event Listeners

**File:** [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L646-L676)

```typescript
const callLogSub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", () => {
    Promise.resolve(
        notificationService.acknowledgeHourlyFollowUpReminders?.(),
    ).catch(() => {});
});

const followUpChangedSub = DeviceEventEmitter.addListener(
    "FOLLOWUP_CHANGED",
    (payload) => {
        const item = payload?.item || payload || {};
        const status = String(item?.status || "").toLowerCase();

        if (status === "scheduled") {
            Promise.resolve(
                notificationService.cancelNextFollowUpPromptForEnquiry?.({
                    enqId: item?.enqId,
                    enqNo: item?.enqNo,
                }),
            ).catch(() => {});
        }

        // Reschedule with 500ms delay to allow server to process
        setTimeout(() => {
            Promise.resolve(syncHourlyFollowUps()).catch((err) => {
                console.warn(
                    "[AppNav] Failed to sync after follow-up change:",
                    err,
                );
            });
        }, 500);
    },
);
```

---

## 4. PERMISSIONS CONFIGURATION

### 4.1 Android Permissions (app.config.js)

**File:** [app.config.js](app.config.js#L50-L99)

```javascript
// Safe permissions for Play Store (notification-critical)
const safeAndroidPermissions = [
    "CALL_PHONE",
    "POST_NOTIFICATIONS", // Required for Android 13+
    "VIBRATE",
    "RECEIVE_BOOT_COMPLETED", // Auto-start notifications after reboot
    "SCHEDULE_EXACT_ALARM", // Improve timing for scheduled notifications
    "USE_EXACT_ALARM",
];

// Optional call log permissions (when not in Play Store safe mode)
const callLogAndroidPermissions = [
    "READ_CALL_LOG",
    "READ_PHONE_STATE",
    "READ_CONTACTS",
    "READ_PHONE_NUMBERS",
    "PROCESS_OUTGOING_CALLS",
    "ANSWER_PHONE_CALLS",
];

// Permissions to block on Play Store
const blockedAndroidPermissions = playStoreSafeMode
    ? [
          "android.permission.READ_CALL_LOG",
          "android.permission.READ_PHONE_STATE",
          "android.permission.PROCESS_OUTGOING_CALLS",
          "android.permission.ANSWER_PHONE_CALLS",
          "android.permission.READ_PHONE_NUMBERS",
          "android.permission.READ_CONTACTS",
          "android.permission.RECORD_AUDIO",
      ]
    : [];

return {
    android: {
        permissions: playStoreSafeMode
            ? safeAndroidPermissions
            : [...safeAndroidPermissions, ...callLogAndroidPermissions],
        blockedPermissions: [
            ...(config.android?.blockedPermissions || []),
            ...blockedAndroidPermissions,
        ],
    },
};
```

### 4.2 app.json Android Permissions

**File:** [app.json](app.json#L23-L39)

```json
"android": {
  "package": "com.mycompany.myapp",
  "versionCode": 2,
  "googleServicesFile": "./google-services.json",
  "blockedPermissions": [
    "android.permission.READ_CALL_LOG",
    "android.permission.READ_PHONE_STATE",
    "android.permission.PROCESS_OUTGOING_CALLS",
    "android.permission.ANSWER_PHONE_CALLS",
    "android.permission.READ_PHONE_NUMBERS",
    "android.permission.READ_CONTACTS",
    "android.permission.RECORD_AUDIO"
  ],
  "adaptiveIcon": { ... },
  "permissions": [ "CALL_PHONE" ]
}
```

### 4.3 Built-in Plugins

**File:** [app.json](app.json#L19-L40)

```json
"plugins": [
  "expo-notifications",        // Remote & local notifications
  "expo-image-picker",
  "expo-av",                   // Audio/Video playback
  "expo-video",
  "expo-font",
  [
    "expo-build-properties",
    {
      "android": {
        "compileSdkVersion": 36,
        "targetSdkVersion": 36,
        "ndkVersion": "26.1.10909125"
      }
    }
  ]
]
```

### 4.4 Notification Permission Request

**File:** [src/services/notificationService.js](src/services/notificationService.js#L667-L715)

```javascript
export const initializeNotifications = async () => {
    try {
        // Skip notifications on web platform
        if (Platform.OS === "web") {
            console.log("Notifications not supported on web platform");
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
            try {
                const latest = await Notifications.getPermissionsAsync();
                if (
                    Platform.OS === "android" &&
                    latest?.canAskAgain === false
                ) {
                    const openSettings = await confirmPermissionRequest({
                        title: "Notifications are off",
                        message:
                            "Notifications are disabled in device settings. Open settings to enable follow-up reminders?",
                        confirmText: "Open Settings",
                    });
                    if (openSettings) {
                        await openAndroidNotificationSettings();
                    }
                }
            } catch {
                // ignore
            }
        }
        // ... rest of initialization
    } catch (error) {
        console.error("Failed to initialize notifications:", error);
        return false;
    }
};
```

### 4.5 Android Notification Settings Opener

**File:** [src/services/notificationService.js](src/services/notificationService.js#L205-L240)

```javascript
export const openAndroidNotificationSettings = async () => {
    if (Platform.OS !== "android")
        return { opened: false, skipped: true, reason: "not-android" };
    try {
        const pkg = getAndroidPackageName();
        try {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
                pkg
                    ? {
                          extra: {
                              "android.provider.extra.APP_PACKAGE": pkg,
                          },
                      }
                    : undefined,
            );
            return { opened: true };
        } catch (_err) {
            // Fallback: open app details
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
                pkg ? { data: `package:${pkg}` } : undefined,
            );
            return { opened: true, fallback: "app-details" };
        }
    } catch (error) {
        console.warn(
            "Failed to open notification settings:",
            error?.message || error,
        );
        return { opened: false, error: true };
    }
};
```

### 4.6 Exact Alarm & Battery Optimization Settings

**File:** [src/services/notificationService.js](src/services/notificationService.js#L242-L256)

```javascript
export const openAndroidExactAlarmSettings = async () => {
    if (Platform.OS !== "android")
        return { opened: false, skipped: true, reason: "not-android" };
    try {
        // Android 12+ exact alarm permission settings
        await IntentLauncher.startActivityAsync(
            "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
        );
        return { opened: true };
    } catch (error) {
        console.warn(
            "Failed to open exact alarm settings:",
            error?.message || error,
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
            error?.message || error,
        );
        return { opened: false, error: true };
    }
};
```

### 4.7 SMS Gateway Android Manifest

**File:** [sms-gateway-android/app/src/main/AndroidManifest.xml](sms-gateway-android/app/src/main/AndroidManifest.xml)

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.SEND_SMS" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

  <application
    android:allowBackup="true"
    android:label="@string/app_name"
    android:supportsRtl="true"
    android:theme="@style/Theme.SmsGateway"
    android:usesCleartextTraffic="true">

    <service
      android:name=".SmsGatewayService"
      android:enabled="true"
      android:exported="false"
      android:foregroundServiceType="dataSync" />

    <receiver
      android:name=".BootReceiver"
      android:enabled="true"
      android:exported="false">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
      </intent-filter>
    </receiver>
  </application>
</manifest>
```

---

## 5. NOTIFICATION SCHEDULING SYSTEM

### 5.1 Hourly Follow-up Reminders

**File:** [src/services/notificationService.js](src/services/notificationService.js#L1901-L1982)

```javascript
export const scheduleHourlyFollowUpRemindersForToday = async (
    followUps,
    { endHour = 21, channelId = "followups" } = {},
) => {
    try {
        if (Platform.OS === "web") return { scheduled: 0, skipped: true };

        const todayKey = getTodayKey();
        const ackDate = await AsyncStorage.getItem(
            HOURLY_FOLLOWUP_ACK_DATE_KEY,
        );
        if (ackDate === todayKey) {
            return { scheduled: 0, skipped: true, reason: "acknowledged" };
        }

        const list = Array.isArray(followUps) ? followUps : [];
        const todayFollowUps = list.filter(isActiveFollowUp).filter(isDueToday);

        if (todayFollowUps.length === 0) {
            await cancelHourlyFollowUpReminders();
            return { scheduled: 0, skipped: true, reason: "none-due" };
        }

        // Replace previous schedule to avoid duplicates
        await cancelHourlyFollowUpReminders();

        const now = new Date();
        const endAt = new Date();
        endAt.setHours(endHour, 0, 0, 0); // Stop at 9 PM
        if (now >= endAt) {
            return { scheduled: 0, skipped: true, reason: "after-hours" };
        }

        const first = new Date(now);
        first.setMinutes(0, 0, 0);
        first.setHours(first.getHours() + 1); // Start from next hour

        const ids = [];
        let cursor = new Date(first);
        let tipIndex = 0;

        // Schedule notification every hour until end hour
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
                    android: {
                        channelId: resolveChannelId(channelId),
                        color: "#0EA5E9",
                        priority: "high",
                        sticky: false,
                    },
                },
                trigger: buildDateTrigger(cursor), // Platform-specific date trigger
            });

            ids.push(id);
            tipIndex += 1;
            cursor = new Date(cursor.getTime() + 60 * 60 * 1000); // Next hour
        }

        await AsyncStorage.setItem(
            HOURLY_FOLLOWUP_SCHEDULE_KEY,
            JSON.stringify({ dateKey: todayKey, ids }),
        );

        console.log(`Scheduled ${ids.length} hourly follow-up reminders`);
        return { scheduled: ids.length, skipped: false };
    } catch (error) {
        console.error("Failed to schedule hourly follow-up reminders:", error);
        return { scheduled: 0, skipped: false, error: true };
    }
};
```

### 5.2 Time-Based Follow-up Reminders

**File:** [src/services/notificationService.js](src/services/notificationService.js#L1985-L2150)

Key scheduling windows:

- **Pre-reminders:** 60 minutes before, every 5 minutes
- **Due notifications:** At exact scheduled time
- **Missed reminders:** After due time, every 30 minutes for up to 12 hours
- **Lookback window:** 2 days (catch old follow-ups)
- **Forward window:** 7 days (schedule future follow-ups)
- **Max notifications per sync:** 120 per batch

```javascript
const preRemindMinutes = 60; // Alert 1 hour before
const preRemindEveryMinutes = 5; // Repeat every 5 mins
const missedFastMinutes = 60; // First hour: every X mins
const missedFastEveryMinutes = 5; // Early missed: every 5 mins
const missedHourlyEveryMinutes = 30; // Later: every 30 mins
const missedHourlyMaxHours = 12; // Stop after 12 hours
```

### 5.3 Audio Playback During Notification

**File:** [src/services/notificationService.js](src/services/notificationService.js#L485-L532)

```javascript
export const playAudioForNotificationData = async (data = {}) => {
    try {
        const type = String(data?.type || "").trim();
        if (!type) return false;
        if (Platform.OS === "web") return false;

        if (
            type !== "followup-soon" &&
            type !== "followup-due" &&
            type !== "followup-missed"
        ) {
            return false;
        }

        const lang = await getNotificationVoiceLanguage();
        const activityKey = normalizeActivityKeyForAudio(data?.activityType);
        const pack = AUDIO_MODULES[lang] || AUDIO_MODULES.en;
        const entry = pack?.[activityKey] || null;
        if (!entry) {
            console.warn(
                `[NotifSvc] No audio entry found for activity: ${activityKey}`,
            );
            return false;
        }

        let audioPlayed = false;

        if (type === "followup-soon") {
            const minutesLeft = Math.max(
                1,
                Math.round(Number(data?.minutesLeft || 0)),
            );
            if (minutesLeft >= 1 && minutesLeft <= 5 && entry[minutesLeft]) {
                console.log(
                    `[NotifSvc] Playing ${lang} audio for ${activityKey} ${minutesLeft}min before`,
                );
                audioPlayed = await playAudioModule(entry[minutesLeft]);
            }
        } else if (type === "followup-due") {
            console.log(
                `[NotifSvc] Playing ${lang} audio for ${activityKey} due notification`,
            );
            audioPlayed = await playAudioModule(entry.due);
        } else if (type === "followup-missed") {
            console.log(
                `[NotifSvc] Playing ${lang} audio for ${activityKey} missed notification`,
            );
            audioPlayed = await playAudioModule(entry.missed);
        }

        // Fallback to TTS if audio playback failed
        if (!audioPlayed) {
            console.log(
                `[NotifSvc] Audio failed, falling back to TTS for ${type}`,
            );
            const ttsText = buildTextToSpeechForNotification(data, lang);
            if (ttsText) {
                await safeSpeak(ttsText);
            }
        }

        return audioPlayed;
    } catch (error) {
        console.error("[NotifSvc] Error playing notification audio:", error);
        return false;
    }
};
```

---

## 6. NOTIFICATION CATEGORIES & ACTIONS

### 6.1 Follow-up Notification Actions

**File:** [src/services/notificationService.js](src/services/notificationService.js#L920-L960)

```javascript
// Actions (Complete / Cancel) for follow-up notifications
try {
    await Notifications.setNotificationCategoryAsync(
        CATEGORY_IDS.followups,
        [
            {
                identifier: "FOLLOWUP_COMPLETE",
                buttonTitle: "Complete",
                options: { opensAppToForeground: true },
            },
            {
                identifier: "FOLLOWUP_CANCEL",
                buttonTitle: "Cancel",
                options: { opensAppToForeground: false },
            },
        ],
        {
            previewPlaceholder: "Update follow-up",
        },
    );
} catch (_categoryError) {
    // ignore category errors
}

// Actions (Yes / No) prompt to add next follow-up
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
        {
            previewPlaceholder: "Add next follow-up",
        },
    );
} catch (_categoryError) {
    // ignore category errors
}
```

---

## 7. PUSH TOKEN RETRIEVAL

### 7.1 Expo Push Token (for remote notifications)

**File:** [src/services/notificationService.js](src/services/notificationService.js#L1269-L1290)

```javascript
export const getDevicePushToken = async () => {
    try {
        // Check if running in Expo Go (storeClient)
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
```

---

## 8. SUMMARY TABLE

| Category                  | Implementation                                    | Details                                              |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| **Notification Service**  | Expo Notifications                                | Local & remote, custom sounds, channels              |
| **Background Playback**   | Audio.setAudioModeAsync                           | Silent mode override, speaker output, volume ducking |
| **Voice Notifications**   | expo-speech (TTS)                                 | English & Tamil, fallback to pre-recorded audio      |
| **Scheduling**            | Notifications.scheduleNotificationAsync           | Hourly, time-based, with retry logic                 |
| **Permissions**           | Expo permissions + Android 13+ POST_NOTIFICATIONS | User consent, Settings fallback                      |
| **Notification Channels** | Android 8+ channels                               | Per-activity custom sounds & vibration               |
| **App Lifecycle**         | AppState listener                                 | Resync on foreground (60s intervals)                 |
| **Deep Linking**          | React Navigation + notification data              | Open specific screens with context                   |
| **Actions**               | Notification categories                           | Complete, Cancel, Yes/No buttons                     |
| **Languages**             | English (en-IN) & Tamil (ta-IN)                   | Per-activity audio libraries                         |
| **Fallback Strategy**     | Audio → TTS → Silent fail                         | Graceful degradation                                 |

---

## Key Files Reference

```
📁 App Root
├── App.js                                    # Entry point
├── app.config.js                            # Notification plugin config
├── app.json                                 # Expo config with permissions
├── google-services.json                     # Firebase config
│
📁 src/
├── services/
│  ├── notificationService.js               # Main notification system (2800+ lines)
│  ├── followupService.js                   # Follow-up data fetching
│  └── socketService.js                     # Real-time updates (optional)
│
├── navigation/
│  ├── AppNavigator.tsx                     # App lifecycle & listeners
│  └── navigationRef.ts                     # Navigation reference for deep linking
│
├── contexts/
│  └── AuthContext.js                       # Auth + notification init trigger
│
└── components/
   └── AppAlertHost.js                      # Global alert/toast system
│
📁 assets/
├── notification_sounds/
│  ├── followup_soon_en.mp3
│  ├── followup_due_en.mp3
│  ├── followup_missed_en.mp3
│  ├── followup_soon_ta.mp3
│  ├── followup_due_ta.mp3
│  └── followup_missed_ta.mp3
│
└── Audio/
   ├── Phone/English/   # 1-5min warnings, due, missed
   ├── Phone/Tamil/
   ├── WhatsApp/English/ & /Tamil/
   ├── Email/English/ & /Tamil/
   └── Meeting/English/ & /Tamil/
│
📁 sms-gateway-android/
└── AndroidManifest.xml                     # System-level permissions
```

---

## Critical Notes

1. **Background Execution:** Notifications use Expo's built-in scheduling which persists across app kills/reboots
2. **Audio Mode:** Configured to override silent mode on iOS and use speaker on Android
3. **Permissions:** Android 13+ requires explicit POST_NOTIFICATIONS permission
4. **Channel Immutability:** Android notification channel sound cannot be changed after creation (managed via version suffixes)
5. **Battery Optimization:** App requests SCHEDULE_EXACT_ALARM and battery optimization exemption
6. **Reboot Handling:** RECEIVE_BOOT_COMPLETED permission allows service restart after device reboot
7. **Voice Language:** Cached in AsyncStorage, English (en-IN) and Tamil (ta-IN) TTS
8. **Fallback Chain:** MP3 Audio → Text-to-Speech → Silent (if all fail)
9. **Rate Limiting:** Max 120 time-based notifications per sync to prevent notification spam
10. **Deep Linking:** Notifications integrate with React Navigation for direct screen routing
