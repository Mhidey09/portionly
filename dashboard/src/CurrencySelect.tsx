import { CURRENCIES } from "./currency";

/** A small chooser for the currency amounts are also shown in. Dollars stay primary. */
export default function CurrencySelect({ value, onChange, label, className = "" }: { value: string; onChange: (code: string) => void; label: string; className?: string }) {
  return (
    <label className={`cur-select ${className}`.trim()}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Dollars only</option>
        {CURRENCIES.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} {currency.name}
          </option>
        ))}
      </select>
    </label>
  );
}
