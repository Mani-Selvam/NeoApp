const CallLog = require("../models/CallLog");

/**
 * Generate unique key for duplicate prevention
 * @param {string} phoneNumber
 * @param {string|number} timestamp - Unix timestamp or ISO string
 * @param {number} duration - Call duration in seconds
 * @returns {string} Unique key
 */
const generateUniqueKey = (phoneNumber, timestamp, duration) => {
    const ts =
        typeof timestamp === "string"
            ? new Date(timestamp).getTime()
            : Number(timestamp);
    return `${phoneNumber}_${ts}_${duration}`;
};

/**
 * POST /api/calllogs/sync
 * Batch sync device call logs with duplicate prevention
 */
exports.syncDeviceLogs = async (req, res) => {
    try {
        const { logs } = req.body;
        const userId = req.user?.userId;
        const companyId = req.user?.companyId;

        // Validate inputs
        if (!Array.isArray(logs)) {
            return res
                .status(400)
                .json({ success: false, error: "logs must be an array" });
        }

        if (logs.length === 0) {
            return res.status(200).json({
                success: true,
                inserted: 0,
                duplicates: 0,
                lastSyncTime: new Date().toISOString(),
            });
        }

        // Prepare log entries for batch insert
        const logsToInsert = [];
        const duplicateKeys = [];

        for (const log of logs) {
            // Validate required fields
            if (!log.phoneNumber || !log.callType || !log.callTime) {
                console.warn("Skipping invalid log:", log);
                continue;
            }

            const uniqueKey = generateUniqueKey(
                log.phoneNumber,
                log.callTime,
                log.callDuration || 0,
            );

            // Check if already exists
            const existingLog = await CallLog.findOne({ uniqueKey }).lean();
            if (existingLog) {
                duplicateKeys.push(uniqueKey);
                continue;
            }

            logsToInsert.push({
                companyId,
                userId,
                phoneNumber: log.phoneNumber.trim(),
                callType: log.callType,
                callDuration: log.callDuration || 0,
                callTime: new Date(log.callTime),
                contactName: log.contactName || "",
                source: "device",
                uniqueKey,
                syncedAt: new Date(),
            });
        }

        // Batch insert
        let insertedCount = 0;
        if (logsToInsert.length > 0) {
            try {
                await CallLog.insertMany(logsToInsert, { ordered: false });
                insertedCount = logsToInsert.length;
            } catch (err) {
                // Handle partial insert failures
                if (err.code === 11000) {
                    // Duplicate key error during insertMany
                    insertedCount = err.result?.insertedCount || 0;
                } else {
                    throw err;
                }
            }
        }

        // Get highest sync time for next incremental sync
        const lastSync = await CallLog.findOne(
            { companyId, userId },
            { syncedAt: 1 },
        )
            .sort({ syncedAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            inserted: insertedCount,
            duplicates: duplicateKeys.length,
            lastSyncTime: lastSync?.syncedAt || new Date().toISOString(),
        });
    } catch (err) {
        console.error("CallLog sync error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/calllogs/last-sync-time
 * Return the last sync timestamp for incremental syncs
 */
exports.getLastSyncTime = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const companyId = req.user?.companyId;

        const lastSync = await CallLog.findOne(
            { companyId, userId },
            { syncedAt: 1 },
        )
            .sort({ syncedAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            lastSyncTime: lastSync?.syncedAt || null,
        });
    } catch (err) {
        console.error("GetLastSyncTime error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/calllogs
 * List call logs by phone number with optional filters
 * Query params: phone (required), callType (optional), startDate, endDate, page, limit
 */
exports.getCallLogsByPhone = async (req, res) => {
    try {
        const {
            phone,
            callType,
            startDate,
            endDate,
            page = 1,
            limit = 50,
        } = req.query;
        const userId = req.user?.userId;
        const companyId = req.user?.companyId;

        // Validate phone
        if (!phone) {
            return res
                .status(400)
                .json({ success: false, error: "phone parameter is required" });
        }

        // Build query
        const query = { companyId, userId, phoneNumber: phone };

        // Add callType filter if provided
        if (callType) {
            const validTypes = ["incoming", "outgoing", "missed", "rejected"];
            if (validTypes.includes(callType)) {
                query.callType = callType;
            }
        }

        // Add date range filter if provided
        if (startDate || endDate) {
            query.callTime = {};
            if (startDate) {
                query.callTime.$gte = new Date(startDate);
            }
            if (endDate) {
                query.callTime.$lte = new Date(endDate);
            }
        }

        // Execute query with pagination
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const logs = await CallLog.find(query)
            .sort({ callTime: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        const total = await CallLog.countDocuments(query);

        res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        console.error("GetCallLogsByPhone error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/calllogs/stats
 * Get call statistics (optional - for future analytics)
 */
exports.getCallStats = async (req, res) => {
    try {
        const { phone, startDate, endDate } = req.query;
        const userId = req.user?.userId;
        const companyId = req.user?.companyId;

        const query = { companyId, userId };

        if (phone) {
            query.phoneNumber = phone;
        }

        if (startDate || endDate) {
            query.callTime = {};
            if (startDate) {
                query.callTime.$gte = new Date(startDate);
            }
            if (endDate) {
                query.callTime.$lte = new Date(endDate);
            }
        }

        const stats = await CallLog.aggregate([
            { $match: query },
            {
                $group: {
                    _id: "$callType",
                    count: { $sum: 1 },
                    totalDuration: { $sum: "$callDuration" },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            stats,
        });
    } catch (err) {
        console.error("GetCallStats error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
