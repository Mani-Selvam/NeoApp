const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    phoneNumber: { type: String, required: true },
    contactName: String,
    enquiryId: { type: mongoose.Schema.Types.ObjectId, ref: "Enquiry" },
    callType: {
        type: String,
        enum: ["Incoming", "Outgoing", "Missed", "Not Attended"],
        required: true
    },
    duration: { type: Number, default: 0 }, // in seconds
    callTime: { type: Date, default: Date.now },
    businessNumber: String, // The company number that received the call
    note: String,
    followUpCreated: { type: Boolean, default: false },
    isPendingCallback: { type: Boolean, default: false }, // For missed calls not returned
    lastContactedAt: Date,

    // Advanced Mobile Data
    id: String, // Device call log ID
    isVideoCall: { type: Boolean, default: false },
    simSlot: String,
    isRead: { type: Boolean, default: true },
    countryCode: String,
    isPersonal: { type: Boolean, default: false } // Flag to distinguish enquiry calls
}, { timestamps: true });

// Indexes for performance
callLogSchema.index({ userId: 1, callTime: -1 });
callLogSchema.index({ userId: 1, callType: 1 });
callLogSchema.index({ staffId: 1, callTime: -1 });
// Compound: list page (admin sees all staff, filtered by isPersonal)
callLogSchema.index({ userId: 1, staffId: 1, callTime: -1 });
callLogSchema.index({ userId: 1, isPersonal: 1, callTime: -1 });
callLogSchema.index({ phoneNumber: 1 });
callLogSchema.index({ contactName: "text", phoneNumber: "text" }); // For text search if needed later
callLogSchema.index({ enquiryId: 1 });
callLogSchema.index(
    { userId: 1, id: 1 },
    {
        unique: true,
        partialFilterExpression: { id: { $type: "string", $ne: "" } },
    },
);

module.exports = mongoose.model("CallLog", callLogSchema);
