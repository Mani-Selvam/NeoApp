import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Triggers a callback at a set interval only when the screen is focused 
 * and the app is in the foreground. Very lightweight, does not manage state.
 */
export const useSilentRefresh = (callback, intervalMs = 5000) => {
    const isFocused = useIsFocused();
    const savedCallback = useRef(callback);

    // Remember the latest callback if it changes
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!isFocused || !intervalMs) return;

        let intervalId = null;

        const start = () => {
            if (!intervalId) {
                intervalId = setInterval(() => {
                    if (AppState.currentState === "active") {
                        if (savedCallback.current) savedCallback.current();
                    }
                }, intervalMs);
            }
        };

        const stop = () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        };

        // If the app is active right now, start polling
        if (AppState.currentState === "active") {
            start();
        }

        // Listen for foreground/background changes
        const sub = AppState.addEventListener("change", (nextState) => {
            if (nextState === "active") {
                start();
            } else {
                stop();
            }
        });

        return () => {
            stop();
            sub?.remove?.();
        };
    }, [isFocused, intervalMs]);
};
