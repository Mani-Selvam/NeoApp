const mongoose = require("mongoose");

const FOLLOWUP_ACTIVITIES = [
    "Phone Call",
    "Email",
    "WhatsApp",
    "Meeting",
    // Backward compatibility
    "Visit",
    "System",
];

const followUpSchema = new mongoose.Schema({
    enqId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Enquiry",
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Assigned staff member
    enqNo: { type: String, required: true },
    name: { type: String, required: true }, // Cached for easy display
    mobile: { type: String }, // Cached for easy display
    image: { type: String }, // Cached for easy display
    product: { type: String }, // Cached for easy display
    date: { type: String, required: true },
    time: String,
    type: {
        type: String,
        enum: FOLLOWUP_ACTIVITIES,
        default: "WhatsApp",
    },
    activityType: {
        type: String,
        enum: FOLLOWUP_ACTIVITIES,
    },
    note: { type: String },
    remarks: { type: String, required: true },
    enquiryStatus: { type: String },
    followUpDate: { type: String }, // YYYY-MM-DD
    nextFollowUpDate: { type: String }, // YYYY-MM-DD
    activityTime: { type: Date, default: Date.now },
    staffName: { type: String },
    nextAction: {
        type: String,
        enum: ["Followup", "Sales", "Drop"],
        required: true,
    },
    status: { type: String, default: "Scheduled" }, // Scheduled, Missed, Completed
    amount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

// Indexes for performance
followUpSchema.index({ userId: 1, date: -1, status: 1 });
followUpSchema.index({ createdBy: 1, date: -1, status: 1 });
followUpSchema.index({ assignedTo: 1, date: -1, status: 1 });
followUpSchema.index({ userId: 1, nextAction: 1 });
followUpSchema.index({ enqId: 1 });
followUpSchema.index({ enqNo: 1 });
followUpSchema.index({ userId: 1, nextFollowUpDate: 1, status: 1 });
followUpSchema.index({ assignedTo: 1, nextFollowUpDate: 1, status: 1 });

followUpSchema.pre("validate", function syncLegacyFields() {
    if (!this.activityType) this.activityType = this.type || "WhatsApp";
    if (!this.type) this.type = this.activityType || "WhatsApp";
    if (!this.note && this.remarks) this.note = this.remarks;
    if (!this.remarks && this.note) this.remarks = this.note;
    if (!this.followUpDate && this.date) this.followUpDate = this.date;
    if (!this.nextFollowUpDate && this.date) this.nextFollowUpDate = this.date;
    if (!this.activityTime) this.activityTime = new Date();
});

module.exports = mongoose.model("FollowUp", followUpSchema);
