import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "token";

export const getAuthToken = async () => {
    const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secureToken) return secureToken;

    const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (!legacyToken) return null;

    await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
    await AsyncStorage.removeItem(TOKEN_KEY);
    return legacyToken;
};

export const setAuthToken = async (token) => {
    if (!token) {
        await deleteAuthToken();
        return;
    }

    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.removeItem(TOKEN_KEY);
};

export const deleteAuthToken = async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
};
