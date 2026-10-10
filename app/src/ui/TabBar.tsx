import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icons";
import { T } from "./Type";
import { colors, radius, surfaceShadow } from "./theme";

export type TabKey = "home" | "send" | "receive" | "money";
const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "send", label: "Send", icon: "send" },
  { key: "receive", label: "Receive", icon: "receive" },
  { key: "money", label: "Money", icon: "money" },
];
const PAD = 6;

/** Floating white pill with four tabs. The active tab sits on a violet indicator that slides. */
export function TabBar({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const index = TABS.findIndex((tab) => tab.key === active);
  const tabWidth = width > 0 ? (width - PAD * 2) / TABS.length : 0;

  useEffect(() => {
    Animated.spring(x, { toValue: index * tabWidth, speed: 16, bounciness: 8, useNativeDriver: true }).start();
  }, [index, tabWidth, x]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[
        {
          position: "absolute",
          left: 20,
          right: 20,
          bottom: insets.bottom + 14,
          height: 68,
          padding: PAD,
          flexDirection: "row",
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
        },
        surfaceShadow,
      ]}
    >
      {tabWidth > 0 && (
        <Animated.View
          style={{ position: "absolute", top: PAD, bottom: PAD, left: PAD, width: tabWidth, borderRadius: radius.pill, backgroundColor: colors.accent, transform: [{ translateX: x }] }}
        />
      )}
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.key)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}
          >
            <Icon name={tab.icon} color={selected ? "#ffffff" : colors.muted} size={22} />
            <T variant="label" color={selected ? "#ffffff" : colors.muted} style={{ fontSize: 11, lineHeight: 14 }}>
              {tab.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
