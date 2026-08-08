import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";
import { OverlayerReferral_setPointsMerkleRoot } from "../functions";

type Allocation = {
  address: string;
  amount: bigint;
};

type MerkleEntry = {
  address: string;
  amount: string;
  leaf: string;
  proof: string[];
};

type MerkleTree = {
  root: string;
  entries: MerkleEntry[];
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
  allocationCount: number;
  entries: MerkleEntry[];
  contractAddress: string;
  action: "updated" | "unchanged" | "dry-run";
  transactionHash?: string;
};

/**
 * Builds an (address, amount) Merkle tree for OVERP claims and sets pointsMerkleRoot.
 *
 * Leaf format (matches OverlayerReferral.pointsMerkleLeaf):
 *   keccak256(bytes.concat(keccak256(abi.encode(account, amount))))
 *
 * Input file formats:
 * - JSON array: [{"address":"0x...","amount":"1000000000000000000"}, ...]
 * - JSON object with `allocations` array (same shape)
 * - CSV / text: `address,amount` per line (# comments and blanks ignored)
 *
 * Amounts must be integer wei strings only (no ether decimals / unit suffixes).
 * Example: "1000000000000000000" for 1 OVERP. JSON numeric amounts are rejected
 * (use strings to avoid JS precision loss above Number.MAX_SAFE_INTEGER).
 *
 * Required env:
 * - OVERLAYER_REFERRAL_POINTS_FILE
 * - OVERLAYER_REFERRAL_ADDRESS
 *
 * Optional:
 * - OVERLAYER_REFERRAL_POINTS_OUTPUT_PATH
 * - OVERLAYER_REFERRAL_POINTS_DRY_RUN=true
 *
 * Example:
 * OVERLAYER_REFERRAL_POINTS_FILE=./points.csv \
 * OVERLAYER_REFERRAL_ADDRESS=0x... \
 * npx hardhat run scripts/utils/configureOverlayerReferralPointsMerkleRoot.ts --network eth_sepolia
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
    throw new Error(`Invalid address: ${address}`);
  }
  return ethers.getAddress(address);
}

function parseAmount(raw: string): bigint {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty amount");
  }
  // Integer wei only — reject decimals / unit sugar to avoid wei-vs-ether footguns.
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Amount must be an integer wei string (got "${trimmed}"). Example: "1000000000000000000" for 1 OVERP.`
    );
  }
  return BigInt(trimmed);
}

function parseAllocations(input: string): Allocation[] {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error("Allocations file is empty");
  }

  if (trimmedInput.startsWith("[") || trimmedInput.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedInput);
    } catch {
      throw new Error("Allocations JSON is invalid");
    }

    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" &&
        parsed !== null &&
        "allocations" in parsed &&
        Array.isArray((parsed as { allocations: unknown }).allocations)
      ? (parsed as { allocations: unknown[] }).allocations
      : undefined;

    if (!rows) {
      throw new Error(
        "JSON must be an array or an object with an allocations array"
      );
    }

    return rows.map((row, index) => {
      if (
        typeof row !== "object" ||
        row === null ||
        !("address" in row) ||
        !("amount" in row)
      ) {
        throw new Error(`Invalid allocation at index ${index}`);
      }
      const address = normalizeAddress(
        String((row as { address: unknown }).address)
      );
      const amountRaw = (row as { amount: unknown }).amount;
      if (typeof amountRaw === "number") {
        throw new Error(
          `Amount at index ${index} must be an integer wei string, not a JSON number (got ${amountRaw}). Example: "1000000000000000000".`
        );
      }
      const amount =
        typeof amountRaw === "bigint"
          ? amountRaw
          : parseAmount(String(amountRaw));
      if (amount <= 0n) {
        throw new Error(`Non-positive amount for ${address}`);
      }
      return { address, amount };
    });
  }

  return trimmedInput
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map((line, index) => {
      const [addressRaw, amountRaw, ...rest] = line.split(/[\s,]+/);
      if (!addressRaw || !amountRaw || rest.length > 0) {
        throw new Error(
          `Invalid line ${index + 1}: expected address,amount (got "${line}")`
        );
      }
      const address = normalizeAddress(addressRaw);
      const amount = parseAmount(amountRaw);
      if (amount <= 0n) {
        throw new Error(`Non-positive amount for ${address}`);
      }
      return { address, amount };
    });
}

function pointsMerkleLeaf(address: string, amount: bigint): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256"],
    [address, amount]
  );
  return ethers.keccak256(ethers.keccak256(encoded));
}

function hashPair(first: string, second: string): string {
  return ethers.keccak256(
    BigInt(first) < BigInt(second)
      ? ethers.concat([first, second])
      : ethers.concat([second, first])
  );
}

function buildMerkleTree(input: Allocation[]): MerkleTree {
  if (input.length === 0) {
    throw new Error("Allocations list is empty");
  }
  const byAddress = new Map<string, Allocation>();
  for (const allocation of input) {
    const key = allocation.address.toLowerCase();
    if (byAddress.has(key)) {
      throw new Error(
        `Duplicate address in allocations: ${allocation.address}`
      );
    }
    byAddress.set(key, allocation);
  }

  const allocations = Array.from(byAddress.values()).sort((a, b) =>
    a.address.toLowerCase().localeCompare(b.address.toLowerCase())
  );

  const leaves = allocations.map((a) => pointsMerkleLeaf(a.address, a.amount));
  const layers: string[][] = [leaves];
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

  const entries = allocations.map((allocation, addressIndex) => {
    const proof: string[] = [];
    let index = addressIndex;
    for (let layerIndex = 0; layerIndex < layers.length - 1; ++layerIndex) {
      const layer = layers[layerIndex];
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      proof.push(layer[siblingIndex] ?? layer[index]);
      index = Math.floor(index / 2);
    }
    return {
      address: allocation.address,
      amount: allocation.amount.toString(),
      leaf: pointsMerkleLeaf(allocation.address, allocation.amount),
      proof
    };
  });

  return {
    root: currentLayer[0],
    entries
  };
}

async function writeManifest(manifest: MerkleManifest): Promise<string> {
  const configuredPath =
    process.env.OVERLAYER_REFERRAL_POINTS_OUTPUT_PATH?.trim();
  const timestamp = manifest.generatedAt.replace(/[:.]/g, "-");
  const defaultPath = join(
    "deployments",
    "overlayer-referral-points",
    `merkle-${manifest.network.name}-${manifest.network.chainId}-${timestamp}.json`
  );
  const outputPath = resolve(configuredPath || defaultPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return outputPath;
}

async function main(): Promise<void> {
  const inputFile = resolve(requiredEnv("OVERLAYER_REFERRAL_POINTS_FILE"));
  const contractAddress = ethers.getAddress(
    requiredEnv("OVERLAYER_REFERRAL_ADDRESS")
  );
  const allocations = parseAllocations(await readFile(inputFile, "utf8"));
  const tree = buildMerkleTree(allocations);
  const dryRun = booleanEnv("OVERLAYER_REFERRAL_POINTS_DRY_RUN", false);

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer is configured for the selected network");
  }
  const signerAddress = await signer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();

  console.log(`Merkle root: ${tree.root}`);
  console.log(`Allocations: ${tree.entries.length}`);
  console.log(
    `Target ${contractAddress} as ${signerAddress} on ${network.name} (chain ${providerNetwork.chainId})`
  );

  const contract = new ethers.Contract(
    contractAddress,
    [
      "function owner() view returns (address)",
      "function pointsMerkleRoot() view returns (bytes32)"
    ],
    signer
  );
  const [owner, previousRoot] = await Promise.all([
    contract.owner(),
    contract.pointsMerkleRoot()
  ]);
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `${contractAddress} is owned by ${owner}, not signer ${signerAddress}`
    );
  }

  let action: MerkleManifest["action"] = "unchanged";
  let transactionHash: string | undefined;
  if (previousRoot.toLowerCase() === tree.root.toLowerCase()) {
    action = "unchanged";
  } else if (dryRun) {
    action = "dry-run";
  } else {
    transactionHash = await OverlayerReferral_setPointsMerkleRoot(
      contractAddress,
      tree.root,
      signer
    );
    action = "updated";
  }

  const manifest: MerkleManifest = {
    generatedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: providerNetwork.chainId.toString()
    },
    signer: signerAddress,
    inputFile,
    root: tree.root,
    allocationCount: tree.entries.length,
    entries: tree.entries,
    contractAddress,
    action,
    transactionHash
  };

  const outputPath = await writeManifest(manifest);
  console.log(`Action: ${action}`);
  console.log(`Manifest: ${outputPath}`);
}

main().catch((error) => {
  console.error("OVERP points Merkle configure failed:", error);
  process.exit(1);
});
