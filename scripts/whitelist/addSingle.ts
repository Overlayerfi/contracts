import { OvaWhitelist_add } from "../functions";
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

const target = [""];
const contractAddr = "0x9A58742F11E824B84Aa891EC4EFDFA3932D30f54";

OvaWhitelist_add(contractAddr, target, owner)
  .then(() => {
    console.log(`Completed adding ${target} to OvaWhitelist`);
  })
  .catch((e) => {
    console.error(e);
  });
