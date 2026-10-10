import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Pearls } from "./Pearls";
import { T } from "./Type";
import { colors } from "./theme";

const SIZE = 112;
const BARS = [
  { flex: 5, color: colors.home },
  { flex: 3, color: colors.save },
  { flex: 2, color: colors.stocks },
] as const;

/** The Portionly mark: a rounded square of three vertical bars, widths 5 to 3 to 2. */
export function Mark({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, overflow: "hidden", flexDirection: "row" }} accessibilityLabel="Portionly" accessibilityRole="image">
      {BARS.map((bar) => (
        <View key={bar.color} style={{ flex: bar.flex, backgroundColor: bar.color }} />
      ))}
    </View>
  );
}

/** Every launch: bars assemble one by one, a sheen crosses, the word appears, then it scales up into the app. */
export function Splash({ onDone }: { onDone: () => void }) {
  const bars = useRef(BARS.map(() => new Animated.Value(0))).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const out = Easing.out(Easing.cubic);
    const run = Animated.sequence([
      Animated.parallel([
        Animated.stagger(
          140,
          bars.map((value) => Animated.timing(value, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true })),
        ),
        Animated.sequence([
          Animated.delay(520),
          Animated.timing(sheen, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([Animated.delay(620), Animated.timing(word, { toValue: 1, duration: 420, easing: out, useNativeDriver: true })]),
      ]),
      Animated.delay(480),
      Animated.timing(exit, { toValue: 1, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => run.stop();
  }, [bars, sheen, word, exit, onDone]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: colors.sky,
        alignItems: "center",
        justifyContent: "center",
        opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
      }}
    >
      <Pearls />
      <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE * 0.3, overflow: "hidden", flexDirection: "row" }}>
        {BARS.map((bar, index) => (
          <Animated.View
            key={bar.color}
            style={{
              flex: bar.flex,
              backgroundColor: bar.color,
              opacity: bars[index],
              transform: [{ translateY: bars[index].interpolate({ inputRange: [0, 1], outputRange: [SIZE, 0] }) }],
            }}
          />
        ))}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -10,
            bottom: -10,
            width: 36,
            backgroundColor: "rgba(255,255,255,0.45)",
            transform: [{ translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-60, SIZE + 40] }) }, { skewX: "-20deg" }],
          }}
        />
      </View>
      <Animated.View style={{ marginTop: 22, opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <T variant="title" style={{ fontFamily: "Satoshi-Black", fontSize: 38, letterSpacing: -1.5 }}>
          portionly
        </T>
      </Animated.View>
    </Animated.View>
  );
}
