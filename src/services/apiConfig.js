const DEFAULT_CLOUD_API = "https://neomobile.neophrondev.in/api";

const normalizeApiUrl = (rawValue) => {
    if (!rawValue || typeof rawValue !== "string") return null;

    let value = rawValue.trim();
    if (!value) return null;

    // Accept values like 192.168.1.34:5000/api by adding protocol.
    if (!/^https?:\/\//i.test(value)) {
        value = `http://${value}`;
    }

    // Remove trailing slashes so we can safely append /api once.
    value = value.replace(/\/+$/, "");

    if (!/\/api$/i.test(value)) {
        value = `${value}/api`;
    }

    return value;
};

const getApiUrl = () => {
    const normalizedEnvUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);

    if (normalizedEnvUrl) {
        const isLocal =
            normalizedEnvUrl.includes("localhost") ||
            normalizedEnvUrl.includes("127.0.0.1") ||
            normalizedEnvUrl.includes("192.168.");
        const mode = isLocal ? "LOCAL SERVER" : "ONLINE SERVER";

        console.log("*****************************************");
        console.log(`API MODE: ${mode}`);
        console.log(`URL: ${normalizedEnvUrl}`);
        console.log("*****************************************");

        return normalizedEnvUrl;
    }

    console.error("ERROR: EXPO_PUBLIC_API_URL is missing. Falling back to cloud API.");
    return DEFAULT_CLOUD_API;
};

export const API_URL = getApiUrl();
export const SOCKET_URL = API_URL.replace("/api", "");

export const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const baseUrl = API_URL.replace("/api", "");
    return `${baseUrl}/${path}`;
};
