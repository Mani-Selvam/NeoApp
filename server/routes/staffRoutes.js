const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Company = require("../models/Company");
const bcrypt = require("bcryptjs");

// Auth + tenant middlewares
const { verifyToken } = require("../middleware/auth");
const { requireCompany, requireRole } = require("../middleware/tenant");

// GET ALL STAFF (Scoped to current Admin)
// List staff for the authenticated user's company (Admin-only)
router.get(
  "/",
  verifyToken,
  requireCompany,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const staff = await User.find({
        company_id: req.companyId,
        role: "Staff",
      })
        .select("-password")
        .lean();
      res.status(200).json(staff);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// GET STAFF BY COMPANY
// Get staff by company (only allowed for admins of that company)
router.get("/company/:companyId", verifyToken, async (req, res) => {
  try {
    // Only allow if requesting own company
    if (
      !req.user ||
      !req.user.company_id ||
      req.user.company_id.toString() !== req.params.companyId
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const staff = await User.find({
      role: "Staff",
      company_id: req.params.companyId,
    })
      .select("-password")
      .lean();
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET SINGLE STAFF
// Get single staff (must belong to requester's company)
router.get("/:id", verifyToken, requireCompany, async (req, res) => {
  try {
    const staff = await User.findById(req.params.id).select("-password").lean();
    if (!staff) return res.status(404).json({ error: "Staff not found" });
    if (staff.company_id && staff.company_id.toString() !== req.companyId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE STAFF (Admin-only, enforces company plan staffLimit)
router.post(
  "/",
  verifyToken,
  requireCompany,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const { name, email, mobile, password, status } = req.body;

      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ error: "Name, email, and password are required" });
      }

      const companyId = req.companyId;

      // Load company to check plan/staffLimit
      const company = await Company.findById(companyId).lean();
      if (!company) return res.status(400).json({ error: "Company not found" });

      const staffCount = await User.countDocuments({
        company_id: companyId,
        role: "Staff",
      });
      const staffLimit = (company.plan && company.plan.staffLimit) || 0;
      if (staffLimit > 0 && staffCount >= staffLimit) {
        return res
          .status(400)
          .json({ error: "Staff limit reached for your plan" });
      }

      // Check email uniqueness within company
      const existingUser = await User.findOne({ company_id: companyId, email });
      if (existingUser)
        return res.status(400).json({ error: "Email already exists" });

      const newStaff = new User({
        name,
        email,
        mobile,
        password,
        status: status || "Active",
        role: "Staff",
        company_id: companyId,
      });

      const savedStaff = await newStaff.save();

      res.status(201).json({
        id: savedStaff._id,
        name: savedStaff.name,
        email: savedStaff.email,
        mobile: savedStaff.mobile,
        status: savedStaff.status,
        company_id: savedStaff.company_id,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// UPDATE STAFF (Scoped check recommended)
router.put("/:id", verifyToken, requireCompany, async (req, res) => {
  try {
    const { name, mobile, status, company_id, password } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (mobile) updateData.mobile = mobile;
    if (status) updateData.status = status;
    if (company_id) updateData.company_id = company_id;

    // If password provided, hash it before updating
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const staff = await User.findById(req.params.id);
    if (!staff) return res.status(404).json({ error: "Staff not found" });
    if (staff.company_id && staff.company_id.toString() !== req.companyId)
      return res.status(403).json({ error: "Forbidden" });

    Object.assign(staff, updateData);
    await staff.save();

    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE STAFF STATUS (Toggle Active/Inactive)
router.patch("/:id/status", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        error: "Status must be 'Active' or 'Inactive'",
      });
    }

    const staff = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true },
    ).select("-password");

    if (!staff) return res.status(404).json({ error: "Staff not found" });
    if (staff.company_id && staff.company_id.toString() !== req.companyId)
      return res.status(403).json({ error: "Forbidden" });
    staff.status = status;
    await staff.save();
    res
      .status(200)
      .json({ message: `Staff status updated to ${status}`, staff });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE STAFF
router.delete(
  "/:id",
  verifyToken,
  requireCompany,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const staff = await User.findById(req.params.id);
      if (!staff) return res.status(404).json({ error: "Staff not found" });
      if (staff.company_id && staff.company_id.toString() !== req.companyId)
        return res.status(403).json({ error: "Forbidden" });
      await staff.remove();
      res.status(200).json({ message: "Staff deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

module.exports = router;
