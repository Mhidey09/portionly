# Security

Portionly moves real money on Monad mainnet. The contracts are unaudited hackathon code, so please treat them that way and keep amounts small.

## Reporting a problem

Open a [private security advisory](https://github.com/Mhidey09/portionly/security/advisories/new) on this repository. Please do not open a public issue for anything that could put funds at risk. Include the contract or file, what you did, what happened and what you expected. You will get a reply within a few days.

## What the design relies on

- **No owner.** `PortionlySplitterV2`, `PortionlyAqqqInvest` and `PortionlyFuture` have no admin, no pause and no upgrade path. Nobody, including the deployer, can move funds or change addresses after deployment.
- **Nothing held.** The splitter and the stock executor end every call holding no AUSD. Locked savings sit in `PortionlyFuture` and only the named beneficiary can claim them, only after the unlock time.
- **All or nothing.** A plan's portions must add up to the amount pulled from the sender. If the stock purchase fails or lands below the signed minimum, that portion goes to savings when the sender allowed it, otherwise the whole plan reverts.
- **Pinned routes.** Token, vault, pool and router addresses are constants or immutables, checked at deploy time.
- **Keys stay on the phone.** The account comes from a passkey through Mera. Keys are derived in memory, used and zeroed. There is no server that holds or sees them.

## Known limits

- The Upshift vault, Uniswap v4 pools, AUSD and aQQQ are outside this repository. A fault, pause or upgrade in any of them affects Portionly.
- Lock ids are scoped to the depositor, so an id seen in a pending transaction cannot be taken by someone else. A sender can still not lock twice under the same plan id.
- The app trusts the public Monad RPC and the Envio indexer for what it displays. Payment success is confirmed from the transaction receipt and balances, not from the indexer.
- The Android build is a test release distributed as an APK.
