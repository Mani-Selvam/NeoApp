const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Enquiry = require("../models/Enquiry");
const FollowUp = require("../models/FollowUp");
const { verifyToken } = require("../middleware/auth");
const cache = require("../utils/responseCache");

// Get Dashboard Summary
router.get("/summary", verifyToken, async (req, res) => {
    const _start = Date.now();
    try {
        const cacheKey = cache.key('dashboard', { userId: req.userId, role: req.user.role });

        // ⚡ Use cache.wrap to deduplicate concurrent requests
        const { data: response, source } = await cache.wrap(cacheKey, async () => {
            const today = new Date().toISOString().split("T")[0];
            const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

            // Data isolation query
            const query = {};
            if (req.user.role === "Staff" && req.user.parentUserId) {
                query.userId = new mongoose.Types.ObjectId(req.user.parentUserId);
                query.assignedTo = new mongoose.Types.ObjectId(req.userId);
            } else {
                query.userId = new mongoose.Types.ObjectId(req.userId);
            }

            // Run all queries in parallel
            const [
                countsResult,
                totalEnquiry,
                todayEnquiry,
                revenueResult,
                todayFollowUpsCount,
                recentEnquiries,
                todayList
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
                FollowUp.countDocuments({ ...query, date: today, status: { $ne: "Completed" } }),
                Enquiry.find(query)
                    .select('name enqNo date status mobile product cost')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                FollowUp.find({ ...query, date: today })
                    .select('name mobile image product enqNo date type remarks status')
                    .limit(5)
                    .lean()
            ]);

            const counts = { new: 0, inProgress: 0, converted: 0, closed: 0, dropped: 0 };
            countsResult.forEach(c => {
                const status = c._id?.toLowerCase();
                if (status === "new") counts.new = c.count;
                else if (status === "in progress") counts.inProgress = c.count;
                else if (status === "converted") counts.converted = c.count;
                else if (status === "closed") counts.closed = c.count;
                else if (status === "dropped" || status === "drop") counts.dropped = c.count;
            });

            return {
                counts,
                totalEnquiry,
                todayEnquiry,
                todayFollowUps: todayFollowUpsCount,
                overallSalesAmount: revenueResult[0]?.overall[0]?.totalAmount || 0,
                monthlyRevenue: revenueResult[0]?.monthly[0]?.monthlyAmount || 0,
                salesMonthly: revenueResult[0]?.monthly[0]?.count || 0,
                recentEnquiries,
                todayList,
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
