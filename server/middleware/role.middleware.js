const SystemLog = require("../models/SystemLog");

const normalizeRole = (role) => (role || "").toString().toLowerCase();

const isSuperadmin = (role) => normalizeRole(role) === "superadmin";

const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
  if (normalizeRole(req.user.role) !== normalizeRole(role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  next();
};

const requireSuperadmin = requireRole("superadmin");

const logSuperadminRequest = async (req, _res, next) => {
  try {
    await SystemLog.create({
      userId: req.userId || null,
      action: `SUPERADMIN ${req.method} ${req.originalUrl}`,
      ip: req.ip,
      category: "api",
      metadata: {
        method: req.method,
        path: req.originalUrl,
        query: req.query || {},
      },
    });
  } catch (_err) {
    // Logging should not block request processing
  }
  next();
};

module.exports = {
  isSuperadmin,
  requireRole,
  requireSuperadmin,
  logSuperadminRequest,
};
