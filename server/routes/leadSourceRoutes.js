const express = require("express");
const router = express.Router();
const LeadSource = require("../models/LeadSource");
const { verifyToken } = require("../middleware/auth");

const DEFAULT_LEAD_SOURCE_NAMES = ["Direct", "Walkin", "Website"];

const getLeadSourceOwnerId = (req) =>
    req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

const ensureDefaultLeadSources = async (ownerId) => {
    if (!ownerId) return;
    const existing = await LeadSource.find({ createdBy: ownerId })
        .select("name")
        .lean();
    const existingNames = new Set(
        (existing || []).map((item) => String(item?.name || "").trim().toLowerCase()),
    );
    const missing = DEFAULT_LEAD_SOURCE_NAMES.filter(
        (name) => !existingNames.has(name.toLowerCase()),
    ).map((name) => ({
        name,
        createdBy: ownerId,
    }));

    if (!missing.length) return;
    await LeadSource.insertMany(missing, { ordered: false }).catch(() => { });
};

// GET ALL LEAD SOURCES
router.get("/", verifyToken, async (req, res) => {
    try {
        const filterUserId = getLeadSourceOwnerId(req);
        await ensureDefaultLeadSources(filterUserId);

        const leadSources = await LeadSource.find({ createdBy: filterUserId }).lean();
        res.status(200).json(leadSources);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET SINGLE LEAD SOURCE
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const filterUserId = getLeadSourceOwnerId(req);

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
        const { name } = req.body;

        // Validate input
        if (!name?.trim()) {
            return res.status(400).json({
                error: "Lead source name is required",
            });
        }

        // Determine Owner ID (Main User)
        // If Staff creates it, assign ownership to Main User (parentUserId)
        const ownerId = getLeadSourceOwnerId(req);

        await ensureDefaultLeadSources(ownerId);

        const newLeadSource = new LeadSource({
            name: name.trim(),
            createdBy: ownerId,
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
        const { name } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ error: "Lead source name is required" });
        }

        const filterUserId = getLeadSourceOwnerId(req);

        const leadSource = await LeadSource.findOneAndUpdate(
            { _id: req.params.id, createdBy: filterUserId },
            {
                $set: {
                    name: name.trim(),
                    updatedAt: new Date(),
                },
                $unset: {
                    sources: 1,
                    enquiryFields: 1,
                },
            },
            { returnDocument: "after", runValidators: true },
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
        const filterUserId = getLeadSourceOwnerId(req);

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
