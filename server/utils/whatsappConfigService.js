const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const twilio = require("twilio");
const WhatsAppConfig = require("../models/WhatsAppConfig");
const { decrypt, encrypt } = require("./crypto");

const _whConfigCache = new Map();
const _whConfigCacheAt = new Map();
const cacheTTL = 30 * 1000;

const PROVIDERS = {
    WATI: "WATI",
    META: "META",
    NEO: "NEO",
    TWILIO: "TWILIO",
};

const NEO_NOT_CONFIGURED_MESSAGE =
    "Neo credentials are saved, but the Neo send API endpoint is not configured yet.";
const NEO_MESSAGES_URL = "https://apiv2.wacto.ai/v1/messages/send";

const makeLookupKey = (opts = {}) => {
    if (opts.companyId) return `company:${String(opts.companyId)}`;
    if (opts.ownerUserId) return `owner:${String(opts.ownerUserId)}`;
    return "global";
};

const normalizeProvider = (provider) => {
    const value = String(provider || "")
        .trim()
        .toUpperCase();
    return PROVIDERS[value] || PROVIDERS.WATI;
};

const normalizePhoneNumber = (raw, defaultCountry = "91") => {
    if (!raw) return "";
    const clean = String(raw).replace(/\D/g, "");
    if (!clean) return "";
    const last10 = clean.slice(-10);
    const country = String(defaultCountry || "91").replace(/\D/g, "") || "91";

    // Collapse malformed values like:
    // 88256200148825620014 -> 918825620014
    // 9188256200148825620014 -> 918825620014
    if (last10) {
        const duplicateLocal = `${last10}${last10}`;
        const duplicateWithCountry = `${country}${last10}${last10}`;
        if (clean === duplicateLocal || clean === duplicateWithCountry) {
            return `${country}${last10}`;
        }

        // If the value ends with the same 10 digits more than once, keep a single copy.
        const repeatedLast10 = clean.match(new RegExp(`(${last10})+?$`));
        if (repeatedLast10 && repeatedLast10[0].length > last10.length) {
            const prefix = clean.slice(
                0,
                clean.length - repeatedLast10[0].length,
            );
            const normalizedPrefix =
                prefix && prefix !== country ? prefix : country;
            return `${normalizedPrefix}${last10}`;
        }
    }

    if (clean.length === 10) return `${country}${clean}`;
    return clean;
};

const buildConfigView = (cfg) => {
    if (!cfg) return null;
    const provider = normalizeProvider(cfg.provider);
    const defaultCountry = cfg.defaultCountry || "91";
    const watiBaseUrl = cfg.watiBaseUrl || cfg.apiUrl || "";
    const watiApiToken =
        decrypt(cfg.watiApiTokenEncrypted || "") ||
        decrypt(cfg.apiTokenEncrypted || "");
    const metaWhatsappToken = decrypt(cfg.metaWhatsappTokenEncrypted || "");
    const neoApiKey = decrypt(cfg.neoApiKeyEncrypted || "");
    const neoBearerToken = decrypt(cfg.neoBearerTokenEncrypted || "");
    const twilioAuthToken = decrypt(cfg.twilioAuthTokenEncrypted || "");

    return {
        ...cfg,
        provider,
        defaultCountry,
        watiBaseUrl,
        watiApiToken,
        metaWhatsappToken,
        metaPhoneNumberId: cfg.metaPhoneNumberId || "",
        neoAccountName: cfg.neoAccountName || "",
        neoApiKey,
        neoPhoneNumber: cfg.neoPhoneNumber || "",
        neoBearerToken,
        twilioAccountSid: cfg.twilioAccountSid || "",
        twilioAuthToken,
        twilioWhatsappNumber: cfg.twilioWhatsappNumber || "",
        apiUrl: watiBaseUrl,
        apiToken: watiApiToken,
    };
};

const maskSecret = (value) => {
    const raw = String(value || "");
    if (!raw) return "";
    return raw.length <= 6 ? "****" : `****${raw.slice(-6)}`;
};

const getConfigSummary = (cfg) => {
    if (!cfg) return {};
    const provider = normalizeProvider(cfg.provider);
    return {
        ...cfg,
        provider,
        apiUrl: cfg.watiBaseUrl || cfg.apiUrl || "",
        apiToken: maskSecret(cfg.watiApiToken || cfg.apiToken || ""),
        watiBaseUrl: cfg.watiBaseUrl || cfg.apiUrl || "",
        watiApiToken: maskSecret(cfg.watiApiToken || cfg.apiToken || ""),
        metaWhatsappToken: maskSecret(cfg.metaWhatsappToken || ""),
        metaPhoneNumberId: cfg.metaPhoneNumberId || "",
        neoAccountName: cfg.neoAccountName || "",
        neoApiKey: maskSecret(cfg.neoApiKey || ""),
        neoPhoneNumber: cfg.neoPhoneNumber || "",
        neoBearerToken: maskSecret(cfg.neoBearerToken || ""),
        twilioAccountSid: cfg.twilioAccountSid || "",
        twilioAuthToken: maskSecret(cfg.twilioAuthToken || ""),
        twilioWhatsappNumber: cfg.twilioWhatsappNumber || "",
        hasWatiCredentials: Boolean(
            (cfg.watiBaseUrl || cfg.apiUrl) &&
            (cfg.watiApiToken || cfg.apiToken),
        ),
        hasMetaCredentials: Boolean(
            cfg.metaPhoneNumberId && cfg.metaWhatsappToken,
        ),
        hasNeoCredentials: Boolean(
            cfg.neoAccountName &&
            cfg.neoPhoneNumber &&
            (cfg.neoApiKey || cfg.neoBearerToken),
        ),
        hasTwilioCredentials: Boolean(
            cfg.twilioAccountSid &&
            cfg.twilioAuthToken &&
            cfg.twilioWhatsappNumber,
        ),
    };
};

const loadWhatsappConfig = async (opts = {}) => {
    const key = makeLookupKey(opts);
    try {
        const cached = _whConfigCache.get(key);
        const at = _whConfigCacheAt.get(key) || 0;
        if (cached && Date.now() - at < cacheTTL) return cached;

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
        const hydrated = buildConfigView(cfg);
        _whConfigCache.set(key, hydrated || null);
        _whConfigCacheAt.set(key, Date.now());
        return hydrated || null;
    } catch (e) {
        console.warn("Could not load WhatsAppConfig from DB:", e.message);
        return null;
    }
};

const clearWhatsappConfigCache = (opts = {}) => {
    const keys = new Set(["global"]);
    if (opts.ownerUserId)
        keys.add(makeLookupKey({ ownerUserId: opts.ownerUserId }));
    if (opts.companyId) keys.add(makeLookupKey({ companyId: opts.companyId }));

    for (const key of keys) {
        _whConfigCache.delete(key);
        _whConfigCacheAt.delete(key);
    }
};

const buildStoredConfig = (payload = {}, ownerUserId) => {
    const provider = normalizeProvider(payload.provider);
    const watiBaseUrl = String(
        payload.watiBaseUrl || payload.apiUrl || payload.WATI_BASE_URL || "",
    ).trim();
    const watiApiToken = String(
        payload.watiApiToken ||
            payload.apiToken ||
            payload.WATI_API_TOKEN ||
            "",
    ).trim();
    const metaWhatsappToken = String(
        payload.metaWhatsappToken || payload.META_WHATSAPP_TOKEN || "",
    ).trim();
    const metaPhoneNumberId = String(
        payload.metaPhoneNumberId || payload.META_PHONE_NUMBER_ID || "",
    ).trim();
    const neoAccountName = String(
        payload.neoAccountName ||
            payload.NEO_ACCOUNT_NAME ||
            payload.name ||
            "",
    ).trim();
    const neoApiKey = String(
        payload.neoApiKey || payload.NEO_API_KEY || payload.apiKey || "",
    ).trim();
    const neoPhoneNumber = String(
        payload.neoPhoneNumber ||
            payload.NEO_PHONE_NUMBER ||
            payload.phoneNumber ||
            "",
    ).trim();
    const neoBearerToken = String(
        payload.neoBearerToken ||
            payload.NEO_BEARER_TOKEN ||
            payload.bearerToken ||
            "",
    ).trim();
    const twilioAccountSid = String(
        payload.twilioAccountSid || payload.TWILIO_ACCOUNT_SID || "",
    ).trim();
    const twilioAuthToken = String(
        payload.twilioAuthToken || payload.TWILIO_AUTH_TOKEN || "",
    ).trim();
    const twilioWhatsappNumber = String(
        payload.twilioWhatsappNumber || payload.TWILIO_WHATSAPP_NUMBER || "",
    ).trim();

    return {
        provider,
        apiUrl: watiBaseUrl,
        watiBaseUrl,
        ...(watiApiToken
            ? {
                  apiTokenEncrypted: encrypt(watiApiToken),
                  watiApiTokenEncrypted: encrypt(watiApiToken),
              }
            : {}),
        ...(metaWhatsappToken
            ? { metaWhatsappTokenEncrypted: encrypt(metaWhatsappToken) }
            : {}),
        metaPhoneNumberId,
        neoAccountName,
        ...(neoApiKey ? { neoApiKeyEncrypted: encrypt(neoApiKey) } : {}),
        neoPhoneNumber,
        ...(neoBearerToken
            ? { neoBearerTokenEncrypted: encrypt(neoBearerToken) }
            : {}),
        twilioAccountSid,
        ...(twilioAuthToken
            ? { twilioAuthTokenEncrypted: encrypt(twilioAuthToken) }
            : {}),
        twilioWhatsappNumber,
        verifyToken: String(
            payload.verifyToken || payload.WHATSAPP_VERIFY_TOKEN || "",
        ).trim(),
        appSecret: String(
            payload.appSecret || payload.WHATSAPP_APP_SECRET || "",
        ).trim(),
        signatureHeader: String(
            payload.signatureHeader ||
                payload.WHATSAPP_SIGNATURE_HEADER ||
                "X-Hub-Signature-256",
        ).trim(),
        enableSignatureVerification: Boolean(
            payload.enableSignatureVerification,
        ),
        defaultCountry: String(
            payload.defaultCountry || payload.WHATSAPP_DEFAULT_COUNTRY || "91",
        ).trim(),
        ownerUserId,
        ...(payload.companyId ? { companyId: payload.companyId } : {}),
    };
};

const saveWhatsappConfig = async ({ ownerUserId, payload = {} }) => {
    const data = buildStoredConfig(payload, ownerUserId);
    const filter = payload.companyId
        ? { companyId: payload.companyId }
        : { ownerUserId };

    const updated = await WhatsAppConfig.findOneAndUpdate(filter, data, {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
    }).lean();

    clearWhatsappConfigCache({
        ownerUserId,
        companyId: payload.companyId,
    });

    return buildConfigView(updated);
};

const sendViaWati = async ({
    cfg,
    phoneNumber,
    content,
    filePath,
    fileName,
    mimeType,
}) => {
    if (!cfg?.watiBaseUrl || !cfg?.watiApiToken) {
        throw new Error("WATI credentials are missing");
    }

    const watiNumber = normalizePhoneNumber(phoneNumber, cfg.defaultCountry);
    const token = String(cfg.watiApiToken).trim();
    const authHeaders = [
        { Authorization: token },
        { Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}` },
        { Authorization: token.replace(/^Bearer\s+/i, "") },
    ];

    if (!filePath) {
        const url = `${cfg.watiBaseUrl}/api/v1/sendSessionMessage/${watiNumber}?messageText=${encodeURIComponent(content || "")}`;
        let lastError = null;
        for (const headers of authHeaders) {
            try {
                return await axios.post(url, {}, { headers, timeout: 20000 });
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error("WATI send failed");
    }

    const url = `${cfg.watiBaseUrl}/api/v1/sendSessionFile/${watiNumber}`;
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), {
        filename: fileName,
        contentType: mimeType,
    });

    let lastError = null;
    for (const headers of authHeaders) {
        try {
            return await axios.post(url, formData, {
                headers: { ...formData.getHeaders(), ...headers },
                timeout: 20000,
            });
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("WATI file send failed");
};

const sendViaMeta = async ({ cfg, phoneNumber, content }) => {
    if (!cfg?.metaPhoneNumberId || !cfg?.metaWhatsappToken) {
        throw new Error("Meta WhatsApp credentials are missing");
    }

    const url = `https://graph.facebook.com/v22.0/${cfg.metaPhoneNumberId}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(phoneNumber, cfg.defaultCountry),
        type: "text",
        text: { body: String(content || "") },
    };

    return axios.post(url, payload, {
        headers: {
            Authorization: `Bearer ${cfg.metaWhatsappToken}`,
            "Content-Type": "application/json",
        },
        timeout: 20000,
    });
};

const sendViaNeo = async ({ cfg, phoneNumber, content, filePath }) => {
    if (
        !cfg?.neoAccountName ||
        !cfg?.neoPhoneNumber ||
        (!cfg?.neoApiKey && !cfg?.neoBearerToken)
    ) {
        throw new Error("Neo WhatsApp credentials are missing");
    }
    if (filePath) {
        throw new Error(
            `${NEO_NOT_CONFIGURED_MESSAGE} Media sending is also not configured.`,
        );
    }

    const toNumber = normalizePhoneNumber(phoneNumber, cfg.defaultCountry);
    const fromNumber = normalizePhoneNumber(
        cfg.neoPhoneNumber,
        cfg.defaultCountry,
    );
    const bearerToken = String(
        cfg.neoBearerToken || cfg.neoApiKey || "",
    ).trim();
    const payload = {
        name: cfg.neoAccountName,
        phone: toNumber,
        phoneNumber: toNumber,
        to: toNumber,
        message: String(content || ""),
        text: String(content || ""),
        from: fromNumber,
        senderPhoneNumber: fromNumber,
    };

    return axios.post(NEO_MESSAGES_URL, payload, {
        headers: {
            Authorization: `Bearer ${bearerToken.replace(/^Bearer\s+/i, "")}`,
            "Content-Type": "application/json",
        },
        timeout: 20000,
    });
};

const sendViaTwilio = async ({ cfg, phoneNumber, content }) => {
    if (
        !cfg?.twilioAccountSid ||
        !cfg?.twilioAuthToken ||
        !cfg?.twilioWhatsappNumber
    ) {
        throw new Error("Twilio credentials are missing");
    }

    const client = twilio(cfg.twilioAccountSid, cfg.twilioAuthToken);
    const toNumber = `whatsapp:+${normalizePhoneNumber(phoneNumber, cfg.defaultCountry)}`;
    const fromNumber = String(cfg.twilioWhatsappNumber).startsWith("whatsapp:")
        ? cfg.twilioWhatsappNumber
        : `whatsapp:${cfg.twilioWhatsappNumber.startsWith("+") ? cfg.twilioWhatsappNumber : `+${cfg.twilioWhatsappNumber}`}`;

    const response = await client.messages.create({
        body: String(content || ""),
        from: fromNumber,
        to: toNumber,
    });

    return {
        status: 201,
        data: response,
    };
};

const extractProviderMessageMeta = (provider, response) => {
    const normalizedProvider = normalizeProvider(provider);
    const data = response?.data || {};

    if (normalizedProvider === PROVIDERS.WATI) {
        return {
            externalId: data?.message?.whatsappMessageId || null,
            providerTicketId: data?.message?.ticketId || null,
            providerOk: Boolean(data?.ok || data?.result === "success"),
        };
    }

    if (normalizedProvider === PROVIDERS.META) {
        return {
            externalId: data?.messages?.[0]?.id || null,
            providerTicketId: null,
            providerOk:
                Array.isArray(data?.messages) && data.messages.length > 0,
        };
    }

    if (normalizedProvider === PROVIDERS.NEO) {
        return {
            externalId: data?.messageId || data?.id || null,
            providerTicketId: data?.ticketId || null,
            providerOk: Boolean(data?.success || data?.ok || data?.messageId),
        };
    }

    if (normalizedProvider === PROVIDERS.TWILIO) {
        return {
            externalId: data?.sid || null,
            providerTicketId: data?.sid || null,
            providerOk: Boolean(data?.sid),
        };
    }

    return {
        externalId: null,
        providerTicketId: null,
        providerOk: false,
    };
};

const sendWhatsAppMessage = async ({
    ownerUserId,
    companyId,
    phoneNumber,
    content,
    filePath,
    fileName,
    mimeType,
}) => {
    const cfg = await loadWhatsappConfig(
        companyId ? { companyId } : { ownerUserId },
    );

    if (!cfg) {
        throw new Error("No WhatsApp configuration found for this account");
    }

    const provider = normalizeProvider(cfg.provider);
    if (provider === PROVIDERS.WATI) {
        return {
            provider,
            cfg,
            response: await sendViaWati({
                cfg,
                phoneNumber,
                content,
                filePath,
                fileName,
                mimeType,
            }),
        };
    }

    if (provider === PROVIDERS.META) {
        if (filePath) {
            throw new Error(
                "Meta WhatsApp file sending is not configured in this build",
            );
        }
        return {
            provider,
            cfg,
            response: await sendViaMeta({ cfg, phoneNumber, content }),
        };
    }

    if (provider === PROVIDERS.NEO) {
        return {
            provider,
            cfg,
            response: await sendViaNeo({ cfg, phoneNumber, content, filePath }),
        };
    }

    if (provider === PROVIDERS.TWILIO) {
        if (filePath) {
            throw new Error(
                "Twilio media sending is not configured in this build",
            );
        }
        return {
            provider,
            cfg,
            response: await sendViaTwilio({ cfg, phoneNumber, content }),
        };
    }

    throw new Error(`Unsupported WhatsApp provider: ${provider}`);
};

module.exports = {
    PROVIDERS,
    NEO_NOT_CONFIGURED_MESSAGE,
    clearWhatsappConfigCache,
    extractProviderMessageMeta,
    getConfigSummary,
    loadWhatsappConfig,
    normalizePhoneNumber,
    normalizeProvider,
    saveWhatsappConfig,
    sendWhatsAppMessage,
};
