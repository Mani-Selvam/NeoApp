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
    Image,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { getImageUrl } from "../services/apiConfig";
import * as leadSourceService from "../services/leadSourceService";

export default function LeadSourceScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const [leadSources, setLeadSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        sources: [""],
    });
    const [editingId, setEditingId] = useState(null);
    const [formLoading, setFormLoading] = useState(false);

    // Refs for input focus management
    const inputRefs = useRef({
        name: null,
        sources: [],
    });

    // Fetch lead sources on mount
    useEffect(() => {
        fetchLeadSources();
    }, []);

    const fetchLeadSources = async () => {
        try {
            setLoading(true);
            const data = await leadSourceService.getAllLeadSources();
            setLeadSources(Array.isArray(data) ? data : []);
        } catch (error) {
            Alert.alert("Error", "Failed to fetch lead sources");
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchLeadSources();
    };

    const resetForm = useCallback(() => {
        setFormData({
            name: "",
            sources: [""],
        });
        setEditingId(null);
        setShowForm(false);
        inputRefs.current.sources = [];
    }, []);

    const handleInputChange = useCallback((field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    const handleSourceChange = useCallback((index, text) => {
        setFormData((prev) => {
            const newSources = [...prev.sources];
            newSources[index] = text;
            return { ...prev, sources: newSources };
        });
    }, []);

    const handleAddField = useCallback(() => {
        setFormData((prev) => ({
            ...prev,
            sources: [...prev.sources, ""],
        }));
    }, []);

    const handleRemoveField = useCallback((index) => {
        setFormData((prev) => {
            if (prev.sources.length > 1) {
                const newSources = prev.sources.filter((_, i) => i !== index);
                return { ...prev, sources: newSources };
            }
            Alert.alert(
                "Warning",
                "You must have at least one lead source field",
            );
            return prev;
        });
    }, []);

    const handleSaveLeadSource = useCallback(async () => {
        // Validation
        if (!formData.name.trim()) {
            Alert.alert("Error", "Lead source name is required");
            return;
        }

        const validSources = formData.sources
            .map((s) => ({ name: s.trim() }))
            .filter((s) => s.name.length > 0);

        if (validSources.length === 0) {
            Alert.alert("Error", "At least one source name is required");
            return;
        }

        try {
            setFormLoading(true);
            const sourceData = {
                name: formData.name,
                sources: validSources,
            };

            if (editingId) {
                await leadSourceService.updateLeadSource(editingId, sourceData);
                Alert.alert("Success", "Lead source updated successfully");
            } else {
                await leadSourceService.createLeadSource(sourceData);
                Alert.alert("Success", "Lead source created successfully");
            }

            resetForm();
            fetchLeadSources();
        } catch (error) {
            Alert.alert(
                "Error",
                error.response?.data?.error || "Failed to save lead source",
            );
            console.error(error);
        } finally {
            setFormLoading(false);
        }
    }, [formData, editingId, resetForm]);

    const handleEditLeadSource = useCallback((item) => {
        setEditingId(item._id);
        setFormData({
            name: item.name,
            sources: (item.sources || []).map((s) => s.name || s || ""),
        });
        setShowForm(true);
    }, []);

    const handleDeleteLeadSource = useCallback((id) => {
        Alert.alert(
            "Delete Lead Source",
            "Are you sure you want to delete this lead source?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    onPress: async () => {
                        try {
                            await leadSourceService.deleteLeadSource(id);
                            Alert.alert(
                                "Success",
                                "Lead source deleted successfully",
                            );
                            fetchLeadSources();
                        } catch (error) {
                            Alert.alert(
                                "Error",
                                "Failed to delete lead source",
                            );
                            console.error(error);
                        }
                    },
                    style: "destructive",
                },
            ],
        );
    }, []);

    // Memoized Lead Source Item
    const LeadSourceItem = useMemo(
        () =>
            ({ item }) => (
                <View style={styles.sourceCard}>
                    <View style={styles.sourceHeader}>
                        <View>
                            <Text style={styles.sourceName}>{item.name}</Text>
                            <Text style={styles.sourceCount}>
                                {item.sources.length} source
                                {item.sources.length !== 1 ? "s" : ""}
                            </Text>
                        </View>
                        <View style={styles.actionButtons}>
                            <TouchableOpacity
                                onPress={() => handleEditLeadSource(item)}
                                style={styles.editBtn}>
                                <Ionicons
                                    name="pencil"
                                    size={18}
                                    color="#2563eb"
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleDeleteLeadSource(item._id)}
                                style={styles.deleteBtn}>
                                <Ionicons
                                    name="trash-outline"
                                    size={18}
                                    color="#ef4444"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={styles.sourcesList}>
                        {item.sources.map((source, idx) => (
                            <View
                                key={`${item._id}-source-${idx}`}
                                style={styles.sourceBadge}>
                                <Text style={styles.sourceBadgeText}>
                                    {source.name || source}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            ),
        [handleEditLeadSource, handleDeleteLeadSource],
    );

    // Memoized Dynamic Form
    const DynamicForm = useMemo(
        () => (
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.formWrapper}>
                <View style={styles.formContainer}>
                    <View style={styles.formHeader}>
                        <Text style={styles.formTitle}>
                            {editingId ? "Edit Lead Source" : "Add Lead Source"}
                        </Text>
                        <TouchableOpacity
                            onPress={resetForm}
                            disabled={formLoading}>
                            <Ionicons name="close" size={24} color="#334155" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.formContent}>
                        {/* Lead Source Name Input */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Lead Source Name</Text>
                            <TextInput
                                ref={(ref) => (inputRefs.current.name = ref)}
                                style={styles.input}
                                placeholder="e.g., Primary, Secondary"
                                placeholderTextColor="#94a3b8"
                                value={formData.name}
                                onChangeText={(value) =>
                                    handleInputChange("name", value)
                                }
                                editable={!formLoading}
                                autoCapitalize="words"
                                returnKeyType="next"
                                onSubmitEditing={() => {
                                    if (inputRefs.current.sources[0]) {
                                        inputRefs.current.sources[0].focus();
                                    }
                                }}
                                blurOnSubmit={false}
                            />
                        </View>

                        {/* Dynamic Source Fields */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>
                                Sources (Add your sources)
                            </Text>
                            {formData.sources.map((source, index) => (
                                <View
                                    key={`source-${index}`}
                                    style={styles.fieldRow}>
                                    <TextInput
                                        ref={(ref) => {
                                            if (
                                                !inputRefs.current.sources[
                                                index
                                                ]
                                            ) {
                                                inputRefs.current.sources[
                                                    index
                                                ] = ref;
                                            }
                                        }}
                                        style={styles.inputDynamic}
                                        placeholder={`Source ${index + 1}`}
                                        placeholderTextColor="#94a3b8"
                                        value={source}
                                        onChangeText={(text) =>
                                            handleSourceChange(index, text)
                                        }
                                        editable={!formLoading}
                                        returnKeyType={
                                            index < formData.sources.length - 1
                                                ? "next"
                                                : "done"
                                        }
                                        onSubmitEditing={() => {
                                            if (
                                                index <
                                                formData.sources.length - 1
                                            ) {
                                                const nextInput =
                                                    inputRefs.current.sources[
                                                    index + 1
                                                    ];
                                                if (nextInput)
                                                    nextInput.focus();
                                            }
                                        }}
                                        blurOnSubmit={false}
                                    />
                                    {formData.sources.length > 1 && (
                                        <TouchableOpacity
                                            onPress={() =>
                                                handleRemoveField(index)
                                            }
                                            style={styles.deleteIconBtn}
                                            disabled={formLoading}>
                                            <Ionicons
                                                name="close-circle"
                                                size={24}
                                                color="#ef4444"
                                            />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </View>

                        {/* Add More Button */}
                        <TouchableOpacity
                            style={styles.addMoreBtn}
                            onPress={handleAddField}
                            disabled={formLoading}>
                            <Ionicons
                                name="add-circle-outline"
                                size={20}
                                color="#2563eb"
                            />
                            <Text style={styles.addMoreText}>Add More</Text>
                        </TouchableOpacity>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={[
                                styles.saveBtn,
                                formLoading && styles.saveBtnDisabled,
                            ]}
                            onPress={handleSaveLeadSource}
                            disabled={formLoading}>
                            {formLoading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons
                                        name="save-outline"
                                        size={20}
                                        color="#fff"
                                    />
                                    <Text style={styles.saveBtnText}>
                                        {editingId ? "Update" : "Save"}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {/* Cancel Button */}
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={resetForm}
                            disabled={formLoading}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        ),
        [
            formData,
            formLoading,
            editingId,
            handleInputChange,
            handleSourceChange,
            handleAddField,
            handleRemoveField,
            handleSaveLeadSource,
            resetForm,
        ],
    );

    return (
        <SafeAreaView style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={28} color="#1e293b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Lead Sources</Text>
                <TouchableOpacity onPress={() => navigation.navigate("ProfileScreen")}>
                    {user?.logo ? (
                        <Image source={{ uri: getImageUrl(user.logo) }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                    ) : (
                        <View style={styles.placeholder} />
                    )}
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading && !showForm ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2563eb" />
                    <Text style={styles.loadingText}>
                        Loading lead sources...
                    </Text>
                </View>
            ) : showForm ? (
                DynamicForm
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={styles.content}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                        />
                    }>
                    {leadSources.length > 0 ? (
                        <FlatList
                            scrollEnabled={false}
                            data={leadSources}
                            keyExtractor={(item) => item._id}
                            renderItem={LeadSourceItem}
                            contentContainerStyle={styles.listContent}
                        />
                    ) : (
                        <View style={styles.emptyContainer}>
                            <Ionicons
                                name="list-outline"
                                size={48}
                                color="#cbd5e1"
                            />
                            <Text style={styles.emptyText}>
                                No lead sources created yet
                            </Text>
                        </View>
                    )}

                    {/* Add New Button */}
                    <TouchableOpacity
                        style={styles.addBtn}
                        onPress={() => setShowForm(true)}>
                        <Ionicons name="add-circle" size={24} color="#fff" />
                        <Text style={styles.addBtnText}>
                            Add New Lead Source
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f8fafc",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: "#fff",
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 3,
    },
    backBtn: {
        padding: 5,
    },
    placeholder: {
        width: 33,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#1e293b",
    },
    content: {
        flex: 1,
        padding: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
        color: "#64748b",
        fontSize: 14,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 60,
    },
    emptyText: {
        marginTop: 10,
        color: "#94a3b8",
        fontSize: 14,
    },
    listContent: {
        paddingBottom: 20,
    },
    sourceCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        elevation: 2,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 3,
    },
    sourceHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
    },
    sourceName: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#1e293b",
    },
    sourceCount: {
        fontSize: 12,
        color: "#64748b",
        marginTop: 4,
    },
    actionButtons: {
        flexDirection: "row",
        alignItems: "center",
    },
    editBtn: {
        padding: 8,
        marginRight: 8,
    },
    deleteBtn: {
        padding: 8,
    },
    sourcesList: {
        flexDirection: "row",
        flexWrap: "wrap",
    },
    sourceBadge: {
        backgroundColor: "#dbeafe",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
    },
    sourceBadgeText: {
        fontSize: 12,
        color: "#2563eb",
        fontWeight: "600",
    },
    addBtn: {
        backgroundColor: "#2563eb",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        borderRadius: 12,
        marginTop: 20,
        marginBottom: 20,
    },
    addBtnText: {
        color: "#fff",
        fontWeight: "bold",
        marginLeft: 8,
        fontSize: 15,
    },

    // Form Styles
    formWrapper: {
        flex: 1,
        backgroundColor: "#fff",
    },
    formContainer: {
        flex: 1,
        backgroundColor: "#fff",
    },
    formHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#f1f5f9",
    },
    formTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#1e293b",
    },
    formContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#334155",
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: "#cbd5e1",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 14,
        color: "#1e293b",
        backgroundColor: "#f8fafc",
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    inputDynamic: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#cbd5e1",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 14,
        color: "#1e293b",
        backgroundColor: "#f8fafc",
    },
    deleteIconBtn: {
        marginLeft: 8,
        padding: 4,
    },
    addMoreBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: "#2563eb",
        borderRadius: 8,
        marginBottom: 20,
    },
    addMoreText: {
        marginLeft: 8,
        color: "#2563eb",
        fontWeight: "600",
        fontSize: 14,
    },
    saveBtn: {
        backgroundColor: "#2563eb",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        borderRadius: 8,
        marginBottom: 10,
    },
    saveBtnDisabled: {
        opacity: 0.6,
    },
    saveBtnText: {
        color: "#fff",
        fontWeight: "bold",
        marginLeft: 8,
        fontSize: 15,
    },
    cancelBtn: {
        paddingVertical: 12,
        borderColor: "#cbd5e1",
        borderWidth: 1,
        borderRadius: 8,
        marginBottom: 20,
    },
    cancelBtnText: {
        textAlign: "center",
        color: "#64748b",
        fontWeight: "600",
        fontSize: 14,
    },
});
