import { useCallback, useEffect, useRef, useState } from "react";
import { isFresh, parseRates, RATES_URL, type Rates } from "./currency";

export type RatesStatus = "loading" | "ready" | "unavailable";

const TIMEOUT_MS = 8000;

async function fetchRates(): Promise<Rates | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(RATES_URL, { signal: controller.signal });
    if (!response.ok) return null;
    return parseRates(await response.json(), Date.now());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public reference exchange rates, fetched once when the app starts and again on pull to refresh.
 * Kept in memory only. `rates` is null whenever there is no answer or it is older than 12 hours, and
 * screens then show dollars alone.
 */
export function useRates() {
  const [state, setState] = useState<{ rates: Rates | null; status: RatesStatus }>({ rates: null, status: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await fetchRates();
    if (!alive.current) return;
    // A failed refresh must not leave an old number on screen past its 12 hours: freshness is re-checked below.
    setState((previous) => (next ? { rates: next, status: "ready" } : { rates: previous.rates, status: "unavailable" }));
    setNow(Date.now());
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    // Re-check freshness while the app stays open.
    const timer = setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const rates = state.rates && isFresh(state.rates.fetchedAt, now) ? state.rates : null;
  const status: RatesStatus = rates ? "ready" : state.status === "loading" ? "loading" : "unavailable";
  return { rates, fetchedAt: rates?.fetchedAt ?? null, status, now, refresh };
}
