import getApiClient from "./apiClient";

const shouldSuppressAuthLog = (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const message = String(
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "",
    );
    return (
        error?.isAuthError === true ||
        status === 401 ||
        status === 403 ||
        status === 400 ||
        status === 409 ||
        code === "COMPANY_NOT_ACTIVE" ||
        code === "COMPANY_NOT_FOUND" ||
        /email already exists/i.test(message) ||
        /email already used/i.test(message) ||
        /mobile number is already used/i.test(message)
    );
};

// GET ALL STAFF
export const getAllStaff = async () => {
    try {
        const client = await getApiClient();
        const response = await client.get("/staff");
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get staff error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// GET STAFF BY COMPANY
export const getStaffByCompany = async (companyId) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/staff/company/${companyId}`);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get staff by company error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// GET SINGLE STAFF
export const getStaffById = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.get(`/staff/${id}`);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get staff error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// CREATE STAFF
export const createStaff = async (staffData) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/staff", staffData);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Create staff error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// UPDATE STAFF
export const updateStaff = async (id, staffData) => {
    try {
        const client = await getApiClient();
        const response = await client.put(`/staff/${id}`, staffData);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Update staff error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// UPDATE STAFF STATUS
export const updateStaffStatus = async (id, status) => {
    try {
        const client = await getApiClient();
        const response = await client.patch(`/staff/${id}/status`, { status });
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Update staff status error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// DELETE STAFF
export const deleteStaff = async (id) => {
    try {
        const client = await getApiClient();
        const response = await client.delete(`/staff/${id}`);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Delete staff error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};
