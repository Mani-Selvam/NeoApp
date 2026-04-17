import { useWindowDimensions, Platform, PixelRatio } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Responsive Design System
 * Provides adaptive sizing, spacing, and typography scaling
 */

// Screen size breakpoints
export const BREAKPOINTS = {
    phoneSmall: 360,
    phoneRegular: 412,
    phoneLarge: 480,
    tablet: 768,
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

export const TOUCH_TARGET = {
    min: 44,
    comfortable: 48,
};

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

/**
 * Hook: useResponsiveDimensions
 * Returns adaptive dimensions based on screen size
 */
export const useResponsiveDimensions = () => {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const fontScale = PixelRatio.getFontScale();

    const isLandscape = width > height;
    const isSmallScreen = width < BREAKPOINTS.phoneRegular;
    const isMediumScreen =
        width >= BREAKPOINTS.phoneRegular && width < BREAKPOINTS.phoneLarge;
    const isLargeScreen =
        width >= BREAKPOINTS.phoneLarge && width < BREAKPOINTS.tablet;
    const isTablet = width >= BREAKPOINTS.tablet;
    const sizeClass = isTablet
        ? "tablet"
        : isLargeScreen
          ? "phoneLarge"
          : isMediumScreen
            ? "phoneRegular"
            : "phoneSmall";

    return {
        width,
        height,
        insets,
        isLandscape,
        isSmallScreen,
        isMediumScreen,
        isLargeScreen,
        isTablet,
        sizeClass,
        isIOS: Platform.OS === "ios",
        isAndroid: Platform.OS === "android",
        screenRatio: width / height,
        fontScale,
    };
};

/**
 * Hook: useResponsiveFont
 * Returns scaled font sizes based on screen size
 */
export const useResponsiveFont = () => {
    const { width } = useResponsiveDimensions();

    // Font scaling factor based on screen width
    const scale = width / BREAKPOINTS.phoneRegular;
    const clampedScale = clamp(scale, 0.86, 1.2);

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
    const scale = clamp(width / BREAKPOINTS.phoneRegular, 0.9, 1.25);

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
    const scale = clamp(width / BREAKPOINTS.phoneRegular, 0.9, 1.25);
    return baseSize * scale;
};

export const useResponsiveTokens = () => {
    const dims = useResponsiveDimensions();
    const font = useResponsiveFont();
    const spacing = useResponsiveSpacing();
    const size = (base: number, min = base * 0.9, max = base * 1.3) =>
        clamp(
            Math.round(base * clamp(dims.width / BREAKPOINTS.phoneRegular, 0.9, 1.3)),
            Math.round(min),
            Math.round(max),
        );

    const isPhone = !dims.isTablet;
    const hPad = dims.isTablet ? spacing.xxl : dims.isSmallScreen ? spacing.md : spacing.lg;
    const cardRadius = dims.isTablet ? BORDER_RADIUS.xl : BORDER_RADIUS.lg;
    const modalBottomSafe = Math.max(dims.insets.bottom, spacing.md);

    return {
        ...dims,
        font,
        spacing,
        size,
        isPhone,
        hPad,
        cardRadius,
        minTouch: TOUCH_TARGET.min,
        comfortableTouch: TOUCH_TARGET.comfortable,
        modalBottomSafe,
    };
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
    if (screenWidth >= BREAKPOINTS.tablet) return value.xLarge ?? value.default;
    if (screenWidth >= BREAKPOINTS.phoneLarge) return value.large ?? value.default;
    if (screenWidth >= BREAKPOINTS.phoneRegular) return value.medium ?? value.default;
    if (screenWidth >= BREAKPOINTS.phoneSmall) return value.small ?? value.default;
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
    const { isSmallScreen, insets } = useResponsiveDimensions();
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
