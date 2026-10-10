import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import { Share } from "react-native";
import { formatUnits, isAddress, parseUnits, type Address, type Hash } from "viem";
import { gasTopUpFor } from "./funding";
import { addPerson, type Person } from "./people";
import { envioUrl, splitterAddress } from "./config";
import {
  claimLocked,
  previewSavings,
  quoteAqqqToAusd,
  readWithdrawalDate,
  sendCalls,
  executePortionly,
  formatBalances,
  fundPerson,
  quoteAusdToAqqq,
  readBalances,
  type Balances,
  type ExecutionUpdate,
  type Quote,
} from "./network";
import { buildPortionlyPlan, type LockDays, type PortionlyPlan } from "./portionlyPlan";
import { parseRecipientInput, receiveLink } from "./receive";
import { fetchLocks, type LockedSaving } from "./locks";
import { buildClaimWithdrawalCall, buildSellStocksCalls, buildWithdrawSavingsCalls, type Withdrawal } from "./recipientActions";
import { formatUsd } from "./ui/format";
import { loadWithdrawals, saveWithdrawals, type PendingWithdrawal, loadAccount, loadPeople, savePeople } from "./storage";
import {
  createAccount,
  describeError,
  endWallets,
  signIn,
  unlockStoredWallet,
  type Wallet,
  type Wallets,
} from "./wallet";

export type Allocation = { now: string; grow: string; invest: string };
export type Mode = "home" | "grow";
const SEND_HOME: Allocation = { now: "100", grow: "0", invest: "0" };
export type Review = {
  plan?: PortionlyPlan;
  quote?: Quote;
  total: bigint;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  minimumOut: bigint;
};
export type Result = { hashes: Hash[]; usedFallback: boolean; investOut: bigint; growShares: bigint; plan: PortionlyPlan };
export type SellReview = { amountIn: bigint; quoted: bigint; minimumOut: bigint; calls: ReturnType<typeof buildSellStocksCalls>["calls"] };

export const DEFAULT_ALLOCATION: Allocation = { now: "50", grow: "30", invest: "20" };
/** The busy label while a payment is going out, so screens can show the progress steps. */
export const BUSY_SENDING = "Sending your payment";

/** All state and actions for the app. The handlers below are the ones that lived in App.tsx. */
export function usePortionly() {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleBalances, setPeopleBalances] = useState<Record<number, Balances>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [newName, setNewName] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [topUpInputs, setTopUpInputs] = useState<Record<number, string>>({});
  const [knownAddress, setKnownAddress] = useState<Address | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [recipient, setRecipient] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [mode, setMode] = useState<Mode>("home");
  const [lockDays, setLockDays] = useState<LockDays>(0);
  const [locks, setLocks] = useState<LockedSaving[] | null>(null);
  const [locksError, setLocksError] = useState<string | null>(null);
  const [savingsValue, setSavingsValue] = useState<{ instant: bigint; standard: bigint } | null>(null);
  const [sellReview, setSellReview] = useState<SellReview | null>(null);
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [moneyNote, setMoneyNote] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<Allocation>(DEFAULT_ALLOCATION);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<ExecutionUpdate | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>("Loading your account");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Promise.all([loadAccount(), loadPeople()])
      .then(([stored, saved]) => {
        setKnownAddress(stored?.address ?? null);
        setPeople(saved);
      })
      .catch((caught) => setError(describeError(caught)))
      .finally(() => {
        setBusy(null);
        setReady(true);
      });
  }, []);

  useEffect(() => () => endWallets(wallets), [wallets]);

  const activePerson = people.find((person) => person.index === activeIndex) ?? null;
  const wallet: Wallet | null = wallets?.byIndex.get(activeIndex) ?? null;

  const address = wallets?.main.address ?? knownAddress;
  const myLink = useMemo(() => {
    if (!address) return null;
    try {
      return receiveLink(address);
    } catch {
      return null;
    }
  }, [address]);
  // The account that pays in the Payment card: Main, or the selected person's own account.
  const senderAddress = activeIndex === 0 ? address : wallet?.address ?? null;
  const shownBalances = useMemo(() => (balances ? formatBalances(balances) : null), [balances]);
  const plannedAllocation = mode === "home" ? SEND_HOME : allocation;
  const allocationTotal = Number(plannedAllocation.now || 0) + Number(plannedAllocation.grow || 0) + Number(plannedAllocation.invest || 0);

  async function refresh(target = senderAddress): Promise<Balances | undefined> {
    if (!target) return undefined;
    const next = await readBalances(target);
    setBalances(next);
    return next;
  }

  // Balances are public, so read them as soon as the address is known, even while locked.
  useEffect(() => {
    if (senderAddress) void refresh(senderAddress).catch((caught) => setError(describeError(caught)));
  }, [senderAddress]);

  async function loadLocks(): Promise<void> {
    if (!address) return;
    if (!envioUrl) {
      setLocksError("We can't show locked savings in this version of the app.");
      return;
    }
    try {
      setLocks(await fetchLocks(envioUrl, address));
      setLocksError(null);
    } catch (caught) {
      setLocksError(describeError(caught));
    }
  }

  useEffect(() => {
    void loadLocks();
  }, [address]);

  async function claim(lock: LockedSaving): Promise<void> {
    if (!wallets) return;
    setBusy("Claiming your savings");
    setError(null);
    try {
      await claimLocked(wallets.main, lock.key);
      await loadLocks();
      await refresh(wallets.main.address);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    loadWithdrawals().then(setWithdrawals).catch(() => setWithdrawals([]));
  }, []);

  useEffect(() => {
    setSellReview(null);
    if (!balances || balances.earn === 0n) {
      setSavingsValue(balances ? { instant: 0n, standard: 0n } : null);
      return;
    }
    previewSavings(balances.earn).then(setSavingsValue).catch(() => setSavingsValue(null));
  }, [balances]);

  async function withdrawSavings(kind: Withdrawal): Promise<void> {
    if (!wallet || !balances) return;
    setBusy(kind === "instant" ? "Withdrawing your savings" : "Requesting your withdrawal");
    setError(null);
    setMoneyNote(null);
    try {
      const shares = balances.earn;
      const calls = buildWithdrawSavingsCalls({ account: wallet.address, shares, shareBalance: balances.earn, monBalance: balances.mon, kind });
      const date = kind === "standard" ? await readWithdrawalDate() : null;
      await sendCalls(wallet, calls, setProgress);
      if (date) {
        const next = [...withdrawals, { account: wallet.address, ...date, shares: shares.toString() }];
        await saveWithdrawals(next);
        setWithdrawals(next);
        setMoneyNote(`Withdrawal requested. Collect it on or after ${new Date(date.claimableAt * 1000).toDateString()}.`);
      } else {
        setMoneyNote("Savings withdrawn as digital dollars.");
      }
      await refresh(wallet.address);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function collectWithdrawal(pending: PendingWithdrawal): Promise<void> {
    if (!wallet) return;
    setBusy("Collecting your withdrawal");
    setError(null);
    try {
      await sendCalls(wallet, [buildClaimWithdrawalCall({ account: wallet.address, year: pending.year, month: pending.month, day: pending.day })], setProgress);
      const next = withdrawals.filter((w) => w !== pending);
      await saveWithdrawals(next);
      setWithdrawals(next);
      setMoneyNote("Withdrawal collected as digital dollars.");
      await refresh(wallet.address);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function quoteSell(): Promise<void> {
    if (!wallet || !balances || balances.aqqq === 0n) return;
    setBusy("Getting a sell price");
    setError(null);
    try {
      const quote = await quoteAqqqToAusd(balances.aqqq);
      const built = buildSellStocksCalls({ account: wallet.address, amountIn: balances.aqqq, aqqqBalance: balances.aqqq, monBalance: balances.mon, quote, nowMs: Date.now(), slippageBps: 100 });
      setSellReview({ amountIn: balances.aqqq, quoted: quote.amountOut, minimumOut: built.minimumOut, calls: built.calls });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function sellStocks(): Promise<void> {
    if (!wallet || !sellReview) return;
    setBusy("Selling your stocks");
    setError(null);
    try {
      await sendCalls(wallet, sellReview.calls, setProgress);
      setMoneyNote(`Sold. You get at least ${formatUsd(sellReview.minimumOut)} in digital dollars.`);
      setSellReview(null);
      await refresh(wallet.address);
    } catch (caught) {
      setError(describeError(caught));
      setSellReview(null);
    } finally {
      setBusy(null);
    }
  }

  async function manualRefresh(): Promise<void> {
    setRefreshing(true);
    setError(null);
    try {
      await refresh();
      if (wallets) await refreshPeople();
      await loadLocks();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setRefreshing(false);
    }
  }

  async function connect(kind: "create" | "signin" | "unlock"): Promise<void> {
    setBusy(kind === "create" ? "Creating your account" : "Opening your account");
    setError(null);
    setReview(null);
    try {
      const next = kind === "create" ? await createAccount() : kind === "signin" ? await signIn() : await unlockStoredWallet();
      if (!next) throw new Error("No stored Mera account was found");
      endWallets(wallets);
      setWallets(next);
      setKnownAddress(next.main.address);
      const nextActive = next.byIndex.has(activeIndex) ? activeIndex : 0;
      setActiveIndex(nextActive);
      await refresh(next.byIndex.get(nextActive)?.address ?? next.main.address);
      await refreshPeople(next);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function refreshPeople(source: Wallets | null = wallets, list: Person[] = people): Promise<void> {
    if (!source) return;
    const entries = await Promise.all(
      list.map(async (person) => {
        const account = source.byIndex.get(person.index);
        return account ? ([person.index, await readBalances(account.address)] as const) : undefined;
      }),
    );
    setPeopleBalances(Object.fromEntries(entries.filter((entry) => entry !== undefined)));
  }

  function selectAccount(index: number, defaultRecipient: string): void {
    setActiveIndex(index);
    setRecipient(defaultRecipient);
    setReview(null);
    setResult(null);
    setError(null);
    const target = index === 0 ? wallets?.main.address ?? address : wallets?.byIndex.get(index)?.address;
    if (target) void refresh(target).catch((caught) => setError(describeError(caught)));
  }

  /** Typing or pasting a pay link or ethereum: URI becomes the plain address; anything else is left as typed and checked on send. */
  function normalizeTyped(value: string): string {
    const trimmed = value.trim();
    if (!/[/:\s]/.test(trimmed)) return trimmed;
    try {
      return parseRecipientInput(trimmed);
    } catch {
      return trimmed;
    }
  }

  async function pasteRecipient(): Promise<void> {
    setError(null);
    try {
      const text = await Clipboard.getStringAsync();
      setRecipient(parseRecipientInput(text));
      setReview(null);
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  async function shareLink(link: string): Promise<void> {
    try {
      await Share.share({ message: `Pay me with Portionly: ${link}` });
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  async function submitPerson(): Promise<boolean> {
    setError(null);
    setBusy("Adding person");
    let added = false;
    try {
      const next = addPerson(people, newName, parseRecipientInput(newRecipient));
      await savePeople(next);
      setPeople(next);
      setNewName("");
      setNewRecipient("");
      added = true;
      if (wallets) {
        // A new person needs a new signing session, which needs one more passkey unlock.
        setBusy("Opening the new wallet");
        const reopened = await unlockStoredWallet();
        if (reopened) {
          endWallets(wallets);
          setWallets(reopened);
          await refreshPeople(reopened, next);
        }
      }
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
    return added;
  }

  async function topUp(person: Person): Promise<void> {
    setError(null);
    setResult(null);
    setProgress(null);
    setBusy(`Topping up ${person.name}`);
    try {
      const main = wallets?.main;
      const personWallet = wallets?.byIndex.get(person.index);
      if (!main || !personWallet) throw new Error("Unlock your account first");
      const ausd = parseUnits((topUpInputs[person.index] ?? "").trim(), 6);
      if (ausd <= 0n) throw new Error("Top up must be greater than zero");
      const current = await readBalances(personWallet.address);
      await fundPerson(main, personWallet.address, ausd, gasTopUpFor(current.mon), setProgress);
      setTopUpInputs({ ...topUpInputs, [person.index]: "" });
      await refreshPeople();
      if (activeIndex === 0) await refresh(main.address);
    } catch (caught) {
      setError(describeError(caught));
      await refreshPeople().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function makeReview(): Promise<void> {
    setBusy("Getting the live price");
    setError(null);
    setReview(null);
    setResult(null);
    try {
      if (!senderAddress) throw new Error("Unlock your account first");
      if (activePerson && recipient.toLowerCase() !== activePerson.recipient.toLowerCase()) throw new Error("Recipient is fixed for this person");
      if (!isAddress(recipient)) throw new Error("Enter the recipient's address");
      if (senderAddress && recipient.toLowerCase() === senderAddress.toLowerCase()) throw new Error("That's your own account. Enter the address of the person you're paying.");
      const total = parseUnits(totalInput.trim(), 6);
      if (total <= 0n) throw new Error("Total must be greater than zero");
      const percentages = [plannedAllocation.now, plannedAllocation.grow, plannedAllocation.invest].map((value) => Number(value));
      if (!percentages.every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) throw new Error("Percentages must be whole numbers from 0 to 100");
      if (percentages.reduce((sum, value) => sum + value, 0) !== 100) throw new Error("Allocation must total exactly 100%");

      const currentBalances = await refresh(senderAddress);
      if (!currentBalances) throw new Error("Balances are unavailable");
      // Same split rule as the plan builder: dust goes to the last bucket in use.
      let nowAmount = total * BigInt(percentages[0]) / 100n;
      let growAmount = total * BigInt(percentages[1]) / 100n;
      let investAmount = 0n;
      if (percentages[2] > 0) investAmount = total - nowAmount - growAmount;
      else if (percentages[1] > 0) growAmount = total - nowAmount;
      else nowAmount = total;
      const quote = investAmount > 0n ? await quoteAusdToAqqq(investAmount) : undefined;
      const minimumOut = quote ? quote.amountOut * 9_900n / 10_000n : 0n;
      const plan = splitterAddress
        ? buildPortionlyPlan({
            chainId: 143,
            account: senderAddress,
            recipient,
            splitter: splitterAddress,
            ausdBalance: currentBalances.ausd,
            monBalance: currentBalances.mon,
            amountIn: total,
            nowBps: percentages[0] * 100,
            growBps: percentages[1] * 100,
            investBps: percentages[2] * 100,
            quote,
            nowMs: Date.now(),
            lockDays: mode === "grow" ? lockDays : 0,
            slippageBps: 100,
          })
        : undefined;
      setReview({ plan, quote, total, nowAmount, growAmount, investAmount, minimumOut });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function execute(): Promise<void> {
    if (!wallet || !review?.plan) return;
    setBusy(BUSY_SENDING);
    setError(null);
    setProgress(null);
    try {
      const completed = await executePortionly(wallet, review.plan, setProgress);
      setResult({ ...completed, plan: review.plan });
      setReview(null);
      await refresh(wallet.address);
      await refreshPeople();
    } catch (caught) {
      setError(describeError(caught));
      await refresh(wallet.address).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  return {
    // state
    wallets, wallet, address, myLink, ready, busy, error, refreshing,
    people, peopleBalances, activeIndex, activePerson, senderAddress,
    balances, shownBalances, savingsValue, locks, locksError, withdrawals, moneyNote, sellReview,
    recipient, totalInput, mode, lockDays, allocation, plannedAllocation, allocationTotal,
    review, progress, result, newName, newRecipient, topUpInputs,
    // setters the screens use directly
    setRecipient, setTotalInput, setMode, setLockDays, setAllocation, setReview, setResult, setError,
    setNewName, setNewRecipient, setTopUpInputs, setMoneyNote,
    // actions
    connect, claim, withdrawSavings, collectWithdrawal, quoteSell, sellStocks, manualRefresh,
    selectAccount, normalizeTyped, pasteRecipient, shareLink, submitPerson, topUp, makeReview, execute,
  };
}

export type Portionly = ReturnType<typeof usePortionly>;
