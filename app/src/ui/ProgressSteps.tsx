import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { Tick } from "./Icons";
import { T } from "./Type";
import { colors } from "./theme";

function Dot({ state }: { state: "waiting" | "active" | "done" }) {
  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(fill, { toValue: state === "done" ? 1 : 0, speed: 16, bounciness: 12, useNativeDriver: true }).start();
  }, [state, fill]);
  useEffect(() => {
    if (state !== "active") return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    pulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);
  return (
    <View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
      {state === "active" && (
        <Animated.View
          style={{
            position: "absolute",
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.accent,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
          }}
        />
      )}
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: state === "waiting" ? colors.field : state === "active" ? colors.accentSoft : colors.accent, alignItems: "center", justifyContent: "center" }}>
        {state === "active" && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />}
        {state === "done" && (
          <Animated.View style={{ transform: [{ scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }}>
            <Tick size={16} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** Steps with a dot each. `current` is the step in progress; steps before it are done. */
export function ProgressSteps({ steps, current, finished = false }: { steps: readonly string[]; current: number; finished?: boolean }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
      {steps.map((step, index) => {
        const state = finished || index < current ? "done" : index === current ? "active" : "waiting";
        return (
          <View key={step} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Dot state={state} />
            <T variant="body" color={state === "waiting" ? colors.muted : colors.ink} style={{ fontFamily: state === "active" ? "Satoshi-Bold" : "Satoshi-Medium" }}>
              {step}
            </T>
          </View>
        );
      })}
    </View>
  );
}
