const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
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

module.exports = mongoose.model("Product", productSchema);
