const express = require("express");
const router = express.Router();
const LeadSource = require("../models/LeadSource");
const { verifyToken } = require("../middleware/auth");

// GET ALL LEAD SOURCES
router.get("/", verifyToken, async (req, res) => {
    try {
        let filterUserId = req.userId;
        if (req.user.role === "Staff" && req.user.parentUserId) {
            filterUserId = req.user.parentUserId;
        }

        const leadSources = await LeadSource.find({ createdBy: filterUserId }).lean();
        res.status(200).json(leadSources);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET SINGLE LEAD SOURCE
router.get("/:id", verifyToken, async (req, res) => {
    try {
        let filterUserId = req.userId;
        if (req.user.role === "Staff" && req.user.parentUserId) {
            filterUserId = req.user.parentUserId;
        }

        const leadSource = await LeadSource.findOne({ _id: req.params.id, createdBy: filterUserId }).lean();
        if (!leadSource) {
            return res.status(404).json({ error: "Lead source not found or unauthorized" });
        }
        res.status(200).json(leadSource);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// CREATE LEAD SOURCE
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, sources } = req.body;

        // Validate input
        if (!name || !Array.isArray(sources) || sources.length === 0) {
            return res.status(400).json({
                error: "Lead source name and at least one source are required",
            });
        }

        // Determine Owner ID (Main User)
        // If Staff creates it, assign ownership to Main User (parentUserId)
        const ownerId = (req.user.role === "Staff" && req.user.parentUserId)
            ? req.user.parentUserId
            : req.userId;

        const newLeadSource = new LeadSource({
            name,
            sources,
            createdBy: ownerId
        });

        const savedLeadSource = await newLeadSource.save();
        res.status(201).json(savedLeadSource);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// UPDATE LEAD SOURCE
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const { name, sources } = req.body;

        let filterUserId = req.userId;
        if (req.user.role === "Staff" && req.user.parentUserId) {
            filterUserId = req.user.parentUserId;
        }

        const leadSource = await LeadSource.findOneAndUpdate(
            { _id: req.params.id, createdBy: filterUserId },
            {
                $set: {
                    name,
                    sources,
                    updatedAt: new Date(),
                },
            },
            { new: true, runValidators: true },
        );

        if (!leadSource) {
            return res.status(404).json({ error: "Lead source not found or unauthorized" });
        }

        res.status(200).json(leadSource);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE LEAD SOURCE
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        let filterUserId = req.userId;
        if (req.user.role === "Staff" && req.user.parentUserId) {
            filterUserId = req.user.parentUserId;
        }

        const leadSource = await LeadSource.findOneAndDelete({ _id: req.params.id, createdBy: filterUserId });

        if (!leadSource) {
            return res.status(404).json({ error: "Lead source not found or unauthorized" });
        }

        res.status(200).json({ message: "Lead source deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
