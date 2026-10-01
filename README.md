# Portionly

Portionly lets a sender divide one AUSD remittance into money for today and assets for tomorrow on Monad.

## Hackathon target

Monad Metropolis, Consumer Products & Payments.

## Core transfer

A single confirmed plan can route AUSD into:

- **Now:** liquid AUSD for the recipient
- **Grow:** Upshift earnAUSD vault shares for the recipient
- **Invest:** guarded aQQQ purchase when liquidity and oracle checks pass
- **Future:** optional time-locked earnAUSD shares

If the Invest route is unavailable or unsafe, that allocation moves to Grow.

## Status

Private development repository. The project is in integration-spike stage. No contract address, APK, or live transaction is claimed until independently verified and recorded in `docs/evidence/`.

## Repository layout

- `apps/mobile/` Expo Android application
- `packages/core/` shared calculation and validation logic
- `contracts/` Solidity contracts and tests
- `indexer/` Envio indexer
- `docs/` PRD, architecture decisions, spike results and evidence

## Security

Never commit private keys, API keys, passkey material or provider credentials. Mainnet actions require explicit approval and receipt-level verification.
