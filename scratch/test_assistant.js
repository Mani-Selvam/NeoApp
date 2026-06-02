const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const Enquiry = require("../server/models/Enquiry");
const FollowUp = require("../server/models/FollowUp");
const User = require("../server/models/User");
const CommunicationTask = require("../server/models/CommunicationTask");
const Company = require("../server/models/Company");
const LeadSource = require("../server/models/LeadSource");
const Target = require("../server/models/Target");
const MessageTemplate = require("../server/models/MessageTemplate");
const CommunicationMessage = require("../server/models/CommunicationMessage");

function handleLocalFallback(transcript, stats) {
    const t = transcript.toLowerCase();
    
    // Tamil indicators (including Tamil Unicode block + colloquial terms)
    const isTamil = /[\u0B80-\u0BFF]/.test(t) || t.includes("இன்று") || t.includes("இன்னைக்கு") || t.includes("தவறவிட்ட") || t.includes("மிஸ்") || t.includes("வணக்கம்") || t.includes("யாரு") || t.includes("டாஸ்க்") || t.includes("ஸ்டாஃப்") || t.includes("பிளான்") || t.includes("டார்கெட்") || t.includes("டெம்ப்ளேட்") || t.includes("சேட்") || t.includes("சோர்ஸ்") || t.includes("லீட்") || t.includes("லிஸ்ட்") || t.includes("யார்") || t.includes("பெயர்") || t.includes("காலை");

    // Intent: Morning / General Greeting
    if (t.includes("morning") || t.includes("காலை")) {
        return {
            spokenText: isTamil 
                ? "இனிய காலை வணக்கம்! இன்றைய நாள் தங்களுக்கு மிகச் சிறந்த நாளாக அமைய வாழ்த்துகிறேன்."
                : "Good morning! Wishing you a highly productive and successful day for your business.",
            intent: "GREETING",
            language: isTamil ? "ta" : "en"
        };
    }

    if (t.includes("hello") || t.includes("hi") || t.includes("hey") || t.includes("வணக்கம்")) {
        return {
            spokenText: isTamil 
                ? "வணக்கம்! நான் உங்கள் NeoGroww உதவி மென்பொருள். இன்று உங்களுக்கு எவ்வாறு உதவட்டும்?"
                : "Hello! I am your NeoGroww CRM Assistant. How can I help you today?",
            intent: "GREETING",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: How to create Enquiry
    if ((t.includes("enquiry") && (t.includes("create") || t.includes("add") || t.includes("new") || t.includes("how"))) || t.includes("கோரிக்கை") || t.includes("உருவாக்கு") || t.includes("லீட் போட") || t.includes("லீடு")) {
        return {
            spokenText: isTamil
                ? "புதிய கோரிக்கையை உருவாக்க, திரையின் மேலே உள்ள 'பிளஸ்' (+) அல்லது 'கோரிக்கை சேர்' பொத்தானை அழுத்தி, விவரங்களை நிரப்பி சேமிக்கவும்."
                : "To create an enquiry, tap the plus (+) or 'Add Enquiry' button on the dashboard/enquiries screen, fill in client info, and save.",
            intent: "HELP_ENQUIRY",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: How to schedule Follow-up
    if ((t.includes("followup") && (t.includes("make") || t.includes("schedule") || t.includes("create") || t.includes("how"))) || t.includes("ஃபாலோ அப்") || t.includes("ஃபாலோஅப்") || t.includes("தொடர்பு கொள்ள")) {
        return {
            spokenText: isTamil
                ? "ஃபாலோ-அப் செய்ய, ஏதேனும் ஒரு கோரிக்கையை திறந்து, 'பின்தொடர்தல் அட்டவணை' பொத்தானை அழுத்தி, தேதி மற்றும் நேரத்தைத் தேர்ந்தெடுத்து சேமிக்கவும்."
                : "To schedule a follow-up, open any enquiry, tap the 'Schedule Follow-up' button, pick the date and time, and click save.",
            intent: "HELP_FOLLOWUP",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Role access configs
    if (t.includes("access") || t.includes("permission") || t.includes("role") || t.includes("அணுகல்") || t.includes("ரோல்")) {
        return {
            spokenText: isTamil
                ? "இந்த மென்பொருள் முற்றிலும் பாதுகாப்பான வாசிப்பு உரிமை கொண்டது. நிர்வாகிகள் அனைத்து விவரங்களையும், பணியாளர்கள் தங்களுக்கு ஒதுக்கப்பட்ட விவரங்களை மட்டுமே பார்க்க முடியும்."
                : "The voice assistant operates strictly in secure read-only mode based on roles. Admins manage company settings while staff can see their assigned leads.",
            intent: "HELP_ACCESS",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Funny / Humor playful queries
    if (t.includes("love") || t.includes("joke") || t.includes("human") || t.includes("marry") || t.includes("காத") || t.includes("கதை") || t.includes("மனித") || t.includes("சிரி")) {
        return {
            spokenText: isTamil
                ? "நான் ஒரு செயற்கை நுண்ணறிவு மென்பொருள். எனது ஒரே காதல் உங்கள் வணிகத்தை உயர்த்துவதும், உங்கள் ஃபாலோ-அப்களை நினைவூட்டுவதும் மட்டுமே!"
                : "I am an AI, so my true love is helping you organize follow-ups and watching your business grow every single day!",
            intent: "FUNNY",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Casual Conversational Chat
    if (/\b(coffee|tea|drink)\b/.test(t) || t.includes("காபி") || t.includes("டீ") || t.includes("சாப்பி")) {
        return {
            spokenText: isTamil
                ? "நான் ஒரு மென்பொருள் என்பதால் காபி, டீ குடிக்க முடியாது. ஆனால் உங்கள் வணிகத் தரவுகள் மற்றும் மின்சார ஆற்றலில் நான் சுறுசுறுப்பாக இயங்குகிறேன்!"
                : "I don't drink coffee or tea since I am an AI, but I run on electric code and server database power!",
            intent: "FUNNY",
            language: isTamil ? "ta" : "en"
        };
    }

    if (t.includes("how are you") || t.includes("how're you") || t.includes("எப்படி இருக்கீ") || t.includes("நலமா")) {
        return {
            spokenText: isTamil
                ? "நான் மிகவும் நலமாக இருக்கிறேன், நன்றி! உங்கள் வணிகக் கோரிக்கைகள் மற்றும் ஃபாலோ-அப்களை நிர்வகிக்க நான் எப்போதும் தயாராக உள்ளேன்."
                : "I am doing fantastic, thank you! I'm fully charged and ready to organize your enquiries and follow-ups.",
            intent: "FUNNY",
            language: isTamil ? "ta" : "en"
        };
    }

    if (t.includes("who are you") || t.includes("your name") || t.includes("what's your name") || t.includes("நீ யார்") || t.includes("யார் நீ") || t.includes("உன் பெயர்")) {
        return {
            spokenText: isTamil
                ? "நான் உங்கள் நியோ குரல் உதவி மென்பொருள். உங்கள் லீட்ஸ் மற்றும் ஃபாலோ-அப் தகவல்களைப் படிக்க உங்களுக்கு உதவ நான் வடிவமைக்கப்பட்டுள்ளேன்."
                : "I am your Neo Voice Assistant, designed to help you manage and view your leads and follow-ups.",
            intent: "FUNNY",
            language: isTamil ? "ta" : "en"
        };
    }

    if (t.includes("thank") || t.includes("நன்றி")) {
        return {
            spokenText: isTamil
                ? "மிக்க நன்றி! உங்களுடன் இணைந்து பணியாற்றுவதில் நான் மகிழ்ச்சி அடைகிறேன்."
                : "You are very welcome! I'm always happy to assist you with your business database.",
            intent: "FUNNY",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Company Plan details
    if (t.includes("plan") || t.includes("company") || t.includes("பிளான்") || t.includes("நிறுவனம்")) {
        const comp = stats.companyDetails;
        if (comp) {
            return {
                spokenText: isTamil
                    ? `உங்கள் நிறுவனம் பெயர் ${comp.name}. நீங்கள் ${comp.plan} திட்டத்தில் உள்ளீர்கள். நிலைமை ${comp.status}.`
                    : `Your company is ${comp.name}. You are on the ${comp.plan} plan, status is ${comp.status}.`,
                intent: "GET_COMPANY_PLAN",
                language: isTamil ? "ta" : "en"
            };
        } else {
            return {
                spokenText: isTamil ? "நிறுவன விவரங்கள் கிடைக்கவில்லை." : "Company details are not available.",
                intent: "GET_COMPANY_PLAN",
                language: isTamil ? "ta" : "en"
            };
        }
    }

    // Intent: Lead Sources
    if (t.includes("source") || t.includes("சோர்ஸ்") || t.includes("மூலம்")) {
        const sources = stats.leadSources || [];
        if (sources.length === 0) {
            return {
                spokenText: isTamil ? "விற்பனை மூலங்கள் ஏதுமில்லை." : "You have zero lead sources configured.",
                intent: "GET_LEAD_SOURCES",
                language: isTamil ? "ta" : "en"
            };
        }
        return {
            spokenText: isTamil
                ? `உங்கள் விற்பனை மூலங்கள்: ${sources.join(", ")}.`
                : `Your lead sources are: ${sources.join(", ")}.`,
            intent: "GET_LEAD_SOURCES",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Targets
    if (t.includes("target") || t.includes("டார்கெட்") || t.includes("இலக்கு")) {
        const targets = stats.targets || [];
        if (targets.length === 0) {
            return {
                spokenText: isTamil ? "இலக்குகள் ஏதும் அமைக்கப்படவில்லை." : "You have zero monthly targets configured.",
                intent: "GET_TARGETS",
                language: isTamil ? "ta" : "en"
            };
        }
        const current = targets[0];
        return {
            spokenText: isTamil
                ? `${current.year} ஆம் ஆண்டு ${current.month} ஆம் மாத இலக்கு: கோரிக்கைகள் ${current.leadsTarget || 0}, பட்ஜெட் ${current.marketingBudget || 0}, வருமானம் ${current.incomeTarget || 0}.`
                : `Target for ${current.year}/${current.month} is: ${current.leadsTarget || 0} leads, budget ${current.marketingBudget || 0}, and income ${current.incomeTarget || 0}.`,
            intent: "GET_TARGETS",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Templates
    if (t.includes("template") || t.includes("டெம்ப்ளேட்") || t.includes("பதில்கள்")) {
        const temps = stats.templates || [];
        if (temps.length === 0) {
            return {
                spokenText: isTamil ? "டெம்ப்ளேட்டுகள் ஏதுமில்லை." : "You have zero templates configured.",
                intent: "GET_TEMPLATES",
                language: isTamil ? "ta" : "en"
            };
        }
        const keywords = temps.map(t => t.keyword);
        return {
            spokenText: isTamil
                ? `உங்களிடம் ${temps.length} டெம்ப்ளேட்டுகள் உள்ளன. முக்கிய சொற்கள்: ${keywords.join(", ")}.`
                : `You have ${temps.length} templates. Keywords: ${keywords.join(", ")}.`,
            intent: "GET_TEMPLATES",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Team Chat
    if (t.includes("chat") || t.includes("message") || t.includes("செய்தி") || t.includes("சேட்") || t.includes("மெசேஜ்")) {
        const count = stats.unreadTeamMessagesCount || 0;
        if (isTamil) {
            return {
                spokenText: count > 0
                    ? `உங்களுக்கு ${count} புதிய குழு செய்திகள் வந்துள்ளன.`
                    : "உங்களுக்கு புதிய குழு செய்திகள் ஏதுமில்லை.",
                intent: "GET_TEAM_CHAT",
                language: "ta"
            };
        } else {
            return {
                spokenText: count > 0
                    ? `You have ${count} unread team messages in your chat.`
                    : "You have zero unread team messages.",
                intent: "GET_TEAM_CHAT",
                language: "en"
            };
        }
    }

    // Intent: Staff Members Count / Names (colloquial & standard)
    if (t.includes("staff") || t.includes("member") || t.includes("ஸ்டாஃப்") || t.includes("ஸ்டாப்") || t.includes("பணியாளர்கள்")) {
        const count = stats.staffCount || 0;
        const list = stats.staffList || [];
        const wantsNames = t.includes("name") || t.includes("who") || t.includes("list") || t.includes("பெயர்") || t.includes("யார்") || t.includes("லிஸ்ட்");

        if (wantsNames) {
            if (list.length === 0) {
                return {
                    spokenText: isTamil
                        ? "பணியாளர்கள் விவரங்கள் எதுவும் கிடைக்கவில்லை."
                        : "No staff member details were found.",
                    intent: "GET_STAFF_COUNT",
                    language: isTamil ? "ta" : "en"
                };
            }
            const namesAndRoles = list.map(u => `${u.name} (${isTamil ? (u.role === 'Admin' ? 'நிர்வாகி' : 'பணியாளர்') : u.role})`).join(", ");
            return {
                spokenText: isTamil
                    ? `உங்கள் நிறுவனத்தில் உள்ள பணியாளர்கள்: ${namesAndRoles}. மொத்தம் ${count} நபர்கள்.`
                    : `Your staff members are: ${namesAndRoles}. Totaling ${count} members.`,
                intent: "GET_STAFF_COUNT",
                language: isTamil ? "ta" : "en"
            };
        }

        if (isTamil) {
            return {
                spokenText: count > 0 
                    ? `உங்களிடம் மொத்தம் ${count} பணியாளர்கள் வேலை செய்கிறார்கள்.`
                    : "உங்களிடம் பணியாளர்கள் யாரும் இல்லை.",
                intent: "GET_STAFF_COUNT",
                language: "ta"
            };
        } else {
            return {
                spokenText: count > 0
                    ? `You have a total of ${count} staff members working in your company.`
                    : "You have zero staff members in your company.",
                intent: "GET_STAFF_COUNT",
                language: "en"
            };
        }
    }

    // Intent: Active pending Tasks
    if (t.includes("task") || t.includes("டாஸ்க்") || t.includes("வேலை")) {
        const count = stats.activeTasks || 0;
        if (isTamil) {
            return {
                spokenText: count > 0 
                    ? `உங்களுக்கு ${count} வேலைகள் நிலுவையில் உள்ளன.`
                    : "உங்களுக்கு நிலுவையில் உள்ள வேலைகள் ஏதுமில்லை.",
                intent: "GET_TASK_COUNT",
                language: "ta"
            };
        } else {
            return {
                spokenText: count > 0
                    ? `You have ${count} pending active tasks to complete.`
                    : "You have zero pending tasks.",
                intent: "GET_TASK_COUNT",
                language: "en"
            };
        }
    }

    // Intent: Contacted Leads
    if (t.includes("contacted") || t.includes("தொடர்புகொள்ளப்பட்டது")) {
        const count = stats.contactedLeadsCount || 0;
        return {
            spokenText: isTamil
                ? `உங்களிடம் மொத்தம் ${count} தொடர்புகொள்ளப்பட்ட கோரிக்கைகள் உள்ளன.`
                : `You have a total of ${count} contacted enquiries.`,
            intent: "GET_GENERAL_STATS",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Sales Drop
    if (t.includes("drop") || t.includes("dropped") || t.includes("நிறுத்தப்பட்டவை") || t.includes("டிராப்")) {
        const count = stats.salesDropLeadsCount || 0;
        return {
            spokenText: isTamil
                ? `உங்களிடம் மொத்தம் ${count} நிறுத்தப்பட்ட கோரிக்கைகள் உள்ளன.`
                : `You have a total of ${count} dropped enquiries.`,
            intent: "GET_GENERAL_STATS",
            language: isTamil ? "ta" : "en"
        };
    }

    // Intent: Names of Missed Follow-ups or Today's Scheduled
    if (t.includes("name") || t.includes("who") || t.includes("yaar") || t.includes("நபர்") || t.includes("யாரு") || t.includes("லிஸ்ட்")) {
        if (t.includes("miss") || t.includes("தவறவிட்ட")) {
            const isToday = t.includes("today") || t.includes("இன்று") || t.includes("இன்னைக்கு");
            const count = isToday ? (stats.todayMissedFollowups || 0) : (stats.overallMissedFollowups || 0);
            const names = stats.missedNames || [];
            if (count === 0) {
                return {
                    spokenText: isTamil 
                        ? `${isToday ? "இன்றைய" : "ஒட்டுமொத்த"} தவறவிட்ட தொடர்புகள் யாருமில்லை!` 
                        : `You have zero ${isToday ? "today's" : "overall"} missed follow-ups!`,
                    intent: "GET_MISSED_NAMES",
                    language: isTamil ? "ta" : "en"
                };
            }
            const namesStr = names.join(", ");
            if (isTamil) {
                return {
                    spokenText: `தவறவிட்ட நபர் பெயர்கள்: ${namesStr}. மொத்தம் ${count} தொடர்புகள் உள்ளன.`,
                    intent: "GET_MISSED_NAMES",
                    language: "ta"
                };
            } else {
                return {
                    spokenText: `Your missed follow-ups are with: ${namesStr}. Totaling ${count} clients.`,
                    intent: "GET_MISSED_NAMES",
                    language: "en"
                };
            }
        }
        
        if (t.includes("today") || t.includes("schedule") || t.includes("இன்று") || t.includes("இன்னைக்கு")) {
            const count = stats.todayScheduledFollowups || 0;
            const names = stats.todayNames || [];
            if (count === 0) {
                return {
                    spokenText: isTamil ? "இன்று திட்டமிடப்பட்டவர்கள் யாருமில்லை!" : "You have zero scheduled follow-ups today!",
                    intent: "GET_TODAY_NAMES",
                    language: isTamil ? "ta" : "en"
                };
            }
            const namesStr = names.join(", ");
            if (isTamil) {
                return {
                    spokenText: `இன்று திட்டமிடப்பட்ட நபர் பெயர்கள்: ${namesStr}. மொத்தம் ${count} தொடர்புகள் உள்ளன.`,
                    intent: "GET_TODAY_NAMES",
                    language: "ta"
                };
            } else {
                return {
                    spokenText: `Today's scheduled follow-ups are with: ${namesStr}. Totaling ${count} clients.`,
                    intent: "GET_TODAY_NAMES",
                    language: "en"
                };
            }
        }
    }

    // Intent: Missed Follow-ups (Generic count query)
    if (t.includes("missed") || t.includes("miss") || t.includes("தவறவிட்ட") || t.includes("மிஸ்டு")) {
        const isToday = t.includes("today") || t.includes("இன்று") || t.includes("இன்னைக்கு");
        const count = isToday ? (stats.todayMissedFollowups || 0) : (stats.overallMissedFollowups || 0);
        if (isTamil) {
            return {
                spokenText: count > 0 
                    ? `உங்களுக்கு ${isToday ? "இன்று மட்டும்" : "ஒட்டுமொத்தமாக"} ${count} தவறவிட்ட தொடர்புகள் உள்ளன.`
                    : `உங்களுக்கு ${isToday ? "இன்றைய" : "ஒட்டுமொத்த"} தவறவிட்ட தொடர்புகள் ஏதுமில்லை.`,
                intent: "GET_MISSED_FOLLOWUPS",
                language: "ta"
            };
        } else {
            return {
                spokenText: count > 0
                    ? `You have ${count} ${isToday ? "today's" : "overall"} missed follow-ups.`
                    : `You have zero ${isToday ? "today's" : "overall"} missed follow-ups.`,
                intent: "GET_MISSED_FOLLOWUPS",
                language: "en"
            };
        }
    }

    // Intent: Today's scheduled (Generic count query)
    if (t.includes("today") || t.includes("schedule") || t.includes("இன்று") || t.includes("இன்னைக்கு")) {
        const count = stats.todayScheduledFollowups;
        if (isTamil) {
            return {
                spokenText: count > 0
                    ? `இன்று உங்களுக்கு ${count} தொடர்புகள் திட்டமிடப்பட்டுள்ளன.`
                    : "இன்று உங்களுக்கு புதிய திட்டமிடப்பட்ட தொடர்புகள் எதுவும் இல்லை.",
                intent: "GET_TODAY_FOLLOWUPS",
                language: "ta"
            };
        } else {
            return {
                spokenText: count > 0
                    ? `You have ${count} follow-ups scheduled for today.`
                    : "You have zero follow-ups scheduled for today.",
                intent: "GET_TODAY_FOLLOWUPS",
                language: "en"
            };
        }
    }

    // Intent: General Stats / Overall
    if (t.includes("stats") || t.includes("lead") || t.includes("enquiry") || t.includes("விற்பனை") || t.includes("மொத்தம்")) {
        if (isTamil) {
            return {
                spokenText: `உங்களிடம் மொத்தம் ${stats.totalEnquiries} கோரிக்கைகள் உள்ளன. அதில் ${stats.convertedEnquiries} வெற்றிகரமாக மாற்றப்பட்டுள்ளன.`,
                intent: "GET_GENERAL_STATS",
                language: "ta"
            };
        } else {
            return {
                spokenText: `You have a total of ${stats.totalEnquiries} enquiries, with ${stats.convertedEnquiries} successfully converted to sales.`,
                intent: "GET_GENERAL_STATS",
                language: "en"
            };
        }
    }

    // Unrecognized
    return {
        spokenText: isTamil
            ? "மன்னிக்கவும், அந்த கட்டளை எனக்கு புரியவில்லை. இன்று எத்தனை தவறவிட்டவை என்று கேட்டுப்பாருங்கள்."
            : "Sorry, I didn't recognize that command. Try asking: how many missed today?",
        intent: "UNKNOWN",
        language: isTamil ? "ta" : "en"
    };
}

const mockStats = {
    todayDate: "2026-05-20",
    totalEnquiries: 125,
    convertedEnquiries: 45,
    activeLeads: 80,
    contactedLeadsCount: 30,
    salesDropLeadsCount: 15,
    todayScheduledFollowups: 8,
    todayMissedFollowups: 2,
    overallMissedFollowups: 10,
    staffCount: 4,
    staffList: [
        { name: "John Doe", role: "Admin", status: "Active" },
        { name: "Sarah Connor", role: "Staff", status: "Active" }
    ],
    activeTasks: 5,
    missedNames: ["Client A", "Client B"],
    todayNames: ["Client C", "Client D"],
    companyDetails: {
        name: "Test Corp LLC",
        plan: "Enterprise",
        staffLimit: 15,
        status: "Active"
    },
    leadSources: ["Google Ads", "Direct Referral", "Social Media"],
    targets: [
        { year: 2026, month: 5, leadsTarget: 50, marketingBudget: 2500, incomeTarget: 10000 }
    ],
    templates: [
        { name: "Welcome Message", keyword: "welcome", category: "Greeting", status: "Active" }
    ],
    unreadTeamMessagesCount: 3,
    recentTeamMessages: [
        { sender: "Sarah Connor", receiver: "John Doe", message: "Hey, can you approve the lead?", time: new Date() }
    ]
};

console.log("--------------------------------------------------");
console.log("TESTING LOCAL SMART FALLBACK PARSER (ENGLISH)");
console.log("--------------------------------------------------");

const queriesEN = [
    { text: "What is my company plan and details?", expectedIntent: "GET_COMPANY_PLAN" },
    { text: "What is our monthly target?", expectedIntent: "GET_TARGETS" },
    { text: "Tell me my lead sources.", expectedIntent: "GET_LEAD_SOURCES" },
    { text: "Can you list the message templates?", expectedIntent: "GET_TEMPLATES" },
    { text: "Do I have any team chat messages?", expectedIntent: "GET_TEAM_CHAT" },
    { text: "Who are today's missed follow-ups?", expectedIntent: "GET_MISSED_NAMES" },
    { text: "Good morning assistant!", expectedIntent: "GREETING" },
    { text: "How do I create a new enquiry in CRM?", expectedIntent: "HELP_ENQUIRY" },
    { text: "How can I schedule a followup?", expectedIntent: "HELP_FOLLOWUP" },
    { text: "Who has access to the templates and targets?", expectedIntent: "HELP_ACCESS" },
    { text: "Do you love me or are you human?", expectedIntent: "FUNNY" },
    { text: "do you like coffee?", expectedIntent: "FUNNY" },
    { text: "how are you today?", expectedIntent: "FUNNY" },
    { text: "who are you?", expectedIntent: "FUNNY" },
    { text: "thank you so much!", expectedIntent: "FUNNY" },
    { text: "who are my staff members?", expectedIntent: "GET_STAFF_COUNT" },
    { text: "what is my staff name?", expectedIntent: "GET_STAFF_COUNT" }
];

queriesEN.forEach(q => {
    const res = handleLocalFallback(q.text, mockStats);
    console.log(`Query: "${q.text}"`);
    console.log(`Result: Intent = ${res.intent}, Lang = ${res.language}`);
    console.log(`Spoken Reply: "${res.spokenText}"`);
    console.log("---");
    if (res.intent !== q.expectedIntent) {
        console.error(`🚨 Intent mismatch! Expected ${q.expectedIntent}, got ${res.intent}`);
        process.exit(1);
    }
});

console.log("--------------------------------------------------");
console.log("TESTING LOCAL SMART FALLBACK PARSER (TAMIL)");
console.log("--------------------------------------------------");

const queriesTA = [
    { text: "நிறுவனத்தின் பிளான் என்ன?", expectedIntent: "GET_COMPANY_PLAN" },
    { text: "இந்த மாத டார்கெட் என்ன?", expectedIntent: "GET_TARGETS" },
    { text: "லீட் சோர்ஸ் என்னென்ன?", expectedIntent: "GET_LEAD_SOURCES" },
    { text: "வாட்ஸ்அப் டெம்ப்ளேட் என்னென்ன உள்ளன?", expectedIntent: "GET_TEMPLATES" },
    { text: "குழு சேட் செய்திகள் உள்ளனவா?", expectedIntent: "GET_TEAM_CHAT" },
    { text: "காலை வணக்கம் நியோ!", expectedIntent: "GREETING" },
    { text: "புதிய கோரிக்கை உருவாக்குவது எப்படி?", expectedIntent: "HELP_ENQUIRY" },
    { text: "ஃபாலோ அப் செய்வது எப்படி?", expectedIntent: "HELP_FOLLOWUP" },
    { text: "என்னுடைய அணுகல் அனுமதி ரோல் என்ன?", expectedIntent: "HELP_ACCESS" },
    { text: "நீ என்னை காதலிக்கிறாயா?", expectedIntent: "FUNNY" },
    { text: "காபி குடிப்பியா?", expectedIntent: "FUNNY" },
    { text: "எப்படி இருக்கீங்க நியோ?", expectedIntent: "FUNNY" },
    { text: "நீ யார்?", expectedIntent: "FUNNY" },
    { text: "ரொம்ப நன்றி!", expectedIntent: "FUNNY" },
    { text: "என் பணியாளர்கள் யார் யார்?", expectedIntent: "GET_STAFF_COUNT" },
    { text: "என் ஸ்டாஃப் பெயர் என்ன?", expectedIntent: "GET_STAFF_COUNT" }
];

queriesTA.forEach(q => {
    const res = handleLocalFallback(q.text, mockStats);
    console.log(`Query: "${q.text}"`);
    console.log(`Result: Intent = ${res.intent}, Lang = ${res.language}`);
    console.log(`Spoken Reply: "${res.spokenText}"`);
    console.log("---");
    if (res.intent !== q.expectedIntent) {
        console.error(`🚨 Intent mismatch! Expected ${q.expectedIntent}, got ${res.intent}`);
        process.exit(1);
    }
});

console.log("✅ All Local Fallback smart routing matches passed perfectly!");
process.exit(0);
