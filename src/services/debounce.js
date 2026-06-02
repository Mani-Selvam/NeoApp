export const debounce = (fn, waitMs = 300) => {
    let timer = null;

    const debounced = (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, waitMs);
    };

    debounced.cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };

    return debounced;
};

// Global keyed debounce (use unique keys per screen/feature to avoid collisions)
const keyedTimers = new Map();

export const debounceByKey = (key, fn, waitMs = 300) => {
    const k = String(key || "").trim();
    if (!k) throw new Error("debounceByKey requires a non-empty key");

    const prev = keyedTimers.get(k);
    if (prev) clearTimeout(prev);

    const t = setTimeout(() => {
        keyedTimers.delete(k);
        fn();
    }, waitMs);

    keyedTimers.set(k, t);
};

export const cancelDebounceKey = (key) => {
    const k = String(key || "").trim();
    const t = keyedTimers.get(k);
    if (t) clearTimeout(t);
    keyedTimers.delete(k);
};
