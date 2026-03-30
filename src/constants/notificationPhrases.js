const normalizeActivityKey = (activityType) => {
  const raw = String(activityType || "").trim().toLowerCase();
  if (raw === "phone call" || raw === "call" || raw === "phone") return "phone";
  if (raw === "whatsapp" || raw === "wa") return "whatsapp";
  if (raw === "email" || raw === "mail") return "email";
  if (raw === "meeting" || raw === "online meeting") return "meeting";
  return "followup";
};

const minutesLabel = (lang, minutes) => {
  const mins = Math.max(1, Math.round(Number(minutes || 0)));
  if (lang === "ta") return mins === 1 ? "1 நிமிடம்" : `${mins} நிமிடங்கள்`;
  return mins === 1 ? "1 minute" : `${mins} minutes`;
};

const minutesInLabel = (lang, minutes) => {
  const mins = Math.max(1, Math.round(Number(minutes || 0)));
  if (lang === "ta") return mins === 1 ? "1 நிமிடத்தில்" : `${mins} நிமிடங்களில்`;
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
  lang === "ta" ? "நீங்கள் இதை தவறவிட்டிருக்கலாம்" : "You might have missed this";

const soonBody = ({ lang, name, activityType, minutesLeft }) => {
  const mins = Math.max(1, Math.round(Number(minutesLeft || 0)));
  const minLbl = minutesLabel(lang, mins);
  const waitingHint =
    mins <= 3
      ? lang === "ta"
        ? "உங்கள் வாடிக்கையாளர் காத்திருக்கிறார்."
        : "Your customer is waiting."
      : "";
  const activity = String(activityType || (lang === "ta" ? "பின்தொடர்பு" : "Follow-up")).trim();
  const who = String(name || (lang === "ta" ? "வாடிக்கையாளர்" : "Client")).trim();
  const base =
    lang === "ta"
      ? `${who} • ${activity} இன்னும் ${minLbl} உள்ளது.`
      : `${who} • ${activity} in ${minLbl}.`;
  return waitingHint ? `${base} ${waitingHint}` : base;
};

const dueBody = ({ lang, name, activityType, timeLabel }) => {
  const activityKey = normalizeActivityKey(activityType);
  const who = String(name || (lang === "ta" ? "வாடிக்கையாளர்" : "Client")).trim();
  const timeBit = timeLabel ? `${timeLabel}. ` : "";

  if (lang === "ta") {
    if (activityKey === "phone")
      return `${who} • ${timeBit}வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.`;
    if (activityKey === "whatsapp")
      return `${who} • ${timeBit}இப்போது வாட்ஸ்அப் பின்தொடர்பு நேரம். தயவு செய்து செய்தி அனுப்பவும்.`;
    if (activityKey === "email")
      return `${who} • ${timeBit}இப்போது மின்னஞ்சல் பின்தொடர்பு நேரம். தயவு செய்து மின்னஞ்சல் அனுப்பவும்.`;
    if (activityKey === "meeting")
      return `${who} • ${timeBit}இப்போது ஆன்லைன் சந்திப்பு நேரம். தயவு செய்து இணைக.`;
    return `${who} • ${timeBit}இப்போது பின்தொடர்பு நேரம். தயவு செய்து தொடரவும்.`;
  }

  if (activityKey === "phone")
    return `${who} • ${timeBit}Your customer is waiting. Please call ${who} now.`;
  if (activityKey === "whatsapp")
    return `${who} • ${timeBit}WhatsApp follow-up due now. Please send the message.`;
  if (activityKey === "email")
    return `${who} • ${timeBit}Email follow-up due now. Please send the email.`;
  if (activityKey === "meeting") return `${who} • ${timeBit}Meeting due now. Please connect.`;
  return `${who} • ${timeBit}${String(activityType || "Follow-up").trim()} due now.`;
};

const missedBody = ({ lang, name, activityType, timeLabel }) => {
  const activityKey = normalizeActivityKey(activityType);
  const who = String(name || (lang === "ta" ? "வாடிக்கையாளர்" : "Client")).trim();
  const timeBit = timeLabel ? ` ${timeLabel}` : "";

  if (lang === "ta") {
    if (activityKey === "phone")
      return `${who} • ${String(activityType || "அழைப்பு").trim()}${timeBit}. நீங்கள் அழைப்பை தவறவிட்டீர்கள். வாடிக்கையாளர் காத்திருக்கிறார். தயவு செய்து இப்போது அழைக்கவும்.`;
    if (activityKey === "whatsapp")
      return `${who} • வாட்ஸ்அப்${timeBit}. நீங்கள் வாட்ஸ்அப் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது செய்தி அனுப்பவும்.`;
    if (activityKey === "email")
      return `${who} • மின்னஞ்சல்${timeBit}. நீங்கள் மின்னஞ்சல் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது மின்னஞ்சல் அனுப்பவும்.`;
    if (activityKey === "meeting")
      return `${who} • சந்திப்பு${timeBit}. நீங்கள் ஆன்லைன் சந்திப்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது இணைக.`;
    return `${who} • பின்தொடர்பு${timeBit}. நீங்கள் பின்தொடர்பை தவறவிட்டீர்கள். தயவு செய்து இப்போது தொடரவும்.`;
  }

  const activity = String(activityType || "Follow-up").trim();
  if (activityKey === "phone")
    return `${who} • ${activity}${timeBit}. You might have missed this. Your customer is waiting. Please call ${who} now.`;
  if (activityKey === "whatsapp")
    return `${who} • ${activity}${timeBit}. You might have missed this. Please send WhatsApp now.`;
  if (activityKey === "email")
    return `${who} • ${activity}${timeBit}. You might have missed this. Please send the email now.`;
  if (activityKey === "meeting")
    return `${who} • ${activity}${timeBit}. You might have missed this. Please confirm and connect now.`;
  return `${who} • ${activity}${timeBit}. You might have missed this. Please follow up now.`;
};

export const getFollowUpSoonTexts = ({ lang = "en", name, activityType, minutesLeft }) => {
  const key = normalizeActivityKey(activityType);
  const who = String(name || "").trim() || (lang === "ta" ? "வாடிக்கையாளர்" : "your client");
  return {
    title: soonTitle(lang, key, minutesLeft),
    body: soonBody({ lang, name, activityType, minutesLeft }),
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

export const getFollowUpDueTexts = ({ lang = "en", name, activityType, timeLabel = "" }) => {
  const key = normalizeActivityKey(activityType);
  const who = String(name || "").trim() || (lang === "ta" ? "வாடிக்கையாளர்" : "your client");
  return {
    title: dueTitle(lang, key),
    body: dueBody({ lang, name, activityType, timeLabel }),
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

export const getFollowUpMissedTexts = ({ lang = "en", name, activityType, timeLabel = "" }) => {
  const key = normalizeActivityKey(activityType);
  const who = String(name || "").trim() || (lang === "ta" ? "வாடிக்கையாளர்" : "your client");
  return {
    title: missedTitle(lang),
    body: missedBody({ lang, name, activityType, timeLabel }),
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

