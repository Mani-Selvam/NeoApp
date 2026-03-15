import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as addressService from "../services/addressService";
import { API_URL as GLOBAL_API_URL } from "../services/apiConfig";
import * as leadSourceService from "../services/leadSourceService";
import notificationService from "../services/notificationService";
import * as productService from "../services/productService";
import * as staffService from "../services/staffService";
import { getImageUrl } from "../utils/imageHelper";
import ConfettiBurst from "../components/ConfettiBurst";

const API_URL = `${GLOBAL_API_URL}/enquiries`;

// Modern palette (aligned with Pricing/Checkout)
const COLORS = {
    primary: "#1A6BFF",
    primaryDark: "#0055E5",
    secondary: "#7B61FF",
    success: "#00C48C",
    warning: "#FF9500",
    danger: "#FF3B5C",
    dark: "#0A0F1E",
    gray: {
        50: "#F2F4F8",
        100: "#FAFBFF",
        200: "#E8ECF4",
        300: "#D7DEEF",
        400: "#7C85A3",
        500: "#3A4060",
        600: "#2A2F49",
        700: "#1E2238",
        800: "#121526",
        900: "#0A0F1E",
    },
    white: "#FFFFFF",
    gradient: ["#1A6BFF", "#7B61FF"],
};

export default function AddEnquiryScreen({ route, navigation }) {
    const insets = useSafeAreaInsets();
    const editingEnquiry = route?.params?.enquiry; // Get enquiry from navigation params
    const isEditMode = !!editingEnquiry; // Determine if we're in edit mode

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
        assignedTo: "", // Store Staff ID
    });
    const [loading, setLoading] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [errors, setErrors] = useState({});
    const [leadSources, setLeadSources] = useState([]);
    const [products, setProducts] = useState([]);
    const [creatingProduct, setCreatingProduct] = useState(false);
    const [newProductName, setNewProductName] = useState("");
    const [loadingSources, setLoadingSources] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [addressPredictions, setAddressPredictions] = useState([]);
    const [addressLoading, setAddressLoading] = useState(false);
    const [showAddressDropdown, setShowAddressDropdown] = useState(false);

    // Staff Assignment
    const [staffList, setStaffList] = useState([]);
    const [loadingStaff, setLoadingStaff] = useState(false);
    const [showStaffModal, setShowStaffModal] = useState(false);

    // Toast animation state
    const [toastMessage, setToastMessage] = useState("");
    const [toastType, setToastType] = useState("success"); // "success" | "error"
    const [toastVisible, setToastVisible] = useState(false);
    const toastAnimValue = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef(null);
  const confettiRef = useRef(null);

    // Animation
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    // Ensure notifications are initialized on mount
    useEffect(() => {
        notificationService.initializeNotifications();
    }, []);

    useEffect(() => {
        // Entrance animation
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();

        // Fetch lead sources
        const fetchLeadSources = async () => {
            try {
                setLoadingSources(true);
                const groups = await leadSourceService.getAllLeadSources();
                const sources = [];
                groups?.forEach((group) => {
                    group.sources?.forEach((source) => {
                        sources.push({
                            id: source._id,
                            name: source.name,
                            group: group.name,
                        });
                    });
                });
                setLeadSources(sources);
            } catch (error) {
                console.error("Error fetching lead sources:", error);
            } finally {
                setLoadingSources(false);
            }
        };
        fetchLeadSources();

        // Fetch Staff (for assignment)
        const fetchStaff = async () => {
            try {
                setLoadingStaff(true);
                const staff = await staffService.getAllStaff();
                // Filter out inactive staff if creating new enquiry? Maybe keep all if editing?
                // For now, show all.
                if (Array.isArray(staff)) {
                    setStaffList(staff);
                }
            } catch (error) {
                console.error("Error fetching staff:", error);
            } finally {
                setLoadingStaff(false);
            }
        };
        fetchStaff();
    }, [isEditMode, editingEnquiry]);

    // If editing existing enquiry, prefill form
    useEffect(() => {
        if (isEditMode && editingEnquiry) {
            setForm((prev) => ({
                ...prev,
                enqType: editingEnquiry.enqType || prev.enqType,
                source: editingEnquiry.source || prev.source,
                name: editingEnquiry.name || prev.name,
                mobile: editingEnquiry.mobile || prev.mobile,
                email: editingEnquiry.email || "",
                address: editingEnquiry.address || prev.address,
                product: editingEnquiry.product || prev.product,
                cost: editingEnquiry.cost
                    ? String(editingEnquiry.cost)
                    : prev.cost,
                image: editingEnquiry.image || prev.image,
                assignedTo: editingEnquiry.assignedTo || prev.assignedTo,
            }));
        }
    }, [isEditMode, editingEnquiry]);

    // Fetch products (hoisted so it can be reused)
    const fetchProducts = async () => {
        try {
            const list = await productService.getAllProducts();
            setProducts(Array.isArray(list) ? list : []);
        } catch (error) {
            console.error("Error fetching products:", error);
        }
    };

    // call once on mount
    useEffect(() => {
        fetchProducts();
    }, []);

    const updateField = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    const pickImage = async () => {
        // No request permissions needed for launching image library in Expo SDK 53+
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true, // Get base64 data
        });

        if (!result.canceled) {
            const asset = result.assets[0];
            // Store as base64 data URL for database storage
            const base64Image = `data:image/jpeg;base64,${asset.base64}`;
            updateField("image", base64Image);
        }
    };

    // Handle address input change with debouncing
    const addressTimeoutRef = React.useRef(null);
    const handleAddressChange = (text) => {
        updateField("address", text);

        // Clear previous timeout
        if (addressTimeoutRef.current) {
            clearTimeout(addressTimeoutRef.current);
        }

        if (text.trim().length >= 3) {
            setAddressLoading(true);
            addressTimeoutRef.current = setTimeout(async () => {
                try {
                    const predictions =
                        await addressService.getAddressPredictions(text);
                    setAddressPredictions(predictions);
                    setShowAddressDropdown(true);
                } catch (error) {
                    console.error("Error fetching predictions:", error);
                } finally {
                    setAddressLoading(false);
                }
            }, 200);
        } else {
            setAddressPredictions([]);
            setShowAddressDropdown(false);
        }
    };

    // Handle address selection from dropdown
    const handleAddressSelect = async (prediction) => {
        setShowAddressDropdown(false);
        setAddressLoading(true);

        try {
            const details = await addressService.getPlaceDetails(
                prediction.placeId,
            );
            if (details) {
                updateField("address", details.address);
            } else {
                updateField("address", prediction.fullAddress);
            }
        } catch (error) {
            console.error("Error selecting address:", error);
            updateField("address", prediction.fullAddress);
        } finally {
            setAddressLoading(false);
        }
    };

    const validateForm = () => {
        const newErrors = {};

        // In edit mode, only validate fields that are being changed (non-empty)
        // In create mode, validate all required fields
        if (!isEditMode) {
            // Create mode: strict validation
            if (!form.name?.trim()) newErrors.name = "Name is required";
            if (!form.mobile?.trim()) newErrors.mobile = "Mobile is required";
            if (!form.product?.trim())
                newErrors.product = "Product is required";
        } else {
            // Edit mode: only validate if field has value (optional validation)
            // This allows editing specific fields without requiring all fields
            if (form.name && !form.name.trim()) {
                newErrors.name = "Name cannot be empty";
            }
            if (form.mobile && !form.mobile.trim()) {
                newErrors.mobile = "Mobile cannot be empty";
            }
            if (form.product && !form.product.trim()) {
                newErrors.product = "Product cannot be empty";
            }
        }

        // Validate mobile format if provided
        if (form.mobile?.trim() && form.mobile.trim().length !== 10) {
            newErrors.mobile = "Mobile must be 10 digits";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Show animated toast popup
    const showToast = (message, type = "success", autoDismiss = true) => {
        // Clear any existing timeout
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }

        setToastMessage(message);
        setToastType(type);
        setToastVisible(true);

        // Animate in
        Animated.spring(toastAnimValue, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 10,
        }).start();

        // Auto-dismiss if requested
        if (autoDismiss) {
            toastTimeoutRef.current = setTimeout(() => {
                Animated.timing(toastAnimValue, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }).start(() => {
                    setToastVisible(false);
                });
            }, 2500);
        }
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;

        setLoading(true);
        try {
            const url = isEditMode
                ? `${API_URL}/${editingEnquiry._id}`
                : API_URL;
            const method = isEditMode ? "PUT" : "POST";

            let response;

            // Get token for auth
            const token = await AsyncStorage.getItem("token");

            // Sanitize data before sending
            const submissionData = { ...form };
            if (submissionData.assignedTo === "")
                submissionData.assignedTo = null;
            if (submissionData.cost)
                submissionData.cost = Number(submissionData.cost);

            // Always use JSON (images are now base64 encoded)
            response = await fetch(url, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: token ? `Bearer ${token}` : "",
                },
                body: JSON.stringify(submissionData),
            });

            const data = await response.json();
            if (response.ok) {
                if (!isEditMode) {
                    confettiRef.current?.play?.();
                }

                // Show success notification with enquiry details
                if (!isEditMode) {
                    await notificationService.showEnquirySuccessNotification({
                        name: form.name,
                        source: form.source,
                        product: form.product,
                    });
                }

                // Reset form and close after showing success toast
                setTimeout(() => {
                    if (!isEditMode) {
                        setForm({
                            enqType: "Normal",
                            source: "",
                            name: "",
                            mobile: "",
                            address: "",
                            product: "",
                            cost: "",
                            image: null,
                        });
                        setShowAdvanced(false);
                        setAddressPredictions([]);
                        setShowAddressDropdown(false);
                        setAddressLoading(false);
                    }

                    // Call the callback and close form
                    route.params?.onEnquirySaved?.(data);

                    // Close the form after 1.2 seconds total (0.3s + 0.9s)
                    setTimeout(() => {
                        navigation.goBack();
                    }, 900);
                }, 300);
            } else {
                // Show error notification
                const errorMessage =
                    data.message ||
                    (isEditMode
                        ? "Failed to update enquiry"
                        : "Failed to create enquiry");
                await notificationService.showEnquiryErrorNotification(
                    errorMessage,
                );
                showToast(errorMessage, "error");
            }
        } catch (error) {
            // Show error notification for network errors
            await notificationService.showEnquiryErrorNotification(
                error.message || "Network error. Please try again.",
            );
            showToast(
                error.message || "Network error. Please try again.",
                "error",
            );
        } finally {
            setLoading(false);
        }
    };

    // Inline product creation from Add Enquiry modal
    const createProductInline = async () => {
        if (!newProductName.trim()) {
            Alert.alert("Error", "Product name is required");
            return;
        }
        try {
            setCreatingProduct(true);
            const payload = {
                name: newProductName.trim(),
                items: [{ name: newProductName.trim() }],
            };
            const created = await productService.createProduct(payload);
            // refresh list and select
            await fetchProducts();
            updateField("product", created.name || newProductName.trim());
            setNewProductName("");
            setShowProductModal(false);
        } catch (err) {
            console.error("Create product inline error:", err);
            Alert.alert(
                "Error",
                err.response?.data?.message || "Failed to create product",
            );
        } finally {
            setCreatingProduct(false);
        }
    };

    // --- RENDER HELPERS ---
    const renderInput = (
        label,
        value,
        onChange,
        placeholder,
        icon,
        keyboardType = "default",
        error,
        autoCapitalize = "sentences",
    ) => (
        <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{label}</Text>
            <View
                style={[
                    styles.inputContainer,
                    error && styles.inputErrorBorder,
                    { borderColor: error ? COLORS.danger : COLORS.gray[200] },
                ]}>
                <View style={styles.inputIconBox}>
                    <Ionicons name={icon} size={20} color={COLORS.gray[400]} />
                </View>
                <TextInput
                    style={styles.inputField}
                    value={value}
                    onChangeText={onChange}
                    placeholder={placeholder}
                    placeholderTextColor={COLORS.gray[400]}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                />
            </View>
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );

    return (
        <SafeAreaView style={[styles.container]}>
            <StatusBar
                barStyle="dark-content"
                backgroundColor={COLORS.gray[50]}
            />
            <ConfettiBurst ref={confettiRef} topOffset={0} />

            {/* Top Bar */}
            <View style={styles.navBar}>
                <TouchableOpacity
                    style={styles.navBtn}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.85}>
                    <Ionicons
                        name={
                            Platform.OS === "ios"
                                ? "chevron-back"
                                : "arrow-back"
                        }
                        size={22}
                        color={COLORS.gray[900]}
                    />
                </TouchableOpacity>
                <Text style={styles.navTitle}>
                    {isEditMode ? "Edit Enquiry" : "New Enquiry"}
                </Text>
                <View style={{ width: 44 }} />
            </View>

            {/* Main Content */}
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="always">
                    <Animated.View
                        style={[
                            styles.contentContainer,
                            { opacity: fadeAnim },
                        ]}>
                        {/* Hero */}
                        <LinearGradient
                            colors={COLORS.gradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroCard}>
                            <View style={styles.heroTopRow}>
                                <View style={styles.heroIcon}>
                                    <Ionicons
                                        name="sparkles"
                                        size={18}
                                        color={COLORS.white}
                                    />
                                </View>
                                <View style={styles.heroPill}>
                                    <Ionicons
                                        name="checkmark-circle-outline"
                                        size={16}
                                        color={COLORS.white}
                                    />
                                    <Text style={styles.heroPillText}>
                                        Fast lead creation
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.heroTitle}>
                                {isEditMode
                                    ? "Update lead details"
                                    : "Create a new lead"}
                            </Text>
                            <Text style={styles.heroSubtitle}>
                                {isEditMode
                                    ? "Edit the enquiry and save changes."
                                    : "Fill required fields and save. Address & photo are optional in Advanced."}
                            </Text>
                            <View style={styles.heroBadgesRow}>
                                <View style={styles.heroBadge}>
                                    <Ionicons
                                        name="star-outline"
                                        size={14}
                                        color={COLORS.white}
                                    />
                                    <Text style={styles.heroBadgeText}>
                                        Priority
                                    </Text>
                                </View>
                                <View style={styles.heroBadge}>
                                    <Ionicons
                                        name="call-outline"
                                        size={14}
                                        color={COLORS.white}
                                    />
                                    <Text style={styles.heroBadgeText}>
                                        Mobile
                                    </Text>
                                </View>
                                <View style={styles.heroBadge}>
                                    <Ionicons
                                        name="cube-outline"
                                        size={14}
                                        color={COLORS.white}
                                    />
                                    <Text style={styles.heroBadgeText}>
                                        Product
                                    </Text>
                                </View>
                            </View>
                        </LinearGradient>

                        {/* 1. Categorization Card */}
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Ionicons
                                    name="pricetags-outline"
                                    size={20}
                                    color={COLORS.primary}
                                />
                                <Text style={styles.cardTitle}>
                                    Categorization
                                </Text>
                            </View>

                            <View style={styles.inputWrapper}>
                                <Text style={styles.inputLabel}>
                                    Priority Level
                                </Text>
                                <View style={styles.priorityGrid}>
                                    {["High", "Medium", "Normal"].map(
                                        (priority) => {
                                            const isActive =
                                                form.enqType === priority;
                                            let activeColor = COLORS.success;
                                            if (priority === "High")
                                                activeColor = COLORS.danger;
                                            if (priority === "Medium")
                                                activeColor = COLORS.warning;
                                            if (priority === "Normal")
                                                activeColor = COLORS.primary;

                                            return (
                                                <TouchableOpacity
                                                    key={priority}
                                                    style={[
                                                        styles.priorityCard,
                                                        isActive && {
                                                            backgroundColor:
                                                                activeColor +
                                                                "15",
                                                            borderColor:
                                                                activeColor,
                                                        },
                                                    ]}
                                                    onPress={() =>
                                                        updateField(
                                                            "enqType",
                                                            priority,
                                                        )
                                                    }>
                                                    <View
                                                        style={[
                                                            styles.priorityDot,
                                                            {
                                                                backgroundColor:
                                                                    isActive
                                                                        ? activeColor
                                                                        : COLORS
                                                                              .gray[300],
                                                            },
                                                        ]}
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.priorityText,
                                                            isActive && {
                                                                color: activeColor,
                                                                fontWeight:
                                                                    "700",
                                                            },
                                                        ]}>
                                                        {priority}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        },
                                    )}
                                </View>
                            </View>

                            <View style={styles.inputWrapper}>
                                <Text style={styles.inputLabel}>
                                    Lead Source
                                </Text>
                                <TouchableOpacity
                                    style={styles.dropdownButton}
                                    onPress={() => setShowSourceModal(true)}>
                                    <View style={styles.dropdownLeft}>
                                        <View style={styles.inputIconBox}>
                                            <Ionicons
                                                name="share-social-outline"
                                                size={20}
                                                color={COLORS.gray[400]}
                                            />
                                        </View>
                                        <Text
                                            style={
                                                form.source
                                                    ? styles.dropdownText
                                                    : styles.dropdownPlaceholder
                                            }>
                                            {form.source || "Select Source "}
                                        </Text>
                                    </View>
                                    <Ionicons
                                        name="chevron-down"
                                        size={20}
                                        color={COLORS.gray[400]}
                                    />
                                </TouchableOpacity>
                            </View>

                            {/* Assigned To Dropdown (Only if staff exists e.g. Admin view) */}
                            {staffList.length > 0 && (
                                <View style={styles.inputWrapper}>
                                    <Text style={styles.inputLabel}>
                                        Assign To
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.dropdownButton}
                                        onPress={() => setShowStaffModal(true)}>
                                        <View style={styles.dropdownLeft}>
                                            <View style={styles.inputIconBox}>
                                                <Ionicons
                                                    name="person-add-outline"
                                                    size={20}
                                                    color={COLORS.gray[400]}
                                                />
                                            </View>
                                            <View>
                                                <Text
                                                    style={
                                                        form.assignedTo
                                                            ? styles.dropdownText
                                                            : styles.dropdownPlaceholder
                                                    }>
                                                    {form.assignedTo
                                                        ? staffList.find(
                                                              (s) =>
                                                                  s._id ===
                                                                  form.assignedTo,
                                                          )?.name ||
                                                          "Unknown Staff"
                                                        : "Me (Auto-assign)"}
                                                </Text>
                                                {/* Subtext to clarify auto-assign */}
                                                {!form.assignedTo && (
                                                    <Text
                                                        style={{
                                                            fontSize: 10,
                                                            color: COLORS
                                                                .gray[400],
                                                            marginTop: 2,
                                                        }}>
                                                        Will be assigned to you
                                                        automatically
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                        <Ionicons
                                            name="chevron-down"
                                            size={20}
                                            color={COLORS.gray[400]}
                                        />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* 2. Customer Details Card */}
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Ionicons
                                    name="person-outline"
                                    size={20}
                                    color={COLORS.primary}
                                />
                                <Text style={styles.cardTitle}>
                                    Customer Details
                                </Text>
                            </View>

                            {renderInput(
                                "Full Name *",
                                form.name,
                                (text) => updateField("name", text),
                                "Enter customer full name",
                                "person-outline",
                                "default",
                                errors.name,
                            )}

                            {renderInput(
                                "Mobile Number *",
                                form.mobile,
                                (text) => updateField("mobile", text),
                                "Enter 10-digit number",
                                "call-outline",
                                "phone-pad",
                                errors.mobile,
                            )}

                            {renderInput(
                                "Email",
                                form.email,
                                (text) => updateField("email", text),
                                "Optional email address",
                                "mail-outline",
                                "email-address",
                                errors.email,
                                "none",
                            )}
                        </View>

                        {/* 3. Requirement Card */}
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Ionicons
                                    name="cart-outline"
                                    size={20}
                                    color={COLORS.primary}
                                />
                                <Text style={styles.cardTitle}>
                                    Requirement
                                </Text>
                            </View>

                            <View style={styles.inputWrapper}>
                                <Text style={styles.inputLabel}>
                                    Product / Service *
                                </Text>
                                <TouchableOpacity
                                    style={styles.dropdownButton}
                                    onPress={() => setShowProductModal(true)}>
                                    <View style={styles.dropdownLeft}>
                                        <View style={styles.inputIconBox}>
                                            <Ionicons
                                                name="cube-outline"
                                                size={20}
                                                color={COLORS.gray[400]}
                                            />
                                        </View>
                                        <Text
                                            style={
                                                form.product
                                                    ? styles.dropdownText
                                                    : styles.dropdownPlaceholder
                                            }>
                                            {form.product || "Select Product"}
                                        </Text>
                                    </View>
                                    <Ionicons
                                        name="chevron-down"
                                        size={20}
                                        color={COLORS.gray[400]}
                                    />
                                </TouchableOpacity>
                                {errors.product && (
                                    <Text style={styles.errorText}>
                                        {errors.product}
                                    </Text>
                                )}
                            </View>

                            {renderInput(
                                "Estimated Value (₹)",
                                form.cost,
                                (text) => updateField("cost", text),
                                "0.00",
                                "cash-outline",
                                "decimal-pad",
                            )}
                        </View>

                        {/* 4. Location (Toggle) */}
                        <View style={styles.card}>
                            <TouchableOpacity
                                style={styles.accordionHeader}
                                onPress={() => setShowAdvanced(!showAdvanced)}>
                                <View style={styles.accordionLeft}>
                                    <View
                                        style={[
                                            styles.inputIconBox,
                                            {
                                                backgroundColor:
                                                    COLORS.primary + "10",
                                            },
                                        ]}>
                                        <Ionicons
                                            name="location-outline"
                                            size={20}
                                            color={COLORS.primary}
                                        />
                                    </View>
                                    <Text style={styles.cardTitle}>
                                        Location & Address
                                    </Text>
                                </View>
                                <Ionicons
                                    name={
                                        showAdvanced
                                            ? "chevron-up"
                                            : "chevron-down"
                                    }
                                    size={20}
                                    color={COLORS.gray[400]}
                                />
                            </TouchableOpacity>

                            {showAdvanced && (
                                <View style={styles.accordionContent}>
                                    <View style={styles.inputWrapper}>
                                        <Text style={styles.inputLabel}>
                                            Full Address
                                        </Text>
                                        <View
                                            style={[
                                                styles.inputContainer,
                                                {
                                                    alignItems: "flex-start",
                                                    paddingVertical: 12,
                                                    height: "auto",
                                                    minHeight: 100,
                                                },
                                            ]}>
                                            <View
                                                style={[
                                                    styles.inputIconBox,
                                                    { marginTop: 0 },
                                                ]}>
                                                <Ionicons
                                                    name="map-outline"
                                                    size={20}
                                                    color={COLORS.gray[400]}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <TextInput
                                                    style={[
                                                        styles.inputField,
                                                        {
                                                            height: "100%",
                                                            textAlignVertical:
                                                                "top",
                                                            paddingTop: 8,
                                                        },
                                                    ]}
                                                    value={form.address}
                                                    onChangeText={
                                                        handleAddressChange
                                                    }
                                                    placeholder="Enter full address or city..."
                                                    placeholderTextColor={
                                                        COLORS.gray[400]
                                                    }
                                                    multiline
                                                />
                                            </View>
                                        </View>

                                        {/* Address Predictions */}
                                        {showAddressDropdown &&
                                            addressPredictions.length > 0 && (
                                                <View
                                                    style={
                                                        styles.predictionsContainer
                                                    }>
                                                    {addressLoading && (
                                                        <ActivityIndicator
                                                            size="small"
                                                            color={
                                                                COLORS.primary
                                                            }
                                                            style={{
                                                                margin: 10,
                                                            }}
                                                        />
                                                    )}
                                                    {addressPredictions.map(
                                                        (prediction, index) => (
                                                            <TouchableOpacity
                                                                key={
                                                                    prediction.placeId ||
                                                                    index
                                                                }
                                                                style={
                                                                    styles.predictionItem
                                                                }
                                                                onPress={() =>
                                                                    handleAddressSelect(
                                                                        prediction,
                                                                    )
                                                                }>
                                                                <Ionicons
                                                                    name="location-sharp"
                                                                    size={16}
                                                                    color={
                                                                        COLORS
                                                                            .gray[400]
                                                                    }
                                                                    style={{
                                                                        marginTop: 2,
                                                                    }}
                                                                />
                                                                <View
                                                                    style={{
                                                                        marginLeft: 10,
                                                                        flex: 1,
                                                                    }}>
                                                                    <Text
                                                                        style={
                                                                            styles.predictionMain
                                                                        }>
                                                                        {
                                                                            prediction.mainText
                                                                        }
                                                                    </Text>
                                                                    <Text
                                                                        style={
                                                                            styles.predictionSub
                                                                        }>
                                                                        {
                                                                            prediction.secondaryText
                                                                        }
                                                                    </Text>
                                                                </View>
                                                            </TouchableOpacity>
                                                        ),
                                                    )}
                                                </View>
                                            )}
                                        <View
                                            style={styles.imageUploadContainer}>
                                            <TouchableOpacity
                                                onPress={pickImage}
                                                style={styles.imagePicker}>
                                                {form.image ? (
                                                    <Image
                                                        source={{
                                                            uri: getImageUrl(
                                                                form.image,
                                                            ),
                                                        }}
                                                        style={
                                                            styles.uploadedImage
                                                        }
                                                    />
                                                ) : (
                                                    <View
                                                        style={
                                                            styles.imagePlaceholder
                                                        }>
                                                        <Ionicons
                                                            name="camera-outline"
                                                            size={32}
                                                            color={
                                                                COLORS.primary
                                                            }
                                                        />
                                                        <Text
                                                            style={
                                                                styles.uploadText
                                                            }>
                                                            Add Photo
                                                        </Text>
                                                    </View>
                                                )}
                                                <View
                                                    style={
                                                        styles.editIconBadge
                                                    }>
                                                    <Ionicons
                                                        name="pencil"
                                                        size={12}
                                                        color={COLORS.white}
                                                    />
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* Image Upload for Customer */}

                        {/* Spacer for bottom button */}
                        <View style={{ height: 130 }} />
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Footer Button */}
            <View
                style={[
                    styles.footerContainer,
                    { paddingBottom: Math.max(14, insets.bottom + 10) },
                ]}>
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        loading && styles.disabledButton,
                    ]}
                    onPress={handleSubmit}
                    activeOpacity={0.8}
                    disabled={loading}>
                    <LinearGradient
                        colors={COLORS.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientButton}>
                        {loading ? (
                            <ActivityIndicator color={COLORS.white} />
                        ) : (
                            <>
                                <Text style={styles.submitText}>
                                    {isEditMode
                                        ? "Update Enquiry"
                                        : "Create Enquiry"}
                                </Text>
                                <View style={styles.iconCircle}>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={18}
                                        color={COLORS.primary}
                                    />
                                </View>
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* Source Selection Modal */}
            <Modal
                visible={showSourceModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowSourceModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Select Lead Source
                            </Text>
                            <TouchableOpacity
                                onPress={() => setShowSourceModal(false)}
                                style={styles.closeBtn}>
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={COLORS.gray[600]}
                                />
                            </TouchableOpacity>
                        </View>

                        {loadingSources ? (
                            <View style={styles.centerBox}>
                                <ActivityIndicator
                                    size="large"
                                    color={COLORS.primary}
                                />
                                <Text style={styles.loadingText}>
                                    Loading sources...
                                </Text>
                            </View>
                        ) : (
                            <ScrollView style={styles.modalScroll}>
                                <View style={styles.modalGrid}>
                                    {leadSources.map((source) => (
                                        <TouchableOpacity
                                            key={source.id}
                                            style={[
                                                styles.sourceCard,
                                                form.source === source.name &&
                                                    styles.sourceCardActive,
                                            ]}
                                            onPress={() => {
                                                updateField(
                                                    "source",
                                                    source.name,
                                                );
                                                setShowSourceModal(false);
                                            }}>
                                            <View
                                                style={[
                                                    styles.sourceIconBox,
                                                    form.source === source.name
                                                        ? {
                                                              backgroundColor:
                                                                  COLORS.white,
                                                          }
                                                        : {
                                                              backgroundColor:
                                                                  COLORS
                                                                      .gray[100],
                                                          },
                                                ]}>
                                                <Ionicons
                                                    name={
                                                        form.source ===
                                                        source.name
                                                            ? "checkmark-circle"
                                                            : "ellipse-outline"
                                                    }
                                                    size={24}
                                                    color={
                                                        form.source ===
                                                        source.name
                                                            ? COLORS.primary
                                                            : COLORS.gray[400]
                                                    }
                                                />
                                            </View>
                                            <Text
                                                style={[
                                                    styles.sourceName,
                                                    form.source ===
                                                        source.name && {
                                                        color: COLORS.white,
                                                        fontWeight: "700",
                                                    },
                                                ]}>
                                                {source.name}
                                            </Text>
                                            {source.group && (
                                                <Text
                                                    style={[
                                                        styles.sourceGroup,
                                                        form.source ===
                                                            source.name && {
                                                            color: "rgba(255,255,255,0.8)",
                                                        },
                                                    ]}>
                                                    {source.group}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Product Selection Modal */}
            <Modal
                visible={showProductModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowProductModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Select Product
                            </Text>
                            <TouchableOpacity
                                onPress={() => setShowProductModal(false)}
                                style={styles.closeBtn}>
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={COLORS.gray[600]}
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalScroll}>
                            <View
                                style={{
                                    padding: 12,
                                    borderBottomWidth: 1,
                                    borderBottomColor: COLORS.gray[100],
                                    backgroundColor: COLORS.white,
                                }}>
                                <Text
                                    style={{
                                        fontWeight: "700",
                                        marginBottom: 8,
                                    }}>
                                    Add New Product
                                </Text>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        gap: 8,
                                        alignItems: "center",
                                    }}>
                                    <TextInput
                                        placeholder="New product name"
                                        value={newProductName}
                                        onChangeText={setNewProductName}
                                        style={{
                                            flex: 1,
                                            backgroundColor: COLORS.gray[50],
                                            padding: 10,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: COLORS.gray[200],
                                        }}
                                    />
                                    <TouchableOpacity
                                        onPress={createProductInline}
                                        style={{
                                            backgroundColor: COLORS.primary,
                                            padding: 10,
                                            borderRadius: 10,
                                        }}>
                                        {creatingProduct ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text
                                                style={{
                                                    color: "#fff",
                                                    fontWeight: "700",
                                                }}>
                                                Add
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View style={styles.modalGrid}>
                                {products.map((prod) => (
                                    <TouchableOpacity
                                        key={prod._id}
                                        style={[
                                            styles.sourceCard,
                                            form.product === prod.name &&
                                                styles.sourceCardActive,
                                        ]}
                                        onPress={() => {
                                            updateField("product", prod.name);
                                            setShowProductModal(false);
                                        }}>
                                        <View
                                            style={[
                                                styles.sourceIconBox,
                                                form.product === prod.name
                                                    ? {
                                                          backgroundColor:
                                                              COLORS.white,
                                                      }
                                                    : {
                                                          backgroundColor:
                                                              COLORS.gray[100],
                                                      },
                                            ]}>
                                            <Ionicons
                                                name={
                                                    form.product === prod.name
                                                        ? "checkmark-circle"
                                                        : "cube-outline"
                                                }
                                                size={24}
                                                color={
                                                    form.product === prod.name
                                                        ? COLORS.primary
                                                        : COLORS.gray[400]
                                                }
                                            />
                                        </View>
                                        <Text
                                            style={[
                                                styles.sourceName,
                                                form.product === prod.name && {
                                                    color: COLORS.white,
                                                    fontWeight: "700",
                                                },
                                            ]}>
                                            {prod.name}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.sourceGroup,
                                                form.product === prod.name && {
                                                    color: "rgba(255,255,255,0.8)",
                                                },
                                            ]}>
                                            {(prod.items || []).length} item
                                            {(prod.items || []).length !== 1
                                                ? "s"
                                                : ""}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Staff Selection Modal */}
            <Modal
                visible={showStaffModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowStaffModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Assign to Staff
                            </Text>
                            <TouchableOpacity
                                onPress={() => setShowStaffModal(false)}
                                style={styles.closeBtn}>
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={COLORS.gray[600]}
                                />
                            </TouchableOpacity>
                        </View>

                        {loadingStaff ? (
                            <View style={styles.centerBox}>
                                <ActivityIndicator
                                    size="large"
                                    color={COLORS.primary}
                                />
                                <Text style={styles.loadingText}>
                                    Loading staff...
                                </Text>
                            </View>
                        ) : (
                            <ScrollView style={styles.modalScroll}>
                                <TouchableOpacity
                                    style={[
                                        styles.sourceCard,
                                        !form.assignedTo &&
                                            styles.sourceCardActive,
                                        { width: "100%", marginBottom: 12 },
                                    ]}
                                    onPress={() => {
                                        updateField("assignedTo", "");
                                        setShowStaffModal(false);
                                    }}>
                                    <View
                                        style={[
                                            styles.sourceIconBox,
                                            !form.assignedTo
                                                ? {
                                                      backgroundColor:
                                                          COLORS.white,
                                                  }
                                                : {
                                                      backgroundColor:
                                                          COLORS.gray[100],
                                                  },
                                        ]}>
                                        <Ionicons
                                            name={
                                                !form.assignedTo
                                                    ? "checkmark-circle"
                                                    : "person-outline"
                                            }
                                            size={22}
                                            color={
                                                !form.assignedTo
                                                    ? COLORS.primary
                                                    : COLORS.gray[400]
                                            }
                                        />
                                    </View>
                                    <View>
                                        <Text
                                            style={[
                                                styles.sourceName,
                                                !form.assignedTo && {
                                                    color: COLORS.white,
                                                },
                                            ]}>
                                            Me (Auto-assign)
                                        </Text>
                                        <Text
                                            style={[
                                                styles.sourceGroup,
                                                !form.assignedTo && {
                                                    color: "rgba(255,255,255,0.8)",
                                                },
                                            ]}>
                                            Assign to yourself
                                        </Text>
                                    </View>
                                </TouchableOpacity>

                                <View style={styles.modalGrid}>
                                    {staffList.map((staff) => (
                                        <TouchableOpacity
                                            key={staff._id}
                                            style={[
                                                styles.sourceCard,
                                                form.assignedTo === staff._id &&
                                                    styles.sourceCardActive,
                                            ]}
                                            onPress={() => {
                                                updateField(
                                                    "assignedTo",
                                                    staff._id,
                                                );
                                                setShowStaffModal(false);
                                            }}>
                                            <View
                                                style={[
                                                    styles.sourceIconBox,
                                                    form.assignedTo ===
                                                    staff._id
                                                        ? {
                                                              backgroundColor:
                                                                  COLORS.white,
                                                          }
                                                        : {
                                                              backgroundColor:
                                                                  COLORS
                                                                      .gray[100],
                                                          },
                                                ]}>
                                                <Ionicons
                                                    name={
                                                        form.assignedTo ===
                                                        staff._id
                                                            ? "checkmark-circle"
                                                            : "person-outline"
                                                    }
                                                    size={22}
                                                    color={
                                                        form.assignedTo ===
                                                        staff._id
                                                            ? COLORS.primary
                                                            : COLORS.gray[400]
                                                    }
                                                />
                                            </View>
                                            <Text
                                                style={[
                                                    styles.sourceName,
                                                    form.assignedTo ===
                                                        staff._id && {
                                                        color: COLORS.white,
                                                        fontWeight: "700",
                                                    },
                                                ]}>
                                                {staff.name}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.sourceGroup,
                                                    form.assignedTo ===
                                                        staff._id && {
                                                        color: "rgba(255,255,255,0.8)",
                                                    },
                                                ]}>
                                                {staff.role || "Staff"}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
            {toastVisible && (
                <Animated.View
                    style={[
                        styles.toastContainer,
                        {
                            opacity: toastAnimValue,
                            transform: [
                                {
                                    translateY: toastAnimValue.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [-20, 0],
                                    }),
                                },
                            ],
                        },
                    ]}>
                    <View
                        style={[
                            styles.toastContent,
                            {
                                backgroundColor:
                                    toastType === "success"
                                        ? COLORS.success
                                        : COLORS.danger,
                            },
                        ]}>
                        <Ionicons
                            name={
                                toastType === "success"
                                    ? "checkmark-circle"
                                    : "alert-circle"
                            }
                            size={24}
                            color={COLORS.white}
                        />
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </View>
                </Animated.View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.gray[50],
    },
    navBar: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    navBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.gray[200],
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "rgba(10,15,30,0.10)",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 2,
    },
    navTitle: {
        fontSize: 17,
        fontWeight: "900",
        color: COLORS.gray[900],
    },
    header: {
        paddingBottom: 25,
        paddingHorizontal: 24,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        elevation: 8,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
    },
    headerTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.2)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
    },
    helpButton: {
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: "700",
        color: COLORS.white,
        letterSpacing: 0.5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: "rgba(255,255,255,0.8)",
        textAlign: "center",
        marginTop: 5,
    },
    keyboardContainer: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 10,
        paddingHorizontal: 16,
        paddingBottom: 160, // space for footer
    },
    contentContainer: {
        gap: 20,
    },
    heroCard: {
        borderRadius: 26,
        padding: 18,
        overflow: "hidden",
        shadowColor: "rgba(10,15,30,0.10)",
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 6,
    },
    heroTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    heroIcon: {
        width: 36,
        height: 36,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.18)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.22)",
    },
    heroPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(255,255,255,0.16)",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    heroPillText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: "800",
    },
    heroTitle: {
        marginTop: 10,
        fontSize: 22,
        fontWeight: "900",
        color: COLORS.white,
        letterSpacing: -0.3,
    },
    heroSubtitle: {
        marginTop: 8,
        color: "rgba(255,255,255,0.85)",
        fontSize: 13,
        lineHeight: 19,
    },
    heroBadgesRow: {
        marginTop: 14,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.18)",
    },
    heroBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.16)",
    },
    heroBadgeText: {
        color: COLORS.white,
        fontSize: 12,
        fontWeight: "800",
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 20,
        shadowColor: "#64748B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
        gap: 10,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: COLORS.gray[800],
    },
    inputWrapper: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: COLORS.gray[600],
        marginBottom: 8,
        marginLeft: 4,
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.gray[50], // Very light gray bg
        borderWidth: 1.5,
        borderColor: COLORS.gray[200],
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 54, // Taller inputs
    },
    inputErrorBorder: {
        borderColor: COLORS.danger,
        backgroundColor: "#FEF2F2",
    },
    inputIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: COLORS.white,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
        borderWidth: 1,
        borderColor: COLORS.gray[100],
    },
    inputField: {
        flex: 1,
        fontSize: 16,
        color: COLORS.gray[800],
        fontWeight: "500",
    },
    errorText: {
        fontSize: 12,
        color: COLORS.danger,
        marginTop: 6,
        marginLeft: 4,
        fontWeight: "500",
    },
    // Priority custom styling
    priorityGrid: {
        flexDirection: "row",
        gap: 10,
    },
    priorityCard: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: COLORS.white,
        borderWidth: 1.5,
        borderColor: COLORS.gray[200],
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    priorityDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    priorityText: {
        fontSize: 12,
        fontWeight: "600",
        color: COLORS.gray[500],
    },
    // Dropdown
    dropdownButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: COLORS.white,
        borderWidth: 1.5,
        borderColor: COLORS.gray[200],
        borderRadius: 14,
        padding: 12,
        height: 60,
    },
    dropdownLeft: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    dropdownText: {
        fontSize: 16,
        fontWeight: "600",
        color: COLORS.gray[800],
    },
    dropdownPlaceholder: {
        fontSize: 15,
        color: COLORS.gray[400],
    },
    // Accordion
    accordionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    accordionLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    accordionContent: {
        marginTop: 20,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: COLORS.gray[100],
    },
    predictionsContainer: {
        backgroundColor: COLORS.white,
        borderRadius: 12,
        marginTop: 10,
        borderWidth: 1,
        borderColor: COLORS.gray[200],
        overflow: "hidden",
    },
    predictionItem: {
        flexDirection: "row",
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray[50],
        alignItems: "flex-start",
    },
    predictionMain: {
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.gray[800],
    },
    predictionSub: {
        fontSize: 12,
        color: COLORS.gray[500],
        marginTop: 2,
    },
    // Footer / Submit
    footerContainer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: COLORS.white,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 14,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 20,
    },
    submitButton: {
        borderRadius: 18,
        overflow: "hidden",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 10,
    },
    disabledButton: {
        opacity: 0.7,
    },
    gradientButton: {
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    submitText: {
        fontSize: 18,
        fontWeight: "700",
        color: COLORS.white,
        letterSpacing: 0.5,
    },
    iconCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.white,
        alignItems: "center",
        justifyContent: "center",
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.6)", // Blur effect background
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: COLORS.gray[50],
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        height: "75%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 25,
        overflow: "hidden",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 24,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray[200],
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: COLORS.gray[900],
    },
    closeBtn: {
        padding: 4,
        backgroundColor: COLORS.gray[100],
        borderRadius: 20,
    },
    modalScroll: {
        flex: 1,
        padding: 20,
    },
    modalGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        paddingBottom: 40,
    },
    sourceCard: {
        width: "48%",
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.gray[200],
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    sourceCardActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    sourceIconBox: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
    },
    sourceName: {
        fontSize: 14,
        fontWeight: "700",
        color: COLORS.gray[800],
    },
    sourceGroup: {
        fontSize: 12,
        color: COLORS.gray[500],
    },
    centerBox: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingText: {
        marginTop: 12,
        color: COLORS.gray[500],
        fontSize: 14,
    },
    // Toast
    toastContainer: {
        position: "absolute",
        top: Platform.OS === "ios" ? 50 : 30,
        alignSelf: "center",
        zIndex: 9999,
        width: "90%",
    },
    toastContent: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 16,
        gap: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    toastText: {
        color: COLORS.white,
        fontSize: 15,
        fontWeight: "600",
        flex: 1,
    },
    // Image Upload Styles
    imageUploadContainer: {
        alignItems: "center",
        marginTop: 20,
    },
    imagePicker: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: COLORS.gray[100],
        borderWidth: 2,
        borderColor: COLORS.primary,
        borderStyle: "dashed",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
    },
    uploadedImage: {
        width: "100%",
        height: "100%",
        borderRadius: 50,
    },
    imagePlaceholder: {
        alignItems: "center",
        justifyContent: "center",
    },
    uploadText: {
        fontSize: 10,
        color: COLORS.primary,
        marginTop: 4,
        fontWeight: "600",
    },
    editIconBadge: {
        position: "absolute",
        bottom: 0,
        right: 0,
        backgroundColor: COLORS.primary,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: COLORS.white,
    },
});
