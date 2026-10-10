# Portionly contracts

Foundry package for the Monad Portionly allocation path.

## Contracts

- `PortionlySplitterV2`: pulls an exact AUSD total and routes Now, Grow, and Invest under one replay-protected plan.
- `PortionlyAqqqInvest`: executes the pinned AUSD → USDC → aQQQ route through Monad's Universal Router and checks recipient output.
- `PortionlyFuture`: holds ERC-20 positions for at least 30 days before beneficiary claim.
- `PortionlySplitter`: earlier Now/Grow and ERC-3009 implementation retained for tests and reference. V2 is the current product path.

V2 behavior:

- Exact amount conservation.
- Exact, temporary downstream approvals.
- Signed minimum aQQQ output.
- Signed Invest-to-Grow fallback or atomic revert.
- Replay protection per sender and plan ID.
- Zero-share Grow deposits revert atomically.
- No intended AUSD retention.

## Verification

```sh
forge fmt --check
forge test --fork-url https://rpc.monad.xyz
forge build --sizes
```

Focused live-route test:

```sh
forge test \
  --match-test test_swapsExactAUSDToRecipientAqqqOnDeployedRouter \
  --fork-url https://rpc.monad.xyz \
  -vv
```

## Pinned Monad addresses

| Role | Address |
|---|---|
| AUSD | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` |
| Upshift AUSD vault | `0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA` |
| earnAUSD share token | `0x103222f020e98Bba0AD9809A011FDF8e6F067496` |
| USDC | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| aQQQ | `0x1446501E886c7f830DB9b494A1890cBCCC072f57` |
| Universal Router | `0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

## Deployment

`script/DeployPortionly.s.sol` deploys the Invest executor, Future vault, and V2 Splitter on chain ID 143 after checking live dependency bytecode.

Simulation:

```sh
forge script script/DeployPortionly.s.sol:DeployPortionly \
  --rpc-url https://rpc.monad.xyz \
  -vvv
```

Broadcast only after explicit approval, independent review, current gas simulation, isolated deployer funding, and a plan to verify runtime bytecode and immutables.

Deployed on Monad mainnet. Addresses, transactions and bytecode checks are in [`docs/DEPLOYMENTS.md`](../docs/DEPLOYMENTS.md).
