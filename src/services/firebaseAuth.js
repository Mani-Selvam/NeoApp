import { Platform } from 'react-native';

let auth = null;

// Only attempt to require firebase auth on native platforms
if (Platform.OS !== 'web') {
    try {
        // We use require() here so that on the web (or if the module is missing),
        // the bundler/runtime deals with it more gracefully in some setups,
        // although Metro generally bundles everything. 
        // The try/catch protects against runtime crashes if the native module isn't linked.
        const authModule = require('@react-native-firebase/auth');
        auth = authModule.default || authModule;
    } catch (error) {
        console.warn("Running in an environment without React Native Firebase (e.g., Expo Go). Mobile Auth will be unavailable.");
    }
}

export default auth;
