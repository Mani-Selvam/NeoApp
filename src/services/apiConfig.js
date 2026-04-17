const DEFAULT_CLOUD_API = "https://neomobile.neophrondev.in/api";
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
    value = value.replace(/\/+$/, "");

    if (!/\/api$/i.test(value)) {
        value = `${value}/api`;
    }

    return value;
};

const getApiUrl = () => {
    const normalizedEnvUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);

    if (normalizedEnvUrl) {
        const isLocal = isLocalDevHost(normalizedEnvUrl);
        const isHttps = normalizedEnvUrl.startsWith("https://");
        const mode = isLocal ? "LOCAL SERVER" : "ONLINE SERVER";

        if (!__DEV__ && !isHttps) {
            console.warn(
                `[API] Ignoring non-HTTPS EXPO_PUBLIC_API_URL in release build: ${normalizedEnvUrl}`,
            );
            return DEFAULT_CLOUD_API;
        }

        console.log("*****************************************");
        console.log(`API MODE: ${mode}`);
        console.log(`URL: ${normalizedEnvUrl}`);
        console.log("*****************************************");

        return normalizedEnvUrl;
    }

    console.error(
        "ERROR: EXPO_PUBLIC_API_URL is missing. Falling back to cloud API.",
    );
    return DEFAULT_CLOUD_API;
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
