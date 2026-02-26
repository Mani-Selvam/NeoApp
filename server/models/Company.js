const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Company", companySchema);
