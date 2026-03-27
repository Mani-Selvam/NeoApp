import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  DeviceEventEmitter,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import RNImmediatePhoneCall from "react-native-immediate-phone-call";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PostCallModal } from "../components/PostCallModal";
import AppSideMenu from "../components/AppSideMenu";
import { EnquirySkeleton } from "../components/skeleton/screens";
import { useAuth } from "../contexts/AuthContext";
import { API_URL as GLOBAL_API_URL } from "../services/apiConfig";
import * as callLogService from "../services/callLogService";
import * as enquiryService from "../services/enquiryService";
import { confirmPermissionRequest, getUserFacingError } from "../utils/appFeedback";
import { getImageUrl } from "../utils/imageHelper";
import {
  buildFeatureUpgradeMessage,
  hasPlanFeature,
} from "../utils/planFeatures";

const API_URL = `${GLOBAL_API_URL}/enquiries`;
const { width: SW, height: SH } = Dimensions.get("window");

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          "#F1F5F9",
  card:        "#FFFFFF",
  cardAlt:     "#F8FAFF",
  primary:     "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF6FF",
  primaryMid:  "#BFDBFE",
  accent:      "#7C3AED",
  success:     "#059669",
  whatsapp:    "#25D366",
  danger:      "#DC2626",
  warning:     "#D97706",
  info:        "#0891B2",
  text:        "#0F172A",
  textSub:     "#334155",
  textMuted:   "#64748B",
  textLight:   "#94A3B8",
  border:      "#E2E8F0",
  divider:     "#F1F5F9",
  shadow:      "#1E293B",
};

const GRAD = {
  primary: [C.primary, C.accent],
  success: [C.success, "#047857"],
  danger:  [C.danger, "#991B1B"],
  warm:    [C.warning, "#B45309"],
  teal:    [C.info, "#0E7490"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toLocalIso = (d) => {
  const date = d ? new Date(d) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};
const safeDate = (raw, opts) => {
  if (!raw) return "-";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, opts);
};
const safeDateTime = (raw) => {
  if (!raw) return "-";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString();
};
const fmtDur = (s) => {
  if (!s) return "0s";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
};
const getInitials = (name = "") => name.substring(0,2).toUpperCase() || "NA";
const avatarColors = (name="") => {
  const h = name ? (name.charCodeAt(0)*23 + (name.charCodeAt(1)||0)*7) % 360 : 220;
  return [`hsl(${h},65%,52%)`, `hsl(${(h+30)%360},70%,42%)`];
};
const priorityCfg = (type) => {
  const t = (type||"").toLowerCase();
  if (t.includes("hot")||t.includes("high")) return { color: C.danger,   bg:"#FEF2F2", label:"Hot" };
  if (t.includes("warm")||t.includes("med"))  return { color: C.warning,  bg:"#FFFBEB", label:"Warm" };
  return { color: C.primary, bg: C.primarySoft, label: type||"Normal" };
};
const displayStatusLabel = (status) => {
  if (status === "Converted") return "Sales";
  if (status === "Closed") return "Drop";
  return status || "New";
};

const getAssignedUserLabel = (assignedTo) => {
  if (!assignedTo) return "-";
  if (typeof assignedTo === "string") return assignedTo;
  return assignedTo?.name || assignedTo?.email || assignedTo?.mobile || "-";
};

// ─── Compact enquiry card ─────────────────────────────────────────────────────
const EnquiryCard = React.memo(function EnquiryCard({
  item, index,
  onPress, onSwipe,
  onCall, onWhatsApp, onLongPress,
  deleteMode = false,
  deleting = false,
  onDeleteConfirm,
  onDeleteCancel,
}) {
  const scale  = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const pCfg   = priorityCfg(item.enqType);
  const colors = avatarColors(item.name);
  const swipeOpacity = translateX.interpolate({
    inputRange: [0, SW * 0.35, SW],
    outputRange: [1, 0.92, 0.78],
    extrapolate: "clamp",
  });

  // horizontal swipe RIGHT to open detail page
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dy) < 15 && g.dx > 0,
      onPanResponderGrant: () => {
        translateX.setValue(0);
      },
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 60) {
          Animated.timing(translateX, {
            toValue: SW,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            translateX.setValue(0);
            onSwipe?.(item);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  return (
    <MotiView
      from={{ opacity: 0, translateX: 24 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type:"timing", duration:280, delay: index < 8 ? index*40 : 0 }}
      style={S.cardWrap}
    >
      <Animated.View style={{ transform:[{ translateX }], opacity: swipeOpacity }} {...pan.panHandlers}>
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={() => Animated.spring(scale,{toValue:0.98,useNativeDriver:true}).start()}
          onPressOut={() => Animated.spring(scale,{toValue:1,useNativeDriver:true}).start()}
          onPress={() => {
            if (deleteMode) {
              onDeleteCancel?.();
              return;
            }
            onPress(item);
          }}
          onLongPress={() => onLongPress?.(item)}
          delayLongPress={350}
        >
          <Animated.View style={[S.card, {transform:[{scale}]}]}>
            {/* Left priority stripe */}
            <View style={[S.stripe, {backgroundColor: pCfg.color}]} />

            <View style={S.cardBody}>
              {/* Top row */}
              <View style={S.cardRow}>
                {/* Avatar */}
                <View style={S.avatarBox}>
                  {item.image ? (
                    <Image source={{uri:getImageUrl(item.image)}} style={S.avatarImg} />
                  ) : (
                    <LinearGradient colors={colors} style={S.avatarGrad}>
                      <Text style={S.avatarText}>{getInitials(item.name)}</Text>
                    </LinearGradient>
                  )}
                  <View style={[S.avatarDot,{backgroundColor:pCfg.color}]} />
                </View>

                {/* Info */}
                <View style={S.cardMid}>
                  <View style={S.cardRowBetween}>
                    <Text style={S.cardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={S.cardDate}>
                      {safeDate(item.enquiryDateTime||item.createdAt,{month:"short",day:"numeric"})}
                    </Text>
                  </View>
                  <View style={S.cardRowBetween}>
                    <View style={S.productPill}>
                      <Ionicons name="briefcase-outline" size={11} color={C.primary} />
                      <Text style={S.productPillText} numberOfLines={1}>{item.product||"General"}</Text>
                    </View>
                    <View style={[S.priorityPill,{backgroundColor:pCfg.bg}]}>
                      <View style={[S.priorityDot,{backgroundColor:pCfg.color}]} />
                      <Text style={[S.priorityPillText,{color:pCfg.color}]}>{pCfg.label}</Text>
                    </View>
                  </View>
                  {/* Mobile + status */}
                  <View style={S.cardRowBetween}>
                    <Text style={S.cardMobile}>{item.mobile}</Text>
                    <Text style={S.cardStatus}>{displayStatusLabel(item.status)}</Text>
                  </View>
                </View>
              </View>

              {/* Action bar */}
              <View style={S.cardActions}>
                {deleteMode ? (
                  <View style={S.deleteBar}>
                    <View style={S.deletePill}>
                      <Ionicons name="trash-outline" size={14} color={C.danger} />
                      <Text style={S.deletePillText}>Delete this enquiry?</Text>
                    </View>
                    <View style={{flex:1}} />
                    <TouchableOpacity style={S.deleteGhostBtn} onPress={() => onDeleteCancel?.()} disabled={deleting}>
                      <Text style={S.deleteGhostText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.deleteDangerBtn, deleting && S.deleteDangerBtnDisabled]}
                      onPress={() => onDeleteConfirm?.(item)}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={S.deleteDangerText}>Delete</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={[S.actionChip,{backgroundColor:C.success+"18"}]} onPress={()=>onCall(item)}>
                      <Ionicons name="call" size={15} color={C.success} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[S.actionChip,{backgroundColor:C.whatsapp+"18"}]} onPress={()=>onWhatsApp(item)}>
                      <Ionicons name="logo-whatsapp" size={15} color={C.whatsapp} />
                    </TouchableOpacity>
                    <View style={{flex:1}} />
                    {item.enqNo && (
                      <View style={S.enqNoBadge}>
                        <Text style={S.enqNoText}>#{item.enqNo}</Text>
                      </View>
                    )}
                    <View style={S.swipeHint}>
                      <Ionicons name="chevron-forward" size={13} color={C.textLight} />
                      <Text style={S.swipeHintText}>Details</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </MotiView>
  );
});

// ─── Detail page (slides in from right) ──────────────────────────────────────
const DETAIL_TABS = ["Details","Calls"];

const EnquiryDetailPage = ({
  enquiry,
  callLogs,
  logsLoading,
  onClose,
  onEdit,
  billingInfo,
  showUpgradePrompt,
}) => {
  const insets = useSafeAreaInsets();
  const slideX = useRef(new Animated.Value(SW)).current;
  const [tab, setTab] = useState(0);
  const tabSlideX = useRef(new Animated.Value(0)).current;
  const lastTabRef = useRef(0);
  const pCfg   = priorityCfg(enquiry?.enqType);
  const colors = avatarColors(enquiry?.name);
  const changeTab = (nextTab) => {
    if (nextTab === 1 && !hasPlanFeature(billingInfo?.plan, "call_logs")) {
      showUpgradePrompt(buildFeatureUpgradeMessage("call_logs", "Calls"));
      return;
    }
    setTab(nextTab);
  };

  useEffect(() => {
    Animated.timing(slideX, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [slideX]);

  useEffect(() => {
    const direction = tab >= lastTabRef.current ? 1 : -1;
    tabSlideX.setValue(direction * 26);
    Animated.timing(tabSlideX, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    lastTabRef.current = tab;
  }, [tab, tabSlideX]);

  useEffect(() => {
    const handleHardwareBack = () => {
      if (tab > 0) {
        setTab((currentTab) => Math.max(0, currentTab - 1));
        return true;
      }
      handleClose();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleHardwareBack,
    );

    return () => subscription.remove();
  }, [tab]);

  const handleClose = () => {
    Animated.timing(slideX, { toValue: SW, duration: 260, useNativeDriver: true }).start(onClose);
  };

  if (!enquiry) return null;

  return (
    <Animated.View style={[SD.root, { transform:[{ translateX: slideX }] }]}>
      <StatusBar barStyle="dark-content" />

      {/* ── Top card: white bg, decorative circles, circle avatar ── */}
      <View style={[SD.topCard, { paddingTop: insets.top + 54 }]}>

        {/* Decorative background circles */}
        <View style={SD.deco1} />
        <View style={SD.deco2} />
        <View style={SD.deco3} />

        {/* Back button */}
        <TouchableOpacity onPress={handleClose} style={[SD.backBtn, { top: insets.top + 8 }]}>
          <Ionicons name="arrow-back" size={19} color={C.textSub} />
        </TouchableOpacity>

        {/* Edit button top-right */}
        <TouchableOpacity onPress={() => onEdit(enquiry)} style={[SD.editBtn, { top: insets.top + 8 }]}>
          <Ionicons name="create-outline" size={19} color={C.textSub} />
        </TouchableOpacity>

        {/* Avatar — large circle */}
        <View style={SD.avatarRing}>
          <View style={SD.avatarOuter}>
            {enquiry.image ? (
              <Image source={{ uri: getImageUrl(enquiry.image) }} style={SD.avatarImg} />
            ) : (
              <LinearGradient colors={colors} style={SD.avatarGrad}>
                <Text style={SD.avatarText}>{getInitials(enquiry.name)}</Text>
              </LinearGradient>
            )}
          </View>
          {/* Priority dot */}
          <View style={[SD.priDot, { backgroundColor: pCfg.color }]} />
        </View>

        {/* Name & mobile */}
        <Text style={SD.heroName}>{enquiry.name}</Text>
        <Text style={SD.heroMobile}>{enquiry.mobile}</Text>

        {/* Info chips */}
        <View style={SD.chipsRow}>
          <View style={[SD.chip, { backgroundColor: pCfg.bg }]}>
            <View style={[SD.chipDot, { backgroundColor: pCfg.color }]} />
            <Text style={[SD.chipText, { color: pCfg.color }]}>{enquiry.enqType || "Normal"}</Text>
          </View>
          {enquiry.status ? (
            <View style={SD.chip}>
              <Ionicons name="radio-button-on" size={9} color={C.textMuted} />
              <Text style={SD.chipText}>{displayStatusLabel(enquiry.status)}</Text>
            </View>
          ) : null}
          {enquiry.source ? (
            <View style={SD.chip}>
              <Ionicons name="git-branch-outline" size={9} color={C.textMuted} />
              <Text style={SD.chipText}>{enquiry.source}</Text>
            </View>
          ) : null}
          {enquiry.product ? (
            <View style={SD.chip}>
              <Ionicons name="briefcase-outline" size={9} color={C.textMuted} />
              <Text style={SD.chipText} numberOfLines={1}>{enquiry.product}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={SD.tabBar}>
        {DETAIL_TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => changeTab(i)} style={[SD.tab, tab === i && SD.tabActive]}>
            <Text style={[SD.tabText, tab === i && SD.tabTextActive]}>{t}</Text>
            {tab === i && <View style={SD.tabLine} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content — swipeable ── */}
      {(() => {
        const tabPan = PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (_, g) =>
            Math.abs(g.dx) > 12 && Math.abs(g.dy) < 20,
          onPanResponderRelease: (_, g) => {
            if (g.dx < -40 && tab < DETAIL_TABS.length - 1) changeTab(tab + 1);
            if (g.dx > 40 && tab > 0) setTab(t => t - 1);
            if (g.dx > 60 && tab === 0) handleClose();
          },
        });
        return (
          <Animated.View
            style={{ flex: 1, transform: [{ translateX: tabSlideX }] }}
            {...tabPan.panHandlers}
          >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
            showsVerticalScrollIndicator={false}
          >
        {tab === 0 && (
          <View style={{ gap: 8 }}>
            {[
              { label: "Enquiry No",  value: enquiry.enqNo || "-",                                    icon: "document-text-outline" },
              { label: "Product",     value: enquiry.product || "-",                                   icon: "briefcase-outline" },
              { label: "Cost",        value: enquiry.cost ? `₹${enquiry.cost}` : "-",                 icon: "pricetag-outline" },
              { label: "Email",       value: enquiry.email || "-",                                     icon: "mail-outline" },
              { label: "Address",     value: enquiry.address || "-",                                   icon: "location-outline" },
              { label: "Assigned To", value: getAssignedUserLabel(enquiry.assignedTo),                 icon: "person-circle-outline" },
              { label: "Date & Time", value: safeDateTime(enquiry.enquiryDateTime || enquiry.createdAt), icon: "time-outline" },
              { label: "Lead Source", value: enquiry.source || "-",                                    icon: "git-branch-outline" },
            ].map(row => (
              <View key={row.label} style={SD.detailRow}>
                <View style={SD.detailIconBox}>
                  <Ionicons name={row.icon} size={14} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={SD.detailLabel}>{row.label}</Text>
                  <Text style={SD.detailValue}>{row.value}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === 1 && (
          logsLoading ? (
            <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
          ) : callLogs.length === 0 ? (
            <View style={SD.emptyWrap}>
              <View style={SD.emptyIconBox}><Ionicons name="call-outline" size={26} color={C.textLight} /></View>
              <Text style={SD.emptyText}>No calls recorded yet</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {callLogs.map((log, i) => {
                const isIn  = log.callType === "Incoming";
                const isOut = log.callType === "Outgoing";
                const col   = isIn ? C.success : isOut ? C.primary : C.danger;
                return (
                  <View key={log._id || i} style={SD.logItem}>
                    <View style={[SD.logIconBox, { backgroundColor: col + "18" }]}>
                      <Ionicons name={isIn ? "arrow-down-outline" : isOut ? "arrow-up-outline" : "close-outline"} size={14} color={col} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={SD.logType}>{log.callType}</Text>
                      <Text style={SD.logDate}>
                        {new Date(log.callTime).toLocaleDateString([], { month: "short", day: "numeric" })} at {new Date(log.callTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[SD.logDur, { color: col }]}>{fmtDur(log.duration)}</Text>
                      <Text style={SD.logDurLabel}>duration</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
          </Animated.View>
        );
      })()}

    </Animated.View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function EnquiryListScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, logout, billingInfo, showUpgradePrompt } = useAuth();

  const [enquiries,    setEnquiries]    = useState([]);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [isLoading,    setIsLoading]    = useState(true);
  const [isLoadingMore,setIsLoadingMore]= useState(false);
  const [page,         setPage]         = useState(1);
  const [hasMore,      setHasMore]      = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMonth,setCalendarMonth]= useState(new Date());
  const [datePickerVisible,setDatePickerVisible] = useState(false);
  const [deleteEnquiryId, setDeleteEnquiryId] = useState(null);
  const [deletingEnquiryId, setDeletingEnquiryId] = useState(null);

  // Detail page
  const [detailEnquiry,  setDetailEnquiry]  = useState(null);
  const [detailCallLogs, setDetailCallLogs] = useState([]);
  const [logsLoading,    setLogsLoading]    = useState(false);

  // Call state
  const [callEnquiry,    setCallEnquiry]    = useState(null);
  const [callStartTime,  setCallStartTime]  = useState(null);
  const [callStarted,    setCallStarted]    = useState(false);
  const [callModalVisible,setCallModalVisible]=useState(false);
  const [autoDuration,   setAutoDuration]   = useState(0);
  const [autoCallData,   setAutoCallData]   = useState(null);

  const [menuVisible,    setMenuVisible]    = useState(false);
  const [showLogoutModal,setShowLogoutModal]= useState(false);

  const fabScale         = useRef(new Animated.Value(1)).current;
  const isInitialMount   = useRef(true);
  const skipNextSearch   = useRef(false);
  const fetchRef         = useRef(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchEnquiries = useCallback(async (refresh=false) => {
    if (refresh) { setIsLoading(true); setPage(1); setHasMore(true); }
    else { if (!hasMore||isLoadingMore) return; setIsLoadingMore(true); }
    try {
      const pg = refresh ? 1 : page;
      const res = await enquiryService.getAllEnquiries(pg, 20, searchQuery, "", selectedDate);
      let data=[], totalPages=1;
      if (Array.isArray(res)) { data=res; setHasMore(false); }
      else if (res?.data) { data=res.data; totalPages=res.pagination?.pages||1; setHasMore(pg<totalPages); }
      refresh ? setEnquiries(data) : setEnquiries(p=>[...p,...data]);
      if (!refresh) setPage(p=>p+1);
      else if (data.length>0 && pg<totalPages) setPage(2);
    } catch(e) { console.error(e); }
    finally { setIsLoading(false); setIsLoadingMore(false); }
  }, [hasMore, isLoadingMore, page, searchQuery, selectedDate]);

  useEffect(() => { fetchRef.current = fetchEnquiries; }, [fetchEnquiries]);
  useEffect(() => { fetchEnquiries(true); }, []);
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current=false; return; }
    fetchEnquiries(true);
  }, [selectedDate]);
  useEffect(() => {
    if (isInitialMount.current) return;
    if (skipNextSearch.current) { skipNextSearch.current=false; return; }
    const t = setTimeout(()=>fetchEnquiries(true), 500);
    return ()=>clearTimeout(t);
  }, [searchQuery]);

  // ── Call listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("CALL_ENDED", (data) => {
      if (callStarted && callEnquiry) {
        global.__callClaimedByScreen = true;
        handleSaveCallLog({ phoneNumber:data.phoneNumber, callType:data.callType, duration:data.duration, note:"Auto-logged from Enquiry Screen", callTime:data.callTime||new Date(), enquiryId:callEnquiry._id, contactName:callEnquiry.name });
        setCallStarted(false); setCallStartTime(null);
      }
    });
    return ()=>sub.remove();
  }, [callStarted, callEnquiry]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async(next) => {
      if (next==="active" && callStarted && callStartTime && callEnquiry && !autoCallData) {
        const dur = Math.max(0, Math.floor((Date.now()-callStartTime)/1000)-5);
        handleSaveCallLog({ phoneNumber:callEnquiry.mobile, callType:"Outgoing", duration:dur, note:`AppState fallback. Duration: ${dur}s`, callTime:new Date(), enquiryId:callEnquiry._id, contactName:callEnquiry.name });
        setCallStarted(false); setCallStartTime(null);
      }
    });
    return ()=>sub.remove();
  }, [callStarted, callStartTime, callEnquiry, autoCallData]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("CALL_LOG_CREATED", ()=>fetchEnquiries(true));
    return ()=>sub.remove();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("ENQUIRY_CREATED", ()=>fetchEnquiries(true));
    return ()=>sub.remove();
  }, [fetchEnquiries]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("ENQUIRY_UPDATED", ()=>fetchEnquiries(true));
    return ()=>sub.remove();
  }, [fetchEnquiries]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("FOLLOWUP_CHANGED", ()=>fetchEnquiries(true));
    return ()=>sub.remove();
  }, [fetchEnquiries]);

  useEffect(() => {
    const isNew = global.nativeFabricUIManager != null;
    if (Platform.OS==="android" && !isNew && UIManager.setLayoutAnimationEnabledExperimental)
      UIManager.setLayoutAnimationEnabledExperimental(true);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("blur", () => {
      setDetailEnquiry(null);
      setDetailCallLogs([]);
      setLogsLoading(false);
    });
    return unsubscribe;
  }, [navigation]);

  // ── Action handlers ────────────────────────────────────────────────────────
  const openDetail = useCallback(async (enquiry) => {
    setDetailCallLogs([]);
    setDetailEnquiry(enquiry);
    setLogsLoading(true);
    try {
      const full = await enquiryService.getEnquiryById(enquiry._id);
      setDetailEnquiry(full||enquiry);
    } catch { setDetailEnquiry(enquiry); }
    try {
      const res = await callLogService.getCallLogs({enquiryId:enquiry._id});
      setDetailCallLogs(res.data||res);
    } catch { setDetailCallLogs([]); }
    finally { setLogsLoading(false); }
  }, []);

  const handleCall = useCallback(async (enquiry) => {
    if (!enquiry?.mobile) return;
    const raw = String(enquiry.mobile).replace(/\D/g,"");
    if (!raw) { Alert.alert("No phone","No valid phone number."); return; }
    setCallEnquiry(enquiry);
    setAutoCallData(null);
    setAutoDuration(0);
    setCallStarted(true);
    setCallStartTime(Date.now());
    try {
      if (Platform.OS === "android" && RNImmediatePhoneCall?.immediatePhoneCall) {
        RNImmediatePhoneCall.immediatePhoneCall(raw);
        return;
      }
      await Linking.openURL(`tel:${raw}`);
    } catch (error) {
      setCallStarted(false);
      setCallStartTime(null);
      setCallEnquiry(null);
      Alert.alert("Call failed", getUserFacingError(error, "Could not start the phone call."));
    }
  }, []);

  const handleSaveCallLog = async (data) => {
    try {
      const saved = await callLogService.createCallLog(data);
      if (!saved?._id) return;
      setCallModalVisible(false); setCallEnquiry(null); setAutoCallData(null);
      DeviceEventEmitter.emit("CALL_LOG_CREATED", saved);
      fetchEnquiries(true);
    } catch(e) { console.error(e); }
  };

  const handleWhatsApp = useCallback((enquiry) => {
    if (!enquiry?.mobile) return;
    navigation.navigate("WhatsAppChat", {enquiry});
  }, [navigation]);

  const handleEdit = useCallback((enquiry) => {
    setDetailEnquiry(null);
    navigation.navigate("AddEnquiry", { enquiry });
  }, [navigation]);

  const handleDelete = useCallback(async (id) => {
    try {
      setDeletingEnquiryId(id);
      await enquiryService.deleteEnquiry(id);
      setEnquiries((p) => p.filter((e) => e._id !== id));
      setDeleteEnquiryId((current) => (current === id ? null : current));
    } catch (e) {
      Alert.alert("Failed", getUserFacingError(e, "Failed to delete."));
    } finally {
      setDeletingEnquiryId((current) => (current === id ? null : current));
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderItem = useCallback(({item,index}) => (
    <EnquiryCard
      item={item} index={index}
      onPress={openDetail}
      onSwipe={openDetail}
      onCall={handleCall}
      onWhatsApp={handleWhatsApp}
      onLongPress={(enquiry) => setDeleteEnquiryId((current) => current === enquiry._id ? null : enquiry._id)}
      deleteMode={deleteEnquiryId === item._id}
      deleting={deletingEnquiryId === item._id}
      onDeleteCancel={() => setDeleteEnquiryId(null)}
      onDeleteConfirm={(enquiry) => handleDelete(enquiry._id)}
    />
  ), [openDetail, handleCall, handleWhatsApp, handleDelete, deleteEnquiryId, deletingEnquiryId]);

  const keyExtractor = useCallback((item)=>item._id?.toString()||item.id?.toString(),[]);

  return (
    <SafeAreaView style={S.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <PostCallModal visible={callModalVisible} enquiry={callEnquiry} onSave={handleSaveCallLog} initialDuration={autoDuration} autoCallData={autoCallData}
        onCancel={()=>{setCallModalVisible(false);setCallEnquiry(null);setCallStarted(false);setAutoCallData(null);}} />

      <AppSideMenu visible={menuVisible} onClose={()=>setMenuVisible(false)} navigation={navigation} user={user} onLogout={()=>{setMenuVisible(false);setShowLogoutModal(true);}} activeRouteName="Enquiry" resolveImageUrl={getImageUrl} />

      {/* Logout modal */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={()=>setShowLogoutModal(false)}>
        <View style={S.modalBg}>
          <MotiView from={{opacity:0,scale:0.88}} animate={{opacity:1,scale:1}} style={S.logoutBox}>
            <View style={S.logoutIconWrap}>
              <Ionicons name="log-out-outline" size={28} color={C.danger} />
            </View>
            <Text style={S.logoutTitle}>Sign Out?</Text>
            <Text style={S.logoutSub}>You&apos;ll need to log in again to access your data.</Text>
            <View style={S.logoutBtns}>
              <TouchableOpacity style={S.logoutCancel} onPress={()=>setShowLogoutModal(false)}>
                <Text style={S.logoutCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async()=>{setShowLogoutModal(false);await logout();}}>
                <LinearGradient colors={GRAD.danger} style={S.logoutConfirm}>
                  <Text style={S.logoutConfirmText}>Sign Out</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </MotiView>
        </View>
      </Modal>

      {/* ── Header ── */}
      <View style={S.header}>
        <View style={S.headerTop}>
          <TouchableOpacity style={S.headerBtn} onPress={()=>setMenuVisible(true)}>
            <Ionicons name="menu" size={21} color={C.textSub} />
          </TouchableOpacity>
          <View style={{flex:1, marginLeft:10}}>
            <Text style={S.headerLabel}>Enquiry List</Text>
            <Text style={S.headerName}>{user?.name||"User"}</Text>
          </View>
          <TouchableOpacity
            style={S.profileBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("ProfileScreen")}
          >
            {user?.logo ? (
              <Image source={{ uri: getImageUrl(user.logo) }} style={S.profileImg} />
            ) : (
              <View style={S.profileFallback}>
                <Text style={S.profileFallbackText}>
                  {user?.name?.[0]?.toUpperCase() || "U"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={S.searchBar}>
          <Ionicons name="search-outline" size={17} color={C.textMuted} style={{marginLeft:12}} />
          <TextInput style={S.searchInput} placeholder="Search name, phone…" placeholderTextColor={C.textLight} value={searchQuery} onChangeText={setSearchQuery} />
          <TouchableOpacity onPress={()=>setDatePickerVisible(true)} style={S.calBtn}>
            <Ionicons name="calendar-outline" size={17} color={C.primary} />
          </TouchableOpacity>
        </View>

        <View style={S.headerMeta}>
          <Text style={S.headerMetaText}>{enquiries.length} {enquiries.length===1?"enquiry":"enquiries"}</Text>
          {selectedDate && (
            <TouchableOpacity onPress={()=>setSelectedDate(null)} style={S.datePill}>
              <Ionicons name="close-circle" size={12} color={C.primary} />
              <Text style={S.datePillText}>{selectedDate}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── List ── */}
      <FlatList
        data={enquiries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={[S.list, enquiries.length===0&&{flex:1}]}
        refreshing={isLoading && enquiries.length>0}
        onRefresh={()=>fetchEnquiries(true)}
        onEndReached={()=>{ if (!isLoading&&!isLoadingMore&&hasMore) fetchEnquiries(false); }}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews
        ListFooterComponent={isLoadingMore ? <ActivityIndicator size="small" color={C.primary} style={{marginVertical:16}} /> : null}
        ListEmptyComponent={
          isLoading ? <EnquirySkeleton /> : (
            <View style={S.emptyWrap}>
              <View style={S.emptyIcon}><Ionicons name="document-text-outline" size={36} color={C.primary} /></View>
              <Text style={S.emptyTitle}>No enquiries found</Text>
              <Text style={S.emptySubtext}>Try adjusting your search or date filter</Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {/* ── FAB ── */}
      <Animated.View style={[S.fab, {transform:[{scale:fabScale}]}]}>
        <TouchableOpacity onPress={()=>{
          if (!billingInfo?.hasActivePlan || !billingInfo?.plan) {
            showUpgradePrompt("Your free CRM trial has expired. Please upgrade to add a new enquiry.");
            return;
          }
          Animated.sequence([
            Animated.timing(fabScale,{toValue:0.85,duration:100,useNativeDriver:true}),
            Animated.spring(fabScale,{toValue:1,useNativeDriver:true}),
          ]).start();
          navigation.navigate("AddEnquiry");
        }} activeOpacity={0.85}>
          <LinearGradient colors={GRAD.primary} style={S.fabInner}>
            <Ionicons name="add" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Date picker ── */}
      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={()=>setDatePickerVisible(false)}>
        <View style={S.modalBg}>
          <View style={S.datePicker}>
            <View style={S.dragHandle} />
            <View style={S.datePickerHeader}>
              <TouchableOpacity onPress={()=>{const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();setCalendarMonth(new Date(y,m-1,1));}} style={S.calNavBtn}>
                <Ionicons name="chevron-back" size={20} color={C.textSub} />
              </TouchableOpacity>
              <Text style={S.datePickerTitle}>{calendarMonth.toLocaleString(undefined,{month:"long",year:"numeric"})}</Text>
              <View style={S.datePickerHeaderActions}>
                <TouchableOpacity onPress={()=>{const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();setCalendarMonth(new Date(y,m+1,1));}} style={S.calNavBtn}>
                  <Ionicons name="chevron-forward" size={20} color={C.textSub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setDatePickerVisible(false)} style={S.calCloseBtn}>
                  <Ionicons name="close" size={18} color={C.textSub} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={S.clearDateBtn} onPress={()=>{setSelectedDate(null);setDatePickerVisible(false);}}>
              <Text style={S.clearDateText}>Show All Dates</Text>
            </TouchableOpacity>
            <View style={S.weekRow}>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>(
                <Text key={d} style={S.weekDay}>{d}</Text>
              ))}
            </View>
            <View style={S.calGrid}>
              {(()=>{
                const y=calendarMonth.getFullYear(),m=calendarMonth.getMonth();
                const first=(new Date(y,m,1,12).getDay()+6)%7;
                const days=new Date(y,m+1,0).getDate();
                const cells=[];
                for(let i=0;i<first;i++) cells.push(<View key={`e${i}`} style={S.dayCell}/>);
                for(let d=1;d<=days;d++){
                  const iso=toLocalIso(new Date(y,m,d));
                  const sel=selectedDate===iso;
                  const tod=toLocalIso(new Date())===iso;
                  cells.push(
                    <TouchableOpacity key={d} onPress={()=>{setSelectedDate(iso);setDatePickerVisible(false);}} style={[S.dayCell,sel&&S.daySel,tod&&!sel&&S.dayTod]}>
                      {sel ? (
                        <LinearGradient colors={GRAD.primary} style={S.daySelGrad}>
                          <Text style={[S.dayText,{color:"#fff",fontWeight:"800"}]}>{d}</Text>
                        </LinearGradient>
                      ) : (
                        <Text style={[S.dayText,tod&&{color:C.primary,fontWeight:"800"}]}>{d}</Text>
                      )}
                    </TouchableOpacity>
                  );
                }
                return cells;
              })()}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Detail page overlay ── */}
      {detailEnquiry && (
        <View style={StyleSheet.absoluteFill}>
          <EnquiryDetailPage
            enquiry={detailEnquiry}
            callLogs={detailCallLogs}
            logsLoading={logsLoading}
            onClose={()=>setDetailEnquiry(null)}
            onEdit={handleEdit}
            billingInfo={billingInfo}
            showUpgradePrompt={showUpgradePrompt}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Main screen styles ───────────────────────────────────────────────────────
const S = StyleSheet.create({
  root:    { flex:1, backgroundColor:C.bg },
  list:    { paddingHorizontal:14, paddingTop:12, paddingBottom:90 },
  modalBg: { flex:1, backgroundColor:"rgba(15,23,42,0.5)", justifyContent:"flex-end" },

  // Header
  header:     { backgroundColor:C.card, paddingHorizontal:16, paddingBottom:12, borderBottomWidth:1, borderBottomColor:C.border, shadowColor:C.shadow, shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:8, elevation:3 },
  headerTop:  { flexDirection:"row", alignItems:"center", paddingTop:8, marginBottom:12 },
  headerRight:{ flexDirection:"row", alignItems:"center", gap:8 },
  headerBtn:  { width:38, height:38, borderRadius:12, backgroundColor:C.bg, justifyContent:"center", alignItems:"center", borderWidth:1, borderColor:C.border },
  headerLabel:{ fontSize:11, color:C.textMuted, fontWeight:"600", letterSpacing:0.3 },
  headerName: { fontSize:17, color:C.text, fontWeight:"800", letterSpacing:-0.3 },
  profileBtn: { width:38, height:38, borderRadius:12, backgroundColor:C.bg, overflow:"hidden", borderWidth:1, borderColor:C.border },
  profileImg: { width:"100%", height:"100%" },
  profileFallback: { flex:1, backgroundColor:C.primarySoft, justifyContent:"center", alignItems:"center" },
  profileFallbackText: { color:C.primaryDark, fontWeight:"900", fontSize:15 },
  notifDot: { position:"absolute", top:8, right:8, width:7, height:7, borderRadius:4, backgroundColor:C.danger, borderWidth:1.5, borderColor:C.card },

  searchBar:   { flexDirection:"row", alignItems:"center", backgroundColor:C.bg, borderRadius:12, height:44, borderWidth:1, borderColor:C.border, marginBottom:8 },
  searchInput: { flex:1, marginLeft:8, fontSize:14, color:C.text },
  calBtn:      { width:38, height:36, justifyContent:"center", alignItems:"center", marginRight:4, borderRadius:10, backgroundColor:C.primarySoft },
  headerMeta:  { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  headerMetaText: { fontSize:12, color:C.textMuted, fontWeight:"600" },
  datePill:    { flexDirection:"row", alignItems:"center", gap:4, backgroundColor:C.primarySoft, borderRadius:20, paddingHorizontal:10, paddingVertical:4 },
  datePillText:{ fontSize:12, color:C.primary, fontWeight:"700" },

  // Cards
  cardWrap:   { marginBottom:10 },
  card:       { backgroundColor:C.card, borderRadius:16, marginHorizontal:0, overflow:"hidden", shadowColor:C.shadow, shadowOffset:{width:0,height:3}, shadowOpacity:0.06, shadowRadius:10, elevation:3 },
  stripe:     { position:"absolute", left:0, top:0, bottom:0, width:3, borderTopLeftRadius:16, borderBottomLeftRadius:16 },
  cardBody:   { paddingLeft:16, paddingRight:12, paddingTop:11, paddingBottom:9 },
  cardRow:    { flexDirection:"row", alignItems:"flex-start", marginBottom:8 },
  cardMid:    { flex:1, gap:4 },
  cardRowBetween: { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  cardName:   { fontSize:14, fontWeight:"700", color:C.text, flex:1, letterSpacing:-0.2 },
  cardDate:   { fontSize:11, color:C.textMuted, fontWeight:"600" },
  cardMobile: { fontSize:12, color:C.textMuted, fontWeight:"500" },
  cardStatus: { fontSize:11, color:C.textLight, fontWeight:"600" },

  avatarBox:  { width:44, height:44, borderRadius:13, marginRight:10, flexShrink:0 },
  avatarImg:  { width:"100%", height:"100%", borderRadius:13 },
  avatarGrad: { width:"100%", height:"100%", borderRadius:13, justifyContent:"center", alignItems:"center" },
  avatarText: { color:"#fff", fontSize:15, fontWeight:"800" },
  avatarDot:  { position:"absolute", bottom:1, right:1, width:10, height:10, borderRadius:5, borderWidth:2, borderColor:C.card },

  productPill: { flexDirection:"row", alignItems:"center", gap:5, backgroundColor:C.primarySoft, paddingHorizontal:8, paddingVertical:4, borderRadius:7 },
  productPillText: { fontSize:11, color:C.primaryDark, fontWeight:"700", maxWidth:SW*0.3 },
  priorityPill:    { flexDirection:"row", alignItems:"center", gap:4, paddingHorizontal:8, paddingVertical:4, borderRadius:7 },
  priorityDot:     { width:5, height:5, borderRadius:3 },
  priorityPillText:{ fontSize:10, fontWeight:"800", textTransform:"uppercase", letterSpacing:0.2 },

  cardActions: { flexDirection:"row", alignItems:"center", gap:7, marginTop:2 },
  actionChip:  { width:34, height:34, borderRadius:10, alignItems:"center", justifyContent:"center" },
  enqNoBadge:  { backgroundColor:C.primarySoft, paddingHorizontal:7, paddingVertical:3, borderRadius:7, borderWidth:1, borderColor:C.primaryMid },
  enqNoText:   { fontSize:10, fontWeight:"800", color:C.primary },
  swipeHint:   { flexDirection:"row", alignItems:"center", gap:2, opacity:0.55 },
  swipeHintText:{ fontSize:10, color:C.textLight, fontWeight:"600" },
  deleteBar: { flexDirection:"row", alignItems:"center", gap:8, width:"100%", backgroundColor:"#FEF2F2", borderRadius:12, paddingHorizontal:10, paddingVertical:8, borderWidth:1, borderColor:"#FECACA" },
  deletePill: { flexDirection:"row", alignItems:"center", gap:6 },
  deletePillText: { fontSize:12, color:"#991B1B", fontWeight:"700" },
  deleteGhostBtn: { height:32, paddingHorizontal:12, borderRadius:10, alignItems:"center", justifyContent:"center", backgroundColor:"#fff", borderWidth:1, borderColor:"#F3D1D1" },
  deleteGhostText: { fontSize:12, color:C.textMuted, fontWeight:"700" },
  deleteDangerBtn: { minWidth:72, height:32, paddingHorizontal:12, borderRadius:10, alignItems:"center", justifyContent:"center", backgroundColor:C.danger },
  deleteDangerBtnDisabled: { opacity:0.7 },
  deleteDangerText: { fontSize:12, color:"#fff", fontWeight:"800" },
  // FAB
  fab:     { position:"absolute", bottom:28, right:18 },
  fabInner:{ width:54, height:54, borderRadius:27, justifyContent:"center", alignItems:"center", shadowColor:C.primary, shadowOffset:{width:0,height:8}, shadowOpacity:0.35, shadowRadius:14, elevation:8 },

  // Logout modal
  logoutBox:     { backgroundColor:C.card, borderRadius:24, padding:24, width:"90%", maxWidth:340, alignItems:"center", alignSelf:"center", marginBottom:200, shadowColor:C.shadow, shadowOffset:{width:0,height:12}, shadowOpacity:0.12, shadowRadius:24, elevation:10 },
  logoutIconWrap:{ width:60, height:60, borderRadius:20, backgroundColor:C.danger+"15", alignItems:"center", justifyContent:"center", marginBottom:14 },
  logoutTitle:   { fontSize:19, fontWeight:"800", color:C.text, marginBottom:6, letterSpacing:-0.3 },
  logoutSub:     { fontSize:13, color:C.textMuted, textAlign:"center", lineHeight:20, marginBottom:22 },
  logoutBtns:    { flexDirection:"row", gap:10, width:"100%" },
  logoutCancel:  { flex:1, height:46, borderRadius:12, justifyContent:"center", alignItems:"center", backgroundColor:C.bg, borderWidth:1.5, borderColor:C.border },
  logoutCancelText: { fontSize:14, fontWeight:"700", color:C.textMuted },
  logoutConfirm:    { flex:1, height:46, borderRadius:12, justifyContent:"center", alignItems:"center" },
  logoutConfirmText:{ fontSize:14, fontWeight:"700", color:"#fff" },

  // Date picker
  dragHandle:       { width:36, height:4, borderRadius:2, backgroundColor:C.border, alignSelf:"center", marginTop:10, marginBottom:8 },
  datePicker:       { backgroundColor:C.card, borderTopLeftRadius:24, borderTopRightRadius:24, paddingBottom:28 },
  datePickerHeader: { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingHorizontal:20, paddingVertical:14 },
  datePickerHeaderActions: { flexDirection:"row", alignItems:"center", gap:8 },
  datePickerTitle:  { fontSize:15, fontWeight:"800", color:C.text },
  calNavBtn:        { width:34, height:34, borderRadius:10, backgroundColor:C.bg, justifyContent:"center", alignItems:"center" },
  calCloseBtn:      { width:34, height:34, borderRadius:10, backgroundColor:"#FEE2E2", justifyContent:"center", alignItems:"center", borderWidth:1, borderColor:"#FECACA" },
  clearDateBtn:     { marginHorizontal:20, paddingVertical:11, borderRadius:12, backgroundColor:C.primarySoft, alignItems:"center", marginBottom:14, borderWidth:1.5, borderColor:C.primaryMid },
  clearDateText:    { fontSize:14, fontWeight:"700", color:C.primary },
  weekRow:  { flexDirection:"row", paddingHorizontal:8 },
  weekDay:  { width:(SW-16)/7, textAlign:"center", fontSize:11, fontWeight:"700", color:C.textLight, paddingVertical:4 },
  calGrid:  { flexDirection:"row", flexWrap:"wrap", paddingHorizontal:8 },
  dayCell:  { width:(SW-16)/7, height:38, justifyContent:"center", alignItems:"center" },
  daySel:   { borderRadius:10 },
  dayTod:   { borderWidth:1.5, borderColor:C.primary, borderRadius:10 },
  daySelGrad: { width:34, height:34, borderRadius:10, justifyContent:"center", alignItems:"center" },
  dayText:  { fontSize:14, color:C.text, fontWeight:"600" },

  // Empty
  emptyWrap:   { alignItems:"center", marginTop:60, gap:8 },
  emptyIcon:   { width:68, height:68, borderRadius:20, backgroundColor:C.primarySoft, justifyContent:"center", alignItems:"center", marginBottom:6 },
  emptyTitle:  { fontSize:16, color:C.textSub, fontWeight:"700" },
  emptySubtext:{ fontSize:13, color:C.textLight },
});

// ─── Detail page styles ───────────────────────────────────────────────────────
const SD = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg, zIndex: 100 },

  // ── Top card ──
  topCard: {
    backgroundColor: C.card,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    overflow: "hidden",
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },

  // Decorative circles (no color change — just structure)
  deco1: {
    position: "absolute", top: -60, right: -50,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: C.primarySoft,
    opacity: 0.7,
  },
  deco2: {
    position: "absolute", top: 20, right: 20,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: C.primaryMid,
    opacity: 0.35,
  },
  deco3: {
    position: "absolute", bottom: -30, left: -40,
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: C.primarySoft,
    opacity: 0.5,
  },

  // Nav buttons
  backBtn: {
    position: "absolute", top: 0, left: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    justifyContent: "center", alignItems: "center",
    zIndex: 10,
  },
  editBtn: {
    position: "absolute", top: 0, right: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    justifyContent: "center", alignItems: "center",
    zIndex: 10,
  },

  // Circle avatar
  avatarRing: {
    position: "relative",
    marginTop: 12,
    marginBottom: 14,
    width: 86, height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: C.border,
    padding: 3,
    backgroundColor: C.card,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarOuter: {
    width: "100%", height: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  avatarImg:  { width: "100%", height: "100%", borderRadius: 999 },
  avatarGrad: { width: "100%", height: "100%", borderRadius: 999, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "900" },
  priDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2.5, borderColor: C.card,
  },

  heroName:   { fontSize: 18, fontWeight: "800", color: C.text, letterSpacing: -0.3, marginBottom: 3 },
  heroMobile: { fontSize: 13, color: C.textMuted, fontWeight: "500", marginBottom: 12 },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.bg,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 99, borderWidth: 1, borderColor: C.border,
  },
  chipDot:  { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, color: C.textSub, fontWeight: "700" },

  // ── Tabs ──
  tabBar: { flexDirection: "row", backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  tab:    { flex: 1, alignItems: "center", paddingVertical: 12, position: "relative" },
  tabActive: {},
  tabText:      { fontSize: 13, fontWeight: "600", color: C.textMuted },
  tabTextActive:{ fontSize: 13, fontWeight: "800", color: C.primary },
  tabLine: { position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2.5, backgroundColor: C.primary, borderRadius: 2 },

  // ── Details tab ──
  detailRow: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: C.card, borderRadius: 13,
    padding: 12, borderWidth: 1, borderColor: C.border, gap: 10,
  },
  detailIconBox: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.primarySoft,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  detailLabel: { fontSize: 10, color: C.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  detailValue: { fontSize: 13, color: C.text, fontWeight: "600" },

  // ── Calls tab ──
  logItem: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 13,
    padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8,
  },
  logIconBox: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center", marginRight: 10 },
  logType:    { fontSize: 13, fontWeight: "700", color: C.text },
  logDate:    { fontSize: 11, color: C.textLight, marginTop: 2 },
  logDur:     { fontSize: 14, fontWeight: "800" },
  logDurLabel:{ fontSize: 9, color: C.textLight, fontWeight: "600", textTransform: "uppercase" },

  // ── Empty ──
  emptyWrap:   { alignItems: "center", paddingTop: 48, gap: 8 },
  emptyIconBox:{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.primarySoft, justifyContent: "center", alignItems: "center" },
  emptyText:   { fontSize: 13, color: C.textLight, fontWeight: "500" },
});
