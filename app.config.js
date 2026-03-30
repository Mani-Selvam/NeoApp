/* global __dirname */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

module.exports = ({ config }) => {
  const existingExtra = config.extra || {};
  const rawPlugins = Array.isArray(config.plugins) ? config.plugins : [];

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
  const safeAndroidPermissions = ["CALL_PHONE"];
  const blockedAndroidPermissions = [
    "android.permission.READ_CALL_LOG",
    "android.permission.READ_PHONE_STATE",
    "android.permission.PROCESS_OUTGOING_CALLS",
    "android.permission.ANSWER_PHONE_CALLS",
    "android.permission.READ_PHONE_NUMBERS",
    "android.permission.READ_CONTACTS",
    "android.permission.RECORD_AUDIO",
  ];

  return {
    ...config,
    plugins: (() => {
      let plugins = rawPlugins;
      if (!plugins.some((p) => (Array.isArray(p) ? p[0] : p) === "expo-secure-store")) {
        plugins = [...plugins, "expo-secure-store"];
      }

      // Custom notification sounds (needed for background/killed sound on Android/iOS).
      plugins = upsertPlugin(plugins, "expo-notifications", {
        android: {
          sounds: [
            "./assets/notification_sounds/followup_soon_en.mp3",
            "./assets/notification_sounds/followup_due_en.mp3",
            "./assets/notification_sounds/followup_missed_en.mp3",
            "./assets/notification_sounds/followup_soon_ta.mp3",
            "./assets/notification_sounds/followup_due_ta.mp3",
            "./assets/notification_sounds/followup_missed_ta.mp3",
          ],
        },
        ios: {
          sounds: [
            {
              name: "followup_soon_en",
              type: "mp3",
              target: "Sounds/followup_soon_en.mp3",
            },
            {
              name: "followup_due_en",
              type: "mp3",
              target: "Sounds/followup_due_en.mp3",
            },
            {
              name: "followup_missed_en",
              type: "mp3",
              target: "Sounds/followup_missed_en.mp3",
            },
            {
              name: "followup_soon_ta",
              type: "mp3",
              target: "Sounds/followup_soon_ta.mp3",
            },
            {
              name: "followup_due_ta",
              type: "mp3",
              target: "Sounds/followup_due_ta.mp3",
            },
            {
              name: "followup_missed_ta",
              type: "mp3",
              target: "Sounds/followup_missed_ta.mp3",
            },
          ],
        },
      });

      return plugins;
    })(),
    extra: {
      ...existingExtra,
      businessNumber: process.env.PHONE_NUMBER,
      playStoreSafeMode: true,
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
      permissions: safeAndroidPermissions,
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
