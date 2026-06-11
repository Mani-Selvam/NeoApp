import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ListSkeleton } from "../components/skeleton/screens";
import { SkeletonPulse } from "../components/skeleton/Skeleton";
import * as messageTemplateService from "../services/messageTemplateService";

const T = {
  bg: "#f5f4f0",
  card: "#ffffff",
  ink: "#0b0f1a",
  mid: "#4b5563",
  mute: "#9ca3af",
  line: "#e8e8e3",
  lineLight: "#f3f3ef",
  danger: "#b91c1c",
  radius: 8,
  radiusLg: 14,
};

const CATEGORIES = ["Sales", "Support", "Marketing", "General"];
const STATUSES = ["Active", "Inactive"];

export default function MessageTemplateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    keyword: "",
    content: "",
    category: "General",
    status: "Active",
  });
  
  const [focusedField, setFocusedField] = useState(null);
  const [expanded, setExpanded] = useState({});

  const pad = width >= 1024 ? 32 : width >= 768 ? 24 : 20;
  const nameInputRef = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const data = await messageTemplateService.getMessageTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch { Alert.alert("Error", "Failed to fetch templates"); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const resetForm = useCallback(() => {
    setForm({
      name: "",
      keyword: "",
      content: "",
      category: "General",
      status: "Active",
    });
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.keyword.trim() || !form.content.trim()) {
        Alert.alert("Required Fields", "Please fill in all template fields");
        return;
    }
    try {
      setFormLoading(true);
      if (editingId) {
          await messageTemplateService.updateMessageTemplate(editingId, form);
      } else {
          await messageTemplateService.createMessageTemplate(form);
      }
      resetForm();
      load();
    } catch (error) {
        Alert.alert("Error", error.response?.data?.message || "Save failed");
    } finally {
        setFormLoading(false);
    }
  }, [form, editingId, resetForm]);

  const handleEdit = useCallback((item) => {
    setEditingId(item._id); 
    setForm({
      name: item.name,
      keyword: item.keyword,
      content: item.content,
      category: item.category || "General",
      status: item.status || "Active",
    });
    setShowForm(true);
    setTimeout(() => nameInputRef.current?.focus(), 150);
  }, []);

  const handleDelete = useCallback((id) => {
    Alert.alert("Delete template", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await messageTemplateService.deleteMessageTemplate(id); load(); } catch { Alert.alert("Error", "Failed to delete"); } } },
    ]);
  }, []);

  const Hdr = () => (
    <View style={[styles.hdr, { paddingTop: insets.top + 14, paddingHorizontal: pad }]}>
      <TouchableOpacity onPress={() => showForm ? setShowForm(false) : navigation.goBack()} style={styles.hdrBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={T.ink} />
      </TouchableOpacity>
      <Text style={styles.hdrTitle}>Quick Replies</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  const renderItem = useCallback(({ item, index }) => {
    const isOpen = expanded[item._id];
    return (
      <View style={[styles.row, index === 0 && { borderTopWidth: 0 }]}>
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => setExpanded((p) => ({ ...p, [item._id]: !p[item._id] }))}
          activeOpacity={0.7}>
          <Text style={styles.rowNum}>{String(index + 1).padStart(2, "0")}</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowName}>{item.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                <Text style={styles.rowSub}>@{item.keyword}</Text>
                <View style={styles.dot} />
                <Text style={styles.rowSub}>{item.category}</Text>
                <View style={styles.dot} />
                <Text style={[styles.rowSub, item.status === "Active" ? {color: "#10B981"} : {}]}>{item.status}</Text>
            </View>
          </View>
          <View style={styles.rowAct}>
            <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={14} color={T.mid} />
            </TouchableOpacity>
            <View style={styles.actSep} />
            <TouchableOpacity onPress={() => handleDelete(item._id)} style={styles.actBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={14} color={T.danger} />
            </TouchableOpacity>
            <View style={styles.actSep} />
            <View style={styles.actBtn}>
              <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={T.mute} />
            </View>
          </View>
        </TouchableOpacity>
        {isOpen && (
          <View style={styles.rowSub2}>
            <View style={styles.subItem}>
              <Ionicons name="chatbubble-ellipses-outline" size={14} color={T.mute} style={{ marginTop: 2 }} />
              <Text style={styles.subTxt}>{item.content}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }, [handleEdit, handleDelete, expanded]);

  if (showForm) return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: T.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={["left", "right"]}>
        <StatusBar barStyle="dark-content" backgroundColor={T.bg} />
        <Hdr />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 4, paddingBottom: 60 }}>
          <View style={[styles.formCard, { maxWidth: 680, alignSelf: "center", width: "100%" }]}>
            <Text style={styles.fEye}>{editingId ? "EDIT" : "NEW"}</Text>
            <Text style={styles.fTitle}>{editingId ? "Edit Template" : "New Template"}</Text>
            <View style={styles.fDivider} />
            
            <Text style={styles.fLbl}>TEMPLATE NAME</Text>
            <TextInput
              ref={nameInputRef}
              style={[styles.fInput, focusedField === "name" && styles.fInputFocus]}
              placeholder="e.g. Welcome Message"
              placeholderTextColor={T.mute}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
              editable={!formLoading}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.fLbl}>KEYWORD TRIGGER</Text>
            <View style={[styles.fInput, styles.fInputWithIcon, focusedField === "keyword" && styles.fInputFocus, { marginBottom: 22 }]}>
                <Text style={styles.fInputIcon}>@</Text>
                <TextInput
                  style={styles.fInputInner}
                  placeholder="welcome"
                  placeholderTextColor={T.mute}
                  value={form.keyword}
                  onChangeText={(v) => setForm({ ...form, keyword: v.toLowerCase().replace(/\s+/g, "") })}
                  onFocus={() => setFocusedField("keyword")}
                  onBlur={() => setFocusedField(null)}
                  editable={!formLoading}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
            </View>

            <Text style={styles.fLbl}>CATEGORY</Text>
            <View style={styles.pickerRow}>
                {CATEGORIES.map((cat) => {
                    const isActive = form.category === cat;
                    return (
                        <TouchableOpacity
                            key={cat}
                            style={[styles.pickerItem, isActive && styles.pickerItemActive]}
                            onPress={() => setForm({ ...form, category: cat })}
                            activeOpacity={0.7}>
                            <Text style={[styles.pickerText, isActive && styles.pickerTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <Text style={styles.fLbl}>STATUS</Text>
            <View style={styles.pickerRow}>
                {STATUSES.map((status) => {
                    const isActive = form.status === status;
                    return (
                        <TouchableOpacity
                            key={status}
                            style={[styles.pickerItem, isActive && styles.pickerItemActive]}
                            onPress={() => setForm({ ...form, status })}
                            activeOpacity={0.7}>
                            <Text style={[styles.pickerText, isActive && styles.pickerTextActive]}>{status}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <Text style={styles.fLbl}>MESSAGE CONTENT</Text>
            <TextInput
              style={[styles.fInput, styles.fTextArea, focusedField === "content" && styles.fInputFocus]}
              placeholder="Type your template message content here…"
              placeholderTextColor={T.mute}
              value={form.content}
              onChangeText={(v) => setForm({ ...form, content: v })}
              onFocus={() => setFocusedField("content")}
              onBlur={() => setFocusedField(null)}
              editable={!formLoading}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <TouchableOpacity style={[styles.btnPri, formLoading && { opacity: 0.5 }, { marginTop: 10 }]} onPress={handleSave} disabled={formLoading} activeOpacity={0.85}>
              {formLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPriTxt}>{editingId ? "Save changes" : "Create template"}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnGhost} onPress={resetForm} disabled={formLoading} activeOpacity={0.7}>
              <Text style={styles.btnGhostTxt}>Discard</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor={T.bg} />
      <Hdr />
      {loading
        ? <View style={{ paddingHorizontal: pad, paddingTop: 20 }}><SkeletonPulse><ListSkeleton count={6} itemHeight={60} withAvatar={false} /></SkeletonPulse></View>
        : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 110 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.mute} />}>
            <View style={styles.metaRow}>
              <Text style={styles.metaCount}>{templates.length} {templates.length === 1 ? "template" : "templates"}</Text>
            </View>
            {templates.length > 0
              ? (
                <View style={styles.table}>
                  <FlatList scrollEnabled={false} data={templates} keyExtractor={(i) => i._id} renderItem={renderItem} />
                </View>
              )
              : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTtl}>No templates yet</Text>
                  <Text style={styles.emptySub}>Create your first message template trigger to reply quickly in chat conversations.</Text>
                </View>
              )}
          </ScrollView>
        )}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 24, paddingHorizontal: pad }]}>
        <TouchableOpacity style={styles.fab} onPress={() => setShowForm(true)} activeOpacity={0.87}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.fabTxt}>Add Template</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  hdr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 18 },
  hdrTitle: { fontSize: 16, fontWeight: "700", color: T.ink, letterSpacing: -0.2 },
  hdrBtn: { width: 36, height: 36, borderRadius: T.radius, backgroundColor: T.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.line },
  metaRow: { paddingVertical: 14 },
  metaCount: { fontSize: 11, fontWeight: "700", color: T.mute, letterSpacing: 1, textTransform: "uppercase" },
  table: { backgroundColor: T.card, borderRadius: T.radiusLg, borderWidth: 1, borderColor: T.line, overflow: "hidden" },
  row: { borderTopWidth: 1, borderTopColor: T.line },
  rowMain: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14 },
  rowNum: { fontSize: 11, fontWeight: "700", color: T.mute, width: 26, letterSpacing: 0.5 },
  rowBody: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: T.ink },
  rowSub: { fontSize: 12, color: T.mute },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: T.mute, marginHorizontal: 6 },
  rowAct: { flexDirection: "row", alignItems: "center" },
  actBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  actSep: { width: 1, height: 14, backgroundColor: T.line },
  rowSub2: { paddingHorizontal: 54, paddingBottom: 14 },
  subItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: T.bg, padding: 12, borderRadius: T.radius, borderWidth: 1, borderColor: T.lineLight },
  subTxt: { flex: 1, fontSize: 13, color: T.mid, lineHeight: 20 },
  empty: { paddingTop: 52 },
  emptyTtl: { fontSize: 22, fontWeight: "800", color: T.ink, marginBottom: 10, letterSpacing: -0.5 },
  emptySub: { fontSize: 14, color: T.mute, lineHeight: 22, maxWidth: 320 },
  fabWrap: { position: "absolute", left: 0, right: 0 },
  fab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.ink, paddingVertical: 15, borderRadius: T.radius, shadowColor: T.ink, shadowOpacity: 0.20, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  fabTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  
  formCard: { backgroundColor: T.card, borderRadius: T.radiusLg, borderWidth: 1, borderColor: T.line, padding: 28, marginTop: 8 },
  fEye: { fontSize: 10, fontWeight: "700", color: T.mute, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  fTitle: { fontSize: 28, fontWeight: "800", color: T.ink, letterSpacing: -0.7, marginBottom: 22 },
  fDivider: { height: 1, backgroundColor: T.line, marginBottom: 22 },
  fLbl: { fontSize: 11, fontWeight: "700", color: T.mute, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  fInput: { height: 50, borderWidth: 1, borderColor: T.line, borderRadius: T.radius, paddingHorizontal: 16, fontSize: 15, fontWeight: "500", color: T.ink, backgroundColor: T.bg, marginBottom: 22 },
  fInputFocus: { borderColor: T.ink, backgroundColor: T.card },
  fInputWithIcon: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  fInputIcon: { fontSize: 15, fontWeight: "600", color: T.mute, marginRight: 8 },
  fInputInner: { flex: 1, height: "100%", fontSize: 15, fontWeight: "500", color: T.ink },
  fTextArea: { height: 120, paddingTop: 16, paddingBottom: 16 },
  
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  pickerItem: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: T.radius, borderWidth: 1, borderColor: T.line, backgroundColor: T.bg },
  pickerItemActive: { borderColor: T.ink, backgroundColor: T.ink },
  pickerText: { fontSize: 13, fontWeight: "600", color: T.mid },
  pickerTextActive: { color: "#fff" },

  btnPri: { height: 50, backgroundColor: T.ink, borderRadius: T.radius, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  btnPriTxt: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
  btnGhost: { height: 48, borderRadius: T.radius, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.line },
  btnGhostTxt: { color: T.mid, fontSize: 14, fontWeight: "600" },
});

