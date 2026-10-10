# A payment sent to a link, 2026-10-10

Proves that someone with no account, no address to share and no fee coin can receive a portioned payment. Run on Monad mainnet against the deployed `PortionlyLink` (`0x67BCA6463B917940199c322C4b5678044936EdC7`).

1. The sender made a one time key. Its address, `0xDB1E06db21819AfC3368b556c3dA90C916622D39`, is the link.
2. Approve 0.30 AUSD: `0x12a7849d7140809e00832a2a5a2f99ed506ec7cffbd184ab78cf355181d5aa30`
3. Create the link payment (0.15 home now, 0.09 savings, 0.06 stocks): `0x830cab38d8df9aedea19d2b92e17c7440bec133e05743b2c77f5b1b871d09813`
4. Give the link 0.5 MON to pay its own network fee: `0xebd5f926f3c7e52ecede9b417a3201c3a9b62b4db6ad75ea5612cc8990269c51`
5. The link key claimed, naming the recipient `0x090751B927929872b16f6078492c5585A2e8D830` and a minimum of 97% of the live stock quote: `0x6093d475135861689cc076fa0936e0e497a666db3d6acca7f5cdbd2a27eca9e3`
6. The link sent its leftover 0.358 MON to the recipient as their first fee balance: `0x06ac82b7c7ce1376a51f6b8fb4d3fc9fa4318dc8ea8c06bede026d70a28a8f0e`

The claim cost about 0.11 MON. The recipient signed nothing with their own account and held no MON beforehand.

The link key is a bearer secret: whoever holds the link can claim. The sender can cancel and be refunded at any time before the claim (`contracts/test/PortionlyLink.t.sol`).
