# Integration spikes

No spike is complete until its evidence is reproducible.

| Spike | Pass condition | Status |
|---|---|---|
| Mera Android | Physical Android device creates/restores account and signs a chain-143 transaction from the intended APK runtime | In progress |
| AUSD authorization | Fresh sender can authorize and execute the Splitter with the exact number of confirmations shown in the UI | In progress |
| Atomic split | Now + Grow + Invest execute under one signed plan, with exact amount conservation | Pending |
| Invest fallback | Unsafe or unavailable Invest route moves its exact allocation to Grow without loss | Pending |
| Aurora Intents | Official quote returns a supported Base USDC route to the exact Monad destination/output, with status and refund behavior recorded | In progress |
| Envio | Portionly events index from Monad and drive recipient history in a local client | In progress |
| Mainnet proof | Bounded small-value transaction confirms and final recipient balances reconcile | Blocked on preceding spikes and explicit funding approval |

## Evidence rules

Each completed spike records:

- source URL or pinned package version
- exact command or test
- timestamp and chain ID
- relevant contract addresses and bytecode hashes
- output or transaction hash
- limitations and unresolved assumptions
