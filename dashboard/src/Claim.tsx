import { useEffect, useState } from "react";
import { createPublicClient, formatUnits, http, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { monad } from "viem/chains";
import { SlipBar } from "./Slip";
import { apkLink } from "./payRoute";
import { APK_URL } from "./release";

const LINK_CONTRACT: Address = "0x67BCA6463B917940199c322C4b5678044936EdC7";
const paymentsAbi = [
  {
    type: "function",
    name: "payments",
    stateMutability: "view",
    inputs: [{ name: "link", type: "address" }],
    outputs: [
      { name: "sender", type: "address" },
      { name: "nowAmount", type: "uint256" },
      { name: "growAmount", type: "uint256" },
      { name: "investAmount", type: "uint256" },
      { name: "lockDays", type: "uint32" },
      { name: "createdAt", type: "uint64" },
      { name: "open", type: "bool" },
    ],
  },
] as const;

const client = createPublicClient({ chain: monad, transport: http("https://rpc.monad.xyz") });
const apkUrl = apkLink(APK_URL);
const usd = (units: bigint) => Number(formatUnits(units, 6)).toLocaleString("en-US", { style: "currency", currency: "USD" });

export type ClaimView = { home: bigint; save: bigint; stocks: bigint; lockDays: number; open: boolean };

/** Reads the key from the part after #, which the browser never sends to a server. Null when it is not a key. */
export function keyFromHash(hash: string): Hex | null {
  const hex = /^#?(?:0x)?([0-9a-fA-F]{64})$/.exec(hash.trim())?.[1];
  if (!hex || /^0+$/.test(hex)) return null;
  return `0x${hex.toLowerCase()}`;
}

export function lockText(days: number): string {
  if (days === 0) return "";
  if (days >= 365) return "locked for 1 year from the day you collect";
  const months = Math.round(days / 30);
  return `locked for ${months} ${months === 1 ? "month" : "months"} from the day you collect`;
}

type State = { kind: "loading" } | { kind: "bad-link" } | { kind: "never-funded" } | { kind: "error"; message: string } | { kind: "ready"; view: ClaimView };

async function load(key: Hex): Promise<State> {
  try {
    const link = privateKeyToAddress(key);
    const [sender, nowAmount, growAmount, investAmount, lockDays, , open] = await client.readContract({ address: LINK_CONTRACT, abi: paymentsAbi, functionName: "payments", args: [link] });
    if (/^0x0+$/.test(sender)) return { kind: "never-funded" };
    return { kind: "ready", view: { home: nowAmount, save: growAmount, stocks: investAmount, lockDays, open } };
  } catch (cause) {
    return { kind: "error", message: cause instanceof Error ? cause.message : "Could not read the payment from Monad." };
  }
}

/** Where a money link opens. Shows what is waiting and how to collect it. The key never leaves this page. */
export default function Claim() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const key = keyFromHash(window.location.hash);
    if (!key) {
      setState({ kind: "bad-link" });
      return;
    }
    void load(key).then(setState);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="recipient claim">
        <div className="loading-lines" aria-busy="true" aria-label="Reading your payment"><i /><i /><i /></div>
      </div>
    );
  }
  if (state.kind === "bad-link") {
    return (
      <div className="recipient claim">
        <h1>This link is not complete.</h1>
        <p className="lede">Part of it is missing. Ask the sender to share it with you again, and open it in full.</p>
      </div>
    );
  }
  if (state.kind === "never-funded") {
    return (
      <div className="recipient claim">
        <h1>Nothing is waiting here yet.</h1>
        <p className="lede">No money was placed under this link. Ask the sender to check and send it again.</p>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="recipient claim">
        <h1>We could not read this payment.</h1>
        <p className="form-error" role="alert">{state.message}</p>
        <p className="quiet">Your money is safe. Refresh this page to try again.</p>
      </div>
    );
  }

  const { view } = state;
  const total = view.home + view.save + view.stocks;
  const pct = (part: bigint) => Number((part * 100n) / (total || 1n));
  const split = { home: pct(view.home), save: pct(view.save), stocks: Math.max(0, 100 - pct(view.home) - pct(view.save)) };
  if (view.stocks === 0n) {
    split.stocks = 0;
    split.save = 100 - split.home;
  }

  if (!view.open) {
    return (
      <div className="recipient claim">
        <h1>This money was already collected.</h1>
        <p className="lede">The {usd(total)} under this link has been collected, or the sender took it back. If that was you, open Portionly to see it.</p>
      </div>
    );
  }

  return (
    <div className="recipient claim">
      <header className="recipient-head">
        <p className="eyebrow">Someone sent you money</p>
        <h1>
          <em data-testid="claim-total">{usd(total)}</em> is waiting for you.
        </h1>
      </header>

      <div className="claim-slip">
        <SlipBar split={split} compact />
        <ul className="slip-rows">
          {view.home > 0n && (
            <li className="home">
              <i aria-hidden="true" />
              <div>
                <strong>Ready to spend</strong>
                <p>Digital dollars you can use right away.</p>
              </div>
              <output>{usd(view.home)}</output>
            </li>
          )}
          {view.save > 0n && (
            <li className="save">
              <i aria-hidden="true" />
              <div>
                <strong>{view.lockDays > 0 ? "Locked savings" : "Savings that earn"}</strong>
                <p>{view.lockDays > 0 ? `Kept safe and ${lockText(view.lockDays)}.` : "Kept in a savings vault. Take it out when you like."}</p>
              </div>
              <output>{usd(view.save)}</output>
            </li>
          )}
          {view.stocks > 0n && (
            <li className="stocks">
              <i aria-hidden="true" />
              <div>
                <strong>US tech stocks</strong>
                <p>Bought at the live price when you collect.</p>
              </div>
              <output>{usd(view.stocks)}</output>
            </li>
          )}
        </ul>
      </div>

      <section className="next">
        <h2>Collect it in three steps</h2>
        <ol className="claim-steps">
          <li>Get the Portionly app for Android.</li>
          <li>Open it and create your account with your fingerprint. There is nothing to write down.</li>
          <li>Tap <b>I have a money link</b> and paste this link.</li>
        </ol>
        <div className="cta">
          {apkUrl && <a className="button solid" href={apkUrl} rel="noreferrer">Get the Android app</a>}
          <button className="button line" onClick={() => void copy()}>{copied ? "Copied" : "Copy my money link"}</button>
        </div>
        <p className="quiet">This link works like cash: whoever opens it can collect the money. Keep it to yourself. No fee coin is needed, the link pays its own way.</p>
      </section>
    </div>
  );
}
