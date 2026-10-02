# Integration spikes

No spike is complete until its evidence is reproducible.

| Spike | Pass condition | Status |
|---|---|---|
| Mera Android | Physical Android device creates/restores account and signs a chain-143 transaction from the intended APK runtime | Interface verified; physical-device proof pending |
| AUSD authorization | Fresh sender can authorize and execute the Splitter with the exact number of confirmations shown in the UI | Contract path passes with a mock ERC-3009 authorization; real Mera signature and relayer pending |
| Upshift Grow | Live Monad interface and share accounting match the contract assumptions | Read-only fork proof passed; funded deposit pending explicit approval |
| Atomic split | Now + Grow + Invest execute under one signed plan with exact amount conservation and optional share lock | V2 unit and Monad-fork suites pass; funded mainnet execution pending |
| Invest route | A deployed aQQQ token and executable Monad AUSD-to-aQQQ route return a bounded minimum output | Fork quote, fixed-route executor, and recipient output checks pass; funded Mera transaction pending |
| Invest fallback | Failed Invest moves its exact allocation to Grow only when the signed plan allows it | V2 fallback and atomic rollback tests pass; funded mainnet evidence pending |
| Aurora Intents | Official quote returns a supported Base USDC route to the exact Monad destination/output, with status and refund behavior recorded | Blocked: every listed Monad destination returned `Quoting for this pair is not available` |
| Envio | Portionly events index from Monad and drive recipient history in a local client | Interface verified; indexer not yet running |
| Mainnet proof | Bounded small-value transaction confirms and final recipient balances reconcile | Blocked on deployment review, explicit funding approval, and a working deposit route |

## Evidence rules

Each completed spike records:

- source URL or pinned package version
- exact command or test
- timestamp and chain ID
- relevant contract addresses and bytecode hashes
- output or transaction hash
- limitations and unresolved assumptions

See [`evidence/2026-10-01-interface-spikes.md`](evidence/2026-10-01-interface-spikes.md) for the first reproducible checkpoint and [`evidence/2026-10-02-aqqq-route.md`](evidence/2026-10-02-aqqq-route.md) for the executed aQQQ fork route.
