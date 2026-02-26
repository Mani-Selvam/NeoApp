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

// GET DASHBOARD SUMMARY
export const getDashboardSummary = async () => {
    try {
        const client = await createApiClient();
        const response = await client.get("/dashboard/summary");
        return response.data;
    } catch (error) {
        console.error(
            "Get dashboard summary error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
