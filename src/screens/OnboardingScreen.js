import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    Dimensions,
    FlatList,
    Image,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View
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
    withTiming
} from "react-native-reanimated";
import { useAuth } from "../contexts/AuthContext";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

const DATA = [
    {
        id: "1",
        title: "Unify Your Sales Pipeline",
        subtitle: "Bring all your enquiries into one powerful dashboard. No more messy spreadsheets.",
        media: require("../assets/introimage/intro1.gif"),
        type: "image",
        accentColor: "#6C5DD3", // Matching HomeScreen primary
    },
    {
        id: "2",
        title: "Never Miss a Follow-up",
        subtitle: "Schedule calls, track status, and close deals with timely reminders and actions.",
        media: require("../assets/introimage/intro2.gif"),
        type: "image",
        accentColor: "#FF6B9D", // Matching HomeScreen pink/accent
    },
    {
        id: "3",
        title: "Visualize Your Growth",
        subtitle: "Track monthly revenue, conversion rates, and pipeline health at a glance.",
        media: require("../assets/introimage/intro3.gif"),
        type: "image",
        accentColor: "#00D9A3", // Matching HomeScreen success
    },
];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function OnboardingScreen({ navigation }) {
    // ... (rest of the component logic remains mostly the same until renderItem)
    const { completeOnboarding, isLoggedIn } = useAuth();
    const { width, height } = useWindowDimensions();
    const flatListRef = useAnimatedRef();
    const scrollX = useSharedValue(0);
    const [currentIndex, setCurrentIndex] = useState(0);
    const buttonScale = useSharedValue(1);
    const buttonOpacity = useSharedValue(1);

    const onViewableItemsChanged = useCallback(({ viewableItems }) => {
        if (viewableItems && viewableItems.length > 0 && viewableItems[0].index !== null) {
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
            withSpring(1, { damping: 15, stiffness: 300 })
        );

        buttonOpacity.value = withSequence(
            withTiming(0.7, { duration: 100 }),
            withTiming(1, { duration: 200 })
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

    const renderItem = useCallback(({ item, index }) => {
        return <OnboardItem item={item} index={index} scrollX={scrollX} width={width} />;
    }, [scrollX, width]);

    const getItemLayout = useCallback((_, index) => ({
        length: width,
        offset: width * index,
        index,
    }), [width]);

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
                {DATA.map((_, i) => {
                    const animatedDotStyle = useAnimatedStyle(() => {
                        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];

                        const widthAnim = interpolate(
                            scrollX.value,
                            inputRange,
                            [6, 32, 6],
                            Extrapolation.CLAMP
                        );

                        const opacity = interpolate(
                            scrollX.value,
                            inputRange,
                            [0.4, 1, 0.4],
                            Extrapolation.CLAMP
                        );

                        return {
                            width: widthAnim,
                            height: 6,
                            backgroundColor: i === currentIndex ? "#1F2937" : "#D1D5DB",
                            opacity,
                            borderRadius: 3,
                        };
                    });

                    return (
                        <Animated.View
                            key={i}
                            style={[styles.dot, animatedDotStyle]}
                        />
                    );
                })}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent />

            {/* Subtle Background Pattern */}
            <View style={styles.backgroundPattern}>
                {[...Array(20)].map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.patternDot,
                            {
                                left: Math.random() * width,
                                top: Math.random() * height,
                                opacity: Math.random() * 0.1 + 0.05,
                            }
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
            <View style={styles.paginationWrapper}>
                <Pagination />
            </View>

            {/* Bottom Footer */}
            <View style={styles.bottomFooter}>
                <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                    <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleNext}
                    activeOpacity={0.8}
                    style={styles.nextButtonWrapper}
                >
                    <Animated.View style={[styles.nextButton, nextButtonAnimatedStyle]}>
                        <Text style={styles.nextText}>
                            {currentIndex === DATA.length - 1 ? "Get Started" : "Next"}
                        </Text>
                        <Ionicons
                            name={currentIndex === DATA.length - 1 ? "arrow-forward" : "chevron-forward"}
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
const OnboardItem = ({ item, index, scrollX, width }) => {
    const iconScale = useSharedValue(0.5);
    const cardOpacity = useSharedValue(0);
    const translateY = useSharedValue(50);

    useEffect(() => {
        iconScale.value = withSpring(1, { damping: 15, stiffness: 200 });
        cardOpacity.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) });
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

        const translateX = interpolate(
            scrollX.value,
            inputRange,
            [width * 0.7, 0, -width * 0.7],
            Extrapolation.CLAMP
        );

        const scale = interpolate(
            scrollX.value,
            inputRange,
            [0.85, 1, 0.85],
            Extrapolation.CLAMP
        );

        return {
            transform: [
                { translateX },
                { scale },
                { translateY: translateY.value }
            ],
            opacity: cardOpacity.value,
        };
    });

    const mediaAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: iconScale.value }]
    }));

    return (
        <Animated.View style={[styles.itemContainer, { width }, animatedStyle]}>
            {/* Main Content Card */}
            <View style={styles.contentCard}>
                {/* Media Container (Image or Video) */}
                <View style={styles.illustrationContainer}>
                    <Animated.View style={[styles.mediaWrapper, mediaAnimatedStyle]}>
                        <Image
                            source={item.media}
                            style={styles.media}
                            resizeMode="contain"
                        />
                    </Animated.View>

                    {/* Decorative Elements */}
                    <View style={[styles.decoration, styles.decoration1, { backgroundColor: item.accentColor + '20' }]} />
                    <View style={[styles.decoration, styles.decoration2, { backgroundColor: item.accentColor + '15' }]} />
                    <View style={[styles.decoration, styles.decoration3, { backgroundColor: item.accentColor + '10' }]} />
                </View>

                {/* Text Content */}
                <View style={styles.textContainer}>
                    <Animated.Text
                        entering={FadeIn.duration(600).delay(200)}
                        style={styles.title}
                    >
                        {item.title}
                    </Animated.Text>
                    <Animated.Text
                        entering={FadeIn.duration(600).delay(400)}
                        style={styles.subtitle}
                    >
                        {item.subtitle}
                    </Animated.Text>
                </View>

                {/* Floating Elements */}
                <View style={styles.floatingElements}>
                    <Animated.View
                        entering={FadeIn.duration(800).delay(600)}
                        style={[styles.floatingDot, { backgroundColor: item.accentColor }]}
                    />
                    <Animated.View
                        entering={FadeIn.duration(800).delay(800)}
                        style={[styles.floatingDot, styles.dot2, { backgroundColor: item.accentColor + '60' }]}
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
        paddingHorizontal: 40,
    },
    contentCard: {
        width: "100%",
        alignItems: "center",
        paddingVertical: 50,
    },
    illustrationContainer: {
        position: "relative",
        marginBottom: 40,
        alignItems: "center",
        justifyContent: "center",
        height: 320,
        width: "100%",
    },
    mediaWrapper: {
        width: 300,
        height: 300,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        // borderRadius: 20,
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
        marginBottom: 40,
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 32,
        fontWeight: "800",
        color: "#1F2937",
        textAlign: "center",
        marginBottom: 16,
        letterSpacing: -0.5,
        lineHeight: 40,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: "500",
        color: "#6B7280",
        textAlign: "center",
        lineHeight: 24,
        paddingHorizontal: 10,
    },
    floatingElements: {
        position: "absolute",
        top: 40,
        right: 30,
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
        top: "75%",
        left: 0,
        right: 0,
        alignItems: "center",
    },
    paginationContainer: {
        flexDirection: "row",
        alignItems: "center",
        height: 20,
    },
    dot: {
        marginHorizontal: 4,
    },
    bottomFooter: {
        position: "absolute",
        bottom: 50,
        left: 0,
        right: 0,
        paddingHorizontal: 40,
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