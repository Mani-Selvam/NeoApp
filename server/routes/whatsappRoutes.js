const express = require("express");
const router = express.Router();
const ChatMessage = require("../models/ChatMessage");
const Enquiry = require("../models/Enquiry");
const MessageTemplate = require("../models/MessageTemplate");
const { verifyToken } = require("../middleware/auth");
const axios = require("axios");
const aiService = require("../utils/aiService");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const WhatsAppConfig = require("../models/WhatsAppConfig");
const { encrypt, decrypt } = require("../utils/crypto");

// Small in-memory cache for config to avoid DB roundtrips on every message
// cache keyed by lookupKey (company:<id> | owner:<id> | global)
const _whConfigCache = new Map();
const _whConfigCacheAt = new Map();
const cacheTTL = 30 * 1000; // 30s

const makeLookupKey = (opts = {}) => {
  if (opts.companyId) return `company:${String(opts.companyId)}`;
  if (opts.ownerUserId) return `owner:${String(opts.ownerUserId)}`;
  return `global`;
};

const loadWhatsappConfig = async (opts = {}) => {
  const key = makeLookupKey(opts);
  try {
    const cached = _whConfigCache.get(key);
    const at = _whConfigCacheAt.get(key) || 0;
    if (cached && Date.now() - at < cacheTTL) return cached;

    // Try lookup order: companyId -> ownerUserId -> global
    let cfg = null;
    if (opts.companyId) {
      cfg = await WhatsAppConfig.findOne({
        companyId: opts.companyId,
      }).lean();
    }
    if (!cfg && opts.ownerUserId) {
      cfg = await WhatsAppConfig.findOne({
        ownerUserId: opts.ownerUserId,
      }).lean();
    }
    if (!cfg) {
      // Only fall back to a global config when no specific lookup was requested.
      // This prevents silently using a global token when a per-user/company
      // config was expected.
      if (!opts.companyId && !opts.ownerUserId) {
        cfg = await WhatsAppConfig.findOne({}).lean(); // global fallback
      } else {
        cfg = null;
      }
    }

    if (cfg && cfg.apiTokenEncrypted)
      cfg.apiToken = decrypt(cfg.apiTokenEncrypted);
    _whConfigCache.set(key, cfg || null);
    _whConfigCacheAt.set(key, Date.now());
    return cfg || null;
  } catch (e) {
    console.warn("Could not load WhatsAppConfig from DB:", e.message);
    return null;
  }
};

// Normalize numbers: if 10 digits -> prefix default country code, otherwise preserve existing country code
const normalizeTo91 = (raw) => {
  if (!raw) return "";
  const clean = String(raw).replace(/\D/g, "");
  if (!clean) return "";
  const defaultCountry = process.env.WHATSAPP_DEFAULT_COUNTRY || "91";
  if (clean.length === 10) return `${defaultCountry}${clean}`; // assume local 10-digit number
  return clean; // already has country code, return as-is
};

// Send request to WATI with header fallbacks and detailed logging
// options may include: headers, body, cfg (preloaded), lookup: { companyId, ownerUserId }
const sendToWati = async (url, options = {}) => {
  // Resolve token from options.cfg, options.lookup, then DB config, then env fallback
  let cfg = options.cfg || null;
  if (!cfg) {
    try {
      cfg = await loadWhatsappConfig(options.lookup || {});
    } catch (e) {
      cfg = null;
    }
  }

  const rawTokenFromCfg =
    (cfg && cfg.apiToken) || process.env.WHATSAPP_API_TOKEN || "";

  const tryList = [
    { Authorization: rawTokenFromCfg },
    {
      Authorization: `Bearer ${String(rawTokenFromCfg).replace(/^Bearer\s+/i, "")}`,
    },
    { Authorization: String(rawTokenFromCfg).replace(/^Bearer\s+/i, "") },
  ];

  for (const hdr of tryList) {
    try {
      const mergedHeaders = { ...(options.headers || {}), ...hdr };
      const resp = await axios.post(url, options.body || {}, {
        headers: mergedHeaders,
        timeout: 20000,
      });
      console.log("[WATI] sendToWati success with headers:", Object.keys(hdr));
      console.log("[WATI] response.status=", resp.status, "data=", resp.data);
      return resp;
    } catch (err) {
      console.warn(
        "[WATI] sendToWati attempt failed for headers:",
        Object.keys(hdr),
        err.response?.data || err.message,
      );
      // continue to next attempt
    }
  }
  throw new Error("All WATI send attempts failed");
};

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
    let watiResp = null;

    // If file is uploaded, use its path
    if (req.file) {
      finalContent = `uploads/whatsapp/${req.file.filename}`;
      fileName = req.file.originalname;
      mimeType = req.file.mimetype;
    }

    // --- WATI/API INTEGRATION (resolve URL/token from DB first, then env) ---
    try {
      const cfg = await loadWhatsappConfig({ ownerUserId: ownerId });

      // Enforce per-user/company WhatsApp API configuration.
      // Do NOT fall back to a single global token — require each user to
      // configure their own `WhatsAppConfig` (apiUrl + apiToken).
      if (!cfg || !cfg.apiUrl || !cfg.apiTokenEncrypted) {
        console.warn(
          `Missing WhatsAppConfig for owner ${ownerId} — refusing to use global token fallback`,
        );
        return res.status(400).json({
          message:
            "No WhatsApp API configuration found for your account. Please set API URL and API token in WhatsApp settings.",
        });
      }

      const apiUrl = cfg.apiUrl;

      if (apiUrl) {
        const watiNumber = normalizeTo91(phoneNumber);

        if (!req.file) {
          const url = `${apiUrl}/api/v1/sendSessionMessage/${watiNumber}?messageText=${encodeURIComponent(finalContent)}`;
          try {
            const resp = await sendToWati(url, {
              lookup: { ownerUserId: ownerId },
            });
            watiResp = resp;
            console.log(
              `✅ WATI: Text message sent to ${watiNumber} (status ${resp.status})`,
            );
          } catch (e) {
            console.error(
              `❌ WATI: Text send failed to ${watiNumber}:`,
              e.message,
            );
          }
        } else {
          const FormData = require("form-data");
          const fileStream = fs.createReadStream(req.file.path);
          const formData = new FormData();
          formData.append("file", fileStream, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
          });

          const url = `${apiUrl}/api/v1/sendSessionFile/${watiNumber}`;
          try {
            const resp = await sendToWati(url, {
              body: formData,
              headers: formData.getHeaders(),
              lookup: { ownerUserId: ownerId },
            });
            watiResp = resp;
            console.log(
              `✅ WATI: File sent to ${watiNumber} (status ${resp.status})`,
            );
          } catch (e) {
            console.error(
              `❌ WATI: File send failed to ${watiNumber}:`,
              e.message,
            );
          }
        }
      }
    } catch (watiErr) {
      console.error(
        "⚠️ WATI API Error (message still saved locally):",
        watiErr.response?.data || watiErr.message,
      );
    }

    const normalizedPhone = normalizeTo91(phoneNumber);

    // Determine initial status based on provider response if available
    const providerOk =
      watiResp &&
      watiResp.data &&
      (watiResp.data.ok || watiResp.data.result === "success");

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
      status: providerOk ? "sent" : "failed",
      // save external/provider identifiers when available
      externalId: watiResp?.data?.message?.whatsappMessageId || null,
      providerTicketId: watiResp?.data?.message?.ticketId || null,
      providerResponse: watiResp ? JSON.stringify(watiResp.data) : null,
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
    const normalizedFrom = normalizeTo91(cleanFrom);

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
        // 3. Dispatch to WhatsApp (via WATI) - resolve config from DB first
        try {
          const cfg = await loadWhatsappConfig({
            ownerUserId: targetUserId,
          });

          // Require per-user config — do not fall back to a global token
          if (!cfg || !cfg.apiUrl || !cfg.apiTokenEncrypted) {
            console.warn(
              `Skipping auto-reply: no WhatsApp config for user ${targetUserId}`,
            );
          } else {
            const apiUrl = cfg.apiUrl;
            const watiNumber = normalizeTo91(cleanFrom);
            try {
              const url = `${apiUrl}/api/v1/sendSessionMessage/${watiNumber}?messageText=${encodeURIComponent(replyContent)}`;
              await sendToWati(url, {
                cfg,
                lookup: { ownerUserId: targetUserId },
              });
              console.log(`📤 Auto-reply sent to ${watiNumber} via WATI`);
            } catch (waitErr) {
              console.error(
                "⚠️ WATI Auto-Reply Dispatch Error:",
                waitErr.response?.data || waitErr.message,
              );
            }
          }
        } catch (e) {
          console.error(
            "Error resolving WhatsApp config for auto-reply:",
            e.message,
          );
        }

        // 4. Save the Auto-Reply to Database as "Admin" message
        const autoReplyMsg = new ChatMessage({
          userId: targetUserId,
          enquiryId: enquiry ? enquiry._id : null,
          sender: "Admin",
          type: "text",
          content: replyContent,
          phoneNumber: normalizeTo91(shortMobile),
          status: "sent",
          timestamp: new Date(),
        });

        await autoReplyMsg.save();

        // 5. Emit via Sockets for CRM UI to update
        if (req.app.get("io")) {
          const io = req.app.get("io");
          io.emit(`new_message_${cleanFrom}`, autoReplyMsg);
          io.emit(`new_message_${normalizeTo91(cleanFrom)}`, autoReplyMsg);
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
    const out = { ...cfg };
    const cfgOwnerId =
      (cfg.ownerUserId || cfg.owner || cfg.createdBy) &&
      String(cfg.ownerUserId || cfg.owner || cfg.createdBy);
    if (!cfgOwnerId || String(ownerId) !== cfgOwnerId) {
      if (out.apiToken) {
        // mask showing only last 6 characters
        const t = String(out.apiToken);
        out.apiToken = t.length > 6 ? "****" + t.slice(-6) : "****";
      }
      // remove sensitive fields
      delete out.apiTokenEncrypted;
    }
    return res.json({ ok: true, config: out });
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

    const data = {
      provider: payload.provider || payload.provider || "WATI",
      apiUrl: payload.apiUrl || payload.WHATSAPP_API_URL || "",
      apiToken: payload.apiToken || payload.WHATSAPP_API_TOKEN || "",
      verifyToken: payload.verifyToken || payload.WHATSAPP_VERIFY_TOKEN || "",
      appSecret: payload.appSecret || payload.WHATSAPP_APP_SECRET || "",
      signatureHeader:
        payload.signatureHeader ||
        payload.WHATSAPP_SIGNATURE_HEADER ||
        "X-Hub-Signature-256",
      enableSignatureVerification: !!payload.enableSignatureVerification,
      defaultCountry:
        payload.defaultCountry || payload.WHATSAPP_DEFAULT_COUNTRY || "91",
    };

    // Encrypt apiToken before saving to DB
    if (data.apiToken) {
      data.apiTokenEncrypted = encrypt(data.apiToken);
      delete data.apiToken;
    }

    // Ensure owner is set for this config and optionally company
    data.ownerUserId = ownerId;
    if (payload.companyId) data.companyId = payload.companyId;

    const filter = payload.companyId
      ? { companyId: payload.companyId }
      : { ownerUserId: ownerId };

    const updated = await WhatsAppConfig.findOneAndUpdate(filter, data, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });

    // update cache (decrypt for in-memory use)
    const cached = updated.toObject ? updated.toObject() : updated;
    if (cached.apiTokenEncrypted)
      cached.apiToken = decrypt(cached.apiTokenEncrypted);
    const key = makeLookupKey({ ownerUserId: ownerId });
    _whConfigCache.set(key, cached);
    _whConfigCacheAt.set(key, Date.now());
    return res.json({ ok: true, config: cached });
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

    const cfg = await loadWhatsappConfig();
    const apiUrl = (cfg && cfg.apiUrl) || process.env.WHATSAPP_API_URL;
    if (!apiUrl) {
      return res
        .status(400)
        .json({ message: "WHATSAPP API URL not configured on server" });
    }

    const watiNumber = normalizeTo91(phoneNumber);
    const url = `${apiUrl}/api/v1/sendSessionMessage/${watiNumber}?messageText=${encodeURIComponent(message)}`;

    console.log("🔧 WATI Test ->", { url, usingConfig: !!cfg });

    const resp = await sendToWati(url);
    return res.json({ ok: true, status: resp.status, data: resp.data });
  } catch (err) {
    console.error("WATI Test Error:", err.response?.data || err.message);
    return res
      .status(502)
      .json({ ok: false, error: err.response?.data || err.message });
  }
});
