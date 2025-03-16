import { ethers } from "hardhat";
import { rOVA_addBatch } from "../functions";
import * as dotenv from "dotenv";
import { PRIVATE_ETH_RPC_PREFIX } from "../../rpc";

dotenv.config({ path: process.cwd() + "/process.env" });

const provider = new ethers.JsonRpcProvider(
  PRIVATE_ETH_RPC_PREFIX + process.env.ALCHEMY_KEY!
);
const owner = new ethers.Wallet(
  process.env.OVA_MAINNET_ROVA_DEPLOYER_KEY!,
  provider
);

const who = [""];

const amounts = [""];

const addr = "";

rOVA_addBatch(owner, addr, who, amounts, 1, {
  gasLimit: 1000000,
  maxFeePerGas: 10 * 10 ** 9
});
