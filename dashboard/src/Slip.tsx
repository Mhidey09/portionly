import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type Mode = "home" | "grow";
export type Split = { home: number; save: number; stocks: number };

const STEP = 5;
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** The portion bar: one payment, cut into what it becomes. Used as a control here and as a readout elsewhere. */
export function SlipBar({ split, onChange, compact = false }: { split: Split; onChange?: (next: Split) => void; compact?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);

  function percentAt(event: ReactPointerEvent) {
    const box = bar.current!.getBoundingClientRect();
    const raw = ((event.clientX - box.left) / box.width) * 100;
    return Math.round(Math.min(100, Math.max(0, raw)) / STEP) * STEP;
  }

  function move(event: ReactPointerEvent) {
    if (dragging === null || !onChange) return;
    const at = percentAt(event);
    if (dragging === 0) {
      const home = Math.min(at, split.home + split.save);
      onChange({ home, save: split.home + split.save - home, stocks: split.stocks });
    } else {
      const edge = Math.max(at, split.home);
      onChange({ home: split.home, save: edge - split.home, stocks: 100 - edge });
    }
  }

  const parts = [
    { key: "home", label: "Home now", value: split.home },
    { key: "save", label: "Savings", value: split.save },
    { key: "stocks", label: "Stocks", value: split.stocks },
  ] as const;

  return (
    <div
      ref={bar}
      className={`slip-bar${compact ? " compact" : ""}${dragging !== null ? " dragging" : ""}`}
      onPointerMove={move}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
      role="img"
      aria-label={`Home now ${split.home} percent, savings ${split.save} percent, stocks ${split.stocks} percent`}
    >
      {parts.map((part) => (
        <div key={part.key} className={`band ${part.key}`} style={{ flexBasis: `${part.value}%` }} data-empty={part.value === 0}>
          {!compact && part.value >= 15 && (
            <span>
              <b>{part.value}%</b> {part.label}
            </span>
          )}
        </div>
      ))}
      {onChange && (
        <>
          <button
            type="button"
            className="handle"
            style={{ left: `${split.home}%` }}
            aria-label="Move the line between home now and savings"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(0); }}
            onKeyDown={(event) => {
              const delta = event.key === "ArrowRight" ? STEP : event.key === "ArrowLeft" ? -STEP : 0;
              if (!delta) return;
              const home = Math.min(Math.max(0, split.home + delta), split.home + split.save);
              onChange({ home, save: split.home + split.save - home, stocks: split.stocks });
            }}
          />
          <button
            type="button"
            className="handle"
            style={{ left: `${split.home + split.save}%` }}
            aria-label="Move the line between savings and stocks"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(1); }}
            onKeyDown={(event) => {
              const delta = event.key === "ArrowRight" ? STEP : event.key === "ArrowLeft" ? -STEP : 0;
              if (!delta) return;
              const edge = Math.min(100, Math.max(split.home, split.home + split.save + delta));
              onChange({ home: split.home, save: edge - split.home, stocks: 100 - edge });
            }}
          />
        </>
      )}
    </div>
  );
}

/** The hero: pick an amount, choose send home or send and grow, drag the lines. An example, not a quote. */
export default function Slip() {
  const [mode, setMode] = useState<Mode>("grow");
  const [amount, setAmount] = useState(200);
  const [custom, setCustom] = useState<Split>({ home: 50, save: 30, stocks: 20 });
  const split = mode === "home" ? { home: 100, save: 0, stocks: 0 } : custom;

  const rows = [
    { key: "home", name: "Home now", what: "Arrives in seconds as digital dollars, ready to spend.", share: split.home },
    { key: "save", name: "Savings that earn", what: "Goes into a savings vault. Keep it open, or lock it for 1 to 12 months.", share: split.save },
    { key: "stocks", name: "US tech stocks", what: "Buys a fund that tracks Apple, Nvidia, Amazon, Google and more.", share: split.stocks },
  ] as const;

  return (
    <div className="slip" data-mode={mode}>
      <div className="slip-top">
        <div className="mode" role="tablist" aria-label="How to send">
          <button role="tab" aria-selected={mode === "home"} onClick={() => setMode("home")}>Send home</button>
          <button role="tab" aria-selected={mode === "grow"} onClick={() => setMode("grow")}>Send + grow</button>
        </div>
        <label className="amount">
          <span>You send</span>
          <span className="amount-field">
            $
            <input
              inputMode="numeric"
              value={amount}
              aria-label="Example amount in dollars"
              onChange={(event) => setAmount(Math.min(99_999, Number(event.target.value.replace(/\D/g, "")) || 0))}
            />
          </span>
        </label>
      </div>

      <SlipBar split={split} onChange={mode === "grow" ? setCustom : undefined} />
      <p className="slip-hint">{mode === "grow" ? "Drag the lines to change the portions." : "All of it lands as spendable money. Nothing held back."}</p>

      <ul className="slip-rows">
        {rows.map((row) => (
          <li key={row.key} className={row.key} data-off={row.share === 0}>
            <i aria-hidden="true" />
            <div>
              <strong>{row.name}</strong>
              <p>{row.what}</p>
            </div>
            <output>{money((amount * row.share) / 100)}</output>
          </li>
        ))}
      </ul>
    </div>
  );
}
