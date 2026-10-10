import { useEffect, useRef, type ReactNode } from "react";
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
  /** When this changes the screen jumps back to the top, so a new step never opens half scrolled. */
  resetKey?: string;
};

/** Sky background, drifting pearls, safe area and a scroll view. */
export function Screen({ children, refreshing = false, onRefresh, tabBar = true, scroll = true, paddingTop = 20, resetKey }: Props) {
  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);
  const insets = useSafeAreaInsets();
  const top = insets.top + paddingTop;
  const bottom = (tabBar ? 120 : 32) + insets.bottom;
  return (
    <View style={{ flex: 1, backgroundColor: colors.sky }}>
      <Pearls />
      {scroll ? (
        <ScrollView
          ref={scroller}
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
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.sky }} />
    </View>
  );
}
