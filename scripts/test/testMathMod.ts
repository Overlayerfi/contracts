import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";
import { SubscriptionConsumerSepolia_get, TestMath_mod } from "../functions";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const address = "0x0518d5B14A3b1CcE25ae22eAa8099b565b317383";
const a = "456";
const b = "789";
TestMath_mod(provider, address, a, b)
  .then(() => console.log("Completed"))
  .catch((e) => console.error(e));
