const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { verifyToken } = require("../middleware/auth");

// GET ALL PRODUCTS
router.get("/", verifyToken, async (req, res) => {
  try {
    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }

    const products = await Product.find({ createdBy: filterUserId }).lean();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET SINGLE PRODUCT
router.get("/:id", verifyToken, async (req, res) => {
  try {
    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }

    const product = await Product.findOne({
      _id: req.params.id,
      createdBy: filterUserId,
    }).lean();
    if (!product) {
      return res
        .status(404)
        .json({ error: "Product not found or unauthorized" });
    }
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE PRODUCT
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, items } = req.body;

    if (!name || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Product name and at least one item are required",
      });
    }

    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

    const trimmedName = String(name || "").trim();
    const existingProduct = await Product.findOne({
      createdBy: ownerId,
      name: trimmedName,
    }).lean();

    if (existingProduct) {
      return res.status(409).json({
        error: "This product name already exists",
      });
    }

    const newProduct = new Product({
      name: trimmedName,
      items,
      createdBy: ownerId,
    });

    const saved = await newProduct.save();
    res.status(201).json(saved);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        error: "This product name already exists",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// UPDATE PRODUCT
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { name, items } = req.body;

    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, createdBy: filterUserId },
      {
        $set: { name, items, updatedAt: new Date() },
      },
      { returnDocument: "after", runValidators: true },
    );

    if (!product) {
      return res
        .status(404)
        .json({ error: "Product not found or unauthorized" });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE PRODUCT
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    let filterUserId = req.userId;
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
    }

    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      createdBy: filterUserId,
    });

    if (!product) {
      return res
        .status(404)
        .json({ error: "Product not found or unauthorized" });
    }

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
