const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const callLogController = require("../controllers/callLogController");

// All routes require authentication
router.use(verifyToken);

/**
 * POST /api/calllogs/sync
 * Batch sync device call logs
 * Body: { logs: [{phoneNumber, callType, callDuration, callTime, contactName}, ...] }
 */
router.post("/sync", callLogController.syncDeviceLogs);

/**
 * GET /api/calllogs/last-sync-time
 * Get last sync timestamp for incremental syncs
 */
router.get("/last-sync-time", callLogController.getLastSyncTime);

/**
 * GET /api/calllogs
 * Get call logs by phone number
 * Query: phone (required), callType, startDate, endDate, page, limit
 */
router.get("/", callLogController.getCallLogsByPhone);

/**
 * GET /api/calllogs/stats
 * Get call statistics (optional)
 * Query: phone, startDate, endDate
 */
router.get("/stats", callLogController.getCallStats);

module.exports = router;
