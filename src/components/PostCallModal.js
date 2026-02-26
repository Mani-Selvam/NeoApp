import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

const COLORS = {
    primary: "#6366F1",
    secondary: "#10B981",
    danger: "#EF4444",
    warning: "#F59E0B",
    text: "#1E293B",
    textMuted: "#64748B",
    bg: "#F8FAFC",
    white: "#FFFFFF",
};

const CALL_TYPE_CONFIG = {
    "Incoming": { icon: "call-received", color: "#10B981", label: "Incoming", emoji: "📞" },
    "Outgoing": { icon: "call-made", color: "#6366F1", label: "Outgoing", emoji: "📱" },
    "Missed": { icon: "call-missed", color: "#EF4444", label: "Missed", emoji: "📵" },
    "Not Attended": { icon: "call-missed-outgoing", color: "#F59E0B", label: "Not Attended", emoji: "📴" },
};

/**
 * PostCallModal — Now shows auto-detected data (callType, duration) as read-only info,
 * and only asks the user for a note + optional follow-up.
 *
 * Props:
 *   - visible: boolean
 *   - enquiry: { name, mobile, _id }
 *   - onSave: function(callData)
 *   - onCancel: function
 *   - autoCallData: { callType, duration, note } — auto-detected from CallMonitorService
 *   - initialDuration: number (legacy fallback from AppState timer)
 */
export const PostCallModal = ({ visible, enquiry, onSave, onCancel, autoCallData, initialDuration = 0 }) => {
    const [callType, setCallType] = useState("Outgoing");
    const [duration, setDuration] = useState(0);
    const [note, setNote] = useState("");
    const [createFollowUp, setCreateFollowUp] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isAutoDetected, setIsAutoDetected] = useState(false);

    // When autoCallData arrives (from native CallDetector), use it
    useEffect(() => {
        if (visible && autoCallData) {
            setCallType(autoCallData.callType || "Outgoing");
            setDuration(autoCallData.duration || 0);
            setIsAutoDetected(true);
            // Pre-fill a smart default note based on call type
            const defaultNote = getSmartNote(autoCallData.callType, autoCallData.duration);
            setNote(defaultNote);
        } else if (visible && initialDuration > 0) {
            // Legacy fallback: use AppState timer-based duration
            setDuration(initialDuration);
            setIsAutoDetected(false);
            if (initialDuration > 3) {
                setCallType("Outgoing");
                setNote("Discussed requirements.");
            } else {
                setCallType("Missed");
                setNote("Call rejected or missed.");
            }
        } else if (visible) {
            // No detection — reset to defaults
            setCallType("Outgoing");
            setDuration(0);
            setNote("");
            setIsAutoDetected(false);
        }
    }, [visible, autoCallData, initialDuration]);

    const getSmartNote = (type, dur) => {
        switch (type) {
            case "Incoming":
                return dur > 60 ? `Incoming call, spoke for ${formatDuration(dur)}.` : `Brief incoming call (${dur}s).`;
            case "Outgoing":
                return dur > 60 ? `Outgoing call, spoke for ${formatDuration(dur)}.` : `Quick outgoing call (${dur}s).`;
            case "Missed":
                return "Missed call — customer didn't answer / call rejected.";
            case "Not Attended":
                return "Called but not attended — try again later.";
            default:
                return "";
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds || seconds === 0) return "0s";
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({
                phoneNumber: enquiry?.mobile,
                contactName: enquiry?.name,
                enquiryId: enquiry?._id,
                callType: callType,
                note: note,
                followUpCreated: createFollowUp,
                duration: duration,
                callTime: new Date(),
            });
            // Reset fields after save
            setNote("");
            setDuration(0);
            setCallType("Outgoing");
            setIsAutoDetected(false);
        } finally {
            setSaving(false);
        }
    };

    const typeConfig = CALL_TYPE_CONFIG[callType] || CALL_TYPE_CONFIG["Outgoing"];

    const CALL_TYPE_OPTIONS = [
        { label: "Incoming", value: "Incoming", icon: "call-received", color: "#10B981" },
        { label: "Outgoing", value: "Outgoing", icon: "call-made", color: "#6366F1" },
        { label: "Missed", value: "Missed", icon: "call-missed", color: "#EF4444" },
    ];

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <MotiView
                    from={{ opacity: 0, scale: 0.9, translateY: 20 }}
                    animate={{ opacity: 1, scale: 1, translateY: 0 }}
                    style={styles.container}
                >
                    <View style={styles.header}>
                        <View style={[styles.iconCircle, { backgroundColor: typeConfig.color + "15" }]}>
                            <Ionicons name="call" size={24} color={typeConfig.color} />
                        </View>
                        <Text style={styles.title}>
                            {isAutoDetected ? "Call Detected" : "Log Interaction"}
                        </Text>
                        <Text style={styles.subtitle}>{enquiry?.name || "Customer"} ({enquiry?.mobile})</Text>
                    </View>

                    {/* Auto-Detected Call Info Banner */}
                    {isAutoDetected && (
                        <View style={[styles.autoBanner, { backgroundColor: typeConfig.color + "10", borderColor: typeConfig.color + "30" }]}>
                            <View style={styles.autoBannerRow}>
                                <View style={[styles.autoTypeIcon, { backgroundColor: typeConfig.color + "20" }]}>
                                    <MaterialIcons name={typeConfig.icon} size={20} color={typeConfig.color} />
                                </View>
                                <View style={styles.autoBannerInfo}>
                                    <Text style={[styles.autoBannerType, { color: typeConfig.color }]}>
                                        {typeConfig.label} Call
                                    </Text>
                                    <Text style={styles.autoBannerDuration}>
                                        {duration > 0 ? `Duration: ${formatDuration(duration)}` : "No conversation"}
                                    </Text>
                                </View>
                                <View style={[styles.autoDetectedBadge, { backgroundColor: typeConfig.color }]}>
                                    <Ionicons name="checkmark-circle" size={12} color="#FFF" />
                                    <Text style={styles.autoDetectedText}>Auto</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Manual Call Type Picker — only if NOT auto-detected */}
                    {!isAutoDetected && (
                        <View style={styles.section}>
                            <Text style={styles.label}>Call Type</Text>
                            <View style={styles.typeGrid}>
                                {CALL_TYPE_OPTIONS.map((opt) => (
                                    <TouchableOpacity
                                        key={opt.value}
                                        style={[
                                            styles.typeBtn,
                                            callType === opt.value && { backgroundColor: opt.color + "15", borderColor: opt.color }
                                        ]}
                                        onPress={() => setCallType(opt.value)}
                                    >
                                        <MaterialIcons
                                            name={opt.icon}
                                            size={22}
                                            color={callType === opt.value ? opt.color : COLORS.textMuted}
                                        />
                                        <Text style={[
                                            styles.typeText,
                                            callType === opt.value && { color: opt.color, fontWeight: "700" }
                                        ]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Manual Duration Input — only if NOT auto-detected & not Missed */}
                    {!isAutoDetected && callType !== "Missed" && (
                        <View style={styles.section}>
                            <Text style={styles.label}>Talking Time (Seconds)</Text>
                            <View style={styles.durationContainer}>
                                <Ionicons name="timer-outline" size={20} color={COLORS.textMuted} />
                                <TextInput
                                    style={styles.durationInput}
                                    placeholder="0"
                                    keyboardType="number-pad"
                                    value={duration.toString()}
                                    onChangeText={(val) => setDuration(parseInt(val) || 0)}
                                />
                                <Text style={styles.unitText}>sec</Text>
                            </View>
                        </View>
                    )}

                    {/* Note — always shown, this is the one thing the user fills */}
                    <View style={styles.section}>
                        <Text style={styles.label}>
                            {isAutoDetected ? "Add a Note (Optional)" : "Interaction Note"}
                        </Text>
                        <View style={styles.noteContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Summary of what was discussed..."
                                multiline
                                numberOfLines={3}
                                value={note}
                                onChangeText={setNote}
                                autoFocus={isAutoDetected}
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setCreateFollowUp(!createFollowUp)}
                    >
                        <View style={[styles.checkbox, createFollowUp && styles.checkboxChecked]}>
                            {createFollowUp && <Ionicons name="checkmark" size={16} color={COLORS.white} />}
                        </View>
                        <Text style={styles.checkboxLabel}>Schedule follow-up reminder?</Text>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: typeConfig.color }]}
                            onPress={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <ActivityIndicator color={COLORS.white} />
                            ) : (
                                <Text style={styles.saveBtnText}>
                                    {isAutoDetected ? "Save & Done" : "Save Record"}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </MotiView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    container: {
        backgroundColor: COLORS.white,
        borderRadius: 24,
        width: "100%",
        maxWidth: 400,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        alignItems: "center",
        marginBottom: 20,
    },
    iconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: "800",
        color: COLORS.text,
    },
    subtitle: {
        fontSize: 14,
        color: COLORS.textMuted,
        marginTop: 4,
    },
    // Auto-Detected Banner
    autoBanner: {
        borderRadius: 16,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
    },
    autoBannerRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    autoTypeIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    autoBannerInfo: {
        flex: 1,
        marginLeft: 12,
    },
    autoBannerType: {
        fontSize: 15,
        fontWeight: "800",
    },
    autoBannerDuration: {
        fontSize: 13,
        color: COLORS.textMuted,
        marginTop: 2,
    },
    autoDetectedBadge: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 3,
    },
    autoDetectedText: {
        color: "#FFF",
        fontSize: 11,
        fontWeight: "700",
    },
    section: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: "700",
        color: COLORS.text,
        marginBottom: 10,
    },
    typeGrid: {
        flexDirection: "row",
        gap: 8,
    },
    typeBtn: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: COLORS.bg,
        backgroundColor: COLORS.bg,
        gap: 4,
    },
    typeText: {
        fontSize: 11,
        fontWeight: "600",
        color: COLORS.textMuted,
    },
    durationContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 48,
        gap: 10,
    },
    durationInput: {
        flex: 1,
        fontSize: 16,
        fontWeight: "700",
        color: COLORS.text,
    },
    unitText: {
        fontSize: 12,
        color: COLORS.textMuted,
        fontWeight: "600",
    },
    noteContainer: {
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        minHeight: 80,
    },
    input: {
        padding: 12,
        fontSize: 14,
        color: COLORS.text,
        textAlignVertical: "top",
    },
    checkboxRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 24,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: COLORS.primary,
        marginRight: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    checkboxChecked: {
        backgroundColor: COLORS.primary,
    },
    checkboxLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: COLORS.text,
    },
    footer: {
        flexDirection: "row",
        gap: 12,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        alignItems: "center",
        borderRadius: 14,
        backgroundColor: COLORS.bg,
    },
    cancelBtnText: {
        fontWeight: "700",
        color: COLORS.textMuted,
    },
    saveBtn: {
        flex: 2,
        paddingVertical: 14,
        alignItems: "center",
        borderRadius: 14,
    },
    saveBtnText: {
        fontWeight: "700",
        color: COLORS.white,
    },
});
