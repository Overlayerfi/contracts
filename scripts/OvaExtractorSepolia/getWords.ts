import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";
import { SubscriptionConsumerSepolia_get } from "../functions";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const address = "";
const id = "";
SubscriptionConsumerSepolia_get(provider, address, id)
  .then(() => console.log("Completed"))
  .catch((e) => console.error(e));
