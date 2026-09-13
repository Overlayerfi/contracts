/**
 * Deploy OVERP (OverlayerReferral) + an empty SingleStableStake (Liquidity
 * subclass, zero pools) and wire them so Team / Ref create + join work now.
 *
 * Pools, reward rates, and start/end times are left unset. When farms go live:
 *   1. Optional: liquidity.updateStartTime(futureUnix) — only if start must be
 *      in the future (constructor startTime is deploy-now and already past).
 *   2. liquidity.setRewardForStakedAssets(OVERP, num, den)
 *   3. liquidity.add(stakedAsset, OVERP, allocPoints, endTime, vested, true)
 *
 * Per-chain (Hardhat --network). Launch all three mainnets with:
 *   bash scripts/utils/deployOverpEmptyLiquidity.sh
 *
 * Config: scripts/config/overp-empty-liquidity.config.json
 * Override path with OVERP_EMPTY_LIQUIDITY_CONFIG.
 * Writes/merges `mainnet-deployment/overp-liquidity.json`
 * (testnet → `testnet-deployments/overp-liquidity.json`).
 *
 * Refuse to redeploy a network already in the manifest unless FORCE_REDEPLOY=1.
 * DRY_RUN=1 connects, checks signer / Origin / OG, and prints planned txs — no sends.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Contract } from "ethers";
import { ethers, network } from "hardhat";
import {
  deploy_OverlayerReferral,
  deploy_AirdropSingleStableStake,
  OverlayerReferral_setStakingPools,
  OverlayerReferral_addTrackers,
  Liquidity_updateReferral,
  Liquidity_setOriginNfts
} from "../functions";
import OVERLAYER_REFERRAL_ABI from "../../artifacts/contracts/overlayer/OverlayerReferral.sol/OverlayerReferral.json";
import LIQUIDITY_ABI from "../../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";

const DEFAULT_CONFIG_PATH = resolve(
  "scripts/config/overp-empty-liquidity.config.json"
);

type OriginNftsConfig = {
  shrimp: string;
  dolphin: string;
  whale: string;
};

type NetworkDeployConfig = {
  chainId: number;
  originNfts: OriginNftsConfig;
  ogNft?: string;
  ogMerkleRoot?: string;
};

type EmptyLiquidityConfig = {
  admin: string;
  networks: Record<string, NetworkDeployConfig>;
};

type NetworkManifestEntry = {
  chainId: number;
  deployedAt: string;
  overp: string;
  liquidity: string;
  liquidityKind: "SingleStableStake";
  constructorStartTime: number;
  originNfts: OriginNftsConfig;
  ogNft?: string;
  ogMerkleRoot?: string;
  wired: {
    setMinter: boolean;
    setStakingPools: boolean;
    addPointsTracker: boolean;
    updateReferral: boolean;
    setOriginNfts: boolean;
    setOgNft: boolean;
    setOgMerkleRoot: boolean;
    poolCount: number;
  };
  farms: Record<string, never>;
};

type OverpLiquidityDeploymentFile = {
  admin: string;
  note: string;
  networks: Record<string, NetworkManifestEntry>;
};

function getTimestamp(): string {
  return new Date().toISOString();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 1; i <= 10; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (
        !msg.includes("in-flight transaction limit") &&
        !msg.includes("replacement transaction underpriced") &&
        !msg.includes("nonce")
      ) {
        throw err;
      }
      if (i === 10) throw err;
      const waitMs = 10000 * i;
      console.log(
        `[${getTimestamp()}] ${label}: retry ${i}/10 after ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }
  throw new Error("unreachable");
}

function isTestnetNetwork(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("sepolia") ||
    lower.includes("goerli") ||
    lower.includes("testnet") ||
    lower === "hardhat" ||
    lower === "localhost"
  );
}

function outputPath(networkName: string): string {
  return resolve(
    isTestnetNetwork(networkName)
      ? join("testnet-deployments", "overp-liquidity.json")
      : join("mainnet-deployment", "overp-liquidity.json")
  );
}

function isNonEmptyAddress(value: string | undefined): value is string {
  return (
    typeof value === "string" && value.trim() !== "" && ethers.isAddress(value)
  );
}

function isNonEmptyBytes32(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(value.trim()) &&
    value.trim() !== ethers.ZeroHash
  );
}

function loadConfig(): { path: string; config: EmptyLiquidityConfig } {
  const path = resolve(
    process.env.OVERP_EMPTY_LIQUIDITY_CONFIG?.trim() || DEFAULT_CONFIG_PATH
  );
  if (!existsSync(path)) {
    throw new Error(`OVERP empty-liquidity config not found: ${path}`);
  }

  const config = JSON.parse(readFileSync(path, "utf8")) as EmptyLiquidityConfig;

  if (!isNonEmptyAddress(config.admin)) {
    throw new Error(`Invalid admin in config: ${config.admin}`);
  }
  if (!config.networks || typeof config.networks !== "object") {
    throw new Error("Invalid networks map in config");
  }

  return { path, config };
}

function resolveOriginNfts(
  cfg: NetworkDeployConfig,
  networkName: string
): OriginNftsConfig {
  const { shrimp, dolphin, whale } = cfg.originNfts ?? {
    shrimp: "",
    dolphin: "",
    whale: ""
  };
  if (
    !isNonEmptyAddress(shrimp) ||
    !isNonEmptyAddress(dolphin) ||
    !isNonEmptyAddress(whale)
  ) {
    throw new Error(
      `Origin NFT addresses missing for network "${networkName}". Set originNfts in the config JSON.`
    );
  }
  return { shrimp, dolphin, whale };
}

function isDryRun(): boolean {
  const v = process.env.DRY_RUN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const ERC721_VIEW_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

async function assertLiveContract(
  addr: string,
  label: string
): Promise<{ name: string; symbol: string; codeBytes: number }> {
  const code = await ethers.provider.getCode(addr);
  if (!code || code === "0x") {
    throw new Error(`${label} at ${addr} has no code`);
  }
  const nft = new ethers.Contract(addr, ERC721_VIEW_ABI, ethers.provider);
  const [name, symbol] = await Promise.all([nft.name(), nft.symbol()]);
  return { name, symbol, codeBytes: (code.length - 2) / 2 };
}

async function dryRun(args: {
  configPath: string;
  admin: string;
  networkName: string;
  liveChainId: number;
  dest: string;
  originNfts: OriginNftsConfig;
  ogNft?: string;
  ogMerkleRoot?: string;
}): Promise<void> {
  const {
    configPath,
    admin,
    networkName,
    liveChainId,
    dest,
    originNfts,
    ogNft,
    ogMerkleRoot
  } = args;

  const signer = await ethers.getSigner(admin);
  const balance = await ethers.provider.getBalance(signer.address);
  const nonce = await ethers.provider.getTransactionCount(signer.address);
  const fee = await ethers.provider.getFeeData();

  console.log(`[${getTimestamp()}] DRY RUN — no transactions will be sent`);
  console.log(`[${getTimestamp()}] Config:   ${configPath}`);
  console.log(`[${getTimestamp()}] Network:  ${networkName} (${liveChainId})`);
  console.log(`[${getTimestamp()}] Signer:   ${signer.address}`);
  console.log(
    `[${getTimestamp()}] Balance:  ${ethers.formatEther(balance)} native`
  );
  console.log(`[${getTimestamp()}] Nonce:    ${nonce}`);
  console.log(
    `[${getTimestamp()}] Fees:     gasPrice=${fee.gasPrice ?? "n/a"} maxFee=${
      fee.maxFeePerGas ?? "n/a"
    }`
  );
  console.log(`[${getTimestamp()}] Manifest: ${dest} (not written)`);

  if (signer.address.toLowerCase() !== admin.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} does not match config admin ${admin}`
    );
  }
  if (balance === 0n) {
    throw new Error(`Signer ${signer.address} has zero native balance`);
  }

  for (const [label, addr] of [
    ["Origin shrimp", originNfts.shrimp],
    ["Origin dolphin", originNfts.dolphin],
    ["Origin whale", originNfts.whale]
  ] as const) {
    const meta = await assertLiveContract(addr, label);
    console.log(
      `[${getTimestamp()}] ${label}: ${addr} ${meta.name} (${
        meta.symbol
      }) code=${meta.codeBytes}B`
    );
  }

  if (ogNft) {
    const meta = await assertLiveContract(ogNft, "OG NFT");
    console.log(
      `[${getTimestamp()}] OG NFT:         ${ogNft} ${meta.name} (${
        meta.symbol
      }) code=${meta.codeBytes}B`
    );
  } else {
    console.log(
      `[${getTimestamp()}] OG NFT:         skip setOgNft (spoke — setOgMerkleRoot later)`
    );
  }

  const OverlayerReferral = await ethers.getContractFactory(
    "OverlayerReferral"
  );
  const SingleStableStake = await ethers.getContractFactory(
    "SingleStableStake"
  );
  const overpDeploy = OverlayerReferral.getDeployTransaction(admin);
  const liqDeploy = SingleStableStake.getDeployTransaction(admin);
  const [overpGas, liqGas] = await Promise.all([
    ethers.provider
      .estimateGas({ from: admin, data: overpDeploy.data })
      .catch(() => 0n),
    ethers.provider
      .estimateGas({ from: admin, data: liqDeploy.data })
      .catch(() => 0n)
  ]);
  console.log(
    `[${getTimestamp()}] Est. deploy gas: OVERP=${overpGas} SingleStableStake=${liqGas}`
  );

  console.log(`[${getTimestamp()}] Planned txs (in order):`);
  console.log(`  1. deploy OverlayerReferral(${admin})`);
  console.log(`  2. deploy SingleStableStake(${admin})`);
  console.log(`  3. OVERP.setMinter(liquidity)`);
  console.log(`  4. OVERP.setStakingPools([liquidity])`);
  console.log(`  5. OVERP.addPointsTracker(liquidity)`);
  console.log(`  6. Liquidity.updateReferral(OVERP)`);
  console.log(
    `  7. Liquidity.setOriginNfts(${originNfts.shrimp}, ${originNfts.dolphin}, ${originNfts.whale})`
  );
  if (ogNft) {
    console.log(`  8. Liquidity.setOgNft(${ogNft})`);
  } else {
    console.log(`  8. skip setOgNft`);
  }
  if (ogMerkleRoot) {
    console.log(`  9. Liquidity.setOgMerkleRoot(${ogMerkleRoot})`);
  } else {
    console.log(`  9. skip setOgMerkleRoot`);
  }
  console.log(`[${getTimestamp()}] DRY RUN OK — ${networkName}`);
}

function mergeManifest(
  dest: string,
  admin: string,
  networkName: string,
  networkEntry: NetworkManifestEntry
): void {
  let existing: OverpLiquidityDeploymentFile = {
    admin,
    note: "OVERP + empty SingleStableStake. Farms added later via setRewardForStakedAssets + add.",
    networks: {}
  };

  if (existsSync(dest)) {
    existing = JSON.parse(
      readFileSync(dest, "utf8")
    ) as OverpLiquidityDeploymentFile;
    existing.admin = admin;
    existing.networks = existing.networks ?? {};
  }

  existing.networks[networkName] = networkEntry;

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(existing, null, 2) + "\n", "utf8");
  console.log(`[${getTimestamp()}] Wrote deployment manifest → ${dest}`);
}

async function main() {
  const networkName = network.name;
  const { path: configPath, config } = loadConfig();
  const networkCfg = config.networks[networkName];
  if (!networkCfg) {
    throw new Error(
      `Unknown network "${networkName}" in ${configPath}. Known: ${Object.keys(
        config.networks
      ).join(", ")}.`
    );
  }

  const providerNetwork = await ethers.provider.getNetwork();
  const liveChainId = Number(providerNetwork.chainId);
  if (networkCfg.chainId !== liveChainId) {
    throw new Error(
      `Chain id mismatch for "${networkName}": config=${networkCfg.chainId} live=${liveChainId}`
    );
  }

  const dest = outputPath(networkName);
  const dryRunMode = isDryRun();
  if (!dryRunMode && existsSync(dest) && process.env.FORCE_REDEPLOY !== "1") {
    const existing = JSON.parse(
      readFileSync(dest, "utf8")
    ) as OverpLiquidityDeploymentFile;
    const prior = existing.networks?.[networkName];
    if (prior?.overp && prior?.liquidity) {
      throw new Error(
        `${networkName} already in ${dest} (overp=${prior.overp} liquidity=${prior.liquidity}). ` +
          `Set FORCE_REDEPLOY=1 to deploy again.`
      );
    }
  }

  const originNfts = resolveOriginNfts(networkCfg, networkName);
  const ogNft = isNonEmptyAddress(networkCfg.ogNft)
    ? networkCfg.ogNft
    : undefined;
  const ogMerkleRoot = isNonEmptyBytes32(networkCfg.ogMerkleRoot)
    ? networkCfg.ogMerkleRoot
    : undefined;

  if (dryRunMode) {
    await dryRun({
      configPath,
      admin: config.admin,
      networkName,
      liveChainId,
      dest,
      originNfts,
      ogNft,
      ogMerkleRoot
    });
    return;
  }

  const admin = await ethers.getSigner(config.admin);
  console.log(`[${getTimestamp()}] Config:   ${configPath}`);
  console.log(`[${getTimestamp()}] Network:  ${networkName} (${liveChainId})`);
  console.log(`[${getTimestamp()}] Signer:   ${admin.address}`);
  console.log(
    `[${getTimestamp()}] Origin:   shrimp=${originNfts.shrimp} dolphin=${
      originNfts.dolphin
    } whale=${originNfts.whale}`
  );
  if (ogNft) {
    console.log(`[${getTimestamp()}] OG NFT:   ${ogNft}`);
  }
  if (ogMerkleRoot) {
    console.log(`[${getTimestamp()}] OG root:  ${ogMerkleRoot}`);
  }

  // 1. OVERP
  const overpAddr = await deploy_OverlayerReferral(config.admin, 2);
  const overp = new ethers.Contract(
    overpAddr,
    OVERLAYER_REFERRAL_ABI.abi,
    admin
  );

  // 2. Empty SingleStableStake (no pools, no reward rate)
  console.log(
    `[${getTimestamp()}] Deploying empty SingleStableStake (0 pools)...`
  );
  const liquidityAddr = await deploy_AirdropSingleStableStake(config.admin, 2);
  const liquidity = new ethers.Contract(
    liquidityAddr,
    LIQUIDITY_ABI.abi,
    admin
  );
  const constructorStartTime = Number(await liquidity.startTime());
  console.log(
    `[${getTimestamp()}] Liquidity=${liquidityAddr} constructorStartTime=${constructorStartTime}`
  );

  // 3. OVERP wiring — required for later mint/track; setStakingPools unlocks consumeReferral
  await withRetry(`OVERP setMinter ${liquidityAddr}`, async () => {
    const tx = await (overp as Contract).setMinter(liquidityAddr, {
      gasLimit: 2000000
    });
    await tx.wait();
    console.log(
      `[${getTimestamp()}] OVERP setMinter → ${liquidityAddr} hash=${tx.hash}`
    );
  });
  await OverlayerReferral_setStakingPools(overpAddr, [liquidityAddr]);
  await OverlayerReferral_addTrackers(overpAddr, [liquidityAddr]);

  // 4. Liquidity wiring — referral + Origin now; OG on Eth; merkle optional on spokes
  await Liquidity_updateReferral(liquidityAddr, overpAddr);
  await Liquidity_setOriginNfts(
    liquidityAddr,
    originNfts.shrimp,
    originNfts.dolphin,
    originNfts.whale
  );

  let setOgNft = false;
  if (ogNft) {
    await withRetry(`setOgNft ${ogNft}`, async () => {
      const tx = await (liquidity as Contract).setOgNft(ogNft, {
        gasLimit: 2000000
      });
      await tx.wait();
      console.log(`[${getTimestamp()}] setOgNft → ${ogNft} hash=${tx.hash}`);
    });
    setOgNft = true;
  }

  let setOgMerkleRoot = false;
  if (ogMerkleRoot) {
    await withRetry(`setOgMerkleRoot`, async () => {
      const tx = await (liquidity as Contract).setOgMerkleRoot(ogMerkleRoot, {
        gasLimit: 2000000
      });
      await tx.wait();
      console.log(
        `[${getTimestamp()}] setOgMerkleRoot → ${ogMerkleRoot} hash=${tx.hash}`
      );
    });
    setOgMerkleRoot = true;
  }

  const [pools, isMinter, isTracker, referralAddr, poolCount] =
    await Promise.all([
      overp.getStakingPools(),
      overp.minter(liquidityAddr),
      overp.allowedPointsTrackers(liquidityAddr),
      liquidity.referral(),
      liquidity.poolLength()
    ]);

  if (pools.length !== 1 || pools[0] !== liquidityAddr) {
    throw new Error(`OVERP stakingPools mismatch: ${pools.join(",")}`);
  }
  if (!isMinter) {
    throw new Error("OVERP minter(liquidity) is false");
  }
  if (!isTracker) {
    throw new Error("OVERP allowedPointsTrackers(liquidity) is false");
  }
  if (referralAddr !== overpAddr) {
    throw new Error(`Liquidity.referral mismatch: ${referralAddr}`);
  }
  if (Number(poolCount) !== 0) {
    throw new Error(`Expected 0 pools, got ${poolCount}`);
  }

  const networkEntry: NetworkManifestEntry = {
    chainId: liveChainId,
    deployedAt: getTimestamp(),
    overp: overpAddr,
    liquidity: liquidityAddr,
    liquidityKind: "SingleStableStake",
    constructorStartTime,
    originNfts,
    wired: {
      setMinter: true,
      setStakingPools: true,
      addPointsTracker: true,
      updateReferral: true,
      setOriginNfts: true,
      setOgNft,
      setOgMerkleRoot,
      poolCount: 0
    },
    farms: {}
  };
  if (ogNft) {
    networkEntry.ogNft = ogNft;
  }
  if (ogMerkleRoot) {
    networkEntry.ogMerkleRoot = ogMerkleRoot;
  }

  mergeManifest(dest, config.admin, networkName, networkEntry);

  console.log(`\n[${getTimestamp()}] OVERP + empty Liquidity deploy complete.`);
  console.log(`  OVERP:     ${overpAddr}`);
  console.log(`  Liquidity: ${liquidityAddr} (SingleStableStake, 0 pools)`);
  console.log(
    `  Origin:    shrimp=${originNfts.shrimp} dolphin=${originNfts.dolphin} whale=${originNfts.whale}`
  );
  if (ogNft) {
    console.log(`  OG:        ${ogNft}`);
  } else {
    console.log(
      `  OG:        unset — later setOgMerkleRoot on this spoke when farms start`
    );
  }
  console.log(`  Manifest:  ${dest}`);
  console.log(
    `  Later:     updateStartTime? → setRewardForStakedAssets(OVERP) → add(..., endTime, ...)`
  );
}

main().catch((err) => {
  console.error(
    `[${getTimestamp()}] OVERP empty Liquidity deploy failed →`,
    err
  );
  process.exitCode = 1;
});
