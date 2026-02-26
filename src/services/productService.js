import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_URL } from "./apiConfig";

const createApiClient = async () => {
  const token = await AsyncStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return axios.create({ baseURL: API_URL, headers });
};

export const getAllProducts = async () => {
  try {
    const client = await createApiClient();
    const res = await client.get("/products");
    return res.data;
  } catch (error) {
    console.error("Get products error:", error.response?.data || error.message);
    throw error;
  }
};

export const getProductById = async (id) => {
  try {
    const client = await createApiClient();
    const res = await client.get(`/products/${id}`);
    return res.data;
  } catch (error) {
    console.error("Get product error:", error.response?.data || error.message);
    throw error;
  }
};

export const createProduct = async (data) => {
  try {
    const client = await createApiClient();
    const res = await client.post("/products", data);
    return res.data;
  } catch (error) {
    console.error(
      "Create product error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const updateProduct = async (id, data) => {
  try {
    const client = await createApiClient();
    const res = await client.put(`/products/${id}`, data);
    return res.data;
  } catch (error) {
    console.error(
      "Update product error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const deleteProduct = async (id) => {
  try {
    const client = await createApiClient();
    const res = await client.delete(`/products/${id}`);
    return res.data;
  } catch (error) {
    console.error(
      "Delete product error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};
