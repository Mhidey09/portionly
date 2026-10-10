import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import type { Person } from "../people";
import { formatBalances } from "../network";
import type { Portionly } from "../usePortionly";
import { Button, ButtonRow } from "../ui/Button";
import { Field } from "../ui/Field";
import { CurrencyPicker, LocalLine, RateNote, showsLocal } from "../ui/Local";
import { LockBanner } from "../ui/LockBanner";
import { Money } from "../ui/Money";
import { Notice } from "../ui/Notice";
import { Rise } from "../ui/Rise";
import { Screen } from "../ui/Screen";
import { Sheet } from "../ui/Sheet";
import { Divider, RowButton, Surface } from "../ui/Surface";
import type { TabKey } from "../ui/TabBar";
import { T } from "../ui/Type";
import { cleanAmountInput, formatUsd, initialOf, shortAddress, trimDecimals } from "../ui/format";
import { colors, portionColors } from "../ui/theme";

const SHADES = [portionColors.home, portionColors.save, portionColors.stocks] as const;

function Avatar({ name, index, size = 44 }: { name: string; index: number; size?: number }) {
  const shade = SHADES[index % SHADES.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: shade.bg, alignItems: "center", justifyContent: "center" }}>
      <T variant="strong" color={shade.fg} style={{ fontFamily: "Satoshi-Black", fontSize: size * 0.42 }}>
        {initialOf(name)}
      </T>
    </View>
  );
}

function PersonSheet({ p, person, onClose, go }: { p: Portionly; person: Person | null; onClose: () => void; go: (tab: TabKey) => void }) {
  // Keep the last person so the sheet can slide away without going blank.
  const [last, setLast] = useState<Person | null>(person);
  if (person && person !== last) setLast(person);
  const shown = person ?? last;
  const balances = shown ? p.peopleBalances[shown.index] : undefined;
  const topUpBusy = p.busy !== null && p.busy.startsWith("Topping up");
  const unlocked = p.wallets !== null;

  return (
    <Sheet visible={person !== null} onClose={onClose} label={shown ? shown.name : "Person"}>
      {shown && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar name={shown.name} index={shown.index} size={56} />
            <View style={{ flex: 1 }}>
              <T variant="h2">{shown.name}</T>
              <T variant="small">{balances ? `Fee balance ${trimDecimals(formatBalances(balances).mon, 3)} MON` : "Fee balance unknown"}</T>
            </View>
          </View>
          <View>
            <T variant="label">In this wallet</T>
            {balances ? <Money value={Number(formatBalances(balances).ausd)} variant="display" style={{ fontSize: 44, lineHeight: 50 }} /> : <T variant="display" style={{ fontSize: 44, lineHeight: 50 }}>{unlocked ? "Loading" : "Locked"}</T>}
            {balances && <LocalLine micro={balances.ausd} code={shown.currency} rates={p.rates} />}
          </View>
          <View style={{ gap: 8 }}>
            <T variant="label">Their currency</T>
            <CurrencyPicker label={`Currency for ${shown.name}`} value={shown.currency} onChange={(code) => void p.changePersonCurrency(shown, code)} />
          </View>
          <T variant="small">This is a separate wallet inside your account, only for paying {shown.name}. They see this wallet, not your main balance.</T>
          {p.error && <Notice tone="error" text={p.error} />}
          {unlocked ? (
            <>
              <Divider />
              <Field
                label="Amount to add in dollars"
                keyboardType="decimal-pad"
                value={p.topUpInputs[shown.index] ?? ""}
                onChangeText={(value) => p.setTopUpInputs({ ...p.topUpInputs, [shown.index]: cleanAmountInput(value) })}
              />
              <Button variant="secondary" label="Top up from my main wallet" loading={topUpBusy} disabled={p.busy !== null || (p.topUpInputs[shown.index] ?? "") === ""} onPress={() => void p.topUp(shown)} />
              <T variant="small">The network fee is topped up for you when this wallet runs low.</T>
              <Button
                label={`Send to ${shown.name}`}
                disabled={p.busy !== null}
                onPress={() => {
                  p.selectAccount(shown.index, shown.recipient);
                  onClose();
                  go("send");
                }}
              />
            </>
          ) : (
            <Button label="Unlock with your fingerprint" loading={p.busy !== null} onPress={() => void p.connect("unlock")} />
          )}
        </>
      )}
    </Sheet>
  );
}

function AddPersonSheet({ p, visible, onClose }: { p: Portionly; visible: boolean; onClose: () => void }) {
  const adding = p.busy === "Adding person" || p.busy === "Opening the new wallet";
  async function paste(): Promise<void> {
    p.setNewRecipient(p.normalizeTyped(await Clipboard.getStringAsync()));
  }
  return (
    <Sheet visible={visible} onClose={onClose} label="Add a person">
      <T variant="h2">Add a person</T>
      <T variant="small">Add someone you send money to. Each person gets their own wallet inside your account.</T>
      <Field label="Name" maxLength={32} value={p.newName} onChangeText={p.setNewName} autoCapitalize="words" />
      <Field
        label="Their address or pay link"
        autoCapitalize="none"
        autoCorrect={false}
        value={p.newRecipient}
        onChangeText={(value) => p.setNewRecipient(p.normalizeTyped(value))}
        right={<Button small variant="ghost" label="Paste" onPress={() => void paste()} />}
      />
      <View style={{ gap: 8 }}>
        <T variant="label">Their currency (optional)</T>
        <CurrencyPicker label="Their currency" value={p.newCurrency} onChange={p.setNewCurrency} />
      </View>
      {p.error && <Notice tone="error" text={p.error} />}
      {p.wallets && <T variant="small">Adding a person asks for your fingerprint one more time.</T>}
      <Button
        label="Add person"
        loading={adding}
        disabled={p.busy !== null || p.newName.trim() === "" || p.newRecipient.trim() === ""}
        onPress={() =>
          void p.submitPerson().then((added) => {
            if (added) onClose();
          })
        }
      />
    </Sheet>
  );
}

function DetailsSheet({ p, visible, onClose }: { p: Portionly; visible: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet visible={visible} onClose={onClose} label="Account details">
      <T variant="h2">Account details</T>
      <View>
        <T variant="label">Your account</T>
        <T variant="strong" style={{ fontSize: 20 }}>{p.address ? shortAddress(p.address) : "No account yet"}</T>
      </View>
      <Button
        variant="secondary"
        label={copied ? "Copied" : "Copy full address"}
        disabled={!p.address}
        onPress={() => {
          if (!p.address) return;
          void Clipboard.setStringAsync(p.address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      />
      <Divider />
      <T variant="small">Signing in with a different passkey replaces the account shown on this phone.</T>
      <Button
        variant="secondary"
        label="Use a different passkey"
        disabled={p.busy !== null}
        onPress={() => {
          onClose();
          void p.connect("signin");
        }}
      />
    </Sheet>
  );
}

export function Home({ p, go }: { p: Portionly; go: (tab: TabKey) => void }) {
  const [selected, setSelected] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState(false);
  const ready = p.shownBalances ? Number(p.shownBalances.ausd) : null;

  return (
    <Screen refreshing={p.refreshing} onRefresh={() => void p.manualRefresh()}>
      <LockBanner p={p} />
      <Rise>
        <View style={{ paddingTop: 8, gap: 2 }}>
          <T variant="label">Ready to send</T>
          {ready !== null ? <Money value={ready} variant="display" style={{ fontSize: 64, lineHeight: 70, letterSpacing: -2 }} /> : <T variant="display" style={{ fontSize: 64, lineHeight: 70 }}>{p.busy ? "…" : "$0.00"}</T>}
          <T variant="small">Fee balance {p.shownBalances ? `${trimDecimals(p.shownBalances.mon, 3)} MON` : "unknown"}</T>
        </View>
      </Rise>

      {p.error && <Notice tone="error" text={p.error} />}

      <Rise index={1}>
        <ButtonRow>
          <Button label="Send" onPress={() => go("send")} style={{ flex: 1 }} />
          <Button variant="secondary" label="Receive" onPress={() => go("receive")} style={{ flex: 1 }} />
        </ButtonRow>
      </Rise>

      <Rise index={2}>
        <Surface>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="h2">People</T>
            <Button small variant="ghost" label="Add a person" onPress={() => { p.setError(null); setAdding(true); }} />
          </View>
          {p.people.length === 0 ? (
            <T variant="small" style={{ marginTop: 6 }}>Nobody here yet. Add the people you send money to, like James or Mum.</T>
          ) : (
            p.people.map((person, i) => {
              const balances = p.peopleBalances[person.index];
              return (
                <View key={person.index}>
                  <Divider />
                  <Rise index={i + 3} distance={12}>
                    <RowButton label={`${person.name}, open`} onPress={() => { p.setError(null); setSelected(person); }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                        <Avatar name={person.name} index={person.index} />
                        <View style={{ flex: 1 }}>
                          <T variant="strong">{person.name}</T>
                          <T variant="small">{balances ? "In their wallet" : p.wallets ? "Loading" : "Unlock to see"}</T>
                        </View>
                        {balances && (
                          <View style={{ alignItems: "flex-end" }}>
                            <T variant="strong">{formatUsd(balances.ausd)}</T>
                            <LocalLine micro={balances.ausd} code={person.currency} rates={p.rates} align="right" />
                          </View>
                        )}
                      </View>
                    </RowButton>
                  </Rise>
                </View>
              );
            })
          )}
          {p.people.some((person) => p.peopleBalances[person.index] && showsLocal(person.currency, p.rates)) && (
            <View style={{ marginTop: 12 }}>
              <RateNote />
            </View>
          )}
        </Surface>
      </Rise>

      <Rise index={4}>
        <Surface>
          <RowButton label="Account details" onPress={() => setDetails(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T variant="strong">Account details</T>
              <T variant="small" color={colors.accent}>Open</T>
            </View>
          </RowButton>
        </Surface>
      </Rise>

      <PersonSheet p={p} person={selected} onClose={() => setSelected(null)} go={go} />
      <AddPersonSheet p={p} visible={adding} onClose={() => setAdding(false)} />
      <DetailsSheet p={p} visible={details} onClose={() => setDetails(false)} />
    </Screen>
  );
}
