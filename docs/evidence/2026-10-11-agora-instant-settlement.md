# A transfer settled through Agora Instant Settlement, 2026-10-11

Agora's bounty asks for the transfer itself to use instant settlement, with fund movements run through the Instant Settlement contract on Monad testnet. This run used the app's own code (`app/src/agora.ts`, `app/src/agoraNetwork.ts`) and the same Mera signing session the phone uses, from a fresh account on Monad testnet (chain 10143).

- Sender: `0xDab462a06eF36fE7941C140feB094e5BC0B15D3b`
- Recipient: `0x090751B927929872b16f6078492c5585A2e8D830` (the phone's passkey account)
- Instant Settlement pair (CTK/AUSD): `0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae`
- Test AUSD: `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`

| Step | Transaction |
|---|---|
| Test dollars from Agora's faucet (10,000 AUSD) | `0xaf27e0b92aa33a9c880da0da51bd91dd7a6c5e194335fc392dc7d976f5c0d273` |
| Turn on instant settle (Agora's published whitelister, once per account) | `0xdcdabecf64a46d537ff0b9225c2002d381129872a70fa19b1d82cec040305d46` |
| Approve exactly 5 AUSD to the pair | `0x26529a1bc4d732a35be6e60cac9b735013bf5720ff0cf9deac5366316136762c` |
| Settle: `swapExactTokensForTokens`, paid out to the recipient | `0xedac48c9334840def59d15442402b4991d22a347f0035b0420ddd6106a5ec155` |

Result: the sender's AUSD fell by exactly 5.000000 and the recipient received exactly 5.000000000000000000 of the settled token, the fixed price quote from `getAmountsOut`. All three settlement steps together took about 5 seconds.

Explorer: <https://testnet.monadvision.com/tx/0xedac48c9334840def59d15442402b4991d22a347f0035b0420ddd6106a5ec155>

Why testnet: on mainnet the pair accepts only swappers Agora has verified. The rest of Portionly (the split, savings, stocks, links) runs on mainnet with real funds.

The app also reads Agora's public API (`GET https://api.agora.finance/v0/metrics`) for AUSD in circulation on Monad. The account, route and transaction endpoints need a verified business session and are not called.

## From the phone

The same flow was then run on a physical Android phone from the passkey account `0x090751B927929872b16f6078492c5585A2e8D830`: test dollars from the faucet, instant settle turned on, then two settlements (500 and 1,000 test dollars) to two saved people. The account's test AUSD balance read 8,500 afterwards, 10,000 less the two payments. The app measured 0.3 seconds from sending the settlement to its receipt.
