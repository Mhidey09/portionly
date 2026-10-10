import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { colors } from "./theme";

type BlobProps = { id: string; size: number; color: string; top: number; left: number; opacity: number; duration: number; dx: number; dy: number };

function Blob({ id, size, color, top, left, opacity, duration, dx, dy }: BlobProps) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        left,
        width: size,
        height: size,
        opacity,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
        ],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Soft pearl light that drifts slowly behind the top of a screen. */
export function Pearls() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Blob id="pearlA" size={420} color={colors.pearlA} top={-120} left={-150} opacity={0.75} duration={7000} dx={50} dy={40} />
      <Blob id="pearlB" size={380} color={colors.pearlB} top={30} left={150} opacity={0.7} duration={8500} dx={-45} dy={55} />
      <Blob id="pearlC" size={340} color={colors.pearlC} top={210} left={-80} opacity={0.6} duration={10000} dx={60} dy={-40} />
    </View>
  );
}
