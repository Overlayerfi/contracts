/**
 * Deploy farming-season Liquidity pools (OVERP + N× SingleStableStake) per network.
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
 *
 * Skips: setOgNft / whitelist / upgraded Origin wiring (post-deploy).
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
      originNfts: OriginNftsConfig;
      farms: Record<string, DeployedFarmRecord>;
    }
  >;
};

function getTimestamp(): string {
  return new Date().toISOString();
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

/**
 * Load shrimp/dolphin/whale from mock-origin-nfts.json for the current network.
 * Supports:
 * - { networks: { [networkName]: { shrimp, dolphin, whale } } }  (deployMockOriginNfts.tmp.ts)
 * - { [networkName]: { shrimp, dolphin, whale } }
 * - top-level { shrimp, dolphin, whale } when file.network.name matches
 * Each of shrimp/dolphin/whale may be a string address or `{ address: string, ... }`.
 */
function loadOriginNftsFromMockFile(
  networkName: string
): OriginNftsConfig | null {
  if (!existsSync(MOCK_ORIGIN_NFTS_PATH)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(MOCK_ORIGIN_NFTS_PATH, "utf8")) as Record<
    string,
    unknown
  >;

  let entry: Record<string, unknown> | undefined;

  // Prefer nested `networks` (canonical mock manifest shape) over a top-level key
  // that may collide with other fields.
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
      entry = networks[networkName] as Record<string, unknown>;
    }
  }

  if (
    !entry &&
    raw[networkName] &&
    typeof raw[networkName] === "object" &&
    raw[networkName] !== null
  ) {
    entry = raw[networkName] as Record<string, unknown>;
  } else if (
    !entry &&
    raw.network &&
    typeof raw.network === "object" &&
    raw.network !== null &&
    (raw.network as { name?: string }).name === networkName
  ) {
    entry = raw;
  }

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

  const admin = await ethers.getSigner(config.admin);
  console.log(`[${getTimestamp()}] Config:   ${configPath}`);
  console.log(`[${getTimestamp()}] Network:  ${networkName}`);
  console.log(`[${getTimestamp()}] Signer:   ${admin.address}`);
  console.log(
    `[${getTimestamp()}] Farms:    ${farmConfigs
      .map((f) => `${f.key}=${f.stakedAsset}`)
      .join(", ")}`
  );

  for (const farm of farmConfigs) {
    await assertDecimals18(farm.stakedAsset, farm.key);
  }

  const defaultTransactionOptions = { gasLimit: 2000000 };
  const { num: rateNum, den: rateDen } = config.rewardRate;

  // 1. Deploy OVERP (OverlayerReferral)
  const overpAddr = await deploy_OverlayerReferral(config.admin, 2);
  const overp = new ethers.Contract(
    overpAddr,
    OVERLAYER_REFERRAL_ABI.abi,
    admin.provider
  );

  // 2. Deploy one SingleStableStake per configured farm
  type RuntimeFarm = {
    key: string;
    addr: string;
    contract: Contract;
    stakedAsset: string;
    startTime: number;
    endTime: number;
  };

  const farms: RuntimeFarm[] = [];
  for (const farmCfg of farmConfigs) {
    console.log(
      `[${getTimestamp()}] Deploying SingleStableStake for ${farmCfg.key}...`
    );
    const addr = await deploy_AirdropSingleStableStake(config.admin, 2);
    const contract = new ethers.Contract(
      addr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );
    const startTime = Number(await contract.startTime());
    const endTime = startTime + config.poolDurationSeconds;
    farms.push({
      key: farmCfg.key,
      addr,
      contract,
      stakedAsset: farmCfg.stakedAsset,
      startTime,
      endTime
    });
    console.log(
      `[${getTimestamp()}] ${
        farmCfg.key
      } pool window startTime=${startTime} (constructor) endTime=${endTime} (+${
        config.poolDurationSeconds
      }s)`
    );
  }

  // 3. OVERP setMinter for each farm
  for (const farm of farms) {
    const tx = await (overp.connect(admin) as Contract).setMinter(
      farm.addr,
      defaultTransactionOptions
    );
    await tx.wait();
    console.log(
      `[${getTimestamp()}] OVERP setMinter(${farm.key}) → ${farm.addr} hash=${
        tx.hash
      }`
    );
  }

  // 4. Reward rate + pool per farm
  for (const farm of farms) {
    await SingleStableStake_setRewardForStakedAssets(
      farm.contract,
      admin,
      overpAddr,
      rateNum,
      rateDen,
      2
    );
    await SingleStableStake_addPool(
      farm.contract,
      admin,
      farm.stakedAsset,
      overpAddr,
      1,
      farm.endTime,
      config.vested,
      true,
      2
    );
    console.log(
      `[${getTimestamp()}] ${farm.key} pool added (staked=${
        farm.stakedAsset
      }, endTime=${farm.endTime})`
    );
  }

  // 5. Referral wiring
  const farmAddrs = farms.map((f) => f.addr);
  await OverlayerReferral_setStakingPools(overpAddr, farmAddrs);
  await OverlayerReferral_addTrackers(overpAddr, farmAddrs);

  // 6. Liquidity → referral + Origin NFTs
  for (const farm of farms) {
    await Liquidity_updateReferral(farm.addr, overpAddr);
    await Liquidity_setOriginNfts(
      farm.addr,
      originNfts.shrimp,
      originNfts.dolphin,
      originNfts.whale
    );
    console.log(
      `[${getTimestamp()}] ${farm.key} referral + Origin NFTs configured`
    );
  }

  const providerNetwork = await ethers.provider.getNetwork();
  const outputPath = liquidityOutputPath(networkName);
  const farmsManifest: Record<string, DeployedFarmRecord> = {};
  for (const farm of farms) {
    farmsManifest[farm.key] = {
      liquidity: farm.addr,
      stakedAsset: farm.stakedAsset,
      pid: 0,
      startTime: farm.startTime,
      endTime: farm.endTime
    };
  }

  mergeLiquidityJson(outputPath, config.admin, config.rewardRate, networkName, {
    chainId: Number(providerNetwork.chainId),
    deployedAt: getTimestamp(),
    // Network-level window mirrors the first farm (all use constructor now + duration)
    startTime: farms[0].startTime,
    endTime: farms[0].endTime,
    overp: overpAddr,
    originNfts,
    farms: farmsManifest
  });

  console.log(
    `\n[${getTimestamp()}] Farming season Liquidity deploy complete.`
  );
  console.log(`  OVERP:    ${overpAddr}`);
  for (const farm of farms) {
    console.log(`  Farm ${farm.key}: ${farm.addr} (asset ${farm.stakedAsset})`);
  }
  console.log(
    `  Origin:   shrimp=${originNfts.shrimp} dolphin=${originNfts.dolphin} whale=${originNfts.whale}`
  );
  console.log(`  Manifest: ${outputPath}`);
}

main().catch((err) => {
  console.error(`[${getTimestamp()}] Farming Liquidity deploy failed →`, err);
  process.exitCode = 1;
});
