# Interface spike evidence, 2026-10-01

This file records read-only checks and local tests. It is not evidence of a funded mainnet transaction.

## Environment

- Target chain: Monad mainnet, chain ID `143`
- RPC used: `https://rpc.monad.xyz`
- Foundry: `1.8.0-nightly`
- Solidity: `0.8.24`
- Mera package: `@category-labs/mera@0.2.0`
- Mera source commit inspected: `a3102f4fa7b89ce4e58e843a2d6da2201035ff25`

## AUSD

Contract: `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`

Read-only RPC results:

- `name()` = `Agora Dollar`
- `symbol()` = `AUSD`
- `decimals()` = `6`
- `DOMAIN_SEPARATOR()` returned a nonzero value
- `nonces(address(0x1))` = `0`
- `authorizationState(address(0x1), bytes32(0))` = `false`
- EIP-1967 implementation = `0xc1E3c7D486d6A92fBe920232E439Eec2ceB112da`
- Proxy runtime hash = `0xc850ec29cec6833ab435f8483712b33b4f4b42e25a9b615ad3c25b6a907df99d`
- Implementation runtime hash = `0x8a97c336f2ed22877a95e1bfb89992f2ddb13e9af94081f093b7dbd5bfe3f824`

The live interface answered ERC-2612 and ERC-3009 reads. Local `PortionlySplitterTest.test_relayerExecutesWithOneAUSDAuthorization` verifies that a relayer can route a plan after `receiveWithAuthorization` transfers the exact total into the splitter. A real signature from Mera and a running relayer remain unverified.

## Upshift earnAUSD

Vault: `0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA`

Read-only RPC results:

- `asset()` = AUSD
- `previewDeposit(AUSD, 100_000_000)` = `95_742_373` shares
- `previewDeposit(USDC, 100_000_000)` reverted with `Invalid asset`
- Vault EIP-1967 implementation = `0x7A5606730B4c7f40b0F2079D873232034560E718`
- Vault proxy runtime hash = `0x159eee68e9b2e35e56ea15df014045e8dec85aa6d6c61a834e4a3f190137c5f4`
- Vault implementation runtime hash = `0xf72efc50c6a63c37f65a60bd7472646e73d6444278c6334b969c971d85d7235d`

The previously recorded share-token address was removed because it has no Monad bytecode. The vault read interface is proven, but its funded share-custody behavior is not.

Reproduction:

```sh
cd contracts
forge test --match-contract MonadInterfacesForkTest --fork-url https://rpc.monad.xyz -vv
```

Observed at this checkpoint: 2 passed, 0 failed. The suite now also contains the separately documented aQQQ quote test.

## Mera

Official sources inspected:

- <https://github.com/category-labs/mera>
- `docs/src/content/docs/recipes/use-mera-with-react-native.md`
- `docs/src/content/docs/reference/to-viem-account.md`

Verified capabilities:

- React Native adapter exported at `@category-labs/mera/react-native-webauthn-client`
- Android binding uses `react-native-passkey`
- Expo needs a `crypto.getRandomValues` polyfill such as `expo-crypto`
- Android requires a public HTTPS relying-party host with `/.well-known/assetlinks.json`
- The viem account implements `signTypedData`, `signTransaction`, and EIP-7702 `signAuthorization`

Not yet verified:

- Android credential creation or restoration in Portionly's signed APK
- PRF support on the user's physical authenticator
- Monad transaction or AUSD authorization signed from that APK

## Aurora / NEAR Intents 1Click

Official token endpoint: `GET https://1click.chaindefuser.com/v0/tokens`

The live response listed Base USDC and these Monad assets:

- MON
- USDC
- USDT0

It did not list AUSD on Monad. Dry `POST /v0/quote` requests from Base USDC to each listed Monad destination returned HTTP `400` with `Quoting for this pair is not available`. The Monad USDC response reference was `260d5970-95e2-4a1a-aec5-5c39f9b49b66`.

Consequence: the advertised Base USDC to Monad deposit path is not currently executable through this provider. The integration stays disabled rather than returning a deposit address that cannot settle.

## aQQQ

The initial candidate, `0x7D72eC3cF11882c560be459165fA8Be803e4597B`, was rejected because Monad RPC returned no bytecode.

The corrected contract, `0x1446501E886c7f830DB9b494A1890cBCCC072f57`, and its executable AUSD → USDC → aQQQ route were subsequently proven. See [`2026-10-02-aqqq-route.md`](2026-10-02-aqqq-route.md).

## Envio

Official docs retrieved from <https://docs.envio.dev/docs/HyperIndex/supported-networks.md> state that Monad is supported and can use Hypersync or RPC sync. No Portionly indexer has been generated or run yet, so Envio remains in progress.

## Local contract tests

```sh
cd contracts
forge test --match-contract 'Portionly(Splitter|Future)Test' -vv
```

Observed: 5 passed, 0 failed.

Covered behavior:

- exact Now transfer
- Upshift-style Grow deposit
- Grow shares held in `PortionlyFuture`, not by the recipient
- 30-day minimum lock and beneficiary claim
- ERC-3009 relayer execution path
- ERC-3009 nonce binds the sender, recipient, allocation, deadline, unlock, plan ID, chain, and splitter
- same-sender plan replay rejection
- splitter retains no AUSD after successful routing

Uncovered at this checkpoint: three-bucket fallback, real provider calldata, fuzzing, invariant tests, deployment, and funded execution.
