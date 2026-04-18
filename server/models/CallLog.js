const mongoose = require("mongoose");

const CallLogSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        phoneNumber: {
            type: String,
            required: true,
            trim: true,
            // Normalize: store as-is, but caller will normalize for queries
        },
        callType: {
            type: String,
            enum: ["incoming", "outgoing", "missed", "rejected"],
            required: true,
            index: true,
        },
        callDuration: {
            type: Number, // seconds
            default: 0,
            required: true,
        },
        callTime: {
            type: Date,
            required: true,
            index: true,
        },
        contactName: {
            type: String,
            default: "",
            trim: true,
        },
        source: {
            type: String,
            enum: ["device"],
            default: "device",
        },
        // Unique key for duplicate prevention: phoneNumber_timestamp_duration
        uniqueKey: {
            type: String,
            required: true,
            unique: true, // Prevent duplicates globally
            sparse: true, // Allow null values for cleanup
        },
        syncedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    { timestamps: true },
);

// Compound index for phone + callTime + company (for quick filtering)
CallLogSchema.index({ companyId: 1, phoneNumber: 1, callTime: -1 });

// Compound index for syncing (company + syncedAt)
CallLogSchema.index({ companyId: 1, syncedAt: -1 });

// Text index for phone number search (optional, for future use)
CallLogSchema.index({ phoneNumber: "text", contactName: "text" });

module.exports = mongoose.model("CallLog", CallLogSchema);
