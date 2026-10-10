import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, View } from "react-native";
import { T } from "./Type";
import { colors, portionColors, surfaceShadow } from "./theme";
import { moveHandle, stepHandle, type Handle, type Split } from "./split";

const HIT = 44;

type Props = {
  split: Split;
  /** Passing this makes two draggable handles. Leave it out for a read only bar. */
  onChange?: (next: Split) => void;
  /** 10px tall, no labels, no handles. */
  compact?: boolean;
  /** Unroll from the left when first shown. */
  unroll?: boolean;
};

/** The portion bar: one payment, cut into home now, savings and stocks. */
export function SlipBar({ split, onChange, compact = false, unroll = true }: Props) {
  const height = compact ? 10 : 68;
  const corner = compact ? 5 : 22;
  const [width, setWidth] = useState(0);
  const e0 = useRef(new Animated.Value(split.home)).current;
  const e1 = useRef(new Animated.Value(split.home + split.save)).current;
  const reveal = useRef(new Animated.Value(unroll ? 0 : 1)).current;
  const dragging = useRef(false);
  const [active, setActive] = useState<Handle | null>(null);

  // Latest values for the gesture callbacks, which are created once.
  const live = useRef({ split, onChange, width });
  live.current = { split, onChange, width };

  useEffect(() => {
    const next = split.home + split.save;
    if (dragging.current) {
      e0.setValue(split.home);
      e1.setValue(next);
      return;
    }
    const run = Animated.parallel([
      Animated.timing(e0, { toValue: split.home, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(e1, { toValue: next, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]);
    run.start();
    return () => run.stop();
  }, [split.home, split.save, e0, e1]);

  useEffect(() => {
    if (width === 0 || !unroll) return;
    Animated.timing(reveal, { toValue: 1, duration: 900, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [width, unroll, reveal]);

  const responders = useMemo(() => {
    const make = (handle: Handle) => {
      let start = 0;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragging.current = true;
          const { split: current } = live.current;
          start = handle === 0 ? current.home : current.home + current.save;
          setActive(handle);
        },
        onPanResponderMove: (_event, gesture) => {
          const { split: current, onChange: change, width: w } = live.current;
          if (!change || w <= 0) return;
          const next = moveHandle(current, handle, start + (gesture.dx / w) * 100);
          if (next.home !== current.home || next.save !== current.save || next.stocks !== current.stocks) change(next);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          setActive(null);
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          setActive(null);
        },
      });
    };
    return [make(0), make(1)] as const;
  }, []);

  const px = (value: Animated.Value | Animated.AnimatedSubtraction<number>) => Animated.multiply(value, width / 100);
  const save = Animated.subtract(e1, e0);
  const stocks = Animated.subtract(100, e1);

  const bands = [
    { key: "home" as const, label: "Home now", value: split.home, anim: e0 },
    { key: "save" as const, label: "Savings", value: split.save, anim: save },
    { key: "stocks" as const, label: "Stocks", value: split.stocks, anim: stocks },
  ];

  const summary = `Home now ${split.home} percent, savings ${split.save} percent, stocks ${split.stocks} percent`;
  const editable = Boolean(onChange) && !compact;
  // When both lines sit together, the one that can still move goes on top.
  const topHandle: Handle = split.home === 100 ? 0 : 1;

  return (
    <View
      accessible={!editable}
      accessibilityRole="image"
      accessibilityLabel={summary}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: editable ? height + 16 : height, justifyContent: "center" }}
    >
      {width > 0 && (
        <>
          <Animated.View style={{ width: Animated.multiply(reveal, width), height, borderRadius: corner, overflow: "hidden" }}>
            <View style={{ width, height, flexDirection: "row" }}>
              {bands.map((band) => (
                <Animated.View
                  key={band.key}
                  style={{ width: px(band.anim), height, backgroundColor: portionColors[band.key].bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                >
                  {!compact && band.value >= 10 && (
                    <View style={{ alignItems: "center", width: 120 }}>
                      <T variant="strong" color={portionColors[band.key].fg} style={{ fontFamily: "Satoshi-Black", fontSize: 18, lineHeight: 22 }} numberOfLines={1}>
                        {band.value}%
                      </T>
                      {band.value >= 25 && (
                        <T variant="label" color={portionColors[band.key].fg} style={{ fontSize: 12, lineHeight: 15 }} numberOfLines={1}>
                          {band.label}
                        </T>
                      )}
                    </View>
                  )}
                </Animated.View>
              ))}
            </View>
          </Animated.View>
          {editable &&
            ([0, 1] as const).map((handle) => {
              const edge = handle === 0 ? e0 : e1;
              const value = handle === 0 ? split.home : split.home + split.save;
              const zIndex = handle === topHandle ? 2 : 1;
              return (
                <Animated.View
                  key={handle}
                  {...responders[handle].panHandlers}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={handle === 0 ? "Move the line between home now and savings" : "Move the line between savings and stocks"}
                  accessibilityValue={{ text: `${value} percent` }}
                  accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                  onAccessibilityAction={(event) => {
                    const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
                    onChange?.(stepHandle(split, handle, direction));
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    width: HIT,
                    zIndex,
                    elevation: zIndex,
                    alignItems: "center",
                    justifyContent: "center",
                    left: Animated.add(px(edge), -HIT / 2),
                  }}
                >
                  <View
                    style={[
                      { width: active === handle ? 14 : 10, height: height + 14, borderRadius: 999, backgroundColor: colors.surface },
                      surfaceShadow,
                      { shadowOpacity: 0.35 },
                    ]}
                  />
                </Animated.View>
              );
            })}
        </>
      )}
    </View>
  );
}
