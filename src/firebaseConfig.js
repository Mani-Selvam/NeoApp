import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

const firebaseConfig =
  Constants.expoConfig?.extra?.firebase ||
  Constants.appConfig?.extra?.firebase || {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

const hasValidConfig = Boolean(firebaseConfig?.apiKey);

if (!hasValidConfig) {
  console.warn("[Firebase] Missing Firebase configuration.");
}

let app;
let auth;

try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (_error) {
    try {
      auth = getAuth(app);
    } catch (_e) {
      console.warn("[Firebase] Auth initialization failed — Firebase features disabled.");
      auth = null;
    }
  }
} catch (_error) {
  console.warn("[Firebase] App initialization failed — Firebase features disabled.");
  app = null;
  auth = null;
}

export { app, auth, firebaseConfig };
export default app;
