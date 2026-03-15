const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Plan = require("../models/Plan");
const Coupon = require("../models/Coupon");
const CompanyPlanOverride = require("../models/CompanyPlanOverride");
const CompanySubscription = require("../models/CompanySubscription");
const SystemLog = require("../models/SystemLog");
const Payment = require("../models/Payment");
const { verifyToken } = require("../middleware/auth");
const { sendEmailOTP, sendMobileOTP } = require("../utils/otpService");
const { clearUserCache } = require("../middleware/auth");
const cache = require("../utils/responseCache");
const { resolveEffectivePlan } = require("../services/planResolver");
const { clearCompanyPlanCache } = require("../middleware/planGuard");
const { getUsdInrRate, getRazorpayConfig } = require("../services/settingsService");
const {
  getRazorpayClientAsync,
  verifyCheckoutSignatureAsync,
  verifyWebhookSignatureAsync,
} = require("../services/razorpayService");

const otpStore = {}; // Memory store for profile changes

// Simple OTP generator
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const isEnterprisePlan = (plan) => {
  if (!plan) return false;
  const code = String(plan.code || "").toLowerCase();
  const name = String(plan.name || "").toLowerCase();
  return code.includes("enter") || name.includes("enterprise");
};

const isRazorpayConfigured = async () => {
  const cfg = await getRazorpayConfig();
  return Boolean(cfg?.keyId && cfg?.keySecret);
};

const computeDiscount = (price, coupon) => {
  if (!coupon) return { discountAmount: 0, finalPrice: price };
  const safeValue = Number(coupon.discountValue || 0);
  if (!Number.isFinite(safeValue) || safeValue <= 0) {
    return { discountAmount: 0, finalPrice: price };
  }
  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = (price * safeValue) / 100;
  } else {
    discountAmount = safeValue;
  }
  if (discountAmount > price) discountAmount = price;
  const finalPrice = Math.max(0, Number((price - discountAmount).toFixed(2)));
  return { discountAmount: Number(discountAmount.toFixed(2)), finalPrice };
};

const getCouponLimits = (coupon) => ({
  globalLimit: Number(coupon?.globalUsageLimit || coupon?.usageLimit || 1),
  perCompanyLimit: Number(coupon?.perCompanyUsageLimit || 1),
});

const getCompanyCouponUsedCount = (coupon, companyId) => {
  const map = coupon?.companyUsageMap || {};
  if (typeof map.get === "function") return Number(map.get(String(companyId)) || 0);
  return Number(map[String(companyId)] || 0);
};

const getActiveOverrideForPlan = async (companyId, planId) => {
  const override = await CompanyPlanOverride.findOne({ companyId }).lean();
  if (!override || override.isActive === false) return null;

  const now = new Date();
  const endOfExpiryDay = override.customExpiry ? new Date(override.customExpiry) : null;
  if (endOfExpiryDay) endOfExpiryDay.setHours(23, 59, 59, 999);
  if (endOfExpiryDay && endOfExpiryDay <= now) return null;

  const targetPlanId = override.targetPlanId ? String(override.targetPlanId) : null;
  if (targetPlanId && String(planId) !== targetPlanId) return null;

  return override;
};

const validateCouponForPlan = async ({ couponCode, companyId, planId }) => {
  if (!couponCode) return null;

  const normalizedCode = String(couponCode).trim().toUpperCase();
  console.log("[CouponValidation] request", {
    companyId: String(companyId),
    planId: String(planId),
    couponCode: normalizedCode,
  });

  const coupon = await Coupon.findOne({ code: normalizedCode }).lean();
  if (!coupon) {
    console.log("[CouponValidation] failed: coupon not found");
    throw new Error("Invalid coupon code");
  }
  if (!coupon.isActive) {
    console.log("[CouponValidation] failed: coupon inactive");
    throw new Error("Coupon is not active");
  }
  const { globalLimit, perCompanyLimit } = getCouponLimits(coupon);
  const companyUsed = getCompanyCouponUsedCount(coupon, companyId);
  if (coupon.usedCount >= globalLimit) {
    console.log("[CouponValidation] failed: global usage limit reached", {
      usedCount: coupon.usedCount,
      globalLimit,
    });
    throw new Error("Coupon global usage limit reached");
  }
  if (companyUsed >= perCompanyLimit) {
    console.log("[CouponValidation] failed: company usage limit reached", {
      companyId: String(companyId),
      companyUsed,
      perCompanyLimit,
    });
    throw new Error("Coupon usage exhausted for this company");
  }
  const couponExpiryEnd = coupon.expiryDate ? new Date(coupon.expiryDate) : null;
  if (couponExpiryEnd) couponExpiryEnd.setHours(23, 59, 59, 999);
  if (couponExpiryEnd && couponExpiryEnd <= new Date()) {
    console.log("[CouponValidation] failed: expired", {
      expiryDate: coupon.expiryDate,
      expiryEnd: couponExpiryEnd,
    });
    throw new Error("Coupon expired");
  }
  if (!Number.isFinite(Number(coupon.discountValue)) || Number(coupon.discountValue) <= 0) {
    console.log("[CouponValidation] failed: invalid discount value", {
      discountValue: coupon.discountValue,
    });
    throw new Error("Coupon has no discount value");
  }

  if (
    coupon.applicablePlans?.length &&
    !coupon.applicablePlans.some((id) => id.toString() === String(planId))
  ) {
    console.log("[CouponValidation] failed: plan not applicable", {
      applicablePlans: coupon.applicablePlans.map((id) => id.toString()),
    });
    throw new Error("Coupon not applicable to selected plan");
  }

  if (
    !coupon.appliesToAllCompanies &&
    coupon.applicableCompanies?.length &&
    !coupon.applicableCompanies.some((id) => id.toString() === String(companyId))
  ) {
    console.log("[CouponValidation] failed: company not applicable", {
      applicableCompanies: coupon.applicableCompanies.map((id) => id.toString()),
    });
    throw new Error("Coupon not applicable to your company");
  }

  console.log("[CouponValidation] success", {
    couponId: String(coupon._id),
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    globalLimit,
    perCompanyLimit,
    companyUsed,
  });
  return coupon;
};

const buildCheckoutSummary = async ({ companyId, planId, couponCode = "" }) => {
  const plan = await Plan.findOne({ _id: planId, isActive: true }).lean();
  if (!plan) throw new Error("Selected plan is not available");

  const override = await getActiveOverrideForPlan(companyId, plan._id);
  const basePrice =
    override && typeof override.customPrice === "number" ? override.customPrice : plan.basePrice;
  const maxStaff =
    override && typeof override.customMaxStaff === "number" ? override.customMaxStaff : plan.maxStaff;
  const trialDays =
    override && typeof override.customTrialDays === "number" ? override.customTrialDays : plan.trialDays;

  const coupon = await validateCouponForPlan({
    couponCode,
    companyId,
    planId: plan._id,
  });

  const { discountAmount, finalPrice } = computeDiscount(basePrice, coupon);
  const renewDate = new Date();
  renewDate.setDate(renewDate.getDate() + 30);

  return {
    plan,
    override,
    coupon,
    originalPrice: Number(basePrice || 0),
    discountAmount,
    finalPrice,
    maxStaff,
    trialDays,
    renewDate,
  };
};

const activateSubscription = async ({
  companyId,
  userId,
  ip,
  summary,
  paymentReference = "",
  provider = "manual",
  paymentMeta = {},
}) => {
  await CompanySubscription.updateMany(
    { companyId, status: { $in: ["Active", "Trial"] } },
    { $set: { status: "Cancelled" } },
  );

  const subscription = await CompanySubscription.create({
    companyId,
    planId: summary.plan._id,
    couponId: summary.coupon ? summary.coupon._id : null,
    status: "Active",
    startDate: new Date(),
    endDate: summary.renewDate,
    trialUsed: false,
    finalPrice: summary.finalPrice,
    notes: paymentReference
      ? `paymentReference:${paymentReference}`
      : `Plan purchased via ${provider}`,
  });

  clearCompanyPlanCache(companyId);

  if (summary.coupon) {
    const companyKey = String(companyId);
    await Coupon.findByIdAndUpdate(summary.coupon._id, {
      $inc: {
        usedCount: 1,
        [`companyUsageMap.${companyKey}`]: 1,
      },
    });
  }

  await SystemLog.create({
    userId,
    action: "PLAN_PURCHASED",
    category: "billing",
    ip,
    metadata: {
      companyId,
      planId: summary.plan._id,
      subscriptionId: subscription._id,
      couponCode: summary.coupon?.code || null,
      paymentReference: paymentReference || null,
      provider,
      finalPrice: summary.finalPrice,
      ...paymentMeta,
    },
  });

  return subscription;
};

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
      { returnDocument: "after", runValidators: true },
    ).select("-password");

    if (user) {
      clearUserCache(req.userId);
      cache.invalidate("dashboard");
      cache.invalidate("enquiries");
      cache.invalidate("followups");
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
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 mins
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    // Mark current email as verified for change
    otpStore[`email_old_verified_${req.userId}`] = true;
    delete otpStore[`email_old_${req.userId}`];

    res.json({
      success: true,
      message: "Current email verified. Please provide your new email.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. EMAIL CHANGE - STEP 3: Send OTP to NEW Email
router.post("/email-change/new-initiate", verifyToken, async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!otpStore[`email_old_verified_${req.userId}`]) {
      return res
        .status(403)
        .json({ success: false, message: "Must verify current email first" });
    }

    // Scope email uniqueness to the user's company to enforce multi-tenant isolation
    const existing = await User.findOne({
      email: newEmail,
      company_id: req.user.company_id,
    });
    if (existing)
      return res
        .status(409)
        .json({
          success: false,
          message: "Email already in use in your company",
        });

    const otp = generateOTP();
    otpStore[`email_new_${req.userId}`] = {
      otp,
      newEmail,
      expiresAt: Date.now() + 10 * 60 * 1000,
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
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { email: record.newEmail, updatedAt: new Date() } },
      { returnDocument: "after", runValidators: true },
    ).select("-password");

    if (user) {
      clearUserCache(req.userId);
      cache.invalidate("dashboard");
      cache.invalidate("enquiries");
      cache.invalidate("followups");
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
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

	    console.log(`[Profile] OTP for current mobile ${user.mobile}: ${otp}`);
	    const ok = await sendMobileOTP(user.mobile, otp, {
	      ownerUserId: req.userId,
	      method: "sms",
	    });
	    if (!ok) {
	      return res.status(500).json({
	        success: false,
	        message: "Failed to send OTP to mobile. SMS gateway/provider not configured.",
	      });
	    }

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
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    otpStore[`mobile_old_verified_${req.userId}`] = true;
    delete otpStore[`mobile_old_${req.userId}`];

    res.json({
      success: true,
      message:
        "Current mobile verified. Please provide your new mobile number.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. MOBILE CHANGE - STEP 3: Send OTP to NEW Mobile
router.post("/mobile-change/new-initiate", verifyToken, async (req, res) => {
  try {
    const { newMobile } = req.body;
    if (!otpStore[`mobile_old_verified_${req.userId}`]) {
      return res
        .status(403)
        .json({ success: false, message: "Must verify current mobile first" });
    }

    // Scope mobile uniqueness to the user's company
    const existing = await User.findOne({
      mobile: newMobile,
      company_id: req.user.company_id,
    });
    if (existing)
      return res
        .status(409)
        .json({
          success: false,
          message: "Mobile number already in use in your company",
        });

    const otp = generateOTP();
    otpStore[`mobile_new_${req.userId}`] = {
      otp,
      newMobile,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

	    console.log(`[Profile] OTP for new mobile ${newMobile}: ${otp}`);
	    const ok = await sendMobileOTP(newMobile, otp, {
	      ownerUserId: req.userId,
	      method: "sms",
	    });
	    if (!ok) {
	      return res.status(500).json({
	        success: false,
	        message: "Failed to send OTP to new mobile. SMS gateway/provider not configured.",
	      });
	    }

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
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { mobile: record.newMobile, updatedAt: new Date() } },
      { returnDocument: "after", runValidators: true },
    ).select("-password");

    if (user) {
      clearUserCache(req.userId);
      cache.invalidate("dashboard");
      cache.invalidate("enquiries");
      cache.invalidate("followups");
    }

    delete otpStore[`mobile_new_${req.userId}`];
    delete otpStore[`mobile_old_verified_${req.userId}`];

    res.json({
      success: true,
      message: "Mobile number updated successfully",
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// 11. GET EFFECTIVE PLAN (Resolved from plan + override + coupon)
router.get("/billing/effective-plan", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res.status(400).json({ success: false, message: "No company linked to user" });
    }

    const resolved = await resolveEffectivePlan(req.user.company_id.toString());
    if (!resolved.hasPlan) {
      return res.status(404).json({ success: false, message: resolved.reason || "No active subscription" });
    }

    // Return only effective plan data required by client app
    return res.json({
      success: true,
      plan: resolved.plan,
      subscription: resolved.subscription,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 12. GET BILLING PLANS (Active plans for app pricing screen)
router.get("/billing/plans", verifyToken, async (req, res) => {
  try {
    const plansRaw = await Plan.find({ isActive: true })
      .select("code name basePrice trialDays maxAdmins maxStaff features")
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    let plans = plansRaw;
    if (req.user?.company_id) {
      const override = await CompanyPlanOverride.findOne({ companyId: req.user.company_id }).lean();
      const now = new Date();
      const endOfExpiryDay = override?.customExpiry ? new Date(override.customExpiry) : null;
      if (endOfExpiryDay) {
        endOfExpiryDay.setHours(23, 59, 59, 999);
      }
      const overrideActive = Boolean(
        override &&
        override.isActive !== false &&
        (!endOfExpiryDay || endOfExpiryDay > now),
      );
      if (overrideActive) {
        const targetPlanId = override.targetPlanId ? String(override.targetPlanId) : null;
        plans = plansRaw.map((plan) => {
          const match = !targetPlanId || String(plan._id) === targetPlanId;
          if (!match) return { ...plan, isOverrideApplied: false };

          return {
            ...plan,
            basePrice:
              typeof override.customPrice === "number" ? override.customPrice : plan.basePrice,
            maxStaff:
              typeof override.customMaxStaff === "number" ? override.customMaxStaff : plan.maxStaff,
            trialDays:
              typeof override.customTrialDays === "number" ? override.customTrialDays : plan.trialDays,
            isOverrideApplied: Boolean(
              typeof override.customPrice === "number" ||
              typeof override.customMaxStaff === "number" ||
              typeof override.customTrialDays === "number",
            ),
          };
        });
      } else {
        plans = plansRaw.map((plan) => ({ ...plan, isOverrideApplied: false }));
      }
    }

    let effectivePlan = null;
    if (req.user?.company_id) {
      const resolved = await resolveEffectivePlan(req.user.company_id.toString());
      if (resolved?.hasPlan) effectivePlan = resolved.plan;
    }

    const usdInr = await getUsdInrRate();
    return res.json({ success: true, plans, effectivePlan, rates: { USD_INR: usdInr } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 13. CHECKOUT PREVIEW (plan + coupon validation and final amount)
router.post("/billing/checkout/preview", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res.status(400).json({ success: false, message: "No company linked to user" });
    }

    const { planId, couponCode = "" } = req.body || {};
    if (!planId) {
      return res.status(400).json({ success: false, message: "planId is required" });
    }

    const plan = await Plan.findById(planId).lean();
    if (!plan || !plan.isActive) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    if (isEnterprisePlan(plan)) {
      return res.json({
        success: true,
        requiresContact: true,
        plan: {
          id: plan._id,
          code: plan.code,
          name: plan.name,
          maxStaff: plan.maxStaff,
          billingCycle: "Contact Sales",
        },
      });
    }

    const summary = await buildCheckoutSummary({
      companyId: req.user.company_id,
      planId,
      couponCode,
    });

    return res.json({
      success: true,
      requiresContact: false,
      plan: {
        id: summary.plan._id,
        code: summary.plan.code,
        name: summary.plan.name,
        maxStaff: summary.maxStaff,
        billingCycle: "Monthly",
      },
      pricing: {
        originalPrice: summary.originalPrice,
        discountAmount: summary.discountAmount,
        finalPrice: summary.finalPrice,
      },
      coupon: summary.coupon
        ? {
            code: summary.coupon.code,
            discountType: summary.coupon.discountType,
            discountValue: summary.coupon.discountValue,
          }
        : null,
      renewDate: summary.renewDate,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 14. RAZORPAY: CREATE ORDER
router.post("/billing/razorpay/order", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res.status(400).json({ success: false, message: "No company linked to user" });
    }

    const { planId, couponCode = "" } = req.body || {};
    if (!planId) {
      return res.status(400).json({ success: false, message: "planId is required" });
    }

    const plan = await Plan.findById(planId).lean();
    if (!plan || !plan.isActive) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    if (isEnterprisePlan(plan)) {
      return res.status(400).json({
        success: false,
        message: "Enterprise requires contact flow, not direct purchase",
      });
    }

    const summary = await buildCheckoutSummary({
      companyId: req.user.company_id,
      planId,
      couponCode,
    });

    if (Number(summary.finalPrice || 0) <= 0) {
      const subscription = await activateSubscription({
        companyId: req.user.company_id,
        userId: req.userId,
        ip: req.ip,
        summary,
        provider: "free",
        paymentReference: "free",
      });

      return res.status(201).json({
        success: true,
        requiresPayment: false,
        message: "Plan activated (no payment required)",
        subscription,
        plan: { id: summary.plan._id, code: summary.plan.code, name: summary.plan.name, maxStaff: summary.maxStaff },
        pricing: { originalPrice: summary.originalPrice, discountAmount: summary.discountAmount, finalPrice: summary.finalPrice },
        renewDate: summary.renewDate,
      });
    }

    if (!(await isRazorpayConfigured())) {
      return res.status(500).json({
        success: false,
        message: "Razorpay is not configured on the server",
      });
    }

    const usdInrRate = await getUsdInrRate();
    const amountUsd = Number(summary.finalPrice || 0);
    const amountInr = amountUsd * usdInrRate;
    const amountInrPaise = Math.round(amountInr * 100);

    const razorpay = await getRazorpayClientAsync();
    const receipt = `company_${String(req.user.company_id)}_plan_${String(planId)}_${Date.now()}`;
    const order = await razorpay.orders.create({
      amount: amountInrPaise,
      currency: "INR",
      receipt,
      notes: {
        companyId: String(req.user.company_id),
        userId: String(req.userId),
        planId: String(planId),
        couponCode: String(couponCode || ""),
      },
    });

    await Payment.create({
      provider: "razorpay",
      companyId: req.user.company_id,
      userId: req.userId,
      planId: summary.plan._id,
      couponCode: String(couponCode || ""),
      amountUsd,
      amountInr,
      amountInrPaise,
      usdInrRate,
      razorpayOrderId: order.id,
      status: "created",
      notes: receipt,
      metadata: { order },
    });

    return res.json({
      success: true,
      requiresPayment: true,
      provider: "razorpay",
      keyId: (await getRazorpayConfig())?.keyId || "",
      orderId: order.id,
      currency: "INR",
      amountInrPaise,
      amountInr: Number(amountInr.toFixed(2)),
      amountUsd: Number(amountUsd.toFixed(2)),
      plan: { id: summary.plan._id, code: summary.plan.code, name: summary.plan.name },
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 15. RAZORPAY: VERIFY PAYMENT (signature) + ACTIVATE SUBSCRIPTION
router.post("/billing/razorpay/verify", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res.status(400).json({ success: false, message: "No company linked to user" });
    }

    const {
      planId,
      couponCode = "",
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body || {};

    if (!planId || !orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, message: "Missing required Razorpay fields" });
    }

    const ok = await verifyCheckoutSignatureAsync({ orderId, paymentId, signature });
    if (!ok) {
      await Payment.updateOne(
        { provider: "razorpay", razorpayOrderId: orderId },
        { $set: { status: "failed", razorpayPaymentId: paymentId, razorpaySignature: signature } },
      );
      return res.status(400).json({ success: false, message: "Invalid Razorpay signature" });
    }

    const payment = await Payment.findOne({
      provider: "razorpay",
      razorpayOrderId: orderId,
      companyId: req.user.company_id,
      userId: req.userId,
    }).lean();

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    if (String(payment.planId) !== String(planId)) {
      return res.status(400).json({ success: false, message: "Plan mismatch for this payment" });
    }

    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: "verified",
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
        },
      },
    );

    const plan = await Plan.findById(planId).lean();
    if (!plan || !plan.isActive) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }
    if (isEnterprisePlan(plan)) {
      return res.status(400).json({ success: false, message: "Enterprise requires contact flow, not direct purchase" });
    }

    const summary = await buildCheckoutSummary({
      companyId: req.user.company_id,
      planId,
      couponCode,
    });

    const subscription = await activateSubscription({
      companyId: req.user.company_id,
      userId: req.userId,
      ip: req.ip,
      summary,
      provider: "razorpay",
      paymentReference: `razorpay:${paymentId}`,
      paymentMeta: { razorpayOrderId: orderId, razorpayPaymentId: paymentId },
    });

    return res.status(201).json({
      success: true,
      message: "Payment verified and subscription activated",
      subscription,
      plan: {
        id: summary.plan._id,
        code: summary.plan.code,
        name: summary.plan.name,
        maxStaff: summary.maxStaff,
      },
      pricing: {
        originalPrice: summary.originalPrice,
        discountAmount: summary.discountAmount,
        finalPrice: summary.finalPrice,
      },
      renewDate: summary.renewDate,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 16. RAZORPAY: WEBHOOK (no auth; raw body required)
router.post("/billing/razorpay/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const rawBody = raw.toString("utf8");

    if (!signature) {
      return res.status(400).json({ success: false, message: "Missing webhook signature" });
    }

    const ok = await verifyWebhookSignatureAsync({ rawBody, signature });
    if (!ok) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature" });
    }

    const payload = JSON.parse(rawBody || "{}");
    const event = payload?.event || "unknown";
    const entity = payload?.payload || {};

    const orderId =
      entity?.payment?.entity?.order_id ||
      entity?.order?.entity?.id ||
      entity?.refund?.entity?.order_id ||
      null;

	    if (orderId) {
	      const paymentId = entity?.payment?.entity?.id || null;
	      const status = entity?.payment?.entity?.status || null;
	      const captured = Boolean(entity?.payment?.entity?.captured);

	      const update = { metadata: payload };
	      if (paymentId) update.razorpayPaymentId = paymentId;
	      if (captured) update.status = "verified";
	      if (status) update.notes = `webhook:${status}`;

	      await Payment.updateOne(
	        { provider: "razorpay", razorpayOrderId: orderId },
	        {
	          $set: update,
	        },
	      );
	    }

    await SystemLog.create({
      userId: null,
      action: "RAZORPAY_WEBHOOK",
      category: "billing",
      ip: req.ip,
      metadata: { event, orderId, payload },
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 17. CHECKOUT PURCHASE (legacy simulate payment success)
router.post("/billing/checkout/purchase", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res.status(400).json({ success: false, message: "No company linked to user" });
    }

    const { planId, couponCode = "", paymentReference = "" } = req.body || {};
    if (!planId) {
      return res.status(400).json({ success: false, message: "planId is required" });
    }

    if ((await isRazorpayConfigured()) && String(process.env.ALLOW_MANUAL_PLAN_PURCHASE || "").toLowerCase() !== "true") {
      return res.status(400).json({
        success: false,
        message: "Manual purchase is disabled. Use Razorpay checkout.",
      });
    }

    const plan = await Plan.findById(planId).lean();
    if (!plan || !plan.isActive) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    if (isEnterprisePlan(plan)) {
      return res.status(400).json({
        success: false,
        message: "Enterprise requires contact flow, not direct purchase",
      });
    }

    const summary = await buildCheckoutSummary({
      companyId: req.user.company_id,
      planId,
      couponCode,
    });

    const subscription = await activateSubscription({
      companyId: req.user.company_id,
      userId: req.userId,
      ip: req.ip,
      summary,
      provider: "manual",
      paymentReference,
    });

    return res.status(201).json({
      success: true,
      message: "Payment successful and subscription activated",
      subscription,
      plan: {
        id: summary.plan._id,
        code: summary.plan.code,
        name: summary.plan.name,
        maxStaff: summary.maxStaff,
      },
      pricing: {
        originalPrice: summary.originalPrice,
        discountAmount: summary.discountAmount,
        finalPrice: summary.finalPrice,
      },
      renewDate: summary.renewDate,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 15. ENTERPRISE CONTACT
router.post("/billing/enterprise-contact", verifyToken, async (req, res) => {
  try {
    const { name = "", email = "", phone = "", company = "", requirements = "" } = req.body || {};

    await SystemLog.create({
      userId: req.userId,
      action: "ENTERPRISE_CONTACT_REQUEST",
      category: "billing",
      ip: req.ip,
      metadata: {
        name,
        email,
        phone,
        company,
        requirements,
        companyId: req.user?.company_id || null,
      },
    });

    return res.json({
      success: true,
      message: "Enterprise request submitted. Team will contact you soon.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 16. CURRENT PLAN (mobile sync)
router.get("/company/current-plan", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res.status(400).json({ success: false, message: "No company linked to user" });
    }

    const resolved = await resolveEffectivePlan(req.user.company_id.toString());
    if (!resolved.hasPlan) {
      return res.status(404).json({ success: false, message: resolved.reason || "No active subscription" });
    }

    return res.json({
      success: true,
      plan: resolved.plan,
      subscription: resolved.subscription,
      override: resolved.override,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});
// 17. GET ACTIVE COUPONS (for app home screen)
router.get("/billing/coupons", verifyToken, async (req, res) => {
  try {
    if (!req.user?.company_id) {
      return res
        .status(400)
        .json({ success: false, message: "No company linked to user" });
    }

    const now = new Date();
    const companyId = req.user.company_id;

    const coupons = await Coupon.find({
      isActive: true,
      $or: [{ appliesToAllCompanies: true }, { applicableCompanies: companyId }],
    })
      .populate("applicablePlans", "name code")
      .sort({ createdAt: -1 })
      .lean();

    const result = coupons
      .filter((coupon) => {
        const couponExpiryEnd = coupon.expiryDate ? new Date(coupon.expiryDate) : null;
        if (couponExpiryEnd) couponExpiryEnd.setHours(23, 59, 59, 999);
        const { globalLimit, perCompanyLimit } = getCouponLimits(coupon);
        const companyUsed = getCompanyCouponUsedCount(coupon, companyId);
        return (
          (!couponExpiryEnd || couponExpiryEnd > now) &&
          Number(coupon.usedCount || 0) < globalLimit &&
          companyUsed < perCompanyLimit
        );
      })
      .map((coupon) => {
      const planNames = (coupon.applicablePlans || [])
        .map((plan) => plan.code || plan.name)
        .filter(Boolean);
      const planScope = planNames.length ? planNames.join(", ") : "All";
      const { globalLimit, perCompanyLimit } = getCouponLimits(coupon);
      const companyUsed = getCompanyCouponUsedCount(coupon, companyId);

      return {
        id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        expiryDate: coupon.expiryDate,
        usedCount: Number(coupon.usedCount || 0),
        globalUsageLimit: globalLimit,
        perCompanyUsageLimit: perCompanyLimit,
        companyUsedCount: companyUsed,
        planScope,
        planScopeLabel: planNames.length ? `${planScope} :` : "All :",
      };
      });

    return res.json({ success: true, coupons: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
