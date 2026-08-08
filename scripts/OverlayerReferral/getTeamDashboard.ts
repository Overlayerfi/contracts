import { OverlayerReferral_getTeamDashboard } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: process.cwd() + "/process.env" });

// Fill in before running
const REFERRAL_ADDR = "";
const TEAM_OWNER = "";

async function main() {
  const provider = ethers.provider;
  await OverlayerReferral_getTeamDashboard(REFERRAL_ADDR, TEAM_OWNER, provider);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
