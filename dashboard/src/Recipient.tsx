import { useEffect, useState } from "react";
import type { Address } from "viem";
import { SlipBar } from "./Slip";
import { explorerAddress, readRecipient, type RecipientSnapshot } from "./data";
import { explorerTx, formatDate, loadHistory, trimAmount, type HistoryState, type PlanRow } from "./history";
import { apkLink } from "./payRoute";
import { useTween } from "./motion";

function Dollars({ value, testId }: { value: string; testId: string }) {
  const shown = useTween(Number(value), 900);
  return <strong data-testid={testId}>${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>;
}

const apkUrl = apkLink(import.meta.env.VITE_APK_URL);
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const cents = (value: string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function splitOf(plan: PlanRow) {
  const home = Number(plan.nowAusd), save = Number(plan.growAusd), stocks = Number(plan.investAusd);
  // If the stock price moved past its limit, that part went to savings instead.
  const saved = plan.usedFallback ? save + stocks : save;
  const bought = plan.usedFallback ? 0 : stocks;
  const total = home + saved + bought || 1;
  const homePct = Math.round((home / total) * 100);
  const savePct = Math.round((saved / total) * 100);
  return { total: home + saved + bought, split: { home: homePct, save: savePct, stocks: Math.max(0, 100 - homePct - savePct) } };
}

function Payments({ state }: { state: HistoryState | "loading" }) {
  if (state === "loading") return <p className="quiet" aria-busy="true">Loading payments.</p>;
  if (state.kind === "not-configured") return <p className="quiet">Payment history isn't connected on this page. The balances above are live.</p>;
  if (state.kind === "error") return <p className="quiet" role="alert">Payment history could not be loaded. {state.message} The balances above are still live.</p>;
  if (state.kind === "empty") return <p className="quiet">No Portionly payments to this account yet.</p>;

  return (
    <ol className="payments">
      {state.history.plans.map((plan) => {
        const { total, split } = splitOf(plan);
        return (
          <li key={plan.txHash + plan.planId} data-testid="plan">
            <div className="payment-head">
              <time>{formatDate(plan.timestamp)}</time>
              <strong>${cents(String(total))}</strong>
            </div>
            <SlipBar split={split} compact />
            <p className="payment-parts">
              {Number(plan.nowAusd) > 0 && <span className="home">${cents(plan.nowAusd)} to spend</span>}
              {(Number(plan.growAusd) > 0 || plan.usedFallback) && (
                <span className="save">
                  ${cents(String(Number(plan.growAusd) + (plan.usedFallback ? Number(plan.investAusd) : 0)))} to savings
                  {plan.position && (plan.position.claimed ? ", collected" : `, locked until ${formatDate(plan.position.unlockAt)}`)}
                </span>
              )}
              {Number(plan.investAusd) > 0 && !plan.usedFallback && <span className="stocks">${cents(plan.investAusd)} into stocks</span>}
            </p>
            {plan.usedFallback && <p className="quiet">The stock price moved past its limit, so that part went to savings instead.</p>}
            <a href={explorerTx(plan.txHash)} target="_blank" rel="noreferrer">Receipt</a>
          </li>
        );
      })}
    </ol>
  );
}

export default function Recipient({ address }: { address: Address }) {
  const [snapshot, setSnapshot] = useState<RecipientSnapshot | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryState | "loading">("loading");

  async function load() {
    setError("");
    setHistory("loading");
    void loadHistory(address).then(setHistory);
    try {
      setSnapshot(await readRecipient(address));
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "Could not read balances from Monad.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const locked = history !== "loading" && history.kind === "ready" ? history.history.positions.filter((p) => !p.claimed) : [];

  return (
    <div className="recipient">
      <header className="recipient-head">
        <p className="eyebrow">Account <span data-testid="pay-address" title={address}>{short(address)}</span></p>
        <h1>Here's what arrived.</h1>
        <button className="text-button" onClick={() => void load()}>Refresh</button>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {!snapshot && !error && <div className="loading-lines" aria-busy="true" aria-label="Loading live balances"><i /><i /><i /></div>}

      {snapshot && (
        <>
          <ul className="holdings" aria-label="Live balance">
            <li className="home">
              <span>Ready to spend</span>
              <Dollars value={snapshot.ausd} testId="spend" />
              <p>Digital dollars (AUSD). Spend them or pass them on.</p>
            </li>
            <li className="save">
              <span>Savings</span>
              {snapshot.earnValue !== null ? <Dollars value={snapshot.earnValue} testId="savings" /> : <strong data-testid="savings">{trimAmount(snapshot.earn)} shares</strong>}
              <p>
                {snapshot.earnValue !== null ? "What it is worth today if withdrawn. " : "Value is shown when withdrawn. "}
                Earning in a savings vault. Earnings are not guaranteed.
              </p>
              {locked.map((position) => (
                <p key={position.id} className="lock" data-testid="position">
                  Plus {trimAmount(position.shares)} savings shares locked until {formatDate(position.unlockAt)}.
                </p>
              ))}
            </li>
            <li className="stocks">
              <span>US tech stocks</span>
              <strong data-testid="stocks">{trimAmount(snapshot.aqqq, 6)} <small>aQQQ</small></strong>
              <p>A fund that tracks Apple, Nvidia, Amazon, Google and more. Its price moves with the market. It is not direct share ownership.</p>
            </li>
          </ul>

          <section className="next">
            <h2>Want to move it?</h2>
            <p>Open Portionly on Android to send it on, withdraw savings or sell stocks. Your fingerprint is your account.</p>
            {apkUrl && <a className="button solid" href={apkUrl} rel="noreferrer">Get the Android app</a>}
          </section>

          <section className="payments-section" aria-labelledby="payments-title">
            <h2 id="payments-title">Payments</h2>
            <Payments state={history} />
          </section>

          <p className="evidence">
            Read from Monad at block {snapshot.blockNumber.toString()}. <a href={explorerAddress(snapshot.address)} target="_blank" rel="noreferrer">See this account on the explorer</a>
          </p>
        </>
      )}
    </div>
  );
}
