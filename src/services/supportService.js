import getApiClient from "./apiClient";

export const getMyTickets = async () => {
    const api = await getApiClient();
    const res = await api.get("/support/my-tickets");
    return res.data;
};

export const createMyTicket = async ({ message, source = "mobile_help_screen" }) => {
    const api = await getApiClient();
    const res = await api.post("/support/my-tickets", { message, source });
    return res.data;
};

