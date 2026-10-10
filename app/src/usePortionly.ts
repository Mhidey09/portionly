import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Share } from "react-native";
import { formatUnits, isAddress, parseUnits, type Address, type Hash, type Hex } from "viem";
import type { PlannedCall } from "./aqqqProofPlan";
import { buildCreateLinkCalls, linkFromBytes, portionAmounts } from "./linkPay";
import { claimLink, cancelLink, readLinkPayment, sweepLinkFee, type LinkPayment } from "./linkNetwork";
import { addressOfKey, type StoredLink } from "./linkRecords";
import { currencyOfLink, linkStatus, parseMoneyLink, parseSendInputs, shareMessage, shareUrl, type SentLink } from "./linkShare";
import { forgetLink, loadLinks, rememberLink } from "./linkStore";
import { gasTopUpFor } from "./funding";
import { addPerson, setPersonCurrency, type Person } from "./people";
import { useRates } from "./useRates";
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
export const BUSY_LINK = "Making your money link";
export const BUSY_COLLECT = "Collecting your money";
export const BUSY_TAKE_BACK = "Taking your money back";

export type LinkReview = {
  key: Hex;
  address: Address;
  total: bigint;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  lockDays: number;
  calls: PlannedCall[];
};
export type LinkResult = { url: string; key: Hex; total: bigint; nowAmount: bigint; growAmount: bigint; investAmount: bigint; lockDays: number; currency?: string };
export type ClaimCheck = { ok: true; key: Hex; payment: LinkPayment; total: bigint; currency?: string } | { ok: false; message: string };
export type ClipboardClaim = { key: Hex; text: string; total: bigint };

/** All state and actions for the app. The handlers below are the ones that lived in App.tsx. */
export function usePortionly() {
  const [wallets, setWallets] = useState<Wallets | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleBalances, setPeopleBalances] = useState<Record<number, Balances>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [newName, setNewName] = useState("");
  const [newRecipient, setNewRecipient] = useState("");
  const [newCurrency, setNewCurrency] = useState<string | undefined>(undefined);
  // For a one off send to someone who is not saved. Not remembered.
  const [oneOffCurrency, setOneOffCurrency] = useState<string | undefined>(undefined);
  const fx = useRates();
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
  const [review, setReviewState] = useState<Review | null>(null);
  const [progress, setProgress] = useState<ExecutionUpdate | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>("Loading your account");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Send to a link: no recipient address. The money waits under a one time key until someone collects it.
  const [sendByLink, setSendByLinkState] = useState(false);
  const [linkReview, setLinkReview] = useState<LinkReview | null>(null);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [sentLinks, setSentLinks] = useState<SentLink[]>([]);
  const [clipboardClaim, setClipboardClaim] = useState<ClipboardClaim | null>(null);
  const storedLinks = useRef<StoredLink[]>([]);
  const lastPeeked = useRef<string | null>(null);

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

  /** Clearing the review (any edit does) also clears a link review. */
  function setReview(value: Review | null): void {
    setReviewState(value);
    if (value === null) setLinkReview(null);
  }

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
  // The currency amounts are shown in as a second line: the saved person's, or the one picked for a one off send.
  const sendCurrency = activePerson ? activePerson.currency : oneOffCurrency;
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
      void fx.refresh();
      await refresh();
      if (wallets) await refreshPeople();
      await loadLocks();
      await refreshSentLinks();
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
      const next = addPerson(people, newName, parseRecipientInput(newRecipient), newCurrency);
      await savePeople(next);
      setPeople(next);
      setNewName("");
      setNewRecipient("");
      setNewCurrency(undefined);
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

  /** Changes (or clears) the currency shown for a saved person. */
  async function changePersonCurrency(person: Person, currency: string | undefined): Promise<void> {
    try {
      const next = setPersonCurrency(people, person.index, currency);
      await savePeople(next);
      setPeople(next);
    } catch (caught) {
      setError(describeError(caught));
    }
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

  // ---- Send to a link ----

  function setSendByLink(on: boolean): void {
    setSendByLinkState(on);
    setLinkReview(null);
    setError(null);
  }

  /** Every saved link with what the chain says about it. A read that fails shows as unknown, never as closed. */
  async function refreshSentLinks(list: StoredLink[] = storedLinks.current): Promise<void> {
    const merged = await Promise.all(
      list.map(async (entry): Promise<SentLink> => {
        try {
          const payment = await readLinkPayment(entry.address);
          return {
            ...entry,
            status: linkStatus(payment),
            ...(payment ? { lockDays: payment.lockDays, nowAmount: payment.nowAmount, growAmount: payment.growAmount, investAmount: payment.investAmount } : {}),
          };
        } catch {
          return { ...entry, status: linkStatus("error") };
        }
      }),
    );
    setSentLinks(merged);
  }

  useEffect(() => {
    loadLinks()
      .then((list) => {
        storedLinks.current = list;
        return refreshSentLinks(list);
      })
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function makeLinkReview(): Promise<void> {
    setBusy("Getting ready");
    setError(null);
    setLinkReview(null);
    setLinkResult(null);
    try {
      if (!wallets) throw new Error("Unlock your account first");
      const main = wallets.main.address;
      const { total, percentages } = parseSendInputs(totalInput, plannedAllocation);
      const current = await refresh(main);
      if (!current) throw new Error("Balances are unavailable");
      const portions = portionAmounts(total, percentages[0] * 100, percentages[1] * 100, percentages[2] * 100);
      const days = mode === "grow" ? lockDays : 0;
      const fresh = linkFromBytes(await Crypto.getRandomBytesAsync(32));
      // No stock quote here: the price is taken when the person collects.
      const calls = buildCreateLinkCalls({ account: main, link: fresh.address, portions, lockDays: days, ausdBalance: current.ausd, monBalance: current.mon });
      setLinkReview({ key: fresh.key, address: fresh.address, total, ...portions, lockDays: days, calls });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function executeLink(): Promise<void> {
    if (!wallets || !linkReview) return;
    const reviewed = linkReview;
    setBusy(BUSY_LINK);
    setError(null);
    setProgress(null);
    try {
      // The key is saved first, so a crash can never leave money under a key this phone forgot.
      const entry: StoredLink = { key: reviewed.key, address: reviewed.address, createdAt: Date.now(), total: reviewed.total.toString(), ...(sendCurrency ? { cur: sendCurrency } : {}) };
      storedLinks.current = await rememberLink(entry);
      await sendCalls(wallets.main, reviewed.calls, setProgress);
      const payment = await readLinkPayment(reviewed.address);
      if (
        !payment ||
        !payment.open ||
        payment.nowAmount !== reviewed.nowAmount ||
        payment.growAmount !== reviewed.growAmount ||
        payment.investAmount !== reviewed.investAmount ||
        payment.lockDays !== reviewed.lockDays
      ) {
        throw new Error("Post-check failed: the payment does not show as set aside");
      }
      setLinkResult({
        url: shareUrl(reviewed.key, sendCurrency),
        key: reviewed.key,
        total: reviewed.total,
        nowAmount: reviewed.nowAmount,
        growAmount: reviewed.growAmount,
        investAmount: reviewed.investAmount,
        lockDays: reviewed.lockDays,
        currency: sendCurrency,
      });
      setLinkReview(null);
      await refresh(wallets.main.address).catch(() => undefined);
      await refreshSentLinks();
    } catch (caught) {
      // The key stays saved. If the money was set aside, the sender can take it back from Home.
      let note = "";
      try {
        const payment = await readLinkPayment(reviewed.address);
        if (payment?.open) note = " The money was set aside, but the link was not finished. Find it under Links you sent on Home and take it back.";
      } catch {
        // Offline: the saved link shows its real state on the next refresh.
      }
      setError(describeError(caught) + note);
      await refresh(wallets.main.address).catch(() => undefined);
      await refreshSentLinks().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function takeBack(link: SentLink): Promise<void> {
    if (!wallets) {
      setError("Unlock your account first");
      return;
    }
    setBusy(BUSY_TAKE_BACK);
    setError(null);
    setProgress(null);
    try {
      await cancelLink(wallets.main, link.address, setProgress);
      // The link no longer needs its fee balance; bring that home too. The refund above stands either way.
      await sweepLinkFee(link.key, wallets.main.address).catch(() => undefined);
      setMoneyNote("The money is back in your account.");
      await refresh(wallets.main.address).catch(() => undefined);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      await refreshSentLinks().catch(() => undefined);
      setBusy(null);
    }
  }

  /** Lets the sender tidy the list once a link is no longer waiting. Never offered for an open payment. */
  async function removeSentLink(link: SentLink): Promise<void> {
    if (link.status === "waiting" || link.status === "unknown") return;
    try {
      // Once this phone forgets the key, any fee balance left under it is out of reach, so collect it first.
      if (wallets) await sweepLinkFee(link.key, wallets.main.address).catch(() => undefined);
      storedLinks.current = await forgetLink(link.key);
      await refreshSentLinks();
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  async function shareSentLink(link: StoredLink, amount: string): Promise<void> {
    try {
      await Share.share({ message: `${shareMessage(amount)} ${shareUrl(link.key, link.cur)}` });
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  async function shareNewLink(amount: string): Promise<void> {
    if (!linkResult) return;
    try {
      await Share.share({ message: `${shareMessage(amount)} ${linkResult.url}` });
    } catch (caught) {
      setError(describeError(caught));
    }
  }

  // ---- Collecting a money link ----

  /** What is waiting under a pasted link, or a plain message saying why nothing is. */
  async function checkClaim(text: string): Promise<ClaimCheck> {
    let key: Hex;
    try {
      key = parseMoneyLink(text);
    } catch {
      return { ok: false, message: "That is not a Portionly money link. Paste the whole link you were sent." };
    }
    try {
      const payment = await readLinkPayment(addressOfKey(key));
      if (!payment) return { ok: false, message: "This money link was never set up. Ask the sender to send it again." };
      if (!payment.open) return { ok: false, message: "This money link was already collected or taken back." };
      return { ok: true, key, payment, total: payment.nowAmount + payment.growAmount + payment.investAmount, currency: currencyOfLink(text) };
    } catch {
      return { ok: false, message: "We could not reach the network. Check your connection and try again." };
    }
  }

  async function collect(key: Hex): Promise<boolean> {
    if (!wallets) {
      setError("Unlock your account first");
      return false;
    }
    setBusy(BUSY_COLLECT);
    setError(null);
    setProgress(null);
    try {
      await claimLink(key, wallets.main.address, setProgress);
      setClipboardClaim((current) => (current?.key === key ? null : current));
      await refresh(wallets.main.address).catch(() => undefined);
      await loadLocks();
      return true;
    } catch (caught) {
      setError(describeError(caught));
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** Looks at the clipboard once per distinct value. Never collects on its own. */
  async function peekClipboard(): Promise<void> {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || text === lastPeeked.current || text.length > 2_000) return;
      lastPeeked.current = text;
      const key = parseMoneyLink(text);
      // A link this phone made is the sender's own, so it is never offered back to them as something to collect.
      if (storedLinks.current.some((entry) => entry.key === key)) return;
      const payment = await readLinkPayment(addressOfKey(key));
      if (payment?.open) setClipboardClaim({ key, text, total: payment.nowAmount + payment.growAmount + payment.investAmount });
    } catch {
      // Not a money link, or no network. Say nothing.
    }
  }

  function dismissClipboardClaim(): void {
    setClipboardClaim(null);
  }

  useEffect(() => {
    if (!ready || !address) return;
    void peekClipboard();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void peekClipboard();
    });
    return () => sub.remove();
  }, [ready, address]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // state
    wallets, wallet, address, myLink, ready, busy, error, refreshing,
    people, peopleBalances, activeIndex, activePerson, senderAddress,
    balances, shownBalances, savingsValue, locks, locksError, withdrawals, moneyNote, sellReview,
    recipient, totalInput, mode, lockDays, allocation, plannedAllocation, allocationTotal,
    review, progress, result, newName, newRecipient, topUpInputs,
    rates: fx.rates, ratesStatus: fx.status, newCurrency, oneOffCurrency, sendCurrency,
    sendByLink, linkReview, linkResult, sentLinks, clipboardClaim,
    // setters the screens use directly
    setRecipient, setTotalInput, setMode, setLockDays, setAllocation, setReview, setResult, setError,
    setNewName, setNewRecipient, setTopUpInputs, setMoneyNote, setNewCurrency, setOneOffCurrency,
    // actions
    connect, claim, withdrawSavings, collectWithdrawal, quoteSell, sellStocks, manualRefresh,
    selectAccount, normalizeTyped, pasteRecipient, shareLink, submitPerson, changePersonCurrency, topUp, makeReview, execute,
    setSendByLink, setLinkResult, makeLinkReview, executeLink, takeBack, removeSentLink, shareSentLink, shareNewLink,
    checkClaim, collect, dismissClipboardClaim,
  };
}

export type Portionly = ReturnType<typeof usePortionly>;
