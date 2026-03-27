const { ensureEnvLoaded } = require("../config/loadEnv");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Company = require("../models/Company");

ensureEnvLoaded();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

const JWT_SECRET = process.env.JWT_SECRET;
const WEB_AUTH_COOKIE_NAME = process.env.WEB_AUTH_COOKIE_NAME || "neoapp_web_token";

// ⚡ In-memory user cache — avoids MongoDB query on EVERY request
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Company status cache (keeps auth fast while still allowing instant invalidation)
const companyCache = new Map();
const COMPANY_CACHE_TTL = 60 * 1000; // 60 seconds

const getCachedUser = (userId) => {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  userCache.delete(userId); // Expired
  return null;
};

const setCachedUser = (userId, user) => {
  userCache.set(userId, { user, timestamp: Date.now() });
};

// Clear cache for a specific user (call on logout/update)
const clearUserCache = (userId) => {
  if (userId) userCache.delete(userId.toString());
};

const getCachedCompanyStatus = (companyId) => {
  const key = companyId?.toString?.() || String(companyId || "");
  if (!key) return null;
  const cached = companyCache.get(key);
  if (cached && Date.now() - cached.timestamp < COMPANY_CACHE_TTL)
    return cached.status;
  companyCache.delete(key);
  return null;
};

const setCachedCompanyStatus = (companyId, status) => {
  const key = companyId?.toString?.() || String(companyId || "");
  if (!key) return;
  companyCache.set(key, { status, timestamp: Date.now() });
};

const clearCompanyCache = (companyId) => {
  const key = companyId?.toString?.() || String(companyId || "");
  if (!key) return;
  companyCache.delete(key);
};

const getCompanyStatus = async (companyId) => {
  const cached = getCachedCompanyStatus(companyId);
  if (cached) return cached;
  const company = await Company.findById(companyId).select("status").lean();
  const status = company?.status || null;
  if (status) setCachedCompanyStatus(companyId, status);
  return status;
};

const verifyToken = async (req, res, next) => {
  try {
    if (req.user && req.userId) return next();

    const authHeader = req.headers.authorization;
    const cookieHeader = String(req.headers.cookie || "");
    const cookieToken = cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${WEB_AUTH_COOKIE_NAME}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : "";
    const token = bearerToken || decodeURIComponent(cookieToken || "");

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });

    // Try cache first — saves ~200-400ms per request on cloud MongoDB
    let user = getCachedUser(decoded.userId);
    if (!user) {
      user = await User.findById(decoded.userId).select("-password").lean();
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }
      setCachedUser(decoded.userId, user);
    }

    if (user.status === "Inactive") {
      clearUserCache(decoded.userId);
      return res
        .status(403)
        .json({ success: false, message: "Account is inactive" });
    }

    const role = String(user.role || "").toLowerCase();
    const companyId = user.company_id ? user.company_id.toString() : "";
    if (role !== "superadmin" && companyId) {
      const companyStatus = await getCompanyStatus(companyId);
      if (!companyStatus) {
        clearUserCache(decoded.userId);
        return res.status(403).json({
          success: false,
          message: "Company not found",
          error: "Company not found",
          code: "COMPANY_NOT_FOUND",
        });
      }

      if (companyStatus !== "Active") {
        clearUserCache(decoded.userId);
        const message =
          companyStatus === "Suspended"
            ? "Company is suspended"
            : "Company is not active";
        return res.status(403).json({
          success: false,
          message,
          error: message,
          code: "COMPANY_NOT_ACTIVE",
          companyStatus,
        });
      }
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = {
  verifyToken,
  clearUserCache,
  clearCompanyCache,
  WEB_AUTH_COOKIE_NAME,
};
