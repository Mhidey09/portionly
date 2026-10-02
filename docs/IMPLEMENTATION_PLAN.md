# Portionly implementation plan

Last updated: 2026-10-02

This plan starts from the verified local build documented in `HANDOFF.md`. A phase is complete only when its listed evidence exists. A local build, fork test, or dry run does not count as a deployment or live payment.

## 1. Stabilize the repository

- Keep Android planner tests, dashboard acceptance tests, and Foundry tests green.
- Add GitHub Actions for app typecheck/tests, dashboard build, and local contract tests.
- Treat dependency-audit findings as explicit release risks. Do not apply npm's suggested Expo 44 downgrade.
- Keep generated APKs, Android native output, secrets, keystores, and deployment broadcasts out of Git.

Exit evidence:

- Clean checkout installs dependencies.
- CI runs against the exact pushed commit.
- `git diff --check` and all package gates pass.

## 2. Stable Mera Android identity

- Replace the temporary TryCloudflare relying-party domain with stable HTTPS hosting.
- Serve `app/passkey-site/.well-known/assetlinks.json` from that domain.
- Decide on a production Android signing key. Update Digital Asset Links to its SHA-256 certificate fingerprint.
- Rebuild with `MERA_RP_ID=<stable-host>`.
- Install on a physical Android device.
- Create, lock, restore, and sign with a Mera passkey account.

Exit evidence:

- APK package and signing certificate independently verified.
- Stable Digital Asset Links response matches the installed APK.
- Physical-device passkey ceremony succeeds.
- No seed phrase or raw private key is requested or exposed.

## 3. Contract review and Monad deployment

- Review `PortionlySplitterV2`, `PortionlyAqqqInvest`, and `PortionlyFuture` from a frozen diff.
- Resolve or document every Foundry lint warning.
- Re-run the full suite with `https://rpc.monad.xyz`.
- Simulate `DeployPortionly.s.sol` and record gas at the current base fee.
- After explicit approval, create or use an isolated deployer and fund only the bounded amount required.
- Broadcast to chain ID 143.
- Verify deployed bytecode, constructor immutables, and explorer metadata.
- Inject the verified Splitter address through `PORTIONLY_SPLITTER_ADDRESS` and rebuild Android.

Exit evidence:

- Deployment transaction hashes and contract addresses.
- Runtime bytecode hashes and immutable-address checks.
- No contract control or excess funds left with an unintended deployer.

## 4. Bounded live end-to-end execution

- Fund the Mera sender with the approved small amount of AUSD and MON.
- Fetch a fresh quote and inspect input, minimum output, deadline, recipient, chain, and targets.
- Execute the exact approval and Splitter plan from the physical Android device.
- Verify receipt status, `PlanExecuted`, sender AUSD delta, recipient AUSD, Grow shares, aQQQ output or signed fallback, and Splitter retained balance.
- Save transaction links and machine-readable evidence under `docs/evidence/`.

Exit evidence:

- One small Monad mainnet plan with receipt-level and final-balance proof.
- A failure-path run or deterministic fork evidence showing fallback/rollback behavior.

## 5. Envio recipient history

- Add an Envio indexer for `PlanExecuted`, `PositionLocked`, and `PositionClaimed`.
- Pin the chain, addresses, ABI, start blocks, and schema.
- Drive dashboard history from indexed events while keeping direct RPC balances independently visible.
- Distinguish indexed, pending, and RPC-confirmed states.

Exit evidence:

- Reproducible local indexer run.
- Recipient history from actual Portionly events.
- Dashboard does not fabricate history when the indexer is unavailable.

## 6. Aurora/NEAR Intents, conditional

The verified spike found no quote for the tested Base USDC to Monad destination/output pairs. Keep this conditional.

- Recheck the official provider after the core Monad path works.
- Add only if an official live quote, status lifecycle, destination binding, and refund path can be reproduced.
- Never mock a successful bridge or imply unsupported routing.

Exit evidence:

- Official quote and bounded test execution, or a documented exclusion from the submission.

## 7. Release and submission

- Run contract security review, dependency audit, Android install/upgrade tests, and dashboard browser tests.
- Replace debug signing with the selected production key if distributing beyond test devices.
- Record a two-minute demo showing account, plan, signature, receipt, and recipient result.
- Update README status, architecture diagram, evidence index, pitch, and submission form.
- Verify every public claim against current artifacts and explorer evidence.

Exit evidence:

- Final APK checksum.
- Forwardable release-readiness report with remaining risks.
- Demo, pitch deck/script, repository link, and submitted entry confirmation.
