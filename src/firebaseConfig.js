import Constants from "expo-constants";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";

console.log("🔥 Initializing Firebase...");

const firebaseConfig = Constants.expoConfig?.extra?.firebase ||
  Constants.appConfig?.extra?.firebase || {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error("❌ Firebase configuration is still missing after checks!");
}

// Initialize Firebase modular (v9+)
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log("✅ Firebase Modular App initialized");
} catch (e) {
  console.error("❌ Firebase Modular initialization failed:", e.message);
}

export const auth = app ? getAuth(app) : null;

// Initialize Firebase compat (needed for expo-firebase-recaptcha on web)
if (!firebase.apps.length && firebaseConfig) {
  try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase Compat App initialized (Web)");
  } catch (e) {
    console.error("❌ Firebase Compat initialization failed:", e.message);
  }
}

export default firebase;
// Export the resolved firebase config so UI components (e.g. recaptcha) can
// receive a concrete object even if Constants.expoConfig is unavailable.
export { firebaseConfig };

