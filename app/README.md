# Portionly Android

Expo/React Native Android sender application for building and signing an exact AUSD allocation on Monad.

## Implemented flow

- Create or restore a Mera passkey-derived EVM account.
- Read live MON, AUSD, and aQQQ balances.
- Enter a recipient, total AUSD amount, and Now/Grow/Invest percentages.
- Fetch a live AUSD-to-aQQQ quote.
- Build an exact plan with a ten-minute deadline, 1% slippage ceiling, exact approval, and signed Invest-to-Grow fallback.
- After deployment configuration, submit approval plus Splitter execution.
- Require receipt, `PlanExecuted`, sender balance, recipient assets, and retained-balance verification.

Execution fails closed when `PORTIONLY_SPLITTER_ADDRESS` is missing or malformed.

## Pinned safety limits

- Chain: Monad mainnet, ID `143`
- Quote age at plan creation: at most 60 seconds
- Transaction deadline: 10 minutes
- Slippage: at most 1%
- Gas reserve check: 0.12 MON
- AUSD approval: exact plan total
- All displayed bucket amounts reconcile exactly to the input

## Source verification

```sh
export PATH=/opt/node24/bin:$PATH
npm ci
npm test
npm run typecheck
```

## Native Android build

Requirements: Node 24, Java 17, Android SDK 36, a stable HTTPS relying-party host, and an Android signing decision.

1. Serve `passkey-site/.well-known/assetlinks.json` from the relying-party host. Its package must be `com.portionly.app` and its fingerprint must match the final APK signer.
2. Build:

```sh
export MERA_RP_ID=<stable-host>
# Set this only after deployment and bytecode verification:
export PORTIONLY_SPLITTER_ADDRESS=<verified-address>
npm run prebuild
printf 'sdk.dir=/path/to/android-sdk\n' > android/local.properties
npm run build:android:release
```

The release APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

## Current boundary

- Android source tests and typecheck pass.
- A release APK has been built with a temporary TryCloudflare RP host and the debug signing key.
- No physical Android passkey ceremony has been completed.
- No Portionly contract address is configured.
- No funded mainnet plan has been executed.
- Expo's build dependency chain currently reports advisories for `node-forge` and an iOS-only `uuid` path. npm's force fix would downgrade Expo incompatibly and must not be applied without a tested migration.

See the repository root `HANDOFF.md` for exact artifact checksums and next steps.
