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

// Get Dashboard Summary
router.get("/summary", verifyToken, async (req, res) => {
    const _start = Date.now();
    try {
        const cacheKey = cache.key('dashboard', { userId: req.userId, role: req.user.role });

        // ⚡ Use cache.wrap to deduplicate concurrent requests
        const { data: response, source } = await cache.wrap(cacheKey, async () => {
            const now = new Date();
            const today = toLocalIsoDate(now);
            const firstDayOfMonth = toLocalIsoDate(
                new Date(now.getFullYear(), now.getMonth(), 1),
            );

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
                note: { $ne: "Enquiry created" },
                remarks: { $ne: "Enquiry created" },
            };

            // Run all queries in parallel
            const [
                countsResult,
                totalEnquiry,
                todayEnquiry,
                revenueResult,
                todayFollowUpsCount,
                missedFollowUpsCount,
                recentEnquiries,
                todayList,
                missedList,
            ] = await Promise.all([
                Enquiry.aggregate([
                    { $match: query },
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ]),
                Enquiry.countDocuments(query),
                Enquiry.countDocuments({ ...query, date: today }),
                Enquiry.aggregate([
                    { $match: { ...query, status: "Converted" } },
                    {
                        $facet: {
                            overall: [{ $group: { _id: null, totalAmount: { $sum: { $toDouble: "$cost" } } } }],
                            monthly: [
                                { $match: { date: { $gte: firstDayOfMonth } } },
                                { $group: { _id: null, monthlyAmount: { $sum: { $toDouble: "$cost" } }, count: { $sum: 1 } } }
                            ]
                        }
                    }
                ]),
                FollowUp.countDocuments({ ...query, date: today, ...activeFollowUpFilter }),
                FollowUp.countDocuments({ ...query, date: { $lt: today }, ...activeFollowUpFilter }),
                Enquiry.find(query)
                    .select('name enqNo date status mobile product cost')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                FollowUp.find({ ...query, date: today, ...activeFollowUpFilter })
                    .select('name mobile image product enqNo date followUpDate nextFollowUpDate type activityType remarks status')
                    .sort({ date: 1, activityTime: -1, createdAt: -1 })
                    .limit(5)
                    .lean(),
                FollowUp.find({ ...query, date: { $lt: today }, ...activeFollowUpFilter })
                    .select('name mobile image product enqNo date followUpDate nextFollowUpDate type activityType remarks status')
                    .sort({ date: -1, activityTime: -1, createdAt: -1 })
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
            });

            const converted = counts.converted || 0;
            const conversionRate = totalEnquiry > 0 ? Math.round((converted / totalEnquiry) * 100) : 0;

            return {
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
                overallSalesAmount: revenueResult[0]?.overall[0]?.totalAmount || 0,
                monthlyRevenue: revenueResult[0]?.monthly[0]?.monthlyAmount || 0,
                salesMonthly: revenueResult[0]?.monthly[0]?.count || 0,
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
