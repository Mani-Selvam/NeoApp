const axios = require("axios");
const { enqueueSms } = require("../services/smsQueue");
const twilio = require("twilio");
const {
    createTransporter,
    getMailConfig,
    hasRealCredentials,
    verifyTransporter,
} = require("./mailTransport");

const sendEmailOTP = async (email, otp) => {
    try {
        if (!hasRealCredentials()) {
            console.warn(
                "Email SMTP settings missing or placeholders. OTP email simulation only.",
            );
            return false;
        }

        const transporter = createTransporter();
        const { from } = getMailConfig();
        await verifyTransporter();

        const subject = "Your NeoApp OTP Code";
        const text = [
            `Your NeoApp verification code is: ${otp}`,
            "",
            "This code will expire in 5 minutes.",
            "",
            "If you did not request this code, please ignore this email.",
        ].join("\n");
        const html = `
            <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
                <h2 style="margin: 0 0 12px;">NeoApp Verification Code</h2>
                <p style="margin: 0 0 12px;">Your verification code is <strong>${otp}</strong>.</p>
                <p style="margin: 0 0 12px;">This code will expire in 5 minutes.</p>
                <p style="margin: 0;">If you did not request this code, please ignore this email.</p>
            </div>
        `;

        const info = await transporter.sendMail({
            from,
            to: email,
            subject,
            text,
            html,
        });
        console.log("[OTP][Email] SMTP accepted message", {
            to: email,
            from,
            messageId: info?.messageId || "",
            accepted: info?.accepted || [],
            rejected: info?.rejected || [],
            response: info?.response || "",
        });
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

const getTwilioSmsConfig = () => ({
    accountSid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
    authToken: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
    fromNumber: String(process.env.TWILIO_SMS_NUMBER || "").trim(),
    messagingServiceSid: String(
        process.env.TWILIO_MESSAGING_SERVICE_SID || "",
    ).trim(),
});

const getNeoOtpTemplateConfig = () => ({
    endpoint: String(
        process.env.NEO_OTP_WHATSAPP_URL ||
        "https://aiwhatsappapi.neophrontech.com/v1/message/send-message",
    ).trim(),
    token: String(process.env.NEO_OTP_TEMPLATE_TOKEN || "").trim(),
    templateName: String(process.env.NEO_OTP_TEMPLATE_NAME || "").trim(),
    languageCode: String(process.env.NEO_OTP_TEMPLATE_LANGUAGE || "en").trim() || "en",
    buttonIndex: String(process.env.NEO_OTP_TEMPLATE_BUTTON_INDEX || "0").trim() || "0",
});

const getNeoSignupTemplateConfig = () => ({
    endpoint: String(
        process.env.NEO_SIGNUP_WHATSAPP_URL ||
        process.env.NEO_OTP_WHATSAPP_URL ||
        "https://aiwhatsappapi.neophrontech.com/v1/message/send-message",
    ).trim(),
    token: String(
        process.env.NEO_SIGNUP_TEMPLATE_TOKEN ||
        process.env.NEO_OTP_TEMPLATE_TOKEN ||
        "",
    ).trim(),
    languageCode: String(process.env.NEO_SIGNUP_TEMPLATE_LANGUAGE || "en").trim() || "en",
    userTemplateName: String(
        process.env.NEO_SIGNUP_USER_TEMPLATE_NAME || "company_signup_welcome",
    ).trim(),
    adminTemplateName: String(
        process.env.NEO_SIGNUP_ADMIN_TEMPLATE_NAME || "admin_new_company_signup",
    ).trim(),
    adminNumber: String(process.env.SIGNUP_ADMIN_ALERT_NUMBER || "").trim(),
});

const sendSmsViaTwilio = async ({ phoneNumber, message }) => {
    try {
        const cfg = getTwilioSmsConfig();
        if (
            !cfg.accountSid ||
            !cfg.authToken ||
            (!cfg.fromNumber && !cfg.messagingServiceSid)
        ) {
            return false;
        }

        const client = twilio(cfg.accountSid, cfg.authToken);
        const payload = {
            body: message,
            to: phoneNumber,
        };
        if (cfg.messagingServiceSid) {
            payload.messagingServiceSid = cfg.messagingServiceSid;
        } else {
            payload.from = cfg.fromNumber.startsWith("+")
                ? cfg.fromNumber
                : `+${cfg.fromNumber}`;
        }

        const response = await client.messages.create(payload);

        console.log("[OTP] SMS sent via Twilio", {
            to: phoneNumber,
            sid: response?.sid || "",
            status: response?.status || "",
        });
        return true;
    } catch (error) {
        console.error("[OTP] Twilio SMS failed:", error?.message || "unknown_error");
        return false;
    }
};

const sendWhatsappTemplateOtp = async ({ phoneNumber, otp }) => {
    try {
        const cfg = getNeoOtpTemplateConfig();
        if (!cfg.token || !cfg.templateName) {
            return false;
        }

        const payload = {
            to: String(phoneNumber || "").replace(/[^\d]/g, ""),
            type: "template",
            template: {
                language: {
                    policy: "deterministic",
                    code: cfg.languageCode,
                },
                name: cfg.templateName,
                components: [
                    {
                        type: "body",
                        parameters: [
                            {
                                type: "text",
                                text: String(otp || ""),
                            },
                        ],
                    },
                    {
                        type: "button",
                        sub_type: "url",
                        index: cfg.buttonIndex,
                        parameters: [
                            {
                                type: "text",
                                text: String(otp || ""),
                            },
                        ],
                    },
                ],
            },
        };

        const response = await axios.post(
            `${cfg.endpoint}?token=${encodeURIComponent(cfg.token)}`,
            payload,
            {
                headers: { "Content-Type": "application/json" },
                timeout: 20000,
            },
        );

        console.log("[OTP] WhatsApp template OTP sent", {
            to: payload.to,
            templateName: cfg.templateName,
            status: response?.status || 0,
        });
        return true;
    } catch (error) {
        console.error(
            "[OTP] WhatsApp template OTP failed:",
            error?.response?.data || error?.message || "unknown_error",
        );
        return false;
    }
};

const sendNeoTemplateMessage = async ({
    phoneNumber,
    templateName,
    parameters = [],
}) => {
    try {
        const cfg = getNeoSignupTemplateConfig();
        if (!cfg.token || !templateName) return false;

        const payload = {
            to: String(phoneNumber || "").replace(/[^\d]/g, ""),
            type: "template",
            template: {
                language: {
                    policy: "deterministic",
                    code: cfg.languageCode,
                },
                name: templateName,
                components: [
                    {
                        type: "body",
                        parameters: parameters.map((value) => ({
                            type: "text",
                            text: String(value || ""),
                        })),
                    },
                ],
            },
        };

        const response = await axios.post(
            `${cfg.endpoint}?token=${encodeURIComponent(cfg.token)}`,
            payload,
            {
                headers: { "Content-Type": "application/json" },
                timeout: 20000,
            },
        );

        console.log("[WhatsApp][SignupTemplate] sent", {
            to: payload.to,
            templateName,
            status: response?.status || 0,
        });
        return true;
    } catch (error) {
        console.error(
            "[WhatsApp][SignupTemplate] failed:",
            error?.response?.data || error?.message || "unknown_error",
        );
        return false;
    }
};

const sendSignupTemplateNotifications = async ({
    customerPhoneNumber,
    customerName,
    companyName,
    companyCode,
    email,
    adminPhoneNumber,
}) => {
    const cfg = getNeoSignupTemplateConfig();
    const adminNumber = String(adminPhoneNumber || cfg.adminNumber || "").trim();
    const safeCustomerName = String(customerName || "").trim() || "Customer";
    const safeCompanyName = String(companyName || "").trim() || safeCustomerName;
    const safeCompanyCode = String(companyCode || "").trim() || "-";
    const safeContact = String(email || customerPhoneNumber || "").trim() || "-";
    const safeMobile = String(customerPhoneNumber || "").trim() || "-";
    const now = new Date();
    const safeSignupDate = `${String(now.getDate()).padStart(2, "0")}/${String(
        now.getMonth() + 1,
    ).padStart(2, "0")}/${now.getFullYear()}`;

    const tasks = [];

    if (customerPhoneNumber && cfg.userTemplateName) {
        tasks.push(
            sendNeoTemplateMessage({
                phoneNumber: customerPhoneNumber,
                templateName: cfg.userTemplateName,
                parameters: [
                    safeCustomerName,
                    safeCompanyName,
                    String(email || "").trim() || "-",
                    safeMobile,
                ],
            }),
        );
    }

    if (adminNumber && cfg.adminTemplateName) {
        tasks.push(
            sendNeoTemplateMessage({
                phoneNumber: adminNumber,
                templateName: cfg.adminTemplateName,
                parameters: [
                    safeCustomerName,
                    safeCompanyName,
                    safeMobile,
                    safeSignupDate,
                ],
            }),
        );
    }

    if (!tasks.length) return false;
    const results = await Promise.allSettled(tasks);
    return results.some((item) => item.status === "fulfilled" && item.value);
};

const sendMobileOTP = async (mobile, otp, options = {}) => {
    let neoNotConfiguredMessage = "";
    try {
        const cleanNum = (mobile || "").replace(/\D/g, "");
        if (!cleanNum) return false;

        const {
            NEO_NOT_CONFIGURED_MESSAGE,
            loadWhatsappConfig,
            normalizePhoneNumber,
            sendWhatsAppMessage,
        } = require("./whatsappConfigService");
        neoNotConfiguredMessage = NEO_NOT_CONFIGURED_MESSAGE;

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
            const ok =
                (await sendSmsViaTwilio({ phoneNumber: e164, message })) ||
                (await sendSmsViaQueue({ phoneNumber: e164, message }));
            if (ok) {
                console.log(`[OTP] SMS OTP sent to ${e164}`);
                return true;
            }
            // If explicitly SMS, do not silently report success via another channel.
            return false;
        }

        if (method === "whatsapp") {
            const templateOk = await sendWhatsappTemplateOtp({
                phoneNumber: e164,
                otp,
            });
            if (templateOk) return true;
            return await tryWhatsapp();
        }

        // Default behavior: try Twilio first, then SIM gateway, then WhatsApp provider.
        const smsOk =
            (await sendSmsViaTwilio({ phoneNumber: e164, message })) ||
            (await sendSmsViaQueue({ phoneNumber: e164, message }));
        if (smsOk) {
            console.log(`[OTP] SMS OTP sent to ${e164}`);
            return true;
        }

        return await tryWhatsapp();
    } catch (error) {
        if (
            neoNotConfiguredMessage &&
            (error.message || "").includes(neoNotConfiguredMessage)
        ) {
            console.error("Error sending mobile OTP:", neoNotConfiguredMessage);
            return false;
        }
        console.error(
            "Error sending mobile OTP:",
            error.response?.data || error.message,
        );
        return false;
    }
};

module.exports = {
    sendEmailOTP,
    sendMobileOTP,
    sendSignupTemplateNotifications,
};
