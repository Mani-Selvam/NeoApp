import { Platform } from "react-native";

let InCallManager = null;

if (Platform.OS !== "web") {
    try {
        const mod = require("react-native-incall-manager");
        InCallManager = mod?.default || mod;
    } catch {
        InCallManager = null;
    }
}

const run = async (fn) => {
    if (!InCallManager || typeof fn !== "function") {
        return false;
    }

    try {
        const result = fn();
        if (result?.then) {
            await result;
        }
        return true;
    } catch {
        return false;
    }
};

export const getInCallControlSupport = () => ({
    mute: !!InCallManager?.setMicrophoneMute,
    speaker:
        !!InCallManager?.setForceSpeakerphoneOn ||
        !!InCallManager?.setSpeakerphoneOn,
    hold: false,
    dtmf: !!InCallManager?.sendDTMF,
});

export const setCallMuted = async (enabled) =>
    run(() => InCallManager?.setMicrophoneMute?.(!!enabled));

export const setCallSpeaker = async (enabled) => {
    const forced = await run(() =>
        InCallManager?.setForceSpeakerphoneOn?.(!!enabled),
    );
    const plain = await run(() => InCallManager?.setSpeakerphoneOn?.(!!enabled));
    return forced || plain;
};

export const setCallHold = async () => false;

export const sendCallDtmf = async (digit) =>
    run(() => InCallManager?.sendDTMF?.(String(digit || "")));
