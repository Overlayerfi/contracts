import { ethers } from "hardhat";
import { rOVAV2_addBatch } from "../functions";
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

const who = ["0x11335a5357e2101dea56a76f2e2165e05c4062f1"];

const amounts = [ethers.parseEther("250")];

const addr = "0x63CF85d1133E8c030B32C63FA97b983BEaE01f83";

rOVAV2_addBatch(owner, addr, who, amounts, {
  gasLimit: 1000000,
  maxFeePerGas: 2 * 10 ** 9
});
