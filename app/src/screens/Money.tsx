import { View } from "react-native";
import { formatUnits } from "viem";
import { canClaim } from "../locks";
import type { Portionly } from "../usePortionly";
import { Button } from "../ui/Button";
import { LockBanner } from "../ui/LockBanner";
import { Money as MoneyText } from "../ui/Money";
import { Notice } from "../ui/Notice";
import { Rise } from "../ui/Rise";
import { Screen } from "../ui/Screen";
import { Divider, Surface } from "../ui/Surface";
import { T } from "../ui/Type";
import { formatUsd, trimDecimals } from "../ui/format";
import { plainMessage } from "../ui/plain";
import { colors } from "../ui/theme";

const dollars = (micro: bigint): number => Number(micro) / 1_000_000;
const units = (micro: bigint): string => trimDecimals(formatUnits(micro, 6), 4);

export function Money({ p }: { p: Portionly }) {
  const b = p.balances;
  const busy = p.busy !== null;
  const owner = (p.wallet?.address ?? p.address ?? "").toLowerCase();
  const pending = p.withdrawals.filter((w) => w.account.toLowerCase() === owner);
  const openLocks = p.locks?.filter((lock) => !lock.claimed) ?? [];
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  return (
    <Screen refreshing={p.refreshing} onRefresh={() => void p.manualRefresh()}>
      <LockBanner p={p} />
      <Rise>
        <T variant="title">Your money</T>
      </Rise>
      {p.error && <Notice tone="error" text={p.error} />}
      {p.moneyNote && <Notice text={p.moneyNote} />}

      {!b ? (
        <Rise index={1}>
          <Surface>
            <T variant="body" color={colors.muted}>{p.address ? "Loading your balances" : "Create or open your account to see your money."}</T>
          </Surface>
        </Rise>
      ) : (
        <>
          <Rise index={1}>
            <Surface>
              <T variant="h2">Savings that earn</T>
              {b.earn > 0n && p.savingsValue ? (
                <>
                  <MoneyText value={dollars(p.savingsValue.standard)} variant="display" style={{ fontSize: 44, lineHeight: 50, marginTop: 6 }} />
                  <T variant="small">Worth {formatUsd(p.savingsValue.standard)} if withdrawn in about 3 days, or {formatUsd(p.savingsValue.instant)} now.</T>
                </>
              ) : b.earn > 0n ? (
                <T variant="small" style={{ marginTop: 6 }}>You hold {units(b.earn)} savings units. Their dollar value is not available right now.</T>
              ) : (
                <T variant="small" style={{ marginTop: 6 }}>Nothing saved here yet.</T>
              )}
              <T variant="small" style={{ marginTop: 8 }}>Earnings are not guaranteed.</T>
              {b.earn > 0n &&
                (p.wallet ? (
                  <View style={{ gap: 10, marginTop: 16 }}>
                    <Button label="Withdraw now (0.2% fee)" disabled={busy} onPress={() => void p.withdrawSavings("instant")} />
                    <Button variant="secondary" label="Withdraw free in about 3 days" disabled={busy} onPress={() => void p.withdrawSavings("standard")} />
                  </View>
                ) : (
                  <T variant="small" style={{ marginTop: 12 }}>Unlock with your fingerprint to withdraw.</T>
                ))}
              {pending.map((w) => {
                const ready = Date.now() / 1000 >= w.claimableAt;
                return (
                  <View key={`${w.year}-${w.month}-${w.day}-${w.shares}`}>
                    <Divider />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <T variant="strong">{units(BigInt(w.shares))} savings units</T>
                        <T variant="small">{ready ? "Ready to collect" : `On its way, ready ${new Date(w.claimableAt * 1000).toDateString()}`}</T>
                      </View>
                      {ready && p.wallet && <Button small label="Collect" disabled={busy} onPress={() => void p.collectWithdrawal(w)} />}
                    </View>
                  </View>
                );
              })}
            </Surface>
          </Rise>

          <Rise index={2}>
            <Surface>
              <T variant="h2">US tech stocks</T>
              <T variant="display" style={{ fontSize: 34, lineHeight: 40, marginTop: 6 }}>{trimDecimals(formatUnits(b.aqqq, 18), 4)} aQQQ</T>
              <T variant="small" style={{ marginTop: 6 }}>Apple, Nvidia, Amazon, Google and more. aQQQ tracks the Nasdaq 100. It is not direct share ownership. Selling crosses a 0.9% pool fee.</T>
              {b.aqqq > 0n && p.wallet && !p.sellReview && (
                <Button style={{ marginTop: 16 }} variant="secondary" label="Get sell price" loading={p.busy === "Getting a sell price"} disabled={busy} onPress={() => void p.quoteSell()} />
              )}
              {b.aqqq > 0n && !p.wallet && <T variant="small" style={{ marginTop: 12 }}>Unlock with your fingerprint to sell.</T>}
              {p.sellReview && (
                <View style={{ gap: 12, marginTop: 16 }}>
                  <T variant="body">About {formatUsd(p.sellReview.quoted)} now, at least {formatUsd(p.sellReview.minimumOut)} or the sale cancels.</T>
                  <Button label="Sell for digital dollars" disabled={busy} onPress={() => void p.sellStocks()} />
                </View>
              )}
            </Surface>
          </Rise>
        </>
      )}

      {p.address && (
        <Rise index={3}>
          <Surface>
            <T variant="h2">Locked for you</T>
            {p.locksError && <T variant="small" color={colors.danger} style={{ marginTop: 6 }}>{plainMessage(p.locksError)}</T>}
            {!p.locksError && p.locks === null && <T variant="small" style={{ marginTop: 6 }}>Loading locked savings</T>}
            {!p.locksError && p.locks !== null && openLocks.length === 0 && <T variant="small" style={{ marginTop: 6 }}>Nothing is locked for this account.</T>}
            {openLocks.map((lock) => {
              const due = canClaim(lock, nowSeconds);
              return (
                <View key={lock.key}>
                  <Divider />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <T variant="strong">{units(lock.amount)} savings units</T>
                      <T variant="small">{due ? "Ready" : `Unlocks ${new Date(Number(lock.unlockAt) * 1000).toDateString()}`}</T>
                    </View>
                    {due && <Button small label={p.wallets ? "Claim" : "Unlock to claim"} disabled={busy} onPress={() => void (p.wallets ? p.claim(lock) : p.connect("unlock"))} />}
                  </View>
                </View>
              );
            })}
          </Surface>
        </Rise>
      )}
    </Screen>
  );
}
