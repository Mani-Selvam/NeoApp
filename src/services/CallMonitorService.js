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
        isCallDetectorAvailable = !!NativeModules.CallDetectorManager && !!CallDetectorManager;
    } catch (e) {
        console.log('CallDetector library not found or native module missing:', e.message);
        isCallDetectorAvailable = false;
    }
}

let callDetector = null;
let callStartTime = null;
let dialStartTime = null; // Track when we start dialing
let currentNumber = null;
let currentCallType = "Outgoing";

const requestPermissions = async () => {
    if (Platform.OS === 'android') {
        try {
            const permissions = [
                PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
                PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
                PermissionsAndroid.PERMISSIONS.PROCESS_OUTGOING_CALLS,
                PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
                PermissionsAndroid.PERMISSIONS.CALL_PHONE
            ];
            const granted = await PermissionsAndroid.requestMultiple(permissions);
            console.log('Call Logger Permissions:', granted);
            return Object.values(granted).every(status => status === PermissionsAndroid.RESULTS.GRANTED);
        } catch (err) {
            console.warn(err);
            return false;
        }
    }
    return true;
};

// Check if RNImmediatePhoneCall is actually available in the build
export const isImmediateCallAvailable = () => {
    try {
        const RNImmediatePhoneCall = require('react-native-immediate-phone-call').default;
        return !!RNImmediatePhoneCall;
    } catch (e) {
        return false;
    }
};

export const startCallMonitoring = async (userData = null) => {
    if (Platform.OS === 'web') {
        process.env.NODE_ENV !== 'production' && console.log('Call Monitoring: Not supported on Web');
        return;
    }

    if (!isCallDetectorAvailable) {
        console.log('Call Monitoring: Native module not available (Using Expo Go?)');
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

    callDetector = new CallDetectorManager(
        (event, phoneNumber) => {
            // Normalize incoming number (remove + and spaces)
            const cleanNum = phoneNumber ? phoneNumber.replace(/\D/g, "") : null;
            if (cleanNum) currentNumber = cleanNum;

            console.log(`[CallMonitor] EVENT: ${event} | NUM: ${cleanNum || 'Unknown'}`);

            switch (event) {
                case 'Incoming':
                    currentCallType = "Incoming";
                    callStartTime = null; // Reset
                    dialStartTime = null;
                    if (cleanNum) {
                        currentNumber = cleanNum;
                        callLogService.identifyCaller(cleanNum).catch(() => { });
                    }
                    break;
                case 'Dialing':
                    currentCallType = "Outgoing";
                    callStartTime = null;
                    dialStartTime = Date.now();
                    if (cleanNum) currentNumber = cleanNum;
                    break;
                case 'Connected':
                    if (!callStartTime) {
                        callStartTime = Date.now();
                        console.log(`[CallMonitor] Conversation Started: ${new Date(callStartTime).toLocaleTimeString()}`);
                    }
                    break;
                case 'Offhook':
                    // Offhook happens when user picks up (Incoming) or when dialer opens (Outgoing)
                    if (!callStartTime) {
                        if (currentCallType === "Incoming") {
                            callStartTime = Date.now();
                            console.log(`[CallMonitor] Incoming Call Answered: ${new Date(callStartTime).toLocaleTimeString()}`);
                        } else if (currentCallType === "Outgoing" && !dialStartTime) {
                            dialStartTime = Date.now();
                        }
                    }
                    break;
                case 'Missed':
                    currentCallType = "Incoming";
                    handleCallEnd(cleanNum || currentNumber);
                    break;
                case 'Disconnected':
                    handleCallEnd(cleanNum || currentNumber);
                    break;
            }
        },
        true, // readPhoneNumber
        () => { console.warn("Call Monitor: Permission Denied by User"); },
        {
            title: 'Phone State Permission',
            message: 'This app needs access to your phone state to log calls automatically.',
        }
    );
};

let isProcessing = false;

const handleCallEnd = async (phoneNumber) => {
    if (isProcessing) return;

    const finalNumber = phoneNumber || currentNumber;
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
                console.log('✅ [CallMonitor] Auto-Log Saved:', savedLog._id);
                DeviceEventEmitter.emit('CALL_LOG_CREATED', savedLog);
            } catch (error) {
                console.error('❌ [CallMonitor] Auto-Log Failed:', error.message);
            }
        }

        // Reset everything
        callStartTime = null;
        dialStartTime = null;
        currentNumber = null;
        currentCallType = "Outgoing";
        // Delay resetting isProcessing to allow device states to settle
        setTimeout(() => { isProcessing = false; }, 2000);
    }, 100);
};

export const stopCallMonitoring = () => {
    if (callDetector) {
        callDetector.dispose();
        callDetector = null;
        console.log('🛑 Call Monitoring Service Stopped');
    }
};
