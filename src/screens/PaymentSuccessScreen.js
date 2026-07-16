import React, { useEffect, useMemo, useState, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Platform,
    Animated,
    Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";

// ─── Responsive Scaling ────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get("window");
const BASE_W = 375;
const BASE_H = 812;

const hs = (n) => Math.round((SW / BASE_W) * n);
const vs = (n) => Math.round((SH / BASE_H) * n);
const ms = (n, factor = 0.35) => Math.round(n + (hs(n) - n) * factor);
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

// Safe font helpers
const fsTitle = clamp(ms(28), 24, 34);
const fsSub = clamp(ms(15), 14, 18);
const fsLabel = clamp(ms(13), 12, 15);
const fsValue = clamp(ms(14), 13, 16);
const fsBtn = clamp(ms(16), 15, 18);

// ─── Theme Colors ──────────────────────────────────────────────────────────
const C = {
    bgStart: "#F0F7FF", // Soft light blue start
    bgEnd: "#E0EFFF",   // Soft light blue end
    cardBg: "#FFFFFF",
    primary: "#007AFF",
    primarySoft: "rgba(0, 122, 255, 0.1)",
    success: "#34C759",
    successSoft: "rgba(52, 199, 89, 0.15)",
    text: "#1C1C1E",
    subtext: "#6E6E73",
    muted: "#C7C7CC",
    border: "#E5E5EA",
};

const fmtDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function PaymentSuccessScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { refreshBillingPlan } = useAuth();
    const [downloading, setDownloading] = useState(false);

    // ─── Intro Animation State ───
    const [isVerifying, setIsVerifying] = useState(true);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const checkScale = useRef(new Animated.Value(0)).current;
    
    // Bubble Animations
    const bubble1 = useRef(new Animated.Value(0)).current;
    const bubble2 = useRef(new Animated.Value(0)).current;
    const bubble3 = useRef(new Animated.Value(0)).current;

    const planName = route?.params?.planName || "Selected";
    const finalPrice = route?.params?.finalPrice;
    const renewDate = route?.params?.renewDate;
    const receipt = route?.params?.receipt || null;
    const displayCurrency = route?.params?.displayCurrency || "INR";
    const usdInrRate = route?.params?.usdInrRate || 83;
    const symbol = String(displayCurrency).toUpperCase() === "USD" ? "$" : "₹";

    const formattedAmount = useMemo(() => {
        const usd = Number(finalPrice || 0);
        if (String(displayCurrency).toUpperCase() === "USD") {
            return `${symbol}${usd.toFixed(2)}`;
        }
        const rate = Number(usdInrRate || 0);
        const inr = isFinite(rate) && rate > 0 ? usd * rate : usd;
        return `${symbol}${Math.round(inr).toLocaleString("en-IN")}`;
    }, [displayCurrency, finalPrice, symbol, usdInrRate]);

    useEffect(() => {
        // Start background bubble animations
        const bubbleLoops = [];
        const loopBubble = (anim, duration) => {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
                    Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true, easing: Easing.inOut(Easing.ease) })
                ])
            );
            loop.start();
            bubbleLoops.push(loop);
        };
        loopBubble(bubble1, 4000);
        loopBubble(bubble2, 5500);
        loopBubble(bubble3, 4500);

        // Intro pulsing animation
        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) })
            ])
        );
        pulseLoop.start();

        // Simulate verify processing then transition to receipt
        const verifyTimer = setTimeout(() => {
            setIsVerifying(false);
            
            // Pop the checkmark and slide in the receipt
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
                Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true, delay: 200 })
            ]).start();
            
            refreshBillingPlan?.().catch(() => {});
        }, 2500);

        return () => {
            bubbleLoops.forEach(l => l.stop());
            pulseLoop.stop();
            clearTimeout(verifyTimer);
        };
    }, [refreshBillingPlan]);

    // ── Receipt HTML (PDF export) ──────────────────────────────────────────
    const receiptHtml = useMemo(() => {
        const amountLabel = receipt?.amountInr ? `INR ${Number(receipt.amountInr).toFixed(2)}` : formattedAmount;
        return `<!doctype html>
<html><head><meta charset="utf-8"/><style>body{font-family:Arial,sans-serif;padding:24px;color:#102033;}.sheet{border:1px solid #dce5ef;border-radius:16px;padding:24px;}.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;}.brand{font-size:24px;font-weight:800;color:#0f62fe;}.tag{color:#526277;font-size:11px;letter-spacing:1px;text-transform:uppercase;}.title{font-size:20px;font-weight:800;margin:14px 0 4px;}.sub{color:#526277;margin-bottom:18px;font-size:14px;}table{width:100%;border-collapse:collapse;margin-top:10px;}td{padding:10px 0;border-bottom:1px solid #e8eef5;vertical-align:top;}td:first-child{color:#6b7b8d;width:40%;font-size:13px;}td:last-child{text-align:right;font-weight:700;font-size:13px;word-break:break-all;}.foot{margin-top:20px;color:#6b7b8d;font-size:11px;}</style></head><body><div class="sheet"><div class="top"><div><div class="brand">NeoApp</div><div class="tag">Payment Receipt</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:700">${receipt?.receiptNumber || "-"}</div><div style="color:#6b7b8d;font-size:11px">${receipt?.paidAtLabel || "-"}</div></div></div><div class="title">Subscription Activated</div><div class="sub">Your payment was received successfully.</div><table><tr><td>Plan</td><td>${planName}</td></tr><tr><td>Amount Paid</td><td>${amountLabel}</td></tr><tr><td>Renew Date</td><td>${fmtDate(renewDate)}</td></tr><tr><td>Payment ID</td><td>${receipt?.paymentId || "-"}</td></tr><tr><td>Order ID</td><td>${receipt?.orderId || "-"}</td></tr><tr><td>Customer</td><td>${receipt?.customerName || "-"}</td></tr><tr><td>Email</td><td>${receipt?.customerEmail || "-"}</td></tr></table><div class="foot">Generated by NeoApp billing flow.</div></div></body></html>`;
    }, [formattedAmount, planName, receipt, renewDate]);

    // ── Handlers ──────────────────────────────────────────────────────────
    const onDownloadReceipt = async () => {
        if (!receipt) return;
        try {
            setDownloading(true);
            if (Platform.OS === "web") {
                await Print.printAsync({ html: receiptHtml });
            } else {
                const file = await Print.printToFileAsync({ html: receiptHtml, base64: false });
                const available = await Sharing.isAvailableAsync();
                if (available) {
                    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Download receipt PDF", UTI: "com.adobe.pdf" });
                } else {
                    Alert.alert("Receipt Ready", `PDF saved at:\n${file.uri}`);
                }
            }
        } catch (e) {
            Alert.alert("Receipt Failed", e?.message || "Unable to generate receipt PDF");
        } finally {
            setDownloading(false);
        }
    };

    const onContinue = async () => {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    };

    // Helper to calculate animated transforms
    const getBubbleTransform = (anim, moveY, moveX, scaleTo) => [
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, moveY] }) },
        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, moveX] }) },
        { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] }) }
    ];

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            
            {/* ── Background Gradient & Bubbles ── */}
            <LinearGradient colors={[C.bgStart, C.bgEnd]} style={StyleSheet.absoluteFillObject} />
            <Animated.View style={[styles.bubble, styles.bubble1, { transform: getBubbleTransform(bubble1, -40, 20, 1.1) }]} />
            <Animated.View style={[styles.bubble, styles.bubble2, { transform: getBubbleTransform(bubble2, 50, -30, 1.2) }]} />
            <Animated.View style={[styles.bubble, styles.bubble3, { transform: getBubbleTransform(bubble3, -20, -40, 1.15) }]} />

            {/* ── Intro Loading State ── */}
            {isVerifying && (
                <View style={styles.verifyingContainer}>
                    <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
                        <Ionicons name="shield-checkmark" size={ms(40)} color={C.primary} />
                    </Animated.View>
                    <Text style={styles.verifyingTitle}>Verifying Payment</Text>
                    <Text style={styles.verifyingSub}>Please wait while we secure your transaction...</Text>
                    <ActivityIndicator size="large" color={C.primary} style={{ marginTop: vs(20) }} />
                </View>
            )}

            {/* ── Beautiful Receipt Screen ── */}
            {!isVerifying && (
                <Animated.ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingTop: insets.top + vs(20), paddingBottom: insets.bottom + vs(24) },
                    ]}
                    showsVerticalScrollIndicator={false}
                    style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], flex: 1 }}
                >
                    <View style={styles.mainContent}>
                        
                        {/* Checkmark Header */}
                        <View style={styles.headerCheckContainer}>
                            <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
                                <Ionicons name="checkmark" size={ms(44)} color={C.cardBg} />
                            </Animated.View>
                            <Text style={styles.heroTitle}>Payment Successful</Text>
                            <Text style={styles.heroSub}>Your {planName} plan is active and ready.</Text>
                        </View>

                        {/* White Receipt Card */}
                        <View style={styles.receiptCard}>
                            <View style={styles.cardHeader}>
                                <View style={styles.brandContainer}>
                                    <View style={styles.brandLogo}>
                                        <Text style={styles.brandInitial}>N</Text>
                                    </View>
                                    <Text style={styles.brandText}>NeoApp</Text>
                                </View>
                                <View style={styles.receiptBadge}>
                                    <Text style={styles.receiptBadgeText}>RECEIPT</Text>
                                </View>
                            </View>

                            <Text style={styles.amountText}>{formattedAmount}</Text>
                            <Text style={styles.amountSub}>Total Amount Paid</Text>

                            {/* Separator line */}
                            <View style={styles.separatorContainer}>
                                <View style={styles.separatorDot} />
                                <View style={styles.dashedLine} />
                                <View style={styles.separatorDotRight} />
                            </View>

                            {/* Detail Rows */}
                            <View style={styles.detailsContainer}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Plan Details</Text>
                                    <Text style={styles.detailValue}>{planName}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Date Paid</Text>
                                    <Text style={styles.detailValue}>{receipt?.paidAtLabel?.split(',')[0] || fmtDate(new Date())}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Renew Date</Text>
                                    <Text style={styles.detailValue}>{fmtDate(renewDate)}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Receipt No</Text>
                                    <Text style={[styles.detailValue, { fontSize: fsValue - 1 }]}>{receipt?.receiptNumber || "-"}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Transaction ID</Text>
                                    <Text style={[styles.detailValue, { fontSize: fsValue - 2 }]} numberOfLines={1} ellipsizeMode="middle">
                                        {receipt?.paymentId || "-"}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Action Buttons */}
                        <View style={styles.actionsContainer}>
                            <TouchableOpacity
                                style={[styles.secondaryBtn, (!receipt || downloading) && { opacity: 0.6 }]}
                                onPress={onDownloadReceipt}
                                disabled={!receipt || downloading}
                                activeOpacity={0.8}
                            >
                                {downloading ? (
                                    <ActivityIndicator color={C.text} size="small" />
                                ) : (
                                    <Ionicons name="download-outline" size={ms(20)} color={C.text} />
                                )}
                                <Text style={styles.secondaryBtnText}>
                                    {downloading ? "Generating..." : "Download PDF"}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.primaryBtn} onPress={onContinue} activeOpacity={0.8}>
                                <Text style={styles.primaryBtnText}>Back to Dashboard</Text>
                                <Ionicons name="arrow-forward" size={ms(20)} color="#FFFFFF" />
                            </TouchableOpacity>
                        </View>

                    </View>
                </Animated.ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bgStart,
    },
    // ── Bubbles ──
    bubble: {
        position: "absolute",
        borderRadius: 999,
        opacity: 0.5,
    },
    bubble1: {
        width: SW * 0.8,
        height: SW * 0.8,
        backgroundColor: "rgba(0, 122, 255, 0.15)",
        top: -SW * 0.2,
        right: -SW * 0.2,
    },
    bubble2: {
        width: SW * 0.6,
        height: SW * 0.6,
        backgroundColor: "rgba(52, 199, 89, 0.12)",
        bottom: SH * 0.1,
        left: -SW * 0.2,
    },
    bubble3: {
        width: SW * 0.5,
        height: SW * 0.5,
        backgroundColor: "rgba(175, 82, 222, 0.12)",
        top: SH * 0.3,
        right: SW * 0.1,
    },
    
    // ── Verifying State ──
    verifyingContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: hs(30),
        zIndex: 10,
    },
    pulseCircle: {
        width: hs(90),
        height: hs(90),
        borderRadius: hs(45),
        backgroundColor: "rgba(0,122,255,0.08)",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: vs(24),
        borderWidth: 1,
        borderColor: "rgba(0,122,255,0.15)",
    },
    verifyingTitle: {
        fontSize: fsTitle,
        fontWeight: "800",
        color: C.text,
        marginBottom: vs(8),
    },
    verifyingSub: {
        fontSize: fsSub,
        color: C.subtext,
        textAlign: "center",
    },

    // ── Receipt UI ──
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: hs(16),
        alignItems: "center",
    },
    mainContent: {
        maxWidth: 500,
        width: "100%",
        alignItems: "center",
    },
    headerCheckContainer: {
        alignItems: "center",
        marginBottom: vs(32),
    },
    checkCircle: {
        width: hs(80),
        height: hs(80),
        borderRadius: hs(40),
        backgroundColor: C.success,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: vs(16),
        shadowColor: C.success,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    heroTitle: {
        fontSize: fsTitle,
        fontWeight: "800",
        color: C.text,
        marginBottom: vs(6),
    },
    heroSub: {
        fontSize: fsSub,
        color: C.subtext,
        textAlign: "center",
    },

    // ── Card ──
    receiptCard: {
        width: "100%",
        backgroundColor: C.cardBg,
        borderRadius: hs(24),
        paddingVertical: vs(24),
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: hs(24),
        marginBottom: vs(24),
    },
    brandContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: hs(10),
    },
    brandLogo: {
        width: hs(32),
        height: hs(32),
        borderRadius: hs(8),
        backgroundColor: C.primary,
        justifyContent: "center",
        alignItems: "center",
    },
    brandInitial: {
        color: "#fff",
        fontWeight: "800",
        fontSize: ms(16),
    },
    brandText: {
        fontSize: ms(18),
        fontWeight: "800",
        color: C.text,
    },
    receiptBadge: {
        backgroundColor: "#F1F5F9",
        paddingHorizontal: hs(10),
        paddingVertical: vs(4),
        borderRadius: hs(6),
    },
    receiptBadgeText: {
        fontSize: ms(11),
        fontWeight: "800",
        color: C.subtext,
        letterSpacing: 1,
    },
    amountText: {
        fontSize: ms(42),
        fontWeight: "900",
        color: C.text,
        textAlign: "center",
        marginBottom: vs(2),
    },
    amountSub: {
        fontSize: fsLabel,
        color: C.subtext,
        textAlign: "center",
        fontWeight: "600",
    },

    // ── Separator ──
    separatorContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: vs(24),
        position: "relative",
    },
    separatorDot: {
        width: hs(20),
        height: hs(20),
        borderRadius: hs(10),
        backgroundColor: C.bgStart,
        position: "absolute",
        left: -hs(10),
        zIndex: 2,
    },
    separatorDotRight: {
        width: hs(20),
        height: hs(20),
        borderRadius: hs(10),
        backgroundColor: C.bgEnd,
        position: "absolute",
        right: -hs(10),
        zIndex: 2,
    },
    dashedLine: {
        flex: 1,
        height: 1,
        borderWidth: 1,
        borderColor: C.border,
        borderStyle: "dashed",
    },

    // ── Details ──
    detailsContainer: {
        paddingHorizontal: hs(24),
        gap: vs(16),
    },
    detailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    detailLabel: {
        fontSize: fsLabel,
        color: C.subtext,
        fontWeight: "500",
    },
    detailValue: {
        fontSize: fsValue,
        color: C.text,
        fontWeight: "700",
        maxWidth: "60%",
        textAlign: "right",
    },

    // ── Actions ──
    actionsContainer: {
        width: "100%",
        marginTop: vs(32),
        gap: vs(12),
    },
    secondaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: C.border,
        height: vs(54),
        borderRadius: hs(16),
        gap: hs(8),
    },
    secondaryBtnText: {
        color: C.text,
        fontSize: fsBtn,
        fontWeight: "600",
    },
    primaryBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.primary,
        height: vs(54),
        borderRadius: hs(16),
        gap: hs(8),
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    primaryBtnText: {
        color: "#FFFFFF",
        fontSize: fsBtn,
        fontWeight: "800",
    },
});
