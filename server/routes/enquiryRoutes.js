const express = require("express");
const router = express.Router();
const Enquiry = require("../models/Enquiry");
const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const ChatMessage = require("../models/ChatMessage");
const MessageTemplate = require("../models/MessageTemplate");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");

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
    const { search, status, date, page = 1, limit = 20 } = req.query;
    const cacheKey = cache.key("enquiries", {
      userId: req.userId,
      role: req.user.role,
      search,
      status,
      date,
      page,
      limit,
    });

    const { data: response, source } = await cache.wrap(cacheKey, async () => {
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

      if (date) query.date = date;

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { mobile: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { enqNo: { $regex: search, $options: "i" } },
        ];
      }

      if (status && status !== "All") query.status = status;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const enquiries = await Enquiry.find(query)
        .select(
          "name mobile email image product enqNo status enqType date createdAt cost address source lastContactedAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum + 1)
        .lean();

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
    });

    res.json(response);
    console.log(
      `⚡ GET /enquiries — ${Date.now() - _start}ms ${source} (${response.data?.length || 0} items, page ${page})`,
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Helper to create an initial follow-up for an enquiry
const createInitialFollowUp = async (enquiry, ownerId, assignedToId) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
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
      time: new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      }),
      type: "WhatsApp",
      remarks: "Initial Enquiry Created",
      nextAction: "Followup",
      status: "Scheduled",
    });
    await initialFollowUp.save();
  } catch (err) {
    console.error("❌ Failed to create initial follow-up:", err.message);
  }
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

    const assignedTo = req.body.assignedTo || req.userId;

    const newEnquiry = new Enquiry({
      enqNo,
      ...req.body,
      userId: ownerId,
      assignedTo: assignedTo,
      enqBy: req.user.name,
      image: imageData,
      date: new Date().toISOString().split("T")[0],
      status: "New",
    });

    const savedEnquiry = await newEnquiry.save();

    // Create initial follow-up with explicit IDs
    await createInitialFollowUp(savedEnquiry, ownerId, assignedTo);

    // --- AUTO-SEND INTRO TEMPLATE (if available) ---
    try {
      // Normalize helper (keep local copy)
      const normalizeTo91 = (raw) => {
        if (!raw) return "";
        const clean = String(raw).replace(/\D/g, "");
        if (!clean) return "";
        if (clean.length === 10) return `91${clean}`;
        return clean;
      };

      const cleanMobile = (savedEnquiry.mobile || "").replace(/\D/g, "");
      const short10 =
        cleanMobile.length > 10 ? cleanMobile.slice(-10) : cleanMobile;
      const normalizedPhone = normalizeTo91(cleanMobile);

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

      if (
        introTemplate &&
        process.env.WHATSAPP_API_URL &&
        process.env.WHATSAPP_API_TOKEN
      ) {
        try {
          const url = `${process.env.WHATSAPP_API_URL}/api/v1/sendSessionMessage/${normalizedPhone}?messageText=${encodeURIComponent(introTemplate.content)}`;
          const headers = {
            Authorization: process.env.WHATSAPP_API_TOKEN,
          };
          const resp = await require("axios").post(
            url,
            {},
            { headers, timeout: 20000 },
          );

          const providerOk =
            resp &&
            resp.data &&
            (resp.data.ok || resp.data.result === "success");

          const savedMsg = new ChatMessage({
            userId: ownerId,
            enquiryId: savedEnquiry._id,
            sender: "Admin",
            type: "text",
            content: introTemplate.content,
            phoneNumber: normalizedPhone,
            status: providerOk ? "sent" : "failed",
            externalId: resp?.data?.message?.whatsappMessageId || null,
            providerTicketId: resp?.data?.message?.ticketId || null,
            providerResponse: resp ? JSON.stringify(resp.data) : null,
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
          assignedTo: req.body.assignedTo || req.userId,
          enqBy: req.user.name,
          image: imageData,
          date: new Date().toISOString().split("T")[0],
          status: "New",
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
        { new: true, runValidators: true },
      );
    } else {
      enquiry = await Enquiry.findOneAndUpdate(
        { enqNo: req.params.id, ...filter },
        updateData,
        { new: true, runValidators: true },
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
    cache.invalidate("enquiries");
    cache.invalidate("dashboard");
    res.json({ message: "Enquiry deleted successfully", data: enquiry });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
