import { OverlayerReferral_canJoinTeam } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: process.cwd() + "/process.env" });

// Fill in before running
const REFERRAL_ADDR = "";
const TEAM_OWNER = "";
const CONSUMER = "";

async function main() {
  const allowed = await OverlayerReferral_canJoinTeam(
    REFERRAL_ADDR,
    TEAM_OWNER,
    CONSUMER,
    ethers.provider
  );
  console.log(
    `[canJoinTeam] owner=${TEAM_OWNER} consumer=${CONSUMER} allowed=${allowed}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
