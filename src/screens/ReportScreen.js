import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    Modal,
    Platform,
    ScrollView, // ADDED: Was missing in imports
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { getImageUrl } from "../services/apiConfig";
import * as callLogService from "../services/callLogService";
import * as followupService from "../services/followupService";

// --- PROFESSIONAL THEME ---
const { width } = Dimensions.get("window");
const COLORS = {
    bgApp: "#F8FAFC", // Cool Light Gray
    bgCard: "#FFFFFF",
    primary: "#2563EB", // Professional Blue
    primaryLight: "#EFF6FF",
    secondary: "#7C3AED", // Violet
    textMain: "#0F172A", // Dark Slate
    textSec: "#64748B", // Muted Slate
    textLight: "#94A3B8",
    border: "#E2E8F0",

    // Status Colors
    success: "#10B981",
    successBg: "#D1FAE5",
    warning: "#F59E0B",
    warningBg: "#FEF3C7",
    danger: "#EF4444",
    dangerBg: "#FEE2E2",

    // Gradients
    gradients: {
        blue: ["#3B82F6", "#2563EB"],
        green: ["#34D399", "#059669"],
        purple: ["#8B5CF6", "#7C3AED"],
        orange: ["#FBBF24", "#D97706"],
    }
};

const DURATION_OPTIONS = [
    { label: "Today", value: "Today", icon: "time-outline" },
    { label: "This Week", value: "This Week", icon: "calendar-outline" },
    { label: "This Month", value: "This Month", icon: "calendar-number-outline" },
    { label: "This Year", value: "This Year", icon: "layers-outline" },
    { label: "All Time", value: "All Time", icon: "infinite-outline" },
];

export default function ReportScreen({ navigation }) {
    const { user } = useAuth();
    const swipeHandlers = useSwipeNavigation('Report', navigation);
    const [activeTab, setActiveTab] = useState("Pending");
    const [data, setData] = useState([]);
    const [callStats, setCallStats] = useState(null); // State for calls data
    const [isLoading, setIsLoading] = useState(false);

    // Duration Filter
    const [duration, setDuration] = useState("This Month");
    const [showDurationPicker, setShowDurationPicker] = useState(false);

    // --- LOGIC (Preserved) ---
    const isDateInDuration = (dateString, durationType) => {
        if (!dateString) return false;
        if (durationType === "All Time") return true;

        const date = new Date(dateString);
        const now = new Date();
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (durationType === "Today") return d.getTime() === n.getTime();

        if (durationType === "This Week") {
            const day = n.getDay() || 7;
            if (day !== 1) n.setHours(-24 * (day - 1));
            const startOfWeek = n;
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            return d >= startOfWeek && d <= endOfWeek;
        }

        if (durationType === "This Month") return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        if (durationType === "This Year") return date.getFullYear() === now.getFullYear();

        return true;
    };

    const fetchCallStats = async () => {
        try {
            const stats = await callLogService.getCallStats();
            setCallStats(stats);
        } catch (error) {
            console.error("Error fetching call stats:", error);
        }
    };

    const fetchData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === "Calls") {
                await fetchCallStats();
            } else {
                const serviceTab = activeTab === "Dropped" ? "Dropped" : "All";
                const response = await followupService.getFollowUps(serviceTab, 1, 1000);

                let fetchedData = Array.isArray(response) ? response : (response?.data || []);

                // 1. Filter by Tab
                if (activeTab === "Pending") {
                    fetchedData = fetchedData.filter(item => {
                        const status = (item.status || "").toLowerCase();
                        const action = (item.nextAction || "").toLowerCase();
                        const enqStatus = (item.enqId?.status || "").toLowerCase();
                        const isDropped = status.includes("drop") || action.includes("drop") || enqStatus === "dropped";
                        const isSale = status === "completed" || action === "sales" || enqStatus === "converted" || enqStatus === "closed";
                        return !isDropped && !isSale;
                    });
                }

                // 2. Filter by Duration
                fetchedData = fetchedData.filter(item => isDateInDuration(item.date, duration));

                // 3. Sort
                fetchedData.sort((a, b) => {
                    const dateA = new Date(a.date);
                    const dateB = new Date(b.date);
                    return activeTab === "Pending" ? dateA - dateB : dateB - dateA;
                });

                setData(fetchedData);
            }
        } catch (error) {
            console.error("Report Fetch Error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchData();
        }, [activeTab, duration])
    );

    // --- UI COMPONENTS ---

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
            <View style={styles.headerInner}>
                <View style={styles.headerTopRow}>
                    <View>
                        <Text style={styles.headerSubtitle}>Analytics</Text>
                        <Text style={styles.headerTitle}>Reports</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                            style={styles.filterButton}
                            onPress={() => setShowDurationPicker(true)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                            <Text style={styles.filterButtonText}>{duration}</Text>
                            <Ionicons name="chevron-down" size={14} color={COLORS.textSec} style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                        <TouchableOpacity style={{ marginLeft: 15 }} onPress={() => navigation.navigate("ProfileScreen")}>
                            {user?.logo ? (
                                <Image source={{ uri: getImageUrl(user.logo) }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                            ) : (
                                <Ionicons name="person-circle-outline" size={32} color={COLORS.primary} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Pill Tab Switcher */}
                <View style={styles.tabContainer}>
                    {["Pending", "Dropped", "Calls"].map((tab) => (
                        <TouchableOpacity
                            key={tab}
                            onPress={() => setActiveTab(tab)}
                            activeOpacity={0.7}
                            style={styles.tabButton}
                        >
                            <MotiView
                                animate={{
                                    backgroundColor: activeTab === tab ? COLORS.bgCard : "transparent",
                                }}
                                transition={{ type: "timing", duration: 300 }}
                                style={styles.tabMoti}
                            >
                                <Text style={[
                                    styles.tabText,
                                    activeTab === tab && styles.tabTextActive
                                ]}>
                                    {tab}
                                </Text>
                                {activeTab === tab && (
                                    <View style={styles.activeDot} />
                                )}
                            </MotiView>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );

    const renderCard = ({ item, index }) => {
        const getEnquiryDate = () => {
            if (item.enqId?.date) return item.enqId.date;
            if (item.enqId?.createdAt) return item.enqId.createdAt.split("T")[0];
            return "N/A";
        };

        const enquiryDate = getEnquiryDate();
        const initials = item.name ? item.name.substring(0, 2).toUpperCase() : "NA";
        const isPending = activeTab === "Pending";

        // Dynamic Styling based on Status
        let statusColor, statusBg, statusText;
        if (isPending) {
            statusColor = COLORS.warning;
            statusBg = COLORS.warningBg;
            statusText = "PENDING";
        } else {
            statusColor = COLORS.danger;
            statusBg = COLORS.dangerBg;
            statusText = "DROPPED";
        }

        const rawImage = item.enqId?.image;
        const imageUrl = rawImage ? getImageUrl(rawImage) : null;

        return (
            <MotiView
                from={{ opacity: 0, translateY: 15 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 400, delay: index * 50 }}
                style={styles.cardWrapper}
            >
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardUserRow}>
                            <View style={styles.cardAvatar}>
                                {imageUrl ? (
                                    <Image source={{ uri: imageUrl }} style={styles.cardAvatarImg} />
                                ) : (
                                    <View style={[styles.cardAvatarPlaceholder, { backgroundColor: statusColor }]}>
                                        <Text style={styles.avatarPlaceholderText}>{initials}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.cardUserInfo}>
                                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                                <View style={styles.cardMeta}>
                                    <Ionicons name="call-outline" size={12} color={COLORS.textSec} />
                                    <Text style={styles.cardMetaText}>{item.mobile}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
                            <Text style={[styles.statusPillText, { color: statusColor }]}>{statusText}</Text>
                        </View>
                    </View>

                    <View style={styles.cardDivider} />

                    <View style={styles.cardDetails}>
                        <View style={styles.detailBlock}>
                            <Text style={styles.detailLabel}>Enquiry Date</Text>
                            <Text style={styles.detailValue}>{enquiryDate}</Text>
                        </View>
                        <View style={[styles.detailBlock, { alignItems: 'flex-end' }]}>
                            <Text style={styles.detailLabel}>{isPending ? "Follow-up" : "Dropped Date"}</Text>
                            <Text style={[styles.detailValue, { color: isPending ? COLORS.primary : COLORS.danger }]}>
                                {item.date}
                            </Text>
                        </View>
                    </View>

                    {!isPending && item.remarks && (
                        <View style={styles.remarkContainer}>
                            <Ionicons name="alert-circle" size={14} color={COLORS.danger} />
                            <Text style={styles.remarkText} numberOfLines={2}>{item.remarks}</Text>
                        </View>
                    )}
                </View>
            </MotiView>
        );
    };

    const renderStatCard = (title, value, icon, color, gradient) => (
        <View style={styles.statCard}>
            <View style={styles.statHeader}>
                <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statIconBg}>
                    <Ionicons name={icon} size={20} color="#FFF" />
                </LinearGradient>
            </View>
            <Text style={[styles.statValue, { color: color }]}>{value}</Text>
            <Text style={styles.statLabel}>{title}</Text>
        </View>
    );

    return (
        <View style={styles.container} {...swipeHandlers}>
            {renderHeader()}

            <View style={styles.contentArea}>
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={styles.loadingText}>Loading Report...</Text>
                    </View>
                ) : activeTab === "Calls" ? (
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        {callStats && (
                            <>
                                {/* 2x2 Stats Grid */}
                                <View style={styles.statsGrid}>
                                    {renderStatCard("Total Calls", callStats.summary.totalCalls, "call", COLORS.textMain, COLORS.gradients.blue)}
                                    {renderStatCard("Incoming", callStats.summary.incoming, "arrow-down", COLORS.success, COLORS.gradients.green)}
                                    {renderStatCard("Outgoing", callStats.summary.outgoing, "arrow-up", COLORS.primary, COLORS.gradients.blue)}
                                    {renderStatCard("Missed", callStats.summary.missed, "close-circle", COLORS.danger, COLORS.gradients.orange)}
                                </View>

                                {/* Staff Activity Section */}
                                <View style={styles.activitySection}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionTitle}>Staff Performance</Text>
                                        <Text style={styles.sectionBadge}>Top Performers</Text>
                                    </View>

                                    {callStats.staffActivity.map((staff, idx) => (
                                        <View key={staff.name || idx} style={styles.staffRow}>
                                            <View style={styles.staffLeft}>
                                                <View style={styles.staffAvatar}>
                                                    <Text style={styles.staffAvatarText}>{staff.name?.[0] || "U"}</Text>
                                                </View>
                                                <View>
                                                    <Text style={styles.staffName}>{staff.name}</Text>
                                                    <Text style={styles.staffRole}>Staff Member</Text>
                                                </View>
                                            </View>
                                            <View style={styles.staffRight}>
                                                <Text style={styles.staffCount}>{staff.count} calls</Text>
                                                <View style={styles.progressTrack}>
                                                    <View
                                                        style={[
                                                            styles.progressFill,
                                                            {
                                                                width: `${Math.min(100, (staff.count / (callStats.summary.totalCalls || 1)) * 100)}%`,
                                                                backgroundColor: COLORS.primary
                                                            }
                                                        ]}
                                                    />
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </>
                        )}
                    </ScrollView>
                ) : (
                    <FlatList
                        data={data}
                        keyExtractor={(item, index) => item._id || index.toString()}
                        renderItem={renderCard}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="document-text-outline" size={64} color={COLORS.border} />
                                <Text style={styles.emptyTitle}>No Records</Text>
                                <Text style={styles.emptySub}>No data found for this selection.</Text>
                            </View>
                        }
                    />
                )}
            </View>

            {/* Filter Modal */}
            <Modal
                visible={showDurationPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDurationPicker(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowDurationPicker(false)}
                >
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Duration</Text>
                            <TouchableOpacity onPress={() => setShowDurationPicker(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textMain} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.optionList}>
                            {DURATION_OPTIONS.map((opt) => {
                                const isSelected = duration === opt.value;
                                return (
                                    <TouchableOpacity
                                        key={opt.value}
                                        style={[styles.optionItem, isSelected && styles.optionItemActive]}
                                        onPress={() => {
                                            setDuration(opt.value);
                                            setShowDurationPicker(false);
                                        }}
                                    >
                                        <View style={styles.optionLeft}>
                                            <Ionicons
                                                name={opt.icon}
                                                size={20}
                                                color={isSelected ? COLORS.primary : COLORS.textSec}
                                            />
                                            <Text style={[styles.optionText, isSelected && { color: COLORS.primary, fontWeight: '700' }]}>
                                                {opt.label}
                                            </Text>
                                        </View>
                                        {isSelected && <Ionicons name="checkmark" size={20} color={COLORS.primary} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bgApp,
    },

    // --- Header & Tabs ---
    headerContainer: {
        backgroundColor: COLORS.bgApp,
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 20 : 50,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerInner: {
        marginBottom: 20,
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerSubtitle: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: COLORS.textMain,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    filterButtonText: {
        color: COLORS.textMain,
        fontSize: 14,
        fontWeight: '600',
        marginHorizontal: 6,
    },

    // Floating Tabs
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#E2E8F0',
        padding: 4,
        borderRadius: 16,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 8,
    },
    tabMoti: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSec,
    },
    tabTextActive: {
        color: COLORS.primary,
    },
    activeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.primary,
        marginTop: 4,
    },

    // --- Content Area ---
    contentArea: {
        flex: 1,
    },
    listContent: {
        padding: 20,
        paddingTop: 10,
    },
    scrollContent: {
        padding: 20,
        paddingTop: 10,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: COLORS.textSec,
        fontSize: 14,
    },

    // --- Report Cards ---
    cardWrapper: {
        marginBottom: 16,
    },
    card: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: "#6366F1",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardUserRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    cardAvatar: {
        marginRight: 12,
    },
    cardAvatarImg: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    cardAvatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarPlaceholderText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    cardUserInfo: {
        flex: 1,
    },
    cardName: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textMain,
        marginBottom: 4,
    },
    cardMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardMetaText: {
        fontSize: 13,
        color: COLORS.textSec,
        marginLeft: 4,
    },
    statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusPillText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    cardDivider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginBottom: 16,
    },
    cardDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    detailBlock: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 11,
        color: COLORS.textLight,
        textTransform: 'uppercase',
        marginBottom: 4,
        fontWeight: '600',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textMain,
    },
    remarkContainer: {
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF2F2',
        padding: 10,
        borderRadius: 10,
    },
    remarkText: {
        flex: 1,
        fontSize: 12,
        color: '#7F1D1D',
        marginLeft: 8,
        lineHeight: 16,
    },

    // --- Stats Grid (Calls Tab) ---
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -6,
        marginBottom: 24,
    },
    statCard: {
        width: (width - 52) / 2,
        marginHorizontal: 6,
        backgroundColor: COLORS.bgCard,
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
    },
    statHeader: {
        marginBottom: 12,
    },
    statIconBg: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statValue: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.textSec,
        fontWeight: '500',
    },

    // --- Staff Activity List ---
    activitySection: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textMain,
    },
    sectionBadge: {
        fontSize: 11,
        color: COLORS.primary,
        backgroundColor: COLORS.primaryLight,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        fontWeight: '600',
    },
    staffRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    staffLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    staffAvatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    staffAvatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textSec,
    },
    staffName: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.textMain,
    },
    staffRole: {
        fontSize: 12,
        color: COLORS.textLight,
    },
    staffRight: {
        alignItems: 'flex-end',
        width: 100,
    },
    staffCount: {
        fontSize: 13,
        fontWeight: '700',
        color: COLORS.primary,
        marginBottom: 4,
    },
    progressTrack: {
        width: '100%',
        height: 6,
        backgroundColor: '#F1F5F9',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },

    // --- Empty State ---
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textMain,
        marginTop: 16,
    },
    emptySub: {
        fontSize: 14,
        color: COLORS.textSec,
        marginTop: 4,
    },

    // --- Modal ---
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
    },
    modalCard: {
        width: "100%",
        backgroundColor: COLORS.bgCard,
        borderRadius: 24,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textMain,
    },
    optionList: {
        // 
    },
    optionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    optionItemActive: {
        // 
    },
    optionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionText: {
        fontSize: 15,
        color: COLORS.textMain,
        marginLeft: 12,
    },
});