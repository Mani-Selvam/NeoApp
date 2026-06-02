import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListSkeleton } from "../components/skeleton/screens";
import { SkeletonPulse } from "../components/skeleton/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import * as supportService from "../services/supportService";

const COLORS = {
    primary: "#6366F1",
    primaryDark: "#4F46E5",
    primaryLight: "#EEF2FF",
    primaryBorder: "#C7D2FE",
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#1E293B",
    textDim: "#475569",
    textMuted: "#64748B",
    border: "#E2E8F0",
    danger: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
};

const statusTone = (status) => {
    const raw = String(status || "").toLowerCase();
    if (raw.includes("open")) return { bg: "#FEF3C7", fg: "#B45309", border: "#FDE68A" };
    if (raw.includes("respond")) return { bg: "#ECFDF5", fg: "#10B981", border: "#A7F3D0" };
    if (raw.includes("close")) return { bg: "#F1F5F9", fg: "#475569", border: "#CBD5E1" };
    return { bg: "#F1F5F9", fg: "#475569", border: "#CBD5E1" };
};

export default function SupportHelpScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [company, setCompany] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const load = async ({ isRefresh = false } = {}) => {
        try {
            setError("");
            if (isRefresh) setRefreshing(true);
            else setLoading(true);

            const res = await supportService.getMyTickets();
            setCompany(res?.company || null);
            setTickets(Array.isArray(res?.tickets) ? res.tickets : []);
        } catch (e) {
            const msg =
                e?.response?.data?.message ||
                e?.message ||
                "Failed to load help messages";
            setError(msg);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            load();
        }, []),
    );

    const submit = async () => {
        const clean = String(message || "").trim();
        if (!clean) return;

        try {
            setSubmitting(true);
            await supportService.createMyTicket({ message: clean });
            setMessage("");
            Alert.alert("Sent", "Your message was sent to NeoApp support.");
            await load({ isRefresh: true });
        } catch (e) {
            const msg =
                e?.response?.data?.message ||
                e?.message ||
                "Failed to send message";
            Alert.alert("Error", msg);
        } finally {
            setSubmitting(false);
        }
    };

    const headerSubtitle = useMemo(() => {
        const companyName = company?.name || "";
        const userName = user?.name || "";
        if (companyName && userName) return `${companyName} • ${userName}`;
        if (companyName) return companyName;
        if (userName) return userName;
        return "Help Desk";
    }, [company?.name, user?.name]);

    const renderTicket = ({ item }) => {
        const createdAt = item?.createdAt ? new Date(item.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }) : "-";
        const tone = statusTone(item?.status);
        return (
            <View style={styles.ticketCard}>
                <View style={styles.ticketTop}>
                    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                        <View style={[styles.badgeDot, { backgroundColor: tone.fg }]} />
                        <Text style={[styles.badgeText, { color: tone.fg }]}>{item?.status || "Open"}</Text>
                    </View>
                    <Text style={styles.ticketDate}>{createdAt}</Text>
                </View>
                
                <Text style={styles.ticketLabel}>YOUR MESSAGE</Text>
                <Text style={styles.ticketBody}>{item?.message || "-"}</Text>
                
                {item?.responseMessage ? (
                    <View style={styles.replyBox}>
                        <View style={styles.replyHeader}>
                            <View style={styles.supportAvatar}>
                                <Ionicons name="headset" size={13} color={COLORS.primary} />
                            </View>
                            <Text style={styles.replyLabel}>SUPPORT RESPONSE</Text>
                        </View>
                        <Text style={styles.replyBody}>{item.responseMessage}</Text>
                    </View>
                ) : null}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* Premium Slack-Style Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    activeOpacity={0.7}
                >
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>

                <View style={styles.headerInfo}>
                    <View style={styles.headerAvatar}>
                        <Ionicons name="help-buoy" size={18} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle} numberOfLines={1}>Support Help Desk</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                            {headerSubtitle}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={() => load({ isRefresh: true })}
                    style={styles.refreshBtn}
                    activeOpacity={0.7}
                >
                    <Ionicons name="sync-outline" size={20} color={COLORS.textDim} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
            >
                {/* Compose Issue Panel Upgrade */}
                <View style={styles.composeCard}>
                    <Text style={styles.composeTitle}>Describe your concern</Text>
                    <TextInput
                        style={styles.textarea}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Type your concern here... (e.g., payment query, API issue, app glitch...)"
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                        numberOfLines={4}
                    />
                    <View style={styles.composeActions}>
                        <Text style={styles.hint}>
                            Support team replies will show below immediately after review.
                        </Text>
                        <TouchableOpacity
                            style={[styles.sendBtn, (submitting || !message.trim()) && styles.btnDisabled]}
                            onPress={submit}
                            disabled={submitting || !message.trim()}
                            activeOpacity={0.8}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="send" size={14} color="#fff" />
                                    <Text style={styles.sendText}>Send</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {loading ? (
                    <SkeletonPulse>
                        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                            <ListSkeleton count={4} itemHeight={100} withAvatar />
                        </View>
                    </SkeletonPulse>
                ) : (
                    <FlatList
                        contentContainerStyle={styles.list}
                        data={tickets}
                        keyExtractor={(item, idx) => String(item?._id || item?.id || idx)}
                        renderItem={renderTicket}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => load({ isRefresh: true })}
                                colors={[COLORS.primary]}
                            />
                        }
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyBox}>
                                <View style={styles.emptyIconBg}>
                                    <Ionicons name="chatbubbles-outline" size={32} color={COLORS.primary} />
                                </View>
                                <Text style={styles.emptyTitle}>No queries submitted yet</Text>
                                <Text style={styles.emptyText}>Submit a support query using the panel above if you face any issues.</Text>
                            </View>
                        }
                    />
                )}
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    
    // Slack-Style Header
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingBottom: 14,
        backgroundColor: "#FFFFFF",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
    },
    backBtn: {
        padding: 8,
    },
    headerInfo: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        gap: 10,
        marginLeft: 6,
    },
    headerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: COLORS.primaryBorder,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: COLORS.text,
    },
    headerSubtitle: {
        fontSize: 11,
        fontWeight: "500",
        color: COLORS.textMuted,
    },
    refreshBtn: {
        padding: 8,
        marginRight: 4,
    },

    // Compose Card panel
    composeCard: {
        backgroundColor: COLORS.surface,
        margin: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 16,
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    composeTitle: {
        fontSize: 13,
        fontWeight: "800",
        color: COLORS.text,
        marginBottom: 8,
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    textarea: {
        minHeight: 80,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        padding: 12,
        color: COLORS.text,
        backgroundColor: "#F8FAFC",
        textAlignVertical: "top",
        fontSize: 14.5,
        fontWeight: "500",
    },
    composeActions: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 12,
        gap: 12,
    },
    hint: {
        flex: 1,
        fontSize: 11,
        color: COLORS.textMuted,
        lineHeight: 15,
        fontWeight: "500",
    },
    sendBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 2,
    },
    sendText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 13.5,
    },
    btnDisabled: {
        opacity: 0.6,
    },
    error: {
        color: COLORS.danger,
        fontWeight: "700",
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    
    // Ticket list card Redesign
    list: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    ticketCard: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.02,
        shadowRadius: 6,
        elevation: 1,
    },
    ticketTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    badge: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 0.8,
        gap: 4,
    },
    badgeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    badgeText: {
        fontWeight: "800",
        fontSize: 10.5,
        textTransform: "uppercase",
    },
    ticketDate: {
        color: COLORS.textMuted,
        fontSize: 11,
        fontWeight: "600",
    },
    ticketLabel: {
        fontSize: 10,
        color: COLORS.textMuted,
        fontWeight: "800",
        letterSpacing: 0.4,
        marginBottom: 4,
    },
    ticketBody: {
        color: COLORS.text,
        fontWeight: "600",
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 10,
    },
    replyBox: {
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        padding: 12,
        marginTop: 6,
        borderWidth: 0.8,
        borderColor: "#E2E8F0",
    },
    replyHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 6,
    },
    supportAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: COLORS.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 0.5,
        borderColor: COLORS.primaryBorder,
    },
    replyLabel: {
        fontSize: 10,
        color: COLORS.primary,
        fontWeight: "800",
        letterSpacing: 0.4,
    },
    replyBody: {
        color: COLORS.textDim,
        fontWeight: "600",
        fontSize: 13.5,
        lineHeight: 19,
    },

    // Empty list container
    emptyBox: {
        paddingVertical: 60,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
    },
    emptyIconBg: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: COLORS.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: COLORS.primaryBorder,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: COLORS.text,
        marginBottom: 6,
    },
    emptyText: {
        fontSize: 12.5,
        color: COLORS.textMuted,
        textAlign: "center",
        lineHeight: 18,
    },
});
