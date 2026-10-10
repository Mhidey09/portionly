import { useState, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius } from "./theme";

type Props = TextInputProps & { label: string; right?: ReactNode };

/** A text input pill. The label is read aloud and shown as the placeholder. */
export function Field({ label, right, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 56,
        paddingLeft: 20,
        paddingRight: right ? 6 : 20,
        borderRadius: radius.pill,
        backgroundColor: focused ? colors.accentSoft : colors.field,
      }}
    >
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor="rgba(91,102,118,0.7)"
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        {...rest}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.ink, paddingVertical: 12 }, style]}
      />
      {right}
    </View>
  );
}
