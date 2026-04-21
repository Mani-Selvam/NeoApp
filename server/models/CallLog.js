/**
 * CallLog.js — Mongoose model
 * Stores synced device call logs per company/user.
 * uniqueKey prevents duplicate inserts during repeated syncs.
 */
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
        /**
         * Store phone as-is from device (may include country code / spaces).
         * Queries normalize to last-10 digits via regex.
         */
        phoneNumber: {
            type: String,
            required: true,
            trim: true,
        },
        callType: {
            type: String,
            enum: ["incoming", "outgoing", "missed", "rejected"],
            required: true,
            index: true,
        },
        /**
         * Duration in seconds. 0 for missed / rejected calls.
         */
        callDuration: {
            type: Number,
            default: 0,
            min: 0,
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
            enum: ["device", "manual"],
            default: "device",
        },
        /**
         * Unique key format: <10-digit-phone>_<callTime-ms>_<durationSec>
         * Prevents duplicate sync inserts globally.
         */
        uniqueKey: {
            type: String,
            required: true,
            unique: true,
        },
        syncedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true, // adds createdAt, updatedAt
    },
);

// ── Compound indexes ──────────────────────────────────────────────────────────

// Primary query pattern: by company + phone + time (desc)
CallLogSchema.index({ companyId: 1, phoneNumber: 1, callTime: -1 });

// Sync query: newest synced per company
CallLogSchema.index({ companyId: 1, syncedAt: -1 });

// Filter by type within a company
CallLogSchema.index({ companyId: 1, callType: 1, callTime: -1 });

// User-specific queries
CallLogSchema.index({ companyId: 1, userId: 1, callTime: -1 });

module.exports = mongoose.model("CallLog", CallLogSchema);
