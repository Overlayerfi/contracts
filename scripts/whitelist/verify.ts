import { ethers } from "hardhat";
import { OvaWhitelist_verify } from "../functions";
import * as dotenv from "dotenv";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";

dotenv.config({ path: process.cwd() + "/process.env" });

const target = [""];

const contractAddr = "0x9A58742F11E824B84Aa891EC4EFDFA3932D30f54";

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
OvaWhitelist_verify(contractAddr, target, provider)
  .then((e) => console.log(e))
  .catch((e) => console.error(e));
