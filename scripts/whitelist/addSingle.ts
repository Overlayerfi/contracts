import { OvaWhitelist_add } from "../functions";
import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const owner = new ethers.Wallet(
  process.env.OVA_SEPOLIA_DEPLOYER_KEY!,
  provider
);

OvaWhitelist_add(
  "0x9A58742F11E824B84Aa891EC4EFDFA3932D30f54",
  "0xE6379d6EB7573734eD198cbc98D37769c40b4126",
  owner
)
  .then(() => {
    console.log(
      "Completed adding 0xE6379d6EB7573734eD198cbc98D37769c40b4126 to OvaWhitelist"
    );
  })
  .catch((e) => {
    console.error(e);
  });
