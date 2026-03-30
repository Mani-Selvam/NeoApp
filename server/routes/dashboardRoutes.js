const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Enquiry = require("../models/Enquiry");
const FollowUp = require("../models/FollowUp");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");

const toLocalIsoDate = (d = new Date()) => {
    const dt = d instanceof Date ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const parseIsoDate = (value) => {
    if (!value) return null;
    const dt = new Date(value);
    return Number.isNaN(dt.getTime()) ? null : dt;
};

const getRangeBounds = ({ range = "day", date = new Date() } = {}) => {
    const dt = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(dt.getTime())) {
        const today = new Date();
        return { rangeFrom: toLocalIsoDate(today), rangeTo: toLocalIsoDate(today) };
    }

    const normalized = String(range || "day").trim().toLowerCase();
    if (normalized === "year") {
        const start = new Date(dt.getFullYear(), 0, 1);
        const end = new Date(dt.getFullYear(), 11, 31);
        return { rangeFrom: toLocalIsoDate(start), rangeTo: toLocalIsoDate(end) };
    }
    if (normalized === "month") {
        const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
        const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
        return { rangeFrom: toLocalIsoDate(start), rangeTo: toLocalIsoDate(end) };
    }
    if (normalized === "week") {
        // ISO-like week starting Monday.
        const day = dt.getDay(); // 0 Sun ... 6 Sat
        const diffToMonday = (day + 6) % 7;
        const start = new Date(dt);
        start.setDate(dt.getDate() - diffToMonday);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { rangeFrom: toLocalIsoDate(start), rangeTo: toLocalIsoDate(end) };
    }
    const iso = toLocalIsoDate(dt);
    return { rangeFrom: iso, rangeTo: iso };
};

const shiftIsoDate = (iso, days) => {
    const dt = parseIsoDate(iso) || new Date();
    const next = new Date(dt);
    next.setDate(dt.getDate() + Number(days || 0));
    return toLocalIsoDate(next);
};

const getPrevRangeBounds = ({ range = "day", date = new Date() } = {}) => {
    const dt = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(dt.getTime())) {
        const today = new Date();
        const iso = toLocalIsoDate(today);
        return { prevFrom: iso, prevTo: iso };
    }

    const normalized = String(range || "day").trim().toLowerCase();
    if (normalized === "year") {
        const start = new Date(dt.getFullYear() - 1, 0, 1);
        const end = new Date(dt.getFullYear() - 1, 11, 31);
        return { prevFrom: toLocalIsoDate(start), prevTo: toLocalIsoDate(end) };
    }
    if (normalized === "month") {
        const start = new Date(dt.getFullYear(), dt.getMonth() - 1, 1);
        const end = new Date(dt.getFullYear(), dt.getMonth(), 0);
        return { prevFrom: toLocalIsoDate(start), prevTo: toLocalIsoDate(end) };
    }
    if (normalized === "week") {
        const { rangeFrom, rangeTo } = getRangeBounds({ range: "week", date: dt });
        return { prevFrom: shiftIsoDate(rangeFrom, -7), prevTo: shiftIsoDate(rangeTo, -7) };
    }
    const iso = toLocalIsoDate(dt);
    return { prevFrom: shiftIsoDate(iso, -1), prevTo: shiftIsoDate(iso, -1) };
};

const sumByDateToMap = (rows = []) => {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        const date = String(row?._id || "").trim();
        if (!date) continue;
        map.set(date, {
            count: Number(row?.count || 0),
            amount: Number(row?.amount || 0),
        });
    }
    return map;
};

// Get Dashboard Summary
router.get("/summary", verifyToken, async (req, res) => {
    const _start = Date.now();
    try {
        const range = String(req.query.range || "day").trim().toLowerCase();
        const dateRef =
            req.query.date ||
            req.query.referenceDate ||
            req.query.day ||
            "";
        const parsedRef = parseIsoDate(dateRef) || new Date();
        const { rangeFrom, rangeTo } = getRangeBounds({ range, date: parsedRef });
        const { prevFrom, prevTo } = getPrevRangeBounds({ range, date: parsedRef });
        const { rangeFrom: weekFrom, rangeTo: weekTo } = getRangeBounds({
            range: "week",
            date: parsedRef,
        });

        const cacheKey = cache.key("dashboard", {
            userId: req.userId,
            role: req.user.role,
            range,
            date: toLocalIsoDate(parsedRef),
            rangeFrom,
            rangeTo,
            prevFrom,
            prevTo,
            weekFrom,
            weekTo,
        });

        // ⚡ Use cache.wrap to deduplicate concurrent requests
        // Keep TTL low because "Missed" is real-time (dueAt < now), and users expect it to update fast.
        const { data: response, source } = await cache.wrap(cacheKey, async () => {
            const today = toLocalIsoDate(parsedRef);
            const dateFilter = { date: { $gte: rangeFrom, $lte: rangeTo } };
            const prevDateFilter = { date: { $gte: prevFrom, $lte: prevTo } };
            const weekDateFilter = { date: { $gte: weekFrom, $lte: weekTo } };

            // Data isolation query
            const query = {};
            if (req.user.role === "Staff" && req.user.parentUserId) {
                query.userId = new mongoose.Types.ObjectId(req.user.parentUserId);
                query.assignedTo = new mongoose.Types.ObjectId(req.userId);
            } else {
                query.userId = new mongoose.Types.ObjectId(req.userId);
            }

            const activeFollowUpFilter = {
                status: { $nin: ["Completed", "Drop", "Dropped", "dropped", "drop"] },
                nextAction: { $nin: ["Drop", "Dropped", "dropped", "drop"] },
                activityType: { $ne: "System" },
                type: { $ne: "System" },
                // Hide call-log derived follow-ups (calls should appear only in Call Log screen).
                note: { $ne: "Enquiry created", $not: /^Call:/i },
                remarks: { $ne: "Enquiry created", $not: /^Call:/i },
            };

            const realToday = toLocalIsoDate(new Date());
            const isRealToday = today === realToday;
            const now = new Date();

            const todayOpenFollowUpQuery = {
                ...query,
                date: today,
                ...activeFollowUpFilter,
                ...(isRealToday
                    ? {
                          $or: [
                              { dueAt: { $gte: now } },
                              { dueAt: null },
                              { dueAt: { $exists: false } },
                          ],
                      }
                    : {}),
            };

            const missedFollowUpQuery = {
                ...query,
                ...activeFollowUpFilter,
                ...(isRealToday
                    ? {
                          $or: [
                              { date: { $lt: today } },
                              { date: today, dueAt: { $lt: now } },
                          ],
                      }
                    : { date: { $lt: today } }),
            };

            // Run all queries in parallel
            const [
                countsResult,
                totalEnquiry,
                todayEnquiry,
                revenueResult,
                prevRevenueResult,
                weekSalesByDate,
                todayFollowUpsCount,
                missedFollowUpsCount,
                recentEnquiries,
                todayList,
                missedList,
            ] = await Promise.all([
                Enquiry.aggregate([
                    { $match: { ...query, ...dateFilter } },
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ]),
                Enquiry.countDocuments({ ...query, ...dateFilter }),
                Enquiry.countDocuments({ ...query, date: today }),
                Enquiry.aggregate([
                    { $match: { ...query, ...dateFilter, status: "Converted" } },
                    {
                        $facet: {
                            overall: [
                                {
                                    $group: {
                                        _id: null,
                                        totalAmount: { $sum: { $toDouble: "$cost" } },
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                        }
                    }
                ]),
                Enquiry.aggregate([
                    { $match: { ...query, ...prevDateFilter, status: "Converted" } },
                    {
                        $facet: {
                            overall: [
                                {
                                    $group: {
                                        _id: null,
                                        totalAmount: { $sum: { $toDouble: "$cost" } },
                                        count: { $sum: 1 },
                                    },
                                },
                            ],
                        }
                    }
                ]),
                Enquiry.aggregate([
                    { $match: { ...query, ...weekDateFilter, status: "Converted" } },
                    {
                        $group: {
                            _id: "$date",
                            count: { $sum: 1 },
                            amount: { $sum: { $toDouble: "$cost" } },
                        },
                    },
                    { $sort: { _id: 1 } },
                ]),
                FollowUp.countDocuments(todayOpenFollowUpQuery),
                FollowUp.countDocuments(missedFollowUpQuery),
                Enquiry.find({ ...query, ...dateFilter })
                    .select('name enqNo date status mobile product cost')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                FollowUp.find(todayOpenFollowUpQuery)
                    .select('name mobile image product enqNo date time dueAt followUpDate nextFollowUpDate type activityType remarks status')
                    .sort({ dueAt: 1, activityTime: -1, createdAt: -1 })
                    .limit(5)
                    .lean(),
                FollowUp.find(missedFollowUpQuery)
                    .select('name mobile image product enqNo date time dueAt followUpDate nextFollowUpDate type activityType remarks status')
                    .sort({ date: -1, dueAt: -1, activityTime: -1, createdAt: -1 })
                    .limit(5)
                    .lean()
            ]);

            const counts = {
                new: 0,
                contacted: 0,
                interested: 0,
                notInterested: 0,
                converted: 0,
                closed: 0,
            };
            countsResult.forEach(c => {
                const status = c._id?.toLowerCase();
                if (status === "new") counts.new = c.count;
                else if (status === "contacted" || status === "in progress") counts.contacted = c.count;
                else if (status === "interested") counts.interested = c.count;
                else if (status === "not interested" || status === "dropped" || status === "drop") counts.notInterested = c.count;
                else if (status === "converted") counts.converted = c.count;
                else if (status === "closed") counts.closed = c.count;
        }, 10000);

            const converted = counts.converted || 0;
            const conversionRate = totalEnquiry > 0 ? Math.round((converted / totalEnquiry) * 100) : 0;

            const revenueNow = Number(revenueResult[0]?.overall[0]?.totalAmount || 0);
            const revenuePrev = Number(prevRevenueResult[0]?.overall[0]?.totalAmount || 0);
            let revenueChangePct = 0;
            let revenueChangePctValid = true;
            if (revenuePrev > 0) {
                revenueChangePct = Math.round(((revenueNow - revenuePrev) / revenuePrev) * 100);
            } else if (revenueNow === 0) {
                revenueChangePct = 0;
            } else {
                revenueChangePctValid = false; // avoid infinity when prev is 0 but current > 0
            }

            return {
                range,
                rangeFrom,
                rangeTo,
                prevFrom,
                prevTo,
                weekFrom,
                weekTo,
                counts: {
                    ...counts,
                    contacted: counts.contacted || 0,
                    inProgress: counts.contacted || 0,
                    interested: counts.interested || 0,
                    dropped: counts.notInterested || 0,
                    converted,
                },
                totalEnquiry,
                todayEnquiry,
                todayFollowUps: todayFollowUpsCount,
                missedFollowUps: missedFollowUpsCount,
                overallSalesAmount: revenueNow,
                monthlyRevenue: revenueNow,
                salesMonthly: revenueResult[0]?.overall[0]?.count || 0,
                prevRevenue: revenuePrev,
                revenueChangePct: revenueChangePctValid ? revenueChangePct : null,
                weekSales: (() => {
                    const byDate = sumByDateToMap(weekSalesByDate);
                    const days = [];
                    for (let i = 0; i < 7; i += 1) {
                        const d = shiftIsoDate(weekFrom, i);
                        const hit = byDate.get(d) || { count: 0, amount: 0 };
                        days.push({
                            date: d,
                            convertedCount: hit.count,
                            revenue: hit.amount,
                        });
                    }
                    return days;
                })(),
                conversionRate,
                recentEnquiries,
                todayList,
                missedList,
            };
        }, 60000); // 60s TTL

        res.json(response);
        console.log(`⚡ GET /dashboard — ${Date.now() - _start}ms ${source}`);
    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
