import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ethers, network } from "hardhat";

const WHALE_FREE_MINT_ABI = [
  "function owner() view returns (address)",
  "function freeMintWhitelisted(address account_) view returns (bool)",
  "function batchSetFreeMintWhitelist(address[] accounts_, bool isFreeMintWhitelisted_)"
];

type BatchResult = {
  index: number;
  addresses: string[];
  action: "updated" | "dry-run" | "failed";
  transactionHash?: string;
  blockNumber?: number;
  error?: string;
};

type FreeMintWhitelistManifest = {
  generatedAt: string;
  network: {
    name: string;
    chainId: string;
  };
  signer: string;
  whale: {
    address: string;
    owner: string;
  };
  inputFile: string;
  dryRun: boolean;
  batchSize: number;
  inputAddressCount: number;
  uniqueAddressCount: number;
  alreadyFreeMintWhitelistedAddresses: string[];
  newlyFreeMintWhitelistedAddresses: string[];
  batches: BatchResult[];
};

/**
 * Adds addresses from a file to a Whale contract's direct free-mint allowlist.
 *
 * Input file formats:
 * - A JSON array of addresses, e.g. `["0x...", "0x..."]`
 * - A JSON object with an `addresses` array
 * - Plain text with one address per line; blank lines and `#` comments are ignored
 *
 * Required environment variables:
 * - ORIGIN_NFT_WHALE_ADDRESS (or ORIGIN_NFT_CONTRACT_ADDRESS)
 * - ORIGIN_NFT_WHALE_FREE_MINT_WHITELIST_FILE
 *   (or ORIGIN_NFT_FREE_MINT_WHITELIST_FILE)
 *
 * Optional:
 * - ORIGIN_NFT_FREE_MINT_BATCH_SIZE (defaults to 100)
 * - ORIGIN_NFT_FREE_MINT_OUTPUT_PATH (defaults under deployments/overlayer-origin-nfts)
 * - ORIGIN_NFT_FREE_MINT_DRY_RUN=true (validates without sending transactions)
 *
 * The active Hardhat signer must own the Whale contract. Existing free-mint
 * entries are skipped, and every submitted batch is verified after mining.
 *
 * Example:
 * ORIGIN_NFT_WHALE_ADDRESS=0x... \
 * ORIGIN_NFT_WHALE_FREE_MINT_WHITELIST_FILE=./eth-free-whitelist.txt \
 * npx hardhat run scripts/utils/batchWhitelistWhaleFreeMints.ts --network eth_sepolia
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

function booleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;

  throw new Error(`Expected ${name} to be "true" or "false"`);
}

function positiveIntegerEnv(name: string, defaultValue: number): number {
  const value = process.env[name]?.trim();
  if (!value) return defaultValue;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`Expected ${name} to be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} exceeds JavaScript's safe integer range`);
  }

  return parsed;
}

function normalizeAddress(address: string): string {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid free-mint whitelist address: ${address}`);
  }

  return ethers.getAddress(address);
}

function parseAddressInput(input: string): string[] {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error("Free-mint whitelist file is empty");
  }

  if (trimmedInput.startsWith("[") || trimmedInput.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedInput);
    } catch {
      throw new Error("Free-mint whitelist JSON is invalid");
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
        "Free-mint whitelist JSON must be an address array or an object with an addresses array"
      );
    }

    return addresses;
  }

  return input
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*/, "").split(/[\s,]+/))
    .filter(Boolean);
}

function deduplicateAddresses(addresses: string[]): string[] {
  return Array.from(
    new Map(
      addresses.map((address) => {
        const normalizedAddress = normalizeAddress(address);
        return [normalizedAddress.toLowerCase(), normalizedAddress];
      })
    ).values()
  );
}

function batches<T>(items: T[], batchSize: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    result.push(items.slice(start, start + batchSize));
  }

  return result;
}

async function writeManifest(
  manifest: FreeMintWhitelistManifest
): Promise<string> {
  const configuredPath = process.env.ORIGIN_NFT_FREE_MINT_OUTPUT_PATH?.trim();
  const timestamp = manifest.generatedAt.replace(/[:.]/g, "-");
  const defaultPath = join(
    "deployments",
    "overlayer-origin-nfts",
    `whale-free-mint-whitelist-${manifest.network.name}-${manifest.network.chainId}-${timestamp}.json`
  );
  const outputPath = resolve(configuredPath || defaultPath);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return outputPath;
}

async function main(): Promise<void> {
  const whitelistFile = resolve(
    requiredEnv([
      "ORIGIN_NFT_WHALE_FREE_MINT_WHITELIST_FILE",
      "ORIGIN_NFT_FREE_MINT_WHITELIST_FILE"
    ])
  );
  const whaleAddress = normalizeAddress(
    requiredEnv(["ORIGIN_NFT_WHALE_ADDRESS", "ORIGIN_NFT_CONTRACT_ADDRESS"])
  );
  const inputAddresses = parseAddressInput(
    await readFile(whitelistFile, "utf8")
  );
  const addresses = deduplicateAddresses(inputAddresses);
  const batchSize = positiveIntegerEnv("ORIGIN_NFT_FREE_MINT_BATCH_SIZE", 100);
  const dryRun = booleanEnv("ORIGIN_NFT_FREE_MINT_DRY_RUN", false);
  const signers = await ethers.getSigners();
  const signer = signers[0];
  if (!signer) {
    throw new Error("No signer is configured for the selected network");
  }

  const signerAddress = await signer.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();
  const whale = new ethers.Contract(whaleAddress, WHALE_FREE_MINT_ABI, signer);
  const whaleOwner = await whale.owner();

  if (whaleOwner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `${whaleAddress} is owned by ${whaleOwner}, not signer ${signerAddress}`
    );
  }

  const alreadyFreeMintWhitelistedAddresses: string[] = [];
  const newlyFreeMintWhitelistedAddresses: string[] = [];
  for (const addressBatch of batches(addresses, 25)) {
    const currentStatuses = await Promise.all(
      addressBatch.map((address) => whale.freeMintWhitelisted(address))
    );

    for (let index = 0; index < addressBatch.length; ++index) {
      const address = addressBatch[index];
      if (currentStatuses[index]) {
        alreadyFreeMintWhitelistedAddresses.push(address);
      } else {
        newlyFreeMintWhitelistedAddresses.push(address);
      }
    }
  }

  if (addresses.length !== inputAddresses.length) {
    console.warn(
      `Deduplicated ${
        inputAddresses.length - addresses.length
      } repeated address(es)`
    );
  }
  console.log(`Whale: ${whaleAddress}`);
  console.log(`Free-mint input addresses: ${inputAddresses.length}`);
  console.log(`Unique addresses: ${addresses.length}`);
  console.log(
    `Already free-mint whitelisted: ${alreadyFreeMintWhitelistedAddresses.length}`
  );
  console.log(`Addresses to add: ${newlyFreeMintWhitelistedAddresses.length}`);

  const resultBatches: BatchResult[] = [];
  const addressBatches = batches(newlyFreeMintWhitelistedAddresses, batchSize);
  const manifestBase = {
    generatedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: providerNetwork.chainId.toString()
    },
    signer: signerAddress,
    whale: {
      address: whaleAddress,
      owner: whaleOwner
    },
    inputFile: whitelistFile,
    dryRun,
    batchSize,
    inputAddressCount: inputAddresses.length,
    uniqueAddressCount: addresses.length,
    alreadyFreeMintWhitelistedAddresses,
    newlyFreeMintWhitelistedAddresses
  };

  for (let index = 0; index < addressBatches.length; ++index) {
    const addressBatch = addressBatches[index];
    if (dryRun) {
      resultBatches.push({
        index: index + 1,
        addresses: addressBatch,
        action: "dry-run"
      });
      continue;
    }

    try {
      const transaction = await whale.batchSetFreeMintWhitelist(
        addressBatch,
        true
      );
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction failed");
      }

      const appliedStatuses = await Promise.all(
        addressBatch.map((address) => whale.freeMintWhitelisted(address))
      );
      if (
        appliedStatuses.some((isFreeMintWhitelisted) => !isFreeMintWhitelisted)
      ) {
        throw new Error("One or more addresses were not free-mint whitelisted");
      }

      resultBatches.push({
        index: index + 1,
        addresses: addressBatch,
        action: "updated",
        transactionHash: transaction.hash,
        blockNumber: receipt.blockNumber
      });
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : "Unknown batch failure";
      resultBatches.push({
        index: index + 1,
        addresses: addressBatch,
        action: "failed",
        error: failure
      });
      const outputPath = await writeManifest({
        ...manifestBase,
        batches: resultBatches
      });
      console.log(`Partial manifest written to ${outputPath}`);
      throw error;
    }
  }

  const outputPath = await writeManifest({
    ...manifestBase,
    batches: resultBatches
  });
  console.table(
    resultBatches.map((batch) => ({
      index: batch.index,
      addresses: batch.addresses.length,
      action: batch.action,
      transactionHash: batch.transactionHash
    }))
  );
  console.log(`Free-mint whitelist manifest written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error("Whale free-mint whitelist configuration failed:", error);
  process.exitCode = 1;
});
