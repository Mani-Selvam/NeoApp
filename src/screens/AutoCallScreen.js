import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    DeviceEventEmitter,
    Dimensions,
    FlatList,
    Image,
    Linking,
    Modal,
    PermissionsAndroid,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import RNImmediatePhoneCall from 'react-native-immediate-phone-call';
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { PostCallModal } from "../components/PostCallModal";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import * as callLogService from "../services/callLogService";
import * as followupService from "../services/followupService";

const { width, height } = Dimensions.get("window");

// --- PREMIUM SaaS THEME ---
const THEME = {
    colors: {
        bg: "#F8FAFC",       // Slate 50
        surface: "#FFFFFF",   // White
        primary: "#4F46E5",   // Indigo 600
        primaryDark: "#4338CA",
        primaryLight: "#EEF2FF", // Indigo 50
        secondary: "#10B981", // Emerald 500
        danger: "#EF4444",    // Red 500
        warning: "#F59E0B",   // Amber 500
        textMain: "#0F172A",  // Slate 900
        textSec: "#64748B",   // Slate 500
        textLight: "#94A3B8", // Slate 400
        border: "#E2E8F0",    // Slate 200
        divider: "#F1F5F9",
    },
    shadow: {
        sm: {
            shadowColor: "#64748B",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1,
        },
        md: {
            shadowColor: "#6366F1", // Indigo tint
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 4,
        },
        lg: {
            shadowColor: "#1E293B",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.10,
            shadowRadius: 15,
            elevation: 8,
        }
    },
    radius: {
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        xxl: 28,
        full: 9999,
    }
};

const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const getDateColor = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (d < today) return THEME.colors.danger;
    if (d.getTime() === today.getTime()) return THEME.colors.warning;
    return THEME.colors.secondary;
};

export default function AutoCallScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    // --- State ---
    const [followUps, setFollowUps] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [filter, setFilter] = useState("Missed");
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [currentCallIndex, setCurrentCallIndex] = useState(-1);
    const [scrollY] = useState(new Animated.Value(0));

    // Call log state
    const [callModalVisible, setCallModalVisible] = useState(false);
    const [callEnquiry, setCallEnquiry] = useState(null);
    const [callStartTime, setCallStartTime] = useState(null);
    const [callStarted, setCallStarted] = useState(false);
    const [autoDuration, setAutoDuration] = useState(0);
    const [autoCallData, setAutoCallData] = useState(null);

    // Date picker state
    const [tempYear, setTempYear] = useState(new Date().getFullYear().toString());
    const [tempMonth, setTempMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, "0"));
    const [tempDay, setTempDay] = useState(new Date().getDate().toString().padStart(2, "0"));
    const [activePicker, setActivePicker] = useState(null);

    // --- Fetch Data ---
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await followupService.getAutoCallFollowUps(
                startDate || undefined,
                endDate || undefined,
                filter
            );
            setFollowUps(result.data || []);
        } catch (err) {
            console.error("AutoCall fetch error:", err);
            Alert.alert("Error", "Could not load follow-ups");
        } finally {
            setIsLoading(false);
        }
    }, [filter, startDate, endDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Call Handling ---
    const handleCall = async (item, index) => {
        if (!item || !item.mobile) {
            Alert.alert("No Phone", "This contact has no phone number");
            return;
        }
        console.log(`[AutoCall] Attempting call to: ${item.mobile}`);

        // 1. Request Permissions
        if (Platform.OS === 'android') {
            await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.CALL_PHONE,
                PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
                PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
            ]);
        }

        // 2. Try Direct Call
        let callTriggered = false;
        try {
            if (RNImmediatePhoneCall && typeof RNImmediatePhoneCall.immediatePhoneCall === 'function') {
                RNImmediatePhoneCall.immediatePhoneCall(item.mobile);
                callTriggered = true;
            }
        } catch (e) {
            console.error("[AutoCall] Direct Call Error:", e);
        }

        // 3. Fallback
        if (!callTriggered) {
            Linking.openURL(`tel:${item.mobile}`);
        }

        setCurrentCallIndex(index);
        setCallEnquiry({
            _id: item.enqId?._id || item.enqId || item.enqNo || item._id,
            name: item.name,
            mobile: item.mobile,
        });
        setCallStartTime(Date.now());
        setCallStarted(true);
    };

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener("CALL_ENDED", (data) => {
            if (callStarted && callEnquiry) {
                global.__callClaimedByScreen = true;

                const fullCallData = {
                    phoneNumber: data.phoneNumber,
                    callType: data.callType,
                    duration: data.duration,
                    note: data.note || "Auto-logged from Auto-Dialer Screen",
                    callTime: data.callTime || new Date(),
                    enquiryId: callEnquiry._id,
                    contactName: callEnquiry.name
                };

                handleSaveCallLog(fullCallData);
                setCallStarted(false);
                setCallStartTime(null);
            }
        });
        return () => sub.remove();
    }, [callStarted, callEnquiry]);

    useEffect(() => {
        const sub = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "active" && callStarted && callStartTime && callEnquiry) {
                if (autoCallData) return;
                const duration = Math.max(0, Math.floor((Date.now() - callStartTime) / 1000) - 5);

                const fullCallData = {
                    phoneNumber: callEnquiry.mobile,
                    callType: "Outgoing",
                    duration: duration,
                    note: `Auto-logged (AppState fallback). Duration: ${duration}s`,
                    callTime: new Date(),
                    enquiryId: callEnquiry._id,
                    contactName: callEnquiry.name
                };

                handleSaveCallLog(fullCallData);
                setCallStarted(false);
                setCallStartTime(null);
            }
        });
        return () => sub.remove();
    }, [callStarted, callStartTime, callEnquiry, autoCallData]);

    const handleSaveCallLog = async (callData) => {
        try {
            const savedLog = await callLogService.createCallLog(callData);
            if (!savedLog?._id) {
                console.log("Call log was not created:", savedLog);
                return;
            }
            setCallModalVisible(false);
            setCallEnquiry(null);
            setAutoCallData(null);
            DeviceEventEmitter.emit("CALL_LOG_CREATED", savedLog);

            setFollowUps((prev) =>
                prev.map((item, idx) =>
                    idx === currentCallIndex ? { ...item, _called: true } : item
                )
            );
        } catch (err) {
            console.error("Error saving call log:", err);
        }
    };

    const handleWhatsApp = (item) => {
        if (!item || !item.mobile) return;
        navigation.navigate("WhatsAppChat", {
            enquiry: {
                _id: item.enqId?._id || item.enqId || item._id,
                name: item.name,
                mobile: item.mobile,
            },
        });
    };

    // --- Date Picker ---
    const openDatePicker = (type) => {
        const currentDate = type === "start" ? startDate : endDate;
        if (currentDate) {
            const parts = currentDate.split("-");
            setTempYear(parts[0]);
            setTempMonth(parts[1]);
            setTempDay(parts[2]);
        } else {
            const now = new Date();
            setTempYear(now.getFullYear().toString());
            setTempMonth((now.getMonth() + 1).toString().padStart(2, "0"));
            setTempDay(now.getDate().toString().padStart(2, "0"));
        }
        setActivePicker(type);
    };

    const confirmDatePick = () => {
        const dateStr = `${tempYear}-${tempMonth.padStart(2, "0")}-${tempDay.padStart(2, "0")}`;
        if (activePicker === "start") setStartDate(dateStr);
        else setEndDate(dateStr);
        setActivePicker(null);
    };

    const clearDates = () => {
        setStartDate("");
        setEndDate("");
    };

    // --- Stats ---
    const totalCount = followUps.length;
    const calledCount = followUps.filter((f) => f._called).length;
    const remainingCount = totalCount - calledCount;

    // --- Render Item ---
    const renderItem = ({ item, index }) => {
        const dateColor = getDateColor(item.date);
        const isCalled = item._called;
        const initial = item.name ? item.name[0].toUpperCase() : "U";

        return (
            <MotiView
                from={{ opacity: 0, translateY: 20, scale: 0.95 }}
                animate={{ opacity: 1, translateY: 0, scale: 1 }}
                transition={{ delay: index * 50, type: "spring", damping: 18 }}
                style={styles.cardWrapper}
            >
                <View style={[styles.card, isCalled && styles.cardCalled]}>
                    {/* Top Row */}
                    <View style={styles.cardHeader}>
                        {/* Avatar with Status Ring */}
                        <View style={[
                            styles.avatarRing,
                            { borderColor: isCalled ? THEME.colors.secondary : THEME.colors.border }
                        ]}>
                            <View style={[styles.avatar, { backgroundColor: isCalled ? '#D1FAE5' : THEME.colors.primaryLight }]}>
                                <Text style={[styles.avatarText, { color: isCalled ? THEME.colors.secondary : THEME.colors.primary }]}>
                                    {initial}
                                </Text>
                            </View>
                            {isCalled && (
                                <View style={styles.checkBadge}>
                                    <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                                </View>
                            )}
                        </View>

                        <View style={styles.cardInfo}>
                            <Text style={[styles.name, isCalled && styles.textMuted]} numberOfLines={1}>
                                {item.name || "Unknown Contact"}
                            </Text>
                            <View style={styles.metaRow}>
                                <Ionicons name="call-outline" size={14} color={THEME.colors.textLight} />
                                <Text style={styles.metaText}>{item.mobile || "N/A"}</Text>
                                {!!item.product && (
                                    <>
                                        <View style={styles.dot} />
                                        <Text style={styles.metaText}>{item.product}</Text>
                                    </>
                                )}
                            </View>
                        </View>

                        <View style={[styles.dateBadge, { backgroundColor: dateColor + '15' }]}>
                            <Text style={[styles.dateText, { color: dateColor }]}>{formatDate(item.date)}</Text>
                        </View>
                    </View>

                    {/* Remarks */}
                    {!!item.remarks && (
                        <View style={styles.remarksBox}>
                            <Text style={styles.remarksText} numberOfLines={2}>"{item.remarks}"</Text>
                        </View>
                    )}

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Action Footer */}
                    <View style={styles.cardFooter}>
                        {isCalled ? (
                            <View style={styles.completedContainer}>
                                <Ionicons name="checkmark-circle" size={20} color={THEME.colors.secondary} />
                                <View style={styles.completedTextGroup}>
                                    <Text style={styles.completedTitle}>Completed</Text>
                                    <Text style={styles.completedSub}>Call logged successfully</Text>
                                </View>
                            </View>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={styles.primaryAction}
                                    onPress={() => handleCall(item, index)}
                                    activeOpacity={0.9}
                                >
                                    <LinearGradient
                                        colors={[THEME.colors.primary, THEME.colors.primaryDark]}
                                        style={styles.primaryActionGradient}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    >
                                        <Ionicons name="call" size={18} color="#FFFFFF" />
                                        <Text style={styles.primaryActionText}>Call Now</Text>
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.secondaryAction}
                                    onPress={() => handleWhatsApp(item)}
                                    activeOpacity={0.7}
                                >
                                    <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </MotiView>
        );
    };

    const filterOptions = ["Missed", "Upcoming", "All"];

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <StatusBar barStyle="dark-content" backgroundColor={THEME.colors.bg} translucent />

            {/* Floating Header */}
            <View style={styles.floatingHeader}>
                <SafeAreaView edges={["top"]}>
                    <View style={styles.headerContent}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                            <Ionicons name="chevron-back" size={26} color={THEME.colors.textMain} />
                        </TouchableOpacity>
                        <View style={styles.headerCenter}>
                            <Text style={styles.headerTitle}>Auto Dialer</Text>
                            <Text style={styles.headerSubtitle}>
                                {calledCount} of {totalCount} Completed
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => navigation.navigate("ProfileScreen")} style={styles.iconBtn}>
                            {user?.logo ? (
                                <Image source={{ uri: getImageUrl(user.logo) }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                            ) : (
                                <Ionicons name="person-circle-outline" size={24} color={THEME.colors.textSec} />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Progress Bar inside Header */}
                    {totalCount > 0 && (
                        <View style={styles.progressWrapper}>
                            <View style={styles.progressBg}>
                                <Animated.View
                                    style={[
                                        styles.progressFill,
                                        { width: `${(calledCount / totalCount) * 100}%` }
                                    ]}
                                />
                            </View>
                        </View>
                    )}
                </SafeAreaView>
            </View>

            {/* Filter & Date Bar */}
            <View style={styles.filterBar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScrollContent}
                >
                    <View style={styles.pillContainer}>
                        {filterOptions.map((opt) => (
                            <TouchableOpacity
                                key={opt}
                                style={[styles.pill, filter === opt && styles.pillActive]}
                                onPress={() => setFilter(opt)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.pillText, filter === opt && styles.pillTextActive]}>{opt}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={styles.dateRow}>
                        <TouchableOpacity
                            style={styles.dateBtn}
                            onPress={() => openDatePicker("start")}
                        >
                            <Ionicons name="calendar-outline" size={16} color={THEME.colors.primary} />
                            <Text style={styles.dateBtnText}>{startDate ? formatDate(startDate) : "Start"}</Text>
                        </TouchableOpacity>

                        <Ionicons name="arrow-forward" size={14} color={THEME.colors.textLight} style={{ marginHorizontal: 4 }} />

                        <TouchableOpacity
                            style={styles.dateBtn}
                            onPress={() => openDatePicker("end")}
                        >
                            <Ionicons name="calendar-outline" size={16} color={THEME.colors.primary} />
                            <Text style={styles.dateBtnText}>{endDate ? formatDate(endDate) : "End"}</Text>
                        </TouchableOpacity>

                        {!!(startDate || endDate) && (
                            <TouchableOpacity onPress={clearDates} style={styles.clearBtn}>
                                <Ionicons name="close-circle" size={20} color={THEME.colors.danger} />
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
            </View>

            {/* List */}
            {isLoading ? (
                <View style={styles.centerLoading}>
                    <ActivityIndicator size="large" color={THEME.colors.primary} />
                    <Text style={styles.loadingText}>Loading contacts...</Text>
                </View>
            ) : (
                <FlatList
                    data={followUps}
                    keyExtractor={(item) => item._id?.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconBox}>
                                <Ionicons name="call-outline" size={40} color={THEME.colors.textLight} />
                            </View>
                            <Text style={styles.emptyTitle}>No Follow-ups Found</Text>
                            <Text style={styles.emptySub}>Try adjusting filters or date range.</Text>
                        </View>
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Clean Date Picker Modal */}
            <Modal
                visible={activePicker !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setActivePicker(null)}
            >
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActivePicker(null)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Date</Text>

                        <View style={styles.dateInputRow}>
                            <View style={styles.dateInputBox}>
                                <Text style={styles.inputLabel}>YYYY</Text>
                                <TextInput
                                    style={styles.input}
                                    value={tempYear}
                                    onChangeText={setTempYear}
                                    keyboardType="number-pad"
                                    maxLength={4}
                                />
                            </View>
                            <Text style={styles.inputSeparator}>-</Text>
                            <View style={styles.dateInputBox}>
                                <Text style={styles.inputLabel}>MM</Text>
                                <TextInput
                                    style={styles.input}
                                    value={tempMonth}
                                    onChangeText={setTempMonth}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                />
                            </View>
                            <Text style={styles.inputSeparator}>-</Text>
                            <View style={styles.dateInputBox}>
                                <Text style={styles.inputLabel}>DD</Text>
                                <TextInput
                                    style={styles.input}
                                    value={tempDay}
                                    onChangeText={setTempDay}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                />
                            </View>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setActivePicker(null)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={confirmDatePick}>
                                <Text style={styles.confirmBtnText}>Apply</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            <PostCallModal
                visible={callModalVisible}
                onCancel={() => {
                    setCallModalVisible(false);
                    setCallEnquiry(null);
                    setAutoCallData(null);
                }}
                onSave={handleSaveCallLog}
                enquiry={callEnquiry}
                initialDuration={autoDuration}
                autoCallData={autoCallData}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: THEME.colors.bg,
        marginTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    },

    // Floating Header
    floatingHeader: {
        marginTop: -70,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        borderBottomWidth: 1,
        borderBottomColor: THEME.colors.border,
        ...THEME.shadow.sm
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 50,
        paddingBottom: 16,
    },
    iconBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: THEME.colors.textMain,
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 12,
        color: THEME.colors.textSec,
        fontWeight: '500',
        marginTop: 2,
    },
    progressWrapper: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    progressBg: {
        height: 6,
        backgroundColor: THEME.colors.bg,
        borderRadius: 10,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: THEME.colors.primary,
        borderRadius: 10,
    },

    // Filter Bar
    filterBar: {
        marginTop: 100, // Space for header
        paddingHorizontal: 20,
        paddingBottom: 12,
        backgroundColor: THEME.colors.bg,
    },
    filterScrollContent: {
        alignItems: 'center',
    },
    pillContainer: {
        flexDirection: 'row',
        backgroundColor: THEME.colors.surface,
        borderRadius: 12,
        padding: 4,
        marginRight: 16,
        ...THEME.shadow.sm
    },
    pill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    pillActive: {
        backgroundColor: THEME.colors.primaryLight,
    },
    pillText: {
        fontSize: 13,
        fontWeight: '600',
        color: THEME.colors.textSec,
    },
    pillTextActive: {
        color: THEME.colors.primary,
        fontWeight: '700',
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        ...THEME.shadow.sm
    },
    dateBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: THEME.colors.textMain,
        marginLeft: 6,
    },
    clearBtn: {
        marginLeft: 8,
    },

    // List Content
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
        paddingTop: 10,
    },
    centerLoading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 100,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: THEME.colors.textSec,
        fontWeight: '500',
    },

    // Card Design
    cardWrapper: {
        marginBottom: 20,
    },
    card: {
        backgroundColor: THEME.colors.surface,
        borderRadius: THEME.radius.xl,
        padding: 20,
        ...THEME.shadow.md,
        borderWidth: 1,
        borderColor: '#FFFFFF',
    },
    cardCalled: {
        backgroundColor: '#F8FAFC',
        borderColor: THEME.colors.border,
        opacity: 0.8,
    },

    // Card Header
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarRing: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        padding: 2,
        marginRight: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '800',
    },
    checkBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: THEME.colors.secondary,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    cardInfo: {
        flex: 1,
    },
    name: {
        fontSize: 17,
        fontWeight: '700',
        color: THEME.colors.textMain,
        marginBottom: 6,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaText: {
        fontSize: 13,
        color: THEME.colors.textSec,
        marginLeft: 4,
        fontWeight: '500',
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: THEME.colors.textLight,
        marginHorizontal: 8,
    },
    dateBadge: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    dateText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },

    // Remarks
    remarksBox: {
        backgroundColor: THEME.colors.bg,
        padding: 12,
        borderRadius: THEME.radius.md,
        marginBottom: 16,
        borderLeftWidth: 3,
        borderLeftColor: THEME.colors.border,
    },
    remarksText: {
        fontSize: 13,
        color: THEME.colors.textSec,
        fontStyle: 'italic',
    },
    divider: {
        height: 1,
        backgroundColor: THEME.colors.divider,
        marginBottom: 16,
    },

    // Footer Actions
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    primaryAction: {
        flex: 1,
        height: 46,
        borderRadius: THEME.radius.lg,
        overflow: 'hidden',
        marginRight: 12,
        elevation: 3,
        shadowColor: THEME.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    primaryActionGradient: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryActionText: {
        color: '#FFFFFF',
        fontWeight: '700',
        marginLeft: 8,
        fontSize: 15,
        letterSpacing: 0.5,
    },
    secondaryAction: {
        width: 46,
        height: 46,
        borderRadius: THEME.radius.lg,
        backgroundColor: '#ECFDF5',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#D1FAE5',
    },

    // Completed State
    completedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        backgroundColor: '#ECFDF5',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: THEME.radius.lg,
    },
    completedTextGroup: {
        marginLeft: 12,
    },
    completedTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: THEME.colors.secondary,
    },
    completedSub: {
        fontSize: 11,
        color: THEME.colors.textSec,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        width: '85%',
        borderRadius: 24,
        padding: 28,
        ...THEME.shadow.lg
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: THEME.colors.textMain,
        marginBottom: 24,
        textAlign: 'center',
    },
    dateInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 32,
    },
    dateInputBox: {
        flex: 1,
    },
    inputLabel: {
        fontSize: 11,
        color: THEME.colors.textLight,
        fontWeight: '700',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        borderWidth: 1,
        borderColor: THEME.colors.border,
        borderRadius: 12,
        padding: 14,
        fontSize: 18,
        color: THEME.colors.textMain,
        textAlign: 'center',
        fontWeight: '700',
        backgroundColor: THEME.colors.bg,
    },
    inputSeparator: {
        marginHorizontal: 10,
        color: THEME.colors.textLight,
        fontSize: 20,
        fontWeight: '700',
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: THEME.colors.bg,
        borderWidth: 1,
        borderColor: THEME.colors.border,
    },
    cancelBtnText: {
        color: THEME.colors.textMain,
        fontWeight: '700',
        fontSize: 15,
    },
    confirmBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        backgroundColor: THEME.colors.primary,
    },
    confirmBtnText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 15,
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        paddingBottom: 60,
    },
    emptyIconBox: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: THEME.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: THEME.colors.textMain,
        marginBottom: 8,
    },
    emptySub: {
        fontSize: 14,
        color: THEME.colors.textSec,
    },
});
