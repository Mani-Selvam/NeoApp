import React, { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export const SKELETON_COLORS = {
    bg: "#F9FAFB",
    base: "#E5E7EB",
    highlight: "#F3F4F6",
    border: "#E5E7EB",
};

const PulseContext = createContext(null);

export function SkeletonPulse({
    children,
    enabled = true,
    minOpacity = 0.55,
    maxOpacity = 1,
    duration = 900,
}) {
    const opacity = useRef(new Animated.Value(minOpacity)).current;

    useEffect(() => {
        if (!enabled) return;
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: maxOpacity,
                    duration,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: minOpacity,
                    duration,
                    useNativeDriver: true,
                }),
            ]),
        );
        anim.start();
        return () => anim.stop();
    }, [duration, enabled, maxOpacity, minOpacity, opacity]);

    const value = useMemo(() => ({ opacity }), [opacity]);

    return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}

function usePulseOpacity() {
    const ctx = useContext(PulseContext);
    return ctx?.opacity || null;
}

export function SkeletonBox({
    width,
    height,
    radius = 14,
    color = SKELETON_COLORS.base,
    style,
    opacity: opacityProp,
    ...rest
}) {
    const contextOpacity = usePulseOpacity();
    const opacity = opacityProp || contextOpacity;
    const baseStyle = [
        styles.box,
        {
            width,
            height,
            borderRadius: radius,
            backgroundColor: color,
        },
        style,
    ];

    if (opacity) {
        return <Animated.View style={[baseStyle, { opacity }]} {...rest} />;
    }
    return <View style={baseStyle} {...rest} />;
}

export function SkeletonLine({
    width = "100%",
    height = 12,
    radius = 999,
    style,
    ...rest
}) {
    return (
        <SkeletonBox
            width={width}
            height={height}
            radius={radius}
            style={style}
            {...rest}
        />
    );
}

export function SkeletonCircle({ size = 44, style, ...rest }) {
    return (
        <SkeletonBox
            width={size}
            height={size}
            radius={size / 2}
            style={style}
            {...rest}
        />
    );
}

export function SkeletonSpacer({ h = 12, w = 0 }) {
    return <View style={{ height: h, width: w }} />;
}

export function SkeletonCard({ children, style }) {
    return (
        <View
            style={[
                styles.card,
                {
                    borderColor: SKELETON_COLORS.border,
                },
                style,
            ]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    box: {
        backgroundColor: SKELETON_COLORS.base,
    },
    card: {
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
    },
});

