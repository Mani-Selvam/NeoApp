import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useAuth } from "../contexts/AuthContext";
import {
    createOrUpdateTarget,
    getTargetProgress,
    getTargets,
} from "../services/targetService";

/* ─── Design Tokens ─────────────────────────────────────────────── */
const C = {
    bg: "#FAF9F7",
    surface: "#FFFFFF",
    surfaceAlt: "#F5F3EE",
    text: "#1A1612",
    textMid: "#5C5652",
    textSoft: "#9C9892",
    border: "#E8E4DE",
    borderStrong: "#D4CFC8",
    gold: "#B8860B",
    goldLight: "#F5EDD6",
    goldBorder: "#DFC87A",
    goldText: "#7A5A00",
    ink: "#1A1612",
    inkSoft: "#3D3830",
    success: "#2D6A4F",
    successBg: "#EDFAF3",
    successBorder: "#9DD4B8",
    danger: "#8B1A1A",
    dangerBg: "#FDF0F0",
    dangerBorder: "#E8A5A5",
};

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/* ─── Helpers ────────────────────────────────────────────────────── */
const toIntOrNull = (v) => {
    const cleaned = String(v ?? "").replace(/[^\d]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
};

const fmtInr = (n) => {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
    try {
        return `₹${Number(n).toLocaleString("en-IN")}`;
    } catch {
        return `₹${n}`;
    }
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const pct = (actual, target) => {
    const a = Number(actual) || 0;
    const t = Number(target) || 0;
    if (!t) return 0;
    return Math.round(clamp01(a / t) * 100);
};

const STATUS_COLORS = {
    New: "#2563EB",
    Contacted: "#0EA5E9",
    Interested: "#F59E0B",
    "Not Interested": "#EF4444",
    Converted: "#22C55E",
    Closed: "#6B7280",
    "In Progress": "#0EA5E9",
    Dropped: "#EF4444",
};

const DonutChart = ({ size = 92, stroke = 12, segments = [], center }) => {
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const c = 2 * Math.PI * r;

    let offset = 0;
    const normalized = segments
        .map((s) => ({
            color: s.color,
            value: Math.max(0, Number(s.value) || 0),
        }))
        .filter((s) => s.value > 0);
    const total = normalized.reduce((sum, s) => sum + s.value, 0);

    return (
        <View style={{ width: size, height: size }}>
            <Svg width={size} height={size}>
                <Circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    stroke="#E7E2DA"
                    strokeWidth={stroke}
                    fill="none"
                />
                {total > 0
                    ? normalized.map((s, idx) => {
                          const frac = s.value / total;
                          const dash = frac * c;
                          const dashArray = `${dash} ${c - dash}`;
                          const dashOffset = -offset * c;
                          offset += frac;
                          return (
                              <Circle
                                  key={`${idx}-${s.color}`}
                                  cx={cx}
                                  cy={cy}
                                  r={r}
                                  stroke={s.color}
                                  strokeWidth={stroke}
                                  fill="none"
                                  strokeDasharray={dashArray}
                                  strokeDashoffset={dashOffset}
                                  strokeLinecap="butt"
                                  transform={`rotate(-90 ${cx} ${cy})`}
                              />
                          );
                      })
                    : null}
            </Svg>
            <View
                style={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                }}>
                {center}
            </View>
        </View>
    );
};

/* ─── Year / Month Picker ────────────────────────────────────────── */
const ProgressRow = ({ label, actual, target, color, formatter }) => {
    const a = Number(actual) || 0;
    const t = Number(target) || 0;
    const p = pct(a, t);
    const valueText = formatter ? formatter(a) : String(a);
    const targetText =
        t === 0 || t === null || t === undefined
            ? "—"
            : formatter
              ? formatter(t)
              : String(t);

    return (
        <View style={{ gap: 6 }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                }}>
                <Text style={{ color: C.textMid, fontWeight: "700" }}>
                    {label}
                </Text>
                <Text style={{ color: C.text, fontWeight: "800" }}>
                    {valueText}{" "}
                    <Text style={{ color: C.textSoft, fontWeight: "700" }}>
                        / {targetText}
                    </Text>
                </Text>
            </View>
            <View
                style={{
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: C.surfaceAlt,
                    borderWidth: 1,
                    borderColor: C.border,
                    overflow: "hidden",
                }}>
                <View
                    style={{
                        height: "100%",
                        width: `${Math.max(0, Math.min(100, p))}%`,
                        backgroundColor: color,
                    }}
                />
            </View>
            <Text style={{ fontSize: 11, color: C.textSoft, fontWeight: "700" }}>
                {p}% achieved
            </Text>
        </View>
    );
};

const YearMonthPicker = ({ visible, onClose, year, month, onChange }) => {
    const years = useMemo(() => {
        const now = new Date().getFullYear();
        return Array.from({ length: 6 }, (_, i) => now - 2 + i);
    }, []);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{
                    flex: 1,
                    backgroundColor: "rgba(20,15,10,0.55)",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                }}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation()}
                    style={{
                        width: "100%",
                        maxWidth: 460,
                        backgroundColor: C.surface,
                        borderRadius: 24,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: C.border,
                    }}>
                    {/* Picker Header */}
                    <View style={{ backgroundColor: C.ink, padding: 20 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 4,
                            }}>
                            <View
                                style={{
                                    width: 3,
                                    height: 18,
                                    backgroundColor: C.goldBorder,
                                    borderRadius: 2,
                                }}
                            />
                            <Text
                                style={{
                                    color: C.goldBorder,
                                    fontSize: 11,
                                    fontWeight: "700",
                                    letterSpacing: 2,
                                }}>
                                SELECT PERIOD
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: "#FFFFFF",
                                fontSize: 22,
                                fontWeight: "700",
                                letterSpacing: -0.5,
                            }}>
                            {MONTHS[month - 1]} {year}
                        </Text>
                    </View>

                    <View style={{ padding: 20 }}>
                        {/* Year */}
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: "700",
                                letterSpacing: 1.5,
                                color: C.textSoft,
                                marginBottom: 10,
                            }}>
                            YEAR
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                                marginBottom: 20,
                            }}>
                            {years.map((y) => {
                                const active = y === year;
                                return (
                                    <TouchableOpacity
                                        key={y}
                                        onPress={() =>
                                            onChange({ year: y, month })
                                        }
                                        style={{
                                            paddingVertical: 8,
                                            paddingHorizontal: 16,
                                            borderRadius: 10,
                                            borderWidth: active ? 1.5 : 1,
                                            borderColor: active
                                                ? C.gold
                                                : C.border,
                                            backgroundColor: active
                                                ? C.goldLight
                                                : C.surface,
                                        }}>
                                        <Text
                                            style={{
                                                fontWeight: "700",
                                                color: active
                                                    ? C.goldText
                                                    : C.textMid,
                                                fontSize: 14,
                                            }}>
                                            {y}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Month */}
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: "700",
                                letterSpacing: 1.5,
                                color: C.textSoft,
                                marginBottom: 10,
                            }}>
                            MONTH
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                                marginBottom: 20,
                            }}>
                            {MONTHS.map((m, idx) => {
                                const mm = idx + 1;
                                const active = mm === month;
                                return (
                                    <TouchableOpacity
                                        key={m}
                                        onPress={() =>
                                            onChange({ year, month: mm })
                                        }
                                        style={{
                                            paddingVertical: 8,
                                            paddingHorizontal: 12,
                                            borderRadius: 10,
                                            borderWidth: active ? 1.5 : 1,
                                            borderColor: active
                                                ? C.gold
                                                : C.border,
                                            backgroundColor: active
                                                ? C.goldLight
                                                : C.surface,
                                        }}>
                                        <Text
                                            style={{
                                                fontWeight: "700",
                                                color: active
                                                    ? C.goldText
                                                    : C.textMid,
                                                fontSize: 13,
                                            }}>
                                            {m.slice(0, 3)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            onPress={onClose}
                            style={{
                                paddingVertical: 14,
                                borderRadius: 14,
                                backgroundColor: C.ink,
                                alignItems: "center",
                            }}>
                            <Text
                                style={{
                                    color: "#FFFFFF",
                                    fontWeight: "700",
                                    fontSize: 15,
                                    letterSpacing: 0.3,
                                }}>
                                Confirm
                            </Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
};

/* ─── Main Screen ────────────────────────────────────────────────── */
export default function TargetsScreen({ navigation }) {
    const { user } = useAuth();
    const isStaff = String(user?.role || "").toLowerCase() === "staff";
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [pickerOpen, setPickerOpen] = useState(false);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formOpen, setFormOpen] = useState(false);

    const [currentTargetId, setCurrentTargetId] = useState(null);
    const [targets, setTargets] = useState([]);
    const [progress, setProgress] = useState(null);

    const [leadsTarget, setLeadsTarget] = useState("");
    const [confirmedProjectsTarget, setConfirmedProjectsTarget] = useState("");
    const [marketingBudget, setMarketingBudget] = useState("");
    const [incomeTarget, setIncomeTarget] = useState("");

    const load = async ({ showSpinner } = { showSpinner: true }) => {
        try {
            if (showSpinner) setLoading(true);
            const [targetsRes, progressRes] = await Promise.all([
                getTargets({ year, month }),
                getTargetProgress({ year, month }),
            ]);
            const target = progressRes?.target ?? targetsRes?.target ?? null;
            const list = Array.isArray(targetsRes?.targets)
                ? targetsRes.targets
                : [];
            setTargets(list);
            setProgress(progressRes || null);
            setCurrentTargetId(target?._id || null);
            setLeadsTarget(target?.leadsTarget?.toString?.() ?? "");
            setConfirmedProjectsTarget(
                target?.confirmedProjectsTarget?.toString?.() ?? "",
            );
            setMarketingBudget(target?.marketingBudget?.toString?.() ?? "");
            setIncomeTarget(target?.incomeTarget?.toString?.() ?? "");
        } catch (e) {
            Alert.alert(
                "Targets",
                e?.response?.data?.error ||
                    e?.message ||
                    "Failed to load targets",
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        const id = setInterval(() => {
            load({ showSpinner: false });
        }, 25000);
        return () => clearInterval(id);
    }, [year, month]);

    const onSave = async () => {
        try {
            if (isStaff) {
                Alert.alert(
                    "Targets",
                    "Only admins can create monthly targets.",
                );
                return;
            }
            const payload = {
                year,
                month,
                leadsTarget: toIntOrNull(leadsTarget),
                confirmedProjectsTarget: toIntOrNull(confirmedProjectsTarget),
                marketingBudget: toIntOrNull(marketingBudget),
                incomeTarget: toIntOrNull(incomeTarget),
            };
            if (
                !payload.leadsTarget &&
                !payload.confirmedProjectsTarget &&
                !payload.marketingBudget &&
                !payload.incomeTarget
            ) {
                Alert.alert("Targets", "Enter at least one target value.");
                return;
            }
            setSaving(true);
            const saved = await createOrUpdateTarget(payload);
            setCurrentTargetId(saved?._id || currentTargetId);
            await load({ showSpinner: false });
            setFormOpen(false);
            Alert.alert("Targets", `Saved for ${MONTHS[month - 1]} ${year}`);
        } catch (e) {
            Alert.alert(
                "Targets",
                e?.response?.data?.error ||
                    e?.message ||
                    "Failed to save target",
            );
        } finally {
            setSaving(false);
        }
    };

    const headerSubtitle = `${MONTHS[month - 1]} ${year}`;

    const targetDoc = progress?.target ?? null;
    const actuals = progress?.actuals ?? {};
    const leadsActual = actuals.leadsCreated ?? 0;
    const convertedActual = actuals.convertedCount ?? 0;
    const revenueActual = actuals.revenue ?? 0;

    const statusSegments = (progress?.statusBreakdown || []).map((s) => ({
        color: STATUS_COLORS[s._id] || C.textSoft,
        value: s.count,
    }));
    const topAssignees = progress?.topAssignees || [];
    const maxConverted =
        Math.max(0, ...topAssignees.map((x) => x.converted || 0)) || 1;

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            {/* ── Header ── */}
            <View
                style={{
                    backgroundColor: C.ink,
                    paddingTop: 56,
                    paddingBottom: 20,
                    paddingHorizontal: 20,
                }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            backgroundColor: "rgba(255,255,255,0.1)",
                            justifyContent: "center",
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.15)",
                        }}>
                        <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={{ flex: 1, paddingHorizontal: 14 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 2,
                            }}>
                            <View
                                style={{
                                    width: 2,
                                    height: 12,
                                    backgroundColor: C.goldBorder,
                                    borderRadius: 1,
                                }}
                            />
                            <Text
                                style={{
                                    color: C.goldBorder,
                                    fontSize: 10,
                                    fontWeight: "700",
                                    letterSpacing: 2,
                                }}>
                                MONTHLY TARGETS
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: "#FFFFFF",
                                fontSize: 20,
                                fontWeight: "700",
                                letterSpacing: -0.3,
                            }}>
                            {headerSubtitle}
                        </Text>
                    </View>

                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                        }}>
                        <TouchableOpacity
                            onPress={() => setPickerOpen(true)}
                            style={{
                                paddingVertical: 9,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                backgroundColor: "rgba(255,255,255,0.1)",
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.15)",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                            }}>
                            <Ionicons
                                name="calendar-outline"
                                size={16}
                                color={C.goldBorder}
                            />
                            <Text
                                style={{
                                    color: "#FFFFFF",
                                    fontWeight: "700",
                                    fontSize: 13,
                                }}>
                                Change
                            </Text>
                        </TouchableOpacity>

                        {!isStaff && (
                            <TouchableOpacity
                                onPress={() => setFormOpen(true)}
                                style={{
                                    paddingVertical: 9,
                                    paddingHorizontal: 12,
                                    borderRadius: 12,
                                    backgroundColor: "rgba(223,200,122,0.18)",
                                    borderWidth: 1,
                                    borderColor: "rgba(223,200,122,0.35)",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                }}>
                                <Ionicons
                                    name={
                                        currentTargetId
                                            ? "create-outline"
                                            : "add"
                                    }
                                    size={16}
                                    color={C.goldBorder}
                                />
                                <Text
                                    style={{
                                        color: "#FFFFFF",
                                        fontWeight: "800",
                                        fontSize: 13,
                                    }}>
                                    {currentTargetId ? "Edit" : "Set"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

            {/* ── Thin gold accent line ── */}
            <View
                style={{
                    height: 2,
                    backgroundColor: C.goldBorder,
                    opacity: 0.6,
                }}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await load({ showSpinner: false });
                            setRefreshing(false);
                        }}
                    />
                }>
                {/* ── Admin-only notice ── */}
                {isStaff && (
                    <View
                        style={{
                            marginBottom: 14,
                            backgroundColor: C.goldLight,
                            borderRadius: 14,
                            padding: 14,
                            borderWidth: 1,
                            borderColor: C.goldBorder,
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 10,
                        }}>
                        <View style={{ marginTop: 1 }}>
                            <Ionicons
                                name="lock-closed"
                                size={16}
                                color={C.goldText}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text
                                style={{
                                    fontWeight: "700",
                                    color: C.goldText,
                                    fontSize: 13,
                                }}>
                                View only
                            </Text>
                            <Text
                                style={{
                                    color: C.goldText,
                                    fontSize: 12,
                                    marginTop: 2,
                                    opacity: 0.85,
                                }}>
                                Staff can view targets in reports. Only admins
                                can set or edit.
                            </Text>
                        </View>
                    </View>
                )}

                {/* ── Realtime Dashboard ── */}
                <View
                    style={{
                        backgroundColor: C.surface,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: C.border,
                        overflow: "hidden",
                    }}>
                    <View
                        style={{
                            paddingHorizontal: 18,
                            paddingTop: 18,
                            paddingBottom: 14,
                            borderBottomWidth: 1,
                            borderBottomColor: C.border,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}>
                        <View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    letterSpacing: 1.5,
                                    color: C.textSoft,
                                    marginBottom: 3,
                                }}>
                                REALTIME DASHBOARD
                            </Text>
                            <Text
                                style={{
                                    fontSize: 18,
                                    fontWeight: "700",
                                    color: C.text,
                                    letterSpacing: -0.3,
                                }}>
                                Targets vs Actuals
                            </Text>
                        </View>
                        {loading ? (
                            <ActivityIndicator color={C.gold} />
                        ) : (
                            <View
                                style={{
                                    paddingVertical: 4,
                                    paddingHorizontal: 10,
                                    borderRadius: 8,
                                    backgroundColor: C.goldLight,
                                    borderWidth: 1,
                                    borderColor: C.goldBorder,
                                }}>
                                <Text
                                    style={{
                                        fontSize: 11,
                                        fontWeight: "700",
                                        color: C.goldText,
                                    }}>
                                    {headerSubtitle}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{ padding: 18, gap: 16 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 16,
                            }}>
                            <DonutChart
                                size={96}
                                stroke={12}
                                segments={statusSegments}
                                center={
                                    <View style={{ alignItems: "center" }}>
                                        <Text
                                            style={{
                                                color: C.text,
                                                fontWeight: "900",
                                                fontSize: 18,
                                            }}>
                                            {leadsActual}
                                        </Text>
                                        <Text
                                            style={{
                                                color: C.textSoft,
                                                fontWeight: "900",
                                                fontSize: 10,
                                                letterSpacing: 1.2,
                                            }}>
                                            LEADS
                                        </Text>
                                    </View>
                                }
                            />

                            <View style={{ flex: 1, gap: 14 }}>
                                <ProgressRow
                                    label="Leads"
                                    actual={leadsActual}
                                    target={targetDoc?.leadsTarget}
                                    color={C.gold}
                                />
                                <ProgressRow
                                    label="Projects"
                                    actual={convertedActual}
                                    target={targetDoc?.confirmedProjectsTarget}
                                    color={C.success}
                                />
                                <ProgressRow
                                    label="Income"
                                    actual={revenueActual}
                                    target={targetDoc?.incomeTarget}
                                    color={C.inkSoft}
                                    formatter={fmtInr}
                                />
                            </View>
                        </View>

                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 10,
                            }}>
                            {(progress?.statusBreakdown || [])
                                .slice(0, 6)
                                .map((s) => (
                                    <View
                                        key={String(s._id)}
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: 6,
                                            paddingVertical: 6,
                                            paddingHorizontal: 10,
                                            borderRadius: 999,
                                            backgroundColor: C.surfaceAlt,
                                            borderWidth: 1,
                                            borderColor: C.border,
                                        }}>
                                        <View
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 4,
                                                backgroundColor:
                                                    STATUS_COLORS[s._id] ||
                                                    C.textSoft,
                                            }}
                                        />
                                        <Text
                                            style={{
                                                fontSize: 12,
                                                color: C.textMid,
                                                fontWeight: "700",
                                            }}>
                                            {s._id}
                                        </Text>
                                        <Text
                                            style={{
                                                fontSize: 12,
                                                color: C.text,
                                                fontWeight: "900",
                                            }}>
                                            {s.count}
                                        </Text>
                                    </View>
                                ))}
                        </View>
                    </View>
                </View>

                {/* ── Targets Config ── */}
                <View
                    style={{
                        marginTop: 14,
                        backgroundColor: C.surface,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: C.border,
                        overflow: "hidden",
                    }}>
                    <View
                        style={{
                            paddingHorizontal: 18,
                            paddingTop: 16,
                            paddingBottom: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: C.border,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}>
                        <View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    letterSpacing: 1.5,
                                    color: C.textSoft,
                                    marginBottom: 3,
                                }}>
                                TARGETS
                            </Text>
                            <Text
                                style={{
                                    fontSize: 16,
                                    fontWeight: "800",
                                    color: C.text,
                                }}>
                                Monthly config
                            </Text>
                        </View>
                        {!isStaff && (
                            <TouchableOpacity
                                onPress={() => setFormOpen(true)}
                                style={{
                                    paddingVertical: 8,
                                    paddingHorizontal: 12,
                                    borderRadius: 12,
                                    backgroundColor: C.ink,
                                    borderWidth: 1,
                                    borderColor: "rgba(255,255,255,0.1)",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                }}>
                                <Ionicons
                                    name={
                                        currentTargetId
                                            ? "create-outline"
                                            : "add"
                                    }
                                    size={16}
                                    color={C.goldBorder}
                                />
                                <Text
                                    style={{
                                        color: "#FFFFFF",
                                        fontWeight: "800",
                                        fontSize: 13,
                                    }}>
                                    {currentTargetId ? "Edit" : "Set"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={{ padding: 18 }}>
                        {!targetDoc ? (
                            <View
                                style={{
                                    backgroundColor: C.surfaceAlt,
                                    borderRadius: 16,
                                    padding: 16,
                                    borderWidth: 1,
                                    borderColor: C.border,
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "800",
                                        color: C.text,
                                        fontSize: 14,
                                    }}>
                                    No target set for this month
                                </Text>
                                <Text
                                    style={{
                                        color: C.textSoft,
                                        fontSize: 12,
                                        marginTop: 4,
                                        lineHeight: 16,
                                    }}>
                                    Set a monthly target to track progress in
                                    realtime.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <MiniStat
                                    label="Leads"
                                    value={targetDoc.leadsTarget ?? "—"}
                                />
                                <MiniStat
                                    label="Projects"
                                    value={
                                        targetDoc.confirmedProjectsTarget ?? "—"
                                    }
                                />
                                <MiniStat
                                    label="Budget"
                                    value={fmtInr(targetDoc.marketingBudget)}
                                />
                                <MiniStat
                                    label="Income"
                                    value={fmtInr(targetDoc.incomeTarget)}
                                />
                            </View>
                        )}
                    </View>
                </View>

                {/* ── Rank / Top Performers ── */}
                <View
                    style={{
                        marginTop: 14,
                        backgroundColor: C.surface,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: C.border,
                        overflow: "hidden",
                    }}>
                    <View
                        style={{
                            paddingHorizontal: 18,
                            paddingTop: 16,
                            paddingBottom: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: C.border,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}>
                        <View>
                            <Text
                                style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    letterSpacing: 1.5,
                                    color: C.textSoft,
                                    marginBottom: 3,
                                }}>
                                RANK
                            </Text>
                            <Text
                                style={{
                                    fontSize: 16,
                                    fontWeight: "800",
                                    color: C.text,
                                }}>
                                Top performers
                            </Text>
                        </View>
                        <Text
                            style={{
                                color: C.textSoft,
                                fontSize: 12,
                                fontWeight: "700",
                            }}>
                            Sales
                        </Text>
                    </View>

                    <View style={{ padding: 18, gap: 10 }}>
                        {topAssignees.length === 0 ? (
                            <Text
                                style={{
                                    color: C.textSoft,
                                    fontSize: 12,
                                    lineHeight: 16,
                                }}>
                                No conversions yet for this month.
                            </Text>
                        ) : (
                            topAssignees.map((u, idx) => {
                                const w = Math.round(
                                    clamp01((u.converted || 0) / maxConverted) *
                                        100,
                                );
                                return (
                                    <View
                                        key={`${idx}-${String(u.userId)}`}
                                        style={{
                                            backgroundColor: C.surfaceAlt,
                                            borderRadius: 16,
                                            padding: 14,
                                            borderWidth: 1,
                                            borderColor: C.border,
                                            gap: 8,
                                        }}>
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 10,
                                            }}>
                                            <Text
                                                style={{
                                                    color: C.text,
                                                    fontWeight: "800",
                                                    flex: 1,
                                                }}
                                                numberOfLines={1}>
                                                {u.name || "Unassigned"}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: C.text,
                                                    fontWeight: "900",
                                                }}>
                                                {u.converted || 0}
                                            </Text>
                                        </View>
                                        <View
                                            style={{
                                                height: 10,
                                                borderRadius: 999,
                                                backgroundColor: "#FFFFFF",
                                                borderWidth: 1,
                                                borderColor: C.border,
                                                overflow: "hidden",
                                            }}>
                                            <View
                                                style={{
                                                    height: "100%",
                                                    width: `${w}%`,
                                                    backgroundColor: C.gold,
                                                }}
                                            />
                                        </View>
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                justifyContent: "space-between",
                                            }}>
                                            <Text
                                                style={{
                                                    color: C.textSoft,
                                                    fontSize: 12,
                                                    fontWeight: "700",
                                                }}>
                                                Leads: {u.leads || 0}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: C.textSoft,
                                                    fontSize: 12,
                                                    fontWeight: "700",
                                                }}>
                                                Revenue: {fmtInr(u.revenue || 0)}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                </View>

            </ScrollView>

            <Modal
                visible={formOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setFormOpen(false)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setFormOpen(false)}
                    style={{
                        flex: 1,
                        backgroundColor: "rgba(20,15,10,0.55)",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: 18,
                    }}>
                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 520,
                            backgroundColor: C.surface,
                            borderRadius: 24,
                            overflow: "hidden",
                            borderWidth: 1,
                            borderColor: C.border,
                        }}>
                        <View
                            style={{
                                backgroundColor: C.ink,
                                padding: 18,
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}>
                            <View>
                                <Text
                                    style={{
                                        color: C.goldBorder,
                                        fontWeight: "900",
                                        letterSpacing: 1.6,
                                        fontSize: 10,
                                        marginBottom: 4,
                                    }}>
                                    EDIT TARGETS
                                </Text>
                                <Text
                                    style={{
                                        color: "#FFFFFF",
                                        fontSize: 18,
                                        fontWeight: "800",
                                        letterSpacing: -0.2,
                                    }}>
                                    {headerSubtitle}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setFormOpen(false)}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 12,
                                    backgroundColor: "rgba(255,255,255,0.1)",
                                    borderWidth: 1,
                                    borderColor: "rgba(255,255,255,0.15)",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}>
                                <Ionicons
                                    name="close"
                                    size={18}
                                    color="#FFFFFF"
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={{ maxHeight: 520 }}
                            contentContainerStyle={{ padding: 18, gap: 12 }}>
                            <Field
                                icon="trending-up-outline"
                                label="Leads Target"
                                placeholder="e.g. 200"
                                value={leadsTarget}
                                onChangeText={setLeadsTarget}
                                disabled={isStaff}
                            />
                            <Field
                                icon="checkmark-circle-outline"
                                label="Confirmed Projects"
                                placeholder="e.g. 20"
                                value={confirmedProjectsTarget}
                                onChangeText={setConfirmedProjectsTarget}
                                disabled={isStaff}
                            />
                            <Field
                                icon="megaphone-outline"
                                label="Marketing Budget"
                                placeholder="e.g. 50,000"
                                value={marketingBudget}
                                onChangeText={setMarketingBudget}
                                prefix="₹"
                                disabled={isStaff}
                            />
                            <Field
                                icon="wallet-outline"
                                label="Income Target"
                                placeholder="e.g. 5,00,000"
                                value={incomeTarget}
                                onChangeText={setIncomeTarget}
                                prefix="₹"
                                disabled={isStaff}
                            />

                            {!isStaff && (
                                <TouchableOpacity
                                    disabled={saving}
                                    onPress={onSave}
                                    style={{
                                        marginTop: 6,
                                        borderRadius: 14,
                                        overflow: "hidden",
                                        opacity: saving ? 0.7 : 1,
                                        backgroundColor: C.ink,
                                        paddingVertical: 14,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 8,
                                        borderWidth: 1,
                                        borderColor: "rgba(255,255,255,0.1)",
                                    }}>
                                    {saving ? (
                                        <ActivityIndicator
                                            color={C.goldBorder}
                                            size="small"
                                        />
                                    ) : (
                                        <Ionicons
                                            name={
                                                currentTargetId
                                                    ? "refresh-outline"
                                                    : "save-outline"
                                            }
                                            size={17}
                                            color={C.goldBorder}
                                        />
                                    )}
                                    <Text
                                        style={{
                                            color: "#FFFFFF",
                                            fontWeight: "800",
                                            fontSize: 15,
                                            letterSpacing: 0.2,
                                        }}>
                                        {currentTargetId
                                            ? "Update Target"
                                            : "Save Target"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>

            <YearMonthPicker
                visible={pickerOpen}
                onClose={() => setPickerOpen(false)}
                year={year}
                month={month}
                onChange={({ year: y, month: m }) => {
                    setYear(y);
                    setMonth(m);
                }}
            />
        </View>
    );
}

/* ─── Field Component ────────────────────────────────────────────── */
const Field = ({
    label,
    value,
    onChangeText,
    placeholder,
    prefix,
    icon,
    disabled,
}) => (
    <View>
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
            }}>
            <Ionicons name={icon} size={14} color={C.textSoft} />
            <Text
                style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: C.textMid,
                    letterSpacing: 0.3,
                }}>
                {label}
            </Text>
        </View>
        <View
            style={{
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 0,
                backgroundColor: disabled ? C.surfaceAlt : C.surface,
                flexDirection: "row",
                alignItems: "center",
                height: 50,
            }}>
            {prefix ? (
                <Text
                    style={{
                        fontSize: 16,
                        fontWeight: "700",
                        color: C.textSoft,
                        marginRight: 4,
                    }}>
                    {prefix}
                </Text>
            ) : null}
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                keyboardType="numeric"
                editable={!disabled}
                placeholderTextColor={C.textSoft}
                style={{
                    flex: 1,
                    fontWeight: "600",
                    color: C.text,
                    fontSize: 16,
                }}
            />
        </View>
    </View>
);

/* ─── MiniStat Component ─────────────────────────────────────────── */
const MiniStat = ({ label, value }) => (
    <View
        style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 10,
            borderRadius: 12,
            backgroundColor: C.surfaceAlt,
            borderWidth: 1,
            borderColor: C.border,
        }}>
        <Text
            style={{
                color: C.textSoft,
                fontWeight: "700",
                fontSize: 10,
                letterSpacing: 0.8,
                marginBottom: 4,
            }}>
            {label.toUpperCase()}
        </Text>
        <Text
            style={{ color: C.text, fontWeight: "700", fontSize: 13 }}
            numberOfLines={1}>
            {String(value)}
        </Text>
    </View>
);
