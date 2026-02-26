import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";

const { width, height } = Dimensions.get("window");

export default function TrendingIntroScreen({ navigation }) {
  const { isLoggedIn, onboardingCompleted } = useAuth();
  // 1. Logo Animation (Breathing Effect)
  const breatheAnim = useRef(new Animated.Value(1)).current;

  // 2. Scanning Line Animation
  const scanLineY = useRef(new Animated.Value(-100)).current;
  const scanLineOpacity = useRef(new Animated.Value(0)).current;

  // 3. Text Animations (Slide Up + Fade)
  const titleY = useRef(new Animated.Value(20)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  // 4. Glow/Ring Animation (Behind the logo)
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // --- A. Start the Breathing Loop (Infinite) ---
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1.05, // Scale up slightly
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 1, // Scale back to normal
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    breatheLoop.start();

    // --- B. Start the Ring Pulse Loop (Infinite) ---
    const ringLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.4,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(ringScale, {
          toValue: 0.8, // Reset instantly without animation
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0.6, // Reset instantly
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    ringLoop.start();

    // --- C. Scanning Beam Animation (One time) ---
    Animated.sequence([
      Animated.timing(scanLineOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(scanLineY, {
        toValue: height + 100,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(scanLineOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // --- D. Text Entrance (Staggered) ---
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(titleY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
    }, 600);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(taglineY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();
    }, 900);

    // --- E. Navigation ---
    const timer = setTimeout(() => {
      if (!onboardingCompleted) {
        navigation.replace("Onboarding");
      } else if (isLoggedIn) {
        navigation.replace("Main");
      } else {
        navigation.replace("Login");
      }
    }, 1800);

    return () => {
      clearTimeout(timer);
      breatheLoop.stop();
      ringLoop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Glow (Optional gradient for depth) */}
      <View style={styles.backgroundGlow} />

      {/* Scanning Beam */}
      <Animated.View
        style={[
          styles.scanLine,
          {
            transform: [{ translateY: scanLineY }],
            opacity: scanLineOpacity,
          },
        ]}
      />

      {/* Content */}
      <View style={styles.contentCenter}>
        {/* Pulsing Ring behind logo */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />

        {/* Main Logo */}
        <View style={styles.logoWrapper}>
          <Animated.Image
            source={require("../assets/logo.png")}
            style={[
              styles.logoImage,
              {
                transform: [{ scale: breatheAnim }],
              },
            ]}
          />
        </View>

        {/* Text Section */}
        <View style={styles.textContainer}>
          <Animated.Text
            style={[
              styles.titleText,
              {
                opacity: titleOpacity,
                transform: [{ translateY: titleY }],
              },
            ]}
          >
            Neophron
          </Animated.Text>

          <Animated.Text
            style={[
              styles.taglineText,
              {
                opacity: taglineOpacity,
                transform: [{ translateY: taglineY }],
              },
            ]}
          >
            Technologies
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000", // Pure Black for Trending Dark Mode
    justifyContent: "center",
    alignItems: "center",
  },
  backgroundGlow: {
    position: "absolute",
    width: width,
    height: height,
    backgroundColor: "#0a0a0a", // Very dark grey for depth
    opacity: 0.5,
  },
  contentCenter: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  // The pulsing ring behind the image
  glowRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "#00F0FF", // Cyber Cyan
    shadowColor: "#00F0FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  logoWrapper: {
    width: 150,
    height: 150,
    borderRadius: 100, // Circular
    borderWidth: 2,
    borderColor: "#333", // Subtle border
    backgroundColor: "#000000ff",
    // Shadow for neon glow effect
    shadowColor: "#030303ff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
    padding: 10,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: 100,
    height: 100,
    padding: 10,
  },
  textContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  titleText: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 10, // Wide spacing is trendy
    textTransform: "uppercase",
    fontFamily: "System", // Use custom font like 'Inter-Black' for best results
  },
  taglineText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888888",
    letterSpacing: 6,
    marginTop: 10,
    textTransform: "uppercase",
  },
  // Cinematic scanning line
  scanLine: {
    position: "absolute",
    left: 0,
    width: width,
    height: 2,
    backgroundColor: "#00F0FF",
    shadowColor: "#00F0FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    zIndex: 20,
  },
});
