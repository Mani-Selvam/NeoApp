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

export const getAllProducts = async () => {
  try {
    const client = await getApiClient();
    const res = await client.get("/products");
    return res.data;
  } catch (error) {
    if (!shouldSuppressAuthLog(error)) {
      console.error("Get products error:", error.response?.data || error.message);
    }
    throw error;
  }
};

export const getProductById = async (id) => {
  try {
    const client = await getApiClient();
    const res = await client.get(`/products/${id}`);
    return res.data;
  } catch (error) {
    if (!shouldSuppressAuthLog(error)) {
      console.error("Get product error:", error.response?.data || error.message);
    }
    throw error;
  }
};

export const createProduct = async (data) => {
  try {
    const client = await getApiClient();
    const res = await client.post("/products", data);
    return res.data;
  } catch (error) {
    if (!shouldSuppressAuthLog(error)) {
      console.error(
        "Create product error:",
        error.response?.data || error.message,
      );
    }
    throw error;
  }
};

export const updateProduct = async (id, data) => {
  try {
    const client = await getApiClient();
    const res = await client.put(`/products/${id}`, data);
    return res.data;
  } catch (error) {
    if (!shouldSuppressAuthLog(error)) {
      console.error(
        "Update product error:",
        error.response?.data || error.message,
      );
    }
    throw error;
  }
};

export const deleteProduct = async (id) => {
  try {
    const client = await getApiClient();
    const res = await client.delete(`/products/${id}`);
    return res.data;
  } catch (error) {
    if (!shouldSuppressAuthLog(error)) {
      console.error(
        "Delete product error:",
        error.response?.data || error.message,
      );
    }
    throw error;
  }
};
