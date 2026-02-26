import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    RefreshControl,
    SectionList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
    primary: "#6366f1",
    success: "#10b981",
    danger: "#ef4444",
    warning: "#f59e0b",
    gray: {
        50: "#f8fafc",
        100: "#f1f5f9",
        200: "#e2e8f0",
        400: "#94a3b8",
        500: "#64748b",
        600: "#475569",
        700: "#334155",
        800: "#1e293b",
        900: "#0f172a",
    },
};

// Mock notifications data
const MOCK_NOTIFICATIONS = [
    {
        id: "1",
        type: "enquiry-success",
        title: "✅ New Enquiry Added",
        subtitle: "Mani Singh - Product Inquiry",
        time: "2 min ago",
        timestamp: new Date(Date.now() - 2 * 60000),
        unread: true,
        icon: "✅",
        bgColor: "#16A34A",
    },
    {
        id: "2",
        type: "followup-reminder",
        title: "📋 Follow-up Reminder",
        subtitle: "Rajesh Kumar - Follow up at 3:00 PM",
        time: "1 hour ago",
        timestamp: new Date(Date.now() - 60 * 60000),
        unread: true,
        icon: "📋",
        bgColor: "#0EA5E9",
    },
    {
        id: "3",
        type: "enquiry-error",
        title: "❌ Failed to Create Enquiry",
        subtitle: "Network error. Please try again.",
        time: "3 hours ago",
        timestamp: new Date(Date.now() - 3 * 60 * 60000),
        unread: false,
        icon: "❌",
        bgColor: "#DC2626",
    },
    {
        id: "4",
        type: "enquiry-success",
        title: "✅ New Enquiry Added",
        subtitle: "Priya Sharma - Website Design",
        time: "Yesterday at 5:30 PM",
        timestamp: new Date(Date.now() - 24 * 60 * 60000),
        unread: false,
        icon: "✅",
        bgColor: "#16A34A",
    },
    {
        id: "5",
        type: "followup-reminder",
        title: "📌 Overdue Follow-up",
        subtitle: "Amit Patel - Follow up was due 2 days ago",
        time: "2 days ago",
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60000),
        unread: false,
        icon: "📌",
        bgColor: "#CA8A04",
    },
];

const getNotificationSection = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());

    const notifDate = new Date(date);
    notifDate.setHours(0, 0, 0, 0);

    if (notifDate.getTime() === today.getTime()) {
        return "Today";
    } else if (notifDate.getTime() === yesterday.getTime()) {
        return "Yesterday";
    } else if (notifDate.getTime() >= thisWeekStart.getTime()) {
        return "This Week";
    } else {
        return "Earlier";
    }
};

export default function NotificationsScreen({ navigation }) {
    const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = () => {
        setRefreshing(true);
        setTimeout(() => {
            setRefreshing(false);
        }, 1000);
    };

    const handleMarkAsRead = (notifId) => {
        setNotifications((prevNotifs) =>
            prevNotifs.map((notif) =>
                notif.id === notifId ? { ...notif, unread: false } : notif,
            ),
        );
    };

    const handleDeleteNotification = (notifId) => {
        setNotifications((prevNotifs) =>
            prevNotifs.filter((notif) => notif.id !== notifId),
        );
    };

    // Group notifications by section
    const groupedNotifications = {};
    notifications.forEach((notif) => {
        const section = getNotificationSection(notif.timestamp);
        if (!groupedNotifications[section]) {
            groupedNotifications[section] = [];
        }
        groupedNotifications[section].push(notif);
    });

    const sections = [
        { title: "Today", data: groupedNotifications["Today"] || [] },
        { title: "Yesterday", data: groupedNotifications["Yesterday"] || [] },
        { title: "This Week", data: groupedNotifications["This Week"] || [] },
        { title: "Earlier", data: groupedNotifications["Earlier"] || [] },
    ].filter((section) => section.data.length > 0);

    const unreadCount = notifications.filter((n) => n.unread).length;

    const NotificationItem = ({ item }) => (
        <TouchableOpacity
            style={[styles.notificationItem, item.unread && styles.unreadItem]}
            onPress={() => handleMarkAsRead(item.id)}
            activeOpacity={0.7}>
            <View
                style={[
                    styles.iconContainer,
                    { backgroundColor: item.bgColor + "20" },
                ]}>
                <Text style={styles.iconText}>{item.icon}</Text>
            </View>

            <View style={styles.contentContainer}>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                <Text style={styles.notificationSubtitle}>{item.subtitle}</Text>
                <Text style={styles.notificationTime}>{item.time}</Text>
            </View>

            <View style={styles.rightContainer}>
                {item.unread && <View style={styles.unreadDot} />}

                <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteNotification(item.id)}>
                    <Ionicons name="close" size={20} color={COLORS.gray[400]} />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );

    const SectionHeader = ({ section }) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar
                barStyle="dark-content"
                backgroundColor={COLORS.gray[50]}
            />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons
                        name="chevron-back"
                        size={28}
                        color={COLORS.gray[900]}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notifications</Text>
                {unreadCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unreadCount}</Text>
                    </View>
                )}
            </View>

            {/* Notifications List */}
            {notifications.length === 0 ? (
                <View style={styles.emptyState}>
                    <Ionicons
                        name="notifications-off"
                        size={64}
                        color={COLORS.gray[300]}
                    />
                    <Text style={styles.emptyText}>No notifications yet</Text>
                </View>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <NotificationItem item={item} />}
                    renderSectionHeader={({ section }) => (
                        <SectionHeader section={section} />
                    )}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            colors={[COLORS.primary]}
                        />
                    }
                    contentContainerStyle={styles.listContent}
                    stickySectionHeadersEnabled={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.gray[50],
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: COLORS.gray[50],
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray[200],
    },
    headerTitle: {
        flex: 1,
        fontSize: 24,
        fontWeight: "700",
        color: COLORS.gray[900],
        marginLeft: 12,
    },
    badge: {
        backgroundColor: "#EF4444",
        borderRadius: 12,
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
    },
    badgeText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "700",
    },
    listContent: {
        paddingVertical: 8,
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.gray[50],
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.gray[500],
        letterSpacing: 0.5,
    },
    notificationItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 8,
        marginVertical: 4,
        backgroundColor: COLORS.gray[100],
        borderRadius: 12,
        gap: 12,
    },
    unreadItem: {
        backgroundColor: "#F0F4FF",
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    iconText: {
        fontSize: 28,
    },
    contentContainer: {
        flex: 1,
    },
    notificationTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.gray[900],
        marginBottom: 4,
    },
    notificationSubtitle: {
        fontSize: 13,
        color: COLORS.gray[600],
        marginBottom: 4,
    },
    notificationTime: {
        fontSize: 12,
        color: COLORS.gray[500],
    },
    rightContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#EF4444",
    },
    deleteBtn: {
        padding: 6,
    },
    emptyState: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.gray[500],
        fontWeight: "500",
    },
});
