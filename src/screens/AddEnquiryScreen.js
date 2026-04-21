import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    DeviceEventEmitter,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import ConfettiBurst from "../components/ConfettiBurst";
import * as addressService from "../services/addressService";
import getApiClient from "../services/apiClient";
import { API_URL } from "../services/apiConfig";
import { getAuthToken } from "../services/secureTokenStorage";
import { emitEnquiryCreated, emitEnquiryUpdated } from "../services/appEvents";
import * as leadSourceService from "../services/leadSourceService";
import notificationService from "../services/notificationService";
import * as productService from "../services/productService";
import * as staffService from "../services/staffService";
import { useAuth } from "../contexts/AuthContext";
import { useResponsiveTokens } from "../components/Responsiveutils";
import { getImageUrl } from "../utils/imageHelper";

const getOrdinalAdminLabel = (position) => {
    const labels = {
        1: "Main Admin",
        2: "Secondary Admin",
        3: "Third Admin",
        4: "Fourth Admin",
        5: "Fifth Admin",
    };
    return labels[position] || `${position}th Admin`;
};

const toLocalIsoDate = (value = new Date()) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    primary: "#2563EB",
    primarySoft: "#EFF6FF",
    primaryMid: "rgba(37,99,235,0.12)",
    success: "#059669",
    warning: "#D97706",
    danger: "#DC2626",
    bg: "#F1F5F9",
    card: "#FFFFFF",
    border: "#E2E8F0",
    borderFocus: "#2563EB",
    text: "#0F172A",
    textSub: "#334155",
    textMuted: "#64748B",
    textLight: "#94A3B8",
    navBg: "#FFFFFF",
    gradient: ["#2563EB", "#4F46E5"],
};

// ─── Responsive scale ─────────────────────────────────────────────────────────
const useScale = () => {
    const ui = useResponsiveTokens();
    return useMemo(() => {
        const isTablet = ui.isTablet;
        const isLarge = ui.width >= 414 && ui.width < 768;
        const isMedium = ui.width >= 375 && ui.width < 414;
        const isSmall = ui.width < 375;

        return {
            isTablet,
            isLarge,
            isMedium,
            isSmall,
            width: ui.width,
            height: ui.height,
            f: {
                xs: Math.round(ui.font.xs),
                sm: Math.round(ui.font.sm),
                base: Math.round(ui.font.base),
                md: Math.round(ui.font.lg),
                lg: Math.round(ui.font.xl),
                xl: Math.round(ui.font.xxl),
                xxl: Math.round(ui.font.xxxl),
            },
            sp: {
                xs: Math.round(ui.spacing.xs),
                sm: Math.round(ui.spacing.sm),
                md: Math.round(ui.spacing.md),
                lg: Math.round(ui.spacing.lg),
                xl: Math.round(ui.spacing.xl),
                xxl: Math.round(ui.spacing.xxl),
            },
            inputH: ui.size(isTablet ? 56 : isLarge ? 50 : isMedium ? 48 : 46),
            radius: isTablet ? 16 : 12,
            cardR: isTablet ? 20 : 14,
            iconBox: ui.size(isTablet ? 36 : 32, 30, 44),
            hPad: Math.round(ui.hPad),
        };
    }, [ui]);
};

// ─── Field component ──────────────────────────────────────────────────────────
const Field = React.memo(
    ({
        label,
        value,
        onChange,
        placeholder,
        icon,
        keyboardType = "default",
        error,
        autoCapitalize = "sentences",
        multiline = false,
        onBlur,
    }) => {
        const sc = useScale();
        const [focused, setFocused] = useState(false);
        const anim = useRef(new Animated.Value(0)).current;

        const onFocus = () => {
            setFocused(true);
            Animated.timing(anim, {
                toValue: 1,
                duration: 180,
                useNativeDriver: false,
            }).start();
        };
        const handleBlur = () => {
            setFocused(false);
            Animated.timing(anim, {
                toValue: 0,
                duration: 180,
                useNativeDriver: false,
            }).start();
            onBlur?.();
        };

        const borderColor = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [
                error ? C.danger : C.border,
                error ? C.danger : C.borderFocus,
            ],
        });
        const bgColor = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [
                error ? "#FEF2F2" : C.card,
                error ? "#FEF2F2" : "#F8FAFF",
            ],
        });

        return (
            <View style={{ marginBottom: sc.sp.md }}>
                {label ? (
                    <Text
                        style={{
                            fontSize: sc.f.sm,
                            fontWeight: "600",
                            color: C.textSub,
                            marginBottom: sc.sp.xs,
                            marginLeft: 2,
                        }}>
                        {label}
                    </Text>
                ) : null}
                <Animated.View
                    style={{
                        flexDirection: "row",
                        alignItems: multiline ? "flex-start" : "center",
                        borderWidth: focused ? 1.5 : 1,
                        borderColor,
                        borderRadius: sc.radius,
                        backgroundColor: bgColor,
                        paddingHorizontal: sc.sp.md,
                        paddingVertical: multiline ? sc.sp.sm : 0,
                        height: multiline ? undefined : sc.inputH,
                        minHeight: multiline ? 88 : sc.inputH,
                    }}>
                    <View
                        style={{
                            width: sc.iconBox,
                            height: sc.iconBox,
                            borderRadius: sc.iconBox / 2,
                            backgroundColor: focused ? C.primaryMid : "#F1F5F9",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: sc.sp.sm,
                            marginTop: multiline ? sc.sp.xs : 0,
                        }}>
                        <Ionicons
                            name={icon}
                            size={sc.f.md}
                            color={focused ? C.primary : C.textMuted}
                        />
                    </View>
                    <TextInput
                        style={{
                            flex: 1,
                            fontSize: sc.f.base,
                            color: C.text,
                            fontWeight: "500",
                            paddingVertical: multiline ? sc.sp.sm : 0,
                            textAlignVertical: multiline ? "top" : "center",
                        }}
                        value={value}
                        onChangeText={onChange}
                        onFocus={onFocus}
                        onBlur={handleBlur}
                        placeholder={placeholder}
                        placeholderTextColor={C.textLight}
                        keyboardType={keyboardType}
                        autoCapitalize={autoCapitalize}
                        multiline={multiline}
                        scrollEnabled={multiline}
                    />
                </Animated.View>
                {error ? (
                    <Text
                        style={{
                            fontSize: sc.f.xs,
                            color: C.danger,
                            marginTop: sc.sp.xs,
                            marginLeft: 2,
                            fontWeight: "600",
                        }}>
                        {error}
                    </Text>
                ) : null}
            </View>
        );
    },
);
Field.displayName = "Field";

// ─── Dropdown button ──────────────────────────────────────────────────────────
const DropBtn = ({ label, value, placeholder, icon, onPress, error, sc }) => (
    <View style={{ marginBottom: sc.sp.md }}>
        {label ? (
            <Text
                style={{
                    fontSize: sc.f.sm,
                    fontWeight: "600",
                    color: C.textSub,
                    marginBottom: sc.sp.xs,
                    marginLeft: 2,
                }}>
                {label}
            </Text>
        ) : null}
        <TouchableOpacity
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderWidth: 1,
                borderColor: error ? C.danger : C.border,
                borderRadius: sc.radius,
                backgroundColor: error ? "#FEF2F2" : C.card,
                paddingHorizontal: sc.sp.md,
                height: sc.inputH,
            }}
            onPress={onPress}
            activeOpacity={0.75}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                    gap: sc.sp.sm,
                }}>
                <View
                    style={{
                        width: sc.iconBox,
                        height: sc.iconBox,
                        borderRadius: sc.iconBox / 2,
                        backgroundColor: "#F1F5F9",
                        alignItems: "center",
                        justifyContent: "center",
                    }}>
                    <Ionicons name={icon} size={sc.f.md} color={C.textMuted} />
                </View>
                <Text
                    style={{
                        fontSize: sc.f.base,
                        color: value ? C.text : C.textLight,
                        fontWeight: value ? "600" : "400",
                        flex: 1,
                    }}
                    numberOfLines={1}>
                    {value || placeholder}
                </Text>
            </View>
            <Ionicons name="chevron-down" size={sc.f.md} color={C.textMuted} />
        </TouchableOpacity>
        {error ? (
            <Text
                style={{
                    fontSize: sc.f.xs,
                    color: C.danger,
                    marginTop: sc.sp.xs,
                    marginLeft: 2,
                    fontWeight: "600",
                }}>
                {error}
            </Text>
        ) : null}
    </View>
);

// ─── Section card ─────────────────────────────────────────────────────────────
const Card = ({ icon, title, children, sc }) => (
    <View
        style={{
            backgroundColor: C.card,
            borderRadius: sc.cardR,
            padding: sc.sp.lg,
            borderWidth: 1,
            borderColor: C.border,
            marginBottom: sc.sp.md,
            shadowColor: "#0F172A",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 2,
        }}>
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: sc.sp.sm,
                marginBottom: sc.sp.md,
                paddingBottom: sc.sp.sm,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
            }}>
            <View
                style={{
                    width: sc.iconBox,
                    height: sc.iconBox,
                    borderRadius: sc.iconBox / 2,
                    backgroundColor: C.primarySoft,
                    alignItems: "center",
                    justifyContent: "center",
                }}>
                <Ionicons name={icon} size={sc.f.md} color={C.primary} />
            </View>
            <Text
                style={{ fontSize: sc.f.md, fontWeight: "700", color: C.text }}>
                {title}
            </Text>
        </View>
        {children}
    </View>
);

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ visible, message, type, animValue, sc }) => {
    if (!visible) return null;
    return (
        <Animated.View
            style={{
                position: "absolute",
                top: Platform.OS === "ios" ? 56 : 40,
                alignSelf: "center",
                zIndex: 9999,
                width: "88%",
                opacity: animValue,
                transform: [
                    {
                        translateY: animValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-20, 0],
                        }),
                    },
                ],
            }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: sc.sp.md,
                    paddingHorizontal: sc.sp.lg,
                    borderRadius: sc.cardR,
                    backgroundColor: type === "success" ? C.success : C.danger,
                    gap: sc.sp.sm,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.18,
                    shadowRadius: 12,
                    elevation: 8,
                }}>
                <Ionicons
                    name={
                        type === "success" ? "checkmark-circle" : "alert-circle"
                    }
                    size={sc.f.lg}
                    color="#fff"
                />
                <Text
                    style={{
                        color: "#fff",
                        fontSize: sc.f.base,
                        fontWeight: "600",
                        flex: 1,
                    }}>
                    {message}
                </Text>
            </View>
        </Animated.View>
    );
};

// ─── Selection Modal ──────────────────────────────────────────────────────────
const SelectModal = ({
    visible,
    title,
    onClose,
    loading,
    loadingText,
    children,
    sc,
}) => (
    <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}>
        <TouchableWithoutFeedback onPress={onClose}>
            <View
                style={{
                    flex: 1,
                    backgroundColor: "rgba(15,23,42,0.55)",
                    justifyContent: "flex-end",
                }}>
                <TouchableWithoutFeedback>
                    <View
                        style={{
                            backgroundColor: "#F8FAFC",
                            borderTopLeftRadius: 24,
                            borderTopRightRadius: 24,
                            height: "76%",
                            overflow: "hidden",
                        }}>
                        {/* Handle */}
                        <View
                            style={{
                                alignItems: "center",
                                paddingTop: 12,
                                paddingBottom: 4,
                            }}>
                            <View
                                style={{
                                    width: 36,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: C.border,
                                }}
                            />
                        </View>
                        {/* Header */}
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                paddingHorizontal: sc.hPad,
                                paddingVertical: sc.sp.md,
                                borderBottomWidth: 1,
                                borderBottomColor: C.border,
                                backgroundColor: C.card,
                            }}>
                            <Text
                                style={{
                                    fontSize: sc.f.lg,
                                    fontWeight: "700",
                                    color: C.text,
                                }}>
                                {title}
                            </Text>
                            <TouchableOpacity
                                onPress={onClose}
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                    backgroundColor: "#F1F5F9",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}>
                                <Ionicons
                                    name="close"
                                    size={sc.f.lg}
                                    color={C.textSub}
                                />
                            </TouchableOpacity>
                        </View>
                        {loading ? (
                            <View
                                style={{
                                    flex: 1,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: sc.sp.md,
                                }}>
                                <ActivityIndicator
                                    size="large"
                                    color={C.primary}
                                />
                                <Text
                                    style={{
                                        color: C.textMuted,
                                        fontSize: sc.f.base,
                                    }}>
                                    {loadingText}
                                </Text>
                            </View>
                        ) : (
                            <ScrollView
                                style={{ flex: 1 }}
                                contentContainerStyle={{
                                    padding: sc.hPad,
                                    paddingBottom: 32,
                                }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled">
                                {children}
                            </ScrollView>
                        )}
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </TouchableWithoutFeedback>
    </Modal>
);

// ─── Inline create row ────────────────────────────────────────────────────────
const InlineCreate = ({
    label,
    value,
    onChange,
    onAdd,
    loading,
    placeholder,
    sc,
}) => (
    <View
        style={{
            backgroundColor: C.card,
            borderRadius: sc.radius,
            padding: sc.sp.md,
            marginBottom: sc.sp.lg,
            borderWidth: 1,
            borderColor: C.border,
        }}>
        <Text
            style={{
                fontSize: sc.f.sm,
                fontWeight: "700",
                color: C.textSub,
                marginBottom: sc.sp.sm,
            }}>
            {label}
        </Text>
        <View style={{ flexDirection: "row", gap: sc.sp.sm }}>
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={C.textLight}
                style={{
                    flex: 1,
                    fontSize: sc.f.base,
                    color: C.text,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: sc.radius,
                    paddingHorizontal: sc.sp.md,
                    height: 40,
                }}
            />
            <TouchableOpacity
                onPress={onAdd}
                disabled={loading}
                style={{
                    backgroundColor: C.primary,
                    paddingHorizontal: sc.sp.lg,
                    borderRadius: sc.radius,
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 60,
                    height: 40,
                }}>
                {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                ) : (
                    <Text
                        style={{
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: sc.f.sm,
                        }}>
                        Add
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    </View>
);

// ─── Choice card (source/product/staff grid) ──────────────────────────────────
const ChoiceCard = ({ label, sublabel, icon, active, onPress, sc }) => (
    <TouchableOpacity
        onPress={onPress}
        style={{
            width: "48%",
            backgroundColor: active ? C.primary : C.card,
            borderRadius: sc.radius,
            padding: sc.sp.md,
            borderWidth: 1.5,
            borderColor: active ? C.primary : C.border,
            gap: sc.sp.xs,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 4,
            elevation: 1,
        }}
        activeOpacity={0.8}>
        <View
            style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: active
                    ? "rgba(255,255,255,0.2)"
                    : C.primarySoft,
                alignItems: "center",
                justifyContent: "center",
            }}>
            <Ionicons
                name={active ? "checkmark-circle" : icon || "ellipse-outline"}
                size={sc.f.lg}
                color={active ? "#fff" : C.primary}
            />
        </View>
        <Text
            style={{
                fontSize: sc.f.sm,
                fontWeight: "700",
                color: active ? "#fff" : C.text,
            }}
            numberOfLines={1}>
            {label}
        </Text>
        {sublabel ? (
            <Text
                style={{
                    fontSize: sc.f.xs,
                    color: active ? "rgba(255,255,255,0.8)" : C.textMuted,
                }}
                numberOfLines={1}>
                {sublabel}
            </Text>
        ) : null}
    </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AddEnquiryScreen({ route, navigation }) {
    const insets = useSafeAreaInsets();
    const sc = useScale();
    const { user } = useAuth();
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";

    const editingEnquiry = route?.params?.enquiry;
    const isEditMode = !!editingEnquiry;

    // Form
    const [form, setForm] = useState({
        enqType: "Normal",
        source: "",
        name: "",
        mobile: "",
        email: "",
        address: "",
        product: "",
        cost: "",
        image: null,
        assignedTo: "",
    });
    const [pickedImageFile, setPickedImageFile] = useState(null);
    const [errors, setErrors] = useState({});

    // Data
    const [leadSources, setLeadSources] = useState([]);
    const [products, setProducts] = useState([]);
    const [staffList, setStaffList] = useState([]);

    // Loading
    const [loading, setLoading] = useState(false);
    const [loadingSources, setLoadingSources] = useState(false);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingStaff, setLoadingStaff] = useState(false);
    const [creatingProduct, setCreatingProduct] = useState(false);
    const [creatingLeadSource, setCreatingLeadSource] = useState(false);
    const [addressLoading, setAddressLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

    // New inputs
    const [newProductName, setNewProductName] = useState("");
    const [newLeadSourceName, setNewLeadSourceName] = useState("");

    // Modals
    const [showProductModal, setShowProductModal] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Address autocomplete
    const [addressPredictions, setAddressPredictions] = useState([]);
    const [showAddressDropdown, setShowAddressDropdown] = useState(false);

    // Toast
    const [toastMsg, setToastMsg] = useState("");
    const [toastType, setToastType] = useState("success");
    const [toastVisible, setToastVisible] = useState(false);
    const toastAnim = useRef(new Animated.Value(0)).current;
    const toastTimer = useRef(null);

    // Refs
    const addressDebounce = useRef(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const confettiRef = useRef(null);
    const scrollRef = useRef(null);
    const currentUserId = String(user?.id || user?._id || "");
    const assignableTeam = useMemo(() => {
        if (isStaffUser) return [];
        const seen = new Set();
        return (staffList || [])
            .filter((member) => {
                const id = String(member?._id || "");
                if (!id || id === currentUserId) return false;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((a, b) => {
                const roleA = String(a?.role || "").toLowerCase();
                const roleB = String(b?.role || "").toLowerCase();
                if (roleA !== roleB) return roleA === "admin" ? -1 : 1;
                return String(a?.name || "").localeCompare(
                    String(b?.name || ""),
                );
            });
    }, [currentUserId, isStaffUser, staffList]);
    const adminLabelMap = useMemo(() => {
        const admins = [...staffList]
            .filter(
                (member) =>
                    String(member?.role || "").toLowerCase() === "admin",
            )
            .sort(
                (a, b) =>
                    new Date(a?.createdAt || 0).getTime() -
                    new Date(b?.createdAt || 0).getTime(),
            );

        return admins.reduce((acc, member, index) => {
            acc[String(member?._id || "")] = getOrdinalAdminLabel(index + 1);
            return acc;
        }, {});
    }, [staffList]);

    // ── Init ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        notificationService.initializeNotifications();
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, []);

    useEffect(() => {
        const fetch = async (fn, setter, setLoading_) => {
            setLoading_(true);
            try {
                const d = await fn();
                setter(Array.isArray(d) ? d : []);
            } catch (_error) {
                setter([]);
            } finally {
                setLoading_(false);
            }
        };
        fetch(
            leadSourceService.getAllLeadSources,
            setLeadSources,
            setLoadingSources,
        );
        if (!isStaffUser) {
            fetch(staffService.getAllStaff, setStaffList, setLoadingStaff);
        } else {
            setStaffList([]);
            setLoadingStaff(false);
        }
        fetch(productService.getAllProducts, setProducts, setLoadingProducts);
    }, [isStaffUser]);

    useEffect(() => {
        if (isStaffUser) {
            setForm((prev) => ({ ...prev, assignedTo: "" }));
        }
    }, [isStaffUser]);

    useEffect(() => {
        if (isEditMode && editingEnquiry) {
            setForm((prev) => ({
                ...prev,
                enqType: editingEnquiry.enqType || prev.enqType,
                source: editingEnquiry.source || "",
                name: editingEnquiry.name || "",
                mobile: editingEnquiry.mobile || "",
                email: editingEnquiry.email || "",
                address: editingEnquiry.address || "",
                product: editingEnquiry.product || "",
                cost: editingEnquiry.cost ? String(editingEnquiry.cost) : "",
                image: editingEnquiry.image || null,
                assignedTo: isStaffUser
                    ? ""
                    : editingEnquiry.assignedTo?._id ||
                    editingEnquiry.assignedTo?.id ||
                    editingEnquiry.assignedTo ||
                    "",
            }));
            setPickedImageFile(null);
        }
    }, [editingEnquiry, isEditMode, isStaffUser]);

    // ── Form helpers ──────────────────────────────────────────────────────────
    const set = (field, value) => {
        setForm((p) => ({ ...p, [field]: value }));
        if (errors[field]) setErrors((p) => ({ ...p, [field]: null }));
    };

    const closeAll = () => {
        setShowProductModal(false);
        setShowSourceModal(false);
        setShowStaffModal(false);
        setShowAddressDropdown(false);
        Keyboard.dismiss();
    };

    const toast = useCallback(
        (msg, type = "success") => {
            if (toastTimer.current) clearTimeout(toastTimer.current);
            setToastMsg(msg);
            setToastType(type);
            setToastVisible(true);
            Animated.spring(toastAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 60,
                friction: 10,
            }).start();
            toastTimer.current = setTimeout(() => {
                Animated.timing(toastAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }).start(() => setToastVisible(false));
            }, 2800);
        },
        [toastAnim],
    );

    // ── Address: typing-based autocomplete ───────────────────────────────────
    const handleAddressChange = (text) => {
        set("address", text);
        if (addressDebounce.current) clearTimeout(addressDebounce.current);
        if (text.trim().length >= 3) {
            setAddressLoading(true);
            addressDebounce.current = setTimeout(async () => {
                try {
                    const preds =
                        await addressService.getAddressPredictions(text);
                    setAddressPredictions(preds || []);
                    setShowAddressDropdown(true);
                } catch (e) {
                    setAddressPredictions([]);
                } finally {
                    setAddressLoading(false);
                }
            }, 350);
        } else {
            setAddressPredictions([]);
            setShowAddressDropdown(false);
            setAddressLoading(false);
        }
    };

    const handleAddressSelect = async (prediction) => {
        setShowAddressDropdown(false);
        setAddressLoading(true);
        try {
            const details = await addressService.getPlaceDetails(
                prediction.placeId,
            );
            set("address", details?.address || prediction.fullAddress);
        } catch {
            set("address", prediction.fullAddress);
        } finally {
            setAddressLoading(false);
        }
    };

    // ── Address: real-time GPS → reverse geocode → auto-fill ─────────────────
    const handleGetLocation = async () => {
        setLocationLoading(true);
        setShowAddressDropdown(false);
        try {
            // 1. Permission
            const { status } =
                await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                toast(
                    "Location permission denied. Enable it in Settings.",
                    "error",
                );
                return;
            }

            // 2. Get GPS — try high accuracy, fall back to balanced
            let pos = null;
            try {
                pos = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                    timeInterval: 0,
                    distanceInterval: 0,
                });
            } catch {
                pos = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                });
            }

            const { latitude, longitude } = pos.coords;

            // 3. Reverse geocode — try backend first, then expo built-in
            let address = null;

            try {
                const result = await addressService.reverseGeocode(
                    latitude,
                    longitude,
                );
                if (
                    result &&
                    typeof result === "string" &&
                    result.trim().length > 4
                ) {
                    address = result.trim();
                }
            } catch {
                /* backend failed, use expo fallback */
            }

            if (!address) {
                // expo-location built-in reverse geocode (no API key needed)
                const results = await Location.reverseGeocodeAsync({
                    latitude,
                    longitude,
                });
                if (results && results.length > 0) {
                    const g = results[0];
                    // Build readable address from all available parts
                    const parts = [
                        g.name,
                        g.streetNumber && g.street
                            ? `${g.streetNumber} ${g.street}`
                            : g.street || g.streetNumber,
                        g.subregion || g.district,
                        g.city || g.subregion,
                        g.region,
                        g.postalCode,
                        g.country,
                    ]
                        .map((p) => (p || "").trim())
                        .filter((p) => p.length > 0)
                        // remove duplicates
                        .filter((p, i, arr) => arr.indexOf(p) === i);
                    if (parts.length > 0) address = parts.join(", ");
                }
            }

            if (address && address.length > 4) {
                set("address", address);
                toast("Location auto-filled!", "success");
            } else {
                toast(
                    "GPS found you but address is unavailable. Type manually.",
                    "error",
                );
            }
        } catch (e) {
            toast("Could not access GPS. Type your address below.", "error");
        } finally {
            setLocationLoading(false);
        }
    };

    // ── Image ─────────────────────────────────────────────────────────────────
    const pickImage = async () => {
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                aspect: [1, 1],
                // Performance: don't embed base64 into JSON (very large payload in production).
                // We'll upload the file `uri` using multipart/form-data on submit.
                quality: 0.6,
                base64: false,
            });
            if (!res.canceled) {
                const asset = res.assets?.[0] || null;
                set("image", asset?.uri || null);
                if (Platform.OS === "web") {
                    setPickedImageFile(asset?.file || null);
                } else {
                    setPickedImageFile(null);
                }
            }
        } catch {
            toast("Failed to pick image", "error");
        }
    };

    // ── Validation ────────────────────────────────────────────────────────────
    const validate = () => {
        const e = {};
        if (!isEditMode) {
            if (!form.name?.trim()) e.name = "Name is required";
            if (!form.mobile?.trim()) e.mobile = "Mobile is required";
            if (!form.product?.trim()) e.product = "Product is required";
            if (!form.cost || Number(form.cost) <= 0)
                e.cost = "Cost is required";
        }
        if (form.mobile?.trim() && form.mobile.trim().length !== 10) {
            e.mobile = "Mobile must be 10 digits";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!validate()) return;
        closeAll();
        setLoading(true);
        try {
            const body = {
                ...form,
                assignedTo: isStaffUser ? null : form.assignedTo || null,
                cost: form.cost ? Number(form.cost) : undefined,
                date: isEditMode
                    ? form.date || undefined
                    : form.date || toLocalIsoDate(new Date()),
                tzOffsetMinutes: new Date().getTimezoneOffset(),
            };

            const client = await getApiClient();
            const imageValue = form.image;
            const isBlobUrl =
                typeof imageValue === "string" &&
                imageValue.startsWith("blob:");
            const isLocalFile =
                typeof imageValue === "string" &&
                (imageValue.startsWith("file://") ||
                    imageValue.startsWith("content://") ||
                    isBlobUrl);

            let data = null;
            if (isLocalFile) {
                const fd = new FormData();
                Object.entries(body).forEach(([k, v]) => {
                    if (v === undefined) return;
                    if (k === "image") return;
                    fd.append(k, v == null ? "" : String(v));
                });
                if (Platform.OS === "web" && isBlobUrl) {
                    if (
                        typeof File !== "undefined" &&
                        pickedImageFile instanceof File
                    ) {
                        fd.append(
                            "image",
                            pickedImageFile,
                            pickedImageFile.name || "enquiry.jpg",
                        );
                    } else {
                        const blobResp = await fetch(imageValue);
                        const blobFile = await blobResp.blob();
                        const ext =
                            String(blobFile?.type || "")
                                .split("/")
                                .pop() || "jpg";
                        fd.append("image", blobFile, `enquiry.${ext}`);
                    }
                } else {
                    // React Native: Send image with proper metadata
                    fd.append("image", {
                        uri: imageValue,
                        name: "enquiry.jpg",
                        type: "image/jpeg",
                    });
                }

                console.log("� Uploading enquiry with FormData", {
                    imageValue,
                    isLocalFile,
                    platform: Platform.OS,
                    bodyKeys: Object.keys(body),
                    note: "Image sent via multipart/form-data (preferred for blob/file URIs)",
                });

                // 🔴 CRITICAL: Do NOT set explicit Content-Type header
                // Let axios/platform set it with proper boundary
                // ✅ Use fetch for mobile FormData — axios fails with ERR_NETWORK
                const token = await getAuthToken();
                const uploadUrl = isEditMode
                    ? `${API_URL}/enquiries/${editingEnquiry._id}`
                    : `${API_URL}/enquiries`;
                const fetchResp = await fetch(uploadUrl, {
                    method: isEditMode ? "PUT" : "POST",
                    headers: {
                        // ✅ No Content-Type — let fetch set boundary automatically
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: fd,
                });
                if (!fetchResp.ok) {
                    const errData = await fetchResp.json().catch(() => ({}));
                    throw new Error(
                        errData?.message ||
                        `Upload failed: ${fetchResp.status}`,
                    );
                }
                data = await fetchResp.json();
            } else {
                const payload = { ...body };
                // 📷 Clean image field: remove if null, empty string, or invalid object
                if (
                    !payload.image ||
                    (typeof payload.image === "object" &&
                        Object.keys(payload.image).length === 0) ||
                    (typeof payload.image === "string" &&
                        (payload.image.startsWith("file://") ||
                            payload.image.startsWith("content://") ||
                            payload.image.startsWith("blob:")))
                ) {
                    delete payload.image;
                }
                const token = await getAuthToken();
                const uploadUrl = isEditMode
                    ? `${API_URL}/enquiries/${editingEnquiry._id}`
                    : `${API_URL}/enquiries`;
                const fetchResp = await fetch(uploadUrl, {
                    method: isEditMode ? "PUT" : "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(payload),
                });
                if (!fetchResp.ok) {
                    const errData = await fetchResp.json().catch(() => ({}));
                    throw new Error(
                        errData?.message ||
                        `Upload failed: ${fetchResp.status}`,
                    );
                }
                data = await fetchResp.json();
            }

            if (data) {
                console.log("Enquiry upload result:", {
                    inputImage: imageValue,
                    savedImage: data.image,
                    returnedData: data,
                });
                if (!isEditMode) confettiRef.current?.play?.();
                await notificationService.showEnquirySuccessNotification({
                    name: form.name,
                    source: form.source,
                    product: form.product,
                });
                setTimeout(() => {
                    if (!isEditMode)
                        setForm({
                            enqType: "Normal",
                            source: "",
                            name: "",
                            mobile: "",
                            email: "",
                            address: "",
                            product: "",
                            cost: "",
                            image: null,
                            assignedTo: "",
                        });
                    setPickedImageFile(null);
                    if (isEditMode) emitEnquiryUpdated(data);
                    else emitEnquiryCreated(data);
                    setTimeout(() => navigation.goBack(), 800);
                }, 300);
            } else {
                const msg = isEditMode
                    ? "Failed to update"
                    : "Failed to create enquiry";
                await notificationService.showEnquiryErrorNotification(msg);
                toast(msg, "error");
            }
        } catch (e) {
            toast(e.message || "Network error. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };

    // ── Inline create helpers ─────────────────────────────────────────────────
    const createProduct = async () => {
        if (!newProductName.trim()) {
            Alert.alert("Error", "Product name required");
            return;
        }
        try {
            setCreatingProduct(true);
            const created = await productService.createProduct({
                name: newProductName.trim(),
                items: [{ name: newProductName.trim() }],
            });
            const list = await productService.getAllProducts();
            setProducts(Array.isArray(list) ? list : []);
            set("product", created.name || newProductName.trim());
            setNewProductName("");
            setShowProductModal(false);
            toast("Product added!");
        } catch (e) {
            const msg =
                e?.response?.data?.error ||
                e?.response?.data?.message ||
                e?.message ||
                "Failed to create product";
            if (/already exists/i.test(String(msg))) {
                Alert.alert(
                    "Product already exists",
                    "This product name already exists.",
                );
                return;
            }
            Alert.alert("Error", msg);
        } finally {
            setCreatingProduct(false);
        }
    };

    const createLeadSource = async () => {
        const name = newLeadSourceName.trim();
        if (!name) {
            Alert.alert("Error", "Lead source name required");
            return;
        }
        try {
            setCreatingLeadSource(true);
            const created = await leadSourceService.createLeadSource({ name });
            const obj = created?.name
                ? created
                : { _id: Date.now().toString(), name };
            setLeadSources((p) =>
                p.some((i) => i.name?.toLowerCase() === name.toLowerCase())
                    ? p
                    : [obj, ...p],
            );
            set("source", obj.name || name);
            setNewLeadSourceName("");
            setShowSourceModal(false);
            toast("Lead source added!");
        } catch (e) {
            Alert.alert(
                "Error",
                e.response?.data?.message || "Failed to create lead source",
            );
        } finally {
            setCreatingLeadSource(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle="dark-content" backgroundColor={C.navBg} />
            <ConfettiBurst ref={confettiRef} topOffset={0} />

            {/* Nav bar */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: sc.hPad,
                    paddingVertical: sc.sp.sm,
                    backgroundColor: C.navBg,
                    borderBottomWidth: 1,
                    borderBottomColor: C.border,
                }}>
                <TouchableOpacity
                    onPress={() => {
                        closeAll();
                        navigation.goBack();
                    }}
                    style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: "#F1F5F9",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: C.border,
                    }}
                    activeOpacity={0.8}>
                    <Ionicons
                        name={
                            Platform.OS === "ios"
                                ? "chevron-back"
                                : "arrow-back"
                        }
                        size={sc.f.lg}
                        color={C.text}
                    />
                </TouchableOpacity>
                <Text
                    style={{
                        fontSize: sc.f.lg,
                        fontWeight: "800",
                        color: C.text,
                    }}>
                    {isEditMode ? "Edit Enquiry" : "New Enquiry"}
                </Text>
                <View style={{ width: 38 }} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <TouchableWithoutFeedback onPress={closeAll}>
                    <ScrollView
                        ref={scrollRef}
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                            paddingHorizontal: sc.hPad,
                            paddingTop: sc.sp.md,
                            paddingBottom: 100,
                        }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled">
                        <Animated.View
                            style={{ opacity: fadeAnim, gap: sc.sp.sm }}>
                            {/* Hero strip */}
                            <LinearGradient
                                colors={C.gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={{
                                    borderRadius: sc.cardR,
                                    padding: sc.sp.lg,
                                    marginBottom: sc.sp.xs,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}>
                                <View style={{ gap: 2 }}>
                                    <Text
                                        style={{
                                            color: "rgba(255,255,255,0.75)",
                                            fontSize: sc.f.xs,
                                            fontWeight: "700",
                                            letterSpacing: 0.8,
                                            textTransform: "uppercase",
                                        }}>
                                        Lead Form
                                    </Text>
                                    <Text
                                        style={{
                                            color: "#fff",
                                            fontSize: sc.f.xl,
                                            fontWeight: "900",
                                            letterSpacing: -0.3,
                                        }}>
                                        {isEditMode
                                            ? "Update Lead"
                                            : "Create Lead"}
                                    </Text>
                                </View>
                                <View
                                    style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 22,
                                        backgroundColor:
                                            "rgba(255,255,255,0.15)",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderWidth: 1,
                                        borderColor: "rgba(255,255,255,0.25)",
                                    }}>
                                    <Ionicons
                                        name="sparkles"
                                        size={sc.f.xl}
                                        color="#fff"
                                    />
                                </View>
                            </LinearGradient>

                            {/* 1. Lead Setup */}
                            <Card
                                icon="pricetags-outline"
                                title="Lead Setup"
                                sc={sc}>
                                {/* Priority */}
                                <View style={{ marginBottom: sc.sp.md }}>
                                    <Text
                                        style={{
                                            fontSize: sc.f.sm,
                                            fontWeight: "600",
                                            color: C.textSub,
                                            marginBottom: sc.sp.xs,
                                            marginLeft: 2,
                                        }}>
                                        Priority Level
                                    </Text>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            gap: sc.sp.sm,
                                        }}>
                                        {["High", "Medium", "Normal"].map(
                                            (p) => {
                                                const active =
                                                    form.enqType === p;
                                                const col =
                                                    p === "High"
                                                        ? C.danger
                                                        : p === "Medium"
                                                            ? C.warning
                                                            : C.primary;
                                                return (
                                                    <TouchableOpacity
                                                        key={p}
                                                        onPress={() => {
                                                            set("enqType", p);
                                                            closeAll();
                                                        }}
                                                        style={{
                                                            flex: 1,
                                                            paddingVertical:
                                                                sc.sp.sm,
                                                            borderRadius:
                                                                sc.radius,
                                                            borderWidth: 1.5,
                                                            borderColor: active
                                                                ? col
                                                                : C.border,
                                                            backgroundColor:
                                                                active
                                                                    ? col + "14"
                                                                    : C.card,
                                                            alignItems:
                                                                "center",
                                                            gap: 4,
                                                        }}
                                                        activeOpacity={0.8}>
                                                        <View
                                                            style={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: 4,
                                                                backgroundColor:
                                                                    active
                                                                        ? col
                                                                        : C.border,
                                                            }}
                                                        />
                                                        <Text
                                                            style={{
                                                                fontSize:
                                                                    sc.f.sm,
                                                                fontWeight:
                                                                    active
                                                                        ? "700"
                                                                        : "500",
                                                                color: active
                                                                    ? col
                                                                    : C.textMuted,
                                                            }}>
                                                            {p}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            },
                                        )}
                                    </View>
                                </View>

                                <DropBtn
                                    label="Lead Source"
                                    value={form.source}
                                    placeholder="Select Source"
                                    icon="share-social-outline"
                                    onPress={() => setShowSourceModal(true)}
                                    sc={sc}
                                />
                                {!isStaffUser && assignableTeam.length > 0 && (
                                    <DropBtn
                                        label="Assign To"
                                        value={
                                            form.assignedTo
                                                ? assignableTeam.find(
                                                    (s) =>
                                                        s._id ===
                                                        form.assignedTo,
                                                )?.name || "Unknown"
                                                : ""
                                        }
                                        placeholder="Me (Auto-assign)"
                                        icon="person-add-outline"
                                        onPress={() => setShowStaffModal(true)}
                                        sc={sc}
                                    />
                                )}
                                {isStaffUser && (
                                    <DropBtn
                                        label="Assign To"
                                        value={user?.name || "You"}
                                        placeholder="Assigned to you"
                                        icon="person-add-outline"
                                        onPress={() => { }}
                                        sc={sc}
                                    />
                                )}
                            </Card>

                            {/* 2. Contact */}
                            <Card icon="person-outline" title="Contact" sc={sc}>
                                <Field
                                    label="Full Name *"
                                    value={form.name}
                                    onChange={(t) => set("name", t)}
                                    placeholder="Customer full name"
                                    icon="person-outline"
                                    error={errors.name}
                                />
                                <Field
                                    label="Mobile Number *"
                                    value={form.mobile}
                                    onChange={(t) => set("mobile", t)}
                                    placeholder="10-digit number"
                                    icon="call-outline"
                                    keyboardType="phone-pad"
                                    error={errors.mobile}
                                />
                                <Field
                                    label="Email"
                                    value={form.email}
                                    onChange={(t) => set("email", t)}
                                    placeholder="Optional email"
                                    icon="mail-outline"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </Card>

                            {/* 3. Requirement */}
                            <Card
                                icon="cart-outline"
                                title="Requirement"
                                sc={sc}>
                                <DropBtn
                                    label="Product / Service *"
                                    value={form.product}
                                    placeholder="Select Product"
                                    icon="cube-outline"
                                    onPress={() => setShowProductModal(true)}
                                    error={errors.product}
                                    sc={sc}
                                />
                                <Field
                                    label="Estimated Value (₹)"
                                    value={form.cost}
                                    onChange={(t) => set("cost", t)}
                                    placeholder="0.00"
                                    icon="cash-outline"
                                    keyboardType="decimal-pad"
                                />
                            </Card>

                            {/* 4. Location & Address */}
                            <Card
                                icon="location-outline"
                                title="Location & Address"
                                sc={sc}>
                                {/* Address text input with GPS icon on right side */}
                                <View style={{ marginBottom: sc.sp.xs }}>
                                    <Text
                                        style={{
                                            fontSize: sc.f.sm,
                                            fontWeight: "600",
                                            color: C.textSub,
                                            marginBottom: sc.sp.xs,
                                            marginLeft: 2,
                                        }}>
                                        Address
                                    </Text>

                                    {/* Input row */}
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "flex-start",
                                            borderWidth: 1.5,
                                            borderColor: C.border,
                                            borderRadius: sc.radius,
                                            backgroundColor: C.card,
                                            paddingLeft: sc.sp.md,
                                            paddingRight: 6,
                                            paddingVertical: sc.sp.sm,
                                            minHeight: sc.inputH + 16,
                                        }}>
                                        {/* Left map icon */}
                                        <View
                                            style={{
                                                width: sc.iconBox,
                                                height: sc.iconBox,
                                                borderRadius: sc.iconBox / 2,
                                                backgroundColor: "#F1F5F9",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                marginRight: sc.sp.sm,
                                                marginTop: 2,
                                            }}>
                                            {addressLoading ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={C.primary}
                                                />
                                            ) : (
                                                <Ionicons
                                                    name="map-outline"
                                                    size={sc.f.md}
                                                    color={C.textMuted}
                                                />
                                            )}
                                        </View>

                                        {/* Text input */}
                                        <TextInput
                                            style={{
                                                flex: 1,
                                                fontSize: sc.f.base,
                                                color: C.text,
                                                fontWeight: "500",
                                                paddingVertical: 4,
                                                textAlignVertical: "top",
                                                paddingRight: 4,
                                            }}
                                            value={form.address}
                                            onChangeText={handleAddressChange}
                                            placeholder="Type address, city or pincode…"
                                            placeholderTextColor={C.textLight}
                                            multiline
                                            autoCapitalize="sentences"
                                        />

                                        {/* GPS locate button — right side, inside input */}
                                        <TouchableOpacity
                                            onPress={handleGetLocation}
                                            disabled={locationLoading}
                                            activeOpacity={0.8}
                                            style={{
                                                width: 42,
                                                height: 42,
                                                borderRadius: 12,
                                                backgroundColor: locationLoading
                                                    ? C.primarySoft
                                                    : C.primary,
                                                alignItems: "center",
                                                justifyContent: "center",
                                                alignSelf: "flex-start",
                                                marginTop: 1,
                                                marginLeft: 4,
                                                borderWidth: 1,
                                                borderColor: locationLoading
                                                    ? C.primary + "40"
                                                    : C.primary,
                                                shadowColor: C.primary,
                                                shadowOffset: {
                                                    width: 0,
                                                    height: 3,
                                                },
                                                shadowOpacity: 0.3,
                                                shadowRadius: 6,
                                                elevation: 4,
                                            }}>
                                            {locationLoading ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={C.primary}
                                                />
                                            ) : (
                                                <Ionicons
                                                    name="locate"
                                                    size={sc.f.lg}
                                                    color="#fff"
                                                />
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    {/* Helper text below input */}
                                    <Text
                                        style={{
                                            fontSize: sc.f.xs,
                                            color: C.textMuted,
                                            marginTop: sc.sp.xs,
                                            marginLeft: 2,
                                        }}>
                                        Tap{" "}
                                        <Ionicons
                                            name="locate"
                                            size={10}
                                            color={C.textMuted}
                                        />{" "}
                                        to auto-fill from GPS
                                    </Text>

                                    {/* Autocomplete dropdown */}
                                    {showAddressDropdown &&
                                        addressPredictions.length > 0 && (
                                            <View
                                                style={{
                                                    backgroundColor: C.card,
                                                    borderRadius: sc.radius,
                                                    marginTop: sc.sp.xs,
                                                    borderWidth: 1,
                                                    borderColor: C.border,
                                                    overflow: "hidden",
                                                    shadowColor: "#000",
                                                    shadowOffset: {
                                                        width: 0,
                                                        height: 4,
                                                    },
                                                    shadowOpacity: 0.08,
                                                    shadowRadius: 12,
                                                    elevation: 6,
                                                }}>
                                                {addressPredictions.map(
                                                    (pred, i) => (
                                                        <TouchableOpacity
                                                            key={
                                                                pred.placeId ||
                                                                i
                                                            }
                                                            onPress={() =>
                                                                handleAddressSelect(
                                                                    pred,
                                                                )
                                                            }
                                                            style={{
                                                                flexDirection:
                                                                    "row",
                                                                alignItems:
                                                                    "flex-start",
                                                                paddingHorizontal:
                                                                    sc.sp.md,
                                                                paddingVertical:
                                                                    sc.sp.sm,
                                                                borderBottomWidth:
                                                                    i <
                                                                        addressPredictions.length -
                                                                        1
                                                                        ? 1
                                                                        : 0,
                                                                borderBottomColor:
                                                                    "#F8FAFC",
                                                                gap: sc.sp.sm,
                                                            }}
                                                            activeOpacity={0.7}>
                                                            <View
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    borderRadius: 14,
                                                                    backgroundColor:
                                                                        C.primarySoft,
                                                                    alignItems:
                                                                        "center",
                                                                    justifyContent:
                                                                        "center",
                                                                    marginTop: 2,
                                                                    flexShrink: 0,
                                                                }}>
                                                                <Ionicons
                                                                    name="location-sharp"
                                                                    size={
                                                                        sc.f.sm
                                                                    }
                                                                    color={
                                                                        C.primary
                                                                    }
                                                                />
                                                            </View>
                                                            <View
                                                                style={{
                                                                    flex: 1,
                                                                }}>
                                                                <Text
                                                                    style={{
                                                                        fontSize:
                                                                            sc.f
                                                                                .sm,
                                                                        fontWeight:
                                                                            "600",
                                                                        color: C.text,
                                                                    }}
                                                                    numberOfLines={
                                                                        1
                                                                    }>
                                                                    {
                                                                        pred.mainText
                                                                    }
                                                                </Text>
                                                                <Text
                                                                    style={{
                                                                        fontSize:
                                                                            sc.f
                                                                                .xs,
                                                                        color: C.textMuted,
                                                                        marginTop: 1,
                                                                    }}
                                                                    numberOfLines={
                                                                        1
                                                                    }>
                                                                    {
                                                                        pred.secondaryText
                                                                    }
                                                                </Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ),
                                                )}
                                            </View>
                                        )}
                                </View>

                                {/* Photo upload */}
                                <View
                                    style={{
                                        alignItems: "center",
                                        marginTop: sc.sp.lg,
                                    }}>
                                    <TouchableOpacity
                                        onPress={pickImage}
                                        activeOpacity={0.85}
                                        style={{ position: "relative" }}>
                                        <View
                                            style={{
                                                width: 80,
                                                height: 80,
                                                borderRadius: 40,
                                                borderWidth: 2,
                                                borderColor: C.primary,
                                                borderStyle: "dashed",
                                                backgroundColor: "#F8FAFF",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                overflow: "hidden",
                                            }}>
                                            {form.image ? (
                                                <Image
                                                    source={{
                                                        uri: getImageUrl(
                                                            form.image,
                                                        ),
                                                    }}
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                    }}
                                                />
                                            ) : (
                                                <View
                                                    style={{
                                                        alignItems: "center",
                                                        gap: 4,
                                                    }}>
                                                    <Ionicons
                                                        name="camera-outline"
                                                        size={sc.f.xl}
                                                        color={C.primary}
                                                    />
                                                    <Text
                                                        style={{
                                                            fontSize: sc.f.xs,
                                                            color: C.primary,
                                                            fontWeight: "600",
                                                        }}>
                                                        Add Photo
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                        <View
                                            style={{
                                                position: "absolute",
                                                bottom: 0,
                                                right: 0,
                                                width: 24,
                                                height: 24,
                                                borderRadius: 12,
                                                backgroundColor: C.primary,
                                                alignItems: "center",
                                                justifyContent: "center",
                                                borderWidth: 2,
                                                borderColor: C.card,
                                            }}>
                                            <Ionicons
                                                name="pencil"
                                                size={10}
                                                color="#fff"
                                            />
                                        </View>
                                    </TouchableOpacity>
                                    <Text
                                        style={{
                                            fontSize: sc.f.xs,
                                            color: C.textMuted,
                                            marginTop: sc.sp.xs,
                                        }}>
                                        Tap to add site photo
                                    </Text>
                                </View>
                            </Card>
                        </Animated.View>
                    </ScrollView>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>

            {/* Footer submit */}
            <View
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: C.card,
                    paddingHorizontal: sc.hPad,
                    paddingTop: sc.sp.sm,
                    paddingBottom: Math.max(insets.bottom, sc.sp.md) + 4,
                    borderTopWidth: 1,
                    borderTopColor: C.border,
                }}>
                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                    style={{
                        borderRadius: sc.cardR,
                        overflow: "hidden",
                        opacity: loading ? 0.75 : 1,
                    }}>
                    <LinearGradient
                        colors={C.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingVertical: sc.sp.md,
                            gap: sc.sp.sm,
                        }}>
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Text
                                    style={{
                                        color: "#fff",
                                        fontSize: sc.f.md,
                                        fontWeight: "800",
                                        letterSpacing: 0.3,
                                    }}>
                                    {isEditMode
                                        ? "Update Enquiry"
                                        : "Create Enquiry"}
                                </Text>
                                <View
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 14,
                                        backgroundColor:
                                            "rgba(255,255,255,0.2)",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={sc.f.md}
                                        color="#fff"
                                    />
                                </View>
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* ── Modals ── */}

            {/* Lead Source */}
            <SelectModal
                visible={showSourceModal}
                title="Select Lead Source"
                onClose={() => setShowSourceModal(false)}
                loading={loadingSources}
                loadingText="Loading sources…"
                sc={sc}>
                <InlineCreate
                    label="Add New Lead Source"
                    value={newLeadSourceName}
                    onChange={setNewLeadSourceName}
                    onAdd={createLeadSource}
                    loading={creatingLeadSource}
                    placeholder="e.g. Instagram"
                    sc={sc}
                />
                <View
                    style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: sc.sp.sm,
                    }}>
                    {leadSources.map((src) => (
                        <ChoiceCard
                            key={src._id || src.name}
                            label={src.name}
                            icon="share-social-outline"
                            active={form.source === src.name}
                            onPress={() => {
                                set("source", src.name);
                                setShowSourceModal(false);
                                Keyboard.dismiss();
                            }}
                            sc={sc}
                        />
                    ))}
                </View>
            </SelectModal>

            {/* Product */}
            <SelectModal
                visible={showProductModal}
                title="Select Product"
                onClose={() => setShowProductModal(false)}
                loading={loadingProducts}
                loadingText="Loading products…"
                sc={sc}>
                <InlineCreate
                    label="Add New Product"
                    value={newProductName}
                    onChange={setNewProductName}
                    onAdd={createProduct}
                    loading={creatingProduct}
                    placeholder="Product name"
                    sc={sc}
                />
                <View
                    style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: sc.sp.sm,
                    }}>
                    {products.map((prod) => (
                        <ChoiceCard
                            key={prod._id}
                            label={prod.name}
                            sublabel={`${(prod.items || []).length} item${(prod.items || []).length !== 1 ? "s" : ""}`}
                            icon="cube-outline"
                            active={form.product === prod.name}
                            onPress={() => {
                                set("product", prod.name);
                                setShowProductModal(false);
                                Keyboard.dismiss();
                            }}
                            sc={sc}
                        />
                    ))}
                </View>
            </SelectModal>

            {/* Staff */}
            <SelectModal
                visible={showStaffModal}
                title="Assign to Team"
                onClose={() => setShowStaffModal(false)}
                loading={loadingStaff}
                loadingText="Loading team…"
                sc={sc}>
                <View
                    style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: sc.sp.sm,
                    }}>
                    <ChoiceCard
                        label="Me (Auto-assign)"
                        sublabel="Assign to yourself"
                        icon="person-outline"
                        active={!form.assignedTo}
                        onPress={() => {
                            set("assignedTo", "");
                            setShowStaffModal(false);
                            Keyboard.dismiss();
                        }}
                        sc={sc}
                    />
                    {assignableTeam.map((s) => (
                        <ChoiceCard
                            key={s._id}
                            label={s.name}
                            sublabel={
                                String(s.role || "").toLowerCase() === "admin"
                                    ? adminLabelMap[String(s._id)] || "Admin"
                                    : "Staff"
                            }
                            icon="person-outline"
                            active={form.assignedTo === s._id}
                            onPress={() => {
                                set("assignedTo", s._id);
                                setShowStaffModal(false);
                                Keyboard.dismiss();
                            }}
                            sc={sc}
                        />
                    ))}
                </View>
            </SelectModal>

            {/* Toast */}
            <Toast
                visible={toastVisible}
                message={toastMsg}
                type={toastType}
                animValue={toastAnim}
                sc={sc}
            />
        </SafeAreaView>
    );
}
