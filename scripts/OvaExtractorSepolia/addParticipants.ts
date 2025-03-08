import { SubscriptionConsumerSepolia_addParticipants } from "../functions";
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

const contract = '0x496DEbE2769756044Bbc257Ec48FfEa3199dab77'

const handles=['']
//if (handles.length !== 304) {
//	throw new Error('Invalid handles length')
//}
SubscriptionConsumerSepolia_addParticipants(contract, handles, owner).then(e => console.log(e)).catch(e => console.error(e));
