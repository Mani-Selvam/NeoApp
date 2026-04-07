import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import {
    getCommunicationTasks,
    getCommunicationTeam,
} from "../services/communicationService";

const T = {
    bg: "#FFFFFF",
    bgSecondary: "#F0F2F5",
    ink: "#111B21",
    mid: "#54656F",
    mute: "#8696A0",
    line: "#E9EDEF",
    accent: "#00A884",
    accentSoft: "#D9FDD3",
    accentBorder: "#C8E6C9",
    success: "#166534",
    successSoft: "#F0FDF4",
    successBorder: "#BBF7D0",
    warn: "#92400E",
    warnSoft: "#FFFBEB",
    warnBorder: "#FDE68A",
};

const resolveUserId = (value) =>
    String(value?._id || value?.id || value || "").trim();

const statusBucket = (status) => {
    const s = String(status || "").trim();
    if (s === "Completed") return "completed";
    if (s === "In Progress") return "inProgress";
    if (s === "Cancelled") return "cancelled";
    return "pending";
};

export default function TaskDashboardScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const selfId = String(user?.id || user?._id || "");

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [team, setTeam] = useState([]);
    const [tasks, setTasks] = useState([]);

    const anim = useRef(new Animated.Value(0)).current;

    const load = useCallback(async () => {
        try {
            const [teamData, taskData] = await Promise.all([
                getCommunicationTeam(),
                getCommunicationTasks("all"),
            ]);
            setTeam(Array.isArray(teamData) ? teamData : []);
            setTasks(Array.isArray(taskData) ? taskData : []);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load().catch(() => {});
        }, [load]),
    );

    useEffect(() => {
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [anim]);

    const rows = useMemo(() => {
        const map = new Map();
        const ensure = (member) => {
            const id = resolveUserId(member);
            if (!id) return null;
            if (!map.has(id)) {
                map.set(id, {
                    id,
                    name: String(member?.name || "Staff").trim() || "Staff",
                    role: String(member?.role || "").trim(),
                    pending: 0,
                    inProgress: 0,
                    completed: 0,
                });
            }
            return map.get(id);
        };

        (Array.isArray(team) ? team : []).forEach((m) => ensure(m));

        for (const t of Array.isArray(tasks) ? tasks : []) {
            const assignedId = resolveUserId(t?.assignedTo);
            if (!assignedId) continue;
            const row = ensure({
                _id: assignedId,
                name: t?.assignedTo?.name,
                role: t?.assignedTo?.role,
            });
            if (!row) continue;
            const b = statusBucket(t?.status);
            if (b === "pending") row.pending += 1;
            if (b === "inProgress") row.inProgress += 1;
            if (b === "completed") row.completed += 1;
        }

        const out = Array.from(map.values());
        out.sort((a, b) => {
            const at = a.pending + a.inProgress + a.completed;
            const bt = b.pending + b.inProgress + b.completed;
            if (bt !== at) return bt - at;
            if (b.completed !== a.completed) return b.completed - a.completed;
            return String(a.name).localeCompare(String(b.name));
        });
        // Pin self row to top if present.
        const idx = out.findIndex((r) => String(r.id) === String(selfId));
        if (idx > 0) {
            const [selfRow] = out.splice(idx, 1);
            out.unshift(selfRow);
        }
        return out;
    }, [selfId, team, tasks]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        load().catch(() => {});
    }, [load]);

    return (
        <SafeAreaView style={S.screen} edges={["left", "right"]}>
            <StatusBar barStyle="dark-content" backgroundColor={T.bg} />

            <View style={[S.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={S.headerBtn}
                    activeOpacity={0.85}>
                    <Ionicons name="arrow-back" size={22} color={T.ink} />
                </TouchableOpacity>
                <Text style={S.headerTitle}>Task Dashboard</Text>
                <TouchableOpacity
                    onPress={onRefresh}
                    style={S.headerBtn}
                    activeOpacity={0.85}>
                    <Ionicons name="refresh" size={20} color={T.ink} />
                </TouchableOpacity>
            </View>

            <Animated.View
                style={{
                    flex: 1,
                    opacity: anim,
                    transform: [
                        {
                            translateY: anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [10, 0],
                            }),
                        },
                    ],
                }}>
                {loading ? (
                    <View style={S.loadingWrap}>
                        <ActivityIndicator size="small" color={T.accent} />
                        <Text style={S.loadingText}>Loading…</Text>
                    </View>
                ) : (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={S.body}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={T.accent}
                                colors={[T.accent]}
                            />
                        }>
                        <View style={S.tableHead}>
                            <Text style={[S.th, S.thName]}>Staff</Text>
                            <Text style={[S.th, S.thP]}>Pending</Text>
                            <Text style={[S.th, S.thI]}>Progress</Text>
                            <Text style={[S.th, S.thC]}>Done</Text>
                        </View>

                        {rows.map((r, idx) => (
                            <View
                                key={r.id}
                                style={[
                                    S.row,
                                    idx % 2 === 1 && S.rowAlt,
                                    String(r.id) === String(selfId) &&
                                        S.rowSelf,
                                ]}>
                                <View style={S.nameCell}>
                                    <Text style={S.name} numberOfLines={1}>
                                        {r.name}
                                    </Text>
                                    {r.role ? (
                                        <Text style={S.role} numberOfLines={1}>
                                            {r.role}
                                        </Text>
                                    ) : null}
                                </View>
                                <View style={[S.cell, S.pillP]}>
                                    <Text style={S.cellTxt}>{r.pending}</Text>
                                </View>
                                <View style={[S.cell, S.pillI]}>
                                    <Text style={S.cellTxt}>
                                        {r.inProgress}
                                    </Text>
                                </View>
                                <View style={[S.cell, S.pillC]}>
                                    <Text style={S.cellTxt}>{r.completed}</Text>
                                </View>
                            </View>
                        ))}
                        <View style={{ height: 16 }} />
                    </ScrollView>
                )}
            </Animated.View>
        </SafeAreaView>
    );
}

const S = StyleSheet.create({
    screen: { flex: 1, backgroundColor: T.bg },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 6,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: T.line,
    },
    headerBtn: { padding: 8 },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: "800",
        color: T.ink,
        paddingLeft: 4,
    },
    loadingWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    loadingText: { color: T.mid, fontWeight: "700" },
    body: { padding: 14, paddingBottom: 20 },
    tableHead: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: T.bgSecondary,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: T.line,
        marginBottom: 10,
    },
    th: {
        fontSize: 11,
        fontWeight: "900",
        color: T.mute,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        textAlign: "center",
        width: 72,
    },
    thName: { flex: 1, width: "auto", textAlign: "left" },
    thP: { color: T.accent },
    thI: { color: T.warn },
    thC: { color: T.success },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: T.line,
        backgroundColor: "#fff",
        marginBottom: 8,
    },
    rowAlt: { backgroundColor: "#FAFAFA" },
    rowSelf: { borderColor: T.accentBorder },
    nameCell: { flex: 1, paddingRight: 8 },
    name: { fontSize: 14, fontWeight: "800", color: T.ink },
    role: { fontSize: 11, fontWeight: "700", color: T.mute, marginTop: 2 },
    cell: {
        width: 72,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        marginLeft: 6,
    },
    cellTxt: { fontSize: 13, fontWeight: "900", color: T.ink },
    pillP: { backgroundColor: T.accentSoft, borderColor: T.accentBorder },
    pillI: { backgroundColor: T.warnSoft, borderColor: T.warnBorder },
    pillC: { backgroundColor: T.successSoft, borderColor: T.successBorder },
});

