import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./apiConfig";

// Create axios instance with auth token
const createApiClient = async () => {
    const token = await AsyncStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return axios.create({
        baseURL: API_URL,
        headers,
    });
};

// GET ALL STAFF
export const getAllStaff = async () => {
    try {
        const client = await createApiClient();
        const response = await client.get("/staff");
        return response.data;
    } catch (error) {
        console.error(
            "Get staff error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET STAFF BY COMPANY
export const getStaffByCompany = async (companyId) => {
    try {
        const client = await createApiClient();
        const response = await client.get(`/staff/company/${companyId}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get staff by company error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET SINGLE STAFF
export const getStaffById = async (id) => {
    try {
        const client = await createApiClient();
        const response = await client.get(`/staff/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get staff error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// CREATE STAFF
export const createStaff = async (staffData) => {
    try {
        const client = await createApiClient();
        const response = await client.post("/staff", staffData);
        return response.data;
    } catch (error) {
        console.error(
            "Create staff error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE STAFF
export const updateStaff = async (id, staffData) => {
    try {
        const client = await createApiClient();
        const response = await client.put(`/staff/${id}`, staffData);
        return response.data;
    } catch (error) {
        console.error(
            "Update staff error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE STAFF STATUS
export const updateStaffStatus = async (id, status) => {
    try {
        const client = await createApiClient();
        const response = await client.patch(`/staff/${id}/status`, { status });
        return response.data;
    } catch (error) {
        console.error(
            "Update staff status error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// DELETE STAFF
export const deleteStaff = async (id) => {
    try {
        const client = await createApiClient();
        const response = await client.delete(`/staff/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Delete staff error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
