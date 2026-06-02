// This file contains styles for the intro screen
// It is written in JavaScript and should not have code-fence backticks

import { Dimensions, StyleSheet } from "react-native";

const { width, height } = Dimensions.get("window");

export const introStyles = StyleSheet.create({
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
