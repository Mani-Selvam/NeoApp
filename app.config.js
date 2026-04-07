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
  const easBuildProfile = String(process.env.EAS_BUILD_PROFILE || "").trim().toLowerCase();
  const iosNotificationsMode = easBuildProfile === "production" ? "production" : "development";

  const upsertPlugin = (plugins, name, pluginConfig = undefined) => {
    const list = Array.isArray(plugins) ? [...plugins] : [];
    const idx = list.findIndex((p) => (Array.isArray(p) ? p[0] : p) === name);
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
  const callLogAndroidPermissions = [
    "READ_CALL_LOG",
    "READ_PHONE_STATE",
    "READ_CONTACTS",
    "READ_PHONE_NUMBERS",
    // Optional/legacy (OEM dependent)
    "PROCESS_OUTGOING_CALLS",
    "ANSWER_PHONE_CALLS",
  ];
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
    ...config,
    plugins: (() => {
      let plugins = rawPlugins;
      if (!plugins.some((p) => (Array.isArray(p) ? p[0] : p) === "expo-secure-store")) {
        plugins = [...plugins, "expo-secure-store"];
      }

      // Custom notification sounds (needed for background/killed sound on Android/iOS).
      plugins = upsertPlugin(plugins, "expo-notifications", {
        // expo-notifications expects a flat `sounds` array (it copies these into Android `res/raw`
        // and into the iOS Xcode project). Nested `android/ios` keys are ignored.
        mode: iosNotificationsMode,
        sounds: [
          "./assets/notification_sounds/followup_soon_en.mp3",
          "./assets/notification_sounds/followup_due_en.mp3",
          "./assets/notification_sounds/followup_missed_en.mp3",
          "./assets/notification_sounds/followup_soon_ta.mp3",
          "./assets/notification_sounds/followup_due_ta.mp3",
          "./assets/notification_sounds/followup_missed_ta.mp3",

          // Minute-based activity sounds (1–5 min, due, missed)
          "./assets/notification_sounds/followups_1min_en.mp3",
          "./assets/notification_sounds/followups_2min_en.mp3",
          "./assets/notification_sounds/followups_3min_en.mp3",
          "./assets/notification_sounds/followups_4min_en.mp3",
          "./assets/notification_sounds/followups_5min_en.mp3",
          "./assets/notification_sounds/followups_1min_ta.mp3",
          "./assets/notification_sounds/followups_2min_ta.mp3",
          "./assets/notification_sounds/followups_3min_ta.mp3",
          "./assets/notification_sounds/followups_4min_ta.mp3",
          "./assets/notification_sounds/followups_5min_ta.mp3",

          "./assets/notification_sounds/phone_1min_en.mp3",
          "./assets/notification_sounds/phone_2min_en.mp3",
          "./assets/notification_sounds/phone_3min_en.mp3",
          "./assets/notification_sounds/phone_4min_en.mp3",
          "./assets/notification_sounds/phone_5min_en.mp3",
          "./assets/notification_sounds/phone_due_en.mp3",
          "./assets/notification_sounds/phone_missed_en.mp3",
          "./assets/notification_sounds/phone_1min_ta.mp3",
          "./assets/notification_sounds/phone_2min_ta.mp3",
          "./assets/notification_sounds/phone_3min_ta.mp3",
          "./assets/notification_sounds/phone_4min_ta.mp3",
          "./assets/notification_sounds/phone_5min_ta.mp3",
          "./assets/notification_sounds/phone_due_ta.mp3",
          "./assets/notification_sounds/phone_missed_ta.mp3",

          "./assets/notification_sounds/whatsapp_1min_en.mp3",
          "./assets/notification_sounds/whatsapp_2min_en.mp3",
          "./assets/notification_sounds/whatsapp_3min_en.mp3",
          "./assets/notification_sounds/whatsapp_4min_en.mp3",
          "./assets/notification_sounds/whatsapp_5min_en.mp3",
          "./assets/notification_sounds/whatsapp_due_en.mp3",
          "./assets/notification_sounds/whatsapp_missed_en.mp3",
          "./assets/notification_sounds/whatsapp_1min_ta.mp3",
          "./assets/notification_sounds/whatsapp_2min_ta.mp3",
          "./assets/notification_sounds/whatsapp_3min_ta.mp3",
          "./assets/notification_sounds/whatsapp_4min_ta.mp3",
          "./assets/notification_sounds/whatsapp_5min_ta.mp3",
          "./assets/notification_sounds/whatsapp_due_ta.mp3",
          "./assets/notification_sounds/whatsapp_missed_ta.mp3",

          "./assets/notification_sounds/email_1min_en.mp3",
          "./assets/notification_sounds/email_2min_en.mp3",
          "./assets/notification_sounds/email_3min_en.mp3",
          "./assets/notification_sounds/email_4min_en.mp3",
          "./assets/notification_sounds/email_5min_en.mp3",
          "./assets/notification_sounds/email_due_en.mp3",
          "./assets/notification_sounds/email_missed_en.mp3",
          "./assets/notification_sounds/email_1min_ta.mp3",
          "./assets/notification_sounds/email_2min_ta.mp3",
          "./assets/notification_sounds/email_3min_ta.mp3",
          "./assets/notification_sounds/email_4min_ta.mp3",
          "./assets/notification_sounds/email_5min_ta.mp3",
          "./assets/notification_sounds/email_due_ta.mp3",
          "./assets/notification_sounds/email_missed_ta.mp3",

          "./assets/notification_sounds/meeting_1min_en.mp3",
          "./assets/notification_sounds/meeting_2min_en.mp3",
          "./assets/notification_sounds/meeting_3min_en.mp3",
          "./assets/notification_sounds/meeting_4min_en.mp3",
          "./assets/notification_sounds/meeting_5min_en.mp3",
          "./assets/notification_sounds/meeting_due_en.mp3",
          "./assets/notification_sounds/meeting_missed_en.mp3",
          "./assets/notification_sounds/meeting_1min_ta.mp3",
          "./assets/notification_sounds/meeting_2min_ta.mp3",
          "./assets/notification_sounds/meeting_3min_ta.mp3",
          "./assets/notification_sounds/meeting_4min_ta.mp3",
          "./assets/notification_sounds/meeting_5min_ta.mp3",
          "./assets/notification_sounds/meeting_due_ta.mp3",
          "./assets/notification_sounds/meeting_missed_ta.mp3",
        ],
      });

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
      permissions: playStoreSafeMode
        ? safeAndroidPermissions
        : [...safeAndroidPermissions, ...callLogAndroidPermissions],
      blockedPermissions: [
        ...(config.android?.blockedPermissions || []),
        ...blockedAndroidPermissions,
      ].filter(
        (permission, index, permissions) =>
          permissions.indexOf(permission) === index,
      ),
    },
  };
};
