import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, surfaceShadow } from "./theme";

/** The one white card. Group a whole section inside it and separate rows with <Divider />. */
export function Surface({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: radius.surface, padding: padded ? 20 : 0 }, surfaceShadow, style]}>{children}</View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 14 }} />;
}

/** A tappable row inside a Surface. */
export function RowButton({ children, onPress, label, disabled }: { children: ReactNode; onPress: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: "rgba(111,82,245,0.12)" }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      {children}
    </Pressable>
  );
}
