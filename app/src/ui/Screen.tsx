import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pearls } from "./Pearls";
import { colors, space } from "./theme";

type Props = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Leave room for the floating tab bar. */
  tabBar?: boolean;
  scroll?: boolean;
  paddingTop?: number;
};

/** Sky background, drifting pearls, safe area and a scroll view. */
export function Screen({ children, refreshing = false, onRefresh, tabBar = true, scroll = true, paddingTop = 20 }: Props) {
  const insets = useSafeAreaInsets();
  const top = insets.top + paddingTop;
  const bottom = (tabBar ? 120 : 32) + insets.bottom;
  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
      <Pearls />
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, paddingHorizontal: space.gutter, gap: space.gap }}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} progressBackgroundColor="#ffffff" progressViewOffset={insets.top} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: space.gutter, gap: space.gap }}>{children}</View>
      )}
    </View>
  );
}
