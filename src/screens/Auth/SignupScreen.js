import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    FadeInUp,
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import InlineAlert from "../../components/InlineAlert";
import { API_URL } from "../../services/apiConfig";
import { setPhoneVerificationSession } from "../../services/phoneVerificationSession";

const getUI = (w, h, insets) => {
    const usableHeight = h - insets.top - insets.bottom;
    const isTablet = w >= 768;
    const isLarge = w >= 414 && w < 768;
    const isMedium = w >= 360 && w < 414;
    const isSmall = w < 360;
    const isShort = usableHeight < 760;
    const isVeryShort = usableHeight < 700;
    return {
        isTablet,
        isLarge,
        isMedium,
        isSmall,
        isShort,
        isVeryShort,
        sidePadding: isTablet ? 80 : isLarge ? 28 : isMedium ? 22 : 18,
        cardMaxWidth: isTablet ? 520 : 480,
        logoSize: isTablet ? 88 : isLarge ? 76 : isMedium ? 68 : 60,
        titleSize: isTablet ? 32 : isLarge ? 27 : isMedium ? 25 : 23,
        subtitleSize: isTablet ? 15 : isLarge ? 13.5 : 13,
        inputHeight: isTablet ? 64 : isLarge ? 58 : isMedium ? 54 : 52,
        buttonHeight: isTablet ? 60 : isLarge ? 55 : isMedium ? 52 : 50,
        fieldGap: isTablet ? 22 : isLarge ? 18 : 16,
        formPadding: isTablet
            ? 40
            : isVeryShort
              ? 18
              : isLarge
                ? 28
                : isMedium
                  ? 24
                  : 20,
        radius: isTablet ? 18 : 14,
        topPad: isVeryShort
            ? Math.max(insets.top + 4, 12)
            : Math.max(insets.top + 8, 20),
        botPad: isVeryShort
            ? Math.max(insets.bottom + 12, 18)
            : Math.max(insets.bottom + 12, 24),
        minH: usableHeight,
        centerContent: !isShort,
    };
};

const getSignupOtpError = (error, fallback) => {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || "").trim();
    const serverMessage = String(error?.response?.data?.message || "").trim();

    if (serverMessage) return serverMessage;
    if (code === "ERR_NETWORK")
        return "Network error while sending OTP. Check internet and try again.";
    if (message) return `${fallback} ${message}`;
    return fallback;
};

const Orb = ({
    color,
    size,
    top,
    left,
    right,
    bottom,
    opacity = 0.3,
    delay = 0,
}) => {
    const y = useSharedValue(0);
    const s = useSharedValue(1);

    useEffect(() => {
        y.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(-16, {
                        duration: 3800,
                        easing: Easing.bezier(0.45, 0, 0.55, 1),
                    }),
                    withTiming(0, {
                        duration: 3800,
                        easing: Easing.bezier(0.45, 0, 0.55, 1),
                    }),
                ),
                -1,
                false,
            ),
        );
        s.value = withDelay(
            delay + 200,
            withRepeat(
                withSequence(
                    withTiming(1.07, {
                        duration: 4400,
                        easing: Easing.bezier(0.45, 0, 0.55, 1),
                    }),
                    withTiming(1, {
                        duration: 4400,
                        easing: Easing.bezier(0.45, 0, 0.55, 1),
                    }),
                ),
                -1,
                false,
            ),
        );
    }, [delay, s, y]);

    const anim = useAnimatedStyle(() => ({
        transform: [{ translateY: y.value }, { scale: s.value }],
    }));

    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                    opacity,
                    top,
                    left,
                    right,
                    bottom,
                },
                anim,
            ]}
        />
    );
};

const Field = ({
    label,
    icon,
    value,
    onChangeText,
    isPassword,
    showPwd,
    setShowPwd,
    placeholder,
    keyboardType = "default",
    autoCapitalize = "none",
    maxLength,
    ui,
}) => {
    const focus = useSharedValue(0);
    const [isFocused, setIsFocused] = useState(false);

    const onFocus = () => {
        setIsFocused(true);
        focus.value = withTiming(1, { duration: 220 });
    };

    const onBlur = () => {
        setIsFocused(false);
        focus.value = withTiming(0, { duration: 220 });
    };

    const wrapStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            focus.value,
            [0, 1],
            ["rgba(203,213,225,0.8)", "#6366f1"],
        ),
        borderWidth: interpolate(focus.value, [0, 1], [1.5, 2]),
        backgroundColor: interpolateColor(
            focus.value,
            [0, 1],
            ["rgba(248,250,252,0.9)", "rgba(99,102,241,0.05)"],
        ),
        shadowOpacity: interpolate(focus.value, [0, 1], [0, 0.2]),
        shadowRadius: interpolate(focus.value, [0, 1], [0, 16]),
        shadowColor: "#6366f1",
    }));

    const labelStyle = useAnimatedStyle(() => ({
        color: interpolateColor(focus.value, [0, 1], ["#94a3b8", "#6366f1"]),
        fontSize: interpolate(focus.value, [0, 1], [12.5, 11.5]),
    }));

    return (
        <View style={{ width: "100%" }}>
            <Animated.Text
                style={[
                    {
                        fontWeight: "700",
                        marginBottom: 8,
                        marginLeft: 2,
                        letterSpacing: 0.5,
                    },
                    labelStyle,
                ]}>
                {label.toUpperCase()}
            </Animated.Text>
            <Animated.View
                style={[
                    {
                        flexDirection: "row",
                        alignItems: "center",
                        height: ui.inputHeight,
                        borderRadius: ui.radius,
                        paddingHorizontal: 16,
                        overflow: "hidden",
                    },
                    wrapStyle,
                ]}>
                <Ionicons
                    name={icon}
                    size={19}
                    color={isFocused ? "#6366f1" : "#94a3b8"}
                    style={{ marginRight: 12 }}
                />
                <TextInput
                    style={{
                        flex: 1,
                        color: "#1e1b4b",
                        fontSize: 15,
                        fontWeight: "500",
                        paddingVertical: 0,
                        letterSpacing: 0.2,
                    }}
                    placeholder={placeholder}
                    placeholderTextColor="rgba(148,163,184,0.7)"
                    value={value}
                    onChangeText={onChangeText}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    secureTextEntry={isPassword && !showPwd}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={false}
                    maxLength={maxLength}
                    selectionColor="#6366f1"
                />
                {isPassword && (
                    <TouchableOpacity
                        onPress={() => setShowPwd(!showPwd)}
                        style={{ padding: 6 }}>
                        <Ionicons
                            name={showPwd ? "eye-outline" : "eye-off-outline"}
                            size={19}
                            color={isFocused ? "#6366f1" : "#94a3b8"}
                        />
                    </TouchableOpacity>
                )}
            </Animated.View>
        </View>
    );
};

const ActionButton = ({ onPress, loading, title, icon, ui }) => {
    const scale = useSharedValue(1);
    const glow = useSharedValue(0.4);

    useEffect(() => {
        glow.value = withRepeat(
            withSequence(
                withTiming(1, {
                    duration: 2200,
                    easing: Easing.bezier(0.45, 0, 0.55, 1),
                }),
                withTiming(0.4, {
                    duration: 2200,
                    easing: Easing.bezier(0.45, 0, 0.55, 1),
                }),
            ),
            -1,
            false,
        );
    }, [glow]);

    const handleIn = () => {
        scale.value = withSpring(0.96, { damping: 14 });
    };

    const handleOut = () => {
        scale.value = withSpring(1, { damping: 12 });
        onPress();
    };

    const btnStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        shadowOpacity: glow.value,
        shadowRadius: interpolate(glow.value, [0.4, 1], [14, 24]),
    }));

    return (
        <TouchableOpacity
            activeOpacity={1}
            onPressIn={handleIn}
            onPressOut={handleOut}
            disabled={loading}
            style={{ width: "100%" }}>
            <Animated.View
                style={[
                    {
                        height: ui.buttonHeight,
                        borderRadius: ui.radius,
                        overflow: "hidden",
                        shadowColor: "#6366f1",
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 12,
                        marginTop: 4,
                    },
                    btnStyle,
                ]}>
                <LinearGradient
                    colors={["#6366f1", "#818cf8", "#a5b4fc"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                    }}>
                    {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <Text
                                style={{
                                    color: "#fff",
                                    fontWeight: "900",
                                    fontSize: ui.isTablet ? 16 : 15,
                                    letterSpacing: 1.4,
                                }}>
                                {title}
                            </Text>
                            <Ionicons
                                name={icon || "arrow-forward"}
                                size={17}
                                color="#fff"
                            />
                        </>
                    )}
                </LinearGradient>
            </Animated.View>
        </TouchableOpacity>
    );
};

const PwChecklist = ({ checks }) => {
    const items = [
        { key: "length", label: "At least 8 characters" },
        { key: "upper", label: "1 uppercase letter" },
        { key: "lower", label: "1 lowercase letter" },
        { key: "number", label: "1 number" },
        { key: "special", label: "1 special character" },
    ];

    return (
        <View style={S.pwChecklist}>
            {items.map(({ key, label }) => (
                <View key={key} style={S.pwRow}>
                    <Ionicons
                        name={checks[key] ? "checkmark-circle" : "close-circle"}
                        size={15}
                        color={checks[key] ? "#10b981" : "#f87171"}
                        style={{ marginRight: 8 }}
                    />
                    <Text
                        style={[
                            S.pwText,
                            { color: checks[key] ? "#10b981" : "#94a3b8" },
                        ]}>
                        {label}
                    </Text>
                </View>
            ))}
        </View>
    );
};

const SignupScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const ui = useMemo(
        () => getUI(width, height, insets),
        [width, height, insets],
    );

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [mobile, setMobile] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const [alertType, setAlertType] = useState("error");
    const [pwChecks, setPwChecks] = useState({
        length: false,
        upper: false,
        lower: false,
        number: false,
        special: false,
    });
    const [pwMatchStatus, setPwMatchStatus] = useState("");
    const [pwMatchType, setPwMatchType] = useState("info");
    const privacyPolicyUrl = String(
        Constants.expoConfig?.extra?.privacyPolicyUrl ||
            "https://neophrondev.in/privacy/",
    ).trim();

    const formatSignupMobile = useCallback((value) => {
        const digits = String(value || "").replace(/\D/g, "");
        if (digits.length === 12 && digits.startsWith("91"))
            return `+${digits}`;
        if (digits.length === 10) return `+91${digits}`;
        return digits ? `+${digits}` : "";
    }, []);

    const showInline = (m, type = "error") => {
        const msg = String(m || "")
            .replace(/\s+/g, " ")
            .trim();
        setAlertType(type);
        setAlertMsg(msg);
        if (msg) setTimeout(() => setAlertMsg(""), 4000);
    };

    const evaluatePassword = (pw) => ({
        length: pw.length >= 8,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        number: /[0-9]/.test(pw),
        special: /[^A-Za-z0-9]/.test(pw),
    });

    useEffect(() => {
        setPwChecks(evaluatePassword(password));
    }, [password]);

    useEffect(() => {
        if (confirmPassword.length === 0) {
            setPwMatchStatus("");
            return;
        }
        if (password === confirmPassword) {
            setPwMatchStatus("Passwords match");
            setPwMatchType("success");
        } else {
            setPwMatchStatus("Passwords do not match");
            setPwMatchType("error");
        }
    }, [password, confirmPassword]);

    const handleSendOTP = async () => {
        if (!fullName || !email || !mobile || !password || !confirmPassword) {
            showInline("Please fill in all fields", "error");
            return;
        }
        if (!privacyAccepted) {
            showInline(
                "Please accept the Privacy Policy to continue.",
                "error",
            );
            return;
        }
        if (password !== confirmPassword) {
            showInline("Passwords do not match", "error");
            return;
        }

        const checks = evaluatePassword(password);
        if (!Object.values(checks).every(Boolean)) {
            const missing = [];
            if (!checks.length) missing.push("8 characters");
            if (!checks.upper) missing.push("an uppercase letter");
            if (!checks.lower) missing.push("a lowercase letter");
            if (!checks.number) missing.push("a number");
            if (!checks.special) missing.push("a special character");
            showInline(`Password must contain ${missing.join(", ")}.`, "error");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showInline("Invalid email address", "error");
            return;
        }

        const formattedMobile = formatSignupMobile(mobile);
        if (
            !formattedMobile ||
            formattedMobile.replace(/\D/g, "").length < 12
        ) {
            showInline("Enter a valid 10-digit mobile number", "error");
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${API_URL}/auth/check-user`, {
                email: email.trim().toLowerCase(),
                mobile: formattedMobile,
            });

            await axios.post(`${API_URL}/auth/send-otp`, {
                email: email.trim().toLowerCase(),
                mobile: formattedMobile,
                type: "signup",
                method: "whatsapp",
            });

            setPhoneVerificationSession({
                signupData: {
                    name: fullName.trim(),
                    email: email.trim().toLowerCase(),
                    password,
                    confirmPassword,
                    mobile: formattedMobile,
                    privacyPolicyAccepted: true,
                    privacyPolicyUrl,
                },
            });

            navigation.navigate("OtpVerification", {
                phoneNumber: formattedMobile,
            });
        } catch (e) {
            showInline(getSignupOtpError(e, "Failed to send OTP."), "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={S.root}>
            <StatusBar
                barStyle="dark-content"
                backgroundColor="#f0f4ff"
                translucent
            />

            <LinearGradient
                colors={["#f0f4ff", "#fafbff", "#eef2ff"]}
                style={StyleSheet.absoluteFill}
            />

            <Orb
                color="#a5b4fc"
                size={420}
                top={-160}
                left={-160}
                opacity={0.45}
                delay={0}
            />
            <Orb
                color="#c4b5fd"
                size={340}
                bottom={-130}
                right={-130}
                opacity={0.35}
                delay={700}
            />
            <Orb
                color="#93c5fd"
                size={200}
                top="40%"
                left={-70}
                opacity={0.28}
                delay={350}
            />

            <View
                style={[
                    S.ring,
                    {
                        width: 560,
                        height: 560,
                        top: -230,
                        left: -210,
                        borderRadius: 280,
                    },
                ]}
            />
            <View
                style={[
                    S.ring,
                    {
                        width: 380,
                        height: 380,
                        bottom: -150,
                        right: -150,
                        borderRadius: 190,
                    },
                ]}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={
                    Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0
                }
                style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={[
                        {
                            flexGrow: 1,
                            justifyContent: ui.centerContent
                                ? "center"
                                : "flex-start",
                            minHeight: ui.minH,
                            paddingHorizontal: ui.sidePadding,
                            paddingTop: ui.topPad,
                            paddingBottom: ui.botPad,
                        },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    overScrollMode="never">
                    <Animated.View
                        entering={FadeInDown.delay(80)
                            .duration(650)
                            .springify()}
                        style={[
                            S.header,
                            {
                                marginBottom: ui.isTablet
                                    ? 44
                                    : ui.isVeryShort
                                      ? 22
                                      : 34,
                            },
                        ]}>
                        <View
                            style={[
                                S.logoRing,
                                {
                                    width: ui.logoSize + 28,
                                    height: ui.logoSize + 28,
                                    borderRadius: (ui.logoSize + 28) / 2,
                                    marginBottom: 20,
                                },
                            ]}>
                            <View
                                style={[
                                    S.logoCircle,
                                    {
                                        width: ui.logoSize,
                                        height: ui.logoSize,
                                        borderRadius: ui.logoSize / 2,
                                    },
                                ]}>
                                <Ionicons
                                    name="person-add-outline"
                                    size={Math.round(ui.logoSize * 0.42)}
                                    color="#6366f1"
                                />
                            </View>
                        </View>
                        <Text style={[S.title, { fontSize: ui.titleSize }]}>
                            CREATE ACCOUNT
                        </Text>
                        <View style={S.accentLine} />
                    </Animated.View>

                    <Animated.View
                        entering={FadeInUp.delay(220).duration(680).springify()}
                        style={[
                            S.card,
                            {
                                maxWidth: ui.cardMaxWidth,
                                alignSelf: "center",
                                width: "100%",
                                borderRadius: ui.radius + 10,
                            },
                        ]}>
                        <LinearGradient
                            colors={["rgba(99,102,241,0.07)", "transparent"]}
                            style={[
                                S.cardTopGlow,
                                {
                                    borderTopLeftRadius: ui.radius + 10,
                                    borderTopRightRadius: ui.radius + 10,
                                },
                            ]}
                        />

                        <View
                            style={[S.cardInner, { padding: ui.formPadding }]}>
                            <InlineAlert
                                message={alertMsg}
                                type={alertType}
                                onClose={() => setAlertMsg("")}
                            />

                            <Animated.View entering={FadeInDown.duration(400)}>
                                <View style={{ marginBottom: ui.fieldGap }}>
                                    <Field
                                        label="Full Name"
                                        icon="person-outline"
                                        value={fullName}
                                        onChangeText={setFullName}
                                        placeholder="Enter your full name"
                                        autoCapitalize="words"
                                        ui={ui}
                                    />
                                </View>

                                <View style={{ marginBottom: ui.fieldGap }}>
                                    <Field
                                        label="Email Address"
                                        icon="mail-outline"
                                        value={email}
                                        onChangeText={setEmail}
                                        placeholder="you@example.com"
                                        keyboardType="email-address"
                                        ui={ui}
                                    />
                                </View>

                                <View style={{ marginBottom: ui.fieldGap }}>
                                    <Field
                                        label="Mobile Number"
                                        icon="call-outline"
                                        value={mobile}
                                        onChangeText={(t) =>
                                            setMobile(t.replace(/[^0-9]/g, ""))
                                        }
                                        placeholder="Enter 10-digit number"
                                        keyboardType="numeric"
                                        maxLength={10}
                                        ui={ui}
                                    />
                                </View>

                                <View style={{ marginBottom: 4 }}>
                                    <Field
                                        label="Password"
                                        icon="lock-closed-outline"
                                        value={password}
                                        onChangeText={setPassword}
                                        isPassword
                                        showPwd={showPassword}
                                        setShowPwd={setShowPassword}
                                        placeholder="Create a strong password"
                                        ui={ui}
                                    />
                                </View>

                                {password.length > 0 && (
                                    <PwChecklist checks={pwChecks} />
                                )}

                                <View
                                    style={{
                                        marginBottom: ui.fieldGap,
                                        marginTop: password.length > 0 ? 8 : 0,
                                    }}>
                                    <Field
                                        label="Confirm Password"
                                        icon="lock-closed-outline"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        isPassword
                                        showPwd={showConfirmPassword}
                                        setShowPwd={setShowConfirmPassword}
                                        placeholder="Repeat your password"
                                        ui={ui}
                                    />
                                    {confirmPassword.length > 0 &&
                                    pwMatchStatus ? (
                                        <Text
                                            style={{
                                                color:
                                                    pwMatchType === "success"
                                                        ? "#10b981"
                                                        : "#f87171",
                                                fontSize: 13,
                                                fontWeight: "600",
                                                marginTop: 6,
                                                marginLeft: 4,
                                            }}>
                                            {pwMatchStatus}
                                        </Text>
                                    ) : null}
                                </View>

                                <TouchableOpacity
                                    style={S.privacyRow}
                                    activeOpacity={0.85}
                                    onPress={() =>
                                        setPrivacyAccepted((prev) => !prev)
                                    }>
                                    <View
                                        style={[
                                            S.checkbox,
                                            privacyAccepted &&
                                                S.checkboxChecked,
                                        ]}>
                                        {privacyAccepted ? (
                                            <Ionicons
                                                name="checkmark"
                                                size={14}
                                                color="#fff"
                                            />
                                        ) : null}
                                    </View>
                                    <Text style={S.privacyText}>
                                        I agree to the{" "}
                                        <Text
                                            style={S.privacyLink}
                                            onPress={async () => {
                                                try {
                                                    await Linking.openURL(
                                                        privacyPolicyUrl,
                                                    );
                                                } catch (_error) {
                                                    showInline(
                                                        "Unable to open Privacy Policy right now.",
                                                        "error",
                                                    );
                                                }
                                            }}>
                                            Privacy Policy
                                        </Text>
                                    </Text>
                                </TouchableOpacity>

                                <ActionButton
                                    onPress={handleSendOTP}
                                    loading={loading}
                                    title="SEND OTP"
                                    icon="arrow-forward"
                                    ui={ui}
                                />
                            </Animated.View>
                        </View>
                    </Animated.View>

                    <Animated.View
                        entering={FadeIn.delay(480).duration(550)}
                        style={[
                            S.footer,
                            {
                                marginTop: ui.isTablet
                                    ? 28
                                    : ui.isVeryShort
                                      ? 14
                                      : 20,
                            },
                        ]}>
                        <Text style={S.footerText}>
                            Already have an account?{" "}
                        </Text>
                        <TouchableOpacity
                            onPress={() => navigation.navigate("Login")}>
                            <Text style={S.footerLink}>Sign In →</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
};

const S = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#f0f4ff" },
    ring: {
        position: "absolute",
        borderWidth: 1,
        borderColor: "rgba(99,102,241,0.12)",
    },
    header: { alignItems: "center" },
    logoRing: {
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(99,102,241,0.2)",
        backgroundColor: "rgba(99,102,241,0.06)",
    },
    logoCircle: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(99,102,241,0.1)",
        shadowColor: "#6366f1",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 18,
        elevation: 8,
    },
    title: {
        fontWeight: "900",
        color: "#1e1b4b",
        letterSpacing: 2.5,
        marginBottom: 10,
    },
    accentLine: {
        width: 40,
        height: 2.5,
        borderRadius: 2,
        backgroundColor: "#6366f1",
        marginBottom: 12,
        shadowColor: "#6366f1",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 4,
    },
    card: {
        overflow: "hidden",
        backgroundColor: "rgba(255, 255, 255, 0.92)",
        borderWidth: 1,
        borderColor: "rgba(99,102,241,0.1)",
        shadowColor: "#6366f1",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 36,
        elevation: 18,
        marginBottom: 4,
    },
    cardTopGlow: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 70,
    },
    cardInner: {},
    pwChecklist: {
        marginTop: 10,
        marginBottom: 4,
        paddingHorizontal: 4,
        paddingVertical: 10,
        backgroundColor: "rgba(99,102,241,0.04)",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "rgba(99,102,241,0.08)",
    },
    pwRow: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: 3,
        paddingHorizontal: 8,
    },
    pwText: {
        fontSize: 12.5,
        fontWeight: "600",
        letterSpacing: 0.2,
    },
    privacyRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 18,
        paddingHorizontal: 2,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: "rgba(99,102,241,0.32)",
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 2,
    },
    checkboxChecked: {
        backgroundColor: "#6366f1",
        borderColor: "#6366f1",
    },
    privacyText: {
        flex: 1,
        color: "#475569",
        fontSize: 13,
        lineHeight: 20,
        fontWeight: "600",
    },
    privacyLink: {
        color: "#4f46e5",
        fontWeight: "800",
        textDecorationLine: "underline",
    },
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
    },
    footerText: { color: "#94a3b8", fontSize: 13.5, fontWeight: "500" },
    footerLink: {
        color: "#6366f1",
        fontWeight: "800",
        fontSize: 13.5,
        letterSpacing: 0.3,
    },
});

export default SignupScreen;
