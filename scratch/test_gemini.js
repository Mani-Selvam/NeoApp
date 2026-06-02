const axios = require("axios");

const apiKey = "AIzaSyC2pdoe-444q4dSM2CDkqYbolSjTS8Sscg";

async function test() {
    console.log("Testing Gemini 2.5 Flash on v1beta with the new key...");
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: "Hello" }] }]
        });
        console.log("Success! Response:", response.data);
    } catch (err) {
        console.error("Error Status:", err.response?.status);
        console.error("Error Data:", JSON.stringify(err.response?.data, null, 2));
    }
}

test();
