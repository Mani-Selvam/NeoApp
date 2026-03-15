const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

module.exports = ({ config }) => {
    const existingExtra = config.extra || {};
    const existingEas = existingExtra.eas || {};

    return {
        ...config,
        extra: {
            ...existingExtra,
            businessNumber: process.env.PHONE_NUMBER,
            eas: {
                projectId: "d5d7a47f-ce94-4733-9513-f2126f70ed0d",
            },
        },
        android: {
            ...config.android,
            permissions: [
                "READ_CALL_LOG",
                "READ_PHONE_STATE",
                "PROCESS_OUTGOING_CALLS",
                "READ_CONTACTS",
                "CALL_PHONE",
            ],
        },
    };
};
