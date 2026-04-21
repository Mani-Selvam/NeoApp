import { DeviceEventEmitter } from "react-native";

export const APP_EVENTS = Object.freeze({
    ENQUIRY_CREATED: "ENQUIRY_CREATED",
    ENQUIRY_UPDATED: "ENQUIRY_UPDATED",
    FOLLOWUP_CHANGED: "FOLLOWUP_CHANGED",
    CALL_ENDED: "CALL_ENDED",
    INCOMING_CRM_MATCH: "INCOMING_CRM_MATCH",
    COUPON_SYNC: "COUPON_SYNC",
    COUPON_ANNOUNCEMENT: "COUPON_ANNOUNCEMENT",
    INTRO_FINISHED: "INTRO_FINISHED",
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
