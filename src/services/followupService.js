import getApiClient from "./apiClient";

// GET FOLLOWUPS (with tab filter and pagination)
export const getFollowUps = async (tab = "Today", page = 1, limit = 20) => {
    try {
        const client = await getApiClient();
        const response = await client.get("/followups", {
            params: { tab, page, limit },
        });
        return response.data; // Now returns { data: [], pagination: {} }
    } catch (error) {
        console.error(
            "Get followups error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// CREATE FOLLOWUP
export const createFollowUp = async (followUpData) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/followups", followUpData);
        return response.data;
    } catch (error) {
        console.error(
            "Create followup error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE FOLLOWUP
export const updateFollowUp = async (id, followUpData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/followups/${id}`, followUpData);
        return response.data;
    } catch (error) {
        console.error(
            "Update followup error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// DELETE FOLLOWUP
export const deleteFollowUp = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/followups/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Delete followup error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET FOLLOW-UP HISTORY (all records for an enquiry)
// GET AUTOCALL FOLLOWUPS
export const getAutoCallFollowUps = async (startDate, endDate, filter) => {
    try {
        const client = await getApiClient();
        const response = await client.get("/followups/autocall", {
            params: { startDate, endDate, filter },
        });
        return response.data;
    } catch (error) {
        console.error(
            "Get autocall followups error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

export const getFollowUpHistory = async (enqNoOrId) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/followups/history/${enqNoOrId}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get follow-up history error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
