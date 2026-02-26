import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient"; // Ensure you have expo-linear-gradient installed
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    DeviceEventEmitter,
    Dimensions,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    ToastAndroid,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { SOCKET_URL, getImageUrl } from "../services/apiConfig";
import * as callLogService from "../services/callLogService";

const { width, height } = Dimensions.get("window");

// --- PREMIUM PALETTE ---
const COLORS = {
    bgApp: "#F3F4F6", // Very light gray (Cleaner)
    glass: "rgba(255, 255, 255, 0.75)", // Translucent white
    glassBorder: "rgba(255, 255, 255, 0.4)",

    primary: "#4338CA", // Deep Indigo
    primaryLight: "#6366F1", // Brighter Indigo
    secondary: "#059669", // Emerald
    accent: "#D97706", // Amber
    danger: "#DC2626", // Red

    textMain: "#111827", // Almost Black
    textSec: "#6B7280", // Gray
    textLight: "#9CA3AF", // Light Gray

    shadow: "rgba(0, 0, 0, 0.04)",
    shadowStrong: "rgba(79, 70, 229, 0.15)",
};

const CALL_TYPES = {
    Incoming: {
        icon: "arrow-down-left",
        color: COLORS.secondary,
        bg: "#ECFDF5",
        label: "Incoming",
    },
    Outgoing: {
        icon: "arrow-up-right",
        color: COLORS.primary,
        bg: "#EEF2FF",
        label: "Outgoing",
    },
    Missed: {
        icon: "phone-missed",
        color: COLORS.danger,
        bg: "#FEF2F2",
        label: "Missed",
    },
    Rejected: {
        icon: "phone-off",
        color: COLORS.danger,
        bg: "#FEF2F2",
        label: "Rejected",
    },
    Blocked: {
        icon: "close-circle",
        color: COLORS.textSec,
        bg: "#F3F4F6",
        label: "Blocked",
    },
    "Not Attended": {
        icon: "phone-off",
        color: COLORS.accent,
        bg: "#FFFBEB",
        label: "No Answer",
    },
};

export default function CallLogScreen({ navigation }) {
    const { user } = useAuth();
    const swipeHandlers = useSwipeNavigation("CallLog", navigation);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [filter, setFilter] = useState("All");
    const [timeFilter, setTimeFilter] = useState("Today");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);

    const syncFromDevice = async () => {
        if (Platform.OS === "web") return;
        setIsSyncing(true);
        try {
            // Safe import of CallLog
            const callLogModule = require("react-native-call-log");
            const CallLog = callLogModule?.default || callLogModule;

            if (!CallLog || typeof CallLog.load !== "function") {
                throw new Error(
                    "CallLog native module not found. (Using Expo Go?)",
                );
            }

            const syncFilter = {
                minTimestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
            };
            const deviceLogs = await CallLog.load(100, syncFilter);
            console.log(
                `📱 Fetched ${deviceLogs?.length || 0} logs from device`,
            );

            if (deviceLogs && deviceLogs.length > 0) {
                const res = await callLogService.syncCallLogs(deviceLogs);
                ToastAndroid.show(
                    `✅ Synced ${res?.synced || 0} enquiry calls`,
                    ToastAndroid.LONG,
                );
            } else {
                ToastAndroid.show(
                    "ℹ️ No new calls to sync",
                    ToastAndroid.SHORT,
                );
            }
            fetchData();
        } catch (e) {
            console.error("Sync error:", e.message);
            ToastAndroid.show(
                `❌ Sync Failed: ${e.message.includes("module") ? "Need Native Build" : "Error"}`,
                ToastAndroid.LONG,
            );
        } finally {
            setIsSyncing(false);
        }
    };

    const fetchData = async () => {
        // Only show full loading if we have no logs yet
        if (logs.length === 0) {
            setLoading(true);
        }
        try {
            const [logsRes, statsRes] = await Promise.all([
                callLogService.getCallLogs({
                    type: filter === "All" ? "" : filter,
                    filter: timeFilter,
                    search: searchQuery,
                }),
                callLogService.getCallStats({
                    filter: timeFilter,
                }),
            ]);

            const logsData = logsRes.data || logsRes;
            const filtered = searchQuery
                ? logsData.filter(
                      (log) =>
                          (log.phoneNumber &&
                              log.phoneNumber.includes(searchQuery)) ||
                          (log.contactName &&
                              log.contactName
                                  .toLowerCase()
                                  .includes(searchQuery.toLowerCase())),
                  )
                : logsData;

            setLogs(filtered);
            setStats(statsRes.summary || statsRes);
        } catch (error) {
            console.error("Error fetching call logs:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => fetchData(), 400);
        return () => clearTimeout(timer);
    }, [filter, timeFilter, searchQuery]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(
            "CALL_LOG_CREATED",
            fetchData,
        );
        return () => sub.remove();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const formatDuration = (seconds) => {
        if (!seconds || seconds === 0) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const formatTotalTime = (seconds) => {
        if (!seconds || seconds === 0) return "0 min";
        const mins = Math.floor(seconds / 60);
        return `${mins} min`;
    };

    const getInitials = (name) => {
        if (!name) return "??";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
    };

    // --- COMPONENTS ---

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <StatusBar
                barStyle="dark-content"
                translucent
                backgroundColor="transparent"
            />

            {/* Glass Effect Header */}
            <View style={styles.glassHeader}>
                <View style={styles.topRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle}>Call History</Text>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.profileBtn,
                            {
                                marginRight: 10,
                                backgroundColor: COLORS.primary + "15",
                            },
                        ]}
                        onPress={syncFromDevice}
                        disabled={isSyncing}>
                        {isSyncing ? (
                            <ActivityIndicator
                                size="small"
                                color={COLORS.primary}
                            />
                        ) : (
                            <Ionicons
                                name="sync-outline"
                                size={24}
                                color={COLORS.primary}
                            />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.profileBtn}>
                        {user?.logo ? (
                            <Image
                                source={{ uri: getImageUrl(user.logo) }}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 14,
                                }}
                            />
                        ) : (
                            <Ionicons
                                name="person-circle-outline"
                                size={28}
                                color={COLORS.primary}
                            />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Modern Search Input */}
                <View style={styles.searchContainer}>
                    <Ionicons
                        name="search"
                        size={18}
                        color={COLORS.textLight}
                        style={{ marginRight: 10 }}
                    />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search calls..."
                        placeholderTextColor={COLORS.textLight}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                {/* Time Filter Segmented Control */}
                <View style={styles.segmentedControl}>
                    {["All", "Today", "This Week"].map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            onPress={() => setTimeFilter(tab)}
                            activeOpacity={0.7}
                            style={styles.segmentButton}>
                            {timeFilter === tab && (
                                <MotiView
                                    style={styles.segmentActiveBg}
                                    from={{ scale: 0.9 }}
                                    animate={{ scale: 1 }}
                                    transition={{
                                        type: "timing",
                                        duration: 200,
                                    }}
                                />
                            )}
                            <Text
                                style={[
                                    styles.segmentText,
                                    timeFilter === tab &&
                                        styles.segmentTextActive,
                                ]}>
                                {tab}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Type Filters (Horizontal Scroll) */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.typeFiltersScroll}>
                    {["All", "Incoming", "Outgoing", "Missed"].map((t) => (
                        <TouchableOpacity
                            key={t}
                            onPress={() => setFilter(t)}
                            style={[
                                styles.filterPill,
                                filter === t && styles.filterPillActive,
                            ]}>
                            <Text
                                style={[
                                    styles.filterPillText,
                                    filter === t && styles.filterPillTextActive,
                                ]}>
                                {t}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Stats Summary Compact */}
                {!searchQuery && stats && (
                    <View style={styles.compactStatsRow}>
                        <StatItem
                            label="In"
                            value={stats.incoming}
                            color={COLORS.secondary}
                        />
                        <View style={styles.statDivider} />
                        <StatItem
                            label="Out"
                            value={stats.outgoing}
                            color={COLORS.primary}
                        />
                        <View style={styles.statDivider} />
                        <StatItem
                            label="Missed"
                            value={stats.missed}
                            color={COLORS.danger}
                        />
                        <View style={styles.statDivider} />
                        <StatItem
                            label="Overall"
                            value={formatTotalTime(stats.totalDuration)}
                            color={COLORS.accent}
                        />
                    </View>
                )}
            </View>
        </View>
    );

    const renderItem = ({ item, index }) => {
        const typeInfo = CALL_TYPES[item.callType] || CALL_TYPES.Incoming;
        const initials = getInitials(item.contactName);

        return (
            <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: index * 50, type: "timing" }}
                style={styles.cardWrapper}>
                <View style={styles.card}>
                    <View style={styles.cardMain}>
                        {/* Left: Avatar */}
                        <View
                            style={[
                                styles.avatarContainer,
                                { backgroundColor: typeInfo.bg },
                            ]}>
                            <Text
                                style={[
                                    styles.avatarText,
                                    { color: typeInfo.color },
                                ]}>
                                {initials}
                            </Text>
                        </View>

                        {/* Middle: Info */}
                        <View style={styles.cardMiddle}>
                            <View style={styles.nameRow}>
                                <Text
                                    style={styles.contactName}
                                    numberOfLines={1}>
                                    {item.contactName || "Unknown"}
                                </Text>
                                <View
                                    style={[
                                        styles.typeDot,
                                        { backgroundColor: typeInfo.color },
                                    ]}
                                />
                            </View>
                            <Text style={styles.phoneNumber}>
                                {item.phoneNumber}
                            </Text>
                            <View style={styles.metaRow}>
                                <Text style={styles.durationText}>
                                    {formatDuration(item.duration)}
                                </Text>
                                <Text style={styles.metaDot}>•</Text>
                                <Text
                                    style={[
                                        styles.durationText,
                                        { color: COLORS.accent },
                                    ]}>
                                    SIM {item.simSlot || 1}
                                </Text>
                                {item.isVideoCall && (
                                    <>
                                        <Text style={styles.metaDot}>•</Text>
                                        <Ionicons
                                            name="videocam"
                                            size={12}
                                            color={COLORS.primary}
                                        />
                                    </>
                                )}
                                {item.enquiryId && (
                                    <>
                                        <Text style={styles.metaDot}>•</Text>
                                        <Text style={styles.enqText}>
                                            {item.enquiryId.enqNo}
                                        </Text>
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Right: Time */}
                        <View style={styles.cardRight}>
                            <Text style={styles.timeText}>
                                {new Date(item.callTime).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                )}
                            </Text>
                            <Text style={styles.dateText}>
                                {new Date(item.callTime).toLocaleDateString(
                                    [],
                                    { month: "short", day: "numeric" },
                                )}
                            </Text>
                        </View>
                    </View>

                    {/* Note Section */}
                    {/* {item.note && (
                        <View style={styles.noteBox}>
                            <MaterialCommunityIcons
                                name="format-quote-open"
                                size={14}
                                color={COLORS.textLight}
                            />
                            <Text style={styles.noteText} numberOfLines={2}>
                                {item.note}
                            </Text>
                        </View>
                    )} */}

                    {/* Divider */}
                    {/* <View style={styles.cardDivider} /> */}
                    {/* <View style={styles.cardFooter}>
                        <TouchableOpacity style={styles.primaryActionBtn}>
                            <LinearGradient
                                colors={[COLORS.primaryLight, COLORS.primary]}
                                style={styles.gradientBtn}>
                                <Feather
                                    name="phone-call"
                                    size={16}
                                    color="#FFF"
                                />
                                <Text style={styles.primaryActionText}>
                                    Call Back
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View> */}
                </View>
            </MotiView>
        );
    };

    return (
        <SafeAreaView
            style={styles.container}
            edges={["top"]}
            {...swipeHandlers}>
            {renderHeader()}

            {loading && !refreshing ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : (
                <FlatList
                    data={logs}
                    renderItem={renderItem}
                    keyExtractor={(item) => item._id}
                    contentContainerStyle={styles.listContent}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                    windowSize={11}
                    removeClippedSubviews={true}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={COLORS.primary}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <MotiView
                                from={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                style={styles.emptyIcon}>
                                <MaterialCommunityIcons
                                    name="phone-remove"
                                    size={64}
                                    color={COLORS.textLight}
                                />
                            </MotiView>
                            <Text style={styles.emptyText}>No Calls Found</Text>
                            <Text style={styles.emptySub}>
                                Your history is empty for this period.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

// Helper Component for Stats
const StatItem = ({ label, value, color }) => (
    <View style={styles.statItem}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bgApp,
    },
    centered: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },

    // --- Header (Glassmorphism) ---
    headerContainer: {
        position: "relative",
        zIndex: 10,
        paddingBottom: 15,
    },
    glassHeader: {
        backgroundColor: COLORS.glass,
        backdropFilter: "blur(12px)", // Note: Android support varies, works on iOS
        paddingTop: Platform.OS === "ios" ? 50 : StatusBar.currentHeight + 20,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.glassBorder,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 12,
        elevation: 5,
    },
    topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
    },
    greeting: {
        fontSize: 12,
        color: COLORS.textSec,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: "800",
        color: COLORS.textMain,
        letterSpacing: -0.5,
        marginTop: 2,
    },
    profileBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#FFF",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 3,
    },

    // Search
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFF",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 16,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: COLORS.textMain,
        padding: 0,
    },

    // Segmented Control (Time Filter)
    segmentedControl: {
        flexDirection: "row",
        backgroundColor: "#F3F4F6",
        padding: 4,
        borderRadius: 14,
        marginBottom: 16,
    },
    segmentButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: "center",
        position: "relative",
        zIndex: 1,
    },
    segmentActiveBg: {
        position: "absolute",
        top: 4,
        bottom: 4,
        left: 4,
        right: 4,
        backgroundColor: "#FFF",
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 1,
        zIndex: -1,
    },
    segmentText: {
        fontSize: 13,
        fontWeight: "600",
        color: COLORS.textSec,
    },
    segmentTextActive: {
        color: COLORS.primary,
        fontWeight: "700",
    },

    // Type Filters (Pills)
    typeFiltersScroll: {
        paddingBottom: 12,
    },
    filterPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: "transparent",
        marginRight: 8,
        borderWidth: 1,
        borderColor: "transparent",
    },
    filterPillActive: {
        backgroundColor: COLORS.bgApp,
        borderColor: "#E5E7EB",
    },
    filterPillText: {
        fontSize: 12,
        fontWeight: "600",
        color: COLORS.textSec,
    },
    filterPillTextActive: {
        color: COLORS.primary,
        fontWeight: "700",
    },

    // Compact Stats
    compactStatsRow: {
        flexDirection: "row",
        backgroundColor: "#F9FAFB",
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 16,
        justifyContent: "space-between",
        alignItems: "center",
    },
    statItem: {
        alignItems: "center",
    },
    statValue: {
        fontSize: 18,
        fontWeight: "800",
    },
    statLabel: {
        fontSize: 10,
        color: COLORS.textSec,
        fontWeight: "600",
        marginTop: 2,
        textTransform: "uppercase",
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: "#E5E7EB",
    },

    // --- List ---
    listContent: {
        padding: 20,
        paddingTop: 10,
    },

    // --- Card ---
    cardWrapper: {
        marginBottom: 20,
    },
    card: {
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: COLORS.shadowStrong,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 6,
    },
    cardMain: {
        flexDirection: "row",
        marginBottom: 12,
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: "800",
    },
    cardMiddle: {
        flex: 1,
        justifyContent: "center",
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
    },
    contactName: {
        fontSize: 16,
        fontWeight: "700",
        color: COLORS.textMain,
        marginRight: 6,
    },
    typeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    phoneNumber: {
        fontSize: 14,
        color: COLORS.textSec,
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    durationText: {
        fontSize: 12,
        color: COLORS.textLight,
        fontWeight: "500",
    },
    metaDot: {
        color: COLORS.textLight,
        marginHorizontal: 6,
    },
    enqText: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: "600",
    },
    cardRight: {
        alignItems: "flex-end",
        justifyContent: "center",
        marginLeft: 10,
    },
    timeText: {
        fontSize: 15,
        fontWeight: "700",
        color: COLORS.textMain,
    },
    dateText: {
        fontSize: 11,
        color: COLORS.textLight,
        fontWeight: "500",
        marginTop: 2,
    },

    // Note
    noteBox: {
        backgroundColor: "#F9FAFB",
        padding: 10,
        borderRadius: 12,
        marginBottom: 16,
        flexDirection: "row",
        alignItems: "flex-start",
    },
    noteText: {
        flex: 1,
        fontSize: 12,
        color: COLORS.textSec,
        fontStyle: "italic",
        marginLeft: 6,
        lineHeight: 16,
    },

    cardDivider: {
        height: 1,
        backgroundColor: "#F3F4F6",
        marginBottom: 12,
    },

    // Card Footer
    cardFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    secondaryActions: {
        flexDirection: "row",
        gap: 16,
        alignItems: "center",
    },
    secondaryActionText: {
        fontSize: 12,
        fontWeight: "700",
        color: COLORS.textSec,
        marginLeft: 4,
    },
    primaryActionBtn: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
        borderRadius: 12,
        overflow: "hidden",
    },
    gradientBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
    },
    primaryActionText: {
        color: "#FFF",
        fontSize: 13,
        fontWeight: "700",
        marginLeft: 6,
    },

    // FAB
    fab: {
        position: "absolute",
        bottom: 30,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: COLORS.primary,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
        zIndex: 20,
    },

    // Empty
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 100,
    },
    emptyIcon: {
        marginBottom: 24,
        opacity: 0.4,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: "700",
        color: COLORS.textMain,
        marginBottom: 8,
    },
    emptySub: {
        fontSize: 14,
        color: COLORS.textLight,
        textAlign: "center",
        paddingHorizontal: 40,
    },
});
