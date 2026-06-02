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

export const getTargets = async ({ year, month } = {}) => {
    try {
        const client = await getApiClient();
        const params = {};
        if (year) params.year = year;
        if (month) params.month = month;
        const response = await client.get("/targets", { params });
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get targets error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

export const createOrUpdateTarget = async (payload) => {
    try {
        const client = await getApiClient();
        const response = await client.post("/targets", payload);
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Save target error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

export const getTargetProgress = async ({ year, month } = {}) => {
    try {
        const client = await getApiClient();
        const params = {};
        if (year) params.year = year;
        if (month) params.month = month;
        const response = await client.get("/targets/progress", { params });
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get target progress error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};
