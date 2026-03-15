const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

const optionalAuth = async (req, _res, next) => {
  try {
    if (req.user && req.userId) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.userId) return next();

    const user = await User.findById(decoded.userId).select("company_id email mobile name role status").lean();
    if (!user) return next();

    req.userId = decoded.userId;
    req.user = user;
    return next();
  } catch (_e) {
    return next();
  }
};

module.exports = optionalAuth;

