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

// GET DASHBOARD SUMMARY
export const getDashboardSummary = async (params = {}) => {
    try {
        const client = await getApiClient();
        const response = await client.get("/dashboard/summary", { params });
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get dashboard summary error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};
