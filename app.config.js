const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

module.exports = ({ config }) => {
    return {
        ...config,
        extra: {
            businessNumber: process.env.PHONE_NUMBER,
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
