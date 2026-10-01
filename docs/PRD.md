# Portionly PRD

## Product statement

Portionly is a mobile remittance application where a sender chooses what money becomes when it reaches a recipient. One plan can allocate AUSD to immediate spending, an Upshift yield vault, an optional future lock and a guarded tokenized Nasdaq-100 tracker purchase.

## Users

- **Sender:** funds and confirms a split from a passkey-controlled account.
- **Recipient:** receives each resulting asset in a passkey-controlled account and sees balances, goals and history.

## Core promise

For an amount `A`, bucket amounts must sum exactly to `A`. The app previews each outcome before signature. The contract never spends above the signed amount or silently accepts an unsafe Invest quote.

## Hackathon acceptance path

1. Sender creates or restores a Mera passkey account on Android.
2. Sender selects a recipient, enters AUSD amount and chooses allocations.
3. The app obtains live route data and shows exact expected outcomes and risks.
4. Sender confirms the plan.
5. On Monad, Now transfers AUSD, Grow deposits AUSD for recipient-owned earnAUSD shares, and Invest purchases aQQQ only within oracle and slippage bounds.
6. Unsafe Invest allocation goes to Grow according to the signed plan.
7. Envio-indexed events drive recipient history and goal progress.
8. The recipient sees resulting assets and unlock information.

## Must ship

- Android APK
- Mera account creation and signing on a physical Android device
- AUSD Now route
- Upshift Grow route
- Guarded aQQQ Invest route with deterministic fallback
- Envio-indexed recipient history
- Small verified Monad mainnet transfer
- Two-minute demo and explorer evidence

## Conditional

- Base USDC funding through Aurora/NEAR Intents
- Future lock
- Web companion

## Explicit exclusions

- Fiat cash-in or cash-out
- Recurring transfers
- Individual stock tokens without usable liquidity
- Direct Anchored issuance
- Fixed-yield claims
- Unverified country eligibility claims

## Success measures

- A new user reaches a preview without a seed phrase or browser extension.
- Every displayed bucket amount reconciles to the signed input.
- The APK produces the same route outputs as contract simulation.
- Every live claim has a transaction hash, receipt, event proof and final balance check.
