import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar } from "react-native-calendars";
import {
    Animated,
    Dimensions,
    Modal,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { SkeletonBox, SkeletonCard, SkeletonLine, SkeletonPulse, SkeletonSpacer } from "../components/skeleton/Skeleton";
import { getCallLogs } from "../services/callLogService";
import { getAllEnquiries } from "../services/enquiryService";
import { getFollowUps } from "../services/followupService";


// â”€â”€â”€ Premium Light Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const C = {
    bg:           "#F5F3EF",
    surface:      "#FFFFFF",
    surfaceWarm:  "#FFFAF4",
    border:       "#EAE6DF",
    borderStrong: "#D6D0C8",
    text:         "#1A1714",
    textSec:      "#5C574F",
    textMuted:    "#9B958C",
    gold:         "#B8892A",
    goldLight:    "#F5E9C8",
    goldMid:      "#E8D4A0",
    teal:         "#1A7A6E",
    tealLight:    "#E0F2EF",
    rose:         "#C0443A",
    roseLight:    "#FDE8E6",
    violet:       "#6045A8",
    violetLight:  "#EDE8F9",
    sky:          "#1868B7",
    skyLight:     "#E3EEFF",
    amber:        "#C07820",
    amberLight:   "#FEF3E2",
    emerald:      "#1B7A48",
    emeraldLight: "#E3F5EC",
};

const CHART_COLORS = [C.gold, C.teal, C.rose, C.violet, C.sky, C.amber, C.emerald];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const normalizeList = (p) => Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
const safeDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
const fmt = (v) => `\u20B9${Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
const toDayRange = (value = new Date()) => {
    const d = safeDate(value) || new Date();
    return {
        start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0),
        end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
    };
};
const toIsoDate = (value = new Date()) => {
    const d = safeDate(value) || new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const shiftIsoDate = (value, amount) => {
    const d = safeDate(value) || new Date();
    d.setDate(d.getDate() + amount);
    return toIsoDate(d);
};
const formatDayLabel = (value) => {
    const d = safeDate(value) || new Date();
    return d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};
const inRange = (v, r) => { if (!r) return true; const p=safeDate(v); if (!p) return false; return p>=r.start&&p<=r.end; };
const getEnqDate  = (i) => i?.enquiryDateTime||i?.date||i?.createdAt||null;
const getFupDate  = (i) => i?.nextFollowUpDate||i?.followUpDate||i?.date||i?.createdAt||null;
const getCallDate = (i) => i?.callTime||i?.createdAt||null;
const statusColor = (s) => {
    const v = String(s||"").toLowerCase();
    if (v.includes("converted")||v.includes("closed")) return C.emerald;
    if (v.includes("interest")||v.includes("contact")) return C.sky;
    if (v.includes("not")||v.includes("lost")) return C.rose;
    return C.amber;
};
const displayStatusLabel = (status) => {
    if (status === "Converted") return "Sales";
    if (status === "Closed") return "Drop";
    return status;
};

// â”€â”€â”€ Animated Counter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AnimCounter = ({ value, style, prefix="" }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        Animated.timing(anim, { toValue: value, duration: 900, useNativeDriver: false }).start();
        const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
        return () => anim.removeListener(id);
    }, [value]);
    return <Text style={style}>{prefix}{display}</Text>;
};

// â”€â”€â”€ Donut Chart (pure RN view layers) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Animated Bar Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DonutChart = ({ data, size = 130, strokeWidth = 20, centerLabel = "TOTAL" }) => {
    const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
    if (total <= 0) {
        return (
            <View style={{ width: size, height: size, alignItems:"center", justifyContent:"center" }}>
                <View style={{ width: size, height: size, borderRadius: size/2, borderWidth: strokeWidth, borderColor: C.border, position:"absolute" }} />
                <View style={{ width: size - strokeWidth*2 - 10, height: size - strokeWidth*2 - 10, borderRadius: 999, backgroundColor: C.surface, alignItems:"center", justifyContent:"center" }}>
                    <Text style={{ fontSize:20, fontWeight:"800", color:C.text }}>0</Text>
                    <Text style={{ fontSize:9, color:C.textMuted, fontWeight:"600", letterSpacing:0.5 }}>{centerLabel}</Text>
                </View>
            </View>
        );
    }

    let cumulative = 0;
    const segments = data.map((d, i) => {
        const pct = (Number(d.value) || 0) / total;
        const seg = { ...d, pct, startPct: cumulative, color: d.color || CHART_COLORS[i % CHART_COLORS.length] };
        cumulative += pct;
        return seg;
    });

    return (
        <View style={{ width: size, height: size, alignItems:"center", justifyContent:"center" }}>
            <View style={{ width: size, height: size, borderRadius: size/2, borderWidth: strokeWidth, borderColor: C.border, position:"absolute" }} />
            {segments.map((seg, i) => {
                const deg = seg.pct * 360;
                if (deg < 2) return null;
                const start = seg.startPct * 360;
                return (
                    <View key={i} style={{ position:"absolute", width: size, height: size, borderRadius: size/2, overflow:"hidden" }}>
                        <View style={{
                            position:"absolute", width: size, height: size, borderRadius: size/2,
                            borderWidth: strokeWidth, borderColor:"transparent",
                            borderTopColor: seg.color,
                            borderRightColor: deg > 90 ? seg.color : "transparent",
                            borderBottomColor: deg > 180 ? seg.color : "transparent",
                            borderLeftColor: deg > 270 ? seg.color : "transparent",
                            transform: [{ rotate: `${start - 90}deg` }],
                        }} />
                    </View>
                );
            })}
            <View style={{ width: size - strokeWidth*2 - 10, height: size - strokeWidth*2 - 10, borderRadius: 999, backgroundColor: C.surface, alignItems:"center", justifyContent:"center" }}>
                <Text style={{ fontSize:20, fontWeight:"800", color:C.text }}>{total}</Text>
                <Text style={{ fontSize:9, color:C.textMuted, fontWeight:"600", letterSpacing:0.5 }}>{centerLabel}</Text>
            </View>
        </View>
    );
};

const BarChart = ({ data, height = 90, color = C.teal }) => {
    const max = Math.max(...data.map(d => d.value), 1);
    const anims = useRef(data.map(() => new Animated.Value(0))).current;
    useEffect(() => {
        Animated.stagger(55, data.map((d, i) =>
            Animated.spring(anims[i], { toValue: d.value / max, useNativeDriver: false, friction: 6 })
        )).start();
    }, []);
    return (
        <View style={{ flexDirection:"row", alignItems:"flex-end", height, gap:5 }}>
            {data.map((d, i) => (
                <View key={i} style={{ flex:1, alignItems:"center", gap:3 }}>
                    <Animated.View style={{
                        width:"80%", borderRadius:5,
                        backgroundColor: i === data.length-1 ? color : `${color}55`,
                        height: anims[i].interpolate({ inputRange:[0,1], outputRange:[4, height-20] }),
                    }} />
                    <Text style={{ fontSize:9, color:C.textMuted, fontWeight:"600" }}>{d.label}</Text>
                </View>
            ))}
        </View>
    );
};

// â”€â”€â”€ Animated Progress Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AnimProgressBar = ({ value, total, color, delay=0 }) => {
    const anim = useRef(new Animated.Value(0)).current;
    const pct = total > 0 ? Math.min(100, Math.max(3, Math.round((value/total)*100))) : 0;
    useEffect(() => {
        const t = setTimeout(() => {
            Animated.timing(anim, { toValue: pct, duration: 750, useNativeDriver: false }).start();
        }, delay);
        return () => clearTimeout(t);
    }, [pct]);
    return (
        <View style={st.progressTrack}>
            <Animated.View style={[st.progressFill, {
                backgroundColor: color,
                width: anim.interpolate({ inputRange:[0,100], outputRange:["0%","100%"] }),
            }]} />
        </View>
    );
};

// â”€â”€â”€ Fade + slide in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FadeIn = ({ children, delay=0 }) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(18)).current;
    useEffect(() => {
        const t = setTimeout(() => {
            Animated.parallel([
                Animated.timing(opacity,    { toValue:1, duration:480, useNativeDriver:true }),
                Animated.timing(translateY, { toValue:0, duration:480, useNativeDriver:true }),
            ]).start();
        }, delay);
        return () => clearTimeout(t);
    }, []);
    return <Animated.View style={{ opacity, transform:[{translateY}] }}>{children}</Animated.View>;
};

// â”€â”€â”€ Filter Pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FilterPill = ({ label, value, onPress, icon, accent, isOpen }) => (
    <TouchableOpacity
        style={[st.filterPill, { borderColor:`${accent||C.gold}35`, backgroundColor:`${accent||C.gold}08` }]}
        onPress={onPress} activeOpacity={0.75}>
        <Ionicons name={icon} size={13} color={accent||C.gold} />
        <View style={{flex:1}}>
            <Text style={st.filterPillLabel}>{label}</Text>
            <Text style={[st.filterPillValue, {color:accent||C.text}]} numberOfLines={1}>{value}</Text>
        </View>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={12} color={C.textMuted} />
    </TouchableOpacity>
);

const FilterDropdownMenu = ({ options, selectedValue, onSelect, accent }) => (
    <View style={[st.filterMenu, { borderColor:`${accent||C.gold}30` }]}>
        {options.map((option) => {
            const isSelected = option === selectedValue;
            return (
                <TouchableOpacity
                    key={option}
                    style={[st.filterMenuItem, isSelected && { backgroundColor:`${accent||C.gold}14` }]}
                    onPress={() => onSelect(option)}
                    activeOpacity={0.75}>
                    <Text style={[st.filterMenuText, isSelected && { color:accent||C.gold, fontWeight:"700" }]}>
                        {option}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={14} color={accent||C.gold} />}
                </TouchableOpacity>
            );
        })}
    </View>
);

// â”€â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Card = ({ children, style }) => <View style={[st.card, style]}>{children}</View>;

const CardHeader = ({ title, icon, accent, right }) => (
    <View style={st.cardHeader}>
        <View style={[st.cardIconBg, { backgroundColor:`${accent||C.gold}18` }]}>
            <Ionicons name={icon} size={16} color={accent||C.gold} />
        </View>
        <Text style={st.cardTitle}>{title}</Text>
        {right && <View style={{marginLeft:"auto"}}>{right}</View>}
    </View>
);

// â”€â”€â”€ MAIN SCREEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ReportScreen() {
    const insets = useSafeAreaInsets();

    const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
    const [calendarVisible, setCalendarVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [reportData, setReportData] = useState({ enquiries:[], followups:[], callLogs:[] });

    const loadReportData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [enqR,fupR,callR] = await Promise.all([
                getAllEnquiries(1,1000,"","",""),
                getFollowUps("All",1,1000),
                getCallLogs({limit:500}),
            ]);
            setReportData({ enquiries:normalizeList(enqR), followups:normalizeList(fupR), callLogs:normalizeList(callR) });
        } catch(e) { console.error(e); }
        finally { setIsLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => { loadReportData(); }, [loadReportData]));

    const filterRange = useMemo(() => toDayRange(selectedDate), [selectedDate]);

    const filteredEnq   = useMemo(() => reportData.enquiries.filter(item => {
        if (!inRange(getEnqDate(item),filterRange)) return false;
        return true;
    }), [filterRange,reportData.enquiries]);

    const filteredFups  = useMemo(() => reportData.followups.filter(item => {
        if (!inRange(getFupDate(item),filterRange)) return false;
        return true;
    }), [filterRange,reportData.followups]);

    const filteredCalls = useMemo(() => reportData.callLogs.filter(i => inRange(getCallDate(i),filterRange)), [filterRange,reportData.callLogs]);

    const leadM = useMemo(() => {
        const counts = filteredEnq.reduce((a,i)=>{const k=i?.status||"New";a[k]=(a[k]||0)+1;return a;},{});
        return { total:filteredEnq.length, new:counts.New||0, qualified:counts.Interested||0, lost:counts["Not Interested"]||0, converted:counts.Converted||0, counts };
    },[filteredEnq]);

    const salesPerf = useMemo(() => {
        const map={};
        filteredFups.forEach(i=>{const n=i?.staffName||"Unassigned";if(!map[n])map[n]={name:n,leads:0,followups:0,converted:0};map[n].followups++;if(i?.enqId?.status==="Converted")map[n].converted++;});
        filteredEnq.forEach(i=>{const n=i?.assignedTo?.name||"Unassigned";if(!map[n])map[n]={name:n,leads:0,followups:0,converted:0};map[n].leads++;});
        return Object.values(map).sort((a,b)=>b.converted-a.converted).slice(0,6);
    },[filteredEnq,filteredFups]);

    const revenueM = useMemo(() => {
        const convertedEnquiries = reportData.enquiries.filter(i => i?.status === "Converted");
        const total = convertedEnquiries.reduce((s, i) => s + Number(i?.cost || 0), 0);
        const now = new Date();
        const month = convertedEnquiries
            .filter(i => {
                const d = safeDate(getEnqDate(i));
                return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            })
            .reduce((s, i) => s + Number(i?.cost || 0), 0);
        const today = filteredEnq
            .filter(i => i?.status === "Converted")
            .reduce((s, i) => s + Number(i?.cost || 0), 0);
        return { total, month, today };
    },[filteredEnq, reportData.enquiries]);

    const exportReport = async () => {
        try {
            await Share.share({title:"CRM Report", message:[`CRM Report - ${formatDayLabel(selectedDate)}`,`Leads: ${leadM.total}`,`Sales: ${leadM.converted}`,`Revenue: ${fmt(revenueM.total)}`].join("\n")});
        } catch(e){console.error(e);}
    };

    return (
        <SafeAreaView style={st.container} edges={["top"]}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[st.scroll, {paddingTop: insets.top > 0 ? 4 : 12}]}>

                {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <FadeIn delay={0}>
                    <LinearGradient colors={["#FBF7F0","#EEE7D8","#E8DEC9"]} start={{x:0,y:0}} end={{x:1,y:1}} style={st.hero}>
                        {/* Decorative circles */}
                        <View style={st.decCircle1} />
                        <View style={st.decCircle2} />

                        <View style={st.heroTop}>
                            <View>
                                <View style={st.heroPill}>
                                    <View style={st.heroPillDot} />
                                    <Text style={st.heroPillText}>CRM Analytics</Text>
                                </View>
                                <Text style={st.heroTitle}>Reports</Text>
                                <Text style={st.heroSub}>{formatDayLabel(selectedDate)} - {filteredEnq.length} leads</Text>
                            </View>
                            <TouchableOpacity style={st.exportBtn} onPress={exportReport} activeOpacity={0.8}>
                                <Ionicons name="share-social-outline" size={14} color="#FFF" />
                                <Text style={st.exportBtnText}>Export</Text>
                            </TouchableOpacity>
                        </View>

                        {/* 4-KPI strip */}
                        <View style={st.heroKpis}>
                            {[
                                {label:"Leads",      value:leadM.total,          color:C.gold,    icon:"people-outline"},
                                {label:"Sales",      value:leadM.converted,      color:C.emerald, icon:"checkmark-circle-outline"},
                                {label:"Interested", value:leadM.qualified,      color:C.sky,     icon:"sparkles-outline"},
                                {label:"Revenue",    value:fmt(revenueM.total),  color:C.violet,  icon:"cash-outline"},
                            ].map((k,i) => (
                                <View key={i} style={[st.heroKpi, i<3 && st.heroKpiBorder]}>
                                    <View style={[st.heroKpiIcon,{backgroundColor:`${k.color}20`}]}>
                                        <Ionicons name={k.icon} size={12} color={k.color} />
                                    </View>
                                    <Text style={[st.heroKpiVal,{color:k.color}]}>{k.value}</Text>
                                    <Text style={st.heroKpiLabel}>{k.label}</Text>
                                </View>
                            ))}
                        </View>
                    </LinearGradient>
                </FadeIn>

                {/* â”€â”€ FILTER CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <FadeIn delay={70}>
                    <Card>
                        <View style={st.filterCardTop}>
                            <Ionicons name="calendar-outline" size={15} color={C.gold} />
                            <Text style={st.filterCardTitle}>Daily Report</Text>
                        </View>
                        <View style={st.dayNav}>
                            <TouchableOpacity
                                style={st.dayNavBtn}
                                onPress={() => setSelectedDate((prev) => shiftIsoDate(prev, -1))}
                                activeOpacity={0.8}>
                                <Ionicons name="chevron-back" size={16} color={C.text} />
                            </TouchableOpacity>
                            <View style={st.dayNavCenter}>
                                <Text style={st.dayNavLabel}>Selected Day</Text>
                                <Text style={st.dayNavValue}>{formatDayLabel(selectedDate)}</Text>
                            </View>
                            <TouchableOpacity
                                style={st.dayNavBtn}
                                onPress={() => setSelectedDate((prev) => shiftIsoDate(prev, 1))}
                                activeOpacity={0.8}>
                                <Ionicons name="chevron-forward" size={16} color={C.text} />
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={st.calendarTrigger}
                            onPress={() => setCalendarVisible(true)}
                            activeOpacity={0.85}>
                            <Ionicons name="calendar-clear-outline" size={16} color={C.gold} />
                            <Text style={st.calendarTriggerText}>Open Calendar</Text>
                        </TouchableOpacity>
                        <View style={st.dayActions}>
                            <TouchableOpacity
                                style={st.todayBtn}
                                onPress={() => setSelectedDate(toIsoDate(new Date()))}
                                activeOpacity={0.8}>
                                <Ionicons name="flash-outline" size={14} color={C.gold} />
                                <Text style={st.todayBtnText}>Today</Text>
                            </TouchableOpacity>
                            <Text style={st.dayHint}>All report cards update for this selected day.</Text>
                        </View>
                    </Card>
                </FadeIn>

                <Modal
                    visible={calendarVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setCalendarVisible(false)}>
                    <TouchableOpacity
                        style={st.calendarOverlay}
                        activeOpacity={1}
                        onPress={() => setCalendarVisible(false)}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={(e) => e.stopPropagation()}
                            style={st.calendarModalCard}>
                            <View style={st.calendarModalHeader}>
                                <View>
                                    <Text style={st.calendarModalTitle}>Select Report Date</Text>
                                    <Text style={st.calendarModalSub}>{formatDayLabel(selectedDate)}</Text>
                                </View>
                                <TouchableOpacity
                                    style={st.calendarCloseBtn}
                                    onPress={() => setCalendarVisible(false)}
                                    activeOpacity={0.8}>
                                    <Ionicons name="close" size={18} color={C.text} />
                                </TouchableOpacity>
                            </View>
                            <Calendar
                                current={selectedDate}
                                onDayPress={(day) => {
                                    if (day?.dateString) {
                                        setSelectedDate(day.dateString);
                                        setCalendarVisible(false);
                                    }
                                }}
                                markedDates={{
                                    [selectedDate]: {
                                        selected: true,
                                        selectedColor: C.gold,
                                        selectedTextColor: "#FFFFFF",
                                    },
                                }}
                                theme={{
                                    calendarBackground: C.surface,
                                    textSectionTitleColor: C.textMuted,
                                    selectedDayBackgroundColor: C.gold,
                                    selectedDayTextColor: "#FFFFFF",
                                    todayTextColor: C.teal,
                                    dayTextColor: C.text,
                                    textDisabledColor: C.borderStrong,
                                    monthTextColor: C.text,
                                    arrowColor: C.gold,
                                    textDayFontWeight: "600",
                                    textMonthFontWeight: "800",
                                    textDayHeaderFontWeight: "700",
                                }}
                                hideExtraDays={false}
                                enableSwipeMonths
                                firstDay={1}
                                style={st.calendar}
                            />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>

                {isLoading ? (
                    <SkeletonPulse>
                        <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 12 }}>
                            <SkeletonCard style={{ borderRadius: 20 }}>
                                <SkeletonLine width="46%" height={14} />
                                <SkeletonSpacer h={14} />
                                <SkeletonBox height={140} radius={18} />
                                <SkeletonSpacer h={14} />
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                    <SkeletonLine width="28%" height={10} />
                                    <SkeletonLine width="20%" height={10} />
                                    <SkeletonLine width="16%" height={10} />
                                </View>
                            </SkeletonCard>
                            <SkeletonCard style={{ borderRadius: 20 }}>
                                <SkeletonLine width="38%" height={14} />
                                <SkeletonSpacer h={14} />
                                <SkeletonBox height={180} radius={18} />
                            </SkeletonCard>
                        </View>
                    </SkeletonPulse>
                ) : (
                    <>
                        {/* â”€â”€ LEAD OVERVIEW â€” Donut + Legend + Bars â”€â”€ */}
                        <FadeIn delay={100}>
                            <Card>
                                <CardHeader title="Lead Overview" icon="people-outline" accent={C.sky} />
                                <View style={st.donutRow}>
                                    <DonutChart
                                        size={130}
                                        strokeWidth={20}
                                        centerLabel="LEADS"
                                        data={[
                                            {label:"New",       value:leadM.new,       color:C.amber},
                                            {label:"Interested",value:leadM.qualified, color:C.sky},
                                            {label:"Lost",      value:leadM.lost,      color:C.rose},
                                            {label:"Sales", value:leadM.converted, color:C.emerald},
                                        ]}
                                    />
                                    <View style={st.donutLegend}>
                                        {[
                                            {label:"New",       value:leadM.new,       color:C.amber},
                                            {label:"Interested",value:leadM.qualified, color:C.sky},
                                            {label:"Lost",      value:leadM.lost,      color:C.rose},
                                            {label:"Sales", value:leadM.converted, color:C.emerald},
                                        ].map(item => (
                                            <View
                                                key={item.label}
                                                style={[st.legendRow, { borderColor:`${item.color}20`, backgroundColor:`${item.color}08` }]}>
                                                <View style={[st.legendDot,{backgroundColor:item.color}]} />
                                                <Text style={st.legendLabel}>{item.label}</Text>
                                                <Text style={[st.legendVal,{color:item.color}]}>{item.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                                {/* Status breakdown bars */}
                                <View style={st.divider} />
                                <Text style={st.subHeading}>Status Breakdown</Text>
                                {Object.entries(leadM.counts).map(([lbl,val],i)=>(
                                    <View key={lbl} style={st.pRow}>
                                        <View style={st.pLabelRow}>
                                            <Text style={st.pLabel}>{displayStatusLabel(lbl)}</Text>
                                            <Text style={[st.pValText,{color:statusColor(lbl)}]}>{val}</Text>
                                        </View>
                                        <AnimProgressBar value={val} total={leadM.total||1} color={statusColor(lbl)} delay={i*80} />
                                    </View>
                                ))}
                            </Card>
                        </FadeIn>

                        {/* â”€â”€ TEAM PERFORMANCE â€” colored table â”€â”€ */}
                        <FadeIn delay={140}>
                            <Card>
                                <CardHeader title="Team Performance" icon="podium-outline" accent={C.rose} />
                                <View style={st.tableHead}>
                                    {["Person","Leads","F-ups","Won"].map((h,i)=>(
                                        <Text key={h} style={[st.thCell, i===0&&st.thNameCell]}>{h}</Text>
                                    ))}
                                </View>
                                {salesPerf.length===0
                                    ? <Text style={st.emptyNote}>No performance data</Text>
                                    : salesPerf.map((item,idx)=>(
                                        <View key={item.name} style={[st.tableRow, idx%2===1&&{backgroundColor:`${C.gold}08`}]}>
                                            <View style={[st.thNameCell,{flexDirection:"row",alignItems:"center",gap:8}]}>
                                                <View style={[st.teamAvatar,{backgroundColor:`${CHART_COLORS[idx%CHART_COLORS.length]}22`}]}>
                                                    <Text style={[st.teamAvatarText,{color:CHART_COLORS[idx%CHART_COLORS.length]}]}>
                                                        {(item.name[0]||"?").toUpperCase()}
                                                    </Text>
                                                </View>
                                                <Text style={st.tdName} numberOfLines={1}>{item.name}</Text>
                                            </View>
                                            <Text style={st.tdCell}>{item.leads}</Text>
                                            <Text style={st.tdCell}>{item.followups}</Text>
                                            <View style={[st.tdCell,{alignItems:"center"}]}>
                                                <View style={[st.wonBadge,{backgroundColor:item.converted>0?C.emeraldLight:C.border}]}>
                                                    <Text style={[st.wonText,{color:item.converted>0?C.emerald:C.textMuted}]}>{item.converted}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))
                                }
                            </Card>
                        </FadeIn>

                        {/* â”€â”€ REVENUE â€” gradient hero + 2 stat cards â”€â”€ */}
                        <FadeIn delay={180}>
                            <Card>
                                <CardHeader title="Revenue" icon="cash-outline" accent={C.emerald} />
                                <LinearGradient colors={["#EEF9F3","#E2F5EA"]} start={{x:0,y:0}} end={{x:1,y:1}} style={st.revHero}>
                                    <View style={st.revHeroInner}>
                                        <Text style={st.revLabel}>Total Revenue</Text>
                                        <Text style={st.revValue}>{fmt(revenueM.total)}</Text>
                                        <View style={st.revSubRow}>
                                            <Ionicons name="arrow-up-outline" size={12} color={C.emerald} />
                                            <Text style={[st.revSubText,{color:C.emerald}]}>This month: {fmt(revenueM.month)}</Text>
                                        </View>
                                        <Text style={st.revTodayText}>Selected day: {fmt(revenueM.today)}</Text>
                                    </View>
                                </LinearGradient>
                                <View style={st.revStatRow}>
                                    {[
                                        {label:"Sales Deals",  value:leadM.converted, color:C.emerald, icon:"checkmark-circle-outline", isNum:true},
                                        {label:"Avg Deal Value",   value:leadM.converted>0?fmt(Math.round(revenueM.total/leadM.converted)):fmt(0), color:C.gold, icon:"trending-up-outline", isNum:false},
                                    ].map((s,i)=>(
                                        <View key={i} style={[st.revStat,{backgroundColor:`${s.color}0E`,borderColor:`${s.color}25`}]}>
                                            <Ionicons name={s.icon} size={20} color={s.color} />
                                            {s.isNum
                                                ? <AnimCounter value={s.value} style={[st.revStatVal,{color:s.color}]} />
                                                : <Text style={[st.revStatVal,{color:s.color}]}>{s.value}</Text>
                                            }
                                            <Text style={st.revStatLabel}>{s.label}</Text>
                                        </View>
                                    ))}
                                </View>
                                <Text style={st.helperNote}>* Based on cost values from converted enquiries in your CRM.</Text>
                            </Card>
                        </FadeIn>

                        <View style={{height:20}} />
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const st = StyleSheet.create({
    container: { flex:1, backgroundColor:C.bg },
    scroll: { paddingHorizontal:14, paddingBottom:40, gap:14 },

    // Hero
    hero: { borderRadius:24, padding:20, gap:14, borderWidth:1, borderColor:C.border, overflow:"hidden", position:"relative" },
    decCircle1: { position:"absolute", width:160, height:160, borderRadius:80, borderWidth:1.5, borderColor:`${C.gold}20`, right:-40, top:-40 },
    decCircle2: { position:"absolute", width:90,  height:90,  borderRadius:45, borderWidth:1,   borderColor:`${C.gold}15`, right:10,  top:30  },
    heroTop: { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start" },
    heroPill: { flexDirection:"row", alignItems:"center", gap:5, marginBottom:5 },
    heroPillDot: { width:6, height:6, borderRadius:3, backgroundColor:C.gold },
    heroPillText: { fontSize:10, fontWeight:"700", color:C.gold, letterSpacing:1.3, textTransform:"uppercase" },
    heroTitle: { fontSize:36, fontWeight:"800", color:C.text, letterSpacing:-0.8 },
    heroSub: { fontSize:13, color:C.textSec, marginTop:2 },
    exportBtn: { flexDirection:"row", alignItems:"center", gap:6, backgroundColor:C.gold, paddingHorizontal:13, paddingVertical:8, borderRadius:20 },
    exportBtnText: { fontSize:12, fontWeight:"700", color:"#FFF" },
    heroKpis: { flexDirection:"row", backgroundColor:"rgba(255,255,255,0.75)", borderRadius:18, borderWidth:1, borderColor:C.border, overflow:"hidden" },
    heroKpi: { flex:1, alignItems:"center", paddingVertical:11, gap:3 },
    heroKpiBorder: { borderRightWidth:1, borderRightColor:C.border },
    heroKpiIcon: { width:24, height:24, borderRadius:12, alignItems:"center", justifyContent:"center", marginBottom:1 },
    heroKpiVal: { fontSize:13, fontWeight:"800" },
    heroKpiLabel: { fontSize:9, color:C.textMuted, fontWeight:"600", textTransform:"uppercase", letterSpacing:0.4 },

    // Filters
    filterCardTop: { flexDirection:"row", alignItems:"center", gap:8 },
    filterCardTitle: { fontSize:16, fontWeight:"700", color:C.text },
    dayNav: { flexDirection:"row", alignItems:"center", gap:12 },
    dayNavBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surfaceWarm,
        alignItems: "center",
        justifyContent: "center",
    },
    dayNavCenter: { flex:1, alignItems:"center", justifyContent:"center" },
    dayNavLabel: { fontSize:11, fontWeight:"700", color:C.textMuted, textTransform:"uppercase", letterSpacing:0.6 },
    dayNavValue: { fontSize:15, fontWeight:"800", color:C.text, marginTop:4 },
    calendarTrigger: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${C.gold}35`,
        backgroundColor: `${C.gold}10`,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    calendarTriggerText: { fontSize:13, fontWeight:"700", color:C.gold },
    calendarWrap: {
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surface,
    },
    calendar: {
        borderRadius: 18,
    },
    calendarOverlay: {
        flex: 1,
        backgroundColor: "rgba(14, 18, 24, 0.36)",
        justifyContent: "center",
        padding: 20,
    },
    calendarModalCard: {
        backgroundColor: C.surface,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: C.border,
        padding: 16,
        gap: 14,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    calendarModalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    calendarModalTitle: { fontSize:17, fontWeight:"800", color:C.text },
    calendarModalSub: { fontSize:12, color:C.textSec, marginTop:4 },
    calendarCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.surfaceWarm,
        borderWidth: 1,
        borderColor: C.border,
        alignItems: "center",
        justifyContent: "center",
    },
    dayActions: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:12 },
    todayBtn: {
        flexDirection:"row",
        alignItems:"center",
        gap:6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${C.gold}35`,
        backgroundColor: `${C.gold}10`,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    todayBtnText: { fontSize:13, fontWeight:"700", color:C.gold },
    dayHint: { flex:1, fontSize:12, color:C.textSec, textAlign:"right" },
    filterGrid: { gap:10 },
    filterGroup: { gap:6 },
    filterPill: { flexDirection:"row", alignItems:"center", gap:10, borderRadius:14, borderWidth:1, paddingHorizontal:12, paddingVertical:10 },
    filterPillLabel: { fontSize:10, fontWeight:"700", color:C.textMuted, textTransform:"uppercase", letterSpacing:0.6 },
    filterPillValue: { fontSize:14, fontWeight:"700", marginTop:1 },
    filterMenu: { borderRadius:12, borderWidth:1, backgroundColor:C.surfaceWarm, overflow:"hidden" },
    filterMenuItem: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.border },
    filterMenuText: { fontSize:13, color:C.textSec, fontWeight:"600" },
    dateRow: { flexDirection:"row", gap:10 },
    dateWrap: { flex:1, gap:4 },
    dateLabel: { fontSize:11, fontWeight:"700", color:C.textMuted, textTransform:"uppercase" },
    dateInput: { backgroundColor:C.bg, borderRadius:12, borderWidth:1, borderColor:C.border, paddingHorizontal:12, paddingVertical:10, color:C.text, fontSize:14 },

    // Card base
    card: { backgroundColor:C.surface, borderRadius:22, borderWidth:1, borderColor:C.border, padding:16, gap:14, shadowColor:"#A09070", shadowOffset:{width:0,height:3}, shadowOpacity:0.07, shadowRadius:10, elevation:2 },
    cardHeader: { flexDirection:"row", alignItems:"center", gap:10 },
    cardIconBg: { width:32, height:32, borderRadius:11, alignItems:"center", justifyContent:"center" },
    cardTitle: { fontSize:17, fontWeight:"800", color:C.text, flex:1 },
    divider: { height:1, backgroundColor:C.border },
    subHeading: { fontSize:11, fontWeight:"700", color:C.textMuted, textTransform:"uppercase", letterSpacing:0.8 },

    // Lead overview
    donutRow: { flexDirection:"row", alignItems:"center", gap:18, paddingVertical:4 },
    donutLegend: { flex:1, gap:10 },
    legendRow: {
        flexDirection:"row",
        alignItems:"center",
        gap:8,
        borderRadius:14,
        borderWidth:1,
        paddingHorizontal:12,
        paddingVertical:10,
    },
    legendDot: { width:9, height:9, borderRadius:5 },
    legendLabel: { flex:1, fontSize:13, color:C.textSec, fontWeight:"600" },
    legendVal: { fontSize:14, fontWeight:"800" },

    // Progress rows
    pRow: { gap:6 },
    pLabelRow: { flexDirection:"row", justifyContent:"space-between" },
    pLabel: { fontSize:13, color:C.textSec, fontWeight:"500" },
    pValText: { fontSize:13, fontWeight:"700" },
    progressTrack: { height:7, borderRadius:999, backgroundColor:C.bg, overflow:"hidden" },
    progressFill: { height:"100%", borderRadius:999 },

    // 2Ã—2 Tiles
    tileGrid: { flexDirection:"row", flexWrap:"wrap", gap:10 },
    tile: { minWidth:"47%", flex:1, borderRadius:18, borderWidth:1, padding:14, gap:6 },
    tileIcon: { width:32, height:32, borderRadius:12, alignItems:"center", justifyContent:"center", marginBottom:2 },
    tileValue: { fontSize:28, fontWeight:"800" },
    tileLabel: { fontSize:11, fontWeight:"600", color:C.textSec, textTransform:"uppercase", letterSpacing:0.5 },
    completionWrap: { borderRadius:14, padding:12, gap:8 },
    completionLabel: { fontSize:13, fontWeight:"600", color:C.textSec },

    // Conversion funnel
    rateBadge: { paddingHorizontal:10, paddingVertical:5, borderRadius:999 },
    rateBadgeText: { fontSize:12, fontWeight:"800" },
    funnelOuter: { alignItems:"center" },
    funnelBar: { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:12, paddingHorizontal:16, borderRadius:16, borderWidth:1 },
    funnelBarLabel: { fontSize:13, fontWeight:"700", flex:1 },
    funnelBarVal: { fontSize:18, fontWeight:"800" },

    // Call stats
    callStatRow: { flexDirection:"row", gap:8 },
    callStat: { flex:1, borderRadius:16, borderWidth:1, padding:12, alignItems:"center", gap:4 },
    callStatIcon: { width:30, height:30, borderRadius:15, alignItems:"center", justifyContent:"center", marginBottom:2 },
    callStatVal: { fontSize:22, fontWeight:"800" },
    callStatLabel: { fontSize:10, fontWeight:"600", color:C.textMuted, textTransform:"uppercase" },
    avgDurBadge: { flexDirection:"row", alignItems:"center", gap:6, padding:10, borderRadius:12 },
    avgDurText: { fontSize:13, fontWeight:"700" },

    // Lead Sources
    sourceRow: { flexDirection:"row", alignItems:"center", gap:10 },
    sourceRank: { width:26, height:26, borderRadius:13, alignItems:"center", justifyContent:"center" },
    sourceRankText: { fontSize:11, fontWeight:"800" },
    sourceLabelRow: { flexDirection:"row", justifyContent:"space-between" },
    sourceLabel: { fontSize:13, color:C.textSec, fontWeight:"500" },
    sourceVal: { fontSize:13, fontWeight:"800" },

    // Team table
    tableHead: { flexDirection:"row", paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.border },
    thCell: { flex:1, fontSize:10, fontWeight:"700", color:C.textMuted, textTransform:"uppercase", textAlign:"center", letterSpacing:0.5 },
    thNameCell: { flex:2, textAlign:"left" },
    tableRow: { flexDirection:"row", paddingVertical:10, alignItems:"center", borderRadius:10 },
    tdCell: { flex:1, fontSize:13, color:C.textSec, fontWeight:"600", textAlign:"center" },
    tdName: { fontSize:13, fontWeight:"700", color:C.text, flex:1 },
    teamAvatar: { width:28, height:28, borderRadius:14, alignItems:"center", justifyContent:"center" },
    teamAvatarText: { fontSize:12, fontWeight:"800" },
    wonBadge: { paddingHorizontal:10, paddingVertical:4, borderRadius:999 },
    wonText: { fontSize:12, fontWeight:"800" },

    // Revenue
    revHero: { borderRadius:18, padding:16, borderWidth:1, borderColor:`${C.emerald}25`, flexDirection:"row", alignItems:"center" },
    revHeroInner: { flex:1, gap:3 },
    revLabel: { fontSize:11, fontWeight:"700", color:C.teal, textTransform:"uppercase", letterSpacing:0.8 },
    revValue: { fontSize:32, fontWeight:"800", color:C.emerald },
    revSubRow: { flexDirection:"row", alignItems:"center", gap:4 },
    revSubText: { fontSize:13, fontWeight:"600" },
    revTodayText: { fontSize:12, fontWeight:"700", color:C.textSec, marginTop:4 },
    revStatRow: { flexDirection:"row", gap:10 },
    revStat: { flex:1, borderRadius:16, borderWidth:1, padding:14, alignItems:"center", gap:6 },
    revStatVal: { fontSize:18, fontWeight:"800" },
    revStatLabel: { fontSize:11, fontWeight:"600", color:C.textSec, textAlign:"center" },
    helperNote: { fontSize:11, color:C.textMuted, lineHeight:16 },

    // Loading / empty
    loadingWrap: { paddingVertical:80, alignItems:"center", gap:12 },
    loadingText: { fontSize:14, color:C.textMuted, fontWeight:"600" },
    emptyNote: { fontSize:13, color:C.textMuted, textAlign:"center", paddingVertical:10 },
});
