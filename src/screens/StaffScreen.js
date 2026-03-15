import { Ionicons } from "@expo/vector-icons";
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import * as staffService from "../services/staffService";

export default function StaffScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user, billingPlan } = useAuth();
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editFormData, setEditFormData] = useState(null);
    const [editLoading, setEditLoading] = useState(false);
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [upgradeModal, setUpgradeModal] = useState({
        visible: false,
        title: "",
        message: "",
        primaryText: "Upgrade",
    });

    // Use a single form state with proper initialization
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        mobile: "",
        password: "",
        status: "Active",
    });

    // Refs for input focus management
    const inputRefs = {
        name: useRef(null),
        email: useRef(null),
        mobile: useRef(null),
        password: useRef(null),
    };

    // Fetch staff on mount
    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            setLoading(true);
            const data = await staffService.getAllStaff();
            setStaff(Array.isArray(data) ? data : []);
        } catch (error) {
            Alert.alert("Error", "Failed to fetch staff");
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchStaff();
    };

    // Reset form with stable function
    const resetForm = useCallback(() => {
        setFormData({
            name: "",
            email: "",
            mobile: "",
            password: "",
            status: "Active",
        });
    }, []);

    const showUpgradeModal = useCallback(
        ({ title, message, primaryText = "Upgrade" }) => {
            setUpgradeModal({
                visible: true,
                title: title || "Upgrade required",
                message: message || "Please upgrade to continue.",
                primaryText,
            });
        },
        [],
    );

    const closeUpgradeModal = useCallback(() => {
        setUpgradeModal((prev) => ({ ...prev, visible: false }));
    }, []);

    // Handle input changes with proper state management
    const handleInputChange = useCallback((field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    // Handle form submission
    const handleAddStaff = useCallback(async () => {
        // Validation
        if (
            !formData.name.trim() ||
            !formData.email.trim() ||
            !formData.password.trim()
        ) {
            Alert.alert("Error", "Name, email, and password are required");
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            Alert.alert("Error", "Please enter a valid email");
            return;
        }

        try {
            setFormLoading(true);
            await staffService.createStaff(formData);
            Alert.alert("Success", "Staff created successfully");
            resetForm();
            setShowAddModal(false);
            fetchStaff();
        } catch (error) {
            const payload = error?.response?.data;
            const code = payload?.code;
            const serverMessage =
                payload?.error ||
                payload?.message ||
                error?.message ||
                "Failed to create staff";

            const isStaffLimit =
                code === "STAFF_LIMIT_REACHED" ||
                /staff limit/i.test(String(serverMessage || ""));

            if (isStaffLimit) {
                const limit = Number(payload?.limit || 0);
                const current = Number(payload?.current || 0);
                setShowAddModal(false);
                showUpgradeModal({
                    title: "Upgrade required",
                    message:
                        limit > 0 && current > 0
                            ? `Your current plan allows ${limit} staff. You already have ${current}. Please upgrade to add more staff.`
                            : "Your current plan limit is reached. Please upgrade to add more staff.",
                    primaryText: "Upgrade",
                });
                return;
            }
            if (code === "NO_ACTIVE_PLAN" || code === "FEATURE_DISABLED") {
                setShowAddModal(false);
                showUpgradeModal({
                    title: "Choose a plan",
                    message:
                        "Your plan is inactive/expired. Please select a plan to continue.",
                    primaryText: "View Pricing",
                });
                return;
            }
            Alert.alert(
                "Error",
                serverMessage,
            );
            console.error(error);
        } finally {
            setFormLoading(false);
        }
    }, [formData, resetForm, showUpgradeModal]);

    // Handle status toggle
    const handleToggleStatus = useCallback((staffMember) => {
        const newStatus =
            staffMember.status === "Active" ? "Inactive" : "Active";
        Alert.alert(
            "Confirm Status Change",
            `Change ${staffMember.name}'s status to ${newStatus}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Confirm",
                    onPress: async () => {
                        try {
                            await staffService.updateStaffStatus(
                                staffMember._id,
                                newStatus,
                            );
                            Alert.alert(
                                "Success",
                                "Status updated successfully",
                            );
                            fetchStaff();
                        } catch (error) {
                            Alert.alert("Error", "Failed to update status");
                            console.error(error);
                        }
                    },
                },
            ],
        );
    }, []);

    // Handle staff deletion
    const handleDeleteStaff = useCallback((staffMember) => {
        Alert.alert(
            "Delete Staff",
            `Are you sure you want to delete ${staffMember.name}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    onPress: async () => {
                        try {
                            await staffService.deleteStaff(staffMember._id);
                            Alert.alert(
                                "Success",
                                "Staff deleted successfully",
                            );
                            fetchStaff();
                        } catch (error) {
                            Alert.alert("Error", "Failed to delete staff");
                            console.error(error);
                        }
                    },
                    style: "destructive",
                },
            ],
        );
    }, []);

    // Open modal with focus
    const openModal = useCallback(() => {
        const maxStaff = Number(billingPlan?.maxStaff ?? 0);

        if (!billingPlan) {
            showUpgradeModal({
                title: "Choose a plan",
                message:
                    "Your plan is inactive/expired. Please select a plan to add staff.",
                primaryText: "View Pricing",
            });
            return;
        }

        if (!Number.isFinite(maxStaff) || maxStaff <= 0 || staff.length >= maxStaff) {
            showUpgradeModal({
                title: "Upgrade required",
                message:
                    Number.isFinite(maxStaff) && maxStaff > 0
                        ? `Your current plan allows ${maxStaff} staff. Please upgrade to add more staff.`
                        : "Your current plan does not allow adding staff. Please upgrade.",
                primaryText: "Upgrade",
            });
            return;
        }

        setShowAddModal(true);
        resetForm();
        // Focus first input after modal opens
        setTimeout(() => {
            inputRefs.name.current?.focus();
        }, 100);
    }, [billingPlan, resetForm, showUpgradeModal, staff.length]);

    // Close modal
    const closeModal = useCallback(() => {
        if (formLoading) return;
        setShowAddModal(false);
        resetForm();
    }, [formLoading, resetForm]);

    // Memoized StaffCard to prevent unnecessary re-renders
    const StaffCard = useMemo(
        () =>
            ({ item }) => (
                <View style={styles.staffCard}>
                    <View style={styles.staffInfo}>
                        <View style={styles.staffNameRow}>
                            <Text style={styles.staffName}>{item.name}</Text>
                            <View
                                style={[
                                    styles.statusBadge,
                                    {
                                        backgroundColor:
                                            item.status === "Active"
                                                ? "#d1fae5"
                                                : "#fee2e2",
                                    },
                                ]}>
                                <Text
                                    style={[
                                        styles.statusText,
                                        {
                                            color:
                                                item.status === "Active"
                                                    ? "#059669"
                                                    : "#dc2626",
                                        },
                                    ]}>
                                    {item.status}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.staffEmail}>{item.email}</Text>
                        {item.mobile && (
                            <Text style={styles.staffMobile}>
                                {item.mobile}
                            </Text>
                        )}
                    </View>
                    <View style={styles.staffActions}>
                        <TouchableOpacity
                            style={[
                                styles.toggleBtn,
                                {
                                    backgroundColor:
                                        item.status === "Active"
                                            ? "#d1fae5"
                                            : "#fee2e2",
                                    borderColor:
                                        item.status === "Active"
                                            ? "#059669"
                                            : "#dc2626",
                                },
                            ]}
                            onPress={() => handleToggleStatus(item)}
                            hitSlop={{
                                top: 10,
                                left: 10,
                                right: 10,
                                bottom: 10,
                            }}>
                            <Ionicons
                                name={
                                    item.status === "Active"
                                        ? "checkmark-circle"
                                        : "close-circle"
                                }
                                size={16}
                                color={
                                    item.status === "Active"
                                        ? "#059669"
                                        : "#dc2626"
                                }
                            />
                            <Text
                                style={[
                                    styles.toggleBtnText,
                                    {
                                        color:
                                            item.status === "Active"
                                                ? "#059669"
                                                : "#dc2626",
                                    },
                                ]}>
                                {item.status}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => {
                                setEditFormData({
                                    id: item._id,
                                    name: item.name || "",
                                    email: item.email || "",
                                    mobile: item.mobile || "",
                                    status: item.status || "Active",
                                    password: "",
                                });
                                setPasswordVisible(false);
                                setShowEditModal(true);
                            }}
                            hitSlop={{
                                top: 10,
                                left: 10,
                                right: 10,
                                bottom: 10,
                            }}>
                            <Ionicons name="pencil" size={18} color="#059669" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDeleteStaff(item)}
                            hitSlop={{
                                top: 10,
                                left: 10,
                                right: 10,
                                bottom: 10,
                            }}>
                            <Ionicons
                                name="trash-outline"
                                size={18}
                                color="#ef4444"
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            ),
        [handleToggleStatus, handleDeleteStaff],
    );

    // Memoized Modal Content
    const ModalContent = useMemo(
        () => (
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Add New Staff</Text>
                    <TouchableOpacity
                        onPress={closeModal}
                        disabled={formLoading}
                        style={styles.closeBtn}>
                        <Ionicons name="close" size={24} color="#334155" />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formContainer}>
                    {/* Name Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Name</Text>
                        <TextInput
                            ref={inputRefs.name}
                            style={styles.input}
                            placeholder="Enter full name"
                            placeholderTextColor="#94a3b8"
                            value={formData.name}
                            onChangeText={(value) =>
                                handleInputChange("name", value)
                            }
                            editable={!formLoading}
                            autoCapitalize="words"
                            returnKeyType="next"
                            onSubmitEditing={() =>
                                inputRefs.email.current?.focus()
                            }
                            blurOnSubmit={false}
                        />
                    </View>

                    {/* Email Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            ref={inputRefs.email}
                            style={styles.input}
                            placeholder="Enter email address"
                            placeholderTextColor="#94a3b8"
                            keyboardType="email-address"
                            value={formData.email}
                            onChangeText={(value) =>
                                handleInputChange("email", value)
                            }
                            editable={!formLoading}
                            autoCapitalize="none"
                            autoComplete="email"
                            returnKeyType="next"
                            onSubmitEditing={() =>
                                inputRefs.mobile.current?.focus()
                            }
                            blurOnSubmit={false}
                        />
                    </View>

                    {/* Mobile Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Mobile</Text>
                        <TextInput
                            ref={inputRefs.mobile}
                            style={styles.input}
                            placeholder="Enter mobile number"
                            placeholderTextColor="#94a3b8"
                            keyboardType="phone-pad"
                            value={formData.mobile}
                            onChangeText={(value) =>
                                handleInputChange("mobile", value)
                            }
                            editable={!formLoading}
                            autoComplete="tel"
                            returnKeyType="next"
                            onSubmitEditing={() =>
                                inputRefs.password.current?.focus()
                            }
                            blurOnSubmit={false}
                        />
                    </View>

                    {/* Password Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            ref={inputRefs.password}
                            style={styles.input}
                            placeholder="Enter password (min 6 chars)"
                            placeholderTextColor="#94a3b8"
                            secureTextEntry={true}
                            value={formData.password}
                            onChangeText={(value) =>
                                handleInputChange("password", value)
                            }
                            editable={!formLoading}
                            autoComplete="password"
                            returnKeyType="done"
                            onSubmitEditing={handleAddStaff}
                        />
                    </View>

                    {/* Status Selection */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Status</Text>
                        <View style={styles.statusOptions}>
                            <TouchableOpacity
                                style={[
                                    styles.statusOption,
                                    formData.status === "Active" &&
                                    styles.statusOptionActive,
                                ]}
                                onPress={() =>
                                    !formLoading &&
                                    handleInputChange("status", "Active")
                                }
                                disabled={formLoading}>
                                <View
                                    style={[
                                        styles.radio,
                                        formData.status === "Active" &&
                                        styles.radioActive,
                                    ]}>
                                    {formData.status === "Active" && (
                                        <View style={styles.radioDot} />
                                    )}
                                </View>
                                <Text style={styles.statusLabel}>Active</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.statusOption,
                                    formData.status === "Inactive" &&
                                    styles.statusOptionActive,
                                ]}
                                onPress={() =>
                                    !formLoading &&
                                    handleInputChange("status", "Inactive")
                                }
                                disabled={formLoading}>
                                <View
                                    style={[
                                        styles.radio,
                                        formData.status === "Inactive" &&
                                        styles.radioActive,
                                    ]}>
                                    {formData.status === "Inactive" && (
                                        <View style={styles.radioDot} />
                                    )}
                                </View>
                                <Text style={styles.statusLabel}>Inactive</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Save Button */}
                    <TouchableOpacity
                        style={[
                            styles.saveBtn,
                            formLoading && styles.saveBtnDisabled,
                        ]}
                        onPress={handleAddStaff}
                        disabled={formLoading}>
                        {formLoading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Ionicons
                                    name="save-outline"
                                    size={20}
                                    color="#fff"
                                />
                                <Text style={styles.saveBtnText}>Save</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {/* Cancel Button */}
                    <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={closeModal}
                        disabled={formLoading}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        ),
        [formData, formLoading, handleInputChange, handleAddStaff, closeModal],
    );

    // Edit modal handlers
    const handleEditInputChange = (field, value) =>
        setEditFormData((prev) => ({ ...prev, [field]: value }));

    const handleUpdateStaff = async () => {
        if (!editFormData) return;
        try {
            setEditLoading(true);
            const { id, name, mobile, status, password } = editFormData;
            const payload = { name, mobile, status };
            if (password && password.length >= 6) payload.password = password;
            await staffService.updateStaff(id, payload);
            Alert.alert("Success", "Staff updated");
            setShowEditModal(false);
            setEditFormData(null);
            fetchStaff();
        } catch (err) {
            Alert.alert("Error", err.response?.data?.error || "Update failed");
            console.error(err);
        } finally {
            setEditLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={28} color="#1e293b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Staff Management</Text>
                <TouchableOpacity onPress={() => navigation.navigate("ProfileScreen")}>
                    {user?.logo ? (
                        <Image source={{ uri: getImageUrl(user.logo) }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                    ) : (
                        <View style={styles.placeholder} />
                    )}
                </TouchableOpacity>
            </View>

            {/* Modal */}
            <Modal
                visible={showAddModal}
                transparent={true}
                animationType="slide"
                onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.keyboardView}>
                        {ModalContent}
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Edit Modal */}
            <Modal
                visible={showEditModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => {
                    if (!editLoading) setShowEditModal(false);
                }}>
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.keyboardView}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>
                                    Edit Staff
                                </Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        if (!editLoading)
                                            setShowEditModal(false);
                                    }}
                                    style={styles.closeBtn}>
                                    <Ionicons
                                        name="close"
                                        size={24}
                                        color="#334155"
                                    />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={styles.formContainer}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Name</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={editFormData?.name}
                                        onChangeText={(v) =>
                                            handleEditInputChange("name", v)
                                        }
                                    />
                                </View>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Email</Text>
                                    <TextInput
                                        style={[
                                            styles.input,
                                            { backgroundColor: "#f1f5f9" },
                                        ]}
                                        value={editFormData?.email}
                                        editable={false}
                                    />
                                </View>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Mobile</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={editFormData?.mobile}
                                        onChangeText={(v) =>
                                            handleEditInputChange("mobile", v)
                                        }
                                    />
                                </View>
                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Password</Text>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                        }}>
                                        <TextInput
                                            style={[styles.input, { flex: 1 }]}
                                            value={editFormData?.password}
                                            onChangeText={(v) =>
                                                handleEditInputChange(
                                                    "password",
                                                    v,
                                                )
                                            }
                                            secureTextEntry={!passwordVisible}
                                            placeholder="Enter new password to change"
                                        />
                                        <TouchableOpacity
                                            onPress={() =>
                                                setPasswordVisible((s) => !s)
                                            }
                                            style={{ marginLeft: 8 }}>
                                            <Ionicons
                                                name={
                                                    passwordVisible
                                                        ? "eye-off"
                                                        : "eye"
                                                }
                                                size={20}
                                                color="#64748b"
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.formGroup}>
                                    <Text style={styles.label}>Status</Text>
                                    <View style={styles.statusOptions}>
                                        <TouchableOpacity
                                            style={[
                                                styles.statusOption,
                                                editFormData?.status ===
                                                "Active" &&
                                                styles.statusOptionActive,
                                            ]}
                                            onPress={() =>
                                                handleEditInputChange(
                                                    "status",
                                                    "Active",
                                                )
                                            }>
                                            <View
                                                style={[
                                                    styles.radio,
                                                    editFormData?.status ===
                                                    "Active" &&
                                                    styles.radioActive,
                                                ]}>
                                                {editFormData?.status ===
                                                    "Active" && (
                                                        <View
                                                            style={styles.radioDot}
                                                        />
                                                    )}
                                            </View>
                                            <Text style={styles.statusLabel}>
                                                Active
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.statusOption,
                                                editFormData?.status ===
                                                "Inactive" &&
                                                styles.statusOptionActive,
                                            ]}
                                            onPress={() =>
                                                handleEditInputChange(
                                                    "status",
                                                    "Inactive",
                                                )
                                            }>
                                            <View
                                                style={[
                                                    styles.radio,
                                                    editFormData?.status ===
                                                    "Inactive" &&
                                                    styles.radioActive,
                                                ]}>
                                                {editFormData?.status ===
                                                    "Inactive" && (
                                                        <View
                                                            style={styles.radioDot}
                                                        />
                                                    )}
                                            </View>
                                            <Text style={styles.statusLabel}>
                                                Inactive
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    style={[
                                        styles.saveBtn,
                                        editLoading && styles.saveBtnDisabled,
                                    ]}
                                    onPress={handleUpdateStaff}
                                    disabled={editLoading}>
                                    {editLoading ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#fff"
                                        />
                                    ) : (
                                        <>
                                            <Ionicons
                                                name="save-outline"
                                                size={20}
                                                color="#fff"
                                            />
                                            <Text style={styles.saveBtnText}>
                                                Update
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Upgrade / Pricing Modal */}
            <Modal
                visible={upgradeModal.visible}
                transparent={true}
                animationType="fade"
                onRequestClose={closeUpgradeModal}>
                <View style={styles.upgradeOverlay}>
                    <View style={styles.upgradeCard}>
                        <Text style={styles.upgradeTitle}>
                            {upgradeModal.title}
                        </Text>
                        <Text style={styles.upgradeMessage}>
                            {upgradeModal.message}
                        </Text>
                        <View style={styles.upgradeActions}>
                            <TouchableOpacity
                                style={[
                                    styles.upgradeBtn,
                                    styles.upgradeBtnPrimary,
                                ]}
                                onPress={() => {
                                    closeUpgradeModal();
                                    navigation.navigate("PricingScreen");
                                }}>
                                <Text style={styles.upgradeBtnTextPrimary}>
                                    {upgradeModal.primaryText}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.upgradeBtn,
                                    styles.upgradeBtnSecondary,
                                ]}
                                onPress={closeUpgradeModal}>
                                <Text style={styles.upgradeBtnTextSecondary}>
                                    Close
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Content */}
            {loading && staff.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2563eb" />
                    <Text style={styles.loadingText}>Loading staff...</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={styles.content}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                        />
                    }>
                    {staff.length > 0 ? (
                        <FlatList
                            scrollEnabled={false}
                            data={staff}
                            keyExtractor={(item) => item._id}
                            renderItem={StaffCard}
                            contentContainerStyle={styles.listContent}
                        />
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Ionicons
                                name="people-outline"
                                size={48}
                                color="#cbd5e1"
                            />
                            <Text style={styles.emptyText}>
                                No staff members yet
                            </Text>
                        </View>
                    )}

                    {/* Add New Button */}
                    <TouchableOpacity
                        style={[
                            styles.addBtn,
                            showAddModal && styles.addBtnDisabled,
                        ]}
                        onPress={openModal}
                        disabled={showAddModal}>
                        <Ionicons name="add-circle" size={24} color="#fff" />
                        <Text style={styles.addBtnText}>Add New Staff</Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f8fafc",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: "#fff",
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 3,
    },
    backBtn: {
        padding: 5,
    },
    placeholder: {
        width: 33,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#1e293b",
    },
	    content: {
	        flex: 1,
	        padding: 20,
	    },
        upgradeOverlay: {
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
        },
        upgradeCard: {
            width: "100%",
            maxWidth: 420,
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: 18,
            borderWidth: 1,
            borderColor: "#E2E8F0",
        },
        upgradeTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
        upgradeMessage: { marginTop: 8, fontSize: 14, color: "#334155" },
        upgradeActions: { marginTop: 14, gap: 10 },
        upgradeBtn: {
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            alignItems: "center",
        },
        upgradeBtnPrimary: { backgroundColor: "#2563EB" },
        upgradeBtnSecondary: { backgroundColor: "#F1F5F9" },
        upgradeBtnTextPrimary: { color: "#fff", fontWeight: "900" },
        upgradeBtnTextSecondary: { color: "#0F172A", fontWeight: "800" },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
        color: "#64748b",
        fontSize: 14,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 60,
    },
    emptyText: {
        marginTop: 10,
        color: "#94a3b8",
        fontSize: 14,
    },
    listContent: {
        paddingBottom: 20,
    },
    staffCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 3,
    },
    staffInfo: {
        marginBottom: 12,
    },
    staffNameRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    staffName: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1e293b",
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 11,
        fontWeight: "600",
    },
    staffEmail: {
        fontSize: 13,
        color: "#64748b",
        marginBottom: 4,
    },
    staffMobile: {
        fontSize: 13,
        color: "#64748b",
    },
    staffActions: {
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: "#f1f5f9",
        paddingTop: 12,
    },
    toggleBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 2,
        marginRight: 10,
    },
    toggleBtnText: {
        marginLeft: 8,
        fontWeight: "700",
        fontSize: 13,
        letterSpacing: 0.3,
    },
    deleteBtn: {
        padding: 8,
    },
    editBtn: {
        padding: 8,
        marginRight: 10,
    },
    addBtn: {
        backgroundColor: "#2563eb",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        borderRadius: 12,
        marginTop: 20,
        marginBottom: 20,
    },
    addBtnDisabled: {
        opacity: 0.6,
    },
    addBtnText: {
        color: "#fff",
        fontWeight: "bold",
        marginLeft: 8,
        fontSize: 15,
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    keyboardView: {
        flex: 1,
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: "90%",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
    },
    closeBtn: {
        padding: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#1e293b",
    },
    formContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#334155",
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: "#cbd5e1",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 14,
        color: "#1e293b",
        backgroundColor: "#f8fafc",
    },
    statusOptions: {
        flexDirection: "row",
        justifyContent: "space-around",
    },
    statusOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e2e8f0",
        flex: 1,
        marginHorizontal: 5,
    },
    statusOptionActive: {
        borderColor: "#2563eb",
        backgroundColor: "#dbeafe",
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "#cbd5e1",
        justifyContent: "center",
        alignItems: "center",
    },
    radioActive: {
        borderColor: "#2563eb",
    },
    radioDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "#2563eb",
    },
    statusLabel: {
        marginLeft: 8,
        fontWeight: "500",
        color: "#334155",
    },
    saveBtn: {
        backgroundColor: "#2563eb",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        borderRadius: 8,
        marginBottom: 10,
    },
    saveBtnDisabled: {
        opacity: 0.6,
    },
    saveBtnText: {
        color: "#fff",
        fontWeight: "bold",
        marginLeft: 8,
        fontSize: 15,
    },
    cancelBtn: {
        paddingVertical: 12,
        borderColor: "#cbd5e1",
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 20,
    },
    cancelBtnText: {
        textAlign: "center",
        color: "#64748b",
        fontWeight: "600",
        fontSize: 14,
    },
});
