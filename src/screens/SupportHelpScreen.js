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
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import * as supportService from "../services/supportService";

const COLORS = {
    primary: "#4F46E5",
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#0F172A",
    textDim: "#475569",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    danger: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
};

const statusTone = (status) => {
    const raw = String(status || "").toLowerCase();
    if (raw.includes("open")) return { bg: "#FEF3C7", fg: "#92400E" };
    if (raw.includes("respond")) return { bg: "#DCFCE7", fg: "#166534" };
    if (raw.includes("close")) return { bg: "#E2E8F0", fg: "#334155" };
    return { bg: "#E2E8F0", fg: "#334155" };
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
        return "Send your issue to support";
    }, [company?.name, user?.name]);

    const renderTicket = ({ item }) => {
        const createdAt = item?.createdAt ? new Date(item.createdAt).toLocaleString() : "-";
        const tone = statusTone(item?.status);
        return (
            <View style={styles.ticketCard}>
                <View style={styles.ticketTop}>
                    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.badgeText, { color: tone.fg }]}>{item?.status || "Open"}</Text>
                    </View>
                    <Text style={styles.ticketDate}>{createdAt}</Text>
                </View>
                <Text style={styles.ticketLabel}>Your message</Text>
                <Text style={styles.ticketBody}>{item?.message || "-"}</Text>
                {item?.responseMessage ? (
                    <>
                        <View style={styles.divider} />
                        <Text style={styles.ticketLabel}>Support reply</Text>
                        <Text style={styles.ticketBody}>{item.responseMessage}</Text>
                    </>
                ) : null}
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={COLORS.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Help</Text>
                    <Text style={styles.headerSubtitle} numberOfLines={1}>
                        {headerSubtitle}
                    </Text>
                </View>
                <TouchableOpacity onPress={() => load({ isRefresh: true })} style={styles.refreshBtn}>
                    <Ionicons name="refresh" size={20} color={COLORS.textDim} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
            >
                <View style={styles.composeCard}>
                    <Text style={styles.composeTitle}>Describe your issue</Text>
                    <TextInput
                        style={styles.textarea}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Type message (example: payment issue, whatsapp issue, app crash...)"
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                    />
                    <View style={styles.composeActions}>
                        <Text style={styles.hint}>Reply will show here after admin responds.</Text>
                        <TouchableOpacity
                            style={[styles.sendBtn, (submitting || !message.trim()) && styles.btnDisabled]}
                            onPress={submit}
                            disabled={submitting || !message.trim()}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="send" size={16} color="#fff" />
                                    <Text style={styles.sendText}>Send</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {loading ? (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={styles.loadingText}>Loading messages…</Text>
                    </View>
                ) : (
                    <FlatList
                        contentContainerStyle={styles.list}
                        data={tickets}
                        keyExtractor={(item, idx) => String(item?._id || item?.id || idx)}
                        renderItem={renderTicket}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} />}
                        ListEmptyComponent={
                            <View style={styles.emptyBox}>
                                <Text style={styles.emptyTitle}>No messages yet</Text>
                                <Text style={styles.emptyText}>Send your first message above.</Text>
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
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backBtn: { padding: 6 },
    refreshBtn: { padding: 6 },
    headerTitle: { fontSize: 18, fontWeight: "900", color: COLORS.text },
    headerSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
    composeCard: {
        backgroundColor: COLORS.surface,
        margin: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 14,
    },
    composeTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text, marginBottom: 10 },
    textarea: {
        minHeight: 90,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 14,
        padding: 12,
        color: COLORS.text,
        backgroundColor: "#fff",
        textAlignVertical: "top",
    },
    composeActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10 },
    hint: { flex: 1, fontSize: 11, color: COLORS.textMuted },
    sendBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: COLORS.primary,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
    },
    sendText: { color: "#fff", fontWeight: "800" },
    btnDisabled: { opacity: 0.6 },
    error: { color: COLORS.danger, fontWeight: "700", paddingHorizontal: 16 },
    loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
    loadingText: { color: COLORS.textMuted, fontWeight: "700" },
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    ticketCard: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
    },
    ticketTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    badgeText: { fontWeight: "900", fontSize: 12 },
    ticketDate: { color: COLORS.textMuted, fontSize: 11, fontWeight: "700" },
    ticketLabel: { marginTop: 6, fontSize: 12, color: COLORS.textDim, fontWeight: "900" },
    ticketBody: { marginTop: 6, color: COLORS.text, fontWeight: "600", lineHeight: 18 },
    divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
    emptyBox: { padding: 22, alignItems: "center" },
    emptyTitle: { fontSize: 15, fontWeight: "900", color: COLORS.text },
    emptyText: { marginTop: 6, fontSize: 12, color: COLORS.textMuted, textAlign: "center" },
});

