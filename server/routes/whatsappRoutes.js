const express = require("express");
const router = express.Router();
const ChatMessage = require("../models/ChatMessage");
const Enquiry = require("../models/Enquiry");
const MessageTemplate = require("../models/MessageTemplate");
const { verifyToken } = require("../middleware/auth");
const aiService = require("../utils/aiService");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  extractProviderMessageMeta,
  getConfigSummary,
  loadWhatsappConfig,
  normalizePhoneNumber,
  saveWhatsappConfig,
  sendWhatsAppMessage,
} = require("../utils/whatsappConfigService");

// Configure Multer for Media Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/whatsapp";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// 1. GET CHAT HISTORY FOR A NUMBER
router.get("/webhook", (req, res) => {
  res.send(
    "✅ WhatsApp Webhook Path is Active! Set this URL in your WhatsApp Provider: " +
      req.protocol +
      "://" +
      req.get("host") +
      req.originalUrl,
  );
});

router.get("/history/:phoneNumber", verifyToken, async (req, res) => {
  try {
    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

    // Pagination params — load latest 30 by default
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    // Normalize to last 10 digits for flexible matching
    const rawNum = req.params.phoneNumber.replace(/\D/g, "");
    const short10 = rawNum.length > 10 ? rawNum.slice(-10) : rawNum;

    const filter = {
      userId: ownerId,
      phoneNumber: { $regex: short10 + "$" },
    };

    // Get total count for pagination info
    const total = await ChatMessage.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    // Calculate skip — we want newest first, then reverse for chat order
    // Page 1 = latest messages, Page 2 = older messages, etc.
    const skip = (page - 1) * limit;

    const messages = await ChatMessage.find(filter)
      .select(
        "sender type content fileName mimeType phoneNumber timestamp status externalId",
      )
      .sort({ timestamp: -1 }) // Newest first for skip/limit
      .skip(skip)
      .limit(limit)
      .lean(); // Plain JS objects — 3x faster than Mongoose docs

    // Reverse so messages display oldest-to-newest in the chat UI
    messages.reverse();

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. SEND MESSAGE / MEDIA
router.post("/send", verifyToken, upload.single("file"), async (req, res) => {
  try {
    const { phoneNumber, content, type, enquiryId } = req.body;
    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

    let finalContent = content;
    let fileName = "";
    let mimeType = "";
    let providerResp = null;

    // If file is uploaded, use its path
    if (req.file) {
      finalContent = `uploads/whatsapp/${req.file.filename}`;
      fileName = req.file.originalname;
      mimeType = req.file.mimetype;
    }
    try {
      const cfg = await loadWhatsappConfig({ ownerUserId: ownerId });
      if (!cfg) {
        console.warn(`Missing WhatsAppConfig for owner ${ownerId}`);
        return res.status(400).json({
          message:
            "No WhatsApp provider configuration found for your account. Please save your settings first.",
        });
      }

      const sendResult = await sendWhatsAppMessage({
        ownerUserId: ownerId,
        phoneNumber,
        content: finalContent,
        filePath: req.file?.path,
        fileName: req.file?.originalname,
        mimeType: req.file?.mimetype,
      });
      providerResp = sendResult.response;
      console.log(
        `WhatsApp message sent via ${sendResult.provider} (status ${sendResult.response?.status})`,
      );
    } catch (providerErr) {
      const providerMessage = providerErr.response?.data || providerErr.message;
      console.error(
        "WhatsApp provider error (message still saved locally):",
        providerMessage,
      );
    }

    const cfg = await loadWhatsappConfig({ ownerUserId: ownerId });
    const normalizedPhone = normalizePhoneNumber(
      phoneNumber,
      cfg?.defaultCountry || "91",
    );
    const providerMeta = extractProviderMessageMeta(cfg?.provider, providerResp);

    const newMessage = new ChatMessage({
      userId: ownerId,
      enquiryId,
      sender: "Admin",
      type:
        type ||
        (req.file
          ? req.file.mimetype.startsWith("image")
            ? "image"
            : "document"
          : "text"),
      content: finalContent,
      fileName,
      mimeType,
      phoneNumber: normalizedPhone,
      status: providerMeta.providerOk ? "sent" : "failed",
      externalId: providerMeta.externalId,
      providerTicketId: providerMeta.providerTicketId,
      providerResponse: providerResp ? JSON.stringify(providerResp.data) : null,
      timestamp: new Date(),
    });

    await newMessage.save();

    // Emit via Socket.io (emit with multiple formats for reliable matching)
    if (req.app.get("io")) {
      const io = req.app.get("io");
      const shortMobile = phoneNumber.replace(/\D/g, "");
      const short10 =
        shortMobile.length > 10 ? shortMobile.slice(-10) : shortMobile;
      const normChannel = normalizedPhone; // 91 + last10
      io.emit(`new_message_${normChannel}`, newMessage);
      io.emit(`new_message_${short10}`, newMessage);
      io.emit(`new_message_${shortMobile}`, newMessage);
    }

    res.json(newMessage);
  } catch (err) {
    console.error("WhatsApp Send Error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 3. WEBHOOK (Capture Incoming WhatsApp Messages)
router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log(`📥 Webhook Received [${req.method}] from ${req.ip}`);
    try {
      // ensure debug dir
      const debugDir = path.join(__dirname, "..", "tmp");
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(
        path.join(debugDir, "wati_last_payload.json"),
        JSON.stringify(payload, null, 2),
      );
      // Save headers for debugging (provider may send important delivery fields in headers)
      try {
        fs.writeFileSync(
          path.join(debugDir, "wati_last_headers.json"),
          JSON.stringify(req.headers || {}, null, 2),
        );
      } catch (he) {
        console.warn("Could not write webhook headers debug file:", he.message);
      }
      console.log(
        `📦 Payload saved to tmp/wati_last_payload.json (truncated):`,
      );
    } catch (e) {
      console.warn("Could not write webhook debug payload:", e.message);
    }
    console.log(
      `📦 Payload preview:`,
      JSON.stringify(payload).substring(0, 2000),
    );

    let rawFrom = "";
    let messageText = "";
    let type = "text";
    let mediaUrl = "";
    let fileName = "";
    let mimeType = "";

    // 1. EXTRACT DATA — Handle WATI, Evolution API, Cloud API, and Generic

    // Try multiple possible webhook shapes (WATI, Evolution, Cloud API, generic)
    const tryPaths = (obj, paths) => {
      for (const p of paths) {
        const parts = p.split(".");
        let cur = obj;
        for (const part of parts) {
          if (!cur) break;
          cur = cur[part];
        }
        if (cur) return cur;
      }
      return null;
    };

    const rawFromCandidates = [
      "waId",
      "from",
      "message.from",
      "message.fromNumber",
      "message.sender",
      "data.key.remoteJid",
      "contactNumber",
      "senderNumber",
      "customerNumber",
      "number",
    ];

    const textCandidates = [
      "text",
      "message",
      "message.text",
      "message.body",
      "message.conversation",
      "data.message.conversation",
      "data.message.extendedTextMessage.text",
      "entry.0.changes.0.value.messages.0.text.body",
      "body",
      "content",
    ];

    const mediaUrlCandidates = ["mediaUrl", "message.mediaUrl", "message.url"];
    const fileNameCandidates = [
      "fileName",
      "originalFileName",
      "message.fileName",
    ];
    const mimeTypeCandidates = ["mimeType", "message.mimeType"];

    const candidateFrom = tryPaths(payload, rawFromCandidates) || "";
    if (candidateFrom) {
      rawFrom = candidateFrom;
    } else if (
      payload.waId ||
      payload.senderName ||
      payload.whatsappMessageId
    ) {
      rawFrom = payload.waId || payload.from || "";
    }

    const candidateText = tryPaths(payload, textCandidates);
    if (candidateText) messageText = candidateText;

    type =
      payload.type ||
      tryPaths(payload, ["message.type", "data.message.type"]) ||
      "text";
    mediaUrl = tryPaths(payload, mediaUrlCandidates) || "";
    fileName = tryPaths(payload, fileNameCandidates) || fileName || "";
    mimeType = tryPaths(payload, mimeTypeCandidates) || mimeType || "";

    console.log(
      `🟢 Webhook parsed — from: ${rawFrom}, text (preview): ${String(messageText).substring(0, 200)}`,
    );

    if (!rawFrom && !messageText) {
      console.log(
        "⚠️ Webhook skipped: Could not extract from or messageText from payload",
      );
      return res.sendStatus(200);
    }

    // previous branch for Evolution and Cloud API
    if (payload.data && payload.data.key) {
      // ===== EVOLUTION API FORMAT =====
      rawFrom = payload.data.key.remoteJid;
      const msg = payload.data.message;
      if (msg) {
        messageText =
          msg.conversation ||
          msg.extendedTextMessage?.text ||
          msg.imageMessage?.caption ||
          msg.videoMessage?.caption ||
          "";

        type = msg.imageMessage
          ? "image"
          : msg.documentMessage
            ? "document"
            : msg.audioMessage
              ? "audio"
              : msg.videoMessage
                ? "video"
                : "text";
      }
    } else if (payload.entry) {
      // ===== META CLOUD API FORMAT =====
      const msgData = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (msgData) {
        // only set if not already extracted by earlier parsing
        rawFrom = rawFrom || msgData.from || "";
        messageText = messageText || msgData.text?.body || "";
        type = type || msgData.type || "text";
      } else {
        // Status update from Cloud API — ignore
        console.log("ℹ️ Cloud API status update, skipping.");
        return res.sendStatus(200);
      }
    } else {
      // ===== GENERIC FALLBACK =====
      // only set if parsing didn't already find values
      rawFrom = rawFrom || payload.from || "";
      messageText =
        messageText || payload.text || payload.content || payload.message || "";
      type = type || payload.type || "text";
    }

    if (!rawFrom) {
      console.log(
        "⚠️ Webhook skipped: No sender found in payload after parsing",
      );
      return res.sendStatus(200);
    }

    // 2. NORMALIZE NUMBER (Strip @... and non-digits) — store as 91+last10
    let cleanFrom = rawFrom.split("@")[0].replace(/\D/g, "");
    const shortMobile =
      cleanFrom.length > 10 ? cleanFrom.slice(-10) : cleanFrom;
    const normalizedFrom = normalizePhoneNumber(cleanFrom);

    console.log(
      `🔍 Processing message from: ${cleanFrom} (short: ${shortMobile}) -> normalized: ${normalizedFrom}`,
    );

    // 3. IDENTIFY CRM OWNER — search by last 10 digits for maximum flexibility
    const enquiry = await Enquiry.findOne({
      $or: [
        { mobile: cleanFrom },
        { mobile: shortMobile },
        { mobile: { $regex: shortMobile + "$" } },
        { altMobile: cleanFrom },
        { altMobile: shortMobile },
        { altMobile: { $regex: shortMobile + "$" } },
      ],
    }).populate("userId");

    let targetUserId = null;
    if (enquiry && enquiry.userId) {
      targetUserId = enquiry.userId._id || enquiry.userId;
    } else {
      const User = require("../models/User");
      const firstAdmin = await User.findOne({ role: "Admin" });
      targetUserId = firstAdmin ? firstAdmin._id : null;
    }

    if (!targetUserId) {
      console.error(
        "❌ DROP: Could not find any User to assign this message to.",
      );
      return res.sendStatus(200);
    }

    // 3.a Handle outgoing/admin messages and status updates from provider
    const isOwnerMessage = Boolean(
      payload.isOwner === true ||
      payload.message?.isOwner === true ||
      payload.is_owner === true,
    );

    if (isOwnerMessage) {
      try {
        const externalId =
          payload.whatsappMessageId ||
          payload.message?.whatsappMessageId ||
          payload.message?.id ||
          null;

        // find existing by externalId first
        let existing = null;
        if (externalId) {
          existing = await ChatMessage.findOne({ externalId });
        }

        // fallback: try provider ticket id
        const providerTicket =
          payload.ticketId ||
          payload.message?.ticketId ||
          payload.ticket ||
          payload.message?.ticket ||
          payload.providerTicketId;
        if (!existing && providerTicket) {
          existing = await ChatMessage.findOne({
            providerTicketId: providerTicket,
          });
          if (existing)
            console.log(
              `🎫 Matched existing message by providerTicketId: ${providerTicket}`,
            );
        }

        // fallback: match by phone number and recent 'sending' or 'sent' admin messages
        if (!existing) {
          try {
            const phoneCandidate = normalizedFrom || cleanFrom || rawFrom || "";
            const digits = String(phoneCandidate).replace(/\D/g, "");
            if (digits) {
              const tenMinAgo = new Date(Date.now() - 1000 * 60 * 10);
              existing = await ChatMessage.findOne({
                phoneNumber: { $regex: digits + "$" },
                sender: "Admin",
                status: { $in: ["sending", "sent"] },
                timestamp: { $gte: tenMinAgo },
              }).sort({ timestamp: -1 });
              if (existing)
                console.log(
                  `🔎 Fallback matched message by phone for receipt: ${digits}`,
                );
            }
          } catch (e) {
            console.warn("Fallback match by phone failed:", e.message);
          }
        }

        const mapStatus = (p) => {
          const s = p.status || p.statusString || p.message?.status;
          if (!s) return "sent";
          if (s === 1 || String(s).toLowerCase().includes("deliv"))
            return "delivered";
          if (String(s).toLowerCase().includes("read")) return "read";
          return "sent";
        };

        if (existing) {
          existing.status = mapStatus(payload);
          existing.providerResponse = JSON.stringify(payload);
          existing.providerTicketId =
            payload.ticketId ||
            payload.message?.ticketId ||
            existing.providerTicketId;
          if (externalId) existing.externalId = externalId;
          await existing.save();

          if (req.app.get("io")) {
            const io = req.app.get("io");
            const existingPhone = existing.phoneNumber || normalizedFrom;
            const existingShort =
              existingPhone.replace(/\D/g, "").length > 10
                ? existingPhone.replace(/\D/g, "").slice(-10)
                : existingPhone.replace(/\D/g, "");
            const existingClean = existingPhone.replace(/\D/g, "");
            io.emit(`new_message_${existingPhone}`, existing);
            io.emit(`new_message_${existingShort}`, existing);
            io.emit(`new_message_${existingClean}`, existing);
          }

          return res.sendStatus(200);
        } else {
          // create a record for the outgoing message so CRM sees it
          const adminMsg = new ChatMessage({
            userId: targetUserId,
            enquiryId: enquiry ? enquiry._id : null,
            sender: "Admin",
            type: payload.type || "text",
            content: messageText || "",
            fileName: fileName || "",
            mimeType: mimeType || "",
            phoneNumber: normalizedFrom,
            status: mapStatus(payload),
            externalId: externalId || null,
            providerTicketId:
              payload.ticketId || payload.message?.ticketId || null,
            providerResponse: JSON.stringify(payload),
            timestamp: new Date(),
          });

          await adminMsg.save();
          if (req.app.get("io")) {
            const io = req.app.get("io");
            io.emit(`new_message_${normalizedFrom}`, adminMsg);
            io.emit(`new_message_${shortMobile}`, adminMsg);
            io.emit(`new_message_${cleanFrom}`, adminMsg);
          }
          return res.sendStatus(200);
        }
      } catch (outerErr) {
        console.error("Error handling outgoing provider message:", outerErr);
        return res.sendStatus(200);
      }
    }

    // 4. SAVE & EMIT
    const incomingMsg = new ChatMessage({
      userId: targetUserId,
      enquiryId: enquiry ? enquiry._id : null,
      sender: "Customer",
      type: type,
      content: messageText || mediaUrl || payload.audioUrl || "",
      fileName: fileName,
      mimeType: mimeType,
      phoneNumber: normalizedFrom, // Store as 91 + last10 for consistent matching
      status: "received",
      timestamp: new Date(),
    });

    await incomingMsg.save();
    console.log(`✅ Message saved ID: ${incomingMsg._id} from: ${shortMobile}`);

    if (req.app.get("io")) {
      const io = req.app.get("io");
      // Emit multiple channel variants so different client subscriptions catch it
      io.emit(`new_message_${normalizedFrom}`, incomingMsg); // 91918825620014
      io.emit(`new_message_${shortMobile}`, incomingMsg); // 8825620014
      io.emit(`new_message_${cleanFrom}`, incomingMsg); // raw digits
      io.emit("global_new_message", incomingMsg);
      console.log(
        `🔔 Socket emitted: new_message_${normalizedFrom}, new_message_${shortMobile}, new_message_${cleanFrom}`,
      );
    }

    // ==========================================
    // 🚀 SMART AUTO-REPLY FLOW
    // ==========================================

    // Only reply to text messages from customers
    if (type === "text" && messageText) {
      let replyContent = "";
      const normalizedText = messageText.trim().toLowerCase();

      // 1. Check for Template Matching
      // Look for @keyword or just exact keyword match
      const template = await MessageTemplate.findOne({
        userId: targetUserId,
        status: "Active",
        $or: [
          { keyword: normalizedText.replace(/^@/, "") },
          { keyword: normalizedText },
        ],
      });

      if (template) {
        replyContent = template.content;
        console.log(`🎯 Template match found for keyword: ${template.keyword}`);
      } else {
        // 2. Fallback to Gemini AI
        console.log(`🤖 No template match. Calling AI for: "${messageText}"`);
        replyContent = await aiService.generateAIReply(messageText);
      }
      if (replyContent) {
        try {
          const cfg = await loadWhatsappConfig({
            ownerUserId: targetUserId,
          });

          if (!cfg) {
            console.warn(
              `Skipping auto-reply: no WhatsApp config for user ${targetUserId}`,
            );
          } else {
            const sendResult = await sendWhatsAppMessage({
              ownerUserId: targetUserId,
              phoneNumber: cleanFrom,
              content: replyContent,
            });
            console.log(
              `Auto-reply sent to ${normalizePhoneNumber(cleanFrom, cfg.defaultCountry)} via ${sendResult.provider}`,
            );
          }
        } catch (e) {
          const providerMessage = e.response?.data || e.message;
          console.error(
            "Error dispatching WhatsApp auto-reply:",
            providerMessage,
          );
        }

        // 4. Save the Auto-Reply to Database as "Admin" message
        const autoReplyMsg = new ChatMessage({
          userId: targetUserId,
          enquiryId: enquiry ? enquiry._id : null,
          sender: "Admin",
          type: "text",
          content: replyContent,
          phoneNumber: normalizePhoneNumber(shortMobile),
          status: "sent",
          timestamp: new Date(),
        });

        await autoReplyMsg.save();

        // 5. Emit via Sockets for CRM UI to update
        if (req.app.get("io")) {
          const io = req.app.get("io");
          io.emit(`new_message_${cleanFrom}`, autoReplyMsg);
          io.emit(`new_message_${normalizePhoneNumber(cleanFrom)}`, autoReplyMsg);
          if (shortMobile !== cleanFrom) {
            io.emit(`new_message_${shortMobile}`, autoReplyMsg);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    res.sendStatus(200);
  }
});

// --------- WhatsApp Config Endpoints (persist API URL / TOKEN in DB) ---------
// GET /api/whatsapp/config  (protected)
router.get("/config", verifyToken, async (req, res) => {
  try {
    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;
    // Allow optional companyId query to fetch company-scoped config
    const companyId = req.query.companyId || null;
    const cfg = await loadWhatsappConfig(
      companyId ? { companyId } : { ownerUserId: ownerId },
    );
    if (!cfg) return res.json({ ok: true, config: {} });

    // Only the owner user may see the full apiToken. Others get masked value.
    return res.json({ ok: true, config: getConfigSummary(cfg) });
  } catch (e) {
    console.error("Error fetching WhatsApp config:", e.message);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// PUT /api/whatsapp/config  (protected) — body: { apiUrl, apiToken, provider, ... }
router.put("/config", verifyToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

    const updated = await saveWhatsappConfig({
      ownerUserId: ownerId,
      payload,
    });
    return res.json({ ok: true, config: getConfigSummary(updated) });
  } catch (e) {
    console.error("Error saving WhatsApp config:", e.message);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

// Debug helper: Manually mark a message as delivered/read (protected)
// POST /api/whatsapp/debug/mark
// Body: { messageId: "<mongoId or externalId>", status: "delivered"|"read" }
router.post("/debug/mark", verifyToken, async (req, res) => {
  try {
    const { messageId, status } = req.body || {};
    if (!messageId || !status)
      return res
        .status(400)
        .json({ ok: false, message: "messageId and status required" });

    let msg = null;
    // Try Mongo _id first
    try {
      const { Types } = require("mongoose");
      if (Types.ObjectId.isValid(messageId)) {
        msg = await ChatMessage.findById(messageId);
      }
    } catch (e) {
      // ignore
    }

    if (!msg) {
      // Try externalId
      msg = await ChatMessage.findOne({
        $or: [{ externalId: messageId }, { providerTicketId: messageId }],
      });
    }

    if (!msg)
      return res.status(404).json({ ok: false, message: "Message not found" });

    msg.status = status;
    await msg.save();

    // Emit socket update so UI updates ticks
    if (req.app.get("io")) {
      const io = req.app.get("io");
      const phone = msg.phoneNumber;
      const short = phone.replace(/\D/g, "").slice(-10);
      io.emit(`new_message_${phone}`, msg);
      io.emit(`new_message_${short}`, msg);
      io.emit(`new_message_${phone.replace(/\D/g, "")}`, msg);
    }

    return res.json({ ok: true, message: msg });
  } catch (e) {
    console.error("Debug mark error:", e.message);
    return res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;

// ----- DEBUG: Test WATI Credentials & Send (Protected) -----
// POST /api/whatsapp/test
// Body: { phoneNumber: string, message: string }
// Returns WATI API response or detailed error for debugging
router.post("/test", async (req, res) => {
  try {
    // require auth header manually here (lighter than verifyToken middleware)
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer "))
      return res
        .status(401)
        .json({ message: "Missing app token in Authorization header" });

    const { phoneNumber, message } = req.body;
    if (!phoneNumber || !message)
      return res
        .status(400)
        .json({ message: "phoneNumber and message required" });

    const authToken = authHeader.split(" ")[1];
    let ownerUserId = null;
    try {
      const jwt = require("jsonwebtoken");
      ownerUserId = jwt.decode(authToken)?.userId || null;
    } catch (e) {
      ownerUserId = null;
    }

    const resp = await sendWhatsAppMessage({
      ownerUserId,
      phoneNumber,
      content: message,
    });
    return res.json({
      ok: true,
      provider: resp.provider,
      status: resp.response?.status,
      data: resp.response?.data,
    });
  } catch (err) {
    console.error("WATI Test Error:", err.response?.data || err.message);
    return res
      .status(502)
      .json({ ok: false, error: err.response?.data || err.message });
  }
});
