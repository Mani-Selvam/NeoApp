import getApiClient from "./apiClient";
import * as Speech from "expo-speech";
import { Platform } from "react-native";

/**
 * Sends the transcribed voice text to the backend API
 * for processing by AI (Gemini/OpenAI) or local fallback.
 * 
 * @param {string} transcript Spoken text to evaluate
 * @param {function} callback State updater callback
 */
export const handleVoiceCommand = async (transcript, callback) => {
    if (!transcript || transcript.trim() === "") {
        speakResponse("I didn't catch that. Please speak again.", "en");
        callback({ status: "error", message: "Didn't hear anything" });
        return;
    }

    try {
        callback({ status: "processing" });

        // 1. Get our authenticated API client
        const client = await getApiClient();

        // 2. Query the voice assistant endpoint
        const response = await client.post("/assistant/voice-command", {
            text: transcript,
            tzOffsetMinutes: new Date().getTimezoneOffset()
        });

        const data = response.data;
        if (data && data.success) {
            console.log("[Voice Assistant Client] Success response:", data);

            // 3. Play the vocalized speech out loud!
            speakResponse(data.spokenText, data.language);

            // 4. Trigger UI callback state
            callback({
                status: "done",
                text: data.spokenText,
                intent: data.intent,
                language: data.language
            });
        } else {
            throw new Error(data?.error || "Invalid response format from server");
        }

    } catch (error) {
        console.error("[Voice Assistant Client Error]:", error);

        const errorMsg = error?.response?.data?.error || error.message || "Failed to contact voice engine";
        const isTamil = transcript.toLowerCase().includes("இன்று") || transcript.toLowerCase().includes("தவறவிட்ட");

        const fallbackSpeech = isTamil
            ? "மன்னிக்கவும், தகவல் சேகரிப்பதில் பிழை ஏற்பட்டது."
            : "Sorry, I encountered an error checking your database.";

        speakResponse(fallbackSpeech, isTamil ? "ta" : "en");
        callback({ status: "error", message: errorMsg });
    }
};

/**
 * Vocalizes Text-to-Speech (TTS) response
 * Supports both Tamil and English accents with a high-quality female voice selection.
 */
export const speakResponse = async (text, lang = "en", onDoneCallback = null) => {
    // Prevent overlapping speech overlay
    Speech.stop();

    if (!text || typeof text !== "string" || text.trim() === "") {
        if (onDoneCallback) {
            onDoneCallback();
        }
        return;
    }

    const speakLang = String(lang).toLowerCase() === "ta" ? "ta-IN" : "en-US";
    let selectedVoice = undefined;

    try {
        const voices = await Speech.getAvailableVoicesAsync();

        // Normalize search language
        const langLower = speakLang.toLowerCase().replace("_", "-");

        // Filter for matching language voices
        const matchingVoices = voices.filter(v => {
            const vLang = v.language.toLowerCase().replace("_", "-");
            return vLang.startsWith(langLower) || langLower.startsWith(vLang);
        });

        // List of female voice name patterns (known high-quality voices on iOS/Android/Windows)
        const FEMALE_PATTERNS = [
            "samantha", "karen", "moira", "tessa", "susan", "nicky", "catherine",
            "zoe", "lekha", "heera", "vaishali", "pallavi", "sinji", "zira", "female"
        ];

        // 1. Try to find an exact premium female voice from our pre-defined names
        selectedVoice = matchingVoices.find(v => {
            const nameLower = v.name.toLowerCase();
            const idLower = v.identifier.toLowerCase();
            return FEMALE_PATTERNS.some(pat => nameLower.includes(pat) || idLower.includes(pat));
        });

        // 2. Fallback to any voice indicating it is female in identifier/name
        if (!selectedVoice) {
            selectedVoice = matchingVoices.find(v =>
                v.name.toLowerCase().includes("female") ||
                v.identifier.toLowerCase().includes("female")
            );
        }

        // 3. Android specific Google premium/natural voices (contain "-f-" or "network" for high quality)
        if (!selectedVoice && Platform.OS === "android") {
            selectedVoice = matchingVoices.find(v =>
                v.name.toLowerCase().includes("-f-") ||
                v.identifier.toLowerCase().includes("-f-") ||
                v.name.toLowerCase().includes("network") ||
                v.identifier.toLowerCase().includes("network")
            );
        }

        if (selectedVoice) {
            console.log(`[TTS] Selected female voice: ${selectedVoice.name} (${selectedVoice.identifier})`);
        }
    } catch (err) {
        console.warn("[TTS] Error querying available voices:", err);
    }

    const options = {
        language: speakLang,
        pitch: 1.05, // Slightly higher pitch (1.05) creates a more pleasant female speaking tone
        rate: 0.95,  // 0.95 is slightly slower and more natural/professional
        onDone: () => {
            if (onDoneCallback) {
                console.log("[TTS] Completed speaking. Triggering callback.");
                onDoneCallback();
            }
        },
        onError: (error) => {
            console.warn("[TTS] Error encountered:", error);
            if (onDoneCallback) {
                onDoneCallback();
            }
        }
    };

    if (selectedVoice?.identifier) {
        options.voice = selectedVoice.identifier;
    }

    // Clean up text for TTS: remove markdown asterisks and excess whitespace
    const cleanText = text.replace(/\*\*/g, "").replace(/\n/g, ". ").replace(/\s+/g, " ").trim();

    Speech.speak(cleanText, options);
};
