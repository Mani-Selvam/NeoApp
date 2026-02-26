const mongoose = require("mongoose");

const leadSourceSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    sources: [
        {
            name: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
        },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

leadSourceSchema.index({ createdBy: 1 });

module.exports = mongoose.model("LeadSource", leadSourceSchema);
