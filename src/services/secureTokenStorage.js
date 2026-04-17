import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "token";

const webStorage = {
    getItem(key) {
        if (typeof window === "undefined" || !window.localStorage) return null;
        return window.localStorage.getItem(key);
    },
    setItem(key, value) {
        if (typeof window === "undefined" || !window.localStorage) return;
        window.localStorage.setItem(key, value);
    },
    removeItem(key) {
        if (typeof window === "undefined" || !window.localStorage) return;
        window.localStorage.removeItem(key);
    },
};

const isWeb = Platform.OS === "web";

const getSecureValue = async (key) => {
    if (isWeb) return webStorage.getItem(key);
    return SecureStore.getItemAsync(key);
};

const setSecureValue = async (key, value) => {
    if (isWeb) {
        webStorage.setItem(key, value);
        return;
    }
    await SecureStore.setItemAsync(key, value);
};

const deleteSecureValue = async (key) => {
    if (isWeb) {
        webStorage.removeItem(key);
        return;
    }
    await SecureStore.deleteItemAsync(key);
};

export const getAuthToken = async () => {
    const secureToken = await getSecureValue(TOKEN_KEY);
    if (secureToken) return secureToken;

    const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!legacyToken) return null;

    await setSecureValue(TOKEN_KEY, legacyToken);
    return legacyToken;
};

export const setAuthToken = async (token) => {
    if (!token) {
        await deleteAuthToken();
        return;
    }

    await setSecureValue(TOKEN_KEY, token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const deleteAuthToken = async () => {
    await deleteSecureValue(TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
};
