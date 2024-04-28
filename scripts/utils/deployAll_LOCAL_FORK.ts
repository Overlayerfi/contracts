import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deployUSDO,
  deployStakedUSDO,
  deployStakingRewardsDistributor,
  deployAirdropOBSIReceipt,
  deployLiquidityAirdropReward,
  deployLiquidity
} from "../functions";
import LIQUIDITY_REWARD_ABI from "../../artifacts/contracts/token/LiquidityAirdropReward.sol/LiquidityAirdropReward.json";

const LIQUIDITY_REWARD_TOKEN_ADMIN =
  "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";
const LIQUIDITY_ADMIN = "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";
const REWARD_STARTING_BLOCK = 19709557;

async function main() {
  try {
    const admin = await ethers.getSigner(
      "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F"
    );
    console.log("signer addr:", admin.address);

    const usdoAddr = await deployUSDO();
    const susdoAddr = await deployStakedUSDO(usdoAddr);
    await deployStakingRewardsDistributor(susdoAddr, usdoAddr, true);
    await deployAirdropOBSIReceipt(usdoAddr);
    const liquidityRewardAssetAddr = await deployLiquidityAirdropReward(
      LIQUIDITY_REWARD_TOKEN_ADMIN
    );
    const liquidityAddr = await deployLiquidity(
      LIQUIDITY_ADMIN,
      REWARD_STARTING_BLOCK
    );
    const rewardContract = new ethers.Contract(
      liquidityRewardAssetAddr,
      LIQUIDITY_REWARD_ABI.abi,
      admin
    );
    await (rewardContract.connect(admin) as Contract).setMinter(liquidityAddr);
    console.log("LiquidityAirdropReward minter set to:", liquidityAddr);
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
