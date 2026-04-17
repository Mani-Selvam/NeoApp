const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const { verifyToken } = require("../middleware/auth");
const {
    buildSafeUploadName,
    createFileFilter,
} = require("../utils/uploadSecurity");
const Company = require("../models/Company");
const Enquiry = require("../models/Enquiry");
const EmailLog = require("../models/EmailLog");
const EmailSettings = require("../models/EmailSettings");
const EmailTemplate = require("../models/EmailTemplate");
const { decrypt, encrypt } = require("../utils/crypto");
const {
    ensureCompatibleFromEmail,
    getCompanyEmailSettings,
    sendEmail,
    verifySentCopySettings,
    verifyEmailSettings,
} = require("../services/emailService");

const isMaskedPasswordValue = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return false;
    return normalized === "********" || /^[*•]+$/.test(normalized);
};

const DEFAULT_EMAIL_TEMPLATES = [
    {
        name: "New Lead Welcome",
        subject: "Welcome to {{company}} — thanks for reaching out",
        body:
            "Hello {{name}},\n\n" +
            "Thank you for contacting {{company}}. I’m {{staff}}, and I’ll be assisting you.\n\n" +
            "If you can share your requirements for {{product}}, we’ll prepare the next steps for you.\n\n" +
            "Best regards,\n" +
            "{{staff}}\n" +
            "{{company}}",
    },
    {
        name: "Lead Follow-Up",
        subject: "Following up on your enquiry",
        body:
            "Hello {{name}},\n\n" +
            "Thank you for your interest in {{product}} at {{company}}.\n\n" +
            "I wanted to follow up and check if you need any additional information. I’m happy to help.\n\n" +
            "Please share a convenient time to connect.\n\n" +
            "Best regards,\n" +
            "{{staff}}\n" +
            "{{company}}",
    },
    {
        name: "Price Quotation",
        subject: "Quotation for {{product}} — {{company}}",
        body:
            "Hello {{name}},\n\n" +
            "As discussed, please find the quotation for {{product}}.\n\n" +
            "If you have any questions or would like to adjust the scope, reply to this email and I’ll update it.\n\n" +
            "Best regards,\n" +
            "{{staff}}\n" +
            "{{company}}",
    },
    {
        name: "Project Proposal",
        subject: "Project proposal for {{product}}",
        body:
            "Hello {{name}},\n\n" +
            "Please find the project proposal for {{product}} attached.\n\n" +
            "If you’d like any changes, I can revise the proposal based on your feedback.\n\n" +
            "Best regards,\n" +
            "{{staff}}\n" +
            "{{company}}",
    },
    {
        name: "Meeting Reminder",
        subject: "Reminder: your meeting with {{company}} on {{date}}",
        body:
            "Hello {{name}},\n\n" +
            "This is a reminder for your scheduled meeting with {{staff}} from {{company}} on {{date}}.\n\n" +
            "If you need to reschedule, please let us know.\n\n" +
            "Best regards,\n" +
            "{{company}}",
    },
    {
        name: "Demo Invitation",
        subject: "Invitation: demo of {{product}}",
        body:
            "Hello {{name}},\n\n" +
            "We’d like to invite you for a quick demo of {{product}} and answer any questions.\n\n" +
            "Please share a preferred date/time, and we’ll schedule it.\n\n" +
            "Best regards,\n" +
            "{{staff}}\n" +
            "{{company}}",
    },
    {
        name: "Thank You for Purchase",
        subject: "Thank you for your purchase — {{company}}",
        body:
            "Hello {{name}},\n\n" +
            "Thank you for choosing {{company}}.\n\n" +
            "If you need any help with setup or have questions about {{product}}, reply here and we’ll assist you.\n\n" +
            "Best regards,\n" +
            "{{company}}",
    },
    {
        name: "Customer Support Reply",
        subject: "Re: Support request — {{company}}",
        body:
            "Hello {{name}},\n\n" +
            "Thank you for contacting {{company}} support.\n\n" +
            "We’ve received your request and {{staff}} will assist you shortly. If you can share any screenshots or details, it will help us resolve this faster.\n\n" +
            "Best regards,\n" +
            "{{company}} Support Team",
    },
    {
        name: "Festival Offer / Promotion",
        subject: "Special offer from {{company}} (limited time)",
        body:
            "Hello {{name}},\n\n" +
            "We’re excited to share a limited-time festival offer on {{product}}.\n\n" +
            "Reply to this email if you’d like pricing/details tailored to your needs.\n\n" +
            "Best regards,\n" +
            "{{staff}}\n" +
            "{{company}}",
    },
    {
        name: "Newsletter Update",
        subject: "{{company}} updates — {{date}}",
        body:
            "Hello {{name}},\n\n" +
            "Here are the latest updates from {{company}}.\n\n" +
            "• New features and improvements\n" +
            "• Tips to get more value from {{product}}\n" +
            "• Announcements and offers\n\n" +
            "If you’d like us to cover any topic, just reply to this email.\n\n" +
            "Best regards,\n" +
            "{{company}}",
    },
];

const ensureDefaultTemplates = async ({ companyId, userId }) => {
    const existing = await EmailTemplate.find({ companyId })
        .select("name")
        .lean();
    const existingNames = new Set(existing.map((t) => String(t.name || "").toLowerCase()));
    const missing = DEFAULT_EMAIL_TEMPLATES.filter(
        (t) => !existingNames.has(String(t.name || "").toLowerCase()),
    );
    if (missing.length === 0) return;

    await EmailTemplate.insertMany(
        missing.map((t) => ({
            companyId,
            name: t.name,
            subject: t.subject,
            body: t.body,
            status: "Active",
            createdBy: userId || null,
        })),
        { ordered: false },
    ).catch(() => null);
};

const ensureUploadsDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "../uploads/email");
        ensureUploadsDir(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, buildSafeUploadName({ prefix: "email", originalname: file.originalname, fallbackExt: ".bin" }));
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: createFileFilter({
        allowedMimePatterns: [
            /^image\/(jpeg|png|gif|webp)$/,
            /^audio\/(mpeg|mp3|wav|ogg|aac|webm)$/,
            "application/pdf",
            "text/plain",
            "text/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "application/x-zip-compressed",
        ],
        allowedExtensions: [
            ".jpg", ".jpeg", ".png", ".gif", ".webp",
            ".mp3", ".wav", ".ogg", ".aac", ".webm",
            ".pdf", ".txt", ".csv", ".xls", ".xlsx", ".doc", ".docx", ".zip",
        ],
        message: "Unsupported email attachment type.",
    }),
});

const getCompanyIdFromReq = (req) => {
    const companyId = req.user?.company_id || req.user?.companyId || null;
    return companyId ? String(companyId) : null;
};

const toLocalIsoDate = (value = new Date()) => {
    const dt = value instanceof Date ? value : new Date(value);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const recordEmailActivity = async ({ req, ownerId, enquiry, subject, message }) => {
    if (!enquiry?._id || !ownerId) return;
};

const escapeHtml = (raw) => {
    const s = String(raw || "");
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const applyTemplateVars = (text, vars) => {
    let out = String(text || "");
    const safeVars = vars || {};
    Object.keys(safeVars).forEach((k) => {
        const re = new RegExp(`{{\\s*${k}\\s*}}`, "gi");
        out = out.replace(re, String(safeVars[k] ?? ""));
    });
    return out;
};

const linkifyAndTrack = ({ text, trackLinks, clickBaseUrl }) => {
    const raw = String(text || "");
    const urlRegex = /\bhttps?:\/\/[^\s<>()]+/gi;
    const parts = raw.split(urlRegex);
    const urls = raw.match(urlRegex) || [];

    let result = "";
    for (let i = 0; i < parts.length; i++) {
        result += escapeHtml(parts[i]).replace(/\n/g, "<br/>");
        const url = urls[i];
        if (!url) continue;
        const clean = url.replace(/[),.]+$/g, "");
        const suffix = url.slice(clean.length);
        const href = trackLinks && clickBaseUrl
            ? `${clickBaseUrl}?url=${encodeURIComponent(clean)}`
            : clean;
        result += `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(clean)}</a>${escapeHtml(suffix)}`;
    }
    return result;
};

// ---------------- Public tracking endpoints (no auth) ----------------
// 1x1 transparent GIF
const TRACK_GIF = Buffer.from(
    "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64",
);

router.get("/track/open/:id.gif", async (req, res) => {
    try {
        const id = String(req.params.id || "").trim();
        if (id) {
            const now = new Date();
            await EmailLog.updateOne(
                { _id: id, trackOpen: true, openedAt: null },
                { $set: { openedAt: now } },
            ).catch(() => null);
            await EmailLog.updateOne(
                { _id: id, trackOpen: true },
                { $inc: { openCount: 1 } },
            ).catch(() => null);
        }
    } catch (_e) {
        // ignore
    }
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.end(TRACK_GIF);
});

router.get("/track/click/:id", async (req, res) => {
    const id = String(req.params.id || "").trim();
    const url = String(req.query.url || "").trim();

    if (!/^https?:\/\//i.test(url)) return res.status(400).send("Invalid url");

    try {
        if (id) {
            await EmailLog.updateOne(
                { _id: id, trackLinks: true },
                { $set: { clickedAt: new Date() }, $inc: { clickCount: 1 } },
            ).catch(() => null);
        }
    } catch (_e) {
        // ignore
    }

    return res.redirect(url);
});

// Everything else requires auth
router.use(verifyToken);

// ---------------- Settings ----------------
router.get("/settings", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        const settings = await EmailSettings.findOne({ companyId }).lean();
        if (!settings) return res.json({ ok: true, settings: null });

        return res.json({
            ok: true,
            settings: {
                smtpHost: settings.smtpHost || "",
                smtpPort: settings.smtpPort || 587,
                smtpSecure: Boolean(settings.smtpSecure),
                smtpUser: settings.smtpUser || "",
                smtpPass: settings.smtpPassEncrypted ? "********" : "",
                hasPassword: Boolean(settings.smtpPassEncrypted),
                saveSentCopy: Boolean(settings.saveSentCopy),
                imapHost: settings.imapHost || "",
                imapPort: settings.imapPort || 993,
                imapSecure: settings.imapSecure !== false,
                imapUser: settings.imapUser || "",
                imapPass: settings.imapPassEncrypted ? "********" : "",
                hasImapPassword: Boolean(settings.imapPassEncrypted),
                sentFolder: settings.sentFolder || "Sent",
                fromName: settings.fromName || "",
                fromEmail: settings.fromEmail || "",
                updatedAt: settings.updatedAt || null,
            },
        });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});

router.put("/settings", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        const {
            smtpHost = "",
            smtpPort = 587,
            smtpSecure = false,
            smtpUser = "",
            smtpPass = "",
            saveSentCopy = false,
            imapHost = "",
            imapPort = 993,
            imapSecure = true,
            imapUser = "",
            imapPass = "",
            sentFolder = "Sent",
            fromName = "",
            fromEmail = "",
        } = req.body || {};

        const next = {
            companyId,
            smtpHost: String(smtpHost || "").trim(),
            smtpPort: Number(smtpPort || 587),
            smtpSecure: Boolean(smtpSecure),
            smtpUser: String(smtpUser || "").trim(),
            saveSentCopy: Boolean(saveSentCopy),
            imapHost: String(imapHost || "").trim(),
            imapPort: Number(imapPort || 993),
            imapSecure: Boolean(imapSecure),
            imapUser: String(imapUser || "").trim(),
            sentFolder: String(sentFolder || "Sent").trim() || "Sent",
            fromName: String(fromName || "").trim(),
            fromEmail: String(fromEmail || "").trim(),
            updatedBy: req.userId,
        };

        if (!next.smtpHost || !next.smtpPort || !next.smtpUser) {
            return res.status(400).json({ ok: false, message: "SMTP Host, Port, and Username are required" });
        }

        ensureCompatibleFromEmail({
            smtpUser: next.smtpUser,
            fromEmail: next.fromEmail,
        });

        const existing = await EmailSettings.findOne({ companyId }).lean();
        const passValue = String(smtpPass || "").trim();
        let smtpPassPlain = "";
        if (passValue && !isMaskedPasswordValue(passValue)) {
            next.smtpPassEncrypted = encrypt(passValue);
            smtpPassPlain = passValue;
        } else if (existing?.smtpPassEncrypted) {
            next.smtpPassEncrypted = existing.smtpPassEncrypted;
            smtpPassPlain = decrypt(existing.smtpPassEncrypted);
        }

        if (!next.smtpPassEncrypted) {
            return res.status(400).json({ ok: false, message: "SMTP Password is required" });
        }

        const imapPassValue = String(imapPass || "").trim();
        let imapPassPlain = "";
        if (imapPassValue && !isMaskedPasswordValue(imapPassValue)) {
            next.imapPassEncrypted = encrypt(imapPassValue);
            imapPassPlain = imapPassValue;
        } else if (existing?.imapPassEncrypted) {
            next.imapPassEncrypted = existing.imapPassEncrypted;
            imapPassPlain = decrypt(existing.imapPassEncrypted);
        }

        await verifyEmailSettings({
            smtpHost: next.smtpHost,
            smtpPort: next.smtpPort,
            smtpSecure: next.smtpSecure,
            smtpUser: next.smtpUser,
            smtpPass: smtpPassPlain,
        });

        if (next.saveSentCopy) {
            await verifySentCopySettings({
                smtpHost: next.smtpHost,
                smtpUser: next.smtpUser,
                smtpPass: smtpPassPlain,
                imapHost: next.imapHost,
                imapPort: next.imapPort,
                imapSecure: next.imapSecure,
                imapUser: next.imapUser,
                imapPass: imapPassPlain,
                sentFolder: next.sentFolder,
            });
        }

        await EmailSettings.updateOne(
            { companyId },
            { $set: next },
            { upsert: true },
        );

        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});

// ---------------- Templates ----------------
router.get("/templates", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        await ensureDefaultTemplates({ companyId, userId: req.userId });
        const templates = await EmailTemplate.find({ companyId })
            .sort({ createdAt: -1 })
            .lean();
        return res.json({ ok: true, templates });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});

router.post("/templates", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        const { name, subject = "", body = "", status = "Active" } = req.body || {};
        if (!String(name || "").trim()) return res.status(400).json({ ok: false, message: "Template name required" });

        const created = await EmailTemplate.create({
            companyId,
            name: String(name).trim(),
            subject: String(subject || "").trim(),
            body: String(body || ""),
            status: String(status || "Active") === "Inactive" ? "Inactive" : "Active",
            createdBy: req.userId,
        });

        return res.status(201).json({ ok: true, template: created });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ ok: false, message: "Template name already exists" });
        return res.status(500).json({ ok: false, message: e.message });
    }
});

router.put("/templates/:id", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        const id = String(req.params.id || "").trim();
        const { name, subject, body, status } = req.body || {};
        const update = {};
        if (name != null) update.name = String(name || "").trim();
        if (subject != null) update.subject = String(subject || "").trim();
        if (body != null) update.body = String(body || "");
        if (status != null) update.status = String(status) === "Inactive" ? "Inactive" : "Active";

        const updated = await EmailTemplate.findOneAndUpdate(
            { _id: id, companyId },
            { $set: update },
            { returnDocument: "after" },
        );
        if (!updated) return res.status(404).json({ ok: false, message: "Template not found" });
        return res.json({ ok: true, template: updated });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ ok: false, message: "Template name already exists" });
        return res.status(500).json({ ok: false, message: e.message });
    }
});

router.delete("/templates/:id", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });
        const id = String(req.params.id || "").trim();
        const deleted = await EmailTemplate.findOneAndDelete({ _id: id, companyId });
        if (!deleted) return res.status(404).json({ ok: false, message: "Template not found" });
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});

// ---------------- Logs ----------------
router.get("/logs", async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        const status = String(req.query.status || "").trim();
        const page = Math.max(1, parseInt(req.query.page || "1", 10));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
        const skip = (page - 1) * limit;

        const filter = { companyId };
        if (status) filter.status = status;

        const [items, total] = await Promise.all([
            EmailLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            EmailLog.countDocuments(filter),
        ]);

        return res.json({
            ok: true,
            logs: items,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});

// ---------------- Send ----------------
router.post("/send", upload.single("file"), async (req, res) => {
    try {
        const companyId = getCompanyIdFromReq(req);
        if (!companyId) return res.status(400).json({ ok: false, message: "Company not set for user" });

        const {
            to = "",
            subject = "",
            message = "",
            enquiryId = null,
            templateId = null,
            date = "",
            product = "",
            trackOpen = false,
            trackLinks = false,
        } = req.body || {};

        const settings = await getCompanyEmailSettings(companyId);
        if (!settings) {
            return res.status(400).json({
                ok: false,
                message: "Email is not configured. Go to Settings → Email Settings and save SMTP details.",
            });
        }

        let finalSubject = String(subject || "").trim();
        let finalBody = String(message || "");
        let usedTemplateId = templateId || null;

        let enquiry = null;
        const ownerId = req.user?.parentUserId || req.userId;
        if (enquiryId) {
            enquiry = await Enquiry.findOne({ _id: enquiryId, userId: ownerId })
                .select("enqNo name email mobile image product")
                .lean();
        }

        if (usedTemplateId) {
            const tpl = await EmailTemplate.findOne({ _id: usedTemplateId, companyId }).lean();
            if (!tpl) return res.status(404).json({ ok: false, message: "Email template not found" });
            if (!finalSubject) finalSubject = tpl.subject || "";
            if (!finalBody) finalBody = tpl.body || "";
        }

        const company = await Company.findById(companyId).select("name").lean().catch(() => null);
        const vars = {
            name: enquiry?.name || "",
            company: company?.name || "",
            staff: req.user?.name || "",
            product: String(product || enquiry?.product || "").trim(),
            date: String(date || "").trim(),
        };
        finalSubject = applyTemplateVars(finalSubject, vars);
        finalBody = applyTemplateVars(finalBody, vars);

        const attachmentsMeta = [];
        const nodemailerAttachments = [];
        if (req.file) {
            const relPath = `uploads/email/${req.file.filename}`;
            attachmentsMeta.push({
                filename: req.file.originalname,
                path: relPath,
                mimetype: req.file.mimetype,
                size: req.file.size || 0,
            });
            nodemailerAttachments.push({
                filename: req.file.originalname,
                path: req.file.path,
                contentType: req.file.mimetype,
            });
        }

        const log = await EmailLog.create({
            companyId,
            enquiryId: enquiryId || null,
            templateId: usedTemplateId || null,
            to: String(to || "").trim(),
            subject: finalSubject,
            body: finalBody,
            status: "Queued",
            attachments: attachmentsMeta,
            sentBy: req.userId,
            trackOpen: Boolean(trackOpen),
            trackLinks: Boolean(trackLinks),
        });

        const baseUrl = (process.env.PUBLIC_BASE_URL || "").trim() || `${req.protocol}://${req.get("host")}`;
        const openUrl = `${baseUrl}/api/email/track/open/${log._id}.gif`;
        const clickBaseUrl = `${baseUrl}/api/email/track/click/${log._id}`;

        const bodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4;">${
            linkifyAndTrack({ text: finalBody, trackLinks: Boolean(trackLinks), clickBaseUrl })
        }${
            trackOpen ? `<img src="${escapeHtml(openUrl)}" width="1" height="1" alt="" style="display:none" />` : ""
        }</div>`;

        try {
            const result = await sendEmail({
                settings,
                to,
                subject: finalSubject,
                text: finalBody,
                html: bodyHtml,
                attachments: nodemailerAttachments,
            });

            await EmailLog.updateOne(
                { _id: log._id },
                {
                    $set: {
                        status: "Sent",
                        sentAt: new Date(),
                        messageId: result?.messageId || "",
                        smtpResponse: String(result?.response || ""),
                        acceptedRecipients: Array.isArray(result?.accepted) ? result.accepted : [],
                        rejectedRecipients: Array.isArray(result?.rejected) ? result.rejected : [],
                        bodyHtml,
                    },
                },
            );

            await recordEmailActivity({
                req,
                ownerId,
                enquiry,
                subject: finalSubject,
                message: finalBody,
            });

            return res.json({ ok: true, logId: log._id, status: "Sent" });
        } catch (sendErr) {
            await EmailLog.updateOne(
                { _id: log._id },
                {
                    $set: {
                        status: "Failed",
                        error: sendErr.message || "Send failed",
                        smtpResponse: String(sendErr?.response || ""),
                        rejectedRecipients: Array.isArray(sendErr?.rejected) ? sendErr.rejected : [],
                        bodyHtml,
                    },
                },
            );
            return res.status(502).json({ ok: false, message: sendErr.message || "Send failed", logId: log._id });
        }
    } catch (e) {
        return res.status(500).json({ ok: false, message: e.message });
    }
});

module.exports = router;
