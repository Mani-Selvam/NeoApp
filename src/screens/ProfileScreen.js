import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import Constants from "expo-constants";
import { useAuth } from "../contexts/AuthContext";
import getApiClient from "../services/apiClient";
import { getImageUrl } from "../services/apiConfig";
import { getEmailSettings } from "../services/emailService";
import notificationService from "../services/notificationService";
import * as userService from "../services/userService";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { confirmPermissionRequest, getUserFacingError } from "../utils/appFeedback";
import {
    buildFeatureUpgradeMessage,
    hasPlanFeature,
} from "../utils/planFeatures";

const COLORS = {
    primary: "#4F46E5",
    secondary: "#10B981",
    bg: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#0F172A",
    textDim: "#475569",
    textMuted: "#94A3B8",
    border: "#E2E8F0",
    danger: "#EF4444",
    success: "#10B981",
    warningSoft: "#FEF2F2",
};

const resolveAccountCreatedLabel = (user) => {
    const rawValue =
        user?.createdAt ||
        user?.created_at ||
        user?.createdOn ||
        user?.createdDate ||
        user?.joinedAt ||
        "";

    const parsed = rawValue ? new Date(rawValue) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString();
    }

    const objectId = String(user?._id || user?.id || "");
    if (/^[a-f\d]{24}$/i.test(objectId)) {
        const timestampHex = objectId.slice(0, 8);
        const timestamp = parseInt(timestampHex, 16) * 1000;
        const fromId = new Date(timestamp);
        if (!Number.isNaN(fromId.getTime())) {
            return fromId.toLocaleDateString();
        }
    }

    return "N/A";
};

const APP_EXTRA = Constants.expoConfig?.extra || {};
const PRIVACY_POLICY_URL = String(APP_EXTRA.privacyPolicyUrl || "").trim();

const ProfileScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { user, updateUser, logout, localLogout, billingInfo, showUpgradePrompt } = useAuth();
    const [profile, setProfile] = useState({
        name: "",
        email: "",
        mobile: "",
        logo: null
    });

    // Update States
    const [editName, setEditName] = useState("");
    const [, setIsSaving] = useState(false);

    // OTP Modal States
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpMode, setOtpMode] = useState(null); // 'email' or 'mobile'
    const [otpStep, setOtpStep] = useState(1); // 1: Old, 2: New Input, 3: New OTP
    const [otpValue, setOtpValue] = useState("");
    const [newValue, setNewValue] = useState("");
    const [otpLoading, setOtpLoading] = useState(false);
    const isStaffUser = String(user?.role || "").toLowerCase() === "staff";
    const isAdminUser = String(user?.role || "").toLowerCase() === "admin";
    const [settingsStatus, setSettingsStatus] = useState({
        whatsappConfigured: false,
        emailConfigured: false,
    });
    const [isDisablingAccount, setIsDisablingAccount] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [voiceLang, setVoiceLang] = useState("en");
    const [voiceLangOpen, setVoiceLangOpen] = useState(false);

    const openFeatureScreen = useCallback((routeName, featureKey, label) => {
        if (!hasPlanFeature(billingInfo?.plan, featureKey)) {
            showUpgradePrompt(buildFeatureUpgradeMessage(featureKey, label));
            return;
        }
        navigation.navigate(routeName);
    }, [billingInfo?.plan, navigation, showUpgradePrompt]);

    useEffect(() => {
        if (user) {
            setProfile({
                name: user.name || "",
                email: user.email || "",
                mobile: user.mobile || "",
                logo: user.logo || null
            });
            setEditName(user.name || "");
        }
    }, [user]);

    useEffect(() => {
        let active = true;
        Promise.resolve(notificationService.getNotificationVoiceLanguage?.())
            .then((lang) => {
                if (!active) return;
                setVoiceLang(lang === "ta" ? "ta" : "en");
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    const loadSettingsStatus = useCallback(async () => {
        if (isStaffUser) return;
        try {
            const client = await getApiClient();
            const [waResp, emailResp] = await Promise.allSettled([
                client.get("/whatsapp/config"),
                getEmailSettings(),
            ]);

            const waConfig =
                waResp.status === "fulfilled" ? waResp.value?.data?.config || {} : {};
            const emailConfig =
                emailResp.status === "fulfilled" ? emailResp.value || {} : {};

            const provider = String(waConfig?.provider || "").toUpperCase();
            const whatsappConfigured =
                (provider === "WATI" &&
                    Boolean(waConfig?.hasWatiCredentials || (waConfig?.watiBaseUrl && (waConfig?.apiToken || waConfig?.watiApiToken)))) ||
                (provider === "META" &&
                    Boolean(waConfig?.hasMetaCredentials || (waConfig?.metaWhatsappToken && waConfig?.metaPhoneNumberId))) ||
                (provider === "NEO" &&
                    Boolean(waConfig?.hasNeoCredentials || (waConfig?.neoAccountName && waConfig?.neoPhoneNumber && (waConfig?.neoApiKey || waConfig?.neoBearerToken)))) ||
                (provider === "TWILIO" &&
                    Boolean(waConfig?.hasTwilioCredentials || (waConfig?.twilioAccountSid && waConfig?.twilioAuthToken && waConfig?.twilioWhatsappNumber))) ||
                false;

            const settings = emailConfig?.settings || emailConfig || {};
            const emailConfigured = Boolean(
                settings?.smtpHost &&
                    settings?.smtpPort &&
                    settings?.smtpUser &&
                    (settings?.hasPassword || settings?.smtpPass),
            );

            setSettingsStatus({
                whatsappConfigured,
                emailConfigured,
            });
        } catch (_error) {
            setSettingsStatus({
                whatsappConfigured: false,
                emailConfigured: false,
            });
        }
    }, [isStaffUser]);

    useFocusEffect(
        useCallback(() => {
            loadSettingsStatus();
            return () => {};
        }, [loadSettingsStatus])
    );

    const handlePickImage = async () => {
        const confirmed = await confirmPermissionRequest({
            title: "Allow photo access?",
            message:
                "Photo access is only used when you choose a logo or profile image from your gallery.",
            confirmText: "Continue",
        });
        if (!confirmed) return;

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission denied', 'Gallery access is needed only to pick a logo image.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled && result.assets?.[0]) {
            const asset = result.assets[0];
            handleUpdateBasic({
                logo: {
                    uri: asset.uri,
                    type: asset.mimeType || "image/jpeg",
                    name: asset.fileName || `profile-logo-${Date.now()}.jpg`,
                },
            });
        }
    };

    const handleUpdateBasic = async (updates) => {
        setIsSaving(true);
        try {
            const res = await userService.updateProfile({ ...profile, ...updates });
            if (res.success) {
                // Update local context
                await updateUser(res.user);
                Alert.alert("Success", res.message);
            }
        } catch (err) {
            Alert.alert("Error", getUserFacingError(err, "Failed to update profile"));
        } finally {
            setIsSaving(false);
        }
    };

    // --- OTP FLOW HANDLERS ---

    const startChangeFlow = async (mode) => {
        setOtpMode(mode);
        setOtpStep(1);
        setOtpValue("");
        setNewValue("");
        setOtpLoading(true);
        try {
            if (mode === 'email') await userService.initiateEmailChange();
            else await userService.initiateMobileChange("whatsapp");
            setShowOtpModal(true);
        } catch (err) {
            Alert.alert("Error", getUserFacingError(err, "Failed to initiate change"));
        } finally {
            setOtpLoading(false);
        }
    };

    const handleVerifyCurrent = async () => {
        setOtpLoading(true);
        try {
            if (otpMode === 'email') await userService.verifyCurrentEmail(otpValue);
            else await userService.verifyCurrentMobile(otpValue);

            setOtpStep(2);
            setOtpValue("");
        } catch (_err) {
            Alert.alert("Error", "Invalid OTP code");
        } finally {
            setOtpLoading(false);
        }
    };

    const handleInitiateNew = async () => {
        setOtpLoading(true);
        try {
            if (otpMode === 'email') await userService.initiateNewEmail(newValue);
            else await userService.initiateNewMobile(newValue, "whatsapp");

            setOtpStep(3);
            setOtpValue("");
        } catch (err) {
            Alert.alert("Error", getUserFacingError(err, "Failed to send OTP to new contact"));
        } finally {
            setOtpLoading(false);
        }
    };

    const handleVerifyNew = async () => {
        setOtpLoading(true);
        try {
            let res;
            if (otpMode === 'email') res = await userService.verifyNewEmail(otpValue);
            else res = await userService.verifyNewMobile(otpValue);

            if (res.success) {
                await updateUser(res.user);
                setShowOtpModal(false);
                Alert.alert("Success", `${otpMode === 'email' ? 'Email' : 'Mobile'} updated successfully!`);
            }
        } catch (_err) {
            Alert.alert("Error", "Invalid OTP code for new verification");
        } finally {
            setOtpLoading(false);
        }
    };

    const handleLogoutPress = () => {
        Alert.alert(
            "Logout",
            "Are you sure you want to logout?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Logout",
                    style: "destructive",
                    onPress: async () => {
                        await logout();
                    },
                },
            ],
        );
    };

    const handleDeleteAccountPress = () => {
        Alert.alert(
            "Delete company account?",
            "This will permanently remove your company, staff, admins, enquiries, follow-ups, plans, payments, and related workspace data. This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Continue",
                    style: "destructive",
                    onPress: () => {
                        Alert.alert(
                            "Final confirmation",
                            "Are you sure you want to permanently delete this company account and all related records?",
                            [
                                { text: "No", style: "cancel" },
                                {
                                    text: "Delete permanently",
                                    style: "destructive",
                                    onPress: async () => {
                                        setIsDeletingAccount(true);
                                        try {
                                            await userService.deleteCompanyAccount();
                                            Alert.alert(
                                                "Company deleted",
                                                "Your company account and all related data have been permanently removed.",
                                                [
                                                    {
                                                        text: "OK",
                                                        onPress: async () => {
                                                            await localLogout();
                                                        },
                                                    },
                                                ],
                                            );
                                        } catch (error) {
                                            Alert.alert(
                                                "Delete failed",
                                                getUserFacingError(
                                                    error,
                                                    "Unable to delete the company account right now",
                                                ),
                                            );
                                        } finally {
                                            setIsDeletingAccount(false);
                                        }
                                    },
                                },
                            ],
                        );
                    },
                },
            ],
        );
    };

    const handleDisableAccountPress = () => {
        Alert.alert(
            "Disable company account?",
            "This will block login access for this company. Existing users will be logged out, and the app will use the current restricted-account flow until you reactivate it later.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Disable",
                    style: "destructive",
                    onPress: async () => {
                        setIsDisablingAccount(true);
                        try {
                            await userService.disableCompanyAccount();
                            Alert.alert(
                                "Account disabled",
                                "This company is now blocked. Users will see the restricted access flow on login.",
                                [
                                    {
                                        text: "OK",
                                        onPress: async () => {
                                            await localLogout();
                                        },
                                    },
                                ],
                            );
                        } catch (error) {
                            Alert.alert(
                                "Disable failed",
                                getUserFacingError(
                                    error,
                                    "Unable to disable the company account right now",
                                ),
                            );
                        } finally {
                            setIsDisablingAccount(false);
                        }
                    },
                },
            ],
        );
    };

    const openManagedUrl = async (url, label) => {
        if (!url) {
            Alert.alert("Link unavailable", `${label} link is not configured yet.`);
            return;
        }

        if (/example\.com/i.test(url)) {
            Alert.alert(
                "Setup needed",
                `Replace the placeholder ${label.toLowerCase()} URL before publishing to Google Play.`,
            );
            return;
        }

        try {
            const supported = await Linking.canOpenURL(url);
            if (!supported) {
                Alert.alert("Link unavailable", `Unable to open ${label.toLowerCase()} on this device.`);
                return;
            }
            await Linking.openURL(url);
        } catch (_error) {
            Alert.alert("Link unavailable", `Unable to open ${label.toLowerCase()} right now.`);
        }
    };

    const renderStatusBadge = (configured) => (
        <View
            style={[
                styles.statusBadge,
                configured ? styles.statusBadgeOk : styles.statusBadgeOff,
            ]}>
            <Ionicons
                name={configured ? "checkmark-circle" : "close-circle"}
                size={16}
                color={configured ? COLORS.success : COLORS.danger}
            />
        </View>
    );

    const renderOtpModal = () => (
        <Modal visible={showOtpModal} transparent animationType="slide">
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalOverlay}
            >
                <MotiView
                    from={{ translateY: 300 }}
                    animate={{ translateY: 0 }}
                    style={styles.modalContent}
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                            Change {otpMode === 'email' ? 'Email Address' : 'Mobile Number'}
                        </Text>
                        <TouchableOpacity onPress={() => setShowOtpModal(false)}>
                            <Ionicons name="close" size={24} color={COLORS.textDim} />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.modalSubtitle}>
                        {otpStep === 1 && `Verification code sent to your current ${otpMode === 'mobile' ? 'WhatsApp mobile' : otpMode}.`}
                        {otpStep === 2 && `Enter your new ${otpMode} below.`}
                        {otpStep === 3 && `Verification code sent to your new ${otpMode === 'mobile' ? 'WhatsApp mobile' : otpMode}.`}
                    </Text>

                    {otpStep !== 2 ? (
                        <View style={styles.otpInputContainer}>
                            <TextInput
                                style={styles.otpInput}
                                placeholder="Enter 6-digit OTP"
                                keyboardType="number-pad"
                                maxLength={6}
                                value={otpValue}
                                onChangeText={setOtpValue}
                            />
                        </View>
                    ) : (
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder={otpMode === 'email' ? "new-email@example.com" : "new mobile number"}
                                keyboardType={otpMode === 'email' ? "email-address" : "phone-pad"}
                                value={newValue}
                                onChangeText={setNewValue}
                                autoCapitalize="none"
                            />
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.primaryBtn, otpLoading && styles.btnDisabled]}
                        disabled={otpLoading}
                        onPress={() => {
                            if (otpStep === 1) handleVerifyCurrent();
                            else if (otpStep === 2) handleInitiateNew();
                            else handleVerifyNew();
                        }}
                    >
                        {otpLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.primaryBtnText}>
                                {otpStep === 1 ? "Verify Current" : otpStep === 2 ? "Send OTP" : "Complete Change"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </MotiView>
            </KeyboardAvoidingView>
        </Modal>
    );

    const renderVoiceLangModal = () => (
        <Modal
            visible={voiceLangOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setVoiceLangOpen(false)}
        >
            <TouchableOpacity
                activeOpacity={1}
                style={styles.modalOverlay}
                onPress={() => setVoiceLangOpen(false)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    style={styles.voiceModalContent}
                    onPress={() => {}}
                >
                    <View style={styles.voiceModalHeader}>
                        <Text style={styles.voiceModalTitle}>Notification Voice</Text>
                        <TouchableOpacity onPress={() => setVoiceLangOpen(false)}>
                            <Ionicons name="close" size={22} color={COLORS.textDim} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.voiceModalSub}>
                        Choose Tamil or English for voice reminders.
                    </Text>

                    <View style={styles.voiceLangRow}>
                        <TouchableOpacity
                            style={[
                                styles.voiceLangChip,
                                voiceLang === "en" && styles.voiceLangChipActive,
                            ]}
                            onPress={async () => {
                                setVoiceLang("en");
                                await notificationService.setNotificationVoiceLanguage?.("en");
                                setVoiceLangOpen(false);
                            }}
                        >
                            <Text
                                style={[
                                    styles.voiceLangChipText,
                                    voiceLang === "en" && styles.voiceLangChipTextActive,
                                ]}
                            >
                                English
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.voiceLangChip,
                                voiceLang === "ta" && styles.voiceLangChipActive,
                            ]}
                            onPress={async () => {
                                setVoiceLang("ta");
                                await notificationService.setNotificationVoiceLanguage?.("ta");
                                setVoiceLangOpen(false);
                            }}
                        >
                            <Text
                                style={[
                                    styles.voiceLangChipText,
                                    voiceLang === "ta" && styles.voiceLangChipTextActive,
                                ]}
                            >
                                தமிழ்
                            </Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );

    return (
        <SafeAreaView style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Logo Section */}
                <View style={styles.logoSection}>
                    <TouchableOpacity onPress={handlePickImage} style={styles.logoContainer}>
                        {profile.logo ? (
                            <Image source={{ uri: getImageUrl(profile.logo) }} style={styles.logo} />
                        ) : (
                            <LinearGradient colors={["#4F46E5", "#6366F1"]} style={styles.logoPlaceholder}>
                                <Text style={styles.logoInitial}>
                                    {profile.name ? profile.name[0].toUpperCase() : "U"}
                                </Text>
                            </LinearGradient>
                        )}
                        <View style={styles.editBadge}>
                            <Ionicons name="camera" size={16} color="#fff" />
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.logoInstruction}>Tap to change logo</Text>
                </View>

                {/* Form Section */}
                <View style={styles.section}>
                    <Text style={styles.label}>Personal Name</Text>
                    <View style={styles.inputWrapper}>
                        <Ionicons name="person-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Enter your name"
                        />
                        {editName !== profile.name && (
                            <TouchableOpacity
                                style={styles.inlineUpdateBtn}
                                onPress={() => handleUpdateBasic({ name: editName })}
                            >
                                <Text style={styles.inlineUpdateBtnText}>Save</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Email Address</Text>
                    <View style={styles.infoWrapper}>
                        <Ionicons name="mail-outline" size={20} color={COLORS.textMuted} />
                        <Text style={styles.infoValue}>{profile.email}</Text>
                        {/* Email change option removed per user request */}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Mobile Number</Text>
                    <View style={styles.infoWrapper}>
                        <Ionicons name="phone-portrait-outline" size={20} color={COLORS.textMuted} />
                        <Text style={styles.infoValue}>{profile.mobile}</Text>
                        <TouchableOpacity style={styles.changeBtn} onPress={() => startChangeFlow('mobile')}>
                            <Text style={styles.changeBtnText}>Change</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Notifications</Text>
                    <View style={styles.settingsCard}>
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() => setVoiceLangOpen(true)}
                        >
                            <View style={styles.settingsIconWrap}>
                                <Ionicons name="volume-high-outline" size={18} color={COLORS.primary} />
                            </View>
                            <View style={styles.settingsContent}>
                                <Text style={styles.settingsTitle}>Voice Language</Text>
                                <Text style={styles.settingsSub}>
                                    Currently: {voiceLang === "ta" ? "Tamil" : "English"}
                                </Text>
                            </View>
                            <View style={styles.voiceLangPill}>
                                <Text style={styles.voiceLangPillText}>
                                    {voiceLang === "ta" ? "TA" : "EN"}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Major Settings</Text>
                    <View style={styles.settingsCard}>
                        {!isStaffUser ? (
                            <>
                                <TouchableOpacity
                                    style={styles.settingsRow}
                                    onPress={() => navigation.navigate("PublicLeadFormScreen")}
                                >
                                    <View style={styles.settingsIconWrap}>
                                        <Ionicons name="globe-outline" size={18} color={COLORS.primary} />
                                    </View>
                                    <View style={styles.settingsContent}>
                                        <Text style={styles.settingsTitle}>Public Lead Form</Text>
                                        <Text style={styles.settingsSub}>Share a company form link and collect social media enquiries</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.settingsRow}
                                    onPress={() => openFeatureScreen("WhatsAppSettings", "whatsapp", "WhatsApp Settings")}
                                >
                                    <View style={styles.settingsIconWrap}>
                                        <Ionicons name="logo-whatsapp" size={18} color={COLORS.primary} />
                                    </View>
                                    <View style={styles.settingsContent}>
                                        <Text style={styles.settingsTitle}>WhatsApp Settings</Text>
                                        <Text style={styles.settingsSub}>Manage business number and templates</Text>
                                    </View>
                                    {renderStatusBadge(settingsStatus.whatsappConfigured)}
                                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.settingsRow}
                                    onPress={() => openFeatureScreen("EmailSettingsScreen", "email", "Email Settings")}
                                >
                                    <View style={styles.settingsIconWrap}>
                                        <Ionicons name="mail-open-outline" size={18} color={COLORS.primary} />
                                    </View>
                                    <View style={styles.settingsContent}>
                                        <Text style={styles.settingsTitle}>Email Settings</Text>
                                        <Text style={styles.settingsSub}>Configure SMTP and mailbox sync</Text>
                                    </View>
                                    {renderStatusBadge(settingsStatus.emailConfigured)}
                                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            </>
                        ) : null}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Privacy & Legal</Text>
                    <View style={styles.settingsCard}>
                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() => navigation.navigate("AboutScreen")}
                        >
                            <View style={styles.settingsIconWrap}>
                                <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
                            </View>
                            <View style={styles.settingsContent}>
                                <Text style={styles.settingsTitle}>About App</Text>
                                <Text style={styles.settingsSub}>Learn about NeoApp, version details, support, and privacy</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.settingsRow}
                            onPress={() => openManagedUrl(PRIVACY_POLICY_URL, "Privacy Policy")}
                        >
                            <View style={styles.settingsIconWrap}>
                                <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
                            </View>
                            <View style={styles.settingsContent}>
                                <Text style={styles.settingsTitle}>Privacy Policy</Text>
                                <Text style={styles.settingsSub}>Review how account and enquiry data is handled</Text>
                            </View>
                            <Ionicons name="open-outline" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>

                        {isAdminUser ? (
                            <>
                                <TouchableOpacity
                                    style={styles.settingsRow}
                                    onPress={handleDisableAccountPress}
                                    disabled={isDisablingAccount}
                                >
                                    <View style={[styles.settingsIconWrap, styles.warningIconWrap]}>
                                        <Ionicons name="pause-circle-outline" size={18} color="#D97706" />
                                    </View>
                                    <View style={styles.settingsContent}>
                                        <Text style={[styles.settingsTitle, styles.warningTitle]}>
                                            Disable Company Account
                                        </Text>
                                        <Text style={styles.settingsSub}>
                                            Primary admin only. Block login access and use the existing restricted-account flow
                                        </Text>
                                    </View>
                                    {isDisablingAccount ? (
                                        <ActivityIndicator size="small" color="#D97706" />
                                    ) : (
                                        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.settingsRow}
                                    onPress={handleDeleteAccountPress}
                                    disabled={isDeletingAccount}
                                >
                                    <View style={[styles.settingsIconWrap, styles.dangerIconWrap]}>
                                        <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                                    </View>
                                    <View style={styles.settingsContent}>
                                        <Text style={[styles.settingsTitle, styles.dangerTitle]}>
                                            Delete Company Account
                                        </Text>
                                        <Text style={styles.settingsSub}>
                                            Primary admin only. Permanently remove the company, staff, admins, enquiries, follow-ups, plans, and related data
                                        </Text>
                                    </View>
                                    {isDeletingAccount ? (
                                        <ActivityIndicator size="small" color={COLORS.danger} />
                                    ) : (
                                        <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : null}
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.label}>Session</Text>
                    <View style={styles.settingsCard}>
                        <TouchableOpacity
                            style={[styles.settingsRow, styles.logoutRow]}
                            onPress={handleLogoutPress}
                        >
                            <View style={[styles.settingsIconWrap, styles.logoutIconWrap]}>
                                <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
                            </View>
                            <View style={styles.settingsContent}>
                                <Text style={[styles.settingsTitle, styles.logoutTitle]}>Logout</Text>
                                <Text style={styles.settingsSub}>Sign out from this account</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Account created on {resolveAccountCreatedLabel(user)}
                    </Text>
                </View>
            </ScrollView>

	            {renderOtpModal()}
                {renderVoiceLangModal()}
	        </SafeAreaView>
	    );
};

const SafeAreaView = ({ children, style }) => (
    <View style={[{ flex: 1, backgroundColor: COLORS.bg }, style]}>
        {children}
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderColor: COLORS.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: COLORS.text,
    },
    backBtn: {
        padding: 5,
    },
    scrollContent: {
        padding: 24,
    },
    logoSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoContainer: {
        width: 100,
        height: 100,
        borderRadius: 30,
        backgroundColor: '#fff',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    logo: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
    },
    logoPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoInitial: {
        fontSize: 40,
        color: '#fff',
        fontWeight: '800',
    },
    editBadge: {
        position: 'absolute',
        bottom: -5,
        right: -5,
        backgroundColor: COLORS.primary,
        width: 32,
        height: 32,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
    },
    logoInstruction: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: '600',
        marginTop: 12,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        fontSize: 13,
        color: COLORS.textDim,
        fontWeight: '700',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        height: 56,
    },
    infoWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.bg,
        borderRadius: 16,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        height: 56,
        opacity: 0.9,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: COLORS.text,
        fontWeight: '600',
    },
    infoValue: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textDim,
        fontWeight: '600',
        marginLeft: 12,
    },
    changeBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: COLORS.primary + '15',
        borderRadius: 10,
    },
    changeBtnText: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '700',
    },
    settingsCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
    },
    settingsRow: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap: 12,
    },
    settingsIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: COLORS.primary + '12',
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsContent: {
        flex: 1,
    },
    statusBadge: {
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 2,
    },
    statusBadgeOk: {
        opacity: 1,
    },
    statusBadgeOff: {
        opacity: 0.9,
    },
    settingsTitle: {
        fontSize: 15,
        color: COLORS.text,
        fontWeight: '700',
    },
    settingsSub: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginTop: 3,
        lineHeight: 18,
    },
    logoutRow: {
        borderBottomWidth: 0,
    },
    logoutIconWrap: {
        backgroundColor: COLORS.warningSoft,
    },
    dangerIconWrap: {
        backgroundColor: COLORS.warningSoft,
    },
    warningIconWrap: {
        backgroundColor: "#FEF3C7",
    },
    logoutTitle: {
        color: COLORS.danger,
    },
    warningTitle: {
        color: "#B45309",
    },
    dangerTitle: {
        color: COLORS.danger,
    },
    inlineUpdateBtn: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: COLORS.primary,
        borderRadius: 10,
    },
    inlineUpdateBtnText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '700',
    },
    footer: {
        marginTop: 40,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: '500',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        justifyContent: 'flex-end',
    },
	    modalContent: {
	        backgroundColor: '#fff',
	        borderTopLeftRadius: 32,
	        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: COLORS.text,
    },
    modalSubtitle: {
        fontSize: 14,
        color: COLORS.textDim,
        lineHeight: 22,
        marginBottom: 24,
    },
    otpInputContainer: {
        marginBottom: 24,
    },
    otpInput: {
        height: 56,
        backgroundColor: COLORS.bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        textAlign: 'center',
        fontSize: 24,
        fontWeight: '800',
        color: COLORS.primary,
        letterSpacing: 10,
    },
    inputContainer: {
        marginBottom: 24,
    },
    primaryBtn: {
        height: 56,
        backgroundColor: COLORS.primary,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    btnDisabled: {
        opacity: 0.6,
        backgroundColor: COLORS.textMuted,
    },
	    primaryBtnText: {
	        fontSize: 16,
	        color: '#fff',
	        fontWeight: '700',
	    },

        voiceModalContent: {
            backgroundColor: "#fff",
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            padding: 22,
            paddingBottom: Platform.OS === "ios" ? 34 : 22,
        },
        voiceModalHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
        },
        voiceModalTitle: {
            fontSize: 18,
            fontWeight: "800",
            color: COLORS.text,
        },
        voiceModalSub: {
            fontSize: 13,
            color: COLORS.textDim,
            lineHeight: 18,
            marginBottom: 14,
        },
        voiceLangRow: {
            flexDirection: "row",
            gap: 10,
        },
        voiceLangChip: {
            flex: 1,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingVertical: 12,
            alignItems: "center",
            backgroundColor: COLORS.bg,
        },
        voiceLangChipActive: {
            borderColor: COLORS.primary,
            backgroundColor: "#EEF2FF",
        },
        voiceLangChipText: {
            fontSize: 14,
            fontWeight: "700",
            color: COLORS.textDim,
        },
        voiceLangChipTextActive: {
            color: COLORS.primary,
        },
        voiceLangPill: {
            minWidth: 44,
            height: 28,
            paddingHorizontal: 10,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#EEF2FF",
            borderWidth: 1,
            borderColor: "#DDE3FF",
        },
        voiceLangPillText: {
            fontSize: 12,
            fontWeight: "900",
            color: COLORS.primary,
        },
	});

export default ProfileScreen;
