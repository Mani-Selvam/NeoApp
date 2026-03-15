const nodemailer = require("nodemailer");
const { enqueueSms } = require("../services/smsQueue");
const {
    NEO_NOT_CONFIGURED_MESSAGE,
    loadWhatsappConfig,
    normalizePhoneNumber,
    sendWhatsAppMessage,
} = require("./whatsappConfigService");

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

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Verification Code",
            text: `Your OTP is: ${otp}`,
            html: `<h3>Your Verification Code</h3><p>Your OTP is: <b>${otp}</b></p>`,
        });
        console.log(`OTP sent to email: ${email}`);
        return true;
    } catch (error) {
        console.error("Error sending email OTP:", error.message);
        return false;
    }
};

const toE164 = (mobile, defaultCountry) => {
    const raw = String(mobile || "").trim();
    if (!raw) return "";

    if (raw.startsWith("+")) {
        const digits = raw.replace(/[^\d]/g, "");
        return digits ? `+${digits}` : "";
    }

    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) return "";

    const cc = String(defaultCountry || "91").replace(/[^\d]/g, "") || "91";
    return `+${cc}${digits}`;
};

const sendSmsViaQueue = async ({ phoneNumber, message }) => {
    try {
        const res = await enqueueSms({ phoneNumber, message });
        if (!res?.ok) {
            console.error("[OTP] SMS queue failed:", res?.error || "unknown_error");
        }
        return Boolean(res?.ok);
    } catch (_e) {
        return false;
    }
};

const sendMobileOTP = async (mobile, otp, options = {}) => {
    try {
        const cleanNum = (mobile || "").replace(/\D/g, "");
        if (!cleanNum) return false;

        const cfg = await loadWhatsappConfig({
            ownerUserId: options.ownerUserId,
        });

        const method = String(options.method || "").toLowerCase().trim(); // "sms" | "whatsapp" | ""
        const defaultCountry = cfg?.defaultCountry || "91";
        const e164 = toE164(mobile, defaultCountry);
        if (!e164) return false;

        const message = `Your CRM verification code is: ${otp}`;

        const tryWhatsapp = async () => {
            if (!cfg) return false;
            const normalizedNumber = normalizePhoneNumber(
                cleanNum,
                cfg.defaultCountry || "91",
            );
            await sendWhatsAppMessage({
                ownerUserId: options.ownerUserId,
                phoneNumber: normalizedNumber,
                content: message,
            });
            console.log(`[OTP] WhatsApp OTP sent to ${normalizedNumber}`);
            return true;
        };

        // Explicit method routing
        if (method === "sms") {
            const ok = await sendSmsViaQueue({ phoneNumber: e164, message });
            if (ok) {
                console.log(`[OTP] SMS OTP sent to ${e164}`);
                return true;
            }
            // If explicitly SMS, do not silently report success via another channel.
            return false;
        }

        if (method === "whatsapp") {
            return await tryWhatsapp();
        }

        // Default behavior: try SMS gateway first (if configured), then WhatsApp provider.
        const smsOk = await sendSmsViaQueue({ phoneNumber: e164, message });
        if (smsOk) {
            console.log(`[OTP] SMS OTP sent to ${e164}`);
            return true;
        }

        return await tryWhatsapp();
    } catch (error) {
        if ((error.message || "").includes(NEO_NOT_CONFIGURED_MESSAGE)) {
            console.error("Error sending mobile OTP:", NEO_NOT_CONFIGURED_MESSAGE);
            return false;
        }
        console.error(
            "Error sending mobile OTP:",
            error.response?.data || error.message,
        );
        return false;
    }
};

module.exports = { sendEmailOTP, sendMobileOTP };
