import axios from "axios";
import { Platform } from "react-native";
import getApiClient from "./apiClient";
import { API_URL } from "./apiConfig";
import { getAuthToken } from "./secureTokenStorage";

const getAuthHeader = async (isMultipart = false) => {
  const token = await getAuthToken();
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return { headers };
};

const appendAttachmentIfAny = async (formData, attachment, fieldName = "attachment") => {
  if (!attachment?.uri) return;
  if (Platform.OS === "web" && attachment.file) {
    formData.append(fieldName, attachment.file);
  } else if (Platform.OS === "web") {
    try {
      const res = await fetch(attachment.uri);
      const blob = await res.blob();
      formData.append(fieldName, blob, attachment.name || "attachment");
    } catch {
      // Ignore
    }
  } else {
    formData.append(fieldName, {
      uri: attachment.uri,
      type: attachment.type || "application/octet-stream",
      name: attachment.name || "attachment",
    });
  }
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

export const getConversationMessages = async (memberId, options = {}) => {
  const client = await getApiClient();
  const params = {};
  if (options?.limit != null) params.limit = options.limit;
  if (options?.before) params.before = options.before;
  if (options?.beforeId) params.beforeId = options.beforeId;
  const response = await client.get(`/communication/messages/${memberId}`, {
    params,
  });
  return response.data;
};

export const getGroupMessages = async (groupId, options = {}) => {
  const client = await getApiClient();
  const params = {};
  if (options?.limit != null) params.limit = options.limit;
  if (options?.before) params.before = options.before;
  if (options?.beforeId) params.beforeId = options.beforeId;
  const response = await client.get(`/communication/messages/group/${groupId}`, {
    params,
  });
  return response.data;
};

export const sendCommunicationMessage = async ({
  receiverId,
  groupId,
  message,
  attachment,
  messageType,
  callStatus,
  callDuration,
  callTime,
  replyTo,
}) => {
  if (!attachment) {
    const client = await getApiClient();
    const response = await client.post("/communication/messages", {
      receiverId,
      groupId,
      message,
      messageType,
      callStatus,
      callDuration,
      callTime,
      replyTo,
    });
    return response.data;
  }

  const formData = new FormData();
  if (groupId) {
    formData.append("groupId", groupId);
  } else {
    formData.append("receiverId", receiverId);
  }
  if (message) formData.append("message", message);
  if (messageType) formData.append("messageType", messageType);
  if (callStatus) formData.append("callStatus", callStatus);
  if (callDuration != null) formData.append("callDuration", String(callDuration));
  if (callTime) formData.append("callTime", callTime);
  if (replyTo) formData.append("replyTo", replyTo);
  await appendAttachmentIfAny(formData, attachment);
  const header = await getAuthHeader(true);
  const response = await fetch(`${API_URL}/communication/messages`, {
    method: "POST",
    headers: header.headers,
    body: formData,
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw { response: { data: { error: errData.error || "Failed to send message" } } };
  }
  return await response.json();
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
  if (payload.groupId) formData.append("groupId", payload.groupId);
  if (payload.relatedEnquiryId) formData.append("relatedEnquiryId", payload.relatedEnquiryId);
  await appendAttachmentIfAny(formData, payload.attachment);

  const header = await getAuthHeader(true);
  const response = await fetch(`${API_URL}/communication/tasks`, {
    method: "POST",
    headers: header.headers,
    body: formData,
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw { response: { data: { error: errData.error || "Failed to create task" } } };
  }
  return await response.json();
};

export const updateCommunicationTaskStatus = async (taskId, status, remark = "") => {
  const client = await getApiClient();
  const response = await client.patch(`/communication/tasks/${taskId}/status`, {
    status,
    remark,
  });
  return response.data;
};

export const updateCommunicationTaskRemark = async (taskId, remarkId, remark) => {
  const client = await getApiClient();
  const response = await client.patch(`/communication/tasks/${taskId}/remarks/${remarkId}`, {
    remark,
  });
  return response.data;
};

export const deleteCommunicationTaskRemark = async (taskId, remarkId) => {
  const client = await getApiClient();
  const response = await client.delete(`/communication/tasks/${taskId}/remarks/${remarkId}`);
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
  await appendAttachmentIfAny(formData, payload.attachment);

  const header = await getAuthHeader(true);
  const response = await fetch(`${API_URL}/communication/tasks/${taskId}`, {
    method: "PATCH",
    headers: header.headers,
    body: formData,
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw { response: { data: { error: errData.error || "Failed to update task" } } };
  }
  return await response.json();
};

export const deleteCommunicationTask = async (taskId) => {
  const client = await getApiClient();
  const response = await client.delete(`/communication/tasks/${taskId}`);
  return response.data;
};

// ── Group management ──────────────────────────────────────────────────────────

export const createCommunicationGroup = async ({ name, members, meetingLink, bio }) => {
  const client = await getApiClient();
  const response = await client.post("/communication/groups", { name, members, meetingLink, bio });
  return response.data;
};

export const deleteCommunicationGroup = async (groupId) => {
  const client = await getApiClient();
  const response = await client.delete(`/communication/groups/${groupId}`);
  return response.data;
};

export const updateCommunicationGroup = async (groupId, { name, members, logo, meetingLink, bio }) => {
  const hasLogo = Boolean(logo?.uri);
  if (!hasLogo) {
    const client = await getApiClient();
    const response = await client.patch(`/communication/groups/${groupId}`, { name, members, meetingLink, bio });
    return response.data;
  }

  const formData = new FormData();
  if (name) formData.append("name", name);
  if (members) formData.append("members", JSON.stringify(members));
  if (meetingLink !== undefined) formData.append("meetingLink", meetingLink);
  if (bio !== undefined) formData.append("bio", bio);
  
  if (Platform.OS === "web" && logo.file) {
    formData.append("logo", logo.file);
  } else if (Platform.OS === "web") {
    try {
      const res = await fetch(logo.uri);
      const blob = await res.blob();
      formData.append("logo", blob, logo.name || "logo.jpg");
    } catch {
      // Ignore
    }
  } else {
    formData.append("logo", {
      uri: logo.uri,
      type: logo.type || "image/jpeg",
      name: logo.name || "logo.jpg",
    });
  }

  const header = await getAuthHeader(true);
  const response = await fetch(`${API_URL}/communication/groups/${groupId}`, {
    method: "PATCH",
    headers: header.headers,
    body: formData,
  });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw { response: { data: { error: errData.error || "Failed to update group" } } };
  }
  
  return await response.json();
};
