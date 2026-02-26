import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import * as messageTemplateService from '../services/messageTemplateService';

const { width } = Dimensions.get('window');

const COLORS = {
    primary: '#6366f1',
    primaryLight: '#818cf8',
    secondary: '#a855f7',
    purple: ['#8b5cf6', '#6366f1'],
    bg: '#f8fafc',
    bgCard: '#ffffff',
    text: '#1e293b',
    textDim: '#475569',
    textMuted: '#94a3b8',
    glassBorder: 'rgba(226, 232, 240, 0.8)',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    shadow: 'rgba(0,0,0,0.05)',
};

const CATEGORIES = ["Sales", "Support", "Marketing", "General"];
const STATUSES = ["Active", "Inactive"];

const TemplateCard = ({ item, onEdit, onDelete }) => (
    <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        style={styles.card}
    >
        <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
                <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) + '15' }]}>
                    <Text style={[styles.categoryText, { color: getCategoryColor(item.category) }]}>
                        {item.category}
                    </Text>
                </View>
                <Text style={styles.cardTitle}>{item.name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: item.status === 'Active' ? COLORS.success + '15' : COLORS.textMuted + '15' }]}>
                <Text style={[styles.statusText, { color: item.status === 'Active' ? COLORS.success : COLORS.textMuted }]}>
                    {item.status}
                </Text>
            </View>
        </View>

        <View style={styles.keywordRow}>
            <Ionicons name="key-outline" size={14} color={COLORS.primary} />
            <Text style={styles.keywordPrefix}>Keyword: </Text>
            <Text style={styles.keywordText}>{item.keyword}</Text>
        </View>

        <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>

        <View style={styles.cardDivider} />

        <View style={styles.cardFooter}>
            <Text style={styles.dateText}>
                Created: {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <View style={styles.cardActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(item)}>
                    <Ionicons name="pencil" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => onDelete(item._id)}>
                    <Ionicons name="trash" size={18} color={COLORS.danger} />
                </TouchableOpacity>
            </View>
        </View>
    </MotiView>
);

const getCategoryColor = (cat) => {
    switch (cat) {
        case 'Sales': return COLORS.success;
        case 'Support': return COLORS.info;
        case 'Marketing': return COLORS.secondary;
        default: return COLORS.warning;
    }
};

export default function MessageTemplateScreen({ navigation }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [form, setForm] = useState({
        name: '',
        keyword: '',
        content: '',
        category: 'General',
        status: 'Active'
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
                await messageTemplateService.updateMessageTemplate(editingTemplate._id, form);
            } else {
                await messageTemplateService.createMessageTemplate(form);
            }
            setModalVisible(false);
            fetchTemplates();
            resetForm();
        } catch (error) {
            Alert.alert("Error", error.response?.data?.message || "Failed to save template");
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
                    }
                }
            ]
        );
    };

    const resetForm = () => {
        setForm({
            name: '',
            keyword: '',
            content: '',
            category: 'General',
            status: 'Active'
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
            status: template.status
        });
        setModalVisible(true);
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

            <SafeAreaView style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                    </TouchableOpacity>
                    <View>
                        <Text style={styles.headerTitle}>Message Templates</Text>
                        <Text style={styles.headerSubtitle}>{templates.length} Active Templates</Text>
                    </View>
                </View>
            </SafeAreaView>

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
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textMuted} />
                            <Text style={styles.emptyText}>No templates found</Text>
                            <TouchableOpacity
                                style={styles.emptyBtn}
                                onPress={() => setModalVisible(true)}
                            >
                                <Text style={styles.emptyBtnText}>Create Your First Template</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            <TouchableOpacity
                style={styles.fab}
                onPress={() => { resetForm(); setModalVisible(true); }}
            >
                <LinearGradient colors={COLORS.purple} style={styles.fabGradient}>
                    <Ionicons name="add" size={30} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>

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
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {editingTemplate ? "Edit Template" : "New Template"}
                            </Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color={COLORS.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.inputLabel}>Template Name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Welcome Message"
                                value={form.name}
                                onChangeText={(val) => setForm({ ...form, name: val })}
                            />

                            <Text style={styles.inputLabel}>Keyword (without @)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. welcome"
                                value={form.keyword}
                                onChangeText={(val) => setForm({ ...form, keyword: val })}
                                autoCapitalize="none"
                            />

                            <Text style={styles.inputLabel}>Category</Text>
                            <View style={styles.pickerRow}>
                                {CATEGORIES.map((cat) => (
                                    <TouchableOpacity
                                        key={cat}
                                        style={[
                                            styles.pickerItem,
                                            form.category === cat && styles.pickerItemActive
                                        ]}
                                        onPress={() => setForm({ ...form, category: cat })}
                                    >
                                        <Text style={[
                                            styles.pickerText,
                                            form.category === cat && styles.pickerTextActive
                                        ]}>{cat}</Text>
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
                                            form.status === status && styles.pickerItemActive
                                        ]}
                                        onPress={() => setForm({ ...form, status: status })}
                                    >
                                        <Text style={[
                                            styles.pickerText,
                                            form.status === status && styles.pickerTextActive
                                        ]}>{status}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Message Content</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Type your message here..."
                                value={form.content}
                                onChangeText={(val) => setForm({ ...form, content: val })}
                                multiline
                                numberOfLines={6}
                                textAlignVertical="top"
                            />

                            <TouchableOpacity
                                style={styles.saveBtn}
                                onPress={handleSave}
                            >
                                <LinearGradient colors={COLORS.purple} style={styles.saveBtnGradient}>
                                    <Text style={styles.saveBtnText}>
                                        {editingTemplate ? "Update Template" : "Create Template"}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
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
    header: {
        backgroundColor: COLORS.bg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.glassBorder,
        paddingBottom: 15,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        gap: 15,
        marginTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.bgCard,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: COLORS.text,
    },
    headerSubtitle: {
        fontSize: 13,
        color: COLORS.textMuted,
        fontWeight: '600',
    },
    listContainer: {
        padding: 20,
        paddingBottom: 100,
    },
    card: {
        backgroundColor: COLORS.bgCard,
        borderRadius: 20,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 3,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    categoryBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    categoryText: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.text,
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '800',
    },
    keywordRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.bg,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        marginBottom: 12,
    },
    keywordPrefix: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginLeft: 5,
        fontWeight: '600',
    },
    keywordText: {
        fontSize: 12,
        color: COLORS.primary,
        fontWeight: '800',
    },
    cardContent: {
        fontSize: 14,
        color: COLORS.textDim,
        lineHeight: 20,
        marginBottom: 15,
    },
    cardDivider: {
        height: 1,
        backgroundColor: COLORS.glassBorder,
        marginBottom: 12,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        fontSize: 11,
        color: COLORS.textMuted,
        fontWeight: '600',
    },
    cardActions: {
        flexDirection: 'row',
        gap: 15,
    },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        width: 60,
        height: 60,
        borderRadius: 30,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    fabGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.textMuted,
        fontWeight: '700',
        marginTop: 15,
        marginBottom: 20,
    },
    emptyBtn: {
        backgroundColor: COLORS.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    emptyBtnText: {
        color: '#fff',
        fontWeight: '700',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: 24,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: COLORS.text,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.text,
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: COLORS.bg,
        borderRadius: 14,
        padding: 15,
        fontSize: 15,
        color: COLORS.text,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    textArea: {
        minHeight: 120,
    },
    pickerRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pickerItem: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
        backgroundColor: COLORS.bgCard,
    },
    pickerItemActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    pickerText: {
        fontSize: 13,
        fontWeight: '700',
        color: COLORS.textDim,
    },
    pickerTextActive: {
        color: '#fff',
    },
    saveBtn: {
        marginTop: 32,
        borderRadius: 16,
        overflow: 'hidden',
    },
    saveBtnGradient: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
});
