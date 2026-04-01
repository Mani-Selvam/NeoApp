import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_VERSION = 1;
const PREFIX = "APP_CACHE:";

const safeJsonParse = (raw) => {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export const buildCacheKey = (...parts) => {
    const encoded = parts.map((p) =>
        encodeURIComponent(String(p == null ? "" : p)),
    );
    return `${PREFIX}${encoded.join("|")}`;
};

export const getCacheEntry = async (key) => {
    const raw = await AsyncStorage.getItem(key);
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== CACHE_VERSION) return null;
    if (typeof parsed.t !== "number") return null;
    return parsed;
};

export const setCacheEntry = async (key, value) => {
    const payload = {
        v: CACHE_VERSION,
        t: Date.now(),
        value,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
    return payload;
};

export const removeCacheEntry = async (key) => {
    await AsyncStorage.removeItem(key);
};

export const isFresh = (entry, ttlMs) => {
    if (!entry || typeof entry.t !== "number") return false;
    const ttl = Number(ttlMs);
    if (!Number.isFinite(ttl) || ttl <= 0) return false;
    return Date.now() - entry.t < ttl;
};

