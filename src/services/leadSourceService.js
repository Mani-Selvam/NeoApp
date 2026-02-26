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

// GET ALL LEAD SOURCES
export const getAllLeadSources = async () => {
    try {
        const client = await createApiClient();
        const response = await client.get("/leadsources");
        return response.data;
    } catch (error) {
        console.error(
            "Get lead sources error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// GET SINGLE LEAD SOURCE
export const getLeadSourceById = async (id) => {
    try {
        const client = await createApiClient();
        const response = await client.get(`/leadsources/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Get lead source error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// CREATE LEAD SOURCE
export const createLeadSource = async (leadSourceData) => {
    try {
        const client = await createApiClient();
        const response = await client.post("/leadsources", leadSourceData);
        return response.data;
    } catch (error) {
        console.error(
            "Create lead source error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// UPDATE LEAD SOURCE
export const updateLeadSource = async (id, leadSourceData) => {
    try {
        const client = await createApiClient();
        const response = await client.put(`/leadsources/${id}`, leadSourceData);
        return response.data;
    } catch (error) {
        console.error(
            "Update lead source error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};

// DELETE LEAD SOURCE
export const deleteLeadSource = async (id) => {
    try {
        const client = await createApiClient();
        const response = await client.delete(`/leadsources/${id}`);
        return response.data;
    } catch (error) {
        console.error(
            "Delete lead source error:",
            error.response?.data || error.message,
        );
        throw error;
    }
};
