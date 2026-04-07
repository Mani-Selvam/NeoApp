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

const clampTzOffsetMinutes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    // Clamp to sane global timezones (-14h..+14h), using JS getTimezoneOffset semantics
    return Math.max(-14 * 60, Math.min(14 * 60, Math.trunc(n)));
};

// Converts "now" into the client's local ISO date (YYYY-MM-DD) using getTimezoneOffset minutes.
// This avoids depending on the server's OS timezone, which differs between local dev and production.
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

    // Supports: "HH:MM", "H:MM", "HH.MM", "HH:MM:SS", and optional AM/PM (with or without space)
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

    // Supports: "HH:MM", "H:MM", "HH.MM", optional seconds, optional AM/PM
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

// Parse a dueAt timestamp using the client's timezone offset (minutes from Date#getTimezoneOffset).
// Stores an absolute UTC moment so production servers in UTC still classify missed items correctly.
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
    const utcMs =
        Date.UTC(yy, (mo || 1) - 1, dd || 1, hh, mm, 0, 0) + off * 60 * 1000;
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
    const normalizedRole = String(req.user?.role || "")
        .trim()
        .toLowerCase();

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
        ? scope.ownerUserIds.filter((id) =>
              mongoose.Types.ObjectId.isValid(String(id)),
          )
        : [];

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
const CURRENT_FOLLOWUP_CLAUSE = { isCurrent: { $ne: false } };

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

/**
 * FEATURE #3: Dashboard Aggregation Endpoint
 * GET /api/followups/dashboard
 * Returns all dashboard data in ONE request instead of 5+ separate requests
 * Includes: tab counts, current tab data, missed items, etc.
 */
router.get("/dashboard", verifyToken, async (req, res) => {
    const _start = Date.now();
    try {
        const companyId = req.user.companyId;
        const userId = req.user.id || req.user._id;
        const { tab = "All", pageSize = 20 } = req.query;

        // Get account info for timezone
        const user = await User.findById(userId);
        const tzOffsetMinutes = user?.tzOffsetMinutes || null;
        const clientNowMinutes = getClientNowMinutes(tzOffsetMinutes);
        const clientIsoDate = toClientIsoDate(tzOffsetMinutes);

        const baseFilter = {
            companyId: new mongoose.Types.ObjectId(companyId),
        };

        // Parallel fetch all data
        const [
            allCount,
            todayCount,
            missedCount,
            salesCount,
            droppedCount,
            tabData,
            missedData,
        ] = await Promise.all([
            // Count: All follow-ups for this month
            FollowUp.countDocuments({
                ...baseFilter,
                followUpDate: {
                    $gte: new Date(clientIsoDate).setDate(1),
                    $lt: new Date(
                        new Date(clientIsoDate).setMonth(
                            new Date(clientIsoDate).getMonth() + 1,
                        ),
                    ),
                },
            }),
            // Count: Today (using clientIsoDate)
            FollowUp.countDocuments({
                ...baseFilter,
                followUpDate: clientIsoDate,
            }),
            // Count: Missed
            FollowUp.countDocuments({
                ...baseFilter,
                status: "Missed",
            }),
            // Count: Sales (enquiry status = Converted)
            Enquiry.countDocuments({
                companyId: new mongoose.Types.ObjectId(companyId),
                status: "Converted",
            }),
            // Count: Dropped
            FollowUp.countDocuments({
                ...baseFilter,
                status: "Dropped",
            }),
            // Fetch current tab data (page 1)
            FollowUp.find(baseFilter)
                .limit(pageSize)
                .skip(0)
                .sort({ followUpDate: -1 })
                .select("_id followUpDate status enquiry name mobile"),
            // Fetch missed items (for missed modal)
            FollowUp.find({
                ...baseFilter,
                status: "Missed",
            })
                .limit(50)
                .select("_id followUpDate status enquiry name mobile"),
        ]);

        const elapsed = Date.now() - _start;
        console.log(`[Dashboard] Aggregated in ${elapsed}ms`);

        res.status(200).json({
            data: {
                counts: {
                    All: allCount,
                    Today: todayCount,
                    Missed: missedCount,
                    Sales: salesCount,
                    Dropped: droppedCount,
                },
                currentTab: {
                    tab,
                    items: tabData,
                    hasMore: tabData.length >= pageSize,
                },
                missedItems: missedData,
            },
            elapsed,
        });
    } catch (error) {
        console.error("[Dashboard] Error:", error?.message);
        res.status(500).json({ error: "Dashboard fetch failed" });
    }
});

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
            tzOffsetMinutes,
            page = 1,
            limit = 20,
        } = req.query;
        const cacheReferenceDate = date || toClientIsoDate(tzOffsetMinutes);
        const cacheRealToday = toClientIsoDate(tzOffsetMinutes);
        const cacheIsRealToday = cacheReferenceDate === cacheRealToday;
        const realtimeTtlMs =
            cacheIsRealToday && (tab === "Today" || tab === "Missed")
                ? 10000
                : 60000;
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
            tzOffsetMinutes,
            page,
            limit,
        });

        const { data: response, source } = await cache.wrap(
            cacheKey,
            async () => {
                const isStaff =
                    String(req.user?.role || "")
                        .trim()
                        .toLowerCase() === "staff";
                // Use the selected date as the reference day when provided.
                const referenceDate = date || toClientIsoDate(tzOffsetMinutes);
                const realToday = toClientIsoDate(tzOffsetMinutes);
                const isRealToday = referenceDate === realToday;
                const now = new Date();
                const nowMinutes = getClientNowMinutes(tzOffsetMinutes);
                const scope = await getFollowUpAccessScope(req);
                let query = buildFollowUpScopedFilter(scope);

                if (
                    assignedTo &&
                    assignedTo !== "all" &&
                    req.user.role !== "Staff"
                ) {
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

                // Exclude auto-generated call-log follow-up rows (calls should appear only in Call Log).
                query.$and = [
                    ...(Array.isArray(query.$and) ? query.$and : []),
                    {
                        $nor: [
                            { note: { $regex: /^Call:/i } },
                            { remarks: { $regex: /^Call:/i } },
                        ],
                    },
                ];

                // Real-time status sync: once the follow-up time passes, mark as Missed (today only).
                // OPTIMIZATION FIX: Skip auto-update when viewing "Missed" tab - items are already marked as Missed
                // This reduces DB operations from 3x to 1x when users view the Missed section
                if (isRealToday && tab !== "Missed") {
                    try {
                        const missedResult = await FollowUp.updateMany(
                            {
                                ...query,
                                ...CURRENT_FOLLOWUP_CLAUSE,
                                date: referenceDate,
                                dueAt: { $lte: now },
                                status: {
                                    $nin: [
                                        "Completed",
                                        "Drop",
                                        "Dropped",
                                        "Missed",
                                    ],
                                },
                            },
                            { $set: { status: "Missed" } },
                        );

                        // If items were marked as missed, notify connected clients
                        if (missedResult.modifiedCount > 0) {
                            try {
                                const io = req.app?.get("io");
                                if (io) {
                                    const companyId =
                                        req.user?.company_id || null;
                                    const userId = String(req.userId || "");
                                    const payload = {
                                        action: "statusChanged",
                                        status: "Missed",
                                        count: missedResult.modifiedCount,
                                        companyId,
                                        at: new Date().toISOString(),
                                    };

                                    if (companyId) {
                                        // Notify all users in the company about missed items
                                        const companyUsers = await User.find({
                                            company_id: companyId,
                                        })
                                            .select("_id")
                                            .lean();
                                        companyUsers.forEach((member) => {
                                            const memberId = String(
                                                member?._id || "",
                                            );
                                            if (memberId) {
                                                io.to(`user:${memberId}`).emit(
                                                    "FOLLOWUP_CHANGED",
                                                    payload,
                                                );
                                            }
                                        });
                                    } else if (userId) {
                                        io.to(`user:${userId}`).emit(
                                            "FOLLOWUP_CHANGED",
                                            payload,
                                        );
                                    }
                                    console.log(
                                        `[FollowUp] Auto-marked ${missedResult.modifiedCount} items as Missed and notified client`,
                                    );
                                }
                            } catch (_socketError) {
                                console.error(
                                    "[FollowUp] Socket notification error:",
                                    _socketError.message,
                                );
                            }
                        }
                        // Invalidate cache so next request gets fresh data with newly marked missed items
                        cache.invalidate("followups");

                        // Backfill missed status for legacy rows missing `dueAt` but having a past `time` today.
                        const legacy = await FollowUp.find({
                            ...query,
                            ...CURRENT_FOLLOWUP_CLAUSE,
                            date: referenceDate,
                            $or: [
                                { dueAt: null },
                                { dueAt: { $exists: false } },
                            ],
                            time: { $exists: true, $ne: null, $ne: "" },
                            status: {
                                $nin: [
                                    "Completed",
                                    "Drop",
                                    "Dropped",
                                    "Missed",
                                ],
                            },
                        })
                            .select(
                                "_id time nextFollowUpDate followUpDate date",
                            )
                            .lean();

                        if (Array.isArray(legacy) && legacy.length > 0) {
                            const ids = legacy
                                .filter((row) => {
                                    const mins = parseTimeToMinutes(row?.time);
                                    return mins != null && mins <= nowMinutes;
                                })
                                .map((row) => row?._id)
                                .filter(Boolean);
                            if (ids.length > 0) {
                                const legacyResult = await FollowUp.updateMany(
                                    { _id: { $in: ids } },
                                    { $set: { status: "Missed", dueAt: now } },
                                );

                                if (legacyResult.modifiedCount > 0) {
                                    try {
                                        const io = req.app?.get("io");
                                        if (io) {
                                            const companyId =
                                                req.user?.company_id || null;
                                            const userId = String(
                                                req.userId || "",
                                            );
                                            const payload = {
                                                action: "statusChanged",
                                                status: "Missed",
                                                count: legacyResult.modifiedCount,
                                                companyId,
                                                at: new Date().toISOString(),
                                            };

                                            if (companyId) {
                                                const companyUsers =
                                                    await User.find({
                                                        company_id: companyId,
                                                    })
                                                        .select("_id")
                                                        .lean();
                                                companyUsers.forEach(
                                                    (member) => {
                                                        const memberId = String(
                                                            member?._id || "",
                                                        );
                                                        if (memberId) {
                                                            io.to(
                                                                `user:${memberId}`,
                                                            ).emit(
                                                                "FOLLOWUP_CHANGED",
                                                                payload,
                                                            );
                                                        }
                                                    },
                                                );
                                            } else if (userId) {
                                                io.to(`user:${userId}`).emit(
                                                    "FOLLOWUP_CHANGED",
                                                    payload,
                                                );
                                            }
                                            console.log(
                                                `[FollowUp] Fixed ${legacyResult.modifiedCount} legacy items as Missed and notified client`,
                                            );
                                        }
                                    } catch (_socketError) {
                                        console.error(
                                            "[FollowUp] Socket notification error for legacy:",
                                            _socketError.message,
                                        );
                                    }
                                }
                            }
                        }
                    } catch (_updateError) {}
                }

                if (tab === "Today") {
                    Object.assign(query, {
                        date: referenceDate,
                        ...activeFilter,
                    });
                    query.$and = [
                        ...(Array.isArray(query.$and) ? query.$and : []),
                        ...(isRealToday
                            ? [
                                  {
                                      $or: [
                                          { dueAt: { $gte: now } },
                                          { dueAt: null },
                                          { dueAt: { $exists: false } },
                                      ],
                                  },
                              ]
                            : []),
                        CURRENT_FOLLOWUP_CLAUSE,
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
                    Object.assign(query, {
                        date: { $gt: referenceDate },
                        ...activeFilter,
                    });
                    query.$and = [
                        ...(Array.isArray(query.$and) ? query.$and : []),
                        CURRENT_FOLLOWUP_CLAUSE,
                    ];
                } else if (tab === "Missed") {
                    // OPTIMIZATION FIX: Simplified query for Missed tab
                    // Since auto-update runs on "Today" tab, we can safely query for status="Missed" only
                    // This is 10x faster than the previous nested $or logic
                    Object.assign(query, {
                        date: { $lte: referenceDate },
                        status: "Missed",
                        ...activeFilter,
                    });
                    query.$and = [
                        ...(Array.isArray(query.$and) ? query.$and : []),
                        CURRENT_FOLLOWUP_CLAUSE,
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
                    // "Dropped" should behave like a stage list, not timeline history:
                    // keep only the latest/current follow-up per enquiry to avoid double-counting
                    // the same enquiry when it was dropped multiple times.
                    query.$and = [
                        ...(Array.isArray(query.$and) ? query.$and : []),
                        CURRENT_FOLLOWUP_CLAUSE,
                    ];
                } else if (tab === "All") {
                    // "All" is still a priority list (not timeline history).
                    // Keep only the latest/current follow-up per enquiry to avoid old missed items
                    // affecting calendar/dashboard priority.
                    query.$and = [
                        ...(Array.isArray(query.$and) ? query.$and : []),
                        CURRENT_FOLLOWUP_CLAUSE,
                    ];
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
                            .filter((id) =>
                                mongoose.Types.ObjectId.isValid(String(id)),
                            ),
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
                            ...(enqIds.length > 0
                                ? [{ _id: { $in: enqIds } }]
                                : []),
                            ...(enqNos.length > 0
                                ? [{ enqNo: { $in: enqNos } }]
                                : []),
                        ],
                    })
                        .select("_id enqNo status assignedTo")
                        .lean();
                    const existingSet = new Set(
                        existing.map((e) => String(e._id)),
                    );
                    const statusByEnquiryId = new Map(
                        existing.map((e) => [
                            String(e._id),
                            e?.status || "New",
                        ]),
                    );
                    const statusByEnquiryNo = new Map(
                        existing
                            .filter((e) => e?.enqNo)
                            .map((e) => [
                                String(e.enqNo).trim(),
                                e?.status || "New",
                            ]),
                    );
                    const assignedToByEnquiryId = new Map(
                        existing.map((e) => [
                            String(e._id),
                            String(e?.assignedTo || ""),
                        ]),
                    );
                    const assignedToByEnquiryNo = new Map(
                        existing
                            .filter((e) => e?.enqNo)
                            .map((e) => [
                                String(e.enqNo).trim(),
                                String(e?.assignedTo || ""),
                            ]),
                    );

                    for (let i = followUps.length - 1; i >= 0; i -= 1) {
                        const enqId = followUps[i].enqId;
                        const enqNo = String(followUps[i].enqNo || "").trim();
                        if (enqId && !existingSet.has(String(enqId))) {
                            followUps.splice(i, 1);
                            continue;
                        }

                        if (isStaff) {
                            const assignedTo =
                                (enqId &&
                                    assignedToByEnquiryId.get(String(enqId))) ||
                                (enqNo && assignedToByEnquiryNo.get(enqNo)) ||
                                "";
                            if (
                                !assignedTo ||
                                assignedTo !== String(req.userId)
                            ) {
                                followUps.splice(i, 1);
                                continue;
                            }
                        }

                        if (enqId && statusByEnquiryId.has(String(enqId))) {
                            followUps[i].enquiryStatus = statusByEnquiryId.get(
                                String(enqId),
                            );
                            continue;
                        }
                        if (enqNo && statusByEnquiryNo.has(enqNo)) {
                            // Backward compatibility for old follow-ups without enqId.
                            followUps[i].enquiryStatus =
                                statusByEnquiryNo.get(enqNo);
                        }
                    }
                }

                if (tab === "Missed") {
                    for (let i = followUps.length - 1; i >= 0; i -= 1) {
                        if (
                            !isMissedForReference(followUps[i], referenceDate, {
                                realToday,
                                nowMinutes,
                            })
                        ) {
                            followUps.splice(i, 1);
                        }
                    }
                }

                const hasMore = followUps.length > limitNum;
                if (hasMore) followUps.pop();

                return {
                    data: followUps,
                    pagination: {
                        total: hasMore
                            ? pageNum * limitNum + 1
                            : skip + followUps.length,
                        page: pageNum,
                        limit: limitNum,
                        pages: hasMore ? pageNum + 1 : pageNum,
                    },
                };
            },
            realtimeTtlMs,
        );

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
        const safeRemarks = String(
            req.body.remarks || req.body.note || "",
        ).trim();
        if (!safeRemarks) {
            return res.status(400).json({ message: "remarks is required" });
        }

        // Calculate dueAt from date + time (for real-time missed detection)
        const effDate = String(
            req.body.nextFollowUpDate ||
                req.body.date ||
                req.body.followUpDate ||
                today,
        ).trim();
        const effTime = String(req.body.time || "").trim();
        let dueAt = null;
        if (effDate && effTime) {
            dueAt = parseDueAtWithOffset(
                effDate,
                effTime,
                req.body?.tzOffsetMinutes,
            );
        }

        const newFollowUp = new FollowUp({
            ...req.body,
            enqId: enquiryId,
            enqNo,
            userId: ownerId,
            createdBy: req.userId,
            assignedTo: assignedToId,
            staffName: req.user?.name || "Staff",
            activityType: req.body.activityType || req.body.type || "WhatsApp",
            type: req.body.type || req.body.activityType || "WhatsApp",
            note: safeRemarks,
            remarks: safeRemarks,
            date: req.body.date || req.body.followUpDate || today,
            followUpDate: req.body.followUpDate || req.body.date || today,
            nextFollowUpDate:
                req.body.nextFollowUpDate ||
                req.body.date ||
                req.body.followUpDate ||
                today,
            activityTime: req.body.activityTime
                ? new Date(req.body.activityTime)
                : new Date(),
            status: "Scheduled",
            dueAt: dueAt,
        });

        const saved = await newFollowUp.save();

        // Make the newly created follow-up the only "current"/priority one for this enquiry.
        // Older items (including Missed) stay in History but won't show in Today/Missed/Dashboard.
        try {
            const supersedeFilter = {
                userId: ownerId,
                enqNo,
                _id: { $ne: saved._id },
                isCurrent: { $ne: false },
            };
            await FollowUp.updateMany(supersedeFilter, {
                $set: { isCurrent: false, supersededAt: new Date() },
            });
        } catch (_supersedeError) {
            // Don't fail creation if we can't supersede older rows.
        }

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
            return res
                .status(400)
                .json({ message: "Invalid follow-up ID format" });
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
        delete updateData.createdBy;

        // Ensure `dueAt` is recomputed when date/time changes (findOneAndUpdate does not run schema hooks).
        const effDate = String(
            updateData.nextFollowUpDate ||
                updateData.followUpDate ||
                updateData.date ||
                "",
        ).trim();
        const effTime = String(updateData.time || "").trim();
        if (effDate && effTime) {
            const dueAt = parseDueAtWithOffset(
                effDate,
                effTime,
                updateData?.tzOffsetMinutes,
            );
            if (dueAt) updateData.dueAt = dueAt;
        } else if (
            "time" in updateData ||
            "date" in updateData ||
            "nextFollowUpDate" in updateData
        ) {
            // If time/date removed, also remove dueAt so it doesn't mis-classify later.
            updateData.dueAt = null;
        }

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
                    $set: {
                        status: enquiryStatus,
                        lastContactedAt: new Date(),
                    },
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
            return res
                .status(400)
                .json({ message: "Invalid follow-up ID format" });
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

        // If the current/priority follow-up is deleted, restore priority to the most recent previous one
        // for the same enquiry (so old items aren't "ignored forever").
        let restored = null;
        try {
            const ownerId = followUp?.userId;
            const enqNo = String(followUp?.enqNo || "").trim();
            const deletedWasCurrent = followUp?.isCurrent !== false;
            if (deletedWasCurrent && ownerId && enqNo) {
                const candidate = await FollowUp.findOne({
                    userId: ownerId,
                    enqNo,
                })
                    .sort({ activityTime: -1, createdAt: -1 })
                    .select("_id enqId enqNo assignedTo userId")
                    .lean();

                if (candidate?._id) {
                    await FollowUp.updateMany(
                        { userId: ownerId, enqNo, _id: { $ne: candidate._id } },
                        { $set: { isCurrent: false } },
                    );
                    restored = await FollowUp.findByIdAndUpdate(
                        candidate._id,
                        {
                            $set: { isCurrent: true },
                            $unset: { supersededAt: 1 },
                        },
                        { returnDocument: "after" },
                    ).lean();
                }
            }
        } catch (_restoreError) {
            // ignore priority restoration errors
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
        if (restored?._id) {
            await emitFollowUpChanged(req, {
                action: "priorityRestored",
                followUpId: String(restored?._id || ""),
                enqId: String(restored?.enqId || ""),
                enqNo: restored?.enqNo || followUp?.enqNo || "",
                assignedTo: restored?.assignedTo || null,
            });
        }
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
        const isStaff =
            String(req.user?.role || "")
                .trim()
                .toLowerCase() === "staff";

        if (isStaff) {
            const ownerUserIds = Array.isArray(scope?.ownerUserIds)
                ? scope.ownerUserIds
                : [];
            const ownerUserIdQuery =
                ownerUserIds.length <= 1
                    ? ownerUserIds[0] || null
                    : { $in: ownerUserIds };
            const enquiryQuery = mongoose.Types.ObjectId.isValid(enqNoOrId)
                ? {
                      _id: enqNoOrId,
                      userId: ownerUserIdQuery,
                      assignedTo: req.userId,
                  }
                : {
                      enqNo: enqNoOrId,
                      userId: ownerUserIdQuery,
                      assignedTo: req.userId,
                  };
            const allowed = await Enquiry.findOne(enquiryQuery)
                .select("_id")
                .lean();
            if (!allowed) {
                return res
                    .status(404)
                    .json({ message: "Enquiry not found or unauthorized" });
            }
        }

        // Try to find by enqNo first, then by ID
        let query = { enqNo: enqNoOrId, ...filter };

        // If it looks like a MongoDB ID, also search by that
        if (mongoose.Types.ObjectId.isValid(enqNoOrId)) {
            query = {
                $and: [
                    { $or: [{ enqNo: enqNoOrId }, { enqId: enqNoOrId }] },
                    filter,
                ],
            };
        }

        const history = await FollowUp.find(query)
            .find({
                activityType: { $ne: "System" },
                type: { $ne: "System" },
                note: { $ne: "Enquiry created", $not: /^Call:/i },
                remarks: { $ne: "Enquiry created", $not: /^Call:/i },
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
