import getApiClient from "./apiClient";
import { buildCacheKey, getSWR } from "./appCache";

const DEFAULT_TTL_MS = Number(process.env.EXPO_PUBLIC_CACHE_TTL_DASHBOARD_MS || 60000);
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
        const nextParams = { ...(params || {}) };
        if (nextParams.tzOffsetMinutes == null) {
            nextParams.tzOffsetMinutes = new Date().getTimezoneOffset();
        }
        const authKey = String(client?.defaults?.headers?.Authorization || "").trim() || "no-auth";
        const key = buildCacheKey(
            "dashboard:summary:v1",
            `${authKey}|${JSON.stringify(nextParams)}`,
        );

        const fetcher = async () => {
            const response = await client.get("/dashboard/summary", {
                params: nextParams,
            });
            return response.data;
        };

        const force = nextParams?.force === true;

        return await getSWR(key, fetcher, DEFAULT_TTL_MS, {
            tags: ["dashboard"],
            force,
        });
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
