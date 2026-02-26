import getApiClient from "./apiClient";

export const getProfile = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/profile");
    return response.data;
};

export const updateProfile = async (data) => {
    const client = await getApiClient();
    const response = await client.put("/users/profile", data);
    return response.data;
};

// Email Change Flow
export const initiateEmailChange = async () => {
    const client = await getApiClient();
    const response = await client.post("/users/email-change/initiate");
    return response.data;
};

export const verifyCurrentEmail = async (otp) => {
    const client = await getApiClient();
    const response = await client.post("/users/email-change/verify-current", { otp });
    return response.data;
};

export const initiateNewEmail = async (newEmail) => {
    const client = await getApiClient();
    const response = await client.post("/users/email-change/new-initiate", { newEmail });
    return response.data;
};

export const verifyNewEmail = async (otp) => {
    const client = await getApiClient();
    const response = await client.post("/users/email-change/verify-new", { otp });
    return response.data;
};

// Mobile Change Flow
export const initiateMobileChange = async () => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/initiate");
    return response.data;
};

export const verifyCurrentMobile = async (otp) => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/verify-current", { otp });
    return response.data;
};

export const initiateNewMobile = async (newMobile) => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/new-initiate", { newMobile });
    return response.data;
};

export const verifyNewMobile = async (otp) => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/verify-new", { otp });
    return response.data;
};
