import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";
import { SubscriptionConsumerSepolia_request } from "../functions";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const owner = new ethers.Wallet(
  process.env.OVA_SEPOLIA_DEPLOYER_KEY!,
  provider
);
const address = "0x104C7ebB04aec8a6e0823326Ea615565F5f49Fb2";

SubscriptionConsumerSepolia_request(address, owner)
  .then(() => console.log("Completed"))
  .catch((e) => console.error(e));
