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
  dueAt: { type: Date }, // Computed from nextFollowUpDate + time (for real-time missed logic)
  activityTime: { type: Date, default: Date.now },
  staffName: { type: String },
    nextAction: {
        type: String,
        enum: ["Followup", "Sales", "Drop"],
        required: true,
    },
    status: { type: String, default: "Scheduled" }, // Scheduled, Missed, Completed
    // Only one follow-up per enquiry should be considered "current"/priority at a time.
    // When a new follow-up is created for the same enquiry, older ones are marked isCurrent=false
    // so they don't keep showing in Today/Missed/Dashboard lists.
    isCurrent: { type: Boolean, default: true },
    supersededAt: { type: Date },
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
followUpSchema.index({ userId: 1, enqNo: 1, isCurrent: 1, date: -1 });

followUpSchema.pre("validate", function syncLegacyFields() {
  if (!this.activityType) this.activityType = this.type || "WhatsApp";
  if (!this.type) this.type = this.activityType || "WhatsApp";
  if (!this.note && this.remarks) this.note = this.remarks;
  if (!this.remarks && this.note) this.remarks = this.note;
  if (!this.followUpDate && this.date) this.followUpDate = this.date;
  if (!this.nextFollowUpDate && this.date) this.nextFollowUpDate = this.date;
  if (!this.activityTime) this.activityTime = new Date();
  if (this.isCurrent === undefined) this.isCurrent = true;

  const dateStr = this.nextFollowUpDate || this.followUpDate || this.date;
  const timeStr = this.time;
  const parseDueAt = (iso, time) => {
    if (!iso || typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    if (!time || typeof time !== "string") return null;
    const t = time.trim();
    const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?(?:\s*([AaPp][Mm]))?$/);
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2] ?? "0");
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null;
    const mer = String(m[3] || "").toUpperCase();
    if (mer) {
      if (hh < 1 || hh > 12) return null;
      if (mer === "AM") {
        if (hh === 12) hh = 0;
      } else if (mer === "PM") {
        if (hh !== 12) hh += 12;
      }
    }
    hh = Math.min(23, Math.max(0, hh));
    const [yy, mo, dd] = iso.split("-").map((n) => Number(n));
    const dt = new Date(yy, (mo || 1) - 1, dd || 1, hh, mm, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };

  const dueAt = parseDueAt(dateStr, timeStr);
  if (dueAt) this.dueAt = dueAt;
});

module.exports = mongoose.model("FollowUp", followUpSchema);
