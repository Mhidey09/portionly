import { useRef } from "react";
import { Animated, Pressable } from "react-native";
import { T } from "./Type";
import { colors, radius } from "./theme";

/** A pill choice. Active is violet. */
export function Chip({ label, active = false, onPress, disabled = false, accessibilityLabel }: { label: string; active?: boolean; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) => Animated.spring(scale, { toValue: value, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected: active, disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => to(0.94)}
        onPressOut={() => to(1)}
        style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.accent : colors.field }}
      >
        <T variant="label" color={active ? "#ffffff" : colors.ink} style={{ fontSize: 14 }}>
          {label}
        </T>
      </Pressable>
    </Animated.View>
  );
}
