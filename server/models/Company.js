const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // human-readable ordered code like CRM-001, CRM-002
    code: { type: String, trim: true, uppercase: true },
    domain: { type: String, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["Active", "Suspended", "Cancelled"],
      default: "Active",
    },
    plan: {
      type: {
        type: String,
        enum: ["Starter", "Growth", "Business"],
        default: "Starter",
      },
      staffLimit: { type: Number, default: 5 },
      billingCustomerId: { type: String },
      nextBillingDate: { type: Date },
    },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

CompanySchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { name: { $exists: true } } },
);
CompanySchema.index({ code: 1 }, { unique: true, sparse: true });

// Auto-generate an ordered code like CRM-001 when creating a new company if not supplied.
CompanySchema.pre("validate", async function () {
  if (this.code) return;

  const Company = this.constructor;
  // Find last company with CRM-### pattern and increment the numeric part
  const last = await Company.find({ code: { $regex: "^CRM-\\d{3}$" } })
    .sort({ code: -1 })
    .limit(1)
    .lean();
  let nextNum = 1;
  if (last && last.length > 0 && last[0].code) {
    const m = last[0].code.match(/CRM-(\d{3})/);
    if (m && m[1]) {
      nextNum = parseInt(m[1], 10) + 1;
    }
  }
  const padded = String(nextNum).padStart(3, "0");
  this.code = `CRM-${padded}`;
});

module.exports = mongoose.model("Company", CompanySchema);
