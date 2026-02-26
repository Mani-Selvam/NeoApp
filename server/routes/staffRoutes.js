const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Middleware to check if user is admin
const { verifyToken } = require("../middleware/auth");

// Middleware to check if user is admin (now redundant due to route-level checks and verifyToken)
const isAdmin = async (req, res, next) => {
    try {
        // This would be implemented with JWT verification in production
        // For now, we'll skip auth check for development
        next();
    } catch (error) {
        res.status(401).json({ error: "Unauthorized" });
    }
};

// GET ALL STAFF (Scoped to current Admin)
router.get("/", verifyToken, async (req, res) => {
    try {
        // Only return staff created by this user (Admin)
        const staff = await User.find({ role: "Staff", parentUserId: req.userId })
            .select("-password")
            .lean();
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET STAFF BY COMPANY
router.get("/company/:companyId", async (req, res) => {
    try {
        const staff = await User.find({
            role: "Staff",
            company_id: req.params.companyId,
        }).select("-password").lean();
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET SINGLE STAFF
router.get("/:id", async (req, res) => {
    try {
        const staff = await User.findById(req.params.id).select("-password").lean();
        if (!staff) {
            return res.status(404).json({ error: "Staff not found" });
        }
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE STAFF (Linked to Creator/Admin)
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, email, mobile, password, status, company_id } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res
                .status(400)
                .json({ error: "Name, email, and password are required" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already exists" });
        }

        // Create new staff user
        const newStaff = new User({
            name,
            email,
            mobile,
            password,
            status: status || "Active",
            status: status || "Active",
            role: "Staff",
            parentUserId: req.userId,
            company_id: company_id || req.user.company_id, // Inherit company if applicable
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
});

// UPDATE STAFF (Scoped check recommended)
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { name, mobile, status, company_id, password } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (mobile) updateData.mobile = mobile;
        if (status) updateData.status = status;
        if (company_id) updateData.company_id = company_id;

        // If password provided, hash it before updating (findByIdAndUpdate bypasses pre 'save')
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const staff = await User.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true,
        }).select("-password");

        if (!staff) {
            return res.status(404).json({ error: "Staff not found" });
        }

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

        if (!staff) {
            return res.status(404).json({ error: "Staff not found" });
        }

        res.status(200).json({
            message: `Staff status updated to ${status}`,
            staff,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE STAFF
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const staff = await User.findByIdAndDelete(req.params.id);

        if (!staff) {
            return res.status(404).json({ error: "Staff not found" });
        }

        res.status(200).json({ message: "Staff deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
