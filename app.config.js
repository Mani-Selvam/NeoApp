/* global __dirname */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

module.exports = ({ config }) => {
  const existingExtra = config.extra || {};
  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
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
    plugins: plugins.includes("expo-secure-store")
      ? plugins
      : [...plugins, "expo-secure-store"],
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
