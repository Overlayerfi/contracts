/**
 * tmp / testnet only — mainnet Origin NFTs already exist.
 * Run before deployFarmingSeasonLiquidity on testnets.
 *
 * Deploys three BonusNFTMock collections (Shrimp / Dolphin / Whale), mints 10
 * of each to a fixed recipient, and merges addresses into
 * testnet-deployments/mock-origin-nfts.json.
 *
 * Usage:
 *   npx hardhat run scripts/utils/deployMockOriginNfts.tmp.ts --network eth_sepolia
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ethers, network } from "hardhat";

const RECIPIENT = "0x1b4b7eD919416550457d142E54e7f98583E4B018";
const MINT_PER_COLLECTION = 10;
const BONUS_DENOMINATOR = 100;
const OUTPUT_PATH = "testnet-deployments/mock-origin-nfts.json";

type CollectionBonus = {
  address: string;
  bonusNumerator: number;
  bonusDenominator: number;
};

type NetworkDeployment = {
  chainId: number;
  deployedAt: string;
  shrimp: CollectionBonus;
  dolphin: CollectionBonus;
  whale: CollectionBonus;
};

type Manifest = {
  recipient: string;
  mintPerCollection: number;
  networks: Record<string, NetworkDeployment>;
};

type CollectionSpec = {
  key: "shrimp" | "dolphin" | "whale";
  name: string;
  symbol: string;
  bonusNumerator: number;
};

const COLLECTIONS: CollectionSpec[] = [
  { key: "shrimp", name: "Shrimp", symbol: "SHRIMP", bonusNumerator: 1 },
  { key: "dolphin", name: "Dolphin", symbol: "DOLPHIN", bonusNumerator: 5 },
  { key: "whale", name: "Whale", symbol: "WHALE", bonusNumerator: 10 }
];

async function loadManifest(absolutePath: string): Promise<Manifest> {
  try {
    const raw = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    return {
      recipient: parsed.recipient ?? RECIPIENT,
      mintPerCollection: parsed.mintPerCollection ?? MINT_PER_COLLECTION,
      networks: parsed.networks ?? {}
    };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === "ENOENT") {
      return {
        recipient: RECIPIENT,
        mintPerCollection: MINT_PER_COLLECTION,
        networks: {}
      };
    }
    throw error;
  }
}

async function deployAndMint(
  spec: CollectionSpec,
  recipient: string
): Promise<CollectionBonus> {
  const factory = await ethers.getContractFactory("BonusNFTMock");
  const nft = await factory.deploy(
    spec.name,
    spec.symbol,
    spec.bonusNumerator,
    BONUS_DENOMINATOR
  );
  await nft.waitForDeployment();

  const address = await nft.getAddress();
  console.log(
    `${spec.name} (${spec.symbol}) BonusNFTMock deployed at ${address}`
  );

  for (let i = 0; i < MINT_PER_COLLECTION; i++) {
    const tx = await nft.mint(recipient);
    await tx.wait();
  }
  console.log(`Minted ${MINT_PER_COLLECTION} ${spec.symbol} to ${recipient}`);

  return {
    address,
    bonusNumerator: spec.bonusNumerator,
    bonusDenominator: BONUS_DENOMINATOR
  };
}

export async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();
  const chainId = Number(providerNetwork.chainId);
  const absolutePath = resolve(OUTPUT_PATH);

  console.log(
    `Deploying mock Origin NFTs from ${deployerAddress} on ${network.name} (chain ${chainId})`
  );
  console.log(`Recipient / mint target: ${RECIPIENT}`);

  const deployed: Record<"shrimp" | "dolphin" | "whale", CollectionBonus> = {
    shrimp: await deployAndMint(COLLECTIONS[0], RECIPIENT),
    dolphin: await deployAndMint(COLLECTIONS[1], RECIPIENT),
    whale: await deployAndMint(COLLECTIONS[2], RECIPIENT)
  };

  const existing = await loadManifest(absolutePath);
  const manifest: Manifest = {
    recipient: RECIPIENT,
    mintPerCollection: MINT_PER_COLLECTION,
    networks: {
      ...existing.networks,
      [network.name]: {
        chainId,
        deployedAt: new Date().toISOString(),
        shrimp: deployed.shrimp,
        dolphin: deployed.dolphin,
        whale: deployed.whale
      }
    }
  };

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("\nMock Origin NFT addresses:");
  console.log(`  shrimp:  ${deployed.shrimp.address}`);
  console.log(`  dolphin: ${deployed.dolphin.address}`);
  console.log(`  whale:   ${deployed.whale.address}`);
  console.log(`Manifest written to ${absolutePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Mock Origin NFT deployment failed:", error);
    process.exit(1);
  });
