import { useEffect, useState } from "react";
import { aboutLocal, currencyOf, CURRENCIES, isFresh, parseRates, RATES_URL, type Rates } from "./currency";

export type RatesStatus = "loading" | "ready" | "unavailable";

let pending: Promise<Rates | null> | null = null;

/** One request per page load, shared by everything on the page. A failure is remembered as "no rates", never guessed. */
function loadRates(): Promise<Rates | null> {
  pending ??= (async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(RATES_URL, { signal: controller.signal });
      if (!response.ok) return null;
      return parseRates(await response.json(), Date.now());
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  })();
  return pending;
}

/** Public reference rates. `rates` is null until they arrive, if they fail, or once they are older than 12 hours. */
export function useRates(): { rates: Rates | null; status: RatesStatus } {
  const [state, setState] = useState<{ rates: Rates | null; status: RatesStatus }>({ rates: null, status: "loading" });
  useEffect(() => {
    let alive = true;
    void loadRates().then((rates) => alive && setState({ rates, status: rates ? "ready" : "unavailable" }));
    return () => {
      alive = false;
    };
  }, []);
  const rates = state.rates && isFresh(state.rates.fetchedAt, Date.now()) ? state.rates : null;
  return { rates, status: rates ? "ready" : state.status === "loading" ? "loading" : "unavailable" };
}

const STORAGE_KEY = "portionly.currency.v1";

/** ?cur=NGN wins, then what the visitor chose last time, else dollars only. */
export function initialCurrency(): string {
  try {
    const fromLink = new URLSearchParams(window.location.search).get("cur")?.toUpperCase();
    if (fromLink && currencyOf(fromLink)) return fromLink;
  } catch {
    /* fall through */
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && currencyOf(saved)) return saved;
  } catch {
    /* storage can be blocked */
  }
  return "";
}

export function rememberCurrency(code: string): void {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage can be blocked */
  }
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("cur", code);
    else url.searchParams.delete("cur");
    window.history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
}

/** Currency choice for a page. */
export function useCurrency(): [string, (code: string) => void] {
  const [code, setCode] = useState(initialCurrency);
  return [code, (next) => { setCode(next); rememberCurrency(next); }];
}

/** "about ₦310,000" from a dollar amount given as a decimal string or number, or null. */
export function localFromDollars(value: string | number, code: string, rates: Rates | null): string | null {
  const dollars = Number(value);
  if (!code || !Number.isFinite(dollars) || dollars <= 0) return null;
  return aboutLocal(BigInt(Math.round(dollars * 1_000_000)), code, rates, Date.now());
}

export { CURRENCIES };
