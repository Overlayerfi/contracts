import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";

const OG_NFT_ABI = [
  "function owner() view returns (address)",
  "function merkleRoot() view returns (bytes32)",
  "function setMerkleRoot(bytes32 merkleRoot_)",
  "function freeMintMerkleRoot() view returns (bytes32)",
  "function setFreeMintMerkleRoot(bytes32 merkleRoot_)"
];

type MerkleKind = "paid" | "free";

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
  kind: MerkleKind;
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
  kind: MerkleKind;
  root: string;
  addressCount: number;
  entries: MerkleEntry[];
  target: TargetResult;
};

/**
 * Builds an OG Merkle tree from a whitelist file and sets the matching root.
 *
 * `paid` writes {merkleRoot} for `mintWithProof` (0.005 ETH).
 * `free` writes {freeMintMerkleRoot} for `mintWithFreeMintProof`.
 *
 * Input file formats:
 * - A JSON array of addresses, e.g. `["0x...", "0x..."]`
 * - A JSON object with an `addresses` array
 * - Plain text with one address per line; blank lines and `#` comments are ignored
 *
 * Required environment variables:
 * - OG_NFT_WHITELIST_FILE
 * - OG_NFT_ADDRESS
 *
 * Optional:
 * - OG_NFT_MERKLE_KIND=paid|free (defaults to paid)
 * - OG_NFT_MERKLE_OUTPUT_PATH (defaults under deployments/overlayer-og)
 * - OG_NFT_MERKLE_DRY_RUN=true (builds and validates without sending a transaction)
 *
 * The active Hardhat signer must own the OG contract. The generated output
 * contains the root and each address's proof.
 *
 * Example (paid allowlist):
 * OG_NFT_WHITELIST_FILE=./og-whitelist.txt \
 * OG_NFT_ADDRESS=0x... \
 * npx hardhat run scripts/utils/configureOverlayerOGMerkleRoot.ts --network eth
 *
 * Example (free-mint allowlist):
 * OG_NFT_WHITELIST_FILE=./og-free-whitelist.txt \
 * OG_NFT_ADDRESS=0x... \
 * OG_NFT_MERKLE_KIND=free \
 * npx hardhat run scripts/utils/configureOverlayerOGMerkleRoot.ts --network eth
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

function merkleKind(): MerkleKind {
  const value = process.env.OG_NFT_MERKLE_KIND?.trim().toLowerCase() || "paid";
  if (value === "paid" || value === "free") {
    return value;
  }

  throw new Error('OG_NFT_MERKLE_KIND must be "paid" or "free"');
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
  const configuredPath = process.env.OG_NFT_MERKLE_OUTPUT_PATH?.trim();
  const timestamp = manifest.generatedAt.replace(/[:.]/g, "-");
  const defaultPath = join(
    "deployments",
    "overlayer-og",
    `merkle-${manifest.kind}-${manifest.network.name}-${manifest.network.chainId}-${timestamp}.json`
  );
  const outputPath = resolve(configuredPath || defaultPath);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return outputPath;
}

async function readCurrentRoot(
  contract: ethers.Contract,
  kind: MerkleKind
): Promise<string> {
  return kind === "free"
    ? contract.freeMintMerkleRoot()
    : contract.merkleRoot();
}

async function writeRoot(
  contract: ethers.Contract,
  kind: MerkleKind,
  root: string
) {
  return kind === "free"
    ? contract.setFreeMintMerkleRoot(root)
    : contract.setMerkleRoot(root);
}

async function main(): Promise<void> {
  const whitelistFile = resolve(requiredEnv("OG_NFT_WHITELIST_FILE"));
  const ogAddress = normalizeAddress(requiredEnv("OG_NFT_ADDRESS"));
  const kind = merkleKind();
  const inputAddresses = parseAddressInput(
    await readFile(whitelistFile, "utf8")
  );
  const tree = buildMerkleTree(inputAddresses);
  const dryRun = booleanEnv("OG_NFT_MERKLE_DRY_RUN", false);
  const signers = await ethers.getSigners();
  const signer = signers[0];
  if (!signer) {
    throw new Error("No signer is configured for the selected network");
  }

  const signerAddress = await signer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();
  const contract = new ethers.Contract(ogAddress, OG_NFT_ABI, signer);
  const [contractOwner, previousRoot] = await Promise.all([
    contract.owner(),
    readCurrentRoot(contract, kind)
  ]);

  if (contractOwner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `${ogAddress} is owned by ${contractOwner}, not signer ${signerAddress}`
    );
  }

  console.log(`Merkle kind: ${kind}`);
  console.log(`Merkle root: ${tree.root}`);
  console.log(`Whitelist addresses: ${tree.entries.length}`);
  console.log(
    `Configuring OG ${ogAddress} as ${signerAddress} on ${network.name} (chain ${providerNetwork.chainId})`
  );

  let target: TargetResult;
  if (previousRoot.toLowerCase() === tree.root.toLowerCase()) {
    target = {
      address: ogAddress,
      owner: contractOwner,
      kind,
      previousRoot,
      action: "unchanged"
    };
  } else if (dryRun) {
    target = {
      address: ogAddress,
      owner: contractOwner,
      kind,
      previousRoot,
      action: "dry-run"
    };
  } else {
    const transaction = await writeRoot(contract, kind, tree.root);
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Merkle-root update failed for ${ogAddress}`);
    }

    const configuredRoot = await readCurrentRoot(contract, kind);
    if (configuredRoot.toLowerCase() !== tree.root.toLowerCase()) {
      throw new Error(`Merkle root was not applied to ${ogAddress}`);
    }

    target = {
      address: ogAddress,
      owner: contractOwner,
      kind,
      previousRoot,
      action: "updated",
      transactionHash: transaction.hash,
      blockNumber: receipt.blockNumber
    };
  }

  const outputPath = await writeManifest({
    generatedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: providerNetwork.chainId.toString()
    },
    signer: signerAddress,
    inputFile: whitelistFile,
    kind,
    root: tree.root,
    addressCount: tree.entries.length,
    entries: tree.entries,
    target
  });

  console.table([target]);
  console.log(`Merkle manifest written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("OG Merkle-root configuration failed:", error);
  process.exitCode = 1;
});
