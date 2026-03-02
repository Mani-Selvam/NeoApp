const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  mobile: { type: String },
  logo: { type: String }, // User profile picture or company logo
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active",
  },
  role: {
    type: String,
    enum: ["Admin", "Staff"],
    default: "Staff",
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true,
  },
  // parentUserId removed: use company_id and role to model hierarchy
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.index({ role: 1 });

// Ensure email uniqueness within a company (multi-tenant)
userSchema.index(
  { company_id: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } },
);
// Frequent tenant lookup
userSchema.index({ company_id: 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.model("User", userSchema);
