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

// GET REPORT STATS
export const getReportStats = async () => {
    try {
        const client = await getApiClient();
        const response = await client.get("/reports/stats");
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get report stats error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};

// GET REPORT LIST
export const getReportList = async (type, filter) => {
    try {
        const client = await getApiClient();
        const response = await client.get("/reports/list", {
            params: { type, filter },
        });
        return response.data;
    } catch (error) {
        if (!shouldSuppressAuthLog(error)) {
            console.error(
                "Get report list error:",
                error.response?.data || error.message,
            );
        }
        throw error;
    }
};
