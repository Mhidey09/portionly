/** Turns technical error text into a plain sentence for a first time user. Unknown errors fail closed. */
const RULES: [RegExp, string][] = [
  [/cancel|abort|not ?allowed|dismiss/i, "That was cancelled. Try again when you are ready."],
  [/Unlock your account first|No stored Mera/i, "Unlock with your fingerprint first."],
  [/Recipient is fixed/i, "This wallet can only pay the person it belongs to."],
  [/Enter the recipient/i, "Enter who you are sending to."],
  [/Total must be greater|Top up must be greater|Amount must be positive/i, "Enter an amount above zero."],
  [/AUSD balance is below|Main has less AUSD/i, "You do not have enough digital dollars for that."],
  [/0\.12 MON|too little MON/i, "Your fee balance is too low. Top up your fee balance and try again."],
  [/stale|expired/i, "The price went out of date. Go back and review again to get a fresh price."],
  [/Post-check failed/i, "We could not confirm that everything arrived as planned. Check your balances before you try again."],
  [/Missing or invalid parameters|insufficient (funds|balance)/i, "The network refused that. Check that you have enough fee balance, then try again."],
  [/ERC20InsufficientBalance|0xe450d38c/i, "The savings vault could not pay that out just now. Try the free withdrawal, or try again later."],
  [/InvestFailed|InvestBelowMinimum|ReceivedBelowMinimum/i, "The stock price moved too much just then, so nothing was sent. Review again for a fresh price."],
  [/reverted/i, "The network did not accept that step. Check your balances, then try again."],
  [/Indexer/i, "We could not load your locked savings right now. Pull down to try again."],
  [/network request|failed to fetch|timeout|timed out|rpc|http/i, "We could not reach the network. Check your connection and try again."],
];

export function plainMessage(raw: string): string {
  for (const [pattern, text] of RULES) if (pattern.test(raw)) return text;
  const clean = raw.trim();
  // Keep short, human looking messages that are already plain. Anything else fails closed.
  if (clean.length > 0 && clean.length <= 140 && !/0x[0-9a-f]{8}|[–—-]|[A-Z_]{6,}:/.test(clean)) return clean;
  return "Something went wrong. Check your balances, then try again.";
}

/** The two steps shown while a payment goes out. */
export function stepLabel(label: string): string {
  return /approve/i.test(label) ? "Allowing the amount" : "Sending";
}
