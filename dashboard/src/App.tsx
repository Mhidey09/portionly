import { FormEvent, useEffect, useState } from "react";
import type { Address } from "viem";
import { explorerAddress, parseRecipient, readRecipient, type RecipientSnapshot } from "./data";

function short(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function amount(value: string, max = 6) {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, max).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function initialAddress() {
  return new URLSearchParams(window.location.search).get("recipient") ?? "";
}

export default function App() {
  const [input, setInput] = useState(initialAddress);
  const [snapshot, setSnapshot] = useState<RecipientSnapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  async function load(raw: string) {
    setStatus("loading");
    setError("");
    try {
      const recipient = parseRecipient(raw);
      const next = await readRecipient(recipient);
      setSnapshot(next);
      setStatus("ready");
      const url = new URL(window.location.href);
      url.searchParams.set("recipient", recipient);
      window.history.replaceState({}, "", url);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "Could not read Monad balances.");
      setStatus("error");
    }
  }

  useEffect(() => {
    if (input) void load(input);
    // The URL value is loaded once on entry. Further reads are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(input);
  }

  const recipient = snapshot?.address;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Portionly home">portionly</a>
        <span className="network">Monad mainnet</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="kicker">Recipient view</p>
        <h1 id="page-title">See what arrived.</h1>
        <p className="lede">Live balances from Monad, read directly from the chain.</p>

        <form onSubmit={submit} noValidate>
          <label htmlFor="recipient">Recipient address</label>
          <div className="address-row">
            <input
              id="recipient"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="0x..."
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={error ? "address-error" : "address-help"}
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Reading..." : "View balance"}
            </button>
          </div>
          {error ? <p id="address-error" className="form-error" role="alert">{error}</p> : <p id="address-help" className="help">A public address is safe to view. No wallet connection is required.</p>}
        </form>
      </section>

      {status === "loading" && (
        <section className="balance-shell loading" aria-label="Loading live balances" aria-busy="true">
          <div className="skeleton wide" />
          <div className="skeleton" />
          <div className="skeleton" />
        </section>
      )}

      {status === "ready" && snapshot && (
        <>
          <section className="balance-shell" aria-labelledby="balance-title">
            <div className="balance-heading">
              <div>
                <p className="section-label">Live balance</p>
                <h2 id="balance-title">{short(snapshot.address)}</h2>
              </div>
              <button className="text-button" onClick={() => void load(snapshot.address)}>Refresh</button>
            </div>

            <div className="primary-balance">
              <span>Available now</span>
              <strong>{amount(snapshot.ausd, 6)} <small>AUSD</small></strong>
              <p>Stablecoin balance held by this address.</p>
            </div>

            <div className="asset-grid">
              <article>
                <span>Invested</span>
                <strong>{amount(snapshot.aqqq, 8)} <small>aQQQ</small></strong>
                <p>Tokenized Nasdaq-100 tracker balance. This is not direct ownership of constituent shares.</p>
              </article>
              <article>
                <span>Network gas</span>
                <strong>{amount(snapshot.mon, 5)} <small>MON</small></strong>
                <p>Used only to pay Monad transaction fees.</p>
              </article>
            </div>

            <footer className="proof-row">
              <span>Read at block {snapshot.blockNumber.toString()}</span>
              <a href={explorerAddress(snapshot.address)} target="_blank" rel="noreferrer">Open explorer</a>
            </footer>
          </section>

          <section className="history" aria-labelledby="history-title">
            <div>
              <p className="section-label">Transfers</p>
              <h2 id="history-title">History isn’t connected yet.</h2>
            </div>
            <p>Balances above are live. Portionly transfer receipts will appear after the Envio indexer and mainnet splitter are deployed.</p>
          </section>
        </>
      )}

      {status === "idle" && (
        <section className="empty-state">
          <p>Paste a recipient address to read current AUSD, aQQQ, and MON balances.</p>
        </section>
      )}

      <footer className="site-footer">
        <span>Read-only. No custody. No signing.</span>
        {recipient && <span>{short(recipient as Address)}</span>}
      </footer>
    </main>
  );
}
