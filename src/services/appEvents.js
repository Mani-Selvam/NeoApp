import { DeviceEventEmitter } from "react-native";

export const APP_EVENTS = Object.freeze({
    ENQUIRY_CREATED: "ENQUIRY_CREATED",
    ENQUIRY_UPDATED: "ENQUIRY_UPDATED",
    FOLLOWUP_CHANGED: "FOLLOWUP_CHANGED",
    CALL_LOG_CREATED: "CALL_LOG_CREATED",
    CALL_ENDED: "CALL_ENDED",
    INCOMING_CRM_MATCH: "INCOMING_CRM_MATCH",
    COUPON_SYNC: "COUPON_SYNC",
    COUPON_ANNOUNCEMENT: "COUPON_ANNOUNCEMENT",
});

export const emitAppEvent = (eventName, payload) => {
    DeviceEventEmitter.emit(eventName, payload);
};

export const onAppEvent = (eventName, handler) => {
    const sub = DeviceEventEmitter.addListener(eventName, handler);
    return () => sub.remove();
};

export const emitEnquiryCreated = (payload) =>
    emitAppEvent(APP_EVENTS.ENQUIRY_CREATED, payload);
export const emitEnquiryUpdated = (payload) =>
    emitAppEvent(APP_EVENTS.ENQUIRY_UPDATED, payload);
export const emitFollowupChanged = (payload) =>
    emitAppEvent(APP_EVENTS.FOLLOWUP_CHANGED, payload);
export const emitCallLogCreated = (payload) =>
    emitAppEvent(APP_EVENTS.CALL_LOG_CREATED, payload);
