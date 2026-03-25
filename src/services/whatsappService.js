import axios from "axios";
import getApiClient from "./apiClient";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";

const getAuthHeader = async (isMultipart = false) => {
    const token = await getAuthToken();
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": isMultipart ? "multipart/form-data" : "application/json"
        },
    };
};

export const getChatHistory = async (phoneNumber, page = 1, limit = 30) => {
    const client = await getApiClient();
    const response = await client.get(
        `/whatsapp/history/${phoneNumber}?page=${page}&limit=${limit}`
    );
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
