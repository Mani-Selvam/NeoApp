const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");

// GET Follow-ups with Tabs & Pagination
router.get("/", verifyToken, async (req, res) => {
  const _start = Date.now();
  try {
    const { tab, page = 1, limit = 20 } = req.query;
    const cacheKey = cache.key("followups", {
      userId: req.userId,
      role: req.user.role,
      tab,
      page,
      limit,
    });

    const { data: response, source } = await cache.wrap(cacheKey, async () => {
      // Use ISO date string (YYYY-MM-DD) for consistent comparisons
      const today = new Date().toISOString().split("T")[0];
      let query = {};

      if (req.user.role === "Staff" && req.user.parentUserId) {
        query.userId = req.user.parentUserId;
        query.assignedTo = req.userId;
      } else {
        query.userId = req.userId;
      }

      const activeFilter = {
        status: { $nin: ["Completed", "Drop", "Dropped", "dropped", "drop"] },
        nextAction: { $nin: ["Drop", "Dropped", "dropped", "drop"] },
      };

      if (tab === "Today") {
        Object.assign(query, { date: today, ...activeFilter });
      } else if (tab === "Upcoming") {
        // Upcoming = dates strictly after today
        Object.assign(query, { date: { $gt: today }, ...activeFilter });
      } else if (tab === "Missed") {
        Object.assign(query, { date: { $lt: today }, ...activeFilter });
      } else if (tab === "Dropped") {
        // Match common casings of drop in either status or nextAction
        Object.assign(query, {
          $or: [
            { status: { $in: ["Drop", "Dropped", "dropped", "drop"] } },
            { nextAction: { $in: ["Drop", "Dropped", "dropped", "drop"] } },
          ],
        });
      } else if (tab === "All") {
        // No additional filters
      } else if (tab === "Completed") {
        Object.assign(query, { status: "Completed" });
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Smart sort: Upcoming = soonest first (asc), Missed = most recent first (desc), rest = newest first
      const sortOrder = tab === "Upcoming" ? 1 : -1;

      const followUps = await FollowUp.find(query)
        .select(
          "date status nextAction remarks enqId enqNo name mobile product image createdAt",
        )
        .sort({ date: sortOrder })
        .skip(skip)
        .limit(limitNum + 1)
        .lean();

      const hasMore = followUps.length > limitNum;
      if (hasMore) followUps.pop();

      return {
        data: followUps,
        pagination: {
          total: hasMore ? pageNum * limitNum + 1 : skip + followUps.length,
          page: pageNum,
          limit: limitNum,
          pages: hasMore ? pageNum + 1 : pageNum,
        },
      };
    });

    res.json(response);
    console.log(
      `⚡ GET /followups — ${Date.now() - _start}ms ${source} (${response.data?.length || 0} items, tab=${tab}, page ${page})`,
    );
  } catch (err) {
    console.error("Get follow-ups error:", err);
    res.status(500).json({ message: err.message });
  }
});

// CREATE Follow-up
router.post("/", verifyToken, async (req, res) => {
  try {
    const ownerId =
      req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

    const newFollowUp = new FollowUp({
      ...req.body,
      userId: ownerId,
      assignedTo: req.body.assignedTo || req.userId,
      status: "Scheduled",
    });

    const saved = await newFollowUp.save();
    cache.invalidate("followups");
    cache.invalidate("dashboard");
    res.status(201).json(saved);
  } catch (err) {
    console.error("=== CREATE ERROR ===");
    console.error("Full error:", err);
    console.error("Error message:", err.message);
    res.status(400).json({ message: err.message });
  }
});

// UPDATE Follow-up
router.put("/:id", verifyToken, async (req, res) => {
  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid follow-up ID format" });
    }

    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }
    const filter = {
      _id: req.params.id,
      userId: filterUserId,
      ...scopingFilter,
    };

    const updateData = { ...req.body };
    // PROTECT USERID
    delete updateData.userId;

    const followUp = await FollowUp.findOneAndUpdate(filter, updateData, {
      new: true,
      runValidators: true,
    });

    if (!followUp) {
      return res
        .status(404)
        .json({ message: "Follow-up not found or unauthorized" });
    }

    cache.invalidate("followups");
    cache.invalidate("dashboard");
    res.json(followUp);
  } catch (err) {
    console.error("Update error:", err);
    res.status(400).json({ message: err.message });
  }
});

// DELETE Follow-up
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid follow-up ID format" });
    }

    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }
    const filter = {
      _id: req.params.id,
      userId: filterUserId,
      ...scopingFilter,
    };
    const followUp = await FollowUp.findOneAndDelete(filter);

    if (!followUp) {
      return res
        .status(404)
        .json({ message: "Follow-up not found or unauthorized" });
    }

    cache.invalidate("followups");
    cache.invalidate("dashboard");
    res.json({ message: "Follow-up deleted", data: followUp });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: err.message });
  }
});

// GET Follow-up History (all records for an enquiry)
router.get("/history/:enqNoOrId", verifyToken, async (req, res) => {
  try {
    const { enqNoOrId } = req.params;

    let filterUserId = req.userId;
    let scopingFilter = {};
    if (req.user.role === "Staff" && req.user.parentUserId) {
      filterUserId = req.user.parentUserId;
      scopingFilter = { assignedTo: req.userId };
    }
    const filter = { userId: filterUserId, ...scopingFilter };

    // Try to find by enqNo first, then by ID
    let query = { enqNo: enqNoOrId, ...filter };

    // If it looks like a MongoDB ID, also search by that
    if (mongoose.Types.ObjectId.isValid(enqNoOrId)) {
      query = {
        $and: [{ $or: [{ enqNo: enqNoOrId }, { enqId: enqNoOrId }] }, filter],
      };
    }

    const history = await FollowUp.find(query).sort({ createdAt: -1 }).lean();

    // [REMOVED DEBUG LOG]
    res.json(history);
  } catch (err) {
    console.error("Get history error:", err);
    res.status(500).json({ message: err.message });
  }
});

// GET Autocall Follow-ups
router.get("/autocall", verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, filter } = req.query;
    let query = {};

    if (req.user.role === "Staff" && req.user.parentUserId) {
      query.userId = req.user.parentUserId;
      query.assignedTo = req.userId;
    } else {
      query.userId = req.userId;
    }

    const today = new Date().toISOString().split("T")[0];

    if (filter === "Missed") {
      query.date = { $lt: today };
      query.status = { $ne: "Completed" };
    } else if (filter === "Upcoming") {
      // Upcoming should be strictly after today to avoid duplicating Today's items
      query.date = { $gt: today };
      query.status = { $ne: "Completed" };
    }

    if (startDate || endDate) {
      query.date = query.date || {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const list = await FollowUp.find(query).sort({ date: 1 }).lean();
    res.json({ data: list });
  } catch (err) {
    console.error("Autocall fetch error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
