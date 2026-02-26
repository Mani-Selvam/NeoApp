const express = require("express");
const router = express.Router();
const CallLog = require("../models/CallLog");
const Enquiry = require("../models/Enquiry");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const mongoose = require("mongoose");

// GET ALL CALL LOGS (With Search/Filter & Pagination)
router.post("/debug", (req, res) => {
    console.log(`📡 [DEBUG] Call Monitor Sync:`, req.body);
    res.sendStatus(200);
});

// WEBHOOK FOR EXTERNAL SERVICES (Twilio, Evolution API, etc.)
router.post("/webhook", async (req, res) => {
    try {
        const { from, to, type, duration, timestamp } = req.body;
        console.log(`📥 Incoming Call Webhook: From ${from} To ${to}`);

        if (!from) return res.status(400).json({ message: "Missing 'from' number" });

        // Normalize number
        const cleanFrom = from.replace(/\D/g, "");
        const shortMobile = cleanFrom.length > 10 ? cleanFrom.slice(-10) : cleanFrom;

        // Try to find enquiry that has a valid userId (Flexible lookup)
        const enquiry = await Enquiry.findOne({
            $and: [
                { userId: { $ne: null } },
                {
                    $or: [
                        { mobile: { $regex: shortMobile + "$" } },
                        { altMobile: { $regex: shortMobile + "$" } }
                    ]
                }
            ]
        });

        let targetUserId = null;
        if (enquiry && enquiry.userId) {
            targetUserId = enquiry.userId;
        } else {
            const firstAdmin = await User.findOne({ role: "Admin" });
            targetUserId = firstAdmin ? firstAdmin._id : null;
        }

        if (!targetUserId) {
            console.warn("⚠️ [Webhook] Dropping call log: No business owner (Admin) found in database.");
            return res.status(200).json({ success: false, message: "No target user found" });
        }

        const newLog = new CallLog({
            userId: targetUserId,
            staffId: targetUserId, // Default to admin/owner
            phoneNumber: cleanFrom,
            contactName: enquiry ? enquiry.name : "Incoming Portal Call",
            enquiryId: enquiry ? enquiry._id : null,
            callType: type || "Incoming",
            duration: duration || 0,
            businessNumber: to || process.env.PHONE_NUMBER,
            callTime: timestamp || new Date(),
            note: `Auto-logged from Webhook to ${to || 'Business Number'}`,
            isPendingCallback: (type === "Missed")
        });

        await newLog.save();

        // Emit socket event for real-time update in app
        if (req.app.get("io")) {
            req.app.get("io").emit("CALL_LOG_CREATED", newLog);
        }

        res.status(201).json({ success: true, logId: newLog._id });
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).json({ message: err.message });
    }
});

router.get("/", verifyToken, async (req, res) => {
    try {
        const { type, filter, page = 1, limit = 20 } = req.query;
        let query = {};

        // Data Isolation logic
        if (req.user.role === "Staff" && req.user.parentUserId) {
            query.userId = req.user.parentUserId;
            // Staff see their own calls or all calls in the company? 
            // Usually, staff see their own, but let's allow company-wide for admins
            if (req.user.role === "Staff") {
                query.staffId = req.userId;
            }
        } else {
            query.userId = req.userId;
        }

        // Filter by Search Query (Name or Number)
        const { search } = req.query;
        if (search) {
            query.$or = [
                { phoneNumber: { $regex: search, $options: "i" } },
                { contactName: { $regex: search, $options: "i" } }
            ];
        }

        // Filter by Enquiry ID
        const { enquiryId } = req.query;
        if (enquiryId) {
            query.enquiryId = enquiryId;
        }

        // Filter by Call Type
        if (type && type !== "All") {
            query.callType = type;
        }

        // Filter by Time Range
        if (filter === "Today") {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query.callTime = { $gte: today };
        } else if (filter === "This Week") {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            query.callTime = { $gte: weekAgo };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const callLogs = await CallLog.find(query)
            .populate("staffId", "name")
            .populate("enquiryId", "enqNo name status")
            .sort({ callTime: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await CallLog.countDocuments(query);

        res.json({
            data: callLogs,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// BATCH SYNC FROM MOBILE DEVICE
router.post("/sync-batch", verifyToken, async (req, res) => {
    try {
        const { logs } = req.body;
        if (!Array.isArray(logs)) return res.status(400).json({ message: "Invalid logs format" });

        const ownerId = (req.user.role === "Staff" && req.user.parentUserId)
            ? req.user.parentUserId
            : req.userId;

        console.log(`📡 [Sync] Processing ${logs.length} logs for User: ${req.userId}`);

        let syncCount = 0;
        let skippedCount = 0;

        for (const log of logs) {
            // Normalize number for comparison
            const cleanNum = (log.phoneNumber || "").replace(/\D/g, "");
            if (!cleanNum) continue;

            const shortMobile = cleanNum.length > 10 ? cleanNum.slice(-10) : cleanNum;

            // 🔒 SECURITY/PRIVACY CHECK: Only sync if number exists in Enquiry DB
            const existingEnquiry = await Enquiry.findOne({
                userId: ownerId,
                $or: [
                    { mobile: { $regex: shortMobile + "$" } },
                    { altMobile: { $regex: shortMobile + "$" } }
                ]
            }).select("_id name").lean();

            if (!existingEnquiry) {
                skippedCount++;
                continue; // Skip personal/non-enquiry calls
            }

            // Check if this log ID already exists to prevent duplicates
            const existingLog = await CallLog.findOne({
                userId: ownerId,
                id: log.id // Use device log ID as uniqueness check
            });

            if (existingLog) continue;

            const newLog = new CallLog({
                userId: ownerId,
                staffId: req.userId,
                id: log.id,
                phoneNumber: cleanNum,
                contactName: existingEnquiry.name,
                enquiryId: existingEnquiry._id,
                callType: log.callType || "Incoming",
                duration: parseInt(log.callDuration) || 0,
                callTime: new Date(parseInt(log.callDateTime)),
                isVideoCall: !!log.isVideoCall,
                simSlot: log.simSlot,
                isRead: log.isRead !== false,
                countryCode: log.countryCode,
                note: `Synced from Device (${log.callType})`
            });

            await newLog.save();
            syncCount++;
        }

        console.log(`✅ [Sync] Finished: ${syncCount} saved, ${skippedCount} ignored (personal)`);
        res.json({ success: true, synced: syncCount, ignored: skippedCount });
    } catch (err) {
        console.error("Batch Sync Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// LOG A NEW CALL
router.post("/", verifyToken, async (req, res) => {
    try {
        const { phoneNumber, callType, duration, note, enquiryId, callTime } = req.body;

        const ownerId = (req.user.role === "Staff" && req.user.parentUserId)
            ? req.user.parentUserId
            : req.userId;

        const cleanNum = (phoneNumber || "").replace(/\D/g, "");
        if (!cleanNum) return res.status(400).json({ message: "Invalid phone number" });

        // Logic for robust matching: try full match, then tail match (last 10 digits)
        const shortMobile = cleanNum.length > 10 ? cleanNum.slice(-10) : cleanNum;

        // Try to find an existing enquiry for this phone number if not provided
        let linkedEnquiryId = enquiryId;
        let contactName = req.body.contactName;

        if (!linkedEnquiryId) {
            const existingEnquiry = await Enquiry.findOne({
                userId: ownerId,
                $or: [
                    { mobile: { $regex: shortMobile + "$" } },
                    { altMobile: { $regex: shortMobile + "$" } }
                ]
            }).select("_id name").lean();

            if (existingEnquiry) {
                linkedEnquiryId = existingEnquiry._id;
                contactName = existingEnquiry.name;
            }
        }

        const newCallLog = new CallLog({
            userId: ownerId,
            staffId: req.userId,
            phoneNumber: cleanNum,
            contactName,
            enquiryId: linkedEnquiryId,
            callType,
            duration: duration || 0,
            businessNumber: req.user.mobile || req.body.businessNumber || process.env.PHONE_NUMBER,
            note,
            callTime: callTime || new Date(),
            followUpCreated: req.body.followUpCreated || false,
            isPendingCallback: callType === "Missed",
            isPersonal: !linkedEnquiryId // Flag as personal if not in Enquiry DB
        });

        const savedLog = await newCallLog.save();

        // If linked to an enquiry, update the enquiry's last contacted timestamp
        if (linkedEnquiryId) {
            await Enquiry.findByIdAndUpdate(linkedEnquiryId, {
                $set: { lastContactedAt: new Date() },
                $inc: { callCount: 1 } // We might need to add this field to Enquiry model
            });
        }

        res.status(201).json(savedLog);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// GET CALL STATS/REPORTS
router.get("/stats", verifyToken, async (req, res) => {
    try {
        const { filter } = req.query;
        const ownerId = (req.user.role === "Staff" && req.user.parentUserId)
            ? req.user.parentUserId
            : req.userId;

        let matchQuery = { userId: new mongoose.Types.ObjectId(ownerId) };

        // Apply Time Filter
        if (filter === "Today") {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            matchQuery.callTime = { $gte: today };
        } else if (filter === "This Week") {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            matchQuery.callTime = { $gte: weekAgo };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [statsResult, staffActivity] = await Promise.all([
            CallLog.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        totalCalls: { $sum: 1 },
                        incoming: { $sum: { $cond: [{ $eq: ["$callType", "Incoming"] }, 1, 0] } },
                        outgoing: { $sum: { $cond: [{ $eq: ["$callType", "Outgoing"] }, 1, 0] } },
                        missed: { $sum: { $cond: [{ $eq: ["$callType", "Missed"] }, 1, 0] } },
                        avgDuration: { $avg: "$duration" },
                        totalDuration: { $sum: "$duration" },
                        todayCalls: {
                            $sum: { $cond: [{ $gte: ["$callTime", today] }, 1, 0] }
                        }
                    }
                }
            ]),
            CallLog.aggregate([
                { $match: { userId: new mongoose.Types.ObjectId(ownerId) } },
                {
                    $group: {
                        _id: "$staffId",
                        count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "staffInfo"
                    }
                },
                { $unwind: "$staffInfo" },
                {
                    $project: {
                        name: "$staffInfo.name",
                        count: 1
                    }
                }
            ])
        ]);

        res.json({
            summary: statsResult[0] || { totalCalls: 0, todayCalls: 0, incoming: 0, outgoing: 0, missed: 0, avgDuration: 0 },
            staffActivity
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// IDENTIFY CALLER
router.get("/identify/:phoneNumber", verifyToken, async (req, res) => {
    try {
        const ownerId = (req.user.role === "Staff" && req.user.parentUserId)
            ? req.user.parentUserId
            : req.userId;

        const cleanNum = req.params.phoneNumber.replace(/\D/g, "");
        const shortMobile = cleanNum.length > 10 ? cleanNum.slice(-10) : cleanNum;

        const enquiry = await Enquiry.findOne({
            userId: ownerId,
            $or: [
                { mobile: { $regex: shortMobile + "$" } },
                { altMobile: { $regex: shortMobile + "$" } }
            ]
        }).select("name enqNo status").lean();

        if (enquiry) {
            res.json({ found: true, details: enquiry });
        } else {
            res.json({ found: false });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
