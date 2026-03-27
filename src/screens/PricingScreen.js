import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, useWindowDimensions, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PricingSkeleton } from "../components/skeleton/screens";
import { SkeletonPulse } from "../components/skeleton/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import { createRazorpayOrder, getBillingPlans } from "../services/userService";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#F0F4FF",
  card:    "#FFFFFF",
  text:    "#0D1B2A",
  sub:     "#374151",
  muted:   "#64748B",
  light:   "#94A3B8",
  border:  "#E2E8F0",
  divider: "#F1F5F9",
  shadow:  "#1E293B",
  // each tier has its own gradient pair + accent dot + soft bg
  free:       { a:"#16A34A", b:"#0891B2", dot:"#16A34A", soft:"#F0FDF4" },
  basic:      { a:"#0D9488", b:"#0369A1", dot:"#0D9488", soft:"#F0FDFA" },
  pro:        { a:"#2563EB", b:"#7C3AED", dot:"#2563EB", soft:"#EFF6FF" },
  enterprise: { a:"#EA580C", b:"#DC2626", dot:"#EA580C", soft:"#FFF7ED" },
};

// ─── Responsive scale ──────────────────────────────────────────────────────────
const useScale = () => {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const isTablet = width >= 768;
    const isLarge  = width >= 414;
    const base     = isTablet ? 16 : isLarge ? 15 : 14;
    return {
      isTablet, width, height,
      f:  { xs:base-3, sm:base-1, base, md:base+1, lg:base+2, xl:base+5, xxl:base+10 },
      sp: { xs:4, sm:6, md:10, lg:16, xl:24 },
      hPad: isTablet ? 24 : 16,
      r:    isTablet ? 20 : 16,
    };
  }, [width, height]);
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtPrice = (usd, cur, rate) => {
  const n = Number(usd || 0);
  if (String(cur || "INR").toUpperCase() === "USD") return `$${n.toFixed(2)}`;
  const r = Number(rate || 0);
  const inr = Number.isFinite(r) && r > 0 ? n * r : n;
  return `₹${Math.round(inr).toLocaleString("en-IN")}`;
};

const getTier = (plan) => {
  const raw = `${plan?.code || ""} ${plan?.name || ""}`.toLowerCase();
  if (raw.includes("pro"))   return "pro";
  if (raw.includes("basic")) return "basic";
  return "free";
};

const TIER_LABELS = { free:"FREE", basic:"BASIC", pro:"PRO" };

const TIER_SUBTITLES = {
  free:       "Core CRM tools for smaller teams",
  basic:      "Free CRM plus calls and team chat",
  pro:        "Basic CRM plus WhatsApp and email",
};

const getFeatures = (plan) => {
  const tier = getTier(plan);
  const baseRows = [
    { icon:"people-outline", label:`${plan?.maxStaff||0} staff members` },
    { icon:"shield-checkmark-outline", label:`${plan?.maxAdmins||0} admin account${(plan?.maxAdmins||0)!==1?"s":""}` },
    ...(plan?.trialDays > 0 ? [{ icon:"time-outline", label:`${plan.trialDays}-day free trial` }] : []),
    { icon:"git-branch-outline", label:"Lead sources" },
    { icon:"briefcase-outline", label:"Products" },
    { icon:"people-circle-outline", label:"Admin / staff management" },
    { icon:"flag-outline", label:"Targets" },
    { icon:"help-circle-outline", label:"Help & support" },
    { icon:"person-outline", label:"Enquiries" },
    { icon:"calendar-outline", label:"Follow-ups" },
    { icon:"bar-chart-outline", label:"Reports" },
  ];

  if (tier === "basic") {
    return [
      ...baseRows,
      { icon:"call-outline", label:"Calls" },
      { icon:"chatbubbles-outline", label:"Team chat" },
    ];
  }

  if (tier === "pro") {
    return [
      ...baseRows,
      { icon:"call-outline", label:"Calls" },
      { icon:"chatbubbles-outline", label:"Team chat" },
      { icon:"logo-whatsapp", label:"WhatsApp" },
      { icon:"mail-outline", label:"Email" },
    ];
  }

  return baseRows;
};

// ─── Plan card ─────────────────────────────────────────────────────────────────
const PlanCard = ({ plan, selected, onSelect, displayPrice, sc }) => {
  const [open, setOpen] = useState(false);
  const tier   = getTier(plan);
  const col    = T[tier] || T.basic;
  const feats  = getFeatures(plan);
  const innerR = Math.max(sc.r - 2, 0); // inner radius when border=2

  return (
    // Outer isolation wrapper — padding ensures the colored border of this
    // card never visually merges with the next card below it
    <View style={{ marginBottom: 16 }}>
      <View style={[
        PCS.card,
        { borderRadius: sc.r },
        selected
          ? { borderColor: col.dot, borderWidth: 2 }
          : { borderColor: T.border, borderWidth: 1 },
      ]}>

        {/* ── Gradient header — each tier gets a unique color pair ── */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); onSelect(plan.id); }}
          activeOpacity={0.92}
        >
          <LinearGradient
            colors={[col.a, col.b]}
            start={{ x:0, y:0 }} end={{ x:1, y:1 }}
            style={[PCS.header, {
              borderTopLeftRadius:  selected ? innerR : sc.r - 1,
              borderTopRightRadius: selected ? innerR : sc.r - 1,
            }]}
          >
            {/* decorative large circle */}
            <View style={PCS.hDecor} />

            {/* Left col — tier pill + plan name + subtitle */}
            <View style={{ flex: 1 }}>
              <View style={PCS.tierPill}>
                <Text style={[PCS.tierPillText, { fontSize: sc.f.xs - 1 }]}>
                  {TIER_LABELS[tier]}
                </Text>
              </View>
              <Text style={[PCS.hName, { fontSize: sc.f.xl, marginTop: 6 }]}>
                {plan?.name || "Plan"}
              </Text>
              <Text style={[PCS.hSub, { fontSize: sc.f.xs }]}>
                {TIER_SUBTITLES[tier]}
              </Text>
            </View>

            {/* Right col — radio + price */}
            <View style={{ alignItems: "flex-end", gap: 10 }}>
              <View style={[PCS.radio, selected && PCS.radioSelected]}>
                {selected && <View style={PCS.radioDot} />}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[PCS.hPrice, { fontSize: sc.f.xl }]}>
                  {displayPrice}
                </Text>
                <Text style={[PCS.hPer, { fontSize: sc.f.xs }]}>per month</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Stats row — tap anywhere to select ── */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); onSelect(plan.id); }}
          activeOpacity={0.9}
          style={[PCS.statsWrap, { paddingHorizontal: sc.sp.lg, paddingVertical: sc.sp.md }]}
        >
          <View style={PCS.statsRow}>
            {[
              { num: plan?.maxStaff  || 0,   label: "Staff" },
              { num: plan?.maxAdmins || 0,   label: "Admins" },
              { num: plan?.trialDays > 0 ? plan.trialDays : "—", label: "Trial days" },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 && <View style={PCS.statDiv} />}
                <View style={[PCS.statBox, { backgroundColor: col.soft }]}>
                  <Text style={[PCS.statNum, { fontSize: sc.f.lg, color: col.dot }]}>
                    {s.num}
                  </Text>
                  <Text style={[PCS.statLabel, { fontSize: sc.f.xs - 1 }]}>{s.label}</Text>
                </View>
              </React.Fragment>
            ))}
            {plan?.isOverrideApplied && (
              <>
                <View style={PCS.statDiv} />
                <View style={[PCS.statBox, { backgroundColor: "#F0FDF4" }]}>
                  <Ionicons name="pricetag-outline" size={sc.f.md} color="#059669" />
                  <Text style={[PCS.statLabel, { fontSize: sc.f.xs - 1, color: "#059669" }]}>
                    Special
                  </Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* ── Expand toggle ── */}
        <TouchableOpacity
          onPress={() => setOpen(o => !o)}
          activeOpacity={0.8}
          style={[PCS.expandRow, { paddingHorizontal: sc.sp.lg }]}
        >
          <Text style={[PCS.expandLabel, { fontSize: sc.f.sm, color: col.dot }]}>
            {open ? "Hide features" : `View all ${feats.length} features`}
          </Text>
          <View style={[PCS.expandChevron, { backgroundColor: col.soft }]}>
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={sc.f.sm}
              color={col.dot}
            />
          </View>
        </TouchableOpacity>

        {/* ── Feature list — plain View, no animation ── */}
        {open && (
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); onSelect(plan.id); }}
            activeOpacity={0.95}
            style={[PCS.featBox, {
              marginHorizontal: sc.sp.lg,
              marginBottom: sc.sp.md,
              borderRadius: sc.r - 4,
            }]}
          >
            {feats.map((f, i) => (
              <View
                key={i}
                style={[
                  PCS.featRow,
                  i < feats.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.divider },
                ]}
              >
                <View style={[PCS.featIconBox, { backgroundColor: col.dot + "14" }]}>
                  <Ionicons name={f.icon} size={sc.f.sm} color={col.dot} />
                </View>
                <Text style={[PCS.featText, { fontSize: sc.f.sm }]}>{f.label}</Text>
                <Ionicons name="checkmark-circle" size={sc.f.md} color={col.dot} />
              </View>
            ))}
          </TouchableOpacity>
        )}

        {/* ── Select button ── */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); onSelect(plan.id); }}
          activeOpacity={0.88}
          style={[
            PCS.selBtn,
            { marginHorizontal: sc.sp.lg, marginBottom: sc.sp.lg, borderRadius: sc.r - 4 },
            selected
              ? { backgroundColor: col.dot, borderColor: col.dot }
              : { backgroundColor: "transparent", borderColor: col.dot },
          ]}
        >
          {selected ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle" size={sc.f.md} color="#fff" />
              <Text style={[PCS.selBtnText, { fontSize: sc.f.sm, color: "#fff" }]}>
                Selected
              </Text>
            </View>
          ) : (
            <Text style={[PCS.selBtnText, { fontSize: sc.f.sm, color: col.dot }]}>
               {"Select Plan"}
             </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const PCS = StyleSheet.create({
  card:      { backgroundColor: T.card, overflow: "hidden",
               shadowColor: T.shadow, shadowOffset:{width:0,height:4},
               shadowOpacity:0.07, shadowRadius:14, elevation:3 },
  header:    { padding:18, flexDirection:"row", alignItems:"flex-start",
               justifyContent:"space-between", overflow:"hidden", position:"relative" },
  hDecor:    { position:"absolute", top:-44, right:-44, width:140, height:140,
               borderRadius:70, backgroundColor:"rgba(255,255,255,0.09)" },
  tierPill:  { alignSelf:"flex-start", backgroundColor:"rgba(255,255,255,0.22)",
               paddingHorizontal:9, paddingVertical:4, borderRadius:99,
               borderWidth:1, borderColor:"rgba(255,255,255,0.32)" },
  tierPillText: { color:"#fff", fontWeight:"900", letterSpacing:1.2 },
  hName:     { color:"#fff", fontWeight:"900", letterSpacing:-0.4 },
  hSub:      { color:"rgba(255,255,255,0.76)", fontWeight:"500", marginTop:3, maxWidth:160 },
  radio:     { width:24, height:24, borderRadius:12, borderWidth:2,
               borderColor:"rgba(255,255,255,0.5)", alignItems:"center", justifyContent:"center" },
  radioSelected: { backgroundColor:"rgba(255,255,255,0.28)", borderColor:"#fff" },
  radioDot:  { width:10, height:10, borderRadius:5, backgroundColor:"#fff" },
  hPrice:    { color:"#fff", fontWeight:"900", letterSpacing:-0.5 },
  hPer:      { color:"rgba(255,255,255,0.70)", fontWeight:"600", marginTop:2 },

  statsWrap: { borderBottomWidth:1, borderBottomColor:T.divider },
  statsRow:  { flexDirection:"row", alignItems:"stretch" },
  statBox:   { flex:1, alignItems:"center", paddingVertical:11, gap:2, borderRadius:10 },
  statDiv:   { width:1, backgroundColor:T.border, marginVertical:8 },
  statNum:   { fontWeight:"900", letterSpacing:-0.5 },
  statLabel: { color:T.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:0.4 },

  expandRow:    { flexDirection:"row", alignItems:"center", justifyContent:"space-between",
                  paddingVertical:12, borderBottomWidth:1, borderBottomColor:T.divider },
  expandLabel:  { fontWeight:"700" },
  expandChevron:{ width:26, height:26, borderRadius:13, alignItems:"center", justifyContent:"center" },

  featBox:      { backgroundColor:T.bg, borderWidth:1, borderColor:T.border, overflow:"hidden" },
  featRow:      { flexDirection:"row", alignItems:"center", gap:10, paddingHorizontal:12, paddingVertical:11 },
  featIconBox:  { width:30, height:30, borderRadius:15, alignItems:"center", justifyContent:"center" },
  featText:     { flex:1, fontWeight:"600", color:T.sub },

  selBtn:     { height:44, borderWidth:1.5, alignItems:"center", justifyContent:"center" },
  selBtnText: { fontWeight:"800", letterSpacing:0.3 },
});

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function PricingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const sc     = useScale();
  const { refreshBillingPlan } = useAuth();

  const [selectedId, setSelectedId] = useState(null);
  const [plans,      setPlans]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [currency,   setCurrency]   = useState("INR");
  const [rate,       setRate]       = useState(83);
  const [activatingFree, setActivatingFree] = useState(false);

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getBillingPlans();
      setRate(Number(res?.rates?.USD_INR || 83));
      const mapped = (res?.plans || []).map(p => ({
        id: p._id, code: p.code, name: p.name,
        trialDays: Number(p.trialDays || 0),
        maxAdmins: Number(p.maxAdmins || 0),
        maxStaff:  Number(p.maxStaff  || 0),
        extraAdminPriceUsd: Number(p.extraAdminPrice || 0),
        extraStaffPriceUsd: Number(p.extraStaffPrice || 0),
        basePriceUsd: Number(p.basePrice || 0),
        isOverrideApplied: Boolean(p.isOverrideApplied),
      }));
      setPlans(mapped);
      const eid = res?.effectivePlan?.id || null;
      setSelectedId(eid || mapped[0]?.id || null);
    } catch { setPlans([]); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadPlans(); }, [loadPlans]));

  const selected  = useMemo(() =>
    plans.find(p => String(p.id) === String(selectedId)) || null,
    [plans, selectedId]
  );
  const selTier   = selected ? (T[getTier(selected)] || T.pro) : T.pro;
  const getPrice  = useCallback(
    (plan) => fmtPrice(plan?.basePriceUsd || 0, currency, rate),
    [currency, rate]
  );

  const handleContinue = async () => {
    if (!selected) return;
    Haptics.selectionAsync();
    if (Number(selected?.basePriceUsd || 0) <= 0) {
      try {
        setActivatingFree(true);
        const result = await createRazorpayOrder({
          planId: selected.id,
          adminCount: selected.maxAdmins || 0,
          staffCount: selected.maxStaff || 0,
        });
        await refreshBillingPlan?.().catch(() => {});
        navigation.replace("PaymentSuccessScreen", {
          planName: result?.plan?.name || selected?.name || "Free",
          finalPrice: result?.pricing?.finalPrice ?? 0,
          renewDate: result?.renewDate || null,
          displayCurrency: currency,
          usdInrRate: rate,
        });
      } catch (e) {
        Alert.alert(
          "Plan Activation Failed",
          e?.message || "Unable to activate the free plan right now.",
        );
      } finally {
        setActivatingFree(false);
      }
    } else
      navigation.navigate("CheckoutScreen", {
        plan: selected,
        displayCurrency: currency,
        usdInrRate: rate,
        initialAdminCount: selected.maxAdmins || 0,
        initialStaffCount: selected.maxStaff || 0,
      });
  };

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: T.bg }} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={T.card} />

      {/* ── Nav ── */}
      <View style={[S.nav, { paddingHorizontal: sc.hPad }]}>
        <TouchableOpacity
          style={S.navBack}
          onPress={() => { Haptics.selectionAsync(); navigation?.canGoBack?.() && navigation.goBack(); }}
        >
          <Ionicons
            name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
            size={20} color={T.text}
          />
        </TouchableOpacity>
        <View style={{ flex:1, alignItems:"center" }}>
          <Text style={[S.navTitle, { fontSize: sc.f.md }]}>Choose a Plan</Text>
        </View>
        {/* Currency toggle — ₹ / $ */}
        <View style={S.curToggle}>
          {["INR","USD"].map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setCurrency(c)}
              style={[S.curBtn, currency === c && S.curBtnActive]}
            >
              <Text style={[S.curText, { fontSize: sc.f.xs }, currency === c && { color:"#fff" }]}>
                {c === "INR" ? "₹" : "$"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sc.hPad,
          paddingBottom: 130,
          paddingTop: 14,
          gap: sc.sp.lg,
        }}
      >
        {/* ── Hero banner ── */}
        <View style={[S.hero, { borderRadius: sc.r + 4 }]}>
          <View style={S.heroD1} />
          <View style={S.heroD2} />
          <View style={{ flexDirection:"row", alignItems:"center", gap:10, marginBottom:10 }}>
            <View style={S.heroIconBox}>
              <Ionicons name="sparkles" size={15} color={T.text} />
            </View>
            <Text style={[S.heroEye, { fontSize: sc.f.xs }]}>UPGRADE YOUR CRM</Text>
          </View>
             <Text style={[S.heroEye, { fontSize: sc.f.xl }]}>Grow without limits</Text>
        </View>

        {/* ── Plans header ── */}
        <View style={S.plansHeader}>
          <Text style={[S.plansTitle, { fontSize: sc.f.md }]}>Available Plans</Text>
          {!loading && (
            <View style={S.countPill}>
              <Text style={{ fontSize: sc.f.xs, fontWeight:"800", color: T.pro.a }}>
                {plans.length} options
              </Text>
            </View>
          )}
        </View>

        {/* ── Plan cards — no animation wrapper ── */}
        {loading ? (
          <SkeletonPulse><PricingSkeleton /></SkeletonPulse>
        ) : plans.length === 0 ? (
          <View style={[S.emptyBox, { borderRadius: sc.r }]}>
            <Ionicons name="alert-circle-outline" size={22} color={T.muted} />
            <Text style={{ fontSize: sc.f.sm, color: T.muted, fontWeight:"600" }}>
              No plans available right now.
            </Text>
          </View>
        ) : (
          // plain View — zero animation, renders instantly
          <View>
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={String(selectedId) === String(plan.id)}
                onSelect={(id) => { Haptics.selectionAsync(); setSelectedId(id); }}
                displayPrice={getPrice(plan)}
                sc={sc}
              />
            ))}
          </View>
        )}

        {/* ── Trust strip ── */}
        <View style={S.trust}>
          {[
            { icon:"lock-closed-outline", text:"Secure" },
            { icon:"refresh-outline",     text:"Cancel anytime" },
            { icon:"headset-outline",     text:"Support" },
            { icon:"shield-outline",      text:"No hidden fees" },
          ].map(t => (
            <View key={t.text} style={S.trustItem}>
              <Ionicons name={t.icon} size={12} color={T.muted} />
              <Text style={[S.trustText, { fontSize: sc.f.xs }]}>{t.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View style={[S.footer, { paddingHorizontal: sc.hPad, paddingBottom: Math.max(14, insets.bottom + 10) }]}>
        {selected && (
          <View style={[S.summaryRow, { borderRadius: sc.r }]}>
            <View style={[S.sumDot, { backgroundColor: selTier.dot + "22" }]}>
              <View style={[S.sumDotInner, { backgroundColor: selTier.dot }]} />
            </View>
            <View style={{ flex:1 }}>
              <Text style={[S.sumLabel, { fontSize: sc.f.xs }]}>Selected</Text>
              <Text style={[S.sumName,  { fontSize: sc.f.md }]} numberOfLines={1}>
                {selected.name}
              </Text>
            </View>
            <Text style={[S.sumPrice, { fontSize: sc.f.lg, color: selTier.dot }]}>
              {getTier(selected) === "enterprise" ? "Custom" : getPrice(selected)}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[S.cta, { borderRadius: sc.r, opacity: selected && !activatingFree ? 1 : selected ? 0.8 : 0.55 }]}
          disabled={!selected || activatingFree}
          onPress={handleContinue}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={selected ? [selTier.a, selTier.b] : [T.muted, T.light]}
            start={{ x:0, y:0 }} end={{ x:1, y:0 }}
            style={[S.ctaGrad, { borderRadius: sc.r }]}
          >
            <Text style={[S.ctaText, { fontSize: sc.f.md }]}>
              {activatingFree
                ? "Activating..."
                : selected && getTier(selected) === "enterprise"
                  ? "Contact Sales"
                  : selected && Number(selected?.basePriceUsd || 0) <= 0
                    ? "Activate Free Plan"
                    : "Continue"}
            </Text>
            <View style={S.ctaArrow}>
              <Ionicons name="arrow-forward" size={15} color={selTier.a} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Screen styles ──────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Nav
  nav:       { flexDirection:"row", alignItems:"center", paddingVertical:10,
               backgroundColor: T.card, borderBottomWidth:1, borderBottomColor: T.border },
  navBack:   { width:38, height:38, borderRadius:12, backgroundColor: T.bg,
               borderWidth:1, borderColor: T.border, alignItems:"center", justifyContent:"center" },
  navTitle:  { fontWeight:"900", color: T.text },
  curToggle: { flexDirection:"row", backgroundColor: T.bg, borderRadius:99, padding:3,
               borderWidth:1, borderColor: T.border },
  curBtn:    { width:28, height:28, borderRadius:14, alignItems:"center", justifyContent:"center" },
  curBtnActive: { backgroundColor: T.text },
  curText:   { fontWeight:"800", color: T.sub },

  // Hero
  hero:      { padding:20, overflow:"hidden", backgroundColor:T.card, borderWidth:1, borderColor:T.border,
               shadowColor: T.shadow, shadowOffset:{width:0,height:10},
                shadowOpacity:0.14, shadowRadius:20, elevation:5 },
  heroD1:    { position:"absolute", top:-50,  right:-50,  width:180, height:180, borderRadius:90,  backgroundColor:"rgba(37,99,235,0.06)" },
  heroD2:    { position:"absolute", bottom:-30, left:-20, width:120, height:120, borderRadius:60,  backgroundColor:"rgba(124,58,237,0.05)" },
  heroIconBox:{ width:32, height:32, borderRadius:10, backgroundColor:"#F8FAFC",
                 alignItems:"center", justifyContent:"center",
                 borderWidth:1, borderColor:T.border },
  heroEye:   { color:T.text, fontWeight:"800", letterSpacing:1.4 },
  heroTitle: { color:"#fff", fontWeight:"900", letterSpacing:-0.4 },
  heroSub:   { color:"rgba(255,255,255,0.8)", fontWeight:"500", marginTop:5, lineHeight:19 },
  heroPills: { flexDirection:"row", flexWrap:"wrap", gap:7, marginTop:14, paddingTop:12,
               borderTopWidth:1, borderTopColor:"rgba(255,255,255,0.18)" },
  heroPill:  { flexDirection:"row", alignItems:"center", gap:4,
               backgroundColor:"rgba(255,255,255,0.14)",
               paddingHorizontal:8, paddingVertical:4, borderRadius:99 },
  heroPillText: { color:"rgba(255,255,255,0.92)", fontWeight:"700" },

  // Info card — deliberately plain (no gradient header) so it looks different from plan cards
  infoCard:  { flexDirection:"row", alignItems:"flex-start", gap:12,
               backgroundColor: T.card, borderWidth:1, borderColor: T.border,
               padding:14, overflow:"hidden",
               shadowColor: T.shadow, shadowOffset:{width:0,height:2},
               shadowOpacity:0.04, shadowRadius:6, elevation:1 },
  infoStripe:{ position:"absolute", left:0, top:0, bottom:0, width:3 },
  infoIconBox:{ width:36, height:36, borderRadius:18, alignItems:"center", justifyContent:"center", flexShrink:0 },
  infoTitle: { fontWeight:"800", color: T.text, marginBottom:3 },
  infoText:  { color: T.muted, fontWeight:"500", lineHeight:18 },

  // Plans header row
  plansHeader: { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  plansTitle:  { fontWeight:"900", color: T.text },
  countPill:   { backgroundColor: T.pro.soft, paddingHorizontal:10, paddingVertical:4,
                 borderRadius:99, borderWidth:1, borderColor: T.pro.a + "30" },
  emptyBox:    { flexDirection:"row", alignItems:"center", gap:10,
                 backgroundColor: T.card, borderWidth:1, borderColor: T.border, padding:16 },

  // Trust
  trust:     { flexDirection:"row", justifyContent:"space-around", paddingVertical:4 },
  trustItem: { flexDirection:"row", alignItems:"center", gap:4 },
  trustText: { color: T.muted, fontWeight:"600" },

  // Footer
  footer:    { position:"absolute", left:0, right:0, bottom:0,
               backgroundColor: T.bg + "F5", borderTopWidth:1, borderTopColor: T.border,
               paddingTop:10, gap:8 },
  summaryRow:{ flexDirection:"row", alignItems:"center", gap:10,
               backgroundColor: T.card, borderWidth:1, borderColor: T.border, padding:12 },
  sumDot:    { width:34, height:34, borderRadius:17, alignItems:"center", justifyContent:"center" },
  sumDotInner: { width:12, height:12, borderRadius:6 },
  sumLabel:  { color: T.muted, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.6 },
  sumName:   { fontWeight:"900", color: T.text, marginTop:1 },
  sumPrice:  { fontWeight:"900" },
  cta:       { overflow:"hidden" },
  ctaGrad:   { height:52, paddingHorizontal:18, flexDirection:"row",
               alignItems:"center", justifyContent:"space-between" },
  ctaText:   { color:"#fff", fontWeight:"900", letterSpacing:0.3 },
  ctaArrow:  { width:30, height:30, borderRadius:15,
               backgroundColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
});
