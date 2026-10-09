# First plan signed on a phone with a Mera passkey, 2026-10-09

Physical Android phone, Portionly APK built on EAS (`com.portionly.app`, signed by the xtrabees-team keystore, SHA-256 `05:43:2F:...:6E:46`). The passkey was created against the relying party `portionly-three.vercel.app`, which serves the matching Digital Asset Links file. No seed phrase, no extension.

- Sender (Mera account, index 0): `0x090751B927929872b16f6078492c5585A2e8D830`
- Recipient: `0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2`
- Approve: `0x1e2f100e5260fdd372079c17e5ac264070b70bdc257b580abc22b3feadfd6b23`
- Execute: `0x3dce58f65bf4d56504f9dbb3607bc52a02298754890e6572a0e6f4dc3fa5bbf9` (block 112007222, status 1)
- Explorer: <https://monadscan.com/tx/0x3dce58f65bf4d56504f9dbb3607bc52a02298754890e6572a0e6f4dc3fa5bbf9>

`PlanExecuted`: Now 0.5 AUSD, Grow 0.3 AUSD into 0.286722 earnAUSD, Invest 0.2 AUSD into 0.000274763006764655 aQQQ (the live quote shown on the review screen), no fallback. The app's own post-checks (sender delta, recipient Now, Grow shares, Invest minimum, splitter retained nothing) passed before it showed "Allocation verified".

The first attempt on the same phone stopped before signing because the app read Grow shares from the vault address; fixed in the commit "app: read Grow shares from earnAUSD, not the Upshift vault". No funds moved on that attempt (sender nonce stayed 0).
