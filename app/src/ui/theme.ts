import { Platform, type ViewStyle } from "react-native";

/** Portionly design tokens. Matches the website: sky, white surfaces, one violet, three depths for the portions. */
export const colors = {
  sky: "#e6f2fd",
  skyDeep: "#d6e9fb",
  surface: "#ffffff",
  ink: "#0d1117",
  muted: "#5b6676",
  line: "rgba(13,17,23,0.1)",
  accent: "#6f52f5",
  accentSoft: "#ebe6ff",
  home: "#5a3de6",
  save: "#9a86fb",
  stocks: "#d3caff",
  onHome: "#ffffff",
  onSave: "#ffffff",
  onStocks: "#2a1c80",
  pearlA: "#c9b8ff",
  pearlB: "#a8e0ff",
  pearlC: "#ffd6f2",
  danger: "#c0322b",
  dangerSoft: "#fdecea",
  field: "#f0f6fd",
} as const;

export const fonts = {
  regular: "Satoshi-Regular",
  medium: "Satoshi-Medium",
  bold: "Satoshi-Bold",
  black: "Satoshi-Black",
} as const;

export const radius = { surface: 28, pill: 999, field: 20 } as const;

export const surfaceShadow: ViewStyle = Platform.select<ViewStyle>({
  android: { elevation: 8, shadowColor: "#3f31a0" },
  default: { shadowColor: "#3f31a0", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
})!;

export const space = { gutter: 20, gap: 16 } as const;

/** Ease out, close to the website's cubic-bezier(0.2, 0.8, 0.2, 1). */
export const ease = (t: number): number => {
  const u = 1 - t;
  return 1 - u * u * u * u;
};

export const portionColors = {
  home: { bg: colors.home, fg: colors.onHome },
  save: { bg: colors.save, fg: colors.onSave },
  stocks: { bg: colors.stocks, fg: colors.onStocks },
} as const;
