import { ScrollView, View, type StyleProp, type TextStyle } from "react-native";
import { aboutLocal, CURRENCIES, currencyOf, REFERENCE_NOTE, type Rates } from "../currency";
import { Chip } from "./Chip";
import { T } from "./Type";

/** The quiet second line under a dollar amount: "about ₦310,000". Renders nothing when there is no fresh rate. */
export function LocalLine({ micro, code, rates, style, align = "left" }: { micro: bigint; code: string | undefined; rates: Rates | null; style?: StyleProp<TextStyle>; align?: "left" | "center" | "right" }) {
  const text = aboutLocal(micro, code, rates, Date.now());
  if (!text) return null;
  return (
    <T variant="small" style={[{ textAlign: align }, style]} accessibilityLabel={text}>
      {text}
    </T>
  );
}

/** True when a converted line would show, so a screen knows whether to add its one rate note. */
export function showsLocal(code: string | undefined, rates: Rates | null): boolean {
  return aboutLocal(0n, code, rates, Date.now()) !== null;
}

/** Said once per screen that shows converted amounts. */
export function RateNote({ align = "left" }: { align?: "left" | "center" | "right" }) {
  return <T variant="small" style={{ textAlign: align }}>{REFERENCE_NOTE}</T>;
}

/** A scrolling row of flag and code chips. Tapping the chosen one again clears it. */
export function CurrencyPicker({ value, onChange, label }: { value: string | undefined; onChange: (code: string | undefined) => void; label: string }) {
  const chosen = currencyOf(value);
  return (
    <View accessibilityLabel={label} style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        <Chip label="None" active={!chosen} onPress={() => onChange(undefined)} accessibilityLabel="No currency, dollars only" />
        {CURRENCIES.map((currency) => (
          <Chip
            key={currency.code}
            label={`${currency.flag} ${currency.code}`}
            accessibilityLabel={currency.name}
            active={currency.code === value}
            onPress={() => onChange(currency.code === value ? undefined : currency.code)}
          />
        ))}
      </ScrollView>
      <T variant="small">{chosen ? chosen.name : "Dollars only"}</T>
    </View>
  );
}
