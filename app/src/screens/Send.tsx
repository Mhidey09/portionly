import * as Clipboard from "expo-clipboard";
import { useEffect, useRef } from "react";
import { Animated, Linking, TextInput, View } from "react-native";
import { formatUnits, parseUnits } from "viem";
import type { Rates } from "../currency";
import { LOCK_DAYS } from "../portionlyPlan";
import { BUSY_SENDING, type Portionly } from "../usePortionly";
import { Button, ButtonRow } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Field } from "../ui/Field";
import { CurrencyPicker, LocalLine, RateNote, showsLocal } from "../ui/Local";
import { Tick } from "../ui/Icons";
import { LockBanner } from "../ui/LockBanner";
import { Money } from "../ui/Money";
import { Notice } from "../ui/Notice";
import { Pearls } from "../ui/Pearls";
import { ProgressSteps } from "../ui/ProgressSteps";
import { Rise } from "../ui/Rise";
import { Screen } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { SlipBar } from "../ui/SlipBar";
import { Divider, Surface } from "../ui/Surface";
import { T } from "../ui/Type";
import { cleanAmountInput, formatUsd, lockLabel, shortAddress, trimDecimals } from "../ui/format";
import { stepLabel } from "../ui/plain";
import { amountsToSplit, splitAmounts, toAllocation, toSplit, type Split } from "../ui/split";
import { colors, fonts, portionColors, radius, surfaceShadow } from "../ui/theme";

const PRESETS: { label: string; split: Split }[] = [
  { label: "50 / 30 / 20", split: { home: 50, save: 30, stocks: 20 } },
  { label: "70 / 20 / 10", split: { home: 70, save: 20, stocks: 10 } },
];

const dollars = (micro: bigint): number => Number(micro) / 1_000_000;
const sameSplit = (a: Split, b: Split): boolean => a.home === b.home && a.save === b.save && a.stocks === b.stocks;
const dateOf = (seconds: bigint): string => new Date(Number(seconds) * 1000).toDateString();

function parseTotal(input: string): bigint {
  try {
    return parseUnits(input.trim() || "0", 6);
  } catch {
    return 0n;
  }
}

function Row({ name, note, amount, color, fg, off, micro, code, rates }: { name: string; note: string; amount: number; color: string; fg: string; off: boolean; micro?: bigint; code?: string; rates?: Rates | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, opacity: off ? 0.4 : 1 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color }} accessibilityElementsHidden importantForAccessibility="no">
        <View style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="strong">{name}</T>
        <T variant="small">{note}</T>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Money value={amount} variant="strong" style={{ fontSize: 20 }} />
        {micro !== undefined && micro > 0n && !off && <LocalLine micro={micro} code={code} rates={rates ?? null} align="right" />}
      </View>
    </View>
  );
}

function WhoSection({ p }: { p: Portionly }) {
  async function paste(): Promise<void> {
    p.setError(null);
    p.setRecipient(p.normalizeTyped(await Clipboard.getStringAsync()));
    p.setReview(null);
  }
  return (
    <Surface>
      <T variant="h2">Who is it for?</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {p.people.map((person) => (
          <Chip key={person.index} label={person.name} active={p.activeIndex === person.index} onPress={() => p.selectAccount(person.index, person.recipient)} />
        ))}
        <Chip label="Someone new" active={p.activeIndex === 0} onPress={() => p.selectAccount(0, "")} />
      </View>
      {p.activePerson ? (
        <T variant="small" style={{ marginTop: 14 }}>
          Paying from the wallet that is only for {p.activePerson.name}.
        </T>
      ) : (
        <View style={{ marginTop: 14 }}>
          <Field
            label="Their address or pay link"
            autoCapitalize="none"
            autoCorrect={false}
            value={p.recipient}
            onChangeText={(value) => {
              p.setRecipient(p.normalizeTyped(value));
              p.setReview(null);
            }}
            right={<Button small variant="ghost" label="Paste" disabled={p.busy !== null} onPress={() => void paste()} />}
          />
          {p.rates && (
            <View style={{ gap: 8, marginTop: 14 }}>
              <T variant="label">Show amounts in</T>
              <CurrencyPicker label="Show amounts in" value={p.oneOffCurrency} onChange={p.setOneOffCurrency} />
            </View>
          )}
        </View>
      )}
    </Surface>
  );
}

function AmountSection({ p }: { p: Portionly }) {
  const input = useRef<TextInput>(null);
  const ready = p.shownBalances ? formatUsd(parseTotalBalance(p.shownBalances.ausd)) : null;
  const who = p.activePerson ? `${p.activePerson.name}'s wallet` : "your main wallet";
  return (
    <Surface style={{ alignItems: "center" }}>
      <T variant="label">You send</T>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 4 }}>
        <T variant="display" style={{ fontSize: 56, lineHeight: 66 }}>$</T>
        <TextInput
          ref={input}
          accessibilityLabel="Amount to send in dollars"
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor="rgba(91,102,118,0.45)"
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          value={p.totalInput}
          onChangeText={(value) => {
            p.setTotalInput(cleanAmountInput(value));
            p.setReview(null);
          }}
          style={{ minWidth: 70, fontFamily: fonts.black, fontSize: 56, letterSpacing: -1.5, color: colors.ink, padding: 0, textAlign: "left" }}
        />
      </View>
      {parseTotal(p.totalInput) > 0n && <LocalLine micro={parseTotal(p.totalInput)} code={p.sendCurrency} rates={p.rates} align="center" style={{ marginTop: 2 }} />}
      <T variant="small">{ready ? `${ready} ready in ${who}. Amounts are in digital dollars (AUSD).` : "Amounts are in digital dollars (AUSD)."}</T>
    </Surface>
  );
}

function parseTotalBalance(value: string): bigint {
  try {
    return parseUnits(value, 6);
  } catch {
    return 0n;
  }
}

function PortionSection({ p }: { p: Portionly }) {
  const total = parseTotal(p.totalInput);
  const growing = p.mode === "grow";
  const split: Split = growing ? toSplit(p.allocation) : { home: 100, save: 0, stocks: 0 };
  const amounts = splitAmounts(total, split);

  useEffect(() => {
    if (growing && split.save === 0 && p.lockDays > 0) p.setLockDays(0);
  }, [growing, split.save, p.lockDays]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Surface>
      <Segmented
        label="How to send"
        options={[{ key: "home", label: "Send home" }, { key: "grow", label: "Send + grow" }]}
        value={p.mode}
        onChange={(key) => {
          p.setMode(key);
          p.setReview(null);
        }}
      />
      {!growing ? (
        <T variant="small" style={{ marginTop: 14 }}>All of it arrives as digital dollars, ready to spend.</T>
      ) : (
        <View style={{ marginTop: 18, gap: 4 }}>
          <SlipBar
            split={split}
            onChange={(next) => {
              p.setAllocation(toAllocation(next));
              p.setReview(null);
            }}
          />
          <T variant="small" style={{ textAlign: "center" }}>Drag the lines to change the portions.</T>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 8 }}>
            {PRESETS.map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                active={sameSplit(split, preset.split)}
                onPress={() => {
                  p.setAllocation(toAllocation(preset.split));
                  p.setReview(null);
                }}
              />
            ))}
          </View>
        </View>
      )}
      <Divider />
      {showsLocal(p.sendCurrency, p.rates) && total > 0n && (
        <View style={{ marginBottom: 12 }}>
          <RateNote />
        </View>
      )}
      <Row name="Home now" note="Ready to spend" amount={dollars(amounts.home)} color={portionColors.home.bg} fg={portionColors.home.fg} off={split.home === 0} micro={amounts.home} code={p.sendCurrency} rates={p.rates} />
      {growing && (
        <>
          <View style={{ height: 14 }} />
          <Row name="Savings that earn" note="Kept in a savings vault" amount={dollars(amounts.save)} color={portionColors.save.bg} fg={portionColors.save.fg} off={split.save === 0} micro={amounts.save} code={p.sendCurrency} rates={p.rates} />
          <View style={{ height: 14 }} />
          <Row name="US tech stocks" note="Apple, Nvidia, Amazon and more" amount={dollars(amounts.stocks)} color={portionColors.stocks.bg} fg={portionColors.stocks.fg} off={split.stocks === 0} micro={amounts.stocks} code={p.sendCurrency} rates={p.rates} />
          <Divider />
          {split.stocks > 0 && (
            <T variant="small" style={{ marginBottom: 10 }}>If the stock price moves more than 1% while sending, that part goes to savings instead.</T>
          )}
          <T variant="label" color={colors.ink}>Keep savings locked for</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {LOCK_DAYS.map((days) => (
              <Chip key={days} label={lockLabel(days)} active={p.lockDays === days} disabled={split.save === 0 && days > 0} onPress={() => { p.setLockDays(days); p.setReview(null); }} />
            ))}
          </View>
          {p.lockDays > 0 && <T variant="small" style={{ marginTop: 10 }}>Only they can claim the locked part, and only after the date shown on the next step.</T>}
        </>
      )}
    </Surface>
  );
}

function ReviewView({ p }: { p: Portionly }) {
  const review = p.review!;
  const to = p.activePerson?.name ?? shortAddress(p.recipient);
  const split = toSplit(p.plannedAllocation);
  const unlockAt = review.plan?.unlockAt ?? 0n;
  return (
    <>
      <Rise>
        <T variant="title">Check and send</T>
      </Rise>
      <Rise index={1}>
        <Surface>
          <T variant="label">Sending to {to}</T>
          <Money value={dollars(review.total)} variant="display" style={{ fontSize: 48, lineHeight: 54 }} />
          <LocalLine micro={review.total} code={p.sendCurrency} rates={p.rates} />
          <View style={{ marginTop: 14 }}>
            <SlipBar split={split} compact />
          </View>
          <Divider />
          <Row name="Home now" note="Arrives as digital dollars" amount={dollars(review.nowAmount)} color={portionColors.home.bg} fg={portionColors.home.fg} off={review.nowAmount === 0n} micro={review.nowAmount} code={p.sendCurrency} rates={p.rates} />
          {review.growAmount > 0n && (
            <>
              <View style={{ height: 14 }} />
              <Row name="Savings that earn" note={unlockAt > 0n ? `Locked until ${dateOf(unlockAt)}` : "Open any time"} amount={dollars(review.growAmount)} color={portionColors.save.bg} fg={portionColors.save.fg} off={false} micro={review.growAmount} code={p.sendCurrency} rates={p.rates} />
            </>
          )}
          {review.investAmount > 0n && (
            <>
              <View style={{ height: 14 }} />
              <Row
                name="US tech stocks"
                note={review.quote ? `About ${trimDecimals(formatUnits(review.quote.amountOut, 18), 4)} fund shares at the live price` : "Apple, Nvidia, Amazon and more"}
                amount={dollars(review.investAmount)}
                color={portionColors.stocks.bg}
                fg={portionColors.stocks.fg}
                off={false}
                micro={review.investAmount}
                code={p.sendCurrency}
                rates={p.rates}
              />
            </>
          )}
          <Divider />
          <T variant="small">Two fingerprint checks: one to allow the amount, one to send.</T>
        </Surface>
      </Rise>
      {p.error && <Notice tone="error" text={p.error} />}
      <Rise index={2}>
        {review.plan ? (
          p.wallet ? (
            <Button label="Confirm and send" disabled={p.busy !== null} onPress={() => void p.execute()} />
          ) : (
            <Button label="Unlock with your fingerprint" loading={p.busy !== null} onPress={() => void p.connect("unlock")} />
          )
        ) : (
          <Notice text="Sending is not switched on in this version of the app yet. Nothing was sent." />
        )}
      </Rise>
      <Rise index={3}>
        <Button variant="secondary" label="Go back" disabled={p.busy !== null} onPress={() => p.setReview(null)} />
      </Rise>
    </>
  );
}

function SendingView({ p }: { p: Portionly }) {
  const progress = p.progress;
  const current = progress ? (progress.state === "confirmed" ? progress.index + 1 : progress.index) : 0;
  const caption = !progress
    ? "Getting ready"
    : progress.state === "signing"
      ? "Waiting for your fingerprint"
      : progress.state === "pending"
        ? `${stepLabel(progress.label)}, waiting for the network`
        : current >= 2
          ? "Checking that everything arrived"
          : "Done, on to the next step";
  return (
    <>
      <Rise>
        <T variant="title">Sending</T>
      </Rise>
      <Rise index={1}>
        <Surface>
          <ProgressSteps steps={["Allowing the amount", "Sending"]} current={Math.min(current, 1)} finished={false} />
          <Divider />
          <T variant="small">{caption}</T>
        </Surface>
      </Rise>
      {p.error && <Notice tone="error" text={p.error} />}
    </>
  );
}

export function Send({ p }: { p: Portionly }) {
  const total = parseTotal(p.totalInput);
  const locked = !p.wallet;
  const sending = p.busy === BUSY_SENDING;
  const split = p.mode === "grow" ? toSplit(p.allocation) : { home: 100, save: 0, stocks: 0 };
  const canReview = total > 0n && p.recipient.trim() !== "" && p.allocationTotal === 100 && p.busy === null;

  return (
    <Screen resetKey={p.review ? "review" : p.busy === BUSY_SENDING ? "sending" : "form"}>
      <LockBanner p={p} />
      {sending ? (
        <SendingView p={p} />
      ) : p.review ? (
        <ReviewView p={p} />
      ) : (
        <>
          <Rise>
            <T variant="title">Send money</T>
          </Rise>
          <Rise index={1}><WhoSection p={p} /></Rise>
          <Rise index={2}><AmountSection p={p} /></Rise>
          <Rise index={3}><PortionSection p={p} /></Rise>
          {p.error && <Notice tone="error" text={p.error} />}
          <Rise index={4}>
            {locked && p.address ? (
              <Button label="Unlock with your fingerprint" loading={p.busy !== null} onPress={() => void p.connect("unlock")} />
            ) : (
              <Button label="Review" loading={p.busy === "Getting the live price"} disabled={!canReview} onPress={() => void p.makeReview()} />
            )}
          </Rise>
          {split.stocks > 0 && <T variant="small" style={{ textAlign: "center" }}>You will see the live price before anything is sent.</T>}
        </>
      )}
    </Screen>
  );
}

/** Full screen moment after a payment went through. */
export function SendSuccess({ p, onDone }: { p: Portionly; onDone: () => void }) {
  const result = p.result;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, speed: 8, bounciness: 16, delay: 200, useNativeDriver: true }).start();
  }, [pop]);
  if (!result) return null;

  const plan = result.plan;
  const to = p.people.find((person) => person.recipient.toLowerCase() === plan.recipient.toLowerCase())?.name ?? shortAddress(plan.recipient);
  const savedAmount = result.usedFallback ? plan.growAmount + plan.investAmount : plan.growAmount;
  const stocksAmount = result.usedFallback ? 0n : plan.investAmount;
  const split = amountsToSplit({ home: plan.nowAmount, save: savedAmount, stocks: stocksAmount }, plan.amountIn);
  const recipientPerson = p.people.find((person) => person.recipient.toLowerCase() === plan.recipient.toLowerCase());
  const currency = recipientPerson ? recipientPerson.currency : p.oneOffCurrency;
  const executeHash = result.hashes[1] ?? result.hashes[result.hashes.length - 1];

  return (
    <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 40, backgroundColor: colors.sky }}>
      <Screen tabBar={false} paddingTop={56}>
        <View style={{ alignItems: "center", gap: 14 }}>
          <Animated.View
            style={[
              { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", transform: [{ scale: pop }] },
              surfaceShadow,
              { shadowColor: colors.accent },
            ]}
          >
            <Tick size={52} />
          </Animated.View>
          <Rise index={2}>
            <T variant="title" style={{ textAlign: "center" }}>Sent to {to}</T>
          </Rise>
          <Rise index={3}>
            <Money value={dollars(plan.amountIn)} variant="display" style={{ fontSize: 48, lineHeight: 54 }} />
          </Rise>
          {showsLocal(currency, p.rates) && (
            <Rise index={3}>
              <LocalLine micro={plan.amountIn} code={currency} rates={p.rates} align="center" />
            </Rise>
          )}
        </View>
        <Rise index={4}>
          <Surface>
            <SlipBar split={split} compact />
            <Divider />
            <View style={{ gap: 12 }}>
              {plan.nowAmount > 0n && <T variant="body">{formatUsd(plan.nowAmount)} arrived as digital dollars, ready to spend.</T>}
              {savedAmount > 0n && (
                <T variant="body">
                  {formatUsd(savedAmount)} went into savings that earn, {plan.unlockAt > 0n ? `locked until ${dateOf(plan.unlockAt)}` : "ready for them to use"}.
                </T>
              )}
              {plan.investAmount > 0n && (
                <T variant="body">
                  {result.usedFallback
                    ? "The stock price moved more than 1%, so the stocks part went to savings instead."
                    : `${formatUsd(plan.investAmount)} went into US tech stocks.`}
                </T>
              )}
            </View>
          </Surface>
        </Rise>
        <Rise index={5}>
          <ButtonRow>
            <Button variant="secondary" label="View receipt" disabled={!executeHash} onPress={() => void Linking.openURL(`https://monadscan.com/tx/${executeHash}`)} style={{ flex: 1 }} />
            <Button label="Done" onPress={onDone} style={{ flex: 1 }} />
          </ButtonRow>
        </Rise>
      </Screen>
    </View>
  );
}
