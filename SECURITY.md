# Security

Portionly moves real money on Monad mainnet. The contracts are unaudited hackathon code, so please treat them that way and keep amounts small.

## Reporting a problem

Open a [private security advisory](https://github.com/Mhidey09/portionly/security/advisories/new) on this repository. Please do not open a public issue for anything that could put funds at risk. Include the contract or file, what you did, what happened and what you expected. You will get a reply within a few days.

## What the design relies on

- **No owner.** `PortionlySplitterV2`, `PortionlyAqqqInvest`, `PortionlyFuture` and `PortionlyLink` have no admin, no pause and no upgrade path. Nobody, including the deployer, can move funds or change addresses after deployment.
- **Nothing held.** The splitter and the stock executor end every call holding no AUSD. Locked savings sit in `PortionlyFuture` and only the named beneficiary can claim them, only after the unlock time.
- **All or nothing.** A plan's portions must add up to the amount pulled from the sender. If the stock purchase fails or lands below the signed minimum, that portion goes to savings when the sender allowed it, otherwise the whole plan reverts.
- **Pinned routes.** Token, vault, pool and router addresses are constants or immutables, checked at deploy time.
- **Keys stay on the phone.** The account comes from a passkey through Mera. There is no server that holds or sees keys. The secret the passkey produces is kept in the phone's secure storage behind the fingerprint so the app can unlock without a new passkey prompt each time; signing keys are derived from it in memory, used and zeroed.
- **Links are bearer secrets.** A payment sent by link waits under a one time key. The key travels in the part of the link after `#`, which browsers do not send to servers, and the claim page reads it locally. Anyone who gets the link can collect, so the sender can cancel until it is collected, and the app saves the key before any money moves so a crash cannot strand it. Link keys are stored on the sender's phone without a fingerprint prompt.

## Known limits

- The Upshift vault, Uniswap v4 pools, AUSD and aQQQ are outside this repository. A fault, pause or upgrade in any of them affects Portionly.
- Lock ids are scoped to the depositor, so an id seen in a pending transaction cannot be taken by someone else. A sender can still not lock twice under the same plan id.
- The app trusts the public Monad RPC and the Envio indexer for what it displays. Payment success is confirmed from the transaction receipt and balances, not from the indexer.
- The Android build is a test release distributed as an APK. It takes JavaScript updates over the air without code signing, so the release account is trusted: whoever controls it can change the app's behaviour.
- A link's creation can be made to fail by someone who front runs it with the same link address. No money is lost; the sender tries again with a new link.
- Someone paid straight to an address, not by link, needs MON before they can move funds.
- The contracts are verified on Sourcify but have had no professional audit.
- If the stock price moves more than 1% while a payment is sent, the stock part goes to savings instead. When the savings are locked the app cancels the whole payment, so money meant to stay liquid is never frozen. A locked payment sent by link is the exception: there the stock part joins the locked savings, and the app says so before sending.
- Savings sit in a third party vault that puts deposits to work. An instant withdrawal is paid from the cash the vault holds at that moment; the app checks first and offers the free withdrawal, paid after the vault's waiting period.
- Local currency amounts use a public reference rate. They are a guide, not a payout quote.
- People, budgets and sent links are found again from the chain on a new phone. Names are kept only on the phone, so restored people come back as Person 1, Person 2. A link made on another install can be taken back but not shared again.
- One stock option. Other tokenized stocks exist on Monad but had no usable liquidity when this was built.
