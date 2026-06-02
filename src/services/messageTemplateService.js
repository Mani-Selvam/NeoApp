import getApiClient from "./apiClient";

export const getMessageTemplates = async () => {
    try {
        const client = await getApiClient();
        const response = await client.get("/messagetemplates");
        return response.data;
    } catch (error) {
        console.error("Get templates error:", error.response?.data || error.message);
        throw error;
    }
};

export const createMessageTemplate = async (data) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/messagetemplates", data);
        return response.data;
    } catch (error) {
        console.error("Create template error:", error.response?.data || error.message);
        throw error;
    }
};

export const updateMessageTemplate = async (id, data) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/messagetemplates/${id}`, data);
        return response.data;
    } catch (error) {
        console.error("Update template error:", error.response?.data || error.message);
        throw error;
    }
};

export const deleteMessageTemplate = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/messagetemplates/${id}`);
        return response.data;
    } catch (error) {
        console.error("Delete template error:", error.response?.data || error.message);
        throw error;
    }
};
