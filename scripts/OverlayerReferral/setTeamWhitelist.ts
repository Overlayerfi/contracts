import { OverlayerReferral_setTeamWhitelist } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: process.cwd() + "/process.env" });

// Fill in before running
const REFERRAL_ADDR = "";
const MEMBER = "";
const ALLOWED = true;

async function main() {
  const [signer] = await ethers.getSigners();
  await OverlayerReferral_setTeamWhitelist(
    REFERRAL_ADDR,
    MEMBER,
    ALLOWED,
    signer
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
