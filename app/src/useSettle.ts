import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { parseUnits, type Address } from "viem";
import { buildSettleCalls, LOW_TEST_DOLLARS, MIN_TEST_MON, TESTNET_FAUCET_URL, toRecord, type Metrics, type SettledTransfer, type SettlePlan } from "./agora";
import { fetchMetrics, quoteSettle, readPairHealth, readSwapperApproved, readTestBalances, requestTestDollars, settleSend, type PairHealth, type TestBalances } from "./agoraNetwork";
import { loadSettled, saveSettled } from "./agoraStore";
import type { ExecutionUpdate } from "./network";
import { parseRecipientInput } from "./receive";
import type { Portionly } from "./usePortionly";
import { describeError } from "./wallet";

type Step = "form" | "review" | "sending" | "done";
type Done = { record: SettledTransfer; seconds: number };

function parseDollars(input: string): bigint {
  try {
    return parseUnits(input.trim() || "0", 6);
  } catch {
    return 0n;
  }
}

/** State and actions for the Instant settle flow. Kept apart from usePortionly; it only reads the wallet and people from `p`. */
export function useSettle(p: Portionly) {
  const address = p.address;
  const main = p.wallets?.main ?? null;
  const [step, setStep] = useState<Step>("form");
  const [balances, setBalances] = useState<TestBalances | null>(null);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [health, setHealth] = useState<PairHealth | null>(null);
  const [metrics, setMetrics] = useState<Metrics | undefined>(undefined);
  const [recent, setRecent] = useState<SettledTransfer[]>([]);
  const [personIndex, setPersonIndex] = useState<number | null>(null);
  const [recipientText, setRecipientText] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<SettlePlan | null>(null);
  const [progress, setProgress] = useState<ExecutionUpdate | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const quoteSeq = useRef(0);

  const amountIn = parseDollars(amountInput);
  const person = personIndex === null ? null : p.people.find((entry) => entry.index === personIndex) ?? null;
  let recipient: Address | null = null;
  if (person) recipient = person.recipient;
  else {
    try {
      recipient = recipientText.trim() === "" ? null : parseRecipientInput(recipientText);
    } catch {
      recipient = null;
    }
  }

  const refresh = useCallback(async (): Promise<TestBalances | undefined> => {
    if (!address) return undefined;
    const [next, ok] = await Promise.all([readTestBalances(address), readSwapperApproved(address)]);
    setBalances(next);
    setApproved(ok);
    return next;
  }, [address]);

  // Public reads: balances, pool health, supply numbers and the saved list. None of these need the fingerprint.
  useEffect(() => {
    if (!address) return;
    void refresh().catch((caught) => setError(describeError(caught)));
    void readPairHealth().then(setHealth).catch(() => setHealth(null));
    void fetchMetrics().then(setMetrics);
    void loadSettled().then(setRecent).catch(() => setRecent([]));
  }, [address, refresh]);

  // A live quote, a moment after the amount stops changing.
  useEffect(() => {
    setQuote(null);
    if (amountIn <= 0n) {
      setQuoting(false);
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    const timer = setTimeout(() => {
      quoteSettle(amountIn)
        .then((out) => {
          if (seq === quoteSeq.current) setQuote(out);
        })
        .catch(() => undefined)
        .finally(() => {
          if (seq === quoteSeq.current) setQuoting(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [amountInput]); // eslint-disable-line react-hooks/exhaustive-deps

  function edit(): void {
    setError(null);
    if (step === "review") setStep("form");
  }

  function pickPerson(index: number | null): void {
    setPersonIndex(index);
    if (index !== null) setRecipientText("");
    edit();
  }

  function typeRecipient(text: string): void {
    setPersonIndex(null);
    setRecipientText(text);
    edit();
  }

  async function paste(): Promise<void> {
    typeRecipient((await Clipboard.getStringAsync()).trim());
  }

  function typeAmount(text: string): void {
    setAmountInput(text);
    edit();
  }

  /** Reads everything fresh and builds the plan. Nothing is signed here. */
  async function review(): Promise<void> {
    setError(null);
    setBusy("Getting the live quote");
    try {
      if (!address) throw new Error("Unlock with your fingerprint first.");
      if (!recipient) throw new Error("Enter a valid address for who gets it.");
      const [fresh, out, pool] = await Promise.all([refresh(), quoteSettle(amountIn), readPairHealth()]);
      setHealth(pool);
      if (!fresh) throw new Error("We could not read your balances.");
      if (pool.paused) throw new Error("Instant settlement is paused right now. Try again later.");
      const swapperApproved = approved ?? (await readSwapperApproved(address));
      const next = buildSettleCalls({ account: address, recipient, amountIn, quotedOut: out, ausdBalance: fresh.ausd, monBalance: fresh.mon, nowMs: Date.now(), swapperApproved });
      setQuote(out);
      setPlan(next);
      setStep("review");
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function confirm(): Promise<void> {
    if (!main || !plan) return;
    setError(null);
    setProgress(null);
    setStep("sending");
    try {
      const outcome = await settleSend(main, plan, setProgress);
      const record = toRecord({ hash: outcome.settleHash, at: Date.now(), recipient: plan.recipient, amountIn: outcome.amountIn, amountOut: outcome.amountOut, seconds: outcome.seconds });
      setDone({ record, seconds: outcome.seconds });
      setStep("done");
      setPlan(null);
      void refresh().catch(() => undefined);
      // The transfer is on chain whether or not the list could be saved.
      void saveSettled(recent, record).then(setRecent).catch(() => undefined);
    } catch (caught) {
      setError(describeError(caught));
      setStep("form");
      setPlan(null);
      void refresh().catch(() => undefined);
    }
  }

  async function getTestDollars(): Promise<void> {
    if (!main) return;
    setError(null);
    setBusy("Getting test dollars");
    try {
      await requestTestDollars(main);
      await refresh();
    } catch (caught) {
      const raw = describeError(caught);
      setError(/MaxFrequencyExceeded|frequency/i.test(raw) ? "The faucet allows one request a minute. Wait a moment and try again." : /MaxAllowedExceeded/i.test(raw) ? "You already hold the most test dollars the faucet allows." : raw);
    } finally {
      setBusy(null);
    }
  }

  /** Test MON comes from Monad's own faucet. Copy the address first so it can be pasted there. */
  async function openMonFaucet(): Promise<void> {
    if (address) await Clipboard.setStringAsync(address).catch(() => undefined);
    await Linking.openURL(TESTNET_FAUCET_URL).catch(() => setError("We could not open the faucet. Visit faucet.monad.xyz in your browser."));
  }

  function reset(): void {
    setStep("form");
    setDone(null);
    setPlan(null);
    setProgress(null);
    setError(null);
    setAmountInput("");
    setQuote(null);
  }

  const lowDollars = balances !== null && balances.ausd < LOW_TEST_DOLLARS;
  const noMon = balances !== null && balances.mon === 0n;
  const lowMon = balances !== null && balances.mon < MIN_TEST_MON;

  return {
    step, balances, approved, health, metrics, recent, person, personIndex, recipient, recipientText, amountInput, amountIn, quote, quoting, error, busy, plan, progress, done,
    lowDollars, noMon, lowMon,
    setError, pickPerson, typeRecipient, typeAmount, paste, review, confirm, getTestDollars, openMonFaucet, reset, goBack: () => setStep("form"), refresh,
  };
}

export type Settle = ReturnType<typeof useSettle>;
