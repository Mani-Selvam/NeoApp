import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import {
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
const PRIVACY_POLICY_URL = String(APP_EXTRA.privacyPolicyUrl || "").trim();
const APP_VERSION = String(
  Constants.expoConfig?.version ||
  Constants.manifest2?.extra?.expoClient?.version ||
  "1.0.0"
);

// ─── iOS SYSTEM PALETTE ──────────────────────────────────────────────────────
const C = {
  // Backgrounds — exact iOS layered system
  bg: "#F2F2F7",           // iOS systemGroupedBackground
  surface: "#FFFFFF",      // iOS secondarySystemGroupedBackground
  surfaceElevated: "#FFFFFF",

  // Labels
  label: "#000000",
  labelSecondary: "#3C3C43",   // with ~60% opacity in iOS, simulated
  labelTertiary: "#3C3C43",    // ~30% opacity
  labelQuaternary: "#3C3C43",  // ~18% opacity

  // Fills (readable equivalents)
  textPrimary: "#000000",
  textSecondary: "#6D6D72",    // iOS secondaryLabel
  textTertiary: "#AEAEB2",     // iOS tertiaryLabel
  textPlaceholder: "#C7C7CC",

  // iOS system separator
  separator: "#C6C6C8",
  separatorOpaque: "#E5E5EA",  // non-translucent

  // iOS system colors
  blue: "#007AFF",
  indigo: "#5856D6",
  teal: "#30B0C7",
  green: "#34C759",
  orange: "#FF9500",
  red: "#FF3B30",
  purple: "#AF52DE",
  pink: "#FF2D55",

  // App brand — restrained single accent
  brand: "#007AFF",
};

// ─── FEATURE ICONS — iOS-style rounded rect with system tint ─────────────────
const FEATURES = [
  {
    icon: "person.2.fill",     // mapped below to Ionicons
    ionicon: "people",
    color: C.blue,
    bg: "#007AFF",
    label: "Lead & Staff",
    sub: "Manage enquiries and assign team members",
  },
  {
    ionicon: "chatbubble-ellipses",
    color: C.green,
    bg: "#34C759",
    label: "Communication",
    sub: "Calls, messages, reminders and tasks",
  },
  {
    ionicon: "bar-chart",
    color: C.orange,
    bg: "#FF9500",
    label: "Reports & Billing",
    sub: "Insights, plan access and payment flows",
  },
];

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

/** iOS grouped section with hairline separators between rows */
const ListSection = ({ title, children, footer }) => (
  <View style={S.listSection}>
    {title ? <Text style={S.listSectionTitle}>{title}</Text> : null}
    <View style={S.listCard}>
      {children}
    </View>
    {footer ? <Text style={S.listSectionFooter}>{footer}</Text> : null}
  </View>
);

/** A single row inside a ListSection */
const ListRow = ({
  iconName,
  iconBg,
  label,
  value,
  sub,
  onPress,
  chevron = false,
  external = false,
  isLast = false,
  destructive = false,
  tintColor,
}) => {
  const Wrapper = onPress ? TouchableHighlight : View;
  const wrapperProps = onPress
    ? { onPress, underlayColor: "#E5E5EA", style: [S.listRow, isLast && S.listRowLast] }
    : { style: [S.listRow, isLast && S.listRowLast] };

  return (
    <Wrapper {...wrapperProps}>
      <View style={S.listRowInner}>
        {/* Icon badge */}
        {iconName ? (
          <View style={[S.rowIconWrap, { backgroundColor: iconBg || C.blue }]}>
            <Ionicons name={iconName} size={16} color="#FFFFFF" />
          </View>
        ) : null}

        {/* Label + optional subtitle */}
        <View style={S.rowContent}>
          <Text style={[S.rowLabel, destructive && { color: C.red }, tintColor && { color: tintColor }]}>
            {label}
          </Text>
          {sub ? <Text style={S.rowSub}>{sub}</Text> : null}
        </View>

        {/* Right side */}
        {value ? <Text style={S.rowValue} numberOfLines={1}>{value}</Text> : null}
        {chevron ? <Ionicons name="chevron-forward" size={16} color={C.textTertiary} style={S.rowChevron} /> : null}
        {external ? <Ionicons name="arrow-up-right" size={14} color={C.textTertiary} style={S.rowChevron} /> : null}
      </View>
    </Wrapper>
  );
};

/** Separator that insets from the left to align with label text */
const RowSep = ({ insetLeft = 56 }) => (
  <View style={[S.rowSeparator, { marginLeft: insetLeft }]} />
);

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function AboutScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const openUrl = async (url) => {
    if (!url) return;
    try { await Linking.openURL(url); } catch { /* ignore */ }
  };

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>
      <StatusBarSpacer />

      {/* ── Navigation Header — iOS large title style ── */}
      <View style={S.navBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={S.navBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={C.brand} />
        </TouchableOpacity>
        <Text style={S.navTitle}>About</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={S.scroll}
        contentContainerStyle={[S.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── App Store-style hero card ── */}
        <View style={S.heroCard}>
          {/* Icon */}
          <LinearGradient
            colors={["#1C3D87", "#2F54EB", "#0EA5E9"]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={S.appIcon}
          >
            <Ionicons name="layers" size={34} color="#FFFFFF" />
          </LinearGradient>

          {/* App identity */}
          <View style={S.heroMeta}>
            <Text style={S.heroAppName}>NeoApp</Text>
            <Text style={S.heroTagline}>Smart CRM Workspace</Text>

            {/* App Store–style rating row repurposed as version pill */}
            <View style={S.heroPillRow}>
              <View style={S.heroPill}>
                <Ionicons name="star" size={10} color={C.brand} />
                <Text style={S.heroPillText}>v{APP_VERSION}</Text>
              </View>
              <View style={S.heroPillDivider} />
              <View style={S.heroPill}>
                <Ionicons name="phone-portrait-outline" size={10} color={C.textSecondary} />
                <Text style={[S.heroPillText, { color: C.textSecondary }]}>Mobile CRM</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Feature highlights — horizontal pill strip ── */}
        <View style={S.featureStrip}>
          {FEATURES.map((f, idx) => (
            <View key={idx} style={S.featureItem}>
              <View style={[S.featureIconWrap, { backgroundColor: f.bg }]}>
                <Ionicons name={f.ionicon} size={20} color="#FFFFFF" />
              </View>
              <Text style={S.featureLabel}>{f.label}</Text>
              <Text style={S.featureSub}>{f.sub}</Text>
            </View>
          ))}
        </View>

        {/* ── About description — grouped section ── */}
        <ListSection
          footer="NeoApp brings enquiry records, follow-up scheduling, staff management, communication tools, billing and reporting together in one mobile workspace."
        >
          <ListRow
            iconName="information-circle"
            iconBg={C.blue}
            label="What NeoApp Does"
            sub="From first enquiry to sale — all in one place"
            isLast
          />
        </ListSection>

        {/* ── Project info — iOS Settings style detail rows ── */}
        <ListSection title="App Information">
          <ListRow
            iconName="tag"
            iconBg={C.indigo}
            label="App Name"
            value="NeoApp"
          />
          <RowSep />
          <ListRow
            iconName="arrow-up-circle"
            iconBg={C.teal}
            label="Version"
            value={APP_VERSION}
          />
          <RowSep />
          <ListRow
            iconName="server"
            iconBg={C.orange}
            label="API Endpoint"
            value={API_URL}
          />
          <RowSep />
          <ListRow
            iconName="phone-portrait-outline"
            iconBg={C.purple}
            label="Platform"
            value="Mobile CRM"
            isLast
          />
        </ListSection>

        {/* ── Privacy & Support ── */}
        <ListSection title="Legal & Support">
          <ListRow
            iconName="shield-checkmark"
            iconBg={C.green}
            label="Privacy Policy"
            sub="How your data is collected and used"
            onPress={() => openUrl(PRIVACY_POLICY_URL)}
            external
          />
          <RowSep />
          <ListRow
            iconName="help-circle"
            iconBg={C.blue}
            label="Support & Help"
            sub="Send questions or issues to the support team"
            onPress={() => navigation.navigate("SupportHelp")}
            chevron
            isLast
          />
        </ListSection>

        {/* ── Footer ── */}
        <View style={S.footer}>
          <Text style={S.footerText}>NeoApp © {new Date().getFullYear()}</Text>
          <Text style={S.footerSub}>All rights reserved</Text>
        </View>
      </ScrollView>

    </View>
  );
}

// No-op spacer to avoid importing StatusBar
const StatusBarSpacer = () => null;

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Navigation bar
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: C.bg,
    // subtle iOS nav separator
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.separator,
  },
  navBack: {
    width: 44,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 4,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: C.textPrimary,
    letterSpacing: -0.2,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // ── Hero card — App Store listing style
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    // iOS card shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  appIcon: {
    width: 76,
    height: 76,
    borderRadius: 18,        // iOS icon corner radius
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    // iOS app icon inner border illusion
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  heroMeta: { flex: 1 },
  heroAppName: {
    fontSize: 22,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: -0.4,
  },
  heroTagline: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: "400",
    marginTop: 2,
    letterSpacing: -0.1,
  },
  heroPillRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.brand,
    letterSpacing: 0.1,
  },
  heroPillDivider: {
    width: 1,
    height: 10,
    backgroundColor: C.separator,
  },

  // ── Feature strip
  featureStrip: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  featureItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  featureLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textPrimary,
    textAlign: "center",
    letterSpacing: -0.1,
  },
  featureSub: {
    fontSize: 10,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 13,
    letterSpacing: -0.1,
  },

  // ── Grouped list sections — exactly like iOS Settings
  listSection: {
    marginBottom: 28,
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: "400",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listSectionFooter: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 16,
    marginTop: 8,
    letterSpacing: -0.1,
  },
  listCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: "hidden",
    // iOS card shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },

  // ── List rows
  listRow: {
    backgroundColor: C.surface,
    minHeight: 48,
  },
  listRowLast: {
    // no special style needed since overflow:hidden on card handles corners
  },
  listRowInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
    minHeight: 48,
  },
  rowIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 7,      // iOS system icon corner radius
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: 17,
    fontWeight: "400",
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 1,
    letterSpacing: -0.1,
  },
  rowValue: {
    fontSize: 17,
    color: C.textSecondary,
    fontWeight: "400",
    letterSpacing: -0.2,
    maxWidth: 150,
    textAlign: "right",
    flexShrink: 1,
  },
  rowChevron: {
    marginLeft: 4,
    flexShrink: 0,
  },

  // Inset separator — same as iOS Settings between rows
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.separatorOpaque,
    marginRight: 0,
  },

  // ── Footer
  footer: {
    alignItems: "center",
    paddingTop: 4,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    color: C.textTertiary,
    fontWeight: "400",
    letterSpacing: -0.1,
  },
  footerSub: {
    fontSize: 12,
    color: C.textPlaceholder,
    letterSpacing: -0.1,
  },
});
