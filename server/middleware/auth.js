const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// ⚡ In-memory user cache — avoids MongoDB query on EVERY request
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedUser = (userId) => {
    const cached = userCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
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

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // Try cache first — saves ~200-400ms per request on cloud MongoDB
        let user = getCachedUser(decoded.userId);
        if (!user) {
            user = await User.findById(decoded.userId).select("-password").lean();
            if (!user) {
                return res.status(401).json({ success: false, message: "User not found" });
            }
            setCachedUser(decoded.userId, user);
        }

        if (user.status === "Inactive") {
            clearUserCache(decoded.userId);
            return res.status(403).json({ success: false, message: "Account is inactive" });
        }

        req.userId = decoded.userId;
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

module.exports = { verifyToken, clearUserCache };
