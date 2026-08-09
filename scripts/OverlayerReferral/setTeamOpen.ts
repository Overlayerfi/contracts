import { OverlayerReferral_setTeamOpen } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: process.cwd() + "/process.env" });

// Fill in before running
const REFERRAL_ADDR = "";
const OPEN = true;

async function main() {
  const [signer] = await ethers.getSigners();
  await OverlayerReferral_setTeamOpen(REFERRAL_ADDR, OPEN, signer);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
