import getApiClient from "./apiClient";

const shouldSuppressAuthLog = (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    return (
        error?.isAuthError === true ||
        status === 401 ||
        status === 403 ||
        code === "COMPANY_NOT_ACTIVE" ||
        code === "COMPANY_NOT_FOUND"
    );
};

// GET ALL LEAD SOURCES
export const getAllLeadSources = async () => {
    try {
        const client = await getApiClient();
        const response = await client.get("/leadsources");
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get lead sources error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// GET SINGLE LEAD SOURCE
export const getLeadSourceById = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/leadsources/${id}`);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get lead source error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// CREATE LEAD SOURCE
export const createLeadSource = async (leadSourceData) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/leadsources", leadSourceData);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Create lead source error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// UPDATE LEAD SOURCE
export const updateLeadSource = async (id, leadSourceData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/leadsources/${id}`, leadSourceData);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Update lead source error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// DELETE LEAD SOURCE
export const deleteLeadSource = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/leadsources/${id}`);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Delete lead source error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};
