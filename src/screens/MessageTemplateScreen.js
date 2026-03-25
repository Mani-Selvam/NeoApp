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

// --- Responsive Scaling Utility ---
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

// Horizontal Scale
const hs = (size) => (SCREEN_WIDTH / BASE_WIDTH) * size;
// Vertical Scale
const vs = (size) => (SCREEN_HEIGHT / BASE_HEIGHT) * size;
// Moderate Scale (for fonts)
const ms = (size, factor = 0.5) => size + (hs(size) - size) * factor;

const COLORS = {
  primary: "#6366f1",
  primaryLight: "#818cf8",
  secondary: "#a855f7",
  purple: ["#8b5cf6", "#6366f1"],
  bg: "#f1f5f9",
  bgCard: "#ffffff",
  text: "#1e293b",
  textDim: "#475569",
  textMuted: "#94a3b8",
  glassBorder: "rgba(226, 232, 240, 0.8)",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  shadow: "rgba(99, 102, 241, 0.15)",
};

const CATEGORIES = ["Sales", "Support", "Marketing", "General"];
const STATUSES = ["Active", "Inactive"];

const getCategoryColor = (cat) => {
  switch (cat) {
    case "Sales":
      return COLORS.success;
    case "Support":
      return COLORS.info;
    case "Marketing":
      return COLORS.secondary;
    default:
      return COLORS.warning;
  }
};

const TemplateCard = ({ item, onEdit, onDelete }) => (
  <MotiView
    from={{ opacity: 0, translateY: 20, scale: 0.95 }}
    animate={{ opacity: 1, translateY: 0, scale: 1 }}
    transition={{ type: "timing", duration: 400 }}
    style={styles.card}
  >
    <View style={styles.cardHeader}>
      <View style={styles.cardHeaderLeft}>
        <View
          style={[
            styles.categoryBadge,
            { backgroundColor: getCategoryColor(item.category) + "15" },
          ]}
        >
          <Text
            style={[
              styles.categoryText,
              { color: getCategoryColor(item.category) },
            ]}
          >
            {item.category}
          </Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor:
              item.status === "Active"
                ? COLORS.success + "15"
                : COLORS.textMuted + "15",
          },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                item.status === "Active" ? COLORS.success : COLORS.textMuted,
            },
          ]}
        />
        <Text
          style={[
            styles.statusText,
            {
              color:
                item.status === "Active" ? COLORS.success : COLORS.textMuted,
            },
          ]}
        >
          {item.status}
        </Text>
      </View>
    </View>

    <View style={styles.keywordRow}>
      <Ionicons name="key-outline" size={ms(14)} color={COLORS.primary} />
      <Text style={styles.keywordPrefix}>Keyword: </Text>
      <Text style={styles.keywordText}>{item.keyword}</Text>
    </View>

    <Text style={styles.cardContent} numberOfLines={3}>
      {item.content}
    </Text>

    <View style={styles.cardDivider} />

    <View style={styles.cardFooter}>
      <Text style={styles.dateText}>
        Created: {new Date(item.createdAt).toLocaleDateString()}
      </Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(item)}>
          <Ionicons
            name="create-outline"
            size={ms(18)}
            color={COLORS.primary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { marginLeft: hs(12) }]}
          onPress={() => onDelete(item._id)}
        >
          <Ionicons name="trash-outline" size={ms(18)} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  </MotiView>
);

export default function MessageTemplateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
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
      setTemplates(data);
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
    if (!form.name || !form.keyword || !form.content) {
      Alert.alert("Required Fields", "Please fill in all basic fields");
      return;
    }

    try {
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
    }
  };

  const handleDelete = (id) => {
    Alert.alert(
      "Delete Template",
      "Are you sure you want to delete this template?",
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header Section */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={ms(24)} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Templates</Text>
          <Text style={styles.headerSubtitle}>
            {templates.length} Active Templates
          </Text>
        </View>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add-circle" size={ms(28)} color={COLORS.primary} />
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
            { paddingBottom: insets.bottom + hs(100) },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={ms(48)}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.emptyText}>No Templates Yet</Text>
              <Text style={styles.emptySubText}>
                Create your first message template to get started.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => {
                  resetForm();
                  setModalVisible(true);
                }}
              >
                <LinearGradient
                  colors={COLORS.purple}
                  style={styles.emptyBtnGradient}
                >
                  <Ionicons
                    name="add"
                    size={ms(20)}
                    color="#fff"
                    style={{ marginRight: hs(8) }}
                  />
                  <Text style={styles.emptyBtnText}>Create Template</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + hs(30) }]}
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
        activeOpacity={0.8}
      >
        <LinearGradient colors={COLORS.purple} style={styles.fabGradient}>
          <Ionicons name="add" size={ms(32)} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Modal */}
      <Modal
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
              { paddingBottom: insets.bottom + hs(20) },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTemplate ? "Edit Template" : "New Template"}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={ms(24)} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.inputLabel}>Template Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Welcome Message"
                placeholderTextColor={COLORS.textMuted}
                value={form.name}
                onChangeText={(val) => setForm({ ...form, name: val })}
              />

              <Text style={styles.inputLabel}>Keyword</Text>
              <View style={styles.keywordInputWrapper}>
                <Text style={styles.atSymbol}>@</Text>
                <TextInput
                  style={styles.keywordInput}
                  placeholder="welcome"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.keyword}
                  onChangeText={(val) =>
                    setForm({ ...form, keyword: val.toLowerCase() })
                  }
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.pickerRow}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.pickerItem,
                      form.category === cat && styles.pickerItemActive,
                    ]}
                    onPress={() => setForm({ ...form, category: cat })}
                  >
                    <Text
                      style={[
                        styles.pickerText,
                        form.category === cat && styles.pickerTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.pickerRow}>
                {STATUSES.map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.pickerItem,
                      form.status === status && styles.pickerItemActive,
                    ]}
                    onPress={() => setForm({ ...form, status: status })}
                  >
                    <Text
                      style={[
                        styles.pickerText,
                        form.status === status && styles.pickerTextActive,
                      ]}
                    >
                      {status}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Message Content</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Type your message here..."
                placeholderTextColor={COLORS.textMuted}
                value={form.content}
                onChangeText={(val) => setForm({ ...form, content: val })}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={COLORS.purple}
                  style={styles.saveBtnGradient}
                >
                  <Ionicons
                    name={editingTemplate ? "checkmark-circle" : "add-circle"}
                    size={ms(20)}
                    color="#fff"
                    style={{ marginRight: hs(8) }}
                  />
                  <Text style={styles.saveBtnText}>
                    {editingTemplate ? "Update Template" : "Create Template"}
                  </Text>
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
  // Header Styles
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: hs(20),
    paddingBottom: vs(15),
    backgroundColor: COLORS.bg,
  },
  backBtn: {
    width: hs(40),
    height: hs(40),
    borderRadius: hs(14),
    backgroundColor: COLORS.bgCard,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTextContainer: {
    flex: 1,
    marginLeft: hs(15),
  },
  headerTitle: {
    fontSize: ms(22),
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: ms(13),
    color: COLORS.textMuted,
    fontWeight: "600",
    marginTop: vs(2),
  },
  searchBtn: {
    padding: hs(5),
  },

  // List Styles
  listContainer: {
    paddingHorizontal: hs(20),
    paddingTop: vs(10),
  },

  // Card Styles
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: hs(20),
    padding: hs(18),
    marginBottom: vs(16),
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: vs(12),
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: hs(10),
    flex: 1,
    marginRight: hs(10),
  },
  categoryBadge: {
    paddingHorizontal: hs(10),
    paddingVertical: vs(4),
    borderRadius: hs(8),
  },
  categoryText: {
    fontSize: ms(11),
    fontWeight: "800",
    textTransform: "uppercase",
  },
  cardTitle: {
    fontSize: ms(16),
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: hs(10),
    paddingVertical: vs(5),
    borderRadius: hs(12),
    gap: hs(4),
  },
  statusDot: {
    width: hs(6),
    height: hs(6),
    borderRadius: hs(3),
  },
  statusText: {
    fontSize: ms(11),
    fontWeight: "700",
  },
  keywordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    alignSelf: "flex-start",
    paddingHorizontal: hs(12),
    paddingVertical: vs(6),
    borderRadius: hs(10),
    marginBottom: vs(12),
  },
  keywordPrefix: {
    fontSize: ms(12),
    color: COLORS.textMuted,
    marginLeft: hs(5),
    fontWeight: "600",
  },
  keywordText: {
    fontSize: ms(13),
    color: COLORS.primary,
    fontWeight: "700",
  },
  cardContent: {
    fontSize: ms(14),
    color: COLORS.textDim,
    lineHeight: ms(22),
    marginBottom: vs(15),
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.glassBorder,
    marginBottom: vs(12),
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: {
    fontSize: ms(11),
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  cardActions: {
    flexDirection: "row",
  },
  iconBtn: {
    width: hs(36),
    height: hs(36),
    borderRadius: hs(12),
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
  },

  // FAB Styles
  fab: {
    position: "absolute",
    right: hs(25),
    width: hs(60),
    height: hs(60),
    borderRadius: hs(30),
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  fabGradient: {
    width: "100%",
    height: "100%",
    borderRadius: hs(30),
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty State Styles
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: vs(60),
    paddingHorizontal: hs(20),
  },
  emptyIconBg: {
    width: hs(90),
    height: hs(90),
    borderRadius: hs(45),
    backgroundColor: COLORS.primary + "10",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: vs(20),
  },
  emptyText: {
    fontSize: ms(20),
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: vs(8),
  },
  emptySubText: {
    fontSize: ms(14),
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: vs(30),
    lineHeight: ms(22),
  },
  emptyBtn: {
    borderRadius: hs(16),
    overflow: "hidden",
  },
  emptyBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: hs(24),
    paddingVertical: vs(14),
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: ms(15),
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: hs(30),
    borderTopRightRadius: hs(30),
    paddingHorizontal: hs(24),
    paddingTop: vs(12),
    maxHeight: "90%",
  },
  modalHandle: {
    width: hs(40),
    height: vs(5),
    backgroundColor: COLORS.glassBorder,
    borderRadius: hs(10),
    alignSelf: "center",
    marginBottom: vs(15),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: vs(20),
  },
  modalTitle: {
    fontSize: ms(22),
    fontWeight: "800",
    color: COLORS.text,
  },
  closeBtn: {
    padding: hs(5),
  },
  inputLabel: {
    fontSize: ms(14),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: vs(8),
    marginTop: vs(14),
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: hs(14),
    padding: hs(15),
    fontSize: ms(15),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    fontWeight: "500",
  },
  keywordInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: hs(14),
    paddingHorizontal: hs(15),
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  atSymbol: {
    fontSize: ms(16),
    fontWeight: "700",
    color: COLORS.primary,
    marginRight: hs(5),
  },
  keywordInput: {
    flex: 1,
    paddingVertical: vs(15),
    fontSize: ms(15),
    color: COLORS.text,
    fontWeight: "600",
  },
  textArea: {
    minHeight: vs(120),
    paddingTop: vs(15),
    textAlignVertical: "top",
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: hs(10),
  },
  pickerItem: {
    paddingHorizontal: hs(18),
    paddingVertical: vs(10),
    borderRadius: hs(12),
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.bgCard,
  },
  pickerItemActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pickerText: {
    fontSize: ms(13),
    fontWeight: "700",
    color: COLORS.textDim,
  },
  pickerTextActive: {
    color: "#fff",
  },
  saveBtn: {
    marginTop: vs(30),
    borderRadius: hs(16),
    overflow: "hidden",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: vs(20),
  },
  saveBtnGradient: {
    flexDirection: "row",
    paddingVertical: vs(16),
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: ms(16),
    fontWeight: "800",
  },
});
