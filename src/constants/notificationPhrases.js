const normalizeActivityKey = (activityType) => {
    const raw = String(activityType || "")
        .trim()
        .toLowerCase();
    if (raw === "phone call" || raw === "call" || raw === "phone")
        return "phone";
    if (raw === "whatsapp" || raw === "wa") return "whatsapp";
    if (raw === "email" || raw === "mail") return "email";
    if (raw === "meeting" || raw === "online meeting") return "meeting";
    return "followup";
};

const formatFollowUpNotificationPrefix = ({ lang, actorName, name }) => {
    const customer = String(
        name || (lang === "ta" ? "வாடிக்கையாளர்" : "Client"),
    ).trim();
    const actor = String(actorName || "").trim();
    if (!actor || actor === customer) return customer;
    return `${actor} • ${customer}`;
};

const minutesLabel = (lang, minutes) => {
    const mins = Math.max(1, Math.round(Number(minutes || 0)));
    if (lang === "ta") return mins === 1 ? "1 நிமிடம்" : `${mins} நிமிடங்கள்`;
    return mins === 1 ? "1 minute" : `${mins} minutes`;
};

const minutesInLabel = (lang, minutes) => {
    const mins = Math.max(1, Math.round(Number(minutes || 0)));
    if (lang === "ta")
        return mins === 1 ? "1 நிமிடத்தில்" : `${mins} நிமிடங்களில்`;
    return mins === 1 ? "in 1 minute" : `in ${mins} minutes`;
};

const soonTitle = (lang, activityKey, minutes) => {
    const mins = Math.max(1, Math.round(Number(minutes || 0)));
    if (lang === "ta") {
        const minTxt = mins === 1 ? "1 நிமிடம்" : `${mins} நிமிடம்`;
        if (activityKey === "phone") return `அழைப்பு (${minTxt})`;
        if (activityKey === "whatsapp") return `வாட்ஸ்அப் (${minTxt})`;
        if (activityKey === "email") return `மின்னஞ்சல் (${minTxt})`;
        if (activityKey === "meeting") return `சந்திப்பு (${minTxt})`;
        return `பின்தொடர்பு (${minTxt})`;
    }

    const minTxt = mins === 1 ? "1 minute" : `${mins} minutes`;
    if (activityKey === "phone") return `Call in ${minTxt}`;
    if (activityKey === "whatsapp") return `WhatsApp in ${minTxt}`;
    if (activityKey === "email") return `Email in ${minTxt}`;
    if (activityKey === "meeting") return `Meeting in ${minTxt}`;
    return `Follow-up in ${minTxt}`;
};

const dueTitle = (lang, activityKey) => {
    if (lang === "ta") {
        if (activityKey === "phone") return "அழைப்பு நினைவூட்டு";
        if (activityKey === "whatsapp") return "வாட்ஸ்அப் நினைவூட்டு";
        if (activityKey === "email") return "மின்னஞ்சல் நினைவூட்டு";
        if (activityKey === "meeting") return "சந்திப்பு நினைவூட்டு";
        return "பின்தொடர்பு நினைவூட்டு";
    }

    if (activityKey === "meeting") return "Meeting reminder";
    if (activityKey === "email") return "Email follow-up";
    if (activityKey === "whatsapp") return "WhatsApp follow-up";
    if (activityKey === "phone") return "Call reminder";
    return "Follow-up reminder";
};

const missedTitle = (lang) =>
    lang === "ta"
        ? "நீங்கள் இதை தவறவிட்டிருக்கலாம்"
        : "You might have missed this";

const soonBody = ({ lang, name, actorName, activityType, minutesLeft }) => {
    const mins = Math.max(1, Math.round(Number(minutesLeft || 0)));
    const minLbl = minutesLabel(lang, mins);
    const waitingHint =
        mins <= 3
            ? lang === "ta"
                ? "உங்கள் வாடிக்கையாளர் காத்திருக்கிறார்."
                : "Your customer is waiting."
            : "";
    const activity = String(
        activityType || (lang === "ta" ? "பின்தொடர்பு" : "Follow-up"),
    ).trim();
    const prefix = formatFollowUpNotificationPrefix({
        lang,
        actorName,
        name,
    });
    const base =
        lang === "ta"
            ? `${prefix} • ${activity} இன்னும் ${minLbl} உள்ளது.`
            : `${prefix} • ${activity} in ${minLbl}.`;
    return waitingHint ? `${base} ${waitingHint}` : base;
};

const dueBody = ({ lang, name, actorName, activityType, timeLabel }) => {
    const activityKey = normalizeActivityKey(activityType);
    const prefix = formatFollowUpNotificationPrefix({
        lang,
        actorName,
        name,
    });
    const timeBit = timeLabel ? `${timeLabel}. ` : "";

    if (lang === "ta") {
        if (activityKey === "phone")
            return `${prefix} • ${timeBit}வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.`;
        if (activityKey === "whatsapp")
            return `${prefix} • ${timeBit}இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம். தயவு செய்து செய்தி அனுப்பவும்.`;
        if (activityKey === "email")
            return `${prefix} • ${timeBit}இப்போது மின்னஞ்சல் பின்தொடர்பு நேரம். தயவு செய்து மின்னஞ்சல் அனுப்பவும்.`;
        if (activityKey === "meeting")
            return `${prefix} • ${timeBit}இப்போது ஆன்லைன் சந்திப்பு நேரம். தயவு செய்து இணைக.`;
        return `${prefix} • ${timeBit}இப்போது பின்தொடர்பு நேரம். தயவு செய்து தொடரவும்.`;
    }

    if (activityKey === "phone")
        return `${prefix} • ${timeBit}Your customer is waiting. Please call ${name} now.`;
    if (activityKey === "whatsapp")
        return `${prefix} • ${timeBit}WhatsApp follow-up due now. Please send the message.`;
    if (activityKey === "email")
        return `${prefix} • ${timeBit}Email follow-up due now. Please send the email.`;
    if (activityKey === "meeting")
        return `${prefix} • ${timeBit}Meeting due now. Please connect.`;
    return `${prefix} • ${timeBit}${String(activityType || "Follow-up").trim()} due now.`;
};

const missedBody = ({ lang, name, actorName, activityType, timeLabel }) => {
    const activityKey = normalizeActivityKey(activityType);
    const prefix = formatFollowUpNotificationPrefix({
        lang,
        actorName,
        name,
    });
    const timeBit = timeLabel ? ` ${timeLabel}` : "";

    if (lang === "ta") {
        if (activityKey === "phone")
            return `${prefix} • ${String(activityType || "அழைப்பு").trim()}${timeBit}. நீங்கள் அழைப்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.`;
        if (activityKey === "whatsapp")
            return `${prefix} • வாட்ஸ்அப்${timeBit}. நீங்கள் வாட்ஸ்அப் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது செய்தி அனுப்பவும்.`;
        if (activityKey === "email")
            return `${prefix} • மின்னஞ்சல்${timeBit}. நீங்கள் மின்னஞ்சல் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது மின்னஞ்சல் அனுப்பவும்.`;
        if (activityKey === "meeting")
            return `${prefix} • சந்திப்பு${timeBit}. நீங்கள் ஆன்லைன் சந்திப்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது இணைக.`;
        return `${prefix} • பின்தொடர்பு${timeBit}. நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது தொடரவும்.`;
    }

    const activity = String(activityType || "Follow-up").trim();
    if (activityKey === "phone")
        return `${prefix} • ${activity}${timeBit}. You might have missed this. Your customer is waiting. Please call ${name} now.`;
    if (activityKey === "whatsapp")
        return `${prefix} • ${activity}${timeBit}. You might have missed this. Please send WhatsApp now.`;
    if (activityKey === "email")
        return `${prefix} • ${activity}${timeBit}. You might have missed this. Please send the email now.`;
    if (activityKey === "meeting")
        return `${prefix} • ${activity}${timeBit}. You might have missed this. Please confirm and connect now.`;
    return `${prefix} • ${activity}${timeBit}. You might have missed this. Please follow up now.`;
};

const buildNotificationTitle = (title, actorName) => {
    const actor = String(actorName || "").trim();
    return actor ? `${actor} • ${title}` : title;
};

export const getFollowUpSoonTexts = ({
    lang = "en",
    name,
    actorName,
    activityType,
    minutesLeft,
}) => {
    const key = normalizeActivityKey(activityType);
    const who =
        String(name || "").trim() ||
        (lang === "ta" ? "வாடிக்கையாளர்" : "your client");
    return {
        title: buildNotificationTitle(
            soonTitle(lang, key, minutesLeft),
            actorName,
        ),
        body: soonBody({ lang, name, actorName, activityType, minutesLeft }),
        voice:
            key === "phone"
                ? lang === "ta"
                    ? `உங்கள் வாடிக்கையாளர் காத்திருக்கிறார். ${minutesInLabel(lang, minutesLeft)} அழைக்கவும்.`
                    : `Your customer is waiting. Call ${who} ${minutesInLabel(lang, minutesLeft)}.`
                : lang === "ta"
                  ? `${String(activityType || "பின்தொடர்பு").trim()} ${minutesInLabel(lang, minutesLeft)}. தயார் நிலையில் இருங்கள்.`
                  : `${String(activityType || "Follow-up").trim()} ${minutesInLabel(lang, minutesLeft)}. Please be ready.`,
    };
};

export const getFollowUpDueTexts = ({
    lang = "en",
    name,
    actorName,
    activityType,
    timeLabel = "",
}) => {
    const key = normalizeActivityKey(activityType);
    // Ensure name is a string
    const who =
        String(name || "").trim() ||
        (lang === "ta" ? "வாடிக்கையாளர்" : "your client");
    return {
        title: buildNotificationTitle(dueTitle(lang, key), actorName),
        body: dueBody({ lang, name: who, actorName, activityType, timeLabel }),
        voice:
            lang === "ta"
                ? key === "phone"
                    ? "வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்."
                    : key === "whatsapp"
                      ? "இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம். தயவு செய்து செய்தி அனுப்பவும்."
                      : key === "email"
                        ? "இப்போது மின்னஞ்சல் பின்தொடர்பு நேரம். தயவு செய்து மின்னஞ்சல் அனுப்பவும்."
                        : key === "meeting"
                          ? "இப்போது ஆன்லைன் சந்திப்பு நேரம். தயவு செய்து இணைக."
                          : "இப்போது பின்தொடர்பு நேரம். தயவு செய்து தொடரவும்."
                : key === "phone"
                  ? `Your customer is waiting. Please call ${who} now.`
                  : `${String(activityType || "Follow-up").trim()} due now.`,
    };
};

export const getFollowUpMissedTexts = ({
    lang = "en",
    name,
    actorName,
    activityType,
    timeLabel = "",
}) => {
    const key = normalizeActivityKey(activityType);
    // Ensure name is a string
    const who =
        String(name || "").trim() ||
        (lang === "ta" ? "வாடிக்கையாளர்" : "your client");
    return {
        title: buildNotificationTitle(missedTitle(lang), actorName),
        body: missedBody({
            lang,
            name: who,
            actorName,
            activityType,
            timeLabel,
        }),
        voice:
            lang === "ta"
                ? key === "phone"
                    ? "நீங்கள் அழைப்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்."
                    : key === "whatsapp"
                      ? "நீங்கள் வாட்ஸ்அப் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது செய்தி அனுப்பவும்."
                      : key === "email"
                        ? "நீங்கள் மின்னஞ்சல் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது மின்னஞ்சல் அனுப்பவும்."
                        : key === "meeting"
                          ? "நீங்கள் ஆன்லைன் சந்திப்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது இணைக."
                          : "நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது தொடரவும்."
                : key === "phone"
                  ? `You might have missed this. Your customer is waiting. Please call ${who} now.`
                  : "You might have missed this. Please follow up now.",
    };
};

// Assignment notification texts
const assignmentTitle = (lang, staffName) => {
    if (lang === "ta") return `புதிய விசாரணை ஒதுக்கப்பட்டது`;
    return `New Enquiry Assigned`;
};

const assignmentBody = ({ lang, staffName, enquiryNo, enquiryName }) => {
    const enqNo = String(enquiryNo || "").trim();
    const enqName = String(enquiryName || "").trim();
    if (lang === "ta") {
        return `${staffName} • விசாரணை ${enqNo} (${enqName}) உங்களுக்கு ஒதுக்கப்பட்டது. தயவு செய்து கவனியுங்கள்.`;
    }
    return `${staffName} • Enquiry ${enqNo} (${enqName}) has been assigned to you. Please attend to it.`;
};

const followupAssignmentTitle = (lang, adminName) => {
    if (lang === "ta") return `பின்தொடர்பு ஒதுக்கப்பட்டது`;
    return `Follow-up Assigned`;
};

const followupAssignmentBody = ({
    lang,
    adminName,
    enquiryNo,
    enquiryName,
    activityType,
}) => {
    const enqNo = String(enquiryNo || "").trim();
    const enqName = String(enquiryName || "").trim();
    const activity = String(activityType || "").trim();
    if (lang === "ta") {
        return `${adminName} • விசாரணை ${enqNo} (${enqName}) பின்தொடர்பு (${activity}) உங்களுக்கு ஒதுக்கப்பட்டது.`;
    }
    return `${adminName} • Follow-up for enquiry ${enqNo} (${enqName}) ${activity ? `(${activity})` : ""} has been assigned to you.`;
};

export const getEnquiryAssignmentTexts = ({
    lang = "en",
    staffName,
    enquiryNo,
    enquiryName,
}) => {
    return {
        title: assignmentTitle(lang, staffName),
        body: assignmentBody({ lang, staffName, enquiryNo, enquiryName }),
        voice:
            lang === "ta"
                ? `புதிய விசாரணை ${String(enquiryNo || "").trim()} உங்களுக்கு ஒதுக்கப்பட்டது. தயவு செய்து கவனியுங்கள்.`
                : `New enquiry ${String(enquiryNo || "").trim()} has been assigned to you.`,
    };
};

export const getFollowUpAssignmentTexts = ({
    lang = "en",
    adminName,
    enquiryNo,
    enquiryName,
    activityType,
}) => {
    adminName = adminName || "Admin";
    return {
        title: followupAssignmentTitle(lang, adminName),
        body: followupAssignmentBody({
            lang,
            adminName,
            enquiryNo,
            enquiryName,
            activityType,
        }),
        voice:
            lang === "ta"
                ? `பின்தொடர்பு விசாரணை ${String(enquiryNo || "").trim()} உங்களுக்கு ஒதுக்கப்பட்டது.`
                : `Follow-up for enquiry ${String(enquiryNo || "").trim()} has been assigned to you.`,
    };
};

// Follow-up creation notification texts
const followupCreationTitle = (lang, staffName) => {
    if (lang === "ta") return `புதிய பின்தொடர்பு உருவாக்கப்பட்டது`;
    return `New Follow-up Created`;
};

const followupCreationBody = ({
    lang,
    adminName,
    staffName,
    enquiryNo,
    enquiryName,
    activityType,
}) => {
    const enqNo = String(enquiryNo || "").trim();
    const enqName = String(enquiryName || "").trim();
    const activity = String(activityType || "").trim();
    if (lang === "ta") {
        return `${adminName} • ${staffName} விசாரணை ${enqNo} (${enqName}) பின்தொடர்பு (${activity}) உருவாக்கினார்.`;
    }
    return `${adminName} • ${staffName} created a follow-up for enquiry ${enqNo} (${enqName}) ${activity ? `(${activity})` : ""}.`;
};

export const getFollowUpCreationTexts = ({
    lang = "en",
    adminName,
    staffName,
    enquiryNo,
    enquiryName,
    activityType,
}) => {
    // Ensure all names are strings
    adminName = String(adminName || "Admin").trim() || "Admin";
    staffName = String(staffName || "Staff").trim() || "Staff";
    return {
        title: followupCreationTitle(lang, staffName),
        body: followupCreationBody({
            lang,
            adminName,
            staffName,
            enquiryNo,
            enquiryName,
            activityType,
        }),
        voice:
            lang === "ta"
                ? `புதிய பின்தொடர்பு விசாரணை ${String(enquiryNo || "").trim()} உருவாக்கப்பட்டது.`
                : `New follow-up for enquiry ${String(enquiryNo || "").trim()} has been created.`,
    };
};
