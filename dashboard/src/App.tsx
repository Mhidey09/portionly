import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import Landing from "./Landing";
import Proof from "./Proof";
import Recipient from "./Recipient";
import { parsePayPath } from "./payRoute";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("portionly.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be blocked; fall through to the system setting */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function route() {
  const path = window.location.pathname;
  if (/^\/proof\/?$/i.test(path)) return { page: "proof" as const };
  const pay = parsePayPath(path);
  if (pay) return "address" in pay ? { page: "recipient" as const, address: pay.address } : { page: "bad-link" as const, error: pay.error };
  // Older links used ?recipient=0x…; keep them working.
  const legacy = new URLSearchParams(window.location.search).get("recipient");
  if (legacy) {
    return isAddress(legacy, { strict: false })
      ? { page: "recipient" as const, address: getAddress(legacy.toLowerCase()) }
      : { page: "bad-link" as const, error: "This link does not contain a valid address." };
  }
  return { page: "landing" as const };
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const current = route();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("portionly.theme", theme);
    } catch {
      /* not essential */
    }
  }, [theme]);

  return (
    <>
      <header className="nav">
        <a className="brand" href="/" aria-label="Portionly home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          portionly
        </a>
        <nav aria-label="Main">
          <a href="/#received">I was sent money</a>
          <a href="/proof">Proof</a>
          <button className="theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </header>

      <main>
        {current.page === "landing" && <Landing />}
        {current.page === "proof" && <Proof />}
        {current.page === "recipient" && <Recipient address={current.address} />}
        {current.page === "bad-link" && (
          <div className="recipient">
            <h1>That link didn't work.</h1>
            <p className="form-error" role="alert">{current.error}</p>
            <a className="button line" href="/#received">Try pasting it here</a>
          </div>
        )}
      </main>

      <footer className="foot">
        <span>Portionly never holds your money. It moves straight between your accounts on Monad.</span>
        <nav aria-label="Footer">
          <a href="/">Home</a>
          <a href="/#received">I was sent money</a>
          <a href="/proof">Proof</a>
        </nav>
      </footer>
    </>
  );
}
