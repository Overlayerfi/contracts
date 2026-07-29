import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";

const ORIGIN_NFT_ABI = [
  "function merkleRoot() view returns (bytes32)",
  "function merkleLeaf(address account_) pure returns (bytes32)",
  "function isMerkleWhitelisted(address account_, bytes32[] proof_) view returns (bool)",
  "function whitelisted(address account_) view returns (bool)"
];

type MerkleManifestEntry = {
  address: string;
  leaf: string;
  proof: string[];
};

type MerkleManifest = {
  root: string;
  entries: MerkleManifestEntry[];
};

/**
 * Verifies a configured Origin NFT Merkle root and an address's proof.
 *
 * Required environment variables:
 * - ORIGIN_NFT_MERKLE_MANIFEST: the JSON output from
 *   configureOverlayerOriginMerkleRoot.ts
 * - ORIGIN_NFT_CONTRACT_ADDRESS: Shrimp, Dolphin, or Whale contract address
 * - ORIGIN_NFT_VERIFY_ADDRESS: address whose Merkle proof to validate
 *
 * The script is read-only. It compares the manifest root with the contract's
 * current root, validates the generated leaf, and calls
 * `isMerkleWhitelisted(address, proof)` on-chain. It exits non-zero when the
 * root, leaf, or proof does not verify.
 *
 * Example:
 * ORIGIN_NFT_MERKLE_MANIFEST=./deployments/overlayer-origin-nfts/merkle-...json \
 * ORIGIN_NFT_CONTRACT_ADDRESS=0x... \
 * ORIGIN_NFT_VERIFY_ADDRESS=0x... \
 * npx hardhat run scripts/utils/verifyOverlayerOriginMerkleRoot.ts --network eth_sepolia
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeAddress(address: string, label: string): string {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid ${label}: ${address}`);
  }

  return ethers.getAddress(address);
}

function bytes32(value: unknown, label: string): string {
  if (typeof value !== "string" || !ethers.isHexString(value, 32)) {
    throw new Error(`Invalid ${label}; expected a bytes32 hex string`);
  }

  return value;
}

function parseManifest(input: string): MerkleManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Merkle manifest is invalid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("root" in parsed) ||
    !("entries" in parsed) ||
    !Array.isArray(parsed.entries)
  ) {
    throw new Error("Merkle manifest must contain root and entries fields");
  }

  const root = bytes32(parsed.root, "manifest root");
  const entries = parsed.entries.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("address" in entry) ||
      !("leaf" in entry) ||
      !("proof" in entry) ||
      !Array.isArray(entry.proof)
    ) {
      throw new Error(`Invalid manifest entry at index ${index}`);
    }

    return {
      address: normalizeAddress(entry.address, `entry ${index} address`),
      leaf: bytes32(entry.leaf, `entry ${index} leaf`),
      proof: entry.proof.map((proofItem, proofIndex) =>
        bytes32(proofItem, `entry ${index} proof item ${proofIndex}`)
      )
    };
  });

  return { root, entries };
}

async function main(): Promise<void> {
  const manifestPath = resolve(requiredEnv("ORIGIN_NFT_MERKLE_MANIFEST"));
  const contractAddress = normalizeAddress(
    requiredEnv("ORIGIN_NFT_CONTRACT_ADDRESS"),
    "contract address"
  );
  const account = normalizeAddress(
    requiredEnv("ORIGIN_NFT_VERIFY_ADDRESS"),
    "verification address"
  );
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  const contract = new ethers.Contract(
    contractAddress,
    ORIGIN_NFT_ABI,
    ethers.provider
  );
  const entry = manifest.entries.find(
    (candidate) => candidate.address.toLowerCase() === account.toLowerCase()
  );

  const [onChainRoot, directlyWhitelisted] = await Promise.all([
    contract.merkleRoot(),
    contract.whitelisted(account)
  ]);
  const rootsMatch = onChainRoot.toLowerCase() === manifest.root.toLowerCase();

  const onChainLeaf = entry ? await contract.merkleLeaf(account) : undefined;
  const leafMatches = entry
    ? onChainLeaf.toLowerCase() === entry.leaf.toLowerCase()
    : false;
  const proofValid = entry
    ? await contract.isMerkleWhitelisted(account, entry.proof)
    : false;

  console.log(
    JSON.stringify(
      {
        network: network.name,
        contract: contractAddress,
        account,
        manifestPath,
        manifestRoot: manifest.root,
        onChainRoot,
        rootsMatch,
        manifestEntryFound: Boolean(entry),
        manifestLeaf: entry?.leaf,
        onChainLeaf,
        leafMatches,
        proofValid,
        directlyWhitelisted
      },
      null,
      2
    )
  );

  if (!rootsMatch || !entry || !leafMatches || !proofValid) {
    throw new Error("Merkle root or proof verification failed");
  }
}

main().catch((error: unknown) => {
  console.error("Origin Merkle-root verification failed:", error);
  process.exitCode = 1;
});
