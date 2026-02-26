const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const KEY = (process.env.WHATSAPP_STORE_ENCRYPTION_KEY || "")
    .padEnd(32, "0")
    .slice(0, 32);

function encrypt(text) {
    if (!text) return "";
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY), iv);
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");
    // store iv:encrypted
    return iv.toString("base64") + ":" + encrypted;
}

function decrypt(payload) {
    if (!payload) return "";
    try {
        const parts = payload.split(":");
        if (parts.length !== 2) return "";
        const iv = Buffer.from(parts[0], "base64");
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            Buffer.from(KEY),
            iv,
        );
        let dec = decipher.update(encrypted, "base64", "utf8");
        dec += decipher.final("utf8");
        return dec;
    } catch (e) {
        console.warn("Decrypt failed:", e.message);
        return "";
    }
}

module.exports = { encrypt, decrypt };
