import React, { useEffect, useState, useCallback, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    useWindowDimensions,
    Pressable,
    Linking,
    Alert,
    Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { isEnterpriseMode, requestAndCheckCallLog } from "../utils/callLogPermissions";
import { ensurePhoneCallPermission } from "../utils/phoneCallPermissions";
import callLogService, { syncDeviceCallLogs } from "../services/callLogService";
import { onAppEvent } from "../services/appEvents";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: "#F1F5F9",
    card: "#FFFFFF",
    primary: "#2563EB",
    success: "#059669",
    warning: "#F59E0B",
    danger: "#DC2626",
    info: "#0891B2",
    gray300: "#D1D5DB",
    gray500: "#6B7280",
    gray700: "#374151",
    gray900: "#111827",
};

const CALL_TYPES = [
    // {
    //     key: "incoming",
    //     label: "Incoming",
    //     icon: "arrow-down-circle-outline",
    //     color: C.info,
    // },
    {
        key: "outgoing",
        label: "Outgoing",
        icon: "arrow-up-circle-outline",
        color: C.success,
    },
    // {
    //     key: "missed",
    //     label: "Missed",
    //     icon: "close-circle-outline",
    //     color: C.danger,
    // },
    // {
    //     key: "rejected",
    //     label: "Rejected",
    //     icon: "ban-outline",
    //     color: C.warning,
    // },
];

/**
 * CallLogTabs Component
 * Displays real call logs from backend for an enquiry's phone number.
 * Tabs: Incoming | Outgoing | Missed | Rejected
 * Call button directly initiates a phone call (no dialer pop-up where possible).
 */
const CallLogTabs = ({ phoneNumber, enquiry }) => {
    const { width } = useWindowDimensions();
    // enterprise flag stored in ref so hooks order never changes
    const enterpriseRef = useRef(isEnterpriseMode());

    const [selectedTab, setSelectedTab] = useState("incoming");
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState("");
    const [error, setError] = useState(null);
    const hasSyncedRef = useRef(false);

    // ── Sync device logs to server ────────────────────────────────────────────
    const syncLogs = useCallback(async ({ silent = false } = {}) => {
        if (!enterpriseRef.current) return;

        // Web browser cannot access device call logs (native Android only)
        if (Platform.OS === "web") {
            if (!silent) setSyncStatus("Web: sync not available — use native app to sync");
            return;
        }

        // Request permission if not yet granted
        const { enabled, reason } = await requestAndCheckCallLog();
        if (!enabled) {
            if (!silent) setSyncStatus(`Permission: ${reason}`);
            return;
        }

        setSyncing(true);
        setSyncStatus("Syncing device call logs\u2026");
        try {
            const result = await syncDeviceCallLogs();
            if (result.success) {
                const msg = result.inserted > 0
                    ? `Synced ${result.inserted} new call${result.inserted !== 1 ? "s" : ""}`
                    : "Up to date";
                setSyncStatus(msg);
            } else {
                setSyncStatus(result.error || "Sync failed");
            }
        } catch (err) {
            setSyncStatus("Sync error: " + err.message);
        } finally {
            setSyncing(false);
        }
    }, []);

    // ── Fetch call logs ───────────────────────────────────────────────────────
    const fetchLogs = useCallback(async () => {
        const phone = String(phoneNumber || "").trim();
        if (!phone) {
            setError("No phone number available");
            return;
        }

        // If enterprise mode is disabled, don't fetch
        if (!enterpriseRef.current) {
            console.log(
                "[CallLogTabs] Enterprise mode disabled - call logs unavailable",
            );
            setError("Call logs are not available in this build");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            console.log("[CallLogTabs] Fetching logs:", { phone, selectedTab });

            const result = await callLogService.getCallLogsByPhone(
                phone,
                selectedTab,
                1,
                100,
            );

            if (result.success) {
                setLogs(result.data || []);
            } else {
                console.warn("[CallLogTabs] Backend error:", result.error);
                setError(result.error || "Failed to fetch call logs");
                setLogs([]);
            }
        } catch (err) {
            console.error("[CallLogTabs] Exception:", err.message);
            setError(err.message || "Failed to fetch call logs");
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [phoneNumber, selectedTab]);

    // Re-fetch when tab or phone number changes
    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Auto-sync device logs once on mount, then fetch
    useEffect(() => {
        if (hasSyncedRef.current) return;
        hasSyncedRef.current = true;
        syncLogs({ silent: true }).then(() => fetchLogs());
    }, [syncLogs, fetchLogs]);

    // Re-fetch when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            fetchLogs();
        }, [fetchLogs]),
    );

    // Re-fetch when a sync event fires
    useEffect(() => {
        const unsubscribe = onAppEvent("CALL_LOG_SYNCED", () => {
            console.log("[CallLogTabs] Sync event — refreshing");
            fetchLogs();
        });
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
    }, [fetchLogs]);

    // ── Make a direct phone call ──────────────────────────────────────────────
    const handleMakeCall = useCallback(async () => {
        const digits = String(phoneNumber || "").replace(/\D/g, "");
        if (!digits) {
            Alert.alert("No Number", "No valid phone number to call.");
            return;
        }

        try {
            // Initiate the call
            if (Platform.OS === "android") {
                const { granted } = await ensurePhoneCallPermission();
                if (!granted) {
                    Alert.alert(
                        "Permission required",
                        "Allow Phone permission to place direct calls from the app.",
                        [
                            { text: "Cancel", style: "cancel" },
                            {
                                text: "Open dialer",
                                onPress: async () => {
                                    // Log it even if using dialer
                                    await callLogService.logManualCall(digits, {
                                        name: enquiry?.name,
                                        enquiryId: enquiry?._id,
                                    });
                                    Linking.openURL(`tel:${digits}`).catch(() => {});
                                    fetchLogs();
                                },
                            },
                        ],
                    );
                    return;
                }
                // Try android.intent.action.CALL (direct call — needs CALL_PHONE permission)
                try {
                    const IntentLauncher = require("expo-intent-launcher");
                    await IntentLauncher.startActivityAsync(
                        "android.intent.action.CALL",
                        { data: `tel:${digits}` },
                    );

                    // Successfully pushed intent, log it manually since it's an app-driven call
                    await callLogService.logManualCall(digits, {
                        name: enquiry?.name,
                        enquiryId: enquiry?._id,
                    });
                    fetchLogs();
                    return;
                } catch (intentErr) {
                    console.warn(
                        "[CallLogTabs] Direct call intent failed:",
                        intentErr.message,
                    );
                    // fall through to tel: scheme
                }
            }

            // iOS or Web/fallback on Android → opens dialer pre-filled
            await Linking.openURL(`tel:${digits}`);

            // Log it manually for web and non-intent Android
            await callLogService.logManualCall(digits, {
                name: enquiry?.name,
                enquiryId: enquiry?._id,
            });
            fetchLogs();
        } catch (err) {
            Alert.alert(
                "Call Error",
                "Could not initiate call: " + err.message,
            );
        }
    }, [phoneNumber, enquiry, fetchLogs]);

    // ── Simulate a call (Web Test Mode only) ──────────────────────────────────
    const handleSimulateCall = useCallback(async () => {
        setSyncing(true);
        setSyncStatus(`Simulating test ${selectedTab}\u2026`);
        try {
            await callLogService.logManualCall(phoneNumber, {
                name: enquiry?.name,
                enquiryId: enquiry?._id,
                callType: selectedTab,
            });
            setSyncStatus(`Test ${selectedTab} recorded!`);
            fetchLogs();
        } catch (err) {
            setSyncStatus("Simulation failed");
        } finally {
            setSyncing(false);
        }
    }, [phoneNumber, enquiry, selectedTab, fetchLogs]);

    // ── Renderers ─────────────────────────────────────────────────────────────
    const renderLogItem = ({ item }) => {
        const { date, time } = callLogService.formatCallTime(
            item.callTime || item.createdAt,
        );
        const callTypeObj =
            CALL_TYPES.find((ct) => ct.key === item.callType) || CALL_TYPES[0];

        return (
            <View
                style={[
                    styles.logItem,
                    { borderLeftColor: callTypeObj.color },
                ]}>
                <View
                    style={[
                        styles.logIcon,
                        { backgroundColor: callTypeObj.color + "22" },
                    ]}>
                    <Ionicons
                        name={callTypeObj.icon}
                        size={20}
                        color={callTypeObj.color}
                    />
                </View>

                <View style={styles.logDetails}>
                    <Text style={styles.logDate}>{date}</Text>
                    <Text style={styles.logTime}>⏰ {time}</Text>
                    {!!item.contactName && (
                        <Text style={styles.logContact} numberOfLines={1}>
                            {item.contactName}
                        </Text>
                    )}
                </View>

                <View style={styles.logRight}>
                    <View
                        style={[
                            styles.callTypePill,
                            { backgroundColor: callTypeObj.color + "1A" },
                        ]}>
                        <Text
                            style={[
                                styles.callTypeBadge,
                                { color: callTypeObj.color },
                            ]}>
                            {callTypeObj.label}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    const renderEmpty = () => (
        <View style={styles.empty}>
            <Ionicons name="call-outline" size={48} color={C.gray300} />
            <Text style={styles.emptyText}>No {selectedTab} calls found</Text>
            <Text style={styles.emptyHint}>
                {Platform.OS === "web"
                    ? "Open the NeoGroww native app to sync device logs. Note: Only calls from registered enquiries are tracked."
                    : "Tap \"Sync\" to pull your logs. Only calls from your Enquiry list will be shown."}
            </Text>
            {Platform.OS === "web" && (
                <TouchableOpacity
                    onPress={handleSimulateCall}
                    style={styles.simulateButton}
                    disabled={syncing}>
                    <Text style={styles.simulateButtonText}>
                        {syncing ? "Simulating..." : `Simulate ${selectedTab} for testing`}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const tabWidth = width / 4 - 4;

    // Safety check: ensure required data is available
    if (!phoneNumber && !enquiry?.mobile) {
        return (
            <View style={styles.container}>
                <View style={styles.headerSection}>
                    <View style={styles.headerContent}>
                        <View style={styles.avatarCircle}>
                            <Ionicons
                                name="person"
                                size={20}
                                color={C.primary}
                            />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.headerTitle} numberOfLines={1}>
                                {enquiry?.name || "Contact"}
                            </Text>
                            <Text style={styles.headerSubtitle}>
                                No phone number
                            </Text>
                        </View>
                    </View>
                </View>
                <View style={styles.errorContainer}>
                    <Ionicons
                        name="alert-circle-outline"
                        size={24}
                        color={C.danger}
                    />
                    <Text style={styles.errorText}>
                        No phone number available for this contact
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* ── Web info banner ── */}
            {Platform.OS === "web" && enterpriseRef.current && (
                <View style={styles.webBanner}>
                    <Ionicons name="information-circle-outline" size={14} color={C.primary} />
                    <Text style={styles.webBannerText}>
                        Call log sync requires the native app. Showing server-synced calls below.
                    </Text>
                </View>
            )}

            {/* ── Header ── */}
            <View style={styles.headerSection}>
                <View style={styles.headerContent}>
                    <View style={styles.avatarCircle}>
                        <Ionicons name="person" size={20} color={C.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {enquiry?.name || "Contact"}
                        </Text>
                        <Text style={styles.headerSubtitle}>{phoneNumber}</Text>
                        {!!syncStatus && (
                            <Text style={styles.syncStatus} numberOfLines={1}>
                                {syncStatus}
                            </Text>
                        )}
                    </View>
                    {/* Sync button — shown on native only (web cannot access device logs) */}
                    {Platform.OS !== "web" && enterpriseRef.current && (
                        <TouchableOpacity
                            onPress={() => syncLogs().then(() => fetchLogs())}
                            style={[styles.syncButton, syncing && { opacity: 0.5 }]}
                            activeOpacity={0.8}
                            disabled={syncing}
                        >
                            {syncing
                                ? <ActivityIndicator size="small" color={C.primary} />
                                : <Ionicons name="sync-outline" size={16} color={C.primary} />}
                            <Text style={styles.syncButtonText}>
                                {syncing ? "Syncing…" : "Sync"}
                            </Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={handleMakeCall}
                        style={styles.callButton}
                        activeOpacity={0.8}>
                        <Ionicons name="call" size={16} color="#FFFFFF" />
                        <Text style={styles.callButtonText}>Call Now</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Sub-Tabs ── */}
            <View style={styles.tabsContainer}>
                {CALL_TYPES.map((tab) => {
                    const active = selectedTab === tab.key;
                    return (
                        <Pressable
                            key={tab.key}
                            onPress={() => {
                                if (selectedTab !== tab.key) {
                                    setLogs([]);
                                    setSelectedTab(tab.key);
                                }
                            }}
                            style={[
                                styles.tab,
                                active && {
                                    borderBottomColor: tab.color,
                                    borderBottomWidth: 3,
                                },
                                { width: tabWidth },
                            ]}>
                            <Ionicons
                                name={tab.icon}
                                size={16}
                                color={active ? tab.color : C.gray500}
                                style={styles.tabIcon}
                            />
                            <Text
                                style={[
                                    styles.tabLabel,
                                    active && {
                                        color: tab.color,
                                        fontWeight: "700",
                                    },
                                ]}
                                numberOfLines={1}>
                                {tab.label}
                            </Text>
                            {active && !loading && logs.length > 0 && (
                                <View
                                    style={[
                                        styles.badge,
                                        { backgroundColor: tab.color },
                                    ]}>
                                    <Text style={styles.badgeText}>
                                        {logs.length}
                                    </Text>
                                </View>
                            )}
                        </Pressable>
                    );
                })}
            </View>

            {/* ── Loading ── */}
            {loading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={styles.loadingText}>
                        Loading call history…
                    </Text>
                </View>
            )}

            {/* ── Error ── */}
            {!loading && error && (
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

            {/* ── List ── */}
            {!loading && !error && (
                <FlatList
                    data={logs}
                    renderItem={renderLogItem}
                    keyExtractor={(item, index) =>
                        String(item._id || item.uniqueKey || index)
                    }
                    ListEmptyComponent={renderEmpty}
                    contentContainerStyle={[
                        styles.listContent,
                        logs.length === 0 && { flexGrow: 1 },
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.card,
    },
    headerSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.gray300,
    },
    headerContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    avatarCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: C.primary + "18",
        justifyContent: "center",
        alignItems: "center",
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: C.gray900,
    },
    headerSubtitle: {
        fontSize: 12,
        color: C.gray500,
        marginTop: 2,
    },
    callButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: C.success,
        borderRadius: 10,
    },
    callButtonText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "700",
    },
    syncButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: C.primary + "18",
        borderRadius: 10,
        marginRight: 6,
    },
    syncButtonText: {
        color: C.primary,
        fontSize: 12,
        fontWeight: "600",
    },
    syncStatus: {
        fontSize: 10,
        color: C.success,
        marginTop: 2,
    },
    webBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: C.primary + "12",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: C.primary + "30",
    },
    webBannerText: {
        flex: 1,
        fontSize: 11,
        color: C.primary,
        fontWeight: "500",
    },

    // Tabs
    tabsContainer: {
        flexDirection: "row",
        paddingHorizontal: 4,
        paddingVertical: 4,
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
    tabIcon: {
        marginBottom: 2,
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: "600",
        color: C.gray500,
        textAlign: "center",
    },
    badge: {
        position: "absolute",
        top: 2,
        right: 2,
        backgroundColor: C.danger,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 3,
    },
    badgeText: {
        color: "#FFFFFF",
        fontSize: 9,
        fontWeight: "800",
    },

    // States
    loadingContainer: {
        alignItems: "center",
        paddingVertical: 28,
        flexDirection: "row",
        justifyContent: "center",
        gap: 10,
    },
    loadingText: {
        color: C.gray500,
        fontSize: 13,
    },
    errorContainer: {
        alignItems: "center",
        paddingVertical: 24,
        paddingHorizontal: 16,
        gap: 8,
    },
    errorText: {
        color: C.danger,
        fontSize: 13,
        textAlign: "center",
    },
    retryButton: {
        marginTop: 4,
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: C.primary,
        borderRadius: 8,
    },
    retryText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "700",
    },

    // List
    listContent: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    logItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: C.bg,
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        gap: 10,
    },
    logIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: "center",
        alignItems: "center",
    },
    logDetails: {
        flex: 1,
    },
    logDate: {
        fontSize: 13,
        fontWeight: "700",
        color: C.gray900,
    },
    logTime: {
        fontSize: 11,
        color: C.gray500,
        marginTop: 2,
    },
    logContact: {
        fontSize: 11,
        color: C.primary,
        marginTop: 2,
        fontWeight: "600",
    },
    logRight: {
        alignItems: "flex-end",
        gap: 4,
    },
    duration: {
        fontSize: 13,
        fontWeight: "700",
    },
    callTypePill: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 2,
    },
    callTypeBadge: {
        fontSize: 10,
        fontWeight: "700",
    },

    // Empty
    empty: {
        alignItems: "center",
        paddingVertical: 40,
        paddingHorizontal: 24,
        gap: 8,
    },
    emptyText: {
        fontSize: 14,
        color: C.gray500,
        fontWeight: "600",
        textAlign: "center",
    },
    emptyHint: {
        fontSize: 12,
        color: C.gray300,
        textAlign: "center",
    },
    simulateButton: {
        marginTop: 16,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: C.primary + "12",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: C.primary + "30",
    },
    simulateButtonText: {
        color: C.primary,
        fontSize: 12,
        fontWeight: "700",
    },
});

export default CallLogTabs;
