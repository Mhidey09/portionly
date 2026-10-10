import { Pressable } from "react-native";
import { Rise } from "./Rise";
import { T } from "./Type";
import { colors, radius } from "./theme";
import type { Portionly } from "../usePortionly";

/** Slim banner shown when an account exists but is locked. */
export function LockBanner({ p }: { p: Portionly }) {
  if (!p.address || p.wallets) return null;
  return (
    <Rise distance={10}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Unlock with your fingerprint"
        disabled={p.busy !== null}
        onPress={() => void p.connect("unlock")}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accentSoft,
          borderRadius: radius.pill,
          paddingVertical: 10,
          paddingLeft: 18,
          paddingRight: 14,
          opacity: pressed || p.busy !== null ? 0.7 : 1,
        })}
      >
        <T variant="strong" color={colors.home} style={{ fontSize: 15 }}>
          Unlock with your fingerprint
        </T>
      </Pressable>
    </Rise>
  );
}
