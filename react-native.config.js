const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const playStoreSafeMode =
    String(process.env.EXPO_PUBLIC_PLAY_STORE_SAFE_MODE ?? "true")
        .trim()
        .toLowerCase() !== "false";

module.exports = {
    dependencies: playStoreSafeMode
        ? {
              "react-native-call-log": {
                  platforms: {
                      android: null,
                  },
              },
              "react-native-immediate-phone-call": {
                  platforms: {
                      android: null,
                  },
              },
          }
        : {},
};
