import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import {
  useResponsiveDimensions,
  useResponsiveMenuWidth,
} from "./Responsiveutils";

const APP_VERSION = require("../../package.json").version;

// ─── Colors ──────────────────────────────────────────────────────────────────
const C = {
  primary: "#4F6EF7",
  primaryLight: "#EEF2FF",
  primaryMid: "rgba(79,110,247,0.1)",
  success: "#10B981",
  danger: "#EF4444",
  bg: "#FFFFFF",
  surface: "#F8F9FC",
  border: "#ECEEF5",
  text: "#111827",
  textSub: "#374151",
  textMuted: "#9CA3AF",
  textLight: "#C8CDD8",
  overlay: "rgba(10,14,26,0.45)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name = "") =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const formatDateShort = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

// ─── UserCard ─────────────────────────────────────────────────────────────────
// Clean card replacing the old heavy gradient header
const UserCard = React.memo(({ user, role, logoUri, insetTop }) => {
  const name = user?.name || "User";
  const email = user?.email || "";
  const initials = getInitials(name);

  return (
    <View style={[UC.root, { paddingTop: Math.max(insetTop + 12, 20) }]}>
      {/* Avatar */}
      <View style={UC.avatarWrap}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={UC.avatarImg} />
        ) : (
          <LinearGradient colors={[C.primary, "#7C9EFF"]} style={UC.avatarGrad}>
            <Text style={UC.avatarInitials}>{initials || "U"}</Text>
          </LinearGradient>
        )}
        {/* Online dot */}
        <View style={UC.onlineDot} />
      </View>

      {/* Info */}
      <View style={UC.info}>
        <Text style={UC.name} numberOfLines={1}>
          {name}
        </Text>
        {email ? (
          <Text style={UC.email} numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        {/* Role pill */}
        <View style={UC.rolePill}>
          <View style={UC.roleIcon}>
            <Ionicons name="shield-checkmark" size={9} color={C.primary} />
          </View>
          <Text style={UC.roleText}>{role}</Text>
        </View>
      </View>
    </View>
  );
});
UserCard.displayName = "UserCard";

const UC = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
    gap: 13,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.border,
  },
  avatarGrad: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.success,
    borderWidth: 2,
    borderColor: C.bg,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.2,
  },
  email: {
    fontSize: 13,
    color: C.textMuted,
    fontWeight: "500",
  },
  rolePill: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: C.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  roleIcon: {
    opacity: 0.9,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.primary,
    letterSpacing: 0.1,
  },
});

// ─── PlanCard ─────────────────────────────────────────────────────────────────
const PlanCard = React.memo(
  ({
    planName,
    planCode,
    subStatus,
    expiry,
    planLoading,
    planError,
    onPress,
  }) => (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 400 }}
    >
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={PC.wrap}>
        <LinearGradient
          colors={["#F97316", "#EA580C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={PC.gradient}
        >
          {/* Decorative circle */}
          <View style={PC.circle1} />
          <View style={PC.circle2} />

          <View style={PC.row}>
            <View style={PC.iconBox}>
              <Ionicons name="sparkles" size={11} color="#fff" />
            </View>
            <Text style={PC.label}>Current Plan</Text>
            {planCode ? (
              <View style={PC.badge}>
                <Text style={PC.badgeText}>{planCode.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>

          {planLoading ? (
            <View style={PC.loadRow}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
              <Text style={PC.loadText}>Loading…</Text>
            </View>
          ) : (
            <>
              <Text style={PC.planName} numberOfLines={1}>
                {planError ? "Error loading plan" : planName}
              </Text>
              {!planError && (subStatus || expiry) ? (
                <Text style={PC.planSub} numberOfLines={1}>
                  {subStatus}
                  {subStatus && expiry ? " · " : ""}
                  {expiry ? `Expires ${formatDateShort(expiry)}` : ""}
                </Text>
              ) : null}
            </>
          )}

          <View style={PC.ctaRow}>
            <View style={PC.ctaBtn}>
              <Text style={PC.ctaText}>Upgrade</Text>
              <Ionicons name="arrow-forward" size={10} color="#fff" />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </MotiView>
  ),
);
PlanCard.displayName = "PlanCard";

const PC = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    borderRadius: 14,
    overflow: "hidden",
  },
  gradient: {
    padding: 14,
    overflow: "hidden",
    position: "relative",
  },
  circle1: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
    top: -30,
    right: -20,
  },
  circle2: {
    position: "absolute",
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
    bottom: -18,
    left: -14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  iconBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  label: {
    flex: 1,
    color: "rgba(255,255,255,0.9)",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  planName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  planSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  loadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  loadText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 17,
    fontWeight: "600",
  },
  ctaRow: {
    alignItems: "flex-start",
    marginTop: 2,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  ctaText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

// ─── SectionLabel ─────────────────────────────────────────────────────────────
const SectionLabel = ({ title }) =>
  title ? <Text style={SL.text}>{title.toUpperCase()}</Text> : null;

const SL = StyleSheet.create({
  text: {
    fontSize: 11,
    fontWeight: "800",
    color: C.textMuted,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
});

// ─── MenuItem ─────────────────────────────────────────────────────────────────
const MenuItem = React.memo(
  ({ icon, label, color, onPress, active, badge }) => {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const handlePress = () => {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.96,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
      onPress?.();
    };

    const iconColor = active ? C.primary : color || C.textSub;

    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[MI.item, active && MI.itemActive]}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          {/* Active left bar */}
          {active && <View style={MI.leftBar} />}

          {/* Icon */}
          <View style={[MI.iconWrap, active && MI.iconWrapActive]}>
            <Ionicons name={icon} size={16} color={iconColor} />
          </View>

          {/* Label */}
          <Text
            style={[
              MI.label,
              { color: active ? C.primary : color || C.textSub },
              active && MI.labelActive,
            ]}
          >
            {label}
          </Text>

          {/* Badge */}
          {badge ? (
            <View style={MI.badge}>
              <Text style={MI.badgeText}>{badge}</Text>
            </View>
          ) : null}

          {/* Active chevron dot */}
          {active ? <View style={MI.activeDot} /> : null}
        </TouchableOpacity>
      </Animated.View>
    );
  },
);
MenuItem.displayName = "MenuItem";

const MI = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginHorizontal: 8,
    marginBottom: 1,
    backgroundColor: "transparent",
    position: "relative",
    gap: 10,
  },
  itemActive: {
    backgroundColor: C.primaryLight,
  },
  leftBar: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: C.primary,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconWrapActive: {
    backgroundColor: C.primaryMid,
  },
  label: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: C.textSub,
  },
  labelActive: {
    fontWeight: "700",
    color: C.primary,
  },
  badge: {
    backgroundColor: C.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.primary,
  },
});

// ─── MenuSection ──────────────────────────────────────────────────────────────
const MenuSection = ({ title, children }) => (
  <View style={{ marginBottom: 2 }}>
    <SectionLabel title={title} />
    {children}
  </View>
);

// ─── FooterSection ────────────────────────────────────────────────────────────
const FooterSection = React.memo(({ version, bottomInset }) => (
  <View style={[FS.root, { paddingBottom: Math.max(bottomInset + 8, 16) }]}>
    <View style={FS.divider} />
    <View style={FS.logoRow}>
      <Image
        source={require("../assets/logo.png")}
        style={FS.logo}
        resizeMode="contain"
      />
      <View style={FS.logoText}>
        <Text style={FS.company}>Neophorn Technologies</Text>
        <Text style={FS.product}>CRM System</Text>
      </View>
    </View>
    <View style={FS.versionPill}>
      <Ionicons name="git-branch-outline" size={10} color={C.textMuted} />
      <Text style={FS.versionText}>{version}</Text>
    </View>
  </View>
));
FooterSection.displayName = "FooterSection";

const FS = StyleSheet.create({
  root: {
    alignItems: "center",
    paddingTop: 12,
    marginTop: 8,
  },
  divider: {
    width: "60%",
    height: 1,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  logo: {
    width: 30,
    height: 30,
  },
  logoText: {
    gap: 1,
  },
  company: {
    fontSize: 17,
    fontWeight: "700",
    color: C.text,
  },
  product: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: "500",
  },
  versionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  versionText: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

// ─── Main AppSideMenu ─────────────────────────────────────────────────────────
export default function AppSideMenu({
  visible,
  onClose,
  navigation,
  user,
  onLogout,
  activeRouteName,
  resolveImageUrl,
  version = `v${APP_VERSION}`,
}) {
  const insets = useSafeAreaInsets();
  const { isSmallScreen, isLandscape } = useResponsiveDimensions();
  const menuWidth = useResponsiveMenuWidth();

  const role = user?.role || "Staff Member";
  const isStaff = String(user?.role || "").toLowerCase() === "staff";
  const canManage = !isStaff;

  const { billingInfo, billingLoading } = useAuth();

  const slideAnim = React.useRef(new Animated.Value(-menuWidth)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -menuWidth,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim, menuWidth]);

  const logoUri = useMemo(() => {
    if (!user?.logo) return null;
    try {
      return resolveImageUrl ? resolveImageUrl(user.logo) : user.logo;
    } catch {
      return user.logo;
    }
  }, [resolveImageUrl, user?.logo]);

  const isActive = (r) => activeRouteName === r;

  const nav = (routeName) => {
    onClose?.();
    if (routeName) navigation?.navigate?.(routeName);
  };

  const planName =
    billingInfo?.plan?.name ||
    billingInfo?.plan?.code ||
    (billingLoading ? "" : "No Active Plan");
  const planCode = billingInfo?.plan?.code || "";
  const subStatus = billingInfo?.subscription?.status || "";
  const expiry =
    billingInfo?.subscription?.effectiveEndDate ||
    billingInfo?.subscription?.manualOverrideExpiry ||
    billingInfo?.subscription?.endDate ||
    "";
  const planError =
    !billingLoading && !billingInfo?.plan && billingInfo?.reason
      ? billingInfo.reason
      : "";
  const planLoading = billingLoading;

  return (
    <Modal
      animationType="none"
      transparent
      visible={!!visible}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Overlay */}
      <TouchableOpacity
        style={[DS.overlay]}
        activeOpacity={1}
        onPress={onClose}
      >
        <BlurView intensity={40} style={StyleSheet.absoluteFill} />
      </TouchableOpacity>

      {/* Panel */}
      <Animated.View
        style={[
          DS.panel,
          { width: menuWidth, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* User Card */}
        <UserCard
          user={user}
          role={role}
          logoUri={logoUri}
          insetTop={insets.top + 20}
        />

        {/* Scrollable menu */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 8 }}
        >
          {/* Plan card */}
          {!isStaff ? (
            <View style={{ marginBottom: 6, marginTop: 10 }}>
              <PlanCard
                planName={planName}
                planCode={planCode}
                subStatus={subStatus}
                expiry={expiry}
                planLoading={planLoading}
                planError={planError}
                onPress={() => nav("PricingScreen")}
              />
            </View>
          ) : null}

          {/* Management */}
          {canManage && (
            <MenuSection title="Management">
              <MenuItem
                icon="link-outline"
                label="Lead Sources"
                onPress={() => nav("LeadSourceScreen")}
                active={isActive("LeadSourceScreen")}
              />
              <MenuItem
                icon="pricetags-outline"
                label="Products"
                onPress={() => nav("ProductScreen")}
                active={isActive("ProductScreen")}
              />
              <MenuItem
                icon="people-circle-outline"
                label="Admin / Staff"
                onPress={() => nav("StaffScreen")}
                active={isActive("StaffScreen")}
              />
              <MenuItem
                icon="flag-outline"
                label="Targets"
                onPress={() => nav("TargetsScreen")}
                active={isActive("TargetsScreen")}
              />
              <MenuItem
                icon="chatbubble-ellipses-outline"
                label="Templates"
                onPress={() => nav("MessageTemplateScreen")}
                active={isActive("MessageTemplateScreen")}
              />
            </MenuSection>
          )}

          {/* Workspace */}
          <MenuSection title="Workspace">
            <MenuItem
              icon="home-outline"
              label="Dashboard"
              onPress={() => {
                onClose?.();
                if (navigation?.canGoBack?.()) {
                  navigation.goBack();
                } else {
                  nav("Home");
                }
              }}
              active={isActive("Home")}
            />
            <MenuItem
              icon="help-circle-outline"
              label="Help & Support"
              onPress={() => nav("SupportHelp")}
              active={isActive("SupportHelp")}
            />
          </MenuSection>

          {/* CRM */}
          <MenuSection title="CRM">
            <MenuItem
              icon="people-outline"
              label="Enquiries"
              onPress={() => nav("Enquiry")}
              active={isActive("Enquiry")}
            />
            <MenuItem
              icon="call-outline"
              label="Follow-ups"
              onPress={() => nav("FollowUp")}
              active={isActive("FollowUp")}
            />
            <MenuItem
              icon="mail-outline"
              label="Email"
              onPress={() => nav("EmailScreen")}
              active={isActive("EmailScreen")}
            />
            <MenuItem
              icon="list-outline"
              label="Calls"
              onPress={() => nav("CallLog")}
              active={isActive("CallLog")}
            />
          </MenuSection>

          {/* Communication */}
          <MenuSection title="Communication">
            <MenuItem
              icon="chatbubbles-outline"
              label="Team Chat"
              onPress={() => nav("CommunicationScreen")}
              active={isActive("CommunicationScreen")}
            />
          </MenuSection>
          {/* Footer */}
          <FooterSection version={version} bottomInset={insets.bottom} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Dynamic Panel Styles ─────────────────────────────────────────────────────
const DS = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,14,26,0.4)",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: C.bg,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
});
