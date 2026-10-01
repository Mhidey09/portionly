# Portionly engineering rules

## Product

Build the smallest truthful end-to-end remittance split for Monad Metropolis. Do not claim integrations, transactions, compliance, yield, liquidity, deployment or APK behavior without current evidence.

## Delivery

- Use strict RED-GREEN-REFACTOR for behavior changes.
- Keep contracts, provider adapters and UI logic fail closed.
- Commit and push small verified slices.
- Run targeted tests, affected suites, typecheck, lint and build before each push.
- Keep deployment and live-money execution separate from local build completion.

## Identity and secrets

- Repository owner and local commit author are Mhidey09.
- Do not add unrelated contributors or co-author trailers.
- Never commit secrets. Use ignored local environment files.
- Never print private keys or API tokens.

## Financial safety

- Pin chain ID 143 and verify bytecode before contract calls.
- Validate all addresses, token decimals, quotes, deadlines, minimum output and oracle bounds.
- A failed or unsafe Invest route must preserve funds by routing that allocation to Grow or failing before funds move.
- Never promise fixed yield or describe aQQQ as direct ownership without issuer-supported wording.
