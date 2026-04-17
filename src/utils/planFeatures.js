export const PLAN_FEATURES = {
  FREE: [
    "lead_sources",
    "products",
    "staff_management",
    "targets",
    "support",
    "enquiries",
    "followups",
    "reports",
  ],
  BASIC: [
    "lead_sources",
    "products",
    "staff_management",
    "targets",
    "support",
    "enquiries",
    "followups",
    "reports",
    "call_logs",
    "team_chat",
  ],
  PRO: [
    "lead_sources",
    "products",
    "staff_management",
    "targets",
    "support",
    "enquiries",
    "followups",
    "reports",
    "call_logs",
    "team_chat",
    "whatsapp",
    "email",
  ],
};

const LEGACY_FEATURE_MAP = {
  basiccrm: "enquiries",
  leadcapture: "enquiries",
  enquiries: "enquiries",
  followups: "followups",
  followup: "followups",
  reports: "reports",
  leadsources: "lead_sources",
  leadsource: "lead_sources",
  products: "products",
  product: "products",
  staffmanagement: "staff_management",
  adminstaff: "staff_management",
  staff: "staff_management",
  admin: "staff_management",
  targets: "targets",
  support: "support",
  helpsupport: "support",
  calllogs: "call_logs",
  calls: "call_logs",
  teamchat: "team_chat",
  communication: "team_chat",
  whatsappintegration: "whatsapp",
  whatsapp: "whatsapp",
  email: "email",
};

export const FEATURE_LABELS = {
  lead_sources: "Lead Sources",
  products: "Products",
  staff_management: "Admin / Staff",
  targets: "Targets",
  support: "Help & Support",
  enquiries: "Enquiries",
  followups: "Follow-ups",
  reports: "Reports",
  call_logs: "Calls",
  team_chat: "Team Chat",
  whatsapp: "WhatsApp",
  email: "Email",
};

const FEATURE_MIN_PLAN = {
  call_logs: "Basic CRM",
  team_chat: "Basic CRM",
  whatsapp: "Pro CRM",
  email: "Pro CRM",
};

export const normalizeFeatureKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

export const canonicalFeatureKey = (value) => {
  const normalized = normalizeFeatureKey(value);
  return LEGACY_FEATURE_MAP[normalized] || normalized;
};

export const inferPlanCode = (plan) => {
  const rawCode = String(plan?.code || "").trim().toUpperCase();
  if (PLAN_FEATURES[rawCode]) return rawCode;

  const raw = `${plan?.code || ""} ${plan?.name || ""}`.toLowerCase();
  const features = normalizeFeatureList(plan?.features);
  if (raw.includes("pro") || features.includes("whatsapp") || features.includes("email")) {
    return "PRO";
  }
  if (raw.includes("basic") || features.includes("call_logs") || features.includes("team_chat")) {
    return "BASIC";
  }
  return "FREE";
};

export const normalizeFeatureList = (features) => {
  const list = Array.isArray(features) ? features : [];
  return [...new Set(list.map(canonicalFeatureKey).filter(Boolean))];
};

export const getPlanFeatures = (plan) => {
  const normalized = normalizeFeatureList(plan?.features);
  if (normalized.length) return normalized;
  return [...(PLAN_FEATURES[inferPlanCode(plan)] || PLAN_FEATURES.FREE)];
};

export const hasPlanFeature = (plan, featureKey) =>
  getPlanFeatures(plan).includes(canonicalFeatureKey(featureKey));

export const getFeatureLabel = (featureKey) =>
  FEATURE_LABELS[canonicalFeatureKey(featureKey)] || "This feature";

export const getUpgradePlanLabel = (featureKey) =>
  FEATURE_MIN_PLAN[canonicalFeatureKey(featureKey)] || "an upgraded plan";

export const buildFeatureUpgradeMessage = (featureKey, label) => {
  const safeLabel = label || getFeatureLabel(featureKey);
  return `${safeLabel} is available on ${getUpgradePlanLabel(featureKey)} and above.`;
};
