import axios from "axios";
import getApiClient from "./apiClient";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";

const getAuthHeader = async (isMultipart = false) => {
  const token = await getAuthToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": isMultipart ? "multipart/form-data" : "application/json",
    },
  };
};

const appendAttachmentIfAny = (formData, attachment) => {
  if (!attachment?.uri) return;
  formData.append("attachment", {
    uri: attachment.uri,
    type: attachment.type || "application/octet-stream",
    name: attachment.name || "attachment",
  });
};

export const getCommunicationTeam = async () => {
  const client = await getApiClient();
  const response = await client.get("/communication/team");
  return response.data;
};

export const getCommunicationThreads = async () => {
  const client = await getApiClient();
  const response = await client.get("/communication/threads");
  return response.data;
};

export const getConversationMessages = async (memberId) => {
  const client = await getApiClient();
  const response = await client.get(`/communication/messages/${memberId}`);
  return response.data;
};

export const sendCommunicationMessage = async ({
  receiverId,
  message,
  attachment,
  messageType,
  callStatus,
  callDuration,
  callTime,
}) => {
  if (!attachment) {
    const client = await getApiClient();
    const response = await client.post("/communication/messages", {
      receiverId,
      message,
      messageType,
      callStatus,
      callDuration,
      callTime,
    });
    return response.data;
  }

  const formData = new FormData();
  formData.append("receiverId", receiverId);
  if (message) formData.append("message", message);
  if (messageType) formData.append("messageType", messageType);
  if (callStatus) formData.append("callStatus", callStatus);
  if (callDuration != null) formData.append("callDuration", String(callDuration));
  if (callTime) formData.append("callTime", callTime);
  appendAttachmentIfAny(formData, attachment);
  const header = await getAuthHeader(true);
  const response = await axios.post(`${API_URL}/communication/messages`, formData, header);
  return response.data;
};

export const getCommunicationTasks = async (status = "pending") => {
  const client = await getApiClient();
  const response = await client.get("/communication/tasks", {
    params: { status },
  });
  return response.data;
};

export const createCommunicationTask = async (payload) => {
  const hasAttachment = Boolean(payload?.attachment?.uri && !payload?.attachment?.existing);
  if (!hasAttachment) {
    const client = await getApiClient();
    const response = await client.post("/communication/tasks", payload);
    return response.data;
  }

  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("description", payload.description || "");
  formData.append("taskType", payload.taskType || "General");
  formData.append("priority", payload.priority || "Medium");
  formData.append("dueDate", payload.dueDate);
  if (payload.dueTime) formData.append("dueTime", payload.dueTime);
  if (payload.assignedTo) formData.append("assignedTo", payload.assignedTo);
  if (payload.relatedEnquiryId) formData.append("relatedEnquiryId", payload.relatedEnquiryId);
  appendAttachmentIfAny(formData, payload.attachment);

  const header = await getAuthHeader(true);
  const response = await axios.post(`${API_URL}/communication/tasks`, formData, header);
  return response.data;
};

export const updateCommunicationTaskStatus = async (taskId, status) => {
  const client = await getApiClient();
  const response = await client.patch(`/communication/tasks/${taskId}/status`, { status });
  return response.data;
};

export const updateCommunicationTask = async (taskId, payload) => {
  const hasAttachment = Boolean(payload?.attachment?.uri && !payload?.attachment?.existing);
  if (!hasAttachment) {
    const client = await getApiClient();
    const response = await client.patch(`/communication/tasks/${taskId}`, payload);
    return response.data;
  }

  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("description", payload.description || "");
  formData.append("taskType", payload.taskType || "General");
  formData.append("priority", payload.priority || "Medium");
  formData.append("status", payload.status || "Pending");
  formData.append("dueDate", payload.dueDate);
  if (payload.dueTime) formData.append("dueTime", payload.dueTime);
  if (payload.assignedTo) formData.append("assignedTo", payload.assignedTo);
  if (payload.relatedEnquiryId) formData.append("relatedEnquiryId", payload.relatedEnquiryId);
  appendAttachmentIfAny(formData, payload.attachment);

  const header = await getAuthHeader(true);
  const response = await axios.patch(
    `${API_URL}/communication/tasks/${taskId}`,
    formData,
    header,
  );
  return response.data;
};
