# Portionly for Android

The sender's and recipient's app. Expo and React Native, with a [Mera](https://docs.monad.xyz/guides/mera) passkey account: a fingerprint creates the account, and there is no seed phrase.

## What it does

- **Send home:** all of a payment arrives as AUSD.
- **Send + grow:** drag the portions between Home now, Savings that earn and US tech stocks, and optionally lock the savings for 1, 3, 6 or 12 months.
- **People:** each person you pay gets their own wallet, derived from the same passkey.
- **Receive:** a QR code and a link for others to pay you.
- **Money:** withdraw savings, sell stocks and claim savings that were locked for you.

Before it shows "Sent" the app checks the sender's and recipient's balances and the `PlanExecuted` event against the plan that was signed.

## Layout

| Path | Purpose |
|---|---|
| `App.tsx` | Fonts, splash, first run pages, tabs |
| `src/usePortionly.ts` | App state and actions |
| `src/screens/` | Home, Send, Receive, Money, Onboarding |
| `src/ui/` | Design system: theme, slip bar, buttons, tab bar, motion |
| `src/portionlyPlan.ts` | Builds the plan and its two calls; pure and tested |
| `src/recipientActions.ts` | Withdraw savings, claim, sell stocks; pure and tested |
| `src/network.ts` | Chain reads, quotes, sending and checks after sending |
| `src/wallet.ts`, `src/hd.ts`, `src/people.ts` | Passkey account, one wallet per person |

## Develop

```sh
npm ci
npm test
npm run typecheck
```

## Build

The passkey is bound to a website and to the app's signing key. Set `MERA_RP_ID` to a site that serves `/.well-known/assetlinks.json` listing your key's SHA 256 fingerprint for the package `com.portionly.app`.

```sh
MERA_RP_ID=your.site PORTIONLY_SPLITTER_ADDRESS=0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a \
  eas build --platform android --profile preview
```

Changes that touch only JavaScript ship with `eas update --channel preview`. Adding native code needs a new build and a new version number, so an update never reaches a build that cannot run it.
