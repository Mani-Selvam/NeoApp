import getApiClient from "./apiClient";

export const getCallLogs = async (params = {}) => {
    const client = await getApiClient();
    const query = new URLSearchParams(params).toString();
    const response = await client.get(`/calllogs?${query}`);
    return response.data;
};

export const createCallLog = async (callData) => {
    const client = await getApiClient();
    const response = await client.post(`/calllogs`, callData);
    return response.data;
};

export const getCallStats = async (params = {}) => {
    const client = await getApiClient();
    const query = new URLSearchParams(params).toString();
    const response = await client.get(`/calllogs/stats?${query}`);
    return response.data;
};

export const identifyCaller = async (phoneNumber) => {
    const client = await getApiClient();
    const response = await client.get(`/calllogs/identify/${phoneNumber}`);
    return response.data;
};

export const syncCallLogs = async (logs) => {
    const client = await getApiClient();
    const response = await client.post(`/calllogs/sync-batch`, { logs });
    return response.data;
};
