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

// UPDATE ENQUIRY
export const updateEnquiry = async (id, enquiryData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/enquiries/${id}`, enquiryData);
        return response.data;
    } catch (error) {
        console.error(
            "Update enquiry error:",
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
