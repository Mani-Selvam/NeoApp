import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import * as userService from "../services/userService";

const { width } = Dimensions.get("window");

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
};

const ProfileScreen = ({ navigation }) => {
    const { user, updateUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [profile, setProfile] = useState({
        name: "",
        email: "",
        mobile: "",
        logo: null
    });

    // Update States
    const [editName, setEditName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // OTP Modal States
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [otpMode, setOtpMode] = useState(null); // 'email' or 'mobile'
    const [otpStep, setOtpStep] = useState(1); // 1: Old, 2: New Input, 3: New OTP
    const [otpValue, setOtpValue] = useState("");
    const [newValue, setNewValue] = useState("");
    const [otpLoading, setOtpLoading] = useState(false);

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

    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Denied', 'We need access to your gallery to update your logo.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled) {
            const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
            handleUpdateBasic({ logo: base64Img });
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
            Alert.alert("Error", err.response?.data?.message || err.message);
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
            else await userService.initiateMobileChange();
            setShowOtpModal(true);
        } catch (err) {
            Alert.alert("Error", err.response?.data?.message || "Failed to initiate change");
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
        } catch (err) {
            Alert.alert("Error", "Invalid OTP code");
        } finally {
            setOtpLoading(false);
        }
    };

    const handleInitiateNew = async () => {
        setOtpLoading(true);
        try {
            if (otpMode === 'email') await userService.initiateNewEmail(newValue);
            else await userService.initiateNewMobile(newValue);

            setOtpStep(3);
            setOtpValue("");
        } catch (err) {
            Alert.alert("Error", err.response?.data?.message || "Failed to send OTP to new contact");
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
        } catch (err) {
            Alert.alert("Error", "Invalid OTP code for new verification");
        } finally {
            setOtpLoading(false);
        }
    };

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
                        {otpStep === 1 && `Verification code sent to your current ${otpMode}.`}
                        {otpStep === 2 && `Enter your new ${otpMode} below.`}
                        {otpStep === 3 && `Verification code sent to your new ${otpMode}.`}
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

    return (
        <SafeAreaView style={styles.container}>
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

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Account created on {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                    </Text>
                </View>
            </ScrollView>

            {renderOtpModal()}
        </SafeAreaView>
    );
};

const SafeAreaView = ({ children, style }) => (
    <View style={[{ flex: 1, backgroundColor: COLORS.bg, paddingTop: Platform.OS === 'android' ? 40 : 0 }, style]}>
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
});

export default ProfileScreen;
