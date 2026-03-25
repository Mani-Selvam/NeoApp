import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    SkeletonBox,
    SkeletonCard,
    SkeletonCircle,
    SkeletonLine,
    SkeletonPulse,
    SkeletonSpacer,
    SKELETON_COLORS,
} from "./Skeleton";

export function ScreenSkeleton({ children, bg = SKELETON_COLORS.bg, style }) {
    return (
        <SafeAreaView style={[styles.screen, { backgroundColor: bg }, style]}>
            <SkeletonPulse>{children}</SkeletonPulse>
        </SafeAreaView>
    );
}

export function HomeSkeleton() {
    return (
        <ScreenSkeleton>
            <View style={styles.pad}>
                <View style={styles.rowBetween}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <SkeletonLine width="68%" height={14} />
                        <SkeletonSpacer h={10} />
                        <SkeletonLine width="44%" height={18} />
                    </View>
                    <SkeletonCircle size={44} />
                </View>

                <SkeletonSpacer h={18} />

                <View style={styles.rowBetween}>
                    {[0, 1, 2].map((i) => (
                        <SkeletonCard key={i} style={styles.statCard}>
                            <SkeletonLine width="55%" height={12} />
                            <SkeletonSpacer h={10} />
                            <SkeletonLine width="35%" height={20} />
                            <SkeletonSpacer h={8} />
                            <SkeletonLine width="75%" height={10} />
                        </SkeletonCard>
                    ))}
                </View>

                <SkeletonSpacer h={16} />

                <SkeletonCard>
                    <SkeletonLine width="42%" height={14} />
                    <SkeletonSpacer h={14} />
                    <SkeletonBox height={140} radius={16} color={SKELETON_COLORS.highlight} />
                    <SkeletonSpacer h={14} />
                    <View style={styles.rowBetween}>
                        <SkeletonLine width="38%" height={12} />
                        <SkeletonLine width="22%" height={12} />
                    </View>
                </SkeletonCard>

                <SkeletonSpacer h={16} />

                <SkeletonCard>
                    <SkeletonLine width="38%" height={14} />
                    <SkeletonSpacer h={14} />
                    <ListSkeleton count={5} itemHeight={62} withAvatar />
                </SkeletonCard>
            </View>
        </ScreenSkeleton>
    );
}

export function EnquirySkeleton() {
    return (
        <ScreenSkeleton>
            <View style={styles.pad}>
                <HeaderSkeleton />
                <SkeletonSpacer h={14} />
                <SkeletonCard style={{ borderRadius: 22 }}>
                    <SkeletonLine width="36%" height={14} />
                    <SkeletonSpacer h={12} />
                    <SkeletonBox height={48} radius={16} />
                    <SkeletonSpacer h={12} />
                    <View style={styles.rowBetween}>
                        {[0, 1, 2].map((i) => (
                            <SkeletonBox
                                key={i}
                                width="30%"
                                height={34}
                                radius={999}
                                color={SKELETON_COLORS.highlight}
                            />
                        ))}
                    </View>
                </SkeletonCard>
                <SkeletonSpacer h={16} />
                <SkeletonCard style={{ borderRadius: 22 }}>
                    <ListSkeleton count={6} itemHeight={96} withAvatar />
                </SkeletonCard>
            </View>
        </ScreenSkeleton>
    );
}

export function FollowUpSkeleton() {
    return (
        <ScreenSkeleton>
            <View style={styles.pad}>
                <HeaderSkeleton />
                <SkeletonSpacer h={14} />
                <SkeletonCard style={{ borderRadius: 22 }}>
                    <SkeletonLine width="42%" height={14} />
                    <SkeletonSpacer h={12} />
                    <SkeletonBox height={48} radius={16} />
                    <SkeletonSpacer h={12} />
                    <View style={[styles.rowBetween, { justifyContent: "flex-start", gap: 8 }]}>
                        {[92, 92, 96].map((w, i) => (
                            <SkeletonBox
                                key={i}
                                width={w}
                                height={30}
                                radius={999}
                                color={SKELETON_COLORS.highlight}
                            />
                        ))}
                    </View>
                </SkeletonCard>
                <SkeletonSpacer h={16} />
                <SkeletonCard style={{ borderRadius: 22 }}>
                    <ListSkeleton count={6} itemHeight={88} withAvatar />
                </SkeletonCard>
            </View>
        </ScreenSkeleton>
    );
}

export function HeaderSkeleton({ withAvatar = true }) {
    return (
        <View style={[styles.rowBetween, { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }]}>
            <SkeletonCircle size={36} />
            <SkeletonLine width="42%" height={14} />
            {withAvatar ? <SkeletonCircle size={34} /> : <View style={{ width: 34 }} />}
        </View>
    );
}

export function ListSkeleton({ count = 7, itemHeight = 64, withAvatar = false }) {
    return (
        <View style={{ gap: 12 }}>
            {Array.from({ length: count }).map((_, idx) => (
                <View key={idx} style={styles.listRow}>
                    {withAvatar ? <SkeletonCircle size={40} /> : null}
                    <View style={{ flex: 1 }}>
                        <SkeletonLine width={idx % 2 === 0 ? "62%" : "50%"} height={12} />
                        <SkeletonSpacer h={10} />
                        <SkeletonLine width={idx % 3 === 0 ? "86%" : "74%"} height={10} />
                    </View>
                    <SkeletonBox width={60} height={24} radius={999} color={SKELETON_COLORS.highlight} />
                </View>
            ))}
        </View>
    );
}

export function PricingSkeleton() {
    return (
        <View style={{ paddingTop: 14 }}>
            <View style={{ gap: 12 }}>
                {[0, 1, 2].map((i) => (
                    <SkeletonCard key={i} style={{ borderRadius: 20 }}>
                        <View style={styles.rowBetween}>
                            <View style={{ flex: 1, paddingRight: 12 }}>
                                <SkeletonLine width="55%" height={14} />
                                <SkeletonSpacer h={10} />
                                <SkeletonLine width="34%" height={22} />
                            </View>
                            <SkeletonBox width={62} height={26} radius={999} color={SKELETON_COLORS.highlight} />
                        </View>
                        <SkeletonSpacer h={14} />
                        <View style={styles.rowBetween}>
                            <SkeletonLine width="26%" height={10} />
                            <SkeletonLine width="22%" height={10} />
                            <SkeletonLine width="18%" height={10} />
                        </View>
                    </SkeletonCard>
                ))}
            </View>
        </View>
    );
}

export function FormSkeleton({ fields = 7 }) {
    return (
        <View style={{ gap: 14 }}>
            {Array.from({ length: fields }).map((_, idx) => (
                <View key={idx}>
                    <SkeletonLine width="34%" height={10} />
                    <SkeletonSpacer h={10} />
                    <SkeletonBox height={46} radius={14} color={SKELETON_COLORS.highlight} />
                </View>
            ))}
            <SkeletonSpacer h={6} />
            <SkeletonBox height={48} radius={16} />
        </View>
    );
}

export function ChatSkeleton() {
    const widths = ["68%", "54%", "76%", "60%", "72%", "48%", "80%", "58%"];
    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 12 }}>
            {widths.map((w, idx) => (
                <View
                    key={idx}
                    style={[
                        styles.bubbleRow,
                        { justifyContent: idx % 2 === 0 ? "flex-start" : "flex-end" },
                    ]}>
                    <SkeletonBox
                        width={w}
                        height={42}
                        radius={18}
                        color={idx % 2 === 0 ? SKELETON_COLORS.highlight : SKELETON_COLORS.base}
                    />
                </View>
            ))}
        </View>
    );
}

export function OverlaySkeleton({ message = false }) {
    return (
        <View style={styles.overlay}>
            <SkeletonCard style={{ width: 220, alignItems: "center" }}>
                <SkeletonCircle size={38} />
                {message ? (
                    <>
                        <SkeletonSpacer h={12} />
                        <SkeletonLine width="70%" height={12} />
                    </>
                ) : null}
            </SkeletonCard>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    pad: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    statCard: { flex: 1, borderRadius: 18 },
    listRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 18,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: SKELETON_COLORS.border,
    },
    bubbleRow: { flexDirection: "row" },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(249,250,251,0.72)",
        alignItems: "center",
        justifyContent: "center",
    },
});
