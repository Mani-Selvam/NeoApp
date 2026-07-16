import React, { useEffect, useRef, useState } from "react";
import {
  Modal, StyleSheet, Text, TouchableOpacity, View,
  Animated, Easing, ActivityIndicator, TextInput,
  ScrollView, Platform, Alert, KeyboardAvoidingView, Dimensions, Linking, Keyboard,
} from "react-native";
import { PieChart } from "react-native-chart-kit";
import * as Print from "expo-print";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import getApiClient from "../services/apiClient";
import { speakResponse } from "../services/voiceAssistantService";
import { API_URL, WEB_DASHBOARD_URL } from "../services/apiConfig";
import { getAuthToken } from "../services/secureTokenStorage";
import { emitEnquiryCreated } from "../services/appEvents";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Design Tokens ─────────────────────────────────────────────────────────────
// Fresh palette: warm off-white bg, violet-indigo primary, coral accent, amber AI bubble
const T = {
  // Backgrounds
  bg: "#FAFAF8",
  bgCard: "#FFFFFF",
  bgSidebar: "#F5F3EE",
  bgUser: "#4F46E5",       // indigo for user bubbles
  bgAI: "#F0EDE8",         // warm sand for AI bubbles
  bgInput: "#F5F3EE",
  bgInputFocus: "#FFFFFF",
  bgBadge: "#EEF2FF",
  bgListenBtn: "#4F46E5",
  bgListenBtnStop: "#EF4444",

  // Text
  textPrimary: "#1C1917",
  textSecond: "#78716C",
  textMuted: "#A8A29E",
  textUser: "#FFFFFF",
  textAI: "#1C1917",
  textBadge: "#4338CA",
  textHeader: "#1C1917",

  // Borders
  border: "rgba(28,25,23,0.08)",
  borderMid: "rgba(28,25,23,0.12)",
  borderHigh: "rgba(79,70,229,0.30)",

  // Brand
  primary: "#4F46E5",      // indigo
  primarySoft: "#EEF2FF",
  primaryMid: "#818CF8",
  coral: "#F97316",
  coralSoft: "#FFF7ED",
  amber: "#F59E0B",
  amberSoft: "#FFFBEB",
  green: "#10B981",
  greenSoft: "#ECFDF5",
  red: "#EF4444",
  redSoft: "#FEF2F2",

  // Mic ring colors per state
  ringIdle: "#E7E5E0",
  ringListen: "#4F46E5",
  ringProcess: "#F59E0B",
  ringSpeak: "#10B981",
};

// ─── State Configs ──────────────────────────────────────────────────────────────
const STATE_CFG = {
  idle: { label: "Ready", dot: T.textMuted, ring: T.ringIdle, icon: "mic-outline", btnBg: T.primary, btnIcon: "mic" },
  listening: { label: "Listening", dot: T.primary, ring: T.ringListen, icon: "stop-circle-outline", btnBg: T.red, btnIcon: "stop-circle" },
  processing: { label: "Processing", dot: T.amber, ring: T.ringProcess, icon: "sync-outline", btnBg: T.amber, btnIcon: "sync" },
  speaking: { label: "Speaking", dot: T.green, ring: T.ringSpeak, icon: "volume-high-outline", btnBg: T.green, btnIcon: "volume-high" },
};

const getCfg = (s) => STATE_CFG[s] || STATE_CFG.idle;

// ─── Presets ────────────────────────────────────────────────────────────────────
const PRESETS = [
  { label: "Missed clients", query: "who are my missed client names", icon: "people-outline" },
  { label: "Today's schedule", query: "what is my schedule today", icon: "calendar-outline" },
  { label: "Pending tasks", query: "tell me my active pending tasks", icon: "checkbox-outline" },
  { label: "Staff count", query: "how many staff working", icon: "business-outline" },
  { label: "இன்று தவறவிட்டவை?", query: "இன்று எத்தனை தவறவிட்டவை", icon: "alert-circle-outline" },
  { label: "வணக்கம் நியோ!", query: "வணக்கம் நியோ", icon: "hand-left-outline" },
];

// ─── Audio Config ───────────────────────────────────────────────────────────────
/* eslint-disable import/namespace */
const AUDIO_CONFIG = {
  android: {
    extension: ".m4a",
    outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
    audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
    sampleRate: 16000, numberOfChannels: 1, bitRate: 24000, isMeteringEnabled: true,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
    audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MIN,
    sampleRate: 16000, numberOfChannels: 1, bitRate: 24000,
    linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false,
    isMeteringEnabled: true,
  },
  isMeteringEnabled: true,
};
/* eslint-enable import/namespace */

// ─── PulseRing ──────────────────────────────────────────────────────────────────
// Expanding ring shown around the mic button when active
function PulseRing({ active, color, size }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (!active) { scale.setValue(1); opacity.setValue(0.55); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.5, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 0, useNativeDriver: true }),
      ]),
    ]));
    anim.start();
    return () => anim.stop();
  }, [active]);
  return (
    <Animated.View style={{
      position: "absolute", width: size, height: size,
      borderRadius: size / 2, borderWidth: 2, borderColor: color,
      transform: [{ scale }], opacity,
    }} />
  );
}

// ─── RotatingRing ───────────────────────────────────────────────────────────────
// Dashed rotating ring for "listening" state
function RotatingRing({ active, color, size }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { rot.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [active]);
  if (!active) return null;
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{
      position: "absolute", width: size, height: size, borderRadius: size / 2,
      borderWidth: 2.5, borderStyle: "dashed",
      borderTopColor: color, borderRightColor: color,
      borderBottomColor: "transparent", borderLeftColor: "transparent",
      transform: [{ rotate: spin }],
    }} />
  );
}

// ─── OrbitDots ──────────────────────────────────────────────────────────────────
// Three dots orbiting the mic — shown only when processing
function OrbitDots({ active, color, radius }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { rot.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [active]);
  if (!active) return null;
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  // Three dots at 0°, 120°, 240°
  return (
    <>
      {[0, 120, 240].map((deg, i) => {
        const localRot = rot.interpolate({ inputRange: [0, 1], outputRange: [`${deg}deg`, `${deg + 360}deg`] });
        return (
          <Animated.View key={i} style={{
            position: "absolute", width: radius * 2, height: radius * 2,
            transform: [{ rotate: localRot }],
          }}>
            <View style={{
              position: "absolute", top: 0, left: "50%", marginLeft: -3, marginTop: -3,
              width: 6, height: 6, borderRadius: 3, backgroundColor: color,
              opacity: 1 - i * 0.2,
            }} />
          </Animated.View>
        );
      })}
    </>
  );
}

// ─── WaveBar ────────────────────────────────────────────────────────────────────
function WaveBar({ delay, color, active }) {
  const h = useRef(new Animated.Value(3)).current;
  useEffect(() => {
    if (!active) { h.setValue(3); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(h, { toValue: 18, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(h, { toValue: 3, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [active]);
  return <Animated.View style={{ width: 3.5, height: h, borderRadius: 2, backgroundColor: color, marginHorizontal: 2 }} />;
}

// ─── LiveDot ────────────────────────────────────────────────────────────────────
function LiveDot({ color }) {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 0.2, duration: 650, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity: op }} />;
}

// ─── MicButton ──────────────────────────────────────────────────────────────────
// Central large mic button with animated rings
function MicButton({ state, onPress }) {
  const cfg = getCfg(state);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };

  const SIZE = 88;
  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isSpeaking = state === "speaking";

  return (
    <View style={{ width: SIZE + 60, height: SIZE + 60, alignItems: "center", justifyContent: "center" }}>
      {/* Outermost pulse — listening + speaking */}
      <PulseRing active={isListening || isSpeaking} color={cfg.ring} size={SIZE + 48} />
      {/* Rotating dashed ring — listening */}
      <RotatingRing active={isListening} color={cfg.ring} size={SIZE + 28} />
      {/* Orbit dots — processing */}
      <OrbitDots active={isProcessing} color={cfg.ring} radius={(SIZE + 36) / 2} />
      {/* Static outer ring */}
      <View style={{
        position: "absolute", width: SIZE + 18, height: SIZE + 18,
        borderRadius: (SIZE + 18) / 2, borderWidth: 1.5,
        borderColor: isListening || isSpeaking || isProcessing ? cfg.ring : T.border,
        opacity: 0.5,
      }} />
      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          onPress={handlePress}
          activeOpacity={0.9}
          style={{
            width: SIZE, height: SIZE, borderRadius: SIZE / 2,
            backgroundColor: cfg.btnBg,
            alignItems: "center", justifyContent: "center",
            shadowColor: cfg.btnBg,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 8,
          }}>
          {isProcessing ? (
            <ActivityIndicator size="large" color="#FFF" />
          ) : (
            <Ionicons name={cfg.btnIcon} size={34} color="#FFF" />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────────
function StatusBadge({ state }) {
  const cfg = getCfg(state);
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 5,
      borderRadius: 999, backgroundColor: T.primarySoft,
      borderWidth: 1, borderColor: T.borderHigh,
      alignSelf: "center",
    }}>
      <LiveDot color={cfg.dot} />
      <Text style={{ fontSize: 12, fontWeight: "700", color: cfg.dot, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {cfg.label}
      </Text>
    </View>
  );
}

// ─── QuickCommandGrid ────────────────────────────────────────────────────────────
function QuickCommandGrid({ onSelect }) {
  const CARD_W = (SCREEN_W - 40 - 10) / 2;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
      {PRESETS.map((p, i) => (
        <TouchableOpacity
          key={i} onPress={() => onSelect(p.query)} activeOpacity={0.7}
          style={{
            width: CARD_W, backgroundColor: T.bgCard,
            borderWidth: 1, borderColor: T.border, borderRadius: 14,
            paddingVertical: 12, paddingHorizontal: 12,
            flexDirection: "row", alignItems: "center", gap: 9,
          }}>
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: T.primarySoft,
            borderWidth: 1, borderColor: T.borderHigh,
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Ionicons name={p.icon} size={15} color={T.primary} />
          </View>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 12, fontWeight: "600", color: T.textPrimary, lineHeight: 16 }}>
            {p.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function FormattedText({ text, isUser }) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|\n)/g);
  return (
    <Text style={{ fontSize: 15.5, color: isUser ? T.textUser : T.textAI, lineHeight: 23, fontWeight: "400" }}>
      {parts.map((part, i) => {
        if (part === "\n") return <Text key={i}>{"\n"}</Text>;
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={i} style={{ fontWeight: "bold" }}>{part.slice(2, -2)}</Text>;
        }
        if (part.trim().startsWith("* ") || part.trim().startsWith("- ")) {
          return <Text key={i}>{"\n• " + part.replace(/^[\*\-]\s+/, "")}</Text>;
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// ─── ChatBubble ──────────────────────────────────────────────────────────────────
function ChatBubble({ msg, screenW, onSendForm }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleCopy = async () => {
    await Clipboard.setStringAsync(msg.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isForm = !isUser && msg.intent === "GATHER_ENQUIRY_FIELD" && msg.context?.draft;

  return (
    <View style={{ marginBottom: 16, alignItems: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: 4, paddingBottom: 6 }}>
          <View style={{
            width: 26, height: 26, borderRadius: 8, backgroundColor: T.primarySoft,
            borderWidth: 1, borderColor: T.borderHigh,
            alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name="sparkles" size={13} color={T.primary} />
          </View>
          <TouchableOpacity onPress={handleCopy} style={{ padding: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color={copied ? T.green : T.textMuted} />
            {copied && <Text style={{ fontSize: 11, color: T.green }}>Copied</Text>}
          </TouchableOpacity>
        </View>
      )}
      <View style={{
        maxWidth: screenW * 0.78,
        backgroundColor: isUser ? T.bgUser : T.bgAI,
        borderRadius: 18,
        borderBottomRightRadius: isUser ? 4 : 18,
        borderBottomLeftRadius: isUser ? 18 : 4,
        paddingHorizontal: 16, paddingVertical: 11,
      }}>
        <FormattedText text={msg.text} isUser={isUser} />

        {/* Missing Enquiry Data Form Widget */}
        {isForm && (
          <View style={{ marginTop: 12, backgroundColor: "#FFF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: T.borderHigh }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: T.textMuted, marginBottom: 8, textTransform: "uppercase" }}>Enquiry Draft</Text>
            {Object.entries(msg.context.draft).map(([k, v]) => {
              if (["priority", "source", "assignedTo"].includes(k)) return null;
              const missing = !v || v === "0" || v === "0000000000";
              return (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Ionicons name={missing ? "close-circle" : "checkmark-circle"} size={16} color={missing ? T.red : T.green} />
                  <Text style={{ fontSize: 13, color: T.textPrimary, flex: 1 }}>
                    <Text style={{ fontWeight: "600", textTransform: "capitalize" }}>{k}: </Text>
                    {missing ? <Text style={{ color: T.textMuted, fontStyle: "italic" }}>Missing</Text> : v}
                  </Text>
                </View>
              );
            })}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
              <TextInput 
                style={{ flex: 1, height: 36, backgroundColor: T.bgInput, borderRadius: 8, paddingHorizontal: 10, fontSize: 14, color: T.textPrimary, borderWidth: 1, borderColor: T.border }}
                placeholder="Type missing detail..."
                placeholderTextColor={T.textMuted}
                value={inputValue}
                onChangeText={setInputValue}
                onSubmitEditing={() => {
                  if (inputValue.trim()) { onSendForm(inputValue); setInputValue(""); }
                }}
                returnKeyType="send"
              />
              <TouchableOpacity 
                onPress={() => { if (inputValue.trim()) { onSendForm(inputValue); setInputValue(""); } }}
                style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: T.primary, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="arrow-up" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Widget: PIE_CHART */}
        {msg.widget?.type === "PIE_CHART" && (
          <View style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", backgroundColor: T.bgCard }}>
            <PieChart
              data={msg.widget.data}
              width={SCREEN_W * 0.72}
              height={170}
              chartConfig={{ color: (opacity = 1) => `rgba(0,0,0,${opacity})` }}
              accessor="count" backgroundColor="transparent" paddingLeft="0" absolute
            />
          </View>
        )}

        {/* Widget: ENQUIRY_LIST */}
        {msg.widget?.type === "ENQUIRY_LIST" && (
          <View style={{ marginTop: 12, gap: 8 }}>
            {msg.widget.data.map(enq => (
              <View key={enq._id} style={{
                backgroundColor: T.bgCard, padding: 12, borderRadius: 10,
                borderWidth: 1, borderColor: T.border,
              }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: T.textPrimary }}>{enq.name}</Text>
                <Text style={{ fontSize: 12, color: T.textSecond, marginTop: 2 }}>{enq.mobile}</Text>
                <View style={{
                  backgroundColor: T.primarySoft, alignSelf: "flex-start",
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: T.primary }}>{enq.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Widget: DOWNLOAD_LINK */}
        {msg.widget?.type === "DOWNLOAD_LINK" && (
          <TouchableOpacity
            onPress={async () => {
              if (msg.widget.format === "pdf" && msg.widget.html) {
                try {
                  if (Platform.OS === "web") {
                    const pw = window.open("", "_blank");
                    if (pw) { pw.document.write(msg.widget.html); pw.document.close(); pw.focus(); setTimeout(() => pw.print(), 250); }
                    else Alert.alert("Popup Blocked", "Please allow popups.");
                  } else await Print.printAsync({ html: msg.widget.html });
                } catch { Alert.alert("Error", "Could not generate PDF."); }
              } else if (msg.widget.url) Linking.openURL(msg.widget.url);
            }}
            activeOpacity={0.8}
            style={{
              marginTop: 12, backgroundColor: msg.widget.format === "pdf" ? T.red : T.green,
              flexDirection: "row", alignItems: "center", gap: 8,
              paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, justifyContent: "center",
            }}>
            <Ionicons name={msg.widget.format === "pdf" ? "document-text-outline" : "download-outline"} size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600" }}>{msg.widget.label || "Download"}</Text>
          </TouchableOpacity>
        )}

        {/* Upgrade Button for Limit Exceeded */}
        {msg.intent === "ERROR_LIMIT_EXCEEDED" && (
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'ios') {
                Alert.alert(
                  "Upgrade on Web Dashboard",
                  "In-app purchases are only available via our web dashboard. Would you like to open it now?",
                  [
                    { text: "Not Now", style: "cancel" },
                    {
                      text: "Go to Dashboard",
                      onPress: () =>
                        Linking.openURL(WEB_DASHBOARD_URL).catch(() =>
                          Alert.alert("Error", "Could not open the website.")
                        ),
                    },
                  ]
                );
              } else {
                Linking.openURL(WEB_DASHBOARD_URL);
              }
            }}
            activeOpacity={0.8}
            style={{
              marginTop: 12, backgroundColor: "#0b0f1a",
              flexDirection: "row", alignItems: "center", gap: 8,
              paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, justifyContent: "center",
            }}>
            <Ionicons name={Platform.OS === 'ios' ? "globe-outline" : "open-outline"} size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "600" }}>{Platform.OS === 'ios' ? "Upgrade on Web Dashboard" : "Upgrade Plan"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function VoiceAssistantOverlay({ visible, onClose, compact = false }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiContext, setAiContext] = useState(null);
  const aiContextRef = useRef(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatHistoryRef = useRef([]);
  const [sessions, setSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const activeChatIdRef = useRef(null);
  const isProcessingTextRef = useRef(false);

  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const handsFreeModeRef = useRef(false);
  const digestShown = useRef(false);

  // "continuous" mode: after AI speaks, auto-restart listen
  // silence without speech → go idle (no close)
  const autoListenRef = useRef(false);
  const stateRef = useRef("idle");

  useEffect(() => { handsFreeModeRef.current = handsFreeMode; }, [handsFreeMode]);

  useEffect(() => { aiContextRef.current = aiContext; }, [aiContext]);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  const [manualText, setManualText] = useState("");
  const [recording, setRecording] = useState(null);
  const [wakeMode, setWakeMode] = useState(false);
  const wakeModeRef = useRef(false);

  const silenceTimer = useRef(0);
  const hasSpoken = useRef(false);
  const isMounted = useRef(true);
  const recognRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const sidebarAnim = useRef(new Animated.Value(-320)).current;

  useEffect(() => {
    Animated.timing(sidebarAnim, {
      toValue: isSidebarOpen ? 0 : -320,
      duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [isSidebarOpen]);

  const _setState = (s) => { stateRef.current = s; setState(s); };

  useEffect(() => {
    isMounted.current = true;
    const loadSessions = async () => {
      try {
        const client = await getApiClient();
        const { data } = await client.get("/assistant/voice-sessions");
        if (data?.success && data.sessions) setSessions(data.sessions);
      } catch { }
    };
    const loadHistory = async (chatId = null) => {
      try {
        const client = await getApiClient();
        const url = chatId ? `/assistant/voice-history?chatId=${chatId}` : "/assistant/voice-history";
        const { data } = await client.get(url);
        if (data?.success && data.history) setChatHistory(data.history);
      } catch { }
    };
    if (visible) {
      loadSessions();
      if (activeChatId) {
        loadHistory(activeChatId);
      } else if (!digestShown.current) {
        digestShown.current = true;
        processTextQuery("Provide a daily digest of my scheduled and missed follow-ups for today.", true);
      }
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
      // Do not auto start listening on open
      autoListenRef.current = false;
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(28);
      autoListenRef.current = false;
      stopAssistant();
      setWakeMode(false);
      wakeModeRef.current = false;
      // Reset chat state on close
      setChatHistory([]);
      setTranscript("");
      setAiResponse("");
      setAiContext(null);
      setActiveChatId(null);
      setIsSidebarOpen(false);
    }
    return () => {
      isMounted.current = false;
      try { Speech.stop(); } catch { }
    };
  }, [visible]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [chatHistory]);

  const handleNewChat = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { }
    setChatHistory([]); setTranscript(""); setAiResponse(""); setAiContext(null);
    setActiveChatId(null); setIsSidebarOpen(false);
  };

  const loadChat = (chatId) => {
    setActiveChatId(chatId);
    setChatHistory([]); setTranscript(""); setAiResponse(""); setAiContext(null);
    setIsSidebarOpen(false);
    if (visible) {
      getApiClient().then(client => {
        client.get(`/assistant/voice-history?chatId=${chatId}`).then(({ data }) => {
          if (data?.success && data.history) setChatHistory(data.history);
        }).catch(() => { });
      });
    }
  };

  const handleDeleteChat = async (chatId) => {
    try {
      const client = await getApiClient();
      await client.delete(`/assistant/voice-history?chatId=${chatId}`);
      setSessions(sessions.filter(s => s._id !== chatId));
      if (activeChatId === chatId) handleNewChat();
    } catch { }
  };

  const [editingChatId, setEditingChatId] = useState(null);
  const [editChatTitle, setEditChatTitle] = useState("");

  const handleRenameChat = async (chatId) => {
    if (!editChatTitle.trim()) { setEditingChatId(null); return; }
    try {
      const client = await getApiClient();
      await client.put(`/assistant/voice-history`, { chatId, title: editChatTitle.trim() });
      setSessions(sessions.map(s => s._id === chatId ? { ...s, title: editChatTitle.trim() } : s));
      setEditingChatId(null);
    } catch { }
  };

  // ── Wake Word Detection ────────────────────────────────────────────────────────
  const getWakeCommand = (text) => {
    const normalized = String(text || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    const hasWake = /\b(hi|hey|hello)\s+neo\b/.test(normalized) || /\bneo\b/.test(normalized);
    const wantsStop = hasWake && /\b(stop|close|off|kill|sleep)\b/.test(normalized);
    const cleaned = normalized
      .replace(/\b(hi|hey|hello)\s+neo\b/g, "").replace(/\bneo\b/g, "")
      .replace(/\b(please|pls)\b/g, "").replace(/\s+/g, " ").trim();
    return { hasWake, wantsStop, cleaned };
  };

  const enableWakeMode = () => { wakeModeRef.current = true; setWakeMode(true); };
  const disableWakeMode = () => { wakeModeRef.current = false; setWakeMode(false); };

  const stopWakeMode = () => {
    disableWakeMode();
    _setState("speaking");
    setTranscript('"Hi Neo stop"');
    setAiResponse("Neo background listening stopped.");
    speakResponse("Neo background listening stopped.", "en", () => {
      if (isMounted.current) { stopAssistant(); if (compact) onClose?.(); }
    });
  };

  // ── Recording ──────────────────────────────────────────────────────────────────
  const startAssistant = async () => {
    if (!isMounted.current) return;
    try { Haptics.selectionAsync(); } catch { }
    if (recording) { try { await recording.stopAndUnloadAsync(); } catch { } setRecording(null); }
    setTranscript("Listening…");
    silenceTimer.current = 0;
    hasSpoken.current = false;

    if (Platform.OS === "web") {
      _setState("listening");
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
        rec.onresult = (e) => { const r = e.results[0][0].transcript; setTranscript(`"${r}"`); processTextQuery(r); };
        rec.onerror = () => { };
        rec.onend = () => { if (stateRef.current === "listening") _setState("idle"); };
        rec.start(); recognRef.current = rec;
      }
    } else {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Microphone", "Enable microphone permissions to use voice.");
          _setState("idle"); setTranscript("Permission denied. Tap a preset or type."); return;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(AUDIO_CONFIG);
        const startTime = Date.now();
        await rec.setProgressUpdateInterval(150);
        rec.setOnRecordingStatusUpdate((s) => {
          if (!s.canRecord || !s.isRecording) return;
          if (Date.now() - startTime >= 40000) { stopAndSubmit(rec); return; }
          if (s.metering > -28) hasSpoken.current = true;
          if (Date.now() - startTime < 1200) { silenceTimer.current = 0; return; }
          if (s.metering < -28) {
            silenceTimer.current += 150;
            // Auto-submit after 1.2s silence IF user has spoken
            if (hasSpoken.current && silenceTimer.current >= 1200) stopAndSubmit(rec);
          } else {
            silenceTimer.current = 0;
          }
        });
        await rec.startAsync();
        setRecording(rec);
        _setState("listening");
      } catch {
        _setState("idle"); setTranscript("Microphone unavailable.");
      }
    }
  };

  const stopAssistant = async () => {
    _setState("idle"); setTranscript(""); setAiResponse("");
    try { Speech.stop(); } catch { }
    if (Platform.OS === "web" && recognRef.current) { try { recognRef.current.stop(); } catch { } recognRef.current = null; }
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch { }
      setRecording(null);
    }
    // Reset iOS audio session so other audio (music, calls) works after recording
    if (Platform.OS === "ios") {
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
      } catch { }
    }
  };

  const stopAndSubmit = async (rec) => {
    if (!rec) return;
    if (!hasSpoken.current) {
      // Silence detected, no speech — stay idle, do NOT close, do NOT restart unless hands-free
      _setState("idle");
      setTranscript("No speech detected. Tap mic to try again.");
      try { await rec.stopAndUnloadAsync(); } catch { }
      setRecording(null);
      // Reset iOS audio session
      if (Platform.OS === "ios") {
        try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }); } catch { }
      }
      if (handsFreeModeRef.current && visible && autoListenRef.current) {
        startAssistant();
      }
      return;
    }
    _setState("processing"); setTranscript("Processing…");
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecording(null);
      // Reset iOS audio session before sending audio to server
      if (Platform.OS === "ios") {
        try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }); } catch { }
      }
      processAudio(uri);
    } catch { _setState("idle"); setTranscript("Recording failed."); }
  };

  const handleMicPress = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { }
    if (state === "listening") {
      // Manual stop — submit what we have, or stop if nothing spoken
      if (Platform.OS === "web" && recognRef.current) recognRef.current.stop();
      else if (recording) await stopAndSubmit(recording);
    } else if (state === "speaking" || state === "processing") {
      // Interrupt AI — stop and go idle
      autoListenRef.current = false;
      await stopAssistant();
    } else {
      // idle — start
      autoListenRef.current = true;
      startAssistant();
    }
  };

  const afterAISpoke = (data) => {
    // After AI responds: if handsFree is on, restart listening immediately
    if (isMounted.current && visible && autoListenRef.current && handsFreeModeRef.current) {
      startAssistant();
    } else {
      _setState("idle");
    }
  };

  const processAudio = async (uri) => {
    if (!uri) { _setState("idle"); setTranscript("No audio captured."); return; }
    try {
      _setState("processing"); setTranscript("Processing voice…");
      const token = await getAuthToken();
      const fd = new FormData();
      const filename = uri.split("/").pop();
      const match = /\.(\w+)$/.exec(filename);
      fd.append("audio", { uri, name: filename || "voice.m4a", type: match ? `audio/${match[1]}` : "audio/m4a" });
      fd.append("tzOffsetMinutes", String(new Date().getTimezoneOffset()));
      if (aiContextRef.current) fd.append("context", JSON.stringify(aiContextRef.current));
      if (chatHistoryRef.current.length > 0) fd.append("history", JSON.stringify(chatHistoryRef.current));
      if (activeChatIdRef.current) fd.append("chatId", activeChatIdRef.current);

      const res = await fetch(`${API_URL}/assistant/voice-command`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || `Server error ${res.status}`); }
      const data = await res.json();

      if (data?.success) {
        const wake = getWakeCommand(data.statsUsed?.recognizedText || "");
        if (wake.wantsStop) { stopWakeMode(); return; }
        if (wake.hasWake) enableWakeMode();

        _setState("speaking");
        setTranscript(`"${data.statsUsed?.recognizedText || "Voice Query"}"`);
        setAiResponse(data.spokenText);
        if (data.context) setAiContext(data.context);
        else if (data.intent === "SUBMIT_ENQUIRY" || data.intent === "CANCEL_ENQUIRY") setAiContext(null);

        const aiMsg = { role: "assistant", text: data.spokenText, intent: data.intent };
        if (data.widget) aiMsg.widget = data.widget;
        const newHistory = [...chatHistoryRef.current, { role: "user", text: data.statsUsed?.recognizedText || "Voice Query" }, aiMsg];
        setChatHistory(newHistory.slice(-50));

        if (data.chatId && data.chatId !== activeChatIdRef.current) {
          setActiveChatId(data.chatId);
          if (!activeChatIdRef.current) {
            getApiClient().then(c => c.get("/assistant/voice-sessions").then(res => {
              if (res.data?.success) setSessions(res.data.sessions);
            }));
          }
        }

        speakResponse(data.spokenText, data.language, async () => {
          if (data.intent === "SUBMIT_ENQUIRY" && (data.context?.draft || data.context?.drafts)) {
            try {
              const client = await getApiClient();
              const draftsToSubmit = data.context.drafts && Array.isArray(data.context.drafts) && data.context.drafts.length > 0
                ? data.context.drafts
                : [data.context.draft];

              const cf = (v, def = "") => (!v || String(v).trim().toLowerCase() === "skip") ? def : v;

              await Promise.all(draftsToSubmit.map(d =>
                client.post("/enquiries", {
                  name: cf(d.name, "Unknown"), mobile: cf(d.mobile, "0000000000"),
                  email: cf(d.email, ""), enqType: cf(d.priority, "Normal"),
                  source: cf(d.source, "System"), product: cf(d.product, "General"),
                  cost: String(cf(d.cost, "0")).replace(/[^0-9.]/g, "") || "0", address: cf(d.address, ""),
                  assignedTo: cf(d.assignedTo, ""), status: "New",
                  followupMode: "Manual", remarks: "Added via Voice Assistant",
                })
              ));

              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { }
              emitEnquiryCreated();
            } catch (err) { console.error("Auto submit enquiry failed", err); }
            _setState("idle");
          } else if (data.intent === "GATHER_ENQUIRY_FIELD") {
            startAssistant();
          } else {
            const isErr = data.intent === "ERROR_LIMIT_EXCEEDED" || (data.spokenText || "").includes("trouble") || (data.spokenText || "").includes("சேவை");
            if (!isErr) afterAISpoke(data);
            else _setState("idle");
          }
        });
      } else throw new Error(data?.error || "Rejected");
    } catch (err) {
      _setState("idle");
      const msg = err.message || "";
      if (msg.includes("GEMINI_API_KEY")) {
        setTranscript("AI Key Required"); setAiResponse("Add a GEMINI_API_KEY or OPENAI_API_KEY in .env.");
      } else {
        setTranscript("Voice processing failed."); setAiResponse(msg || "Check server and retry.");
      }
    }
  };

  const processTextQuery = async (q, shouldSpeak = true) => {
    if (!q?.trim()) return;
    const wake = getWakeCommand(q);
    if (wake.wantsStop) { stopWakeMode(); return; }
    if (wake.hasWake) {
      enableWakeMode();
      if (!wake.cleaned || ["start", "on", "listen", "listening", "background", "work"].includes(wake.cleaned)) {
        _setState("speaking"); setTranscript(`"${q}"`);
        setAiResponse("Neo background listening is on. Say Hi Neo stop to turn it off.");
        speakResponse("Neo background listening is on.", "en", () => {
          if (isMounted.current && visible && autoListenRef.current) startAssistant();
          else _setState("idle");
        });
        return;
      }
    }
    try {
      _setState("processing"); setTranscript(`"${q}"`);
      const client = await getApiClient();
      const queryText = wake.hasWake && wake.cleaned ? wake.cleaned : q;
      const { data } = await client.post("/assistant/voice-command", {
        text: queryText,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
        context: aiContextRef.current,
        history: chatHistoryRef.current,
        chatId: activeChatIdRef.current,
      });
      if (data?.success) {
        _setState("speaking"); setAiResponse(data.spokenText);
        if (data.context) setAiContext(data.context);
        else if (data.intent === "SUBMIT_ENQUIRY" || data.intent === "CANCEL_ENQUIRY") setAiContext(null);

        const aiMsg = { role: "assistant", text: data.spokenText, intent: data.intent };
        if (data.widget) aiMsg.widget = data.widget;
        const newHistory = [...chatHistoryRef.current, { role: "user", text: queryText }, aiMsg];
        setChatHistory(newHistory.slice(-50));

        if (data.chatId && data.chatId !== activeChatIdRef.current) {
          setActiveChatId(data.chatId);
          if (!activeChatIdRef.current) {
            getApiClient().then(c => c.get("/assistant/voice-sessions").then(res => {
              if (res.data?.success) setSessions(res.data.sessions);
            }));
          }
        }

        const handleComplete = async () => {
          if (data.intent === "SUBMIT_ENQUIRY" && (data.context?.draft || data.context?.drafts)) {
            try {
              const draftsToSubmit = data.context.drafts && Array.isArray(data.context.drafts) && data.context.drafts.length > 0
                ? data.context.drafts
                : [data.context.draft];

              const cf = (v, def = "") => (!v || String(v).trim().toLowerCase() === "skip") ? def : v;

              await Promise.all(draftsToSubmit.map(d =>
                client.post("/enquiries", {
                  name: cf(d.name, "Unknown"), mobile: cf(d.mobile, "0000000000"),
                  email: cf(d.email, ""), enqType: cf(d.priority, "Normal"),
                  source: cf(d.source, "System"), product: cf(d.product, "General"),
                  cost: String(cf(d.cost, "0")).replace(/[^0-9.]/g, "") || "0", address: cf(d.address, ""),
                  assignedTo: cf(d.assignedTo, ""), status: "New",
                  followupMode: "Manual", remarks: "Added via Voice Assistant",
                })
              ));

              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { }
              emitEnquiryCreated();
            } catch (err) { console.error("Auto submit enquiry failed", err); }
            _setState("idle");
          } else if (data.intent === "GATHER_ENQUIRY_FIELD") {
            if (shouldSpeak) startAssistant(); else _setState("idle");
          } else {
            const isErr = data.intent === "ERROR_LIMIT_EXCEEDED" || (data.spokenText || "").includes("trouble") || (data.spokenText || "").includes("சேவை");
            if (!isErr && shouldSpeak && autoListenRef.current) afterAISpoke(data);
            else _setState("idle");
          }
        };

        if (shouldSpeak) speakResponse(data.spokenText, data.language, handleComplete);
        else handleComplete();
      } else throw new Error(data?.error || "Failed");
    } catch (err) {
      _setState("idle"); setAiResponse(err?.response?.data?.error || err.message || "Failed.");
    }
  };

  const handleSend = () => {
    if (isProcessingTextRef.current || !manualText.trim()) return;
    const q = manualText.trim();
    isProcessingTextRef.current = true;
    setManualText("");
    processTextQuery(q, false).finally(() => {
      isProcessingTextRef.current = false;
    });
  };

  const cfg = getCfg(state);
  const bottomPad = Math.max(insets.bottom, 16);
  const statusBarHeight = insets.top;

  // ─── Compact Mode ─────────────────────────────────────────────────────────────
  if (compact) {
    if (!visible) return null;
    return (
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <KeyboardAvoidingView pointerEvents="box-none" style={StyleSheet.absoluteFill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Animated.View
            pointerEvents="auto"
            style={{
              position: "absolute", left: 12, right: 12,
              marginTop: Math.max(insets.top + 8, 34),
              borderRadius: 20, backgroundColor: T.bgCard,
              borderWidth: 1, borderColor: T.borderMid,
              overflow: "hidden",
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
              elevation: 12,
            }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
              <TouchableOpacity onPress={handleMicPress} activeOpacity={0.85}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: cfg.btnBg, alignItems: "center", justifyContent: "center", shadowColor: cfg.btnBg, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
                  {state === "processing" ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name={cfg.btnIcon} size={22} color="#FFF" />}
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: T.textPrimary }}>Neo</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: T.primarySoft, borderWidth: 1, borderColor: T.borderHigh }}>
                    <LiveDot color={cfg.dot} />
                    <Text style={{ fontSize: 9, fontWeight: "800", color: cfg.dot, textTransform: "uppercase", letterSpacing: 0.6 }}>{wakeMode ? "Wake on" : cfg.label}</Text>
                  </View>
                </View>
                <Text numberOfLines={2} style={{ marginTop: 3, fontSize: 12.5, lineHeight: 17, color: T.textSecond, fontWeight: "500" }}>
                  {aiResponse || transcript || 'Say "Hi Neo" to start'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} activeOpacity={0.75} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.bgInput, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color={T.textSecond} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ─── Full Screen Modal ────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: Math.max(statusBarHeight, 20) }}>

        {/* Sidebar backdrop */}
        {isSidebarOpen && (
          <TouchableOpacity
            activeOpacity={1} onPress={() => setIsSidebarOpen(false)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(28,25,23,0.35)", zIndex: 10 }}
          />
        )}

        {/* Sidebar */}
        <Animated.View style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: 300,
          backgroundColor: T.bgSidebar, zIndex: 11,
          transform: [{ translateX: sidebarAnim }],
          paddingTop: Math.max(statusBarHeight, 40),
          borderRightWidth: 1, borderRightColor: T.border,
          shadowColor: "#000", shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.10, shadowRadius: 14, elevation: 10,
        }}>
          <View style={{ paddingHorizontal: 20 }}>
            {/* Sidebar header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: T.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="chatbubbles-outline" size={16} color={T.primary} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: "700", color: T.textPrimary }}>Conversations</Text>
              </View>
              <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color={T.textSecond} />
              </TouchableOpacity>
            </View>

            {/* New chat button */}
            <TouchableOpacity onPress={handleNewChat} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: T.primary, padding: 13, borderRadius: 12, marginBottom: 22 }}>
              <Ionicons name="add-circle-outline" size={18} color="#FFF" />
              <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "700" }}>New conversation</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 11, fontWeight: "700", color: T.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>History</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}>
            {sessions.length === 0 ? (
              <View style={{ alignItems: "center", marginTop: 20 }}>
                <Ionicons name="mic-outline" size={32} color={T.textMuted} />
                <Text style={{ color: T.textMuted, fontSize: 13, marginTop: 8, textAlign: "center" }}>No previous conversations yet.</Text>
              </View>
            ) : sessions.map(session => (
              <TouchableOpacity
                key={session._id} onPress={() => loadChat(session._id)} activeOpacity={0.7}
                style={{
                  padding: 13, borderRadius: 12, marginBottom: 6,
                  backgroundColor: activeChatId === session._id ? T.bgCard : "transparent",
                  borderWidth: activeChatId === session._id ? 1 : 0,
                  borderColor: T.border,
                  flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  {editingChatId === session._id ? (
                    <TextInput
                      style={{ fontSize: 14, fontWeight: "600", color: T.textPrimary, padding: 0, borderBottomWidth: 1, borderBottomColor: T.primary, marginBottom: 2 }}
                      value={editChatTitle}
                      onChangeText={setEditChatTitle}
                      onSubmitEditing={() => handleRenameChat(session._id)}
                      onBlur={() => handleRenameChat(session._id)}
                      autoFocus
                    />
                  ) : (
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: activeChatId === session._id ? "600" : "500", color: T.textPrimary }}>
                      {session.title || "Conversation"}
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                    {new Date(session.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity onPress={() => { setEditingChatId(session._id); setEditChatTitle(session.title || "Conversation"); }} style={{ padding: 6 }}>
                    <Ionicons name="pencil-outline" size={15} color={T.textSecond} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteChat(session._id)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={15} color={T.red} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Main content */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Animated.View style={{
            flex: 1, opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}>

            {/* ── Header ── */}
            <View style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: T.border,
              backgroundColor: T.bgCard,
            }}>
              <TouchableOpacity
                onPress={() => setIsSidebarOpen(true)} activeOpacity={0.7}
                style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: T.bgInput, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                <Ionicons name="menu" size={20} color={T.textPrimary} />
              </TouchableOpacity>

              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: T.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="sparkles" size={15} color={T.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: T.textPrimary, lineHeight: 20 }}>Neo Voice</Text>
                  <Text style={{ fontSize: 11, color: T.textMuted, lineHeight: 14 }}>AI Assistant</Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                {/* Hands-Free Toggle */}
                <TouchableOpacity
                  onPress={() => {
                    const newVal = !handsFreeMode;
                    setHandsFreeMode(newVal);
                    if (newVal) {
                      autoListenRef.current = true;
                      if (state === "idle") startAssistant();
                    } else {
                      autoListenRef.current = false;
                      stopAssistant();
                    }
                  }} 
                  activeOpacity={0.75}
                  style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: handsFreeMode ? T.primary : T.bgInput, borderWidth: 1, borderColor: handsFreeMode ? T.primary : T.border, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="headset" size={18} color={handsFreeMode ? "#FFF" : T.primary} />
                </TouchableOpacity>

                {/* New chat */}
                <TouchableOpacity
                  onPress={handleNewChat} activeOpacity={0.75}
                  style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: T.bgInput, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="create-outline" size={18} color={T.primary} />
                </TouchableOpacity>
                {/* Close */}
                <TouchableOpacity
                  onPress={onClose} activeOpacity={0.75}
                  style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: T.bgInput, borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={18} color={T.textSecond} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Chat Area ── */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomPad }}>

              {/* Empty state + Presets */}
              {chatHistory.length === 0 && transcript === "" ? (
                <View style={{ marginBottom: 24 }}>
                  <View style={{ alignItems: "center", marginBottom: 28, marginTop: 8 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: T.primarySoft, borderWidth: 1.5, borderColor: T.borderHigh, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Ionicons name="sparkles" size={26} color={T.primary} />
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: "800", color: T.textPrimary, marginBottom: 4 }}>Hi! I'm Neo 👋</Text>
                    <Text style={{ fontSize: 14, color: T.textSecond, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 }}>
                      Tap the mic or type below. I'll listen, answer, and keep the conversation going.
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Quick commands</Text>
                  <QuickCommandGrid onSelect={(q) => processTextQuery(q, false)} />
                </View>
              ) : null}

              {/* Chat history */}
              {chatHistory.map((msg, idx) => (
                <ChatBubble key={idx} msg={msg} screenW={SCREEN_W} onSendForm={(txt) => processTextQuery(txt, false)} />
              ))}

              {/* Live transcript bubble (while listening/processing) */}
              {(state === "listening" || state === "processing") &&
                transcript !== "" && transcript !== "Listening…" && transcript !== "Processing…" && (
                  <View style={{ marginBottom: 16, alignItems: "flex-end" }}>
                    <View style={{
                      maxWidth: SCREEN_W * 0.78,
                      backgroundColor: T.bgUser, opacity: 0.7,
                      borderRadius: 18, borderBottomRightRadius: 4,
                      paddingHorizontal: 16, paddingVertical: 11,
                    }}>
                      <Text style={{ fontSize: 15.5, color: "#FFF", lineHeight: 23 }}>
                        {transcript.replace(/^"|"$/g, "")}
                      </Text>
                    </View>
                  </View>
                )}
            </ScrollView>

            {/* ── Bottom Input Area ── */}
            <View style={{
              borderTopWidth: 1, borderTopColor: T.border,
              backgroundColor: T.bgCard,
              paddingTop: 12, paddingBottom: 12,
            }}>

              {/* Wave bars — shown when listening */}
              {state === "listening" && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", height: 28 }}>
                  {[0, 60, 130, 200, 270, 340].map((delay, i) => (
                    <WaveBar key={i} delay={delay} color={T.primary} active={state === "listening"} />
                  ))}
                </View>
              )}

              {/* Status hint text */}
              {!!(transcript || aiResponse) && (
                <Text numberOfLines={2} style={{
                  marginTop: state === "listening" ? 6 : 0,
                  fontSize: 13, color: T.textSecond, textAlign: "center",
                  paddingHorizontal: 32, lineHeight: 18,
                }}>
                  {state === "speaking" ? aiResponse : transcript}
                </Text>
              )}

              {/* ── Text Input Bar ── */}
              <View style={{
                flexDirection: "row", alignItems: "flex-end",
                marginTop: (state === "listening" || transcript || aiResponse) ? 10 : 0,
                marginHorizontal: 16,
                backgroundColor: T.bgInput,
                borderRadius: 22, borderWidth: 1, borderColor: T.borderMid,
                paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
                minHeight: 48,
              }}>
                <TextInput
                  ref={inputRef}
                  style={{
                    flex: 1, fontSize: 15, color: T.textPrimary,
                    paddingTop: Platform.OS === "ios" ? 8 : 5,
                    paddingBottom: Platform.OS === "ios" ? 8 : 5,
                    maxHeight: 100, lineHeight: 21,
                  }}
                  placeholder={
                    state === "listening" ? "Listening..." :
                      state === "processing" ? "Processing..." :
                        state === "speaking" ? "Speaking..." :
                          "Type a message…"
                  }
                  placeholderTextColor={state === "listening" ? T.primary : T.textMuted}
                  value={manualText}
                  onChangeText={setManualText}
                  onSubmitEditing={handleSend}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  blurOnSubmit={false}
                  returnKeyType="send"
                  multiline
                />
                {manualText.trim().length > 0 ? (
                  <TouchableOpacity onPress={handleSend} activeOpacity={0.85}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: T.primary, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="arrow-up" size={18} color="#FFF" />
                    </View>
                  </TouchableOpacity>
                ) : (
                  // Mic icon — starts/stops listening
                  <TouchableOpacity onPress={handleMicPress} activeOpacity={0.8}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: state === "listening" ? T.primarySoft : "transparent", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={state === "listening" ? "pulse-outline" : "mic"} size={20} color={state === "listening" ? T.primary : T.textMuted} />
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Disclaimer & Upgrade Text ── */}
              <View style={{ marginTop: 12, marginHorizontal: 20, marginBottom: 4 }}>
                <Text style={{ textAlign: "center", fontSize: 11, color: T.textMuted, lineHeight: 16 }}>
                  Neo Voice Assistant can make mistakes. Please verify important information.
                </Text>
                <Text style={{ textAlign: "center", fontSize: 11, color: T.primary, fontWeight: "600", marginTop: 4 }}>
                  ✨ A major upgrade to Neo Voice is coming soon!
                </Text>
              </View>
            </View>

          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}