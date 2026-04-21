/**
 * callLogRoutes.js
 * All routes require a valid auth token (verifyToken middleware).
 *
 * IMPORTANT: specific GET paths (/stats, /last-sync-time) MUST be declared
 * BEFORE the generic GET / route, otherwise Express matches / first and
 * the named routes are never reached.
 */
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const callLogController = require("../controllers/callLogController");

// ── Auth guard on all routes ──────────────────────────────────────────────────
router.use(verifyToken);

// ── POST /api/calllogs/sync ───────────────────────────────────────────────────
/**
 * Batch-sync device call logs (idempotent — duplicates are silently ignored).
 * Body: { logs: [{phoneNumber, callType, callDuration, callTime, contactName}] }
 * Response: { success, inserted, duplicates, total }
 */
router.post("/sync", callLogController.syncDeviceLogs);

// ── GET /api/calllogs/last-sync-time ─────────────────────────────────────────
/**
 * Returns the timestamp of the most recent sync for incremental syncing.
 * Response: { success, lastSyncTime: <ms timestamp | null> }
 */
router.get("/last-sync-time", callLogController.getLastSyncTime);

// ── GET /api/calllogs/stats ───────────────────────────────────────────────────
/**
 * Aggregate call counts and total durations per type.
 * Query: phone?, startDate?, endDate?
 * Response: { success, counts: {incoming,outgoing,missed,rejected}, totalDuration, total }
 */
router.get("/stats", callLogController.getCallStats);

// ── GET /api/calllogs ─────────────────────────────────────────────────────────
/**
 * Paginated call logs for a phone number, filtered by type / date range.
 * Query: phone (required), callType?, startDate?, endDate?, page?, limit?
 * Response: { success, data: [], pagination: {total, page, limit, pages} }
 */
router.get("/", callLogController.getCallLogsByPhone);

module.exports = router;
