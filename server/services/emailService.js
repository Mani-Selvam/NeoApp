const nodemailer = require("nodemailer");
const EmailSettings = require("../models/EmailSettings");
const { decrypt } = require("../utils/crypto");

const normalizeEmail = (value) => String(value || "").trim();

const isValidEmail = (value) => {
    const email = normalizeEmail(value);
    // Simple, practical check (avoids over-rejecting valid emails)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getCompanyEmailSettings = async (companyId) => {
    if (!companyId) return null;
    const settings = await EmailSettings.findOne({ companyId }).lean();
    if (!settings) return null;

    const smtpPass = decrypt(settings.smtpPassEncrypted || "");
    return {
        ...settings,
        smtpPass,
    };
};

const createTransporter = ({ smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass }) => {
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
        throw new Error("SMTP settings are incomplete");
    }

    return nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Boolean(smtpSecure),
        auth: { user: smtpUser, pass: smtpPass },
    });
};

const sendEmail = async ({ settings, to, subject, text, html, attachments }) => {
    if (!settings) throw new Error("Missing email settings");
    if (!isValidEmail(to)) throw new Error("Invalid recipient email");

    const transporter = createTransporter(settings);
    const fromName = String(settings.fromName || "").trim();
    const fromEmail = normalizeEmail(settings.fromEmail || settings.smtpUser || "");
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await transporter.sendMail({
        from,
        to: normalizeEmail(to),
        subject: String(subject || "").trim(),
        text: String(text || "").trim(),
        html: html || undefined,
        attachments: Array.isArray(attachments) ? attachments : [],
    });

    return result;
};

module.exports = {
    getCompanyEmailSettings,
    isValidEmail,
    sendEmail,
};

