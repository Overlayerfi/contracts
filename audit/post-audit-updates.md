# Post-audit updates

Tracking for `deploy/mainnet` after the [Overlayer SC DualDefense Audit](https://hackenproof.com/audit-programs/overlayer-sc-dualdefense-audit) on HackenProof. The fix commit given for that program is `544401733f3c84f3efcbe061b189cb651c156261`. This note checks whether later commits change the contracts that were in scope.

## Program

| | |
| --- | --- |
| Program | Overlayer SC DualDefense Audit (HackenProof) |
| URL | https://hackenproof.com/audit-programs/overlayer-sc-dualdefense-audit |
| Contest window | 27 Mar 2026 – 10 Apr 2026 (ended) |
| Scope commit | `519c9e92fd9d80d11e35e9868130f6334b88d676` (2026-03-11, Reverted try-catch for compounding), linked from the program as `github.com/Overlayerfi/contracts/tree/519c9e92fd9d80d11e35e9868130f6334b88d676` |
| Fix commit | `544401733f3c84f3efcbe061b189cb651c156261` (2026-05-12, Enhance transfer restrictions in `StakedOverlayerWrapCore`) |
| Same snapshot on this branch | `61d78cc413ac8825056a1415c30a1ef19bd79d24` (identical tree `eeed22ddc33f64f3cdafe2ce177cd97ba1c87590`) |
| Branch HEAD | `34c47f1e9c2b221398e69283d06ee992b7e728c9` |
| Commits after the fix | `61d78cc..HEAD` (32 commits, parent order) |

`5444017` is on `origin/main`. This branch replays that snapshot as `61d78cc` with the same tree, then adds the commits below.

## In-scope assets

These are the files listed under Assets in Scope on the program page.

| In-scope file | Scope commit → fix commit | Fix commit → HEAD |
| --- | --- | --- |
| `contracts/overlayer/OverlayerWrapCore.sol` | changed in `f81da74` (satellite-chain accounting) | unchanged |
| `contracts/overlayerbacking/AaveHandler.sol` | changed in `8d062bd` (admin withdraw residual) and `8df455e` (underflow when OW supply is below supplied collateral) | changed in `a87c8bc`: `adminWithdraw` transfers `min(aToken balance, principal)` so a 1-unit Aave rounding shortfall does not revert, still clears the full principal from the tracker |
| `contracts/overlayer/StakedOverlayerWrapCore.sol` | changed in `16f2dad` (OW blacklist check on vault withdraw) and `5444017` (transfer restrictions) | formatting only in `23eb2ba`: the blacklist `hasRole` call is rewrapped, same call |
| `contracts/overlayer/StakedOverlayerWrap.sol` | unchanged | unchanged |
| `contracts/overlayer/OverlayerWrap.sol` | unchanged | unchanged |
| `contracts/overlayer/CollateralSpenderManager.sol` | unchanged | unchanged |
| `contracts/shared/SingleAdminAccessControl.sol` | unchanged | unchanged |
| `contracts/overlayerbacking/OverlayerBacking.sol` | unchanged | unchanged |
| `contracts/overlayer/OverlayerWrapCollateral.sol` | unchanged | unchanged |
| `contracts/overlayer/interfaces/IOverlayerWrapDefs.sol` | unchanged | unchanged |
| `contracts/overlayer/types/OverlayerWrapCoreTypes.sol` | unchanged | unchanged |

From the fix commit to HEAD, every in-scope file is byte-identical except `StakedOverlayerWrapCore.sol` (Prettier rewrap above) and `AaveHandler.sol` (`adminWithdraw` rounding tolerance in `a87c8bc`).

Referral, Origin NFT, OG, and GHO/sGHO backing contracts added or edited after the fix commit are outside this program's asset list. They are named in the commit table when a commit touches them.

## Commits after the fix commit

One row per commit on `61d78cc..HEAD`. "In-scope files changed" lists only the DualDefense assets above.

| Commit | Date | What changed | In-scope files changed |
| --- | --- | --- | --- |
| `23eb2ba` | 2026-05-16 | Update setup adds `check-dependency-publish-age.mjs`, updates `.gitignore` and `setup.sh`, adjusts `test/OverlayerWrapBacking.ts`, and rewraps the blacklist `hasRole` call in `contracts/overlayer/StakedOverlayerWrapCore.sol` with no logic change. | `contracts/overlayer/StakedOverlayerWrapCore.sol` (formatting only) |
| `2c4dfe6` | 2026-06-08 | Refactor CI workflow to streamline pull request triggers updates `.github/workflows/CI.yml` only. | none |
| `66a0c80` | 2026-06-09 | Renamed Overlayer referral contract replaces `OvaReferral.sol` and `interfaces/IOvaReferral.sol` with `OverlayerReferral.sol` and `interfaces/IOverlayerReferral.sol` (token name/symbol `Airdrop Overlayer` / `AOVER`, empty-code revert on `addCode` and `addCodeSelf`) and updates the referral call sites in `contracts/liquidity/Liquidity.sol`, `contracts/liquidity/interfaces/ILiquidityDefs.sol`, `contracts/uniswap/UniswapV3StakerFront.sol`, `hardhat.config.ts`, `scripts/config/airdropliquidity.config.json`, `scripts/functions.ts`, `scripts/uniswap_staker/proxy.ts`, `scripts/utils/deployAllLocalFork.ts`, `scripts/utils/deployAllSepolia.ts`, the renamed `scripts/OverlayerReferral/*` and `scripts/utils/overlayerReferralActions.ts`, and the referral tests (`test/CurveStableStake.ts`, `test/Liquidity.ts`, `test/OvaAmbassadorTracker.ts`, `test/OverlayerReferral.ts`, `test/OverlayerReferral_integration.ts`, `test/SingleStableStake.ts`, `test/UniV3StakerFront.ts`). | none |
| `17c478b` | 2026-07-11 | Add and harden mainnet OFT post-config script updates `hardhat.config.ts`, `package.json`, `scripts/addresses.ts`, `scripts/constants.ts`, `scripts/functions.ts`, `scripts/utils/postConfigureSepoliaOftFromOmnichainDeployments.ts`, and adds `mainnet-deployment/mainnet-omnichain-manifest.json` and `scripts/utils/postConfigureMainnetOftFromOmnichainDeployments.ts`. | none |
| `acb64ef` | 2026-07-29 | Origin NFT adds `OverlayerOG.sol`, `OverlayerOriginDolphin.sol`, `OverlayerOriginNFT.sol`, `OverlayerOriginShrimp.sol`, and `OverlayerOriginWhale.sol` plus `contracts/test/OverlayerOriginNFTMock.sol`, origin deploy records under `mainnet-deployment/origin/`, `scripts/utils/batchWhitelistWhaleFreeMints.ts`, `scripts/utils/configureOverlayerOriginMerkleRoot.ts`, `scripts/utils/deployOverlayerOriginNfts.ts`, `scripts/utils/verifyOverlayerOriginMerkleRoot.ts`, `test/OverlayerOG.ts`, and `test/OverlayerOriginNFT.ts`, and updates `hardhat.config.ts`, `rpc.ts`, and `scripts/functions.ts` (also deletes `deployments/eth-sep-eurs.txt`). | none |
| `e10ba4b` | 2026-07-31 | Add Multicall3 script to compound all mainnet backings adds `scripts/utils/compoundAllBackings.ts` and a `package.json` script; backing contract source is untouched. | none |
| `3742af4` | 2026-08-01 | Nft adds `contracts/overlayer/OverlayerOriginShrimpRobinHood.sol` and `scripts/utils/deployOverlayerOriginNftsRobinhood.ts`, and updates `hardhat.config.ts` and `rpc.ts`. | none |
| `ae22331` | 2026-08-08 | Add NFT staking bonuses to Liquidity updates `contracts/liquidity/Liquidity.sol`, `contracts/liquidity/interfaces/ILiquidityDefs.sol`, and `test/Liquidity.ts`, and adds `contracts/liquidity/interfaces/IBonusNFT.sol` and `contracts/test/BonusNFTMock.sol`. | none |
| `c9d88ff` | 2026-08-09 | Add Team/Ref typed referrals, team access control, and Merkle OVERP claims changes `OverlayerReferral.sol` and `interfaces/IOverlayerReferral.sol` (Team/Ref types, team whitelist, Merkle point claims, non-transferable token) and `OverlayerOG.sol`, and updates `contracts/liquidity/Liquidity.sol`, `contracts/liquidity/interfaces/ILiquidityDefs.sol`, `scripts/config/airdropliquidity.config.json`, `scripts/functions.ts`, `scripts/utils/compoundAllBackings.ts`, `scripts/utils/deployOverlayerOriginNftsRobinhood.ts`, `scripts/utils/overlayerReferralActions.ts`, and the Curve, Liquidity, OG, referral, and SingleStableStake tests, while adding `mainnet-deployment/farming-season-contract-status.md`, `scripts/OverlayerReferral/batchSetTeamWhitelist.ts`, `scripts/OverlayerReferral/canJoinTeam.ts`, `scripts/OverlayerReferral/getTeamDashboard.ts`, `scripts/OverlayerReferral/setTeamOpen.ts`, `scripts/OverlayerReferral/setTeamWhitelist.ts`, `scripts/config/farming-season-liquidity.config.json`, `scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts`, `scripts/utils/deployFarmingSeasonLiquidity.ts`, `scripts/utils/deployMockOriginNfts.tmp.ts`, and `testnet-deployments/liquidity.json` plus `testnet-deployments/mock-origin-nfts.json`. | none |
| `70929eb` | 2026-08-09 | Add mock OG NFT to testnet manifests and deploy scripts adds `scripts/utils/deployMockOgNft.tmp.ts` and updates `scripts/utils/deployMockOriginNfts.tmp.ts`, `testnet-deployments/liquidity.json`, and `testnet-deployments/mock-origin-nfts.json`. | none |
| `887a314` | 2026-08-09 | Deploy one Liquidity with T+/C+ pools so NFT stake applies once updates `scripts/config/farming-season-liquidity.config.json`, `scripts/utils/deployFarmingSeasonLiquidity.ts`, and `testnet-deployments/liquidity.json`. | none |
| `ac3f18d` | 2026-08-09 | Merge branch `feat/shared-liquidity-multi-pool` (`887a314`) into `deploy/mainnet` with no file changes of its own. | none |
| `7a06973` | 2026-08-12 | Give OG a 14-day 0.005 ETH Merkle mint and a separate free-mint Merkle root updates `contracts/overlayer/OverlayerOG.sol` and `test/OverlayerOG.ts`, and adds `scripts/utils/configureOverlayerOGMerkleRoot.ts`. | none |
| `ff1a772` | 2026-08-12 | Track cumulative NFT and self-referral boost points on Liquidity updates `contracts/liquidity/Liquidity.sol`, `contracts/liquidity/interfaces/ILiquidityDefs.sol`, and `test/Liquidity.ts`, and deletes `scripts/utils/deployMockOgNft.tmp.ts` and `scripts/utils/deployMockOriginNfts.tmp.ts`. | none |
| `38bcdb6` | 2026-08-12 | Record Robinhood Origin NFT deployment and update testnet OG entitlement adds `mainnet-deployment/origin/robinhood-4663-2026-08-01T20-07-05-354Z.json` and updates `testnet-deployments/liquidity.json`. | none |
| `253978c` | 2026-08-16 | Deploy Overlayer OG on Ethereum and configure Merkle roots adds `deployments/overlayer-og/eth-1-2026-08-16T19-28-49-368Z.json`, `deployments/overlayer-og/merkle-free-eth-1-2026-08-16T19-37-02-098Z.json`, `deployments/overlayer-og/merkle-paid-eth-1-2026-08-16T19-40-26-018Z.json`, `scripts/utils/deployOriginOg.sh`, and `scripts/utils/deployOverlayerOG.ts`, and updates `scripts/utils/deployOverlayerOriginNftsRobinhood.ts`. | none |
| `ed4fd33` | 2026-08-17 | Record Origin NFT and OG baseURI updates to the api-nft host moves the OG deployment records from `deployments/overlayer-og/` to `mainnet-deployment/overlayer-og/` and updates `mainnet-deployment/origin/robinhood-4663-2026-08-01T20-07-05-354Z.json` and `scripts/utils/deployOverlayerOriginNftsRobinhood.ts`. | none |
| `0a0cb58` | 2026-08-31 | Record OG merkle roots after free and paid wallet-switch updates adds `mainnet-deployment/overlayer-og/merkle-free-eth-1-2026-08-31T10-41-37-127Z.json` and `mainnet-deployment/overlayer-og/merkle-paid-eth-1-2026-08-31T10-41-25-130Z.json`. | none |
| `b69c93b` | 2026-08-31 | Merge branch `feat/og-wallet-switch-merkle` (`0a0cb58`) into `deploy/mainnet` with no file changes of its own. | none |
| `5e82c67` | 2026-09-04 | Record Origin Safe NFT transfers, Seaport listings, and royalties, and refresh OG merkle roots adds the Safe transfer, Seaport listing, and royalty JSON files under `mainnet-deployment/origin/`, replaces the 2026-08-16 OG Merkle snapshots with `merkle-free-eth-1-2026-08-23T11-17-36-898Z.json` and `merkle-paid-eth-1-2026-08-23T11-16-38-359Z.json`, and updates `hardhat.config.ts`, `scripts/utils/deployOriginOg.sh`, and `scripts/utils/deployOverlayerOG.ts`. | none |
| `d029a2a` | 2026-09-04 | Merge branch `feat/origin-safe-listings-and-og-merkle` (`5e82c67`) into `deploy/mainnet` with no file changes of its own. | none |
| `8a8fe14` | 2026-09-05 | Activate spoke OG from a holder Merkle proof on the first farm tx updates `contracts/liquidity/Liquidity.sol`, `contracts/liquidity/interfaces/ILiquidityDefs.sol`, `contracts/overlayer/OverlayerOG.sol`, `hardhat.config.ts`, `mainnet-deployment/farming-season-contract-status.md`, `scripts/utils/deployOverlayerOG.ts`, `scripts/utils/deployOverlayerOriginNftsRobinhood.ts`, `test/Liquidity.ts`, and `testnet-deployments/liquidity.json`, and adds `scripts/utils/configureOverlayerOGEntitlementMerkleRoot.ts` and `scripts/utils/snapshotOverlayerOGHolders.ts`. | none |
| `085c4f8` | 2026-09-05 | Sign Dolphin price-tier minters locally so the test works against localhost updates `test/OverlayerOriginNFT.ts` only. | none |
| `f11d253` | 2026-09-13 | Deploy OVERP with empty Liquidity on eth, base, and Robinhood adds `docs/deployment-vision-pools.md`, `mainnet-deployment/overp-liquidity.json`, `scripts/config/overp-empty-liquidity.config.json`, `scripts/utils/deployOverpEmptyLiquidity.sh`, and `scripts/utils/deployOverpEmptyLiquidity.ts`. | none |
| `69a34e5` | 2026-09-13 | Ignore local Cursor skills and `.secrets` updates `.gitignore` only. | none |
| `39404a2` | 2026-09-14 | Snapshot Eth OG holders and set the spoke Liquidity merkle roots updates `docs/deployment-vision-pools.md` and `mainnet-deployment/overp-liquidity.json`, and adds `mainnet-deployment/overlayer-og-entitlement/merkle-base-8453-2026-09-14T18-05-25-197Z.json`, `mainnet-deployment/overlayer-og-entitlement/merkle-robinhood-4663-2026-09-14T18-05-24-553Z.json`, and `mainnet-deployment/overlayer-og/og-holders-eth-1.txt`. | none |
| `aa4cb3a` | 2026-09-14 | Merge branch `feat/og-spoke-merkle-root` (`39404a2`) into `deploy/mainnet` with no file changes of its own. | none |
| `93a86ee` | 2026-09-22 | Record DualDefense in-scope files after the HackenProof fix commit adds `audit/post-audit-updates.md`. | none |
| `dda6020` | 2026-09-22 | Record Robinhood T+ and G+ OFT addresses in the mainnet manifest updates `mainnet-deployment/mainnet-omnichain-manifest.json` only. | none |
| `99d25a9` | 2026-09-23 | Remove contracts the mainnet tests do not use deletes ambassador, curve, faucet, lottery, uniswap, whitelist, wrap-factory, deprecated PositionSwapper, and related scripts/tests; restores `OverlayerOriginShrimpRobinHood.sol`; updates `hardhat.config.ts`, `scripts/functions.ts`, and `scripts/uniswap_swapper/proxy.ts` so fork swaps call SwapRouter02 directly. | none |
| `a87c8bc` | 2026-09-23 | Back O-GHO with sGHO and an idle GHO reserve adds `GhoSghoHandler.sol`, `OverlayerWrapGhoBacking.sol`, `GhoExcludedCollateral.sol`, and `MockSghoVault.sol`, plus GHO post-config/tests; changes in-scope `AaveHandler.sol` so `adminWithdraw` tolerates a 1-unit Aave aToken rounding shortfall; updates CI, Hardhat fork block, addresses, and mainnet/sepolia post-config scripts. Audited wrap contracts stay unchanged (zero-supply aCollateral keeps sGHO off the O-GHO mint path). | `contracts/overlayerbacking/AaveHandler.sol` |
| `34c47f1` | 2026-09-25 | Defer the GhoSghoHandler harvest and make adminWithdraw partial updates `contracts/overlayerbacking/GhoSghoHandler.sol` and its unit/integration tests, and `.gitignore`. | none |
