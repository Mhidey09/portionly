/**
 * "Their currency" display. Pure logic, no imports, so this file is identical in app/ and dashboard/.
 * Rates are a public reference (mid market) rate from open.er-api.com, never a payout quote.
 * 1 AUSD is treated as 1 USD.
 */

type Currency = {
  code: string;
  name: string;
  flag: string;
  /** Fraction digits to show. 0 where one unit is worth very little. */
  digits: 0 | 2;
};

const CURRENCIES: readonly Currency[] = [
  { code: "NGN", name: "Nigerian naira", flag: "🇳🇬", digits: 0 },
  { code: "GHS", name: "Ghanaian cedi", flag: "🇬🇭", digits: 2 },
  { code: "KES", name: "Kenyan shilling", flag: "🇰🇪", digits: 0 },
  { code: "ZAR", name: "South African rand", flag: "🇿🇦", digits: 2 },
  { code: "UGX", name: "Ugandan shilling", flag: "🇺🇬", digits: 0 },
  { code: "TZS", name: "Tanzanian shilling", flag: "🇹🇿", digits: 0 },
  { code: "RWF", name: "Rwandan franc", flag: "🇷🇼", digits: 0 },
  { code: "ETB", name: "Ethiopian birr", flag: "🇪🇹", digits: 0 },
  { code: "EGP", name: "Egyptian pound", flag: "🇪🇬", digits: 2 },
  { code: "MAD", name: "Moroccan dirham", flag: "🇲🇦", digits: 2 },
  { code: "XOF", name: "West African CFA franc", flag: "🌍", digits: 0 },
  { code: "XAF", name: "Central African CFA franc", flag: "🌍", digits: 0 },
  { code: "INR", name: "Indian rupee", flag: "🇮🇳", digits: 0 },
  { code: "PKR", name: "Pakistani rupee", flag: "🇵🇰", digits: 0 },
  { code: "BDT", name: "Bangladeshi taka", flag: "🇧🇩", digits: 0 },
  { code: "LKR", name: "Sri Lankan rupee", flag: "🇱🇰", digits: 0 },
  { code: "NPR", name: "Nepalese rupee", flag: "🇳🇵", digits: 0 },
  { code: "PHP", name: "Philippine peso", flag: "🇵🇭", digits: 2 },
  { code: "IDR", name: "Indonesian rupiah", flag: "🇮🇩", digits: 0 },
  { code: "VND", name: "Vietnamese dong", flag: "🇻🇳", digits: 0 },
  { code: "THB", name: "Thai baht", flag: "🇹🇭", digits: 2 },
  { code: "MYR", name: "Malaysian ringgit", flag: "🇲🇾", digits: 2 },
  { code: "CNY", name: "Chinese yuan", flag: "🇨🇳", digits: 2 },
  { code: "MXN", name: "Mexican peso", flag: "🇲🇽", digits: 2 },
  { code: "BRL", name: "Brazilian real", flag: "🇧🇷", digits: 2 },
  { code: "COP", name: "Colombian peso", flag: "🇨🇴", digits: 0 },
  { code: "ARS", name: "Argentine peso", flag: "🇦🇷", digits: 0 },
  { code: "PEN", name: "Peruvian sol", flag: "🇵🇪", digits: 2 },
  { code: "GTQ", name: "Guatemalan quetzal", flag: "🇬🇹", digits: 2 },
  { code: "DOP", name: "Dominican peso", flag: "🇩🇴", digits: 2 },
  { code: "TRY", name: "Turkish lira", flag: "🇹🇷", digits: 2 },
  { code: "UAH", name: "Ukrainian hryvnia", flag: "🇺🇦", digits: 2 },
  { code: "EUR", name: "Euro", flag: "🇪🇺", digits: 2 },
  { code: "GBP", name: "British pound", flag: "🇬🇧", digits: 2 },
  { code: "CAD", name: "Canadian dollar", flag: "🇨🇦", digits: 2 },
  { code: "AUD", name: "Australian dollar", flag: "🇦🇺", digits: 2 },
];

/** A rate older than this counts as unavailable. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** If the provider itself has not refreshed for this long, nothing is shown. It updates daily. */
const MAX_PROVIDER_AGE_MS = 36 * 60 * 60 * 1000;
const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const REFERENCE_NOTE = "Reference rate, not a payout quote.";

type Rates = { rates: Record<string, number>; fetchedAt: number };

function currencyOf(code: string | null | undefined): Currency | undefined {
  if (typeof code !== "string") return undefined;
  return CURRENCIES.find((currency) => currency.code === code);
}

function isCurrencyCode(code: unknown): code is string {
  return typeof code === "string" && currencyOf(code) !== undefined;
}

/**
 * Reads the provider response. Returns null unless it is a successful, recent answer with at least one usable rate.
 * `fetchedAt` is when we got it (`now`), so the 12 hour rule counts from our own fetch.
 */
function parseRates(payload: unknown, now: number): Rates | null {
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (body.result !== "success") return null;
  const updated = body.time_last_update_unix;
  if (typeof updated !== "number" || !Number.isFinite(updated)) return null;
  const updatedMs = updated * 1000;
  if (now - updatedMs > MAX_PROVIDER_AGE_MS || updatedMs - now > MAX_AGE_MS) return null;
  const raw = body.rates;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const rates: Record<string, number> = {};
  for (const currency of CURRENCIES) {
    const rate = (raw as Record<string, unknown>)[currency.code];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) rates[currency.code] = rate;
  }
  if (Object.keys(rates).length === 0) return null;
  return { rates, fetchedAt: now };
}

/** True while a rate is at most 12 hours old and not from the future. */
function isFresh(fetchedAt: number, now: number): boolean {
  if (!Number.isFinite(fetchedAt) || !Number.isFinite(now)) return false;
  const age = now - fetchedAt;
  return age >= -60_000 && age <= MAX_AGE_MS;
}

/** Dollars (as a number, for display) from smallest units with 6 decimals, times the rate. */
function convert(usdMicro: bigint, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return NaN;
  return (Number(usdMicro) / 1_000_000) * rate;
}

function groupDigits(value: number, digits: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

// Our own symbols, so every phone shows the same text. Android's JavaScript engine does not know
// most of these and would otherwise print the three letter code.
const SYMBOLS: Record<string, string> = {
  NGN: "₦", GHS: "GH₵", KES: "KSh ", ZAR: "R", UGX: "USh ", TZS: "TSh ", RWF: "FRw ", ETB: "Br ", EGP: "E£", MAD: "MAD ",
  XOF: "CFA ", XAF: "FCFA ", INR: "₹", PKR: "Rs ", BDT: "৳", LKR: "Rs ", NPR: "Rs ", PHP: "₱", IDR: "Rp ", VND: "₫",
  THB: "฿", MYR: "RM ", CNY: "¥", MXN: "MX$", BRL: "R$", COP: "COL$", ARS: "AR$", PEN: "S/ ", GTQ: "Q", DOP: "RD$",
  TRY: "₺", UAH: "₴", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$",
};

/** "₦310,000". A currency we have no symbol for falls back to its code: "XX 1,234.50". */
function formatLocal(amount: number, code: string): string {
  if (!Number.isFinite(amount)) return "";
  const digits = currencyOf(code)?.digits ?? 2;
  const symbol = SYMBOLS[code] ?? `${code} `;
  return `${amount < 0 ? "-" : ""}${symbol}${groupDigits(amount, digits)}`;
}

/**
 * "about ₦310,000", or null when there is no currency, no rate for it, or the rates are not fresh.
 * Callers show the dollar amount alone whenever this is null.
 */
function aboutLocal(usdMicro: bigint, code: string | null | undefined, rates: Rates | null, now: number): string | null {
  if (!code || !rates || !isFresh(rates.fetchedAt, now)) return null;
  const rate = rates.rates[code];
  if (!isCurrencyCode(code) || rate === undefined) return null;
  const text = formatLocal(convert(usdMicro, rate), code);
  return text === "" ? null : `about ${text}`;
}

export { aboutLocal, convert, CURRENCIES, currencyOf, formatLocal, isCurrencyCode, isFresh, MAX_AGE_MS, parseRates, RATES_URL, REFERENCE_NOTE };
export type { Currency, Rates };
