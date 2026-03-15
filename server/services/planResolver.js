const Plan = require("../models/Plan");
const Coupon = require("../models/Coupon");
const CompanySubscription = require("../models/CompanySubscription");
const CompanyPlanOverride = require("../models/CompanyPlanOverride");

const calcDiscount = (price, coupon) => {
  if (!coupon) return { discountAmount: 0, finalPrice: price };

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = (price * coupon.discountValue) / 100;
  } else {
    discountAmount = coupon.discountValue;
  }

  if (discountAmount > price) discountAmount = price;
  const finalPrice = Math.max(0, Number((price - discountAmount).toFixed(2)));
  return { discountAmount, finalPrice };
};

const resolveEffectivePlan = async (companyId) => {
  const subscription = await CompanySubscription.findOne({ companyId, status: { $in: ["Trial", "Active"] } })
    .sort({ createdAt: -1 })
    .populate("planId")
    .populate("couponId")
    .lean();

  if (!subscription || !subscription.planId) {
    return { hasPlan: false, reason: "No active subscription" };
  }

  const plan = subscription.planId;
  const override = await CompanyPlanOverride.findOne({ companyId }).lean();
  const now = new Date();
  const overrideExpiry = override?.customExpiry ? new Date(override.customExpiry) : null;
  if (overrideExpiry) {
    overrideExpiry.setHours(23, 59, 59, 999);
  }
  const overrideExpired = overrideExpiry ? overrideExpiry <= now : false;
  const overridePlanMatch =
    !override?.targetPlanId || String(override.targetPlanId) === String(plan._id);
  const canUseOverride = Boolean(
    override && override.isActive !== false && !overrideExpired && overridePlanMatch,
  );

  let coupon = null;
  if (subscription.couponId) {
    const c = await Coupon.findById(subscription.couponId).lean();
    const couponExpiryEnd = c?.expiryDate ? new Date(c.expiryDate) : null;
    if (couponExpiryEnd) couponExpiryEnd.setHours(23, 59, 59, 999);
    if (
      c &&
      c.isActive &&
      c.usedCount < c.usageLimit &&
      (!couponExpiryEnd || couponExpiryEnd > new Date()) &&
      (!c.applicablePlans || c.applicablePlans.length === 0 || c.applicablePlans.some((id) => id.toString() === plan._id.toString()))
    ) {
      coupon = c;
    }
  }

  const basePrice = canUseOverride && typeof override?.customPrice === "number" ? override.customPrice : plan.basePrice;
  const maxStaff = canUseOverride && typeof override?.customMaxStaff === "number" ? override.customMaxStaff : plan.maxStaff;
  const trialDays = canUseOverride && typeof override?.customTrialDays === "number" ? override.customTrialDays : plan.trialDays;
  const effectiveExpiry =
    (canUseOverride ? override?.customExpiry : null) || subscription.manualOverrideExpiry || subscription.endDate;

  if (effectiveExpiry) {
    const expiry = new Date(effectiveExpiry);
    expiry.setHours(23, 59, 59, 999);
    if (expiry <= now) {
      return { hasPlan: false, reason: "Subscription expired" };
    }
  }

  const { discountAmount, finalPrice } = calcDiscount(basePrice, coupon);

  return {
    hasPlan: true,
    companyId,
    plan: {
      id: plan._id,
      code: plan.code,
      name: plan.name,
      features: plan.features || [],
      maxAdmins: plan.maxAdmins,
      maxStaff,
      trialDays,
      basePrice,
      finalPrice,
      discountAmount,
      couponCode: coupon?.code || null,
    },
    subscription: {
      id: subscription._id,
      status: subscription.status,
      startDate: subscription.startDate,
      endDate: effectiveExpiry,
      originalEndDate: subscription.endDate,
      manualOverrideExpiry: subscription.manualOverrideExpiry || null,
    },
    override: override || null,
  };
};

module.exports = {
  resolveEffectivePlan,
};
