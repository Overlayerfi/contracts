/**
 * Compound all OverlayerWrapBacking contracts in one Multicall3 tx.
 *
 * Reads addresses from mainnet-deployment/mainnet-omnichain-manifest.json
 * (eth-mainnet.contractsRepo.*.OverlayerWrapBacking).
 *
 * Usage:
 *   npx hardhat run scripts/utils/compoundAllBackings.ts --network eth
 *
 * Env:
 *   WITHDRAW_AAVE=1|0     — pass to compound(bool); default 1 (true)
 *   ALLOW_FAILURE=1|0     — Multicall3 allowFailure per call; default 0
 *   DRY_RUN=1             — encode + estimateGas only, no send
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";

const LOG = "[compoundAllBackings]";

/** Canonical Multicall3 on Ethereum mainnet (and most EVM chains). */
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)"
];

const BACKING_ABI = ["function compound(bool withdrawAave_) external"];

type ContractsRepoEntry = {
  OverlayerWrapBacking?: string;
};

type Manifest = {
  chains?: {
    "eth-mainnet"?: {
      contractsRepo?: Record<string, ContractsRepoEntry>;
    };
  };
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "1" || raw.toLowerCase() === "true";
}

function loadBackingAddresses(): { product: string; address: string }[] {
  const manifestPath = path.join(
    process.cwd(),
    "mainnet-deployment",
    "mainnet-omnichain-manifest.json"
  );
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8")
  ) as Manifest;
  const repo = manifest.chains?.["eth-mainnet"]?.contractsRepo;
  if (!repo) {
    throw new Error(`Missing eth-mainnet.contractsRepo in ${manifestPath}`);
  }

  const backings: { product: string; address: string }[] = [];
  for (const [product, entry] of Object.entries(repo)) {
    const address = entry?.OverlayerWrapBacking;
    if (!address || !ethers.isAddress(address)) {
      throw new Error(
        `Invalid OverlayerWrapBacking for ${product}: ${String(address)}`
      );
    }
    backings.push({ product, address: ethers.getAddress(address) });
  }

  if (backings.length === 0) {
    throw new Error("No OverlayerWrapBacking addresses found in manifest");
  }
  return backings;
}

async function main(): Promise<void> {
  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  const withdrawAave = envBool("WITHDRAW_AAVE", true);
  const allowFailure = envBool("ALLOW_FAILURE", false);
  const dryRun = envBool("DRY_RUN", false);

  const backings = loadBackingAddresses();
  console.log(`${LOG} signer=${signerAddr}`);
  console.log(
    `${LOG} withdrawAave=${withdrawAave} allowFailure=${allowFailure} dryRun=${dryRun}`
  );
  for (const b of backings) {
    console.log(`${LOG} ${b.product}: ${b.address}`);
  }

  const backingIface = new ethers.Interface(BACKING_ABI);
  const callData = backingIface.encodeFunctionData("compound", [withdrawAave]);

  const calls = backings.map((b) => ({
    target: b.address,
    allowFailure,
    callData
  }));

  const multicall = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    signer
  );

  const simulated: { success: boolean; returnData: string }[] =
    await multicall.aggregate3.staticCall(calls);
  for (let i = 0; i < backings.length; i++) {
    console.log(
      `${LOG} simulate ${backings[i].product} success=${simulated[i].success}`
    );
    if (!allowFailure && !simulated[i].success) {
      throw new Error(`Simulation failed for ${backings[i].product}`);
    }
  }

  const gas = await multicall.aggregate3.estimateGas(calls);
  console.log(`${LOG} estimateGas=${gas.toString()}`);
  if (dryRun) return;

  const tx = await multicall.aggregate3(calls);
  console.log(`${LOG} tx=${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `${LOG} confirmed status=${
      receipt?.status
    } gasUsed=${receipt?.gasUsed?.toString()}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`${LOG} failed:`, error);
    process.exit(1);
  });
