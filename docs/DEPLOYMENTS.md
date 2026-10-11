# Deployments

Monad mainnet, chain ID 143. Deployed 2026-10-09 by `0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2` from `contracts/script/DeployPortionly.s.sol`. Broadcast log: `contracts/broadcast/DeployPortionly.s.sol/143/run-latest.json`.

| Contract | Address | Deploy transaction |
|---|---|---|
| PortionlySplitterV2 | `0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a` | `0xc09240541a4d5cf07a4b067ced17391f9a43bf0b5d10fc8cf1f6f950227d3ca5` |
| PortionlyAqqqInvest | `0xe899fB7aD899d74b55b9a911D2d6DB6784d3c9db` | `0x891cc6c699466ba5f990f1b7df4e6aa7b77edfc95c9830db86eb4aa2c6a2b294` |
| PortionlyFuture | `0x816fd57253CD589B76cF24B8cA1Ba38bB7818E22` | `0xfc35e507862237bfe00ae158700f3b08ee54c73e0fdcee2a4b107a818487d0f6` |

None of the contracts has an owner, admin or upgrade path. The deployer keeps no control after deployment.

## Source

All four contracts are source verified on Sourcify (creation and runtime bytecode match):

| Contract | Verified source |
|---|---|
| PortionlySplitterV2 | <https://repo.sourcify.dev/143/0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a> |
| PortionlyAqqqInvest | <https://repo.sourcify.dev/143/0xe899fB7aD899d74b55b9a911D2d6DB6784d3c9db> |
| PortionlyFuture | <https://repo.sourcify.dev/143/0x816fd57253CD589B76cF24B8cA1Ba38bB7818E22> |
| PortionlyLink | <https://repo.sourcify.dev/143/0x67BCA6463B917940199c322C4b5678044936EdC7> |

`contracts/src/PortionlySplitter.sol` is an earlier version of the splitter. It was never deployed. It stays in the repository because the deployed contracts import their vault and lock interfaces from that file, and moving them would change the compiled metadata so the repository would no longer reproduce the verified bytecode.

## Verification

Runtime bytecode read with `cast code`:

- PortionlyAqqqInvest: keccak `0xa4adda6f674e5c4393c99a461ddc20444d19d5bc9e206ba139906d41cfd1057d`, identical to the local `forge build` output.
- PortionlyFuture: keccak `0xb6e50fafcc9d1897e8f87ed25652a6cf2715f4b5e57014429200a0e79ff07cf9`, identical to the local `forge build` output.
- PortionlySplitterV2 carries immutables, so it was checked by reading them:

| Immutable | Value |
|---|---|
| `ausd()` | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` (AUSD) |
| `vault()` | `0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA` (Upshift AUSD vault) |
| `vaultShare()` | `0x103222f020e98Bba0AD9809A011FDF8e6F067496` (earnAUSD, `vault.lpTokenAddress()`) |
| `future()` | `0x816fd57253CD589B76cF24B8cA1Ba38bB7818E22` |
| `investExecutor()` | `0xe899fB7aD899d74b55b9a911D2d6DB6784d3c9db` |

Explorer: <https://monadscan.com/address/0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a>

## PortionlyLink (send to a link)

Deployed 2026-10-10 by the same deployer from `contracts/script/DeployPortionlyLink.s.sol`.

| Contract | Address | Deploy transaction |
|---|---|---|
| PortionlyLink | `0x67BCA6463B917940199c322C4b5678044936EdC7` | `0x4bc947c4f5f43a782648c43867e107093466cc3f5b39049129b068e34fc8484f` |

No owner, admin or upgrade path. Immutables read back from the chain: `ausd()` is AUSD and `splitter()` is `0x28ac522B6224dBDAD523f3dBFa9D3a62d995dA1a`. Runtime bytecode keccak: `0x979b4de16bc3a17f7b8a445eb89c3b58abdef7a0fd67339e42c7e3eee742dd83`.
