import getApiClient from "./apiClient";

export const getProfile = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/profile");
    return response.data;
};

export const updateProfile = async (data) => {
    const hasLogoUpload = Boolean(data?.logo && typeof data.logo === "object" && data.logo.uri);
    if (hasLogoUpload) {
        const formData = new FormData();
        formData.append("name", String(data?.name || ""));
        formData.append("logo", {
            uri: data.logo.uri,
            type: data.logo.type || "image/jpeg",
            name: data.logo.name || "profile-logo.jpg",
        });
        const client = await getApiClient();
        const response = await client.put("/users/profile", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data;
    }

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
export const initiateMobileChange = async (method = "whatsapp") => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/initiate", { method });
    return response.data;
};

export const verifyCurrentMobile = async (otp) => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/verify-current", { otp });
    return response.data;
};

export const initiateNewMobile = async (newMobile, method = "whatsapp") => {
    const client = await getApiClient();
    const response = await client.post("/users/mobile-change/new-initiate", { newMobile, method });
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

export const previewPlanCheckout = async ({
    planId,
    couponCode = "",
    adminCount = 0,
    staffCount = 0,
}) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/checkout/preview", {
        planId,
        couponCode,
        adminCount,
        staffCount,
    });
    return response.data;
};

export const createRazorpayOrder = async ({
    planId,
    couponCode = "",
    adminCount = 0,
    staffCount = 0,
}) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/razorpay/order", {
        planId,
        couponCode,
        adminCount,
        staffCount,
    });
    return response.data;
};

export const verifyRazorpayPayment = async (payload) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/razorpay/verify", payload);
    return response.data;
};

export const purchasePlan = async ({
    planId,
    couponCode = "",
    paymentReference = "",
    adminCount = 0,
    staffCount = 0,
}) => {
    const client = await getApiClient();
    const response = await client.post("/users/billing/checkout/purchase", {
        planId,
        couponCode,
        paymentReference,
        adminCount,
        staffCount,
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

export const deleteCompanyAccount = async () => {
    const client = await getApiClient();
    const response = await client.delete("/users/company/account");
    return response.data;
};

export const disableCompanyAccount = async () => {
    const client = await getApiClient();
    const response = await client.post("/users/company/account/disable");
    return response.data;
};

export const getCompanyPublicForm = async () => {
    const client = await getApiClient();
    const response = await client.get("/users/company/public-form");
    return response.data;
};

export const updateCompanyPublicForm = async (payload) => {
    const client = await getApiClient();
    const response = await client.put("/users/company/public-form", payload);
    return response.data;
};
