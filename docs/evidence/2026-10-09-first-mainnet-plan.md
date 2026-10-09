# First mainnet plan, 2026-10-09

A single `PortionlySplitterV2.execute` call on Monad mainnet, sent from the deployer EOA with itself as recipient. This proves the deployed contracts route all three buckets atomically. It is not the Mera phone flow; that evidence is recorded separately.

- Approve 1.5 AUSD: `0xc74cf7f10dc8fb319c9930535957f747ec4fa52c350400af043ff9dce8ba05cc`
- Execute: `0x736d1934ca267e838e8f7ab42322a36877219ed7430a9ee25c87c213ad551ea4` (block 111992690, status 1, gas 1,045,413)
- Explorer: <https://monadscan.com/tx/0x736d1934ca267e838e8f7ab42322a36877219ed7430a9ee25c87c213ad551ea4>

Plan: Now 0.5 AUSD, Grow 0.5 AUSD (unlocked), Invest 0.5 AUSD with minimum 0.000666317888439684 aQQQ (97% of the live Uniswap v4 quote of 0.000686925658185242), fallback to Grow enabled.

`PlanExecuted` decoded from the receipt:

| Field | Value |
|---|---|
| nowAmount | 500000 (0.5 AUSD) |
| growAmount | 500000 (0.5 AUSD) |
| growShares | 477870 (0.47787 earnAUSD) |
| investAmount | 500000 (0.5 AUSD) |
| investOut | 686925658185242 (0.000686925658185242 aQQQ) |
| usedFallback | false |

Balances after the transaction:

| Holder | AUSD | earnAUSD | aQQQ |
|---|---|---|---|
| Splitter `0x28ac…dA1a` | 0 | 0 | 0 |
| Recipient `0x42e0…B7D2` | 4.052299 | 0.47787 | 0.000686925658185242 |

The Invest output equals the live quote exactly, and the splitter retains nothing.
