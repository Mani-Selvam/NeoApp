const express = require("express");
const router = express.Router();
const CallLog = require("../models/CallLog");
const CallSession = require("../models/CallSession");
const Enquiry = require("../models/Enquiry");
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const mongoose = require("mongoose");
const cache = require("../utils/responseCache");

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const buildLooseDigitRegex = (digits = "") => {
    const clean = String(digits).replace(/\D/g, "");
    if (!clean) return null;
    const pattern = clean.split("").join("\\D*");
    return new RegExp(`${pattern}\\D*$`);
};

const buildPhoneMatchOr = (cleanNumber, fields = ["mobile", "altMobile"]) => {
    const clean = String(cleanNumber || "").replace(/\D/g, "");
    if (!clean) return [];
    const short = clean.length > 10 ? clean.slice(-10) : clean;
    const candidates = uniq([clean, short, `0${short}`, `91${short}`]);
    const clauses = [];
    for (const field of fields) {
        for (const candidate of candidates) {
            const rx = buildLooseDigitRegex(candidate);
            if (rx) clauses.push({ [field]: { $regex: rx } });
        }
    }
    return clauses;
};

const findEnquiryByPhone = async (baseQuery = {}, cleanNumber = "") => {
    const phoneOr = buildPhoneMatchOr(cleanNumber);
    if (!phoneOr.length) return null;
    return Enquiry.findOne({
        ...baseQuery,
        $or: phoneOr,
    })
        .select("_id name enqNo status userId mobile image product enqBy")
        .lean();
};

const toRoomId = (id) => {
    if (!id) return null;
    return id.toString();
};

const emitCallLogCreated = (req, log, ownerId, staffId) => {
    const io = req.app.get("io");
    if (!io) return;

    const payload = typeof log?.toObject === "function" ? log.toObject() : log;
    const roomIds = new Set(
        [toRoomId(ownerId), toRoomId(staffId)].filter(Boolean),
    );

    roomIds.forEach((roomId) => {
        io.to(`user:${roomId}`).emit("CALL_LOG_CREATED", payload);
    });
};

const emitCallLogRefresh = (req, ownerId, staffId, syncedCount = 0) => {
    const io = req.app.get("io");
    if (!io) return;

    const roomIds = new Set(
        [toRoomId(ownerId), toRoomId(staffId)].filter(Boolean),
    );
    const payload = {
        type: "BATCH_SYNC",
        synced: syncedCount,
        at: new Date(),
    };

    roomIds.forEach((roomId) => {
        io.to(`user:${roomId}`).emit("CALL_LOG_REFRESH", payload);
    });
};

const emitCallSessionUpdated = (req, session, ownerId, staffId) => {
    const io = req.app.get("io");
    if (!io) return;

    const payload =
        typeof session?.toObject === "function" ? session.toObject() : session;
    const roomIds = new Set(
        [toRoomId(ownerId), toRoomId(staffId)].filter(Boolean),
    );

    roomIds.forEach((roomId) => {
        io.to(`user:${roomId}`).emit("CALL_SESSION_UPDATED", payload);
    });
};

const normalizeCallType = (raw) => {
    const value = String(raw || "")
        .trim()
        .toLowerCase();
    if (!value) return null;
    if (
        value === "1" ||
        value.includes("incoming") ||
        value.includes("received") ||
        value.includes("inbound") ||
        value.includes("answered")
    ) {
        return "Incoming";
    }
    if (
        value === "2" ||
        value.includes("outgoing") ||
        value.includes("dialed") ||
        value.includes("outbound")
    ) {
        return "Outgoing";
    }
    if (
        value === "3" ||
        value.includes("missed") ||
        value.includes("unanswered")
    ) {
        return "Missed";
    }
    if (value.includes("rejected") || value.includes("blocked"))
        return "Missed";
    if (value.includes("notattended") || value.includes("not attended"))
        return "Not Attended";
    return null;
};

const pickDigits = (entry) => {
    const raw =
        entry?.phoneNumber ||
        entry?.number ||
        entry?.formattedNumber ||
        entry?.mobile ||
        "";
    const digits = String(raw).replace(/\D/g, "");
    return digits || "";
};

const pickCallTimeMs = (entry) => {
    const raw =
        entry?.callDateTime ||
        entry?.timestamp ||
        entry?.dateTime ||
        entry?.date ||
        entry?.time ||
        entry?.callTime ||
        "";
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Date.now();
};

const pickDurationSeconds = (entry) => {
    const raw =
        entry?.callDuration ??
        entry?.duration ??
        entry?.durationSeconds ??
        entry?.dur ??
        0;
    const asNum = Number(raw);
    return Number.isFinite(asNum) && asNum > 0 ? Math.floor(asNum) : 0;
};

const pickDeviceLogId = (entry, digits, callTimeMs, callType) => {
    const id =
        entry?.id ||
        entry?._id ||
        entry?.callId ||
        entry?.callID ||
        entry?.callLogId ||
        "";
    if (id) return String(id);
    if (!digits || !callTimeMs) return "";
    return `${digits}:${callTimeMs}:${callType || ""}`;
};

const normalizeDeviceCallId = (raw) => {
    if (raw == null) return undefined;
    const value = String(raw).trim();
    return value ? value : undefined;
};

const pickRequestDeviceCallId = (req) =>
    normalizeDeviceCallId(
        req.body?.deviceCallId ??
            req.body?.deviceLogId ??
            req.body?.callLogId ??
            req.body?.id,
    );

const getOwnerId = (req) =>
    req.user.role === "Staff" && req.user.parentUserId
        ? req.user.parentUserId
        : req.userId;

const toLocalIsoDate = (value = new Date()) => {
    const dt = value instanceof Date ? value : new Date(value);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const buildEnquiryLookupScope = (req) => {
    if (req.user.role === "Staff" && req.user.parentUserId) {
        return {
            userId: req.user.parentUserId,
            assignedTo: req.userId,
        };
    }
    return { userId: req.userId };
};

// GET ALL CALL LOGS (With Search/Filter & Pagination)
router.post("/debug", (req, res) => {
    console.log(`📡 [DEBUG] Call Monitor Sync:`, req.body);
    res.sendStatus(200);
});

router.post("/session", verifyToken, async (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        const cleanNum = String(req.body.phoneNumber || "").replace(/\D/g, "");

        if (!cleanNum) {
            return res.status(400).json({ message: "Invalid phone number" });
        }

        let linkedEnquiryId = req.body.enquiryId || null;
        let contactName = req.body.contactName || "";

        if (!linkedEnquiryId) {
            const existingEnquiry = await findEnquiryByPhone(
                buildEnquiryLookupScope(req),
                cleanNum,
            );
            if (existingEnquiry) {
                linkedEnquiryId = existingEnquiry._id;
                if (!contactName) contactName = existingEnquiry.name;
            }
        }

        const session = await CallSession.create({
            userId: ownerId,
            staffId: req.userId,
            enquiryId: linkedEnquiryId,
            phoneNumber: cleanNum,
            contactName,
            businessNumber:
                req.user.mobile ||
                req.body.businessNumber ||
                process.env.PHONE_NUMBER ||
                "",
            direction:
                req.body.direction === "Incoming" ? "Incoming" : "Outgoing",
            status: req.body.status || "dialing",
            controls: {
                muted: !!req.body.controls?.muted,
                speaker: !!req.body.controls?.speaker,
                onHold: !!req.body.controls?.onHold,
                keypadVisible: !!req.body.controls?.keypadVisible,
                keypadDigits: req.body.controls?.keypadDigits || "",
                lastDtmf: req.body.controls?.lastDtmf || "",
                nativeSupported: !!req.body.controls?.nativeSupported,
                nativeApplied: !!req.body.controls?.nativeApplied,
            },
            startedAt: req.body.startedAt || new Date(),
            lastEventAt: new Date(),
            events: [
                { type: "SESSION_CREATED", meta: { source: "mobile_ui" } },
            ],
        });

        emitCallSessionUpdated(req, session, ownerId, req.userId);
        res.status(201).json(session);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.patch("/session/:id/control", verifyToken, async (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        const {
            action,
            value,
            digits,
            nativeApplied,
            nativeSupported,
            status,
        } = req.body;

        const session = await CallSession.findOne({
            _id: req.params.id,
            userId: ownerId,
        });

        if (!session) {
            return res.status(404).json({ message: "Call session not found" });
        }

        const nextControls = {
            muted: !!session.controls?.muted,
            speaker: !!session.controls?.speaker,
            onHold: !!session.controls?.onHold,
            keypadVisible: !!session.controls?.keypadVisible,
            keypadDigits: session.controls?.keypadDigits || "",
            lastDtmf: session.controls?.lastDtmf || "",
            nativeSupported: !!session.controls?.nativeSupported,
            nativeApplied: !!session.controls?.nativeApplied,
        };
        const eventMeta = {};

        if (typeof nativeApplied === "boolean") {
            nextControls.nativeApplied = nativeApplied;
            eventMeta.nativeApplied = nativeApplied;
        }
        if (typeof nativeSupported === "boolean") {
            nextControls.nativeSupported = nativeSupported;
            eventMeta.nativeSupported = nativeSupported;
        }

        switch (action) {
            case "mute":
                nextControls.muted = !!value;
                break;
            case "speaker":
                nextControls.speaker = !!value;
                break;
            case "hold":
                nextControls.onHold = !!value;
                break;
            case "keypad":
                nextControls.keypadVisible = !!value;
                break;
            case "dtmf":
                nextControls.lastDtmf = String(value || digits || "");
                nextControls.keypadDigits =
                    `${nextControls.keypadDigits}${String(value || digits || "")}`.slice(
                        -64,
                    );
                break;
            default:
                return res
                    .status(400)
                    .json({ message: "Unsupported control action" });
        }

        session.controls = nextControls;
        if (status) {
            session.status = status;
        } else if (action === "hold") {
            session.status = value ? "held" : "active";
        } else if (session.status === "dialing") {
            session.status = "active";
            session.answeredAt = session.answeredAt || new Date();
        }

        session.lastEventAt = new Date();
        session.events.push({
            type: `CONTROL_${String(action || "").toUpperCase()}`,
            value: value ?? digits ?? null,
            meta: eventMeta,
        });

        await session.save();
        emitCallSessionUpdated(req, session, ownerId, req.userId);
        res.json(session);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post("/session/:id/end", verifyToken, async (req, res) => {
    try {
        const ownerId = getOwnerId(req);
        const session = await CallSession.findOne({
            _id: req.params.id,
            userId: ownerId,
        });

        if (!session) {
            return res.status(404).json({ message: "Call session not found" });
        }

        const endedAt = req.body.endedAt
            ? new Date(req.body.endedAt)
            : new Date();
        session.endedAt = endedAt;
        session.endReason = req.body.reason || session.endReason || "completed";
        session.duration =
            typeof req.body.duration === "number"
                ? req.body.duration
                : Math.max(
                      0,
                      Math.floor(
                          (endedAt - new Date(session.startedAt)) / 1000,
                      ),
                  );
        session.status =
            req.body.status ||
            (session.endReason === "dismissed" ? "dismissed" : "ended");
        session.lastEventAt = endedAt;
        session.events.push({
            type: "SESSION_ENDED",
            value: session.endReason,
            meta: {
                duration: session.duration,
                callType: req.body.callType || null,
            },
        });

        await session.save();
        emitCallSessionUpdated(req, session, ownerId, req.userId);
        res.json(session);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// WEBHOOK FOR EXTERNAL SERVICES (Twilio, Evolution API, etc.)
router.post("/webhook", async (req, res) => {
    try {
        const { from, to, type, duration, timestamp } = req.body;
        console.log(`📥 Incoming Call Webhook: From ${from} To ${to}`);

        if (!from)
            return res.status(400).json({ message: "Missing 'from' number" });

        // Normalize number
        const cleanFrom = from.replace(/\D/g, "");
        // Try to find enquiry that has a valid userId (Flexible lookup)
        const enquiry = await findEnquiryByPhone(
            { userId: { $ne: null } },
            cleanFrom,
        );

        // Only attach call log to a tenant when we can deterministically find the tenant
        // (via an Enquiry linked to a User). Avoid falling back to a global Admin —
        // that causes cross-tenant assignment and data leakage between companies.
        let targetUserId = null;
        if (enquiry && enquiry.userId) {
            targetUserId = enquiry.userId;
        } else {
            console.warn(
                "⚠️ [Webhook] No matching enquiry; cannot determine tenant for incoming call. Skipping assignment.",
            );
            return res.status(200).json({
                success: false,
                message:
                    "No target user found for this call (no tenant matched)",
            });
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
            note: `Auto-logged from Webhook to ${to || "Business Number"}`,
            isPendingCallback: type === "Missed",
        });

        await newLog.save();

        if (enquiry?._id) {
            await Enquiry.findByIdAndUpdate(enquiry._id, {
                $set: { lastContactedAt: newLog.callTime },
                $inc: { callCount: 1 },
            }).catch(() => null);
        }
        cache.invalidate("dashboard");
        cache.invalidate("enquiries");

        // Emit to owner/staff rooms only (tenant-safe)
        emitCallLogCreated(req, newLog, targetUserId, targetUserId);

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
        query.isPersonal = { $ne: true };

        // Filter by Search Query (Name or Number)
        const { search } = req.query;
        if (search) {
            query.$or = [
                { phoneNumber: { $regex: search, $options: "i" } },
                { contactName: { $regex: search, $options: "i" } },
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
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// BATCH SYNC FROM MOBILE DEVICE
router.post("/sync-batch", verifyToken, async (req, res) => {
    try {
        const { logs } = req.body;
        if (!Array.isArray(logs))
            return res.status(400).json({ message: "Invalid logs format" });

        const ownerId = getOwnerId(req);

        console.log(
            `📡 [Sync] Processing ${logs.length} logs for User: ${req.userId}`,
        );

        let syncCount = 0;
        let skippedCount = 0;

        for (const log of logs) {
            const cleanNum = pickDigits(log);
            if (!cleanNum) continue;

            // 🔒 SECURITY/PRIVACY CHECK: Only sync if number exists in Enquiry DB
            const existingEnquiry = await findEnquiryByPhone(
                buildEnquiryLookupScope(req),
                cleanNum,
            );

            if (!existingEnquiry) {
                skippedCount++;
                continue; // Skip personal/non-enquiry calls
            }

            // Check if this log ID already exists to prevent duplicates
            const rawCallType =
                log.callType ||
                log.type ||
                log.callTypeName ||
                log.cachedType ||
                "";
            const callTimeMs = pickCallTimeMs(log);
            const deviceLogId = pickDeviceLogId(
                log,
                cleanNum,
                callTimeMs,
                rawCallType,
            );

            const existingLog = await CallLog.findOne({
                userId: ownerId,
                id: deviceLogId,
            });

            if (existingLog) continue;

            // determine proper call type rather than blindly defaulting
            let callTypeToSave = normalizeCallType(rawCallType);
            if (!callTypeToSave) {
                // if device didn't supply a type we can infer based on duration
                const dur = pickDurationSeconds(log);
                callTypeToSave = dur > 0 ? "Incoming" : "Missed";
            }

            const durationSeconds = pickDurationSeconds(log);

            const newLog = new CallLog({
                userId: ownerId,
                staffId: req.userId,
                id: deviceLogId,
                phoneNumber: cleanNum,
                contactName: existingEnquiry.name,
                enquiryId: existingEnquiry._id,
                callType: callTypeToSave,
                duration: durationSeconds,
                callTime: new Date(callTimeMs),
                isVideoCall: !!log.isVideoCall,
                simSlot:
                    log.simSlot ||
                    log.phoneAccountId ||
                    log.subscriptionId ||
                    log.sim_id ||
                    "",
                isRead: log.isRead !== false,
                countryCode: log.countryCode,
                note: `Synced from Device (${rawCallType || "unknown"})`,
            });

            await newLog.save();
            syncCount++;

            // Keep enquiry contact status in sync with device logs
            try {
                const shouldMarkContacted =
                    ["Incoming", "Outgoing"].includes(callTypeToSave) &&
                    Number(durationSeconds || 0) > 0;
                const contactAt = new Date(callTimeMs);

                await Enquiry.findOneAndUpdate(
                    { _id: existingEnquiry._id, status: { $ne: "Converted" } },
                    {
                        $set: {
                            lastContactedAt: contactAt,
                            ...(shouldMarkContacted
                                ? { status: "Contacted" }
                                : {}),
                        },
                        $inc: { callCount: 1 },
                    },
                );

                if (shouldMarkContacted) {
                    await CallLog.updateMany(
                        {
                            userId: ownerId,
                            enquiryId: existingEnquiry._id,
                            isPendingCallback: true,
                        },
                        {
                            $set: {
                                isPendingCallback: false,
                                lastContactedAt: contactAt,
                            },
                        },
                    );
                }
            } catch (_e) {
                // ignore per-log status sync errors
            }
        }

        console.log(
            `✅ [Sync] Finished: ${syncCount} saved, ${skippedCount} ignored (personal)`,
        );

        // Batch sync can add many rows; emit one refresh event instead of N toasts.
        if (syncCount > 0) {
            emitCallLogRefresh(req, ownerId, req.userId, syncCount);
        }

        res.json({ success: true, synced: syncCount, ignored: skippedCount });
    } catch (err) {
        console.error("Batch Sync Error:", err);
        res.status(500).json({ message: err.message });
    }
});

// LOG A NEW CALL
router.post("/", verifyToken, async (req, res) => {
	    try {
	        const { phoneNumber, callType, duration, note, enquiryId, callTime } =
	            req.body;

	        const ownerId = getOwnerId(req);

	        const cleanNum = (phoneNumber || "").replace(/\D/g, "");
	        if (!cleanNum)
	            return res.status(400).json({ message: "Invalid phone number" });

	        const deviceCallId = pickRequestDeviceCallId(req);
	        if (deviceCallId) {
	            const existingByDeviceId = await CallLog.findOne({
	                userId: ownerId,
	                id: deviceCallId,
	            }).lean();
	            if (existingByDeviceId) {
	                return res.status(200).json({
	                    ...existingByDeviceId,
	                    deduped: true,
	                });
	            }
	        }

	        // Try to find an existing enquiry for this phone number if not provided
	        let linkedEnquiryId = enquiryId;
	        let contactName = req.body.contactName;
	        const normalizedCallType = normalizeCallType(callType) || callType;

        if (!linkedEnquiryId) {
            const existingEnquiry = await findEnquiryByPhone(
                buildEnquiryLookupScope(req),
                cleanNum,
            );

            if (existingEnquiry) {
                linkedEnquiryId = existingEnquiry._id;
                contactName = existingEnquiry.name;
            }
        }

        if (!linkedEnquiryId) {
            return res.status(202).json({
                success: false,
                ignored: true,
                reason: "NO_ENQUIRY_MATCH",
                message:
                    "Ignored call log because number is not mapped to any enquiry",
            });
        }

        // De-dupe: avoid double entries when both CallMonitorService auto-logs and a screen logs the same call
        try {
            const rawCallTime = callTime ? new Date(callTime) : new Date();
            const callTimeMs = Number.isFinite(rawCallTime?.getTime?.())
                ? rawCallTime.getTime()
                : Date.now();
            const windowMs = 2 * 60 * 1000;

            const existing = await CallLog.findOne({
                userId: ownerId,
                enquiryId: linkedEnquiryId,
                phoneNumber: cleanNum,
                callType: normalizedCallType,
                callTime: {
                    $gte: new Date(callTimeMs - windowMs),
                    $lte: new Date(callTimeMs + windowMs),
                },
                isPersonal: { $ne: true },
            }).sort({ callTime: -1 });

            if (existing) {
                return res.status(200).json({
                    ...existing.toObject(),
                    deduped: true,
                });
            }
        } catch (_dedupeErr) {
            // do not block logging on dedupe failures
        }

	        const newCallLog = new CallLog({
	            userId: ownerId,
	            staffId: req.userId,
	            id: deviceCallId,
	            phoneNumber: cleanNum,
	            contactName,
	            enquiryId: linkedEnquiryId,
	            callType: normalizedCallType,
	            duration: duration || 0,
            businessNumber:
                req.user.mobile ||
                req.body.businessNumber ||
                process.env.PHONE_NUMBER,
            note,
            callTime: callTime || new Date(),
            followUpCreated: req.body.followUpCreated || false,
	            isPendingCallback: normalizedCallType === "Missed",
	            isPersonal: false,
	        });

	        let savedLog;
	        try {
	            savedLog = await newCallLog.save();
	        } catch (e) {
	            if (deviceCallId && e?.code === 11000) {
	                const existingByDeviceId = await CallLog.findOne({
	                    userId: ownerId,
	                    id: deviceCallId,
	                });
	                if (existingByDeviceId) {
	                    return res.status(200).json({
	                        ...existingByDeviceId.toObject(),
	                        deduped: true,
	                    });
	                }
	            }
	            throw e;
	        }

	        emitCallLogCreated(req, savedLog, ownerId, req.userId);

        // If linked to an enquiry, update the enquiry's last contacted timestamp
        if (linkedEnquiryId) {
            const now = new Date();
            const dur = Number(savedLog?.duration || 0);
            const shouldMarkContacted =
                ["Incoming", "Outgoing"].includes(savedLog?.callType) && dur > 0;

            await Enquiry.findOneAndUpdate(
                { _id: linkedEnquiryId, status: { $ne: "Converted" } },
                {
                    $set: {
                        lastContactedAt: now,
                        ...(shouldMarkContacted ? { status: "Contacted" } : {}),
                    },
                    $inc: { callCount: 1 },
                },
            );

            // If we successfully contacted the customer, clear pending callbacks
            if (shouldMarkContacted) {
                await CallLog.updateMany(
                    {
                        userId: ownerId,
                        enquiryId: linkedEnquiryId,
                        isPendingCallback: true,
                    },
                    { $set: { isPendingCallback: false, lastContactedAt: now } },
                );
            }
        }
        cache.invalidate("dashboard");
        cache.invalidate("enquiries");

        res.status(201).json(savedLog);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// GET CALL STATS/REPORTS
router.get("/stats", verifyToken, async (req, res) => {
    try {
        const { filter } = req.query;
        const ownerId = getOwnerId(req);

        let matchQuery = {
            userId: new mongoose.Types.ObjectId(ownerId),
            isPersonal: { $ne: true },
        };

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
                        incoming: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$callType", "Incoming"] },
                                    1,
                                    0,
                                ],
                            },
                        },
                        outgoing: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$callType", "Outgoing"] },
                                    1,
                                    0,
                                ],
                            },
                        },
                        missed: {
                            $sum: {
                                $cond: [{ $eq: ["$callType", "Missed"] }, 1, 0],
                            },
                        },
                        avgDuration: { $avg: "$duration" },
                        totalDuration: { $sum: "$duration" },
                        todayCalls: {
                            $sum: {
                                $cond: [{ $gte: ["$callTime", today] }, 1, 0],
                            },
                        },
                    },
                },
            ]),
            CallLog.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(ownerId),
                        isPersonal: { $ne: true },
                    },
                },
                {
                    $group: {
                        _id: "$staffId",
                        count: { $sum: 1 },
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "staffInfo",
                    },
                },
                { $unwind: "$staffInfo" },
                {
                    $project: {
                        name: "$staffInfo.name",
                        count: 1,
                    },
                },
            ]),
        ]);

        res.json({
            summary: statsResult[0] || {
                totalCalls: 0,
                todayCalls: 0,
                incoming: 0,
                outgoing: 0,
                missed: 0,
                avgDuration: 0,
            },
            staffActivity,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// IDENTIFY CALLER
router.get("/identify/:phoneNumber", verifyToken, async (req, res) => {
    try {
        const ownerId = getOwnerId(req);

        const cleanNum = req.params.phoneNumber.replace(/\D/g, "");
        const enquiry = await findEnquiryByPhone({ userId: ownerId }, cleanNum);

        if (enquiry) {
            res.json({
                found: true,
                details: {
                    name: enquiry.name,
                    enqNo: enquiry.enqNo,
                    status: enquiry.status,
                },
            });
        } else {
            res.json({ found: false });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
