import Constants from "expo-constants";

const isLocalDevHost = (value) =>
    typeof value === "string" &&
    (value.includes("localhost") ||
        value.includes("127.0.0.1") ||
        value.includes("192.168.") ||
        value.includes("10.") ||
        value.includes("172.16."));

const normalizeApiUrl = (rawValue) => {
    if (!rawValue || typeof rawValue !== "string") return null;

    let value = rawValue.trim();
    if (!value) return null;

    // Accept values like 192.168.1.34:5000/api by adding protocol.
    if (!/^https?:\/\//i.test(value)) {
        value = `http://${value}`;
    }

    // Remove trailing slashes so we can safely append /api once.
    value = value.replace(/\/+$/ , "");

    if (!/\/api$/i.test(value)) {
        value = `${value}/api`;
    }

    return value;
};

const DEFAULT_CLOUD_API = normalizeApiUrl(
    process.env.EXPO_PUBLIC_FALLBACK_API_URL ||
        process.env.EXPO_PUBLIC_DEFAULT_CLOUD_API ||
        process.env.API_URL ||
        Constants.expoConfig?.extra?.apiUrl ||
        Constants.appConfig?.extra?.apiUrl ||
        "",
);

const getApiUrl = () => {
    const normalizedEnvUrl =
        normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL) ||
        normalizeApiUrl(process.env.API_URL) ||
        normalizeApiUrl(Constants.expoConfig?.extra?.apiUrl) ||
        normalizeApiUrl(Constants.appConfig?.extra?.apiUrl);

    if (normalizedEnvUrl) {
        const isLocal = isLocalDevHost(normalizedEnvUrl);
        const isHttps = normalizedEnvUrl.startsWith("https://");
        const mode = isLocal ? "LOCAL SERVER" : "ONLINE SERVER";

        if (!__DEV__ && !isHttps && !isLocal) {
            console.warn(
                `[API] Ignoring non-HTTPS API URL in release build: ${normalizedEnvUrl}`,
            );
            if (DEFAULT_CLOUD_API) {
                return DEFAULT_CLOUD_API;
            }
        }

        console.log("*****************************************");
        console.log(`API MODE: ${mode}`);
        console.log(`URL: ${normalizedEnvUrl}`);
        console.log("*****************************************");

        return normalizedEnvUrl;
    }

    if (DEFAULT_CLOUD_API) {
        console.warn(
            "[API] EXPO_PUBLIC_API_URL is missing. Falling back to configured default API.",
        );
        return DEFAULT_CLOUD_API;
    }

    console.error(
        "ERROR: API URL is missing. Set EXPO_PUBLIC_API_URL or EXPO_PUBLIC_FALLBACK_API_URL.",
    );
    return "";
};

export const API_URL = getApiUrl();
export const SOCKET_URL = API_URL.replace("/api", "");

export const getImageUrl = (path) => {
    if (!path) return null;
    // Preserve URIs that should be used directly
    if (
        path.startsWith("http") ||
        path.startsWith("https") ||
        path.startsWith("data:") ||
        path.startsWith("blob:") ||
        path.startsWith("file://")
    )
        return path;
    // Convert server-relative paths to full URLs
    const baseUrl = API_URL.replace("/api", "");
    const normalizedPath = String(path)
        .replace(/^\/+/, "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${baseUrl}/${normalizedPath}`;
};

export const WEB_DASHBOARD_URL = process.env.EXPO_PUBLIC_WEB_DASHBOARD_URL || "https://neophrondev.in/Neogroww_Website";
