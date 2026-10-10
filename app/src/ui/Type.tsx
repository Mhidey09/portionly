import type { ReactNode } from "react";
import { Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { colors, fonts } from "./theme";

export type Variant = "display" | "title" | "h2" | "body" | "small" | "label" | "strong";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.black, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.ink },
  h2: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.5, color: colors.ink },
  strong: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.muted },
};

type Props = TextProps & { variant?: Variant; color?: string; style?: StyleProp<TextStyle>; children?: ReactNode };

/** The one text component, so every string uses Satoshi and the same sizes. */
export function T({ variant = "body", color, style, children, ...rest }: Props) {
  return (
    <Text {...rest} style={[variants[variant], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}
