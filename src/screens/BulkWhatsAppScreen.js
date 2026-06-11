import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, Alert, ActivityIndicator, TextInput,
    Modal, ScrollView, StatusBar, Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MotiView } from "moti";
import { getAllEnquiries } from "../services/enquiryService";
import * as templateService from "../services/officialWhatsappTemplateService";
import * as whatsappService from "../services/whatsappService";
import * as Contacts from "expo-contacts";

const { width: W } = Dimensions.get("window");

// ── Design Tokens ─────────────────────────────────────────────────────────────
const C = {
    primary:       "#2563EB",
    primaryDark:   "#1D4ED8",
    primaryLight:  "#DBEAFE",
    primaryBorder: "#BFDBFE",
    bg:            "#F0F4F8",
    card:          "#FFFFFF",
    text:          "#0F172A",
    textSub:       "#475569",
    textMuted:     "#94A3B8",
    line:          "#E2E8F0",
    success:       "#10B981",
    successSoft:   "#ECFDF5",
    successBorder: "#A7F3D0",
    danger:        "#EF4444",
    dangerSoft:    "#FEE2E2",
    wa:            "#2563EB",
    waDark:        "#1D4ED8",
    waLight:       "#DBEAFE",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const avatarColors = (name = "") => {
    const hash = String(name)
        .split("")
        .reduce((acc, ch) => ch.charCodeAt(0) + ((acc << 5) - acc), 0);
    const h = Math.abs(hash) % 360;
    return [`hsl(${h},65%,55%)`, `hsl(${h},65%,40%)`];
};

// ── Contact Row ───────────────────────────────────────────────────────────────
const ContactRow = React.memo(({ item, selected, onPress, index }) => (
    <MotiView
        from={{ opacity: 0, translateX: -10 }}
        animate={{ opacity: 1, translateX: 0 }}
        transition={{ type: "timing", duration: 250, delay: index * 25 }}
        style={[S.row, selected && S.rowSelected]}
    >
        <TouchableOpacity
            style={S.rowInner}
            onPress={() => onPress(item._id)}
            activeOpacity={0.7}
        >
            {/* Checkbox */}
            <View style={[S.check, selected && S.checkSelected]}>
                {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>

            {/* Avatar */}
            <LinearGradient colors={avatarColors(item.name)} style={S.avatar}>
                <Text style={S.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
            </LinearGradient>

            {/* Info */}
            <View style={S.rowInfo}>
                <Text style={S.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={S.rowPhone}>{item.mobile}</Text>
            </View>

            {/* WA icon for selected */}
            {selected && (
                <View style={S.waCheck}>
                    <Ionicons name="logo-whatsapp" size={16} color={C.wa} />
                </View>
            )}
        </TouchableOpacity>
    </MotiView>
));

// ── Progress Overlay ──────────────────────────────────────────────────────────
const ProgressOverlay = ({ current, total }) => {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
        <View style={S.progressOverlay}>
            <View style={S.progressCard}>
                <LinearGradient colors={[C.wa, C.waDark]} style={S.progressIconCircle}>
                    <Ionicons name="logo-whatsapp" size={28} color="#fff" />
                </LinearGradient>
                <Text style={S.progressTitle}>Sending Bulk Messages</Text>
                <Text style={S.progressSub}>{current} of {total} sent</Text>

                {/* Progress bar */}
                <View style={S.progressTrack}>
                    <MotiView
                        from={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ type: "timing", duration: 400 }}
                        style={S.progressFill}
                    />
                </View>
                <Text style={S.progressPct}>{pct}%</Text>
            </View>
        </View>
    );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BulkWhatsAppScreen({ navigation }) {
    const insets = useSafeAreaInsets();

    const [enquiries, setEnquiries]           = useState([]);
    const [deviceContacts, setDeviceContacts] = useState([]);
    const [contactMode, setContactMode]       = useState("enquiry");
    const [loading, setLoading]               = useState(true);
    const [searchQuery, setSearchQuery]       = useState("");

    const enableDeviceContacts = String(process.env.EXPO_PUBLIC_ENABLE_CONTACTS_IMPORT || "").trim() === "true";

    const loadDeviceContacts = async () => {
        try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status === 'granted') {
                const { data } = await Contacts.getContactsAsync({
                    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
                });

                if (data.length > 0) {
                    const mapped = data
                        .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
                        .map((c, i) => {
                            const mobileRaw = c.phoneNumbers[0].number || "";
                            const digits = mobileRaw.replace(/\D/g, "");
                            return {
                                _id: c.id || `contact_${i}`,
                                name: c.name || "Unknown",
                                mobile: digits.length >= 10 ? digits : mobileRaw,
                            };
                        });
                    setDeviceContacts(mapped);
                }
            } else {
                Alert.alert("Permission Denied", "Cannot access device contacts.");
            }
        } catch (err) {
            console.log("Error fetching contacts:", err);
        }
    };

    const handleSwitchMode = (mode) => {
        if (mode === contactMode) return;
        setContactMode(mode);
        setSelectedIds(new Set());
        setSearchQuery("");
        if (mode === "device" && deviceContacts.length === 0) {
            loadDeviceContacts();
        }
    };
    const [selectedIds, setSelectedIds]       = useState(new Set());
    const [templates, setTemplates]           = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [showTmplModal, setShowTmplModal]   = useState(false);
    const [isSending, setIsSending]           = useState(false);
    const [progress, setProgress]             = useState({ total: 0, current: 0 });

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [enqData, tmplData] = await Promise.all([
                getAllEnquiries(),
                templateService.getAllOfficialTemplates(),
            ]);
            const valid = (enqData?.data || enqData || []).filter(e =>
                String(e?.mobile || "").replace(/\D/g, "").length >= 10
            );
            setEnquiries(valid);
            setTemplates((tmplData?.templates || []).filter(t => t.status === "Active"));
        } catch {
            Alert.alert("Error", "Failed to load data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const activeList = contactMode === "enquiry" ? enquiries : deviceContacts;

    const filtered = useMemo(() => {
        if (!searchQuery) return activeList;
        const q = searchQuery.toLowerCase();
        return activeList.filter(e =>
            (e.name || "").toLowerCase().includes(q) || (e.mobile || "").includes(q)
        );
    }, [activeList, searchQuery]);

    const allSelected = selectedIds.size === filtered.length && filtered.length > 0;

    const toggleAll = () => {
        setSelectedIds(allSelected ? new Set() : new Set(filtered.map(e => e._id)));
    };

    const toggleOne = useCallback((id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const handleSend = () => {
        if (selectedIds.size === 0) {
            Alert.alert("No contacts selected", "Please select at least one contact.");
            return;
        }
        if (!selectedTemplate) {
            Alert.alert("No template", "Please select a WhatsApp template.");
            return;
        }
        Alert.alert(
            "Confirm Bulk Send",
            `Send "${selectedTemplate.name}" to ${selectedIds.size} contact${selectedIds.size > 1 ? "s" : ""}?`,
            [
                { text: "Cancel", style: "cancel" },
                { text: "Send Now", onPress: executeSend },
            ]
        );
    };

    const executeSend = async () => {
        setIsSending(true);
        const activeList = contactMode === "enquiry" ? enquiries : deviceContacts;
        const contacts = activeList.filter(e => selectedIds.has(e._id));
        setProgress({ total: contacts.length, current: 0 });

        let ok = 0, fail = 0;
        for (const c of contacts) {
            try {
                const digits = String(c.mobile || "").replace(/\D/g, "");
                await whatsappService.sendMessage({
                    phoneNumber:   digits.length === 10 ? `91${digits}` : digits,
                    type:          "template",
                    templateName:  selectedTemplate.name,
                    language:      selectedTemplate.language || "en",
                    buttonIndex:   selectedTemplate.buttonIndex ?? 0,
                    enquiryId:     c._id,
                });
                ok++;
            } catch { fail++; }
            setProgress(p => ({ ...p, current: p.current + 1 }));
            await new Promise(r => setTimeout(r, 500));
        }

        setIsSending(false);
        setProgress({ total: 0, current: 0 });
        Alert.alert(
            "✅ Bulk Send Complete",
            `Sent: ${ok}  |  Failed: ${fail}`,
            [{ text: "OK", onPress: () => { setSelectedIds(new Set()); setSelectedTemplate(null); } }]
        );
    };

    const canSend = selectedIds.size > 0 && !!selectedTemplate && !isSending;

    return (
        <View style={S.root}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            {/* ── Sticky White Header ── */}
            <View style={[S.header, { paddingTop: insets.top + 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: C.line }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn} activeOpacity={0.7}>
                    <Ionicons name="arrow-back" size={22} color={C.text} />
                </TouchableOpacity>
                <View style={S.headerCenter}>
                    <View style={S.headerIconBox}>
                        <Ionicons name="logo-whatsapp" size={18} color={C.wa} />
                    </View>
                    <View>
                        <Text style={S.headerTitle}>Bulk WhatsApp</Text>
                        <Text style={S.headerSub}>Send to multiple contacts</Text>
                    </View>
                </View>
                {selectedIds.size > 0 && (
                    <View style={S.headerBadge}>
                        <Text style={S.headerBadgeText}>{selectedIds.size}</Text>
                    </View>
                )}
            </View>

            {/* ── Segmented Control for Modes ── */}
            {enableDeviceContacts && (
                <View style={S.segmentRow}>
                    <TouchableOpacity
                        style={[S.segmentBtn, contactMode === "enquiry" && S.segmentBtnActive]}
                        onPress={() => handleSwitchMode("enquiry")}
                        activeOpacity={0.7}
                    >
                        <Text style={[S.segmentTxt, contactMode === "enquiry" && S.segmentTxtActive]}>Enquiries</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[S.segmentBtn, contactMode === "device" && S.segmentBtnActive]}
                        onPress={() => handleSwitchMode("device")}
                        activeOpacity={0.7}
                    >
                        <Text style={[S.segmentTxt, contactMode === "device" && S.segmentTxtActive]}>My Contacts</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* ── Search + Select All (sticky sub-header) ── */}
            <View style={S.subHeader}>
                {/* Template Picker */}
                <TouchableOpacity
                    style={[S.templatePicker, selectedTemplate && S.templatePickerActive, { marginBottom: 12 }]}
                    onPress={() => setShowTmplModal(true)}
                    disabled={isSending}
                    activeOpacity={0.8}
                >
                    <View style={S.templatePickerLeft}>
                        <View style={[S.templatePickerIcon, selectedTemplate && { backgroundColor: C.primaryLight }]}>
                            <Ionicons
                                name={selectedTemplate ? "checkmark-circle" : "document-text-outline"}
                                size={18}
                                color={selectedTemplate ? C.primary : C.textMuted}
                            />
                        </View>
                        <View>
                            <Text style={S.templatePickerLabel}>TEMPLATE</Text>
                            <Text style={[S.templatePickerName, !selectedTemplate && { color: C.textMuted }]} numberOfLines={1}>
                                {selectedTemplate ? selectedTemplate.name : "Select a template…"}
                            </Text>
                        </View>
                    </View>
                    <Ionicons name="chevron-down" size={18} color={C.textMuted} />
                </TouchableOpacity>

                <View style={S.searchBox}>
                    <Ionicons name="search-outline" size={17} color={C.textMuted} />
                    <TextInput
                        style={S.searchInput}
                        placeholder="Search contacts…"
                        placeholderTextColor={C.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                            <Ionicons name="close-circle" size={16} color={C.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>

                <View style={S.actionsRow}>
                    <TouchableOpacity style={S.selectAllBtn} onPress={toggleAll} activeOpacity={0.7}>
                        <View style={[S.checkSmall, allSelected && S.checkSmallOn]}>
                            {allSelected && <Ionicons name="checkmark" size={11} color="#fff" />}
                        </View>
                        <Text style={S.selectAllText}>
                            {allSelected ? "Deselect All" : "Select All"}
                        </Text>
                    </TouchableOpacity>
                    <Text style={S.countText}>
                        {selectedIds.size > 0
                            ? `${selectedIds.size} of ${filtered.length} selected`
                            : `${filtered.length} contact${filtered.length !== 1 ? "s" : ""}`}
                    </Text>
                </View>
            </View>

            {/* ── Contact List ── */}
            {loading ? (
                <View style={S.center}>
                    <ActivityIndicator size="large" color={C.wa} />
                    <Text style={S.loadText}>Loading contacts…</Text>
                </View>
            ) : (
                <FlatList
                    style={{ flex: 1 }}
                    data={filtered}
                    keyExtractor={i => i._id}
                    contentContainerStyle={[
                        S.listContent,
                        { paddingBottom: Math.max(insets.bottom, 16) },
                    ]}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={S.center}>
                            <Ionicons name="people-outline" size={48} color={C.line} />
                            <Text style={S.emptyText}>No contacts found</Text>
                        </View>
                    }
                    renderItem={({ item, index }) => (
                        <ContactRow
                            item={item}
                            selected={selectedIds.has(item._id)}
                            onPress={toggleOne}
                            index={index}
                        />
                    )}
                />
            )}

            {/* ── Sticky Bottom Bar ── */}
            <View style={[S.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {/* Send Button */}
                <TouchableOpacity
                    onPress={handleSend}
                    disabled={!canSend}
                    activeOpacity={0.85}
                    style={[S.sendBtn, !canSend && S.sendBtnDisabled]}
                >
                    <LinearGradient
                        colors={canSend ? [C.wa, C.waDark] : ["#94A3B8", "#64748B"]}
                        style={S.sendBtnGrad}
                    >
                        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                        <Text style={S.sendBtnText}>
                            {selectedIds.size > 0
                                ? `Send to ${selectedIds.size} Contact${selectedIds.size > 1 ? "s" : ""}`
                                : "Send Bulk Message"}
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            {/* ── Sending Progress Overlay ── */}
            {isSending && <ProgressOverlay current={progress.current} total={progress.total} />}

            {/* ── Template Modal ── */}
            <Modal statusBarTranslucent={false}
                visible={showTmplModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowTmplModal(false)}
            >
                <View style={[S.modalOverlay, { paddingTop: insets.top || 0 }]}>
                    <View style={S.modalCard}>
                        <LinearGradient colors={[C.primaryLight, "#fff"]} style={S.modalHdr}>
                            <View style={S.modalHdrLeft}>
                                <View style={S.modalHdrIcon}>
                                    <Ionicons name="document-text-outline" size={16} color={C.primary} />
                                </View>
                                <View>
                                    <Text style={S.modalTitle}>Select Template</Text>
                                    <Text style={S.modalSub}>{templates.length} active templates</Text>
                                </View>
                            </View>
                            <TouchableOpacity style={S.closeBtn} onPress={() => setShowTmplModal(false)}>
                                <Ionicons name="close" size={20} color={C.textSub} />
                            </TouchableOpacity>
                        </LinearGradient>

                        <ScrollView 
                            style={{ flexShrink: 1, width: '100%' }}
                            contentContainerStyle={S.modalScroll} 
                            showsVerticalScrollIndicator={true}
                        >
                            {templates.length === 0 ? (
                                <View style={S.center}>
                                    <Ionicons name="document-outline" size={44} color={C.line} />
                                    <Text style={S.emptyText}>No active templates found.</Text>
                                    <Text style={S.emptyTextSub}>Add templates in Neo Templates screen.</Text>
                                </View>
                            ) : templates.map((t, i) => {
                                const isActive = selectedTemplate?._id === t._id;
                                return (
                                    <MotiView
                                        key={t._id}
                                        from={{ opacity: 0, translateY: 8 }}
                                        animate={{ opacity: 1, translateY: 0 }}
                                        transition={{ type: "timing", duration: 250, delay: i * 40 }}
                                    >
                                        <TouchableOpacity
                                            style={[S.tmplItem, isActive && S.tmplItemActive]}
                                            onPress={() => { setSelectedTemplate(t); setShowTmplModal(false); }}
                                            activeOpacity={0.75}
                                        >
                                            <View style={[S.tmplItemIcon, isActive && { backgroundColor: C.primaryLight }]}>
                                                <Ionicons
                                                    name={isActive ? "checkmark-circle" : "document-text-outline"}
                                                    size={18}
                                                    color={isActive ? C.primary : C.textMuted}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[S.tmplItemName, isActive && { color: C.primary }]}>
                                                    {t.name}
                                                </Text>
                                                <View style={S.tmplMeta}>
                                                    <Ionicons name="language-outline" size={11} color={C.textMuted} />
                                                    <Text style={S.tmplMetaText}>{t.language || "en"}</Text>
                                                </View>
                                            </View>
                                            {isActive && (
                                                <Ionicons name="checkmark-circle" size={20} color={C.primary} />
                                            )}
                                        </TouchableOpacity>
                                    </MotiView>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
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
        backgroundColor: C.waLight,
        justifyContent: "center", alignItems: "center",
    },
    headerTitle: { fontSize: 17, fontWeight: "700", color: C.text },
    headerSub:   { fontSize: 11, color: C.textSub, marginTop: 1 },
    headerBadge: {
        minWidth: 28, height: 28, borderRadius: 14,
        backgroundColor: C.wa,
        justifyContent: "center", alignItems: "center",
        paddingHorizontal: 6,
    },
    headerBadgeText: { fontSize: 13, fontWeight: "800", color: "#fff" },

    // Segment Row
    segmentRow: {
        flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 5,
        backgroundColor: "#FFFFFF",
    },
    segmentBtn: {
        flex: 1, paddingVertical: 10, alignItems: "center",
        borderBottomWidth: 2, borderBottomColor: "transparent",
    },
    segmentBtnActive: { borderBottomColor: C.primary },
    segmentTxt: { fontSize: 14, fontWeight: "600", color: C.textSub },
    segmentTxtActive: { color: C.primary },

    // Sub-header
    subHeader: {
        backgroundColor: C.card,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: C.line,
        shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 3,
    },
    searchBox: {
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: C.bg, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: C.line,
        marginBottom: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 0 },
    actionsRow: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    },
    selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 8 },
    checkSmall: {
        width: 20, height: 20, borderRadius: 6,
        borderWidth: 1.5, borderColor: C.line,
        backgroundColor: C.bg,
        justifyContent: "center", alignItems: "center",
    },
    checkSmallOn: { backgroundColor: C.wa, borderColor: C.wa },
    selectAllText: { fontSize: 13, fontWeight: "600", color: C.wa },
    countText: { fontSize: 13, color: C.textMuted, fontWeight: "500" },

    // List
    listContent: { padding: 12, gap: 8 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 48 },
    loadText: { marginTop: 12, fontSize: 14, color: C.textMuted },
    emptyText: { marginTop: 12, fontSize: 16, fontWeight: "600", color: C.textSub },
    emptyTextSub: { marginTop: 4, fontSize: 13, color: C.textMuted },

    // Contact Row
    row: {
        backgroundColor: C.card, borderRadius: 14,
        borderWidth: 1.5, borderColor: C.line,
        overflow: "hidden",
    },
    rowSelected: {
        borderColor: C.wa,
        backgroundColor: "#F0FFF4",
    },
    rowInner: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
    check: {
        width: 24, height: 24, borderRadius: 7,
        borderWidth: 2, borderColor: C.line,
        justifyContent: "center", alignItems: "center",
        backgroundColor: "#fff",
    },
    checkSelected: { backgroundColor: C.wa, borderColor: C.wa },
    avatar: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: "center", alignItems: "center",
    },
    avatarText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    rowInfo: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: "600", color: C.text },
    rowPhone: { fontSize: 13, color: C.textMuted, marginTop: 2 },
    waCheck: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: C.waLight,
        justifyContent: "center", alignItems: "center",
    },

    // Bottom Bar
    bottomBar: {
        backgroundColor: C.card,
        paddingHorizontal: 16, paddingTop: 14,
        borderTopWidth: 1, borderTopColor: C.line,
        shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1, shadowRadius: 16, elevation: 20, zIndex: 999,
        gap: 10,
    },
    templatePicker: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        borderWidth: 1.5, borderColor: C.line,
        borderRadius: 12, padding: 12,
        backgroundColor: C.bg,
    },
    templatePickerActive: { borderColor: C.primaryBorder, backgroundColor: C.primaryLight },
    templatePickerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    templatePickerIcon: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: C.bg,
        justifyContent: "center", alignItems: "center",
        borderWidth: 1, borderColor: C.line,
    },
    templatePickerLabel: { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.6 },
    templatePickerName: { fontSize: 14, fontWeight: "600", color: C.text, maxWidth: W - 120 },
    sendBtn: { borderRadius: 14, overflow: "hidden" },
    sendBtnDisabled: { opacity: 0.6 },
    sendBtnGrad: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 8, paddingVertical: 15, borderRadius: 14,
    },
    sendBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

    // Progress overlay
    progressOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(15,23,42,0.75)",
        justifyContent: "center", alignItems: "center",
    },
    progressCard: {
        backgroundColor: "#fff", borderRadius: 24,
        padding: 32, alignItems: "center",
        width: W * 0.8,
        shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15, shadowRadius: 24, elevation: 16,
    },
    progressIconCircle: {
        width: 64, height: 64, borderRadius: 32,
        justifyContent: "center", alignItems: "center", marginBottom: 18,
    },
    progressTitle: { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 6 },
    progressSub: { fontSize: 14, color: C.textMuted, marginBottom: 20 },
    progressTrack: {
        width: "100%", height: 8, borderRadius: 4,
        backgroundColor: C.line, overflow: "hidden", marginBottom: 8,
    },
    progressFill: {
        height: 8, borderRadius: 4,
        backgroundColor: C.wa,
    },
    progressPct: { fontSize: 13, fontWeight: "600", color: C.wa },

    // Template Modal
    modalOverlay: {
        flex: 1, backgroundColor: "rgba(15,23,42,0.6)",
        justifyContent: "center", alignItems: "center",
    },
    modalCard: {
        backgroundColor: C.card,
        borderRadius: 24,
        width: W * 0.9,
        maxHeight: "80%",
        overflow: "hidden",
    },
    modalHdr: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingHorizontal: 20, paddingVertical: 16,
        borderBottomWidth: 1, borderBottomColor: C.line,
    },
    modalHdrLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    modalHdrIcon: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: C.primaryLight,
        justifyContent: "center", alignItems: "center",
    },
    modalTitle: { fontSize: 16, fontWeight: "700", color: C.text },
    modalSub: { fontSize: 12, color: C.textMuted, marginTop: 1 },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: C.bg,
        justifyContent: "center", alignItems: "center",
    },
    modalScroll: { padding: 16 },

    // Template item in modal
    tmplItem: {
        flexDirection: "row", alignItems: "center", gap: 12,
        padding: 14, borderRadius: 14,
        borderWidth: 1.5, borderColor: C.line,
        backgroundColor: C.card, marginBottom: 10,
    },
    tmplItemActive: { borderColor: C.primaryBorder, backgroundColor: C.primaryLight },
    tmplItemIcon: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: C.bg,
        justifyContent: "center", alignItems: "center",
        borderWidth: 1, borderColor: C.line,
    },
    tmplItemName: { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 5 },
    tmplMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
    tmplMetaText: { fontSize: 11, color: C.textMuted },
});
