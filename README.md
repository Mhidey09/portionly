# Portionly

Portionly lets a sender divide one AUSD remittance into money for today and recipient-owned assets for tomorrow on Monad.

## Core transfer

One confirmed plan can route AUSD into:

- **Now:** liquid AUSD for the recipient
- **Grow:** Upshift earnAUSD vault shares for the recipient
- **Invest:** a guarded aQQQ purchase through pinned Monad liquidity
- **Future:** an optional time lock for Grow shares

If Invest fails, the sender's signed plan either moves that exact allocation to Grow or reverts atomically. Bucket amounts must reconcile exactly to the signed input.

## Current status

The Android source, recipient dashboard, contracts, and Monad-fork route are implemented and locally verified. A test release APK has been built. No Portionly contract is deployed and no funded Portionly mainnet transaction is claimed.

Read these before continuing:

- [`docs/PRD.md`](docs/PRD.md)
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- [`HANDOFF.md`](HANDOFF.md)
- [`docs/SPIKES.md`](docs/SPIKES.md)
- [`docs/evidence/`](docs/evidence/)

## Repository layout

- `app/`: Expo Android sender application with Mera passkey account support
- `dashboard/`: read-only recipient balance dashboard
- `contracts/`: Solidity contracts, tests, and Monad deployment script
- `docs/`: product requirements, plan, integration evidence, and open boundaries

## Quick verification

```sh
cd app
npm ci
npm test
npm run typecheck

cd ../dashboard
npm ci
npm run typecheck
npm run build
npx playwright test

cd ../contracts
forge fmt --check
forge test --fork-url https://rpc.monad.xyz
forge build --sizes
```

## Security

Never commit private keys, API keys, passkey material, keystores, or provider credentials. Mainnet deployment and funded execution require explicit approval plus receipt-level and final-balance verification.
