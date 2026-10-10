# Recipient actions on mainnet, 2026-10-10

A recipient can turn what arrived back into AUSD. The transactions below are the exact calldata produced by `app/src/recipientActions.ts`, sent from the deployer EOA `0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2`, which received aQQQ and earnAUSD from the first mainnet plan. All have status 1.

## Sell stocks (aQQQ to USDC to AUSD, same pinned pools as the buy, reversed)

Input 0.000686925658185242 aQQQ. Live Uniswap v4 quote 0.491042 AUSD; signed minimum 0.486131 AUSD (1%).

- Approve Permit2: `0xbf595b29f9045fac07e7a4b90a88cc857533363d2fc1a24c68bb3af783d63bb2`
- Approve Universal Router: `0x34aca959a39ffa9cdbac81fd4982fff37126807c9b5dd429073cb7b7bd2353ff`
- Sell: `0x9187d5b8dab62dbb35b0ed59961bbcbdda49cc439256ce200285dfe2264fe64b`

The buy and sell each cross the 0.9% fee aQQQ/USDC pool, so a same-day round trip on this amount cost about 1.8% (0.5 AUSD in, about 0.491 AUSD back at quote).

## Withdraw savings instantly (Upshift `instantRedeem`, 0.2% fee)

0.238935 earnAUSD (half the holding).

- Approve savings: `0x09b1d08780afcedde554a9b737e1468d2b8f331dc3ee2e75b75df39683a33899`
- Withdraw: `0x2a8a689305a313137b7e9495b0d209802579b830c513f9c41f963def511bc416`

## Standard withdrawal (no fee, after the vault's lag)

Not yet run on mainnet. `contracts/test/UpshiftRedeemForkTest` proves `requestRedeem` then `claim(year, month, day, receiver)` against the live vault: 0.47787 earnAUSD returned 0.499998 AUSD, against 0.498999 AUSD for the instant path.
