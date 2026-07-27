import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "../services/apiConfig";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const APP_EXTRA = Constants.expoConfig?.extra || {};
const PRIVACY_POLICY_URL = String(APP_EXTRA.privacyPolicyUrl || "http://neophrondev.in/neogroww/privacy").trim();
const DELETION_POLICY_URL = String(APP_EXTRA.accountDeletionUrl || "http://neophrondev.in/neogroww/deleteaccount").trim();
const APP_VERSION = String(
  Constants.expoConfig?.version ||
  Constants.manifest2?.extra?.expoClient?.version ||
  "1.0.4"
);

// ─── FONT FAMILY ─────────────────────────────────────────────────────────────
const FONT_FAMILY = Platform.select({
  ios: "Poppins, -apple-system, BlinkMacSystemFont, System",
  android: "Poppins, Roboto, sans-serif",
  default: "Poppins, sans-serif",
});

// ─── COLOR PALETTE ───────────────────────────────────────────────────────────
const C = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  cardBorder: "#E2E8F0",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  primary: "#4F46E5",
  primaryLight: "#EEF2FF",
  indigo: "#6366F1",
  teal: "#14B8A6",
  green: "#10B981",
  amber: "#F59E0B",
  rose: "#F43F5E",
};

// ─── FEATURE HIGHLIGHTS ──────────────────────────────────────────────────────
const HIGHLIGHTS = [
  {
    icon: "people",
    color: "#3B82F6",
    bg: "#EFF6FF",
    title: "Leads & Enquiries",
    desc: "Track client leads & source channels",
  },
  {
    icon: "chatbubble-ellipses",
    color: "#10B981",
    bg: "#ECFDF5",
    title: "Omni Communication",
    desc: "WhatsApp, Calls, Email & Reminders",
  },
  {
    icon: "bar-chart",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    title: "Reports & Billing",
    desc: "Staff performance & CRM insights",
  },
  {
    icon: "shield-checkmark",
    color: "#F59E0B",
    bg: "#FFFBEB",
    title: "Secure & Compliant",
    desc: "Role-based access & data privacy",
  },
];

export default function AboutScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const openUrl = async (url) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={S.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={S.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={S.headerTitle}>About NeoGroww</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={S.scroll}
        contentContainerStyle={[S.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Premium Hero Card ── */}
        <View style={S.heroContainer}>
          <LinearGradient
            colors={["#4F46E5", "#6366F1", "#3B82F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={S.heroGradient}
          >
            {/* Background Decorative Rings */}
            <View style={S.decoCircle1} />
            <View style={S.decoCircle2} />

            <View style={S.heroIconWrap}>
              <Image
                source={require("../assets/logo.png")}
                style={S.heroLogoImg}
                resizeMode="contain"
              />
            </View>

            <Text style={S.heroAppName}>NeoGroww CRM</Text>
            <Text style={S.heroTagline}>Enterprise Business Management</Text>

            <View style={S.heroBadgesRow}>
              <View style={S.heroBadge}>
                <Ionicons name="code-working" size={12} color="#FFFFFF" />
                <Text style={S.heroBadgeText}>v{APP_VERSION}</Text>
              </View>
              <View style={S.heroBadgeDot} />
              <View style={S.heroBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                <Text style={S.heroBadgeText}>Production Ready</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Platform Highlights Grid ── */}
        <Text style={S.sectionLabel}>PLATFORM HIGHLIGHTS</Text>
        <View style={S.gridContainer}>
          {HIGHLIGHTS.map((item, idx) => (
            <View key={idx} style={S.gridCard}>
              <View style={[S.gridIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={S.gridTitle}>{item.title}</Text>
              <Text style={S.gridDesc}>{item.desc}</Text>
            </View>
          ))}
        </View>

        {/* ── App Info Card ── */}
        <Text style={S.sectionLabel}>SYSTEM INFORMATION</Text>
        <View style={S.infoCard}>
          <View style={S.infoRow}>
            <View style={[S.rowIconWrap, { backgroundColor: "#EEF2FF" }]}>
              <Ionicons name="cube" size={16} color="#4F46E5" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Application Name</Text>
              <Text style={S.rowSub}>NeoGroww CRM</Text>
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.infoRow}>
            <View style={[S.rowIconWrap, { backgroundColor: "#F0FDF4" }]}>
              <Ionicons name="git-branch" size={16} color="#10B981" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Version</Text>
              <Text style={S.rowSub}>v{APP_VERSION}</Text>
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.infoRow}>
            <View style={[S.rowIconWrap, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="server" size={16} color="#F59E0B" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Backend Server</Text>
              <Text style={S.rowSub} numberOfLines={1}>
                {API_URL}
              </Text>
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.infoRow}>
            <View style={[S.rowIconWrap, { backgroundColor: "#F5F3FF" }]}>
              <Ionicons name="business" size={16} color="#8B5CF6" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Company & Organization</Text>
              <Text style={S.rowSub}>Neophron Technologies</Text>
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.infoRow}>
            <View style={[S.rowIconWrap, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="code-slash" size={16} color="#3B82F6" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Lead Architect & Developer</Text>
              <Text style={S.rowSub}>Mani Selvam M (MCA)</Text>
            </View>
          </View>

          <View style={S.divider} />

          <View style={S.infoRow}>
            <View style={[S.rowIconWrap, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="sparkles" size={16} color="#10B981" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>AI Pair Programmer</Text>
              <Text style={S.rowSub}>Antigravity (Google DeepMind)</Text>
            </View>
          </View>
        </View>

        {/* ── Policy & Legal Links ── */}
        <Text style={S.sectionLabel}>POLICIES & LEGAL</Text>
        <View style={S.infoCard}>
          <TouchableOpacity
            style={S.infoRow}
            onPress={() => openUrl(PRIVACY_POLICY_URL)}
            activeOpacity={0.7}
          >
            <View style={[S.rowIconWrap, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="shield-checkmark" size={16} color="#3B82F6" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Privacy Policy</Text>
              <Text style={S.rowSub}>View data handling and security rules</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={C.textMuted} />
          </TouchableOpacity>

          <View style={S.divider} />

          <TouchableOpacity
            style={S.infoRow}
            onPress={() => openUrl(DELETION_POLICY_URL)}
            activeOpacity={0.7}
          >
            <View style={[S.rowIconWrap, { backgroundColor: "#FFF1F2" }]}>
              <Ionicons name="trash-bin" size={16} color="#F43F5E" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Account Deletion Policy</Text>
              <Text style={S.rowSub}>View permanent vs disable policies</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={C.textMuted} />
          </TouchableOpacity>

          <View style={S.divider} />

          <TouchableOpacity
            style={S.infoRow}
            onPress={() => navigation.navigate("SupportHelp")}
            activeOpacity={0.7}
          >
            <View style={[S.rowIconWrap, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="help-buoy" size={16} color="#10B981" />
            </View>
            <View style={S.rowTextWrap}>
              <Text style={S.rowTitle}>Support & Help Desk</Text>
              <Text style={S.rowSub}>Contact us for issues & requests</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={S.footer}>
          <Image
            source={require("../assets/logo.png")}
            style={S.footerLogo}
            resizeMode="contain"
          />
          <Text style={S.footerBrand}>Neophron Technologies</Text>
          <Text style={S.footerCopyright}>
            © {new Date().getFullYear()} NeoGroww CRM. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.textPrimary,
    fontFamily: FONT_FAMILY,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Hero Card
  heroContainer: {
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  heroGradient: {
    padding: 24,
    alignItems: "center",
    position: "relative",
  },
  decoCircle1: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  decoCircle2: {
    position: "absolute",
    bottom: -30,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  heroLogoImg: {
    width: 42,
    height: 42,
  },
  heroAppName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY,
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.85)",
    fontFamily: FONT_FAMILY,
    marginTop: 4,
  },
  heroBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY,
  },
  heroBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },

  // Section Labels
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: C.textMuted,
    fontFamily: FONT_FAMILY,
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4,
  },

  // Grid Section
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  gridCard: {
    width: "48%",
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  gridIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textPrimary,
    fontFamily: FONT_FAMILY,
  },
  gridDesc: {
    fontSize: 11,
    color: C.textSecondary,
    fontFamily: FONT_FAMILY,
    marginTop: 3,
    lineHeight: 15,
  },

  // Info Card & List Rows
  infoCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    marginBottom: 24,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textPrimary,
    fontFamily: FONT_FAMILY,
  },
  rowSub: {
    fontSize: 12,
    color: C.textSecondary,
    fontFamily: FONT_FAMILY,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: C.cardBorder,
    marginLeft: 66,
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingTop: 8,
    gap: 6,
  },
  footerLogo: {
    width: 44,
    height: 44,
    marginBottom: 4,
  },
  footerBrand: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textPrimary,
    fontFamily: FONT_FAMILY,
  },
  footerCopyright: {
    fontSize: 12,
    color: C.textMuted,
    fontFamily: FONT_FAMILY,
  },
});
