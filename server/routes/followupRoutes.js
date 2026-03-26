const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const Enquiry = require("../models/Enquiry");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");

const toLocalIsoDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseTimeToMinutes = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridian = String(match[3] || "").toUpperCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) {
    return null;
  }

  if (meridian) {
    if (hours < 1 || hours > 12) return null;
    if (meridian === "AM") {
      if (hours === 12) hours = 0;
    } else if (meridian === "PM") {
      if (hours !== 12) hours += 12;
    }
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const isMissedForReference = (item, referenceDate) => {
  const itemDate = String(item?.date || item?.nextFollowUpDate || item?.followUpDate || "").trim();
  if (!itemDate) return false;
  if (itemDate < referenceDate) return true;
  if (itemDate > referenceDate) return false;

  const todayIso = toLocalIsoDate(new Date());
  if (referenceDate !== todayIso) return false;

  const dueMinutes = parseTimeToMinutes(item?.time);
  if (dueMinutes == null) return false;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return dueMinutes < nowMinutes;
};

const getFollowUpAccessScope = async (req) => {
  const normalizedRole = String(req.user?.role || "").trim().toLowerCase();

  if (normalizedRole === "staff" && req.user?.parentUserId) {
    return {
      ownerUserIds: [req.user.parentUserId],
      scopingFilter: { assignedTo: req.userId },
    };
  }

  const companyId = req.user?.company_id;
  if (companyId) {
    const companyUsers = await User.find({ company_id: companyId })
      .select("_id")
      .lean();

    const ownerUserIds = companyUsers
      .map((item) => item?._id)
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

    if (ownerUserIds.length > 0) {
      return {
        ownerUserIds,
        scopingFilter: {},
      };
    }
  }

  return {
    ownerUserIds: [req.userId],
    scopingFilter: {},
  };
};

const buildFollowUpScopedFilter = (scope) => {
  const ownerUserIds = Array.isArray(scope?.ownerUserIds)
    ? scope.ownerUserIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
    : [];

  const userId =
    ownerUserIds.length <= 1 ? ownerUserIds[0] || null : { $in: ownerUserIds };

  return {
    userId,
    ...(scope?.scopingFilter || {}),
  };
};

const SALES_REGEX = /^(sales|converted)$/i;
const DROP_REGEX = /^(drop|dropped|closed|not interested)$/i;
const COMPLETED_REGEX = /^completed$/i;

const emitFollowUpChanged = async (req, payload = {}) => {
  try {
    const io = req.app?.get("io");
    if (!io) return;

    const companyId = req.user?.company_id || null;
    if (companyId) {
      const companyUsers = await User.find({ company_id: companyId })
        .select("_id")
        .lean();

      companyUsers.forEach((member) => {
        const userId = String(member?._id || "");
        if (!userId) return;
        io.to(`user:${userId}`).emit("FOLLOWUP_CHANGED", {
          ...payload,
          companyId: String(companyId),
        });
      });
      return;
    }

    const fallbackUserId = String(req.userId || "");
    if (fallbackUserId) {
      io.to(`user:${fallbackUserId}`).emit("FOLLOWUP_CHANGED", payload);
    }
  } catch (_socketError) {
    // ignore real-time fanout issues
  }
};

// GET Follow-ups with Tabs & Pagination
router.get("/", verifyToken, async (req, res) => {
  const _start = Date.now();
  try {
    const {
      tab,
      status,
      assignedTo,
      activityType,
      date,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = req.query;
    const cacheKey = cache.key("followups", {
      userId: req.userId,
      role: req.user.role,
      tab,
      status,
      assignedTo,
      activityType,
      date,
      dateFrom,
      dateTo,
      page,
      limit,
    });

    const { data: response, source } = await cache.wrap(cacheKey, async () => {
      // Use the selected date as the reference day when provided.
      const referenceDate = date || toLocalIsoDate(new Date());
      const scope = await getFollowUpAccessScope(req);
      let query = buildFollowUpScopedFilter(scope);

      if (assignedTo && assignedTo !== "all" && req.user.role !== "Staff") {
        query.assignedTo = assignedTo;
      }

      if (activityType && activityType !== "all") {
        query.$or = [{ activityType }, { type: activityType }];
      }

      if (status && status !== "all") {
        query.status = status;
      }

      if (date) {
        query.date = date;
      } else if (dateFrom || dateTo) {
        query.date = query.date || {};
        if (dateFrom) query.date.$gte = dateFrom;
        if (dateTo) query.date.$lte = dateTo;
      }

      const activeFilter = {
        activityType: { $ne: "System" },
        type: { $ne: "System" },
      };

      if (tab === "Today") {
        Object.assign(query, { date: referenceDate, ...activeFilter });
        query.$and = [
          ...(Array.isArray(query.$and) ? query.$and : []),
          {
            $nor: [
              { status: SALES_REGEX },
              { enquiryStatus: SALES_REGEX },
              { nextAction: SALES_REGEX },
              { status: DROP_REGEX },
              { enquiryStatus: DROP_REGEX },
              { nextAction: DROP_REGEX },
              { status: COMPLETED_REGEX },
            ],
          },
        ];
      } else if (tab === "Upcoming") {
        // Upcoming = dates strictly after the selected/reference date
        Object.assign(query, { date: { $gt: referenceDate }, ...activeFilter });
      } else if (tab === "Missed") {
        Object.assign(query, { date: { $lte: referenceDate }, ...activeFilter });
        query.$and = [
          ...(Array.isArray(query.$and) ? query.$and : []),
          {
            $nor: [
              { status: SALES_REGEX },
              { enquiryStatus: SALES_REGEX },
              { nextAction: SALES_REGEX },
              { status: DROP_REGEX },
              { enquiryStatus: DROP_REGEX },
              { nextAction: DROP_REGEX },
              { status: COMPLETED_REGEX },
            ],
          },
        ];
      } else if (tab === "Sales") {
        Object.assign(query, {
          ...(date ? { date: referenceDate } : {}),
          $or: [
            { status: SALES_REGEX },
            { enquiryStatus: SALES_REGEX },
            { nextAction: SALES_REGEX },
          ],
        });
      } else if (tab === "Dropped") {
        // Match common casings of drop in either status or nextAction
        Object.assign(query, {
          $or: [
            { status: DROP_REGEX },
            { enquiryStatus: DROP_REGEX },
            { nextAction: DROP_REGEX },
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

      // Smart sort: Upcoming = soonest date first; otherwise latest date first.
      // Always break ties by latest activity to surface the newest status.
      const sortOrder = tab === "Upcoming" ? 1 : -1;

      const followUps = await FollowUp.find(query)
        .select(
          "date time followUpDate nextFollowUpDate status enquiryStatus nextAction note remarks activityType type staffName activityTime enqId enqNo name mobile product image assignedTo createdAt",
        )
        .populate("assignedTo", "name")
        .sort({ date: sortOrder, activityTime: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum + 1)
        .lean();

      // Hide orphan follow-ups whose enquiry was deleted.
      const enqIds = [
        ...new Set(
          followUps
            .map((item) => item.enqId)
            .filter((id) => mongoose.Types.ObjectId.isValid(String(id))),
        ),
      ];
      const enqNos = [
        ...new Set(
          followUps
            .map((item) => String(item.enqNo || "").trim())
            .filter(Boolean),
        ),
      ];
      if (enqIds.length > 0 || enqNos.length > 0) {
        const existing = await Enquiry.find({
          $or: [
            ...(enqIds.length > 0 ? [{ _id: { $in: enqIds } }] : []),
            ...(enqNos.length > 0 ? [{ enqNo: { $in: enqNos } }] : []),
          ],
        })
          .select("_id enqNo status")
          .lean();
        const existingSet = new Set(existing.map((e) => String(e._id)));
        const statusByEnquiryId = new Map(
          existing.map((e) => [String(e._id), e?.status || "New"]),
        );
        const statusByEnquiryNo = new Map(
          existing
            .filter((e) => e?.enqNo)
            .map((e) => [String(e.enqNo).trim(), e?.status || "New"]),
        );

        for (let i = followUps.length - 1; i >= 0; i -= 1) {
          const enqId = followUps[i].enqId;
          const enqNo = String(followUps[i].enqNo || "").trim();
          if (enqId && !existingSet.has(String(enqId))) {
            followUps.splice(i, 1);
            continue;
          }

          if (enqId && statusByEnquiryId.has(String(enqId))) {
            followUps[i].enquiryStatus = statusByEnquiryId.get(String(enqId));
            continue;
          }
          if (enqNo && statusByEnquiryNo.has(enqNo)) {
            // Backward compatibility for old follow-ups without enqId.
            followUps[i].enquiryStatus = statusByEnquiryNo.get(enqNo);
          }
        }
      }

      if (tab === "Missed") {
        for (let i = followUps.length - 1; i >= 0; i -= 1) {
          if (!isMissedForReference(followUps[i], referenceDate)) {
            followUps.splice(i, 1);
          }
        }
      }

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
    const today = toLocalIsoDate(new Date());
    const toObjectId = (value) => {
      if (!value) return undefined;
      const raw =
        typeof value === "object" && value !== null
          ? value._id || value.id || ""
          : value;
      const str = String(raw).trim();
      return mongoose.Types.ObjectId.isValid(str) ? str : undefined;
    };

    const assignedToId = toObjectId(req.body.assignedTo) || req.userId;
    const enquiryId = toObjectId(req.body.enqId);
    const enqNo = String(req.body.enqNo || "").trim();
    if (!enqNo) {
      return res.status(400).json({ message: "enqNo is required" });
    }
    const safeRemarks = String(req.body.remarks || req.body.note || "").trim();
    if (!safeRemarks) {
      return res.status(400).json({ message: "remarks is required" });
    }

    const newFollowUp = new FollowUp({
      ...req.body,
      enqId: enquiryId,
      enqNo,
      userId: ownerId,
      assignedTo: assignedToId,
      staffName: req.user?.name || "Staff",
      activityType: req.body.activityType || req.body.type || "WhatsApp",
      type: req.body.type || req.body.activityType || "WhatsApp",
      note: safeRemarks,
      remarks: safeRemarks,
      date: req.body.date || req.body.followUpDate || today,
      followUpDate: req.body.followUpDate || req.body.date || today,
      nextFollowUpDate: req.body.nextFollowUpDate || req.body.date || req.body.followUpDate || today,
      activityTime: req.body.activityTime ? new Date(req.body.activityTime) : new Date(),
      status: "Scheduled",
    });

    const saved = await newFollowUp.save();

    if (saved?.enqId) {
      const nextAction = String(saved.nextAction || "").toLowerCase();
      const activityType = String(
        saved.activityType || saved.type || "",
      ).toLowerCase();

      let enquiryStatus = null;
      if (nextAction === "sales") enquiryStatus = "Converted";
      else if (nextAction === "drop") enquiryStatus = "Not Interested";
      else if (
        nextAction === "followup" ||
        activityType.includes("call") ||
        activityType.includes("whatsapp") ||
        activityType.includes("visit") ||
        activityType.includes("meeting") ||
        activityType.includes("email")
      ) {
        enquiryStatus = "Contacted";
      }

      const enquiryUpdate = { lastContactedAt: new Date() };
      if (enquiryStatus) enquiryUpdate.status = enquiryStatus;

      await Enquiry.findByIdAndUpdate(saved.enqId, {
        $set: enquiryUpdate,
      });
    }

    cache.invalidate("followups");
    cache.invalidate("dashboard");
    cache.invalidate("enquiries");
    await emitFollowUpChanged(req, {
      action: "create",
      followUpId: String(saved?._id || ""),
      enqId: String(saved?.enqId || ""),
      enqNo: saved?.enqNo || "",
      assignedTo: saved?.assignedTo || null,
    });
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

    const scope = await getFollowUpAccessScope(req);
    const scopedFilter = buildFollowUpScopedFilter(scope);
    const filter = {
      _id: req.params.id,
      ...scopedFilter,
    };

    const updateData = { ...req.body };
    // PROTECT USERID
    delete updateData.userId;

    const followUp = await FollowUp.findOneAndUpdate(filter, updateData, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!followUp) {
      return res
        .status(404)
        .json({ message: "Follow-up not found or unauthorized" });
    }

    // Keep enquiry status in sync for lifecycle tracking
    if (followUp?.enqId) {
      const nextAction = String(followUp.nextAction || "").toLowerCase();
      let enquiryStatus = null;
      if (nextAction === "sales") enquiryStatus = "Converted";
      else if (nextAction === "drop") enquiryStatus = "Not Interested";
      else if (nextAction === "followup") enquiryStatus = "Contacted";

      if (enquiryStatus) {
        await Enquiry.findByIdAndUpdate(followUp.enqId, {
          $set: { status: enquiryStatus, lastContactedAt: new Date() },
        });
      }
    }

    cache.invalidate("followups");
    cache.invalidate("dashboard");
    cache.invalidate("enquiries");
    await emitFollowUpChanged(req, {
      action: "update",
      followUpId: String(followUp?._id || ""),
      enqId: String(followUp?.enqId || ""),
      enqNo: followUp?.enqNo || "",
      assignedTo: followUp?.assignedTo || null,
    });
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

    const scope = await getFollowUpAccessScope(req);
    const scopedFilter = buildFollowUpScopedFilter(scope);
    const filter = {
      _id: req.params.id,
      ...scopedFilter,
    };
    const followUp = await FollowUp.findOneAndDelete(filter);

    if (!followUp) {
      return res
        .status(404)
        .json({ message: "Follow-up not found or unauthorized" });
    }

    cache.invalidate("followups");
    cache.invalidate("dashboard");
    cache.invalidate("enquiries");
    await emitFollowUpChanged(req, {
      action: "delete",
      followUpId: String(followUp?._id || req.params.id || ""),
      enqId: String(followUp?.enqId || ""),
      enqNo: followUp?.enqNo || "",
      assignedTo: followUp?.assignedTo || null,
    });
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

    const scope = await getFollowUpAccessScope(req);
    const filter = buildFollowUpScopedFilter(scope);

    // Try to find by enqNo first, then by ID
    let query = { enqNo: enqNoOrId, ...filter };

    // If it looks like a MongoDB ID, also search by that
    if (mongoose.Types.ObjectId.isValid(enqNoOrId)) {
      query = {
        $and: [{ $or: [{ enqNo: enqNoOrId }, { enqId: enqNoOrId }] }, filter],
      };
    }

    const history = await FollowUp.find(query)
      .find({
        activityType: { $ne: "System" },
        type: { $ne: "System" },
        note: { $ne: "Enquiry created" },
        remarks: { $ne: "Enquiry created" },
      })
      .populate("assignedTo", "name")
      .sort({ activityTime: 1, createdAt: 1 })
      .lean();

    // [REMOVED DEBUG LOG]
    res.json(history);
  } catch (err) {
    console.error("Get history error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
