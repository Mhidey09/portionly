import { useEffect, useRef } from "react";
import { Animated, Linking, TextInput, View } from "react-native";
import { formatUnits } from "viem";
import { TESTNET_EXPLORER_TX, type SettledTransfer } from "../agora";
import type { Settle as SettleState } from "../useSettle";
import type { Portionly } from "../usePortionly";
import { Button, ButtonRow } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Field } from "../ui/Field";
import { Tick } from "../ui/Icons";
import { LocalLine, showsLocal } from "../ui/Local";
import { Money } from "../ui/Money";
import { Notice } from "../ui/Notice";
import { ProgressSteps } from "../ui/ProgressSteps";
import { Rise } from "../ui/Rise";
import { Screen } from "../ui/Screen";
import { Divider, Surface } from "../ui/Surface";
import { T } from "../ui/Type";
import { cleanAmountInput, formatUsd, shortAddress, trimDecimals } from "../ui/format";
import { colors, fonts, radius, surfaceShadow } from "../ui/theme";

const dollars = (micro: bigint): number => Number(micro) / 1_000_000;
const settled = (units: bigint): string => `${trimDecimals(formatUnits(units, 18), 4)} settled dollars`;
const fee = (balance: bigint): string => trimDecimals(formatUnits(balance, 18), 3);

/** The small "Testnet" tag. Said once per screen. */
function TestnetTag() {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <T variant="label" color={colors.home} style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 }}>Testnet</T>
    </View>
  );
}

function stepName(label: string): string {
  return /turn on/i.test(label) ? "Turning on instant settle" : /approve/i.test(label) ? "Allowing the amount" : "Settling";
}

function FormView({ p, s }: { p: Portionly; s: SettleState }) {
  const input = useRef<TextInput>(null);
  const locked = !p.wallet || !p.wallets;
  const ready = s.amountIn > 0n && s.recipient !== null && s.quote !== null && !s.quoting && s.busy === null;
  const pool = s.health;
  return (
    <>
      <Rise>
        <View style={{ gap: 8 }}>
          <TestnetTag />
          <T variant="title">Instant settle</T>
        </View>
      </Rise>
      <Rise index={1}>
        <T variant="body">
          This payment settles through Agora Instant Settlement at a fixed price, in one step. Agora approves each business before it can use this with real money, so here it runs on Monad testnet with test dollars.
        </T>
      </Rise>

      <Rise index={2}>
        <Surface>
          <T variant="label">Test dollars</T>
          {s.balances ? <Money value={dollars(s.balances.ausd)} variant="display" style={{ fontSize: 44, lineHeight: 50 }} /> : <T variant="display" style={{ fontSize: 44, lineHeight: 50 }}>...</T>}
          <T variant="small">{s.balances ? `Test fee balance: ${fee(s.balances.mon)} MON` : "Reading your balances"}</T>
          {s.lowDollars && (
            <View style={{ marginTop: 14 }}>
              <Button small variant="secondary" label="Get test dollars" loading={s.busy === "Getting test dollars"} disabled={locked || s.busy !== null} onPress={() => void s.getTestDollars()} />
            </View>
          )}
          {pool && pool.paused && <T variant="small" style={{ marginTop: 10 }}>Instant settlement is paused right now.</T>}
        </Surface>
      </Rise>

      {s.noMon && (
        <Rise index={3}>
          <Notice
            text="You need a little test MON to pay network fees. It is free. Tap below and we copy your address, so you can paste it on the faucet page."
            action={<Button small label="Get test MON" onPress={() => void s.openMonFaucet()} />}
          />
        </Rise>
      )}
      {!s.noMon && s.lowMon && (
        <Rise index={3}>
          <Notice text="Your test fee balance is getting low. Top it up before you settle." action={<Button small variant="secondary" label="Get test MON" onPress={() => void s.openMonFaucet()} />} />
        </Rise>
      )}

      <Rise index={3}>
        <Surface>
          <T variant="h2">Who is it for?</T>
          {p.people.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              {p.people.map((person) => (
                <Chip key={person.index} label={person.name} active={s.personIndex === person.index} onPress={() => s.pickPerson(s.personIndex === person.index ? null : person.index)} />
              ))}
            </View>
          )}
          {s.person ? (
            <T variant="small" style={{ marginTop: 14 }}>{`Settling to ${s.person.name}, ${shortAddress(s.person.recipient)}.`}</T>
          ) : (
            <View style={{ marginTop: 14 }}>
              <Field
                label="Their address"
                autoCapitalize="none"
                autoCorrect={false}
                value={s.recipientText}
                onChangeText={s.typeRecipient}
                right={<Button small variant="ghost" label="Paste" disabled={s.busy !== null} onPress={() => void s.paste()} />}
              />
            </View>
          )}
        </Surface>
      </Rise>

      <Rise index={4}>
        <Surface style={{ alignItems: "center" }}>
          <T variant="label">You send</T>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4 }}>
            <T variant="display" style={{ fontSize: 56, lineHeight: 66 }}>$</T>
            <TextInput
              ref={input}
              accessibilityLabel="Amount to settle in test dollars"
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="rgba(91,102,118,0.45)"
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              value={s.amountInput}
              onChangeText={(value) => s.typeAmount(cleanAmountInput(value))}
              style={{ minWidth: 70, fontFamily: fonts.black, fontSize: 56, letterSpacing: -1.5, color: colors.ink, padding: 0, textAlign: "left" }}
            />
          </View>
          {s.amountIn > 0n && <LocalLine micro={s.amountIn} code={s.person?.currency ?? p.oneOffCurrency} rates={p.rates} align="center" style={{ marginTop: 2 }} />}
          {s.amountIn > 0n && (
            <T variant="body" style={{ textAlign: "center", marginTop: 8 }}>
              {s.quote !== null ? `They receive ${settled(s.quote)}. Fixed price, no slippage.` : s.quoting ? "Getting the fixed price" : "The pool cannot quote that amount right now."}
            </T>
          )}
          {s.amountIn > 0n && s.quote !== null && pool && pool.feePercent > 0 && <T variant="small" style={{ textAlign: "center" }}>{`The pool charges ${trimDecimals(pool.feePercent.toFixed(4), 4)}% and it is already in that number.`}</T>}
        </Surface>
      </Rise>

      {s.error && <Notice tone="error" text={s.error} />}
      <Rise index={5}>
        {locked ? (
          <Button label="Unlock with your fingerprint" loading={p.busy !== null} onPress={() => void p.connect("unlock")} />
        ) : (
          <Button label="Review" loading={s.busy === "Getting the live quote"} disabled={!ready || (pool?.paused ?? false)} onPress={() => void s.review()} />
        )}
      </Rise>

      {s.metrics?.monad && (
        <T variant="small" style={{ textAlign: "center" }}>{`AUSD in circulation on Monad: ${Math.round(s.metrics.monad.circulating).toLocaleString("en-US")}, from Agora`}</T>
      )}
      <RecentList items={s.recent} />
    </>
  );
}

function RecentList({ items }: { items: SettledTransfer[] }) {
  if (items.length === 0) return null;
  return (
    <Rise index={6}>
      <Surface>
        <T variant="h2">Recent testnet transfers</T>
        {items.map((item, index) => (
          <View key={item.hash}>
            {index > 0 && <Divider />}
            <View style={{ marginTop: index === 0 ? 14 : 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T variant="strong">{`$${trimDecimals(item.amountIn, 2)} to ${shortAddress(item.recipient)}`}</T>
                <T variant="small">{new Date(item.at).toLocaleString()}</T>
              </View>
              <Button small variant="ghost" label="Receipt" onPress={() => void Linking.openURL(`${TESTNET_EXPLORER_TX}${item.hash}`)} />
            </View>
          </View>
        ))}
      </Surface>
    </Rise>
  );
}

function ReviewView({ p, s }: { p: Portionly; s: SettleState }) {
  const plan = s.plan!;
  const to = s.person?.name ?? shortAddress(plan.recipient);
  const first = plan.calls.length > 2;
  return (
    <>
      <Rise>
        <T variant="title">Check and settle</T>
      </Rise>
      <Rise index={1}>
        <Surface>
          <T variant="label">{`You send to ${to}`}</T>
          <Money value={dollars(plan.amountIn)} variant="display" style={{ fontSize: 48, lineHeight: 54 }} />
          <LocalLine micro={plan.amountIn} code={s.person?.currency ?? p.oneOffCurrency} rates={p.rates} />
          <Divider />
          <View style={{ gap: 12 }}>
            <View>
              <T variant="label">They receive</T>
              <T variant="strong">{settled(plan.amountOut)}</T>
            </View>
            <View>
              <T variant="label">Settles through</T>
              <T variant="strong">Agora Instant Settlement</T>
            </View>
          </View>
          <Divider />
          <T variant="small">
            {first
              ? "Three fingerprint checks: one to turn on instant settle for your account, which is only needed the first time, one to allow the amount, and one to settle."
              : "Two fingerprint checks: one to allow the amount, one to settle."}
          </T>
        </Surface>
      </Rise>
      {s.error && <Notice tone="error" text={s.error} />}
      <Rise index={2}>
        {p.wallet ? <Button label="Confirm and settle" disabled={s.busy !== null} onPress={() => void s.confirm()} /> : <Button label="Unlock with your fingerprint" loading={p.busy !== null} onPress={() => void p.connect("unlock")} />}
      </Rise>
      <Rise index={3}>
        <Button variant="secondary" label="Go back" disabled={s.busy !== null} onPress={s.goBack} />
      </Rise>
    </>
  );
}

function SendingView({ s }: { s: SettleState }) {
  const labels = (s.plan?.calls ?? []).map((call) => stepName(call.label));
  const steps = labels.length > 0 ? labels : ["Allowing the amount", "Settling"];
  const progress = s.progress;
  const current = progress ? (progress.state === "confirmed" ? progress.index + 1 : progress.index) : 0;
  const caption = !progress
    ? "Getting ready"
    : progress.state === "signing"
      ? "Waiting for your fingerprint"
      : progress.state === "pending"
        ? `${stepName(progress.label)}, waiting for the network`
        : current >= steps.length
          ? "Checking that everything arrived"
          : "Done, on to the next step";
  return (
    <>
      <Rise>
        <T variant="title">Settling</T>
      </Rise>
      <Rise index={1}>
        <Surface>
          <ProgressSteps steps={steps} current={Math.min(current, steps.length - 1)} finished={false} />
          <Divider />
          <T variant="small">{caption}</T>
        </Surface>
      </Rise>
    </>
  );
}

function DoneView({ p, s, onClose }: { p: Portionly; s: SettleState; onClose: () => void }) {
  const done = s.done;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, speed: 8, bounciness: 16, delay: 200, useNativeDriver: true }).start();
  }, [pop]);
  if (!done) return null;
  const { record, seconds } = done;
  const micro = BigInt(Math.round(Number(record.amountIn) * 1_000_000));
  const person = p.people.find((entry) => entry.recipient.toLowerCase() === record.recipient.toLowerCase());
  const to = person?.name ?? shortAddress(record.recipient);
  const received = `${trimDecimals(record.amountOut, 4)} settled dollars`;
  return (
    <>
      <View style={{ alignItems: "center", gap: 14 }}>
        <Animated.View
          style={[{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", transform: [{ scale: pop }] }, surfaceShadow, { shadowColor: colors.accent }]}
        >
          <Tick size={52} />
        </Animated.View>
        <Rise index={2}>
          <T variant="title" style={{ textAlign: "center" }}>Settled</T>
        </Rise>
        <Rise index={3}>
          <Money value={Number(record.amountIn)} variant="display" style={{ fontSize: 48, lineHeight: 54 }} />
        </Rise>
        {showsLocal(person?.currency, p.rates) && (
          <Rise index={3}>
            <LocalLine micro={micro} code={person?.currency} rates={p.rates} align="center" />
          </Rise>
        )}
        <Rise index={3}>
          <T variant="body" style={{ textAlign: "center" }}>{`Arrived in ${seconds.toFixed(1)} seconds`}</T>
        </Rise>
      </View>
      <Rise index={4}>
        <Surface>
          <View style={{ gap: 12 }}>
            <View>
              <T variant="label">You paid</T>
              <T variant="strong">{`${formatUsd(micro)} in test dollars`}</T>
            </View>
            <View>
              <T variant="label">Settled through Agora</T>
              <T variant="strong">{`${formatUsd(micro)} at a fixed price`}</T>
            </View>
            <View>
              <T variant="label">{`${to} received`}</T>
              <T variant="strong">{received}</T>
            </View>
          </View>
          <Divider />
          <TestnetTag />
        </Surface>
      </Rise>
      <Rise index={5}>
        <ButtonRow>
          <Button variant="secondary" label="View receipt" onPress={() => void Linking.openURL(`${TESTNET_EXPLORER_TX}${record.hash}`)} style={{ flex: 1 }} />
          <Button label="Done" onPress={onClose} style={{ flex: 1 }} />
        </ButtonRow>
      </Rise>
    </>
  );
}

/** Full screen Instant settle flow on Monad testnet, opened from Home or the Send screen. */
export function Settle({ p, s, onClose }: { p: Portionly; s: SettleState; onClose: () => void }) {
  const sending = s.step === "sending";
  return (
    <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 40, backgroundColor: colors.sky }}>
      <Screen tabBar={false} paddingTop={20} resetKey={s.step}>
        {s.step !== "done" && (
          <View style={{ flexDirection: "row", justifyContent: "flex-start" }}>
            <Button small variant="ghost" label="Close" disabled={sending || s.busy !== null} onPress={onClose} />
          </View>
        )}
        {s.step === "form" && <FormView p={p} s={s} />}
        {s.step === "review" && s.plan && <ReviewView p={p} s={s} />}
        {s.step === "sending" && <SendingView s={s} />}
        {s.step === "done" && (
          <DoneView
            p={p}
            s={s}
            onClose={() => {
              s.reset();
              onClose();
            }}
          />
        )}
      </Screen>
    </View>
  );
}
