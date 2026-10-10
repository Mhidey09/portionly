import { useEffect, useState, type FormEvent } from "react";
import Slip, { SlipBar } from "./Slip";
import { loadTotals, type Totals } from "./totals";
import { apkLink } from "./payRoute";
import { parseRecipientLink } from "./recipientLink";

const apkUrl = apkLink(import.meta.env.VITE_APK_URL);

/** Adds .in to sections as they scroll into view, so they rise once instead of sitting still. */
function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("in")),
      { threshold: 0.18 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function Phone({ children, label, tilt = 0 }: { children: React.ReactNode; label: string; tilt?: number }) {
  return (
    <figure className="phone" style={{ ["--tilt" as string]: `${tilt}deg` }}>
      <div className="phone-body">
        <div className="phone-screen">{children}</div>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function Landing() {
  useReveal();
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    void loadTotals().then(setTotals);
  }, []);

  function openRecipient(event: FormEvent) {
    event.preventDefault();
    try {
      window.location.assign(`/pay/${parseRecipientLink(link)}`);
    } catch (cause) {
      setLinkError(cause instanceof Error ? cause.message : "That doesn't look like a Portionly link.");
    }
  }

  return (
    <div className="landing">
      <section className="hero">
        <div className="pearls" aria-hidden="true"><i /><i /><i /><b /></div>
        <div className="hero-copy">
          <p className="eyebrow">Money home, on Monad</p>
          <h1>
            Send money home.
            <br />
            Decide <em>what it becomes.</em>
          </h1>
          <p className="lede">
            One payment can pay today's bills, build savings that earn, and buy a piece of the stock market. You choose the portions. It all lands in their own account in seconds.
          </p>
          <div className="cta">
            {apkUrl && <a className="button solid" href={apkUrl} rel="noreferrer">Get the Android app</a>}
            <a className="button line" href="#received">I was sent money</a>
          </div>
          <p className="fineprint">No bank forms. No seed phrase. Your fingerprint is your account.</p>
        </div>
        <Slip />
      </section>

      <section className="steps" data-reveal>
        <h2>Three taps from <em>your phone</em> to theirs.</h2>
        <div className="phones stagger">
          <Phone label="1. Open your account with a fingerprint" tilt={-4}>
            <div className="scr scr-start">
              <span className="scr-brand">portionly</span>
              <p className="scr-title">Your fingerprint is your account.</p>
              <div className="print" aria-hidden="true"><i /><i /><i /><i /></div>
              <span className="scr-button">Create my account</span>
              <span className="scr-note">Nothing to write down. Nothing to lose.</span>
            </div>
          </Phone>
          <Phone label="2. Choose who, how much and the portions">
            <div className="scr scr-send">
              <span className="scr-kicker">To Mum</span>
              <p className="scr-amount">$200</p>
              <div className="scr-mode"><span>Send home</span><span className="on">Send + grow</span></div>
              <SlipBar split={{ home: 50, save: 30, stocks: 20 }} compact />
              <ul>
                <li className="home"><i />Home now<b>$100</b></li>
                <li className="save"><i />Savings, 3 months<b>$60</b></li>
                <li className="stocks"><i />US tech stocks<b>$40</b></li>
              </ul>
              <span className="scr-button">Review and send</span>
            </div>
          </Phone>
          <Phone label="3. It lands. Both of you can see it." tilt={4}>
            <div className="scr scr-done">
              <span className="tick" aria-hidden="true" />
              <p className="scr-title">Sent to Mum</p>
              <p className="scr-amount small">$200</p>
              <SlipBar split={{ home: 50, save: 30, stocks: 20 }} compact />
              <ul>
                <li className="home"><i />Ready to spend<b>$100</b></li>
                <li className="save"><i />Saving until Jan 9<b>$60</b></li>
                <li className="stocks"><i />In stocks<b>$40</b></li>
              </ul>
              <span className="scr-note">Arrived in seconds</span>
            </div>
          </Phone>
        </div>
        <p className="steps-note">Screens show example amounts.</p>
      </section>

      <section className="split-story" data-reveal>
        <div>
          <h2>Not every dollar has <em>the same job.</em></h2>
          <p>Some of it is for this week. Some of it should still be there next year. Portionly lets the sender say so, in the same payment.</p>
        </div>
        <ol className="jobs stagger">
          <li className="home">
            <span>Home now</span>
            <p>Digital dollars they can spend or pass on right away.</p>
          </li>
          <li className="save">
            <span>Savings that earn</span>
            <p>Sits in a savings vault and earns. Open any time, or locked until a date you pick so it is there when school fees are due.</p>
          </li>
          <li className="stocks">
            <span>US tech stocks</span>
            <p>A fund that follows the biggest US technology companies. It can go up or down, and they can sell it back whenever they want.</p>
          </li>
        </ol>
      </section>

      <section className="people" data-reveal>
        <div className="people-art" aria-hidden="true">
          <span className="thumb" />
          <svg viewBox="0 0 320 220" preserveAspectRatio="none">
            <path d="M0 110 C 120 110, 160 30, 320 30" />
            <path d="M0 110 C 140 110, 180 110, 320 110" />
            <path d="M0 110 C 120 110, 160 190, 320 190" />
          </svg>
          <ul>
            <li>Mum</li>
            <li>James</li>
            <li>School fees</li>
          </ul>
        </div>
        <div>
          <h2>One fingerprint. <em>A wallet for each person.</em></h2>
          <p>Add the people you send to. Each one gets their own wallet inside your account, with its own budget and its own history. They see the wallet that pays them, never your whole balance.</p>
        </div>
      </section>

      <section className="received" id="received" data-reveal>
        <h2>Were you sent money?</h2>
        <p>Paste the link or address you were given to see what arrived. You don't need an account to look.</p>
        <form onSubmit={openRecipient} noValidate>
          <label htmlFor="recipient-link" className="sr-only">Your Portionly link or address</label>
          <input
            id="recipient-link"
            value={link}
            onChange={(event) => { setLink(event.target.value); setLinkError(""); }}
            placeholder="Paste your link or address"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="button solid">See what arrived</button>
        </form>
        {linkError && <p className="form-error" role="alert">{linkError}</p>}
      </section>

      {totals && totals.payments > 0 && (
        <section className="live" data-reveal>
          <p>
            <b>{totals.payments}</b> {totals.payments === 1 ? "payment" : "payments"} settled on Monad so far, <b>{totals.ausd}</b> digital dollars in total.
          </p>
          <a href="/proof">See every one</a>
        </section>
      )}
    </div>
  );
}
