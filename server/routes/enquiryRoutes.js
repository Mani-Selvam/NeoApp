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

const toIsoDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
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
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase(),
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed!"));
  },
});

// Helper: Generate next enquiry number by querying the database
// Helper: Generate next enquiry number efficiently
const generateEnquiryNumber = async () => {
  try {
    // Find the latest enquiry by sorting enqNo in descending order
    // This relies on consistent numbering ENQ-XXX
    // We use natural sort if possible, but standard string sort might be "ENQ-10" < "ENQ-9"
    // So relying on createdAt is safer for finding the 'latest', then parsing its ID

    const latestEnquiry = await Enquiry.findOne({}, { enqNo: 1 })
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
    const count = await Enquiry.countDocuments();
    return `ENQ-${String(count + 1).padStart(3, "0")}`;
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
      dateFrom,
      dateTo,
      assignedTo,
      page = 1,
      limit = 20,
    } = req.query;
    const response = await (async () => {
      let query = {};

      if (req.user.role === "Staff" && req.user.parentUserId) {
        query.userId = req.user.parentUserId;
        query.assignedTo = req.userId;
      } else {
        query.userId = req.userId;
      }

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

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { mobile: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { enqNo: { $regex: search, $options: "i" } },
        ];
      }

      if (status && status !== "All") {
        const normalizedStatus = normalizeEnquiryStatus(status);
        const acceptedStatuses =
          ENQUIRY_STATUS_QUERY_MAP[normalizedStatus] || [normalizedStatus];
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

        const latestFollowUps = await FollowUp.find(followUpScope)
          .select("enqId nextFollowUpDate followUpDate date activityTime createdAt")
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
        });
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

// Helper to create an initial follow-up for an enquiry
const createInitialFollowUp = async (enquiry, ownerId, assignedToId) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const initialFollowUp = new FollowUp({
      enqId: enquiry._id,
      userId: ownerId,
      assignedTo: assignedToId || ownerId, // Default to owner if no assignment
      enqNo: enquiry.enqNo,
      name: enquiry.name,
      mobile: enquiry.mobile,
      image: enquiry.image,
      product: enquiry.product,
      date: todayStr,
      followUpDate: todayStr,
      nextFollowUpDate: todayStr,
      time: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      }),
      type: "System",
      activityType: "System",
      note: "Enquiry created",
      remarks: "Enquiry created",
      nextAction: "Followup",
      status: "Scheduled",
      activityTime: now,
    });
    await initialFollowUp.save();
  } catch (err) {
    console.error("❌ Failed to create initial follow-up:", err.message);
  }
};

const resolveAssignee = async ({ requestedAssignedTo, ownerId, actorId, actor }) => {
  if (requestedAssignedTo) return requestedAssignedTo;

  const actorRole = String(actor?.role || "").toLowerCase();
  if (actorRole === "staff") return actorId;

  const scopeUserId = actor?.parentUserId || ownerId;
  const actorDoc = await User.findById(scopeUserId).select("company_id").lean();

  if (actorDoc?.company_id) {
    const staffCandidate = await User.findOne({
      company_id: actorDoc.company_id,
      status: "Active",
      role: { $in: ["staff", "Staff"] },
    })
      .sort({ createdAt: 1 })
      .select("_id")
      .lean();

    if (staffCandidate?._id) return staffCandidate._id;
  }

  return actorId || ownerId;
};

// ADD NEW ENQUIRY (with optional image upload)
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    const { name, mobile, product, cost } = req.body;

    if (!name || !mobile || !product || !cost) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const enqNo = await generateEnquiryNumber();

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

    const assignedTo = await resolveAssignee({
      requestedAssignedTo: req.body.assignedTo,
      ownerId,
      actorId: req.userId,
      actor: req.user,
    });

    const enquiryDateTime = new Date();
    const normalizedStatus = normalizeEnquiryStatus(req.body.status || "New");

    const newEnquiry = new Enquiry({
      enqNo,
      ...req.body,
      userId: ownerId,
      assignedTo: assignedTo,
      enqBy: req.user.name,
      image: imageData,
      date: toIsoDate(req.body.date) || enquiryDateTime.toISOString().split("T")[0],
      enquiryDateTime,
      status: normalizedStatus,
    });

    const savedEnquiry = await newEnquiry.save();

    // Create initial follow-up with explicit IDs
    await createInitialFollowUp(savedEnquiry, ownerId, assignedTo);

    // --- AUTO-SEND INTRO TEMPLATE (if available) ---
    try {
      const cleanMobile = (savedEnquiry.mobile || "").replace(/\D/g, "");
      const short10 =
        cleanMobile.length > 10 ? cleanMobile.slice(-10) : cleanMobile;
      const cfg = await loadWhatsappConfig({ ownerUserId: ownerId });
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
    cache.invalidate("followups"); // Follow-up was also created
    cache.invalidate("dashboard"); // Dashboard stats changed
    res.status(201).json(savedEnquiry);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.enqNo) {
      const fallbackEnqNo = `ENQ-${Date.now().toString().slice(-6)}`;
      try {
        let imageData = req.file
          ? `/uploads/${req.file.filename}`
          : req.body.image;

        const retryEnquiry = new Enquiry({
          enqNo: fallbackEnqNo,
          ...req.body,
          userId:
            req.user.role === "Staff" && req.user.parentUserId
              ? req.user.parentUserId
              : req.userId,
          assignedTo: await resolveAssignee({
            requestedAssignedTo: req.body.assignedTo,
            ownerId:
              req.user.role === "Staff" && req.user.parentUserId
                ? req.user.parentUserId
                : req.userId,
            actorId: req.userId,
            actor: req.user,
          }),
          enqBy: req.user.name,
          image: imageData,
          date: toIsoDate(req.body.date) || new Date().toISOString().split("T")[0],
          enquiryDateTime: new Date(),
          status: normalizeEnquiryStatus(req.body.status || "New"),
        });
        const savedEnquiry = await retryEnquiry.save();

        // Use the same ownerId/assignedTo logic as above for retry
        const retryOwnerId =
          req.user.role === "Staff" && req.user.parentUserId
            ? req.user.parentUserId
            : req.userId;
        const retryAssignedTo = req.body.assignedTo || req.userId;

        await createInitialFollowUp(
          savedEnquiry,
          retryOwnerId,
          retryAssignedTo,
        );

        return res.status(201).json(savedEnquiry);
      } catch (retryErr) {
        return res.status(400).json({
          message: "Failed to create enquiry: " + retryErr.message,
        });
      }
    }

    res.status(400).json({ message: err.message });
  }
});

// GET SINGLE ENQUIRY (Supports both MongoDB ID and enqNo)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    let enquiry;
    // Scoping Logic
    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }
    const filter = { userId: filterUserId };

    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      enquiry = await Enquiry.findOne({
        _id: req.params.id,
        ...filter,
      }).lean();
    } else {
      enquiry = await Enquiry.findOne({
        enqNo: req.params.id,
        ...filter,
      }).lean();
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
    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }

    const baseFilter = { userId: filterUserId, ...scopingFilter };
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, ...baseFilter }
      : { enqNo: id, ...baseFilter };

    const enquiry = await Enquiry.findOne(query)
      .populate("assignedTo", "name email mobile role")
      .lean();

    if (!enquiry) {
      return res.status(404).json({ message: "Enquiry not found or unauthorized" });
    }

    const timeline = await FollowUp.find({ enqId: enquiry._id, userId: filterUserId, ...scopingFilter })
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

    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }

    const query = mongoose.Types.ObjectId.isValid(req.params.id)
      ? { _id: req.params.id, userId: filterUserId, ...scopingFilter }
      : { enqNo: req.params.id, userId: filterUserId, ...scopingFilter };

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
    res.json(enquiry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPCOMING FOLLOW-UP REMINDERS LIST
router.get("/meta/reminders", verifyToken, async (req, res) => {
  try {
    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }

    const today = new Date().toISOString().split("T")[0];
    const reminders = await FollowUp.find({
      userId: filterUserId,
      ...scopingFilter,
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

// REPORT SUMMARY (total, converted, pending/missed followups)
router.get("/meta/report-summary", verifyToken, async (req, res) => {
  try {
    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }

    const today = new Date().toISOString().split("T")[0];
    const enquiryFilter = { userId: filterUserId, ...scopingFilter };
    const followFilter = { userId: filterUserId, ...scopingFilter };

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

    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }
    const filter = { userId: filterUserId };

    // PROTECT USERID: Ensure users can't change who the record belongs to
    delete updateData.userId;

    // SANITIZE DATA: Prevent empty strings for ObjectIds or Numbers which cause Mongoose validation errors
    if (updateData.assignedTo === "") updateData.assignedTo = null;
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
    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }
    const filter = { _id: req.params.id, userId: filterUserId };
    const enquiry = await Enquiry.findOneAndDelete(filter);
    if (!enquiry) {
      return res
        .status(404)
        .json({ message: "Enquiry not found or unauthorized" });
    }

    // Remove related follow-ups so deleted enquiries do not appear in Follow-up screens.
    await FollowUp.deleteMany({
      userId: filterUserId,
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
