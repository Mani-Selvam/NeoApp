const mongoose = require("mongoose");

const WhatsAppConfigSchema = new mongoose.Schema(
    {
        provider: { type: String, default: "WATI" },
        apiUrl: { type: String, default: "" },
        // Token should be stored encrypted; use `apiTokenEncrypted` for storage.
        apiTokenEncrypted: { type: String, default: "" },
        // `apiToken` may be populated in-memory (decrypted) but is not persisted.
        apiToken: { type: String, select: false },
        verifyToken: { type: String, default: "" },
        appSecret: { type: String, default: "" },
        signatureHeader: { type: String, default: "X-Hub-Signature-256" },
        enableSignatureVerification: { type: Boolean, default: false },
        defaultCountry: { type: String, default: "91" },
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true },
);

module.exports = mongoose.model("WhatsAppConfig", WhatsAppConfigSchema);
