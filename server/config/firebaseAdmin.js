const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
// Ideally, set GOOGLE_APPLICATION_CREDENTIALS environment variable to point to your serviceAccountKey.json
// Or provide the path directly here if testing locally.

try {
    if (!admin.apps.length) {
        // Check for Service Account in .env or default location
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (serviceAccountPath) {
            admin.initializeApp({
                credential: admin.credential.cert(require(serviceAccountPath)),
            });
            console.log("[Firebase Admin] Initialized with service account from env.");
        } else {
            // Use Application Default Credentials (works on GCP/Firebase Hosting)
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
            console.log("[Firebase Admin] Initialized with Application Default Credentials.");
        }
    }
} catch (error) {
    console.warn("[Firebase Admin] Initialization failed:", error.message);
    console.warn("Ensure GOOGLE_APPLICATION_CREDENTIALS is set or running in a supported environment.");
}

module.exports = admin;
