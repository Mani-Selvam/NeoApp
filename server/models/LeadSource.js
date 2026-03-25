const mongoose = require("mongoose");

const leadSourceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

leadSourceSchema.index({ createdBy: 1 });
leadSourceSchema.index(
    { createdBy: 1, name: 1 },
    {
        unique: true,
        partialFilterExpression: {
            createdBy: { $exists: true },
            name: { $exists: true },
        },
    },
);

const LeadSource =
    mongoose.models.LeadSource || mongoose.model("LeadSource", leadSourceSchema);

const ensureScopedLeadSourceIndexes = async () => {
    try {
        if (mongoose.connection.readyState !== 1) return;
        const indexes = await LeadSource.collection.indexes();
        if (indexes.some((idx) => idx.name === "name_1")) {
            await LeadSource.collection.dropIndex("name_1").catch(() => { });
        }
        await LeadSource.syncIndexes().catch(() => { });
    } catch (_error) {
        // ignore startup index migration issues
    }
};

if (mongoose.connection.readyState === 1) {
    ensureScopedLeadSourceIndexes();
} else {
    mongoose.connection.once("connected", ensureScopedLeadSourceIndexes);
}

module.exports = LeadSource;
