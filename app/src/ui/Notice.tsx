import { useState } from "react";
import { Pressable, View } from "react-native";
import { Rise } from "./Rise";
import { T } from "./Type";
import { colors } from "./theme";
import { plainMessage } from "./plain";

/** An inline plain message. Errors are turned into plain sentences before they are shown. */
export function Notice({ text, tone = "info", raw = false, action }: { text: string; tone?: "info" | "error"; raw?: boolean; action?: React.ReactNode }) {
  const shown = tone === "error" && !raw ? plainMessage(text) : text;
  const error = tone === "error";
  // The technical text stays one tap away, so a problem on a real phone can still be traced.
  const [detail, setDetail] = useState(false);
  const hasDetail = error && shown !== text;
  return (
    <Rise distance={10}>
      <View
        accessibilityRole={error ? "alert" : "text"}
        accessibilityLiveRegion="polite"
        style={{ backgroundColor: error ? colors.dangerSoft : colors.accentSoft, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, gap: 10 }}
      >
        <T variant="body" color={error ? colors.danger : colors.home} style={{ fontSize: 15, lineHeight: 21 }}>
          {shown}
        </T>
        {hasDetail && (
          <Pressable accessibilityRole="button" onPress={() => setDetail(!detail)} hitSlop={8}>
            <T variant="small" color={colors.muted}>{detail ? text : "Show details"}</T>
          </Pressable>
        )}
        {action}
      </View>
    </Rise>
  );
}
