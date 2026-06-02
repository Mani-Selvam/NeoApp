import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as messageTemplateService from "../services/messageTemplateService";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const COLORS = {
    primary: "#6366F1",
    primaryDark: "#4F46E5",
    primaryLight: "#EEF2FF",
    primaryBorder: "#C7D2FE",
    bg: "#F8FAFC",
    bgCard: "#FFFFFF",
    text: "#1E293B",
    textDim: "#475569",
    textMuted: "#64748B",
    line: "#E2E8F0",
    success: "#10B981",
    successSoft: "#ECFDF5",
    successBorder: "#A7F3D0",
    warning: "#F59E0B",
    warningSoft: "#FFFBEB",
    warningBorder: "#FDE68A",
    info: "#3B82F6",
    infoSoft: "#EFF6FF",
    infoBorder: "#BFDBFE",
    secondary: "#EC4899",
    secondarySoft: "#FDF2F8",
    secondaryBorder: "#FBCFE8",
};

const CATEGORIES = ["Sales", "Support", "Marketing", "General"];
const STATUSES = ["Active", "Inactive"];

const getCategoryStyles = (cat) => {
    switch (cat) {
        case "Sales":
            return { bg: COLORS.successSoft, text: COLORS.success, border: COLORS.successBorder };
        case "Support":
            return { bg: COLORS.infoSoft, text: COLORS.info, border: COLORS.infoBorder };
        case "Marketing":
            return { bg: COLORS.secondarySoft, text: COLORS.secondary, border: COLORS.secondaryBorder };
        default:
            return { bg: COLORS.warningSoft, text: COLORS.warning, border: COLORS.warningBorder };
    }
};

const TemplateCard = ({ item, onEdit, onDelete }) => {
    const catStyles = getCategoryStyles(item.category);
    return (
        <MotiView
            from={{ opacity: 0, translateY: 15 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 350 }}
            style={styles.card}
        >
            <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                    <View style={[styles.categoryBadge, { backgroundColor: catStyles.bg, borderColor: catStyles.border }]}>
                        <Text style={[styles.categoryText, { color: catStyles.text }]}>
                            {item.category}
                        </Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.name}
                    </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.status === "Active" ? COLORS.successSoft : "#F1F5F9", borderColor: item.status === "Active" ? COLORS.successBorder : "#CBD5E1" }]}>
                    <View style={[styles.statusDot, { backgroundColor: item.status === "Active" ? COLORS.success : "#64748B" }]} />
                    <Text style={[styles.statusText, { color: item.status === "Active" ? COLORS.success : "#475569" }]}>
                        {item.status}
                    </Text>
                </View>
            </View>

            <View style={styles.keywordRow}>
                <View style={styles.keywordPill}>
                    <Ionicons name="key-outline" size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.keywordPrefix}>Trigger: </Text>
                    <Text style={styles.keywordText}>@{item.keyword}</Text>
                </View>
            </View>

            <Text style={styles.cardContent} numberOfLines={3}>
                {item.content}
            </Text>

            <View style={styles.cardDivider} />

            <View style={styles.cardFooter}>
                <Text style={styles.dateText}>
                    Added {new Date(item.createdAt).toLocaleDateString()}
                </Text>
                <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)} activeOpacity={0.7}>
                        <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.deleteActionBtn]} onPress={() => onDelete(item._id)} activeOpacity={0.7}>
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </View>
        </MotiView>
    );
};

export default function MessageTemplateScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: "",
        keyword: "",
        content: "",
        category: "General",
        status: "Active",
    });

    const fetchTemplates = async () => {
        try {
            setLoading(true);
            const data = await messageTemplateService.getMessageTemplates();
            setTemplates(data || []);
        } catch (error) {
            Alert.alert("Error", "Failed to fetch templates");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleSave = async () => {
        if (!form.name.trim() || !form.keyword.trim() || !form.content.trim()) {
            Alert.alert("Required Fields", "Please fill in all template fields");
            return;
        }

        try {
            setSaving(true);
            if (editingTemplate) {
                await messageTemplateService.updateMessageTemplate(
                    editingTemplate._id,
                    form,
                );
            } else {
                await messageTemplateService.createMessageTemplate(form);
            }
            setModalVisible(false);
            fetchTemplates();
            resetForm();
        } catch (error) {
            Alert.alert(
                "Error",
                error.response?.data?.message || "Failed to save template",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        Alert.alert(
            "Delete Template",
            "Are you sure you want to permanently delete this message template?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await messageTemplateService.deleteMessageTemplate(id);
                            fetchTemplates();
                        } catch (error) {
                            Alert.alert("Error", "Failed to delete template");
                        }
                    },
                },
            ],
        );
    };

    const resetForm = () => {
        setForm({
            name: "",
            keyword: "",
            content: "",
            category: "General",
            status: "Active",
        });
        setEditingTemplate(null);
    };

    const openEdit = (template) => {
        setEditingTemplate(template);
        setForm({
            name: template.name,
            keyword: template.keyword,
            content: template.content,
            category: template.category,
            status: template.status,
        });
        setModalVisible(true);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* Premium Slack-Style Header */}
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    activeOpacity={0.7}
                >
                    <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>

                <View style={styles.headerInfo}>
                    <View style={styles.headerAvatar}>
                        <Ionicons name="document-text" size={18} color={COLORS.primary} />
                    </View>
                    <View>
                        <Text style={styles.headerTitle}>Quick Replies</Text>
                        <Text style={styles.headerSubtitle}>
                            {templates.length} Active Templates
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.headerAddBtn}
                    onPress={() => {
                        resetForm();
                        setModalVisible(true);
                    }}
                    activeOpacity={0.7}
                >
                    <Ionicons name="add-circle" size={24} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : (
                <FlatList
                    data={templates}
                    keyExtractor={(item) => item._id}
                    renderItem={({ item }) => (
                        <TemplateCard
                            item={item}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                        />
                    )}
                    contentContainerStyle={[
                        styles.listContainer,
                        { paddingBottom: insets.bottom + 100 },
                    ]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconBg}>
                                <Ionicons
                                    name="chatbubbles-outline"
                                    size={42}
                                    color={COLORS.primary}
                                />
                            </View>
                            <Text style={styles.emptyText}>No Templates Yet</Text>
                            <Text style={styles.emptySubText}>
                                Create your first message template trigger to reply quickly in chat conversations.
                            </Text>
                            <TouchableOpacity
                                style={styles.emptyBtn}
                                onPress={() => {
                                    resetForm();
                                    setModalVisible(true);
                                }}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={["#6366F1", "#4F46E5"]}
                                    style={styles.emptyBtnGradient}
                                >
                                    <Ionicons
                                        name="add"
                                        size={18}
                                        color="#fff"
                                        style={{ marginRight: 6 }}
                                    />
                                    <Text style={styles.emptyBtnText}>Create Template</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            {/* Premium Floating Action Button */}
            <TouchableOpacity
                style={[styles.fab, { bottom: insets.bottom + 24 }]}
                onPress={() => {
                    resetForm();
                    setModalVisible(true);
                }}
                activeOpacity={0.8}
            >
                <LinearGradient colors={["#6366F1", "#4F46E5"]} style={styles.fabGradient}>
                    <Ionicons name="add" size={28} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>

            {/* Modal Form Redesign */}
            <Modal statusBarTranslucent
                visible={modalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View
                        style={[
                            styles.modalContent,
                            { paddingBottom: insets.bottom + 20 },
                        ]}
                    >
                        <View style={styles.modalHandle} />

                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={styles.modalHeaderIconBg}>
                                    <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                                </View>
                                <Text style={styles.modalTitleText}>
                                    {editingTemplate ? "Edit Template" : "New Template"}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setModalVisible(false)}
                                style={styles.closeBtn}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="close" size={22} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingBottom: 20 }}
                        >
                            <Text style={styles.inputLabel}>TEMPLATE NAME</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Welcome Message"
                                placeholderTextColor={COLORS.textMuted}
                                value={form.name}
                                onChangeText={(val) => setForm({ ...form, name: val })}
                            />

                            <Text style={styles.inputLabel}>KEYWORD TRIGGER</Text>
                            <View style={styles.keywordInputWrapper}>
                                <Text style={styles.atSymbol}>@</Text>
                                <TextInput
                                    style={styles.keywordInput}
                                    placeholder="welcome"
                                    placeholderTextColor={COLORS.textMuted}
                                    value={form.keyword}
                                    onChangeText={(val) =>
                                        setForm({ ...form, keyword: val.toLowerCase().replace(/\s+/g, "") })
                                    }
                                    autoCapitalize="none"
                                />
                            </View>

                            <Text style={styles.inputLabel}>CATEGORY</Text>
                            <View style={styles.pickerRow}>
                                {CATEGORIES.map((cat) => {
                                    const isActive = form.category === cat;
                                    return (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[
                                                styles.pickerItem,
                                                isActive && styles.pickerItemActive,
                                            ]}
                                            onPress={() => setForm({ ...form, category: cat })}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.pickerText, isActive && styles.pickerTextActive]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={styles.inputLabel}>STATUS</Text>
                            <View style={styles.pickerRow}>
                                {STATUSES.map((status) => {
                                    const isActive = form.status === status;
                                    return (
                                        <TouchableOpacity
                                            key={status}
                                            style={[
                                                styles.pickerItem,
                                                isActive && styles.pickerItemActive,
                                            ]}
                                            onPress={() => setForm({ ...form, status })}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.pickerText, isActive && styles.pickerTextActive]}>
                                                {status}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={styles.inputLabel}>MESSAGE CONTENT</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Type your template message content here…"
                                placeholderTextColor={COLORS.textMuted}
                                value={form.content}
                                onChangeText={(val) => setForm({ ...form, content: val })}
                                multiline
                                numberOfLines={5}
                                textAlignVertical="top"
                            />

                            <TouchableOpacity
                                style={styles.saveBtn}
                                onPress={handleSave}
                                disabled={saving}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={["#6366F1", "#4F46E5"]}
                                    style={styles.saveBtnGradient}
                                >
                                    {saving ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons
                                                name="checkmark-circle-outline"
                                                size={18}
                                                color="#fff"
                                                style={{ marginRight: 6 }}
                                            />
                                            <Text style={styles.saveBtnText}>
                                                {editingTemplate ? "Update Template" : "Save Template"}
                                            </Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    // Header Style Redesign
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        paddingBottom: 14,
        backgroundColor: "#FFFFFF",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.line,
    },
    backBtn: {
        padding: 8,
    },
    headerInfo: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        gap: 10,
        marginLeft: 6,
    },
    headerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: COLORS.primaryBorder,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: COLORS.text,
    },
    headerSubtitle: {
        fontSize: 11,
        fontWeight: "500",
        color: COLORS.textMuted,
    },
    headerAddBtn: {
        padding: 8,
        marginRight: 4,
    },

    // List Layout
    listContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },

    // Premium Card Layout
    card: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: COLORS.line,
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    cardHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flex: 1,
        marginRight: 8,
    },
    categoryBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 0.8,
    },
    categoryText: {
        fontSize: 10,
        fontWeight: "800",
        textTransform: "uppercase",
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: COLORS.text,
        flex: 1,
    },
    statusBadge: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 0.8,
        gap: 4,
    },
    statusDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    statusText: {
        fontSize: 10,
        fontWeight: "800",
        textTransform: "uppercase",
    },
    keywordRow: {
        marginBottom: 10,
    },
    keywordPill: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F1F5F9",
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 0.5,
        borderColor: "#CBD5E1",
    },
    keywordPrefix: {
        fontSize: 11,
        color: COLORS.textMuted,
        fontWeight: "600",
    },
    keywordText: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: "800",
    },
    cardContent: {
        fontSize: 13.5,
        color: COLORS.textDim,
        lineHeight: 20,
        marginBottom: 12,
    },
    cardDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: COLORS.line,
        marginBottom: 10,
    },
    cardFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    dateText: {
        fontSize: 11,
        color: COLORS.textMuted,
        fontWeight: "600",
    },
    cardActions: {
        flexDirection: "row",
        gap: 8,
    },
    actionBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: "#F8FAFC",
        borderWidth: 0.8,
        borderColor: COLORS.line,
        justifyContent: "center",
        alignItems: "center",
    },
    deleteActionBtn: {
        borderColor: "#FEE2E2",
        backgroundColor: "#FEF2F2",
    },

    // FAB Button Redesign
    fab: {
        position: "absolute",
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
    },
    fabGradient: {
        width: "100%",
        height: "100%",
        borderRadius: 28,
        justifyContent: "center",
        alignItems: "center",
    },

    // Centered & Empty Layouts
    centered: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 80,
        paddingHorizontal: 24,
    },
    emptyIconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: COLORS.primaryLight,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.primaryBorder,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 18,
        color: COLORS.text,
        fontWeight: "800",
        marginBottom: 6,
    },
    emptySubText: {
        fontSize: 13,
        color: COLORS.textMuted,
        textAlign: "center",
        lineHeight: 19,
        marginBottom: 24,
    },
    emptyBtn: {
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 3,
    },
    emptyBtnGradient: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    emptyBtnText: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 14,
    },

    // Modal Style Upgrades
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 10,
        maxHeight: "92%",
    },
    modalHandle: {
        width: 36,
        height: 4,
        backgroundColor: COLORS.line,
        borderRadius: 2,
        alignSelf: "center",
        marginBottom: 14,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    modalHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    modalHeaderIconBg: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: COLORS.primaryLight,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 0.8,
        borderColor: COLORS.primaryBorder,
    },
    modalTitleText: {
        fontSize: 18,
        fontWeight: "800",
        color: COLORS.text,
    },
    closeBtn: {
        padding: 4,
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: "800",
        color: COLORS.textMuted,
        letterSpacing: 0.5,
        marginBottom: 6,
        marginTop: 12,
    },
    input: {
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14.5,
        color: COLORS.text,
        borderWidth: 1,
        borderColor: COLORS.line,
        fontWeight: "500",
    },
    keywordInputWrapper: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.line,
        paddingHorizontal: 14,
    },
    atSymbol: {
        fontSize: 16,
        fontWeight: "800",
        color: COLORS.primary,
        marginRight: 4,
    },
    keywordInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14.5,
        color: COLORS.text,
        fontWeight: "700",
    },
    textArea: {
        minHeight: 100,
        paddingTop: 12,
        textAlignVertical: "top",
    },
    pickerRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginVertical: 4,
    },
    pickerItem: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.line,
        backgroundColor: "#FFFFFF",
    },
    pickerItemActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    pickerText: {
        fontSize: 12.5,
        fontWeight: "700",
        color: COLORS.textDim,
    },
    pickerTextActive: {
        color: "#FFFFFF",
    },
    saveBtn: {
        marginTop: 24,
        borderRadius: 14,
        overflow: "hidden",
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
        marginBottom: 10,
    },
    saveBtnGradient: {
        flexDirection: "row",
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    saveBtnText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "800",
    },
});
