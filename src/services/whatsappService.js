import axios from "axios";
import getApiClient from "./apiClient";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";
import { buildCacheKey, getCacheEntry, isFresh, setCacheEntry } from "./appCache";

const DEFAULT_TTL_MS = 60_000;

const getAuthHeader = async (isMultipart = false) => {
    const token = await getAuthToken();
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": isMultipart ? "multipart/form-data" : "application/json"
        },
    };
};

export const getChatHistory = async (phoneNumber, page = 1, limit = 30, options = {}) => {
    const { force = false, ttlMs = DEFAULT_TTL_MS } = options || {};
    const key = buildCacheKey(
        "whatsapp:history:v1",
        phoneNumber || "unknown",
        String(page),
        String(limit),
    );
    const cached = await getCacheEntry(key).catch(() => null);
    if (!force && cached?.value && isFresh(cached, ttlMs)) return cached.value;
    if (!force && cached?.value) {
        Promise.resolve()
            .then(async () => {
                const client = await getApiClient();
                const response = await client.get(
                    `/whatsapp/history/${phoneNumber}?page=${page}&limit=${limit}`,
                );
                await setCacheEntry(key, response.data).catch(() => {});
            })
            .catch(() => {});
        return cached.value;
    }

    const client = await getApiClient();
    const response = await client.get(
        `/whatsapp/history/${phoneNumber}?page=${page}&limit=${limit}`,
    );
    await setCacheEntry(key, response.data).catch(() => {});
    return response.data; // Now returns { messages: [], pagination: {} }
};

export const sendMessage = async (messageData) => {
    // If it's a simple text message
    if (!messageData.file) {
        const header = await getAuthHeader();
        const response = await axios.post(`${API_URL}/whatsapp/send`, messageData, header);
        return response.data;
    }

    // Handle Media (Image, Audio, Document)
    const formData = new FormData();
    formData.append("phoneNumber", messageData.phoneNumber);
    formData.append("enquiryId", messageData.enquiryId);
    formData.append("type", messageData.type);

    if (messageData.content) {
        formData.append("content", messageData.content);
    }

    if (messageData.file) {
        formData.append("file", {
            uri: messageData.file.uri,
            type: messageData.file.type || "application/octet-stream",
            name: messageData.file.name || "upload"
        });
    }

    const header = await getAuthHeader(true);
    const response = await axios.post(`${API_URL}/whatsapp/send`, formData, header);
    return response.data;
};
