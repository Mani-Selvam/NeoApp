import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import Svg, {
    Circle,
    Defs,
    G,
    Line,
    LinearGradient as SvgLinearGradient,
    Path,
    Rect,
    Stop,
    Text as SvgText,
} from "react-native-svg";
import { useAuth } from "../contexts/AuthContext";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    setCacheEntry,
} from "../services/appCache";
import { getAllEnquiries } from "../services/enquiryService";

const C = {
    bg: "#F5F3EF",
    surface: "#FFFFFF",
    border: "#EAE6DF",
    text: "#1A1714",
    textSec: "#5C574F",
    textMuted: "#9B958C",
    gold: "#B8892A",
    goldLight: "#F5E9C8",
    teal: "#1A7A6E",
    tealLight: "#E0F2EF",
    rose: "#C0443A",
    roseLight: "#FDE8E6",
    violet: "#6045A8",
    violetLight: "#EDE8F9",
    sky: "#1868B7",
    skyLight: "#E3EEFF",
    emerald: "#1B7A48",
    emeraldLight: "#E3F5EC",
    amber: "#C07820",
    amberLight: "#FEF3E2",
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

const REPORT_CACHE_TTL_MS = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_REPORT_MS || 300000,
);

const normalizeList = (p) =>
    Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];

const fmtINR = (v) =>
    `\u20B9${Number(v || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 0,
    })}`;

const fmtINRCompact = (v) => {
    const n = Number(v || 0);
    if (n >= 100000) return `\u20B9${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `\u20B9${(n / 1000).toFixed(1)}K`;
    return `\u20B9${n}`;
};

const safeDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const normalizeStaffLabel = (name, adminName = "Admin") => {
    const v = String(name || "").trim();
    if (!v || v === "Unassigned") return adminName;
    return v;
};

const getEnqDate = (i) => i?.enquiryDateTime || i?.date || i?.createdAt || null;

const polarToCartesian = (cx, cy, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
        x: cx + radius * Math.cos(angleInRadians),
        y: cy + radius * Math.sin(angleInRadians),
    };
};

const describeSlice = (cx, cy, radius, startAngle, endAngle) => {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
        `M ${cx} ${cy}`,
        `L ${start.x} ${start.y}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
        "Z",
    ].join(" ");
};

const DonutPieChart = ({ data, size = 170 }) => {
    const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
    if (total <= 0) {
        return (
            <View style={{ width: size, height: size }}>
                <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    <Circle
                        cx={size / 2}
                        cy={size / 2}
                        r={size / 2 - 8}
                        fill={C.border}
                    />
                </Svg>
                <View style={S.pieCenter}>
                    <Text style={S.pieValue}>0</Text>
                    <Text style={S.pieLabel}>LEADS</Text>
                </View>
            </View>
        );
    }

    let cumulative = 0;
    const segments = data
        .filter((d) => (Number(d.value) || 0) > 0)
        .map((d) => {
            const pct = (Number(d.value) || 0) / total;
            const seg = {
                ...d,
                pct,
                startPct: cumulative,
                color: d.color || C.gold,
            };
            cumulative += pct;
            return seg;
        });

    return (
        <View style={{ width: size, height: size }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G>
                    {segments.map((seg, i) => {
                        const start = seg.startPct * 360;
                        const end = start + seg.pct * 360;
                        return (
                            <Path
                                key={seg.label || i}
                                d={describeSlice(
                                    size / 2,
                                    size / 2,
                                    size / 2 - 6,
                                    start,
                                    end,
                                )}
                                fill={seg.color}
                                stroke={C.surface}
                                strokeWidth={2}
                            />
                        );
                    })}
                </G>
            </Svg>
            <View style={S.pieCenter}>
                <Text style={S.pieValue}>{total}</Text>
                <Text style={S.pieLabel}>LEADS</Text>
            </View>
        </View>
    );
};

// ─── REDESIGNED: Monthly Sales Trend Chart ────────────────────────────────────
const SalesLineChart = ({ data = [], width = 300, height = 200 }) => {
    const PAD = { top: 28, right: 16, bottom: 38, left: 52 };
    const W = width - PAD.left - PAD.right;
    const H = height - PAD.top - PAD.bottom;

    const values = data.map((d) => Number(d.salesAmount || 0));
    const maxVal = Math.max(...values, 1);

    // Y-axis ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        val: t * maxVal,
        y: PAD.top + H - t * H,
    }));

    // Plot points
    const pts = data.map((d, i) => ({
        x: PAD.left + (i / Math.max(data.length - 1, 1)) * W,
        y: PAD.top + H - (Number(d.salesAmount || 0) / maxVal) * H,
        val: Number(d.salesAmount || 0),
        label: d.monthName.slice(0, 3),
    }));

    // Smooth bezier curve
    const linePath = pts.reduce((path, p, i) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = pts[i - 1];
        const cpx = (prev.x + p.x) / 2;
        return `${path} C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
    }, "");

    // Area fill
    const areaPath =
        pts.length > 0
            ? `${linePath} L ${pts[pts.length - 1].x} ${PAD.top + H} L ${pts[0].x} ${PAD.top + H} Z`
            : "";

    // Peak month index
    const peakIdx = values.indexOf(Math.max(...values));

    return (
        <View style={[S.chartGraphicWrap, { width }]}>
            <Svg width={width} height={height}>
                <Defs>
                    <SvgLinearGradient
                        id="areaFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1">
                        <Stop offset="0%" stopColor={C.sky} stopOpacity={0.2} />
                        <Stop
                            offset="100%"
                            stopColor={C.sky}
                            stopOpacity={0.01}
                        />
                    </SvgLinearGradient>
                </Defs>

                {/* Grid lines + Y labels */}
                {yTicks.map((t, i) => (
                    <G key={i}>
                        <Line
                            x1={PAD.left}
                            y1={t.y}
                            x2={PAD.left + W}
                            y2={t.y}
                            stroke={
                                i === 0 ? `${C.textMuted}66` : `${C.border}BB`
                            }
                            strokeWidth={i === 0 ? 1.5 : 1}
                            strokeDasharray={i === 0 ? undefined : "4 5"}
                        />
                        <SvgText
                            x={PAD.left - 6}
                            y={t.y + 4}
                            fontSize={8.5}
                            fill={C.textMuted}
                            textAnchor="end">
                            {fmtINRCompact(t.val)}
                        </SvgText>
                    </G>
                ))}

                {/* Area fill under curve */}
                {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}

                {/* Smooth line */}
                {linePath ? (
                    <Path
                        d={linePath}
                        fill="none"
                        stroke={C.sky}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ) : null}

                {/* Dots on each point */}
                {pts.map((p, i) => {
                    const isPeak = i === peakIdx && p.val > 0;
                    return (
                        <G key={i}>
                            <Circle
                                cx={p.x}
                                cy={p.y}
                                r={isPeak ? 6 : 3.5}
                                fill={C.surface}
                                stroke={isPeak ? C.gold : C.sky}
                                strokeWidth={isPeak ? 2.5 : 1.5}
                            />
                            {isPeak && (
                                <Circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={2.5}
                                    fill={C.gold}
                                />
                            )}
                        </G>
                    );
                })}

                {/* Peak callout bubble */}
                {pts[peakIdx] &&
                    pts[peakIdx].val > 0 &&
                    (() => {
                        const p = pts[peakIdx];
                        const bw = 52,
                            bh = 20;
                        const bx = Math.min(
                            Math.max(p.x - bw / 2, PAD.left),
                            PAD.left + W - bw,
                        );
                        const by = p.y - bh - 10;
                        return (
                            <G>
                                <Line
                                    x1={p.x}
                                    y1={p.y - 7}
                                    x2={p.x}
                                    y2={by + bh}
                                    stroke={C.gold}
                                    strokeWidth={1}
                                    strokeDasharray="3 3"
                                />
                                <Rect
                                    x={bx}
                                    y={by}
                                    width={bw}
                                    height={bh}
                                    rx={6}
                                    fill={C.gold}
                                />
                                <SvgText
                                    x={bx + bw / 2}
                                    y={by + 13}
                                    fontSize={9}
                                    fontWeight="bold"
                                    fill={C.surface}
                                    textAnchor="middle">
                                    {fmtINRCompact(p.val)}
                                </SvgText>
                            </G>
                        );
                    })()}

                {/* X-axis labels */}
                {pts.map((p, i) => (
                    <SvgText
                        key={i}
                        x={p.x}
                        y={height - 6}
                        fontSize={9}
                        fill={C.textMuted}
                        textAnchor="middle">
                        {p.label}
                    </SvgText>
                ))}
            </Svg>
        </View>
    );
};
// ─────────────────────────────────────────────────────────────────────────────

const toYearRange = (year) => ({
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
});

const buildYearOptions = (enquiries, fallbackYear) => {
    const years = new Set();
    (Array.isArray(enquiries) ? enquiries : []).forEach((i) => {
        const d = safeDate(getEnqDate(i));
        if (d) years.add(d.getFullYear());
    });
    if (years.size === 0) years.add(fallbackYear);
    return Array.from(years).sort((a, b) => b - a);
};

const computeStaffYearPerf = ({ enquiries, staffName, adminName, year }) => {
    const monthRows = MONTHS.map((m, idx) => ({
        key: `${year}-${String(idx + 1).padStart(2, "0")}`,
        monthIndex: idx,
        monthName: m,
        enquiriesCreated: 0,
        converted: 0,
        salesAmount: 0,
        lost: 0,
        assignedTotal: 0,
        connected: 0,
    }));

    const byMonth = (d) => {
        const month = d.getMonth();
        return monthRows[month] || null;
    };

    const staffKey = String(staffName || "").trim();

    (Array.isArray(enquiries) ? enquiries : []).forEach((i) => {
        const createdAt = safeDate(getEnqDate(i));
        if (!createdAt || createdAt.getFullYear() !== year) return;

        const creator = normalizeStaffLabel(i?.enqBy || "", adminName);
        const assigneeName = normalizeStaffLabel(
            i?.assignedTo?.name || i?.assignedToName || "",
            creator,
        );
        const status = String(i?.status || "").trim();
        const monthRow = byMonth(createdAt);
        if (!monthRow) return;

        if (creator === staffKey) monthRow.enquiriesCreated += 1;

        if (assigneeName === staffKey) {
            monthRow.assignedTotal += 1;
            if (status === "Converted") {
                monthRow.converted += 1;
                monthRow.salesAmount += Number(i?.cost || 0) || 0;
            }
            if (status === "Not Interested" || status === "Closed")
                monthRow.lost += 1;
            if (status === "Connected" || status === "Contacted")
                monthRow.connected += 1;
        }
    });

    const totals = monthRows.reduce(
        (acc, r) => {
            acc.enquiriesCreated += r.enquiriesCreated;
            acc.converted += r.converted;
            acc.salesAmount += r.salesAmount;
            acc.lost += r.lost;
            acc.assignedTotal += r.assignedTotal;
            acc.connected += r.connected;
            return acc;
        },
        {
            enquiriesCreated: 0,
            converted: 0,
            salesAmount: 0,
            lost: 0,
            assignedTotal: 0,
            connected: 0,
        },
    );

    const uniqueEnquiries = (Array.isArray(enquiries) ? enquiries : []).filter(
        (i) => {
            const createdAt = safeDate(getEnqDate(i));
            return createdAt && createdAt.getFullYear() === year;
        },
    );

    let open = 0,
        converted = 0,
        lost = 0,
        connected = 0;
    uniqueEnquiries.forEach((i) => {
        const status = String(i?.status || "").trim();
        if (status === "Converted") converted += 1;
        else if (status === "Closed" || status === "Not Interested") lost += 1;
        else if (status === "Connected" || status === "Contacted")
            connected += 1;
        else open += 1;
    });

    const pieData = [
        { label: "Open", value: open, color: C.amber },
        { label: "Sales Leads", value: converted, color: C.emerald },
        { label: "Lost", value: lost, color: C.rose },
        { label: "Connected", value: connected, color: C.sky },
    ];

    return { monthRows, totals, pieData, openLeads: open };
};

export default function StaffPerformanceReportScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();

    const staffName = String(route?.params?.staffName || "Staff").trim();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const adminName = useMemo(
        () => (isStaffUser ? "Admin" : user?.name || "Admin"),
        [isStaffUser, user?.name],
    );
    const selfId = String(user?.id || user?._id || "anon");
    const currentYear = useMemo(() => new Date().getFullYear(), []);

    const [year, setYear] = useState(() => {
        const passed = Number(route?.params?.year);
        return Number.isFinite(passed) ? passed : currentYear;
    });
    const [yearModalOpen, setYearModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ enquiries: [] });
    const fetchInFlight = useRef(false);

    const cacheKey = useMemo(
        () =>
            buildCacheKey("staffPerfYear:v1", selfId, staffName, String(year)),
        [selfId, staffName, year],
    );

    const load = useCallback(
        async ({ force = false } = {}) => {
            if (fetchInFlight.current) return;
            fetchInFlight.current = true;
            try {
                const cached = await getCacheEntry(cacheKey).catch(() => null);
                if (cached?.value) {
                    setData(cached.value);
                    setLoading(false);
                }
                const shouldFetch =
                    force || !isFresh(cached, REPORT_CACHE_TTL_MS);
                if (!shouldFetch) {
                    setLoading(false);
                    return;
                }

                setLoading(true);
                const range = toYearRange(year);
                const enqR = await getAllEnquiries(
                    1,
                    1000,
                    "",
                    "",
                    "",
                    "",
                    range,
                );
                const payload = { enquiries: normalizeList(enqR) };
                setData(payload);
                await setCacheEntry(cacheKey, payload, {
                    tags: ["reports"],
                }).catch(() => {});
            } catch (e) {
                console.error("Staff year report load failed", e);
            } finally {
                setLoading(false);
                fetchInFlight.current = false;
            }
        },
        [cacheKey, year],
    );

    useFocusEffect(
        useCallback(() => {
            load({ force: false });
        }, [load]),
    );
    useEffect(() => {
        load({ force: false });
    }, [load, year]);

    const yearOptions = useMemo(() => {
        const fromData = buildYearOptions(data.enquiries, currentYear);
        const base = [
            currentYear,
            currentYear - 1,
            currentYear - 2,
            currentYear - 3,
            currentYear - 4,
        ];
        const set = new Set([...(base || []), ...(fromData || [])]);
        return Array.from(set).sort((a, b) => b - a);
    }, [currentYear, data.enquiries]);

    const perf = useMemo(
        () =>
            computeStaffYearPerf({
                enquiries: data.enquiries,
                staffName,
                adminName,
                year,
            }),
        [adminName, data.enquiries, staffName, year],
    );
    const monthRowsDisplay = useMemo(() => {
        const rows = Array.isArray(perf.monthRows) ? perf.monthRows : [];
        if (!rows.length) return [];
        const now = new Date();
        const anchorMonthIndex =
            Number(year) === now.getFullYear() ? now.getMonth() : 11;
        return [
            ...rows.slice(anchorMonthIndex),
            ...rows.slice(0, anchorMonthIndex),
        ];
    }, [perf.monthRows, year]);
    const viewerRoleLabel = "Admin View";

    const headerTitle = "Staff Performance";

    return (
        <SafeAreaView style={S.safe} edges={["bottom"]}>
            <LinearGradient
                colors={[C.bg, C.bg, "#FFFFFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            <View style={[S.header, { paddingTop: insets.top }]}>
                <TouchableOpacity
                    onPress={() =>
                        navigation?.canGoBack?.()
                            ? navigation.goBack()
                            : navigation.navigate("Main")
                    }
                    style={S.headerBtn}
                    activeOpacity={0.75}>
                    <Ionicons
                        name="arrow-back-outline"
                        size={20}
                        color={C.text}
                    />
                </TouchableOpacity>

                <View style={S.headerCenter}>
                    <Text style={S.headerTitle}>{headerTitle}</Text>
                    <Text style={S.headerSub} numberOfLines={1}>
                        {staffName}
                    </Text>
                </View>

                <View style={S.headerRight}>
                    <TouchableOpacity
                        onPress={() => setYearModalOpen(true)}
                        style={S.yearChip}
                        activeOpacity={0.8}>
                        <Ionicons
                            name="calendar-outline"
                            size={16}
                            color={C.text}
                        />
                        <Text style={S.yearChipText}>{year}</Text>
                        <Ionicons
                            name="chevron-down"
                            size={16}
                            color={C.textMuted}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={S.scroll}
                showsVerticalScrollIndicator={false}>
                {loading ? (
                    <View style={S.loadingWrap}>
                        <ActivityIndicator size="large" color={C.gold} />
                        <Text style={S.loadingText}>Loading report…</Text>
                    </View>
                ) : (
                    <>
                        <View style={S.summaryCard}>
                            <View style={S.summaryTop}>
                                <View style={S.avatar}>
                                    <Text style={S.avatarText}>
                                        {(staffName[0] || "?").toUpperCase()}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={S.summaryTitle}>
                                        Overall ({year})
                                    </Text>
                                    <Text style={S.summarySub}>
                                        Month-wise performance for {staffName}
                                    </Text>
                                </View>
                            </View>

                            <View style={S.kpiGrid}>
                                <View
                                    style={[
                                        S.kpi,
                                        {
                                            backgroundColor: `${C.gold}10`,
                                            borderColor: `${C.gold}25`,
                                        },
                                    ]}>
                                    <Text style={S.kpiLabel}>
                                        Enquiries Created
                                    </Text>
                                    <Text
                                        style={[S.kpiValue, { color: C.gold }]}>
                                        {perf.totals.enquiriesCreated}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        S.kpi,
                                        {
                                            backgroundColor: `${C.emerald}10`,
                                            borderColor: `${C.emerald}25`,
                                        },
                                    ]}>
                                    <Text style={S.kpiLabel}>Sales Amount</Text>
                                    <Text
                                        style={[
                                            S.kpiValue,
                                            { color: C.emerald },
                                        ]}>
                                        {fmtINR(perf.totals.salesAmount)}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        S.kpi,
                                        {
                                            backgroundColor: `${C.rose}10`,
                                            borderColor: `${C.rose}25`,
                                        },
                                    ]}>
                                    <Text style={S.kpiLabel}>Drop</Text>
                                    <Text
                                        style={[S.kpiValue, { color: C.rose }]}>
                                        {perf.totals.lost}
                                    </Text>
                                </View>
                            </View>

                            {/* ── Monthly Sales Trend (redesigned) ── */}
                            <View style={S.chartSection}>
                                <View style={S.chartHeader}>
                                    <Text style={S.sectionTitle}>
                                        Monthly Sales Trend
                                    </Text>
                                    <Text style={S.chartSectionSub}>
                                        Sales amount per month for the year
                                    </Text>
                                </View>

                                {/* NEW smooth area chart replaces old bar chart */}
                                <SalesLineChart
                                    data={perf.monthRows}
                                    width={300}
                                    height={200}
                                />
                            </View>
                        </View>

                        <View style={S.sectionHead}>
                            <Text style={S.sectionTitle}>
                                Monthly Breakdown
                            </Text>
                            <Text style={S.sectionSub}>
                                Enquiries created + lead outcomes
                            </Text>
                        </View>

                        {monthRowsDisplay.map((m) => {
                            const now = new Date();
                            const isCurrentMonth =
                                Number(year) === now.getFullYear() &&
                                Number(m.monthIndex) === now.getMonth();
                            return (
                                <View
                                    key={m.key}
                                    style={[
                                        S.monthCard,
                                        isCurrentMonth && S.monthCardCurrent,
                                    ]}>
                                    <View style={S.monthTop}>
                                        <Text
                                            style={[
                                                S.monthName,
                                                isCurrentMonth &&
                                                    S.monthNameCurrent,
                                            ]}>
                                            {m.monthName}
                                        </Text>
                                        <View style={S.monthPills}>
                                            {isCurrentMonth ? (
                                                <View
                                                    style={S.currentMonthBadge}>
                                                    <Text
                                                        style={
                                                            S.currentMonthBadgeText
                                                        }>
                                                        Current Month
                                                    </Text>
                                                </View>
                                            ) : null}
                                            <View
                                                style={[
                                                    S.pill,
                                                    {
                                                        backgroundColor: `${C.emerald}12`,
                                                        borderColor: `${C.emerald}25`,
                                                    },
                                                ]}>
                                                <Text
                                                    style={[
                                                        S.pillText,
                                                        { color: C.emerald },
                                                    ]}>
                                                    Sales:{" "}
                                                    {fmtINR(m.salesAmount)}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={S.monthGrid}>
                                        <View style={S.metric}>
                                            <Text style={S.metricLabel}>
                                                Enquiries Created
                                            </Text>
                                            <Text style={S.metricValue}>
                                                {m.enquiriesCreated}
                                            </Text>
                                        </View>
                                        <View style={S.metric}>
                                            <Text style={S.metricLabel}>
                                                Sales Count
                                            </Text>
                                            <Text
                                                style={[
                                                    S.metricValue,
                                                    { color: C.emerald },
                                                ]}>
                                                {m.converted}
                                            </Text>
                                        </View>
                                        <View style={S.metric}>
                                            <Text style={S.metricLabel}>
                                                Drop Leads
                                            </Text>
                                            <Text
                                                style={[
                                                    S.metricValue,
                                                    { color: C.rose },
                                                ]}>
                                                {m.lost}
                                            </Text>
                                        </View>
                                        <View style={S.metric}>
                                            <Text style={S.metricLabel}>
                                                Follow-ups
                                            </Text>
                                            <Text
                                                style={[
                                                    S.metricValue,
                                                    { color: C.sky },
                                                ]}>
                                                {m.connected}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>

            <Modal
                visible={yearModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setYearModalOpen(false)}>
                <TouchableOpacity
                    style={S.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setYearModalOpen(false)}>
                    <View style={S.modalCard}>
                        <Text style={S.modalTitle}>Select Year</Text>
                        <View style={S.modalList}>
                            {yearOptions.map((y) => (
                                <TouchableOpacity
                                    key={String(y)}
                                    style={[
                                        S.modalItem,
                                        y === year && S.modalItemActive,
                                    ]}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        setYear(y);
                                        setYearModalOpen(false);
                                    }}>
                                    <Text
                                        style={[
                                            S.modalItemText,
                                            y === year && S.modalItemTextActive,
                                        ]}>
                                        {y}
                                    </Text>
                                    {y === year ? (
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={18}
                                            color={C.emerald}
                                        />
                                    ) : null}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const S = StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: {
        paddingHorizontal: 14,
        paddingBottom: 12,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 10,
    },
    headerBtn: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
        justifyContent: "center",
    },
    headerCenter: { flex: 1, paddingBottom: 2 },
    headerTitle: { fontSize: 16, fontWeight: "900", color: C.text },
    headerSub: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: "700",
        color: C.textSec,
    },
    headerRight: { alignItems: "flex-end", gap: 8, paddingBottom: 2 },
    yearChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        height: 42,
        borderRadius: 14,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
    },
    yearChipText: { fontSize: 13, fontWeight: "900", color: C.text },

    scroll: { padding: 14, paddingBottom: 26 },
    loadingWrap: {
        paddingTop: 40,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    loadingText: { color: C.textSec, fontWeight: "700" },

    summaryCard: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 20,
        padding: 14,
    },
    summaryTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 16,
        backgroundColor: C.goldLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: `${C.gold}35`,
    },
    avatarText: { fontSize: 16, fontWeight: "900", color: C.gold },
    summaryTitle: { fontSize: 14, fontWeight: "900", color: C.text },
    summarySub: {
        marginTop: 2,
        fontSize: 12,
        color: C.textSec,
        fontWeight: "600",
    },
    roleInfoCard: {
        marginTop: 10,
        marginBottom: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${C.gold}35`,
        backgroundColor: `${C.gold}08`,
        padding: 10,
        gap: 5,
    },
    roleInfoTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 2,
    },
    roleBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: `${C.gold}40`,
        backgroundColor: `${C.gold}14`,
    },
    roleBadgeText: {
        fontSize: 10,
        fontWeight: "900",
        color: C.gold,
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
    roleInfoTitle: {
        fontSize: 11,
        fontWeight: "800",
        color: C.text,
    },
    roleInfoLine: {
        fontSize: 11,
        color: C.textSec,
        fontWeight: "600",
        lineHeight: 16,
    },
    roleInfoStrong: {
        color: C.text,
        fontWeight: "900",
    },
    roleInfoHint: {
        marginTop: 2,
        fontSize: 11,
        color: C.textMuted,
        fontWeight: "700",
    },

    kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    kpi: {
        width: "48%",
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
    },
    kpiLabel: { fontSize: 11, fontWeight: "800", color: C.textSec },
    kpiValue: { marginTop: 6, fontSize: 20, fontWeight: "900", color: C.text },

    chartSection: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: C.border,
    },
    chartHeader: { marginBottom: 10 },
    chartSectionSub: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: "600",
        color: C.textSec,
    },
    chartGraphicWrap: { alignSelf: "center", marginTop: 2 },
    chartSummary: {
        marginTop: 14,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        gap: 10,
    },
    chartStat: {
        width: "48%",
        padding: 12,
        borderRadius: 16,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
    },
    chartStatLabel: { fontSize: 11, fontWeight: "800", color: C.textSec },
    chartStatValue: {
        marginTop: 6,
        fontSize: 16,
        fontWeight: "900",
        color: C.text,
    },

    pieCenter: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    pieValue: { fontSize: 20, fontWeight: "900", color: C.text },
    pieLabel: {
        marginTop: 2,
        fontSize: 10,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 1,
    },

    sectionHead: { marginTop: 16, marginBottom: 10 },
    sectionTitle: { fontSize: 14, fontWeight: "900", color: C.text },
    sectionSub: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: "600",
        color: C.textSec,
    },

    monthCard: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
    },
    monthCardCurrent: {
        backgroundColor: "#F2FAF6",
        borderColor: `${C.emerald}55`,
    },
    monthTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    monthName: { flex: 1, fontSize: 14, fontWeight: "900", color: C.text },
    monthNameCurrent: { color: C.emerald },
    monthPills: { gap: 8, alignItems: "flex-end" },
    currentMonthBadge: {
        paddingVertical: 4,
        paddingHorizontal: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: `${C.emerald}40`,
        backgroundColor: `${C.emerald}16`,
    },
    currentMonthBadgeText: {
        fontSize: 10,
        fontWeight: "900",
        color: C.emerald,
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    pill: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
    },
    pillText: { fontSize: 11, fontWeight: "900" },

    monthGrid: {
        marginTop: 12,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    metric: {
        width: "48%",
        padding: 12,
        borderRadius: 16,
        backgroundColor: C.bg,
        borderWidth: 1,
        borderColor: C.border,
    },
    metricLabel: { fontSize: 11, fontWeight: "800", color: C.textSec },
    metricValue: {
        marginTop: 6,
        fontSize: 18,
        fontWeight: "900",
        color: C.text,
    },

    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        padding: 18,
        justifyContent: "center",
    },
    modalCard: {
        backgroundColor: C.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
    },
    modalTitle: { fontSize: 14, fontWeight: "900", color: C.text },
    modalList: { marginTop: 10 },
    modalItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 10,
    },
    modalItemActive: {
        borderColor: `${C.emerald}55`,
        backgroundColor: `${C.emerald}0C`,
    },
    modalItemText: { fontSize: 13, fontWeight: "900", color: C.text },
    modalItemTextActive: { color: C.emerald },
});
