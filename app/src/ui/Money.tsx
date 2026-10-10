import { useEffect, useRef, useState } from "react";
import { Animated, Easing, type StyleProp, type TextStyle } from "react-native";
import { T, type Variant } from "./Type";

export function formatNumber(value: number, decimals: number): string {
  const [whole, fraction] = Math.max(0, value).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Dollars that count up (or down) whenever the value changes. */
export function Money({ value, variant = "display", style, color, decimals = 2, prefix = "$", duration = 800 }: { value: number; variant?: Variant; style?: StyleProp<TextStyle>; color?: string; decimals?: number; prefix?: string; duration?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: next }) => setShown(next));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    const run = Animated.timing(anim, { toValue: Number.isFinite(value) ? value : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [value, duration, anim]);

  const target = `${prefix}${formatNumber(value, decimals)}`;
  return (
    <T variant={variant} color={color} style={style} accessibilityLabel={target} numberOfLines={1} adjustsFontSizeToFit>
      {prefix}
      {formatNumber(shown, decimals)}
    </T>
  );
}
