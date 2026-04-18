import axios from 'axios';
import Constants from 'expo-constants';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from './apiConfig';
import * as callLogService from './callLogService';
import { APP_EVENTS, emitAppEvent } from "./appEvents";

let CallDetectorManager;
let isCallDetectorAvailable = false;

if (Platform.OS !== 'web') {
    try {
        const lib = require('react-native-call-detector');
        CallDetectorManager = lib?.default || lib;
        // Check if the native module is actually present
        isCallDetectorAvailable = !!NativeModules.CallDetector && !!CallDetectorManager;
    } catch (_e) {
        console.log('CallDetector library not found or native module missing');
        isCallDetectorAvailable = false;
    }
}

let callDetector = null;
let callStartTime = null;
let dialStartTime = null; // Track when we start dialing
let currentNumber = null;
let currentCallType = "Unknown";
let hasWarnedUnavailableCallLog = false;
let lastIncomingLookup = { num: null, ts: 0 };
let deviceSyncIntervalId = null;
let lastDeviceSyncTs = 0;
let lastDeviceSyncMinTs = 0;
const LAST_DEVICE_SYNC_KEY = "callMonitor:lastDeviceSyncMinTs";

const isPlayStoreSafeMode = () =>
    Constants.expoConfig?.extra?.playStoreSafeMode === true;

export const isRestrictedCallMonitoringEnabled = () =>
    Platform.OS === "android" && !isPlayStoreSafeMode() && !isExpoGo();

const isExpoGo = () =>
    Constants.executionEnvironment === "storeClient" ||
    Constants.appOwnership === "expo";

const requestPermissions = async () => {
    if (Platform.OS === 'android') {
        try {
            if (isPlayStoreSafeMode()) {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CALL_PHONE,
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }

            const criticalPermissions = [
                PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
                PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
                PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
                PermissionsAndroid.PERMISSIONS.CALL_PHONE,
            ].filter(Boolean);
            const optionalPermissions = [
                PermissionsAndroid.PERMISSIONS.PROCESS_OUTGOING_CALLS,
                PermissionsAndroid.PERMISSIONS.ANSWER_PHONE_CALLS,
                PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS,
            ].filter(Boolean);

            const granted = await PermissionsAndroid.requestMultiple([
                ...criticalPermissions,
                ...optionalPermissions,
            ]);
            console.log('Call Logger Permissions:', granted);

            const hasCriticalPermissions = criticalPermissions.every(
                (permission) =>
                    granted[permission] === PermissionsAndroid.RESULTS.GRANTED,
            );
            if (!hasCriticalPermissions) {
                const deniedCritical = criticalPermissions.filter(
                    (permission) =>
                        granted[permission] !== PermissionsAndroid.RESULTS.GRANTED,
                );
                console.warn(
                    '[CallMonitor] Missing critical permissions:',
                    deniedCritical,
                );
                return false;
            }

            const deniedOptional = optionalPermissions.filter(
                (permission) =>
                    granted[permission] &&
                    granted[permission] !== PermissionsAndroid.RESULTS.GRANTED,
            );
            if (deniedOptional.length) {
                console.log(
                    '[CallMonitor] Optional permissions denied:',
                    deniedOptional,
                );
            }

            return true;
        } catch (err) {
            console.warn(err);
            return false;
        }
    }
    return true;
};

export const ensureCallLogPermissions = async () => requestPermissions();

const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");

const normalizeCallType = (raw) => {
    const value = String(raw || "")
        .trim()
        .toLowerCase();
    if (!value) return null;

    // react-native-call-log commonly returns numeric types: 1=in, 2=out, 3=missed
    if (value === "1" || value.includes("incoming")) return "Incoming";
    if (value === "2" || value.includes("outgoing")) return "Outgoing";
    if (value === "3" || value.includes("missed")) return "Missed";

    if (value.includes("rejected") || value.includes("blocked")) return "Missed";
    if (value.includes("not attended") || value.includes("notattended"))
        return "Not Attended";

    return null;
};

const pickEntryTimestampMs = (entry) => {
    const raw =
        entry?.timestamp ??
        entry?.dateTime ??
        entry?.callDateTime ??
        entry?.date ??
        entry?.time ??
        "";
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return null;
};

const pickEntryDurationSeconds = (entry) => {
    const raw = entry?.duration ?? entry?.callDuration ?? entry?.dur ?? 0;
    const asNum = Number(raw);
    return Number.isFinite(asNum) && asNum >= 0 ? asNum : 0;
};

const pickEntryDeviceCallId = (entry) => {
    const raw =
        entry?.id ??
        entry?._id ??
        entry?.callId ??
        entry?.callID ??
        entry?.callLogId ??
        null;
    const value = raw == null ? "" : String(raw).trim();
    return value || null;
};

const isSameNumberLoose = (a, b) => {
    const da = normalizeDigits(a);
    const db = normalizeDigits(b);
    if (!da || !db) return false;
    const sa = da.length > 10 ? da.slice(-10) : da;
    const sb = db.length > 10 ? db.slice(-10) : db;
    return sa === sb;
};

// Reads the most recent device call log entry for the given number since a timestamp.
// Android-only. Requires call log permission and a custom dev client / EAS build (not Expo Go).
export const getLatestDeviceCallLogForNumber = async ({
    phoneNumber,
    sinceMs,
    limit = 20,
} = {}) => {
    try {
        if (Platform.OS !== "android") return null;
        if (isPlayStoreSafeMode()) return null;
        if (isExpoGo()) return null;

        const digits = normalizeDigits(phoneNumber);
        if (!digits) return null;

        const minTimestamp = Number.isFinite(Number(sinceMs))
            ? Math.max(0, Number(sinceMs) - 60 * 1000)
            : Date.now() - 10 * 60 * 1000;

        const mod = require("react-native-call-log");
        const CallLog = mod?.default || mod;
        if (!CallLog?.load) return null;

        const logs = await CallLog.load(Math.max(1, Number(limit) || 20), {
            minTimestamp,
        });
        if (!Array.isArray(logs) || logs.length === 0) return null;

        const candidates = logs
            .map((entry) => {
                const entryNumber =
                    entry?.phoneNumber ||
                    entry?.number ||
                    entry?.formattedNumber ||
                    "";
                const ts = pickEntryTimestampMs(entry);
                const callType =
                    normalizeCallType(entry?.callType ?? entry?.type) || null;
                const duration = pickEntryDurationSeconds(entry);
                return {
                    entry,
                    entryNumber,
                    ts,
                    callType,
                    duration,
                };
            })
            .filter(
                (x) =>
                    Boolean(x.ts) &&
                    isSameNumberLoose(x.entryNumber, digits) &&
                    (sinceMs == null || x.ts >= minTimestamp),
            )
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));

        if (candidates.length === 0) return null;

        const best = candidates[0];
        return {
            phoneNumber: normalizeDigits(best.entryNumber) || digits,
            callType: best.callType,
            duration: best.duration,
            callTime: best.ts ? new Date(best.ts) : new Date(),
            deviceCallId: pickEntryDeviceCallId(best.entry),
        };
    } catch (_e) {
        return null;
    }
};

const syncDeviceLogsIfPossible = async ({ force = false } = {}) => {
    if (Platform.OS !== "android") return;
    if (isPlayStoreSafeMode()) return;
    if (isExpoGo()) return;

    const now = Date.now();
    if (!force && now - lastDeviceSyncTs < 45000) return;
    lastDeviceSyncTs = now;

    try {
        if (!lastDeviceSyncMinTs) {
            const stored = await AsyncStorage.getItem(LAST_DEVICE_SYNC_KEY).catch(
                () => null,
            );
            const parsed = Number(stored);
            if (Number.isFinite(parsed) && parsed > 0) lastDeviceSyncMinTs = parsed;
        }

        const mod = require("react-native-call-log");
        const CallLog = mod?.default || mod;
        if (!CallLog?.load) return;

        const minTimestamp = Math.max(
            Date.now() - 6 * 60 * 60 * 1000,
            (Number(lastDeviceSyncMinTs || 0) || 0) - 5 * 60 * 1000,
        );

        const logs = await CallLog.load(80, {
            minTimestamp,
        });
        if (!Array.isArray(logs) || logs.length === 0) return;

        await callLogService.syncCallLogs(logs);

        // Advance the persisted cursor so future syncs are incremental.
        try {
            let maxTs = 0;
            for (const entry of logs) {
                const ts = pickEntryTimestampMs(entry) || 0;
                if (ts > maxTs) maxTs = ts;
            }
            if (maxTs > 0) {
                lastDeviceSyncMinTs = maxTs;
                await AsyncStorage.setItem(LAST_DEVICE_SYNC_KEY, String(maxTs)).catch(
                    () => {},
                );
            }
        } catch (_e) {}
    } catch (_e) {
        // ignore sync errors (permissions / OEM restrictions)
    }
};

// Check if RNImmediatePhoneCall is actually available in the build
export const isImmediateCallAvailable = () => {
    try {
        const RNImmediatePhoneCall = require('react-native-immediate-phone-call').default;
        return !!RNImmediatePhoneCall;
    } catch (_e) {
        return false;
    }
};

export const startCallMonitoring = async (userData = null) => {
    if (Platform.OS === 'web') {
        process.env.NODE_ENV !== 'production' && console.log('Call Monitoring: Not supported on Web');
        return;
    }

    if (isPlayStoreSafeMode()) {
        console.log("Call Monitoring: Play Store safe mode is enabled; restricted call log features are disabled");
        return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
        console.warn('Call Monitoring: Permissions denied');
        return;
    }

    // Capture user's mobile as the default business number
    const userBusinessNumber = userData?.mobile || userData?.phoneNumber || "";
    global.__userBusinessNumber = userBusinessNumber;

    if (callDetector) stopCallMonitoring();

    console.log(`🚀 Call Monitoring Service Started (Line: ${userBusinessNumber || 'Default'})`);

    // Debug: Ping server that monitor is alive on this device
    axios.post(`${API_URL}/calllogs/debug`, {
        device: Platform.OS,
        message: "Call Monitor Started",
        timestamp: new Date()
    }).catch(() => { });

    // Silenced monitor active toast

    if (!isCallDetectorAvailable) {
        console.log('Call Monitoring: CallDetector native module not available; using device log sync only');
    } else {
        callDetector = new CallDetectorManager(
        async (event) => {
            const ev = String(event || "").trim().toLowerCase();
            let cleanNum = currentNumber;

            // This detector package emits call state but not the phone number.
            // Pull the latest number from device call logs when possible.
            if (!cleanNum) {
                cleanNum = await getFallbackNumberFromDeviceLog();
            }
            if (cleanNum) currentNumber = cleanNum;

            console.log(`[CallMonitor] EVENT: ${event} | NUM: ${cleanNum || 'Unknown'}`);

            const lookupEnquiryIfNeeded = async () => {
                if (!cleanNum) return;
                const now = Date.now();
                if (lastIncomingLookup.num === cleanNum && now - lastIncomingLookup.ts < 10000) return;
                lastIncomingLookup = { num: cleanNum, ts: now };
                try {
                    const res = await callLogService.identifyCaller(cleanNum);
                    if (res?.found && res?.details) {
                        emitAppEvent(APP_EVENTS.INCOMING_CRM_MATCH, {
                            phoneNumber: cleanNum,
                            details: res.details,
                            at: new Date().toISOString(),
                        });
                    }
                } catch (_e) {
                    // ignore lookup errors
                }
            };

            switch (ev) {
                case 'incoming':
                case 'ringing':
                    currentCallType = "Incoming";
                    callStartTime = null; // Reset
                    dialStartTime = null;
                    lookupEnquiryIfNeeded();
                    break;
                case 'dialing':
                    currentCallType = "Outgoing";
                    callStartTime = null;
                    dialStartTime = Date.now();
                    if (cleanNum) currentNumber = cleanNum;
                    break;
                case 'connected':
                    // Some Android builds do not emit "Incoming" but do emit "Connected" for answered incoming calls.
                    if (!dialStartTime && currentCallType !== "Incoming") {
                        currentCallType = "Incoming";
                        lookupEnquiryIfNeeded();
                    }
                    if (!callStartTime) {
                        callStartTime = Date.now();
                        console.log(`[CallMonitor] Conversation Started: ${new Date(callStartTime).toLocaleTimeString()}`);
                    }
                    break;
                case 'offhook':
                    // Offhook happens when user picks up (Incoming) or when dialer opens (Outgoing)
                    if (!callStartTime) {
                        // Heuristic: if we never saw "Dialing", treat Offhook as incoming answer.
                        if (!dialStartTime) {
                            currentCallType = "Incoming";
                            lookupEnquiryIfNeeded();
                        }

                        if (currentCallType === "Incoming") {
                            callStartTime = Date.now();
                            console.log(`[CallMonitor] Incoming Call Answered: ${new Date(callStartTime).toLocaleTimeString()}`);
                        } else if (currentCallType === "Outgoing" && !dialStartTime) {
                            dialStartTime = Date.now();
                        }
                    }
                    break;
                case 'missed':
                    currentCallType = "Incoming";
                    handleCallEnd(cleanNum || currentNumber);
                    break;
                case 'disconnected':
                    handleCallEnd(cleanNum || currentNumber);
                    break;
            }
        },
        true,
    );
    }

    if (deviceSyncIntervalId) {
        clearInterval(deviceSyncIntervalId);
        deviceSyncIntervalId = null;
    }

    // Fallback sync: pull device call logs periodically (covers missed incoming events).
    // Server dedupes by device log `id` and ignores numbers not in Enquiry DB.
    syncDeviceLogsIfPossible({ force: true }).catch(() => { });
    deviceSyncIntervalId = setInterval(() => {
        syncDeviceLogsIfPossible().catch(() => { });
    }, 60000);
};

let isProcessing = false;

const getFallbackNumberFromDeviceLog = async () => {
    if (Platform.OS !== 'android') return null;
    if (isPlayStoreSafeMode()) return null;
    if (isExpoGo()) return null;
    try {
        const mod = require('react-native-call-log');
        const CallLog = mod?.default || mod;
        if (!CallLog?.load) return null;

        const recent = await CallLog.load(8, {
            minTimestamp: Date.now() - 5 * 60 * 1000,
        });
        if (!Array.isArray(recent) || recent.length === 0) return null;

        for (const entry of recent) {
            const raw =
                entry?.phoneNumber ||
                entry?.number ||
                entry?.formattedNumber ||
                "";
            const digits = String(raw).replace(/\D/g, "");
            if (digits) return digits;
        }
        return null;
    } catch (_error) {
        if (!hasWarnedUnavailableCallLog) {
            console.log(
                "[CallMonitor] react-native-call-log unavailable; skipping fallback number lookup",
            );
            hasWarnedUnavailableCallLog = true;
        }
        return null;
    }
};

const handleCallEnd = async (phoneNumber) => {
    if (isProcessing) return;

    let finalNumber = phoneNumber || currentNumber;
    if (!finalNumber) {
        finalNumber = await getFallbackNumberFromDeviceLog();
    }
    if (!finalNumber) {
        console.log('⚠️ [CallMonitor] Skipped: No phone number captured');
        return;
    }

    isProcessing = true;
    const endTime = Date.now();

    // Duration Logic
    let duration = 0;
    let wasConnected = false;

    if (callStartTime) {
        duration = Math.floor((endTime - callStartTime) / 1000);
        wasConnected = true;
    } else if (currentCallType === "Outgoing" && dialStartTime) {
        // Fallback: If device never sent 'Connected', estimate from dial time but subtract 5s for ringing
        const totalTime = Math.floor((endTime - dialStartTime) / 1000);
        duration = Math.max(0, totalTime - 5);
        wasConnected = duration > 0;
    }

    // Determine the type correctly
    let finalCallType = "Outgoing";
    let statusNote = "";

    if (currentCallType === "Incoming") {
        if (wasConnected && duration > 0) {
            finalCallType = "Incoming";
            statusNote = `Incoming: Answered conversation lasted ${duration}s`;
        } else {
            finalCallType = "Missed";
            statusNote = "Missed: Incoming call not answered";
        }
    } else {
        // Outgoing Logic
        if (wasConnected && duration > 0) {
            finalCallType = "Outgoing";
            statusNote = `Outgoing: Connected conversation lasted ${duration}s`;
        } else {
            finalCallType = "Not Attended";
            statusNote = "Outgoing: Not Attended (Ringing only)";
        }
    }

    console.log(`📊 [CallMonitor] CALL_ENDED: ${finalNumber} | Type: ${finalCallType} | Dur: ${duration}s`);

    // Emit CALL_ENDED event with all detected data.
    // If an enquiry screen is listening (user initiated the call from UI),
    // it will handle the modal. Otherwise, we auto-log it.
    // Wait for Android to write the call log entry before reading it.
    // Without this delay, getLatestDeviceCallLogForNumber returns null because
    // the OS hasn't flushed the record yet, causing every call to be mis-logged.
    await new Promise((r) => setTimeout(r, 2000));

    let deviceInfo = null;
    try {
        const since =
            callStartTime ||
            dialStartTime ||
            Math.max(0, Date.now() - 12 * 60 * 1000);
        deviceInfo = await getLatestDeviceCallLogForNumber({
            phoneNumber: finalNumber,
            sinceMs: since,
            limit: 15,
        });
    } catch (_e) {
        deviceInfo = null;
    }

    const callEndData = {
        phoneNumber: finalNumber,
        callType: deviceInfo?.callType || finalCallType,
        duration: Number.isFinite(Number(deviceInfo?.duration))
            ? Number(deviceInfo.duration)
            : duration,
        note: statusNote,
        callTime: deviceInfo?.callTime || new Date(),
        deviceCallId: deviceInfo?.deviceCallId || null,
    };

    // Emit the event — screens listening will set a flag
    emitAppEvent(APP_EVENTS.CALL_ENDED, callEndData);

    // Give screens a moment to claim the call (50ms is enough for JS event loop)
    setTimeout(async () => {
        // Check if any screen claimed this call (they set __callClaimed on the event data)
        // We use a global flag that screens set when they handle the CALL_ENDED event
        if (global.__callClaimedByScreen) {
            console.log('✅ [CallMonitor] Call claimed by screen, skipping auto-log');
            global.__callClaimedByScreen = false;
        } else {
            // No screen was listening — auto-log this call (background/incoming calls)
            console.log('📝 [CallMonitor] No screen claimed call, auto-logging...');
            const callData = {
                ...callEndData,
                businessNumber: global.__userBusinessNumber || Constants.expoConfig?.extra?.businessNumber || "",
            };
            try {
                const savedLog = await callLogService.createCallLog(callData);
                if (savedLog?.ignored || !savedLog?._id) {
                    console.log('[CallMonitor] Ignored non-enquiry call log');
                } else {
                    console.log('[CallMonitor] Auto-Log Saved:', savedLog._id);
                    // callLogService.createCallLog() already emits CALL_LOG_CREATED + invalidates caches
                }
            } catch (error) {
                console.error('❌ [CallMonitor] Auto-Log Failed:', error.message);
            }
        }

        try {
            await syncDeviceLogsIfPossible({ force: true });
        } catch (_syncError) {
            // keep manual log result even if device sync fails
        }

        // Reset everything
        callStartTime = null;
        dialStartTime = null;
        currentNumber = null;
        currentCallType = "Unknown";
        lastIncomingLookup = { num: null, ts: 0 };
        // Delay resetting isProcessing to allow device states to settle
        setTimeout(() => { isProcessing = false; }, 2000);
    }, 100);
};

export const stopCallMonitoring = () => {
    if (callDetector) {
        callDetector.dispose();
        callDetector = null;
    }
    if (deviceSyncIntervalId) {
        clearInterval(deviceSyncIntervalId);
        deviceSyncIntervalId = null;
    }
    callStartTime = null;
    dialStartTime = null;
    currentNumber = null;
    currentCallType = "Unknown";
    lastIncomingLookup = { num: null, ts: 0 };
    isProcessing = false;
    console.log('🛑 Call Monitoring Service Stopped');
};

