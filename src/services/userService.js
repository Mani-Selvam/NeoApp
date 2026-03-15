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

export const getBillingPlans = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/billing/plans");
    return response.data;
};

export const getEffectivePlan = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/billing/effective-plan");
    return response.data;
};

export const getBillingCoupons = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/billing/coupons");
    return response.data;
};

export const previewPlanCheckout = async ({ planId, couponCode = "" }) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/checkout/preview", {
        planId,
        couponCode,
    });
    return response.data;
};

export const createRazorpayOrder = async ({ planId, couponCode = "" }) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/razorpay/order", {
        planId,
        couponCode,
    });
    return response.data;
};

export const verifyRazorpayPayment = async (payload) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/razorpay/verify", payload);
    return response.data;
};

export const purchasePlan = async ({ planId, couponCode = "", paymentReference = "" }) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/checkout/purchase", {
        planId,
        couponCode,
        paymentReference,
    });
    return response.data;
};

export const submitEnterpriseContact = async (payload) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/enterprise-contact", payload);
    return response.data;
};

export const getCurrentPlan = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/company/current-plan");
    return response.data;
};
