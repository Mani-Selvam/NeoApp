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
import * as productService from "../services/productService";

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

export default function ProductScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "" });
  const [editingId, setEditingId] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState({});

  const isTablet = width >= 768;
  const pad = width >= 1024 ? 32 : width >= 768 ? 24 : 20;
  const inputRef = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const data = await productService.getAllProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch { Alert.alert("Error", "Failed to fetch products"); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const resetForm = useCallback(() => {
    setFormData({ name: "" }); setEditingId(null); setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) { Alert.alert("Required", "Product name cannot be empty"); return; }
    try {
      setFormLoading(true);
      const payload = { name: formData.name.trim(), items: [{ name: formData.name.trim() }] };
      editingId ? await productService.updateProduct(editingId, payload) : await productService.createProduct(payload);
      resetForm(); load();
    } catch (e) { Alert.alert("Error", e.response?.data?.error || "Save failed"); }
    finally { setFormLoading(false); }
  }, [formData, editingId, resetForm]);

  const handleEdit = useCallback((item) => {
    setEditingId(item._id); setFormData({ name: item.name }); setShowForm(true);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  const handleDelete = useCallback((id) => {
    Alert.alert("Delete product", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await productService.deleteProduct(id); load(); } catch { Alert.alert("Error", "Failed to delete"); } } },
    ]);
  }, []);

  const Hdr = () => (
    <View style={[styles.hdr, { paddingTop: insets.top + 14, paddingHorizontal: pad }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hdrBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={T.ink} />
      </TouchableOpacity>
      <Text style={styles.hdrTitle}>Products</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  const renderItem = useCallback(({ item, index }) => {
    const isOpen = expanded[item._id];
    const hasItems = item.items?.length > 1;
    return (
      <View style={[styles.row, index === 0 && { borderTopWidth: 0 }]}>
        <TouchableOpacity
          style={styles.rowMain}
          onPress={() => hasItems && setExpanded((p) => ({ ...p, [item._id]: !p[item._id] }))}
          activeOpacity={hasItems ? 0.7 : 1}>
          <Text style={styles.rowNum}>{String(index + 1).padStart(2, "0")}</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowSub}>{item.items.length} {item.items.length === 1 ? "item" : "items"}</Text>
          </View>
          <View style={styles.rowAct}>
            <TouchableOpacity onPress={() => handleEdit(item)} style={styles.actBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={14} color={T.mid} />
            </TouchableOpacity>
            <View style={styles.actSep} />
            <TouchableOpacity onPress={() => handleDelete(item._id)} style={styles.actBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={14} color={T.danger} />
            </TouchableOpacity>
            {hasItems && (
              <>
                <View style={styles.actSep} />
                <View style={styles.actBtn}>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={T.mute} />
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
        {isOpen && hasItems && (
          <View style={styles.rowSub2}>
            {item.items.map((it, idx) => (
              <View key={idx} style={styles.subItem}>
                <View style={styles.subDot} />
                <Text style={styles.subTxt}>{it.name || it}</Text>
              </View>
            ))}
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
            <Text style={styles.fTitle}>{editingId ? "Edit Product" : "New Product"}</Text>
            <View style={styles.fDivider} />
            <Text style={styles.fLbl}>PRODUCT NAME</Text>
            <TextInput
              ref={inputRef}
              style={[styles.fInput, focused && styles.fInputFocus]}
              placeholder="Enter product name"
              placeholderTextColor={T.mute}
              value={formData.name}
              onChangeText={(v) => setFormData({ name: v })}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              editable={!formLoading}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <TouchableOpacity style={[styles.btnPri, formLoading && { opacity: 0.5 }]} onPress={handleSave} disabled={formLoading} activeOpacity={0.85}>
              {formLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPriTxt}>{editingId ? "Save changes" : "Create product"}</Text>}
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
              <Text style={styles.metaCount}>{products.length} {products.length === 1 ? "product" : "products"}</Text>
            </View>
            {products.length > 0
              ? (
                <View style={styles.table}>
                  <FlatList scrollEnabled={false} data={products} keyExtractor={(i) => i._id} renderItem={renderItem} />
                </View>
              )
              : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTtl}>No products yet</Text>
                  <Text style={styles.emptySub}>Add your first product to start organizing your catalogue.</Text>
                </View>
              )}
          </ScrollView>
        )}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 24, paddingHorizontal: pad }]}>
        <TouchableOpacity style={styles.fab} onPress={() => setShowForm(true)} activeOpacity={0.87}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.fabTxt}>Add Product</Text>
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
  rowSub: { fontSize: 12, color: T.mute, marginTop: 2 },
  rowAct: { flexDirection: "row", alignItems: "center" },
  actBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  actSep: { width: 1, height: 14, backgroundColor: T.line },
  rowSub2: { paddingHorizontal: 54, paddingBottom: 14, gap: 8 },
  subItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  subDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: T.mute },
  subTxt: { fontSize: 13, color: T.mid },
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
  btnPri: { height: 50, backgroundColor: T.ink, borderRadius: T.radius, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  btnPriTxt: { color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
  btnGhost: { height: 48, borderRadius: T.radius, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: T.line },
  btnGhostTxt: { color: T.mid, fontSize: 14, fontWeight: "600" },
});