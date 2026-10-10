import { View } from "react-native";
import type { Rates } from "../currency";
import { LocalLine } from "./Local";
import { Money } from "./Money";
import { T } from "./Type";
import { portionColors } from "./theme";

const KINDS = {
  home: { name: "Home now", color: portionColors.home.bg },
  save: { name: "Savings that earn", color: portionColors.save.bg },
  stocks: { name: "US tech stocks", color: portionColors.stocks.bg },
} as const;

/** One portion line: a coloured dot, its name and note, and the amount with a quiet local currency line. */
export function PortionRow({ kind, note, micro, code, rates }: { kind: keyof typeof KINDS; note: string; micro: bigint; code?: string; rates?: Rates | null }) {
  const { name, color } = KINDS[kind];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color }} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={{ flex: 1 }}>
        <T variant="strong">{name}</T>
        <T variant="small">{note}</T>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Money value={Number(micro) / 1_000_000} variant="strong" style={{ fontSize: 20 }} />
        {micro > 0n && <LocalLine micro={micro} code={code} rates={rates ?? null} align="right" />}
      </View>
    </View>
  );
}

/** The portions that are in use, as rows separated by a gap. */
export function PortionRows({ nowAmount, growAmount, investAmount, savingsNote, stockNote, code, rates }: {
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  savingsNote: string;
  stockNote: string;
  code?: string;
  rates?: Rates | null;
}) {
  return (
    <View style={{ gap: 14 }}>
      <PortionRow kind="home" note="Arrives as digital dollars" micro={nowAmount} code={code} rates={rates} />
      {growAmount > 0n && <PortionRow kind="save" note={savingsNote} micro={growAmount} code={code} rates={rates} />}
      {investAmount > 0n && <PortionRow kind="stocks" note={stockNote} micro={investAmount} code={code} rates={rates} />}
    </View>
  );
}
