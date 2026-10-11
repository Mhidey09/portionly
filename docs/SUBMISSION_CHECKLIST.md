# Submission checklist

Ticked only from the live product and the chain, never from intent. Deadline: 13 Oct 2026, 11:59 PM ET (14 Oct 03:59 UTC). Submit on hackathon.monad.xyz.

## Main submission, Track 02: Consumer Products & Payments

- [x] Working product on Monad mainnet (contracts in `docs/DEPLOYMENTS.md`)
- [ ] Public project profile with demo, short write up and code link
- [x] Repository public
- [ ] Demo video
- [x] Contract addresses and transaction hashes recorded (`docs/DEPLOYMENTS.md`, `docs/evidence/`)

## Agora: Best Cross Border Payments App

Requirement: a mobile app letting users send AUSD across borders using Mera passkey onboarding and instant settlement.

- [x] Mobile app (Android APK built on EAS, package `com.portionly.app`)
- [x] Mera passkey onboarding on a physical phone, no seed phrase (`docs/evidence/2026-10-09-phone-mera-plan.md`)
- [x] Sends AUSD to another account from the phone: Send home, tx `0x3b20456a3032fcefcac481182c49526506973be309a27dffff506c0fc67065f0`
- [x] Settles in one Monad transaction; the app verifies balances before showing success
- [x] Send to someone with no account: a link that pays its own fee (`docs/evidence/2026-10-10-link-payment.md`)
- [x] Amounts shown in the recipient's currency at a live reference rate
- [x] Transfer settled through Agora's Instant Settlement contract on Monad testnet, from a physical phone with a Mera passkey (`docs/evidence/2026-10-11-agora-instant-settlement.md`)
- [x] Built against Agora's public API (live metrics endpoint)
- [ ] Demo shows passkey sign in, AUSD balance and a send

## Monad Foundation: Best Mera Powered UX

- [x] Mera is the whole account layer: fingerprint creates the account, no seed phrase, no extension, no custody backend
- [ ] Onboarding and unlock flows reviewed on the redesigned app

## Monad Foundation: Mera, One Passkey, Many Keys

- [x] One passkey derives a main wallet plus a separate wallet per person (BIP 44 index, as Mera's guide recommends); code and tests in `app/src/hd.ts`, `app/src/people.ts`, `app/src/wallet.ts`
- [x] Shown working on a physical phone: a person added, money set aside in their wallet, a payment sent from it (`docs/evidence/2026-10-10-many-keys.md`)

## Envio: Best Use of Envio

- [x] HyperIndex indexer live for PlanExecuted, PositionLocked and PositionClaimed (`indexer/`)
- [x] Powers a core feature: recipient payment history, locked savings and the public proof page
- [x] The app reads locked savings from it to offer Claim

## What is real and proven

| Part | Proof |
|---|---|
| Three way split in one transaction | Mainnet, from a phone: `0x3dce58f65bf4d56504f9dbb3607bc52a02298754890e6572a0e6f4dc3fa5bbf9` |
| Send home (all AUSD) | Mainnet, from a phone: `0x3b20456a…7065f0` |
| Savings locked for a month | Mainnet, from a phone: `0x3b2bad6cfd0fd99c7835e1f72d96b39ddf7f543dcd2ec6fb3bc85794cf97347c` |
| Claim after the lock | Mainnet fork test only; the first real lock opens on 9 Nov 2026 |
| Sell stocks back to AUSD | Mainnet: `0x9187d5b8dab62dbb35b0ed59961bbcbdda49cc439256ce200285dfe2264fe64b` |
| Withdraw savings now | Mainnet: `0x2a8a689305a313137b7e9495b0d209802579b830c513f9c41f963def511bc416` |
| Withdraw savings free after the lag | Mainnet fork test only |

## Not claimed

- Cash out to a bank. A licensed off ramp supports AUSD on Monad, but integrating it needs their API key, which has been requested.
- Any stock other than the Nasdaq 100 tracker. Other tokenized stocks exist on Monad without usable liquidity.
- Fixed or guaranteed earnings on savings.
