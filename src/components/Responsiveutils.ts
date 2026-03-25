import { useWindowDimensions, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Responsive Design System
 * Provides adaptive sizing, spacing, and typography scaling
 */

// Screen size breakpoints
export const BREAKPOINTS = {
    small: 320,
    medium: 480,
    large: 600,
    xLarge: 800,
};

// Spacing scale (base unit: 4px)
export const SPACING = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

// Border radius scale
export const BORDER_RADIUS = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

/**
 * Hook: useResponsiveDimensions
 * Returns adaptive dimensions based on screen size
 */
export const useResponsiveDimensions = () => {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const isLandscape = width > height;
    const isSmallScreen = width < BREAKPOINTS.medium;
    const isMediumScreen = width >= BREAKPOINTS.medium && width < BREAKPOINTS.large;
    const isLargeScreen = width >= BREAKPOINTS.large;
    const isTablet = width >= BREAKPOINTS.xLarge;

    return {
        width,
        height,
        insets,
        isLandscape,
        isSmallScreen,
        isMediumScreen,
        isLargeScreen,
        isTablet,
        isIOS: Platform.OS === "ios",
        isAndroid: Platform.OS === "android",
        screenRatio: width / height,
    };
};

/**
 * Hook: useResponsiveFont
 * Returns scaled font sizes based on screen size
 */
export const useResponsiveFont = () => {
    const { width, isSmallScreen, isTablet } = useResponsiveDimensions();

    // Font scaling factor based on screen width
    const scale = width / BREAKPOINTS.large;
    const clampedScale = Math.min(Math.max(scale, 0.75), 1.25);

    const baseFont = 14;
    const baseTitleFont = 24;
    const baseHeadingFont = 28;

    return {
        xs: baseFont * 0.75 * clampedScale,
        sm: baseFont * 0.875 * clampedScale,
        base: baseFont * clampedScale,
        lg: baseFont * 1.125 * clampedScale,
        xl: baseFont * 1.25 * clampedScale,
        xxl: baseTitleFont * clampedScale,
        xxxl: baseHeadingFont * clampedScale,
        // Semantic font sizes
        caption: baseFont * 0.75 * clampedScale,
        body: baseFont * clampedScale,
        subtitle: baseFont * 0.95 * clampedScale,
        title: baseTitleFont * clampedScale,
        heading: baseHeadingFont * clampedScale,
    };
};

/**
 * Hook: useResponsiveSpacing
 * Returns scaled spacing values based on screen size
 */
export const useResponsiveSpacing = () => {
    const { width } = useResponsiveDimensions();
    const scale = width / BREAKPOINTS.large;

    return {
        xs: SPACING.xs * scale,
        sm: SPACING.sm * scale,
        md: SPACING.md * scale,
        lg: SPACING.lg * scale,
        xl: SPACING.xl * scale,
        xxl: SPACING.xxl * scale,
        xxxl: SPACING.xxxl * scale,
    };
};

/**
 * Hook: useResponsiveSize
 * Returns adaptive component dimensions
 */
export const useResponsiveSize = (baseSize: number) => {
    const { width } = useResponsiveDimensions();
    const scale = Math.min(Math.max(width / BREAKPOINTS.large, 0.75), 1.25);
    return baseSize * scale;
};

/**
 * Utility: getResponsiveValue
 * Returns different values based on screen size
 */
export const getResponsiveValue = <T>(
    value: {
        small?: T;
        medium?: T;
        large?: T;
        xLarge?: T;
        default: T;
    },
    screenWidth: number
): T => {
    if (screenWidth >= BREAKPOINTS.xLarge) return value.xLarge ?? value.default;
    if (screenWidth >= BREAKPOINTS.large) return value.large ?? value.default;
    if (screenWidth >= BREAKPOINTS.medium) return value.medium ?? value.default;
    if (screenWidth >= BREAKPOINTS.small) return value.small ?? value.default;
    return value.default;
};

/**
 * Utility: getAspectRatioSize
 * Maintains aspect ratio for responsive sizing
 */
export const getAspectRatioSize = (
    containerSize: number,
    aspectRatio: number = 1
): { width: number; height: number } => {
    return {
        width: containerSize,
        height: containerSize / aspectRatio,
    };
};

/**
 * Hook: useResponsiveMenuWidth
 * Returns adaptive menu width (useful for sidebars)
 */
export const useResponsiveMenuWidth = () => {
    const { width, isTablet, isLandscape, isSmallScreen } =
        useResponsiveDimensions();

    if (isTablet) {
        if (isLandscape) {
            return Math.min(Math.max(width * 0.34, 320), 420);
        }
        return Math.min(Math.max(width * 0.42, 300), 380);
    }

    if (isLandscape) {
        return Math.min(Math.max(width * 0.52, 300), 360);
    }

    if (isSmallScreen) {
        return Math.min(width * 0.84, 300);
    }

    return Math.min(width * 0.8, 340);
};

/**
 * Hook: useResponsivePadding
 * Returns adaptive padding based on screen size and safe area
 */
export const useResponsivePadding = () => {
    const { isSmallScreen, isTablet, insets } = useResponsiveDimensions();
    const spacing = useResponsiveSpacing();

    const horizontalPadding = isSmallScreen ? spacing.md : spacing.lg;
    const verticalPadding = isSmallScreen ? spacing.md : spacing.xl;

    return {
        horizontal: horizontalPadding,
        vertical: verticalPadding,
        top: Math.max(verticalPadding, insets.top),
        bottom: Math.max(verticalPadding, insets.bottom),
        left: Math.max(horizontalPadding, insets.left),
        right: Math.max(horizontalPadding, insets.right),
    };
};

/**
 * Utility: createResponsiveStyle
 * Creates a responsive StyleSheet value
 */
export const createResponsiveStyle = (
    baseFontSize: number,
    lineHeightMultiplier: number = 1.5
) => {
    return {
        fontSize: baseFontSize,
        lineHeight: baseFontSize * lineHeightMultiplier,
    };
};
