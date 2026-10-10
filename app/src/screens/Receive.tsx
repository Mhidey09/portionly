import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import type { Portionly } from "../usePortionly";
import { Button, ButtonRow } from "../ui/Button";
import { LockBanner } from "../ui/LockBanner";
import { Notice } from "../ui/Notice";
import { Rise } from "../ui/Rise";
import { Screen } from "../ui/Screen";
import { Surface } from "../ui/Surface";
import { T } from "../ui/Type";
import { colors } from "../ui/theme";

export function Receive({ p }: { p: Portionly }) {
  const [copied, setCopied] = useState(false);
  const link = p.myLink;
  return (
    <Screen>
      <LockBanner p={p} />
      <Rise>
        <T variant="title">Get paid</T>
        <T variant="body" color={colors.muted} style={{ marginTop: 4 }}>Share this so people can pay you.</T>
      </Rise>
      {link ? (
        <>
          <Rise index={1}>
            <Surface style={{ alignItems: "center", gap: 18 }}>
              <View accessibilityLabel="QR code for your pay link" accessibilityRole="image" style={{ padding: 8 }}>
                <QRCode value={link} size={220} color={colors.ink} backgroundColor="#ffffff" />
              </View>
              <T variant="small" selectable style={{ textAlign: "center" }}>{link}</T>
            </Surface>
          </Rise>
          <Rise index={2}>
            <ButtonRow>
              <Button
                variant="secondary"
                label={copied ? "Copied" : "Copy link"}
                style={{ flex: 1 }}
                onPress={() => {
                  void Clipboard.setStringAsync(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              />
              <Button label="Share" style={{ flex: 1 }} onPress={() => void p.shareLink(link)} />
            </ButtonRow>
          </Rise>
        </>
      ) : (
        <Notice text="Your pay link is not ready yet. Create or open your account first." />
      )}
      {p.error && <Notice tone="error" text={p.error} />}
    </Screen>
  );
}
