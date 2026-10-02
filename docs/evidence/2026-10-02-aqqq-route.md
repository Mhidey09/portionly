# aQQQ route spike evidence, 2026-10-02

This checkpoint proves quote and swap execution against a local fork of Monad mainnet. It is not evidence of a broadcast mainnet transaction or a Mera passkey signature.

## Result

**Pass on fork:** AUSD → USDC → aQQQ is executable through the deployed Uniswap v4 contracts on Monad.

At fork block `109748048`, an ephemeral account spent exactly `1.000000 AUSD` and received exactly `0.001388310340022417 aQQQ`. The transaction used the official Uniswap Universal Router SDK's v2.1.2 encoder, Permit2 ingress, both deployed v4 pools, and a final output sweep with a 1% slippage floor of `0.001374428623497024 aQQQ`.

No mainnet transaction was broadcast and no real wallet funds were spent.

## Contracts

| Role | Address |
|---|---|
| AUSD | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` |
| USDC | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| Invesco QQQ aStock, aQQQ | `0x1446501E886c7f830DB9b494A1890cBCCC072f57` |
| Uniswap v4 PoolManager | `0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e` |
| Uniswap v4 Quoter | `0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891` |
| Uniswap Universal Router v2.1.2 | `0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

The corrected aQQQ contract has Monad bytecode and returns:

- `name()` = `Invesco QQQ aStock`
- `symbol()` = `aQQQ`
- `decimals()` = `18`

## Proven pool keys

The keys were recovered from PoolManager `Initialize` events, not inferred from token symbols.

| Hop | Pool ID | Fee | Tick spacing | Hooks | Initialization transaction |
|---|---|---:|---:|---|---|
| AUSD/USDC | `0x092b650478145f0aee73a1b400b342b9c6314db2e07aeb91faf7e75e8159ce72` | 50, or 0.005% | 1 | zero address | `0xde38773ab066c671b7b0cf73e9395ad1c69300677a221c080b1aa622000425bb` |
| aQQQ/USDC | `0xb02cb6d8fa49ff9c9cf7576a231ccf335e33b2be1defa3c7c91b03cf86fcabe9` | 9000, or 0.9% | 90 | zero address | `0xea4ca9eaa91f2aa495287bd5b955d022ace112366b3346e510f24c5fc9b0c73a` |

## Reproduction

```sh
cd contracts
forge test \
  --match-contract AqqqSwapForkTest \
  --fork-url https://rpc.monad.xyz \
  --fork-block-number 109748048 \
  -vv
```

Observed:

```text
[PASS] test_executesOneAUSDToAQQQThroughDeployedRouter()
Suite result: ok. 1 passed; 0 failed; 0 skipped
```

The test asserts:

- a live v4 quote returns a nonzero amount,
- exactly 1 AUSD reaches and is settled by the router,
- the AUSD/USDC and USDC/aQQQ swaps both execute,
- the swapper's AUSD balance reaches zero,
- the final aQQQ balance meets the 99% minimum-output bound,
- aQQQ reaches the intended recipient rather than remaining in Universal Router.

The generated SDK calldata is checked in at `contracts/test/fixtures/aqqq-swap.json`. The transaction commands decode to Permit2 transfer, v4 swap, and final sweep.

## Remaining boundary

This closes route discovery and fork execution. It does not close:

- passkey signing from the Android Mera runtime,
- live ERC-20 and Permit2 approvals from that account,
- a funded Monad mainnet swap,
- integration of the Invest allocation into `PortionlySplitter`,
- production quote freshness and slippage policy.

A funded transaction needs an explicitly approved Mera account with at least 1 AUSD plus MON for gas. That is the next stock-leg proof.
