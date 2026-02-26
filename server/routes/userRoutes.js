const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { verifyToken } = require("../middleware/auth");
const { sendEmailOTP, sendMobileOTP } = require("../utils/otpService");
const { clearUserCache } = require("../middleware/auth");
const cache = require("../utils/responseCache");

const otpStore = {}; // Memory store for profile changes

// Simple OTP generator
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// 1. GET PROFILE
router.get("/profile", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password").lean();
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. UPDATE BASIC PROFILE (Name, Logo)
router.put("/profile", verifyToken, async (req, res) => {
    try {
        const { name, logo } = req.body;
        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: { name, logo, updatedAt: new Date() } },
            { returnDocument: 'after', runValidators: true }
        ).select("-password");

        if (user) {
            clearUserCache(req.userId);
            cache.invalidate('dashboard');
            cache.invalidate('enquiries');
            cache.invalidate('followups');
        }

        res.json({ success: true, message: "Profile updated", user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. EMAIL CHANGE - STEP 1: Verify current email
router.post("/email-change/initiate", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const otp = generateOTP();

        otpStore[`email_old_${req.userId}`] = {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 mins
        };

        console.log(`[Profile] OTP for current email ${user.email}: ${otp}`);
        await sendEmailOTP(user.email, otp);

        res.json({ success: true, message: "OTP sent to your current email" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. EMAIL CHANGE - STEP 2: Verify OTP for Current Email
router.post("/email-change/verify-current", verifyToken, async (req, res) => {
    try {
        const { otp } = req.body;
        const record = otpStore[`email_old_${req.userId}`];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        // Mark current email as verified for change
        otpStore[`email_old_verified_${req.userId}`] = true;
        delete otpStore[`email_old_${req.userId}`];

        res.json({ success: true, message: "Current email verified. Please provide your new email." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. EMAIL CHANGE - STEP 3: Send OTP to NEW Email
router.post("/email-change/new-initiate", verifyToken, async (req, res) => {
    try {
        const { newEmail } = req.body;
        if (!otpStore[`email_old_verified_${req.userId}`]) {
            return res.status(403).json({ success: false, message: "Must verify current email first" });
        }

        const existing = await User.findOne({ email: newEmail });
        if (existing) return res.status(400).json({ success: false, message: "Email already in use" });

        const otp = generateOTP();
        otpStore[`email_new_${req.userId}`] = {
            otp,
            newEmail,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        console.log(`[Profile] OTP for new email ${newEmail}: ${otp}`);
        await sendEmailOTP(newEmail, otp);

        res.json({ success: true, message: "OTP sent to your new email" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. EMAIL CHANGE - STEP 4: Verify OTP for NEW Email & Update
router.post("/email-change/verify-new", verifyToken, async (req, res) => {
    try {
        const { otp } = req.body;
        const record = otpStore[`email_new_${req.userId}`];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: { email: record.newEmail, updatedAt: new Date() } },
            { returnDocument: 'after', runValidators: true }
        ).select("-password");

        if (user) {
            clearUserCache(req.userId);
            cache.invalidate('dashboard');
            cache.invalidate('enquiries');
            cache.invalidate('followups');
        }

        delete otpStore[`email_new_${req.userId}`];
        delete otpStore[`email_old_verified_${req.userId}`];

        res.json({ success: true, message: "Email updated successfully", user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- MOBILE CHANGE (Similar logic, though Firebase is preferred, user asked for OTP based change) ---

// 7. MOBILE CHANGE - STEP 1: Verify current mobile
router.post("/mobile-change/initiate", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const otp = generateOTP();

        otpStore[`mobile_old_${req.userId}`] = {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        console.log(`[Profile] OTP for current mobile ${user.mobile}: ${otp}`);
        await sendMobileOTP(user.mobile, otp);

        res.json({ success: true, message: "OTP sent to your current mobile" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 8. MOBILE CHANGE - STEP 2: Verify current mobile OTP
router.post("/mobile-change/verify-current", verifyToken, async (req, res) => {
    try {
        const { otp } = req.body;
        const record = otpStore[`mobile_old_${req.userId}`];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        otpStore[`mobile_old_verified_${req.userId}`] = true;
        delete otpStore[`mobile_old_${req.userId}`];

        res.json({ success: true, message: "Current mobile verified. Please provide your new mobile number." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 9. MOBILE CHANGE - STEP 3: Send OTP to NEW Mobile
router.post("/mobile-change/new-initiate", verifyToken, async (req, res) => {
    try {
        const { newMobile } = req.body;
        if (!otpStore[`mobile_old_verified_${req.userId}`]) {
            return res.status(403).json({ success: false, message: "Must verify current mobile first" });
        }

        const existing = await User.findOne({ mobile: newMobile });
        if (existing) return res.status(400).json({ success: false, message: "Mobile number already in use" });

        const otp = generateOTP();
        otpStore[`mobile_new_${req.userId}`] = {
            otp,
            newMobile,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        console.log(`[Profile] OTP for new mobile ${newMobile}: ${otp}`);
        await sendMobileOTP(newMobile, otp);

        res.json({ success: true, message: "OTP sent to your new mobile" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 10. MOBILE CHANGE - STEP 4: Verify NEW mobile OTP & Update
router.post("/mobile-change/verify-new", verifyToken, async (req, res) => {
    try {
        const { otp } = req.body;
        const record = otpStore[`mobile_new_${req.userId}`];

        if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: { mobile: record.newMobile, updatedAt: new Date() } },
            { returnDocument: 'after', runValidators: true }
        ).select("-password");

        if (user) {
            clearUserCache(req.userId);
            cache.invalidate('dashboard');
            cache.invalidate('enquiries');
            cache.invalidate('followups');
        }

        delete otpStore[`mobile_new_${req.userId}`];
        delete otpStore[`mobile_old_verified_${req.userId}`];

        res.json({ success: true, message: "Mobile number updated successfully", user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
