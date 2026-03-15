import getApiClient from "./apiClient";

// CREATE ENQUIRY
export const createEnquiry = async (enquiryData) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/enquiries", enquiryData);
        return response.data;
    } catch (error) {
        console.error(
            "Create enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ALL ENQUIRIES
export const getAllEnquiries = async (page = 1, limit = 20, search = "", status = "", date = "") => {
    try {
        const client = await getApiClient();
        const params = { page, limit };
        if (search) params.search = search;
        if (status) params.status = status;
        if (date) params.date = date;

        const response = await client.get("/enquiries", { params });
        return response.data; // Now returns { data: [], pagination: {} } or [] if legacy
    } catch (error) {
        console.error(
            "Get enquiries error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET SINGLE ENQUIRY
export const getEnquiryById = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/enquiries/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ENQUIRY DETAIL (enquiry + timeline + reminders)
export const getEnquiryDetail = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/enquiries/${id}/detail`);
        return response.data;
    } catch (error) {
        console.error(
            "Get enquiry detail error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE ENQUIRY
export const updateEnquiry = async (id, enquiryData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/enquiries/${id}`, enquiryData);
        return response.data;
    } catch (error) {
        // Backward-compatible retry for older backend enum sets.
        const errMessage =
            error?.response?.data?.message || error?.message || "";
        const statusValue = enquiryData?.status;
        const isEnumError =
            typeof errMessage === "string" &&
            errMessage.toLowerCase().includes("not a valid enum value") &&
            String(errMessage).toLowerCase().includes("status");

        if (isEnumError && statusValue) {
            let legacyStatus = null;
            if (statusValue === "Contacted") legacyStatus = "In Progress";
            if (statusValue === "Not Interested") legacyStatus = "Dropped";

            if (legacyStatus) {
                try {
                    const client = await getApiClient();
                    const retryResponse = await client.put(`/enquiries/${id}`, {
                        ...enquiryData,
                        status: legacyStatus,
                    });
                    return retryResponse.data;
                } catch (retryError) {
                    console.error(
                        "Update enquiry retry error:",
                        retryError.response?.data || retryError.message,
                    );
                }
            }
        }

        console.error(
            "Update enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// QUICK STATUS UPDATE
export const updateEnquiryStatus = async (id, status) => {
    try {
        const client = await getApiClient();
        const response = await client.patch(`/enquiries/${id}/status`, { status });
        return response.data;
    } catch (error) {
        console.error(
            "Update enquiry status error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// FOLLOW-UP REMINDERS (today + overdue handled in UI when needed)
export const getFollowUpReminders = async () => {
    try {
        const client = await getApiClient();
        const response = await client.get("/enquiries/meta/reminders");
        return response.data;
    } catch (error) {
        console.error(
            "Get follow-up reminders error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// DELETE ENQUIRY
export const deleteEnquiry = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/enquiries/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Delete enquiry error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET ENQUIRIES BY STATUS
export const getEnquiriesByStatus = async (status) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/enquiries/status/${status}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get enquiries by status error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
