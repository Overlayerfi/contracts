import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";

/**
 * Robinhood Chain Origin NFT deployment.
 *
 * Aligns the public sale with eth/base Dolphin & Whale:
 * - whitelist start:  2026-07-20 13:00:00 UTC (1784552400)
 * - public start:     2026-08-03 13:00:00 UTC (1785762000)
 * - mint end:         2026-08-17 13:00:00 UTC (1786971600)
 *
 * Robinhood deploys all three tiers via OverlayerOriginShrimpRobinHood (flat
 * 0.004 ETH) plus Dolphin and Whale at eth/base pricing.
 *
 * Run:
 *   npx hardhat run scripts/utils/deployOverlayerOriginNftsRobinhood.ts --network robinhood
 *
 * Or via the shell wrapper:
 *   bash scripts/utils/deployOriginRobinhood.sh
 */

type Deployment = {
  contractName: string;
  address: string;
  transactionHash: string;
};

const ROBINHOOD_CHAIN_ID = 4663n;

// Same mintStartTime as eth/base so publicMintStartTime lands on Aug 3 13:00 UTC.
const MINT_START_TIME = 1784552400n;
const PUBLIC_MINT_START_TIME = MINT_START_TIME + 14n * 24n * 60n * 60n; // 1785762000
const MINT_END_TIME = MINT_START_TIME + 28n * 24n * 60n * 60n; // 1786971600

const INITIAL_OWNER = "0xABE9A7c88107C55283A211B847F747e26Edc09ED";
const ROYALTY_RECEIVER = "0x45FaCBb6018637A43Ec4b1Ff7467DBc811d13d75";
const FEE_COLLECTOR = "0x45FaCBb6018637A43Ec4b1Ff7467DBc811d13d75";
const ROYALTY_BPS = 0n;

const SHRIMP_BASE_URI = "https://app.overlayer.fi/origin/shrimp.json";
const DOLPHIN_BASE_URI = "https://app.overlayer.fi/origin/dolphin.json";
const WHALE_BASE_URI = "https://app.overlayer.fi/origin/whale.json";

const SHRIMP_MAX_SUPPLY = 5_000n;
const SHRIMP_BONUS_NUMERATOR = 1n;
const SHRIMP_INITIAL_MINT_PRICE = ethers.parseEther("0.004");
const SHRIMP_PRICE_INCREMENT = 0n;
const SHRIMP_PRICE_UNIT_DELTA = SHRIMP_MAX_SUPPLY;

const DOLPHIN_MAX_SUPPLY = 600n;
const DOLPHIN_BONUS_NUMERATOR = 5n;
const DOLPHIN_INITIAL_MINT_PRICE = ethers.parseEther("0.013");
const DOLPHIN_PRICE_INCREMENT = ethers.parseEther("0.0026");
const DOLPHIN_PRICE_UNIT_DELTA = 300n;

const WHALE_MAX_SUPPLY = 200n;
const WHALE_BONUS_NUMERATOR = 10n;
const WHALE_INITIAL_MINT_PRICE = ethers.parseEther("0.13");
const WHALE_PRICE_INCREMENT = ethers.parseEther("0.0026");
const WHALE_PRICE_UNIT_DELTA = 100n;

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

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();

  if (providerNetwork.chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error(
      `Expected Robinhood chainId ${ROBINHOOD_CHAIN_ID}, got ${providerNetwork.chainId}. Use --network robinhood.`
    );
  }

  const shrimpConfig = {
    initialOwner: INITIAL_OWNER,
    baseURI: SHRIMP_BASE_URI,
    royaltyReceiver: ROYALTY_RECEIVER,
    royaltyFeeNumerator: ROYALTY_BPS,
    feeCollector: FEE_COLLECTOR,
    initialMintPrice: SHRIMP_INITIAL_MINT_PRICE,
    priceIncrement: SHRIMP_PRICE_INCREMENT,
    priceUnitDelta: SHRIMP_PRICE_UNIT_DELTA,
    maxSupply: SHRIMP_MAX_SUPPLY,
    bonusNumerator: SHRIMP_BONUS_NUMERATOR,
    mintStartTime: MINT_START_TIME
  };

  const dolphinConfig = {
    initialOwner: INITIAL_OWNER,
    baseURI: DOLPHIN_BASE_URI,
    royaltyReceiver: ROYALTY_RECEIVER,
    royaltyFeeNumerator: ROYALTY_BPS,
    feeCollector: FEE_COLLECTOR,
    initialMintPrice: DOLPHIN_INITIAL_MINT_PRICE,
    priceIncrement: DOLPHIN_PRICE_INCREMENT,
    priceUnitDelta: DOLPHIN_PRICE_UNIT_DELTA,
    maxSupply: DOLPHIN_MAX_SUPPLY,
    bonusNumerator: DOLPHIN_BONUS_NUMERATOR,
    mintStartTime: MINT_START_TIME
  };

  const whaleConfig = {
    initialOwner: INITIAL_OWNER,
    baseURI: WHALE_BASE_URI,
    royaltyReceiver: ROYALTY_RECEIVER,
    royaltyFeeNumerator: ROYALTY_BPS,
    feeCollector: FEE_COLLECTOR,
    initialMintPrice: WHALE_INITIAL_MINT_PRICE,
    priceIncrement: WHALE_PRICE_INCREMENT,
    priceUnitDelta: WHALE_PRICE_UNIT_DELTA,
    maxSupply: WHALE_MAX_SUPPLY,
    bonusNumerator: WHALE_BONUS_NUMERATOR,
    mintStartTime: MINT_START_TIME
  };

  console.log(
    `Deploying from ${deployerAddress} on ${network.name} (chain ${providerNetwork.chainId})`
  );
  console.log("Aligned mint schedule (matches eth/base Dolphin & Whale):");
  console.log(
    `  mintStartTime (whitelist): ${MINT_START_TIME} (${new Date(Number(MINT_START_TIME) * 1000).toISOString()})`
  );
  console.log(
    `  publicMintStartTime:       ${PUBLIC_MINT_START_TIME} (${new Date(Number(PUBLIC_MINT_START_TIME) * 1000).toISOString()})`
  );
  console.log(
    `  mintEndTime:               ${MINT_END_TIME} (${new Date(Number(MINT_END_TIME) * 1000).toISOString()})`
  );
  console.log(
    `  shrimp price:              ${ethers.formatEther(SHRIMP_INITIAL_MINT_PRICE)} ETH (flat)`
  );

  const deployments = [
    await deployCollection("OverlayerOriginShrimpRobinHood", [shrimpConfig]),
    await deployCollection("OverlayerOriginDolphin", [dolphinConfig]),
    await deployCollection("OverlayerOriginWhale", [whaleConfig])
  ];

  console.log("\nDeployment summary:");
  console.table(deployments);

  const deployedAt = new Date().toISOString();
  const timestamp = deployedAt.replace(/[:.]/g, "-");
  const outputPath = resolve(
    process.env.ORIGIN_NFT_DEPLOYMENT_OUTPUT_PATH?.trim() ||
      join(
        "mainnet-deployment",
        "origin",
        `robinhood-${providerNetwork.chainId}-${timestamp}.json`
      )
  );

  const manifest = {
    deployedAt,
    network: {
      name: network.name,
      chainId: providerNetwork.chainId.toString()
    },
    deployer: deployerAddress,
    schedule: {
      mintStartTime: MINT_START_TIME.toString(),
      publicMintStartTime: PUBLIC_MINT_START_TIME.toString(),
      mintEndTime: MINT_END_TIME.toString(),
      note: "Aligned with eth/base public sale (Aug 3–17 2026 13:00 UTC)"
    },
    constructorConfig: {
      shrimp: {
        ...shrimpConfig,
        initialMintPrice: SHRIMP_INITIAL_MINT_PRICE.toString(),
        priceIncrement: SHRIMP_PRICE_INCREMENT.toString(),
        priceUnitDelta: SHRIMP_PRICE_UNIT_DELTA.toString(),
        maxSupply: SHRIMP_MAX_SUPPLY.toString(),
        bonusNumerator: SHRIMP_BONUS_NUMERATOR.toString(),
        mintStartTime: MINT_START_TIME.toString(),
        royaltyFeeNumerator: ROYALTY_BPS.toString(),
        pricing: {
          initialMintPriceEth: ethers.formatEther(SHRIMP_INITIAL_MINT_PRICE),
          priceIncrementEth: ethers.formatEther(SHRIMP_PRICE_INCREMENT)
        }
      },
      dolphin: {
        ...dolphinConfig,
        initialMintPrice: DOLPHIN_INITIAL_MINT_PRICE.toString(),
        priceIncrement: DOLPHIN_PRICE_INCREMENT.toString(),
        priceUnitDelta: DOLPHIN_PRICE_UNIT_DELTA.toString(),
        maxSupply: DOLPHIN_MAX_SUPPLY.toString(),
        bonusNumerator: DOLPHIN_BONUS_NUMERATOR.toString(),
        mintStartTime: MINT_START_TIME.toString(),
        royaltyFeeNumerator: ROYALTY_BPS.toString(),
        pricing: {
          initialMintPriceEth: ethers.formatEther(DOLPHIN_INITIAL_MINT_PRICE),
          priceIncrementEth: ethers.formatEther(DOLPHIN_PRICE_INCREMENT)
        }
      },
      whale: {
        ...whaleConfig,
        initialMintPrice: WHALE_INITIAL_MINT_PRICE.toString(),
        priceIncrement: WHALE_PRICE_INCREMENT.toString(),
        priceUnitDelta: WHALE_PRICE_UNIT_DELTA.toString(),
        maxSupply: WHALE_MAX_SUPPLY.toString(),
        bonusNumerator: WHALE_BONUS_NUMERATOR.toString(),
        mintStartTime: MINT_START_TIME.toString(),
        royaltyFeeNumerator: ROYALTY_BPS.toString(),
        pricing: {
          initialMintPriceEth: ethers.formatEther(WHALE_INITIAL_MINT_PRICE),
          priceIncrementEth: ethers.formatEther(WHALE_PRICE_INCREMENT)
        }
      }
    },
    contracts: deployments
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Deployment manifest written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("Robinhood Overlayer NFT deployment failed:", error);
  process.exitCode = 1;
});
