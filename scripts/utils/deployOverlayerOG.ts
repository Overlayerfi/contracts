import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";

type Deployment = {
  contractName: string;
  address: string;
  transactionHash: string;
};

type RoyaltyConfig = {
  receiver: string;
  feeNumerator: bigint;
};

type OgConstructorConfig = {
  initialOwner: string;
  baseURI: string;
  royalty: RoyaltyConfig;
  feeCollector: string;
  mintStartTime: bigint;
};

type OgDeploymentManifest = {
  deployedAt: string;
  network: {
    name: string;
    chainId: string;
  };
  deployer: string;
  constructorConfig: {
    og: {
      initialOwner: string;
      baseURI: string;
      royalty: {
        receiver: string;
        feeNumerator: string;
      };
      feeCollector: string;
      mintStartTime: string;
      maxSupply: string;
      mintPriceEth: string;
      bonus: {
        numerator: string;
        denominator: string;
      };
      publicMintStartTime: string;
      note: string;
    };
  };
  contracts: Deployment[];
};

const ROYALTY_BPS_MAX = 1_000n;
const OG_MAX_SUPPLY = "2000";
const OG_MINT_PRICE = "0.005";
const OG_BONUS_NUMERATOR = "0";
const OG_BONUS_DENOMINATOR = "100";

/**
 * Deploys OverlayerOG for the selected network.
 *
 * Supply (2,000), mint price (0.005 ETH), and the 14-day whitelist-only window
 * are contract constants. This collection is mint-only (non-transferable,
 * non-burnable) and is the Eth hub NFT for spoke OG entitlement sync.
 *
 * Required:
 * - ORIGIN_NFT_OG_BASE_URI
 * - ORIGIN_NFT_OG_FEE_COLLECTOR or ORIGIN_NFT_FEE_COLLECTOR
 * - ORIGIN_NFT_OG_MINT_START_TIME or ORIGIN_NFT_MINT_START_TIME
 *
 * Optional:
 * - ORIGIN_NFT_OG_INITIAL_OWNER or ORIGIN_NFT_INITIAL_OWNER (defaults to deployer)
 * - ORIGIN_NFT_OG_ROYALTY_RECEIVER or ORIGIN_NFT_ROYALTY_RECEIVER (defaults to zero)
 * - ORIGIN_NFT_OG_ROYALTY_BPS or ORIGIN_NFT_ROYALTY_BPS (defaults to 0; maximum 1,000)
 * - ORIGIN_NFT_OG_DEPLOYMENT_OUTPUT_PATH or ORIGIN_NFT_DEPLOYMENT_OUTPUT_PATH
 *
 * Origin Shrimp / Dolphin / Whale are deployed separately via
 * deployOverlayerOriginNfts.ts. Use this script to deploy OG only.
 *
 * Example:
 * ORIGIN_NFT_FEE_COLLECTOR=0x... \
 * ORIGIN_NFT_OG_BASE_URI=https://api.overlayer.fi/api-nft/origin/og.json \
 * ORIGIN_NFT_MINT_START_TIME=1786971600 \
 * npx hardhat run scripts/utils/deployOverlayerOG.ts --network eth
 *
 * Or:
 * bash scripts/utils/deployOriginOg.sh
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

function ogCollectionConfig(deployerAddress: string): OgConstructorConfig {
  const royaltyReceiver = addressFromEnv(
    ["ORIGIN_NFT_OG_ROYALTY_RECEIVER", "ORIGIN_NFT_ROYALTY_RECEIVER"],
    ethers.ZeroAddress
  );
  const royaltyFeeNumerator = unsignedIntegerFromEnv(
    ["ORIGIN_NFT_OG_ROYALTY_BPS", "ORIGIN_NFT_ROYALTY_BPS"],
    "0"
  );

  if (royaltyFeeNumerator > ROYALTY_BPS_MAX) {
    throw new Error(`ORIGIN_NFT_OG_ROYALTY_BPS must not exceed ${ROYALTY_BPS_MAX}`);
  }
  if (royaltyFeeNumerator !== 0n && royaltyReceiver === ethers.ZeroAddress) {
    throw new Error(
      "ORIGIN_NFT_OG_ROYALTY_RECEIVER must be set when ORIGIN_NFT_OG_ROYALTY_BPS is non-zero"
    );
  }

  const feeCollector = addressFromEnv([
    "ORIGIN_NFT_OG_FEE_COLLECTOR",
    "ORIGIN_NFT_FEE_COLLECTOR"
  ]);
  if (feeCollector === ethers.ZeroAddress) {
    throw new Error("ORIGIN_NFT_OG_FEE_COLLECTOR must not be the zero address");
  }

  return {
    initialOwner: addressFromEnv(
      ["ORIGIN_NFT_OG_INITIAL_OWNER", "ORIGIN_NFT_INITIAL_OWNER"],
      deployerAddress
    ),
    baseURI: requiredEnv(["ORIGIN_NFT_OG_BASE_URI"]),
    royalty: {
      receiver: royaltyReceiver,
      feeNumerator: royaltyFeeNumerator
    },
    feeCollector,
    mintStartTime: unsignedIntegerFromEnv([
      "ORIGIN_NFT_OG_MINT_START_TIME",
      "ORIGIN_NFT_MINT_START_TIME"
    ])
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

function ogManifest(config: OgConstructorConfig) {
  return {
    initialOwner: config.initialOwner,
    baseURI: config.baseURI,
    royalty: {
      receiver: config.royalty.receiver,
      feeNumerator: config.royalty.feeNumerator.toString()
    },
    feeCollector: config.feeCollector,
    mintStartTime: config.mintStartTime.toString(),
    maxSupply: OG_MAX_SUPPLY,
    mintPriceEth: OG_MINT_PRICE,
    bonus: {
      numerator: OG_BONUS_NUMERATOR,
      denominator: OG_BONUS_DENOMINATOR
    },
    publicMintStartTime: "0",
    note: "Soulbound; 14-day whitelist-only window; max supply and price are contract constants"
  };
}

async function writeDeploymentManifest(
  manifest: OgDeploymentManifest
): Promise<string> {
  const outputPath =
    process.env.ORIGIN_NFT_OG_DEPLOYMENT_OUTPUT_PATH?.trim() ||
    process.env.ORIGIN_NFT_DEPLOYMENT_OUTPUT_PATH?.trim();
  const timestamp = manifest.deployedAt.replace(/[:.]/g, "-");
  const defaultPath = join(
    "deployments",
    "overlayer-og",
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
  const og = ogCollectionConfig(deployerAddress);

  console.log(
    `Deploying OverlayerOG from ${deployerAddress} on ${network.name} (chain ${providerNetwork.chainId})`
  );
  console.log(
    `  mintStartTime: ${og.mintStartTime} (${new Date(
      Number(og.mintStartTime) * 1000
    ).toISOString()})`
  );
  console.log(`  mint price:    ${OG_MINT_PRICE} ETH (fixed)`);
  console.log(`  max supply:    ${OG_MAX_SUPPLY}`);

  const deployments = [
    await deployCollection("OverlayerOG", [
      og.initialOwner,
      og.baseURI,
      og.royalty.receiver,
      og.royalty.feeNumerator,
      og.feeCollector,
      og.mintStartTime
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
      og: ogManifest(og)
    },
    contracts: deployments
  });
  console.log(`Deployment manifest written to ${manifestPath}`);
}

main().catch((error: unknown) => {
  console.error("Overlayer OG deployment failed:", error);
  process.exitCode = 1;
});
