import axios from "axios";
import getApiClient from "./apiClient";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";

const getAuthHeader = async (isMultipart = false) => {
    const token = await getAuthToken();
    return {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": isMultipart ? "multipart/form-data" : "application/json",
        },
    };
};

export const getEmailSettings = async () => {
    const client = await getApiClient();
    const res = await client.get("/email/settings");
    return res.data;
};

export const saveEmailSettings = async (payload) => {
    const client = await getApiClient();
    const res = await client.put("/email/settings", payload);
    return res.data;
};

export const getEmailTemplates = async () => {
    const client = await getApiClient();
    const res = await client.get("/email/templates");
    return res.data;
};

export const createEmailTemplate = async (payload) => {
    const client = await getApiClient();
    const res = await client.post("/email/templates", payload);
    return res.data;
};

export const updateEmailTemplate = async (id, payload) => {
    const client = await getApiClient();
    const res = await client.put(`/email/templates/${id}`, payload);
    return res.data;
};

export const deleteEmailTemplate = async (id) => {
    const client = await getApiClient();
    const res = await client.delete(`/email/templates/${id}`);
    return res.data;
};

export const getEmailLogs = async ({ status, page = 1, limit = 20 } = {}) => {
    const client = await getApiClient();
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("page", String(page));
    qs.set("limit", String(limit));
    const res = await client.get(`/email/logs?${qs.toString()}`);
    return res.data;
};

export const sendEmail = async ({
    to,
    subject,
    message,
    enquiryId,
    templateId,
    trackOpen = false,
    trackLinks = false,
    file,
}) => {
    if (!file) {
        const header = await getAuthHeader(false);
        const res = await axios.post(
            `${API_URL}/email/send`,
            { to, subject, message, enquiryId, templateId, trackOpen, trackLinks },
            header,
        );
        return res.data;
    }

    const formData = new FormData();
    formData.append("to", to);
    formData.append("subject", subject || "");
    formData.append("message", message || "");
    if (enquiryId) formData.append("enquiryId", enquiryId);
    if (templateId) formData.append("templateId", templateId);
    formData.append("trackOpen", String(Boolean(trackOpen)));
    formData.append("trackLinks", String(Boolean(trackLinks)));
    formData.append("file", {
        uri: file.uri,
        type: file.type || "application/octet-stream",
        name: file.name || "attachment",
    });

    const header = await getAuthHeader(true);
    const res = await axios.post(`${API_URL}/email/send`, formData, header);
    return res.data;
};
