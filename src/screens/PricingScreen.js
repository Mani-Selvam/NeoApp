import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "@react-navigation/native";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getBillingPlans } from "../services/userService";

const C = {
    bg: "#F2F4F8",
    surface: "#FFFFFF",
    text: "#0A0F1E",
    textSub: "#3A4060",
    muted: "#7C85A3",
    border: "#E8ECF4",
    primary: "#1A6BFF",
    purple: "#7B61FF",
    emerald: "#00C48C",
    orange: "#FF9500",
    rose: "#FF3B5C",
    shadow: "rgba(10,15,30,0.10)",
};

const formatFromUsd = (usdAmount, displayCurrency, usdInrRate) => {
    const usd = Number(usdAmount || 0);
    const c =
        String(displayCurrency || "INR").toUpperCase() === "USD" ? "USD" : "INR";
    const rate = Number(usdInrRate || 0);

    if (c === "USD") return `$${usd.toFixed(2)}`;
    const inr = Number.isFinite(rate) && rate > 0 ? usd * rate : usd;
    return `₹${Math.round(inr).toLocaleString("en-IN")}`;
};

const getTier = (plan) => {
    const code = String(plan?.code || "").toLowerCase();
    const name = String(plan?.name || "").toLowerCase();
    const raw = `${code} ${name}`;
    if (raw.includes("enter")) return "enterprise";
    if (raw.includes("pro")) return "pro";
    if (raw.includes("basic")) return "basic";
    if (raw.includes("free")) return "free";
    return "basic";
};

const isEnterprise = (plan) => getTier(plan) === "enterprise";

const getAccent = (tier) => {
    if (tier === "pro") return { colors: [C.primary, C.purple] };
    if (tier === "enterprise") return { colors: [C.orange, "#FF5E3A"] };
    if (tier === "free") return { colors: ["#16A34A", "#0EA5E9"] };
    return { colors: [C.emerald, "#00A67A"] };
};

const Badge = ({ label, tone = "neutral" }) => {
    const toneMap = {
        neutral: { bg: "#EEF2FF", fg: C.primary },
        pro: { bg: "rgba(123,97,255,0.14)", fg: C.purple },
        warn: { bg: "rgba(255,149,0,0.14)", fg: C.orange },
        danger: { bg: "rgba(255,59,92,0.12)", fg: C.rose },
        success: { bg: "rgba(0,196,140,0.14)", fg: C.emerald },
    };
    const t = toneMap[tone] || toneMap.neutral;
    return (
        <View style={[S.badge, { backgroundColor: t.bg }]}>
            <Text style={[S.badgeText, { color: t.fg }]}>{label}</Text>
        </View>
    );
};

const Metric = ({ icon, label }) => (
    <View style={S.metric}>
        <Ionicons name={icon} size={14} color={C.muted} />
        <Text style={S.metricText} numberOfLines={1}>
            {label}
        </Text>
    </View>
);

const PlanCard = ({ plan, selected, onSelect, displayPrice }) => {
    const tier = getTier(plan);
    const accent = getAccent(tier);
    const recommended = tier === "pro";
    const enterprise = tier === "enterprise";

    const borderColors = selected
        ? accent.colors
        : [C.border, C.border];

    const title = plan?.name || "Plan";
    const subtitle = enterprise
        ? "Custom plan for teams"
        : "Everything you need to grow";

    const cta = enterprise ? "Contact sales" : "Select plan";

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onSelect(plan.id)}
            style={S.planTap}>
            <LinearGradient
                colors={borderColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={S.planBorder}>
                <View style={S.planCard}>
                    <View style={S.planTopRow}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <View style={S.planTitleRow}>
                                <Text style={S.planTitle} numberOfLines={1}>
                                    {title}
                                </Text>
                                {recommended && <Badge label="Popular" tone="pro" />}
                                {plan?.isOverrideApplied && (
                                    <Badge label="Special price" tone="success" />
                                )}
                            </View>
                            <Text style={S.planSubtitle} numberOfLines={2}>
                                {subtitle}
                            </Text>
                        </View>

                        <View style={S.radioWrap}>
                            <View
                                style={[
                                    S.radioOuter,
                                    selected && { borderColor: C.primary },
                                ]}>
                                {selected && <View style={S.radioInner} />}
                            </View>
                        </View>
                    </View>

                    <View style={S.priceRow}>
                        <Text style={S.priceText}>
                            {enterprise ? "Custom" : displayPrice}
                        </Text>
                        {!enterprise && (
                            <Text style={S.pricePeriod}>/ month</Text>
                        )}
                    </View>

                    <View style={S.metricsRow}>
                        {!!plan?.trialDays && plan.trialDays > 0 && (
                            <Metric
                                icon="time-outline"
                                label={`${plan.trialDays} day trial`}
                            />
                        )}
                        <Metric
                            icon="shield-checkmark-outline"
                            label={`Admins: ${plan?.maxAdmins || 0}`}
                        />
                        <Metric
                            icon="people-outline"
                            label={`Staff: ${plan?.maxStaff || 0}`}
                        />
                    </View>

                    <View style={S.planBottomRow}>
                        <Text style={S.planHint}>
                            Tap to {cta}
                        </Text>
                        <LinearGradient
                            colors={accent.colors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={S.planChip}>
                            <Text style={S.planChipText}>
                                {tier.toUpperCase()}
                            </Text>
                        </LinearGradient>
                    </View>
                </View>
            </LinearGradient>
        </TouchableOpacity>
    );
};

export default function PricingScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const [selectedId, setSelectedId] = useState(null);
    const [pricingPlans, setPricingPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [displayCurrency, setDisplayCurrency] = useState("INR");
    const [usdInrRate, setUsdInrRate] = useState(83);

    const loadPlans = useCallback(async () => {
        try {
            setLoading(true);
            const res = await getBillingPlans();
            const rate = Number(res?.rates?.USD_INR || 83);
            setUsdInrRate(rate);

            const serverPlans = (res?.plans || []).map((p) => ({
                id: p._id,
                code: p.code,
                name: p.name,
                trialDays: Number(p.trialDays || 0),
                maxAdmins: Number(p.maxAdmins || 0),
                maxStaff: Number(p.maxStaff || 0),
                basePriceUsd: Number(p.basePrice || 0),
                isOverrideApplied: Boolean(p.isOverrideApplied),
            }));

            setPricingPlans(serverPlans);
            const effectiveId = res?.effectivePlan?.id || null;
            setSelectedId(effectiveId || serverPlans[0]?.id || null);
        } catch (_e) {
            setPricingPlans([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadPlans();
        }, [loadPlans]),
    );

    const selectedPlan = useMemo(
        () =>
            pricingPlans.find((p) => String(p.id) === String(selectedId)) ||
            null,
        [pricingPlans, selectedId],
    );

    const getDisplayPrice = useCallback(
        (plan) =>
            formatFromUsd(
                Number(plan?.basePriceUsd || 0),
                displayCurrency,
                usdInrRate,
            ),
        [displayCurrency, usdInrRate],
    );

    const handleSelect = (id) => {
        Haptics.selectionAsync();
        setSelectedId(id);
    };

    const handleClose = () => {
        Haptics.selectionAsync();
        if (navigation?.canGoBack?.()) navigation.goBack();
    };

    const handleContinue = () => {
        if (!selectedPlan) return;
        Haptics.selectionAsync();
        if (isEnterprise(selectedPlan)) {
            navigation.navigate("EnterpriseContactScreen", {
                plan: selectedPlan,
            });
            return;
        }
        navigation.navigate("CheckoutScreen", {
            plan: selectedPlan,
            displayCurrency,
            usdInrRate,
        });
    };

    const continueLabel = selectedPlan
        ? isEnterprise(selectedPlan)
            ? "Contact Sales"
            : "Continue"
        : "Continue";

    return (
        <SafeAreaView style={[S.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

            <View style={S.navBar}>
                <TouchableOpacity
                    onPress={handleClose}
                    activeOpacity={0.85}
                    style={S.navBtn}>
                    <Ionicons
                        name={
                            Platform.OS === "ios"
                                ? "chevron-back"
                                : "arrow-back"
                        }
                        size={22}
                        color={C.text}
                    />
                </TouchableOpacity>
                <Text style={S.navTitle}>Pricing</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={S.content}>
                <LinearGradient
                    colors={[C.primary, C.purple]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={S.hero}>
                    <View style={S.heroTopRow}>
                        <View style={S.heroIcon}>
                            <Ionicons name="sparkles" size={18} color="#fff" />
                        </View>
                        <Badge label="PRO BENEFITS" tone="pro" />
                    </View>
                    <Text style={S.heroTitle}>Upgrade your CRM workflow</Text>
                    <Text style={S.heroSub}>
                        Unlimited leads, advanced reports, and team access—built
                        for fast follow-ups.
                    </Text>

                    <View style={S.heroBullets}>
                        {[
                            "Unlimited Leads",
                            "Advanced Reports",
                            "Team Access",
                        ].map((t) => (
                            <View key={t} style={S.heroBulletRow}>
                                <Ionicons
                                    name="checkmark-circle"
                                    size={16}
                                    color="rgba(255,255,255,0.92)"
                                />
                                <Text style={S.heroBulletText}>{t}</Text>
                            </View>
                        ))}
                    </View>
                </LinearGradient>

                <View style={S.currencyRow}>
                    <Text style={S.sectionTitle}>Display currency</Text>
                    <View style={S.currencyPills}>
                        <TouchableOpacity
                            style={[
                                S.currencyPill,
                                displayCurrency === "USD" &&
                                    S.currencyPillActive,
                            ]}
                            onPress={() => setDisplayCurrency("USD")}
                            activeOpacity={0.9}>
                            <Text
                                style={[
                                    S.currencyPillText,
                                    displayCurrency === "USD" &&
                                        S.currencyPillTextActive,
                                ]}>
                                $ USD
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                S.currencyPill,
                                displayCurrency === "INR" &&
                                    S.currencyPillActive,
                            ]}
                            onPress={() => setDisplayCurrency("INR")}
                            activeOpacity={0.9}>
                            <Text
                                style={[
                                    S.currencyPillText,
                                    displayCurrency === "INR" &&
                                        S.currencyPillTextActive,
                                ]}>
                                ₹ INR
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={S.sectionHeader}>
                    <Text style={S.sectionTitle}>Choose your plan</Text>
                    <Text style={S.sectionMeta}>
                        {pricingPlans.length || 0} options
                    </Text>
                </View>

                {loading ? (
                    <View style={{ paddingTop: 40 }}>
                        <ActivityIndicator size="large" color={C.primary} />
                    </View>
                ) : pricingPlans.length === 0 ? (
                    <View style={S.emptyCard}>
                        <Ionicons
                            name="alert-circle-outline"
                            size={20}
                            color={C.muted}
                        />
                        <Text style={S.emptyText}>
                            No active plans available right now.
                        </Text>
                    </View>
                ) : (
                    <View style={S.plansList}>
                        {pricingPlans.map((plan, idx) => (
                            <MotiView
                                key={plan.id}
                                from={{ opacity: 0, translateY: 12 }}
                                animate={{ opacity: 1, translateY: 0 }}
                                transition={{
                                    type: "timing",
                                    duration: 260,
                                    delay: 40 + idx * 55,
                                }}>
                                <PlanCard
                                    plan={plan}
                                    selected={String(selectedId) === String(plan.id)}
                                    onSelect={handleSelect}
                                    displayPrice={getDisplayPrice(plan)}
                                />
                            </MotiView>
                        ))}
                    </View>
                )}

                <View style={{ height: 110 }} />
            </ScrollView>

            <View style={[S.footer, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
                {selectedPlan ? (
                    <View style={S.summary}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={S.summaryLabel}>Selected plan</Text>
                            <Text style={S.summaryName} numberOfLines={1}>
                                {selectedPlan.name}
                            </Text>
                        </View>
                        <Text style={S.summaryPrice}>
                            {isEnterprise(selectedPlan)
                                ? "Custom"
                                : getDisplayPrice(selectedPlan)}
                        </Text>
                    </View>
                ) : null}

                <TouchableOpacity
                    style={[
                        S.ctaBtn,
                        !selectedPlan && { opacity: 0.6 },
                    ]}
                    activeOpacity={0.9}
                    disabled={!selectedPlan}
                    onPress={handleContinue}>
                    <LinearGradient
                        colors={[C.text, "#18244A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={S.ctaGrad}>
                        <Text style={S.ctaText}>{continueLabel}</Text>
                        <Ionicons
                            name="arrow-forward"
                            size={18}
                            color="#fff"
                        />
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const S = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    navBar: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 2,
    },
    navTitle: { fontSize: 17, fontWeight: "900", color: C.text },
    content: { paddingHorizontal: 16, paddingBottom: 10, gap: 14 },

    hero: {
        borderRadius: 26,
        padding: 18,
        overflow: "hidden",
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 6,
    },
    heroTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    heroIcon: {
        width: 36,
        height: 36,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.18)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.22)",
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: -0.3,
    },
    heroSub: {
        marginTop: 8,
        color: "rgba(255,255,255,0.85)",
        fontSize: 13,
        lineHeight: 19,
    },
    heroBullets: {
        marginTop: 14,
        gap: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.18)",
    },
    heroBulletRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    heroBulletText: {
        color: "rgba(255,255,255,0.92)",
        fontSize: 13,
        fontWeight: "700",
    },

    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 6,
    },
    sectionTitle: { fontSize: 14, fontWeight: "900", color: C.text },
    sectionMeta: { fontSize: 12, fontWeight: "700", color: C.muted },

    currencyRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 18,
        padding: 12,
    },
    currencyPills: {
        flexDirection: "row",
        backgroundColor: C.bg,
        borderRadius: 999,
        padding: 3,
        borderWidth: 1,
        borderColor: C.border,
    },
    currencyPill: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
    },
    currencyPillActive: { backgroundColor: C.text },
    currencyPillText: { fontSize: 12, fontWeight: "900", color: C.textSub },
    currencyPillTextActive: { color: "#fff" },

    plansList: { gap: 12 },
    planTap: { borderRadius: 22 },
    planBorder: { borderRadius: 22, padding: 2 },
    planCard: {
        borderRadius: 20,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 2,
    },
    planTopRow: { flexDirection: "row", alignItems: "flex-start" },
    planTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    planTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: C.text,
        maxWidth: "70%",
    },
    planSubtitle: { marginTop: 6, fontSize: 12, color: C.muted, lineHeight: 18 },
    radioWrap: { paddingTop: 2 },
    radioOuter: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: C.border,
        justifyContent: "center",
        alignItems: "center",
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: C.primary,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 12 },
    priceText: { fontSize: 22, fontWeight: "900", color: C.text },
    pricePeriod: { marginLeft: 6, marginBottom: 2, color: C.muted, fontWeight: "700" },
    metricsRow: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
    metric: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
    },
    metricText: { fontSize: 12, fontWeight: "800", color: C.textSub, maxWidth: 150 },
    planBottomRow: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    planHint: { fontSize: 12, fontWeight: "700", color: C.muted },
    planChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
    },
    planChipText: { color: "#fff", fontSize: 11, fontWeight: "900" },

    badge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(232,236,244,0.9)",
    },
    badgeText: { fontSize: 11, fontWeight: "900" },

    emptyCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 18,
        padding: 14,
    },
    emptyText: { color: C.muted, fontSize: 13, fontWeight: "700" },

    footer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 10,
        backgroundColor: "rgba(242,244,248,0.94)",
        borderTopWidth: 1,
        borderTopColor: C.border,
    },
    summary: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
    },
    summaryLabel: { fontSize: 11, fontWeight: "900", color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },
    summaryName: { marginTop: 4, fontSize: 15, fontWeight: "900", color: C.text },
    summaryPrice: { fontSize: 18, fontWeight: "900", color: C.primary },
    ctaBtn: { borderRadius: 18, overflow: "hidden" },
    ctaGrad: {
        height: 54,
        borderRadius: 18,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    ctaText: { fontSize: 16, fontWeight: "900", color: "#fff" },
});

