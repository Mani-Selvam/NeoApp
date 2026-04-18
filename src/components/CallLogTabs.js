import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    ScaledSize,
    useWindowDimensions,
    Pressable,
    Linking,
    Alert,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as IntentLauncher from "expo-intent-launcher";
import { isEnterpriseMode } from "../utils/callLogPermissions";
import callLogService from "../services/callLogService";
import { onAppEvent } from "../services/appEvents";

// Design tokens (match FollowUpScreen)
const C = {
    bg: "#F1F5F9",
    card: "#FFFFFF",
    primary: "#2563EB",
    success: "#059669",
    warning: "#F59E0B",
    danger: "#DC2626",
    gray300: "#D1D5DB",
    gray500: "#6B7280",
    gray700: "#374151",
    gray900: "#111827",
};

const CALL_TYPES = [
    {
        key: "incoming",
        label: "Incoming",
        icon: "call-outline",
        color: C.success,
    },
    {
        key: "outgoing",
        label: "Outgoing",
        icon: "call-outline",
        color: C.primary,
    },
    {
        key: "missed",
        label: "Missed",
        icon: "close-circle-outline",
        color: C.danger,
    },
    {
        key: "rejected",
        label: "Rejected",
        icon: "close-circle-outline",
        color: C.warning,
    },
];

/**
 * CallLogTabs Component
 * Displays call logs for an enquiry's phone number in tabbed format
 * Only renders if enterprise mode is enabled
 * Features sub-tabs for call log types: Incoming, Outgoing, Missed, Rejected
 */
const CallLogTabs = ({ phoneNumber, onRefresh, enquiry }) => {
    const { width } = useWindowDimensions();
    const [selectedTab, setSelectedTab] = useState("incoming");
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Check if enterprise mode - if not, don't render anything
    if (!isEnterpriseMode()) {
        return null;
    }

    // Validate phone number
    if (!phoneNumber || !phoneNumber.trim()) {
        return null;
    }

    /**
     * Fetch call logs for the selected tab
     */
    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            console.log("[CallLogTabs] 📞 Fetching call logs:", {
                phoneNumber,
                selectedTab,
                timestamp: new Date().toISOString(),
            });

            const result = await callLogService.getCallLogsByPhone(
                phoneNumber,
                selectedTab,
                1,
                100,
            );

            console.log("[CallLogTabs] 📞 Response:", result);

            if (result.success) {
                console.log(
                    `[CallLogTabs] ✅ Loaded ${result.data?.length || 0} logs`,
                );
                setLogs(result.data || []);
            } else {
                console.error("[CallLogTabs] ❌ Backend error:", result.error);
                const errorMsg = result.error || "Failed to fetch call logs";
                setError(errorMsg);
                setLogs([]);
            }
        } catch (err) {
            console.error("[CallLogTabs] ❌ Exception:", {
                message: err.message,
                code: err?.response?.status,
                data: err?.response?.data,
                fullError: err,
            });
            setError(err.message || "Failed to fetch call logs");
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [phoneNumber, selectedTab]);

    /**
     * Load logs when tab changes
     */
    useEffect(() => {
        fetchLogs();
    }, [selectedTab, phoneNumber, fetchLogs]);

    /**
     * Refresh logs when navigating back to screen
     */
    useFocusEffect(
        useCallback(() => {
            fetchLogs();
        }, [fetchLogs]),
    );

    /**
     * Listen for call log sync events and refresh
     */
    useEffect(() => {
        const unsubscribe = onAppEvent("CALL_LOG_SYNCED", () => {
            console.log("[CallLogTabs] Sync event received, refreshing");
            fetchLogs();
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [fetchLogs]);

    /**
     * Make a phone call directly (Android: no dialer via Intent, iOS: tel: scheme)
     * In Expo Go: Uses tel: scheme (opens dialer)
     * In dev build: Uses Intent for direct call
     */
    const handleMakeCall = useCallback(async () => {
        if (!phoneNumber) {
            Alert.alert("Error", "No phone number available");
            return;
        }

        const phoneNumberClean = phoneNumber.replace(/\D/g, "");
        console.log("[CallLogTabs] 📞 Making call to:", phoneNumberClean);

        try {
            if (Platform.OS === "android") {
                // Try Intent first (works in dev build)
                let callAttempted = false;
                try {
                    console.log(
                        "[CallLogTabs] Attempting direct call via Intent...",
                    );
                    await IntentLauncher.startActivityAsync(
                        "android.intent.action.CALL",
                        {
                            data: `tel:${phoneNumberClean}`,
                        },
                    );
                    console.log(
                        "[CallLogTabs] ✅ Direct call initiated via Intent",
                    );
                    callAttempted = true;
                } catch (intentErr) {
                    const errMsg = String(intentErr.message || "");
                    console.warn("[CallLogTabs] Intent call failed:", errMsg);

                    // Check if it's a permission error
                    if (
                        errMsg.includes("Permission") ||
                        errMsg.includes("CALL_PHONE") ||
                        errMsg.includes("exponent")
                    ) {
                        console.log(
                            "[CallLogTabs] Permission denied or Expo Go limitation detected",
                        );
                        console.log(
                            "[CallLogTabs] Falling back to tel: scheme (dialer)...",
                        );

                        // Show info that we're using dialer
                        Alert.alert(
                            "Using Dialer",
                            "For direct calling without dialer, build a dev version:\n\nexpo run:android\n\nFor now, using dialer...",
                            [
                                {
                                    text: "Proceed with Dialer",
                                    onPress: async () => {
                                        try {
                                            await Linking.openURL(
                                                `tel:${phoneNumberClean}`,
                                            );
                                            console.log(
                                                "[CallLogTabs] ✅ Dialer opened",
                                            );
                                        } catch (err) {
                                            Alert.alert(
                                                "Error",
                                                "Could not open dialer",
                                            );
                                        }
                                    },
                                },
                            ],
                        );
                    } else {
                        // Unknown error, still try tel: scheme
                        console.log(
                            "[CallLogTabs] Other error, trying tel: scheme",
                        );
                        try {
                            await Linking.openURL(`tel:${phoneNumberClean}`);
                            console.log("[CallLogTabs] ✅ Dialer opened");
                        } catch (linkErr) {
                            Alert.alert(
                                "Error",
                                "Could not make call: " + linkErr.message,
                            );
                        }
                    }
                }
            } else {
                // iOS: Use tel: scheme
                console.log("[CallLogTabs] Using tel: scheme (iOS)");
                try {
                    await Linking.openURL(`tel:${phoneNumberClean}`);
                    console.log("[CallLogTabs] ✅ Call initiated (iOS)");
                } catch (err) {
                    Alert.alert("Error", "Could not make call: " + err.message);
                }
            }
        } catch (err) {
            console.error("[CallLogTabs] ❌ Call error:", err);
            Alert.alert(
                "Error",
                "Could not make call: " + (err.message || String(err)),
            );
        }
    }, [phoneNumber]);

    /**
     * Render individual call log item
     */
    const renderLogItem = ({ item }) => {
        const { date, time } = callLogService.formatCallTime(item.callTime);
        const duration = callLogService.formatDuration(item.callDuration);
        const callTypeObj = CALL_TYPES.find((ct) => ct.key === item.callType);

        return (
            <View style={styles.logItem}>
                <View
                    style={[
                        styles.logIcon,
                        { backgroundColor: callTypeObj?.color },
                    ]}>
                    <Ionicons
                        name={callTypeObj?.icon || "call-outline"}
                        size={18}
                        color="#FFFFFF"
                    />
                </View>

                <View style={styles.logDetails}>
                    <Text style={styles.logDate}>{date}</Text>
                    <Text style={styles.logTime}>{time}</Text>
                </View>

                <View style={styles.logDuration}>
                    <Text style={styles.duration}>{duration}</Text>
                </View>
            </View>
        );
    };

    /**
     * Render empty state
     */
    const renderEmpty = () => (
        <View style={styles.empty}>
            <Ionicons name="call-outline" size={48} color={C.gray300} />
            <Text style={styles.emptyText}>No {selectedTab} calls</Text>
        </View>
    );

    const tabWidth = width / 4 - 2;

    return (
        <View style={styles.container}>
            {/* Header Section */}
            <View style={styles.headerSection}>
                <View style={styles.headerContent}>
                    <Ionicons
                        name="person-circle-outline"
                        size={32}
                        color={C.primary}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>Contact</Text>
                        <Text style={styles.headerSubtitle}>{phoneNumber}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={handleMakeCall}
                        style={styles.callButton}
                        activeOpacity={0.8}>
                        <Ionicons name="call" size={18} color="#FFFFFF" />
                        <Text style={styles.callButtonText}>Call</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Sub-Tab Headers for Call Log Types */}
            <View style={styles.tabsContainer}>
                {CALL_TYPES.map((tab) => (
                    <Pressable
                        key={tab.key}
                        onPress={() => setSelectedTab(tab.key)}
                        style={[
                            styles.tab,
                            selectedTab === tab.key && styles.tabActive,
                            { width: tabWidth },
                        ]}>
                        <Ionicons
                            name={tab.icon}
                            size={16}
                            color={
                                selectedTab === tab.key ? C.primary : C.gray500
                            }
                            style={styles.tabIcon}
                        />
                        <Text
                            style={[
                                styles.tabLabel,
                                selectedTab === tab.key &&
                                    styles.tabLabelActive,
                            ]}
                            numberOfLines={1}>
                            {tab.label}
                        </Text>
                        {logs.length > 0 && selectedTab === tab.key && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>
                                    {logs.length}
                                </Text>
                            </View>
                        )}
                    </Pressable>
                ))}
            </View>

            {/* Loading State */}
            {loading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={styles.loadingText}>Loading calls...</Text>
                </View>
            )}

            {/* Error State */}
            {error && !loading && (
                <View style={styles.errorContainer}>
                    <Ionicons
                        name="alert-circle-outline"
                        size={24}
                        color={C.danger}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        onPress={fetchLogs}
                        style={styles.retryButton}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Logs List */}
            {!loading && !error && (
                <FlatList
                    data={logs}
                    renderItem={renderLogItem}
                    keyExtractor={(item) => item._id}
                    ListEmptyComponent={renderEmpty}
                    scrollEnabled={false}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.card,
        display: "flex",
        minHeight: 0,
    },

    tabsContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: C.gray300,
        backgroundColor: C.card,
    },

    tab: {
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderBottomWidth: 3,
        borderBottomColor: "transparent",
        justifyContent: "center",
    },

    tabActive: {
        borderBottomColor: C.primary,
    },

    tabIcon: {
        marginBottom: 2,
    },

    tabLabel: {
        fontSize: 11,
        fontWeight: "600",
        color: C.gray500,
        textAlign: "center",
    },

    tabLabelActive: {
        color: C.primary,
        fontWeight: "700",
    },

    badge: {
        position: "absolute",
        top: 0,
        right: 0,
        backgroundColor: C.danger,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: "center",
        alignItems: "center",
    },

    badgeText: {
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: "700",
    },

    loadingContainer: {
        alignItems: "center",
        paddingVertical: 24,
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
    },

    loadingText: {
        color: C.gray500,
        fontSize: 13,
        marginLeft: 8,
    },

    errorContainer: {
        alignItems: "center",
        paddingVertical: 20,
        paddingHorizontal: 16,
    },

    errorText: {
        color: C.danger,
        fontSize: 13,
        marginTop: 8,
        textAlign: "center",
    },

    retryButton: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: C.primary,
        borderRadius: 6,
    },

    retryText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "600",
    },

    listContent: {
        paddingHorizontal: 16,
        paddingVertical: 4,
    },

    logItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 8,
        backgroundColor: C.bg,
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
    },

    logIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },

    logDetails: {
        flex: 1,
    },

    logDate: {
        fontSize: 12,
        fontWeight: "600",
        color: C.gray900,
    },

    logTime: {
        fontSize: 11,
        color: C.gray500,
        marginTop: 2,
    },

    logDuration: {
        justifyContent: "center",
        alignItems: "flex-end",
    },

    duration: {
        fontSize: 12,
        fontWeight: "600",
        color: C.primary,
    },

    empty: {
        alignItems: "center",
        paddingVertical: 32,
        paddingHorizontal: 16,
    },

    emptyText: {
        fontSize: 13,
        color: C.gray500,
        marginTop: 8,
        textAlign: "center",
    },

    headerSection: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.gray300,
    },

    headerContent: {
        flexDirection: "row",
        alignItems: "center",
    },

    headerTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: C.gray900,
    },

    headerSubtitle: {
        fontSize: 12,
        color: C.gray500,
        marginTop: 3,
    },

    callButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: C.success,
        borderRadius: 8,
    },

    callButtonText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "600",
    },
});

export default CallLogTabs;
