import axios from 'axios';
import Constants from 'expo-constants';
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { API_URL } from './apiConfig';
import * as callLogService from './callLogService';

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

const syncDeviceLogsIfPossible = async ({ force = false } = {}) => {
    if (Platform.OS !== "android") return;
    if (isPlayStoreSafeMode()) return;
    if (isExpoGo()) return;

    const now = Date.now();
    if (!force && now - lastDeviceSyncTs < 45000) return;
    lastDeviceSyncTs = now;

    try {
        const mod = require("react-native-call-log");
        const CallLog = mod?.default || mod;
        if (!CallLog?.load) return;

        const logs = await CallLog.load(80, {
            minTimestamp: Date.now() - 6 * 60 * 60 * 1000,
        });
        if (!Array.isArray(logs) || logs.length === 0) return;

        const result = await callLogService.syncCallLogs(logs);
        const synced = Number(result?.synced || 0);
        if (synced > 0) {
            DeviceEventEmitter.emit("CALL_LOG_CREATED", { type: "BATCH_SYNC", synced });
        }
    } catch (_e) {
        // ignore sync errors (permissions / OEM restrictions)
    }
    if (deviceSyncIntervalId) {
        clearInterval(deviceSyncIntervalId);
        deviceSyncIntervalId = null;
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
        'neoapp-call-monitor',
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
                        DeviceEventEmitter.emit("INCOMING_CRM_MATCH", {
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
    const callEndData = {
        phoneNumber: finalNumber,
        callType: finalCallType,
        duration: duration,
        note: statusNote,
        callTime: new Date(),
    };

    // Emit the event — screens listening will set a flag
    DeviceEventEmitter.emit('CALL_ENDED', callEndData);

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
                    DeviceEventEmitter.emit('CALL_LOG_CREATED', savedLog);
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

