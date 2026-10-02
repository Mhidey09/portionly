# Portionly agent handoff

Handoff timestamp: 2026-10-02 22:15:31 UTC

## Read first

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/IMPLEMENTATION_PLAN.md`
4. `docs/SPIKES.md`
5. Evidence files under `docs/evidence/`

The repository is a partially completed hackathon product. Local and fork evidence exists. No Portionly contract has been deployed and no funded Portionly mainnet transaction has been broadcast.

## Product boundary

A sender uses a Mera-derived passkey account on Android to allocate one AUSD amount into:

- **Now:** AUSD transferred to the recipient.
- **Grow:** AUSD deposited into the Monad Upshift vault, with shares delivered to the recipient or optionally locked.
- **Invest:** AUSD swapped through the pinned Monad AUSD/USDC and USDC/aQQQ route, subject to a signed minimum output.

The bucket amounts must reconcile exactly. If Invest fails, the signed plan either redirects that amount to Grow or reverts atomically.

## Repository layout

- `app/`: Expo/React Native Android sender application and Mera passkey wallet.
- `dashboard/`: React/Vite read-only recipient dashboard.
- `contracts/`: Foundry contracts, deployment script, unit tests, and Monad fork tests.
- `docs/`: PRD, implementation plan, spikes, evidence, and this handoff.

Generated `app/android/`, `node_modules/`, `dist/`, keystores, and environment files are intentionally ignored.

## Verified green state

### Android source

From `app/`:

```sh
export PATH=/opt/node24/bin:$PATH
npm test
npm run typecheck
```

Last result:

- 2 Vitest files passed.
- 12 tests passed.
- TypeScript passed.

A release APK was built successfully with Gradle after clean Expo prebuild. The local ignored artifact is:

```text
/root/portionly/dist/Portionly-0.1.0-android.apk
```

Verified artifact data:

- Package: `com.portionly.app`
- Version: `0.1.0`
- Minimum SDK: 24
- Target SDK: 36
- Size: `72,852,024` bytes
- SHA-256: `63ac16cae98334b5e384d9bc430f9cd6d263119302e351a62316693620de3d5b`
- APK Signature Scheme v2: verified
- Signer certificate SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`

This is a test release signed by the preserved Android debug certificate. It is not store-ready.

The build used this temporary relying-party host:

```text
ceiling-terminology-faculty-undertaken.trycloudflare.com
```

That quick tunnel is not durable. Rebuild against a stable host before treating passkeys as release-ready.

No `PORTIONLY_SPLITTER_ADDRESS` was injected. The app therefore permits account/balance/quote/review behavior but deliberately gates transaction execution.

### Contracts

From `contracts/`:

```sh
/root/.foundry/bin/forge fmt --check
/root/.foundry/bin/forge test --fork-url https://rpc.monad.xyz
/root/.foundry/bin/forge build --sizes
```

Last result: full suite passed against the Monad mainnet fork.

Important verified behavior:

- Exact Now + Grow + Invest conservation.
- Plan replay protection.
- Signed fallback redirects failed Invest to Grow.
- Unsigned fallback failure reverts all partial transfers.
- Zero Grow shares reverts and rolls back the whole plan.
- The deployed Monad Universal Router fork route spends exact AUSD and sends real aQQQ to the recipient.
- Splitter and Invest executor retain no added AUSD after successful execution.

`PortionlySplitterV2` runtime size is 6,316 bytes, safely below the 24,576-byte EVM limit.

Deployment dry run previously estimated `0.988949984 MON`; the safe funding request was `1.10 MON`. Gas prices change, so simulate again before asking for funds.

### Dashboard

From `dashboard/`:

```sh
npm ci
npm run typecheck
npm run build
npx playwright test
```

The last browser run passed four acceptance cases across desktop and a Pixel 7 viewport: initial read-only state, invalid address, live Monad balance lookup, and explorer/mobile layout. Re-run because those commands were completed before this handoff commit.

## Pinned Monad contracts

Chain ID: `143`

| Role | Address |
|---|---|
| AUSD | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` |
| USDC | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| aQQQ | `0x1446501E886c7f830DB9b494A1890cBCCC072f57` |
| Upshift AUSD vault | `0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA` |
| earnAUSD share token | `0x103222f020e98Bba0AD9809A011FDF8e6F06DFc6` |
| Uniswap v4 PoolManager | `0x188d586Ddcf52439676Ca21A244753fA19F9Ea8e` |
| Uniswap v4 Quoter | `0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891` |
| Universal Router | `0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Pool keys and reproduction evidence are in `docs/evidence/2026-10-02-aqqq-route.md`.

## Known risks and blockers

1. **No deployment:** `PortionlyAqqqInvest`, `PortionlyFuture`, and `PortionlySplitterV2` have no mainnet addresses.
2. **No approved deployer:** do not create/import a wallet or request funds without explicit user approval. Never put a key in chat or Git.
3. **No physical-device proof:** no Android device or emulator was connected on the build host. Mera create/restore/sign remains unverified on hardware.
4. **Temporary passkey domain:** the TryCloudflare host can disappear. Use stable HTTPS and match Digital Asset Links to the final signing certificate.
5. **Debug release signing:** the current release APK uses the debug key.
6. **Envio absent:** recipient history is not indexed yet.
7. **Aurora conditional:** tested routes returned no quote. Do not claim this integration.
8. **Dependency audit:** Expo's build chain reports `node-forge` and iOS `uuid` advisories. npm's suggested force fix downgrades Expo to 44 and was intentionally not applied.
9. **Foundry lint:** review conservative warnings around external calls inside `nonReentrant`, guarded casts, and timestamp deadlines before deployment.
10. **No live-money evidence:** fork calls and simulations are not mainnet transaction proof.

## Recommended next actions

Follow `docs/IMPLEMENTATION_PLAN.md`. The next agent should start with:

1. Verify the pushed commit in a clean checkout and run app, dashboard, and contract gates.
2. Establish a stable RP domain and final Android signing decision.
3. Install the APK on Chief's Android phone and verify Mera passkey create/restore/sign.
4. Freeze and independently review the V2 contract diff.
5. Obtain explicit deployment approval, then create/use an isolated deployer, resimulate gas, deploy, and verify bytecode.
6. Inject the verified Splitter address and rebuild.
7. Execute one bounded funded plan and preserve receipt/balance evidence.
8. Add Envio indexing and dashboard history.
9. Recheck Aurora only after the core path is complete.
10. Finish security audit, demo, pitch, and submission.

## Git and identity rules

- Repository: `https://github.com/Mhidey09/portionly`
- Commit author must remain `Mhidey09 <120558291+Mhidey09@users.noreply.github.com>`.
- Do not add co-author trailers.
- Before continuing, run `git status`, `git log -1`, and inspect the remote CI result for the exact HEAD.
- Do not confuse a pushed source commit with deployed contracts or a tested APK installation.
