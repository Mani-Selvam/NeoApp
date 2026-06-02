import React, {
    forwardRef,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";

const COLORS = [
    "#1A6BFF",
    "#7B61FF",
    "#00C48C",
    "#FF9500",
    "#FF3B5C",
    "#0EA5E9",
];

const { width: W, height: H } = Dimensions.get("window");

const rand = (min, max) => Math.random() * (max - min) + min;

const makePieces = (count) =>
    new Array(count).fill(0).map((_, i) => {
        const size = rand(6, 12);
        return {
            key: `confetti-${i}-${Date.now()}`,
            size,
            color: COLORS[i % COLORS.length],
            startX: rand(W * 0.2, W * 0.8),
            driftX: rand(-120, 120),
            rotate: rand(-180, 180),
            duration: Math.floor(rand(900, 1450)),
            delay: Math.floor(rand(0, 160)),
        };
    });

const ConfettiBurst = forwardRef(function ConfettiBurst(
    { count = 26, topOffset = 0 },
    ref,
) {
    const [active, setActive] = useState(false);
    const pieces = useMemo(() => makePieces(count), [count]);
    const animsRef = useRef(
        pieces.map(() => ({
            y: new Animated.Value(0),
            x: new Animated.Value(0),
            r: new Animated.Value(0),
            o: new Animated.Value(0),
        })),
    );

    const reset = () => {
        animsRef.current.forEach((a) => {
            a.y.setValue(0);
            a.x.setValue(0);
            a.r.setValue(0);
            a.o.setValue(0);
        });
    };

    const play = () => {
        reset();
        setActive(true);

        const animations = pieces.map((p, idx) => {
            const a = animsRef.current[idx];
            return Animated.parallel([
                Animated.timing(a.o, {
                    toValue: 1,
                    duration: 120,
                    delay: p.delay,
                    useNativeDriver: true,
                }),
                Animated.timing(a.y, {
                    toValue: H + 80,
                    duration: p.duration,
                    delay: p.delay,
                    useNativeDriver: true,
                }),
                Animated.timing(a.x, {
                    toValue: p.driftX,
                    duration: p.duration,
                    delay: p.delay,
                    useNativeDriver: true,
                }),
                Animated.timing(a.r, {
                    toValue: p.rotate,
                    duration: p.duration,
                    delay: p.delay,
                    useNativeDriver: true,
                }),
            ]);
        });

        Animated.stagger(10, animations).start(() => {
            setActive(false);
        });
    };

    useImperativeHandle(ref, () => ({ play }));

    if (!active) return null;

    return (
        <View pointerEvents="none" style={[S.root, { top: topOffset }]}>
            {pieces.map((p, idx) => {
                const a = animsRef.current[idx];
                const rotate = a.r.interpolate({
                    inputRange: [-180, 180],
                    outputRange: ["-180deg", "180deg"],
                });
                const fadeOut = a.y.interpolate({
                    inputRange: [0, H * 0.7, H + 80],
                    outputRange: [1, 1, 0],
                });
                const opacity = Animated.multiply(a.o, fadeOut);
                return (
                    <Animated.View
                        key={p.key}
                        style={[
                            S.piece,
                            {
                                width: p.size,
                                height: p.size * rand(1.2, 1.9),
                                backgroundColor: p.color,
                                left: p.startX,
                                opacity,
                                transform: [
                                    { translateX: a.x },
                                    { translateY: a.y },
                                    { rotate },
                                ],
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
});

const S = StyleSheet.create({
    root: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
        zIndex: 9999,
    },
    piece: {
        position: "absolute",
        top: -20,
        borderRadius: 3,
    },
});

export default ConfettiBurst;
