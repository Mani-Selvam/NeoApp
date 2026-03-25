const nodemailer = require("nodemailer");
const MailComposer = require("nodemailer/lib/mail-composer");
const { ImapFlow } = require("imapflow");
const EmailSettings = require("../models/EmailSettings");
const { decrypt } = require("../utils/crypto");

const normalizeEmail = (value) => String(value || "").trim();

const isValidEmail = (value) => {
    const email = normalizeEmail(value);
    // Simple, practical check (avoids over-rejecting valid emails)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getEmailDomain = (value) => {
    const email = normalizeEmail(value).toLowerCase();
    if (!isValidEmail(email)) return "";
    return email.split("@")[1] || "";
};

const ensureCompatibleFromEmail = ({ smtpUser, fromEmail }) => {
    const smtpEmail = normalizeEmail(smtpUser);
    const senderEmail = normalizeEmail(fromEmail);

    if (!senderEmail) {
        return {
            fromEmail: isValidEmail(smtpEmail) ? smtpEmail : "",
            replyTo: "",
        };
    }

    if (!isValidEmail(senderEmail)) {
        throw new Error("From Email is not a valid email address.");
    }

    if (!isValidEmail(smtpEmail)) {
        return { fromEmail: senderEmail, replyTo: "" };
    }

    const smtpDomain = getEmailDomain(smtpEmail);
    const senderDomain = getEmailDomain(senderEmail);

    if (smtpDomain && senderDomain && smtpDomain !== senderDomain) {
        throw new Error(
            `From Email domain must match the SMTP account domain. Use an address from ${smtpDomain} or leave From Email blank.`,
        );
    }

    return {
        fromEmail: senderEmail,
        replyTo: senderEmail !== smtpEmail ? senderEmail : "",
    };
};

const mapEmailErrorMessage = (error) => {
    const code = String(error?.code || "").trim().toUpperCase();
    const responseCode = Number(error?.responseCode || 0);
    const command = String(error?.command || "").trim().toUpperCase();
    const raw = String(error?.message || "").trim();
    const lower = raw.toLowerCase();

    if (code === "EAUTH" || responseCode === 535 || lower.includes("535")) {
        return "SMTP login failed. Check your email username and password. If you use Gmail, use an App Password instead of your normal password.";
    }
    if (code === "ENOTFOUND" || lower.includes("getaddrinfo enotfound")) {
        return "SMTP host was not found. Check the SMTP Host value in Email Settings.";
    }
    if (code === "ECONNECTION" || code === "ESOCKET" || lower.includes("ssl") || lower.includes("tls")) {
        return "Could not connect to the SMTP server. Check host, port, and SSL/TLS setting.";
    }
    if (command === "CONN" || lower.includes("connection timeout") || code === "ETIMEDOUT") {
        return "SMTP server connection timed out. Check host, port, and internet access on the server.";
    }
    if (responseCode === 550 || lower.includes("mailbox unavailable")) {
        return "The sender or recipient email address was rejected by the mail server.";
    }

    return raw || "Email send failed";
};

const assertAcceptedRecipients = (result, recipient) => {
    const accepted = Array.isArray(result?.accepted) ? result.accepted : [];
    const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
    const pending = Array.isArray(result?.pending) ? result.pending : [];
    const expected = normalizeEmail(recipient);

    if (accepted.length > 0 && accepted.includes(expected) && rejected.length === 0) {
        return true;
    }

    if (accepted.length > 0 && rejected.length === 0 && pending.length === 0) {
        return true;
    }

    const rejectedList = rejected.length ? rejected.join(", ") : expected;
    throw new Error(
        `Email was not accepted by the mail server for delivery${rejectedList ? `: ${rejectedList}` : ""}.`,
    );
};

const guessImapHost = (smtpHost) => {
    const host = String(smtpHost || "").trim();
    if (!host) return "";
    if (/^smtp\./i.test(host)) return host.replace(/^smtp\./i, "imap.");
    return host;
};

const getImapSettings = (settings = {}) => ({
    host: String(settings.imapHost || "").trim() || guessImapHost(settings.smtpHost),
    port: Number(settings.imapPort || (settings.imapSecure === false ? 143 : 993) || 993),
    secure: settings.imapSecure !== false,
    user: String(settings.imapUser || "").trim() || String(settings.smtpUser || "").trim(),
    pass: String(settings.imapPass || "").trim() || String(settings.smtpPass || "").trim(),
    sentFolder: String(settings.sentFolder || "Sent").trim() || "Sent",
});

const getCompanyEmailSettings = async (companyId) => {
    if (!companyId) return null;
    const settings = await EmailSettings.findOne({ companyId }).lean();
    if (!settings) return null;

    const smtpPass = decrypt(settings.smtpPassEncrypted || "");
    const imapPass = decrypt(settings.imapPassEncrypted || "");
    return {
        ...settings,
        smtpPass,
        imapPass,
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

const verifyEmailSettings = async ({ smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass }) => {
    try {
        const transporter = createTransporter({
            smtpHost,
            smtpPort,
            smtpSecure,
            smtpUser,
            smtpPass,
        });
        await transporter.verify();
        return true;
    } catch (error) {
        throw new Error(mapEmailErrorMessage(error));
    }
};

const verifySentCopySettings = async (settings) => {
    const imap = getImapSettings(settings);
    if (!imap.host || !imap.user || !imap.pass) {
        throw new Error("IMAP Host, Username, and Password are required to save sent mail to your mailbox.");
    }

    const client = new ImapFlow({
        host: imap.host,
        port: imap.port,
        secure: imap.secure,
        auth: { user: imap.user, pass: imap.pass },
        logger: false,
    });

    try {
        await client.connect();
        await client.mailboxOpen(imap.sentFolder);
        return true;
    } catch (error) {
        throw new Error(`Sent mailbox check failed: ${error?.message || "IMAP error"}`);
    } finally {
        await client.logout().catch(() => null);
    }
};

const appendToSentFolder = async ({ settings, rawMessage }) => {
    if (!settings?.saveSentCopy || !rawMessage) return;

    const imap = getImapSettings(settings);
    if (!imap.host || !imap.user || !imap.pass) {
        throw new Error("Sent-copy sync is enabled but IMAP settings are incomplete.");
    }

    const client = new ImapFlow({
        host: imap.host,
        port: imap.port,
        secure: imap.secure,
        auth: { user: imap.user, pass: imap.pass },
        logger: false,
    });

    try {
        await client.connect();
        await client.append(imap.sentFolder, rawMessage, ["\\Seen"]);
    } finally {
        await client.logout().catch(() => null);
    }
};

const sendEmail = async ({ settings, to, subject, text, html, attachments }) => {
    if (!settings) throw new Error("Missing email settings");
    if (!isValidEmail(to)) throw new Error("Invalid recipient email");
    try {
        const transporter = createTransporter(settings);
        const fromName = String(settings.fromName || "").trim();
        const senderConfig = ensureCompatibleFromEmail({
            smtpUser: settings.smtpUser,
            fromEmail: settings.fromEmail || settings.smtpUser || "",
        });
        const fromEmail = normalizeEmail(senderConfig.fromEmail || settings.smtpUser || "");
        const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
        const recipientEmail = normalizeEmail(to);
        const smtpUserEmail = normalizeEmail(settings.smtpUser || "");
        const shouldBccSender =
            isValidEmail(smtpUserEmail) &&
            smtpUserEmail.toLowerCase() !== recipientEmail.toLowerCase();
        const mailOptions = {
            from,
            to: recipientEmail,
            subject: String(subject || "").trim(),
            text: String(text || "").trim(),
            html: html || undefined,
            replyTo: senderConfig.replyTo || undefined,
            bcc: shouldBccSender ? smtpUserEmail : undefined,
            envelope: isValidEmail(settings.smtpUser)
                ? {
                      from: normalizeEmail(settings.smtpUser),
                      to: shouldBccSender
                          ? [recipientEmail, smtpUserEmail]
                          : recipientEmail,
                  }
                : undefined,
            attachments: Array.isArray(attachments) ? attachments : [],
        };
        const rawMessage = await new MailComposer(mailOptions).compile().build();
        const result = await transporter.sendMail(mailOptions);

        assertAcceptedRecipients(result, to);
        await appendToSentFolder({ settings, rawMessage });
        return result;
    } catch (error) {
        throw new Error(mapEmailErrorMessage(error));
    }
};

module.exports = {
    ensureCompatibleFromEmail,
    getEmailDomain,
    getCompanyEmailSettings,
    isValidEmail,
    mapEmailErrorMessage,
    sendEmail,
    verifySentCopySettings,
    verifyEmailSettings,
};
