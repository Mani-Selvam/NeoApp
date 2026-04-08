const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const Enquiry = require("../models/Enquiry");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");
const { syncEnquiryDenormalized } = require("../services/enquiryDenormalizer");

const toLocalIsoDate = (d = new Date()) => {
    const dt = d instanceof Date ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const clampTzOffsetMinutes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // Clamp to sane global timezones (-14h..+14h), using JS getTimezoneOffset semantics
    return Math.max(-14 * 60, Math.min(14 * 60, Math.trunc(n)));
};

// Converts "now" into the client's local ISO date (YYYY-MM-DD) using getTimezoneOffset minutes.
const toClientIsoDate = (tzOffsetMinutes) => {
    const off = clampTzOffsetMinutes(tzOffsetMinutes);
    if (off == null) return toLocalIsoDate(new Date());
    return new Date(Date.now() - off * 60 * 1000).toISOString().slice(0, 10);
};

const getClientNowMinutes = (tzOffsetMinutes) => {
    const off = clampTzOffsetMinutes(tzOffsetMinutes);
    if (off == null) {
        const now = new Date();
        return now.getHours() * 60 + now.getMinutes();
    }
    const shifted = new Date(Date.now() - off * 60 * 1000);
    return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

const parseTimeToMinutes = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const match = raw.match(
        /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
    );
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? "0");
    const meridian = String(match[4] || "").toUpperCase();

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

const parseDueAtLocal = (isoDate, timeStr) => {
    const iso = String(isoDate || "").trim();
    const time = String(timeStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    if (!time) return null;

    const m = time.match(
        /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
    );
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2] ?? "0");
    const meridian = String(m[4] || "").toUpperCase();
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null;

    if (meridian) {
        if (hh < 1 || hh > 12) return null;
        if (meridian === "AM") {
            if (hh === 12) hh = 0;
        } else if (meridian === "PM") {
            if (hh !== 12) hh += 12;
        }
    } else if (hh > 23) {
        return null;
    }

    const [yy, mo, dd] = iso.split("-").map((n) => Number(n));
    const dt = new Date(yy, (mo || 1) - 1, dd || 1, hh, mm, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
};

const parseDueAtWithOffset = (isoDate, timeStr, tzOffsetMinutes) => {
    const off = clampTzOffsetMinutes(tzOffsetMinutes);
    if (off == null) return parseDueAtLocal(isoDate, timeStr);

    const iso = String(isoDate || "").trim();
    const time = String(timeStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    if (!time) return null;

    const m = time.match(
        /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/,
    );
    if (!m) return null;
    let hh = Number(m[1]);
    const mm = Number(m[2] ?? "0");
    const meridian = String(m[4] || "").toUpperCase();
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || mm > 59) return null;

    if (meridian) {
        if (hh < 1 || hh > 12) return null;
        if (meridian === "AM") {
            if (hh === 12) hh = 0;
        } else if (meridian === "PM") {
            if (hh !== 12) hh += 12;
        }
    } else if (hh > 23) {
        return null;
    }

    const [yy, mo, dd] = iso.split("-").map((n) => Number(n));
    const utcMs = Date.UTC(yy, (mo || 1) - 1, dd || 1, hh, mm, 0, 0) + off * 60 * 1000;
    const dt = new Date(utcMs);
    return Number.isNaN(dt.getTime()) ? null : dt;
};

const isMissedForReference = (
    item,
    referenceDate,
    { realToday = null, nowMinutes = null } = {},
) => {
    const itemDate = String(
        item?.date || item?.nextFollowUpDate || item?.followUpDate || "",
    ).trim();
    if (!itemDate) return false;
    if (itemDate < referenceDate) return true;
    if (itemDate > referenceDate) return false;

    const todayIso = realToday || toLocalIsoDate(new Date());
    if (referenceDate !== todayIso) return false;

    const dueAt = item?.dueAt ? new Date(item.dueAt) : null;
    if (dueAt && !Number.isNaN(dueAt.getTime())) {
        return dueAt.getTime() <= Date.now();
    }

    const dueMinutes = parseTimeToMinutes(item?.time);
    if (dueMinutes == null) return false;

    const fallbackNow = new Date();
    const minutesNow =
        Number.isFinite(Number(nowMinutes)) && nowMinutes != null
            ? Number(nowMinutes)
            : fallbackNow.getHours() * 60 + fallbackNow.getMinutes();
    return dueMinutes <= minutesNow;
};

const getFollowUpAccessScope = async (req) => {
    const role = String(req.user?.role || "").trim().toLowerCase();
    const userId = req.userId;
    const companyId = req.user?.company_id;

    if (role === "staff") {
        const scopingFilter = { assignedTo: userId };
        if (companyId && mongoose.Types.ObjectId.isValid(String(companyId))) {
            scopingFilter.companyId = new mongoose.Types.ObjectId(companyId);
        }
        return {
            ownerUserIds: [],
            scopingFilter,
        };
    }

    if (companyId) {
        const scopingFilter = {};
        if (mongoose.Types.ObjectId.isValid(String(companyId))) {
            scopingFilter.companyId = new mongoose.Types.ObjectId(companyId);
        }
        return {
            ownerUserIds: [],
            scopingFilter,
        };
    }

    return {
        ownerUserIds: [userId],
        scopingFilter: {},
    };
};

const buildFollowUpScopedFilter = (scope) => {
    const ownerUserIds = Array.isArray(scope?.ownerUserIds)
        ? scope.ownerUserIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(String(id)),
          )
        : [];

    if (ownerUserIds.length === 0) {
        return {
            ...(scope?.scopingFilter || {}),
        };
    }

    const userId =
        ownerUserIds.length <= 1
            ? ownerUserIds[0] || null
            : { $in: ownerUserIds };

    return {
        userId,
        ...(scope?.scopingFilter || {}),
    };
};

const SALES_REGEX = /^(sales|converted)$/i;
const DROP_REGEX = /^(drop|dropped|closed|not interested)$/i;
const COMPLETED_REGEX = /^completed$/i;
const CURRENT_FOLLOWUP_CLAUSE = { isCurrent: true };

// In production, multiple screens hit /followups repeatedly (counts + lists).
// Auto-marking missed followups via updateMany on every request can become very slow.
// Throttle this work to run at most once per scope window.
const AUTO_MISSED_SYNC_TTL_MS = Number(process.env.AUTO_MISSED_SYNC_TTL_MS || 20000);
const lastAutoMissSyncAt = new Map();
const shouldRunAutoMissSync = (key) => {
    const now = Date.now();
    const last = lastAutoMissSyncAt.get(key) || 0;
    if (now - last < AUTO_MISSED_SYNC_TTL_MS) return false;
    lastAutoMissSyncAt.set(key, now);
    return true;
};

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
        // ignore issues
    }
};

/**
 * DASHBOARD ENDPOINT
 */
router.get("/dashboard", verifyToken, async (req, res) => {
    const _start = Date.now();
    try {
        const companyId = req.user?.company_id;
        const userId = req.userId;
        const { tab = "All", pageSize = 20 } = req.query;

        const scope = await getFollowUpAccessScope(req);
        const baseFilter = buildFollowUpScopedFilter(scope);
        if (companyId) baseFilter.companyId = new mongoose.Types.ObjectId(companyId);

        const user = await User.findById(userId).select("tzOffsetMinutes").lean();
        const tzOffsetMinutes = user?.tzOffsetMinutes || null;
        const clientIsoDate = toClientIsoDate(tzOffsetMinutes);
        const now = new Date();
        const nowMinutes = getClientNowMinutes(tzOffsetMinutes);

        // Proactive auto-marker: Mark items as Missed if their dueAt has passed (for today or past)
        const autoSyncKey = `fuDash:${String(companyId || "")}:${String(userId || "")}:${clientIsoDate}`;
        if (shouldRunAutoMissSync(autoSyncKey)) {
            try {
                await FollowUp.updateMany(
                    {
                        ...baseFilter,
                        ...CURRENT_FOLLOWUP_CLAUSE,
                        status: { $nin: ["Completed", "Dropped", "Converted", "Missed"] },
                        $or: [
                            { date: { $lt: clientIsoDate } },
                            { date: clientIsoDate, dueAt: { $lt: now } },
                        ],
                    },
                    { $set: { status: "Missed" } },
                );

                // Auto-unmiss: if a Missed follow-up gets rescheduled into the future, keep lists/counts correct.
                await FollowUp.updateMany(
                    {
                        ...baseFilter,
                        ...CURRENT_FOLLOWUP_CLAUSE,
                        status: "Missed",
                        $or: [
                            { date: { $gt: clientIsoDate } },
                            { date: clientIsoDate, dueAt: { $gt: now } },
                        ],
                    },
                    { $set: { status: "Scheduled" } },
                );

                // Legacy (no dueAt): if time is still ahead today, it's not missed.
                const legacyRows = await FollowUp.find({
                    ...baseFilter,
                    ...CURRENT_FOLLOWUP_CLAUSE,
                    status: "Missed",
                    date: clientIsoDate,
                    time: { $exists: true, $ne: null, $ne: "" },
                    $or: [{ dueAt: null }, { dueAt: { $exists: false } }],
                })
                    .select("_id time")
                    .limit(500)
                    .lean();
                const legacyUnmissIds = legacyRows
                    .filter((row) => {
                        const mins = parseTimeToMinutes(row?.time);
                        return mins != null && mins > nowMinutes;
                    })
                    .map((row) => row._id);
                if (legacyUnmissIds.length > 0) {
                    await FollowUp.updateMany(
                        { _id: { $in: legacyUnmissIds } },
                        { $set: { status: "Scheduled" } },
                    );
                }
            } catch (_autoErr) {
                console.error("[Dashboard] Auto-mark Missed failed:", _autoErr.message);
            }
        }

        const [
            allCount,
            todayCount,
            missedCount,
            salesCount,
            droppedCount,
            tabData,
            missedData,
        ] = await Promise.all([
            FollowUp.countDocuments({ ...baseFilter, ...CURRENT_FOLLOWUP_CLAUSE }),
            FollowUp.countDocuments({ ...baseFilter, ...CURRENT_FOLLOWUP_CLAUSE, date: clientIsoDate, status: { $ne: "Missed" } }),
            FollowUp.countDocuments({ ...baseFilter, ...CURRENT_FOLLOWUP_CLAUSE, status: "Missed" }),
            Enquiry.countDocuments({
                ...(baseFilter?.companyId ? { companyId: baseFilter.companyId } : {}),
                ...(baseFilter?.assignedTo ? { assignedTo: baseFilter.assignedTo } : {}),
                status: "Converted",
            }),
            FollowUp.countDocuments({ ...baseFilter, ...CURRENT_FOLLOWUP_CLAUSE, status: "Dropped" }),
            FollowUp.find({ ...baseFilter, ...CURRENT_FOLLOWUP_CLAUSE })
                .select(
                    "enqId enqNo name mobile image product date time dueAt followUpDate nextFollowUpDate type activityType remarks note status nextAction assignedTo createdAt activityTime",
                )
                .limit(parseInt(pageSize))
                .sort({ date: -1, createdAt: -1 })
                .lean(),
            FollowUp.find({ ...baseFilter, ...CURRENT_FOLLOWUP_CLAUSE, status: "Missed" })
                .select(
                    "enqId enqNo name mobile image product date time dueAt followUpDate nextFollowUpDate type activityType remarks note status nextAction assignedTo createdAt activityTime",
                )
                .limit(50)
                .sort({ date: -1 })
                .lean(),
        ]);

        res.json({
            data: {
                counts: { All: allCount, Today: todayCount, Missed: missedCount, Sales: salesCount, Dropped: droppedCount },
                currentTab: { tab, items: tabData, hasMore: tabData.length >= pageSize },
                missedItems: missedData,
            },
            elapsed: Date.now() - _start,
        });
    } catch (error) {
        console.error("[Dashboard] Error:", error.message);
        res.status(500).json({ error: "Dashboard fetch failed" });
    }
});

// GET Follow-ups
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
            tzOffsetMinutes,
            page = 1,
            limit = 20,
        } = req.query;

        const referenceDate = date || toClientIsoDate(tzOffsetMinutes);
        const realToday = toClientIsoDate(tzOffsetMinutes);
        const isRealToday = referenceDate === realToday;
        const now = new Date();
        const nowMinutes = getClientNowMinutes(tzOffsetMinutes);

        const scope = await getFollowUpAccessScope(req);
        let query = buildFollowUpScopedFilter(scope);

        // Proactive auto-marker: Mark items as Missed if their dueAt has passed (for today or past)
        const listAutoSyncKey = `fuList:${String(req.user?.company_id || "")}:${String(req.userId || "")}:${realToday}`;
        if (isRealToday && shouldRunAutoMissSync(listAutoSyncKey)) {
            try {
                await FollowUp.updateMany(
                    {
                        ...query,
                        ...CURRENT_FOLLOWUP_CLAUSE,
                        status: { $nin: ["Completed", "Dropped", "Converted", "Missed"] },
                        $or: [
                            { date: { $lt: realToday } },
                            { date: realToday, dueAt: { $lt: now } },
                        ],
                    },
                    { $set: { status: "Missed" } },
                );

                // Auto-unmiss for rescheduled items
                await FollowUp.updateMany(
                    {
                        ...query,
                        ...CURRENT_FOLLOWUP_CLAUSE,
                        status: "Missed",
                        $or: [{ date: { $gt: realToday } }, { date: realToday, dueAt: { $gt: now } }],
                    },
                    { $set: { status: "Scheduled" } },
                );

                const legacyRows = await FollowUp.find({
                    ...query,
                    ...CURRENT_FOLLOWUP_CLAUSE,
                    status: "Missed",
                    date: realToday,
                    time: { $exists: true, $ne: null, $ne: "" },
                    $or: [{ dueAt: null }, { dueAt: { $exists: false } }],
                })
                    .select("_id time")
                    .limit(500)
                    .lean();
                const legacyUnmissIds = legacyRows
                    .filter((row) => {
                        const mins = parseTimeToMinutes(row?.time);
                        return mins != null && mins > nowMinutes;
                    })
                    .map((row) => row._id);
                if (legacyUnmissIds.length > 0) {
                    await FollowUp.updateMany(
                        { _id: { $in: legacyUnmissIds } },
                        { $set: { status: "Scheduled" } },
                    );
                }
            } catch (_autoErr) {
                console.error("[FollowUp List] Auto-mark Missed failed:", _autoErr.message);
            }
        }

        if (assignedTo && assignedTo !== "all") query.assignedTo = assignedTo;
        if (activityType && activityType !== "all") query.$or = [{ activityType }, { type: activityType }];
        if (status && status !== "all") query.status = status;

        if (date) {
            query.date = date;
        } else if (dateFrom || dateTo) {
            query.date = {};
            if (dateFrom) query.date.$gte = dateFrom;
            if (dateTo) query.date.$lte = dateTo;
        }

        // Exclude system-generated rows (avoid regex filters here; they force collection scans in production).
        query.$nor = [{ activityType: "System" }, { type: "System" }];

        // Status logic
        if (tab === "Today") {
            query.date = referenceDate;
            query.status = { $nin: ["Missed", "Completed", "Dropped", "Converted"] };
            Object.assign(query, CURRENT_FOLLOWUP_CLAUSE);
        } else if (tab === "Upcoming") {
            query.date = { $gt: referenceDate };
            Object.assign(query, CURRENT_FOLLOWUP_CLAUSE);
        } else if (tab === "Missed") {
            query.status = "Missed";
            Object.assign(query, CURRENT_FOLLOWUP_CLAUSE);
        } else if (tab === "Sales") {
            query.status = "Converted";
            Object.assign(query, CURRENT_FOLLOWUP_CLAUSE);
        } else if (tab === "Dropped") {
            query.status = "Dropped";
            Object.assign(query, CURRENT_FOLLOWUP_CLAUSE);
        } else if (tab === "All") {
            Object.assign(query, CURRENT_FOLLOWUP_CLAUSE);
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const sort =
            tab === "Today"
                ? { dueAt: 1, activityTime: -1, createdAt: -1 }
                : tab === "Upcoming"
                  ? { date: 1, dueAt: 1, activityTime: -1, createdAt: -1 }
                  : { date: -1, dueAt: -1, activityTime: -1, createdAt: -1 };

        const followUps = await FollowUp.find(query)
            .select(
                "enqId enqNo name mobile image product date time dueAt followUpDate nextFollowUpDate type activityType remarks note status nextAction assignedTo createdAt activityTime",
            )
            .populate("assignedTo", "name")
            .sort(sort)
            .skip(skip)
            .limit(limitNum + 1)
            .lean();

        const hasMore = followUps.length > limitNum;
        if (hasMore) followUps.pop();

        res.json({
            data: followUps,
            pagination: {
                total: hasMore ? pageNum * limitNum + 1 : skip + followUps.length,
                page: pageNum,
                limit: limitNum,
                pages: hasMore ? pageNum + 1 : pageNum,
            },
        });
    } catch (err) {
        console.error("Get follow-ups error:", err);
        res.status(500).json({ message: err.message });
    }
});

// CREATE Follow-up
router.post("/", verifyToken, async (req, res) => {
    try {
        const ownerId = req.user.role === "Staff" && req.user.parentUserId ? req.user.parentUserId : req.userId;
        const companyId = req.user?.company_id || null;
        const today = toLocalIsoDate(new Date());

        const toObjectId = (value) => {
            if (!value) return undefined;
            const str = String(typeof value === "object" ? value._id || value.id : value).trim();
            return mongoose.Types.ObjectId.isValid(str) ? str : undefined;
        };

        const assignedToId = toObjectId(req.body.assignedTo) || req.userId;
        const enquiryId = toObjectId(req.body.enqId);
        const enqNo = String(req.body.enqNo || "").trim();
        const safeRemarks = String(req.body.remarks || req.body.note || "").trim();

        if (!enqNo || !safeRemarks) return res.status(400).json({ message: "enqNo and remarks are required" });

        const effDate = String(req.body.nextFollowUpDate || req.body.date || req.body.followUpDate || today).trim();
        const effTime = String(req.body.time || "").trim();
        const dueAt = (effDate && effTime) ? parseDueAtWithOffset(effDate, effTime, req.body?.tzOffsetMinutes) : null;

        const newFollowUp = new FollowUp({
            ...req.body,
            companyId,
            enqId: enquiryId,
            enqNo,
            userId: ownerId,
            createdBy: req.userId,
            assignedTo: assignedToId,
            staffName: req.user?.name || "Staff",
            activityType: req.body.activityType || req.body.type || "WhatsApp",
            note: safeRemarks,
            remarks: safeRemarks,
            date: effDate,
            dueAt,
            isCurrent: true,
        });

        const saved = await newFollowUp.save();

        // Supersede older ones
        await FollowUp.updateMany(
            { companyId, enqNo, _id: { $ne: saved._id }, isCurrent: { $ne: false } },
            { $set: { isCurrent: false, supersededAt: new Date() } }
        );

        if (saved.enqId) {
            const nextAction = String(saved.nextAction || "").toLowerCase();
            let enquiryStatus = null;
            if (nextAction === "sales") enquiryStatus = "Converted";
            else if (nextAction === "drop") enquiryStatus = "Not Interested";

            const updatePayload = {
                lastContactedAt: new Date(),
                lastFollowUpDate: saved.date,
                lastFollowUpStatus: saved.status || "Scheduled",
                nextFollowUpDate: saved.nextFollowUpDate || saved.date,
                lastActivityAt: new Date(),
            };
            if (enquiryStatus) updatePayload.status = enquiryStatus;

            await Enquiry.findByIdAndUpdate(saved.enqId, { $set: updatePayload });
            await syncEnquiryDenormalized(saved.enqId);
        }

        cache.invalidate("followups");
        cache.invalidate("enquiries");
        cache.invalidate("dashboard");

        await emitFollowUpChanged(req, { type: "CREATE", _id: saved._id, enqNo: saved.enqNo });
        res.status(201).json(saved);
    } catch (err) {
        console.error("Create follow-up error:", err.message);
        res.status(400).json({ message: err.message });
    }
});

// UPDATE Follow-up
router.put("/:id", verifyToken, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid ID" });

        const scope = await getFollowUpAccessScope(req);
        const filter = { _id: req.params.id, ...buildFollowUpScopedFilter(scope) };

        const followUp = await FollowUp.findOne(filter);
        if (!followUp) return res.status(404).json({ message: "Not found" });

        const updateData = { ...req.body };
        delete updateData.userId;
        delete updateData.createdBy;
        delete updateData.companyId;
        delete updateData.enqId;

        const tzOffsetMinutes = updateData?.tzOffsetMinutes ?? null;
        delete updateData.tzOffsetMinutes;

        const toObjectId = (value) => {
            if (!value) return undefined;
            const str = String(typeof value === "object" ? value._id || value.id : value).trim();
            return mongoose.Types.ObjectId.isValid(str) ? str : undefined;
        };

        if (Object.prototype.hasOwnProperty.call(updateData, "assignedTo")) {
            updateData.assignedTo = toObjectId(updateData.assignedTo) || followUp.assignedTo;
        }

        const mergedDate = String(
            updateData.nextFollowUpDate ||
                updateData.date ||
                updateData.followUpDate ||
                followUp.nextFollowUpDate ||
                followUp.date ||
                followUp.followUpDate ||
                toLocalIsoDate(new Date()),
        ).trim();
        const mergedTime = String(
            Object.prototype.hasOwnProperty.call(updateData, "time") ? updateData.time : followUp.time || "",
        ).trim();

        const safeRemarks = String(updateData.remarks || updateData.note || "").trim();
        if (safeRemarks) {
            updateData.remarks = safeRemarks;
            updateData.note = safeRemarks;
        }

        Object.entries(updateData).forEach(([key, value]) => {
            followUp.set(key, value);
        });

        // Keep primary schedule date stable for queries and sorts
        const scheduleTouched =
            Object.prototype.hasOwnProperty.call(updateData, "nextFollowUpDate") ||
            Object.prototype.hasOwnProperty.call(updateData, "followUpDate") ||
            Object.prototype.hasOwnProperty.call(updateData, "date") ||
            Object.prototype.hasOwnProperty.call(updateData, "time");

        if (
            scheduleTouched
        ) {
            if (mergedDate) followUp.set("date", mergedDate);
            const dueAt = mergedDate && mergedTime ? parseDueAtWithOffset(mergedDate, mergedTime, tzOffsetMinutes) : null;
            followUp.set("dueAt", dueAt);
        }

        // If user reschedules a Missed follow-up into the future, move it back to Scheduled.
        // This keeps "Missed Activity" lists accurate even if the client sends status=Missed.
        const status = String(followUp.status || "").trim().toLowerCase();
        if (scheduleTouched && status === "missed") {
            const dueAt =
                followUp.dueAt instanceof Date
                    ? followUp.dueAt
                    : followUp.dueAt
                      ? new Date(followUp.dueAt)
                      : null;
            const todayIso = toClientIsoDate(tzOffsetMinutes);
            const dateIso = String(followUp.date || "").trim();
            const rescheduled =
                (dateIso && dateIso > todayIso) ||
                (dateIso && dateIso === todayIso && dueAt && !Number.isNaN(dueAt.getTime()) && dueAt.getTime() > Date.now());
            if (rescheduled) followUp.set("status", "Scheduled");
        }

        const saved = await followUp.save();

        if (saved.enqId) await syncEnquiryDenormalized(saved.enqId);

        cache.invalidate("followups");
        cache.invalidate("dashboard");
        cache.invalidate("enquiries");
        await emitFollowUpChanged(req, { action: "update", _id: saved._id });
        res.json(saved);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE Follow-up
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const scope = await getFollowUpAccessScope(req);
        const filter = { _id: req.params.id, ...buildFollowUpScopedFilter(scope) };
        const followUp = await FollowUp.findOneAndDelete(filter);
        if (!followUp) return res.status(404).json({ message: "Not found" });

        cache.invalidate("followups");
        cache.invalidate("dashboard");
        cache.invalidate("enquiries");
        await emitFollowUpChanged(req, { action: "delete", _id: followUp._id });
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// History
router.get("/history/:enqNoOrId", verifyToken, async (req, res) => {
    try {
        const scope = await getFollowUpAccessScope(req);
        const filter = buildFollowUpScopedFilter(scope);
        const target = req.params.enqNoOrId;

        const query = mongoose.Types.ObjectId.isValid(target)
            ? { $or: [{ enqId: target }, { enqNo: target }], ...filter }
            : { enqNo: target, ...filter };

        const history = await FollowUp.find(query)
            .find({ activityType: { $ne: "System" }, note: { $not: /^Call:/i } })
            .populate("assignedTo", "name")
            .sort({ activityTime: 1, createdAt: 1 })
            .lean();

        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
