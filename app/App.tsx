import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { formatUnits, isAddress, parseUnits, type Address, type Hash } from "viem";
import { gasTopUpFor } from "./src/funding";
import { addPerson, type Person } from "./src/people";
import { ADDRESSES } from "./src/aqqqProofPlan";
import { envioUrl, splitterAddress } from "./src/config";
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
} from "./src/network";
import { buildPortionlyPlan, LOCK_DAYS, type LockDays, type PortionlyPlan } from "./src/portionlyPlan";
import { parseRecipientInput, receiveLink } from "./src/receive";
import { canClaim, fetchLocks, type LockedSaving } from "./src/locks";
import { buildClaimWithdrawalCall, buildSellStocksCalls, buildWithdrawSavingsCalls, type Withdrawal } from "./src/recipientActions";
import { loadWithdrawals, saveWithdrawals, type PendingWithdrawal, loadAccount, loadPeople, savePeople } from "./src/storage";
import {
  createAccount,
  describeError,
  endWallets,
  signIn,
  unlockStoredWallet,
  type Wallet,
  type Wallets,
} from "./src/wallet";

type Allocation = { now: string; grow: string; invest: string };
type Mode = "home" | "grow";
const SEND_HOME: Allocation = { now: "100", grow: "0", invest: "0" };
type Review = {
  plan?: PortionlyPlan;
  quote?: Quote;
  total: bigint;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  minimumOut: bigint;
};
type Result = { hashes: Hash[]; usedFallback: boolean; investOut: bigint; growShares: bigint; plan: PortionlyPlan };

const DEFAULT_ALLOCATION: Allocation = { now: "50", grow: "30", invest: "20" };
const short = (value: string): string => `${value.slice(0, 8)}…${value.slice(-6)}`;
const amount = (value: bigint, decimals = 6): string => formatUnits(value, decimals);

function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, (pressed || disabled) && styles.buttonMuted]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

function AllocationInput({ label, value, tint, onChange }: { label: string; value: string; tint: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.allocationInput}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.percentRow}>
        <TextInput
          accessibilityLabel={`${label} percentage`}
          keyboardType="number-pad"
          maxLength={3}
          onChangeText={onChange}
          selectTextOnFocus
          style={styles.percentInput}
          value={value}
        />
        <Text style={styles.percentSign}>%</Text>
      </View>
    </View>
  );
}

export default function App() {
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
  const [totalInput, setTotalInput] = useState("100");
  const [mode, setMode] = useState<Mode>("home");
  const [lockDays, setLockDays] = useState<LockDays>(0);
  const [locks, setLocks] = useState<LockedSaving[] | null>(null);
  const [locksError, setLocksError] = useState<string | null>(null);
  const [savingsValue, setSavingsValue] = useState<{ instant: bigint; standard: bigint } | null>(null);
  const [sellReview, setSellReview] = useState<{ amountIn: bigint; quoted: bigint; minimumOut: bigint; calls: ReturnType<typeof buildSellStocksCalls>["calls"] } | null>(null);
  const [withdrawals, setWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [moneyNote, setMoneyNote] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<Allocation>(DEFAULT_ALLOCATION);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<ExecutionUpdate | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>("Loading account");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    Promise.all([loadAccount(), loadPeople()])
      .then(([stored, saved]) => {
        setKnownAddress(stored?.address ?? null);
        setPeople(saved);
      })
      .catch((caught) => setError(describeError(caught)))
      .finally(() => setBusy(null));
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
      setLocksError("Locked savings can't be listed: this build has no indexer address.");
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
    setBusy("Claiming savings");
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
    setBusy(kind === "instant" ? "Withdrawing savings" : "Requesting withdrawal");
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
        setMoneyNote("Savings withdrawn to AUSD.");
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
    setBusy("Collecting withdrawal");
    setError(null);
    try {
      await sendCalls(wallet, [buildClaimWithdrawalCall({ account: wallet.address, year: pending.year, month: pending.month, day: pending.day })], setProgress);
      const next = withdrawals.filter((w) => w !== pending);
      await saveWithdrawals(next);
      setWithdrawals(next);
      setMoneyNote("Withdrawal collected as AUSD.");
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
    setBusy("Selling stocks");
    setError(null);
    try {
      await sendCalls(wallet, sellReview.calls, setProgress);
      setMoneyNote(`Sold for at least ${formatUnits(sellReview.minimumOut, 6)} AUSD.`);
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
    setBusy(kind === "create" ? "Creating Android passkey" : "Opening Mera account");
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

  async function submitPerson(): Promise<void> {
    setError(null);
    setBusy("Adding person");
    try {
      const next = addPerson(people, newName, parseRecipientInput(newRecipient));
      await savePeople(next);
      setPeople(next);
      setNewName("");
      setNewRecipient("");
      if (wallets) {
        // A new person needs a new signing session, which needs one more passkey unlock.
        setBusy("Opening the new account");
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
    if (!senderAddress) throw new Error("Unlock your account first");
    setBusy("Fetching live Monad quote");
    setError(null);
    setReview(null);
    setResult(null);
    try {
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
    setBusy("Executing Portionly allocation");
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F6F3" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void manualRefresh()} />}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>PORTIONLY · MONAD</Text>
            <Text style={styles.title}>One payment, already divided.</Text>
            <Text style={styles.subtitle}>Send AUSD now, grow part in Upshift, and invest part in aQQQ. The recipient gets every position directly.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Mera account</Text>
              <Text style={[styles.badge, wallet ? styles.badgeReady : styles.badgeWarm]}>{wallet ? "UNLOCKED" : address ? "LOCKED" : "NEW"}</Text>
            </View>
            {address ? (
              <>
                <Text selectable numberOfLines={1} style={styles.address}>{address}</Text>
                <View style={styles.twoButtons}>
                  <View style={styles.flex}><Button secondary label="Copy" onPress={() => void Clipboard.setStringAsync(address)} /></View>
                  {!wallet && <View style={styles.flex}><Button label="Unlock" onPress={() => void connect("unlock")} disabled={busy !== null} /></View>}
                </View>
              </>
            ) : (
              <View style={styles.stack}>
                <Button label="Create passkey account" onPress={() => void connect("create")} disabled={busy !== null} />
                <Button secondary label="Use existing passkey" onPress={() => void connect("signin")} disabled={busy !== null} />
              </View>
            )}
          </View>

          {address && (
            <>
              {myLink && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Receive</Text>
                  <Text style={styles.helper}>Share this so people can pay you</Text>
                  <View style={styles.qrBox}><QRCode value={myLink} size={200} /></View>
                  <Text selectable style={styles.address}>{myLink}</Text>
                  <View style={styles.twoButtons}>
                    <View style={styles.flex}><Button secondary label="Copy link" onPress={() => void Clipboard.setStringAsync(myLink)} /></View>
                    <View style={styles.flex}><Button label="Share" onPress={() => void shareLink(myLink)} /></View>
                  </View>
                </View>
              )}
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{activePerson ? `Send to ${activePerson.name}` : "Payment"}</Text>
                  <Pressable onPress={() => void manualRefresh()} disabled={refreshing}><Text style={styles.link}>{refreshing ? "Updating…" : "Refresh balances"}</Text></Pressable>
                </View>
                <Text style={styles.fieldLabel}>RECIPIENT</Text>
                {activePerson && <Text style={styles.helper}>Paid from the account that belongs to {activePerson.name}. The recipient is fixed.</Text>}
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!activePerson}
                  onChangeText={(value) => { setRecipient(normalizeTyped(value)); setReview(null); }}
                  placeholder="0x…"
                  placeholderTextColor="#A19F99"
                  style={styles.textInput}
                  value={recipient}
                />
                {!activePerson && <Button secondary label="Paste" onPress={() => void pasteRecipient()} disabled={busy !== null} />}
                <Text style={styles.fieldLabel}>TOTAL AUSD</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(value) => { setTotalInput(value); setReview(null); }}
                  placeholder="100"
                  placeholderTextColor="#A19F99"
                  style={[styles.textInput, styles.amountInput]}
                  value={totalInput}
                />
                {activePerson && !wallet && <Text style={styles.helper}>Unlock to use this account.</Text>}
                {activePerson && <Button secondary label="Back to Main" onPress={() => selectAccount(0, "")} disabled={busy !== null} />}
                <View style={styles.balanceStrip}>
                  <View><Text style={styles.label}>AUSD</Text><Text style={styles.value}>{shownBalances?.ausd ?? "—"}</Text></View>
                  <View><Text style={styles.label}>MON GAS</Text><Text style={styles.value}>{shownBalances?.mon ?? "—"}</Text></View>
                  <View><Text style={styles.label}>aQQQ</Text><Text style={styles.value}>{shownBalances?.aqqq ?? "—"}</Text></View>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.presets}>
                  <Pressable accessibilityRole="button" onPress={() => { setMode("home"); setReview(null); }}><Text style={[styles.preset, mode === "home" && styles.presetActive]}>Send home</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setMode("grow"); setReview(null); }}><Text style={[styles.preset, mode === "grow" && styles.presetActive]}>Send + grow</Text></Pressable>
                </View>
                {mode === "home" ? (
                  <>
                    <Text style={styles.helper}>All of it arrives as AUSD, ready to spend, in seconds.</Text>
                    <Button label="Review" onPress={() => void makeReview()} disabled={busy !== null} />
                  </>
                ) : (
                <>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>Allocation</Text>
                  <Text style={[styles.total, allocationTotal === 100 ? styles.totalGood : styles.totalBad]}>{allocationTotal}% total</Text>
                </View>
                <View style={styles.allocationGrid}>
                  <AllocationInput label="Now" tint="#D9EAD3" value={allocation.now} onChange={(value) => { setAllocation({ ...allocation, now: value }); setReview(null); }} />
                  <AllocationInput label="Grow" tint="#DCE8F4" value={allocation.grow} onChange={(value) => { setAllocation({ ...allocation, grow: value }); setReview(null); }} />
                  <AllocationInput label="Invest" tint="#F1DFC7" value={allocation.invest} onChange={(value) => { setAllocation({ ...allocation, invest: value }); setReview(null); }} />
                </View>
                <View style={styles.presets}>
                  <Pressable onPress={() => { setAllocation(DEFAULT_ALLOCATION); setReview(null); }}><Text style={styles.preset}>Balanced 50/30/20</Text></Pressable>
                  <Pressable onPress={() => { setAllocation({ now: "70", grow: "20", invest: "10" }); setReview(null); }}><Text style={styles.preset}>More now 70/20/10</Text></Pressable>
                </View>
                <Text style={styles.fieldLabel}>KEEP GROW SAVED FOR</Text>
                <View style={styles.presets}>
                  {LOCK_DAYS.map((days) => (
                    <Pressable key={days} accessibilityRole="button" onPress={() => { setLockDays(days); setReview(null); }}>
                      <Text style={[styles.preset, lockDays === days && styles.presetActive]}>{days === 0 ? "No lock" : days === 365 ? "1 year" : `${days / 30} month${days === 30 ? "" : "s"}`}</Text>
                    </Pressable>
                  ))}
                </View>
                {lockDays > 0 && <Text style={styles.helper}>The Grow part stays locked for the recipient until the date shown on review. Only they can claim it, and only after that date.</Text>}
                <Text style={styles.helper}>If Invest can’t meet the signed 1% price bound, its portion goes to Grow instead.</Text>
                <Button label="Get live quote" onPress={() => void makeReview()} disabled={busy !== null || allocationTotal !== 100} />
                </>
                )}
              </View>
            </>
          )}

          {address && balances && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your money</Text>
              <View style={styles.personBox}>
                <View style={styles.row}>
                  <Text style={styles.routeName}>Savings that earn</Text>
                  <Text style={styles.routeAmount}>{formatUnits(balances.earn, 6)} earnAUSD</Text>
                </View>
                <Text style={styles.helper}>Held in the Upshift AUSD vault. Earnings are not guaranteed.{savingsValue && balances.earn > 0n ? ` Worth ${formatUnits(savingsValue.standard, 6)} AUSD if withdrawn in about 3 days, or ${formatUnits(savingsValue.instant, 6)} AUSD now.` : ""}</Text>
                {balances.earn > 0n && (wallet ? (
                  <>
                    <Button label="Withdraw now (0.2% fee)" onPress={() => void withdrawSavings("instant")} disabled={busy !== null} />
                    <Button secondary label="Withdraw free in about 3 days" onPress={() => void withdrawSavings("standard")} disabled={busy !== null} />
                  </>
                ) : <Text style={styles.helper}>Unlock to withdraw.</Text>)}
                {withdrawals.filter((w) => w.account.toLowerCase() === (wallet?.address ?? address).toLowerCase()).map((w) => {
                  const ready = Date.now() / 1000 >= w.claimableAt;
                  return (
                    <View key={`${w.year}-${w.month}-${w.day}-${w.shares}`} style={styles.row}>
                      <Text style={styles.helper}>{formatUnits(BigInt(w.shares), 6)} earnAUSD {ready ? "ready to collect" : `on its way, ready ${new Date(w.claimableAt * 1000).toDateString()}`}</Text>
                      {ready && wallet && <Pressable onPress={() => void collectWithdrawal(w)} disabled={busy !== null}><Text style={styles.link}>Collect</Text></Pressable>}
                    </View>
                  );
                })}
              </View>
              <View style={styles.personBox}>
                <View style={styles.row}>
                  <Text style={styles.routeName}>US tech stocks</Text>
                  <Text style={styles.routeAmount}>{formatUnits(balances.aqqq, 18)} aQQQ</Text>
                </View>
                <Text style={styles.helper}>Apple, Nvidia, Amazon, Google and more. aQQQ tracks the Nasdaq-100; it is not direct share ownership. Selling crosses a 0.9% pool fee.</Text>
                {balances.aqqq > 0n && wallet && !sellReview && <Button secondary label="Get sell price" onPress={() => void quoteSell()} disabled={busy !== null} />}
                {sellReview && (
                  <>
                    <Text style={styles.helper}>About {formatUnits(sellReview.quoted, 6)} AUSD now, at least {formatUnits(sellReview.minimumOut, 6)} AUSD or the sale cancels.</Text>
                    <Button label="Sell for AUSD" onPress={() => void sellStocks()} disabled={busy !== null} />
                  </>
                )}
              </View>
              {moneyNote && <Text style={styles.helper}>{moneyNote}</Text>}
            </View>
          )}

          {address && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Locked for you</Text>
              {locksError && <Text style={styles.helper}>{locksError}</Text>}
              {!locksError && locks === null && <Text style={styles.helper}>Loading locked savings…</Text>}
              {locks !== null && locks.filter((lock) => !lock.claimed).length === 0 && <Text style={styles.helper}>Nothing is locked for this account.</Text>}
              {locks?.filter((lock) => !lock.claimed).map((lock) => {
                const due = canClaim(lock, BigInt(Math.floor(Date.now() / 1000)));
                return (
                  <View key={lock.key} style={styles.personBox}>
                    <View style={styles.row}>
                      <Text style={styles.routeName}>{formatUnits(lock.amount, 6)} earnAUSD</Text>
                      <Text style={styles.helper}>{due ? "Ready" : `Unlocks ${new Date(Number(lock.unlockAt) * 1000).toDateString()}`}</Text>
                    </View>
                    {due && <Button label={wallets ? "Claim to my account" : "Unlock to claim"} onPress={() => void (wallets ? claim(lock) : connect("unlock"))} disabled={busy !== null} />}
                  </View>
                );
              })}
            </View>
          )}

          {address && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>People</Text>
              <Text style={styles.helper}>One fingerprint opens every account. Each person gets their own account, budget and history. They see the account that pays them, not your main balance.</Text>
              {people.map((person) => {
                const shown = peopleBalances[person.index] ? formatBalances(peopleBalances[person.index]) : null;
                const selected = activeIndex === person.index;
                return (
                  <View key={person.index} style={[styles.personBox, selected && styles.personBoxActive]}>
                    <View style={styles.row}>
                      <Text style={styles.routeName}>{person.name}</Text>
                      <Text style={styles.contract}>{short(person.recipient)}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.helper}>AUSD {shown?.ausd ?? "—"}</Text>
                      <Text style={styles.helper}>MON {shown?.mon ?? "—"}</Text>
                    </View>
                    {wallets ? (
                      <>
                        <TextInput
                          keyboardType="decimal-pad"
                          onChangeText={(value) => setTopUpInputs({ ...topUpInputs, [person.index]: value })}
                          placeholder="AUSD to top up"
                          placeholderTextColor="#A19F99"
                          style={styles.textInput}
                          value={topUpInputs[person.index] ?? ""}
                        />
                        <View style={styles.twoButtons}>
                          <View style={styles.flex}><Button secondary label="Top up from Main" onPress={() => void topUp(person)} disabled={busy !== null} /></View>
                          <View style={styles.flex}><Button label={`Send to ${person.name}`} onPress={() => selectAccount(person.index, person.recipient)} disabled={busy !== null} /></View>
                        </View>
                      </>
                    ) : (
                      <Button secondary label="Unlock to use" onPress={() => void connect("unlock")} disabled={busy !== null} />
                    )}
                  </View>
                );
              })}
              <Text style={styles.fieldLabel}>ADD PERSON</Text>
              <TextInput maxLength={32} onChangeText={setNewName} placeholder="Name" placeholderTextColor="#A19F99" style={styles.textInput} value={newName} />
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={(value) => setNewRecipient(normalizeTyped(value))} placeholder="Address or pay link" placeholderTextColor="#A19F99" style={styles.textInput} value={newRecipient} />
              <Button label="Add person" onPress={() => void submitPerson()} disabled={busy !== null || newName.trim() === "" || newRecipient.trim() === ""} />
            </View>
          )}

          {review && (
            <View style={[styles.card, styles.reviewCard]}>
              <View style={styles.row}><Text style={styles.cardTitle}>Review</Text><Text style={styles.badge}>LIVE QUOTE</Text></View>
              <View style={styles.routeRow}><Text style={styles.routeName}>Now</Text><Text style={styles.routeAmount}>{amount(review.nowAmount)} AUSD</Text></View>
              <View style={styles.routeRow}><Text style={styles.routeName}>Grow</Text><Text style={styles.routeAmount}>{amount(review.growAmount)} AUSD</Text></View>
              {review.plan && review.plan.unlockAt > 0n && <Text style={styles.helper}>Locked until {new Date(Number(review.plan.unlockAt) * 1000).toDateString()}</Text>}
              <View style={styles.routeRow}><Text style={styles.routeName}>Invest</Text><Text style={styles.routeAmount}>{amount(review.investAmount)} AUSD</Text></View>
              <View style={styles.divider} />
              {review.quote && <View style={styles.routeRow}><Text style={styles.label}>QUOTED aQQQ</Text><Text style={styles.monoValue}>{formatUnits(review.quote.amountOut, 18)}</Text></View>}
              {review.quote && <View style={styles.routeRow}><Text style={styles.label}>MINIMUM aQQQ</Text><Text style={styles.monoValue}>{formatUnits(review.minimumOut, 18)}</Text></View>}
              <Text style={styles.helper}>Two confirmations: exact AUSD approval, then one atomic allocation. Final balances and the PlanExecuted event are checked before success is shown.</Text>
              {review.plan ? (
                wallet ? <Button label="Confirm and send" onPress={() => void execute()} disabled={busy !== null} /> : <Button label="Unlock account to send" onPress={() => void connect("unlock")} disabled={busy !== null} />
              ) : (
                <View style={styles.gate}>
                  <Text style={styles.gateTitle}>Mainnet execution is gated</Text>
                  <Text style={styles.gateText}>The live quote is real. Sending stays disabled until the verified Splitter V2 address is included in this build.</Text>
                </View>
              )}
              <Button secondary label="Edit allocation" onPress={() => setReview(null)} disabled={busy !== null} />
            </View>
          )}

          {busy && <View style={styles.status}><ActivityIndicator color="#202622" /><Text style={styles.statusText}>{busy}</Text></View>}
          {progress && <Text style={styles.statusText}>{progress.label}: {progress.state}{progress.hash ? ` · ${short(progress.hash)}` : ""}</Text>}
          {error && <Text selectable style={styles.error}>{error}</Text>}
          {result && (
            <View style={[styles.card, styles.success]}>
              <Text style={styles.cardTitle}>{result.plan.growAmount === 0n && result.plan.investAmount === 0n ? "Sent" : "Allocation verified"}</Text>
              {result.plan.nowAmount > 0n && <Text style={styles.successAmount}>{amount(result.plan.nowAmount)} AUSD to {short(result.plan.recipient)}</Text>}
              {result.growShares > 0n && <Text style={styles.helper}>{formatUnits(result.growShares, 6)} earnAUSD savings shares {result.plan.unlockAt > 0n ? `locked until ${new Date(Number(result.plan.unlockAt) * 1000).toDateString()}` : "delivered"}.</Text>}
              {result.plan.investAmount > 0n && <Text style={styles.helper}>{result.usedFallback ? "The stock price moved past its limit, so the Invest part went to savings instead." : `${formatUnits(result.investOut, 18)} aQQQ delivered.`}</Text>}
              {result.hashes.map((hash) => <Text selectable key={hash} style={styles.hash}>{hash}</Text>)}
            </View>
          )}

          <View style={styles.contracts}>
            <Text style={styles.label}>PINNED MAINNET ROUTES</Text>
            <Text style={styles.contract}>AUSD {short(ADDRESSES.ausd)}</Text>
            <Text style={styles.contract}>Upshift {short(ADDRESSES.growVault)}</Text>
            <Text style={styles.contract}>aQQQ {short(ADDRESSES.aqqq)}</Text>
            <Text style={styles.contract}>Splitter {splitterAddress ? short(splitterAddress) : "awaiting deployment"}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F6F3" },
  content: { padding: 20, gap: 14, paddingBottom: 52 },
  hero: { paddingVertical: 14, gap: 8 },
  eyebrow: { color: "#5B645E", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  title: { color: "#202622", fontSize: 38, fontWeight: "700", letterSpacing: -1.7, lineHeight: 42 },
  subtitle: { color: "#676C68", fontSize: 15, lineHeight: 23, maxWidth: 500 },
  qrBox: { alignItems: "center", backgroundColor: "#FFFFFF", padding: 8 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#E7E4DE", borderWidth: 1, borderRadius: 12, padding: 18, gap: 14 },
  reviewCard: { borderColor: "#9EA9A2" },
  cardTitle: { color: "#202622", fontSize: 18, fontWeight: "600" },
  badge: { color: "#346538", backgroundColor: "#EDF3EC", borderRadius: 999, fontSize: 10, fontWeight: "700", letterSpacing: 0.7, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  badgeReady: { color: "#346538", backgroundColor: "#EDF3EC" },
  badgeWarm: { color: "#956400", backgroundColor: "#FBF3DB" },
  address: { color: "#353B37", fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  stack: { gap: 10 },
  flex: { flex: 1 },
  twoButtons: { flexDirection: "row", gap: 10 },
  button: { alignItems: "center", backgroundColor: "#202622", borderRadius: 6, paddingHorizontal: 15, paddingVertical: 14 },
  buttonSecondary: { backgroundColor: "#F7F6F3", borderColor: "#E2DFD9", borderWidth: 1 },
  buttonMuted: { opacity: 0.48 },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  buttonSecondaryText: { color: "#343A36" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  link: { color: "#4C6257", fontSize: 12, fontWeight: "600" },
  fieldLabel: { color: "#7A7D79", fontSize: 10, fontWeight: "700", letterSpacing: 0.8, marginBottom: -8 },
  textInput: { backgroundColor: "#FBFBFA", borderColor: "#E7E4DE", borderWidth: 1, borderRadius: 8, color: "#242A26", fontFamily: "monospace", fontSize: 13, paddingHorizontal: 13, paddingVertical: 13 },
  amountInput: { fontFamily: undefined, fontSize: 24, fontWeight: "600", letterSpacing: -0.6 },
  balanceStrip: { backgroundColor: "#F7F6F3", borderRadius: 8, flexDirection: "row", justifyContent: "space-between", gap: 10, padding: 12 },
  label: { color: "#7A7D79", fontSize: 9, fontWeight: "700", letterSpacing: 0.7 },
  value: { color: "#252A27", fontSize: 12, fontWeight: "600", marginTop: 4, maxWidth: 98 },
  total: { fontSize: 12, fontWeight: "700" },
  totalGood: { color: "#346538" },
  totalBad: { color: "#9F2F2D" },
  allocationGrid: { flexDirection: "row", gap: 8 },
  allocationInput: { backgroundColor: "#FBFBFA", borderColor: "#E7E4DE", borderWidth: 1, borderRadius: 8, flex: 1, padding: 11 },
  dot: { borderRadius: 4, height: 8, marginBottom: 10, width: 8 },
  percentRow: { flexDirection: "row", alignItems: "baseline", marginTop: 4 },
  percentInput: { color: "#202622", fontSize: 22, fontWeight: "600", minWidth: 34, padding: 0 },
  percentSign: { color: "#858883", fontSize: 13 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { backgroundColor: "#F7F6F3", borderColor: "#E7E4DE", borderWidth: 1, borderRadius: 999, color: "#555C57", fontSize: 11, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 7 },
  presetActive: { backgroundColor: "#202522", borderColor: "#202522", color: "#FFFFFF" },
  helper: { color: "#6C716D", fontSize: 12, lineHeight: 18 },
  routeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 16 },
  routeName: { color: "#505652", fontSize: 14 },
  routeAmount: { color: "#202622", fontSize: 16, fontWeight: "600" },
  monoValue: { color: "#303632", flex: 1, fontFamily: "monospace", fontSize: 11, textAlign: "right" },
  divider: { backgroundColor: "#ECE9E4", height: 1 },
  gate: { backgroundColor: "#FBF3DB", borderRadius: 8, gap: 5, padding: 12 },
  gateTitle: { color: "#745613", fontSize: 13, fontWeight: "700" },
  gateText: { color: "#745F2C", fontSize: 12, lineHeight: 18 },
  status: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", padding: 10 },
  statusText: { color: "#515853", fontSize: 12, textAlign: "center" },
  error: { backgroundColor: "#FDEBEC", color: "#9F2F2D", borderRadius: 8, padding: 13, lineHeight: 19 },
  success: { backgroundColor: "#EDF3EC", borderColor: "#C9D9C7" },
  successAmount: { color: "#346538", fontSize: 22, fontWeight: "700" },
  hash: { color: "#4E6252", fontFamily: "monospace", fontSize: 9, lineHeight: 15 },
  personBox: { backgroundColor: "#FBFBFA", borderColor: "#E7E4DE", borderWidth: 1, borderRadius: 8, gap: 10, padding: 12 },
  personBoxActive: { borderColor: "#9EA9A2" },
  contracts: { padding: 8, gap: 5 },
  contract: { color: "#7A7D79", fontFamily: "monospace", fontSize: 10 },
});
