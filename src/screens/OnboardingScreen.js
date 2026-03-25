import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FlatList,
    Image,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import Animated, {
    Easing,
    Extrapolation,
    FadeIn,
    interpolate,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";

const DATA = [
  {
    id: "1",
    title: "Unify Your Sales Pipeline",
    subtitle:
      "Bring all your enquiries into one powerful dashboard. No more messy spreadsheets.",
    media: require("../assets/introimage/intro1.gif"),
    type: "image",
    accentColor: "#6C5DD3", // Matching HomeScreen primary
  },
  {
    id: "2",
    title: "Never Miss a Follow-up",
    subtitle:
      "Schedule calls, track status, and close deals with timely reminders and actions.",
    media: require("../assets/introimage/intro2.gif"),
    type: "image",
    accentColor: "#FF6B9D", // Matching HomeScreen pink/accent
  },
  {
    id: "3",
    title: "Visualize Your Growth",
    subtitle:
      "Track monthly revenue, conversion rates, and pipeline health at a glance.",
    media: require("../assets/introimage/intro3.gif"),
    type: "image",
    accentColor: "#00D9A3", // Matching HomeScreen success
  },
];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const getResponsiveMetrics = (width, height, insetBottom) => {
  const isSmallPhone = width < 360;
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const horizontalPadding = isTablet ? 52 : isSmallPhone ? 22 : 28;
  const contentMaxWidth = isTablet ? Math.min(width * 0.72, 700) : width;
  let illustrationHeight = 290;
  let mediaSize = Math.min(width * 0.72, 290);
  let titleSize = 34;

  if (isTablet) {
    illustrationHeight = Math.min(height * 0.34, 340);
    mediaSize = Math.min(width * 0.34, 300);
    titleSize = 38;
  } else if (isLandscape) {
    illustrationHeight = Math.min(height * 0.36, 250);
    mediaSize = Math.min(height * 0.42, 220);
    titleSize = 28;
  } else if (isSmallPhone) {
    illustrationHeight = 240;
    mediaSize = Math.min(width * 0.62, 220);
    titleSize = 28;
  }

  const titleLineHeight = Math.round(titleSize * 1.18);
  const subtitleSize = isTablet ? 18 : isSmallPhone ? 15 : 16;
  const subtitleLineHeight = Math.round(subtitleSize * 1.55);
  const footerBottom = Math.max(insetBottom + 14, isTablet ? 28 : 18);
  const paginationBottom = footerBottom + (isTablet ? 92 : 82);

  return {
    isSmallPhone,
    isTablet,
    isLandscape,
    horizontalPadding,
    contentMaxWidth,
    illustrationHeight,
    mediaSize,
    titleSize,
    titleLineHeight,
    subtitleSize,
    subtitleLineHeight,
    footerBottom,
    paginationBottom,
  };
};

const PaginationDot = ({ index, width, scrollX, active }) => {
  const animatedDotStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * width,
      index * width,
      (index + 1) * width,
    ];

    return {
      width: interpolate(
        scrollX.value,
        inputRange,
        [6, 32, 6],
        Extrapolation.CLAMP,
      ),
      height: 6,
      opacity: interpolate(
        scrollX.value,
        inputRange,
        [0.4, 1, 0.4],
        Extrapolation.CLAMP,
      ),
      borderRadius: 3,
      backgroundColor: active ? "#1F2937" : "#D1D5DB",
    };
  });

  return <Animated.View style={[styles.dot, animatedDotStyle]} />;
};

export default function OnboardingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { completeOnboarding, isLoggedIn } = useAuth();
  const { width, height } = useWindowDimensions();
  const metrics = useMemo(
    () => getResponsiveMetrics(width, height, insets.bottom),
    [height, insets.bottom, width],
  );
  const flatListRef = useAnimatedRef();
  const scrollX = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const buttonScale = useSharedValue(1);
  const buttonOpacity = useSharedValue(1);
  const patternDots = useMemo(
    () =>
      Array.from({ length: metrics.isTablet ? 24 : 18 }, (_, i) => ({
        key: `pattern-dot-${i}`,
        left: ((i * 37) % 100) * (width / 100),
        top: ((i * 23) % 100) * (height / 100),
        opacity: 0.04 + (i % 5) * 0.018,
        size: metrics.isTablet ? (i % 3 === 0 ? 6 : 4) : i % 4 === 0 ? 5 : 4,
      })),
    [height, metrics.isTablet, width],
  );
  const skipFontSize = metrics.isTablet ? 17 : metrics.isSmallPhone ? 15 : 16;
  const nextButtonMinWidth = metrics.isTablet ? 164 : 138;
  const nextButtonHorizontalPadding = metrics.isTablet
    ? 34
    : metrics.isSmallPhone
      ? 24
      : 30;
  const nextButtonVerticalPadding = metrics.isTablet ? 18 : 16;
  const nextButtonRadius = metrics.isTablet ? 30 : 28;

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (
      viewableItems &&
      viewableItems.length > 0 &&
      viewableItems[0].index !== null
    ) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleNext = async () => {
    // Button press animation
    buttonScale.value = withSequence(
      withSpring(0.95, { damping: 15, stiffness: 300 }),
      withSpring(1.05, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 15, stiffness: 300 }),
    );

    buttonOpacity.value = withSequence(
      withTiming(0.7, { duration: 100 }),
      withTiming(1, { duration: 200 }),
    );

    if (currentIndex < DATA.length - 1) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: currentIndex + 1,
          animated: true,
        });
      }, 200);
    } else {
      await completeOnboarding();
      navigation.replace(isLoggedIn ? "Main" : "Login");
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
    navigation.replace(isLoggedIn ? "Main" : "Login");
  };

  const renderItem = useCallback(
    ({ item, index }) => {
      return (
        <OnboardItem
          item={item}
          index={index}
          scrollX={scrollX}
          width={width}
          metrics={metrics}
        />
      );
    },
    [metrics, scrollX, width],
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  const nextButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: buttonScale.value }],
      opacity: buttonOpacity.value,
    };
  });

  // Modern Pagination
  const Pagination = () => {
    return (
      <View style={styles.paginationContainer}>
        {DATA.map((_, i) => (
          <PaginationDot
            key={`pagination-dot-${i}`}
            index={i}
            width={width}
            scrollX={scrollX}
            active={i === currentIndex}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent />

      {/* Subtle Background Pattern */}
      <View style={styles.backgroundPattern}>
        {patternDots.map((dot) => (
          <View
            key={dot.key}
            style={[
              styles.patternDot,
              {
                left: dot.left,
                top: dot.top,
                opacity: dot.opacity,
                width: dot.size,
                height: dot.size,
                borderRadius: dot.size / 2,
              },
            ]}
          />
        ))}
      </View>

      <AnimatedFlatList
        ref={flatListRef}
        data={DATA}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        bounces={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        getItemLayout={getItemLayout}
        extraData={currentIndex}
      />

      {/* Pagination */}
      <View
        style={[styles.paginationWrapper, { bottom: metrics.paginationBottom }]}
      >
        <Pagination />
      </View>

      {/* Bottom Footer */}
      <View
        style={[
          styles.bottomFooter,
          {
            bottom: metrics.footerBottom,
            paddingHorizontal: metrics.horizontalPadding,
          },
        ]}
      >
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={[styles.skipText, { fontSize: skipFontSize }]}>
            Skip
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleNext}
          activeOpacity={0.8}
          style={styles.nextButtonWrapper}
        >
          <Animated.View
            style={[
              styles.nextButton,
              {
                minWidth: nextButtonMinWidth,
                paddingHorizontal: nextButtonHorizontalPadding,
                paddingVertical: nextButtonVerticalPadding,
                borderRadius: nextButtonRadius,
              },
              nextButtonAnimatedStyle,
            ]}
          >
            <Text style={[styles.nextText, { fontSize: skipFontSize }]}>
              {currentIndex === DATA.length - 1 ? "Get Started" : "Next"}
            </Text>
            <Ionicons
              name={
                currentIndex === DATA.length - 1
                  ? "arrow-forward"
                  : "chevron-forward"
              }
              size={18}
              color="#fff"
              style={styles.nextIcon}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Main Onboard Item Component
const OnboardItem = ({ item, index, scrollX, width, metrics }) => {
  const iconScale = useSharedValue(0.5);
  const cardOpacity = useSharedValue(0);
  const translateY = useSharedValue(50);

  useEffect(() => {
    iconScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    cardOpacity.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.quad),
    });
    translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
  }, [cardOpacity, iconScale, translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * width,
      index * width,
      (index + 1) * width,
    ];

    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [width * 0.7, 0, -width * 0.7],
      Extrapolation.CLAMP,
    );

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.85, 1, 0.85],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX }, { scale }, { translateY: translateY.value }],
      opacity: cardOpacity.value,
    };
  });

  const mediaAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Animated.View style={[styles.itemContainer, { width }, animatedStyle]}>
      {/* Main Content Card */}
      <View
        style={[
          styles.contentCard,
          {
            maxWidth: metrics.contentMaxWidth,
            paddingVertical: metrics.isTablet ? 28 : 16,
            paddingHorizontal: metrics.horizontalPadding,
          },
        ]}
      >
        {/* Media Container (Image or Video) */}
        <View
          style={[
            styles.illustrationContainer,
            {
              marginBottom: metrics.isTablet ? 28 : 22,
              height: metrics.illustrationHeight,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.mediaWrapper,
              {
                width: metrics.mediaSize,
                height: metrics.mediaSize,
                shadowOpacity: metrics.isTablet ? 0.16 : 0.12,
              },
              mediaAnimatedStyle,
            ]}
          >
            <Image
              source={item.media}
              style={styles.media}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Decorative Elements */}
          <View
            style={[
              styles.decoration,
              styles.decoration1,
              {
                backgroundColor: item.accentColor + "20",
                width: metrics.mediaSize * 0.62,
                height: metrics.mediaSize * 0.62,
                top: metrics.isTablet ? -8 : -6,
                right: metrics.isTablet ? 12 : 0,
              },
            ]}
          />
          <View
            style={[
              styles.decoration,
              styles.decoration2,
              {
                backgroundColor: item.accentColor + "15",
                width: metrics.mediaSize * 0.34,
                height: metrics.mediaSize * 0.34,
                bottom: metrics.isTablet ? 12 : 8,
                left: metrics.isTablet ? 8 : 0,
              },
            ]}
          />
          <View
            style={[
              styles.decoration,
              styles.decoration3,
              {
                backgroundColor: item.accentColor + "10",
                width: metrics.mediaSize * 0.2,
                height: metrics.mediaSize * 0.2,
                top: metrics.isTablet ? 26 : 18,
                right: metrics.isTablet ? 30 : 18,
              },
            ]}
          />
        </View>

        {/* Text Content */}
        <View
          style={[
            styles.textContainer,
            {
              marginBottom: metrics.isTablet ? 18 : 12,
              paddingHorizontal: metrics.isTablet ? 18 : 8,
              maxWidth: metrics.isTablet ? 640 : 520,
            },
          ]}
        >
          <Animated.Text
            entering={FadeIn.duration(600).delay(200)}
            style={[
              styles.title,
              {
                fontSize: metrics.titleSize,
                lineHeight: metrics.titleLineHeight,
                marginBottom: metrics.isTablet ? 18 : 14,
              },
            ]}
          >
            {item.title}
          </Animated.Text>
          <Animated.Text
            entering={FadeIn.duration(600).delay(400)}
            style={[
              styles.subtitle,
              {
                fontSize: metrics.subtitleSize,
                lineHeight: metrics.subtitleLineHeight,
                maxWidth: metrics.isTablet ? 520 : "100%",
              },
            ]}
          >
            {item.subtitle}
          </Animated.Text>
        </View>

        {/* Floating Elements */}
        <View
          style={[
            styles.floatingElements,
            {
              top: metrics.isTablet ? 22 : 16,
              right: metrics.isTablet ? 18 : 10,
            },
          ]}
        >
          <Animated.View
            entering={FadeIn.duration(800).delay(600)}
            style={[
              styles.floatingDot,
              {
                width: metrics.isTablet ? 9 : 8,
                height: metrics.isTablet ? 9 : 8,
                borderRadius: metrics.isTablet ? 4.5 : 4,
              },
              { backgroundColor: item.accentColor },
            ]}
          />
          <Animated.View
            entering={FadeIn.duration(800).delay(800)}
            style={[
              styles.floatingDot,
              styles.dot2,
              {
                width: metrics.isTablet ? 7 : 6,
                height: metrics.isTablet ? 7 : 6,
                borderRadius: metrics.isTablet ? 3.5 : 3,
              },
              { backgroundColor: item.accentColor + "60" },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  backgroundPattern: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7ebc3",
  },
  itemContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 0,
  },
  contentCard: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  illustrationContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  mediaWrapper: {
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  media: {
    width: "100%",
    height: "100%",
  },
  decoration: {
    position: "absolute",
    borderRadius: 999,
  },
  decoration1: {
    width: 180,
    height: 180,
    top: -20,
    right: -40,
  },
  decoration2: {
    width: 100,
    height: 100,
    bottom: -10,
    left: -20,
  },
  decoration3: {
    width: 60,
    height: 60,
    top: 30,
    right: -10,
  },
  textContainer: {
    alignItems: "center",
    width: "100%",
  },
  title: {
    fontWeight: "800",
    color: "#1F2937",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
  },
  floatingElements: {
    position: "absolute",
  },
  floatingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  dot2: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 12,
  },
  paginationWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
    paddingHorizontal: 8,
  },
  dot: {
    marginHorizontal: 4,
  },
  bottomFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skipButton: {
    paddingVertical: 15,
    paddingHorizontal: 10,
  },
  skipText: {
    color: "#9CA3AF",
    fontWeight: "600",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  nextButtonWrapper: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  nextButton: {
    backgroundColor: "#1F2937",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  nextText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginRight: 8,
  },
  nextIcon: {
    marginLeft: 2,
  },
});
