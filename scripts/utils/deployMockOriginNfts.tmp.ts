/**
 * tmp / testnet only — mainnet Origin / OG NFTs already exist.
 * Run before deployFarmingSeasonLiquidity on testnets.
 *
 * Deploys BonusNFTMock collections (Shrimp / Dolphin / Whale / OG), mints 10
 * of each to a fixed recipient, and merges addresses into
 * testnet-deployments/mock-origin-nfts.json.
 *
 * Usage:
 *   npx hardhat run scripts/utils/deployMockOriginNfts.tmp.ts --network eth_sepolia
 *
 * Note: Liquidity OG boost is hardcoded at 2.5% (25/1000) and only checks
 * balanceOf. Manifest records 25/1000 for documentation; on-chain mock
 * BonusNFTMock still deploys with 25/1000 for IBonusNFT shape consistency.
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

type CollectionKey = "shrimp" | "dolphin" | "whale" | "og";

type NetworkDeployment = {
  chainId: number;
  deployedAt: string;
  shrimp: CollectionBonus;
  dolphin: CollectionBonus;
  whale: CollectionBonus;
  og: CollectionBonus;
};

type Manifest = {
  recipient: string;
  mintPerCollection: number;
  networks: Record<string, NetworkDeployment>;
};

type CollectionSpec = {
  key: CollectionKey;
  name: string;
  symbol: string;
  bonusNumerator: number;
  bonusDenominator?: number;
};

const COLLECTIONS: CollectionSpec[] = [
  { key: "shrimp", name: "Shrimp", symbol: "SHRIMP", bonusNumerator: 1 },
  { key: "dolphin", name: "Dolphin", symbol: "DOLPHIN", bonusNumerator: 5 },
  { key: "whale", name: "Whale", symbol: "WHALE", bonusNumerator: 10 },
  // OG: documented/on-mock as 2.5%; Liquidity uses hardcoded OG_BONUS_* instead.
  {
    key: "og",
    name: "Overlayer OG Mock",
    symbol: "OG",
    bonusNumerator: 25,
    bonusDenominator: 1000
  }
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
  const bonusDenominator = spec.bonusDenominator ?? BONUS_DENOMINATOR;
  const factory = await ethers.getContractFactory("BonusNFTMock");
  const nft = await factory.deploy(
    spec.name,
    spec.symbol,
    spec.bonusNumerator,
    bonusDenominator
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
    bonusDenominator
  };
}

export async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();
  const chainId = Number(providerNetwork.chainId);
  const absolutePath = resolve(OUTPUT_PATH);

  console.log(
    `Deploying mock Origin/OG NFTs from ${deployerAddress} on ${network.name} (chain ${chainId})`
  );
  console.log(`Recipient / mint target: ${RECIPIENT}`);

  const deployed = {
    shrimp: await deployAndMint(COLLECTIONS[0], RECIPIENT),
    dolphin: await deployAndMint(COLLECTIONS[1], RECIPIENT),
    whale: await deployAndMint(COLLECTIONS[2], RECIPIENT),
    og: await deployAndMint(COLLECTIONS[3], RECIPIENT)
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
        ...deployed
      }
    }
  };

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("\nMock NFT addresses:");
  console.log(`  shrimp:  ${deployed.shrimp.address}`);
  console.log(`  dolphin: ${deployed.dolphin.address}`);
  console.log(`  whale:   ${deployed.whale.address}`);
  console.log(`  og:      ${deployed.og.address}`);
  console.log(`Manifest written to ${absolutePath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Mock Origin/OG NFT deployment failed:", error);
    process.exit(1);
  });
