import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { registerAppAlertHandler } from "../services/appAlertService";

const DEFAULT_BUTTON = { text: "OK" };

const normalizeAlertArgs = (title, message, buttons, options) => {
  let nextMessage = message;
  let nextButtons = buttons;
  let nextOptions = options;

  if (Array.isArray(message)) {
    nextButtons = message;
    nextMessage = "";
    nextOptions = buttons;
  } else if (message && typeof message === "object" && !Array.isArray(message)) {
    nextOptions = message;
    nextMessage = "";
    nextButtons = buttons;
  }

  if (nextButtons && !Array.isArray(nextButtons) && typeof nextButtons === "object") {
    nextOptions = nextButtons;
    nextButtons = [];
  }

  return {
    title: title || "Notice",
    message: typeof nextMessage === "string" ? nextMessage : "",
    buttons: Array.isArray(nextButtons) && nextButtons.length > 0 ? nextButtons : [DEFAULT_BUTTON],
    options: nextOptions || {},
  };
};

const getTone = (title = "") => {
  const value = String(title || "").toLowerCase();
  if (
    value.includes("error") ||
    value.includes("failed") ||
    value.includes("delete") ||
    value.includes("warning")
  ) {
    return {
      bg: "#FEF2F2",
      iconBg: "#FEE2E2",
      iconColor: "#DC2626",
      icon: "alert-circle",
    };
  }
  if (
    value.includes("success") ||
    value.includes("saved") ||
    value.includes("submitted") ||
    value.includes("sent")
  ) {
    return {
      bg: "#F0FDF4",
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      icon: "checkmark-circle",
    };
  }
  return {
    bg: "#EFF6FF",
    iconBg: "#DBEAFE",
    iconColor: "#2563EB",
    icon: "information-circle",
  };
};

export default function AppAlertHost() {
  const [queue, setQueue] = useState([]);
  const current = queue[0] || null;
  const currentRef = useRef(current);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    const originalAlert = Alert.alert;

    const openAlert = (config) => {
      setQueue((prev) => [...prev, config]);
    };

    const unregister = registerAppAlertHandler(openAlert);
    Alert.alert = (title, message, buttons, options) => {
      openAlert(normalizeAlertArgs(title, message, buttons, options));
    };

    return () => {
      unregister();
      Alert.alert = originalAlert;
    };
  }, []);

  const tone = useMemo(() => getTone(current?.title), [current?.title]);

  const closeCurrent = (button, reason = "button") => {
    const config = currentRef.current;
    if (!config) return;

    setQueue((prev) => prev.slice(1));

    if (reason === "dismiss") {
      config?.options?.onDismiss?.();
    }

    button?.onPress?.();
  };

  const handleBackdropDismiss = () => {
    if (!current?.options?.cancelable) return;
    const cancelButton =
      current?.buttons?.find((button) => button?.style === "cancel") || null;
    closeCurrent(cancelButton, "dismiss");
  };

  return (
    <Modal
      visible={Boolean(current)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBackdropDismiss}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropDismiss}>
        <Pressable
          style={[
            styles.card,
            Platform.OS === "android" ? styles.cardAndroid : null,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconWrap, { backgroundColor: tone.iconBg }]}>
            <Ionicons name={tone.icon} size={24} color={tone.iconColor} />
          </View>
          <View style={[styles.headerBand, { backgroundColor: tone.bg }]}>
            <Text style={styles.title}>{current?.title || "Notice"}</Text>
            {current?.message ? (
              <Text style={styles.message}>{current.message}</Text>
            ) : null}
          </View>
          <View style={styles.actions}>
            {current?.buttons?.map((button, index) => {
              const isPrimary = index === current.buttons.length - 1;
              const isDestructive = button?.style === "destructive";
              const isCancel = button?.style === "cancel";
              return (
                <TouchableOpacity
                  key={`${button?.text || "ok"}-${index}`}
                  activeOpacity={0.88}
                  style={[
                    styles.actionBtn,
                    isPrimary && styles.actionBtnPrimary,
                    isCancel && styles.actionBtnMuted,
                    isDestructive && styles.actionBtnDanger,
                  ]}
                  onPress={() => closeCurrent(button, "button")}
                >
                  <Text
                    style={[
                      styles.actionText,
                      isPrimary && styles.actionTextPrimary,
                      isCancel && styles.actionTextMuted,
                      isDestructive && styles.actionTextPrimary,
                    ]}
                  >
                    {button?.text || "OK"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  cardAndroid: {
    elevation: 18,
  },
  iconWrap: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  headerBand: {
    paddingTop: 28,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  title: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
    paddingRight: 54,
  },
  message: {
    marginTop: 10,
    color: "#334155",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
    paddingRight: 10,
  },
  actions: {
    padding: 18,
    gap: 10,
  },
  actionBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D9E2EC",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  actionBtnPrimary: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  actionBtnMuted: {
    backgroundColor: "#F8FAFC",
    borderColor: "#D9E2EC",
  },
  actionBtnDanger: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  actionText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  actionTextPrimary: {
    color: "#FFFFFF",
  },
  actionTextMuted: {
    color: "#475569",
  },
});
