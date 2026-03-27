import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
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
import { io } from "socket.io-client";
import { ChatSkeleton } from "../components/skeleton/screens";
import { SkeletonPulse } from "../components/skeleton/Skeleton";
import { API_URL, getImageUrl } from "../services/apiConfig";
import * as templateService from "../services/messageTemplateService";
import * as whatsappService from "../services/whatsappService";

const { width } = Dimensions.get("window");

// â”€â”€â”€ DESIGN TOKENS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Aesthetic: Forest Green Ã— Warm Cream Ã— Rich Espresso
// A premium WhatsApp-inspired chat UI with warmth and depth
const C = {
  // Backgrounds
  bg: "#F2EDE6", // warm linen
  chatBg: "#EDE7DC", // slightly deeper chat area
  surface: "#FFFFFF",
  surface2: "#F9F5F0",

  // Forest green â€” outgoing bubbles
  forest: "#1E6B4A",
  forestDark: "#164D36",
  forestLight: "#2A8A60",
  forestSoft: "rgba(30,107,74,0.10)",
  forestBorder: "rgba(30,107,74,0.22)",

  // Espresso â€” text and UI
  espresso: "#1C0F06",
  brown: "#5C3A20",
  tan: "#9C7355",
  sand: "#C4A882",
  linen: "#E8DDD0",

  // Chat bubble colors
  bubbleOut: "#1E6B4A", // outgoing â€” forest green
  bubbleIn: "#FFFFFF", // incoming â€” white
  bubbleInBg: "#FFFFFF",

  // Status
  online: "#22C55E",
  delivered: "#9CA3AF",
  read: "#34B7F1",

  // Input bar
  inputBg: "#FFFFFF",
  inputBorder: "#E8DDD0",

  border: "#E8DDD0",
  shadow: "#3D1F0A",
};

// â”€â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const sanitizePhoneNumber = (raw) => {
  const clean = String(raw || "").replace(/\D/g, "");
  if (!clean) return "";
  const last10 = clean.slice(-10);
  if (!last10) return clean;
  const duplicateLocal = `${last10}${last10}`;
  const duplicateWithCountry = `91${last10}${last10}`;
  if (clean === duplicateLocal || clean === duplicateWithCountry)
    return `91${last10}`;
  return clean;
};

// â”€â”€â”€ AVATAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Avatar = ({ name, size = 42 }) => (
  <LinearGradient
    colors={[C.forest, C.forestDark]}
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.32,
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    <Text style={{ color: "#fff", fontSize: size * 0.42, fontWeight: "900" }}>
      {name?.charAt(0)?.toUpperCase() ?? "C"}
    </Text>
  </LinearGradient>
);

// â”€â”€â”€ MESSAGE BUBBLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const MessageBubble = ({
  item,
  onPressImage,
  onToggleAudio,
  isAudioPlaying,
  hasImageError,
  onImageError,
}) => {
  const isOwner = item.sender === "Admin";

  const getStatusIcon = () => {
    if (!isOwner) return null;
    if (item.status === "sending")
      return { name: "clock-outline", color: "rgba(255,255,255,0.45)" };
    if (item.status === "sent")
      return { name: "check", color: "rgba(255,255,255,0.65)" };
    if (item.status === "delivered")
      return { name: "check-all", color: "rgba(255,255,255,0.65)" };
    if (item.status === "read") return { name: "check-all", color: "#34B7F1" };
    return { name: "check", color: "rgba(255,255,255,0.65)" };
  };

  const statusIcon = getStatusIcon();
  const time = new Date(item.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8, scale: 0.96 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: "timing", duration: 280 }}
      style={[S.msgRow, isOwner ? S.msgRowOut : S.msgRowIn]}
    >
      {/* Incoming avatar */}
      {!isOwner && (
        <View style={S.incomingAvatar}>
          <View style={S.incomingAvatarInner}>
            <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
          </View>
        </View>
      )}

      <View
        style={[
          S.bubble,
          isOwner ? S.bubbleOut : S.bubbleIn,
          { maxWidth: width * 0.72 },
        ]}
      >
        {/* IMAGE */}
        {item.type === "image" ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onPressImage?.(getImageUrl(item.content))}
          >
            {hasImageError ? (
              <View style={S.msgImageFallback}>
                <Ionicons
                  name="image-outline"
                  size={28}
                  color={isOwner ? "rgba(255,255,255,0.85)" : C.tan}
                />
                <Text
                  style={[
                    S.msgImageFallbackText,
                    isOwner ? { color: "rgba(255,255,255,0.85)" } : null,
                  ]}
                >
                  Image unavailable
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri: getImageUrl(item.content) }}
                style={S.msgImage}
                resizeMode="cover"
                onError={() => onImageError?.(item)}
              />
            )}
            <View style={S.metaOverImage}>
              <Text style={[S.timestamp, { color: "rgba(255,255,255,0.85)" }]}>
                {time}
              </Text>
            </View>
          </TouchableOpacity>
        ) : /* AUDIO */
        item.type === "audio" || item.type === "ptt" ? (
          <View style={S.audioMsg}>
            <TouchableOpacity
              onPress={() => onToggleAudio?.(item)}
              style={[
                S.audioPlayBtn,
                isOwner && {
                  backgroundColor: "rgba(255,255,255,0.2)",
                },
              ]}
            >
              <Ionicons
                name={isAudioPlaying ? "pause" : "play"}
                size={16}
                color={isOwner ? "#fff" : C.forest}
              />
            </TouchableOpacity>
            <View style={S.waveformWrap}>
              {[8, 14, 10, 20, 16, 12, 18, 10, 14, 8, 16, 12].map((h, i) => (
                <View
                  key={i}
                  style={[
                    S.waveLine,
                    {
                      height: h,
                      backgroundColor: isOwner
                        ? i < 6
                          ? "rgba(255,255,255,0.85)"
                          : "rgba(255,255,255,0.35)"
                        : i < 6
                          ? C.forest
                          : C.sand,
                    },
                  ]}
                />
              ))}
            </View>
            <Text
              style={[
                S.audioDuration,
                {
                  color: isOwner ? "rgba(255,255,255,0.7)" : C.tan,
                },
              ]}
            >
              0:12
            </Text>
            <View style={[S.msgMeta, { marginTop: 0, marginLeft: 6 }]}>
              <Text
                style={[
                  S.timestamp,
                  isOwner
                    ? { color: "rgba(255,255,255,0.6)" }
                    : { color: C.tan },
                ]}
              >
                {time}
              </Text>
              {statusIcon && (
                <MaterialCommunityIcons
                  name={statusIcon.name}
                  size={12}
                  color={statusIcon.color}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
          </View>
        ) : /* DOCUMENT */
        item.type === "document" ? (
          <TouchableOpacity style={S.docMsg} activeOpacity={0.8}>
            <View
              style={[
                S.docIcon,
                isOwner && {
                  backgroundColor: "rgba(255,255,255,0.18)",
                },
              ]}
            >
              <Feather
                name="file-text"
                size={18}
                color={isOwner ? "#fff" : C.forest}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={[
                  S.docName,
                  isOwner ? { color: "#fff" } : { color: C.espresso },
                ]}
                numberOfLines={1}
              >
                {item.fileName || "Document"}
              </Text>
              <Text
                style={[
                  S.docType,
                  isOwner
                    ? { color: "rgba(255,255,255,0.6)" }
                    : { color: C.tan },
                ]}
              >
                {item.mimeType?.split("/")[1]?.toUpperCase() || "PDF"}
              </Text>
            </View>
            <View style={S.msgMeta}>
              <Text
                style={[
                  S.timestamp,
                  isOwner
                    ? { color: "rgba(255,255,255,0.6)" }
                    : { color: C.tan },
                ]}
              >
                {time}
              </Text>
              {statusIcon && (
                <MaterialCommunityIcons
                  name={statusIcon.name}
                  size={12}
                  color={statusIcon.color}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
          </TouchableOpacity>
        ) : (
          /* TEXT */
          <View>
            <Text style={[S.msgText, isOwner ? S.msgTextOut : S.msgTextIn]}>
              {item.content}
            </Text>
            <View style={S.msgMeta}>
              <Text
                style={[
                  S.timestamp,
                  isOwner
                    ? { color: "rgba(255,255,255,0.6)" }
                    : { color: C.tan },
                ]}
              >
                {time}
              </Text>
              {statusIcon && (
                <MaterialCommunityIcons
                  name={statusIcon.name}
                  size={12}
                  color={statusIcon.color}
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </MotiView>
  );
};

// â”€â”€â”€ DATE SEPARATOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DateSep = ({ label }) => (
  <View style={S.dateSep}>
    <View style={S.dateSepLine} />
    <View style={S.dateSepChip}>
      <Text style={S.dateSepText}>{label}</Text>
    </View>
    <View style={S.dateSepLine} />
  </View>
);

const FloatingChatInput = ({
  value,
  onChangeText,
  onFocus,
  onBlur,
  style,
  inputStyle,
  maxLength,
  scrollEnabled,
  rightSlot,
}) => {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const hasValue = String(value || "").length > 0;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: focused || hasValue ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [anim, focused, hasValue]);

  return (
    <View style={[FCI.wrap, style]}>
      <Animated.Text
        pointerEvents="none"
        style={[
          FCI.label,
          {
            top: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [Platform.OS === "ios" ? 13 : 11, 4],
            }),
            fontSize: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [15, 10],
            }),
            color: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [C.sand, focused ? C.forest : C.tan],
            }),
          },
        ]}
      >
        Message...
      </Animated.Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[FCI.input, inputStyle, (focused || hasValue) && FCI.inputFloated]}
        multiline
        disableFullscreenUI
        textAlignVertical="top"
        maxLength={maxLength}
        selectionColor={C.forest}
        cursorColor={C.forest}
        scrollEnabled={scrollEnabled}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholder=""
      />

      {rightSlot}
    </View>
  );
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN SCREEN
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ChatScreen({
  route,
  navigation,
  embedded = false,
  readOnly = false,
  manualKeyboardLift = false,
}) {
  const insets = useSafeAreaInsets();
  const isEmbedded = embedded || !!route?.params?.embedded;
  const isReadOnly = readOnly || !!route?.params?.readOnly;

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
  const [composerHeight, setComposerHeight] = useState(76);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [previewImageUri, setPreviewImageUri] = useState("");
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState("");
  const [failedImageIds, setFailedImageIds] = useState({});
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const socket = useRef(null);
  const flatListRef = useRef(null);
  const initialScrollDone = useRef(false);
  const isNearBottomRef = useRef(true);
  const recordingRef = useRef(null);
  const soundRef = useRef(null);
  const composerLiftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!manualKeyboardLift) {
      setKeyboardHeight(0);
      composerLiftAnim.setValue(0);
      return undefined;
    }

    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        const nextHeight = e?.endCoordinates?.height || 0;
        const liftHeight = Math.round(nextHeight * 0.59);
        setKeyboardHeight(nextHeight);
        Animated.timing(composerLiftAnim, {
          toValue: liftHeight,
          duration: Platform.OS === "ios" ? 240 : 180,
          useNativeDriver: true,
        }).start();
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
        Animated.timing(composerLiftAnim, {
          toValue: 0,
          duration: Platform.OS === "ios" ? 220 : 160,
          useNativeDriver: true,
        }).start();
      },
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [composerLiftAnim, manualKeyboardLift]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => null);
        recordingRef.current = null;
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => null);
        soundRef.current = null;
      }
    };
  }, []);

  const scrollToLatest = useCallback((animated = true, force = false) => {
    if (!force && !isNearBottomRef.current) return;
    isNearBottomRef.current = true;
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, animated ? 120 : 40);
  }, []);

  const updateScrollPosition = useCallback((nativeEvent) => {
    const layoutHeight = nativeEvent?.layoutMeasurement?.height || 0;
    const contentHeight = nativeEvent?.contentSize?.height || 0;
    const offsetY = nativeEvent?.contentOffset?.y || 0;
    const distanceFromBottom = contentHeight - (offsetY + layoutHeight);
    isNearBottomRef.current = distanceFromBottom <= 120;
  }, []);

  useEffect(() => {
    if (!loading && isNearBottomRef.current) {
      scrollToLatest(false, true);
    }
  }, [composerHeight, messages.length, loading, scrollToLatest]);

  useEffect(() => {
    if (!loading && !loadingOlder && isNearBottomRef.current) {
      scrollToLatest(false, true);
    }
  }, [inputText, showTemplates, isRecordingAudio, loading, loadingOlder, scrollToLatest]);

  useEffect(() => {
    if (!enquiry?.mobile) return undefined;

    setupSocket();

    return () => {
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [enquiry?.mobile]);

  useFocusEffect(
    useCallback(() => {
      if (enquiry?.mobile) loadHistory();
    }, [enquiry?.mobile]),
  );

  const loadTemplates = async () => {
    try {
      const data = await templateService.getMessageTemplates();
      setTemplates(data || []);
    } catch (e) {
      console.error("Templates fetch fail:", e);
    }
  };

  const setupSocket = () => {
    const base = API_URL.replace("/api", "");
    socket.current?.disconnect();
    socket.current = io(base);
    const addMessage = (newMsg) => {
      const currentDigits = String(enquiry.mobile || "").replace(/\D/g, "");
      const currentShort =
        currentDigits.length > 10 ? currentDigits.slice(-10) : currentDigits;
      const incomingDigits = String(newMsg?.phoneNumber || "").replace(/\D/g, "");
      const incomingShort =
        incomingDigits.length > 10 ? incomingDigits.slice(-10) : incomingDigits;
      if (!incomingShort || incomingShort !== currentShort) return;

      setMessages((prev) => {
        const exists = prev.some((m) => m._id === newMsg._id);
        if (exists)
          return prev.map((m) =>
            m._id === newMsg._id ? { ...m, ...newMsg } : m,
          );
        if (newMsg.sender === "Admin") {
          const hasOpt = prev.some(
            (m) => m.status === "sending" || String(m._id).startsWith("temp_"),
          );
          if (hasOpt)
            return [
              ...prev.filter((m) => !String(m._id).startsWith("temp_")),
              newMsg,
            ];
        }
        return [...prev, newMsg];
      });
      scrollToLatest(true, isNearBottomRef.current);
    };
    const raw = (enquiry.mobile || "").replace(/\D/g, "");
    const s10 = raw.length > 10 ? raw.slice(-10) : raw;
    const channels = new Set([
      `new_message_${(enquiry.mobile || "").replace(/\s/g, "")}`,
      `new_message_${raw}`,
      `new_message_${s10}`,
      `new_message_${raw.length === 10 ? `91${raw}` : raw}`,
      `new_message_91${s10}`,
      `global_new_message`,
    ]);
    channels.forEach((ch) => socket.current.on(ch, addMessage));
  };

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
    } catch (e) {
      console.error("History fail:", e);
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollToLatest(false, true);
        initialScrollDone.current = true;
      }, 300);
    }
  };

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
      const older = result.messages || [];
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
        setCurrentPage(nextPage);
        setHasMore(result.pagination?.hasMore || false);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error("Load older fail:", e);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (mediaFile = null, mediaType = "text") => {
    if (!inputText.trim() && !mediaFile) return;
    const text = inputText;
    if (!mediaFile) setInputText("");
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      sender: "Admin",
      content:
        text ||
        (mediaType === "image"
          ? "Image"
          : mediaType === "audio"
            ? "Voice message"
            : "Document"),
      type: mediaType,
      timestamp: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setSending(true);
    scrollToLatest(true, true);
    try {
      const response = await whatsappService.sendMessage({
        phoneNumber: sanitizePhoneNumber(enquiry.mobile),
        content: text,
        type: mediaType,
        enquiryId: enquiry._id,
        file: mediaFile,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId
            ? {
                ...m,
                status: response?.status || "sent",
                _id: response._id || m._id,
                providerError: response?.providerError || null,
              }
            : m,
        ),
      );
      if (response?.deliveryWarning) {
        Alert.alert("Delivery failed", response.deliveryWarning);
      }
    } catch (e) {
      console.error("Send fail:", e);
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      Alert.alert(
        "Error",
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to send. Please check your connection.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleTextChange = (text) => {
    setInputText(text);
    const words = text.split(/\s/);
    const lastWord = words[words.length - 1];
    if (lastWord.startsWith("@")) {
      const query = lastWord.slice(1).toLowerCase();
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
    words.pop();
    setInputText([...words, template.content].join(" "));
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
        { uri: asset.uri, type: "image/jpeg", name: "image.jpg" },
        "image",
      );
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*" });
    if (!result.canceled) {
      const asset = result.assets[0];
      handleSend(
        { uri: asset.uri, type: asset.mimeType, name: asset.name },
        "document",
      );
    }
  };

  const formatRecordingDuration = (durationMs) => {
    const totalSeconds = Math.max(
      0,
      Math.floor((Number(durationMs) || 0) / 1000),
    );
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const resetRecordingState = async () => {
    recordingRef.current = null;
    setIsRecordingAudio(false);
    setRecordingDurationMs(0);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // ignore reset failures
    }
  };

  const startAudioRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow microphone access.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (status?.isRecording) {
            setRecordingDurationMs(status.durationMillis || 0);
          }
        },
      );

      recordingRef.current = recording;
      setRecordingDurationMs(0);
      setIsRecordingAudio(true);
    } catch (error) {
      await resetRecordingState();
      Alert.alert(
        "Recording failed",
        error?.message || "Unable to start voice recording.",
      );
    }
  };

  const stopAndSendAudioRecording = async () => {
    const activeRecording = recordingRef.current;
    if (!activeRecording) {
      await resetRecordingState();
      return;
    }

    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();
      if (!uri) {
        throw new Error("Recording file not available");
      }

      await handleSend(
        {
          uri,
          type: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
          name: `voice-note-${Date.now()}.m4a`,
        },
        "audio",
      );
    } catch (error) {
      Alert.alert(
        "Recording failed",
        error?.message || "Unable to send voice recording.",
      );
    } finally {
      await resetRecordingState();
    }
  };

  const cancelAudioRecording = async () => {
    const activeRecording = recordingRef.current;
    try {
      if (activeRecording) {
        await activeRecording.stopAndUnloadAsync();
      }
    } catch {
      // ignore cancel cleanup errors
    } finally {
      await resetRecordingState();
    }
  };

  const toggleAudioPlayback = async (item) => {
    const audioUri = getImageUrl(item?.content);
    const messageId = String(item?._id || "");
    if (!audioUri || !messageId) return;

    try {
      if (playingAudioId === messageId && soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlayingAudioId("");
        return;
      }

      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => null);
        soundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        (status) => {
          if (status?.didJustFinish) {
            soundRef.current?.unloadAsync().catch(() => null);
            soundRef.current = null;
            setPlayingAudioId("");
          }
        },
      );

      soundRef.current = sound;
      setPlayingAudioId(messageId);
    } catch (error) {
      setPlayingAudioId("");
      Alert.alert("Audio", error?.message || "Unable to play this voice message.");
    }
  };

  const handleImageError = (item) => {
    const key = String(item?._id || item?.content || "");
    if (!key) return;
    setFailedImageIds((prev) => ({ ...prev, [key]: true }));
  };

  const handleCall = async () => {
    try {
      const raw = (enquiry.mobile || "").replace(/\D/g, "");
      if (!raw) {
        Alert.alert("No phone number", "This contact has no phone number.");
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
      Alert.alert("Error", "Unable to start the call.");
    }
  };

  const handlePrimaryAction = async () => {
    if (hasText) {
      await handleSend();
      return;
    }
    if (isRecordingAudio) {
      await stopAndSendAudioRecording();
      return;
    }
    await startAudioRecording();
  };

  const hasText = inputText.trim().length > 0;
  const composerBottomInset = Math.max(isEmbedded ? 10 : insets.bottom, 10);
  const resolvedKeyboardVerticalOffset =
    Platform.OS === "ios" ? (isEmbedded ? 8 : 10) : 0;
  return (
    <View style={[S.root, { paddingTop: isEmbedded ? 0 : insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {!isEmbedded && <View style={S.header}>
        {/* Back */}
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          style={S.headerBack}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back-outline" size={22} color={C.espresso} />
        </TouchableOpacity>

        {/* Identity */}
        <View style={S.headerIdentity}>
          <View style={S.headerAvatarWrap}>
            <Avatar name={enquiry.name} size={42} />
            <View style={S.onlineDot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={S.headerName} numberOfLines={1}>
              {enquiry.name || "Customer"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Ionicons name="logo-whatsapp" size={11} color="#25D366" />
              <Text style={S.headerStatus}>Online Â· WhatsApp</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={S.headerActions}>
          <TouchableOpacity
            style={S.headerActionBtn}
            onPress={handleCall}
            activeOpacity={0.8}
          >
            <Ionicons name="call-outline" size={18} color={C.forest} />
          </TouchableOpacity>
          <TouchableOpacity style={S.headerActionBtn} activeOpacity={0.8}>
            <Ionicons name="ellipsis-vertical" size={18} color={C.brown} />
          </TouchableOpacity>
        </View>
      </View>}

      <KeyboardAvoidingView
        style={{ flex: 1, minHeight: 0 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={resolvedKeyboardVerticalOffset}
      >
        {/* Wallpaper pattern background */}
        <View style={S.chatBg}>
          {/* Subtle dot pattern overlay */}
          <View style={S.bgPattern} pointerEvents="none" />
        </View>

        {loading ? (
          <SkeletonPulse>
            <ChatSkeleton />
          </SkeletonPulse>
        ) : (
          <FlatList
            ref={flatListRef}
            style={{ flex: 1, minHeight: 0 }}
            data={messages}
            renderItem={({ item }) => (
              <MessageBubble
                item={item}
                onPressImage={(uri) => setPreviewImageUri(uri || "")}
                onToggleAudio={toggleAudioPlayback}
                isAudioPlaying={playingAudioId === String(item?._id || "")}
                hasImageError={Boolean(
                  failedImageIds[String(item?._id || item?.content || "")]
                )}
                onImageError={handleImageError}
              />
            )}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[
              S.listContent,
              {
                flexGrow: 1,
                justifyContent: "flex-end",
                paddingBottom:
                  isReadOnly
                    ? 24
                    : Math.max(
                        composerHeight +
                          16 +
                          (manualKeyboardLift ? Math.round(keyboardHeight * 0.16) : 0),
                        92,
                      ),
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onEndReachedThreshold={0.1}
            maxToRenderPerBatch={15}
            windowSize={10}
            initialNumToRender={20}
            ListHeaderComponent={
              loadingOlder ? (
                <View style={S.loadingOlder}>
                  <ActivityIndicator color={C.forest} size="small" />
                  <Text style={S.loadingOlderText}>Loading older...</Text>
                </View>
              ) : hasMore ? (
                <TouchableOpacity
                  style={S.loadMoreBtn}
                  onPress={loadOlderMessages}
                  activeOpacity={0.8}
                >
                  <Feather name="chevrons-up" size={16} color={C.forest} />
                  <Text style={S.loadMoreText}>Load older messages</Text>
                </TouchableOpacity>
              ) : (
                <DateSep label="Today" />
              )
            }
            onScroll={({ nativeEvent }) => {
              updateScrollPosition(nativeEvent);
              if (
                nativeEvent.contentOffset.y < 50 &&
                hasMore &&
                !loadingOlder &&
                initialScrollDone.current
              )
                loadOlderMessages();
            }}
            scrollEventThrottle={400}
            onContentSizeChange={() => {
              if (!loadingOlder && isNearBottomRef.current) scrollToLatest(false, true);
            }}
            onLayout={() => {
              if (!loadingOlder && isNearBottomRef.current) scrollToLatest(false, true);
            }}
          />
        )}

        {/* â”€â”€ INPUT AREA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {isComposerFocused && !isReadOnly ? (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              setIsComposerFocused(false);
              Keyboard.dismiss();
            }}
            style={S.composerFocusOverlay}
          >
            <BlurView
              intensity={18}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={S.composerFocusTint} />
          </TouchableOpacity>
        ) : null}

        {!isReadOnly && (
        <Animated.View
          style={[
            S.inputArea,
            isComposerFocused && S.inputAreaFocused,
            {
              paddingBottom: composerBottomInset,
              transform: manualKeyboardLift
                ? [
                    {
                      translateY: Animated.multiply(composerLiftAnim, -1),
                    },
                  ]
                : undefined,
            },
          ]}
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height);
            if (nextHeight && Math.abs(nextHeight - composerHeight) > 2) {
              setComposerHeight(nextHeight);
            }
          }}
        >
          {/* Template picker */}
          <AnimatePresence>
            {showTemplates && (
              <MotiView
                from={{
                  opacity: 0,
                  translateY: 12,
                  scale: 0.96,
                }}
                animate={{
                  opacity: 1,
                  translateY: 0,
                  scale: 1,
                }}
                exit={{
                  opacity: 0,
                  translateY: 12,
                  scale: 0.96,
                }}
                style={S.templatePicker}
              >
                <View style={S.templatePickerHeader}>
                  <Ionicons name="flash-outline" size={13} color={C.forest} />
                  <Text style={S.templatePickerTitle}>Quick Templates</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={S.templateList}
                >
                  {filteredTemplates.map((item) => (
                    <TouchableOpacity
                      key={item._id}
                      style={S.templateChip}
                      onPress={() => selectTemplate(item)}
                      activeOpacity={0.8}
                    >
                      <View style={S.templateChipIcon}>
                        <Text style={S.templateChipInitial}>
                          {item.name[0]}
                        </Text>
                      </View>
                      <View>
                        <Text style={S.templateChipKeyword}>
                          @{item.keyword}
                        </Text>
                        <Text style={S.templateChipName} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </MotiView>
            )}
          </AnimatePresence>

          {isRecordingAudio && (
            <View style={S.recordingBanner}>
              <View style={S.recordingDot} />
              <Text style={S.recordingText}>
                Recording voice note {formatRecordingDuration(recordingDurationMs)}
              </Text>
              <TouchableOpacity
                style={S.recordingDeleteBtn}
                onPress={cancelAudioRecording}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={16} color="#B91C1C" />
              </TouchableOpacity>
            </View>
          )}

          {/* Input row */}
          <View style={S.inputRow}>
            {/* Attach button */}
            <TouchableOpacity
              style={S.attachBtn}
              onPress={pickDocument}
              activeOpacity={0.8}
            >
              <Feather name="paperclip" size={20} color={C.brown} />
            </TouchableOpacity>

            {/* Text input box */}
            <>
              <FloatingChatInput
                value={inputText}
                onChangeText={handleTextChange}
                onFocus={() => {
                  setIsComposerFocused(true);
                  scrollToLatest(false, true);
                }}
                onBlur={() => setIsComposerFocused(false)}
                maxLength={2000}
                scrollEnabled
                rightSlot={
                  <TouchableOpacity
                    style={S.inputIconBtn}
                    onPress={pickImage}
                    activeOpacity={0.8}
                  >
                    <Feather name="image" size={18} color={C.tan} />
                  </TouchableOpacity>
                }
              />
              {false && <View style={S.inputBox}>
              <TextInput
                style={S.inputField}
                placeholder="Message..."
                placeholderTextColor={C.sand}
                multiline
                maxLength={2000}
                value={inputText}
                onChangeText={handleTextChange}
              />
              {/* Image picker */}
              <TouchableOpacity
                style={S.inputIconBtn}
                onPress={pickImage}
                activeOpacity={0.8}
              >
                <Feather name="image" size={18} color={C.tan} />
              </TouchableOpacity>
            </View>}
            </>

            {/* Send / Mic button */}
            <TouchableOpacity
              style={[
                S.sendBtn,
                (hasText || isRecordingAudio) && S.sendBtnActive,
                isRecordingAudio && S.sendBtnRecording,
              ]}
              onPress={handlePrimaryAction}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons
                  name={
                    hasText ? "send" : isRecordingAudio ? "stop" : "mic-outline"
                  }
                  size={hasText ? 18 : 20}
                  color="#fff"
                  style={hasText && { marginLeft: 2 }}
                />
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={Boolean(previewImageUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri("")}
      >
        <View style={S.previewOverlay}>
          <TouchableOpacity
            style={S.previewBackdrop}
            activeOpacity={1}
            onPress={() => setPreviewImageUri("")}
          />
          <TouchableOpacity
            style={S.previewClose}
            onPress={() => setPreviewImageUri("")}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {previewImageUri ? (
            <Image
              source={{ uri: previewImageUri }}
              style={S.previewImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// â”€â”€â”€ STYLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const S = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: C.bg },

  // â”€â”€ Header â”€â”€
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.linen,
    gap: 10,
    shadowColor: C.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatarWrap: { position: "relative" },
  onlineDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: C.online,
    borderWidth: 2,
    borderColor: C.bg,
  },
  headerName: {
    fontSize: 15,
    fontWeight: "800",
    color: C.espresso,
    letterSpacing: -0.2,
  },
  headerStatus: { fontSize: 11, fontWeight: "600", color: C.tan },
  headerActions: { flexDirection: "row", gap: 8 },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },

  // â”€â”€ Chat background â”€â”€
  chatBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.chatBg,
  },
  bgPattern: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
  },

  // â”€â”€ Loading â”€â”€
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingBox: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  loadingText: {
    color: C.tan,
    fontWeight: "700",
    marginTop: 12,
    fontSize: 13,
  },

  // â”€â”€ Message list â”€â”€
  listContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 100 },

  // â”€â”€ Message row â”€â”€
  msgRow: { marginVertical: 3, flexDirection: "row", alignItems: "flex-end" },
  msgRowOut: { justifyContent: "flex-end" },
  msgRowIn: { justifyContent: "flex-start", gap: 6 },

  // â”€â”€ Incoming avatar â”€â”€
  incomingAvatar: { marginBottom: 2 },
  incomingAvatarInner: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },

  // â”€â”€ Bubbles â”€â”€
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: C.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bubbleOut: {
    backgroundColor: C.bubbleOut,
    borderBottomRightRadius: 4,
    shadowColor: C.forestDark,
    shadowOpacity: 0.18,
  },
  bubbleIn: {
    backgroundColor: C.bubbleIn,
    borderBottomLeftRadius: 4,
  },

  // â”€â”€ Message text â”€â”€
  msgText: { fontSize: 15, lineHeight: 22 },
  msgTextOut: { color: "#FFFFFF" },
  msgTextIn: { color: C.espresso },

  // â”€â”€ Meta (time + status) â”€â”€
  msgMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
    gap: 2,
  },
  timestamp: { fontSize: 10, fontWeight: "600" },

  // â”€â”€ Image â”€â”€
  msgImage: { width: 220, height: 200, borderRadius: 14 },
  msgImageFallback: {
    width: 220,
    height: 200,
    borderRadius: 14,
    backgroundColor: "#F3EEE7",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  msgImageFallbackText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.brown,
  },
  metaOverImage: {
    position: "absolute",
    bottom: 8,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.38)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },

  // â”€â”€ Audio â”€â”€
  audioMsg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 190,
    paddingVertical: 4,
  },
  audioPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  waveformWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  waveLine: { width: 3, borderRadius: 1.5 },
  audioDuration: { fontSize: 11, fontWeight: "600" },

  // â”€â”€ Document â”€â”€
  docMsg: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 180,
    paddingVertical: 2,
  },
  docIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: C.forestSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  docName: { fontSize: 14, fontWeight: "700" },
  docType: { fontSize: 11, fontWeight: "600", marginTop: 2 },

  // â”€â”€ Date separator â”€â”€
  dateSep: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 10,
  },
  dateSepLine: { flex: 1, height: 1, backgroundColor: C.linen },
  dateSepChip: {
    backgroundColor: "rgba(196,168,130,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.linen,
  },
  dateSepText: { fontSize: 11, color: C.tan, fontWeight: "700" },

  // â”€â”€ Load older â”€â”€
  loadingOlder: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    gap: 8,
  },
  loadingOlderText: { fontSize: 13, color: C.tan, fontWeight: "600" },
  loadMoreBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 18,
    gap: 6,
    backgroundColor: C.forestSoft,
    borderRadius: 20,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: C.forestBorder,
    marginBottom: 12,
  },
  loadMoreText: { fontSize: 13, color: C.forest, fontWeight: "700" },

  // â”€â”€ Input area â”€â”€
  inputArea: {
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.linen,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  inputAreaFocused: {
    zIndex: 4,
    marginHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    borderRadius: 24,
    backgroundColor: "rgba(242,237,230,0.98)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  composerFocusOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  composerFocusTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(28,15,6,0.16)",
  },

  // â”€â”€ Template picker â”€â”€
  templatePicker: {
    backgroundColor: C.surface,
    borderRadius: 18,
    marginBottom: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  templatePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  templatePickerTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: C.tan,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  templateList: { paddingHorizontal: 12, gap: 10 },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.surface2,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    minWidth: 140,
  },
  templateChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.forestSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  templateChipInitial: { fontSize: 13, fontWeight: "900", color: C.forest },
  templateChipKeyword: { fontSize: 13, fontWeight: "800", color: C.espresso },
  templateChipName: {
    fontSize: 11,
    color: C.tan,
    fontWeight: "600",
    maxWidth: 90,
  },

  // â”€â”€ Input row â”€â”€
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 1,
  },
  inputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: C.inputBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.inputBorder,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 46,
    shadowColor: C.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputField: {
    flex: 1,
    fontSize: 15,
    color: C.espresso,
    paddingTop: Platform.OS === "ios" ? 6 : 2,
    paddingBottom: Platform.OS === "ios" ? 6 : 2,
    maxHeight: 120,
    lineHeight: 22,
  },
  inputIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: C.tan,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 1,
    shadowColor: C.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sendBtnActive: {
    backgroundColor: C.forest,
    shadowColor: C.forestDark,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  sendBtnRecording: {
    backgroundColor: "#C2410C",
    shadowColor: "#7C2D12",
  },
  recordingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  recordingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9A3412",
    flex: 1,
  },
  recordingDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewClose: {
    position: "absolute",
    top: 52,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  previewImage: {
    width: "92%",
    height: "78%",
  },
});

const FCI = StyleSheet.create({
  wrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E8DDD0",
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 46,
    shadowColor: "#3D1F0A",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    position: "absolute",
    left: 16,
    fontWeight: "500",
    zIndex: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#1C0F06",
    paddingTop: Platform.OS === "ios" ? 6 : 2,
    paddingBottom: Platform.OS === "ios" ? 6 : 2,
    maxHeight: 120,
    lineHeight: 22,
    zIndex: 2,
  },
  inputFloated: {
    paddingTop: Platform.OS === "ios" ? 18 : 16,
  },
});
