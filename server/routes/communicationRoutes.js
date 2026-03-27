const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const CommunicationMessage = require("../models/CommunicationMessage");
const CommunicationTask = require("../models/CommunicationTask");
const User = require("../models/User");
const Enquiry = require("../models/Enquiry");
const { verifyToken } = require("../middleware/auth");
const { requireCompany, requireRole } = require("../middleware/tenant");
const {
  buildSafeUploadName,
  createFileFilter,
  sanitizeFilename,
} = require("../utils/uploadSecurity");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads/communication");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    cb(
      null,
      buildSafeUploadName({
        prefix: file.fieldname || "attachment",
        originalname: file.originalname,
        fallbackExt: ".bin",
      }),
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedMimePatterns: [
      /^image\/(jpeg|png|gif|webp)$/,
      /^audio\/(mpeg|mp3|wav|ogg|aac|webm)$/,
      "application/pdf",
      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    allowedExtensions: [
      ".jpg", ".jpeg", ".png", ".gif", ".webp",
      ".mp3", ".wav", ".ogg", ".aac", ".webm",
      ".pdf", ".txt", ".zip", ".doc", ".docx",
    ],
    message: "Unsupported attachment type.",
  }),
});

const toObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(String(value || ""))) return null;
  return new mongoose.Types.ObjectId(String(value));
};

const normalizeRole = (value) =>
  String(value || "").trim().toLowerCase() === "admin" ? "Admin" : "Staff";

const toIsoDate = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
  return d.toISOString().split("T")[0];
};

const buildAttachmentPayload = (file) => {
  if (!file) return {};
  const relativePath = `/uploads/communication/${file.filename}`;
  const mimeType = String(file.mimetype || "");
  const isImage = mimeType.startsWith("image/");
  const isAudio = mimeType.startsWith("audio/");
  const isPdf = mimeType === "application/pdf";
  return {
    attachmentUrl: relativePath,
    attachmentName: sanitizeFilename(file.originalname || file.filename, "attachment"),
    attachmentMimeType: mimeType,
    messageType: isImage ? "image" : isAudio ? "audio" : isPdf ? "pdf" : "document",
  };
};

const populateTaskQuery = (query) =>
  query
    .populate("assignedTo", "name role")
    .populate("createdBy", "name role")
    .populate("relatedEnquiryId", "name enqNo");

const getCompanyTeam = async (companyId) =>
  User.find({
    company_id: companyId,
    role: { $in: ["Admin", "admin", "Staff", "staff"] },
    status: "Active",
  })
    .select("name email mobile role createdAt")
    .sort({ role: 1, createdAt: 1 })
    .lean();

const getTeamMember = async (companyId, userId) =>
  User.findOne({
    _id: userId,
    company_id: companyId,
    role: { $in: ["Admin", "admin", "Staff", "staff"] },
    status: "Active",
  })
    .select("name email mobile role createdAt")
    .lean();

const emitToUsers = (req, userIds, eventName, payload) => {
  const io = req.app.get("io");
  if (!io) return;
  [...new Set((userIds || []).map((id) => String(id || "")).filter(Boolean))].forEach((userId) => {
    io.to(`user:${userId}`).emit(eventName, payload);
  });
};

const canViewAllCompanyTasks = (role) => String(role || "").toLowerCase() === "admin";

const normalizeCommunicationCallStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "incoming") return "incoming";
  if (status === "outgoing") return "outgoing";
  if (status === "missed") return "missed";
  if (status === "not_attended" || status === "not attended") return "not_attended";
  return "";
};

const getCommunicationCallLabel = (status) => {
  switch (normalizeCommunicationCallStatus(status)) {
    case "incoming":
      return "Incoming call";
    case "outgoing":
      return "Outgoing call";
    case "missed":
      return "Missed call";
    case "not_attended":
      return "Not attended call";
    default:
      return "Call";
  }
};

router.get(
  "/team",
  verifyToken,
  requireCompany,
  requireRole(["Admin", "Staff"]),
  async (req, res) => {
    try {
      const team = await getCompanyTeam(req.companyId);
      res.json(team);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/threads",
  verifyToken,
  requireCompany,
  requireRole(["Admin", "Staff"]),
  async (req, res) => {
    try {
      const currentUserId = toObjectId(req.userId);
      const companyId = toObjectId(req.companyId);

      const [team, latestMessages, unreadCounts] = await Promise.all([
        getCompanyTeam(req.companyId),
        CommunicationMessage.aggregate([
          {
            $match: {
              companyId,
              $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
            },
          },
          {
            $addFields: {
              teammateId: {
                $cond: [{ $eq: ["$senderId", currentUserId] }, "$receiverId", "$senderId"],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$teammateId",
              lastMessage: { $first: "$message" },
              messageType: { $first: "$messageType" },
              callStatus: { $first: "$callStatus" },
              createdAt: { $first: "$createdAt" },
              attachmentName: { $first: "$attachmentName" },
            },
          },
        ]),
        CommunicationMessage.aggregate([
          {
            $match: {
              companyId,
              receiverId: currentUserId,
              readBy: { $ne: currentUserId },
            },
          },
          {
            $group: {
              _id: "$senderId",
              unreadCount: { $sum: 1 },
            },
          },
        ]),
      ]);

      const latestMap = new Map(latestMessages.map((item) => [String(item._id), item]));
      const unreadMap = new Map(unreadCounts.map((item) => [String(item._id), item.unreadCount]));

      const data = team
        .filter((member) => String(member._id) !== String(req.userId))
        .map((member) => {
          const latest = latestMap.get(String(member._id));
          return {
            member,
            lastMessage:
              latest?.lastMessage ||
              (latest?.messageType === "call"
                ? getCommunicationCallLabel(latest?.callStatus)
                : latest?.messageType === "audio"
                ? "Voice message"
                : latest?.messageType === "task"
                ? "Task shared"
                : latest?.attachmentName || ""),
            messageType: latest?.messageType || "",
            callStatus: latest?.callStatus || "",
            lastMessageAt: latest?.createdAt || null,
            unreadCount: unreadMap.get(String(member._id)) || 0,
          };
        })
        .sort((a, b) => {
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime || a.member.name.localeCompare(b.member.name);
        });

      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/messages/:memberId",
  verifyToken,
  requireCompany,
  requireRole(["Admin", "Staff"]),
  async (req, res) => {
    try {
      const teammate = await getTeamMember(req.companyId, req.params.memberId);
      if (!teammate) return res.status(404).json({ error: "Team member not found" });

      await CommunicationMessage.updateMany(
        {
          companyId: req.companyId,
          senderId: req.params.memberId,
          receiverId: req.userId,
          readBy: { $ne: req.userId },
        },
        { $addToSet: { readBy: req.userId } },
      );

      const messages = await CommunicationMessage.find({
        companyId: req.companyId,
        $or: [
          { senderId: req.userId, receiverId: req.params.memberId },
          { senderId: req.params.memberId, receiverId: req.userId },
        ],
      })
        .populate("senderId", "name role")
        .populate("receiverId", "name role")
        .populate("taskId", "title status dueDate priority")
        .sort({ createdAt: 1 })
        .limit(300)
        .lean();

      res.json({ teammate, messages });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/messages",
  verifyToken,
  requireCompany,
  requireRole(["Admin", "Staff"]),
  upload.single("attachment"),
  async (req, res) => {
    try {
      const receiverId = String(req.body.receiverId || "").trim();
      const text = String(req.body.message || "").trim();
      const messageType = String(req.body.messageType || "").trim().toLowerCase();
      const callStatus = normalizeCommunicationCallStatus(req.body.callStatus);
      const isCallMessage = messageType === "call";
      const teammate = await getTeamMember(req.companyId, receiverId);
      if (!teammate) return res.status(404).json({ error: "Receiver not found" });

      const attachmentPayload = buildAttachmentPayload(req.file);
      if (!text && !attachmentPayload.attachmentUrl && !isCallMessage) {
        return res.status(400).json({ error: "Message or attachment is required" });
      }
      if (isCallMessage && !callStatus) {
        return res.status(400).json({ error: "Valid call status is required" });
      }

      const callTimeValue = req.body.callTime ? new Date(req.body.callTime) : null;
      const hasValidCallTime = callTimeValue && !Number.isNaN(callTimeValue.getTime());
      const callDuration = Number(req.body.callDuration || 0);

      const messagePayload = {
        companyId: req.companyId,
        senderId: req.userId,
        receiverId,
        senderRole: normalizeRole(req.user.role),
        receiverRole: normalizeRole(teammate.role),
        message: text || (isCallMessage ? getCommunicationCallLabel(callStatus) : ""),
        messageType: isCallMessage
          ? "call"
          : attachmentPayload.messageType || "text",
        callDuration: isCallMessage && Number.isFinite(callDuration) ? callDuration : 0,
        callTime: isCallMessage && hasValidCallTime ? callTimeValue : null,
        readBy: [req.userId],
        ...attachmentPayload,
      };
      if (isCallMessage) {
        messagePayload.callStatus = callStatus;
      }

      const message = await CommunicationMessage.create(messagePayload);

      const populated = await CommunicationMessage.findById(message._id)
        .populate("senderId", "name role")
        .populate("receiverId", "name role")
        .lean();

      emitToUsers(
        req,
        [req.userId, receiverId],
        "COMMUNICATION_MESSAGE_CREATED",
        populated,
      );

      res.status(201).json(populated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.get(
  "/tasks",
  verifyToken,
  requireCompany,
  requireRole(["Admin", "Staff"]),
  async (req, res) => {
    try {
      const status = String(req.query.status || "pending").trim().toLowerCase();
      const canViewAll = canViewAllCompanyTasks(req.user.role);
      const query = {
        companyId: req.companyId,
      };

      if (!canViewAll) {
        query.$or = [{ assignedTo: req.userId }, { createdBy: req.userId }];
      }

      if (status === "pending") {
        query.status = { $in: ["Pending", "In Progress"] };
      } else if (status === "completed") {
        query.status = "Completed";
      } else if (status !== "all") {
        query.status = status;
      }

      const tasks = await CommunicationTask.find(query)
        .populate("assignedTo", "name role")
        .populate("createdBy", "name role")
        .populate("relatedEnquiryId", "name enqNo")
        .sort({ status: 1, dueDate: 1, createdAt: -1 })
        .limit(300)
        .lean();

      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.post(
  "/tasks",
  verifyToken,
  requireCompany,
  requireRole(["Admin"]),
  upload.single("attachment"),
  async (req, res) => {
    try {
      const title = String(req.body.title || "").trim();
      if (!title) return res.status(400).json({ error: "Task title is required" });

      const assignedTo = String(req.body.assignedTo || "").trim();
      let assignee = null;
      if (assignedTo) {
        assignee = await getTeamMember(req.companyId, assignedTo);
        if (!assignee) return res.status(404).json({ error: "Assignee not found" });
      }

      const enquiryId = String(req.body.relatedEnquiryId || "").trim();
      if (enquiryId) {
        const enquiry = await Enquiry.findOne({
          _id: enquiryId,
          userId: { $in: await User.find({ company_id: req.companyId }).distinct("_id") },
        })
          .select("_id")
          .lean();
        if (!enquiry) return res.status(404).json({ error: "Related enquiry not found" });
      }

      const filePayload = req.file
        ? {
            attachmentUrl: `/uploads/communication/${req.file.filename}`,
            attachmentName: req.file.originalname || req.file.filename,
            attachmentMimeType: req.file.mimetype || "",
          }
        : {};

      const task = await CommunicationTask.create({
        companyId: req.companyId,
        relatedEnquiryId: enquiryId || null,
        title,
        description: String(req.body.description || "").trim(),
        taskType: String(req.body.taskType || "General").trim() || "General",
        priority: String(req.body.priority || "Medium").trim() || "Medium",
        status: "Pending",
        assignedTo: assignedTo || null,
        assignedRole: assignee ? normalizeRole(assignee.role) : "",
        createdBy: req.userId,
        dueDate: toIsoDate(req.body.dueDate),
        dueTime: String(req.body.dueTime || "").trim(),
        lastComment: String(req.body.description || "").trim(),
        ...filePayload,
      });

      const populatedTask = await CommunicationTask.findById(task._id)
        .populate("assignedTo", "name role")
        .populate("createdBy", "name role")
        .populate("relatedEnquiryId", "name enqNo")
        .lean();

      if (assignedTo && String(assignedTo) !== String(req.userId)) {
        const taskMessage = await CommunicationMessage.create({
          companyId: req.companyId,
          senderId: req.userId,
          receiverId: assignedTo,
          senderRole: normalizeRole(req.user.role),
          receiverRole: normalizeRole(assignee?.role),
          message: `New task: ${title}`,
          messageType: "task",
          taskId: task._id,
          readBy: [req.userId],
        });

        emitToUsers(req, [req.userId, assignedTo], "COMMUNICATION_MESSAGE_CREATED", taskMessage);
      }

      emitToUsers(
        req,
        [req.userId, assignedTo].filter(Boolean),
        "COMMUNICATION_TASK_UPDATED",
        populatedTask,
      );

      res.status(201).json(populatedTask);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.patch(
  "/tasks/:id",
  verifyToken,
  requireCompany,
  requireRole(["Admin"]),
  upload.single("attachment"),
  async (req, res) => {
    try {
      const query = { _id: req.params.id, companyId: req.companyId };

      const existingTask = await CommunicationTask.findOne(query)
        .select("_id companyId createdBy assignedTo status attachmentUrl")
        .lean();
      if (!existingTask) return res.status(404).json({ error: "Task not found" });

      const title = String(req.body.title || "").trim();
      if (!title) return res.status(400).json({ error: "Task title is required" });

      const assignedTo = String(req.body.assignedTo || "").trim();
      let assignee = null;
      if (assignedTo) {
        assignee = await getTeamMember(req.companyId, assignedTo);
        if (!assignee) return res.status(404).json({ error: "Assignee not found" });
      }

      const nextStatus = String(req.body.status || existingTask.status || "Pending").trim();
      if (!["Pending", "In Progress", "Completed", "Cancelled"].includes(nextStatus)) {
        return res.status(400).json({ error: "Invalid task status" });
      }

      const update = {
        title,
        description: String(req.body.description || "").trim(),
        taskType: String(req.body.taskType || "General").trim() || "General",
        priority: String(req.body.priority || "Medium").trim() || "Medium",
        assignedTo: assignedTo || null,
        assignedRole: assignee ? normalizeRole(assignee.role) : "",
        dueDate: toIsoDate(req.body.dueDate),
        dueTime: String(req.body.dueTime || "").trim(),
        status: nextStatus,
        lastComment: String(req.body.description || "").trim(),
        completedAt: nextStatus === "Completed" ? new Date() : null,
      };

      if (req.file) {
        update.attachmentUrl = `/uploads/communication/${req.file.filename}`;
        update.attachmentName = req.file.originalname || req.file.filename;
        update.attachmentMimeType = req.file.mimetype || "";
      }

      const task = await populateTaskQuery(
        CommunicationTask.findOneAndUpdate(query, { $set: update }, { new: true }),
      ).lean();

      emitToUsers(
        req,
        [task?.createdBy?._id, task?.assignedTo?._id].filter(Boolean),
        "COMMUNICATION_TASK_UPDATED",
        task,
      );

      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

router.patch(
  "/tasks/:id/status",
  verifyToken,
  requireCompany,
  requireRole(["Admin", "Staff"]),
  async (req, res) => {
    try {
      const nextStatus = String(req.body.status || "").trim();
      if (!["Pending", "In Progress", "Completed", "Cancelled"].includes(nextStatus)) {
        return res.status(400).json({ error: "Invalid task status" });
      }

      const query = { _id: req.params.id, companyId: req.companyId };
      if (nextStatus === "Pending") {
        if (canViewAllCompanyTasks(req.user.role)) {
          query.status = "Completed";
        } else {
          query.assignedTo = req.userId;
          query.status = "Completed";
        }
      } else {
        query.assignedTo = req.userId;
      }

      const update = {
        status: nextStatus,
        completedAt: nextStatus === "Completed" ? new Date() : null,
      };

      const task = await populateTaskQuery(
        CommunicationTask.findOneAndUpdate(query, { $set: update }, { new: true }),
      ).lean();

      if (!task) return res.status(404).json({ error: "Task not found" });

      emitToUsers(
        req,
        [task.createdBy?._id, task.assignedTo?._id].filter(Boolean),
        "COMMUNICATION_TASK_UPDATED",
        task,
      );

      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

module.exports = router;
