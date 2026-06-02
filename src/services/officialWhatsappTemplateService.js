import getApiClient from "./apiClient";

export const getAllOfficialTemplates = async (params = {}) => {
    try {
        const client = await getApiClient();
        const res = await client.get("/official-templates", { params });
        return res.data;
    } catch (e) {
        throw e;
    }
};

export const createOfficialTemplate = async (payload) => {
    try {
        const client = await getApiClient();
        const res = await client.post("/official-templates", payload);
        return res.data;
    } catch (e) {
        throw e;
    }
};

export const updateOfficialTemplate = async (id, payload) => {
    try {
        const client = await getApiClient();
        const res = await client.put(`/official-templates/${id}`, payload);
        return res.data;
    } catch (e) {
        throw e;
    }
};

export const deleteOfficialTemplate = async (id) => {
    try {
        const client = await getApiClient();
        const res = await client.delete(`/official-templates/${id}`);
        return res.data;
    } catch (e) {
        throw e;
    }
};
