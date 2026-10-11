import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { Pressable, View } from "react-native";
import { versionLabel } from "../appUpdate";
import { lockPhrase, type SentLink } from "../linkShare";
import type { Person } from "../people";
import { formatBalances } from "../network";
import { BUSY_COLLECT, BUSY_RESTORE, BUSY_RESTORE_OPEN, BUSY_TAKE_BACK, type ClaimCheck, type Portionly } from "../usePortionly";
import { Button, ButtonRow } from "../ui/Button";
import { Field } from "../ui/Field";
import { CurrencyPicker, LocalLine, RateNote, showsLocal } from "../ui/Local";
import { LockBanner } from "../ui/LockBanner";
import { Money } from "../ui/Money";
import { Notice } from "../ui/Notice";
import { Tick } from "../ui/Icons";
import { PortionRows } from "../ui/PortionRow";
import { ProgressSteps } from "../ui/ProgressSteps";
import { SlipBar } from "../ui/SlipBar";
import { amountsToSplit } from "../ui/split";
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
  // Always read the saved person fresh, so a change (like their currency) shows the moment it is made.
  const picked = person ?? last;
  const shown = picked ? p.allPeople.find((entry) => entry.index === picked.index) ?? picked : null;
  const balances = shown ? p.peopleBalances[shown.index] : undefined;
  const topUpBusy = p.busy !== null && p.busy.startsWith("Topping up");
  const unlocked = p.wallets !== null;
  const hasBudget = balances !== undefined && balances.ausd > 0n;
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameFor, setNameFor] = useState<number | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  // Start the draft over whenever a different person is shown.
  if (shown && nameFor !== shown.index) {
    setNameFor(shown.index);
    setNameDraft(shown.name);
    setAddressDraft("");
  }
  const needsAddress = shown?.needsRecipient === true;

  return (
    <Sheet visible={person !== null} onClose={onClose} label={shown ? shown.name : "Person"}>
      {shown && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar name={shown.name} index={shown.index} size={56} />
            <View style={{ flex: 1 }}>
              <T variant="h2">{shown.name}</T>
              <T variant="small">Someone you send to</T>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <T variant="label">Their currency</T>
            <CurrencyPicker label={`Currency for ${shown.name}`} value={shown.currency} onChange={(code) => void p.changePersonCurrency(shown, code)} />
          </View>
          <Field
            label="Name"
            maxLength={32}
            autoCapitalize="words"
            value={nameDraft}
            onChangeText={setNameDraft}
            right={
              nameDraft.trim() !== shown.name && nameDraft.trim() !== "" ? (
                <Button small variant="ghost" label="Save" disabled={p.busy !== null} onPress={() => void p.renamePerson(shown, nameDraft)} />
              ) : undefined
            }
          />
          {needsAddress && (
            <View style={{ gap: 8 }}>
              <T variant="small">We found money set aside for this person, but not who it is for. Add their address so you can send to them.</T>
              <Field
                label="Their address or pay link"
                autoCapitalize="none"
                autoCorrect={false}
                value={addressDraft}
                onChangeText={(value) => setAddressDraft(p.normalizeTyped(value))}
                right={<Button small variant="ghost" label="Paste" onPress={() => void Clipboard.getStringAsync().then((text) => setAddressDraft(p.normalizeTyped(text)))} />}
              />
              <Button label="Save address" disabled={p.busy !== null || addressDraft.trim() === ""} onPress={() => void p.savePersonAddress(shown, addressDraft).then((saved) => { if (saved) setAddressDraft(""); })} />
            </View>
          )}
          {p.error && <Notice tone="error" text={p.error} />}
          {unlocked ? (
            <>
              {!needsAddress && (
                <Button
                  label={`Send to ${shown.name}`}
                  disabled={p.busy !== null}
                  onPress={() => {
                    p.sendToPerson(shown);
                    onClose();
                    go("send");
                  }}
                />
              )}
              <Divider />
              <Pressable accessibilityRole="button" onPress={() => setBudgetOpen(!budgetOpen)} hitSlop={8} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T variant="strong">Keep a budget for {shown.name}</T>
                <T variant="small" color={colors.accent}>{budgetOpen ? "Hide" : hasBudget && balances ? formatUsd(balances.ausd) : "Optional"}</T>
              </Pressable>
              {budgetOpen && (
                <>
                  <T variant="small">Set money aside for {shown.name} in its own wallet inside your account. It is still yours until you send it, and they see that wallet, not your main balance.</T>
                  {balances && (
                    <View>
                      <T variant="label">Set aside, not sent yet</T>
                      <Money value={Number(formatBalances(balances).ausd)} variant="display" style={{ fontSize: 36, lineHeight: 42 }} />
                      <LocalLine micro={balances.ausd} code={shown.currency} rates={p.rates} />
                    </View>
                  )}
                  <Field
                    label="Amount to set aside in dollars"
                    keyboardType="decimal-pad"
                    value={p.topUpInputs[shown.index] ?? ""}
                    onChangeText={(value) => p.setTopUpInputs({ ...p.topUpInputs, [shown.index]: cleanAmountInput(value) })}
                  />
                  <Button variant="secondary" label="Set aside from my main wallet" loading={topUpBusy} disabled={p.busy !== null || (p.topUpInputs[shown.index] ?? "") === ""} onPress={() => void p.topUp(shown)} />
                  {hasBudget && !needsAddress && (
                    <Button
                      variant="secondary"
                      label="Send from this budget"
                      disabled={p.busy !== null}
                      onPress={() => {
                        p.selectAccount(shown.index, shown.recipient);
                        onClose();
                        go("send");
                      }}
                    />
                  )}
                </>
              )}
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
        <T variant="small">{versionLabel(Constants.expoConfig?.version ?? "")}</T>
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
      <RowButton label="Find my people and budgets" disabled={p.busy !== null || !p.address} onPress={() => void p.findPeople()}>
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="strong">Find my people and budgets</T>
            <T variant="small" color={colors.accent}>{p.busy === BUSY_RESTORE || p.busy === BUSY_RESTORE_OPEN ? "Working" : "Find"}</T>
          </View>
          <T variant="small">{p.restoreStatus ?? "Use this after a reinstall or on a new phone. It asks for your fingerprint."}</T>
        </View>
      </RowButton>
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

const STATUS_TEXT: Record<SentLink["status"], string> = {
  waiting: "Waiting to be collected",
  closed: "Collected or taken back",
  unfunded: "Never set up",
  unknown: "Checking",
};

function LinksSent({ p }: { p: Portionly }) {
  if (p.sentLinks.length === 0 && p.otherLinks.length === 0) return null;
  const taking = p.busy === BUSY_TAKE_BACK;
  return (
    <Surface>
      <T variant="h2">Links you sent</T>
      {p.sentLinks.map((link) => {
        const total = BigInt(link.total);
        return (
          <View key={link.key}>
            <Divider />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <T variant="strong">{formatUsd(total)}</T>
                <T variant="small">{new Date(link.createdAt).toDateString()}</T>
                <T variant="small" color={link.status === "waiting" ? colors.accent : colors.muted}>{STATUS_TEXT[link.status]}</T>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <LocalLine micro={total} code={link.cur} rates={p.rates} align="right" />
              </View>
            </View>
            {link.status === "waiting" && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button small variant="secondary" label="Share again" disabled={p.busy !== null} onPress={() => void p.shareSentLink(link, formatUsd(total))} style={{ flex: 1 }} />
                <Button small variant="secondary" label="Take it back" loading={taking} disabled={p.busy !== null} onPress={() => void (p.wallets ? p.takeBack(link) : p.connect("unlock"))} style={{ flex: 1 }} />
              </View>
            )}
            {(link.status === "closed" || link.status === "unfunded") && (
              <View style={{ flexDirection: "row", marginTop: 6 }}>
                <Button small variant="ghost" label="Remove from list" disabled={p.busy !== null} onPress={() => void p.removeSentLink(link)} />
              </View>
            )}
          </View>
        );
      })}
      {p.otherLinks.map((link) => {
        const total = BigInt(link.total);
        return (
          <View key={link.address}>
            <Divider />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <T variant="strong">{formatUsd(total)}</T>
                <T variant="small">{new Date(link.createdAt).toDateString()}</T>
                <T variant="small" color={colors.accent}>{STATUS_TEXT.waiting}</T>
              </View>
            </View>
            <T variant="small" style={{ marginTop: 6 }}>Made on an earlier install of this account. This phone cannot share the link again, but you can take the money back.</T>
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <Button small variant="secondary" label="Take it back" loading={taking} disabled={p.busy !== null} onPress={() => void (p.wallets ? p.takeBack(link) : p.connect("unlock"))} style={{ flex: 1 }} />
            </View>
          </View>
        );
      })}
    </Surface>
  );
}

function ClaimSheet({ p, visible, initialText, onClose }: { p: Portionly; visible: boolean; initialText: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [check, setCheck] = useState<ClaimCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [landed, setLanded] = useState<bigint | null>(null);
  const collecting = p.busy === BUSY_COLLECT;

  async function run(value: string): Promise<void> {
    setChecking(true);
    setCheck(await p.checkClaim(value));
    setChecking(false);
  }

  useEffect(() => {
    if (!visible) return;
    setLanded(null);
    setCheck(null);
    setText(initialText);
    p.setError(null);
    if (initialText) void run(initialText);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  async function paste(): Promise<void> {
    const value = await Clipboard.getStringAsync();
    setText(value);
    await run(value);
  }

  function edit(value: string): void {
    setText(value);
    setCheck(null);
    p.setError(null);
    // A whole link is checked as soon as it is pasted or typed in.
    if (/[0-9a-fA-F]{64}/.test(value)) void run(value);
  }

  const progress = p.progress;
  const step = progress ? (progress.state === "confirmed" ? progress.index + 1 : progress.index) : 0;

  return (
    <Sheet visible={visible} onClose={collecting ? () => undefined : onClose} label="Collect a money link">
      {landed !== null ? (
        <>
          <View style={{ alignItems: "center", gap: 12 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
              <Tick size={40} />
            </View>
            <T variant="h2">It has landed</T>
            <T variant="body" style={{ textAlign: "center" }}>{formatUsd(landed)} is now in your account.</T>
          </View>
          <Button label="Done" onPress={onClose} />
        </>
      ) : collecting ? (
        <>
          <T variant="h2">Collecting your money</T>
          <ProgressSteps steps={["Collecting the money", "Passing on the fee that is left"]} current={Math.min(step, 1)} finished={false} />
          <T variant="small">{progress?.state === "pending" ? "Waiting for the network" : "This takes a few seconds. It needs no fingerprint."}</T>
        </>
      ) : (
        <>
          <T variant="h2">I have a money link</T>
          <T variant="small">Paste the link someone sent you. Nothing moves until you tap collect.</T>
          <Field
            label="Paste the money link"
            autoCapitalize="none"
            autoCorrect={false}
            value={text}
            onChangeText={edit}
            right={<Button small variant="ghost" label="Paste" disabled={p.busy !== null} onPress={() => void paste()} />}
          />
          {text.trim() !== "" && check === null && !checking && <Button variant="secondary" label="Check this link" onPress={() => void run(text)} />}
          {checking && <T variant="small">Looking for your money</T>}
          {check && !check.ok && <Notice tone="error" raw text={check.message} />}
          {check && check.ok && (
            <>
              <View>
                <T variant="label">Waiting for you</T>
                <Money value={Number(check.total) / 1_000_000} variant="display" style={{ fontSize: 44, lineHeight: 50 }} />
                <LocalLine micro={check.total} code={check.currency} rates={p.rates} />
              </View>
              <SlipBar
                split={amountsToSplit({ home: check.payment.nowAmount, save: check.payment.growAmount, stocks: check.payment.investAmount }, check.total)}
                compact
              />
              <PortionRows
                nowAmount={check.payment.nowAmount}
                growAmount={check.payment.growAmount}
                investAmount={check.payment.investAmount}
                savingsNote={check.payment.lockDays > 0 ? `Locked for ${lockPhrase(check.payment.lockDays)} from the day you collect` : "Open any time"}
                stockNote="Bought at the live price when you collect"
                code={check.currency}
                rates={p.rates}
              />
              {p.error && <Notice tone="error" text={p.error} />}
              {p.wallets ? (
                <Button
                  label="Collect to my account"
                  disabled={p.busy !== null}
                  onPress={() =>
                    void p.collect(check.key).then((done) => {
                      if (done) setLanded(check.total);
                    })
                  }
                />
              ) : (
                <Button label="Unlock with your fingerprint" loading={p.busy !== null} onPress={() => void p.connect("unlock")} />
              )}
              <T variant="small">Your money goes to your own account. You pay no fee.</T>
            </>
          )}
          {!(check && check.ok) && p.error && <Notice tone="error" text={p.error} />}
        </>
      )}
    </Sheet>
  );
}

export function Home({ p, go, openSettle, incomingLink = null, onLinkTaken }: { p: Portionly; go: (tab: TabKey) => void; openSettle: () => void; incomingLink?: string | null; onLinkTaken?: () => void }) {
  const [selected, setSelected] = useState<Person | null>(null);
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState(false);
  const [claimText, setClaimText] = useState<string | null>(null);
  // Opened from a money link: go straight to the collect sheet with it filled in.
  useEffect(() => {
    if (incomingLink) {
      setClaimText(incomingLink);
      onLinkTaken?.();
    }
  }, [incomingLink]); // eslint-disable-line react-hooks/exhaustive-deps
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

      {p.error && claimText === null && <Notice tone="error" text={p.error} />}

      {p.clipboardClaim && claimText === null && (
        <Notice
          text={`You have a money link on your clipboard. Collect ${formatUsd(p.clipboardClaim.total)}?`}
          action={
            <ButtonRow>
              <Button small label="Collect" onPress={() => setClaimText(p.clipboardClaim?.text ?? "")} style={{ flex: 1 }} />
              <Button small variant="ghost" label="Not now" onPress={p.dismissClipboardClaim} style={{ flex: 1 }} />
            </ButtonRow>
          }
        />
      )}

      <Rise index={1}>
        <ButtonRow>
          <Button label="Send" onPress={() => go("send")} style={{ flex: 1 }} />
          <Button variant="secondary" label="Receive" onPress={() => go("receive")} style={{ flex: 1 }} />
        </ButtonRow>
      </Rise>

      <Rise index={2}>
        <Surface>
          <RowButton label="I have a money link" onPress={() => { p.setError(null); setClaimText(""); }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T variant="strong">I have a money link</T>
              <T variant="small" color={colors.accent}>Collect</T>
            </View>
          </RowButton>
          <Divider />
          <RowButton label="Instant settle, on testnet" onPress={() => { p.setError(null); openSettle(); }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T variant="strong">Instant settle</T>
                <View style={{ backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <T variant="label" color={colors.home} style={{ fontSize: 11, lineHeight: 15 }}>Testnet</T>
                </View>
              </View>
              <T variant="small" color={colors.accent}>Open</T>
            </View>
          </RowButton>
        </Surface>
      </Rise>

      {(p.sentLinks.length > 0 || p.otherLinks.length > 0) && (
        <Rise index={3}>
          <LinksSent p={p} />
        </Rise>
      )}

      <Rise index={4}>
        <Surface>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="h2">People</T>
            <Button small variant="ghost" label="Add a person" onPress={() => { p.setError(null); setAdding(true); }} />
          </View>
          {p.allPeople.length === 0 ? (
            <T variant="small" style={{ marginTop: 6 }}>Nobody here yet. Add the people you send money to, like James or Mum.</T>
          ) : (
            p.allPeople.map((person, i) => {
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
                          <T variant="small">{person.needsRecipient ? "Add their address" : balances && balances.ausd > 0n ? "Budget set aside" : "Tap to send"}</T>
                        </View>
                        {balances && balances.ausd > 0n && (
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
          {p.allPeople.some((person) => p.peopleBalances[person.index] && showsLocal(person.currency, p.rates)) && (
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

      <ClaimSheet p={p} visible={claimText !== null} initialText={claimText ?? ""} onClose={() => setClaimText(null)} />
      <PersonSheet p={p} person={selected} onClose={() => setSelected(null)} go={go} />
      <AddPersonSheet p={p} visible={adding} onClose={() => setAdding(false)} />
      <DetailsSheet p={p} visible={details} onClose={() => setDetails(false)} />
    </Screen>
  );
}
