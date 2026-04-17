import { Alert } from "react-native";

const nativeAlert = Alert.alert.bind(Alert);

let showHandler = null;

export const registerAppAlertHandler = (handler) => {
  showHandler = handler;
  return () => {
    if (showHandler === handler) {
      showHandler = null;
    }
  };
};

export const showAppAlert = (config) => {
  if (typeof showHandler === "function") {
    showHandler(config);
    return;
  }

  nativeAlert(
    config?.title || "Notice",
    config?.message || "",
    config?.buttons || [{ text: "OK" }],
    config?.options,
  );
};

export const getNativeAlert = () => nativeAlert;
