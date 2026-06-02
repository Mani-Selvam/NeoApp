import React, { useEffect, useMemo, useState } from "react";
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

/** Horizontal scale – padding, widths, border-radius */
const hs = (n) => Math.round((SW / BASE_W) * n);

/** Vertical scale – heights, vertical spacing */
const vs = (n) => Math.round((SH / BASE_H) * n);

/**
 * Moderate font scale.
 * factor 0.35 keeps fonts readable on large screens without blowing up.
 */
const ms = (n, factor = 0.35) => Math.round(n + (hs(n) - n) * factor);

/** Clamp a value between min and max */
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

// Safe font helpers with min/max guards
const fsTitle = clamp(ms(26), 22, 32);
const fsSub = clamp(ms(14), 12, 17);
const fsEyebrow = clamp(ms(11), 10, 13);
const fsRecNum = clamp(ms(14), 13, 17); // kept smaller so long IDs don't overflow
const fsStamp = clamp(ms(11), 10, 13);
const fsChip = clamp(ms(14), 13, 16);
const fsLabel = clamp(ms(12), 11, 14);
const fsValue = clamp(ms(13), 12, 15);
const fsBtn = clamp(ms(15), 14, 17);
// ───────────────────────────────────────────────────────────────────────────

const C = {
    bg: "#F3F7FB",
    surface: "#FFFFFF",
    text: "#102033",
    subtext: "#526277",
    muted: "#7C8A9A",
    border: "#DCE5EF",
    primary: "#0F62FE",
    primaryDark: "#0A3E9B",
    success: "#16A34A",
    successSoft: "#DCFCE7",
    accent: "#E8F0FF",
};

const fmtDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
};

/** Truncate long strings with ellipsis for display */
const truncate = (str, max = 22) =>
    str && str.length > max ? str.slice(0, max) + "…" : str || "-";

export default function PaymentSuccessScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { refreshBillingPlan } = useAuth();
    const [downloading, setDownloading] = useState(false);

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
        refreshBillingPlan?.().catch(() => {});
    }, [refreshBillingPlan]);

    // ── Receipt HTML (PDF export) ──────────────────────────────────────────
    const receiptHtml = useMemo(() => {
        const amountLabel = receipt?.amountInr
            ? `INR ${Number(receipt.amountInr).toFixed(2)}`
            : formattedAmount;
        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#102033;}
      .sheet{border:1px solid #dce5ef;border-radius:16px;padding:24px;}
      .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;}
      .brand{font-size:24px;font-weight:800;color:#0f62fe;}
      .tag{color:#526277;font-size:11px;letter-spacing:1px;text-transform:uppercase;}
      .title{font-size:20px;font-weight:800;margin:14px 0 4px;}
      .sub{color:#526277;margin-bottom:18px;font-size:14px;}
      table{width:100%;border-collapse:collapse;margin-top:10px;}
      td{padding:10px 0;border-bottom:1px solid #e8eef5;vertical-align:top;}
      td:first-child{color:#6b7b8d;width:40%;font-size:13px;}
      td:last-child{text-align:right;font-weight:700;font-size:13px;word-break:break-all;}
      .foot{margin-top:20px;color:#6b7b8d;font-size:11px;}
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="top">
        <div>
          <div class="brand">NeoApp</div>
          <div class="tag">Payment Receipt</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700">${receipt?.receiptNumber || "-"}</div>
          <div style="color:#6b7b8d;font-size:11px">${receipt?.paidAtLabel || "-"}</div>
        </div>
      </div>
      <div class="title">Subscription Activated</div>
      <div class="sub">Your payment was received successfully.</div>
      <table>
        <tr><td>Plan</td><td>${planName}</td></tr>
        <tr><td>Amount Paid</td><td>${amountLabel}</td></tr>
        <tr><td>Renew Date</td><td>${fmtDate(renewDate)}</td></tr>
        <tr><td>Payment ID</td><td>${receipt?.paymentId || "-"}</td></tr>
        <tr><td>Order ID</td><td>${receipt?.orderId || "-"}</td></tr>
        <tr><td>Customer</td><td>${receipt?.customerName || "-"}</td></tr>
        <tr><td>Email</td><td>${receipt?.customerEmail || "-"}</td></tr>
      </table>
      <div class="foot">Generated by NeoApp billing flow.</div>
    </div>
  </body>
</html>`;
    }, [formattedAmount, planName, receipt, renewDate]);

    // ── Handlers ──────────────────────────────────────────────────────────
    const onDownloadReceipt = async () => {
        if (!receipt) return;
        try {
            setDownloading(true);
            const file = await Print.printToFileAsync({
                html: receiptHtml,
                base64: false,
            });
            const available = await Sharing.isAvailableAsync();
            if (available) {
                await Sharing.shareAsync(file.uri, {
                    mimeType: "application/pdf",
                    dialogTitle: "Download receipt PDF",
                    UTI: "com.adobe.pdf",
                });
            } else {
                Alert.alert("Receipt Ready", `PDF saved at:\n${file.uri}`);
            }
        } catch (e) {
            Alert.alert(
                "Receipt Failed",
                e?.message || "Unable to generate receipt PDF",
            );
        } finally {
            setDownloading(false);
        }
    };

    const onContinue = async () => {
        await refreshBillingPlan?.().catch(() => {});
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    };

    // ── Detail rows ───────────────────────────────────────────────────────
    const detailRows = [
        { label: "Amount Paid", value: formattedAmount, wrap: false },
        { label: "Renew Date", value: fmtDate(renewDate), wrap: false },
        {
            label: "Receipt No",
            value: receipt?.receiptNumber || "-",
            wrap: true,
        },
        { label: "Payment ID", value: receipt?.paymentId || "-", wrap: true },
        { label: "Order ID", value: receipt?.orderId || "-", wrap: true },
        {
            label: "Receipt Email",
            value: receipt?.customerEmail || "-",
            wrap: true,
        },
    ];

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + vs(24) },
                ]}
                showsVerticalScrollIndicator={false}>
                <View style={styles.mainContent}>
                    {/* ── Hero ─────────────────────────────────────────── */}
                    <LinearGradient
                        colors={["#F8FFFB", "#EEF4FF"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.hero}>
                        <View style={styles.badgeRing}>
                            <View style={styles.badgeCore}>
                                <Ionicons
                                    name="checkmark"
                                    size={ms(32)}
                                    color={C.success}
                                />
                            </View>
                        </View>
                        <Text style={styles.heroTitle}>Payment Successful</Text>
                        <Text style={styles.heroSub}>
                            Your {planName} plan is active and ready to use.
                        </Text>
                    </LinearGradient>

                    {/* ── Receipt Card ──────────────────────────────────── */}
                    <View style={styles.receiptCard}>
                        {/* Header row: eyebrow + stamp */}
                        <View style={styles.receiptHeaderRow}>
                            <Text style={styles.receiptEyebrow}>RECEIPT</Text>
                            <View style={styles.receiptStamp}>
                                <Ionicons
                                    name="shield-checkmark"
                                    size={ms(13)}
                                    color={C.primary}
                                />
                                <Text style={styles.receiptStampText}>
                                    Verified
                                </Text>
                            </View>
                        </View>

                        {/* Receipt number – full width, wraps naturally */}
                        <Text style={styles.receiptNumber} selectable>
                            {receipt?.receiptNumber || "Preparing receipt…"}
                        </Text>

                        {/* Plan chip */}
                        <View style={styles.planChip}>
                            <Ionicons
                                name="diamond-outline"
                                size={ms(14)}
                                color={C.primary}
                            />
                            <Text style={styles.planChipText}>{planName}</Text>
                        </View>

                        {/* Detail rows */}
                        <View style={styles.detailList}>
                            {detailRows.map(({ label, value, wrap }, idx) => (
                                <View
                                    key={label}
                                    style={[
                                        styles.detailRow,
                                        idx === detailRows.length - 1 &&
                                            styles.detailRowLast,
                                        // stack label + value vertically for wrap rows on small screens
                                        wrap &&
                                            SW < 360 &&
                                            styles.detailRowStacked,
                                    ]}>
                                    <Text style={styles.detailLabel}>
                                        {label}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.detailValue,
                                            wrap && styles.detailValueWrap,
                                        ]}
                                        selectable>
                                        {value}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* ── Buttons ───────────────────────────────────────── */}
                    <TouchableOpacity
                        style={[
                            styles.secondaryBtn,
                            (!receipt || downloading) && styles.disabledBtn,
                        ]}
                        onPress={onDownloadReceipt}
                        disabled={!receipt || downloading}
                        activeOpacity={0.8}>
                        {downloading ? (
                            <ActivityIndicator color={C.text} size="small" />
                        ) : (
                            <Ionicons
                                name="download-outline"
                                size={ms(18)}
                                color={C.text}
                            />
                        )}
                        <Text style={styles.secondaryBtnText}>
                            {downloading
                                ? "Generating PDF…"
                                : "Download Receipt PDF"}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={onContinue}
                        activeOpacity={0.8}>
                        <Text style={styles.primaryBtnText}>
                            Continue To Home
                        </Text>
                        <Ionicons
                            name="arrow-forward"
                            size={ms(18)}
                            color="#fff"
                        />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bg,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: hs(18),
        paddingTop: vs(14),
        justifyContent: "center",
    },

    // Centers content on tablets, max 520 px wide
    mainContent: {
        maxWidth: 520,
        width: "100%",
        alignSelf: "center",
        gap: vs(14),
    },

    // ── Hero ────────────────────────────────────────────────────────────
    hero: {
        borderRadius: hs(24),
        paddingHorizontal: hs(20),
        paddingVertical: vs(24),
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#D9E7FF",
    },
    badgeRing: {
        width: hs(88),
        height: hs(88),
        borderRadius: hs(44),
        backgroundColor: "rgba(22,163,74,0.10)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: vs(14),
    },
    badgeCore: {
        width: hs(66),
        height: hs(66),
        borderRadius: hs(33),
        backgroundColor: C.successSoft,
        alignItems: "center",
        justifyContent: "center",
    },
    heroTitle: {
        fontSize: fsTitle,
        fontWeight: "900",
        color: C.text,
        textAlign: "center",
    },
    heroSub: {
        marginTop: vs(6),
        fontSize: fsSub,
        lineHeight: fsSub * 1.55,
        textAlign: "center",
        color: C.subtext,
        paddingHorizontal: hs(8),
    },

    // ── Receipt Card ────────────────────────────────────────────────────
    receiptCard: {
        backgroundColor: C.surface,
        borderRadius: hs(22),
        padding: hs(18),
        borderWidth: 1,
        borderColor: C.border,
        shadowColor: "#163A63",
        shadowOpacity: 0.08,
        shadowRadius: hs(16),
        shadowOffset: { width: 0, height: vs(6) },
        elevation: 4,
    },

    // "RECEIPT" eyebrow + "Verified" stamp on the same row
    receiptHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: vs(4),
    },
    receiptEyebrow: {
        fontSize: fsEyebrow,
        fontWeight: "800",
        color: C.muted,
        letterSpacing: hs(0.8),
    },
    receiptStamp: {
        flexDirection: "row",
        alignItems: "center",
        gap: hs(5),
        backgroundColor: C.accent,
        paddingHorizontal: hs(10),
        paddingVertical: vs(5),
        borderRadius: 999,
    },
    receiptStampText: {
        fontSize: fsStamp,
        fontWeight: "800",
        color: C.primaryDark,
    },

    // Receipt number sits full-width below the header row
    receiptNumber: {
        fontSize: fsRecNum,
        fontWeight: "900",
        color: C.text,
        marginBottom: vs(12),
        // Allow long IDs to break at any character
        flexWrap: "wrap",
    },

    // Plan chip
    planChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: hs(7),
        backgroundColor: "#F4F8FF",
        borderRadius: hs(14),
        paddingHorizontal: hs(12),
        paddingVertical: vs(10),
        marginBottom: vs(14),
        alignSelf: "flex-start",
    },
    planChipText: {
        fontSize: fsChip,
        fontWeight: "800",
        color: C.primaryDark,
    },

    // Detail list
    detailList: {
        gap: 0,
    },
    detailRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        paddingVertical: vs(10),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#EDF2F7",
    },
    // Last row: no bottom border
    detailRowLast: {
        borderBottomWidth: 0,
    },
    // On very small screens (<360 dp) stack label above value
    detailRowStacked: {
        flexDirection: "column",
        gap: vs(2),
    },
    detailLabel: {
        // Fixed width so all labels align; shrinks on tiny screens
        width: SW < 360 ? "100%" : hs(106),
        fontSize: fsLabel,
        fontWeight: "600",
        color: C.muted,
        marginTop: vs(1),
    },
    detailValue: {
        flex: 1,
        fontSize: fsValue,
        fontWeight: "800",
        color: C.text,
        textAlign: "right",
    },
    // For IDs / emails: allow natural wrapping instead of truncation
    detailValueWrap: {
        flexWrap: "wrap",
        // Break long tokens (payment IDs, order IDs) anywhere
        // React Native doesn't support word-break, but wrapping is enabled
        // by allowing the text component to grow
    },

    // ── Buttons ─────────────────────────────────────────────────────────
    secondaryBtn: {
        minHeight: vs(52),
        borderRadius: hs(16),
        backgroundColor: "#EAF0F6",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: hs(8),
        paddingHorizontal: hs(16),
    },
    secondaryBtnText: {
        fontSize: fsBtn,
        fontWeight: "800",
        color: C.text,
    },
    primaryBtn: {
        minHeight: vs(54),
        borderRadius: hs(16),
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: hs(8),
        paddingHorizontal: hs(16),
    },
    primaryBtnText: {
        fontSize: fsBtn,
        fontWeight: "900",
        color: "#fff",
    },
    disabledBtn: {
        opacity: 0.55,
    },
});
