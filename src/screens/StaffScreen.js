import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    useWindowDimensions,
    View,
} from "react-native";
import {
    SafeAreaView,
    useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ListSkeleton } from "../components/skeleton/screens";
import { SkeletonPulse } from "../components/skeleton/Skeleton";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import * as staffService from "../services/staffService";
import { getUserFacingError } from "../utils/appFeedback";

const T = {
  bg: "#f5f4f0",
  card: "#ffffff",
  ink: "#0b0f1a",
  mid: "#4b5563",
  mute: "#9ca3af",
  line: "#e8e8e3",
  danger: "#b91c1c",
  dangerLight: "#fef2f2",
  activeText: "#14532d",
  activeBg: "#f0fdf4",
  radius: 8,
  radiusLg: 14,
};

const initials = (name) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

const getOrdinalWord = (position) => {
  const words = {
    1: "Main",
    2: "Secondary",
    3: "Third",
    4: "Fourth",
    5: "Fifth",
  };
  return words[position] || `${position}th`;
};

function StaffField({
  label,
  fieldKey,
  placeholder,
  keyboard = "default",
  secure = false,
  showSecure = false,
  onToggleSecure,
  next,
  onSubmit,
  value,
  onChange,
  inputRef,
  editable = true,
  autoComplete,
  focusedField,
  setFocusedField,
  loading = false,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fLbl}>{label}</Text>
      <View style={secure ? styles.pwRow : null}>
        <TextInput
          ref={inputRef}
          style={[
            styles.fInput,
            secure && { flex: 1 },
            !editable && styles.fInputDisabled,
            focusedField === fieldKey && styles.fInputFocus,
          ]}
          placeholder={placeholder}
          placeholderTextColor={T.mute}
          keyboardType={keyboard}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocusedField(fieldKey)}
          onBlur={() => setFocusedField(null)}
          editable={editable && !loading}
          autoCapitalize={fieldKey === "name" ? "words" : "none"}
          secureTextEntry={secure && !showSecure}
          returnKeyType={next ? "next" : "done"}
          onSubmitEditing={onSubmit}
          blurOnSubmit={!next}
          autoComplete={autoComplete}
          maxLength={fieldKey === "mobile" ? 10 : undefined}
        />
        {secure ? (
          <TouchableOpacity
            onPress={onToggleSecure}
            style={styles.eyeBtn}
            disabled={loading}
          >
            <Ionicons
              name={showSecure ? "eye-off-outline" : "eye-outline"}
              size={16}
              color={T.mid}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function PasswordChecklist({ checks }) {
  const items = [
    { key: "length", label: "At least 8 characters" },
    { key: "upper", label: "1 uppercase letter" },
    { key: "lower", label: "1 lowercase letter" },
    { key: "number", label: "1 number" },
    { key: "special", label: "1 special character" },
  ];

  return (
    <View style={styles.pwChecklist}>
      {items.map(({ key, label }) => (
        <View key={key} style={styles.pwRuleRow}>
          <Ionicons
            name={checks[key] ? "checkmark-circle" : "close-circle"}
            size={15}
            color={checks[key] ? "#10b981" : "#f87171"}
            style={{ marginRight: 8 }}
          />
          <Text
            style={[
              styles.pwRuleText,
              { color: checks[key] ? "#10b981" : "#94a3b8" },
            ]}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StaffRadioRow({
  current,
  onSet,
  disabled,
  options = ["Active", "Inactive"],
  disabledOptions = [],
}) {
  return (
    <View style={styles.radioRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[
            styles.radioOpt,
            current === opt && styles.radioOptActive,
            disabledOptions.includes(opt) && styles.radioOptDisabled,
          ]}
          onPress={() => !disabled && !disabledOptions.includes(opt) && onSet(opt)}
          disabled={disabled || disabledOptions.includes(opt)}
        >
          <View
            style={[
              styles.radioBall,
              current === opt && styles.radioBallActive,
              disabledOptions.includes(opt) && styles.radioBallDisabled,
            ]}
          >
            {current === opt && <View style={styles.radioDot} />}
          </View>
          <Text
            style={[
              styles.radioLbl,
              current === opt && styles.radioLblActive,
              disabledOptions.includes(opt) && styles.radioLblDisabled,
            ]}
          >
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StaffSheet({
  visible,
  onClose,
  title,
  eyebrow,
  children,
  loading,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => !loading && onClose()}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.overlayKb}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetPull} />
            <View style={styles.sheetHdr}>
              <View>
                <Text style={styles.sheetEye}>{eyebrow}</Text>
                <Text style={styles.sheetTitle}>{title}</Text>
              </View>
              <TouchableOpacity
                onPress={() => !loading && onClose()}
                style={styles.sheetClose}
                disabled={loading}
              >
                <Ionicons name="close" size={18} color={T.mid} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetDivider} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetBody}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function StaffScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, billingPlan, refreshBillingPlan } = useAuth();
  const isTablet = width >= 768;
  const pad = width >= 1024 ? 32 : width >= 768 ? 24 : 20;

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const [addPwVisible, setAddPwVisible] = useState(false);
  const [pwChecks, setPwChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
  });
  const [upgrade, setUpgrade] = useState({
    visible: false,
    title: "",
    message: "",
    primaryText: "Upgrade",
  });
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    role: "Staff",
    status: "Active",
  });
  const [formNotice, setFormNotice] = useState("");
  const [focusedField, setFocusedField] = useState(null);

  const adminCount = staff.filter(
    (member) => String(member?.role || "").toLowerCase() === "admin",
  ).length;
  const staffCount = staff.filter(
    (member) => String(member?.role || "staff").toLowerCase() === "staff",
  ).length;
  const maxAdmins = Number(billingPlan?.maxAdmins || 0);
  const maxStaff = Number(billingPlan?.maxStaff || 0);
  const adminLimitReached = Boolean(billingPlan) && maxAdmins > 0 && adminCount >= maxAdmins;
  const staffLimitReached = Boolean(billingPlan) && maxStaff > 0 && staffCount >= maxStaff;
  const availableAddRoles = [
    !staffLimitReached ? "Staff" : null,
    !adminLimitReached ? "Admin" : null,
  ].filter(Boolean);
  const adminRoleLabelMap = useMemo(() => {
    const sortedAdmins = [...staff]
      .filter((member) => String(member?.role || "").toLowerCase() === "admin")
      .sort(
        (a, b) =>
          new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime(),
      );

    return sortedAdmins.reduce((acc, member, index) => {
      acc[member._id] = `${getOrdinalWord(index + 1)} Admin`;
      return acc;
    }, {});
  }, [staff]);

  const nameInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const mobileInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoadError("");
      setLoading(true);
      const d = await staffService.getAllStaff();
      setStaff(Array.isArray(d) ? d : []);
      refreshBillingPlan?.().catch(() => {});
    } catch (error) {
      setLoadError(getUserFacingError(error, "Failed to fetch staff"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const resetForm = useCallback(
    () => {
      setForm({
        name: "",
        email: "",
        mobile: "",
        password: "",
        role: "Staff",
        status: "Active",
      });
      setAddPwVisible(false);
      setFormNotice("");
    },
    [],
  );
  const setField = useCallback(
    (f, v) => setForm((p) => ({ ...p, [f]: v })),
    [],
  );
  const setEditField = (f, v) => setEditData((p) => ({ ...p, [f]: v }));
  const evaluatePassword = useCallback((pw) => ({
    length: String(pw || "").length >= 8,
    upper: /[A-Z]/.test(String(pw || "")),
    lower: /[a-z]/.test(String(pw || "")),
    number: /[0-9]/.test(String(pw || "")),
    special: /[^A-Za-z0-9]/.test(String(pw || "")),
  }), []);

  useEffect(() => {
    setPwChecks(evaluatePassword(form.password));
  }, [evaluatePassword, form.password]);

  const normalizedEmail = String(form.email || "").trim().toLowerCase();
  const mobileDigits = String(form.mobile || "").replace(/\D/g, "");
  const emailExistsInCompany = useMemo(
    () =>
      Boolean(
        normalizedEmail &&
          staff.some(
            (member) =>
              String(member?.email || "").trim().toLowerCase() === normalizedEmail,
          ),
      ),
    [normalizedEmail, staff],
  );
  const mobileExistsInCompany = useMemo(
    () =>
      Boolean(
        mobileDigits &&
          staff.some(
            (member) =>
              String(member?.mobile || "").replace(/\D/g, "") === mobileDigits,
          ),
      ),
    [mobileDigits, staff],
  );

  const showUpgrade = useCallback(
    ({ title, message, primaryText = "Upgrade" }) =>
      setUpgrade({ visible: true, title, message, primaryText }),
    [],
  );
  const closeUpgrade = useCallback(
    () => setUpgrade((p) => ({ ...p, visible: false })),
    [],
  );

  const showRoleLimit = useCallback(
    (role) => {
      const normalizedRole = String(role || "Staff").toLowerCase();
      const isAdminRole = normalizedRole === "admin";
      const limit = isAdminRole ? maxAdmins : maxStaff;
      const current = isAdminRole ? adminCount : staffCount;
      showUpgrade({
        title: `${isAdminRole ? "Admin" : "Staff"} limit reached`,
        message:
          limit > 0
            ? `Your plan allows ${limit} ${isAdminRole ? "admin" : "staff"} account${limit === 1 ? "" : "s"}. You already have ${current}.`
            : `Your current plan does not allow adding more ${isAdminRole ? "admins" : "staff"}.`,
      });
    },
    [adminCount, maxAdmins, maxStaff, showUpgrade, staffCount],
  );

  const handleAdd = useCallback(async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormNotice("Name, email and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setFormNotice("Please enter a valid email address.");
      return;
    }
    if (emailExistsInCompany) {
      setFormNotice("This email already exists in your company.");
      return;
    }
    if (mobileDigits.length !== 10) {
      setFormNotice("Mobile number must be exactly 10 digits.");
      return;
    }
    if (mobileExistsInCompany) {
      setFormNotice("This mobile number already exists in your company.");
      return;
    }
    const checks = evaluatePassword(form.password);
    if (!Object.values(checks).every(Boolean)) {
      const missing = [];
      if (!checks.length) missing.push("8 characters");
      if (!checks.upper) missing.push("an uppercase letter");
      if (!checks.lower) missing.push("a lowercase letter");
      if (!checks.number) missing.push("a number");
      if (!checks.special) missing.push("a special character");
      setFormNotice(`Password must contain ${missing.join(", ")}.`);
      return;
    }
    if (form.role === "Staff" && staffLimitReached) {
      showRoleLimit("Staff");
      return;
    }
    if (form.role === "Admin" && adminLimitReached) {
      showRoleLimit("Admin");
      return;
    }
    try {
      setFormNotice("");
      setFormLoading(true);
      await staffService.createStaff({
        ...form,
        mobile: mobileDigits,
      });
      resetForm();
      setShowAdd(false);
      load();
    } catch (error) {
      const payload = error?.response?.data;
      const code = payload?.code;
      const msg =
        payload?.error ||
        payload?.message ||
        error?.message ||
        "Failed to create staff";
      if (
        code === "STAFF_LIMIT_REACHED" ||
        code === "ADMIN_LIMIT_REACHED" ||
        /staff limit/i.test(String(msg)) ||
        /admin limit/i.test(String(msg))
      ) {
        const limit = Number(payload?.limit || 0),
          current = Number(payload?.current || 0);
        showUpgrade({
          title:
            code === "ADMIN_LIMIT_REACHED"
              ? "Admin limit reached"
              : "Staff limit reached",
          message:
            limit > 0 && current > 0
              ? `Your plan allows ${limit} ${code === "ADMIN_LIMIT_REACHED" ? "admin" : "staff"} accounts. You currently have ${current}. Upgrade to add more.`
              : `Your plan limit is reached. Upgrade to add more ${code === "ADMIN_LIMIT_REACHED" ? "admins" : "staff"}.`,
        });
        return;
      }
      if (code === "NO_ACTIVE_PLAN" || code === "FEATURE_DISABLED") {
        setShowAdd(false);
        showUpgrade({
          title: "No active plan",
          message: "Your plan is inactive. Select a plan to continue.",
          primaryText: "View Plans",
        });
        return;
      }
      if (/email is already used/i.test(String(msg)) || /email already exists/i.test(String(msg))) {
        setFormNotice("This email already exists in your company.");
        return;
      }
      if (/mobile number is already used/i.test(String(msg))) {
        setFormNotice("This mobile number already exists in your company.");
        return;
      }
      setFormNotice(getUserFacingError(error, msg));
    } finally {
      setFormLoading(false);
    }
  }, [adminLimitReached, emailExistsInCompany, evaluatePassword, form, mobileDigits, mobileExistsInCompany, resetForm, showRoleLimit, showUpgrade, staffLimitReached]);

  const handleToggle = useCallback((member) => {
    const next = member.status === "Active" ? "Inactive" : "Active";
    Alert.alert("Change status", `Set ${member.name} to ${next}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          try {
            await staffService.updateStaffStatus(member._id, next);
            load();
          } catch (error) {
            Alert.alert("Error", getUserFacingError(error, "Failed to update"));
          }
        },
      },
    ]);
  }, []);

  const handleDelete = useCallback((member) => {
    Alert.alert(
      "Delete staff",
      `Remove ${member.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await staffService.deleteStaff(member._id);
              load();
            } catch (error) {
              Alert.alert("Error", getUserFacingError(error, "Failed to delete"));
            }
          },
        },
      ],
    );
  }, []);

  const openAdd = useCallback(() => {
    if (!billingPlan) {
      showUpgrade({
        title: "No active plan",
        message: "Select a plan to add admins or staff.",
        primaryText: "View Plans",
      });
      return;
    }
    if (!availableAddRoles.length) {
      showUpgrade({
        title: "Plan limit reached",
        message: "Your current plan has reached both admin and staff limits. Upgrade to add more team members.",
      });
      return;
    }
    resetForm();
    if (availableAddRoles.length === 1) {
      setForm((prev) => ({ ...prev, role: availableAddRoles[0] }));
    }
    setShowAdd(true);
    setTimeout(() => nameInputRef.current?.focus(), 120);
  }, [availableAddRoles, billingPlan, nameInputRef, resetForm, showUpgrade]);

  const handleUpdate = async () => {
    if (!editData) return;
    try {
      setEditLoading(true);
      const { id, name, mobile, status, password, role } = editData;
      const payload = { name, mobile, status, role };
      if (password && password.length >= 6) payload.password = password;
      await staffService.updateStaff(id, payload);
      setShowEdit(false);
      setEditData(null);
      load();
    } catch (e) {
      Alert.alert("Error", getUserFacingError(e, "Update failed"));
    } finally {
      setEditLoading(false);
    }
  };

  const Hdr = () => (
    <View
      style={[
        styles.hdr,
        { paddingTop: insets.top + 14, paddingHorizontal: pad },
      ]}
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.hdrBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color={T.ink} />
      </TouchableOpacity>
      <Text style={styles.hdrTitle}>Admin / Staff</Text>
      <TouchableOpacity
        onPress={() => navigation.navigate("ProfileScreen")}
        style={styles.hdrBtn}
      >
        {user?.logo ? (
          <Image source={{ uri: getImageUrl(user.logo) }} style={styles.ava} />
        ) : (
          <View style={styles.avaFb}>
            <Text style={styles.avaLetter}>
              {(user?.name || "U")[0].toUpperCase()}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderCard = useCallback(
    ({ item, index }) => (
      <View style={[styles.row, index === 0 && { borderTopWidth: 0 }]}>
        <View style={styles.rowMain}>
          {/* Initials */}
          <View
            style={[
              styles.mono,
              item.status !== "Active" && styles.monoInactive,
            ]}
          >
            <Text
              style={[
                styles.monoTxt,
                item.status !== "Active" && styles.monoTxtInactive,
              ]}
            >
              {initials(item.name)}
            </Text>
          </View>
          {/* Info */}
          <View style={styles.rowInfo}>
            <View style={styles.rowNameRow}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <View
                style={[
                  styles.statusTag,
                  item.status === "Active"
                    ? styles.statusTagActive
                    : styles.statusTagInactive,
                ]}
              >
                <Text
                  style={[
                    styles.statusTagTxt,
                    item.status === "Active"
                      ? styles.statusTagTxtActive
                      : styles.statusTagTxtInactive,
                  ]}
                >
                  {item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.rowEmail} numberOfLines={1}>
              {item.email}
            </Text>
            <Text style={styles.rowRole}>
              {String(item.role || "Staff").toLowerCase() === "admin"
                ? adminRoleLabelMap[item._id] || "Admin"
                : "Staff Member"}
            </Text>
            {item.mobile ? (
              <Text style={styles.rowMobile}>{item.mobile}</Text>
            ) : null}
          </View>
        </View>
        {/* Footer */}
        <View style={styles.rowFoot}>
          <TouchableOpacity
            style={styles.footToggle}
            onPress={() => handleToggle(item)}
            activeOpacity={0.75}
          >
            <Text style={styles.footToggleTxt}>
              {item.status === "Active" ? "Deactivate" : "Activate"}
            </Text>
          </TouchableOpacity>
          <View style={styles.footRight}>
            <TouchableOpacity
              onPress={() => {
                setEditData({
                  id: item._id,
                  name: item.name || "",
                  email: item.email || "",
                  mobile: item.mobile || "",
                  role: item.role || "Staff",
                  status: item.status || "Active",
                  password: "",
                });
                setPwVisible(false);
                setShowEdit(true);
              }}
              style={styles.actBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={15} color={T.mid} />
            </TouchableOpacity>
            <View style={styles.actSep} />
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={styles.actBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color={T.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ),
    [adminRoleLabelMap, handleToggle, handleDelete],
  );

  // ── Shared Field Component ─────────────────────────────────────────────────
  const Field = StaffField;

  const RadioRow = StaffRadioRow;

  // ── Sheet ──────────────────────────────────────────────────────────────────
  const Sheet = StaffSheet;

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={T.bg} />
      <Hdr />

      {/* Add Sheet */}
      <Sheet
        visible={showAdd}
        onClose={() => {
          if (!formLoading) {
            setShowAdd(false);
            resetForm();
          }
        }}
        title="Add Admin / Staff"
        eyebrow="NEW"
        loading={formLoading}
      >
        {formNotice ? (
          <View style={styles.inlineNotice}>
            <Ionicons name="alert-circle-outline" size={16} color={T.danger} />
            <Text style={styles.inlineNoticeText}>{formNotice}</Text>
          </View>
        ) : null}
        <Field
          label="FULL NAME"
          fieldKey="name"
          placeholder="Enter full name"
          value={form.name}
          onChange={(v) => setField("name", v)}
          next="email"
          onSubmit={() => emailInputRef.current?.focus()}
          inputRef={nameInputRef}
          autoComplete="name"
          editable
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          loading={formLoading}
        />
        <Field
          label="EMAIL ADDRESS"
          fieldKey="email"
          placeholder="Enter email"
          keyboard="email-address"
          value={form.email}
          onChange={(v) => setField("email", v)}
          next="mobile"
          onSubmit={() => mobileInputRef.current?.focus()}
          inputRef={emailInputRef}
          autoComplete="email"
          editable
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          loading={formLoading}
        />
        {normalizedEmail ? (
          emailExistsInCompany ? (
            <Text style={styles.fieldErrorText}>This email already exists in your company.</Text>
          ) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? (
            <Text style={styles.fieldSuccessText}>Email is available in your company.</Text>
          ) : (
            <Text style={styles.fieldHintText}>Enter a valid email address.</Text>
          )
        ) : null}
        <Field
          label="MOBILE"
          fieldKey="mobile"
          placeholder="Enter 10-digit mobile number"
          keyboard="phone-pad"
          value={form.mobile}
          onChange={(v) =>
            setField("mobile", String(v || "").replace(/\D/g, "").slice(0, 10))
          }
          next="password"
          onSubmit={() => passwordInputRef.current?.focus()}
          inputRef={mobileInputRef}
          autoComplete="tel"
          editable
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          loading={formLoading}
        />
        {mobileDigits ? (
          mobileExistsInCompany ? (
            <Text style={styles.fieldErrorText}>This mobile number already exists in your company.</Text>
          ) : mobileDigits.length === 10 ? (
            <Text style={styles.fieldSuccessText}>Mobile number is available in your company.</Text>
          ) : (
            <Text style={styles.fieldHintText}>Mobile number must be exactly 10 digits.</Text>
          )
        ) : null}
        <Field
          label="PASSWORD"
          fieldKey="password"
          placeholder="Create strong password"
          secure
          showSecure={addPwVisible}
          onToggleSecure={() => setAddPwVisible((s) => !s)}
          value={form.password}
          onChange={(v) => setField("password", v)}
          onSubmit={handleAdd}
          inputRef={passwordInputRef}
          autoComplete="password-new"
          editable
          focusedField={focusedField}
          setFocusedField={setFocusedField}
          loading={formLoading}
        />
        {form.password.length > 0 ? <PasswordChecklist checks={pwChecks} /> : null}
        <View style={styles.field}>
          <Text style={styles.fLbl}>ROLE</Text>
          <RadioRow
            current={form.role}
            onSet={(v) => setField("role", v)}
            disabled={formLoading}
            options={["Staff", "Admin"]}
            disabledOptions={[
              ...(staffLimitReached ? ["Staff"] : []),
              ...(adminLimitReached ? ["Admin"] : []),
            ]}
          />
          {staffLimitReached || adminLimitReached ? (
            <Text style={styles.helperText}>
              {staffLimitReached && adminLimitReached
                ? "Both admin and staff limits are reached for your current plan."
                : staffLimitReached
                  ? "Staff limit reached. You can still add admins if your plan allows."
                  : "Admin limit reached. You can still add staff if your plan allows."}
            </Text>
          ) : null}
        </View>
        <View style={styles.field}>
          <Text style={styles.fLbl}>STATUS</Text>
          <RadioRow
            current={form.status}
            onSet={(v) => setField("status", v)}
            disabled={formLoading}
          />
        </View>
        <TouchableOpacity
          style={[styles.btnPri, formLoading && { opacity: 0.5 }]}
          onPress={handleAdd}
          disabled={formLoading}
        >
          {formLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnPriTxt}>Create team member</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnGhost}
          onPress={() => {
            if (!formLoading) {
              setShowAdd(false);
              resetForm();
            }
          }}
          disabled={formLoading}
        >
          <Text style={styles.btnGhostTxt}>Discard</Text>
        </TouchableOpacity>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet
        visible={showEdit}
        onClose={() => {
          if (!editLoading) setShowEdit(false);
        }}
        title="Edit Admin / Staff"
        eyebrow="EDIT"
        loading={editLoading}
      >
        <View style={styles.field}>
          <Text style={styles.fLbl}>FULL NAME</Text>
          <TextInput
            style={[
              styles.fInput,
              focusedField === "eName" && styles.fInputFocus,
            ]}
            value={editData?.name}
            onChangeText={(v) => setEditField("name", v)}
            onFocus={() => setFocusedField("eName")}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fLbl}>EMAIL ADDRESS</Text>
          <TextInput
            style={[styles.fInput, styles.fInputDisabled]}
            value={editData?.email}
            editable={false}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fLbl}>MOBILE</Text>
          <TextInput
            style={[
              styles.fInput,
              focusedField === "eMob" && styles.fInputFocus,
            ]}
            value={editData?.mobile}
            onChangeText={(v) => setEditField("mobile", v)}
            onFocus={() => setFocusedField("eMob")}
            onBlur={() => setFocusedField(null)}
            keyboardType="phone-pad"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fLbl}>NEW PASSWORD</Text>
          <View style={styles.pwRow}>
            <TextInput
              style={[
                styles.fInput,
                { flex: 1 },
                focusedField === "ePw" && styles.fInputFocus,
              ]}
              value={editData?.password}
              onChangeText={(v) => setEditField("password", v)}
              onFocus={() => setFocusedField("ePw")}
              onBlur={() => setFocusedField(null)}
              secureTextEntry={!pwVisible}
              placeholder="Leave blank to keep current"
              placeholderTextColor={T.mute}
            />
            <TouchableOpacity
              onPress={() => setPwVisible((s) => !s)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={pwVisible ? "eye-off-outline" : "eye-outline"}
                size={16}
                color={T.mid}
              />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fLbl}>ROLE</Text>
          <RadioRow
            current={editData?.role || "Staff"}
            onSet={(v) => setEditField("role", v)}
            disabled={editLoading}
            options={["Staff", "Admin"]}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fLbl}>STATUS</Text>
          <RadioRow
            current={editData?.status}
            onSet={(v) => setEditField("status", v)}
            disabled={editLoading}
          />
        </View>
        <TouchableOpacity
          style={[styles.btnPri, editLoading && { opacity: 0.5 }]}
          onPress={handleUpdate}
          disabled={editLoading}
        >
          {editLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnPriTxt}>Save changes</Text>
          )}
        </TouchableOpacity>
      </Sheet>

      {/* Upgrade Modal */}
      <Modal
        visible={upgrade.visible}
        transparent
        animationType="fade"
        onRequestClose={closeUpgrade}
      >
        <View style={styles.upgradeOverlay}>
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeTitle}>{upgrade.title}</Text>
            <View style={styles.upgradeLine} />
            <Text style={styles.upgradeMsg}>{upgrade.message}</Text>
            <TouchableOpacity
              style={styles.btnPri}
              onPress={() => {
                closeUpgrade();
                navigation.navigate("PricingScreen");
              }}
            >
              <Text style={styles.btnPriTxt}>{upgrade.primaryText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnGhost, { marginTop: 8 }]}
              onPress={closeUpgrade}
            >
              <Text style={styles.btnGhostTxt}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Content */}
      {loading && staff.length === 0 ? (
        <View style={{ paddingHorizontal: pad, paddingTop: 20 }}>
          <SkeletonPulse>
            <ListSkeleton count={7} itemHeight={88} withAvatar={false} />
          </SkeletonPulse>
        </View>
      ) : loadError && staff.length === 0 ? (
        <View style={[styles.stateCardWrap, { paddingHorizontal: pad }]}>
          <View style={styles.stateCard}>
            <View style={styles.stateIcon}>
              <Ionicons name="cloud-offline-outline" size={24} color={T.danger} />
            </View>
            <Text style={styles.stateTitle}>Unable to load staff</Text>
            <Text style={styles.stateText}>{loadError}</Text>
            <TouchableOpacity style={styles.stateBtn} onPress={load}>
              <Text style={styles.stateBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: pad,
            paddingBottom: insets.bottom + 110,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={T.mute}
            />
          }
        >
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaCount}>
                {staff.length} {staff.length === 1 ? "member" : "members"}
              </Text>
              {billingPlan ? (
                <Text style={styles.metaUsage}>
                  {`Plan usage: ${staffCount} / ${Number(billingPlan?.maxStaff || 0)} staff | ${adminCount} / ${Number(billingPlan?.maxAdmins || 0)} admins`}
                </Text>
              ) : null}
            </View>
          </View>
          {staff.length > 0 ? (
            <View style={styles.table}>
              <FlatList
                scrollEnabled={false}
                data={staff}
                keyExtractor={(i) => i._id}
                renderItem={renderCard}
                numColumns={isTablet ? 2 : 1}
                key={isTablet ? "t" : "m"}
                columnWrapperStyle={isTablet ? { gap: 0 } : null}
              />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTtl}>No admins or staff yet</Text>
              <Text style={styles.emptySub}>
                Add your first team member to manage access, tasks, and assignments.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <View
        style={[
          styles.fabWrap,
          { bottom: insets.bottom + 24, paddingHorizontal: pad },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={openAdd}
          activeOpacity={0.87}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.fabTxt}>Add Admin / Staff</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  hdr: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 18,
  },
  hdrTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: T.ink,
    letterSpacing: -0.2,
  },
  hdrBtn: {
    width: 36,
    height: 36,
    borderRadius: T.radius,
    backgroundColor: T.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: T.line,
  },
  ava: { width: 36, height: 36, borderRadius: T.radius },
  avaFb: {
    width: 36,
    height: 36,
    borderRadius: T.radius,
    backgroundColor: T.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  avaLetter: { color: "#fff", fontSize: 13, fontWeight: "700" },

  metaRow: { paddingVertical: 14 },
  metaCount: {
    fontSize: 11,
    fontWeight: "700",
    color: T.mute,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metaUsage: {
    marginTop: 6,
    fontSize: 12,
    color: T.mid,
    lineHeight: 18,
  },

  table: {
    backgroundColor: T.card,
    borderRadius: T.radiusLg,
    borderWidth: 1,
    borderColor: T.line,
    overflow: "hidden",
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: T.line,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 14,
  },
  mono: {
    width: 40,
    height: 40,
    borderRadius: T.radius,
    backgroundColor: T.ink,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  monoInactive: { backgroundColor: "#f1f5f9" },
  monoTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  monoTxtInactive: { color: T.mute },
  rowInfo: { flex: 1 },
  rowNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
    flexWrap: "wrap",
  },
  rowName: { fontSize: 15, fontWeight: "700", color: T.ink },
  statusTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusTagActive: { backgroundColor: T.activeBg, borderColor: "#bbf7d0" },
  statusTagInactive: { backgroundColor: T.dangerLight, borderColor: "#fecaca" },
  statusTagTxt: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  statusTagTxtActive: { color: T.activeText },
  statusTagTxtInactive: { color: T.danger },
  rowEmail: { fontSize: 13, color: T.mute },
  rowRole: { fontSize: 12, color: "#8b5e34", marginTop: 3, fontWeight: "700" },
  rowMobile: { fontSize: 12, color: T.mute, marginTop: 1 },
  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: T.line,
    paddingTop: 12,
  },
  footToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
  },
  footToggleTxt: { fontSize: 12, fontWeight: "700", color: T.mid },
  footRight: { flexDirection: "row", alignItems: "center" },
  actBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  actSep: { width: 1, height: 14, backgroundColor: T.line },

  empty: { paddingTop: 52 },
  emptyTtl: {
    fontSize: 22,
    fontWeight: "800",
    color: T.ink,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  emptySub: { fontSize: 14, color: T.mute, lineHeight: 22, maxWidth: 320 },
  stateCardWrap: { flex: 1, justifyContent: "center", paddingBottom: 90 },
  stateCard: {
    backgroundColor: T.card,
    borderRadius: T.radiusLg,
    borderWidth: 1,
    borderColor: T.line,
    padding: 24,
    alignItems: "center",
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: T.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: T.ink,
    marginBottom: 8,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 22,
    color: T.mid,
    textAlign: "center",
    marginBottom: 18,
  },
  stateBtn: {
    minWidth: 140,
    height: 46,
    borderRadius: T.radius,
    backgroundColor: T.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stateBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  fabWrap: { position: "absolute", left: 0, right: 0 },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: T.ink,
    paddingVertical: 15,
    borderRadius: T.radius,
    shadowColor: T.ink,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Sheet
  overlay: {
    flex: 1,
    backgroundColor: "rgba(11,15,26,0.40)",
    justifyContent: "flex-end",
  },
  overlayKb: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  sheetPull: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: T.line,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  sheetHdr: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 14,
  },
  sheetEye: {
    fontSize: 10,
    fontWeight: "700",
    color: T.mute,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: T.ink,
    letterSpacing: -0.5,
  },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: T.radius,
    backgroundColor: "#f3f3ef",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDivider: { height: 1, backgroundColor: T.line },
  sheetBody: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 36 },
  inlineNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: T.dangerLight,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 16,
  },
  inlineNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: T.danger,
    fontWeight: "700",
  },

  // Fields
  field: { marginBottom: 18 },
  fLbl: {
    fontSize: 11,
    fontWeight: "700",
    color: T.mute,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  fInput: {
    height: 50,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: T.radius,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: "500",
    color: T.ink,
    backgroundColor: T.bg,
  },
  fInputFocus: { borderColor: T.ink, backgroundColor: T.card },
  fInputDisabled: { backgroundColor: "#f3f3ef", color: T.mute },
  pwRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  pwChecklist: {
    marginTop: -6,
    marginBottom: 14,
    paddingHorizontal: 4,
    paddingVertical: 10,
    backgroundColor: "rgba(11,15,26,0.03)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.line,
  },
  pwRuleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 3,
    paddingHorizontal: 8,
  },
  pwRuleText: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  fieldHintText: {
    marginTop: -10,
    marginBottom: 14,
    fontSize: 12.5,
    color: T.mute,
    fontWeight: "600",
  },
  fieldErrorText: {
    marginTop: -10,
    marginBottom: 14,
    fontSize: 12.5,
    color: T.danger,
    fontWeight: "700",
  },
  fieldSuccessText: {
    marginTop: -10,
    marginBottom: 14,
    fontSize: 12.5,
    color: "#10b981",
    fontWeight: "700",
  },
  eyeBtn: {
    width: 50,
    height: 50,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.bg,
  },

  // Radio
  radioRow: { flexDirection: "row", gap: 10 },
  radioOpt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.bg,
  },
  radioOptActive: { borderColor: T.ink, backgroundColor: T.card },
  radioOptDisabled: { opacity: 0.45 },
  radioBall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: T.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioBallActive: { borderColor: T.ink },
  radioBallDisabled: { borderColor: T.mute },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.ink },
  radioLbl: { fontSize: 14, fontWeight: "600", color: T.mute },
  radioLblActive: { color: T.ink },
  radioLblDisabled: { color: T.mute },
  helperText: {
    marginTop: 8,
    fontSize: 12.5,
    color: "#8b5e34",
    lineHeight: 18,
    fontWeight: "600",
  },

  // Buttons
  btnPri: {
    height: 50,
    backgroundColor: T.ink,
    borderRadius: T.radius,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  btnPriTxt: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  btnGhost: {
    height: 48,
    borderRadius: T.radius,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: T.line,
  },
  btnGhostTxt: { color: T.mid, fontSize: 14, fontWeight: "600" },

  // Upgrade
  upgradeOverlay: {
    flex: 1,
    backgroundColor: "rgba(11,15,26,0.50)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  upgradeCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: T.card,
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: T.line,
  },
  upgradeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: T.ink,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  upgradeLine: { height: 1, backgroundColor: T.line, marginBottom: 16 },
  upgradeMsg: { fontSize: 14, color: T.mid, lineHeight: 22, marginBottom: 24 },
});
