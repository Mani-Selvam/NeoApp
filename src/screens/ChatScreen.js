import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { AnimatePresence, MotiView } from "moti";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { io } from "socket.io-client";
import { API_URL, getImageUrl } from "../services/apiConfig";
import * as templateService from "../services/messageTemplateService";
import * as whatsappService from "../services/whatsappService";

const { width } = Dimensions.get("window");

const COLORS = {
  primary: "#6366F1",
  primaryLight: "#818CF8",
  accent: "#F59E0B",
  bg: "#F8FAFC",
  textMain: "#1E293B",
  textMuted: "#64748B",
  white: "#FFFFFF",
  cardOwner: "#6366F1",
  cardCustomer: "#FFFFFF",
  glass: "rgba(255, 255, 255, 0.9)",
};

export default function ChatScreen({ route, navigation }) {
  // Defensive: `route.params` may be undefined if navigated to incorrectly.
  // Support two shapes: { enquiry: {...} } or passing enquiry directly as params.
  const routeParams = route?.params;
  const enquiry =
    routeParams && typeof routeParams === "object"
      ? routeParams.enquiry && typeof routeParams.enquiry === "object"
        ? routeParams.enquiry
        : routeParams
      : {};
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const socket = useRef(null);
  const flatListRef = useRef(null);
  const initialScrollDone = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputAnimatedValue] = useState(new Animated.Value(0));

  // --- TEMPLATE STATES ---
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [mentionSearch, setMentionSearch] = useState("");

  useEffect(() => {
    // Only setup socket or load history if we have a phone number to subscribe to.
    loadTemplates();
    if (enquiry && enquiry.mobile) {
      setupSocket();
    }

    // Keyboard listeners
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        Animated.timing(inputAnimatedValue, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      },
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
        Animated.timing(inputAnimatedValue, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start();
      },
    );

    return () => {
      socket.current?.disconnect();
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Refresh history whenever screen is focused (back-return fix)
  useFocusEffect(
    useCallback(() => {
      if (enquiry && enquiry.mobile) loadHistory();
    }, [enquiry?.mobile]),
  );

  const loadTemplates = async () => {
    try {
      const data = await templateService.getMessageTemplates();
      setTemplates(data || []);
    } catch (error) {
      console.error("Templates fetch fail:", error);
    }
  };

  const setupSocket = () => {
    const socketBaseUrl = API_URL.replace("/api", "");
    socket.current = io(socketBaseUrl);

    // Helper to add message without duplicates
    const addMessage = (newMsg) => {
      setMessages((prev) => {
        // If message with same ID exists, replace it (update status/content)
        const exists = prev.some((m) => m._id === newMsg._id);
        if (exists) {
          return prev.map((m) =>
            m._id === newMsg._id ? { ...m, ...newMsg } : m,
          );
        }

        // If it's an Admin message, try to replace any 'sending' optimistic message
        if (newMsg.sender === "Admin") {
          const hasOptimistic = prev.some(
            (m) => m.status === "sending" || String(m._id).startsWith("temp_"),
          );
          if (hasOptimistic) {
            // Remove temp ones and add the real one
            return [
              ...prev.filter((m) => !String(m._id).startsWith("temp_")),
              newMsg,
            ];
          }
        }

        return [...prev, newMsg];
      });
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        200,
      );
    };

    // Listen on multiple phone number formats for maximum reliability
    const rawMobile = (enquiry.mobile || "").replace(/\D/g, "");
    const short10 = rawMobile.length > 10 ? rawMobile.slice(-10) : rawMobile;
    const withCC = rawMobile.length === 10 ? `91${rawMobile}` : rawMobile;
    const normalizedWithCC = `91${short10}`;

    // Build unique set of channel names (no trailing spaces) and include global channel
    const channels = new Set([
      `new_message_${(enquiry.mobile || "").replace(/\s/g, "")}`,
      `new_message_${rawMobile}`,
      `new_message_${short10}`,
      `new_message_${withCC}`,
      `new_message_${normalizedWithCC}`,
      `global_new_message`,
    ]);

    channels.forEach((channel) => {
      socket.current.on(channel, addMessage);
    });

    console.log("🔌 Chat socket listening on:", [...channels]);
  };

  // Load latest messages (page 1)
  const loadHistory = async () => {
    try {
      const result = await whatsappService.getChatHistory(
        enquiry.mobile,
        1,
        30,
      );
      setMessages(result.messages || []);
      setHasMore(result.pagination?.hasMore || false);
      setCurrentPage(1);
    } catch (error) {
      console.error("History fail:", error);
    } finally {
      setLoading(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        initialScrollDone.current = true;
      }, 300);
    }
  };

  // Load older messages when user scrolls to top
  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const nextPage = currentPage + 1;
      const result = await whatsappService.getChatHistory(
        enquiry.mobile,
        nextPage,
        30,
      );
      const olderMessages = result.messages || [];
      if (olderMessages.length > 0) {
        // Prepend older messages (they come in chronological order)
        setMessages((prev) => [...olderMessages, ...prev]);
        setCurrentPage(nextPage);
        setHasMore(result.pagination?.hasMore || false);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Load older fail:", error);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (mediaFile = null, mediaType = "text") => {
    if (!inputText.trim() && !mediaFile) return;

    const text = inputText;
    if (!mediaFile) setInputText("");

    // 🚀 OPTIMISTIC UI UPDATE
    // Create a temporary message object to show instantly
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      sender: "Admin",
      content: text || (mediaType === "image" ? "Image" : "Document"),
      type: mediaType,
      timestamp: new Date().toISOString(),
      status: "sending", // Visual indicator
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);

    // Auto scroll to bottom for the new optimistic message
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const response = await whatsappService.sendMessage({
        phoneNumber: enquiry.mobile,
        content: text,
        type: mediaType,
        enquiryId: enquiry._id,
        file: mediaFile,
      });

      // If the socket is fast, it will replace this.
      // If not, we could update the temp message status here.
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId
            ? { ...m, status: "sent", _id: response._id || m._id }
            : m,
        ),
      );
    } catch (error) {
      console.error("Send fail:", error);
      // Remove optimistic message on failure or show error icon
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      Alert.alert(
        "Error",
        "Failed to send message. Please check your connection.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleTextChange = (text) => {
    setInputText(text);

    // Detect mention trigger '@'
    const words = text.split(/\s/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith("@")) {
      const query = lastWord.slice(1).toLowerCase();
      setMentionSearch(query);

      const filtered = templates.filter(
        (t) =>
          t.status === "Active" &&
          (t.keyword.toLowerCase().includes(query) ||
            t.name.toLowerCase().includes(query)),
      );

      setFilteredTemplates(filtered);
      setShowTemplates(filtered.length > 0);
    } else {
      setShowTemplates(false);
    }
  };

  const selectTemplate = (template) => {
    const words = inputText.split(/\s/);
    words.pop(); // Remove the @keyword
    const newText = [...words, template.content].join(" ");
    setInputText(newText);
    setShowTemplates(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      handleSend(
        {
          uri: asset.uri,
          type: "image/jpeg",
          name: "image.jpg",
        },
        "image",
      );
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      handleSend(
        {
          uri: asset.uri,
          type: asset.mimeType,
          name: asset.name,
        },
        "document",
      );
    }
  };

  const handleCall = async () => {
    try {
      const raw = (enquiry.mobile || "").replace(/\D/g, "");
      if (!raw) {
        Alert.alert(
          "No phone number",
          "This contact has no phone number available.",
        );
        return;
      }
      const telUrl = `tel:${raw}`;
      const can = await Linking.canOpenURL(telUrl);
      if (!can) {
        Alert.alert("Unsupported", "Calling is not supported on this device.");
        return;
      }
      await Linking.openURL(telUrl);
    } catch (err) {
      console.error("Call open error:", err);
      Alert.alert("Error", "Unable to start the call. Please try manually.");
    }
  };

  const renderMessage = ({ item }) => {
    const isOwner = item.sender === "Admin";

    return (
      <MotiView
        from={{ opacity: 0, scale: 0.9, translateY: 10 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400 }}
        style={[
          styles.msgContainer,
          isOwner ? styles.msgOwner : styles.msgCustomer,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isOwner ? styles.bubbleOwner : styles.bubbleCustomer,
            !isOwner && styles.customerShadow,
          ]}
        >
          {item.type === "image" ? (
            <TouchableOpacity activeOpacity={0.9}>
              <Image
                source={{ uri: getImageUrl(item.content) }}
                style={styles.msgImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : item.type === "audio" || item.type === "ptt" ? (
            <View style={styles.audioMsg}>
              <Ionicons
                name="play-circle"
                size={32}
                color={isOwner ? COLORS.white : COLORS.primary}
              />
              <View style={styles.audioWaveform}>
                <View
                  style={[
                    styles.waveLine,
                    {
                      height: 10,
                      backgroundColor: isOwner
                        ? "rgba(255,255,255,0.4)"
                        : "#DDD",
                    },
                  ]}
                />
                <View
                  style={[
                    styles.waveLine,
                    {
                      height: 20,
                      backgroundColor: isOwner
                        ? "rgba(255,255,255,0.4)"
                        : "#DDD",
                    },
                  ]}
                />
                <View
                  style={[
                    styles.waveLine,
                    {
                      height: 15,
                      backgroundColor: isOwner
                        ? "rgba(255,255,255,0.4)"
                        : "#DDD",
                    },
                  ]}
                />
                <View
                  style={[
                    styles.waveLine,
                    {
                      height: 25,
                      backgroundColor: isOwner
                        ? "rgba(255,255,255,0.4)"
                        : "#DDD",
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.audioDuration,
                  isOwner ? styles.textWhiteMuted : styles.textMuted,
                ]}
              >
                0:12
              </Text>
            </View>
          ) : item.type === "document" ? (
            <TouchableOpacity style={styles.docMsg}>
              <View style={styles.docIconCircle}>
                <Feather
                  name="file-text"
                  size={20}
                  color={isOwner ? COLORS.primary : COLORS.white}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text
                  style={[
                    styles.msgText,
                    isOwner ? styles.textWhite : styles.textDark,
                  ]}
                  numberOfLines={1}
                >
                  {item.fileName || "Document"}
                </Text>
                <Text
                  style={[
                    styles.docSize,
                    isOwner ? styles.textWhiteMuted : styles.textMuted,
                  ]}
                >
                  {item.mimeType?.split("/")[1]?.toUpperCase() || "PDF"}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text
              style={[
                styles.msgText,
                isOwner ? styles.textWhite : styles.textDark,
              ]}
            >
              {item.content}
            </Text>
          )}

          <View style={styles.msgMeta}>
            <Text
              style={[
                styles.timestamp,
                isOwner ? styles.textWhiteMuted : styles.textMuted,
              ]}
            >
              {new Date(item.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {isOwner &&
              (() => {
                // Show: clock for sending, single check for sent,
                // double check for delivered, blue double-check for read
                let iconName = "check";
                let iconColor = "rgba(255,255,255,0.6)";
                if (item.status === "sending") {
                  iconName = "clock-outline";
                  iconColor = "rgba(255,255,255,0.4)";
                } else if (item.status === "sent") {
                  iconName = "check";
                  iconColor = "rgba(255,255,255,0.6)";
                } else if (item.status === "delivered") {
                  iconName = "check-all";
                  iconColor = "rgba(255,255,255,0.6)";
                } else if (item.status === "read") {
                  iconName = "check-all";
                  iconColor = "#34B7F1"; // WhatsApp read-blue
                }

                return (
                  <MaterialCommunityIcons
                    name={iconName}
                    size={14}
                    color={iconColor}
                    style={{ marginLeft: 4 }}
                  />
                );
              })()}
          </View>
        </View>
      </MotiView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Advanced Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={28} color={COLORS.textMain} />
        </TouchableOpacity>

        <View style={styles.headerMain}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {enquiry.name?.charAt(0).toUpperCase() || "C"}
            </Text>
            <View style={styles.activeDot} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {enquiry.name || "Customer"}
            </Text>
            <Text style={styles.headerStatus}>Active Now</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionIcon} onPress={handleCall}>
            <Feather name="phone" size={20} color={COLORS.textMain} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionIcon}>
            <Feather name="more-vertical" size={20} color={COLORS.textMain} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 100 : 100 },
          ]}
          onEndReachedThreshold={0.1}
          maxToRenderPerBatch={15}
          windowSize={10}
          initialNumToRender={20}
          ListHeaderComponent={
            loadingOlder ? (
              <View style={styles.loadingOlder}>
                <ActivityIndicator color={COLORS.primary} size="small" />
                <Text style={styles.loadingOlderText}>
                  Loading older messages...
                </Text>
              </View>
            ) : hasMore ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadOlderMessages}
              >
                <Feather name="chevrons-up" size={18} color={COLORS.primary} />
                <Text style={styles.loadMoreText}>Load older messages</Text>
              </TouchableOpacity>
            ) : null
          }
          onScroll={({ nativeEvent }) => {
            // Trigger load-older when scrolled near the top
            if (
              nativeEvent.contentOffset.y < 50 &&
              hasMore &&
              !loadingOlder &&
              initialScrollDone.current
            ) {
              loadOlderMessages();
            }
          }}
          scrollEventThrottle={400}
        />
      )}

      {/* Premium Floating Input */}
      <View style={styles.inputContainer}>
        {/* Floating Template Suggestions */}
        <AnimatePresence>
          {showTemplates && (
            <MotiView
              from={{ opacity: 0, translateY: 10, scale: 0.95 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: 10, scale: 0.95 }}
              style={styles.templatePicker}
            >
              <View style={styles.templateHeader}>
                <Ionicons name="flash" size={14} color={COLORS.primary} />
                <Text style={styles.templateHeaderText}>Quick Templates</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.templateList}
              >
                {filteredTemplates.map((item) => (
                  <TouchableOpacity
                    key={item._id}
                    style={styles.templateItem}
                    onPress={() => selectTemplate(item)}
                  >
                    <View style={styles.templateIcon}>
                      <Text style={styles.templateInitial}>{item.name[0]}</Text>
                    </View>
                    <View>
                      <Text style={styles.templateItemName}>
                        @{item.keyword}
                      </Text>
                      <Text style={styles.templateItemLabel} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </MotiView>
          )}
        </AnimatePresence>

        <Animated.View
          style={[
            styles.floatingInputContainer,
            {
              transform: [
                {
                  translateY: inputAnimatedValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -10],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity style={styles.plusBtn} onPress={pickDocument}>
            <Feather name="paperclip" size={22} color={COLORS.white} />
          </TouchableOpacity>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={inputText}
              onChangeText={handleTextChange}
            />
            <TouchableOpacity style={styles.iconInInput} onPress={pickImage}>
              <Feather name="image" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.micBtn]}
            onPress={() => handleSend()}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons
                name={inputText.trim() ? "send" : "mic"}
                size={20}
                color={COLORS.white}
              />
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  innerContainer: { flex: 1 },
  header: {
    marginTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    height: 70,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
  },
  backBtn: { marginRight: 12 },
  headerMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  avatarText: { fontWeight: "bold", fontSize: 18, color: COLORS.primary },
  activeDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: "700", color: COLORS.textMain },
  headerStatus: { fontSize: 12, color: "#10B981", fontWeight: "600" },
  headerActions: { flexDirection: "row" },
  actionIcon: { marginLeft: 15 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  msgContainer: { marginVertical: 6, maxWidth: "85%" },
  msgOwner: { alignSelf: "flex-end" },
  msgCustomer: { alignSelf: "flex-start" },

  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleOwner: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleCustomer: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
  },
  customerShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    elevation: 2,
  },

  msgText: { fontSize: 16, lineHeight: 24 },
  textWhite: { color: COLORS.white },
  textDark: { color: COLORS.textMain },
  textWhiteMuted: { color: "rgba(255,255,255,0.7)" },

  msgImage: { width: 240, height: 240, borderRadius: 12, marginBottom: 5 },
  docMsg: { flexDirection: "row", alignItems: "center", minWidth: 180 },
  docIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  docSize: { fontSize: 11, marginTop: 2 },

  audioMsg: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 200,
    paddingVertical: 5,
  },
  audioWaveform: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    flex: 1,
  },
  waveLine: { width: 3, borderRadius: 1.5, marginHorizontal: 1 },
  audioDuration: { fontSize: 12 },

  msgMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
  },
  timestamp: { fontSize: 10 },

  inputContainer: { backgroundColor: "transparent" },
  floatingInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    paddingBottom: Platform.OS === "ios" ? 30 : 45,
    backgroundColor: "transparent",
  },
  plusBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.textMain,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 4,
    minHeight: 50,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textMain,
    paddingTop: Platform.OS === "ios" ? 12 : 0,
  },
  iconInInput: { marginLeft: 10 },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },
  micBtn: { backgroundColor: COLORS.primaryLight },
  loadingOlder: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 10,
  },
  loadingOlderText: {
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  loadMoreBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: COLORS.primary + "10",
    borderRadius: 12,
    alignSelf: "center",
    paddingHorizontal: 20,
  },
  loadMoreText: {
    marginLeft: 6,
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // TEMPLATE PICKER STYLES
  templatePicker: {
    backgroundColor: COLORS.white,
    marginHorizontal: 12,
    borderRadius: 16,
    marginBottom: 8,
    paddingVertical: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    marginBottom: 10,
    gap: 6,
  },
  templateHeaderText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  templateList: {
    paddingHorizontal: 12,
    gap: 12,
  },
  templateItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    minWidth: 140,
    gap: 10,
  },
  templateIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  templateInitial: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
  },
  templateItemName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMain,
  },
  templateItemLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "600",
    width: 80,
  },
});
