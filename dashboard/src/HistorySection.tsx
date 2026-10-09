import type { HistoryState } from "./history";
import { explorerTx, formatDate, trimAmount } from "./history";

export default function HistorySection({ state }: { state: HistoryState | "loading" }) {
  if (state === "loading") {
    return (
      <section className="history" aria-labelledby="history-title" aria-busy="true">
        <div>
          <p className="section-label">Transfers</p>
          <h2 id="history-title">Loading history.</h2>
        </div>
      </section>
    );
  }

  if (state.kind === "not-configured") {
    return (
      <section className="history" aria-labelledby="history-title">
        <div>
          <p className="section-label">Transfers</p>
          <h2 id="history-title">History isn’t connected.</h2>
        </div>
        <p>No indexer is configured for this page. Balances above are live from the chain.</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="history" aria-labelledby="history-title">
        <div>
          <p className="section-label">Transfers</p>
          <h2 id="history-title">History could not be loaded.</h2>
        </div>
        <p role="alert">{state.message} Balances above are still live from the chain.</p>
      </section>
    );
  }

  if (state.kind === "empty") {
    return (
      <section className="history" aria-labelledby="history-title">
        <div>
          <p className="section-label">Transfers</p>
          <h2 id="history-title">No Portionly transfers to this address yet</h2>
        </div>
      </section>
    );
  }

  const { plans, positions } = state.history;
  return (
    <section className="history" aria-labelledby="history-title">
      <div>
        <p className="section-label">Transfers</p>
        <h2 id="history-title">Portionly history</h2>
      </div>
      <div>
        {plans.map((plan) => (
          <article key={plan.txHash + plan.planId} data-testid="plan">
            <span>{formatDate(plan.timestamp)}</span>
            <p>Now: {trimAmount(plan.nowAusd)} AUSD</p>
            <p>
              Grow: {trimAmount(plan.growAusd)} AUSD ({trimAmount(plan.growShares)} earnAUSD)
              {plan.position && ` locked until ${formatDate(plan.position.unlockAt)}${plan.position.claimed ? ", claimed" : ""}`}
            </p>
            <p>
              Invest: {trimAmount(plan.investAusd)} AUSD
              {plan.usedFallback ? " (Invest moved to Grow)" : ` to ${trimAmount(plan.investOutAqqq, 8)} aQQQ`}
            </p>
            <a href={explorerTx(plan.txHash)} target="_blank" rel="noreferrer">View transaction</a>
          </article>
        ))}
        {positions.length > 0 && (
          <>
            <p className="section-label">Locked positions</p>
            {positions.map((position) => (
              <article key={position.id} data-testid="position">
                <p>{trimAmount(position.shares)} earnAUSD</p>
                <p>
                  {position.claimed
                    ? `Claimed${position.claimedAt ? ` on ${formatDate(position.claimedAt)}` : ""}`
                    : `Locked until ${formatDate(position.unlockAt)}`}
                </p>
                <a href={explorerTx(position.lockTxHash)} target="_blank" rel="noreferrer">View lock transaction</a>
              </article>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
