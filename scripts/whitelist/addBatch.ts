import { OvaWhitelist_batchAdd } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const owner = new ethers.Wallet(
  process.env.OVA_SEPOLIA_DEPLOYER_KEY_OLD!,
  provider
);

const targtes = [""];

OvaWhitelist_batchAdd(
  "0x9A58742F11E824B84Aa891EC4EFDFA3932D30f54",
  targtes,
  owner
)
  .then(() => {
    console.log("Completed adding targets to OvaWhitelist");
  })
  .catch((e) => {
    console.error(e);
  });
