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
const NEO_MESSAGES_URL =
  "https://aiwhatsappapi.neophrontech.com/v1/message/send-message";

const buildEnvFallbackConfig = () => {
  const provider = normalizeProvider(
    process.env.WHATSAPP_PROVIDER || process.env.WHATSAPP_DEFAULT_PROVIDER || "NEO",
  );
  const defaultCountry = String(
    process.env.WHATSAPP_DEFAULT_COUNTRY || process.env.NEO_DEFAULT_COUNTRY || "91",
  ).trim() || "91";

  const envCfg = {
    provider,
    defaultCountry,
    watiBaseUrl: String(
      process.env.WATI_BASE_URL || process.env.WHATSAPP_API_URL || "",
    ).trim(),
    watiApiToken: String(
      process.env.WATI_API_TOKEN || process.env.WHATSAPP_API_TOKEN || "",
    ).trim(),
    metaWhatsappToken: String(process.env.META_WHATSAPP_TOKEN || "").trim(),
    metaPhoneNumberId: String(process.env.META_PHONE_NUMBER_ID || "").trim(),
    neoAccountName: String(
      process.env.NEO_ACCOUNT_NAME || process.env.WHATSAPP_DEFAULT_NAME || "",
    ).trim(),
    neoApiKey: String(process.env.NEO_API_KEY || "").trim(),
    neoPhoneNumber: String(
      process.env.NEO_PHONE_NUMBER || process.env.WHATSAPP_DEFAULT_PHONE_NUMBER || "",
    ).trim(),
    neoBearerToken: String(
      process.env.NEO_BEARER_TOKEN || process.env.WHATSAPP_DEFAULT_BEARER_TOKEN || "",
    ).trim(),
    twilioAccountSid: String(process.env.TWILIO_ACCOUNT_SID || "").trim(),
    twilioAuthToken: String(process.env.TWILIO_AUTH_TOKEN || "").trim(),
    twilioWhatsappNumber: String(
      process.env.TWILIO_WHATSAPP_NUMBER || "",
    ).trim(),
    verifyToken: String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim(),
    appSecret: String(process.env.WHATSAPP_APP_SECRET || "").trim(),
    signatureHeader: String(
      process.env.WHATSAPP_SIGNATURE_HEADER || "X-Hub-Signature-256",
    ).trim(),
    enableSignatureVerification:
      String(process.env.WHATSAPP_ENABLE_SIGNATURE_VERIFICATION || "").toLowerCase() === "true",
    source: "env",
    isFallback: true,
  };

  const hasProviderCredentials =
    (provider === PROVIDERS.WATI &&
      envCfg.watiBaseUrl &&
      envCfg.watiApiToken) ||
    (provider === PROVIDERS.META &&
      envCfg.metaPhoneNumberId &&
      envCfg.metaWhatsappToken) ||
    (provider === PROVIDERS.NEO &&
      envCfg.neoAccountName &&
      envCfg.neoPhoneNumber &&
      (envCfg.neoApiKey || envCfg.neoBearerToken)) ||
    (provider === PROVIDERS.TWILIO &&
      envCfg.twilioAccountSid &&
      envCfg.twilioAuthToken &&
      envCfg.twilioWhatsappNumber);

  return hasProviderCredentials ? envCfg : null;
};

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
      const prefix = clean.slice(0, clean.length - repeatedLast10[0].length);
      const normalizedPrefix = prefix && prefix !== country ? prefix : country;
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
    editOtpVerifiedAt: cfg.editOtpVerifiedAt || null,
    source: cfg.source || "db",
    isFallback: Boolean(cfg.isFallback),
  };
};

const getWhatsappEditVerificationWindowMs = () =>
  Number(process.env.WHATSAPP_CONFIG_OTP_TTL_MS || 24 * 60 * 60 * 1000);

const isWhatsappEditVerified = (cfg) => {
  const verifiedAt = cfg?.editOtpVerifiedAt
    ? new Date(cfg.editOtpVerifiedAt).getTime()
    : 0;
  const ttlMs = getWhatsappEditVerificationWindowMs();
  if (!verifiedAt || !Number.isFinite(verifiedAt)) return false;
  return Date.now() - verifiedAt < ttlMs;
};

const maskSecret = (value) => {
  const raw = String(value || "");
  if (!raw) return "";
  return raw.length <= 6 ? "****" : `****${raw.slice(-6)}`;
};

const getConfigSummary = (cfg) => {
  if (!cfg) return {};
  const provider = normalizeProvider(cfg.provider);
  const neoApiKey = cfg.neoApiKey || "";
  const neoBearerToken = cfg.neoBearerToken || "";
  const derivedNeoAuthMode = neoBearerToken
    ? "bearer"
    : neoApiKey
      ? /^Bearer\s+/i.test(String(neoApiKey))
        ? "bearer"
        : "apiKey"
      : "missing";
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
      (cfg.watiBaseUrl || cfg.apiUrl) && (cfg.watiApiToken || cfg.apiToken),
    ),
    hasMetaCredentials: Boolean(cfg.metaPhoneNumberId && cfg.metaWhatsappToken),
    hasNeoCredentials: Boolean(
      cfg.neoAccountName &&
      cfg.neoPhoneNumber &&
      (cfg.neoApiKey || cfg.neoBearerToken),
    ),
    neoAuthMode: provider === PROVIDERS.NEO ? derivedNeoAuthMode : null,
    neoAccountName: cfg.neoAccountName || "",
    neoPhoneNumberSuffix: cfg.neoPhoneNumber
      ? String(cfg.neoPhoneNumber).replace(/\D/g, "").slice(-4)
      : "",
    hasTwilioCredentials: Boolean(
      cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioWhatsappNumber,
    ),
    editOtpVerifiedAt: cfg.editOtpVerifiedAt || null,
    editVerificationActive: isWhatsappEditVerified(cfg),
    source: cfg.source || "db",
    isFallback: Boolean(cfg.isFallback),
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
    const hydrated = buildConfigView(cfg) || buildEnvFallbackConfig();
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
    payload.watiApiToken || payload.apiToken || payload.WATI_API_TOKEN || "",
  ).trim();
  const metaWhatsappToken = String(
    payload.metaWhatsappToken || payload.META_WHATSAPP_TOKEN || "",
  ).trim();
  const metaPhoneNumberId = String(
    payload.metaPhoneNumberId || payload.META_PHONE_NUMBER_ID || "",
  ).trim();
  const neoAccountName = String(
    payload.neoAccountName || payload.NEO_ACCOUNT_NAME || payload.name || "",
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
    neoApiKeyEncrypted: neoApiKey ? encrypt(neoApiKey) : "",
    neoPhoneNumber,
    neoBearerTokenEncrypted: neoBearerToken ? encrypt(neoBearerToken) : "",
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
    enableSignatureVerification: Boolean(payload.enableSignatureVerification),
    defaultCountry: String(
      payload.defaultCountry || payload.WHATSAPP_DEFAULT_COUNTRY || "91",
    ).trim(),
    editOtpVerifiedAt: payload.editOtpVerifiedAt || null,
    ownerUserId,
    ...(payload.companyId ? { companyId: payload.companyId } : {}),
  };
};

const saveWhatsappConfig = async ({ ownerUserId, payload = {} }) => {
  const matches = await WhatsAppConfig.find({
    $or: [
      ...(payload.companyId ? [{ companyId: payload.companyId }] : []),
      { ownerUserId },
    ],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const existing =
    matches.find((item) => String(item?.companyId || "") === String(payload.companyId || "")) ||
    matches.find((item) => String(item?.ownerUserId || "") === String(ownerUserId || "")) ||
    matches[0] ||
    null;

  const data = buildStoredConfig(
    {
      ...payload,
      editOtpVerifiedAt: payload.editOtpVerifiedAt ?? existing?.editOtpVerifiedAt ?? null,
    },
    ownerUserId,
  );

  let updated;
  if (existing?._id) {
    const duplicateIds = matches
      .map((item) => String(item?._id || ""))
      .filter((id) => id && id !== String(existing._id));
    if (duplicateIds.length) {
      await WhatsAppConfig.deleteMany({ _id: { $in: duplicateIds } });
    }

    updated = await WhatsAppConfig.findOneAndUpdate(
      { _id: existing._id },
      data,
      {
        returnDocument: "after",
      },
    ).lean();
  } else {
    updated = await WhatsAppConfig.create(data);
    updated = updated?.toObject ? updated.toObject() : updated;
  }

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
  const rawBearerToken = String(cfg.neoBearerToken || "").trim();
  const rawApiKey = String(cfg.neoApiKey || "").trim();
  const derivedBearerToken = /^Bearer\s+/i.test(rawApiKey) ? rawApiKey : "";
  const bearerToken = String(rawBearerToken || derivedBearerToken || "").trim();
  const apiKey = bearerToken
    ? ""
    : String(rawApiKey || "").replace(/^Bearer\s+/i, "").trim();
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

  const headers = {
    "Content-Type": "application/json",
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken.replace(/^Bearer\s+/i, "")}`;
  }
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    headers.apiKey = apiKey;
  }

  console.log("[WhatsApp][NEO] Sending message", {
    configSource: cfg?.source || "unknown",
    isFallback: Boolean(cfg?.isFallback),
    authMode: bearerToken ? "bearer" : apiKey ? "apiKey" : "missing",
    companyId: cfg?.companyId ? String(cfg.companyId) : null,
    ownerUserId: cfg?.ownerUserId ? String(cfg.ownerUserId) : null,
    accountName: cfg?.neoAccountName || "",
    fromPhoneSuffix: fromNumber ? String(fromNumber).slice(-4) : "",
    toPhoneSuffix: toNumber ? String(toNumber).slice(-4) : "",
  });

  return axios.post(NEO_MESSAGES_URL, payload, {
    headers,
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
      providerOk: Array.isArray(data?.messages) && data.messages.length > 0,
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
  console.log("[WhatsApp] Resolved provider config", {
    provider,
    configSource: cfg?.source || "unknown",
    isFallback: Boolean(cfg?.isFallback),
    companyId: cfg?.companyId ? String(cfg.companyId) : null,
    ownerUserId: cfg?.ownerUserId ? String(cfg.ownerUserId) : null,
  });
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
      throw new Error("Twilio media sending is not configured in this build");
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
  getWhatsappEditVerificationWindowMs,
  isWhatsappEditVerified,
  loadWhatsappConfig,
  normalizePhoneNumber,
  normalizeProvider,
  saveWhatsappConfig,
  sendWhatsAppMessage,
};
