# Farming Season — Smart Contract Status

Tracking doc for contract-level work implied by `Farming_Season_faithful.md`, against `contracts-core`.

Refer to items by **ID** (e.g. `FS-12`, `FS-C03`, `FS-S01`).

**Assumptions**

- Liquidity / SingleStableStake / CurveStableStake / OverlayerReferral are **immutable deploys** (no proxy). Logic changes after go-live require redeploy + migration.
- **OVER** token is deployed later (TGE / season end).
- **Airdrop reads OVERP balance** — continuous OVERP mint during farming is the intentional live score ledger; final OVER settlement is a later mapping.

**Legend — implementation status**

| Status    | Meaning                                                          |
| --------- | ---------------------------------------------------------------- |
| `done`    | Implemented in contracts (may still need deploy/config)          |
| `partial` | Core surface exists; product semantics incomplete or config-only |
| `missing` | Not built                                                        |
| `n/a`     | Out of farming-contract scope / TBD product decision             |

**Legend — timing (vs Liquidity deploy)**

| When           | Meaning                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| `must-now`     | Must change Liquidity/OVERP bytecode **before** farm deploy (or accept redeploy) |
| `after-deploy` | Can ship later via owner setters and/or **new** contracts reading OVERP/state    |
| `blocked-over` | Needs OVER token and/or season-end finalization                                  |

Last updated: 2026-08-09 (FS-15 whitelist ops = after-deploy; FS-16 feature double-check still open)

---

## Open actions (do before calling farming “ready”)

1. **Double-check all features (FS-16)** — Walk this tracker end-to-end against `Farming_Season_faithful.md` and the live Liquidity / OVERP / referral / OG / Origin surfaces (rates, exclusivity, max-1 stakes, OG ungated, Ref freshness, Merkle OVERP, FS-09 sync wiring). Treat “`done`” rows as **code present**, not as “verified for mainnet” until this pass lands.

**Not a pre-deploy bytecode gap:** mint / collection / team allowlists are owner (or team-owner) config after deploy — including OG/Origin `setMerkleRoot` / `setWhitelist`, Special `setWhitelistedNft`, and Team member whitelist.

---

## Gap tracker

| ID     | Area                         | Doc need                                                                 | Contract status                                                           | Status    | When                            | Notes                                                                                                                    |
| ------ | ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| FS-01  | Season end settlement        | Consolidate multi-chain → Ethereum allocation                            | No settlement / consolidation contracts                                   | `missing` | `blocked-over`                  | New Eth contracts; read OVERP (+ pending)                                                                                |
| FS-02  | Claim options                | 14-day irrevocable Option 1 vs 2 (default Opt 1)                         | Missing                                                                   | `missing` | `blocked-over`                  | Needs Final Allocation in OVER                                                                                           |
| FS-03  | Option 1                     | 50% claim / 25% burn / 25% redistribute                                  | Missing                                                                   | `missing` | `blocked-over`                  | OVER movements                                                                                                           |
| FS-04  | Option 2                     | 365d linear vesting + redistribution share + Season/Vision NFT on select | Missing                                                                   | `missing` | `blocked-over`                  | OVER + NFT mint at option time                                                                                           |
| FS-05  | TGE+18m burn                 | Burn residual unclaimed VISION OVER                                      | Missing                                                                   | `missing` | `blocked-over`                  | OVER clock                                                                                                               |
| FS-06  | Reward-pool TVL tiers        | Discrete 1%–10% OVER by season avg TVL                                   | Missing (no on-chain TVL→pool sizing)                                     | `missing` | `after-deploy`                  | Prefer off-chain attestation into settlement; not a Liquidity change                                                     |
| FS-07  | Leaderboard prizes + VRF     | 5% prize pool, ranked + random (Chainlink VRF), team pro-rata splits     | Missing                                                                   | `missing` | `after-deploy` / `blocked-over` | Ranking/VRF = post-deploy; **prize funding** = OVER (`FS-07b`)                                                           |
| FS-07a | Leaderboard / VRF machinery  | Ranked + random selection contracts                                      | Missing                                                                   | `missing` | `after-deploy`                  | Separate contracts reading OVERP / scores                                                                                |
| FS-07b | Prize pool funding           | 5% of OVER reward pool                                                   | Missing                                                                   | `missing` | `blocked-over`                  | Sized from OVER                                                                                                          |
| FS-08  | Entropy upgrade path         | Burn 3 same-type Origin → 1 Entropy (2.5/15/25%)                         | Liquidity has upgraded **slots** only; no burn/mint Entropy NFT contracts | `partial` | `after-deploy`                  | Deploy Entropy NFTs → `setOriginNftsUpgraded`                                                                            |
| FS-09  | Cross-chain OG               | Eth OG recognized on Base/RH                                             | Spoke Liquidity `ogMerkleRoot`; first farm tx with proof activates OG     | `done`    | `after-deploy`                  | Eth: `setOgNft(OverlayerOG)`. Spoke: `setOgMerkleRoot` / `setMerkleRoot` (same task as Origin NFTs). User does nothing extra. |
| FS-10  | VISION point rates           | Doc: 5 / 3 / 1 pts per $1k / day by product                              | Achievable via `setReward` / APR setters — staked Y is stablecoin (~$1)   | `done`    | `after-deploy`                  | Not a model mismatch; configure emission so X OVERP per Y capital matches target pts/$/day. Pending-at-finalize = FS-10b |
| FS-10b | Pending included at finalize | Unharvested points must count at season end                              | Views + `harvestAllFor` exist; no forced global finalize                  | `partial` | `after-deploy`                  | Indexer and/or harvest pass at cutoff                                                                                    |
| FS-11  | Additional Points cap        | ≤5% of total production, non-boostable stream                            | Merkle ingest exists; no on-chain cap                                     | `partial` | `after-deploy`                  | Ops/Merkle cap; `setPointsMerkleRoot` / `claimPoints`                                                                    |
| FS-12  | Special NFT rule             | Max **1** Special per wallet per chain                                   | Single-slot `whitelistedNftStaked` + `WhitelistedAlreadyStaked`           | `done`    | —                               | Implemented 2026-08-09; storage collapsed to Origin-style single slot (FS-12 follow-up)                                  |
| FS-13  | OG without Origin stake      | Doc: OG +2.5% standalone                                                 | `ogNft.balanceOf` applies +2.5% without requiring Origin stake            | `done`    | —                               | Implemented 2026-08-09; Origin / Special bonuses unchanged; stacking additive                                            |
| FS-14  | Performance fee 50%          | Listed in params                                                         | Not in farming contracts                                                  | `n/a`     | `n/a`                           | Likely wrap/strategy scope — confirm                                                                                     |
| FS-15  | Allowlist wiring (OG/Special/Team) | Load mint/collection/team allowlists                             | Surfaces already exist                                                    | `done`    | `after-deploy`                  | **Not must-now bytecode.** OG/Origin mint: `setMerkleRoot` / `setWhitelist` after deploy. Specials: `setWhitelistedNft`. Team joins: team-owner whitelist/open. No separate wallet farm allowlist in scope. |
| FS-16  | Full feature double-check    | Verify every FS / FS-C / FS-S item vs doc + deploy wiring                | Tracker exists; no signed-off audit pass yet                              | `missing` | `must-now`                      | Gate for “ready to deploy”; re-check bonuses, referrals, NFT rules, OG, OVERP, FS-09                                     |

---

## Must fix now (pre-Liquidity deploy)

| ID    | Item                      | Action                                                              |
| ----- | ------------------------- | ------------------------------------------------------------------- |
| FS-16 | Full feature double-check | Audit all features in this doc against `Farming_Season_faithful.md` |

FS-12 and FS-13 bytecode items are done; they still fall under **FS-16** verification. **FS-15** allowlists (including OG Merkle) are post-deploy config, not a Liquidity code change.

**FS-12 done:** Whitelist/Special stake storage is a single slot (`whitelistedNftStaked`, empty = `collection == address(0)`), mirroring Origin. `stakeWhitelistedNft` reverts with `WhitelistedAlreadyStaked` if occupied; `unstakeWhitelistedNft()` / `whitelistedStakeOf` match the Origin API shape. Specials may be whitelisted once this bytecode is deployed.

**FS-13 done:** `_nftBonusAmount` applies OG +2.5% from `ogNft.balanceOf(user)` without requiring an Origin stake. Origin and whitelisted/Special bonuses remain independently gated; all three stack additively.

**FS-09 done (contracts, ops remaining):** Cross-chain OG is a **fixed-holder Merkle root on Liquidity**. OG stays soulbound on Eth. Users do not claim or sync.

- Spoke Liquidity: `setOgMerkleRoot` / `setMerkleRoot` (same leaf as Origin / OG NFT tasks)
- First `deposit` / `harvest` / `withdraw` / NFT stake that includes the proof sets `ogActivated[user]`
- Snapshot: `snapshotOverlayerOGHolders.ts` dumps current Eth OG `ownerOf` addresses
- Eth: `setOgNft(OverlayerOG)` still uses `balanceOf`. Spokes leave `ogNft` unset and set the root.
- Configure: `configureOverlayerOGEntitlementMerkleRoot.ts` or the Origin merkle task against Liquidity.

---

## Can do after Liquidity deploy

| ID     | Item                                           | How                                                                                           |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| FS-08  | Entropy NFTs (2.5% / 15% / 25%)                | Deploy `IBonusNFT` collections → `setOriginNftsUpgraded` (slots already exist; also FS-C04)   |
| FS-C01 | Wire Origin / OG / pools / rates / referral    | Existing owner setters (`setOriginNfts`, `setOgNft`, `setReward`, `add`, `updateReferral`, …) |
| FS-15  | Allowlist wiring (OG / Special / Team)         | OG/Origin: `setMerkleRoot` / `setWhitelist`. Specials: `setWhitelistedNft`. Team: owner open/whitelist. All post-deploy. |
| FS-09  | Cross-chain OG recognition                     | **Contracts done:** spoke Liquidity merkle root. Ops: `setOgMerkleRoot` on Base/RH; Eth keeps `setOgNft(OG)`. Frontend attaches proof on the first farm tx. |
| FS-11  | Additional Points (Galxe, events, …) + ≤5% cap | Merkle roots + ops cap; `setPointsMerkleRoot` / `claimPoints`                                 |
| FS-S02 | Referral/Team “Additional Points” narrative    | Settlement/airdrop interprets OVERP + `generatedPointsByType` (rates already match)           |
| FS-10  | VISION pts/$1k/day rates (config)              | `setReward` / SingleStable–Curve APR setters — Y ≈ $1 stablecoin                              |
| FS-10b | Pending included at finalize                   | Indexer and/or `harvestAllFor` + `pendingReward`                                              |
| FS-07a | Leaderboard / VRF machinery                    | Separate contracts reading OVERP / scores                                                     |
| FS-06  | TVL → reward-pool %                            | Off-chain attestation into Eth settlement                                                     |

**Post-deploy knobs (already on Liquidity / OVERP)** — supports FS-C01, FS-08, FS-09, FS-10, FS-11

- Liquidity: `updateReferral`, `updateReferralBonusConfig`, `setOriginNfts`, `setOriginNftsUpgraded`, `setOgNft`, `setWhitelistedNft`, `updateMultiplier`, `setReward` / `setRewardForStakedAssets`, `setPoolAllocPoints`, `add`
- OVERP: `setPointsMerkleRoot`, `setMinter`, `addPointsTracker` / `removePointsTracker`, `setStakingPools`, team owner ACL

---

## Blocked on OVER / season end

| ID     | Item                                                                   | Why                            |
| ------ | ---------------------------------------------------------------------- | ------------------------------ |
| FS-02  | Claim Option 1 / 2 (14d, irrevocable, default Opt1)                    | Needs Final Allocation in OVER |
| FS-03  | Opt1 50/25/25 split-burn-redistribute                                  | OVER movements                 |
| FS-04  | Opt2 365d vesting + redistribution + Vision/Season NFT                 | OVER + NFT mint                |
| FS-05  | TGE+18m residual burn                                                  | OVER clock                     |
| FS-01  | Score → OVER allocation registry + multi-chain consolidate on Ethereum | Season end + OVER              |
| FS-07b | Prize pool **funding** (5% of OVER reward pool)                        | Sized from OVER                |

Continuous OVERP mint during farming is **compatible** with later OVER settlement and with airdrop reading OVERP (see FS-S01).

---

## Already largely covered

Configure / wire; not greenfield. Timing: ready for deploy (`done`) or post-config (`after-deploy`).

| ID     | Area                            | What exists                                                           | Status    | When           | Notes                                                 |
| ------ | ------------------------------- | --------------------------------------------------------------------- | --------- | -------------- | ----------------------------------------------------- |
| FS-C01 | Farming surface                 | `Liquidity` (+ Single/Curve stakes), harvest, pool admin              | `done`    | `after-deploy` | Season pools still owner-configured                   |
| FS-C02 | Typed referrals                 | Team + Ref, per-type exclusivity, Team open/whitelist, Ref fresh gate | `done`    | —              | Bytecode ready                                        |
| FS-C03 | Core bonus rates                | Team 5%/2.5%, Ref 10%/2.5%, OG +2.5%, Origin 1/5/10%                  | `done`    | —              | Denom 1000 for referral/OG; Origin base denom 100     |
| FS-C04 | Upgraded Origin bonuses (slots) | Liquidity slots for 2.5% / 15% / 25% collections                      | `partial` | `after-deploy` | Address wiring only until Entropy NFTs deploy (FS-08) |
| FS-C05 | OVERP + Merkle                  | Non-transferable / non-burnable OVERP; merkle claims                  | `done`    | `after-deploy` | Airdrop reads OVERP balance                           |
| FS-C06 | Origin stake rules              | One Origin slot; harvest-before-boost-change; whitelist NFT registry  | `done`    | —              | Whitelist/Special max-1 covered by FS-12              |

---

## Semantic mismatches (track separately)

| ID     | Topic                             | Doc                                                 | Code today                                        | Status    | When                            | Resolution                                                              |
| ------ | --------------------------------- | --------------------------------------------------- | ------------------------------------------------- | --------- | ------------------------------- | ----------------------------------------------------------------------- |
| FS-S01 | Points vs continuous OVERP mint   | Accrue VISION points → final OVER allocation        | Farms mint OVERP on harvest                       | `partial` | `after-deploy` / `blocked-over` | **Accepted for airdrop:** OVERP = live ledger; map → OVER at settlement |
| FS-S02 | Referral/Team “Additional Points” | Referrer/leader get non-boostable Additional Points | OVERP bonuses minted on harvest from base pending | `partial` | `after-deploy`                  | Numbers align; interpret via `generatedPointsByType` at finalize        |
| FS-S03 | Exclusivity scope                 | Doc wording ambiguous (global vs per-chain)         | Per-type, per deployment                          | `partial` | —                               | Product confirm; code already per-deployment                            |

---

## Pre-deploy checklist

1. ~~Product sign-off / patch FS-13 OG without Origin~~ **done** 2026-08-09
2. **FS-16** — Double-check **all** farming features vs this tracker and the product doc
3. Deploy Liquidity farms + OVERP; wire `updateReferral`, minter, trackers, `setStakingPools` (FS-C01, FS-C05)
4. Config-only: pools, rates, Origin addresses, `setOgNft` (FS-C01, FS-C03, FS-C06)
5. Leave upgraded Origin = `address(0)` until FS-08 Entropy exists
6. After deploy (FS-15): OG/Origin mint Merkle/`setWhitelist`, Special `setWhitelistedNft`, Team open/whitelist as needed
7. Whitelist Specials only on Liquidity that includes FS-12 single-slot enforcement
8. Park FS-08, FS-11, FS-07a, FS-01–FS-05 until after deploy / OVER; FS-09 contracts ready — set `ogMerkleRoot` on Base/RH Liquidity when those farms go live

---

## Highest-value remaining work

1. **FS-16** Full feature double-check (gate before Liquidity deploy)
2. Deploy + wire Liquidity/OVERP (FS-C01, FS-C05) with FS-12/FS-13 bytecode
3. **FS-15** (after deploy) — load OG/Origin Merkle + Special NFT + Team allowlists
4. **FS-01–FS-05** finalization stack (post-OVER)
5. **FS-08** Entropy collections + 3-burn-1-mint + `setOriginNftsUpgraded`
6. **FS-07a** Leaderboard/VRF (post-deploy) + **FS-07b** prize funding (post-OVER)
7. **FS-11** Ops/Merkle Additional Points cap; **FS-06** off-chain TVL tier attestation

---

## ID index

| ID     | Title                                           | When                    |
| ------ | ----------------------------------------------- | ----------------------- |
| FS-01  | Season end settlement                           | `blocked-over`          |
| FS-02  | Claim options                                   | `blocked-over`          |
| FS-03  | Option 1                                        | `blocked-over`          |
| FS-04  | Option 2                                        | `blocked-over`          |
| FS-05  | TGE+18m burn                                    | `blocked-over`          |
| FS-06  | Reward-pool TVL tiers                           | `after-deploy`          |
| FS-07  | Leaderboard prizes + VRF (parent)               | mixed                   |
| FS-07a | Leaderboard / VRF machinery                     | `after-deploy`          |
| FS-07b | Prize pool funding                              | `blocked-over`          |
| FS-08  | Entropy upgrade path                            | `after-deploy`          |
| FS-09  | Cross-chain OG (entitlement mirror)             | `after-deploy` (`done`) |
| FS-10  | VISION point rates (config via setReward; Y≈$1) | `after-deploy` (`done`) |
| FS-10b | Pending included at finalize                    | `after-deploy`          |
| FS-11  | Additional Points cap                           | `after-deploy`          |
| FS-12  | Special NFT max-1                               | `done`                  |
| FS-13  | OG without Origin stake                         | `done`                  |
| FS-14  | Performance fee 50%                             | `n/a`                   |
| FS-15  | Allowlist wiring (OG Merkle / Special / Team)   | `after-deploy` (`done`) |
| FS-16  | Full feature double-check                       | `must-now`              |
| FS-C01 | Farming surface                                 | covered                 |
| FS-C02 | Typed referrals                                 | covered                 |
| FS-C03 | Core bonus rates                                | covered                 |
| FS-C04 | Upgraded Origin slots                           | covered / partial       |
| FS-C05 | OVERP + Merkle                                  | covered                 |
| FS-C06 | Origin stake rules                              | covered                 |
| FS-S01 | Points vs OVERP mint                            | semantic                |
| FS-S02 | Referral/Team Additional Points narrative       | semantic                |
| FS-S03 | Exclusivity scope                               | semantic                |

---

## Changelog

| Date       | Change                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-09 | Initial tracker from Farming Season gap review vs `contracts-core`                                                                                                                       |
| 2026-08-09 | Added must-now / after-deploy / blocked-over timing; OVERP airdrop assumption; pre-deploy checklist                                                                                      |
| 2026-08-09 | Added stable item IDs (`FS-*`, `FS-C*`, `FS-S*`) and ID index                                                                                                                            |
| 2026-08-09 | FS-10 reclassified: not a mismatch — rates via `setReward` with stablecoin Y≈$1; pending finalize split to FS-10b                                                                        |
| 2026-08-09 | **FS-12 done:** enforce max 1 whitelisted/Special NFT per wallet via `WhitelistedAlreadyStaked`; tests + NatSpec updated                                                                 |
| 2026-08-09 | **FS-12 follow-up:** collapse whitelist stake storage to Origin single-slot (`whitelistedNftStaked`); parameterless `unstakeWhitelistedNft()`; `whitelistedStakeOf` view; lifecycle test |
| 2026-08-09 | **FS-13 done:** OG +2.5% from `ogNft.balanceOf` without Origin stake; tests + NatSpec updated; cleared from must-now                                                                     |
| 2026-08-09 | **FS-09 done (contracts):** Eth `OverlayerOGEntitlementHub` + spoke `OverlayerOGEntitlement` soulbound badge via LZ; Foundry `test/og-sync`; deploy tag `og-entitlement` + `layerzero.og.config.ts` + `syncOgEntitlement`. Liquidity unchanged: Eth `setOgNft(OG)`, spoke `setOgNft(entitlement)`. Ops deploy/wire remaining. |
| 2026-09-05 | **FS-09 Liquidity merkle:** dropped LZ hub/spoke sync and user claim. Spoke Liquidity `setOgMerkleRoot`; first farm interaction with a proof sets `ogActivated`. |
| 2026-08-09 | **FS-15 / FS-16 open:** must support whitelisted addresses (confirm full product scope) and double-check all farming features before deploy; added Open actions + must-now rows                                                                                      |
| 2026-08-09 | **FS-15 clarified:** not a must-now bytecode gap and not a missing OG whitelist feature — OG/Origin mint allowlists are post-deploy `setMerkleRoot` / `setWhitelist`; Specials via `setWhitelistedNft`; Team via owner ACL. FS-15 → `after-deploy`/`done`. Only FS-16 remains must-now. |
