/**
 * Deploy farming-season Liquidity (OVERP + 1× SingleStableStake with N pools) per network.
 *
 * One Liquidity contract holds all configured farms as pid 0..N-1 so a single NFT stake
 * applies to every pool. When all pools share the same per-TVL rate, the contract rate is
 * set to N× the per-pool rate with equal allocPoints (undoes alloc dilution).
 *
 * Assets / farm keys are loaded from:
 *   scripts/config/farming-season-liquidity.config.json
 * Override path with env FARMING_LIQUIDITY_CONFIG.
 *
 * Run order (testnet):
 * 1. npx hardhat run scripts/utils/deployMockOriginNfts.tmp.ts --network eth_sepolia
 *    (and --network base_sepolia)
 * 2. npx hardhat run scripts/utils/deployFarmingSeasonLiquidity.ts --network eth_sepolia
 *    (and --network base_sepolia)
 *
 * Mainnet: add a network section with real Origin + staked assets in the config JSON;
 * do not run the mock NFT script.
 * Writes/merges `mainnet-deployment/liquidity.json` (testnet → `testnet-deployments/liquidity.json`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Contract } from "ethers";
import { ethers, network } from "hardhat";
import {
  deploy_OverlayerReferral,
  deploy_AirdropSingleStableStake,
  SingleStableStake_setRewardForStakedAssets,
  SingleStableStake_addPool,
  OverlayerReferral_setStakingPools,
  OverlayerReferral_addTrackers,
  Liquidity_updateReferral,
  Liquidity_setOriginNfts
} from "../functions";
import SINGLE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/SingleStableStake.sol/SingleStableStake.json";
import OVERLAYER_REFERRAL_ABI from "../../artifacts/contracts/overlayer/OverlayerReferral.sol/OverlayerReferral.json";
import LIQUIDITY_ABI from "../../artifacts/contracts/liquidity/Liquidity.sol/Liquidity.json";

//########################################## CONFIGURATION ##########################################

const DEFAULT_CONFIG_PATH = resolve(
  "scripts/config/farming-season-liquidity.config.json"
);

const ERC20_METADATA_ABI = ["function decimals() view returns (uint8)"];

const MOCK_ORIGIN_NFTS_PATH = resolve(
  "testnet-deployments",
  "mock-origin-nfts.json"
);

type OriginNftsConfig = {
  shrimp: string;
  dolphin: string;
  whale: string;
};

type FarmConfigEntry = {
  /** Stable key used in the principal liquidity.json (e.g. "T+", "C+", "G+") */
  key: string;
  stakedAsset: string;
};

type NetworkFarmConfig = {
  originNfts: OriginNftsConfig;
  farms: FarmConfigEntry[];
};

type FarmingSeasonConfig = {
  admin: string;
  rewardRate: { num: number; den: number; note: string };
  poolDurationSeconds: number;
  vested: boolean;
  networks: Record<string, NetworkFarmConfig>;
};

type DeployedFarmRecord = {
  liquidity: string;
  stakedAsset: string;
  pid: number;
  startTime: number;
  endTime: number;
};

type LiquidityDeploymentFile = {
  admin: string;
  rewardRate: { num: number; den: number; note: string };
  networks: Record<
    string,
    {
      chainId: number;
      deployedAt: string;
      startTime: number;
      endTime: number;
      overp: string;
      liquidity: string;
      originNfts: OriginNftsConfig;
      ogNft?: string;
      appliedRewardRate: {
        num: number;
        den: number;
        note: string;
      };
      farms: Record<string, DeployedFarmRecord>;
    }
  >;
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

function liquidityOutputPath(networkName: string): string {
  return resolve(
    isTestnetNetwork(networkName)
      ? join("testnet-deployments", "liquidity.json")
      : join("mainnet-deployment", "liquidity.json")
  );
}

function isNonEmptyAddress(value: string | undefined): value is string {
  return (
    typeof value === "string" && value.trim() !== "" && ethers.isAddress(value)
  );
}

function loadConfig(): { path: string; config: FarmingSeasonConfig } {
  const path = resolve(
    process.env.FARMING_LIQUIDITY_CONFIG?.trim() || DEFAULT_CONFIG_PATH
  );
  if (!existsSync(path)) {
    throw new Error(`Farming liquidity config not found: ${path}`);
  }

  const config = JSON.parse(readFileSync(path, "utf8")) as FarmingSeasonConfig;

  if (!isNonEmptyAddress(config.admin)) {
    throw new Error(`Invalid admin in config: ${config.admin}`);
  }
  if (
    !config.rewardRate ||
    typeof config.rewardRate.num !== "number" ||
    typeof config.rewardRate.den !== "number" ||
    config.rewardRate.den === 0
  ) {
    throw new Error("Invalid rewardRate in config (need num/den, den != 0)");
  }
  if (
    typeof config.poolDurationSeconds !== "number" ||
    config.poolDurationSeconds <= 0
  ) {
    throw new Error("Invalid poolDurationSeconds in config");
  }
  if (!config.networks || typeof config.networks !== "object") {
    throw new Error("Invalid networks map in config");
  }

  return { path, config };
}

/**
 * Resolve an address field that may be a bare string or
 * `{ address: "0x..." }` (as written by deployMockOriginNfts.tmp.ts).
 */
function addressFromField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "address" in value &&
    typeof (value as { address: unknown }).address === "string"
  ) {
    return (value as { address: string }).address;
  }
  return "";
}

function loadMockNetworkEntry(
  networkName: string
): Record<string, unknown> | null {
  if (!existsSync(MOCK_ORIGIN_NFTS_PATH)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(MOCK_ORIGIN_NFTS_PATH, "utf8")) as Record<
    string,
    unknown
  >;

  if (
    raw.networks &&
    typeof raw.networks === "object" &&
    raw.networks !== null
  ) {
    const networks = raw.networks as Record<string, unknown>;
    if (
      networks[networkName] &&
      typeof networks[networkName] === "object" &&
      networks[networkName] !== null
    ) {
      return networks[networkName] as Record<string, unknown>;
    }
  }

  if (
    raw[networkName] &&
    typeof raw[networkName] === "object" &&
    raw[networkName] !== null
  ) {
    return raw[networkName] as Record<string, unknown>;
  }

  if (
    raw.network &&
    typeof raw.network === "object" &&
    raw.network !== null &&
    (raw.network as { name?: string }).name === networkName
  ) {
    return raw;
  }

  return null;
}

/**
 * Load shrimp/dolphin/whale from mock-origin-nfts.json for the current network.
 */
function loadOriginNftsFromMockFile(
  networkName: string
): OriginNftsConfig | null {
  const entry = loadMockNetworkEntry(networkName);
  if (!entry) {
    return null;
  }

  const shrimp = addressFromField(entry.shrimp);
  const dolphin = addressFromField(entry.dolphin);
  const whale = addressFromField(entry.whale);

  if (
    !isNonEmptyAddress(shrimp) ||
    !isNonEmptyAddress(dolphin) ||
    !isNonEmptyAddress(whale)
  ) {
    return null;
  }

  return { shrimp, dolphin, whale };
}

function loadOgNftFromMockFile(networkName: string): string | null {
  const entry = loadMockNetworkEntry(networkName);
  if (!entry) {
    return null;
  }
  const og = addressFromField(entry.og);
  return isNonEmptyAddress(og) ? og : null;
}

function resolveOriginNfts(
  cfg: NetworkFarmConfig,
  networkName: string
): OriginNftsConfig {
  let { shrimp, dolphin, whale } = cfg.originNfts ?? {
    shrimp: "",
    dolphin: "",
    whale: ""
  };

  const needsLoad =
    !isNonEmptyAddress(shrimp) ||
    !isNonEmptyAddress(dolphin) ||
    !isNonEmptyAddress(whale);

  if (needsLoad) {
    const fromFile = loadOriginNftsFromMockFile(networkName);
    if (fromFile) {
      if (!isNonEmptyAddress(shrimp)) shrimp = fromFile.shrimp;
      if (!isNonEmptyAddress(dolphin)) dolphin = fromFile.dolphin;
      if (!isNonEmptyAddress(whale)) whale = fromFile.whale;
      console.log(
        `[${getTimestamp()}] Loaded Origin NFTs from ${MOCK_ORIGIN_NFTS_PATH} for ${networkName}`
      );
    }
  }

  if (
    !isNonEmptyAddress(shrimp) ||
    !isNonEmptyAddress(dolphin) ||
    !isNonEmptyAddress(whale)
  ) {
    throw new Error(
      `Origin NFT addresses missing for network "${networkName}". ` +
        `On testnet, run: npx hardhat run scripts/utils/deployMockOriginNfts.tmp.ts --network ${networkName} ` +
        `(writes ${MOCK_ORIGIN_NFTS_PATH}). On mainnet, set originNfts in the farming config JSON.`
    );
  }

  return { shrimp, dolphin, whale };
}

function resolveFarms(
  cfg: NetworkFarmConfig,
  networkName: string
): FarmConfigEntry[] {
  if (!Array.isArray(cfg.farms) || cfg.farms.length === 0) {
    throw new Error(
      `Network "${networkName}" has no farms[]. Add entries like { "key": "T+", "stakedAsset": "0x..." }.`
    );
  }

  const seen = new Set<string>();
  const farms: FarmConfigEntry[] = [];

  for (const [i, farm] of cfg.farms.entries()) {
    const key = typeof farm?.key === "string" ? farm.key.trim() : "";
    const stakedAsset =
      typeof farm?.stakedAsset === "string" ? farm.stakedAsset.trim() : "";

    if (!key) {
      throw new Error(`Network "${networkName}" farms[${i}] missing key`);
    }
    if (seen.has(key)) {
      throw new Error(
        `Network "${networkName}" has duplicate farm key "${key}"`
      );
    }
    if (!isNonEmptyAddress(stakedAsset)) {
      throw new Error(
        `Network "${networkName}" farms[${i}] ("${key}") has invalid stakedAsset: ${farm?.stakedAsset}`
      );
    }

    seen.add(key);
    farms.push({ key, stakedAsset });
  }

  return farms;
}

async function assertDecimals18(asset: string, label: string): Promise<void> {
  const token = new ethers.Contract(asset, ERC20_METADATA_ABI, ethers.provider);
  const decimals = Number(await token.decimals());
  if (decimals !== 18) {
    throw new Error(
      `${label} at ${asset} has decimals=${decimals}, expected 18`
    );
  }
  console.log(`[${getTimestamp()}] ${label} decimals OK: 18 (${asset})`);
}

function mergeLiquidityJson(
  outputPath: string,
  admin: string,
  rewardRate: FarmingSeasonConfig["rewardRate"],
  networkName: string,
  networkEntry: LiquidityDeploymentFile["networks"][string]
): void {
  let existing: LiquidityDeploymentFile = {
    admin,
    rewardRate,
    networks: {}
  };

  if (existsSync(outputPath)) {
    existing = JSON.parse(
      readFileSync(outputPath, "utf8")
    ) as LiquidityDeploymentFile;
    existing.admin = admin;
    existing.rewardRate = rewardRate;
    existing.networks = existing.networks ?? {};
  }

  existing.networks[networkName] = networkEntry;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
  console.log(`[${getTimestamp()}] Wrote deployment manifest → ${outputPath}`);
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

  const farmConfigs = resolveFarms(networkCfg, networkName);
  const originNfts = resolveOriginNfts(networkCfg, networkName);
  const ogNft = loadOgNftFromMockFile(networkName);

  const admin = await ethers.getSigner(config.admin);
  console.log(`[${getTimestamp()}] Config:   ${configPath}`);
  console.log(`[${getTimestamp()}] Network:  ${networkName}`);
  console.log(`[${getTimestamp()}] Signer:   ${admin.address}`);
  console.log(
    `[${getTimestamp()}] Farms:    ${farmConfigs
      .map((f, i) => `pid${i}:${f.key}=${f.stakedAsset}`)
      .join(", ")}`
  );
  if (ogNft) {
    console.log(`[${getTimestamp()}] OG NFT:   ${ogNft} (from mock manifest)`);
  }

  for (const farm of farmConfigs) {
    await assertDecimals18(farm.stakedAsset, farm.key);
  }

  const defaultTransactionOptions = { gasLimit: 2000000 };
  const poolCount = farmConfigs.length;
  const { num: perPoolRateNum, den: rateDen } = config.rewardRate;
  // Equal per-pool rates + equal allocPoints ⇒ contract rate = N × per-pool rate
  const appliedRateNum = perPoolRateNum * poolCount;

  console.log(
    `[${getTimestamp()}] Reward:   per-pool ${perPoolRateNum}/${rateDen}; ` +
      `applied ${appliedRateNum}/${rateDen} (${poolCount} pools × equal alloc)`
  );

  // 1. Deploy OVERP (OverlayerReferral)
  const overpAddr = await deploy_OverlayerReferral(config.admin, 2);
  const overp = new ethers.Contract(
    overpAddr,
    OVERLAYER_REFERRAL_ABI.abi,
    admin.provider
  );

  // 2. Deploy one SingleStableStake for all farms
  console.log(
    `[${getTimestamp()}] Deploying SingleStableStake (shared by ${poolCount} pools)...`
  );
  const liquidityAddr = await deploy_AirdropSingleStableStake(config.admin, 2);
  const liquidity = new ethers.Contract(
    liquidityAddr,
    SINGLE_STABLE_STAKE_ABI.abi,
    admin.provider
  );
  const startTime = Number(await liquidity.startTime());
  const endTime = startTime + config.poolDurationSeconds;
  console.log(
    `[${getTimestamp()}] Liquidity=${liquidityAddr} startTime=${startTime} endTime=${endTime} (+${
      config.poolDurationSeconds
    }s)`
  );

  // 3. OVERP setMinter for the shared farm
  {
    const tx = await (overp.connect(admin) as Contract).setMinter(
      liquidityAddr,
      defaultTransactionOptions
    );
    await tx.wait();
    console.log(
      `[${getTimestamp()}] OVERP setMinter → ${liquidityAddr} hash=${tx.hash}`
    );
  }

  // 4. Reward rate once, then add each farm as a pool (equal allocPoints = 1)
  await SingleStableStake_setRewardForStakedAssets(
    liquidity,
    admin,
    overpAddr,
    appliedRateNum,
    rateDen,
    2
  );

  for (const [pid, farmCfg] of farmConfigs.entries()) {
    await SingleStableStake_addPool(
      liquidity,
      admin,
      farmCfg.stakedAsset,
      overpAddr,
      1, // equal allocPoints; dilution undone by appliedRateNum = N × per-pool
      endTime,
      config.vested,
      true,
      2
    );
    console.log(
      `[${getTimestamp()}] Added pid=${pid} key=${farmCfg.key} staked=${
        farmCfg.stakedAsset
      }`
    );
  }

  // 5. Referral wiring (single staking pool address)
  await OverlayerReferral_setStakingPools(overpAddr, [liquidityAddr]);
  await OverlayerReferral_addTrackers(overpAddr, [liquidityAddr]);

  // 6. Liquidity → referral + Origin NFTs (+ OG if present)
  await Liquidity_updateReferral(liquidityAddr, overpAddr);
  await Liquidity_setOriginNfts(
    liquidityAddr,
    originNfts.shrimp,
    originNfts.dolphin,
    originNfts.whale
  );
  console.log(`[${getTimestamp()}] Referral + Origin NFTs configured`);

  if (ogNft) {
    const liqWithOg = new ethers.Contract(
      liquidityAddr,
      LIQUIDITY_ABI.abi,
      admin
    );
    await withRetry(`setOgNft ${ogNft}`, async () => {
      const tx = await (liqWithOg as Contract).setOgNft(ogNft, {
        gasLimit: 2000000
      });
      await tx.wait();
      console.log(`[${getTimestamp()}] setOgNft → ${ogNft} hash=${tx.hash}`);
    });
  }

  const providerNetwork = await ethers.provider.getNetwork();
  const outputPath = liquidityOutputPath(networkName);
  const farmsManifest: Record<string, DeployedFarmRecord> = {};
  for (const [pid, farmCfg] of farmConfigs.entries()) {
    farmsManifest[farmCfg.key] = {
      liquidity: liquidityAddr,
      stakedAsset: farmCfg.stakedAsset,
      pid,
      startTime,
      endTime
    };
  }

  const networkEntry: LiquidityDeploymentFile["networks"][string] = {
    chainId: Number(providerNetwork.chainId),
    deployedAt: getTimestamp(),
    startTime,
    endTime,
    overp: overpAddr,
    liquidity: liquidityAddr,
    originNfts,
    appliedRewardRate: {
      num: appliedRateNum,
      den: rateDen,
      note: `${poolCount}× per-pool rate with equal allocPoints (undoes dilution)`
    },
    farms: farmsManifest
  };
  if (ogNft) {
    networkEntry.ogNft = ogNft;
  }

  mergeLiquidityJson(
    outputPath,
    config.admin,
    config.rewardRate,
    networkName,
    networkEntry
  );

  console.log(
    `\n[${getTimestamp()}] Farming season Liquidity deploy complete.`
  );
  console.log(`  OVERP:     ${overpAddr}`);
  console.log(`  Liquidity: ${liquidityAddr}`);
  for (const [pid, farmCfg] of farmConfigs.entries()) {
    console.log(`  Pool ${pid} ${farmCfg.key}: asset ${farmCfg.stakedAsset}`);
  }
  console.log(
    `  Origin:    shrimp=${originNfts.shrimp} dolphin=${originNfts.dolphin} whale=${originNfts.whale}`
  );
  if (ogNft) {
    console.log(`  OG:        ${ogNft}`);
  }
  console.log(`  Manifest:  ${outputPath}`);
}

main().catch((err) => {
  console.error(`[${getTimestamp()}] Farming Liquidity deploy failed →`, err);
  process.exitCode = 1;
});
