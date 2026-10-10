<p align="center">
  <img src="docs/media/brand/mark.svg" alt="Portionly" width="84">
</p>

<h1 align="center">Portionly</h1>

<p align="center">
  <b>Don't just send it. Portion it.</b><br>
  One payment pays today's bills, builds savings and buys stocks. It lands in their own account in seconds.
</p>

<p align="center">
  <a href="https://portionly-three.vercel.app"><img src="https://img.shields.io/badge/live-portionly--three.vercel.app-6f52f5" alt="Live site"></a>
  <a href="https://portionly-three.vercel.app/proof"><img src="https://img.shields.io/badge/proof-every%20payment-5a3de6" alt="Proof"></a>
  <a href="https://github.com/Mhidey09/portionly/actions/workflows/verify.yml"><img src="https://github.com/Mhidey09/portionly/actions/workflows/verify.yml/badge.svg" alt="verify"></a>
  <img src="https://img.shields.io/badge/Monad-mainnet-9a86fb" alt="Monad mainnet">
  <img src="https://img.shields.io/badge/built%20for-Monad%20Metropolis-0d1117" alt="Monad Metropolis">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0d1117" alt="MIT"></a>
</p>

<p align="center">
  <a href="https://portionly-three.vercel.app"><img src="docs/media/hero.png" alt="The Portionly site: choose Send home or Send + grow and drag the portions"></a>
</p>

## The problem

Money sent home gets spent the week it arrives. The sender often wants part of it kept for school fees or put to work, but a transfer only knows one job: arrive. Splitting it afterwards needs the person at the other end to open accounts, move funds and stay disciplined, and it rarely happens.

## What Portionly does

The sender decides what the money becomes before it leaves, and it all settles in one transaction on Monad.

| Portion | What the recipient gets | How |
|---|---|---|
| **Home now** | Digital dollars, ready to spend | AUSD sent straight to their account |
| **Savings that earn** | A share of a savings vault, open or locked until a date | Upshift AUSD vault, with an optional lock of 1 to 12 months |
| **US tech stocks** | A fund that follows the largest US technology companies | aQQQ, bought on Uniswap v4 with a price limit |

Need it all to arrive as cash today? **Send home** skips the split and sends every dollar as AUSD.

<p align="center">
  <img src="docs/media/app-home.png" alt="Home: balance and people" width="260">
  &nbsp;&nbsp;
  <img src="docs/media/app-sent.png" alt="Sent: the three portions that arrived" width="260">
</p>

## Try it in five minutes

| Step | Where |
|---|---|
| 1. See it | [portionly-three.vercel.app](https://portionly-three.vercel.app): flip between Send home and Send + grow, drag the lines |
| 2. Check it is real | [Proof](https://portionly-three.vercel.app/proof): every payment the contracts have settled, each linked to its receipt |
| 3. See what a recipient sees | [A real recipient's page](https://portionly-three.vercel.app/pay/0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2) |
| 4. Use it | Tap **Get the Android app** on the site, open it, create an account with your fingerprint |

No keys, no seed phrase and no sign up are needed for steps 1 to 3.

## How it works

```
 Sender's phone                         Monad mainnet                         Recipient
 ──────────────                         ─────────────                         ─────────
 fingerprint  ──▶  Mera passkey   ──▶   PortionlySplitterV2.execute(plan)
                   account                │
                                          ├─ Home now  ──▶ AUSD ───────────────▶ their account
                                          ├─ Savings   ──▶ Upshift vault ──────▶ their account,
                                          │                                      or PortionlyFuture
                                          │                                      until the unlock date
                                          └─ Stocks    ──▶ Uniswap v4 ─────────▶ their account
                                                           (if the price moves more than 1%,
                                                            this part goes to savings instead)

 PlanExecuted, PositionLocked, PositionClaimed  ──▶  Envio HyperIndex  ──▶  history, locked savings, proof page
```

- **One transaction.** The portions always add up to exactly what was signed. If any part fails, nothing moves.
- **Nothing held.** The contracts have no owner, no admin and no upgrade path. Assets go to the recipient, or to a lock only the recipient can open.
- **Checked before success.** The app compares balances before and after and reads the `PlanExecuted` event before it says "Sent".

## One fingerprint, a wallet for each person

The account is a [Mera](https://docs.monad.xyz/guides/mera) passkey: no seed phrase, no extension, no server holding keys. From that one passkey the app derives a main wallet and a separate wallet for each person the sender pays, so every relationship has its own budget and history, and a recipient sees only the wallet that pays them.

## What the recipient can do

Everything arrives in the recipient's own account. From the app they can send it on, **withdraw savings** (now for a 0.2% vault fee, or free after the vault's waiting period), **sell stocks** back to digital dollars, and **claim** locked savings once the date passes. Without the app they can still see it all on their page.

## What is real

| Part | Status | Evidence |
|---|---|---|
| Contracts on Monad mainnet | Live, bytecode checked | [Deployments](docs/DEPLOYMENTS.md) |
| Split payment from a phone, signed with a passkey | Done on mainnet | [Evidence](docs/evidence/2026-10-09-phone-mera-plan.md) |
| Send home | Done on mainnet from a phone | [Proof page](https://portionly-three.vercel.app/proof) |
| Savings locked for a month | Done on mainnet from a phone | [Proof page](https://portionly-three.vercel.app/proof) |
| Claim after the lock | Mainnet fork test; the first real lock opens 9 Nov 2026 | `contracts/test/PortionlySplitterV2Fork.t.sol` |
| Sell stocks, withdraw savings now | Done on mainnet | [Evidence](docs/evidence/2026-10-10-recipient-actions.md) |
| Withdraw savings after the waiting period | Mainnet fork test | `contracts/test/UpshiftRedeemFork.t.sol` |
| Payment history and proof page | Live, from the indexer | [`indexer/`](indexer) |
| Cash out to a bank | Not built | Needs a licensed partner's key, requested |

## Built on

| | Used for |
|---|---|
| **Monad** | One transaction settles all three portions in about a second |
| **Mera** | The whole account layer: a fingerprint creates the account and every wallet in it |
| **AUSD (Agora)** | The dollars that move |
| **Upshift** | The savings vault |
| **Anchored aQQQ on Uniswap v4** | The stock portion |
| **Envio HyperIndex** | Payment history, locked savings and the public proof page |

## Scope and limits

- Android only. The app is a test release distributed as an APK, not a store listing.
- No cash in or cash out to banks yet. Recipients receive digital dollars.
- One stock option. Other tokenized stocks exist on Monad but had no usable liquidity when this was built.
- Savings earnings are set by the vault and are not guaranteed. The stock fund moves with the market and is not direct share ownership.
- Buying then selling the stock portion the same day cost about 1.8% in pool fees in our mainnet test.
- The contracts are unaudited. Amounts used in testing were small on purpose.
- If the app is reinstalled, the list of saved people is lost. Their wallets come back by adding them again in the same order.

## Repository

| Folder | What is in it |
|---|---|
| [`contracts/`](contracts) | Foundry contracts, deploy script, unit and Monad fork tests |
| [`app/`](app) | Android app (Expo, React Native, Mera) |
| [`dashboard/`](dashboard) | The site: landing page, recipient page, proof page |
| [`indexer/`](indexer) | Envio HyperIndex config, schema and handlers |
| [`docs/`](docs) | Product brief, deployments, build log and evidence |

## Run it

```sh
# contracts: unit tests, then the same suite against Monad mainnet
cd contracts && forge test && forge test --fork-url https://rpc.monad.xyz

# app: tests and types
cd app && npm ci && npm test && npm run typecheck

# site: tests, then run it
cd dashboard && npm ci && npm test && npm run dev
```

Building the Android app needs `MERA_RP_ID` set to the site that serves `/.well-known/assetlinks.json` for your signing key. See [`app/README.md`](app/README.md).

## Credits

External code: OpenZeppelin Contracts, forge-std, viem, Expo and React Native, the Mera SDK, Envio HyperIndex, react-native-svg and react-native-qrcode-svg. The Satoshi typeface is used under the ITF Free Font License. Every contract in `contracts/src` was written for this hackathon.

AI coding assistants were used for parts of the code, tests and documentation. Every change was reviewed and tested, and every mainnet transaction was signed with the author's keys.

## License

MIT. See [LICENSE](LICENSE). To report a security problem, see [SECURITY.md](SECURITY.md).
