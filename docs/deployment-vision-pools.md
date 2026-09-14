# VISION points — OVERP + empty Liquidity (mainnet)

Status as of 2026-09-14. OVERP and an empty farm contract are live on Ethereum, Base, and Robinhood. **No pools have been added yet.** Team / Ref create and join already work. Spoke OG merkle roots are set. Farming emissions start only after owner `add()`.

Canonical addresses: [`mainnet-deployment/overp-liquidity.json`](../mainnet-deployment/overp-liquidity.json).

Do **not** rerun [`scripts/utils/deployOverpEmptyLiquidity.ts`](../scripts/utils/deployOverpEmptyLiquidity.ts) on these networks (it deploys a second pair unless `FORCE_REDEPLOY=1`). Do **not** run [`scripts/utils/deployFarmingSeasonLiquidity.ts`](../scripts/utils/deployFarmingSeasonLiquidity.ts) for this go-live — that script deploys a **new** OVERP + Liquidity.

Owner / admin on all three: `0xABE9A7c88107C55283A211B847F747e26Edc09ED` (`OVERLAYER_HEAD_OP_KEY`).

---

## What is already done

Each chain has its own `OverlayerReferral` (ERC-20 name **OverlayerPoints**, symbol **OVERP**) and an empty `SingleStableStake` (Liquidity subclass, `poolLength == 0`). OVERP is not an OFT: deployments are independent per chain.

| Network   | Chain ID | OVERP                                                                                                                                    | Liquidity (`SingleStableStake`)                                                                                                          |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Ethereum  | 1        | [`0xe6bCa854B4da6F49BA6757C3C8F40468d9F7eE06`](https://etherscan.io/address/0xe6bCa854B4da6F49BA6757C3C8F40468d9F7eE06)                  | [`0x25A8f5100760d0F8b27C837F4D9743D9E3bE9fE5`](https://etherscan.io/address/0x25A8f5100760d0F8b27C837F4D9743D9E3bE9fE5)                  |
| Base      | 8453     | [`0xA7731Cd8309427Aa2C96f2b8BA6Dce9589bAFb76`](https://basescan.org/address/0xA7731Cd8309427Aa2C96f2b8BA6Dce9589bAFb76)                  | [`0x350aFD01A756D887cF3dc03Ae6Fa62626e1b961F`](https://basescan.org/address/0x350aFD01A756D887cF3dc03Ae6Fa62626e1b961F)                  |
| Robinhood | 4663     | [`0x4cA2c40e00BB5C5cE17A67Ee7CEd84b6a194F9EC`](https://robinhoodchain.blockscout.com/address/0x4cA2c40e00BB5C5cE17A67Ee7CEd84b6a194F9EC) | [`0x257F9Eb86aF07700354F9a139529DA64A2313c39`](https://robinhoodchain.blockscout.com/address/0x257F9Eb86aF07700354F9a139529DA64A2313c39) |

### OVERP wiring (already set)

| Call                           | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `setMinter(liquidity)`         | Farm can mint OVERP on harvest                                  |
| `setStakingPools([liquidity])` | Unlocks `consumeReferral` (Team / Ref join)                     |
| `addPointsTracker(liquidity)`  | Farm can `track()` referrer points                              |
| `setPointsMerkleRoot`          | **not set** (`pointsMerkleRoot == 0`) — Additional Points later |

### Liquidity wiring (already set)

| Call                                    | Eth                                                                                                                     | Base        | Robinhood   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| `updateReferral(OVERP)`                 | yes                                                                                                                     | yes         | yes         |
| `setOriginNfts(shrimp, dolphin, whale)` | live Origin                                                                                                             | live Origin | live Origin |
| `setOgNft(OverlayerOG)`                 | [`0xb0468b8b650D5A3DDf0f96BD1AD8a9A6c4c02183`](https://etherscan.io/address/0xb0468b8b650D5A3DDf0f96BD1AD8a9A6c4c02183) | skip        | skip        |
| `setOgMerkleRoot`                       | skip (`balanceOf` on Eth OG)                                                                                            | set         | set         |
| Referral bonus config                   | constructor defaults                                                                                                    | same        | same        |
| Pools / reward rate / start-end         | **not set**                                                                                                             | **not set** | **not set** |

Constructor bonus defaults (denom 1000): Team 5% / 2.5% self, Ref 10% / 2.5% self. OG holder boost is +2.5% (`25/1000`) when OG is recognized.

Origin collections already pointed at Liquidity:

|           | Shrimp                                       | Dolphin                                      | Whale                                        |
| --------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Eth       | `0x0bEd281BdFc7Bf127cadCa5F77e05b20cFb4E100` | `0x92df135c27aB5A2080F5cbcBB0A693C07A283e9C` | `0x8D6EFCE9B824E748aBfec8cd66B32fc070a5f7cB` |
| Base      | `0x03F82aeA7291c9919e911c194889fb65b4C75fF4` | `0x9C79D81D10633b3064c7195Da383c011Efc62272` | `0x2380B05E26E67A9ECb2B51DF9881556C67D62Edd` |
| Robinhood | `0xB17EE7D061e076ff1aD6bd2141888CFb39C0Ccdc` | `0x143ec4D2Beddf44679C52639D720afAeD78eD83b` | `0x8aC6AD5D76D07B202832f323888B64286E944A9e` |

`constructorStartTime` is deploy-now (already in the past). That is fine: when you later `add()`, each pool’s `lastRewardTime` becomes `max(block.timestamp, startTime)` = now, unless you first move `startTime` into the future.

Users can already create Team / Ref codes (`addCodeSelf`) and join (`consumeReferral`). Teams start **closed** (owner must whitelist or `setTeamOpen(true)`).

---

## How to submit the pools

Add farms on the **existing** Liquidity address. Owner-only. Same sequence on each chain.

### 1. Decide start, end, rate, assets

- **Start (contract-wide):** `Liquidity.startTime`. If farming should begin as soon as users deposit after `add()`, leave it. If start must be a future unix time, call `updateStartTime(unix)` **before** `add()`. The new start must be `>= block.timestamp`.
- **End (per pool):** `endTime` argument on `add()`. `0` means no end (not allowed if `vested == true`).
- **Vested:** if `true`, harvest / withdraw wait until that pool’s `endTime`.
- **Staked asset:** 18-decimal ERC-20. `SingleStableStake` treats TVL in 18-decimal units (`< 1 ether` TVL emits 0). Do not add 6-decimal stables without a wrapper.
- **Reward asset:** this chain’s OVERP.
- **Rate:** `setRewardForStakedAssets(OVERP, num, den)` is a **per-year** TVL multiplier: `staked * num / den / secondsInYear` per second, then split across pools by `allocPoints / totalAllocPoints`.
  - Testnet target was 5 OVERP per 1000 staked per day = `1825 / 1000` per year (`5 * 365`).
  - If **N** pools share one contract with **equal** `allocPoints`, set `num = N * perPoolNum` so alloc dilution does not cut each pool’s rate. Example: 2 equal pools at 5 OVERP / 1000 / day → `3650 / 1000`.

### 2. Activate OVERP as the farm reward (once per chain)

```text
liquidity.setRewardForStakedAssets(OVERP, num, den)
```

This also marks OVERP as an active reward. `add()` reverts (`InvactiveReward`) if you skip this.

### 3. Add each pool

```text
liquidity.add(
  stakedAsset,   // IERC20, unique per Liquidity (cannot reuse the same asset)
  OVERP,         // reward
  allocPoints,   // weight vs other pools; use 1 if equal
  endTime,       // unix seconds; 0 = no end (forbidden if vested)
  vested,        // bool
  true           // update: mass-update existing pools first
)
```

`pid` is the insertion index (`0 .. N-1`). The same staked asset cannot be added twice on one Liquidity.

Suggested owner order per chain:

1. Optional `updateStartTime(futureUnix)`
2. `setRewardForStakedAssets(OVERP, num, den)`
3. `add(...)` for each farm (T+, C+, …)

Helpers already in [`scripts/functions.ts`](../scripts/functions.ts): `SingleStableStake_setRewardForStakedAssets`, `SingleStableStake_addPool`. There is no dedicated “add pools to existing mainnet Liquidity” script yet — do not reuse `deployFarmingSeasonLiquidity.ts`.

### 4. Confirm after `add()`

On each Liquidity:

- `poolLength() == N`
- `poolInfo(pid)`: `stakedAsset`, `rewardAsset == OVERP`, `endTimeStamp`, `vesting`
- `startTime` is the intended global start
- `rewardsPerYearMultiplierNum/Den(OVERP)` match the chosen rate
- OVERP still has `minter(liquidity) == true`, `allowedPointsTrackers(liquidity) == true`, `getStakingPools() == [liquidity]`

Record each farm under `networks.<name>.farms` in `mainnet-deployment/overp-liquidity.json` (`key`, `stakedAsset`, `pid`, `startTime`, `endTime`).

---

## Config to take care of after the pools exist

These are **not** required for `add()` itself. Do them when farming should actually pay the right bonuses / extra streams.

### Must-have for farm go-live (spokes)

**OG on Base and Robinhood — done 2026-09-14.** Eth uses `setOgNft(OverlayerOG)` + `balanceOf`. Spokes use a Merkle root of the **fixed Eth OG holder set**. The snapshot reads live Ethereum `ownerOf` for token IDs `1 .. nextTokenId-1` on OverlayerOG (`0xb0468b8b650D5A3DDf0f96BD1AD8a9A6c4c02183`). OG is mint-only / non-transferable, so that holder set is the current owners.

- Snapshot: 373 tokens, 373 unique holders — [`mainnet-deployment/overlayer-og/og-holders-eth-1.txt`](../mainnet-deployment/overlayer-og/og-holders-eth-1.txt)
- Root: `0xa473b1a36ac45141529364f3e8b850f87c307e3780c0d0339ee79cc656332d7d`
- Base Liquidity [`0x350aFD01A756D887cF3dc03Ae6Fa62626e1b961F`](https://basescan.org/tx/0x1801729fd1e77c9a44fc38181e85d7e817a7b3ab4152995ebf0157f9ccebafd8) (`setMerkleRoot`, block 51309889)
- Robinhood Liquidity [`0x257F9Eb86aF07700354F9a139529DA64A2313c39`](https://robinhoodchain.blockscout.com/tx/0xc48d1b1282ff81a3b73e1ff810d90add8dcf571b8ff92f69cbf46059fc983a88) (`setMerkleRoot`, block 63006649)
- Proofs: [`merkle-base-8453-…`](../mainnet-deployment/overlayer-og-entitlement/merkle-base-8453-2026-09-14T18-05-25-197Z.json), [`merkle-robinhood-4663-…`](../mainnet-deployment/overlayer-og-entitlement/merkle-robinhood-4663-2026-09-14T18-05-24-553Z.json)

Commands used (do not rerun unless replacing the root):

```bash
OG_NFT_ADDRESS=0xb0468b8b650D5A3DDf0f96BD1AD8a9A6c4c02183 \
OG_HOLDER_SNAPSHOT_OUTPUT_PATH=./deployments/overlayer-og/og-holders.txt \
npx hardhat run scripts/utils/snapshotOverlayerOGHolders.ts --network eth
```

```bash
OG_ENTITLEMENT_WHITELIST_FILE=./deployments/overlayer-og/og-holders.txt \
OG_LIQUIDITY_ADDRESS=0x350aFD01A756D887cF3dc03Ae6Fa62626e1b961F \
npx hardhat run scripts/utils/configureOverlayerOGEntitlementMerkleRoot.ts --network base
```

```bash
OG_ENTITLEMENT_WHITELIST_FILE=./deployments/overlayer-og/og-holders.txt \
OG_LIQUIDITY_ADDRESS=0x257F9Eb86aF07700354F9a139529DA64A2313c39 \
npx hardhat run scripts/utils/configureOverlayerOGEntitlementMerkleRoot.ts --network robinhood
```

The first farm tx that includes a valid proof (`deposit` / `harvest` / `withdraw` / NFT stake) sets `ogActivated[user]`. Users do not send a separate claim. Frontend must attach the proof on that first spoke interaction.

### OVERP `pointsMerkleRoot` (Additional Points)

Liquidity has **only** `ogMerkleRoot` (above). The other Merkle root in this stack is on **OVERP**: `pointsMerkleRoot`, owner-set via `setPointsMerkleRoot`. It is unset today (`bytes32(0)` disables claims).

Use it for off-chain Additional Points (Galxe, events, …). Leaf is **not** the same as OG / Origin:

```text
pointsMerkleLeaf(account, amount) =
  keccak256(bytes.concat(keccak256(abi.encode(account, amount))))
```

OG / Origin leaf is address-only (`keccak256(keccak256(abi.encode(account)))`). Do not reuse an OG tree here.

- User claims with `claimPoints(amount, proof)` — mints `amount` OVERP to the caller. One claim per account **per root**.
- Replacing the root starts a new campaign; `hasClaimedPoints` is tracked per root, so a new root lets the same address claim again.
- Setting the root to `0` disables further claims.
- **Minting OVERP (including this claim) makes the caller ineligible to consume a Ref code.** Team join is unaffected. Do not run a points campaign until you are willing to freeze Ref binds for those claimants.
- Cap Additional Points off-chain (product: ≤5% of total production). There is no on-chain cap.
- Set independently per chain (OVERP is not bridged).

Script: [`scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts`](../scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts). Input is `address,amount` (amount = integer wei string).

```bash
OVERLAYER_REFERRAL_POINTS_FILE=./points.csv \
OVERLAYER_REFERRAL_ADDRESS=0xe6bCa854B4da6F49BA6757C3C8F40468d9F7eE06 \
npx hardhat run scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts --network eth
```

```bash
OVERLAYER_REFERRAL_POINTS_FILE=./points.csv \
OVERLAYER_REFERRAL_ADDRESS=0xA7731Cd8309427Aa2C96f2b8BA6Dce9589bAFb76 \
npx hardhat run scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts --network base
```

```bash
OVERLAYER_REFERRAL_POINTS_FILE=./points.csv \
OVERLAYER_REFERRAL_ADDRESS=0x4cA2c40e00BB5C5cE17A67Ee7CEd84b6a194F9EC \
npx hardhat run scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts --network robinhood
```

Dry run: `OVERLAYER_REFERRAL_POINTS_DRY_RUN=true`. Frontend needs the generated proof manifest for `claimPoints`.

### Optional / later owner config

| Config                                                  | Contract  | When                                                                            |
| ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `updateReferralBonusConfig(type, referrerBps, selfBps)` | Liquidity | Only if leaving constructor 50/25 (Team) and 100/25 (Ref) is wrong. Denom 1000. |
| `setPoolAllocPoints(pid, points)`                       | Liquidity | Reweight farms after they exist (mass-updates).                                 |
| `setRewardForStakedAssets` again                        | Liquidity | Change the yearly TVL rate; call after pools exist is OK (`_massUpdatePools`).  |
| `setWhitelistedNft(collection, true)`                   | Liquidity | Special / partner NFT boost (max 1 Special staked per wallet).                  |
| `setOriginNftsUpgraded(shrimp, dolphin, whale)`         | Liquidity | Entropy / upgraded Origin slots (leave `address(0)` until those NFTs exist).    |
| `setPointsMerkleRoot(root)`                             | OVERP     | Additional Points — see above. Not a Liquidity root.                            |
| `updateMultiplier`                                      | Liquidity | Global bonus multiplier (defaults to 1). Rarely needed.                         |

### Product / frontend after pools

- Point the app at the **existing** OVERP + Liquidity addresses above (per chain). OVERP is not bridged.
- Deposit / harvest / withdraw / Origin-stake flows against Liquidity.
- Spoke OG: attach Merkle proof on the user’s first farm tx after `setOgMerkleRoot`.
- Team UX: codes start closed; team owner whitelist or open. Ref: consumer must have zero OVERP and no deposits.
- OVERP Additional Points: `claimPoints` + per-chain `pointsMerkleRoot` proofs. Claiming blocks Ref consume for that wallet.

### Out of scope for pool submit

Season-end OVER settlement, claim options, leaderboard / VRF, and Entropy mint/burn are separate work. They do not block adding pools.

---

## Checklist

**Already done**

- [x] OVERP + empty `SingleStableStake` on eth / base / robinhood
- [x] OVERP `setMinter` / `setStakingPools` / `addPointsTracker`
- [x] Liquidity `updateReferral` + Origin NFTs
- [x] Eth `setOgNft`
- [x] Base + Robinhood `setOgMerkleRoot` from Eth OG `ownerOf` snapshot (373 holders)
- [x] Team / Ref create + join live

**When submitting pools**

- [ ] Choose per-chain staked assets (18 decimals), `endTime`, optional future `startTime`, `vested`, `allocPoints`
- [ ] Choose yearly rate; if N equal pools, use `N ×` per-pool `num`
- [ ] `setRewardForStakedAssets(OVERP, num, den)` then `add(...)` on each **existing** Liquidity
- [ ] Verify `poolLength`, `poolInfo`, rate, and OVERP wiring
- [ ] Update `mainnet-deployment/overp-liquidity.json` `farms`

**After pools (go-live extras)**

- [x] `setOgMerkleRoot` on Base + Robinhood from Eth OG holder snapshot
- [ ] Frontend: addresses, first-tx OG proof on spokes
- [ ] `setPointsMerkleRoot` on each OVERP when an Additional Points campaign is ready (per-chain; blocks Ref for claimants)
- [ ] Specials / Entropy only when those collections are ready
