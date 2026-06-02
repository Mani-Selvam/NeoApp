import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { useEffect, useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
    ActivityIndicator, Alert, Dimensions, FlatList,
    KeyboardAvoidingView, Modal, Platform, ScrollView,
    StatusBar, StyleSheet, Text, TextInput,
    TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as officialTemplateService from "../services/officialWhatsappTemplateService";

const { width: W } = Dimensions.get("window");

const C = {
    primary: "#2563EB",
    primaryDark: "#1D4ED8",
    primaryLight: "#DBEAFE",
    primaryBorder: "#BFDBFE",
    bg: "#F0F4F8",
    card: "#FFFFFF",
    text: "#0F172A",
    textSub: "#475569",
    textMuted: "#94A3B8",
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
    purple: "#8B5CF6",
    purpleSoft: "#F5F3FF",
    purpleBorder: "#DDD6FE",
    danger: "#EF4444",
    dangerSoft: "#FEE2E2",
};



// ─── Template Card ───────────────────────────────────────────────────────────
const TemplateCard = ({ item, onEdit, onDelete, index }) => {
    return (
        <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: index * 40 }}
            style={S.card}
        >
            {/* Top accent stripe */}
            <View style={[S.cardAccent, { backgroundColor: C.primary }]} />

            <View style={S.cardBody}>
                {/* Template name */}
                <Text style={S.cardName} numberOfLines={1}>{item.name}</Text>

                <View style={S.cardDivider} />

                {/* Footer */}
                <View style={S.cardFooter}>
                    <View style={S.cardMeta}>
                        <Ionicons name="calendar-outline" size={12} color={C.textMuted} />
                        <Text style={S.dateText}>
                            {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </Text>
                    </View>
                    <View style={S.cardActions}>
                        <TouchableOpacity style={S.editBtn} onPress={() => onEdit(item)} activeOpacity={0.7}>
                            <Ionicons name="create-outline" size={15} color={C.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={S.deleteBtn} onPress={() => onDelete(item._id)} activeOpacity={0.7}>
                            <Ionicons name="trash-outline" size={15} color={C.danger} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </MotiView>
    );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function WhatsAppTemplateScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({ name: "" });

    const fetchTemplates = useCallback(async () => {
        try {
            setLoading(true);
            const data = await officialTemplateService.getAllOfficialTemplates();
            setTemplates(data?.templates || []);
        } catch {
            Alert.alert("Error", "Failed to fetch WhatsApp templates");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    useFocusEffect(
        useCallback(() => {
            Alert.alert(
                "Notice: Bulk Templates",
                "For Bulk Send templates, please do not use variables. Only use plain text templates.\n\n— Neo Team",
                [{ text: "Understood", style: "default" }]
            );
        }, [])
    );

    const handleSave = async () => {
        if (!form.name.trim()) {
            Alert.alert("Required", "Please enter the template name as approved in WhatsApp Manager.");
            return;
        }
        try {
            setSaving(true);
            const payload = { name: form.name.trim() };
            if (editingTemplate) {
                await officialTemplateService.updateOfficialTemplate(editingTemplate._id, payload);
            } else {
                await officialTemplateService.createOfficialTemplate(payload);
            }
            setModalVisible(false);
            fetchTemplates();
            resetForm();
        } catch (err) {
            Alert.alert("Error", err.response?.data?.message || err.message || "Failed to save template");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        Alert.alert("Delete Template", "Permanently delete this template?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive",
                onPress: async () => {
                    try { await officialTemplateService.deleteOfficialTemplate(id); fetchTemplates(); }
                    catch { Alert.alert("Error", "Failed to delete template"); }
                },
            },
        ]);
    };

    const resetForm = () => {
        setForm({ name: "" });
        setEditingTemplate(null);
    };

    const openEdit = (t) => {
        setEditingTemplate(t);
        setForm({ name: t.name });
        setModalVisible(true);
    };

    return (
        <View style={S.root}>
            <StatusBar barStyle="light-content" backgroundColor={C.primary} />

            {/* ── Sticky White Header ── */}
            <View style={[S.header, { paddingTop: insets.top + 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: C.line }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={22} color={C.text} />
                </TouchableOpacity>
                <View style={S.headerCenter}>
                    <View style={S.headerIconBox}>
                        <Ionicons name="document-text" size={18} color={C.primary} />
                    </View>
                    <View>
                        <Text style={S.headerTitle}>Neo Templates</Text>
                        <Text style={S.headerSub}>{templates.length} {templates.length === 1 ? 'Template' : 'Templates'}</Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={S.addBtn}
                    onPress={() => { resetForm(); setModalVisible(true); }}
                    activeOpacity={0.8}
                >
                    <Ionicons name="add" size={22} color="#fff" />
                </TouchableOpacity>
            </View>
            {/* ── Content ── */}
            {loading && templates.length === 0 ? (
                <View style={S.center}>
                    <ActivityIndicator size="large" color={C.primary} />
                    <Text style={S.loadingText}>Loading templates…</Text>
                </View>
            ) : templates.length === 0 ? (
                <View style={S.emptyWrap}>
                    <LinearGradient colors={[C.primaryLight, "#fff"]} style={S.emptyIconBg}>
                        <Ionicons name="document-text" size={44} color={C.primary} />
                    </LinearGradient>
                    <Text style={S.emptyTitle}>No Templates Yet</Text>
                    <Text style={S.emptySub}>Add your approved Official WhatsApp Templates to use them for Bulk Sends.</Text>
                    <TouchableOpacity
                        style={S.emptyBtn}
                        onPress={() => { resetForm(); setModalVisible(true); }}
                        activeOpacity={0.85}
                    >
                        <LinearGradient colors={[C.primary, C.primaryDark]} style={S.emptyBtnGrad}>
                            <Ionicons name="add-circle-outline" size={18} color="#fff" />
                            <Text style={S.emptyBtnText}>Add First Template</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={templates}
                    keyExtractor={i => i._id}
                    contentContainerStyle={[S.list, { paddingBottom: insets.bottom + 24 }]}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item, index }) => (
                        <TemplateCard item={item} onEdit={openEdit} onDelete={handleDelete} index={index} />
                    )}
                />
            )}

            {/* ── Add / Edit Modal ── */}
            <Modal statusBarTranslucent={false} visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
                <KeyboardAvoidingView
                    style={[S.modalOverlay, { paddingTop: insets.top || 0 }]}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                    <View style={[S.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                        <View style={S.dragHandle} />

                        {/* Modal header */}
                        <LinearGradient
                            colors={[C.primaryLight, "#fff"]}
                            style={S.modalHdr}
                        >
                            <View style={S.modalHdrLeft}>
                                <View style={S.modalHdrIcon}>
                                    <Ionicons name="document-text-outline" size={16} color={C.primary} />
                                </View>
                                <Text style={S.modalTitle}>
                                    {editingTemplate ? "Edit Template" : "New Template"}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }} style={S.closeBtn}>
                                <Ionicons name="close" size={20} color={C.textSub} />
                            </TouchableOpacity>
                        </LinearGradient>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.modalScroll}>
                            {/* Template Name */}
                            <View style={S.field}>
                                <Text style={S.fieldLabel}>TEMPLATE NAME *</Text>
                                <TextInput
                                    style={S.input}
                                    value={form.name}
                                    onChangeText={v => setForm({ ...form, name: v })}
                                    placeholder="e.g. welcome_neo"
                                    placeholderTextColor={C.textMuted}
                                    autoCapitalize="none"
                                />
                                <Text style={S.fieldHint}>Must match exactly as approved in WhatsApp Manager</Text>
                            </View>



                            {/* Save */}
                            <TouchableOpacity style={S.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                                <LinearGradient colors={[C.primary, C.primaryDark]} style={S.saveBtnGrad}>
                                    {saving
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : (<>
                                            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                                            <Text style={S.saveBtnText}>Save Template</Text>
                                        </>)
                                    }
                                </LinearGradient>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const S = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    // Header
    header: {
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 16, paddingBottom: 16, gap: 12,
    },
    backBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: C.bg,
        justifyContent: "center", alignItems: "center",
    },
    headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    headerIconBox: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: C.primaryLight,
        justifyContent: "center", alignItems: "center",
    },
    headerTitle: { fontSize: 17, fontWeight: "700", color: C.text },
    headerSub: { fontSize: 11, color: C.textSub, marginTop: 1 },
    addBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: C.primary,
        justifyContent: "center", alignItems: "center",
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
    },

    // Stats bar
    statsBar: {
        flexDirection: "row", gap: 10,
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: C.card,
        borderBottomWidth: 1, borderBottomColor: C.line,
    },
    statChip: {
        flexDirection: "row", alignItems: "center", gap: 5,
        backgroundColor: C.bg, borderRadius: 20,
        paddingHorizontal: 12, paddingVertical: 5,
        borderWidth: 1, borderColor: C.line,
    },
    statChipText: { fontSize: 12, fontWeight: "600", color: C.primary },

    // List
    list: { padding: 16, gap: 12 },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    loadingText: { marginTop: 12, fontSize: 14, color: C.textMuted },

    // Card
    card: {
        backgroundColor: C.card, borderRadius: 16,
        overflow: "hidden",
        shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    },
    cardAccent: { height: 4, width: "100%" },
    cardBody: { padding: 16 },
    cardName: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 12 },
    cardDivider: { height: 1, backgroundColor: C.line, marginBottom: 12 },
    cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
    cardMetaText: { fontSize: 12, color: C.textMuted },
    metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.textMuted },
    dateText: { fontSize: 12, color: C.textMuted },
    cardActions: { flexDirection: "row", gap: 8 },
    editBtn: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: C.primaryLight,
        justifyContent: "center", alignItems: "center",
    },
    deleteBtn: {
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: C.dangerSoft,
        justifyContent: "center", alignItems: "center",
    },

    // Empty state
    emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 36 },
    emptyIconBg: {
        width: 90, height: 90, borderRadius: 45,
        justifyContent: "center", alignItems: "center", marginBottom: 24,
        borderWidth: 1, borderColor: C.primaryBorder,
    },
    emptyTitle: { fontSize: 21, fontWeight: "700", color: C.text, marginBottom: 8 },
    emptySub: { fontSize: 14, color: C.textSub, textAlign: "center", lineHeight: 22, marginBottom: 32 },
    emptyBtn: {
        width: "100%", borderRadius: 14,
        shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
    },
    emptyBtnGrad: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 8, paddingVertical: 15, borderRadius: 14,
    },
    emptyBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.6)", justifyContent: "flex-end" },
    modalSheet: {
        backgroundColor: C.card,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        maxHeight: "93%",
        overflow: "hidden",
    },
    dragHandle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: C.line,
        alignSelf: "center", marginTop: 12, marginBottom: 4,
    },
    modalHdr: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: C.line,
    },
    modalHdrLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    modalHdrIcon: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: C.primaryLight,
        justifyContent: "center", alignItems: "center",
    },
    modalTitle: { fontSize: 17, fontWeight: "700", color: C.text },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: C.bg,
        justifyContent: "center", alignItems: "center",
    },
    modalScroll: { padding: 20 },

    // Form
    field: { marginBottom: 20 },
    fieldLabel: {
        fontSize: 11, fontWeight: "700", color: C.textSub,
        letterSpacing: 0.8, marginBottom: 8,
    },
    fieldHint: { fontSize: 11, color: C.textMuted, marginTop: 6 },
    input: {
        borderWidth: 1.5, borderColor: C.line, borderRadius: 12,
        paddingHorizontal: 16, paddingVertical: 13,
        fontSize: 15, color: C.text, backgroundColor: "#FAFBFC",
    },
    saveBtn: {
        marginTop: 8, marginBottom: 16, borderRadius: 14,
        shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
    },
    saveBtnGrad: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 8, paddingVertical: 15, borderRadius: 14,
    },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});