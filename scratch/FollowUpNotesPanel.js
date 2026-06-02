function FollowUpNotesPanel({ enquiry, onSaved }) {
    const [note, setNote] = useState("");
    const [recording, setRecording] = useState(null);
    const [recordedURI, setRecordedURI] = useState(null);
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        return sound
            ? () => {
                  sound.unloadAsync();
              }
            : undefined;
    }, [sound]);

    const startRecording = async () => {
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(recording);
        } catch (err) {
            console.error("Failed to start recording", err);
            Alert.alert("Error", "Failed to start recording");
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        setRecording(undefined);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecordedURI(uri);
    };

    const playSound = async () => {
        if (!recordedURI) return;
        const { sound } = await Audio.Sound.createAsync({ uri: recordedURI });
        setSound(sound);
        setIsPlaying(true);
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
            if (status.didJustFinish) {
                setIsPlaying(false);
            }
        });
    };

    const stopSound = async () => {
        if (sound) {
            await sound.stopAsync();
            setIsPlaying(false);
        }
    };

    const clearAudio = () => {
        setRecordedURI(null);
        if (sound) {
            sound.unloadAsync();
            setSound(null);
        }
    };

    const handleSaveNote = async () => {
        if (!note.trim() && !recordedURI) {
            Alert.alert("Error", "Please write a note or record audio.");
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                enqId: enquiry?._id,
                enqNo: enquiry?.enqNo,
                note: note.trim(),
                remarks: note.trim() || "Voice Note",
                type: "Note",
                activityType: "Note",
                assignedTo: enquiry?.assignedTo,
                date: new Date().toISOString().split("T")[0],
                status: "Completed",
                voiceNoteUri: recordedURI,
            };
            await followupService.createFollowUp(payload);
            setNote("");
            clearAudio();
            Alert.alert("Success", "Note saved successfully.");
            if (onSaved) onSaved();
        } catch (error) {
            console.error("Save note error:", error);
            Alert.alert("Error", "Failed to save note.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
        >
            <View style={{ backgroundColor: "#FFFFFF", padding: 16, borderRadius: 12, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#0F172A", marginBottom: 12 }}>Add a Note</Text>
                
                <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Write your note here..."
                    multiline
                    style={{ backgroundColor: "#F8FAFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, padding: 12, minHeight: 120, textAlignVertical: "top", color: "#0F172A" }}
                />

                <View style={{ marginTop: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#334155", marginBottom: 8 }}>Voice Note</Text>
                    
                    {!recordedURI ? (
                        <TouchableOpacity
                            onPress={recording ? stopRecording : startRecording}
                            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: recording ? "#FEE2E2" : "#EFF6FF", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: recording ? "#FCA5A5" : "#BFDBFE" }}
                        >
                            <Ionicons name={recording ? "stop-circle" : "mic"} size={20} color={recording ? "#DC2626" : "#2563EB"} style={{ marginRight: 8 }} />
                            <Text style={{ color: recording ? "#DC2626" : "#2563EB", fontWeight: "600" }}>
                                {recording ? "Stop Recording" : "Start Voice Recording"}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F0FDF4", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#86EFAC" }}>
                            <TouchableOpacity onPress={isPlaying ? stopSound : playSound} style={{ padding: 8, backgroundColor: "#DCFCE7", borderRadius: 20 }}>
                                <Ionicons name={isPlaying ? "pause" : "play"} size={20} color="#059669" />
                            </TouchableOpacity>
                            <Text style={{ flex: 1, marginLeft: 12, color: "#065F46", fontWeight: "500" }}>Audio Recorded</Text>
                            <TouchableOpacity onPress={clearAudio} style={{ padding: 8 }}>
                                <Ionicons name="trash-outline" size={20} color="#DC2626" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <TouchableOpacity
                    onPress={handleSaveNote}
                    disabled={isSaving || (!note.trim() && !recordedURI)}
                    style={{ marginTop: 24, backgroundColor: (!note.trim() && !recordedURI) ? "#94A3B8" : "#2563EB", padding: 14, borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
                >
                    {isSaving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Save Note</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

