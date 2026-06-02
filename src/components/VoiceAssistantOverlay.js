import React, { useEffect, useRef, useState } from "react";
import {
  Modal, StyleSheet, Text, TouchableOpacity, View,
  Animated, Easing, ActivityIndicator, TextInput,
  ScrollView, Platform, Alert, KeyboardAvoidingView, Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import getApiClient from "../services/apiClient";
import { speakResponse } from "../services/voiceAssistantService";
import { API_URL } from "../services/apiConfig";
import { getAuthToken } from "../services/secureTokenStorage";
import { emitEnquiryCreated } from "../services/appEvents";

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Theme Definitions ──────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#080A12",
    bgCard: "#0F1120",
    surface: "rgba(255,255,255,0.05)",
    surfaceHigh: "rgba(255,255,255,0.09)",
    border: "rgba(255,255,255,0.07)",
    borderMid: "rgba(255,255,255,0.13)",
    borderHigh: "rgba(255,255,255,0.20)",

    primary: "#7B61FF",
    primarySoft: "rgba(123,97,255,0.14)",
    primaryBorder: "rgba(123,97,255,0.30)",
    primaryGlow: "rgba(123,97,255,0.22)",
    primaryDark: "#5B35D5",

    accent: "#00C8F0",
    accentSoft: "rgba(0,200,240,0.10)",
    accentBorder: "rgba(0,200,240,0.28)",

    gold: "#F0B429",
    goldSoft: "rgba(240,180,41,0.12)",

    textPrimary: "#EEEEFF",
    textSecond: "#8B8FA8",
    textMuted: "rgba(255,255,255,0.25)",

    micGrad: ["#1A1040", "#3D2B9E", "#1A1040"],
    micGradListen: ["#4C1D95", "#7C3AED", "#0E7490"],
    micGradProc: ["#451A03", "#B45309", "#451A03"],
    micGradSpeak: ["#0C3E52", "#0891B2", "#06B6D4"],

    toggleIcon: "sunny-outline",
    toggleLabel: "Light mode",
  },
  light: {
    bg: "#F4F3FF",
    bgCard: "#FFFFFF",
    surface: "rgba(91,53,213,0.05)",
    surfaceHigh: "rgba(91,53,213,0.09)",
    border: "rgba(91,53,213,0.10)",
    borderMid: "rgba(91,53,213,0.18)",
    borderHigh: "rgba(91,53,213,0.28)",

    primary: "#5B35D5",
    primarySoft: "rgba(91,53,213,0.10)",
    primaryBorder: "rgba(91,53,213,0.25)",
    primaryGlow: "rgba(91,53,213,0.15)",
    primaryDark: "#3D1FAB",

    accent: "#0284C7",
    accentSoft: "rgba(2,132,199,0.08)",
    accentBorder: "rgba(2,132,199,0.22)",

    gold: "#D97706",
    goldSoft: "rgba(217,119,6,0.10)",

    textPrimary: "#1A1A2E",
    textSecond: "#5B5E7A",
    textMuted: "rgba(26,26,46,0.35)",

    micGrad: ["#EDE9FE", "#C4B5FD", "#EDE9FE"],
    micGradListen: ["#6D28D9", "#7C3AED", "#5B21B6"],
    micGradProc: ["#B45309", "#D97706", "#92400E"],
    micGradSpeak: ["#0369A1", "#0284C7", "#0891B2"],

    toggleIcon: "moon-outline",
    toggleLabel: "Dark mode",
  },
};

// ─── State Configs ──────────────────────────────────────────────────────────────
const getStateCfg = (state, T) => ({
  idle: {
    badge: "Ready",
    dotColor: T.textMuted,
    badgeBg: T.surface,
    badgeBorder: T.border,
    icon: "mic",
    micColors: T.micGrad,
    ringColor: "transparent",
  },
  listening: {
    badge: "Listening",
    dotColor: T.primary,
    badgeBg: T.primarySoft,
    badgeBorder: T.primaryBorder,
    icon: "stop-circle",
    micColors: T.micGradListen,
    ringColor: T.primaryGlow,
  },
  processing: {
    badge: "Processing",
    dotColor: T.gold,
    badgeBg: T.goldSoft,
    badgeBorder: "rgba(217,119,6,0.28)",
    icon: "sync",
    micColors: T.micGradProc,
    ringColor: T.goldSoft,
  },
  speaking: {
    badge: "Speaking",
    dotColor: T.accent,
    badgeBg: T.accentSoft,
    badgeBorder: T.accentBorder,
    icon: "volume-high",
    micColors: T.micGradSpeak,
    ringColor: T.accentSoft,
  },
}[state] || {
  badge: "Ready", dotColor: T.textMuted, badgeBg: T.surface, badgeBorder: T.border,
  icon: "mic", micColors: T.micGrad, ringColor: "transparent",
});

// ─── Preset Commands ────────────────────────────────────────────────────────────
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
    sampleRate: 16000, numberOfChannels: 1, bitRate: 24000,
    isMeteringEnabled: true,
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

// ─── ArcRing ────────────────────────────────────────────────────────────────────
function ArcRing({ size, color, duration, reverse, visible }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) { rot.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);
  if (!visible) return null;
  const spin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? ["360deg", "0deg"] : ["0deg", "360deg"],
  });
  return (
    <Animated.View style={{
      position: "absolute", width: size, height: size,
      borderRadius: size / 2, borderWidth: 1.5,
      borderTopColor: color,
      borderRightColor: color.replace(/[\d.]+\)$/, "0.08)"),
      borderBottomColor: "transparent",
      borderLeftColor: color.replace(/[\d.]+\)$/, "0.08)"),
      transform: [{ rotate: spin }],
    }} />
  );
}

// ─── OrbitDot ───────────────────────────────────────────────────────────────────
function OrbitDot({ radius, color, duration, startAngle, visible }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) { rot.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);
  if (!visible) return null;
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: [`${startAngle}deg`, `${startAngle + 360}deg`] });
  return (
    <Animated.View style={{
      position: "absolute",
      width: radius * 2, height: radius * 2,
      transform: [{ rotate: spin }],
      alignItems: "center",
    }}>
      <View style={{
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: color,
        marginTop: -3,
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 4,
      }} />
    </Animated.View>
  );
}

// ─── PulseRing ──────────────────────────────────────────────────────────────────
function PulseRing({ active, color, size }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!active) { scale.setValue(1); opacity.setValue(0.6); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.35, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
      ]),
    ]));
    anim.start();
    return () => anim.stop();
  }, [active]);
  return (
    <Animated.View style={{
      position: "absolute",
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 1.5, borderColor: color,
      transform: [{ scale }], opacity,
    }} />
  );
}

// ─── WaveBar ────────────────────────────────────────────────────────────────────
function WaveBar({ delay, color }) {
  const h = useRef(new Animated.Value(3)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(h, { toValue: 22, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(h, { toValue: 3, duration: 380, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  return <Animated.View style={{ width: 3, height: h, borderRadius: 2, backgroundColor: color }} />;
}

// ─── LiveDot ────────────────────────────────────────────────────────────────────
function LiveDot({ color }) {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(op, { toValue: 0.15, duration: 600, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 600, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity: op }} />;
}

// ─── ThemeToggle ────────────────────────────────────────────────────────────────
function ThemeToggle({ isDark, onToggle, T }) {
  const slide = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: isDark ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isDark]);
  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
      <View style={{
        width: 44, height: 24, borderRadius: 12,
        backgroundColor: isDark ? T.primarySoft : T.surface,
        borderWidth: 1, borderColor: isDark ? T.primaryBorder : T.border,
        justifyContent: "center",
        paddingHorizontal: 2,
      }}>
        <Animated.View style={{
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: isDark ? T.primary : T.textSecond,
          alignItems: "center", justifyContent: "center",
          transform: [{ translateX: tx }],
        }}>
          <Ionicons
            name={isDark ? "moon" : "sunny"}
            size={11}
            color={isDark ? "#FFFFFF" : "#FFFFFF"}
          />
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}


// \u2500\u2500\u2500 QuickCommandGrid \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function QuickCommandGrid({ onSelect, T }) {
  const HPAD = 20;
  const GAP = 10;
  const CARD_W = (SCREEN_W - HPAD * 2 - GAP) / 2;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP, marginBottom: 14 }}>
      {PRESETS.map((p, i) => (
        <TouchableOpacity key={i} onPress={() => onSelect(p.query)} activeOpacity={0.7} style={{ width: CARD_W, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: T.primarySoft, borderWidth: 1, borderColor: T.primaryBorder, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ionicons name={p.icon} size={15} color={T.primary} />
          </View>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 12, fontWeight: "600", color: T.textPrimary, lineHeight: 16 }}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function VoiceAssistantOverlay({ visible, onClose, compact = false }) {
  const insets = useSafeAreaInsets();
  const [isDark, setIsDark] = useState(false);
  const T = THEMES[isDark ? "dark" : "light"];

  const [state, setState] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiContext, setAiContext] = useState(null);
  const aiContextRef = useRef(null);
  const [chatHistory, setChatHistory] = useState([]);
  const chatHistoryRef = useRef([]);
  
  useEffect(() => { aiContextRef.current = aiContext; }, [aiContext]);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);

  const [manualText, setManualText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [recording, setRecording] = useState(null);
  const [wakeMode, setWakeMode] = useState(false);

  const silenceTimer = useRef(0);
  const hasSpoken = useRef(false);
  const isMounted = useRef(true);
  const recognRef = useRef(null);
  const inputRef = useRef(null);
  const wakeModeRef = useRef(false);
  // autoListenRef: when true, after AI speaks → auto-restart listening
  // when silence with no speech → stop cleanly
  const autoListenRef = useRef(false);
  const stateRef = useRef("idle"); // mirrors state for use inside callbacks

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const themeAnim = useRef(new Animated.Value(1)).current;

  // _setState keeps stateRef in sync with React state for async callbacks
  const _setState = (s) => { stateRef.current = s; setState(s); };

  // Theme transition flash
  const handleThemeToggle = () => {
    Animated.sequence([
      Animated.timing(themeAnim, { toValue: 0.85, duration: 120, useNativeDriver: true }),
      Animated.timing(themeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    setIsDark(v => !v);
    try { Haptics.selectionAsync(); } catch { }
  };

  useEffect(() => {
    isMounted.current = true;
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
      // In compact mode, always auto-listen loop on open
      if (compact) autoListenRef.current = true;
      startAssistant();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      autoListenRef.current = false; // stop auto-listen loop on close
      stopAssistant();
      setWakeMode(false);
      wakeModeRef.current = false;
    }
    return () => {
      isMounted.current = false;
      try { Speech.stop(); } catch { }
    };
  }, [visible]);

  useEffect(() => {
    if (showInput) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showInput]);

  // ── Recording ──────────────────────────────────────────────────────────────────
  const getWakeCommand = (text) => {
    const normalized = String(text || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hasWake =
      /\b(hi|hey|hello)\s+neo\b/.test(normalized) ||
      /\bneo\b/.test(normalized);
    const wantsStop =
      hasWake && /\b(stop|close|off|kill|sleep)\b/.test(normalized);
    const cleaned = normalized
      .replace(/\b(hi|hey|hello)\s+neo\b/g, "")
      .replace(/\bneo\b/g, "")
      .replace(/\b(please|pls)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return { hasWake, wantsStop, cleaned };
  };

  const enableWakeMode = () => {
    wakeModeRef.current = true;
    setWakeMode(true);
  };

  const disableWakeMode = () => {
    wakeModeRef.current = false;
    setWakeMode(false);
  };

  const finishAssistantReply = (text, language, isErr = false) => {
    speakResponse(text, language, () => {
      if (isMounted.current && visible && wakeModeRef.current && !isErr) {
        startAssistant();
      } else {
        setState("idle");
      }
    });
  };

  const stopWakeMode = () => {
    disableWakeMode();
    setState("speaking");
    setTranscript('"Hi Neo stop"');
    setAiResponse("Neo background listening stopped. Manual mic still works.");
    speakResponse(
      "Neo background listening stopped. Manual mic still works.",
      "en",
      () => {
        if (isMounted.current) {
          stopAssistant();
          onClose?.();
        }
      },
    );
  };

  const startAssistant = async () => {
    if (!isMounted.current) return;
    try { Haptics.selectionAsync(); } catch { }
    if (recording) {
      try { await recording.stopAndUnloadAsync(); } catch { }
      setRecording(null);
    }
    setTranscript("Listening… speak now.");
    silenceTimer.current = 0;
    hasSpoken.current = false;

    if (Platform.OS === "web") {
      setState("listening");
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
        rec.onresult = (e) => { const r = e.results[0][0].transcript; setTranscript(`"${r}"`); processTextQuery(r); };
        rec.onerror = () => { };
        rec.onend = () => { if (state === "listening") setState("idle"); };
        rec.start(); recognRef.current = rec;
      }
    } else {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Microphone", "Enable microphone permissions to use voice.");
          setState("idle"); setTranscript("Permission denied. Tap a preset or type."); return;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(AUDIO_CONFIG);
        const startTime = Date.now();
        await rec.setProgressUpdateInterval(150);
        rec.setOnRecordingStatusUpdate((s) => {
          if (!s.canRecord || !s.isRecording) return;
          if (Date.now() - startTime >= 40000) { stopAndSubmit(rec); return; } // Max 40s
          if (s.metering > -28) hasSpoken.current = true;
          if (Date.now() - startTime < 1200) { silenceTimer.current = 0; return; }
          if (s.metering < -28) {
            silenceTimer.current += 150;
            // Only auto-submit on silence IF the user has actually started speaking
            if (hasSpoken.current && silenceTimer.current >= 1200) {
                stopAndSubmit(rec);
            }
          } else { silenceTimer.current = 0; }
        });
        await rec.startAsync();
        setRecording(rec);
        setState("listening");
      } catch {
        setState("idle"); setTranscript("Microphone unavailable. Tap a preset.");
      }
    }
  };

  const stopAssistant = async () => {
    setState("idle"); setTranscript(""); setAiResponse(""); setShowInput(false);
    try { Speech.stop(); } catch { }
    if (Platform.OS === "web" && recognRef.current) { try { recognRef.current.stop(); } catch { } recognRef.current = null; }
    if (recording) { try { await recording.stopAndUnloadAsync(); } catch { } setRecording(null); }
  };

  const stopAndSubmit = async (rec) => {
    if (!rec) return;
    if (!hasSpoken.current) {
      // No speech detected — stop auto-listen loop and go idle / close
      _setState("idle");
      autoListenRef.current = false;
      if (compact) {
        setTranscript("");
        setAiResponse("");
        // Close the compact overlay after silence-stop
        setTimeout(() => { if (isMounted.current) onClose?.(); }, 400);
      } else {
        setTranscript("No speech detected. Tap mic to try again.");
      }
      try { await rec.stopAndUnloadAsync(); } catch { }
      setRecording(null); return;
    }
    _setState("processing"); setTranscript("Analyzing voice input…");
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecording(null);
      processAudio(uri);
    } catch { _setState("idle"); setTranscript("Recording failed."); }
  };

  const handleMicPress = async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { }
    if (state === "listening") {
      if (Platform.OS === "web" && recognRef.current) recognRef.current.stop();
      else if (recording) stopAndSubmit(recording);
    } else startAssistant();
  };

  const processAudio = async (uri) => {
    if (!uri) { setState("idle"); setTranscript("No audio captured."); return; }
    try {
      setState("processing"); setTranscript("Reading your voice…");
      const token = await getAuthToken();
      const fd = new FormData();
      const filename = uri.split("/").pop();
      const match = /\.(\w+)$/.exec(filename);
      fd.append("audio", { uri, name: filename || "voice.m4a", type: match ? `audio/${match[1]}` : "audio/m4a" });
      fd.append("tzOffsetMinutes", String(new Date().getTimezoneOffset()));
      if (aiContextRef.current) fd.append("context", JSON.stringify(aiContextRef.current));
      if (chatHistoryRef.current.length > 0) fd.append("history", JSON.stringify(chatHistoryRef.current));
      const res = await fetch(`${API_URL}/assistant/voice-command`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || `Server error ${res.status}`); }
      const data = await res.json();
      if (data?.success) {
        const wake = getWakeCommand(data.statsUsed?.recognizedText || "");
        if (wake.wantsStop) {
          stopWakeMode();
          return;
        }
        if (wake.hasWake) enableWakeMode();
        _setState("speaking");
        setTranscript(`"${data.statsUsed?.recognizedText || "Voice Query"}"`);
        setAiResponse(data.spokenText);

        if (data.context) setAiContext(data.context);
        else if (data.intent === "SUBMIT_ENQUIRY" || data.intent === "CANCEL_ENQUIRY") setAiContext(null);

        if (data.intent === "SUBMIT_ENQUIRY" || data.intent === "CANCEL_ENQUIRY") {
            setChatHistory([]);
        } else {
            const userText = data.statsUsed?.recognizedText || "Voice Query";
            const newHistory = [...chatHistoryRef.current, { role: "user", text: userText }, { role: "assistant", text: data.spokenText }];
            setChatHistory(newHistory.slice(-10));
        }

        speakResponse(data.spokenText, data.language, async () => {
          if (data.intent === "SUBMIT_ENQUIRY" && data.context?.draft) {
                 try {
                    const client = await getApiClient();
                    const draft = data.context.draft;
                    const cleanField = (val, defaultVal = "") => {
                        if (!val) return defaultVal;
                        if (String(val).trim().toLowerCase() === "skip") return defaultVal;
                        return val;
                    };
                    await client.post("/enquiries", {
                        name: cleanField(draft.name, "Unknown"),
                        mobile: cleanField(draft.mobile, "0000000000"),
                        email: cleanField(draft.email, ""),
                        enqType: cleanField(draft.priority, "Normal"),
                        source: cleanField(draft.source, "System"),
                        product: cleanField(draft.product, "General"),
                        cost: cleanField(draft.cost, "0"),
                        address: cleanField(draft.address, ""),
                        assignedTo: cleanField(draft.assignedTo, ""),
                        status: "New",
                        followupMode: "Manual",
                        remarks: "Added via Voice Assistant"
                    });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    emitEnquiryCreated();
             } catch(err) {
                console.error("Auto submit enquiry failed", err);
             }
             _setState("idle");
          } else if (data.intent === "GATHER_ENQUIRY_FIELD") {
             startAssistant();
          } else {
             const isErr = data.spokenText.includes("trouble") || data.spokenText.includes("சேவை");
             // Auto-restart listening if: autoListen mode OR wakeMode is on, and no error
             if (isMounted.current && visible && (autoListenRef.current || wakeModeRef.current) && !isErr) {
               startAssistant();
             } else {
               _setState("idle");
             }
          }
        });
      } else throw new Error(data?.error || "Rejected");
    } catch (err) {
      setState("idle");
      const msg = err.message || "";
      if (msg.includes("GEMINI_API_KEY")) {
        setTranscript("AI Key Required"); setAiResponse("Add a GEMINI_API_KEY or OPENAI_API_KEY in .env.");
      } else {
        setTranscript("Voice processing failed."); setAiResponse(msg || "Check server and retry.");
      }
    }
  };

  const processTextQuery = async (q) => {
    if (!q?.trim()) return;
    const wake = getWakeCommand(q);
    if (wake.wantsStop) {
      stopWakeMode();
      return;
    }
    if (wake.hasWake) {
      enableWakeMode();
      if (!wake.cleaned || ["start", "on", "listen", "listening", "background", "work"].includes(wake.cleaned)) {
        setState("speaking");
        setTranscript(`"${q}"`);
        setAiResponse("Neo background listening is on. Say Hi Neo stop to stop it.");
        finishAssistantReply("Neo background listening is on. Say Hi Neo stop to stop it.", "en", false);
        return;
      }
    }
    try {
      setState("processing"); setTranscript(`"${q}"`);
      const client = await getApiClient();
      const queryText = wake.hasWake && wake.cleaned ? wake.cleaned : q;
      const { data } = await client.post("/assistant/voice-command", { 
          text: queryText, 
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          context: aiContextRef.current,
          history: chatHistoryRef.current
      });
      if (data?.success) {
        _setState("speaking"); setAiResponse(data.spokenText);
        
        if (data.context) setAiContext(data.context);
        else if (data.intent === "SUBMIT_ENQUIRY" || data.intent === "CANCEL_ENQUIRY") setAiContext(null);

        if (data.intent === "SUBMIT_ENQUIRY" || data.intent === "CANCEL_ENQUIRY") {
            setChatHistory([]);
        } else {
            const newHistory = [...chatHistoryRef.current, { role: "user", text: queryText }, { role: "assistant", text: data.spokenText }];
            setChatHistory(newHistory.slice(-10));
        }

        speakResponse(data.spokenText, data.language, async () => {
          if (data.intent === "SUBMIT_ENQUIRY" && data.context?.draft) {
             try {
                const draft = data.context.draft;
                await client.post("/enquiries", {
                    name: draft.name || "Unknown",
                    mobile: draft.mobile || "0000000000",
                    email: draft.email || "",
                    enqType: draft.priority || "Normal",
                    source: draft.source || "System",
                    product: draft.product || "General",
                    cost: draft.cost || "0",
                    address: draft.address || "",
                    status: "New",
                    followupMode: "Manual",
                    remarks: "Added via Voice Assistant"
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                emitEnquiryCreated();
             } catch(err) {
                console.error("Auto submit enquiry failed", err);
             }
             _setState("idle");
          } else if (data.intent === "GATHER_ENQUIRY_FIELD") {
             startAssistant();
          } else {
             const isErr = data.spokenText.includes("trouble") || data.spokenText.includes("சேவை");
             if (isMounted.current && visible && (autoListenRef.current || wakeModeRef.current) && !isErr) {
               startAssistant();
             } else {
               _setState("idle");
             }
          }
        });
      } else throw new Error(data?.error || "Failed");
    } catch (err) {
      setState("idle"); setAiResponse(err?.response?.data?.error || err.message || "Failed.");
    }
  };

  const handleSend = () => {
    if (!manualText.trim()) return;
    processTextQuery(manualText);
    setManualText("");
  };

  const cfg = getStateCfg(state, T);
  const bottomPad = Math.max(insets.bottom, 20);
  const statusBarHeight = insets.top;

  // ─── Render ───────────────────────────────────────────────────────────────────
  if (compact) {
    if (!visible) return null;

    return (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <KeyboardAvoidingView
            pointerEvents="box-none"
            style={StyleSheet.absoluteFill}
            behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <Animated.View
              pointerEvents="auto"
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                marginTop: Math.max(insets.top + 8, 34),
                borderRadius: 20,
                backgroundColor: T.bgCard,
                borderWidth: 1,
                borderColor: T.borderMid,
                overflow: "hidden",
                opacity: Animated.multiply(fadeAnim, themeAnim),
                transform: [{ translateY: slideAnim }],
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 14,
              }}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                <TouchableOpacity onPress={handleMicPress} activeOpacity={0.84}>
                  <LinearGradient
                    colors={cfg.micColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" }}>
                    {state === "processing" ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name={cfg.icon} size={21} color="#FFFFFF" />
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                    <Text style={{ fontSize: 15, fontWeight: "900", color: T.textPrimary }}>
                      Neo Voice
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: cfg.badgeBg,
                        borderWidth: 1,
                        borderColor: cfg.badgeBorder,
                      }}>
                      <LiveDot color={cfg.dotColor} />
                      <Text style={{ fontSize: 9, fontWeight: "800", color: cfg.dotColor, textTransform: "uppercase" }}>
                        {wakeMode ? "Wake on" : cfg.badge}
                      </Text>
                    </View>
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: T.textSecond, fontWeight: "600" }}>
                    {aiResponse || transcript || 'Say "Hi Neo" and ask your question.'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.75}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: T.surface,
                    borderWidth: 1,
                    borderColor: T.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                  <Ionicons name="close" size={17} color={T.textSecond} />
                </TouchableOpacity>
              </View>

              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: T.border,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: T.surface,
                }}>
                <TouchableOpacity
                  onPress={() => {
                    const isActive = state === "listening" || state === "speaking" || state === "processing";
                    if (isActive) {
                      // Stop everything
                      autoListenRef.current = false;
                      stopAssistant();
                    } else {
                      // Start auto-listen loop
                      autoListenRef.current = true;
                      startAssistant();
                    }
                  }}
                  activeOpacity={0.78}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 6,
                    backgroundColor: (state === "listening" || state === "speaking" || state === "processing")
                      ? T.primaryBorder
                      : T.primarySoft,
                    borderWidth: 1,
                    borderColor: T.primaryBorder,
                  }}>
                  <Ionicons
                    name={(state === "listening") ? "stop-circle-outline" : (state === "speaking") ? "volume-high-outline" : "mic-outline"}
                    size={15}
                    color={T.primary}
                  />
                  <Text style={{ color: T.primary, fontWeight: "800", fontSize: 12 }}>
                    {state === "listening" ? "Stop" : state === "speaking" ? "Speaking…" : state === "processing" ? "Processing…" : "Listen"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowInput((v) => !v)}
                  activeOpacity={0.78}
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                    gap: 6,
                    backgroundColor: T.bgCard,
                    borderWidth: 1,
                    borderColor: T.border,
                  }}>
                  <Ionicons name="create-outline" size={15} color={T.textSecond} />
                  <Text style={{ color: T.textSecond, fontWeight: "800", fontSize: 12 }}>
                    Type
                  </Text>
                </TouchableOpacity>
              </View>

              {showInput ? (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    ref={inputRef}
                    value={manualText}
                    onChangeText={setManualText}
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                    placeholder="Type command..."
                    placeholderTextColor={T.textMuted}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: T.borderMid,
                      color: T.textPrimary,
                      paddingHorizontal: 12,
                      fontSize: 13,
                      backgroundColor: T.bgCard,
                    }}
                  />
                  <TouchableOpacity onPress={handleSend} activeOpacity={0.84}>
                    <LinearGradient
                      colors={[T.primary, T.accent]}
                      style={{ width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="arrow-up" size={18} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: statusBarHeight }}>

        {/* Subtle background accent blobs */}
        <View style={{
          position: "absolute", width: 220, height: 220, borderRadius: 110,
          backgroundColor: isDark ? "rgba(123,97,255,0.06)" : "rgba(91,53,213,0.05)",
          top: -60, left: -60,
        }} />
        <View style={{
          position: "absolute", width: 160, height: 160, borderRadius: 80,
          backgroundColor: isDark ? "rgba(0,200,240,0.04)" : "rgba(2,132,199,0.04)",
          top: 40, right: -40,
        }} />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Animated.View style={{
            flex: 1,
            paddingHorizontal: 20,
            opacity: Animated.multiply(fadeAnim, themeAnim),
            transform: [{ translateY: slideAnim }],
          }}>

            {/* ── Top Bar ── */}
            <View style={{
              flexDirection: "row", alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 12, paddingBottom: 10,
            }}>
              {/* Logo */}
              <View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Text style={{
                    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
                    fontSize: 24, fontWeight: "800",
                    color: T.primary, letterSpacing: -0.5,
                  }}>NEO</Text>
                  <View style={{
                    paddingHorizontal: 7, paddingVertical: 2,
                    backgroundColor: T.primarySoft,
                    borderRadius: 5, borderWidth: 1, borderColor: T.primaryBorder,
                  }}>
                    <Text style={{ fontSize: 8, fontWeight: "700", color: T.primary, letterSpacing: 1.5 }}>AI</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 8.5, fontWeight: "700", color: T.textMuted, letterSpacing: 2.5, marginTop: 1 }}>
                  VOICE INTELLIGENCE
                </Text>
              </View>

              {/* Right controls */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ThemeToggle isDark={isDark} onToggle={handleThemeToggle} T={T} />
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.75}
                  style={{
                    width: 34, height: 34, borderRadius: 17,
                    backgroundColor: T.surface,
                    borderWidth: 1, borderColor: T.border,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Ionicons name="close" size={17} color={T.textSecond} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Divider ── */}
            <View style={{ height: 1, backgroundColor: T.border, marginBottom: 12 }} />

            {/* ── State Badge ── */}
            <View style={{
              flexDirection: "row", alignItems: "center", alignSelf: "center",
              paddingHorizontal: 14, paddingVertical: 7,
              borderRadius: 20, borderWidth: 1,
              backgroundColor: cfg.badgeBg, borderColor: cfg.badgeBorder,
              gap: 8, marginBottom: 8,
            }}>
              <LiveDot color={cfg.dotColor} />
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: cfg.dotColor, letterSpacing: 1.8, textTransform: "uppercase" }}>
                {wakeMode ? "Wake on" : cfg.badge}
              </Text>
            </View>

            {/* ── Scrollable ── */}
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomPad }}
            >

              {/* ── Mic Zone ── */}
              <View style={{
                alignSelf: "center", width: 200, height: 200,
                alignItems: "center", justifyContent: "center",
                marginVertical: 6,
              }}>
                {/* Orbit rings — only in listening */}
                <ArcRing size={188} color={T.primary.replace("#", "rgba(") + ",0.45)"} duration={9000} visible={state === "listening"} />
                <ArcRing size={158} color={T.accent.replace("#", "rgba(") + ",0.35)"} duration={6500} reverse visible={state === "listening"} />
                <ArcRing size={130} color={T.gold + "44"} duration={12000} visible={state === "listening"} />

                {/* Orbit dots */}
                <OrbitDot radius={94} color={T.primary} duration={4000} startAngle={0} visible={state === "listening"} />
                <OrbitDot radius={79} color={T.accent} duration={6000} startAngle={120} visible={state === "listening"} />
                <OrbitDot radius={65} color={T.gold} duration={8000} startAngle={240} visible={state === "listening"} />

                {/* Pulse rings */}
                <PulseRing active={state === "listening"} color={T.primary} size={118} />
                <PulseRing active={state === "processing"} color={T.gold} size={118} />
                <PulseRing active={state === "speaking"} color={T.accent} size={118} />

                {/* Static outer ring — always visible */}
                <View style={{
                  position: "absolute", width: 114, height: 114, borderRadius: 57,
                  borderWidth: 1, borderColor: T.border,
                }} />

                {/* Mic button */}
                <TouchableOpacity onPress={handleMicPress} activeOpacity={0.82}>
                  <LinearGradient
                    colors={cfg.micColors}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{
                      width: 96, height: 96, borderRadius: 48,
                      alignItems: "center", justifyContent: "center",
                      shadowColor: cfg.dotColor,
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: isDark ? 0.45 : 0.25,
                      shadowRadius: 20,
                      elevation: 10,
                    }}
                  >
                    {/* Inner highlight ring */}
                    <View style={{
                      position: "absolute", top: 8, left: 8, right: 8, bottom: 8,
                      borderRadius: 40, borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.18)",
                    }} />
                    {state === "processing"
                      ? <ActivityIndicator size="large" color="#FFFFFF" />
                      : <Ionicons name={cfg.icon} size={34} color="#FFFFFF" />
                    }
                  </LinearGradient>
                </TouchableOpacity>

                {/* Speaking waveform */}
                {state === "speaking" && (
                  <View style={{
                    position: "absolute", bottom: 12,
                    flexDirection: "row", alignItems: "flex-end", gap: 4, height: 28,
                  }}>
                    {[0, 110, 55, 165, 30, 130, 80, 15, 95].map((d, i) => (
                      <WaveBar key={i} delay={d} color={T.accent} />
                    ))}
                  </View>
                )}
              </View>

              {/* ── Response Card ── */}
              <View style={{
                backgroundColor: T.bgCard,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: T.border,
                padding: 16,
                marginBottom: 16,
                minHeight: 64,
                justifyContent: "center",
                // Light mode shadow for depth
                shadowColor: isDark ? "transparent" : "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: isDark ? 0 : 2,
              }}>
                {(transcript !== "" || aiResponse !== "") ? (
                  <>
                    {transcript !== "" && (
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                        <View style={{
                          marginTop: 3, width: 3, height: 14, borderRadius: 1.5,
                          backgroundColor: T.primary,
                        }} />
                        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: T.textPrimary, fontStyle: "italic", lineHeight: 20 }}>
                          {transcript}
                        </Text>
                      </View>
                    )}
                    {aiResponse !== "" && (
                      <>
                        <View style={{ height: 1, backgroundColor: T.border, marginVertical: 10 }} />
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                          <View style={{
                            marginTop: 3, width: 3, height: 14, borderRadius: 1.5,
                            backgroundColor: T.accent,
                          }} />
                          <Text style={{ flex: 1, fontSize: 13, color: T.textSecond, lineHeight: 20 }}>
                            {aiResponse}
                          </Text>
                        </View>
                      </>
                    )}
                  </>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" }}>
                    <Ionicons name="mic-circle-outline" size={16} color={T.textMuted} />
                    <Text style={{ fontSize: 13, color: T.textMuted, fontStyle: "italic" }}>
                      Tap the mic or choose a command
                    </Text>
                  </View>
                )}
              </View>

              {/* ── Quick Commands OR Type Input ── */}
              {!showInput ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: T.textMuted, letterSpacing: 2.2, textTransform: "uppercase", flexShrink: 0 }}>
                      Quick Commands
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                  </View>
                  <QuickCommandGrid onSelect={processTextQuery} T={T} />
                </>
              ) : (
                /* ── Type input replaces quick commands ── */
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: T.surface,
                  borderWidth: 1.5, borderColor: T.primaryBorder,
                  borderRadius: 16,
                  paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
                  gap: 8, marginBottom: 14,
                }}>
                  <Ionicons name="search-outline" size={16} color={T.textSecond} />
                  <TextInput
                    ref={inputRef}
                    style={{
                      flex: 1, fontSize: 14, fontWeight: "400",
                      color: T.textPrimary, height: 40, paddingVertical: 0,
                    }}
                    placeholder="Type your command…"
                    placeholderTextColor={T.textMuted}
                    value={manualText}
                    onChangeText={setManualText}
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                    autoCorrect={false}
                    autoCapitalize="none"
                    selectionColor={T.primary}
                    underlineColorAndroid="transparent"
                  />
                  <TouchableOpacity onPress={handleSend} activeOpacity={0.85}>
                    <LinearGradient
                      colors={[T.primary, T.accent]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Action Row ── */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {state !== "listening" && (
                  <TouchableOpacity
                    onPress={startAssistant}
                    activeOpacity={0.75}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center",
                      justifyContent: "center", gap: 7,
                      backgroundColor: T.surface,
                      borderWidth: 1, borderColor: T.border,
                      borderRadius: 14, paddingVertical: 12,
                    }}
                  >
                    <Ionicons name="refresh" size={14} color={T.primary} />
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: T.textPrimary }}>Record Again</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setShowInput(v => !v)}
                  activeOpacity={0.75}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center",
                    justifyContent: "center", gap: 7,
                    backgroundColor: showInput ? T.primarySoft : T.surface,
                    borderWidth: 1,
                    borderColor: showInput ? T.primaryBorder : T.border,
                    borderRadius: 14, paddingVertical: 12,
                  }}
                >
                  <Ionicons
                    name={showInput ? "mic-outline" : "create-outline"}
                    size={14}
                    color={showInput ? T.primary : T.primary}
                  />
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: showInput ? T.primary : T.textPrimary }}>
                    {showInput ? "Use Mic" : "Type Command"}
                  </Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
