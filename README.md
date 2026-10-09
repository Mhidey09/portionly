# Portionly indexer (Envio HyperIndex)

Indexes on Monad mainnet (chain 143), from block 111992400:

| Contract | Address | Events |
| --- | --- | --- |
| PortionlySplitterV2 | `0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a` | `PlanExecuted` |
| PortionlyFuture | `0x816fd57253CD589B76cF24B8cA1Ba38bB7818E22` | `PositionLocked`, `PositionClaimed` |

Entities (`schema.graphql`): `Plan` (one per executed plan), `Position` (one per lock, `claimed` flips on claim),
`Recipient` (running totals per lowercase address). Addresses are stored lowercase.
Exact ABIs are in `abis/` (event signatures are inlined in `config.yaml`, as in the Floorline indexer).

## Run locally

Envio 3.12.1 ships native binaries for Linux and macOS only, so on Windows run it inside WSL.

```bash
npm install
npx envio codegen      # generates types from config.yaml + schema.graphql
npx tsc --noEmit       # typecheck handlers and tests
npm test               # vitest, uses Envio's createTestIndexer (simulated events, no network)
npx envio dev          # needs Docker; GraphQL at http://localhost:8080 (admin secret: testing)
```

`config.yaml` syncs through HyperSync, which requires an Envio API token in `ENVIO_API_TOKEN`
(create one at https://app.envio.dev/api-tokens, put it in `.env`, never commit it).
For Envio Cloud, point the deployment at this folder and set the same variable.

## Queries for the dashboard

Plans for a recipient, newest first (use the lowercase address):

```graphql
query Plans($recipient: String!) {
  Plan(where: { recipient: { _eq: $recipient } }, order_by: { timestamp: desc }, limit: 50) {
    id planId sender recipient nowAmount growAmount growShares investAmount investOut
    usedFallback blockNumber timestamp txHash
  }
}
```

Positions for a beneficiary (locked first, then by unlock time):

```graphql
query Positions($beneficiary: String!) {
  Position(where: { beneficiary: { _eq: $beneficiary } }, order_by: [{ claimed: asc }, { unlockAt: asc }]) {
    id depositor beneficiary asset amount unlockAt lockedAt lockTxHash claimed claimedAt claimTxHash
  }
}
```

Recipient totals:

```graphql
query Totals($id: String!) {
  Recipient_by_pk(id: $id) {
    id totalNow totalGrowAmount totalGrowShares totalInvestAmount totalInvestOut planCount lastPlanAt
  }
}
```

Send these as POST `{ query, variables }` to the GraphQL endpoint. `BigInt` fields come back as numbers or strings
depending on size, so parse them with `BigInt(value)` in the client.
