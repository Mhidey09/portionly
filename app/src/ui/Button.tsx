import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "./Type";
import { colors, radius, surfaceShadow } from "./theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Full pill. Scales on press. The primary one carries a slow light sheen. */
export function Button({ label, onPress, variant = "primary", disabled = false, loading = false, small = false, accessibilityLabel, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const primary = variant === "primary";
  const inactive = disabled || loading;

  useEffect(() => {
    if (!primary || inactive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheen, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(3400),
        Animated.timing(sheen, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [primary, inactive, sheen]);

  const press = (to: number) => Animated.spring(scale, { toValue: to, speed: 40, bounciness: 6, useNativeDriver: true }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.45 : 1 }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={() => press(0.96)}
        onPressOut={() => press(1)}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[
          styles.base,
          small && styles.small,
          primary && styles.primary,
          variant === "secondary" && styles.secondary,
          variant === "ghost" && styles.ghost,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={primary ? "#ffffff" : colors.accent} />
        ) : (
          <T variant="strong" color={primary ? "#ffffff" : variant === "ghost" ? colors.accent : colors.ink} style={small ? { fontSize: 15 } : undefined}>
            {label}
          </T>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, overflow: "hidden" },
  small: { minHeight: 44, paddingHorizontal: 18 },
  primary: { backgroundColor: colors.accent, ...surfaceShadow, shadowColor: colors.accent },
  secondary: { backgroundColor: colors.surface, ...surfaceShadow },
  ghost: { backgroundColor: "transparent" },
  sheen: { position: "absolute", top: 0, bottom: 0, left: 0, width: 56, backgroundColor: "rgba(255,255,255,0.35)" },
});

/** Two buttons side by side. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 12 }}>{children}</View>;
}
