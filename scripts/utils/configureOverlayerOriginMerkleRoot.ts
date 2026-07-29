import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";

const ORIGIN_NFT_ABI = [
  "function owner() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function setMerkleRoot(bytes32 merkleRoot_)"
];

type MerkleTree = {
  root: string;
  entries: MerkleEntry[];
};

type MerkleEntry = {
  address: string;
  leaf: string;
  proof: string[];
};

type TargetResult = {
  address: string;
  owner: string;
  previousRoot: string;
  action: "updated" | "unchanged" | "dry-run";
  transactionHash?: string;
  blockNumber?: number;
};

type MerkleManifest = {
  generatedAt: string;
  network: {
    name: string;
    chainId: string;
  };
  signer: string;
  inputFile: string;
  root: string;
  addressCount: number;
  entries: MerkleEntry[];
  targets: TargetResult[];
};

/**
 * Configures one shared Merkle root on one or more Origin NFT contracts.
 *
 * Input file formats:
 * - A JSON array of addresses, e.g. `["0x...", "0x..."]`
 * - A JSON object with an `addresses` array
 * - Plain text with one address per line; blank lines and `#` comments are ignored
 *
 * Required environment variables:
 * - ORIGIN_NFT_WHITELIST_FILE
 * - At least one target: ORIGIN_NFT_CONTRACT_ADDRESSES (comma-separated),
 *   ORIGIN_NFT_SHRIMP_ADDRESS, ORIGIN_NFT_DOLPHIN_ADDRESS, or
 *   ORIGIN_NFT_WHALE_ADDRESS
 *
 * Optional:
 * - ORIGIN_NFT_MERKLE_OUTPUT_PATH (defaults under deployments/overlayer-origin-nfts)
 * - ORIGIN_NFT_MERKLE_DRY_RUN=true (builds and validates without sending transactions)
 *
 * The active Hardhat signer must own every target contract. The generated output
 * contains the root and each address's proof for use with `mintWithProof`.
 *
 * Example:
 * ORIGIN_NFT_WHITELIST_FILE=./whitelist.txt \
 * ORIGIN_NFT_SHRIMP_ADDRESS=0x... \
 * ORIGIN_NFT_DOLPHIN_ADDRESS=0x... \
 * ORIGIN_NFT_WHALE_ADDRESS=0x... \
 * npx hardhat run scripts/utils/configureOverlayerOriginMerkleRoot.ts --network eth_sepolia
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function booleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  throw new Error(`Expected ${name} to be "true" or "false"`);
}

function normalizeAddress(address: string): string {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid whitelist address: ${address}`);
  }

  return ethers.getAddress(address);
}

function parseAddressInput(input: string): string[] {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error("Whitelist file is empty");
  }

  if (trimmedInput.startsWith("[") || trimmedInput.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedInput);
    } catch {
      throw new Error("Whitelist JSON is invalid");
    }

    const addresses = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" &&
        parsed !== null &&
        "addresses" in parsed &&
        Array.isArray(parsed.addresses)
      ? parsed.addresses
      : undefined;

    if (
      !addresses ||
      !addresses.every((address) => typeof address === "string")
    ) {
      throw new Error(
        "Whitelist JSON must be an address array or an object with an addresses array"
      );
    }

    return addresses;
  }

  return input
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*/, "").split(/[\s,]+/))
    .filter(Boolean);
}

function readTargetAddresses(): string[] {
  const targets = [
    ...(process.env.ORIGIN_NFT_CONTRACT_ADDRESSES?.split(/[\s,]+/) ?? []),
    process.env.ORIGIN_NFT_SHRIMP_ADDRESS,
    process.env.ORIGIN_NFT_DOLPHIN_ADDRESS,
    process.env.ORIGIN_NFT_WHALE_ADDRESS
  ].filter((address): address is string => Boolean(address?.trim()));

  if (targets.length === 0) {
    throw new Error(
      "Set ORIGIN_NFT_CONTRACT_ADDRESSES or at least one tier-specific contract address"
    );
  }

  return Array.from(
    new Map(
      targets.map((address) => {
        const normalizedAddress = normalizeAddress(address.trim());
        return [normalizedAddress.toLowerCase(), normalizedAddress];
      })
    ).values()
  );
}

function merkleLeaf(address: string): string {
  const encodedAddress = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address"],
    [address]
  );

  return ethers.keccak256(ethers.keccak256(encodedAddress));
}

function hashPair(first: string, second: string): string {
  return ethers.keccak256(
    BigInt(first) < BigInt(second)
      ? ethers.concat([first, second])
      : ethers.concat([second, first])
  );
}

function buildMerkleTree(inputAddresses: string[]): MerkleTree {
  const addresses = Array.from(
    new Map(
      inputAddresses.map((address) => {
        const normalizedAddress = normalizeAddress(address);
        return [normalizedAddress.toLowerCase(), normalizedAddress];
      })
    ).values()
  ).sort((first, second) =>
    first.toLowerCase().localeCompare(second.toLowerCase())
  );

  if (addresses.length !== inputAddresses.length) {
    throw new Error("Whitelist contains duplicate addresses");
  }

  const layers: string[][] = [addresses.map(merkleLeaf)];
  let currentLayer = layers[0];

  while (currentLayer.length > 1) {
    const nextLayer: string[] = [];
    for (let index = 0; index < currentLayer.length; index += 2) {
      const left = currentLayer[index];
      const right = currentLayer[index + 1] ?? left;
      nextLayer.push(hashPair(left, right));
    }

    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  const entries = addresses.map((address, addressIndex) => {
    const proof: string[] = [];
    let index = addressIndex;

    for (let layerIndex = 0; layerIndex < layers.length - 1; ++layerIndex) {
      const layer = layers[layerIndex];
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      proof.push(layer[siblingIndex] ?? layer[index]);
      index = Math.floor(index / 2);
    }

    return {
      address,
      leaf: merkleLeaf(address),
      proof
    };
  });

  return {
    root: currentLayer[0],
    entries
  };
}

async function writeManifest(manifest: MerkleManifest): Promise<string> {
  const configuredPath = process.env.ORIGIN_NFT_MERKLE_OUTPUT_PATH?.trim();
  const timestamp = manifest.generatedAt.replace(/[:.]/g, "-");
  const defaultPath = join(
    "deployments",
    "overlayer-origin-nfts",
    `merkle-${manifest.network.name}-${manifest.network.chainId}-${timestamp}.json`
  );
  const outputPath = resolve(configuredPath || defaultPath);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return outputPath;
}

async function main(): Promise<void> {
  const whitelistFile = resolve(requiredEnv("ORIGIN_NFT_WHITELIST_FILE"));
  const inputAddresses = parseAddressInput(
    await readFile(whitelistFile, "utf8")
  );
  const tree = buildMerkleTree(inputAddresses);
  const targetAddresses = readTargetAddresses();
  const dryRun = booleanEnv("ORIGIN_NFT_MERKLE_DRY_RUN", false);
  const signers = await ethers.getSigners();
  const signer = signers[0];
  if (!signer) {
    throw new Error("No signer is configured for the selected network");
  }

  const signerAddress = await signer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();

  console.log(`Merkle root: ${tree.root}`);
  console.log(`Whitelist addresses: ${tree.entries.length}`);
  console.log(
    `Configuring ${targetAddresses.length} contract(s) as ${signerAddress} on ${network.name} (chain ${providerNetwork.chainId})`
  );

  const configuredTargets = await Promise.all(
    targetAddresses.map(async (targetAddress) => {
      const contract = new ethers.Contract(
        targetAddress,
        ORIGIN_NFT_ABI,
        signer
      );
      const [contractOwner, previousRoot] = await Promise.all([
        contract.owner(),
        contract.merkleRoot()
      ]);

      if (contractOwner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(
          `${targetAddress} is owned by ${contractOwner}, not signer ${signerAddress}`
        );
      }

      return { contract, contractOwner, previousRoot, targetAddress };
    })
  );

  const targets: TargetResult[] = [];
  for (const {
    contract,
    contractOwner,
    previousRoot,
    targetAddress
  } of configuredTargets) {
    if (previousRoot.toLowerCase() === tree.root.toLowerCase()) {
      targets.push({
        address: targetAddress,
        owner: contractOwner,
        previousRoot,
        action: "unchanged"
      });
      continue;
    }

    if (dryRun) {
      targets.push({
        address: targetAddress,
        owner: contractOwner,
        previousRoot,
        action: "dry-run"
      });
      continue;
    }

    const transaction = await contract.setMerkleRoot(tree.root);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Merkle-root update failed for ${targetAddress}`);
    }

    const configuredRoot = await contract.merkleRoot();
    if (configuredRoot.toLowerCase() !== tree.root.toLowerCase()) {
      throw new Error(`Merkle root was not applied to ${targetAddress}`);
    }

    targets.push({
      address: targetAddress,
      owner: contractOwner,
      previousRoot,
      action: "updated",
      transactionHash: transaction.hash,
      blockNumber: receipt.blockNumber
    });
  }

  const outputPath = await writeManifest({
    generatedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: providerNetwork.chainId.toString()
    },
    signer: signerAddress,
    inputFile: whitelistFile,
    root: tree.root,
    addressCount: tree.entries.length,
    entries: tree.entries,
    targets
  });

  console.table(targets);
  console.log(`Merkle manifest written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("Origin Merkle-root configuration failed:", error);
  process.exitCode = 1;
});
