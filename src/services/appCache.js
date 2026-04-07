import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_VERSION = 1;
const PREFIX = "APP_CACHE:";
const TAG_PREFIX = "APP_CACHE_TAG:";
const MAX_KEYS_PER_TAG = 300;

const safeJsonParse = (raw) => {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const tagStorageKey = (tag) => `${TAG_PREFIX}${encodeURIComponent(String(tag || ""))}`;

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

const indexKeyUnderTag = async (tag, key) => {
    const tKey = tagStorageKey(tag);
    const raw = await AsyncStorage.getItem(tKey);
    const parsed = safeJsonParse(raw);
    const prev = Array.isArray(parsed?.keys) ? parsed.keys : [];
    const next = prev.includes(key) ? prev : [...prev, key];
    const trimmed =
        next.length > MAX_KEYS_PER_TAG
            ? next.slice(next.length - MAX_KEYS_PER_TAG)
            : next;
    await AsyncStorage.setItem(
        tKey,
        JSON.stringify({ v: CACHE_VERSION, t: Date.now(), keys: trimmed }),
    );
};

export const invalidateCacheTags = async (tags = []) => {
    const uniq = Array.from(new Set((tags || []).map((t) => String(t || "").trim()).filter(Boolean)));
    if (uniq.length === 0) return;

    for (const tag of uniq) {
        try {
            const tKey = tagStorageKey(tag);
            const raw = await AsyncStorage.getItem(tKey);
            const parsed = safeJsonParse(raw);
            const keys = Array.isArray(parsed?.keys) ? parsed.keys : [];
            if (keys.length > 0) {
                await AsyncStorage.multiRemove(keys);
            }
            await AsyncStorage.removeItem(tKey);
        } catch {
            // ignore cache invalidation failures
        }
    }
};

export const setCacheEntry = async (key, value, options = {}) => {
    const payload = {
        v: CACHE_VERSION,
        t: Date.now(),
        value,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));

    const tags = Array.isArray(options?.tags) ? options.tags : [];
    const normalizedTags = tags.map((t) => String(t || "").trim()).filter(Boolean);
    if (normalizedTags.length > 0) {
        await Promise.all(
            normalizedTags.map((tag) => indexKeyUnderTag(tag, key).catch(() => {})),
        );
    }
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
