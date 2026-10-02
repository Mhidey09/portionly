import * as Clipboard from "expo-clipboard";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { formatUnits, isAddress, parseUnits, type Address, type Hash } from "viem";
import { ADDRESSES } from "./src/aqqqProofPlan";
import { splitterAddress } from "./src/config";
import {
  executePortionly,
  formatBalances,
  quoteAusdToAqqq,
  readBalances,
  type Balances,
  type ExecutionUpdate,
  type Quote,
} from "./src/network";
import { buildPortionlyPlan, type PortionlyPlan } from "./src/portionlyPlan";
import { loadAccount } from "./src/storage";
import {
  createAccount,
  describeError,
  signIn,
  unlockStoredWallet,
  type Wallet,
} from "./src/wallet";

type Allocation = { now: string; grow: string; invest: string };
type Review = {
  plan?: PortionlyPlan;
  quote: Quote;
  total: bigint;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  minimumOut: bigint;
};
type Result = { hashes: Hash[]; usedFallback: boolean; investOut: bigint; growShares: bigint };

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
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [knownAddress, setKnownAddress] = useState<Address | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [recipient, setRecipient] = useState("");
  const [totalInput, setTotalInput] = useState("100");
  const [allocation, setAllocation] = useState<Allocation>(DEFAULT_ALLOCATION);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<ExecutionUpdate | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>("Loading account");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccount()
      .then((stored) => setKnownAddress(stored?.address ?? null))
      .catch((caught) => setError(describeError(caught)))
      .finally(() => setBusy(null));
  }, []);

  useEffect(() => () => wallet?.session.end(), [wallet]);

  const address = wallet?.address ?? knownAddress;
  const shownBalances = useMemo(() => (balances ? formatBalances(balances) : null), [balances]);
  const allocationTotal = Number(allocation.now || 0) + Number(allocation.grow || 0) + Number(allocation.invest || 0);

  async function refresh(target = address): Promise<Balances | undefined> {
    if (!target) return undefined;
    const next = await readBalances(target);
    setBalances(next);
    return next;
  }

  async function connect(kind: "create" | "signin" | "unlock"): Promise<void> {
    setBusy(kind === "create" ? "Creating Android passkey" : "Opening Mera account");
    setError(null);
    setReview(null);
    try {
      const next = kind === "create" ? await createAccount() : kind === "signin" ? await signIn() : await unlockStoredWallet();
      if (!next) throw new Error("No stored Mera account was found");
      wallet?.session.end();
      setWallet(next);
      setKnownAddress(next.address);
      setRecipient((current) => current || next.address);
      await refresh(next.address);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function makeReview(): Promise<void> {
    if (!address) throw new Error("Open a Mera account first");
    setBusy("Fetching live Monad quote");
    setError(null);
    setReview(null);
    setResult(null);
    try {
      if (!isAddress(recipient)) throw new Error("Enter a valid EVM recipient address");
      const total = parseUnits(totalInput.trim(), 6);
      if (total <= 0n) throw new Error("Total must be greater than zero");
      const percentages = [allocation.now, allocation.grow, allocation.invest].map((value) => Number(value));
      if (!percentages.every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) throw new Error("Percentages must be whole numbers from 0 to 100");
      if (percentages.reduce((sum, value) => sum + value, 0) !== 100) throw new Error("Allocation must total exactly 100%");
      if (percentages[2] === 0) throw new Error("Invest must be above 0% while aQQQ is enabled");

      const currentBalances = await refresh(address);
      if (!currentBalances) throw new Error("Balances are unavailable");
      const nowAmount = total * BigInt(percentages[0]) / 100n;
      const growAmount = total * BigInt(percentages[1]) / 100n;
      const investAmount = total - nowAmount - growAmount;
      const quote = await quoteAusdToAqqq(investAmount);
      const minimumOut = quote.amountOut * 9_900n / 10_000n;
      const plan = splitterAddress
        ? buildPortionlyPlan({
            chainId: 143,
            account: address,
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
      setResult(completed);
      setReview(null);
      await refresh(wallet.address);
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
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
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
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>Payment</Text>
                  <Pressable onPress={() => void refresh()}><Text style={styles.link}>Refresh balances</Text></Pressable>
                </View>
                <Text style={styles.fieldLabel}>RECIPIENT</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => { setRecipient(value.trim()); setReview(null); }}
                  placeholder="0x…"
                  placeholderTextColor="#A19F99"
                  style={styles.textInput}
                  value={recipient}
                />
                <Text style={styles.fieldLabel}>TOTAL AUSD</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(value) => { setTotalInput(value); setReview(null); }}
                  placeholder="100"
                  placeholderTextColor="#A19F99"
                  style={[styles.textInput, styles.amountInput]}
                  value={totalInput}
                />
                <View style={styles.balanceStrip}>
                  <View><Text style={styles.label}>AUSD</Text><Text style={styles.value}>{shownBalances?.ausd ?? "—"}</Text></View>
                  <View><Text style={styles.label}>MON GAS</Text><Text style={styles.value}>{shownBalances?.mon ?? "—"}</Text></View>
                  <View><Text style={styles.label}>aQQQ</Text><Text style={styles.value}>{shownBalances?.aqqq ?? "—"}</Text></View>
                </View>
              </View>

              <View style={styles.card}>
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
                <Text style={styles.helper}>If Invest can’t meet the signed 1% price bound, its portion goes to Grow instead.</Text>
                <Button label="Get live quote" onPress={() => void makeReview()} disabled={busy !== null || allocationTotal !== 100} />
              </View>
            </>
          )}

          {review && (
            <View style={[styles.card, styles.reviewCard]}>
              <View style={styles.row}><Text style={styles.cardTitle}>Review</Text><Text style={styles.badge}>LIVE QUOTE</Text></View>
              <View style={styles.routeRow}><Text style={styles.routeName}>Now</Text><Text style={styles.routeAmount}>{amount(review.nowAmount)} AUSD</Text></View>
              <View style={styles.routeRow}><Text style={styles.routeName}>Grow</Text><Text style={styles.routeAmount}>{amount(review.growAmount)} AUSD</Text></View>
              <View style={styles.routeRow}><Text style={styles.routeName}>Invest</Text><Text style={styles.routeAmount}>{amount(review.investAmount)} AUSD</Text></View>
              <View style={styles.divider} />
              <View style={styles.routeRow}><Text style={styles.label}>QUOTED aQQQ</Text><Text style={styles.monoValue}>{formatUnits(review.quote.amountOut, 18)}</Text></View>
              <View style={styles.routeRow}><Text style={styles.label}>MINIMUM aQQQ</Text><Text style={styles.monoValue}>{formatUnits(review.minimumOut, 18)}</Text></View>
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
              <Text style={styles.cardTitle}>Allocation verified</Text>
              <Text style={styles.successAmount}>{result.usedFallback ? "Invest moved to Grow" : `+${formatUnits(result.investOut, 18)} aQQQ`}</Text>
              <Text style={styles.helper}>{formatUnits(result.growShares, 18)} Upshift shares delivered.</Text>
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
  contracts: { padding: 8, gap: 5 },
  contract: { color: "#7A7D79", fontFamily: "monospace", fontSize: 10 },
});
