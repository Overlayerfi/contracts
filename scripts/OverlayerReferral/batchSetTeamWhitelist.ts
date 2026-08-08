import { OverlayerReferral_batchSetTeamWhitelist } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import * as fs from "fs";

dotenv.config({ path: process.cwd() + "/process.env" });

// Fill in before running
const REFERRAL_ADDR = "";
/** One address per line (0x...). Empty lines and # comments ignored. */
const ADDRESSES_FILE = "";
const ALLOWED = true;

function loadAddresses(path: string): string[] {
  const raw = fs.readFileSync(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

async function main() {
  const [signer] = await ethers.getSigners();
  const members = loadAddresses(ADDRESSES_FILE);
  if (members.length === 0) {
    throw new Error("no addresses loaded");
  }
  await OverlayerReferral_batchSetTeamWhitelist(
    REFERRAL_ADDR,
    members,
    ALLOWED,
    signer
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
