import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./apiConfig";

// Create axios instance with auth token
const createApiClient = async () => {
    const token = await AsyncStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
    };

    // Only add Authorization header if token exists
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return axios.create({
        baseURL: API_URL,
        headers,
    });
};

// GET REPORT STATS
export const getReportStats = async () => {
    try {
        const client = await createApiClient();
        const response = await client.get("/reports/stats");
        return response.data;
    } catch (error) {
        console.error(
            "Get report stats error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET REPORT LIST
export const getReportList = async (type, filter) => {
    try {
        const client = await createApiClient();
        const response = await client.get("/reports/list", {
            params: { type, filter },
        });
        return response.data;
    } catch (error) {
        console.error(
            "Get report list error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
