import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ethers, network } from "hardhat";

const OG_NFT_ABI = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)"
];

/**
 * Snapshots current Eth OverlayerOG holders (mint-only, so the set is fixed
 * once minting ends). Writes one checksummed address per line for
 * configureOverlayerOGEntitlementMerkleRoot.ts (Liquidity setMerkleRoot) /
 * configureOverlayerOriginMerkleRoot.ts.
 *
 * Required:
 * - OG_NFT_ADDRESS
 *
 * Optional:
 * - OG_HOLDER_SNAPSHOT_OUTPUT_PATH (defaults under deployments/overlayer-og)
 *
 * Example:
 *   OG_NFT_ADDRESS=0xb0468b8b650D5A3DDf0f96BD1AD8a9A6c4c02183 \
 *   npx hardhat run scripts/utils/snapshotOverlayerOGHolders.ts --network eth
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const ogAddress = ethers.getAddress(requiredEnv("OG_NFT_ADDRESS"));
  const og = new ethers.Contract(ogAddress, OG_NFT_ABI, ethers.provider);
  const nextTokenId = BigInt(await og.nextTokenId());
  if (nextTokenId <= 1n) {
    throw new Error(`${ogAddress} has no minted tokens`);
  }

  const holders = new Set<string>();
  for (let tokenId = 1n; tokenId < nextTokenId; tokenId++) {
    const owner = ethers.getAddress(await og.ownerOf(tokenId));
    holders.add(owner);
  }

  const addresses = [...holders].sort((first, second) =>
    first.toLowerCase().localeCompare(second.toLowerCase())
  );
  const providerNetwork = await ethers.provider.getNetwork();
  const defaultPath = resolve(
    "deployments",
    "overlayer-og",
    `og-holders-${network.name}-${providerNetwork.chainId}.txt`
  );
  const outputPath = resolve(
    process.env.OG_HOLDER_SNAPSHOT_OUTPUT_PATH?.trim() || defaultPath
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${addresses.join("\n")}\n`);

  console.log(`OG:       ${ogAddress}`);
  console.log(`Network:  ${network.name} (chain ${providerNetwork.chainId})`);
  console.log(`Tokens:   ${nextTokenId - 1n}`);
  console.log(`Holders:  ${addresses.length}`);
  console.log(`Snapshot: ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("OG holder snapshot failed:", error);
  process.exitCode = 1;
});
