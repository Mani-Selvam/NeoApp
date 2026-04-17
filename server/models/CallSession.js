const mongoose = require("mongoose");

const callSessionEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const callSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    enquiryId: { type: mongoose.Schema.Types.ObjectId, ref: "Enquiry", default: null },
    phoneNumber: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true, default: "" },
    businessNumber: { type: String, trim: true, default: "" },
    direction: {
      type: String,
      enum: ["Incoming", "Outgoing"],
      default: "Outgoing",
    },
    status: {
      type: String,
      enum: ["dialing", "active", "held", "ended", "dismissed", "failed"],
      default: "dialing",
    },
    controls: {
      muted: { type: Boolean, default: false },
      speaker: { type: Boolean, default: false },
      onHold: { type: Boolean, default: false },
      keypadVisible: { type: Boolean, default: false },
      keypadDigits: { type: String, default: "" },
      lastDtmf: { type: String, default: "" },
      nativeSupported: { type: Boolean, default: false },
      nativeApplied: { type: Boolean, default: false },
    },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 },
    endReason: { type: String, trim: true, default: "" },
    lastEventAt: { type: Date, default: Date.now },
    events: { type: [callSessionEventSchema], default: [] },
  },
  { timestamps: true },
);

callSessionSchema.index({ userId: 1, startedAt: -1 });
callSessionSchema.index({ staffId: 1, startedAt: -1 });
callSessionSchema.index({ phoneNumber: 1, startedAt: -1 });
callSessionSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model("CallSession", callSessionSchema);
