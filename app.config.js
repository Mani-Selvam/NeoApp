/* global __dirname */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

module.exports = ({ config }) => {
    const existingExtra = config.extra || {};
    const rawPlugins = Array.isArray(config.plugins) ? config.plugins : [];
    const playStoreSafeMode =
        String(process.env.EXPO_PUBLIC_PLAY_STORE_SAFE_MODE ?? "true")
            .trim()
            .toLowerCase() !== "false";
    const easBuildProfile = String(process.env.EAS_BUILD_PROFILE || "")
        .trim()
        .toLowerCase();
    const iosNotificationsMode =
        easBuildProfile === "production" ? "production" : "development";

    const upsertPlugin = (plugins, name, pluginConfig = undefined) => {
        const list = Array.isArray(plugins) ? [...plugins] : [];
        const idx = list.findIndex(
            (p) => (Array.isArray(p) ? p[0] : p) === name,
        );
        const next = pluginConfig === undefined ? name : [name, pluginConfig];
        if (idx === -1) return [...list, next];
        list[idx] = next;
        return list;
    };
    const firebaseExtra = {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "",
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId:
            process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "",
    };
    // Keep this list minimal for Play Store safety, but include the permissions required for reliable notifications.
    // NOTE: Setting `android.permissions` overrides Expo defaults, so we must explicitly add POST_NOTIFICATIONS.
    const safeAndroidPermissions = [
        "CALL_PHONE",
        "POST_NOTIFICATIONS",
        "VIBRATE",
        "RECEIVE_BOOT_COMPLETED",
        // Improves timing for scheduled local notifications on newer Android versions (still subject to OEM battery optimizations).
        "SCHEDULE_EXACT_ALARM",
        "USE_EXACT_ALARM",
    ];
    const enterpriseAndroidPermissions = [
        ...safeAndroidPermissions,
        // Required for `react-native-call-log` + runtime READ_CALL_LOG checks.
        "READ_CALL_LOG",
    ];
    const androidPermissions = playStoreSafeMode
        ? safeAndroidPermissions
        : enterpriseAndroidPermissions;
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
    const notificationSoundFiles = [
        "./src/assets/Audio/Phone/English/n5pmin.wav",
        "./src/assets/Audio/Phone/English/n4pmin.wav",
        "./src/assets/Audio/Phone/English/n3pmin.wav",
        "./src/assets/Audio/Phone/English/n2pmin.wav",
        "./src/assets/Audio/Phone/English/n1pmin.wav",
        "./src/assets/Audio/Phone/English/pdue.wav",
        "./src/assets/Audio/Phone/English/pmissed.wav",
        "./src/assets/Audio/Phone/Tamil/t5min.wav",
        "./src/assets/Audio/Phone/Tamil/t4min.wav",
        "./src/assets/Audio/Phone/Tamil/t3min.wav",
        "./src/assets/Audio/Phone/Tamil/t2min.wav",
        "./src/assets/Audio/Phone/Tamil/t1min.wav",
        "./src/assets/Audio/Phone/Tamil/tdue.wav",
        "./src/assets/Audio/Phone/Tamil/tmissed.wav",
        "./src/assets/Audio/Whatsapp/English/w5min.wav",
        "./src/assets/Audio/Whatsapp/English/w4min.wav",
        "./src/assets/Audio/Whatsapp/English/w3min.wav",
        "./src/assets/Audio/Whatsapp/English/w2min.wav",
        "./src/assets/Audio/Whatsapp/English/w1min.wav",
        "./src/assets/Audio/Whatsapp/English/wdue.wav",
        "./src/assets/Audio/Whatsapp/English/wmissed.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wt5min.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wt4min.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wt3min.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wt2min.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wt1min.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wtdue.wav",
        "./src/assets/Audio/Whatsapp/Tamil/wtmissed.wav",
        "./src/assets/Audio/Email/English/e5min.wav",
        "./src/assets/Audio/Email/English/e4min.wav",
        "./src/assets/Audio/Email/English/e3min.wav",
        "./src/assets/Audio/Email/English/e2min.wav",
        "./src/assets/Audio/Email/English/e1min.wav",
        "./src/assets/Audio/Email/English/edue.wav",
        "./src/assets/Audio/Email/English/emissed.wav",
        "./src/assets/Audio/Email/Tamil/et5min.wav",
        "./src/assets/Audio/Email/Tamil/et4min.wav",
        "./src/assets/Audio/Email/Tamil/et3min.wav",
        "./src/assets/Audio/Email/Tamil/et2min.wav",
        "./src/assets/Audio/Email/Tamil/et1min.wav",
        "./src/assets/Audio/Email/Tamil/etdue.wav",
        "./src/assets/Audio/Email/Tamil/etmissed.wav",
        "./src/assets/Audio/Meeting/English/m5min.wav",
        "./src/assets/Audio/Meeting/English/m4min.wav",
        "./src/assets/Audio/Meeting/English/m3min.wav",
        "./src/assets/Audio/Meeting/English/m2min.wav",
        "./src/assets/Audio/Meeting/English/m1min.wav",
        "./src/assets/Audio/Meeting/English/mdue.wav",
        "./src/assets/Audio/Meeting/English/emissed.wav",
        "./src/assets/Audio/Meeting/Tamil/mt5min.wav",
        "./src/assets/Audio/Meeting/Tamil/mt4min.wav",
        "./src/assets/Audio/Meeting/Tamil/mt3min.wav",
        "./src/assets/Audio/Meeting/Tamil/mt2min.wav",
        "./src/assets/Audio/Meeting/Tamil/mt1min.wav",
        "./src/assets/Audio/Meeting/Tamil/mtdue.wav",
        "./src/assets/Audio/Meeting/Tamil/mtmissed.wav",
    ];

    return {
        ...config,
        plugins: (() => {
            let plugins = rawPlugins;
            if (
                !plugins.some(
                    (p) =>
                        (Array.isArray(p) ? p[0] : p) === "expo-secure-store",
                )
            ) {
                plugins = [...plugins, "expo-secure-store"];
            }

            // Custom notification sounds (needed for background/killed sound on Android/iOS).
            plugins = upsertPlugin(plugins, "expo-notifications", {
                mode: iosNotificationsMode,
                sounds: notificationSoundFiles,
            });

            // Add Firebase native plugins
            plugins = upsertPlugin(plugins, "@react-native-firebase/app");
            plugins = upsertPlugin(plugins, "@react-native-firebase/messaging");

            return plugins;
        })(),
        extra: {
            ...existingExtra,
            businessNumber: process.env.PHONE_NUMBER,
            playStoreSafeMode,
            privacyPolicyUrl:
                process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
                "https://neophrondev.in/privacy/",
            accountDeletionUrl:
                process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL ||
                process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
                "https://neophrondev.in/privacy/",
            firebase: firebaseExtra,
        },
        android: {
            ...config.android,
            permissions: androidPermissions,
            blockedPermissions: [
                ...(config.android?.blockedPermissions || []),
                ...blockedAndroidPermissions,
            ].filter(
                (permission, index, permissions) =>
                    permissions.indexOf(permission) === index,
            ),
            // FIX #27: Configure notification channels with sounds for closed/background/foreground
            // Each channel: activity (Phone/WhatsApp/Email/Meeting) + state (5min/4min/3min/2min/1min/due/missed) + language (en/ta)
            notificationChannels: [
                // ─── Phone Notifications (English) ───
                {
                    id: "phone_5min_en",
                    name: "Phone - 5 min",
                    sound: "n5pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_4min_en",
                    name: "Phone - 4 min",
                    sound: "n4pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_3min_en",
                    name: "Phone - 3 min",
                    sound: "n3pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_2min_en",
                    name: "Phone - 2 min",
                    sound: "n2pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_1min_en",
                    name: "Phone - 1 min",
                    sound: "n1pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_due_en",
                    name: "Phone - Due",
                    sound: "pdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_missed_en",
                    name: "Phone - Missed",
                    sound: "pmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Phone Notifications (Tamil) ───
                {
                    id: "phone_5min_ta",
                    name: "Phone - 5 min (Tamil)",
                    sound: "t5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_4min_ta",
                    name: "Phone - 4 min (Tamil)",
                    sound: "t4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_3min_ta",
                    name: "Phone - 3 min (Tamil)",
                    sound: "t3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_2min_ta",
                    name: "Phone - 2 min (Tamil)",
                    sound: "t2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_1min_ta",
                    name: "Phone - 1 min (Tamil)",
                    sound: "t1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_due_ta",
                    name: "Phone - Due (Tamil)",
                    sound: "tdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "phone_missed_ta",
                    name: "Phone - Missed (Tamil)",
                    sound: "tmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── WhatsApp Notifications (English) ───
                {
                    id: "whatsapp_5min_en",
                    name: "WhatsApp - 5 min",
                    sound: "w5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_4min_en",
                    name: "WhatsApp - 4 min",
                    sound: "w4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_3min_en",
                    name: "WhatsApp - 3 min",
                    sound: "w3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_2min_en",
                    name: "WhatsApp - 2 min",
                    sound: "w2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_1min_en",
                    name: "WhatsApp - 1 min",
                    sound: "w1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_due_en",
                    name: "WhatsApp - Due",
                    sound: "wdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_missed_en",
                    name: "WhatsApp - Missed",
                    sound: "wmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── WhatsApp Notifications (Tamil) ───
                {
                    id: "whatsapp_5min_ta",
                    name: "WhatsApp - 5 min (Tamil)",
                    sound: "wt5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_4min_ta",
                    name: "WhatsApp - 4 min (Tamil)",
                    sound: "wt4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_3min_ta",
                    name: "WhatsApp - 3 min (Tamil)",
                    sound: "wt3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_2min_ta",
                    name: "WhatsApp - 2 min (Tamil)",
                    sound: "wt2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_1min_ta",
                    name: "WhatsApp - 1 min (Tamil)",
                    sound: "wt1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_due_ta",
                    name: "WhatsApp - Due (Tamil)",
                    sound: "wtdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "whatsapp_missed_ta",
                    name: "WhatsApp - Missed (Tamil)",
                    sound: "wtmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Email Notifications (English) ───
                {
                    id: "email_5min_en",
                    name: "Email - 5 min",
                    sound: "e5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_4min_en",
                    name: "Email - 4 min",
                    sound: "e4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_3min_en",
                    name: "Email - 3 min",
                    sound: "e3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_2min_en",
                    name: "Email - 2 min",
                    sound: "e2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_1min_en",
                    name: "Email - 1 min",
                    sound: "e1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_due_en",
                    name: "Email - Due",
                    sound: "edue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_missed_en",
                    name: "Email - Missed",
                    sound: "emissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Email Notifications (Tamil) ───
                {
                    id: "email_5min_ta",
                    name: "Email - 5 min (Tamil)",
                    sound: "et5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_4min_ta",
                    name: "Email - 4 min (Tamil)",
                    sound: "et4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_3min_ta",
                    name: "Email - 3 min (Tamil)",
                    sound: "et3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_2min_ta",
                    name: "Email - 2 min (Tamil)",
                    sound: "et2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_1min_ta",
                    name: "Email - 1 min (Tamil)",
                    sound: "et1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_due_ta",
                    name: "Email - Due (Tamil)",
                    sound: "etdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "email_missed_ta",
                    name: "Email - Missed (Tamil)",
                    sound: "etmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Meeting Notifications (English) ───
                {
                    id: "meeting_5min_en",
                    name: "Meeting - 5 min",
                    sound: "m5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_4min_en",
                    name: "Meeting - 4 min",
                    sound: "m4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_3min_en",
                    name: "Meeting - 3 min",
                    sound: "m3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_2min_en",
                    name: "Meeting - 2 min",
                    sound: "m2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_1min_en",
                    name: "Meeting - 1 min",
                    sound: "m1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_due_en",
                    name: "Meeting - Due",
                    sound: "mdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_missed_en",
                    name: "Meeting - Missed",
                    sound: "mmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Meeting Notifications (Tamil) ───
                {
                    id: "meeting_5min_ta",
                    name: "Meeting - 5 min (Tamil)",
                    sound: "mt5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_4min_ta",
                    name: "Meeting - 4 min (Tamil)",
                    sound: "mt4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_3min_ta",
                    name: "Meeting - 3 min (Tamil)",
                    sound: "mt3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_2min_ta",
                    name: "Meeting - 2 min (Tamil)",
                    sound: "mt2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_1min_ta",
                    name: "Meeting - 1 min (Tamil)",
                    sound: "mt1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_due_ta",
                    name: "Meeting - Due (Tamil)",
                    sound: "mtdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "meeting_missed_ta",
                    name: "Meeting - Missed (Tamil)",
                    sound: "mtmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Follow-up Notifications (English) ───
                {
                    id: "followups_5min_en",
                    name: "Follow-up - 5 min",
                    sound: "n5pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_4min_en",
                    name: "Follow-up - 4 min",
                    sound: "n4pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_3min_en",
                    name: "Follow-up - 3 min",
                    sound: "n3pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_2min_en",
                    name: "Follow-up - 2 min",
                    sound: "n2pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_1min_en",
                    name: "Follow-up - 1 min",
                    sound: "n1pmin",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_due_en",
                    name: "Follow-up - Due",
                    sound: "pdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_missed_en",
                    name: "Follow-up - Missed",
                    sound: "pmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Follow-up Notifications (Tamil) ───
                {
                    id: "followups_5min_ta",
                    name: "Follow-up - 5 min (Tamil)",
                    sound: "t5min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_4min_ta",
                    name: "Follow-up - 4 min (Tamil)",
                    sound: "t4min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_3min_ta",
                    name: "Follow-up - 3 min (Tamil)",
                    sound: "t3min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_2min_ta",
                    name: "Follow-up - 2 min (Tamil)",
                    sound: "t2min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_1min_ta",
                    name: "Follow-up - 1 min (Tamil)",
                    sound: "t1min",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_due_ta",
                    name: "Follow-up - Due (Tamil)",
                    sound: "tdue",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_missed_ta",
                    name: "Follow-up - Missed (Tamil)",
                    sound: "tmissed",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },

                // ─── Fallback / General Channels ───
                // These match the channelIds sent by the backend for non-reminder
                // notifications (e.g. new enquiry assigned, follow-up created).
                // They MUST exist in the native manifest so Android can find them
                // even before the app has ever opened (dynamic channels don't exist yet).
                {
                    id: "followups",
                    name: "Follow-ups",
                    sound: "default",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_en",
                    name: "Follow-ups (English)",
                    sound: "default",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "followups_ta",
                    name: "Follow-ups (Tamil)",
                    sound: "default",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "enquiries",
                    name: "Enquiries",
                    sound: "default",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
                {
                    id: "default",
                    name: "Default",
                    sound: "default",
                    vibrationPattern: [0, 250, 250, 250],
                    enableVibrate: true,
                    importance: 5,
                },
            ],
        },
    };
};
