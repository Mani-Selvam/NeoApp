import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Alert,
    Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PieChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

import getApiClient from "../services/apiClient";
import { useAuth } from "../contexts/AuthContext";

const { width } = Dimensions.get("window");

// ─── iOS Design Tokens (light only) ──────────────────────────────────────────────
const T = {
    bg: "#F2F2F7",          // iOS grouped background
    bgCard: "#FFFFFF",
    bgChip: "#F2F2F7",

    textPrimary: "#000000",
    textSecond: "#6E6E73",
    textMuted: "#AEAEB2",

    separator: "rgba(60,60,67,0.12)",

    blue: "#007AFF",
    blueSoft: "#E8F1FF",
    green: "#34C759",
    greenSoft: "#E7FBEC",
    orange: "#FF9500",
    orangeSoft: "#FFF3E0",
    red: "#FF3B30",
    redSoft: "#FFEDED",
    purple: "#AF52DE",
    purpleSoft: "#F6EBFD",
    indigo: "#5856D6",
    indigoSoft: "#ECEBFB",
};

export default function UsageLimitScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user, billingInfo } = useAuth();
    const [loading, setLoading] = useState(true);
    const [usageData, setUsageData] = useState({ limit: 50, used: 0, remaining: 50 });

    useEffect(() => {
        fetchUsage();
    }, []);

    const fetchUsage = async () => {
        try {
            setLoading(true);
            const client = await getApiClient();
            const res = await client.get("/assistant/usage");
            if (res.data?.success) {
                setUsageData(res.data.usage);
            }
        } catch (error) {
            console.error("Failed to fetch usage", error);
            Alert.alert("Error", "Could not load usage data");
        } finally {
            setLoading(false);
        }
    };

    const handleTopUp = async () => {
        try {
            setLoading(true);
            const client = await getApiClient();
            const res = await client.post("/ai-payments/razorpay/order");
            if (res.data?.success) {
                navigation.navigate("RazorpayCheckoutScreen", {
                    isAiTopup: true,
                    keyId: res.data.keyId,
                    orderId: res.data.razorpayOrderId,
                    amountInrPaise: res.data.amountInrPaise,
                    amountInr: res.data.amountInr,
                    displayCurrency: res.data.currency,
                    notes: { planName: "AI Voice Requests Top-up" }
                });
            } else {
                Alert.alert("Error", res.data?.message || "Failed to create order");
            }
            setLoading(false);
        } catch (error) {
            console.error("Top-up error", error);
            Alert.alert("Error", "Payment initialization failed");
            setLoading(false);
        }
    };

    const downloadPDF = async () => {
        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #000; }
                        h1 { color: #007AFF; }
                        .card { background: #F2F2F7; padding: 20px; border-radius: 14px; margin-top: 20px; }
                        .stat { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
                        .label { color: #6E6E73; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
                        .footer { margin-top: 40px; font-size: 12px; color: #AEAEB2; text-align: center; }
                    </style>
                </head>
                <body>
                    <h1>AI Voice Assistant - Usage Report</h1>
                    <p><strong>Company:</strong> ${user?.company?.name || "Your Company"}</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    
                    <div class="card">
                        <div class="stat">${usageData.limit}</div>
                        <div class="label">Yearly Limit</div>
                        <br/>
                        <div class="stat" style="color: #34C759;">${usageData.used}</div>
                        <div class="label">Used Requests</div>
                        <br/>
                        <div class="stat" style="color: #007AFF;">${usageData.remaining}</div>
                        <div class="label">Remaining Requests</div>
                    </div>
                    
                    <div class="footer">
                        Generated automatically by NeoApp
                    </div>
                </body>
            </html>
        `;

        try {
            if (Platform.OS === 'web') {
                await Print.printAsync({ html: htmlContent });
            } else {
                const { uri } = await Print.printToFileAsync({ html: htmlContent });
                await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            }
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to generate PDF");
        }
    };

    const chartData = [
        {
            name: "Used",
            population: usageData.used,
            color: T.blue,
            legendFontColor: T.textSecond,
            legendFontSize: 13
        },
        {
            name: "Remaining",
            population: usageData.remaining,
            color: T.bgChip,
            legendFontColor: T.textMuted,
            legendFontSize: 13
        }
    ];

    const usedPct = usageData.limit > 0 ? Math.min(100, Math.round((usageData.used / usageData.limit) * 100)) : 0;
    const isLow = usageData.remaining <= 100 || usageData.used >= usageData.limit;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* ── iOS Large Title Header ── */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow} activeOpacity={0.6}>
                    <Ionicons name="chevron-back" size={26} color={T.blue} />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => Alert.alert("Usage Limits", "Your AI voice assistant quota resets yearly. Top-ups are permanent until used.")} 
                    style={styles.headerIconBtn} 
                    activeOpacity={0.6}
                >
                    <Ionicons name="information-circle-outline" size={24} color={T.blue} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color={T.blue} />
                    <Text style={styles.loaderText}>Loading your usage…</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
                >
                    {/* Large title */}
                    <Text style={styles.largeTitle}>Usage & Limits</Text>
                    <Text style={styles.largeSubtitle}>AI voice assistant quota for your company</Text>

                    {/* ── Donut Card ── */}
                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <Text style={styles.cardHeaderText}>Yearly quota</Text>
                            <View style={[styles.statusBadge, isLow ? { backgroundColor: T.redSoft } : { backgroundColor: T.greenSoft }]}>
                                <Ionicons name={isLow ? "alert-circle" : "checkmark-circle"} size={13} color={isLow ? T.red : T.green} />
                                <Text style={[styles.statusBadgeText, { color: isLow ? T.red : T.green }]}>
                                    {usedPct}%
                                </Text>
                            </View>
                        </View>

                        <View style={styles.chartWrap}>
                            <PieChart
                                data={chartData}
                                width={width - 80}
                                height={176}
                                hasLegend={false}
                                chartConfig={{
                                    backgroundColor: "transparent",
                                    backgroundGradientFrom: "#ffffff",
                                    backgroundGradientTo: "#ffffff",
                                    color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                                }}
                                accessor={"population"}
                                backgroundColor={"transparent"}
                                paddingLeft={"0"}
                                absolute
                            />
                            <View style={styles.chartCenter} pointerEvents="none">
                                <Text style={styles.chartCenterValue}>{usageData.used}</Text>
                                <Text style={styles.chartCenterLabel}>of {usageData.limit}</Text>
                            </View>
                        </View>

                        <View style={styles.legendRow}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: T.blue }]} />
                                <Text style={styles.legendText}>Used</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: T.bgChip }]} />
                                <Text style={styles.legendText}>Remaining</Text>
                            </View>
                        </View>
                    </View>

                    {/* ── iOS Grouped List: Stats ── */}
                    <Text style={styles.sectionLabel}>OVERVIEW</Text>
                    <View style={styles.groupCard}>
                        <View style={styles.row}>
                            <View style={[styles.rowIcon, { backgroundColor: T.indigoSoft }]}>
                                <Ionicons name="layers-outline" size={16} color={T.indigo} />
                            </View>
                            <Text style={styles.rowLabel}>Yearly limit</Text>
                            <Text style={styles.rowValue}>{usageData.limit}</Text>
                        </View>
                        <View style={styles.separator} />
                        <View style={styles.row}>
                            <View style={[styles.rowIcon, { backgroundColor: T.orangeSoft }]}>
                                <Ionicons name="flash-outline" size={16} color={T.orange} />
                            </View>
                            <Text style={styles.rowLabel}>Used</Text>
                            <Text style={[styles.rowValue, { color: T.orange }]}>{usageData.used}</Text>
                        </View>
                        <View style={styles.separator} />
                        <View style={styles.row}>
                            <View style={[styles.rowIcon, { backgroundColor: T.greenSoft }]}>
                                <Ionicons name="wallet-outline" size={16} color={T.green} />
                            </View>
                            <Text style={styles.rowLabel}>Remaining</Text>
                            <Text style={[styles.rowValue, { color: T.green }]}>{usageData.remaining}</Text>
                        </View>
                    </View>

                    {/* ── Progress bar card ── */}
                    <Text style={styles.sectionLabel}>PROGRESS</Text>
                    <View style={styles.groupCard}>
                        <View style={{ padding: 16 }}>
                            <View style={styles.progressHeaderRow}>
                                <Text style={styles.progressLabel}>Requests used</Text>
                                <Text style={styles.progressValue}>{usageData.used} / {usageData.limit}</Text>
                            </View>
                            <View style={styles.progressTrack}>
                                <View style={[
                                    styles.progressFill,
                                    { width: `${usedPct}%`, backgroundColor: isLow ? T.red : T.blue }
                                ]} />
                            </View>
                            {isLow && (
                                <View style={styles.warningRow}>
                                    <Ionicons name="information-circle" size={15} color={T.red} />
                                    <Text style={styles.progressWarning}>
                                        Running low — top up to keep Neo running smoothly.
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* ── Top up ── */}
                    {isLow && (
                        <>
                            <Text style={styles.sectionLabel}>TOP UP</Text>
                            <View style={styles.groupCard}>
                                <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
                                    <View style={[styles.rowIcon, { backgroundColor: T.blueSoft, width: 40, height: 40, borderRadius: 12 }]}>
                                        <Ionicons name="add-circle" size={22} color={T.blue} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.topUpTitle}>Need more requests?</Text>
                                        <Text style={styles.topUpSub}>
                                            Get {usageData.extraRequests || 1000} extra requests instantly
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.separator} />
                                {Platform.OS === 'ios' ? (
                                    <View style={styles.actionRow}>
                                        <Ionicons name="globe-outline" size={18} color={T.textMuted} />
                                        <Text style={[styles.actionRowText, { color: T.textSecond }]}>
                                            Visit your web dashboard to purchase top-ups.
                                        </Text>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.actionRow} onPress={handleTopUp} activeOpacity={0.6}>
                                        <Ionicons name="card-outline" size={18} color={T.blue} />
                                        <Text style={styles.actionRowText}>
                                            Pay ₹{usageData.extraPrice || 500} for {usageData.extraRequests || 1000} more
                                        </Text>
                                        <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}

                    {/* ── Export ── */}
                    <Text style={styles.sectionLabel}>EXPORT</Text>
                    <View style={styles.groupCard}>
                        <TouchableOpacity style={styles.actionRow} onPress={downloadPDF} activeOpacity={0.6}>
                            <Ionicons name="document-text-outline" size={18} color={T.blue} />
                            <Text style={styles.actionRowText}>Download usage report (PDF)</Text>
                            <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.footnote}>
                        Quota resets yearly. Top-ups are added on top of your existing yearly allowance and don&apos;t expire.
                    </Text>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: T.bg,
    },

    // Header
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    backRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 4,
        paddingRight: 8,
    },
    backText: {
        fontSize: 17,
        color: T.blue,
        marginLeft: 2,
    },
    headerIconBtn: {
        padding: 4,
        marginRight: 8,
    },

    // Loader
    loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
    loaderText: { fontSize: 13, color: T.textSecond },

    // Content
    content: { paddingHorizontal: 16 },

    largeTitle: {
        fontSize: 34,
        fontWeight: "800",
        color: T.textPrimary,
        letterSpacing: 0.3,
        marginTop: 4,
        marginBottom: 4,
    },
    largeSubtitle: {
        fontSize: 15,
        color: T.textSecond,
        marginBottom: 20,
        lineHeight: 20,
    },

    // Donut card
    card: {
        backgroundColor: T.bgCard,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    cardHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
    },
    cardHeaderText: {
        fontSize: 17,
        fontWeight: "700",
        color: T.textPrimary,
    },
    statusBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    statusBadgeText: {
        fontSize: 12,
        fontWeight: "700",
    },
    chartWrap: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 6,
        position: "relative",
    },
    chartCenter: {
        position: "absolute",
        left: 0,
        right: "50%",
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    chartCenterValue: {
        fontSize: 28,
        fontWeight: "800",
        color: T.textPrimary,
        lineHeight: 32,
    },
    chartCenterLabel: {
        fontSize: 12,
        color: T.textMuted,
        fontWeight: "600",
        marginTop: 2,
    },
    legendRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 24,
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: T.separator,
    },
    legendItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    legendDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
    },
    legendText: {
        fontSize: 13,
        fontWeight: "600",
        color: T.textSecond,
    },

    // Section label (iOS grouped table style)
    sectionLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: T.textMuted,
        letterSpacing: 0.6,
        marginBottom: 8,
        marginLeft: 4,
    },

    // Grouped card / table
    groupCard: {
        backgroundColor: T.bgCard,
        borderRadius: 14,
        marginBottom: 24,
        overflow: "hidden",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 13,
        gap: 12,
    },
    rowIcon: {
        width: 30,
        height: 30,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
    },
    rowLabel: {
        flex: 1,
        fontSize: 16,
        color: T.textPrimary,
    },
    rowValue: {
        fontSize: 16,
        fontWeight: "700",
        color: T.textPrimary,
    },
    separator: {
        height: 1,
        backgroundColor: T.separator,
        marginLeft: 58,
    },

    // Progress
    progressHeaderRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    progressLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: T.textPrimary,
    },
    progressValue: {
        fontSize: 14,
        fontWeight: "600",
        color: T.textSecond,
    },
    progressTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: T.bgChip,
        overflow: "hidden",
    },
    progressFill: {
        height: 8,
        borderRadius: 4,
    },
    warningRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 12,
    },
    progressWarning: {
        flex: 1,
        fontSize: 12.5,
        color: T.red,
        fontWeight: "600",
        lineHeight: 17,
    },

    // Top up
    topUpTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: T.textPrimary,
        marginBottom: 2,
    },
    topUpSub: {
        fontSize: 13,
        color: T.textSecond,
    },

    // Action row (tappable list item)
    actionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    actionRowText: {
        flex: 1,
        fontSize: 16,
        color: T.blue,
        fontWeight: "500",
    },

    footnote: {
        fontSize: 13,
        color: T.textMuted,
        lineHeight: 18,
        paddingHorizontal: 4,
        marginTop: -8,
        marginBottom: 8,
    },
});