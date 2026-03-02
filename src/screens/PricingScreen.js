import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    StatusBar,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const isSmallScreen = screenWidth < 380;
const isTablet = screenWidth > 768;

const COLORS = {
    bg: "#F8FAFC",
    text: "#1E293B",
    textMuted: "#64748B",
    card: "#FFFFFF",
    border: "#E2E8F0",
    primary: "#3B82F6",
    success: "#10B981",
    warning: "#F59E0B",
    dark: "#1E293B",
    light: "#F1F5F9",
    shadow: "rgba(0, 0, 0, 0.08)",
};

const yearlyPlans = [
    {
        key: "trial",
        title: "Free Trial",
        subtitle: "7 Days",
        price: "$0",
        period: "for 7 days",
        description: "Start risk-free with full Professional access",
        accent: COLORS.success,
        cta: "Start Free Trial",
        icon: "gift-outline",
        features: [
            "Full Professional access",
            "Up to 3 staff",
            "All integrations",
            "Email support",
            "After 7 days -> upgrade required",
        ],
        recommended: false,
    },
    {
        key: "basic",
        title: "Basic",
        subtitle: "Yearly",
        price: "$84",
        period: "/ year",
        description: "Best for freelancers",
        accent: COLORS.primary,
        cta: "Choose Basic",
        icon: "person-outline",
        features: [
            "Up to 5 staff",
            "Leads, Enquiries, Call Logs",
            "Basic Reporting",
            "Email OTP Login",
            "Community Support",
            "10,000 records limit",
        ],
        recommended: false,
    },
    {
        key: "pro",
        title: "Professional",
        subtitle: "Yearly",
        price: "$276",
        period: "/ year",
        description: "Best for growing teams",
        badge: "Most Popular",
        accent: COLORS.warning,
        cta: "Upgrade to Professional",
        icon: "star-outline",
        features: [
            "Up to 25 staff",
            "Advanced Reporting",
            "Automated Follow-ups",
            "WhatsApp Integration",
            "Templates",
            "Role-Based Access",
            "Scheduled Exports",
            "Audit Logs",
            "Phone Support",
            "100,000 record limit",
        ],
        recommended: true,
    },
    {
        key: "enterprise",
        title: "Enterprise",
        subtitle: "Custom",
        price: "Custom",
        period: "pricing",
        description: "For larger organizations",
        accent: COLORS.dark,
        cta: "Contact Sales",
        icon: "business-outline",
        features: [
            "Unlimited staff",
            "SSO / SCIM",
            "Dedicated Manager",
            "SLA",
            "Custom Integrations",
            "Data Migration Help",
        ],
        recommended: false,
    },
];

const PlanCard = ({ plan, index }) => {
    const cardWidth = isTablet ? (screenWidth - 60) / 2 : screenWidth - 32;
    
    return (
        <View style={[styles.planCardContainer, { width: cardWidth }]}>
            <View style={[
                styles.planCard, 
                plan.recommended && styles.planCardRecommended,
                plan.recommended && { borderColor: plan.accent, borderWidth: 2 }
            ]}>
                {/* Header with Badge */}
                <View style={styles.cardHeader}>
                    <View style={styles.titleRow}>
                        <View style={[styles.iconWrapper, { backgroundColor: `${plan.accent}15` }]}>
                            <Ionicons name={plan.icon} size={24} color={plan.accent} />
                        </View>
                        {plan.badge && (
                            <View style={[styles.badge, { backgroundColor: plan.accent }]}>
                                <Text style={styles.badgeText}>{plan.badge}</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.cardTitle}>{plan.title}</Text>
                    <Text style={styles.cardSubtitle}>{plan.subtitle}</Text>
                </View>

                {/* Price Section */}
                <View style={styles.priceSection}>
                    <Text style={styles.price}>{plan.price}</Text>
                    <Text style={styles.period}>{plan.period}</Text>
                </View>

                {/* Description */}
                <Text style={styles.description}>{plan.description}</Text>

                {/* Features List */}
                <View style={styles.featuresContainer}>
                    {plan.features.map((feature, idx) => (
                        <View key={idx} style={styles.featureRow}>
                            <View style={[styles.checkIcon, { borderColor: plan.accent }]}>
                                <Ionicons name="checkmark" size={10} color={plan.accent} />
                            </View>
                            <Text style={styles.featureText}>{feature}</Text>
                        </View>
                    ))}
                </View>

                {/* CTA Button */}
                <TouchableOpacity
                    style={[styles.ctaButton, { backgroundColor: plan.accent }]}
                    activeOpacity={0.8}
                >
                    <Text style={styles.ctaText}>{plan.cta}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default function PricingScreen() {
    const [hoveredPlan, setHoveredPlan] = useState(null);

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
            
            {/* Background Gradient */}
            <LinearGradient
                colors={["#F8FAFC", "#F1F5F9", "#E2E8F0"]}
                style={styles.background}
            />

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Choose Your Plan</Text>
                <Text style={styles.headerSub}>
                    Start with a 7-day free trial. No credit card required.
                </Text>
            </View>

            {/* All Plans Container */}
            <ScrollView 
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.plansGrid}>
                    {yearlyPlans.map((plan, index) => (
                        <PlanCard 
                            key={plan.key} 
                            plan={plan} 
                            index={index}
                        />
                    ))}
                </View>

                {/* Comparison Note */}
                <View style={styles.comparisonNote}>
                    <Ionicons name="information-circle-outline" size={20} color={COLORS.textMuted} />
                    <Text style={styles.comparisonText}>
                        All features listed above are included in each plan. 
                        Upgrade or downgrade anytime based on your needs.
                    </Text>
                </View>

                {/* Bottom CTA */}
                <View style={styles.bottomAction}>
                    <TouchableOpacity style={styles.trialButton} activeOpacity={0.9}>
                        <LinearGradient
                            colors={[COLORS.success, "#059669"]}
                            style={styles.trialButtonGradient}
                        >
                            <Ionicons name="flame" size={20} color="#FFFFFF" />
                            <Text style={styles.trialButtonText}>Start 7-Day Free Trial</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                    <Text style={styles.bottomNote}>Cancel anytime • No hidden fees</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    header: {
        paddingTop: 30,
        paddingHorizontal: 24,
        alignItems: 'center',
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: isSmallScreen ? 26 : 28,
        fontWeight: '700',
        color: COLORS.text,
        textAlign: 'center',
    },
    headerSub: {
        fontSize: isSmallScreen ? 14 : 15,
        color: COLORS.textMuted,
        textAlign: 'center',
        marginTop: 8,
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    plansGrid: {
        flexDirection: isTablet ? 'row' : 'column',
        flexWrap: isTablet ? 'wrap' : 'nowrap',
        justifyContent: isTablet ? 'space-between' : 'center',
        paddingHorizontal: 16,
        gap: isTablet ? 20 : 16,
    },
    planCardContainer: {
        marginBottom: isTablet ? 0 : 16,
    },
    planCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 20,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
        borderWidth: 1,
        borderColor: COLORS.border,
        height: '100%',
        minHeight: 600,
    },
    planCardRecommended: {
        shadowColor: COLORS.warning,
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        transform: [{ scale: 1.02 }],
    },
    cardHeader: {
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    iconWrapper: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
    },
    badgeText: {
        color: "#FFFFFF",
        fontWeight: '700',
        fontSize: 10,
        letterSpacing: 0.5,
    },
    cardTitle: {
        fontSize: 22,
        color: COLORS.text,
        fontWeight: '700',
    },
    cardSubtitle: {
        marginTop: 2,
        color: COLORS.textMuted,
        fontSize: 13,
        fontWeight: '500',
    },
    priceSection: {
        alignItems: 'center',
        marginBottom: 12,
    },
    price: {
        fontSize: 32,
        color: COLORS.text,
        fontWeight: '700',
    },
    period: {
        fontSize: 14,
        color: COLORS.textMuted,
        fontWeight: '500',
    },
    description: {
        fontSize: 13,
        color: COLORS.textMuted,
        textAlign: 'center',
        marginBottom: 20,
        fontWeight: '500',
    },
    featuresContainer: {
        flex: 1,
        marginBottom: 20,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    checkIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        backgroundColor: COLORS.card,
    },
    featureText: {
        fontSize: 13,
        color: COLORS.text,
        fontWeight: '500',
        flex: 1,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 6,
    },
    ctaText: {
        color: "#FFFFFF",
        fontWeight: '700',
        fontSize: 15,
    },
    comparisonNote: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingVertical: 20,
        backgroundColor: `${COLORS.light}50`,
        marginHorizontal: 24,
        borderRadius: 12,
        marginTop: 20,
    },
    comparisonText: {
        fontSize: 13,
        color: COLORS.textMuted,
        fontWeight: '500',
        marginLeft: 8,
        flex: 1,
        lineHeight: 18,
    },
    bottomAction: {
        paddingHorizontal: 24,
        paddingVertical: 20,
        alignItems: 'center',
        marginTop: 10,
    },
    trialButton: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: COLORS.success,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    trialButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    trialButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    bottomNote: {
        fontSize: 13,
        color: COLORS.textMuted,
        fontWeight: '500',
    },
});