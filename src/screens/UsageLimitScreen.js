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
import { SafeAreaView } from "react-native-safe-area-context";
import { PieChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

import getApiClient from "../services/apiClient";
import { useAuth } from "../contexts/AuthContext";

const { width } = Dimensions.get("window");

export default function UsageLimitScreen({ navigation }) {
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
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
                        h1 { color: #4F6EF7; }
                        .card { background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; margin-top: 20px; }
                        .stat { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
                        .label { color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
                        .footer { margin-top: 40px; font-size: 12px; color: #9ca3af; text-align: center; }
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
                        <div class="stat" style="color: #10B981;">${usageData.used}</div>
                        <div class="label">Used Requests</div>
                        <br/>
                        <div class="stat" style="color: #3b82f6;">${usageData.remaining}</div>
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
            color: "#4F6EF7",
            legendFontColor: "#374151",
            legendFontSize: 14
        },
        {
            name: "Remaining",
            population: usageData.remaining,
            color: "#E5EAF3",
            legendFontColor: "#9CA3AF",
            legendFontSize: 14
        }
    ];

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>AI Usage Limits</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loader}>
                    <ActivityIndicator size="large" color="#4F6EF7" />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Yearly Voice Assistant Quota</Text>
                        <Text style={styles.cardSub}>Track your company's yearly AI requests.</Text>
                        
                        <View style={styles.chartWrap}>
                            <PieChart
                                data={chartData}
                                width={width - 60}
                                height={200}
                                chartConfig={{
                                    backgroundColor: "#ffffff",
                                    backgroundGradientFrom: "#ffffff",
                                    backgroundGradientTo: "#ffffff",
                                    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                }}
                                accessor={"population"}
                                backgroundColor={"transparent"}
                                paddingLeft={"15"}
                                absolute
                            />
                        </View>
                        
                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.statVal}>{usageData.limit}</Text>
                                <Text style={styles.statLabel}>Yearly Limit</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={[styles.statVal, { color: '#10B981' }]}>{usageData.used}</Text>
                                <Text style={styles.statLabel}>Used</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={[styles.statVal, { color: '#3b82f6' }]}>{usageData.remaining}</Text>
                                <Text style={styles.statLabel}>Remaining</Text>
                            </View>
                        </View>
                        
                        {(usageData.remaining <= 100 || usageData.used >= usageData.limit) && (
                            <TouchableOpacity style={styles.topUpBtn} onPress={handleTopUp}>
                                <Text style={styles.topUpBtnText}>
                                    Pay ${usageData.extraPrice || 500} for {usageData.extraRequests || 1000} More Requests
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity style={styles.pdfBtn} onPress={downloadPDF}>
                        <Ionicons name="document-text-outline" size={20} color="#fff" />
                        <Text style={styles.pdfBtnText}>Download PDF Report</Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F8F9FC" },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#ECEEF5"
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
    loader: { flex: 1, justifyContent: "center", alignItems: "center" },
    content: { padding: 16 },
    card: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 3,
        marginBottom: 20
    },
    cardTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 },
    cardSub: { fontSize: 14, color: "#6B7280", marginBottom: 24 },
    chartWrap: { alignItems: "center", justifyContent: "center", marginBottom: 20 },
    statsRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#ECEEF5", paddingTop: 20 },
    statBox: { flex: 1, alignItems: "center" },
    statVal: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 4 },
    statLabel: { fontSize: 12, color: "#6B7280", textTransform: "uppercase", fontWeight: "600" },
    pdfBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#111827",
        padding: 16,
        borderRadius: 12,
        gap: 8,
        marginTop: 10
    },
    pdfBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    topUpBtn: {
        marginTop: 20,
        backgroundColor: "#10B981",
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
    },
    topUpBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" }
});
