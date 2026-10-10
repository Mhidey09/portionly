import { parseUnits, type Address, type Hex } from "viem";
import { isCurrencyCode } from "./currency";
import { claimUrl, parseClaimInput } from "./linkPay";
import { addressOfKey, type StoredLink } from "./linkRecords";

/** The share URL, with the sender's currency riding before the # so the web page can show a reference amount. */
function shareUrl(key: Hex, currency?: string): string {
  const base = claimUrl(key);
  if (!currency || !isCurrencyCode(currency)) return base;
  const at = base.indexOf("#");
  return `${base.slice(0, at)}?cur=${currency}${base.slice(at)}`;
}

/** parseClaimInput wants /claim# with nothing between, so a ?cur=XXX before the # is removed first. */
function parseMoneyLink(text: string): Hex {
  return parseClaimInput(text.trim().replace(/(\/claim)\/?\?[^#\s]*(?=#)/, "$1"));
}

/** The currency code a pasted link carries, if any. */
function currencyOfLink(text: string): string | undefined {
  const code = /\/claim\/?\?(?:[^#\s]*&)?cur=([A-Za-z]{3})(?=[&#])/.exec(text)?.[1]?.toUpperCase();
  return code && isCurrencyCode(code) ? code : undefined;
}

function addressOfLink(text: string): Address {
  return addressOfKey(parseMoneyLink(text));
}

/** "from the day they collect": 30 days is 1 month, 365 days is 1 year. */
function lockPhrase(days: number): string {
  if (days <= 0) return "";
  if (days === 365) return "1 year";
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"}`;
}

function shareMessage(amount: string): string {
  return `I sent you ${amount} on Portionly. Open this to collect it:`;
}

/** The same parsing as the normal send review: a whole dollar total with up to 6 decimals and whole percentages that make 100. */
function parseSendInputs(totalInput: string, allocation: { now: string; grow: string; invest: string }): { total: bigint; percentages: [number, number, number] } {
  const total = parseUnits(totalInput.trim(), 6);
  if (total <= 0n) throw new Error("Total must be greater than zero");
  const percentages = [allocation.now, allocation.grow, allocation.invest].map((value) => Number(value));
  if (!percentages.every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) throw new Error("Percentages must be whole numbers from 0 to 100");
  if (percentages.reduce((sum, value) => sum + value, 0) !== 100) throw new Error("Allocation must total exactly 100%");
  return { total, percentages: percentages as [number, number, number] };
}

type LinkStatus = "waiting" | "closed" | "unfunded" | "unknown";

/** What one saved link looks like on chain. `undefined` payment means the contract has never seen it. */
function linkStatus(payment: { open: boolean } | undefined | "error"): LinkStatus {
  if (payment === "error") return "unknown";
  if (payment === undefined) return "unfunded";
  return payment.open ? "waiting" : "closed";
}

type SentLink = StoredLink & { status: LinkStatus; lockDays?: number; nowAmount?: bigint; growAmount?: bigint; investAmount?: bigint };

export { addressOfLink, currencyOfLink, linkStatus, lockPhrase, parseMoneyLink, parseSendInputs, shareMessage, shareUrl };
export type { LinkStatus, SentLink };
