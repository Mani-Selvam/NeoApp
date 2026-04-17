import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    HeaderSkeleton,
    ListSkeleton,
    ScreenSkeleton,
} from "../components/skeleton/screens";
import {
    SkeletonBox,
    SkeletonCard,
    SkeletonLine,
    SkeletonSpacer,
} from "../components/skeleton/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import {
    createRazorpayOrder,
    previewPlanCheckout,
} from "../services/userService";

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
    rose: "#FF3B5C",
    warn: "#FF9500",
    shadow: "rgba(10,15,30,0.10)",
};

const formatFromUsd = (usdAmount, displayCurrency, usdInrRate) => {
    const usd = Number(usdAmount || 0);
    const c =
        String(displayCurrency || "INR").toUpperCase() === "USD"
            ? "USD"
            : "INR";
    const rate = Number(usdInrRate || 0);

    if (c === "USD") return `$${usd.toFixed(2)}`;
    const inr = Number.isFinite(rate) && rate > 0 ? usd * rate : usd;
    return `\u20B9${Math.round(inr).toLocaleString("en-IN")}`;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "-");

const INFO_POINTS = [
    "Secure plan activation after successful payment",
    "Coupon pricing is reflected instantly before checkout",
    "Renewal details remain visible in your billing summary",
];

const Pill = ({ icon, label, tone = "neutral" }) => {
    const tones = {
        neutral: { bg: "rgba(26,107,255,0.10)", fg: C.primary },
        success: { bg: "rgba(0,196,140,0.12)", fg: C.emerald },
        warn: { bg: "rgba(255,149,0,0.12)", fg: C.warn },
        danger: { bg: "rgba(255,59,92,0.12)", fg: C.rose },
    };
    const t = tones[tone] || tones.neutral;
    return (
        <View style={[S.pill, { backgroundColor: t.bg }]}>
            <Ionicons name={icon} size={14} color={t.fg} />
            <Text style={[S.pillText, { color: t.fg }]}>{label}</Text>
        </View>
    );
};

const DetailRow = ({ label, value, valueStyle }) => (
    <View style={S.detailRow}>
        <Text style={S.detailLabel}>{label}</Text>
        <Text style={[S.detailValue, valueStyle]} numberOfLines={2}>
            {value}
        </Text>
    </View>
);

const CounterControl = ({
    label,
    helper,
    value,
    minValue,
    unitPrice,
    displayCurrency,
    usdInrRate,
    onChange,
}) => (
    <View style={S.counterCard}>
        <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={S.counterLabel}>{label}</Text>
            <Text style={S.counterHelper}>{helper}</Text>
            <Text style={S.counterPrice}>
                +{formatFromUsd(unitPrice, displayCurrency, usdInrRate)} per
                extra
            </Text>
        </View>
        <View style={S.counterStepper}>
            <TouchableOpacity
                style={[
                    S.counterBtn,
                    value <= minValue && S.counterBtnDisabled,
                ]}
                onPress={() => onChange(-1)}
                disabled={value <= minValue}>
                <Ionicons name="remove" size={18} color={C.text} />
            </TouchableOpacity>
            <Text style={S.counterValue}>{value}</Text>
            <TouchableOpacity style={S.counterBtn} onPress={() => onChange(1)}>
                <Ionicons name="add" size={18} color={C.text} />
            </TouchableOpacity>
        </View>
    </View>
);

export default function CheckoutScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const selectedPlan = route?.params?.plan || null;
    const displayCurrency = route?.params?.displayCurrency || "INR";
    const usdInrRate = route?.params?.usdInrRate || 83;
    const initialAdminCount = Number(
        route?.params?.initialAdminCount ?? selectedPlan?.maxAdmins ?? 0,
    );
    const initialStaffCount = Number(
        route?.params?.initialStaffCount ?? selectedPlan?.maxStaff ?? 0,
    );

    const [couponInput, setCouponInput] = useState("");
    const [appliedCoupon, setAppliedCoupon] = useState("");
    const [checkout, setCheckout] = useState(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState("");
    const [couponMessage, setCouponMessage] = useState("");
    const [adminCount, setAdminCount] = useState(initialAdminCount);
    const [staffCount, setStaffCount] = useState(initialStaffCount);

    const loadPreview = useCallback(
        async (couponCode = "") => {
            if (!selectedPlan?.id) return;
            try {
                setLoading(couponCode === "");
                setApplying(Boolean(couponCode));
                setError("");

                const res = await previewPlanCheckout({
                    planId: selectedPlan.id,
                    couponCode,
                    adminCount,
                    staffCount,
                });

                if (res?.requiresContact) {
                    navigation.replace("EnterpriseContactScreen", {
                        plan: selectedPlan,
                    });
                    return;
                }

                setCheckout(res);
                setAppliedCoupon(
                    couponCode ? String(couponCode).toUpperCase() : "",
                );

                if (couponCode) {
                    const discount = Number(res?.pricing?.discountAmount || 0);
                    const applied = Boolean(res?.coupon);
                    if (applied) {
                        const msg =
                            discount > 0
                                ? `Coupon applied successfully. Discount: ${formatFromUsd(
                                      discount,
                                      displayCurrency,
                                      usdInrRate,
                                  )}`
                                : "Coupon accepted, but there is no discount amount.";
                        setCouponMessage(msg);
                        Alert.alert("Coupon Applied", msg);
                    } else {
                        const msg =
                            "Coupon is not valid for this plan/company.";
                        setCouponMessage(msg);
                        Alert.alert("Coupon Not Applied", msg);
                    }
                } else {
                    setCouponMessage("");
                }
            } catch (e) {
                if (couponCode) {
                    setError(e.message || "Invalid coupon");
                    setAppliedCoupon("");
                    setCouponMessage(e.message || "Invalid coupon");
                    Alert.alert("Coupon Failed", e.message || "Invalid coupon");
                } else {
                    setError(e.message || "Failed to load checkout");
                }
            } finally {
                setLoading(false);
                setApplying(false);
            }
        },
        [
            adminCount,
            displayCurrency,
            navigation,
            selectedPlan,
            staffCount,
            usdInrRate,
        ],
    );

    useFocusEffect(
        useCallback(() => {
            loadPreview("");
        }, [loadPreview]),
    );

    useEffect(() => {
        if (!selectedPlan?.id) return;
        loadPreview(appliedCoupon);
        // Intentionally tied to seat selection changes for live pricing refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminCount, staffCount]);

    const onApplyCoupon = () => {
        const code = couponInput.trim().toUpperCase();
        if (!code) {
            Alert.alert("Coupon", "Please enter coupon code");
            return;
        }
        setCouponInput(code);
        loadPreview(code);
    };

    const summary = useMemo(() => {
        if (!checkout) return null;
        return {
            planName: checkout.plan?.name || selectedPlan?.name || "-",
            price:
                checkout.pricing?.originalPrice ??
                selectedPlan?.priceValue ??
                0,
            basePrice:
                checkout.pricing?.basePrice ?? selectedPlan?.basePriceUsd ?? 0,
            maxAdmins: checkout.plan?.maxAdmins ?? selectedPlan?.maxAdmins ?? 0,
            maxStaff: checkout.plan?.maxStaff ?? selectedPlan?.maxStaff ?? 0,
            includedAdmins:
                checkout.plan?.includedAdmins ?? selectedPlan?.maxAdmins ?? 0,
            includedStaff:
                checkout.plan?.includedStaff ?? selectedPlan?.maxStaff ?? 0,
            extraAdminPrice:
                checkout.plan?.extraAdminPrice ??
                selectedPlan?.extraAdminPriceUsd ??
                0,
            extraStaffPrice:
                checkout.plan?.extraStaffPrice ??
                selectedPlan?.extraStaffPriceUsd ??
                0,
            extraAdminsAmount: checkout.pricing?.extraAdminsAmount ?? 0,
            extraStaffAmount: checkout.pricing?.extraStaffAmount ?? 0,
            billingCycle: checkout.plan?.billingCycle || "Monthly",
            discountAmount: checkout.pricing?.discountAmount ?? 0,
            finalPrice: checkout.pricing?.finalPrice ?? 0,
            renewDate: checkout.renewDate,
        };
    }, [checkout, selectedPlan]);

    const onProceedPayment = async () => {
        if (!selectedPlan?.id || !summary) return;
        try {
            setPaying(true);
            const result = await createRazorpayOrder({
                planId: selectedPlan.id,
                couponCode: appliedCoupon,
                adminCount,
                staffCount,
            });

            if (!result?.requiresPayment) {
                navigation.navigate("PaymentSuccessScreen", {
                    planName: result?.plan?.name || summary.planName,
                    finalPrice:
                        result?.pricing?.finalPrice ?? summary.finalPrice,
                    renewDate: result?.renewDate || summary.renewDate,
                    displayCurrency,
                    usdInrRate,
                });
                return;
            }

            navigation.navigate("RazorpayCheckoutScreen", {
                keyId: result?.keyId,
                orderId: result?.orderId,
                amountInrPaise: result?.amountInrPaise,
                amountInr: result?.amountInr,
                planId: selectedPlan.id,
                couponCode: appliedCoupon,
                adminCount,
                staffCount,
                displayCurrency,
                usdInrRate,
                prefill: {
                    name: user?.name || "NeoApp",
                    email: user?.email || "",
                    contact: user?.mobile || "",
                },
                notes: {
                    planCode: result?.plan?.code || selectedPlan?.code || "",
                    planName: result?.plan?.name || selectedPlan?.name || "",
                },
                theme: { color: C.primary },
            });
        } catch (e) {
            Alert.alert(
                "Payment Failed",
                e?.message || "Unable to start payment",
            );
        } finally {
            setPaying(false);
        }
    };

    const adjustCounter = (type, delta) => {
        if (type === "admin") {
            setAdminCount((prev) => Math.max(initialAdminCount, prev + delta));
            return;
        }
        setStaffCount((prev) => Math.max(initialStaffCount, prev + delta));
    };

    if (loading && !checkout) {
        return (
            <ScreenSkeleton bg={C.bg}>
                <HeaderSkeleton withAvatar={false} />
                <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                    <SkeletonCard style={{ borderRadius: 20 }}>
                        <SkeletonLine width="46%" height={14} />
                        <SkeletonSpacer h={14} />
                        <SkeletonBox height={56} radius={16} />
                        <SkeletonSpacer h={12} />
                        <SkeletonBox height={56} radius={16} />
                        <SkeletonSpacer h={12} />
                        <SkeletonBox height={48} radius={16} />
                    </SkeletonCard>
                    <SkeletonSpacer h={16} />
                    <SkeletonCard style={{ borderRadius: 20 }}>
                        <SkeletonLine width="38%" height={14} />
                        <SkeletonSpacer h={14} />
                        <ListSkeleton
                            count={3}
                            itemHeight={56}
                            withAvatar={false}
                        />
                    </SkeletonCard>
                </View>
            </ScreenSkeleton>
        );
    }

    const discount = Number(summary?.discountAmount || 0);
    const total = Number(summary?.finalPrice || 0);

    return (
        <SafeAreaView style={[S.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

            <View style={S.navBar}>
                <TouchableOpacity
                    style={S.navBtn}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.85}>
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
                <Text style={S.navTitle}>Checkout</Text>
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
                            <Ionicons
                                name="lock-closed"
                                size={18}
                                color="#fff"
                            />
                        </View>
                        <View style={S.heroPill}>
                            <Ionicons
                                name="shield-checkmark-outline"
                                size={16}
                                color="#fff"
                            />
                            <Text style={S.heroPillText}>Secure checkout</Text>
                        </View>
                    </View>

                    <Text style={S.heroTitle}>Pay & activate</Text>
                    <Text style={S.heroSub}>
                        Your plan will be activated after successful payment.
                    </Text>

                    <View style={S.heroBottomRow}>
                        <View>
                            <Text style={S.heroPriceLabel}>Pay today</Text>
                            <Text style={S.heroPriceValue}>
                                {formatFromUsd(
                                    total,
                                    displayCurrency,
                                    usdInrRate,
                                )}
                            </Text>
                        </View>
                        <View style={S.heroMini}>
                            <Text style={S.heroMiniLabel}>Plan</Text>
                            <Text style={S.heroMiniValue} numberOfLines={1}>
                                {summary?.planName || "Plan"}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>

                <MotiView
                    from={{ opacity: 0, translateY: 10 }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{ type: "timing", duration: 260, delay: 60 }}
                    style={S.card}>
                    <View style={S.cardHeader}>
                        <Text style={S.cardTitle}>Coupon</Text>
                        <Pill
                            icon="sparkles-outline"
                            label="Optional"
                            tone="neutral"
                        />
                    </View>
                    <Text style={S.cardDesc}>
                        Apply a coupon to see updated pricing instantly.
                    </Text>

                    <View style={S.couponRow}>
                        <TextInput
                            placeholder="Enter coupon code"
                            placeholderTextColor={C.muted}
                            value={couponInput}
                            onChangeText={setCouponInput}
                            autoCapitalize="characters"
                            style={S.input}
                        />
                        <TouchableOpacity
                            style={S.applyBtn}
                            onPress={onApplyCoupon}
                            disabled={applying}
                            activeOpacity={0.9}>
                            {applying ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={S.applyText}>Apply</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {error ? <Text style={S.errorText}>{error}</Text> : null}
                    {appliedCoupon ? (
                        <View style={S.appliedPill}>
                            <Ionicons
                                name="pricetag-outline"
                                size={14}
                                color={C.emerald}
                            />
                            <Text style={S.successText}>
                                Coupon applied: {appliedCoupon}
                            </Text>
                        </View>
                    ) : null}
                    {couponMessage ? (
                        <Text
                            style={appliedCoupon ? S.successText : S.errorText}>
                            {couponMessage}
                        </Text>
                    ) : null}
                </MotiView>

                <View style={S.card}>
                    <View style={S.cardHeader}>
                        <Text style={S.cardTitle}>Team allocation</Text>
                        <Pill
                            icon="people-circle-outline"
                            label={`${Number(summary?.maxAdmins || 0)} admins / ${Number(summary?.maxStaff || 0)} staff`}
                            tone="neutral"
                        />
                    </View>
                    <Text style={S.cardDesc}>
                        Add extra admin or staff seats to this plan. Pricing
                        updates automatically before payment.
                    </Text>

                    <CounterControl
                        label="Admin accounts"
                        helper={`Includes ${Number(summary?.includedAdmins || initialAdminCount)} with this plan`}
                        value={adminCount}
                        minValue={Number(
                            summary?.includedAdmins || initialAdminCount,
                        )}
                        unitPrice={Number(summary?.extraAdminPrice || 0)}
                        displayCurrency={displayCurrency}
                        usdInrRate={usdInrRate}
                        onChange={(delta) => adjustCounter("admin", delta)}
                    />

                    <CounterControl
                        label="Staff accounts"
                        helper={`Includes ${Number(summary?.includedStaff || initialStaffCount)} with this plan`}
                        value={staffCount}
                        minValue={Number(
                            summary?.includedStaff || initialStaffCount,
                        )}
                        unitPrice={Number(summary?.extraStaffPrice || 0)}
                        displayCurrency={displayCurrency}
                        usdInrRate={usdInrRate}
                        onChange={(delta) => adjustCounter("staff", delta)}
                    />
                </View>

                <View style={S.card}>
                    <View style={S.cardHeader}>
                        <Text style={S.cardTitle}>Billing breakdown</Text>
                        <Pill
                            icon="calendar-outline"
                            label={summary?.billingCycle || "Monthly"}
                            tone="neutral"
                        />
                    </View>
                    <DetailRow
                        label="Base plan"
                        value={formatFromUsd(
                            summary?.basePrice,
                            displayCurrency,
                            usdInrRate,
                        )}
                    />
                    <DetailRow
                        label="Extra admins"
                        value={formatFromUsd(
                            summary?.extraAdminsAmount,
                            displayCurrency,
                            usdInrRate,
                        )}
                    />
                    <DetailRow
                        label="Extra staff"
                        value={formatFromUsd(
                            summary?.extraStaffAmount,
                            displayCurrency,
                            usdInrRate,
                        )}
                    />
                    <DetailRow
                        label="Original price"
                        value={formatFromUsd(
                            summary?.price,
                            displayCurrency,
                            usdInrRate,
                        )}
                    />
                    <DetailRow
                        label="Discount"
                        value={`-${formatFromUsd(
                            discount,
                            displayCurrency,
                            usdInrRate,
                        )}`}
                        valueStyle={S.discountValue}
                    />
                    <View style={S.divider} />
                    <DetailRow
                        label="Total payable today"
                        value={formatFromUsd(
                            total,
                            displayCurrency,
                            usdInrRate,
                        )}
                        valueStyle={S.totalValue}
                    />
                </View>

                <View style={S.card}>
                    <View style={S.cardHeader}>
                        <Text style={S.cardTitle}>Plan summary</Text>
                        <Pill
                            icon="people-outline"
                            label={`${Number(summary?.maxAdmins || 0)} admins / ${Number(summary?.maxStaff || 0)} staff`}
                            tone="neutral"
                        />
                    </View>
                    <DetailRow
                        label="Plan name"
                        value={summary?.planName || "-"}
                    />
                    <DetailRow
                        label="Allocated admins"
                        value={String(Number(summary?.maxAdmins || 0))}
                    />
                    <DetailRow
                        label="Allocated staff"
                        value={String(Number(summary?.maxStaff || 0))}
                    />
                    <DetailRow
                        label="Renewal date"
                        value={fmtDate(summary?.renewDate)}
                    />
                </View>

                <View style={S.infoCard}>
                    <Text style={S.infoTitle}>Good to know</Text>
                    {INFO_POINTS.map((p) => (
                        <View key={p} style={S.infoRow}>
                            <Ionicons
                                name="checkmark-circle"
                                size={16}
                                color={C.emerald}
                            />
                            <Text style={S.infoText}>{p}</Text>
                        </View>
                    ))}
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            <View
                style={[
                    S.footer,
                    { paddingBottom: Math.max(14, insets.bottom + 10) },
                ]}>
                <View style={S.footerSummary}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={S.footerLabel}>Pay today</Text>
                        <Text style={S.footerPlan} numberOfLines={1}>
                            {summary?.planName || "Plan"}
                        </Text>
                    </View>
                    <Text style={S.footerPrice}>
                        {formatFromUsd(total, displayCurrency, usdInrRate)}
                    </Text>
                </View>

                <TouchableOpacity
                    style={[S.payBtn, paying && S.btnDisabled]}
                    disabled={paying}
                    onPress={onProceedPayment}
                    activeOpacity={0.9}>
                    <LinearGradient
                        colors={[C.text, "#18244A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={S.payGrad}>
                        {paying ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Text style={S.payText}>
                                    Proceed to Payment
                                </Text>
                                <Ionicons
                                    name="arrow-forward"
                                    size={18}
                                    color="#fff"
                                />
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const S = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },

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
    heroPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(255,255,255,0.16)",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    heroPillText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    heroTitle: {
        marginTop: 10,
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
    heroBottomRow: {
        marginTop: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.18)",
    },
    heroPriceLabel: {
        fontSize: 12,
        color: "rgba(255,255,255,0.78)",
        textTransform: "uppercase",
        letterSpacing: 0.9,
        fontWeight: "800",
    },
    heroPriceValue: {
        marginTop: 4,
        fontSize: 28,
        fontWeight: "900",
        color: "#fff",
    },
    heroMini: {
        maxWidth: 170,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.14)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
    },
    heroMiniLabel: {
        fontSize: 11,
        color: "rgba(255,255,255,0.8)",
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.8,
    },
    heroMiniValue: { marginTop: 3, color: "#fff", fontWeight: "900" },

    card: {
        backgroundColor: C.surface,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        gap: 10,
        shadowColor: C.shadow,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    cardTitle: { fontSize: 16, fontWeight: "900", color: C.text },
    cardDesc: { fontSize: 13, color: C.muted, lineHeight: 19 },
    counterCard: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: 14,
        borderRadius: 18,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
    },
    counterLabel: { fontSize: 14, fontWeight: "900", color: C.text },
    counterHelper: { marginTop: 4, fontSize: 12, color: C.muted },
    counterPrice: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: "800",
        color: C.primary,
    },
    counterStepper: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    counterBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
    },
    counterBtnDisabled: {
        opacity: 0.45,
    },
    counterValue: {
        minWidth: 28,
        textAlign: "center",
        fontSize: 16,
        fontWeight: "900",
        color: C.text,
    },

    pill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: "rgba(232,236,244,0.9)",
    },
    pillText: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },

    detailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    detailLabel: { fontSize: 14, color: C.muted },
    detailValue: {
        flexShrink: 1,
        textAlign: "right",
        fontSize: 14,
        fontWeight: "800",
        color: C.textSub,
    },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 4 },
    discountValue: { color: C.emerald },
    totalValue: { fontSize: 16, color: C.primary, fontWeight: "900" },

    couponRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: C.bg,
        color: C.text,
        fontWeight: "800",
    },
    applyBtn: {
        backgroundColor: C.primary,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        minWidth: 84,
        alignItems: "center",
    },
    applyText: { color: "#fff", fontWeight: "900" },
    appliedPill: {
        marginTop: 2,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(0,196,140,0.12)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    errorText: { color: C.rose, fontSize: 12, fontWeight: "800" },
    successText: { color: C.emerald, fontSize: 12, fontWeight: "900" },

    infoCard: {
        backgroundColor: C.surface,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        gap: 10,
    },
    infoTitle: { fontSize: 14, fontWeight: "900", color: C.text },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    infoText: { flex: 1, color: C.textSub, fontSize: 13, fontWeight: "700" },

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
    footerSummary: {
        marginBottom: 10,
        backgroundColor: C.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    footerLabel: {
        fontSize: 11,
        color: C.muted,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        fontWeight: "900",
    },
    footerPlan: {
        marginTop: 4,
        fontSize: 15,
        fontWeight: "900",
        color: C.text,
    },
    footerPrice: { fontSize: 18, fontWeight: "900", color: C.primary },
    payBtn: { borderRadius: 18, overflow: "hidden" },
    payGrad: {
        height: 54,
        borderRadius: 18,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    payText: { fontSize: 16, fontWeight: "900", color: "#fff" },
    btnDisabled: { opacity: 0.7 },
});
