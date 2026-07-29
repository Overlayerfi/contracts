import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";

type Deployment = {
  contractName: string;
  address: string;
  transactionHash: string;
};

type PricingManifest = {
  initialMintPriceWei: string;
  initialMintPriceEth: string;
  priceIncrementWei: string;
  priceIncrementEth: string;
  priceUnitDelta: string;
};

type RoyaltyConfig = {
  receiver: string;
  feeNumerator: bigint;
};

type CollectionConstructorConfig = {
  initialOwner: string;
  baseURI: string;
  royalty: RoyaltyConfig;
  maxSupply: bigint;
  bonusNumerator: bigint;
  mintStartTime: bigint;
};

type PaidCollectionConstructorConfig = CollectionConstructorConfig & {
  feeCollector: string;
  initialMintPrice: bigint;
  priceIncrement: bigint;
  priceUnitDelta: bigint;
};

type CollectionManifest = {
  initialOwner: string;
  baseURI: string;
  royalty: {
    receiver: string;
    feeNumerator: string;
  };
  maxSupply: string;
  bonus: {
    numerator: string;
    denominator: string;
  };
  mintStartTime: string;
};

type PaidCollectionManifest = CollectionManifest & {
  feeCollector: string;
  pricing: PricingManifest;
};

type DeploymentManifest = {
  deployedAt: string;
  network: {
    name: string;
    chainId: string;
  };
  deployer: string;
  constructorConfig: {
    shrimp: CollectionManifest;
    dolphin: PaidCollectionManifest;
    whale: PaidCollectionManifest;
  };
  contracts: Deployment[];
};

const ROYALTY_BPS_MAX = 1_000n;
const BONUS_DENOMINATOR = 100n;
const DEFAULT_SHRIMP_MAX_SUPPLY = "20000";
const DEFAULT_SHRIMP_BONUS_NUMERATOR = "1";
const DEFAULT_DOLPHIN_MAX_SUPPLY = "1500";
const DEFAULT_DOLPHIN_BONUS_NUMERATOR = "5";
const DEFAULT_DOLPHIN_INITIAL_MINT_PRICE = "0.013";
const DEFAULT_DOLPHIN_PRICE_INCREMENT = "0.0026";
const DEFAULT_WHALE_MAX_SUPPLY = "500";
const DEFAULT_WHALE_BONUS_NUMERATOR = "10";
const DEFAULT_WHALE_INITIAL_MINT_PRICE = "0.13";
const DEFAULT_WHALE_PRICE_INCREMENT = "0.0026";
const DEFAULT_PRICE_UNIT_DELTA = "25";

/**
 * Deploys Shrimp, Dolphin, and Whale for the selected network.
 *
 * Every wrapper-constructor input has a tier-specific environment variable.
 * `INITIAL_OWNER`, `ROYALTY_RECEIVER`, `ROYALTY_BPS`, `FEE_COLLECTOR`, and
 * `MINT_START_TIME` accept a shared `ORIGIN_NFT_*` fallback to make common
 * deployment settings concise.
 *
 * Required:
 * - ORIGIN_NFT_SHRIMP_BASE_URI
 * - ORIGIN_NFT_DOLPHIN_BASE_URI
 * - ORIGIN_NFT_WHALE_BASE_URI
 * - ORIGIN_NFT_{SHRIMP,DOLPHIN,WHALE}_MINT_START_TIME or
 *   ORIGIN_NFT_MINT_START_TIME (Unix timestamp in seconds)
 * - ORIGIN_NFT_{DOLPHIN,WHALE}_FEE_COLLECTOR or ORIGIN_NFT_FEE_COLLECTOR
 *
 * Per-tier overrides, where `<TIER>` is `SHRIMP`, `DOLPHIN`, or `WHALE`:
 * - ORIGIN_NFT_<TIER>_INITIAL_OWNER
 * - ORIGIN_NFT_<TIER>_ROYALTY_RECEIVER
 * - ORIGIN_NFT_<TIER>_ROYALTY_BPS
 * - ORIGIN_NFT_<TIER>_BASE_URI
 * - ORIGIN_NFT_<TIER>_MAX_SUPPLY
 * - ORIGIN_NFT_<TIER>_BONUS_NUMERATOR
 * - ORIGIN_NFT_<TIER>_MINT_START_TIME
 *
 * Paid-tier-only values:
 * - ORIGIN_NFT_{DOLPHIN,WHALE}_FEE_COLLECTOR
 * - ORIGIN_NFT_{DOLPHIN,WHALE}_INITIAL_MINT_PRICE
 * - ORIGIN_NFT_{DOLPHIN,WHALE}_PRICE_INCREMENT
 * - ORIGIN_NFT_{DOLPHIN,WHALE}_PRICE_UNIT_DELTA
 *
 * Shared fallback values:
 * - ORIGIN_NFT_INITIAL_OWNER (defaults to the deployer)
 * - ORIGIN_NFT_ROYALTY_RECEIVER (defaults to the zero address)
 * - ORIGIN_NFT_ROYALTY_BPS (defaults to 0; maximum 1,000)
 * - ORIGIN_NFT_FEE_COLLECTOR
 * - ORIGIN_NFT_MINT_START_TIME
 * - ORIGIN_NFT_DEPLOYMENT_OUTPUT_PATH (defaults to a timestamped JSON file
 *   under deployments/overlayer-origin-nfts)
 *
 * Defaults:
 * - Shrimp: max supply 20,000; bonus 1 / 100.
 * - Dolphin: max supply 1,500; bonus 5 / 100; price 0.01 ETH,
 *   plus 0.0003 ETH every 25 mints.
 * - Whale: max supply 500; bonus 10 / 100; price 0.03 ETH,
 *   plus 0.001 ETH every 25 mints.
 *
 * Example:
 * ORIGIN_NFT_FEE_COLLECTOR=0x... \
 * ORIGIN_NFT_SHRIMP_BASE_URI=ipfs://.../shrimp/ \
 * ORIGIN_NFT_DOLPHIN_BASE_URI=ipfs://.../dolphin/ \
 * ORIGIN_NFT_WHALE_BASE_URI=ipfs://.../whale/ \
 * ORIGIN_NFT_MINT_START_TIME=1750000000 \
 * npx hardhat run scripts/utils/deployOverlayerOriginNfts.ts --network eth_sepolia
 */
function environmentValue(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function environmentLabel(names: readonly string[]): string {
  return names.join(" or ");
}

function requiredEnv(names: readonly string[]): string {
  const value = environmentValue(names);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${environmentLabel(names)}`
    );
  }

  return value;
}

function addressFromEnv(
  names: readonly string[],
  defaultValue?: string
): string {
  const value = environmentValue(names) ?? defaultValue;
  if (!value || !ethers.isAddress(value)) {
    throw new Error(
      `Expected ${environmentLabel(names)} to be a valid EVM address`
    );
  }

  return ethers.getAddress(value);
}

function unsignedIntegerFromEnv(
  names: readonly string[],
  defaultValue?: string
): bigint {
  const value = environmentValue(names) ?? defaultValue;
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(
      `Expected ${environmentLabel(names)} to be a non-negative integer`
    );
  }

  return BigInt(value);
}

function positiveUnsignedIntegerFromEnv(
  names: readonly string[],
  defaultValue?: string
): bigint {
  const value = unsignedIntegerFromEnv(names, defaultValue);
  if (value === 0n) {
    throw new Error(
      `Expected ${environmentLabel(names)} to be greater than zero`
    );
  }

  return value;
}

function etherAmountFromEnv(
  names: readonly string[],
  defaultValue?: string
): bigint {
  const value = environmentValue(names) ?? defaultValue;

  try {
    if (!value) throw new Error("missing amount");

    const amount = ethers.parseEther(value);
    if (amount < 0n) {
      throw new Error("negative amount");
    }

    return amount;
  } catch {
    throw new Error(
      `Expected ${environmentLabel(names)} to be a non-negative ETH amount`
    );
  }
}

function collectionConfig(
  tier: "SHRIMP" | "DOLPHIN" | "WHALE",
  deployerAddress: string,
  defaultMaxSupply: string,
  defaultBonusNumerator: string
): CollectionConstructorConfig {
  const prefix = `ORIGIN_NFT_${tier}`;
  const royaltyReceiver = addressFromEnv(
    [`${prefix}_ROYALTY_RECEIVER`, "ORIGIN_NFT_ROYALTY_RECEIVER"],
    ethers.ZeroAddress
  );
  const royaltyFeeNumerator = unsignedIntegerFromEnv(
    [`${prefix}_ROYALTY_BPS`, "ORIGIN_NFT_ROYALTY_BPS"],
    "0"
  );

  if (royaltyFeeNumerator > ROYALTY_BPS_MAX) {
    throw new Error(`${prefix}_ROYALTY_BPS must not exceed ${ROYALTY_BPS_MAX}`);
  }
  if (royaltyFeeNumerator !== 0n && royaltyReceiver === ethers.ZeroAddress) {
    throw new Error(
      `${prefix}_ROYALTY_RECEIVER must be set when ${prefix}_ROYALTY_BPS is non-zero`
    );
  }

  return {
    initialOwner: addressFromEnv(
      [`${prefix}_INITIAL_OWNER`, "ORIGIN_NFT_INITIAL_OWNER"],
      deployerAddress
    ),
    baseURI: requiredEnv([`${prefix}_BASE_URI`]),
    royalty: {
      receiver: royaltyReceiver,
      feeNumerator: royaltyFeeNumerator
    },
    maxSupply: positiveUnsignedIntegerFromEnv(
      [`${prefix}_MAX_SUPPLY`],
      defaultMaxSupply
    ),
    bonusNumerator: unsignedIntegerFromEnv(
      [`${prefix}_BONUS_NUMERATOR`],
      defaultBonusNumerator
    ),
    mintStartTime: unsignedIntegerFromEnv([
      `${prefix}_MINT_START_TIME`,
      "ORIGIN_NFT_MINT_START_TIME"
    ])
  };
}

function paidCollectionConfig(
  tier: "DOLPHIN" | "WHALE",
  deployerAddress: string,
  defaultMaxSupply: string,
  defaultBonusNumerator: string,
  defaultInitialMintPrice: string,
  defaultPriceIncrement: string
): PaidCollectionConstructorConfig {
  const prefix = `ORIGIN_NFT_${tier}`;
  const config = collectionConfig(
    tier,
    deployerAddress,
    defaultMaxSupply,
    defaultBonusNumerator
  );
  const feeCollector = addressFromEnv([
    `${prefix}_FEE_COLLECTOR`,
    "ORIGIN_NFT_FEE_COLLECTOR"
  ]);
  const initialMintPrice = etherAmountFromEnv(
    [`${prefix}_INITIAL_MINT_PRICE`],
    defaultInitialMintPrice
  );
  const priceIncrement = etherAmountFromEnv(
    [`${prefix}_PRICE_INCREMENT`],
    defaultPriceIncrement
  );
  const priceUnitDelta = positiveUnsignedIntegerFromEnv(
    [`${prefix}_PRICE_UNIT_DELTA`],
    DEFAULT_PRICE_UNIT_DELTA
  );

  if (feeCollector === ethers.ZeroAddress) {
    throw new Error(`${prefix}_FEE_COLLECTOR must not be the zero address`);
  }
  if (initialMintPrice === 0n && priceIncrement === 0n) {
    throw new Error(`${tier} mint pricing must include a non-zero price`);
  }

  return {
    ...config,
    feeCollector,
    initialMintPrice,
    priceIncrement,
    priceUnitDelta
  };
}

async function deployCollection(
  contractName: string,
  constructorArguments: unknown[]
): Promise<Deployment> {
  const factory = await ethers.getContractFactory(contractName);
  const contract = await factory.deploy(...constructorArguments);
  const deploymentTransaction = contract.deploymentTransaction();
  if (!deploymentTransaction) {
    throw new Error(`Missing deployment transaction for ${contractName}`);
  }

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(
    `${contractName} deployed at ${address} (${deploymentTransaction.hash})`
  );

  return {
    contractName,
    address,
    transactionHash: deploymentTransaction.hash
  };
}

function pricingManifest(
  initialMintPrice: bigint,
  priceIncrement: bigint,
  priceUnitDelta: bigint
): PricingManifest {
  return {
    initialMintPriceWei: initialMintPrice.toString(),
    initialMintPriceEth: ethers.formatEther(initialMintPrice),
    priceIncrementWei: priceIncrement.toString(),
    priceIncrementEth: ethers.formatEther(priceIncrement),
    priceUnitDelta: priceUnitDelta.toString()
  };
}

function collectionManifest(
  config: CollectionConstructorConfig
): CollectionManifest {
  return {
    initialOwner: config.initialOwner,
    baseURI: config.baseURI,
    royalty: {
      receiver: config.royalty.receiver,
      feeNumerator: config.royalty.feeNumerator.toString()
    },
    maxSupply: config.maxSupply.toString(),
    bonus: {
      numerator: config.bonusNumerator.toString(),
      denominator: BONUS_DENOMINATOR.toString()
    },
    mintStartTime: config.mintStartTime.toString()
  };
}

function paidCollectionManifest(
  config: PaidCollectionConstructorConfig
): PaidCollectionManifest {
  return {
    ...collectionManifest(config),
    feeCollector: config.feeCollector,
    pricing: pricingManifest(
      config.initialMintPrice,
      config.priceIncrement,
      config.priceUnitDelta
    )
  };
}

async function writeDeploymentManifest(
  manifest: DeploymentManifest
): Promise<string> {
  const outputPath = process.env.ORIGIN_NFT_DEPLOYMENT_OUTPUT_PATH?.trim();
  const timestamp = manifest.deployedAt.replace(/[:.]/g, "-");
  const defaultPath = join(
    "deployments",
    "overlayer-origin-nfts",
    `${manifest.network.name}-${manifest.network.chainId}-${timestamp}.json`
  );
  const absolutePath = resolve(outputPath || defaultPath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`);

  return absolutePath;
}

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();

  const shrimp = collectionConfig(
    "SHRIMP",
    deployerAddress,
    DEFAULT_SHRIMP_MAX_SUPPLY,
    DEFAULT_SHRIMP_BONUS_NUMERATOR
  );
  const dolphin = paidCollectionConfig(
    "DOLPHIN",
    deployerAddress,
    DEFAULT_DOLPHIN_MAX_SUPPLY,
    DEFAULT_DOLPHIN_BONUS_NUMERATOR,
    DEFAULT_DOLPHIN_INITIAL_MINT_PRICE,
    DEFAULT_DOLPHIN_PRICE_INCREMENT
  );
  const whale = paidCollectionConfig(
    "WHALE",
    deployerAddress,
    DEFAULT_WHALE_MAX_SUPPLY,
    DEFAULT_WHALE_BONUS_NUMERATOR,
    DEFAULT_WHALE_INITIAL_MINT_PRICE,
    DEFAULT_WHALE_PRICE_INCREMENT
  );

  console.log(
    `Deploying from ${deployerAddress} on ${network.name} (chain ${providerNetwork.chainId})`
  );

  const deployments = [
    await deployCollection("OverlayerOriginShrimp", [
      {
        initialOwner: shrimp.initialOwner,
        baseURI: shrimp.baseURI,
        royaltyReceiver: shrimp.royalty.receiver,
        royaltyFeeNumerator: shrimp.royalty.feeNumerator,
        maxSupply: shrimp.maxSupply,
        bonusNumerator: shrimp.bonusNumerator,
        mintStartTime: shrimp.mintStartTime
      }
    ]),
    await deployCollection("OverlayerOriginDolphin", [
      {
        initialOwner: dolphin.initialOwner,
        baseURI: dolphin.baseURI,
        royaltyReceiver: dolphin.royalty.receiver,
        royaltyFeeNumerator: dolphin.royalty.feeNumerator,
        feeCollector: dolphin.feeCollector,
        initialMintPrice: dolphin.initialMintPrice,
        priceIncrement: dolphin.priceIncrement,
        priceUnitDelta: dolphin.priceUnitDelta,
        maxSupply: dolphin.maxSupply,
        bonusNumerator: dolphin.bonusNumerator,
        mintStartTime: dolphin.mintStartTime
      }
    ]),
    await deployCollection("OverlayerOriginWhale", [
      {
        initialOwner: whale.initialOwner,
        baseURI: whale.baseURI,
        royaltyReceiver: whale.royalty.receiver,
        royaltyFeeNumerator: whale.royalty.feeNumerator,
        feeCollector: whale.feeCollector,
        initialMintPrice: whale.initialMintPrice,
        priceIncrement: whale.priceIncrement,
        priceUnitDelta: whale.priceUnitDelta,
        maxSupply: whale.maxSupply,
        bonusNumerator: whale.bonusNumerator,
        mintStartTime: whale.mintStartTime
      }
    ])
  ];

  console.log("\nDeployment summary:");
  console.table(deployments);

  const manifestPath = await writeDeploymentManifest({
    deployedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: providerNetwork.chainId.toString()
    },
    deployer: deployerAddress,
    constructorConfig: {
      shrimp: collectionManifest(shrimp),
      dolphin: paidCollectionManifest(dolphin),
      whale: paidCollectionManifest(whale)
    },
    contracts: deployments
  });
  console.log(`Deployment manifest written to ${manifestPath}`);
}

main().catch((error: unknown) => {
  console.error("Overlayer NFT deployment failed:", error);
  process.exitCode = 1;
});
