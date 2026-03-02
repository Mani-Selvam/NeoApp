const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Company = require("../models/Company");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendEmailOTP, sendMobileOTP } = require("../utils/otpService");
const firebaseAdmin = require("../config/firebaseAdmin");
const { verifyToken } = require("../middleware/auth");

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Temporary In-Memory OTP Store (For production use Redis or DB with TTL)
const otpStore = {};

// Validation helper
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 6;
};

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
};

// [NEW] Firebase Phone Login Endpoint
router.post("/login-phone", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res
        .status(400)
        .json({ success: false, message: "Firebase ID Token is required" });
    }

    // Verify the ID token
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
    const { phone_number, uid } = decodedToken;

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        message: "Invalid token: No phone number found",
      });
    }

    // Verified Firebase token for phone login (no server-side debug logs)

    // Check if user exists
    let user = await User.findOne({ mobile: phone_number });

    if (!user) {
      // Create a new user? Or require registration flow?
      // Usually, we create a partial user or just log them in if minimal info needed.
      // Let's create a placeholder user if they don't exist, OR fail if registration required.
      // For now, let's AUTO-REGISTER as per typical smooth onboarding.
      // Create a default company for this mobile user (personal tenant)
      const domain = `mobile_${phone_number}`;
      let company = await Company.findOne({ domain });
      if (!company) {
        company = await Company.create({
          name: `Personal ${phone_number}`,
          domain,
          plan: { type: "Starter", staffLimit: 1 },
        });
      }

      user = new User({
        mobile: phone_number,
        name: "Mobile User", // Placeholder
        email: `mobile_${phone_number}@example.com`, // Placeholder unique email
        password: uid, // Hook will hash this
        status: "Active",
        company_id: company._id,
        role: "Admin",
      });
      await user.save();
      // Created new user for phone login
    }

    if (user.status === "Inactive") {
      return res
        .status(403)
        .json({ success: false, message: "Account is inactive" });
    }

    // Generate JWT Token for OUR backend
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful via Firebase",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        status: user.status,
      },
      token,
    });
  } catch (error) {
    console.error("Firebase Login Error:", error);
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
});

// [NEW] Send OTP Endpoint
router.post("/send-otp", async (req, res) => {
  try {
    const { email, mobile, type, method } = req.body; // method: 'email', 'sms', 'whatsapp'
    // Received /send-otp request

    if (!email && !mobile) {
      return res
        .status(400)
        .json({ success: false, message: "Email or Mobile is required" });
    }

    const lookupEmail = email;
    const recordKey = email || mobile; // Use whichever is provided as key

    // Behavior depends on `type` of OTP request
    let existingUser = null;
    if (type === "forgot_password" || type === "edit_whatsapp_token") {
      // For password reset or token edit, the account must exist (global lookup)
      existingUser = await User.findOne({
        $or: [{ email: lookupEmail }, { mobile: mobile }],
      });
      if (!existingUser) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }
    } else if (type === "signup") {
      // For signup: avoid global blocking between companies.
      // If email provided, try to find a company by domain and only block if email exists within that company.
      if (email) {
        const domain = (email || "").split("@")[1];
        if (domain) {
          const company = await Company.findOne({ domain });
          if (company) {
            existingUser = await User.findOne({
              email: lookupEmail,
              company_id: company._id,
            });
            if (existingUser) {
              return res.status(409).json({
                success: false,
                message: "Email already registered. Please sign in.",
              });
            }
          }
        }
      }
      // If mobile-only signup or no company found for domain, allow signup to proceed (no global block)
    } else {
      // Generic send-otp for login or other flows: prefer sending to existing account if present (global lookup)
      existingUser = await User.findOne({
        $or: [{ email: lookupEmail }, { mobile: mobile }],
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const mobileToSend = mobile || existingUser?.mobile;
    const emailToSend = email || existingUser?.email;

    otpStore[recordKey] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };

    // OTP generated and dispatched (not echoed to client in production)

    let sent = false;
    if (!method || method === "email") {
      if (emailToSend) {
        await sendEmailOTP(emailToSend, otp);
        sent = true;
      }
    }

    if (!method || method === "sms" || method === "whatsapp") {
      if (mobileToSend) {
        // For now sendMobileOTP handles both. If specific 'whatsapp' or 'sms' logic needed,
        // it would be handled inside sendMobileOTP based on method if we pass it.
        await sendMobileOTP(mobileToSend, otp);
        sent = true;
      }
    }

    if (!sent) {
      return res.status(400).json({
        success: false,
        message: "No valid destination (email/mobile) found for OTP",
      });
    }

    res.json({
      success: true,
      message: `OTP sent successfully via ${method || "default channel"}.`,
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// [NEW] Verify OTP Endpoint
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, mobile, otp } = req.body;
    const key = email || mobile;

    if (!key || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email/Mobile and OTP are required" });
    }

    const record = otpStore[key];

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please resend.",
      });
    }

    if (Date.now() > record.expiresAt) {
      delete otpStore[key];
      return res
        .status(400)
        .json({ success: false, message: "OTP expired. Please resend." });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // OPTIONAL: Delete OTP after successful verification
    // delete otpStore[key];

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
});

// [NEW] Reset Password Endpoint
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Verify OTP again to ensure security
    const record = otpStore[email];
    if (!record) {
      return res.status(400).json({
        success: false,
        message: "OTP session expired. Please resend OTP.",
      });
    }
    if (record.otp !== otp) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP verifying reset" });
    }

    const user = await User.findOne({
      $or: [{ email }, { mobile: email }],
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Update Password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    // Clear OTP
    delete otpStore[email];

    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to reset password" });
  }
});

// [NEW] Check User Existence (No OTP)
router.post("/check-user", async (req, res) => {
  try {
    const { email, mobile } = req.body;

    if (email) {
      const userEmail = await User.findOne({ email });
      if (userEmail)
        return res
          .status(409)
          .json({ success: false, message: "Email already registered" });
    }

    if (mobile) {
      const userMobile = await User.findOne({ mobile });
      if (userMobile)
        return res.status(409).json({
          success: false,
          message: "Mobile number already registered",
        });
    }

    res.json({ success: true, message: "User available" });
  } catch (err) {
    console.error("Check User Error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error checking user" });
  }
});

// Register / Signup (Updated to remove OTP check if handled elsewhere, or keep it standard)
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, confirmPassword, mobile } = req.body;

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format" });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" });
    }

    // Check if user already exists
    let user = await User.findOne({ email }).maxTimeMS(5000);
    if (user) {
      return res.status(409).json({
        success: false,
        message: "Email already registered. Please sign in.",
      });
    }

    // Create a new Company for every new Admin signup to ensure strict isolation.
    // Using a unique domain value to avoid grouping by email domain.
    const uniqueDomain = `company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let company;
    const baseCompanyName = name || uniqueDomain;
    // First attempt: normal Mongoose create with logging on failure
    try {
      company = await Company.create({
        name: baseCompanyName,
        domain: uniqueDomain,
        plan: { type: "Starter", staffLimit: 5 },
      });
    } catch (err) {
      console.error(
        "Company.create failed (initial):",
        err && err.message ? err.message : err,
      );
      // If creation failed unexpectedly, fallback to a lookup by generated domain
      try {
        company = await Company.findOne({ domain: uniqueDomain });
      } catch (e) {
        console.error(
          "Company.findOne failed after create error:",
          e && e.message ? e.message : e,
        );
      }
    }

    // If company still not created/found, attempt a few more times with different suffixes
    if (!company) {
      for (let i = 0; i < 3 && !company; i++) {
        const altDomain = `${uniqueDomain}-${i}`;
        const altName = i === 0 ? baseCompanyName : `${baseCompanyName} ${i}`;
        try {
          company = await Company.create({
            name: altName,
            domain: altDomain,
            plan: { type: "Starter", staffLimit: 5 },
          });
          break;
        } catch (e) {
          console.error(
            `Company.create failed (attempt ${i}) for domain ${altDomain}:`,
            e && e.message ? e.message : e,
          );
          try {
            company = await Company.findOne({ domain: altDomain });
            if (company) break;
          } catch (e2) {
            console.error(
              `Company.findOne failed (attempt ${i}) for domain ${altDomain}:`,
              e2 && e2.message ? e2.message : e2,
            );
          }
        }
      }
    }

    // Last-resort: try inserting directly into the collection to bypass Mongoose hooks (avoiding silent failures)
    if (!company) {
      try {
        const insertDoc = {
          name: baseCompanyName,
          domain: uniqueDomain,
          plan: { type: "Starter", staffLimit: 5 },
          status: "Active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const result = await Company.collection.insertOne(insertDoc);
        if (result && result.insertedId) {
          company = await Company.findById(result.insertedId);
          console.warn(
            "Company inserted via raw collection.insertOne as fallback",
            result.insertedId,
          );
        }
      } catch (rawErr) {
        console.error(
          "Raw collection.insertOne failed (fallback):",
          rawErr && rawErr.message ? rawErr.message : rawErr,
        );
      }
    }

    if (!company) {
      console.error(
        "Failed to create or find company after multiple attempts for domain",
        uniqueDomain,
      );
      return res.status(500).json({
        success: false,
        message: "Failed to create company for this account",
      });
    }

    // Create new user tied to the company
    user = new User({
      name,
      email,
      password,
      mobile,
      role: "Admin",
      company_id: company ? company._id : undefined,
    });
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
      },
      token,
    });
  } catch (err) {
    console.error("Signup error:", err);

    // Check for MongoDB connection timeout
    if (err.name === "MongoTimeoutError" || err.message.includes("timed out")) {
      return res.status(503).json({
        success: false,
        message: "Database connection timeout. Please try again later.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format" });
    }

    // Find user by email
    const user = await User.findOne({ email }).maxTimeMS(5000);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found. Please sign up.",
      });
    }

    // Check if user status is Active
    if (user.status === "Inactive") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Contact your administrator.",
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        status: user.status,
        company_id: user.company_id,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);

    // Check for MongoDB connection timeout
    if (err.name === "MongoTimeoutError" || err.message.includes("timed out")) {
      return res.status(503).json({
        success: false,
        message: "Database connection timeout. Please try again later.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

// Verify Token (Optional - for protected routes)
router.get("/verify", (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      success: true,
      message: "Token is valid",
      userId: decoded.userId,
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

// verifyToken middleware removed and moved to shared middleware file

// Get current user profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password").lean();
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      message: "Profile retrieved successfully",
      user,
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

// Logout
router.post("/logout", verifyToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

module.exports = router;
