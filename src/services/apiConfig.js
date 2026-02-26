
const getApiUrl = () => {
    // Get API URL from environment variable
    const envApiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (envApiUrl) {
        const isLocal = envApiUrl.includes('localhost') || envApiUrl.includes('127.0.0.1') || envApiUrl.includes('192.168');
        const mode = isLocal ? "🏠 LOCAL SERVER" : "🌐 ONLINE SERVER";

        console.log("*****************************************");
        console.log(`🚀 API MODE: ${mode}`);
        console.log(`🔗 URL: ${envApiUrl}`);
        console.log("*****************************************");

        return envApiUrl;
    }

    // If no environment variable is set
    console.error("❌ ERROR: EXPO_PUBLIC_API_URL is not defined in .env!");
    return "http://localhost:5000/api"; // Default fallback
};

export const API_URL = getApiUrl();
export const SOCKET_URL = API_URL.replace("/api", "");

export const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http") || path.startsWith("data:")) return path;
    const baseUrl = API_URL.replace("/api", "");
    return `${baseUrl}/${path}`;
};
