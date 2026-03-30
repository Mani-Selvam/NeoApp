const express = require("express");
const router = express.Router();
const Enquiry = require("../models/Enquiry");
const User = require("../models/User");
const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const ChatMessage = require("../models/ChatMessage");
const MessageTemplate = require("../models/MessageTemplate");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");
const {
  extractProviderMessageMeta,
  loadWhatsappConfig,
  normalizePhoneNumber,
  sendWhatsAppMessage,
} = require("../utils/whatsappConfigService");
const {
  buildSafeUploadName,
  createFileFilter,
} = require("../utils/uploadSecurity");

const ENQUIRY_STATUS_MAP = {
  "new": "New",
  "contacted": "Contacted",
  "interested": "Interested",
  "not interested": "Not Interested",
  "not_interested": "Not Interested",
  "not-interested": "Not Interested",
  "converted": "Converted",
  "closed": "Closed",
  // Legacy aliases
  "in progress": "Contacted",
  "in_progress": "Contacted",
  "dropped": "Not Interested",
  "drop": "Not Interested",
};

const ENQUIRY_STATUS_QUERY_MAP = {
  New: ["New"],
  Contacted: ["Contacted", "In Progress"],
  Interested: ["Interested"],
  "Not Interested": ["Not Interested", "Dropped"],
  Converted: ["Converted"],
  Closed: ["Closed"],
};

const normalizeEnquiryStatus = (raw) => {
  if (!raw) return "New";
  const key = String(raw).trim().toLowerCase();
  return ENQUIRY_STATUS_MAP[key] || raw;
};

const deriveFollowUpEnquiryStatus = (followUp, currentEnquiryStatus) => {
  const explicitStatus = normalizeEnquiryStatus(followUp?.enquiryStatus);
  if (explicitStatus && explicitStatus !== "New") return explicitStatus;
  if (followUp?.enquiryStatus) return explicitStatus;

  const typeText = String(followUp?.activityType || followUp?.type || "").trim().toLowerCase();
  const noteText = String(followUp?.note || followUp?.remarks || "").trim().toLowerCase();
  const nextAction = String(followUp?.nextAction || "").trim().toLowerCase();

  if (typeText === "system" || noteText === "enquiry created") {
    return "New";
  }
  if (nextAction === "sales") return "Converted";
  if (nextAction === "drop") return "Not Interested";

  return normalizeEnquiryStatus(currentEnquiryStatus || "New");
};

const toIsoDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
};

const getEnquiryAccessScope = async (req) => {
  const normalizedRole = String(req.user?.role || "").trim().toLowerCase();
  const companyId = req.user?.company_id;

  if (normalizedRole === "staff") {
    if (companyId) {
      const companyUsers = await User.find({ company_id: companyId })
        .select("_id")
        .lean();

      const ownerUserIds = companyUsers
        .map((item) => item?._id)
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

      return {
        ownerUserIds: ownerUserIds.length > 0 ? ownerUserIds : [req.userId],
        scopingFilter: { assignedTo: req.userId },
      };
    }

    return {
      ownerUserIds: [req.user?.parentUserId || req.userId],
      scopingFilter: { assignedTo: req.userId },
    };
  }

  if (companyId) {
    const companyUsers = await User.find({ company_id: companyId })
      .select("_id")
      .lean();

    const ownerUserIds = companyUsers
      .map((item) => item?._id)
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

    if (ownerUserIds.length > 0) {
      return {
        ownerUserIds,
        scopingFilter: {},
      };
    }
  }

  return {
    ownerUserIds: [req.userId],
    scopingFilter: {},
  };
};

const buildOwnerScopedFilter = (scope) => {
  const ownerUserIds = Array.isArray(scope?.ownerUserIds)
    ? scope.ownerUserIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    : [];

  const userId =
    ownerUserIds.length <= 1 ? ownerUserIds[0] || null : { $in: ownerUserIds };

  return {
    userId,
    ...(scope?.scopingFilter || {}),
  };
};

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      buildSafeUploadName({
        prefix: file.fieldname || "image",
        originalname: file.originalname,
        fallbackExt: ".jpg",
      }),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: createFileFilter({
    allowedMimePatterns: [/^image\/(jpeg|png|gif|webp)$/],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    message: "Only image files are allowed!",
  }),
});

// Helper: Generate next enquiry number by querying the database
// Helper: Generate next enquiry number efficiently
const generateEnquiryNumber = async (companyId) => {
  try {
    const query = companyId ? { companyId } : {};
    const latestEnquiry = await Enquiry.findOne(query, { enqNo: 1 })
      .sort({ createdAt: -1 })
      .lean();

    let nextNumber = 1;

    if (latestEnquiry && latestEnquiry.enqNo) {
      const match = latestEnquiry.enqNo.match(/\d+/);
      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

    return `ENQ-${String(nextNumber).padStart(3, "0")}`;
  } catch (error) {
    console.error("Error generating enquiry number:", error);
    const count = await Enquiry.countDocuments(companyId ? { companyId } : {});
    return `ENQ-${String(count + 1).padStart(3, "0")}`;
  }
};

const emitEnquiryCreated = async (req, enquiry, companyId) => {
  try {
    const io = req.app?.get("io");
    if (!io || !enquiry || !companyId) return;

    const companyUsers = await User.find({ company_id: companyId })
      .select("_id")
      .lean();

    companyUsers.forEach((member) => {
      const userId = String(member?._id || "");
      if (!userId) return;
      io.to(`user:${userId}`).emit("ENQUIRY_CREATED", {
        _id: enquiry._id,
        enqNo: enquiry.enqNo,
        assignedTo: enquiry.assignedTo,
        userId: enquiry.userId,
        companyId: String(companyId),
      });
    });
  } catch (_socketError) {
    // ignore real-time fanout issues
  }
};

const emitEnquiryUpdated = async (req, enquiry, companyId) => {
  try {
    const io = req.app?.get("io");
    if (!io || !enquiry) return;

    if (companyId) {
      const companyUsers = await User.find({ company_id: companyId })
        .select("_id")
        .lean();

      companyUsers.forEach((member) => {
        const userId = String(member?._id || "");
        if (!userId) return;
        io.to(`user:${userId}`).emit("ENQUIRY_UPDATED", {
          _id: enquiry._id,
          enqNo: enquiry.enqNo,
          assignedTo: enquiry.assignedTo,
          userId: enquiry.userId,
          status: enquiry.status,
          companyId: String(companyId),
        });
      });
      return;
    }

    const fallbackUserId = String(req.userId || "");
    if (fallbackUserId) {
      io.to(`user:${fallbackUserId}`).emit("ENQUIRY_UPDATED", {
        _id: enquiry._id,
        enqNo: enquiry.enqNo,
        assignedTo: enquiry.assignedTo,
        userId: enquiry.userId,
        status: enquiry.status,
      });
    }
  } catch (_socketError) {
    // ignore real-time fanout issues
  }
};

// GET ALL ENQUIRIES (With Search/Filter & Pagination)
router.get("/", verifyToken, async (req, res) => {
  const _start = Date.now();
  try {
    const {
      search,
      status,
      date,
      followUpDate,
      dateFrom,
      dateTo,
      assignedTo,
      page = 1,
      limit = 20,
    } = req.query;
    const response = await (async () => {
      const scope = await getEnquiryAccessScope(req);
      let query = buildOwnerScopedFilter(scope);

      if (!query.userId) {
        if (req.user.role === "Staff")
          return {
            data: [],
            pagination: {
              total: 0,
              page: 1,
              limit: limit,
              pages: 0,
            },
          };
      }

      if (date) {
        query.date = date;
      } else if (dateFrom || dateTo) {
        query.date = {};
        if (dateFrom) query.date.$gte = dateFrom;
        if (dateTo) query.date.$lte = dateTo;
      }

      if (assignedTo && assignedTo !== "all") {
        query.assignedTo = assignedTo;
      }

      if (followUpDate) {
        const followUpScope = {
          userId: query.userId,
          date: followUpDate,
        };
        if (query.assignedTo) followUpScope.assignedTo = query.assignedTo;

        const matchingFollowUps = await FollowUp.find(followUpScope)
          .select("enqId")
          .lean();

        const followUpEnquiryIds = [
          ...new Set(
            matchingFollowUps
              .map((item) => item.enqId)
              .filter((id) => mongoose.Types.ObjectId.isValid(String(id))),
          ),
        ];

        if (followUpEnquiryIds.length === 0) {
          return {
            data: [],
            pagination: {
              total: 0,
              page: 1,
              limit: Number(limit),
              pages: 0,
            },
          };
        }

        query._id = { $in: followUpEnquiryIds };
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { mobile: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { enqNo: { $regex: search, $options: "i" } },
        ];
      }

      const selectedStatusFilter =
        status && status !== "All" ? normalizeEnquiryStatus(status) : "";

      if (selectedStatusFilter && !followUpDate) {
        const acceptedStatuses =
          ENQUIRY_STATUS_QUERY_MAP[selectedStatusFilter] || [selectedStatusFilter];
        query.status = { $in: acceptedStatuses };
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const enquiries = await Enquiry.find(query)
        .select(
          "name mobile email image product enqNo status enqType date enquiryDateTime createdAt cost address source lastContactedAt assignedTo",
        )
        .populate("assignedTo", "name email mobile role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum + 1)
        .lean();

      const scopedEnquiries = enquiries.slice(0, limitNum);
      const enquiryIds = scopedEnquiries.map((item) => item._id).filter(Boolean);

      if (enquiryIds.length > 0) {
        const followUpScope = {
          userId: query.userId,
          enqId: { $in: enquiryIds },
        };
        if (query.assignedTo) followUpScope.assignedTo = query.assignedTo;
        if (followUpDate) followUpScope.date = followUpDate;

        const latestFollowUps = await FollowUp.find(followUpScope)
          .select("enqId nextFollowUpDate followUpDate date activityTime createdAt enquiryStatus nextAction activityType type note remarks")
          .sort({ activityTime: -1, createdAt: -1 })
          .lean();

        const latestByEnquiryId = new Map();
        latestFollowUps.forEach((item) => {
          const key = String(item.enqId || "");
          if (!key || latestByEnquiryId.has(key)) return;
          latestByEnquiryId.set(key, item);
        });

        enquiries.forEach((item) => {
          const latest = latestByEnquiryId.get(String(item._id));
          if (!latest) return;
          item.latestFollowUpDate =
            latest.nextFollowUpDate || latest.followUpDate || latest.date || null;
          item.latestFollowUpAt = latest.activityTime || latest.createdAt || null;
          item.selectedFollowUpDate =
            latest.date || latest.nextFollowUpDate || latest.followUpDate || null;
          item.selectedEnquiryStatus = deriveFollowUpEnquiryStatus(latest, item.status);
          if (followUpDate) {
            item.currentEnquiryStatus = item.status;
            item.status = item.selectedEnquiryStatus;
          }
        });

        if (selectedStatusFilter && followUpDate) {
          const acceptedStatuses =
            ENQUIRY_STATUS_QUERY_MAP[selectedStatusFilter] || [selectedStatusFilter];
          for (let i = enquiries.length - 1; i >= 0; i -= 1) {
            if (!acceptedStatuses.includes(normalizeEnquiryStatus(enquiries[i]?.status))) {
              enquiries.splice(i, 1);
            }
          }
        }
      }

      const hasMore = enquiries.length > limitNum;
      if (hasMore) enquiries.pop();

      return {
        data: enquiries,
        pagination: {
          total: hasMore ? pageNum * limitNum + 1 : skip + enquiries.length,
          page: pageNum,
          limit: limitNum,
          pages: hasMore ? pageNum + 1 : pageNum,
        },
      };
    })();

    res.json(response);
    console.log(
      `⚡ GET /enquiries — ${Date.now() - _start}ms DB (${response.data?.length || 0} items, status=${status || "all"}, page ${page})`,
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const resolveAssignee = async ({ requestedAssignedTo, ownerId, actorId, actor }) => {
  const actorRole = String(actor?.role || "").toLowerCase();
  if (actorRole === "staff") return actorId;

  const scopeUserId = actor?.parentUserId || ownerId;
  const actorDoc = await User.findById(scopeUserId).select("company_id").lean();
  const companyId = actor?.company_id || actorDoc?.company_id || null;

  if (requestedAssignedTo && requestedAssignedTo !== "all" && companyId) {
    const validAssignee = await User.findOne({
      _id: requestedAssignedTo,
      company_id: companyId,
      status: "Active",
      role: { $in: ["admin", "Admin", "staff", "Staff"] },
    })
      .select("_id")
      .lean();

    if (validAssignee?._id) return validAssignee._id;
  }

  return null;
};

// ADD NEW ENQUIRY (with optional image upload)
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    const { name, mobile, product, cost } = req.body;

    if (!name || !mobile || !product || !cost) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let imageData = null;
    if (req.file) {
      imageData = `/uploads/${req.file.filename}`;
    } else if (req.body.image) {
      imageData = req.body.image;
    }

    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;
    const ownerUser = await User.findById(ownerId).select("company_id").lean();
    const companyId = req.user?.company_id || ownerUser?.company_id || null;

    const assignedTo = await resolveAssignee({
      requestedAssignedTo: req.body.assignedTo,
      ownerId,
      actorId: req.userId,
      actor: req.user,
    });

    const enquiryDateTime = new Date();
    const normalizedStatus = normalizeEnquiryStatus(req.body.status || "New");
    const basePayload = {
      ...req.body,
      companyId,
      userId: ownerId,
      assignedTo,
      enqBy: req.user.name,
      image: imageData,
      date: toIsoDate(req.body.date) || enquiryDateTime.toISOString().split("T")[0],
      enquiryDateTime,
      status: normalizedStatus,
    };

    let savedEnquiry = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const enqNo = await generateEnquiryNumber(companyId);
        savedEnquiry = await new Enquiry({
          enqNo,
          ...basePayload,
        }).save();
        break;
      } catch (saveError) {
        if (saveError?.code !== 11000) throw saveError;
      }
    }

    if (!savedEnquiry) {
      const fallbackEnqNo = `ENQ-${Date.now().toString().slice(-6)}`;
      savedEnquiry = await new Enquiry({
        enqNo: fallbackEnqNo,
        ...basePayload,
      }).save();
    }

    // --- AUTO-SEND INTRO TEMPLATE (if available) ---
    try {
      const cleanMobile = (savedEnquiry.mobile || "").replace(/\D/g, "");
      const short10 =
        cleanMobile.length > 10 ? cleanMobile.slice(-10) : cleanMobile;
      const companyId = req.user?.company_id || null;
      const cfg = await loadWhatsappConfig(
        companyId ? { companyId } : { ownerUserId: ownerId },
      );
      const normalizedPhone = normalizePhoneNumber(
        cleanMobile,
        cfg?.defaultCountry || "91",
      );

      // Look for an 'intro' template for this user (keyword or name contains 'intro')
      const introTemplate = await MessageTemplate.findOne({
        userId: ownerId,
        status: "Active",
        $or: [
          { keyword: { $regex: "^intro$", $options: "i" } },
          { keyword: { $regex: "intro", $options: "i" } },
          { name: { $regex: "intro", $options: "i" } },
        ],
      }).lean();

      if (introTemplate && cfg) {
        try {
          const sendResult = await sendWhatsAppMessage({
            ownerUserId: ownerId,
            companyId,
            phoneNumber: normalizedPhone,
            content: introTemplate.content,
          });
          const providerMeta = extractProviderMessageMeta(
            cfg.provider,
            sendResult.response,
          );

          const savedMsg = new ChatMessage({
            userId: ownerId,
            enquiryId: savedEnquiry._id,
            sender: "Admin",
            type: "text",
            content: introTemplate.content,
            phoneNumber: normalizedPhone,
            status: providerMeta.providerOk ? "sent" : "failed",
            externalId: providerMeta.externalId,
            providerTicketId: providerMeta.providerTicketId,
            providerResponse: sendResult.response
              ? JSON.stringify(sendResult.response.data)
              : null,
            timestamp: new Date(),
          });

          await savedMsg.save();

          // Emit to sockets so UI updates immediately
          if (req.app.get("io")) {
            const io = req.app.get("io");
            io.emit(`new_message_${normalizedPhone}`, savedMsg);
            io.emit(`new_message_${short10}`, savedMsg);
            io.emit(`new_message_${cleanMobile}`, savedMsg);
            io.emit("global_new_message", savedMsg);
          }
        } catch (sendErr) {
          console.warn(
            "Auto-send intro template failed:",
            sendErr.response?.data || sendErr.message,
          );
        }
      }
    } catch (autoErr) {
      console.error("Auto-intro flow error:", autoErr.message || autoErr);
    }

    cache.invalidate("enquiries"); // Clear list cache
    cache.invalidate("followups");
    cache.invalidate("dashboard");
    await emitEnquiryCreated(req, savedEnquiry, companyId);
    res.status(201).json(savedEnquiry);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET SINGLE ENQUIRY (Supports both MongoDB ID and enqNo)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    let enquiry;
    const scope = await getEnquiryAccessScope(req);
    const filter = buildOwnerScopedFilter(scope);

    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      enquiry = await Enquiry.findOne({
        _id: req.params.id,
        ...filter,
      })
        .populate("assignedTo", "name email mobile role")
        .lean();
    } else {
      enquiry = await Enquiry.findOne({
        enqNo: req.params.id,
        ...filter,
      })
        .populate("assignedTo", "name email mobile role")
        .lean();
    }

    if (!enquiry) {
      return res
        .status(404)
        .json({ message: "Enquiry not found or unauthorized" });
    }
    res.json(enquiry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET ENQUIRY DETAIL WITH TIMELINE + UPCOMING REMINDERS
router.get("/:id/detail", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const scope = await getEnquiryAccessScope(req);
    const baseFilter = buildOwnerScopedFilter(scope);
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, ...baseFilter }
      : { enqNo: id, ...baseFilter };

    const enquiry = await Enquiry.findOne(query)
      .populate("assignedTo", "name email mobile role")
      .lean();

    if (!enquiry) {
      return res.status(404).json({ message: "Enquiry not found or unauthorized" });
    }

    const timeline = await FollowUp.find({ enqId: enquiry._id, ...baseFilter })
      .find({
        activityType: { $ne: "System" },
        type: { $ne: "System" },
        note: { $ne: "Enquiry created" },
        remarks: { $ne: "Enquiry created" },
      })
      .sort({ activityTime: 1, createdAt: 1 })
      .select(
        "activityType type note remarks followUpDate nextFollowUpDate date staffName assignedTo status nextAction createdAt activityTime",
      )
      .populate("assignedTo", "name")
      .lean();

    const today = new Date().toISOString().split("T")[0];
    const upcomingReminders = timeline.filter((item) => {
      const nextDate = item.nextFollowUpDate || item.followUpDate || item.date;
      const isClosed = ["Completed", "Drop", "Dropped"].includes(item.status);
      return nextDate && nextDate >= today && !isClosed;
    });

    res.json({
      enquiry,
      currentStatus: enquiry.status,
      timeline,
      upcomingReminders,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// QUICK STATUS UPDATE
router.patch("/:id/status", verifyToken, async (req, res) => {
  try {
    const nextStatus = normalizeEnquiryStatus(req.body.status);
    if (!nextStatus) return res.status(400).json({ message: "status is required" });

    const scope = await getEnquiryAccessScope(req);
    const baseFilter = buildOwnerScopedFilter(scope);

    const query = mongoose.Types.ObjectId.isValid(req.params.id)
      ? { _id: req.params.id, ...baseFilter }
      : { enqNo: req.params.id, ...baseFilter };

    const update = { status: nextStatus };
    if (nextStatus === "Converted") update.conversionDate = new Date();

    const enquiry = await Enquiry.findOneAndUpdate(
      query,
      { $set: update },
      { returnDocument: "after" },
    );
    if (!enquiry) return res.status(404).json({ message: "Enquiry not found or unauthorized" });

    cache.invalidate("enquiries");
    cache.invalidate("dashboard");
    cache.invalidate("reports");
    await emitEnquiryUpdated(req, enquiry, req.user?.company_id || enquiry?.companyId || null);
    res.json(enquiry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPCOMING FOLLOW-UP REMINDERS LIST
router.get("/meta/reminders", verifyToken, async (req, res) => {
  try {
    const scope = await getEnquiryAccessScope(req);
    const baseFilter = buildOwnerScopedFilter(scope);

    const today = new Date().toISOString().split("T")[0];
    const reminders = await FollowUp.find({
      ...baseFilter,
      status: { $nin: ["Completed", "Drop", "Dropped"] },
      $or: [
        { nextFollowUpDate: { $gte: today } },
        { date: { $gte: today } },
      ],
    })
      .sort({ nextFollowUpDate: 1, date: 1, createdAt: 1 })
      .limit(200)
      .select("enqId enqNo name mobile followUpDate nextFollowUpDate date activityType status assignedTo")
      .populate("assignedTo", "name")
      .lean();

    res.json({ data: reminders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/meta/followup-status-summary", verifyToken, async (req, res) => {
  try {
    const selectedDate = String(req.query.followUpDate || toIsoDate(new Date()) || "").trim();
    const counts = {
      All: 0,
      New: 0,
      Contacted: 0,
      Interested: 0,
      "Not Interested": 0,
      Converted: 0,
      Closed: 0,
    };

    if (!selectedDate) {
      return res.json({ date: null, total: 0, counts });
    }

    const scope = await getEnquiryAccessScope(req);
    const baseFilter = buildOwnerScopedFilter(scope);

    const followUps = await FollowUp.find({
      ...baseFilter,
      date: selectedDate,
    })
      .select("enqId")
      .lean();

    const enquiryIds = [
      ...new Set(
        followUps
          .map((item) => item.enqId)
          .filter((id) => mongoose.Types.ObjectId.isValid(String(id))),
      ),
    ];

    if (enquiryIds.length === 0) {
      return res.json({ date: selectedDate, total: 0, counts });
    }

    const enquiries = await Enquiry.find({
      userId: baseFilter.userId,
      _id: { $in: enquiryIds },
    })
      .select("status")
      .lean();

    enquiries.forEach((item) => {
      const normalizedStatus = normalizeEnquiryStatus(item?.status);
      const summaryKey = counts[normalizedStatus] !== undefined ? normalizedStatus : "New";
      counts[summaryKey] += 1;
      counts.All += 1;
    });

    res.json({ date: selectedDate, total: counts.All, counts });
  } catch (err) {
    console.error("Follow-up status summary error:", err);
    res.status(500).json({ message: err.message });
  }
});

// REPORT SUMMARY (total, converted, pending/missed followups)
router.get("/meta/report-summary", verifyToken, async (req, res) => {
  try {
    const scope = await getEnquiryAccessScope(req);
    const baseFilter = buildOwnerScopedFilter(scope);

    const today = new Date().toISOString().split("T")[0];
    const enquiryFilter = { ...baseFilter };
    const followFilter = { ...baseFilter };

    const [totalEnquiries, convertedEnquiries, pendingFollowUps, missedFollowUps] = await Promise.all([
      Enquiry.countDocuments(enquiryFilter),
      Enquiry.countDocuments({ ...enquiryFilter, status: "Converted" }),
      FollowUp.countDocuments({
        ...followFilter,
        status: { $nin: ["Completed", "Drop", "Dropped"] },
        $or: [{ nextFollowUpDate: { $gte: today } }, { date: { $gte: today } }],
      }),
      FollowUp.countDocuments({
        ...followFilter,
        status: { $nin: ["Completed", "Drop", "Dropped"] },
        $or: [{ nextFollowUpDate: { $lt: today } }, { date: { $lt: today } }],
      }),
    ]);

    res.json({
      totalEnquiries,
      convertedEnquiries,
      pendingFollowUps,
      missedFollowUps,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE ENQUIRY (with optional image upload)
router.put("/:id", verifyToken, upload.single("image"), async (req, res) => {
  try {
    // Handle image - either from file upload or base64 string
    let updateData = { ...req.body };

    const scope = await getEnquiryAccessScope(req);
    const filter = buildOwnerScopedFilter(scope);

    // PROTECT USERID: Ensure users can't change who the record belongs to
    delete updateData.userId;

    // SANITIZE DATA: Prevent empty strings for ObjectIds or Numbers which cause Mongoose validation errors
    if (updateData.assignedTo === "") updateData.assignedTo = null;
    if (String(req.user?.role || "").toLowerCase() === "staff") {
      delete updateData.assignedTo;
    } else if (updateData.assignedTo) {
      const companyId = req.user?.company_id || null;
      if (companyId) {
        const validAssignee = await User.findOne({
          _id: updateData.assignedTo,
          company_id: companyId,
          status: "Active",
          role: { $in: ["admin", "Admin", "staff", "Staff"] },
        })
          .select("_id")
          .lean();
        if (!validAssignee?._id) {
          return res.status(400).json({ message: "Invalid assignee selected" });
        }
      }
    }
    if (updateData.cost === "")
      delete updateData.cost; // Or set to 0? Model says required: true.
    else if (updateData.cost !== undefined)
      updateData.cost = Number(updateData.cost);
    if (updateData.status) updateData.status = normalizeEnquiryStatus(updateData.status);
    if (updateData.date) updateData.date = toIsoDate(updateData.date) || updateData.date;
    if (updateData.enquiryDateTime) {
      const d = new Date(updateData.enquiryDateTime);
      if (!Number.isNaN(d.getTime())) updateData.enquiryDateTime = d;
    }

    if (req.file) {
      // File was uploaded via multipart/form-data
      updateData.image = `/uploads/${req.file.filename}`;
    } else if (req.body.image) {
      // Image sent as base64 or URI string in JSON
      updateData.image = req.body.image;
    }

    let enquiry;
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      enquiry = await Enquiry.findOneAndUpdate(
        { _id: req.params.id, ...filter },
        updateData,
        { returnDocument: "after", runValidators: true },
      );
    } else {
      enquiry = await Enquiry.findOneAndUpdate(
        { enqNo: req.params.id, ...filter },
        updateData,
        { returnDocument: "after", runValidators: true },
      );
    }

    if (!enquiry) {
      return res
        .status(404)
        .json({ message: "Enquiry not found or unauthorized" });
    }

    // --- NEW: Sync data with FollowUp collection ---
    try {
      const syncData = {};
      if (updateData.name) syncData.name = updateData.name;
      if (updateData.mobile) syncData.mobile = updateData.mobile;
      if (updateData.image) syncData.image = updateData.image;
      if (updateData.product) syncData.product = updateData.product;
      // Sync reassignment
      if (updateData.assignedTo !== undefined)
        syncData.assignedTo = updateData.assignedTo;

      if (Object.keys(syncData).length > 0) {
        await FollowUp.updateMany({ enqId: enquiry._id }, { $set: syncData });
      }
    } catch (syncErr) {
      console.error("❌ Sync with FollowUp failed:", syncErr.message);
    }

    cache.invalidate("enquiries");
    cache.invalidate("followups");
    cache.invalidate("dashboard");
    await emitEnquiryUpdated(req, enquiry, req.user?.company_id || enquiry?.companyId || null);
    res.json(enquiry);
  } catch (err) {
    console.error(`❌ [PUT /enquiries/${req.params.id}] Error:`, err.message);
    if (err.name === "ValidationError") {
      console.error(
        "   Validation details:",
        Object.keys(err.errors).map((k) => `${k}: ${err.errors[k].message}`),
      );
    }
    res.status(400).json({ message: err.message, errors: err.errors });
  }
});

// DELETE ENQUIRY
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const scope = await getEnquiryAccessScope(req);
    const filter = { _id: req.params.id, ...buildOwnerScopedFilter(scope) };
    const enquiry = await Enquiry.findOneAndDelete(filter);
    if (!enquiry) {
      return res
        .status(404)
        .json({ message: "Enquiry not found or unauthorized" });
    }

    // Remove related follow-ups so deleted enquiries do not appear in Follow-up screens.
    await FollowUp.deleteMany({
      ...buildOwnerScopedFilter(scope),
      $or: [{ enqId: enquiry._id }, { enqNo: enquiry.enqNo }],
    });

    cache.invalidate("enquiries");
    cache.invalidate("followups");
    cache.invalidate("dashboard");
    res.json({ message: "Enquiry deleted successfully", data: enquiry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
