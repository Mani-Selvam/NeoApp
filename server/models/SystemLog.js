const mongoose = require("mongoose");

const systemLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true },
    ip: { type: String, default: "unknown" },
    category: {
      type: String,
      enum: ["auth", "admin_action", "api", "error", "billing"],
      default: "api",
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

systemLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SystemLog", systemLogSchema);
