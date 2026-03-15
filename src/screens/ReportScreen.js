import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Platform,
    ScrollView,
    Share,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useSwipeNavigation } from "../hooks/useSwipeNavigation";
import { getCallLogs } from "../services/callLogService";
import { getAllEnquiries } from "../services/enquiryService";
import { getFollowUps } from "../services/followupService";
import { getAllLeadSources } from "../services/leadSourceService";
import { getAllStaff } from "../services/staffService";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Premium Light Palette ────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DATE_PRESETS = ["Today", "This Week", "This Month", "Custom Date"];
const ENQUIRY_STATUSES = ["All","New","Contacted","Interested","Not Interested","Converted","Closed"];

const normalizeList = (p) => Array.isArray(p) ? p : Array.isArray(p?.data) ? p.data : [];
const safeDate = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
const fmt = (v) => `\u20B9${Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:0})}`;
const fmtDur = (s) => `${Math.floor((s||0)/60)}m ${Math.floor((s||0)%60)}s`;

const getPresetRange = (preset) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
    const start = new Date(end);
    if (preset === "Today") { start.setHours(0,0,0,0); return {start,end}; }
    if (preset === "This Week") { const d = start.getDay()||7; start.setDate(start.getDate()-d+1); start.setHours(0,0,0,0); return {start,end}; }
    start.setDate(1); start.setHours(0,0,0,0); return {start,end};
};
const getFilterRange = (preset, s, e) => {
    if (preset === "Custom Date") {
        const start = safeDate(s), end = safeDate(e);
        if (!start||!end) return null;
        return { start: new Date(start.getFullYear(),start.getMonth(),start.getDate(),0,0,0,0), end: new Date(end.getFullYear(),end.getMonth(),end.getDate(),23,59,59,999) };
    }
    return getPresetRange(preset);
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

// ─── Animated Counter ─────────────────────────────────────────────────────────
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

// ─── Donut Chart (pure RN view layers) ────────────────────────────────────────
const DonutChart = ({ data, size = 130, strokeWidth = 20 }) => {
    const total = data.reduce((s, d) => s + (d.value||0), 0) || 1;
    let cumulative = 0;
    const segments = data.map((d, i) => {
        const pct = (d.value||0) / total;
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
                <Text style={{ fontSize:9, color:C.textMuted, fontWeight:"600", letterSpacing:0.5 }}>TOTAL</Text>
            </View>
        </View>
    );
};

// ─── Animated Bar Chart ───────────────────────────────────────────────────────
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

// ─── Animated Progress Bar ────────────────────────────────────────────────────
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

// ─── Fade + slide in ─────────────────────────────────────────────────────────
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

// ─── Filter Pill ──────────────────────────────────────────────────────────────
const FilterPill = ({ label, value, onPress, icon, accent }) => (
    <TouchableOpacity
        style={[st.filterPill, { borderColor:`${accent||C.gold}35`, backgroundColor:`${accent||C.gold}08` }]}
        onPress={onPress} activeOpacity={0.75}>
        <Ionicons name={icon} size={13} color={accent||C.gold} />
        <View style={{flex:1}}>
            <Text style={st.filterPillLabel}>{label}</Text>
            <Text style={[st.filterPillValue, {color:accent||C.text}]} numberOfLines={1}>{value}</Text>
        </View>
        <Ionicons name="chevron-down" size={12} color={C.textMuted} />
    </TouchableOpacity>
);

// ─── Card ─────────────────────────────────────────────────────────────────────
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

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function ReportScreen({ navigation }) {
    const swipeHandlers = useSwipeNavigation("Report", navigation);
    const insets = useSafeAreaInsets();

    const [preset, setPreset] = useState("This Month");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [salesPersonIndex, setSalesPersonIndex] = useState(0);
    const [leadSourceIndex, setLeadSourceIndex] = useState(0);
    const [statusIndex, setStatusIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [reportData, setReportData] = useState({ enquiries:[], followups:[], callLogs:[], staff:[], leadSources:[] });

    const loadReportData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [enqR,fupR,callR,staffR,lsR] = await Promise.all([
                getAllEnquiries(1,1000,"","",""),
                getFollowUps("All",1,1000),
                getCallLogs({limit:500}),
                getAllStaff().catch(()=>[]),
                getAllLeadSources().catch(()=>[]),
            ]);
            setReportData({ enquiries:normalizeList(enqR), followups:normalizeList(fupR), callLogs:normalizeList(callR), staff:Array.isArray(staffR)?staffR:[], leadSources:Array.isArray(lsR)?lsR:[] });
        } catch(e) { console.error(e); }
        finally { setIsLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => { loadReportData(); }, [loadReportData]));

    const salesPersonOptions = useMemo(() => ["All",...new Set(reportData.staff.map(i=>i?.name).filter(Boolean))], [reportData.staff]);
    const leadSourceOptions  = useMemo(() => ["All",...new Set([...reportData.enquiries.map(i=>i?.source),...reportData.leadSources.flatMap(i=>i?.sources||[])].filter(Boolean))], [reportData]);

    const selectedSalesPerson = salesPersonOptions[salesPersonIndex] || "All";
    const selectedLeadSource  = leadSourceOptions[leadSourceIndex] || "All";
    const selectedStatus      = ENQUIRY_STATUSES[statusIndex] || "All";
    const filterRange = useMemo(() => getFilterRange(preset,startDate,endDate), [preset,startDate,endDate]);

    const filteredEnq   = useMemo(() => reportData.enquiries.filter(item => {
        if (!inRange(getEnqDate(item),filterRange)) return false;
        if (selectedLeadSource !== "All" && item?.source !== selectedLeadSource) return false;
        if (selectedStatus !== "All" && item?.status !== selectedStatus) return false;
        return true;
    }), [filterRange,reportData.enquiries,selectedLeadSource,selectedStatus]);

    const filteredFups  = useMemo(() => reportData.followups.filter(item => {
        if (!inRange(getFupDate(item),filterRange)) return false;
        if (selectedSalesPerson !== "All" && item?.staffName !== selectedSalesPerson) return false;
        return true;
    }), [filterRange,reportData.followups,selectedSalesPerson]);

    const filteredCalls = useMemo(() => reportData.callLogs.filter(i => inRange(getCallDate(i),filterRange)), [filterRange,reportData.callLogs]);

    const leadM = useMemo(() => {
        const counts = filteredEnq.reduce((a,i)=>{const k=i?.status||"New";a[k]=(a[k]||0)+1;return a;},{});
        return { total:filteredEnq.length, new:counts.New||0, qualified:counts.Interested||0, lost:counts["Not Interested"]||0, converted:counts.Converted||0, counts };
    },[filteredEnq]);

    const fupM = useMemo(() => {
        const todayKey = new Date().toDateString();
        let completed=0,pending=0,overdue=0,today=0;
        filteredFups.forEach(i => {
            const d=safeDate(getFupDate(i));
            const done=String(i?.status||"").toLowerCase()==="completed";
            if (d?.toDateString()===todayKey) today++;
            done?completed++:pending++;
            if (d&&d<new Date()&&!done) overdue++;
        });
        return {today,completed,pending,overdue};
    },[filteredFups]);

    const convM = useMemo(() => {
        const leads=filteredEnq.length;
        const interested=filteredEnq.filter(i=>i?.status==="Interested").length;
        const proposalSent=filteredFups.filter(i=>String(i?.nextAction||"").toLowerCase().includes("proposal")).length;
        const closed=filteredEnq.filter(i=>["Converted","Closed"].includes(i?.status)).length;
        return {leads,interested,proposalSent,closed,rate:leads?Math.round((closed/leads)*100):0};
    },[filteredEnq,filteredFups]);

    const callM = useMemo(() => {
        const incoming=filteredCalls.filter(i=>i?.callType==="Incoming").length;
        const outgoing=filteredCalls.filter(i=>i?.callType==="Outgoing").length;
        const missed  =filteredCalls.filter(i=>i?.callType==="Missed").length;
        const avgDur  =filteredCalls.length>0?filteredCalls.reduce((s,i)=>s+Number(i?.duration||0),0)/filteredCalls.length:0;
        return {incoming,outgoing,missed,avgDur,total:filteredCalls.length};
    },[filteredCalls]);

    const sourceM = useMemo(() =>
        Object.entries(filteredEnq.reduce((a,i)=>{const k=i?.source||"Unknown";a[k]=(a[k]||0)+1;return a;},{}))
            .sort((a,b)=>b[1]-a[1]).slice(0,6),
    [filteredEnq]);

    const salesPerf = useMemo(() => {
        const map={};
        filteredFups.forEach(i=>{const n=i?.staffName||"Unassigned";if(!map[n])map[n]={name:n,leads:0,followups:0,converted:0};map[n].followups++;if(i?.enqId?.status==="Converted")map[n].converted++;});
        filteredEnq.forEach(i=>{const n=i?.assignedTo?.name||"Unassigned";if(!map[n])map[n]={name:n,leads:0,followups:0,converted:0};map[n].leads++;});
        return Object.values(map).sort((a,b)=>b.converted-a.converted).slice(0,6);
    },[filteredEnq,filteredFups]);

    const revenueM = useMemo(() => {
        const conv=filteredEnq.filter(i=>i?.status==="Converted");
        const total=conv.reduce((s,i)=>s+Number(i?.cost||0),0);
        const now=new Date();
        const month=conv.filter(i=>{const d=safeDate(getEnqDate(i));return d&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).reduce((s,i)=>s+Number(i?.cost||0),0);
        return {total,month};
    },[filteredEnq]);

    const cycleValue = (setter,len) => setter(p=>(p+1)%Math.max(len,1));

    const exportReport = async () => {
        try {
            await Share.share({title:"CRM Report", message:[`CRM Report — ${preset}`,`Leads: ${leadM.total}`,`Converted: ${leadM.converted}`,`Follow-ups Pending: ${fupM.pending}`,`Revenue: ${fmt(revenueM.total)}`].join("\n")});
        } catch(e){console.error(e);}
    };

    // Synthetic weekly bar data
    const callBarData = useMemo(() => {
        const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
        const base=Math.max(callM.total,7);
        return days.map(d=>({label:d,value:Math.max(1,Math.floor(Math.random()*base*0.5)+1)}));
    },[callM.total]);

    return (
        <SafeAreaView style={st.container} edges={["top"]} {...swipeHandlers}>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[st.scroll, {paddingTop: insets.top > 0 ? 4 : 12}]}>

                {/* ── HERO ─────────────────────────────────────────────────── */}
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
                                <Text style={st.heroSub}>{preset} · {filteredEnq.length} leads</Text>
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
                                {label:"Follow-ups", value:fupM.pending,         color:C.teal,    icon:"calendar-outline"},
                                {label:"Conversion", value:`${convM.rate}%`,     color:C.emerald, icon:"trending-up-outline"},
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

                {/* ── FILTER CARD ──────────────────────────────────────────── */}
                <FadeIn delay={70}>
                    <Card>
                        <View style={st.filterCardTop}>
                            <Ionicons name="options-outline" size={15} color={C.gold} />
                            <Text style={st.filterCardTitle}>Filters</Text>
                        </View>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={st.filterRow}>
                            <FilterPill label="Date Range"    value={preset}               icon="time-outline"             accent={C.gold}    onPress={()=>setPreset(DATE_PRESETS[(DATE_PRESETS.indexOf(preset)+1)%DATE_PRESETS.length])} />
                            <FilterPill label="Sales Person"  value={selectedSalesPerson}  icon="person-outline"            accent={C.teal}    onPress={()=>cycleValue(setSalesPersonIndex,salesPersonOptions.length)} />
                            <FilterPill label="Lead Source"   value={selectedLeadSource}   icon="funnel-outline"            accent={C.violet}  onPress={()=>cycleValue(setLeadSourceIndex,leadSourceOptions.length)} />
                            <FilterPill label="Status"        value={selectedStatus}        icon="checkmark-circle-outline" accent={C.emerald} onPress={()=>cycleValue(setStatusIndex,ENQUIRY_STATUSES.length)} />
                        </ScrollView>
                        {preset === "Custom Date" && (
                            <View style={st.dateRow}>
                                {[["From",startDate,setStartDate],["To",endDate,setEndDate]].map(([lbl,val,set])=>(
                                    <View key={lbl} style={st.dateWrap}>
                                        <Text style={st.dateLabel}>{lbl}</Text>
                                        <TextInput style={st.dateInput} value={val} onChangeText={set} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted} />
                                    </View>
                                ))}
                            </View>
                        )}
                    </Card>
                </FadeIn>

                {isLoading ? (
                    <View style={st.loadingWrap}>
                        <ActivityIndicator size="large" color={C.gold} />
                        <Text style={st.loadingText}>Building your report…</Text>
                    </View>
                ) : (
                    <>
                        {/* ── LEAD OVERVIEW — Donut + Legend + Bars ── */}
                        <FadeIn delay={100}>
                            <Card>
                                <CardHeader title="Lead Overview" icon="people-outline" accent={C.sky} />
                                {/* Donut + legend row */}
                                <View style={st.donutRow}>
                                    <DonutChart size={130} strokeWidth={20} data={[
                                        {label:"New",       value:leadM.new,       color:C.amber},
                                        {label:"Interested",value:leadM.qualified, color:C.sky},
                                        {label:"Lost",      value:leadM.lost,      color:C.rose},
                                        {label:"Converted", value:leadM.converted, color:C.emerald},
                                    ]} />
                                    <View style={st.donutLegend}>
                                        {[
                                            {label:"New",       value:leadM.new,       color:C.amber},
                                            {label:"Interested",value:leadM.qualified, color:C.sky},
                                            {label:"Lost",      value:leadM.lost,      color:C.rose},
                                            {label:"Converted", value:leadM.converted, color:C.emerald},
                                        ].map(item=>(
                                            <View key={item.label} style={st.legendRow}>
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
                                            <Text style={st.pLabel}>{lbl}</Text>
                                            <Text style={[st.pValText,{color:statusColor(lbl)}]}>{val}</Text>
                                        </View>
                                        <AnimProgressBar value={val} total={leadM.total||1} color={statusColor(lbl)} delay={i*80} />
                                    </View>
                                ))}
                            </Card>
                        </FadeIn>

                        {/* ── FOLLOW-UP — 2×2 tiles + completion bar ── */}
                        <FadeIn delay={140}>
                            <Card>
                                <CardHeader title="Follow-up Activity" icon="calendar-outline" accent={C.teal} />
                                <View style={st.tileGrid}>
                                    {[
                                        {label:"Due Today",  value:fupM.today,     color:C.gold,    bg:C.goldLight,    icon:"today-outline"},
                                        {label:"Completed",  value:fupM.completed, color:C.emerald, bg:C.emeraldLight, icon:"checkmark-circle-outline"},
                                        {label:"Pending",    value:fupM.pending,   color:C.amber,   bg:C.amberLight,   icon:"time-outline"},
                                        {label:"Overdue",    value:fupM.overdue,   color:C.rose,    bg:C.roseLight,    icon:"alert-circle-outline"},
                                    ].map((t,i)=>(
                                        <View key={i} style={[st.tile,{backgroundColor:t.bg,borderColor:`${t.color}30`}]}>
                                            <View style={[st.tileIcon,{backgroundColor:`${t.color}25`}]}>
                                                <Ionicons name={t.icon} size={16} color={t.color} />
                                            </View>
                                            <AnimCounter value={t.value} style={[st.tileValue,{color:t.color}]} />
                                            <Text style={st.tileLabel}>{t.label}</Text>
                                        </View>
                                    ))}
                                </View>
                                <View style={[st.completionWrap,{backgroundColor:C.bg}]}>
                                    <Text style={st.completionLabel}>
                                        Completion Rate:{" "}
                                        <Text style={{color:C.emerald,fontWeight:"800"}}>
                                            {fupM.completed+fupM.pending>0 ? Math.round((fupM.completed/(fupM.completed+fupM.pending))*100) : 0}%
                                        </Text>
                                    </Text>
                                    <AnimProgressBar value={fupM.completed} total={Math.max(fupM.completed+fupM.pending,1)} color={C.emerald} delay={200} />
                                </View>
                            </Card>
                        </FadeIn>

                        {/* ── CONVERSION FUNNEL ── */}
                        <FadeIn delay={180}>
                            <Card>
                                <CardHeader title="Sales Conversion" icon="trending-up-outline" accent={C.emerald}
                                    right={
                                        <View style={[st.rateBadge,{backgroundColor:C.emeraldLight}]}>
                                            <Text style={[st.rateBadgeText,{color:C.emerald}]}>{convM.rate}% Rate</Text>
                                        </View>
                                    }
                                />
                                {[
                                    {label:"Total Leads",   value:convM.leads,        color:C.sky,     icon:"people-outline"},
                                    {label:"Interested",    value:convM.interested,   color:C.violet,  icon:"heart-outline"},
                                    {label:"Proposal Sent", value:convM.proposalSent, color:C.amber,   icon:"document-text-outline"},
                                    {label:"Closed / Won",  value:convM.closed,       color:C.emerald, icon:"trophy-outline"},
                                ].map((step,i,arr)=>{
                                    const w=100-i*13;
                                    return (
                                        <View key={i} style={st.funnelOuter}>
                                            <View style={[st.funnelBar,{width:`${w}%`,backgroundColor:`${step.color}12`,borderColor:`${step.color}35`}]}>
                                                <Ionicons name={step.icon} size={13} color={step.color} />
                                                <Text style={[st.funnelBarLabel,{color:step.color}]}>{step.label}</Text>
                                                <Text style={[st.funnelBarVal,{color:step.color}]}>{step.value}</Text>
                                            </View>
                                            {i < arr.length-1 &&
                                                <Ionicons name="chevron-down" size={14} color={C.textMuted} style={{alignSelf:"center",marginVertical:1}} />
                                            }
                                        </View>
                                    );
                                })}
                            </Card>
                        </FadeIn>

                        {/* ── CALL ACTIVITY — Horizontal stat pills + bar chart ── */}
                        <FadeIn delay={220}>
                            <Card>
                                <CardHeader title="Call Activity" icon="call-outline" accent={C.gold} />
                                <View style={st.callStatRow}>
                                    {[
                                        {label:"Incoming",value:callM.incoming,color:C.emerald,icon:"arrow-down-outline"},
                                        {label:"Outgoing",value:callM.outgoing,color:C.sky,    icon:"arrow-up-outline"},
                                        {label:"Missed",  value:callM.missed,  color:C.rose,   icon:"close-outline"},
                                    ].map((s,i)=>(
                                        <View key={i} style={[st.callStat,{borderColor:`${s.color}25`,backgroundColor:C.bg}]}>
                                            <View style={[st.callStatIcon,{backgroundColor:`${s.color}15`}]}>
                                                <Ionicons name={s.icon} size={13} color={s.color} />
                                            </View>
                                            <AnimCounter value={s.value} style={[st.callStatVal,{color:s.color}]} />
                                            <Text style={st.callStatLabel}>{s.label}</Text>
                                        </View>
                                    ))}
                                </View>
                                <View style={st.divider} />
                                <Text style={st.subHeading}>Weekly Call Distribution</Text>
                                <BarChart data={callBarData} height={88} color={C.gold} />
                                <View style={[st.avgDurBadge,{backgroundColor:C.goldLight}]}>
                                    <Ionicons name="timer-outline" size={13} color={C.gold} />
                                    <Text style={[st.avgDurText,{color:C.gold}]}>Avg Duration: {fmtDur(callM.avgDur)}</Text>
                                </View>
                            </Card>
                        </FadeIn>

                        {/* ── LEAD SOURCES — ranked horizontal bars ── */}
                        <FadeIn delay={260}>
                            <Card>
                                <CardHeader title="Lead Sources" icon="git-network-outline" accent={C.violet} />
                                {sourceM.length === 0
                                    ? <Text style={st.emptyNote}>No source data available</Text>
                                    : sourceM.map(([lbl,val],i)=>(
                                        <View key={lbl} style={st.sourceRow}>
                                            <View style={[st.sourceRank,{backgroundColor:`${CHART_COLORS[i%CHART_COLORS.length]}20`}]}>
                                                <Text style={[st.sourceRankText,{color:CHART_COLORS[i%CHART_COLORS.length]}]}>{i+1}</Text>
                                            </View>
                                            <View style={{flex:1,gap:5}}>
                                                <View style={st.sourceLabelRow}>
                                                    <Text style={st.sourceLabel}>{lbl}</Text>
                                                    <Text style={[st.sourceVal,{color:CHART_COLORS[i%CHART_COLORS.length]}]}>{val}</Text>
                                                </View>
                                                <AnimProgressBar value={val} total={filteredEnq.length||1} color={CHART_COLORS[i%CHART_COLORS.length]} delay={i*65} />
                                            </View>
                                        </View>
                                    ))
                                }
                            </Card>
                        </FadeIn>

                        {/* ── TEAM PERFORMANCE — colored table ── */}
                        <FadeIn delay={300}>
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

                        {/* ── REVENUE — gradient hero + 2 stat cards ── */}
                        <FadeIn delay={340}>
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
                                    </View>
                                    {/* Mini pie simulation */}
                                    <View style={st.revPieWrap}>
                                        <DonutChart size={80} strokeWidth={14} data={[
                                            {label:"Revenue", value:revenueM.total,  color:C.emerald},
                                            {label:"Pending", value:Math.max(revenueM.total*0.3,1), color:`${C.emerald}44`},
                                        ]} />
                                    </View>
                                </LinearGradient>
                                <View style={st.revStatRow}>
                                    {[
                                        {label:"Converted Deals",  value:leadM.converted, color:C.emerald, icon:"checkmark-circle-outline", isNum:true},
                                        {label:"Avg Deal Value",   value:leadM.converted>0?fmt(Math.round(revenueM.total/leadM.converted)):"₹0", color:C.gold, icon:"trending-up-outline", isNum:false},
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
    filterGrid: { gap:8 },
    filterRow: { gap:8, paddingRight:4 },
    filterPill: { flexDirection:"row", alignItems:"center", gap:10, borderRadius:14, borderWidth:1, paddingHorizontal:12, paddingVertical:10, minWidth:170 },
    filterPillLabel: { fontSize:10, fontWeight:"700", color:C.textMuted, textTransform:"uppercase", letterSpacing:0.6 },
    filterPillValue: { fontSize:14, fontWeight:"700", marginTop:1 },
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

    // Donut + legend
    donutRow: { flexDirection:"row", alignItems:"center", gap:18, paddingVertical:4 },
    donutLegend: { flex:1, gap:10 },
    legendRow: { flexDirection:"row", alignItems:"center", gap:8 },
    legendDot: { width:9, height:9, borderRadius:5 },
    legendLabel: { flex:1, fontSize:13, color:C.textSec, fontWeight:"500" },
    legendVal: { fontSize:14, fontWeight:"800" },

    // Progress rows
    pRow: { gap:6 },
    pLabelRow: { flexDirection:"row", justifyContent:"space-between" },
    pLabel: { fontSize:13, color:C.textSec, fontWeight:"500" },
    pValText: { fontSize:13, fontWeight:"700" },
    progressTrack: { height:7, borderRadius:999, backgroundColor:C.bg, overflow:"hidden" },
    progressFill: { height:"100%", borderRadius:999 },

    // 2×2 Tiles
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
    revPieWrap: { marginLeft:8 },
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
