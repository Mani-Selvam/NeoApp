/**
 * callLogController.js
 * Handles all /api/calllogs routes
 *
 * UPDATED: Incoming calls filtered by enquiry validation
 * - Incoming: only from enquiry contact numbers
 * - Outgoing: all kept (user initiated)
 * - Missed/Rejected: all kept (relevant regardless)
 */
const CallLog = require("../models/CallLog");
const Enquiry = require("../models/Enquiry");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize phone: strip non-digits, keep last 10
 */
const normalizePhone = (value) =>
    String(value || "")
        .replace(/\D/g, "")
        .slice(-10);

/**
 * Escape a string for safe use inside a RegExp constructor.
 */
const escapeRegex = (str) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build uniqueKey for duplicate prevention
 */
const buildUniqueKey = (phoneNumber, callTime, callDuration) => {
    const ts =
        callTime instanceof Date
            ? callTime.getTime()
            : new Date(callTime).getTime();
    const phone = String(phoneNumber || "")
        .replace(/\D/g, "")
        .slice(-10);
    return `${phone}_${ts}_${callDuration}`;
};

/**
 * Build a set of enquiry phone suffixes (last-10 digits) for fast membership checks.
 * This avoids N DB queries (one per incoming call) during sync.
 */
const buildEnquiryPhoneSuffixSet = async (companyId, phoneSuffixes) => {
    const suffixSet = new Set();
    if (!companyId) return suffixSet;
    if (!Array.isArray(phoneSuffixes) || phoneSuffixes.length === 0)
        return suffixSet;

    const uniqueSuffixes = Array.from(
        new Set(phoneSuffixes.map((s) => String(s || "").trim()).filter(Boolean)),
    );
    if (uniqueSuffixes.length === 0) return suffixSet;

    const CHUNK = 50;
    for (let i = 0; i < uniqueSuffixes.length; i += CHUNK) {
        const chunk = uniqueSuffixes.slice(i, i + CHUNK);
        const pattern = new RegExp(`(${chunk.join("|")})$`);

        let enquiries = [];
        try {
            enquiries = await Enquiry.find({
                companyId: companyId,
                $or: [
                    { mobile: { $regex: pattern } },
                    { phoneNumber: { $regex: pattern } },
                    { phone: { $regex: pattern } },
                ],
            })
                .select("mobile phoneNumber phone")
                .lean();
        } catch (err) {
            console.warn(
                "[callLogController] buildEnquiryPhoneSuffixSet query failed:",
                err,
            );
            enquiries = [];
        }

        for (const enquiry of enquiries) {
            const mobile = normalizePhone(enquiry?.mobile);
            const phoneNumber = normalizePhone(enquiry?.phoneNumber);
            const phone = normalizePhone(enquiry?.phone);
            if (mobile) suffixSet.add(mobile);
            if (phoneNumber) suffixSet.add(phoneNumber);
            if (phone) suffixSet.add(phone);
        }
    }

    return suffixSet;
};

/**
 * Filter incoming calls: only keep those from known enquiries
 * Other call types: keep all (outgoing/missed/rejected are relevant regardless)
 */
const filterLogsBeforeSync = async (logs, companyId) => {
    if (!Array.isArray(logs)) return [];

    const incomingSuffixes = logs
        .filter((l) => l?.callType === "incoming")
        .map((l) => normalizePhone(l?.phoneNumber))
        .filter(Boolean);
    const enquirySuffixSet = await buildEnquiryPhoneSuffixSet(
        companyId,
        incomingSuffixes,
    );

    const filtered = [];

    for (const log of logs) {
        // Outgoing, Missed, Rejected → always keep
        if (log.callType !== "incoming") {
            filtered.push(log);
            continue;
        }

        // Incoming → check if from enquiry
        const normalized = normalizePhone(log.phoneNumber);
        if (normalized && enquirySuffixSet.has(normalized)) {
            filtered.push(log);
        } else {
            console.log(
                `[callLogController] Filtered incoming call from non-enquiry: ${log.phoneNumber}`,
            );
        }
    }

    return filtered;
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/calllogs/sync
 * Batch-insert call logs from the device (idempotent via uniqueKey).
 */
exports.syncDeviceLogs = async (req, res) => {
    try {
        const { logs } = req.body;
        const companyId = req.user?.company_id || req.user?.companyId;
        const userId = req.userId || req.user?.id || req.user?._id;

        if (!companyId || !userId) {
            return res
                .status(401)
                .json({ success: false, error: "Unauthorized" });
        }

        if (!Array.isArray(logs) || logs.length === 0) {
            return res.json({
                success: true,
                inserted: 0,
                duplicates: 0,
                filtered: 0,
            });
        }

        // FILTER: incoming calls by enquiry
        const filteredLogs = await filterLogsBeforeSync(logs, companyId);
        const skipped = logs.length - filteredLogs.length;

        if (filteredLogs.length === 0) {
            return res.json({
                success: true,
                inserted: 0,
                duplicates: 0,
                filtered: skipped,
                message: `All ${skipped} logs were filtered out (incoming calls from non-enquiries)`,
            });
        }

        let inserted = 0;
        let duplicates = 0;
        const errors = [];

        // Process in batches of 100 to avoid huge inserts
        const BATCH = 100;
        for (let i = 0; i < filteredLogs.length; i += BATCH) {
            const batch = filteredLogs.slice(i, i + BATCH);
            const docs = batch
                .filter((log) => {
                    if (!log?.phoneNumber || !log?.callTime) return false;
                    // Validate that callTime is a valid date
                    const testDate = new Date(log.callTime);
                    return !isNaN(testDate.getTime());
                })
                .map((log) => {
                    const callTime = new Date(log.callTime);
                    const callDuration = Number(
                        log.callDuration ?? log.duration ?? 0,
                    );
                    const phoneNumber = String(log.phoneNumber || "").trim();
                    const normalizedPhone = normalizePhone(phoneNumber);
                    const uniqueKey = buildUniqueKey(
                        phoneNumber,
                        callTime,
                        callDuration,
                    );

                    return {
                        companyId,
                        userId,
                        phoneNumber,
                        normalizedPhone,
                        callType: log.callType || "incoming",
                        callDuration,
                        callTime,
                        contactName: String(log.contactName || "").trim(),
                        source: log.source || "device",
                        uniqueKey,
                        syncedAt: new Date(),
                    };
                });

            if (docs.length === 0) continue;

            // insertMany with ordered:false so duplicates don't abort batch
            try {
                const result = await CallLog.insertMany(docs, {
                    ordered: false,
                    rawResult: true,
                });
                inserted += result.insertedCount || 0;
                duplicates += docs.length - (result.insertedCount || 0);
            } catch (err) {
                if (err.code === 11000 || err.name === "BulkWriteError") {
                    // Some or all were duplicates
                    const writeErrors = err.result?.result?.writeErrors || [];
                    const insertedInBatch =
                        err.result?.result?.nInserted ??
                        docs.length - writeErrors.length;
                    inserted += insertedInBatch;
                    duplicates += writeErrors.length;
                } else {
                    errors.push(err.message);
                }
            }
        }

        return res.json({
            success: true,
            inserted,
            duplicates,
            filtered: skipped,
            total: logs.length,
            message: `Processed ${logs.length} logs: ${inserted} inserted, ${duplicates} duplicates, ${skipped} filtered`,
            ...(errors.length > 0 ? { errors } : {}),
        });
    } catch (err) {
        console.error("[callLogController] syncDeviceLogs error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/calllogs/last-sync-time
 * Returns the most recent syncedAt for the authenticated user's company.
 */
exports.getLastSyncTime = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        const userId = req.userId || req.user?.id || req.user?._id;

        if (!companyId) {
            return res
                .status(401)
                .json({ success: false, error: "Unauthorized" });
        }

        const latest = await CallLog.findOne({ companyId, userId })
            .sort({ syncedAt: -1 })
            .select("syncedAt")
            .lean();

        return res.json({
            success: true,
            lastSyncTime: latest?.syncedAt?.getTime() || null,
        });
    } catch (err) {
        console.error("[callLogController] getLastSyncTime error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/calllogs
 * Fetch call logs for a phone number (last-10-digits normalized match).
 * Query params:
 *   phone     {string}  required
 *   callType  {string}  optional: incoming|outgoing|missed|rejected
 *   startDate {string}  optional ISO date
 *   endDate   {string}  optional ISO date
 *   page      {number}  default 1
 *   limit     {number}  default 50 (max 200)
 */
exports.getCallLogsByPhone = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        if (!companyId) {
            return res
                .status(401)
                .json({ success: false, error: "Unauthorized" });
        }

        const {
            phone,
            callType,
            startDate,
            endDate,
            page = 1,
            limit = 50,
        } = req.query;

        if (!phone) {
            return res.status(400).json({
                success: false,
                error: "phone query parameter is required",
            });
        }

        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) {
            return res
                .status(400)
                .json({ success: false, error: "Invalid phone number" });
        }

        const pg = Math.max(1, Number(page) || 1);
        const lim = Math.min(200, Math.max(1, Number(limit) || 50));

        // Optimized query using normalizedPhone index
        const escaped = escapeRegex(normalizedPhone);
        const suffixRegex = new RegExp(escaped + "$");
        const query = {
            companyId,
            $or: [
                { normalizedPhone: normalizedPhone },
                { phoneNumber: normalizedPhone },
                { phoneNumber: suffixRegex },
            ],
        };

        if (
            callType &&
            ["incoming", "outgoing", "missed", "rejected"].includes(callType)
        ) {
            query.callType = callType;
        }

        if (startDate || endDate) {
            query.callTime = {};
            if (startDate) query.callTime.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.callTime.$lte = end;
            }
        }

        const [total, data] = await Promise.all([
            CallLog.countDocuments(query),
            CallLog.find(query)
                .sort({ callTime: -1 })
                .skip((pg - 1) * lim)
                .limit(lim)
                .lean(),
        ]);

        return res.json({
            success: true,
            data,
            pagination: {
                total,
                page: pg,
                limit: lim,
                pages: Math.ceil(total / lim),
            },
        });
    } catch (err) {
        console.error("[callLogController] getCallLogsByPhone error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/calllogs/stats
 * Aggregate call stats by type for a given phone + date range.
 */
exports.getCallStats = async (req, res) => {
    try {
        const companyId = req.user?.company_id || req.user?.companyId;
        if (!companyId) {
            return res
                .status(401)
                .json({ success: false, error: "Unauthorized" });
        }

        const { phone, startDate, endDate } = req.query;

        const matchStage = { companyId };

        if (phone) {
            const normalizedPhone = normalizePhone(phone);
            const escaped = escapeRegex(normalizedPhone);
            matchStage.$or = [
                { phoneNumber: normalizedPhone },
                { phoneNumber: new RegExp(escaped + "$") },
            ];
        }

        if (startDate || endDate) {
            matchStage.callTime = {};
            if (startDate) matchStage.callTime.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.callTime.$lte = end;
            }
        }

        const stats = await CallLog.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$callType",
                    count: { $sum: 1 },
                    totalDuration: { $sum: "$callDuration" },
                    avgDuration: { $avg: "$callDuration" },
                },
            },
        ]);

        const result = { incoming: 0, outgoing: 0, missed: 0, rejected: 0 };
        const durations = { incoming: 0, outgoing: 0, missed: 0, rejected: 0 };

        for (const s of stats) {
            if (result[s._id] !== undefined) {
                result[s._id] = s.count;
                durations[s._id] = s.totalDuration;
            }
        }

        return res.json({
            success: true,
            counts: result,
            totalDuration: durations,
            total: Object.values(result).reduce((a, b) => a + b, 0),
        });
    } catch (err) {
        console.error("[callLogController] getCallStats error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};
