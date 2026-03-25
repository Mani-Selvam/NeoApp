const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  items: [
    {
      name: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

productSchema.index({ createdBy: 1 });
productSchema.index(
  { createdBy: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      createdBy: { $exists: true },
      name: { $exists: true },
    },
  },
);

const Product =
  mongoose.models.Product || mongoose.model("Product", productSchema);

const ensureScopedProductIndexes = async () => {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const indexes = await Product.collection.indexes();
    if (indexes.some((idx) => idx.name === "name_1")) {
      await Product.collection.dropIndex("name_1").catch(() => {});
    }
    await Product.syncIndexes().catch(() => {});
  } catch (_error) {
    // ignore startup index migration issues
  }
};

if (mongoose.connection.readyState === 1) {
  ensureScopedProductIndexes();
} else {
  mongoose.connection.once("connected", ensureScopedProductIndexes);
}

module.exports = Product;
