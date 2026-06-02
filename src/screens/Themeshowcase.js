import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
    Dimensions,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width } = Dimensions.get("window");

// Theme definitions
const THEME_PALETTE = {
  light: {
    name: "DataVista",
    description: "Light theme • Professional & Fresh",
    colors: {
      primary: "#0066FF",
      accent1: "#FF4081",
      accent2: "#FF9500",
      accent3: "#00C853",
      accent4: "#6366F1",
      accent5: "#00BCD4",
    },
    bg: "#FAFBFC",
    samples: [
      { name: "Primary", hex: "#0066FF" },
      { name: "Accent 1", hex: "#FF4081" },
      { name: "Accent 2", hex: "#FF9500" },
      { name: "Accent 3", hex: "#00C853" },
      { name: "Accent 4", hex: "#6366F1" },
      { name: "Accent 5", hex: "#00BCD4" },
    ],
  },
  dark: {
    name: "AnalyticsHub",
    description: "Dark theme • Premium & Modern",
    colors: {
      primary: "#00D4FF",
      accent1: "#FF6B9D",
      accent2: "#FFA500",
      accent3: "#00FF88",
      accent4: "#6366F1",
      accent5: "#00D4FF",
    },
    bg: "#0F0F1E",
    samples: [
      { name: "Primary", hex: "#00D4FF" },
      { name: "Accent 1", hex: "#FF6B9D" },
      { name: "Accent 2", hex: "#FFA500" },
      { name: "Accent 3", hex: "#00FF88" },
      { name: "Accent 4", hex: "#6366F1" },
      { name: "Accent 5", hex: "#00D4FF" },
    ],
  },
  professional: {
    name: "ChartSphere",
    description: "Professional • Corporate & Trustworthy",
    colors: {
      primary: "#1E5FFF",
      accent1: "#FF6B8A",
      accent2: "#FFA940",
      accent3: "#13C2C2",
      accent4: "#722ED1",
      accent5: "#2F54EB",
    },
    bg: "#F8F9FB",
    samples: [
      { name: "Primary", hex: "#1E5FFF" },
      { name: "Accent 1", hex: "#FF6B8A" },
      { name: "Accent 2", hex: "#FFA940" },
      { name: "Accent 3", hex: "#13C2C2" },
      { name: "Accent 4", hex: "#722ED1" },
      { name: "Accent 5", hex: "#2F54EB" },
    ],
  },
};

function ColorSwatch({ name, hex }) {
  return (
    <View style={styles.colorSwatchContainer}>
      <View style={[styles.colorSwatchBox, { backgroundColor: hex }]} />
      <Text style={styles.colorSwatchName}>{name}</Text>
      <Text style={styles.colorSwatchHex}>{hex}</Text>
    </View>
  );
}

function ThemeCard({ theme, index, isSelected, onSelect }) {
  return (
    <TouchableOpacity
      style={[
        styles.themeCard,
        isSelected && styles.themeCardSelected,
        { backgroundColor: theme.bg },
      ]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View style={styles.themeCardHeader}>
        <Text style={styles.themeCardName}>{theme.name}</Text>
        {isSelected && (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={theme.colors.primary}
          />
        )}
      </View>
      <Text style={styles.themeCardDescription}>{theme.description}</Text>

      <View style={styles.themeCardColors}>
        {theme.samples.map((sample, idx) => (
          <View
            key={idx}
            style={[
              styles.themeCardColorDot,
              { backgroundColor: sample.hex, borderColor: theme.bg },
            ]}
          />
        ))}
      </View>
    </TouchableOpacity>
  );
}

function MetricPreview({ theme, title }) {
  return (
    <View style={[styles.metricPreview, { backgroundColor: theme.bg }]}>
      <Text style={styles.previewTitle}>{title}</Text>
      <View style={styles.previewMetricsGrid}>
        {theme.samples.slice(0, 4).map((sample, idx) => (
          <View key={idx} style={styles.previewMetric}>
            <View
              style={[
                styles.previewMetricIcon,
                { backgroundColor: sample.hex + "20" },
              ]}
            >
              <Ionicons name="trending-up" size={14} color={sample.hex} />
            </View>
            <Text style={styles.previewMetricLabel}>{sample.name}</Text>
            <Text style={[styles.previewMetricValue, { color: sample.hex }]}>
              ₹2.5K
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NameSuggestions() {
  const suggestions = {
    "🎯 Professional": [
      "InsightBoard",
      "DataVista",
      "MetricFlow",
      "ChartSphere",
      "AnalyticsHub",
    ],
    "🚀 Modern/Tech": [
      "DashNova",
      "Graphify",
      "VizionX",
      "DataForge",
      "PixelMetrics",
    ],
    "📈 Finance": [
      "TradeVista",
      "MarketPulse",
      "EquityBoard",
      "AlphaCharts",
      "TrendWise",
    ],
    "⚡ Short & Catchy": ["DashPro", "VizPro", "DataX", "Chartly", "Analytix"],
  };

  return (
    <View style={styles.suggestionsContainer}>
      {Object.entries(suggestions).map(([category, names]) => (
        <View key={category} style={styles.suggestionGroup}>
          <Text style={styles.suggestionGroupTitle}>{category}</Text>
          <View style={styles.suggestionList}>
            {names.map((name, idx) => (
              <View key={idx} style={styles.suggestionBadge}>
                <Text style={styles.suggestionText}>{name}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ViewModeShowcase({ theme }) {
  const viewModes = [
    {
      name: "🎯 Compact",
      desc: "Quick metrics view",
      layout: "horizontal",
    },
    {
      name: "📈 Expanded",
      desc: "Detailed analysis",
      layout: "grid",
    },
    {
      name: "📊 Analytical",
      desc: "Executive dashboard",
      layout: "columns",
    },
  ];

  return (
    <View style={styles.viewModeContainer}>
      {viewModes.map((mode, idx) => (
        <View
          key={idx}
          style={[styles.viewModeCard, { backgroundColor: theme.bg }]}
        >
          <Text style={styles.viewModeName}>{mode.name}</Text>
          <Text style={styles.viewModeDesc}>{mode.desc}</Text>
          <View style={styles.viewModePreview} />
        </View>
      ))}
    </View>
  );
}

export default function ThemeShowcase() {
  const [selectedTheme, setSelectedTheme] = useState("light");

  const currentTheme = THEME_PALETTE[selectedTheme];
  const isDark = selectedTheme === "dark";

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: currentTheme.bg }]}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <ScrollView
        style={[styles.container, { backgroundColor: currentTheme.bg }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text
            style={[styles.headerTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            Dashboard Theme Showcase
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: isDark ? "#aaa" : "#666" }]}
          >
            Select a theme to preview
          </Text>
        </View>

        {/* Theme Selector */}
        <View style={styles.themeSelector}>
          {Object.entries(THEME_PALETTE).map(([key, theme]) => (
            <ThemeCard
              key={key}
              theme={theme}
              isSelected={selectedTheme === key}
              onSelect={() => setSelectedTheme(key)}
            />
          ))}
        </View>

        {/* Color Palette */}
        <View style={styles.sectionContainer}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            {currentTheme.name} Colors
          </Text>
          <View style={styles.colorGrid}>
            {currentTheme.samples.map((sample, idx) => (
              <ColorSwatch key={idx} name={sample.name} hex={sample.hex} />
            ))}
          </View>
        </View>

        {/* Metric Preview */}
        <View style={styles.sectionContainer}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            Component Preview
          </Text>
          <MetricPreview theme={currentTheme} title="Sales Metrics" />
        </View>

        {/* View Modes */}
        <View style={styles.sectionContainer}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            View Modes
          </Text>
          <ViewModeShowcase theme={currentTheme} />
        </View>

        {/* Name Suggestions */}
        <View style={styles.sectionContainer}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            Brand Name Ideas
          </Text>
          <NameSuggestions />
        </View>

        {/* Features */}
        <View style={styles.sectionContainer}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            Key Features
          </Text>
          <View style={styles.featureList}>
            {[
              "✨ Multi-theme support",
              "🎨 Beautiful gradient effects",
              "📱 Fully responsive design",
              "⚡ High performance",
              "🎯 3 view modes",
              "♿ Accessibility optimized",
            ].map((feature, idx) => (
              <View key={idx} style={styles.featureItem}>
                <Text
                  style={[
                    styles.featureText,
                    { color: isDark ? "#fff" : "#000" },
                  ]}
                >
                  {feature}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Info Card */}
        <LinearGradient
          colors={[
            currentTheme.colors.primary + "20",
            currentTheme.colors.primary + "05",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.infoCard,
            { borderColor: currentTheme.colors.primary },
          ]}
        >
          <Ionicons
            name="information-circle"
            size={20}
            color={currentTheme.colors.primary}
          />
          <View style={styles.infoContent}>
            <Text
              style={[styles.infoTitle, { color: isDark ? "#fff" : "#000" }]}
            >
              Three Powerful Themes
            </Text>
            <Text
              style={[styles.infoText, { color: isDark ? "#aaa" : "#666" }]}
            >
              Switch between Light (DataVista), Dark (AnalyticsHub), and
              Professional (ChartSphere) themes with one tap. Each theme
              includes multiple view modes for optimal data visualization.
            </Text>
          </View>
        </LinearGradient>

        {/* Theme Details */}
        <View style={styles.sectionContainer}>
          <Text
            style={[styles.sectionTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            {currentTheme.name} Details
          </Text>
          <View
            style={[
              styles.detailsCard,
              { backgroundColor: isDark ? "#1a1a2e" : "#f5f5f5" },
            ]}
          >
            <View style={styles.detailRow}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: isDark ? "#aaa" : "#666" },
                ]}
              >
                Theme
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: isDark ? "#fff" : "#000" },
                ]}
              >
                {currentTheme.name}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: isDark ? "#aaa" : "#666" },
                ]}
              >
                Primary Color
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: currentTheme.colors.primary },
                ]}
              >
                {currentTheme.colors.primary}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: isDark ? "#aaa" : "#666" },
                ]}
              >
                Accent Colors
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: isDark ? "#fff" : "#000" },
                ]}
              >
                6 vibrant options
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text
                style={[
                  styles.detailLabel,
                  { color: isDark ? "#aaa" : "#666" },
                ]}
              >
                View Modes
              </Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: isDark ? "#fff" : "#000" },
                ]}
              >
                Compact, Expanded, Analytical
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 24,
  },

  header: {
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },

  themeSelector: {
    gap: 12,
  },
  themeCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  themeCardSelected: {
    borderColor: "#0066FF",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  themeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  themeCardName: {
    fontSize: 16,
    fontWeight: "800",
  },
  themeCardDescription: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.7,
    marginBottom: 10,
  },
  themeCardColors: {
    flexDirection: "row",
    gap: 8,
  },
  themeCardColorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
  },

  sectionContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },

  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorSwatchContainer: {
    flexGrow: 1,
    flexBasis: "48%",
    alignItems: "center",
    gap: 8,
  },
  colorSwatchBox: {
    width: "100%",
    height: 80,
    borderRadius: 12,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  colorSwatchName: {
    fontSize: 12,
    fontWeight: "700",
  },
  colorSwatchHex: {
    fontSize: 11,
    fontWeight: "500",
    opacity: 0.6,
  },

  metricPreview: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
  },
  previewMetricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  previewMetric: {
    flexGrow: 1,
    flexBasis: "48%",
    alignItems: "center",
    gap: 8,
  },
  previewMetricIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  previewMetricLabel: {
    fontSize: 10,
    fontWeight: "600",
    opacity: 0.7,
  },
  previewMetricValue: {
    fontSize: 14,
    fontWeight: "800",
  },

  viewModeContainer: {
    gap: 12,
  },
  viewModeCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  viewModeName: {
    fontSize: 13,
    fontWeight: "800",
  },
  viewModeDesc: {
    fontSize: 11,
    fontWeight: "500",
    opacity: 0.6,
    marginVertical: 6,
  },
  viewModePreview: {
    height: 60,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  suggestionsContainer: {
    gap: 16,
  },
  suggestionGroup: {
    gap: 8,
  },
  suggestionGroupTitle: {
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.8,
  },
  suggestionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionBadge: {
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: "600",
  },

  featureList: {
    gap: 10,
  },
  featureItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 8,
  },
  featureText: {
    fontSize: 12,
    fontWeight: "600",
  },

  infoCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  infoText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
  },

  detailsCard: {
    borderRadius: 12,
    padding: 14,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 12,
    fontWeight: "800",
  },
});
