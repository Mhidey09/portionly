import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { T } from "./Type";
import { colors, radius } from "./theme";

type Option<K extends string> = { key: K; label: string };

/** A pill with a white thumb that slides to the chosen option. */
export function Segmented<K extends string>({ options, value, onChange, label }: { options: readonly Option<K>[]; value: K; onChange: (key: K) => void; label: string }) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const index = Math.max(0, options.findIndex((option) => option.key === value));
  const thumb = width > 0 ? (width - 8) / options.length : 0;

  useEffect(() => {
    Animated.spring(x, { toValue: index * thumb, speed: 18, bounciness: 7, useNativeDriver: true }).start();
  }, [index, thumb, x]);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", backgroundColor: colors.field, borderRadius: radius.pill, padding: 4 }}
    >
      {thumb > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 4,
            width: thumb,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            elevation: 3,
            shadowColor: "#3f31a0",
            shadowOpacity: 0.16,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            transform: [{ translateX: x }],
          }}
        />
      )}
      {options.map((option) => (
        <Pressable
          key={option.key}
          accessibilityRole="tab"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: option.key === value }}
          onPress={() => onChange(option.key)}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 44 }}
        >
          <T variant="strong" color={option.key === value ? colors.ink : colors.muted}>
            {option.label}
          </T>
        </Pressable>
      ))}
    </View>
  );
}
