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
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as productService from "../services/productService";

export default function ProductScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "" });
  const [editingId, setEditingId] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const inputRefs = useRef({ name: null });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await productService.getAllProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch products");
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const resetForm = useCallback(() => {
    setFormData({ name: "" });
    setEditingId(null);
    setShowForm(false);
    inputRefs.current.items = [];
  }, []);

  const handleInputChange = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // items removed from simple product form

  const handleSaveProduct = useCallback(async () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Product name is required");
      return;
    }
    const validItems = [{ name: formData.name.trim() }];

    try {
      setFormLoading(true);
      const payload = { name: formData.name, items: validItems };
      if (editingId) {
        await productService.updateProduct(editingId, payload);
        Alert.alert("Success", "Product updated successfully");
      } else {
        await productService.createProduct(payload);
        Alert.alert("Success", "Product created successfully");
      }
      resetForm();
      fetchProducts();
    } catch (error) {
      Alert.alert(
        "Error",
        error.response?.data?.error || "Failed to save product",
      );
      console.error(error);
    } finally {
      setFormLoading(false);
    }
  }, [formData, editingId, resetForm]);

  const handleEditProduct = useCallback((item) => {
    setEditingId(item._id);
    setFormData({ name: item.name });
    setShowForm(true);
  }, []);

  const handleDeleteProduct = useCallback((id) => {
    Alert.alert(
      "Delete Product",
      "Are you sure you want to delete this product?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await productService.deleteProduct(id);
              Alert.alert("Success", "Product deleted successfully");
              fetchProducts();
            } catch (error) {
              Alert.alert("Error", "Failed to delete product");
            }
          },
          style: "destructive",
        },
      ],
    );
  }, []);

  const ProductItem = useMemo(
    () =>
      ({ item }) => (
        <View style={styles.sourceCard}>
          <View style={styles.sourceHeader}>
            <View>
              <Text style={styles.sourceName}>{item.name}</Text>
              <Text style={styles.sourceCount}>
                {item.items.length} item{item.items.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={() => handleEditProduct(item)}
                style={styles.editBtn}
              >
                <Ionicons name="pencil" size={18} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteProduct(item._id)}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.sourcesList}>
            {item.items.map((it, idx) => (
              <View key={`${item._id}-item-${idx}`} style={styles.sourceBadge}>
                <Text style={styles.sourceBadgeText}>{it.name || it}</Text>
              </View>
            ))}
          </View>
        </View>
      ),
    [handleEditProduct, handleDeleteProduct],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc", paddingTop: insets.top + 10 }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.topHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ padding: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Products</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ padding: 16 }}>
        <TouchableOpacity
          onPress={() => setShowForm(true)}
          style={{ marginBottom: 12 }}
        >
          <View
            style={{
              backgroundColor: "#2563eb",
              padding: 12,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              Add Product
            </Text>
          </View>
        </TouchableOpacity>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(i) => i._id}
            renderItem={ProductItem}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        )}
      </View>

      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.formWrapper}
        >
          <View style={styles.formContainer}>
            <View style={styles.formHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={{ marginRight: 12 }}
                >
                  <Ionicons name="arrow-back" size={22} color="#334155" />
                </TouchableOpacity>
                <Text style={styles.formTitle}>
                  {editingId ? "Edit Product" : "Add Product"}
                </Text>
              </View>
              <TouchableOpacity onPress={resetForm} disabled={formLoading}>
                <Ionicons name="close" size={24} color="#334155" />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product Name</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(t) => handleInputChange("name", t)}
                />
              </View>

              {/* Items removed from product form - products are simple name-only entries here */}

              <TouchableOpacity
                onPress={handleSaveProduct}
                style={[styles.saveBtn, formLoading && styles.saveBtnDisabled]}
                disabled={formLoading}
              >
                {formLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>
                      {editingId ? "Update" : "Save"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight + 8 : 12,
    paddingBottom: 12,
    backgroundColor: "#f8fafc",
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  formWrapper: { position: "absolute", left: 0, right: 0, top: 80, bottom: 0 },
  formContainer: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 12,
    overflow: "hidden",
    flex: 1,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  formTitle: { fontSize: 16, fontWeight: "800" },
  formContent: { padding: 12 },
  formGroup: { marginBottom: 12 },
  label: { fontSize: 13, color: "#475569", marginBottom: 6 },
  input: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inputDynamic: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  addMoreText: { color: "#2563eb", fontWeight: "700", marginLeft: 6 },
  saveBtn: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", marginLeft: 8 },
  saveBtnDisabled: { opacity: 0.6 },

  sourceCard: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e6eefb",
  },
  sourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sourceName: { fontSize: 16, fontWeight: "800" },
  sourceCount: { fontSize: 12, color: "#64748b" },
  actionButtons: { flexDirection: "row", gap: 8 },
  editBtn: { marginLeft: 8, padding: 6 },
  deleteBtn: { marginLeft: 8, padding: 6 },
  sourcesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 8,
  },
  sourceBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  sourceBadgeText: { color: "#334155" },
});
