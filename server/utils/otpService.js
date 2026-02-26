const nodemailer = require("nodemailer");
const axios = require("axios");

// Normalize numbers to 91 + last 10 digits
const normalizeTo91 = (raw) => {
    if (!raw) return "";
    const clean = String(raw).replace(/\D/g, "");
    if (!clean) return "";
    const last10 = clean.slice(-10);
    return `91${last10}`;
};

// Email Transporter (Gmail Example)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendEmailOTP = async (email, otp) => {
    try {
        const user = process.env.EMAIL_USER;
        const pass = process.env.EMAIL_PASS;

        if (
            !user ||
            !pass ||
            user.startsWith("your_") ||
            pass.startsWith("your_")
        ) {
            console.warn(
                "Email credentials missing or placeholders. OTP email simulation only.",
            );
            return true;
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Verification Code",
            text: `Your OTP is: ${otp}`,
            html: `<h3>Your Verification Code</h3><p>Your OTP is: <b>${otp}</b></p>`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to email: ${email}`);
        return true;
    } catch (error) {
        console.error("Error sending email OTP:", error.message);
        return false;
    }
};

// Mobile OTP now uses WATI (WhatsApp) for real message delivery if configured
const sendMobileOTP = async (mobile, otp) => {
    try {
        const cleanNum = (mobile || "").replace(/\D/g, "");
        if (!cleanNum) return false;

        // Normalize to 91 + last 10 digits for WATI
        const watiNumber = normalizeTo91(cleanNum);
        // Try WATI if configured — prefer DB-stored config (global) then env
        let apiUrl = process.env.WHATSAPP_API_URL;
        let rawToken = process.env.WHATSAPP_API_TOKEN;
        try {
            const WhatsAppConfig = require("../models/WhatsAppConfig");
            const { decrypt } = require("./crypto");
            const cfg = await WhatsAppConfig.findOne({}).lean();
            if (cfg) {
                if (cfg.apiUrl) apiUrl = cfg.apiUrl;
                if (cfg.apiTokenEncrypted)
                    rawToken = decrypt(cfg.apiTokenEncrypted);
            }
        } catch (cfgErr) {
            // ignore; fallback to env
        }

        if (apiUrl && rawToken) {
            const messageText = `Your CRM verification code is: ${otp}`;
            const url = `${apiUrl}/api/v1/sendSessionMessage/${watiNumber}?messageText=${encodeURIComponent(messageText)}`;

            console.log(`[WATI] Sending OTP ${otp} to ${watiNumber} -> ${url}`);

            // Try primary header as provided
            try {
                const headers = { Authorization: rawToken };
                const resp = await axios.post(
                    url,
                    {},
                    { headers, timeout: 20000 },
                );
                console.log(
                    "[WATI] Primary send response:",
                    resp.status,
                    resp.data,
                );
                return true;
            } catch (primaryErr) {
                console.warn(
                    "[WATI] Primary send failed:",
                    primaryErr.response?.status || primaryErr.message,
                );
                // Try alternate header formats (Bearer/raw)
                try {
                    let tokenOnly = rawToken.replace(/^Bearer\s+/i, "");
                    let altHeaders = { Authorization: `Bearer ${tokenOnly}` };
                    const resp2 = await axios.post(
                        url,
                        {},
                        { headers: altHeaders, timeout: 20000 },
                    );
                    console.log(
                        "[WATI] Alternate(Bearer) send response:",
                        resp2.status,
                        resp2.data,
                    );
                    return true;
                } catch (altErr) {
                    console.warn(
                        "[WATI] Alternate(Bearer) send failed:",
                        altErr.response?.data || altErr.message,
                    );
                    try {
                        const tokenOnly = rawToken.replace(/^Bearer\s+/i, "");
                        const altHeaders2 = { Authorization: tokenOnly };
                        const resp3 = await axios.post(
                            url,
                            {},
                            { headers: altHeaders2, timeout: 20000 },
                        );
                        console.log(
                            "[WATI] Alternate(raw) send response:",
                            resp3.status,
                            resp3.data,
                        );
                        return true;
                    } catch (altErr2) {
                        console.error(
                            "[WATI] All send attempts failed:",
                            altErr2.response?.data || altErr2.message,
                        );
                        return false;
                    }
                }
            }
        }

        // Try Twilio as fallback if SID/TOKEN are not placeholders
        if (
            process.env.TWILIO_ACCOUNT_SID &&
            !process.env.TWILIO_ACCOUNT_SID.startsWith("your_")
        ) {
            const twilioClient = require("twilio")(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN,
            );
            await twilioClient.messages.create({
                body: `Your CRM verification code is: ${otp}`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: `+${watiNumber.startsWith("91") ? watiNumber : "91" + cleanNum}`,
            });
            console.log(`[Twilio] SMS OTP sent to ${cleanNum}`);
            return true;
        }

        console.warn(
            `[OTP] No SMS/WhatsApp provider configured. Simulation only: ${otp} to ${mobile}`,
        );
        return true;
    } catch (error) {
        console.error(
            "Error sending mobile OTP:",
            error.response?.data || error.message,
        );
        return false;
    }
};

module.exports = { sendEmailOTP, sendMobileOTP };
