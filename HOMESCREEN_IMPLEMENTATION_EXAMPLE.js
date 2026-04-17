/**
 * Example: HomeScreen Implementation with useAutoRefresh
 *
 * This shows how to implement the HomeScreen with:
 * 1. Manual refresh (pull-to-refresh)
 * 2. Auto-refresh every 5 minutes
 * 3. Smart cache management
 * 4. Proper error handling
 */

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppSideMenu from "../components/AppSideMenu";
import { HomeSkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import * as dashboardService from "../services/dashboardService";
import { invalidateCacheTags } from "../services/appCache";

// Environment configuration
const CACHE_TTL_DASHBOARD = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_DASHBOARD_MS || 60000,
);
const AUTO_REFRESH_DASHBOARD = Number(
    process.env.EXPO_PUBLIC_AUTO_REFRESH_DASHBOARD_MS || 5 * 60 * 1000,
);

export default function HomeScreen({ navigation }) {
    const { user, company } = useAuth();
    const [sideMenuVisible, setSideMenuVisible] = useState(false);

    // Auto-refresh hook with smart cache management
    const {
        data: dashboard,
        loading,
        error,
        refreshing,
        onRefresh,
        refetch,
    } = useAutoRefresh({
        // Unique cache key based on company
        queryKey: ["dashboard", company?.id],

        // Data fetching function
        queryFn: async ({ signal }) => {
            if (!company?.id) {
                throw new Error("Company not loaded");
            }

            // Fetch dashboard data with abort signal for cancellation
            const response = await dashboardService.getDashboardData(
                company.id,
                { signal },
            );

            return response;
        },

        // Cache settings
        ttlMs: CACHE_TTL_DASHBOARD, // Cache for configured duration (default 1 min)
        tags: ["dashboard", "enquiries", "followups", "reports"], // Tags for batch invalidation

        // Auto-refresh settings
        autoRefreshIntervalMs: AUTO_REFRESH_DASHBOARD, // Auto-refresh every 5 minutes

        // Control when data is considered stale
        staleOnFocus: true, // Invalidate cache when user returns to this screen
        staleOnAppStateChange: "active", // Invalidate when app comes to foreground

        // Enable/disable fetching
        enabled: !!user?.id && !!company?.id,
    });

    // Handle errors
    const handleError = useCallback(async () => {
        console.error("Dashboard loading failed:", error?.message);
        await refetch(); // Retry
    }, [error, refetch]);

    // Invalidate cache when user creates something
    const handleEnquiryCreated = useCallback(async () => {
        await invalidateCacheTags(["dashboard", "enquiries"]);
        await refetch();
    }, [refetch]);

    const handleFollowupCreated = useCallback(async () => {
        await invalidateCacheTags(["dashboard", "followups"]);
        await refetch();
    }, [refetch]);

    // Setup event listeners
    useEffect(() => {
        const unsubscribe = navigation?.addListener?.("beforeRemove", () => {
            setSideMenuVisible(false);
        });
        return unsubscribe;
    }, [navigation]);

    // Render error state
    if (error && !dashboard) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={48} color="#DC2626" />
                    <Text style={styles.errorText}>
                        Failed to load dashboard
                    </Text>
                    <Text style={styles.errorSubtext}>
                        {error?.message || "Please try again"}
                    </Text>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={handleError}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Render main content
    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <ScrollView
                // Pull-to-refresh control
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={["#2563EB"]}
                        tintColor="#2563EB"
                    />
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}>
                {/* Show skeleton while loading */}
                {loading && !dashboard ? (
                    <HomeSkeleton />
                ) : (
                    <>
                        {/* Dashboard Header */}
                        <DashboardHeader user={user} company={company} />

                        {/* Stats Cards */}
                        <StatsSection data={dashboard?.stats} />

                        {/* Recent Enquiries */}
                        <RecentEnquiriesSection
                            enquiries={dashboard?.recentEnquiries}
                            onPress={() => navigation?.navigate("Enquiry")}
                        />

                        {/* Upcoming Followups */}
                        <UpcomingFollowupsSection
                            followups={dashboard?.upcomingFollowups}
                            onPress={() => navigation?.navigate("FollowUp")}
                        />

                        {/* Performance Indicators */}
                        {dashboard?.performanceData && (
                            <PerformanceSection
                                data={dashboard.performanceData}
                            />
                        )}
                    </>
                )}
            </ScrollView>

            {/* Side menu for navigation */}
            {sideMenuVisible && (
                <AppSideMenu onClose={() => setSideMenuVisible(false)} />
            )}
        </SafeAreaView>
    );
}

// Component sections (simplified examples)
const DashboardHeader = ({ user, company }) => (
    <View style={styles.header}>
        <Text style={styles.headerTitle}>
            Welcome, {user?.name?.split(" ")[0]}!
        </Text>
        <Text style={styles.headerSubtitle}>{company?.name}</Text>
    </View>
);

const StatsSection = ({ data = {} }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>Today's Stats</Text>
        <View style={styles.statsGrid}>
            <StatCard
                label="Enquiries"
                value={data?.enquiries || 0}
                icon="phone-portrait"
            />
            <StatCard
                label="Followups"
                value={data?.followups || 0}
                icon="timer"
            />
            <StatCard
                label="Conversions"
                value={data?.conversions || 0}
                icon="checkmark-circle"
            />
            <StatCard
                label="Revenue"
                value={data?.revenue || "$0"}
                icon="cash"
            />
        </View>
    </View>
);

const RecentEnquiriesSection = ({ enquiries = [], onPress }) => (
    <View style={styles.section}>
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Enquiries</Text>
            <TouchableOpacity onPress={onPress}>
                <Text style={styles.viewAllButton}>View All</Text>
            </TouchableOpacity>
        </View>
        {enquiries.slice(0, 5).map((enquiry) => (
            <EnquiryListItem key={enquiry._id} enquiry={enquiry} />
        ))}
    </View>
);

const UpcomingFollowupsSection = ({ followups = [], onPress }) => (
    <View style={styles.section}>
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Followups</Text>
            <TouchableOpacity onPress={onPress}>
                <Text style={styles.viewAllButton}>View All</Text>
            </TouchableOpacity>
        </View>
        {followups.slice(0, 5).map((followup) => (
            <FollowupListItem key={followup._id} followup={followup} />
        ))}
    </View>
);

const PerformanceSection = ({ data }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>
        {/* Add performance charts here */}
    </View>
);

const StatCard = ({ label, value, icon }) => (
    <View style={styles.statCard}>
        <Ionicons name={icon} size={24} color="#2563EB" />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const EnquiryListItem = ({ enquiry }) => (
    <View style={styles.listItem}>
        <View>
            <Text style={styles.listItemTitle}>{enquiry.name}</Text>
            <Text style={styles.listItemSubtitle}>{enquiry.mobile}</Text>
        </View>
        <Text style={styles.listItemMeta}>
            {new Date(enquiry.createdAt).toLocaleDateString()}
        </Text>
    </View>
);

const FollowupListItem = ({ followup }) => (
    <View style={styles.listItem}>
        <View>
            <Text style={styles.listItemTitle}>{followup.enquiry?.name}</Text>
            <Text style={styles.listItemSubtitle}>{followup.notes}</Text>
        </View>
        <Text style={styles.listItemMeta}>
            {new Date(followup.followupDate).toLocaleDateString()}
        </Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F1F5F9",
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    errorText: {
        fontSize: 18,
        fontWeight: "600",
        color: "#0F172A",
        marginTop: 16,
    },
    errorSubtext: {
        fontSize: 14,
        color: "#64748B",
        marginTop: 8,
        textAlign: "center",
    },
    retryButton: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: "#2563EB",
        borderRadius: 8,
    },
    retryButtonText: {
        color: "#FFFFFF",
        fontWeight: "600",
    },
    header: {
        marginVertical: 16,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: "700",
        color: "#0F172A",
    },
    headerSubtitle: {
        fontSize: 14,
        color: "#64748B",
        marginTop: 4,
    },
    section: {
        marginVertical: 16,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#0F172A",
    },
    viewAllButton: {
        fontSize: 14,
        color: "#2563EB",
        fontWeight: "600",
    },
    statsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
    },
    statCard: {
        flex: 1,
        minWidth: "48%",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 16,
        alignItems: "center",
    },
    statValue: {
        fontSize: 24,
        fontWeight: "700",
        color: "#0F172A",
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        color: "#64748B",
        marginTop: 4,
    },
    listItem: {
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        padding: 12,
        marginVertical: 6,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    listItemTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#0F172A",
    },
    listItemSubtitle: {
        fontSize: 12,
        color: "#64748B",
        marginTop: 4,
    },
    listItemMeta: {
        fontSize: 12,
        color: "#94A3B8",
    },
});
