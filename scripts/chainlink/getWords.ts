import * as dotenv from "dotenv";
import { ethers } from "hardhat";
import { PRIVATE_ETH_SEPOLIA_RPC_PREFIX } from "../../rpc";
import { SubscriptionConsumerSepolia_get } from "../functions";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_SEPOLIA_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const address = "0x104C7ebB04aec8a6e0823326Ea615565F5f49Fb2";
const id =
  "26235463465571498876187939776790730556130922006303069978285253938062338282821";
SubscriptionConsumerSepolia_get(provider, address, id)
  .then(() => console.log("Completed"))
  .catch((e) => console.error(e));
