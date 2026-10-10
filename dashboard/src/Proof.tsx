import { useEffect, useState } from "react";
import { SlipBar } from "./Slip";
import { explorerTx, formatDate } from "./history";
import { loadProof, type ProofPlan } from "./totals";

type State = Awaited<ReturnType<typeof loadProof>> | "loading";

function splitOf(plan: ProofPlan) {
  const total = Number(plan.total.replace(/,/g, "")) || 1;
  const home = Math.round((Number(plan.now.replace(/,/g, "")) / total) * 100);
  const save = Math.round((Number(plan.save.replace(/,/g, "")) / total) * 100);
  return { home, save, stocks: Math.max(0, 100 - home - save) };
}

/** Every payment the contracts have settled, straight from the indexer. For anyone who wants to check. */
export default function Proof() {
  const [state, setState] = useState<State>("loading");
  useEffect(() => {
    void loadProof().then(setState);
  }, []);

  return (
    <div className="proof">
      <p className="eyebrow">Live from Monad</p>
      <h1>Every payment, in the open.</h1>
      <p className="lede">Nothing on this page is typed in. Each line is a payment settled by the Portionly contracts on Monad, read from the indexer as you load the page. Tap a receipt to check it on the explorer.</p>

      {state === "loading" && <p className="quiet" aria-busy="true">Reading payments.</p>}
      {state !== "loading" && state.kind === "not-configured" && <p className="quiet">The indexer isn't connected on this page.</p>}
      {state !== "loading" && state.kind === "error" && <p className="quiet" role="alert">The payments could not be read. {state.message}</p>}
      {state !== "loading" && state.kind === "ready" && (
        <>
          <p className="proof-total"><b>{state.totals.payments}</b> payments, <b>${state.totals.ausd}</b> in total</p>
          <ol className="payments">
            {state.plans.map((plan) => (
              <li key={plan.txHash}>
                <div className="payment-head">
                  <time>{formatDate(plan.timestamp)}</time>
                  <strong>${plan.total}</strong>
                </div>
                <SlipBar split={splitOf(plan)} compact />
                <p className="payment-parts">
                  <span className="home">${plan.now} home</span>
                  <span className="save">${plan.save} savings{plan.locked ? ", locked" : ""}</span>
                  <span className="stocks">${plan.stocks} stocks</span>
                </p>
                <a href={explorerTx(plan.txHash)} target="_blank" rel="noreferrer">Receipt</a>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
