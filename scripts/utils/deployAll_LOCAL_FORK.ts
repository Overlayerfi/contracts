import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deployUSDO,
  deployStakedUSDO,
  deployStakingRewardsDistributor,
  deployLiquidityAirdropReward,
  deployLiquidity,
  deployGovernanceToken,
  addRewardLiquidity,
  addPoolLiquidity
} from "../functions";
import LIQUIDITY_REWARD_ABI from "../../artifacts/contracts/token/LiquidityAirdropReward.sol/LiquidityAirdropReward.json";
import OBSI_ABI from "../../artifacts/contracts/token/OBSI.sol/OBSI.json";
import liquidityConfig from "../../scripts/config/liquidity.config.json";
import airdropLiquidityConfig from "../../scripts/config/airdropliquidity.config.json";

const LIQUIDITY_REWARD_TOKEN_ADMIN =
  "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";
const LIQUIDITY_ADMIN = "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";
const REWARD_STARTING_BLOCK = 19709557; //starting block of the forked mainnet
const POOL_REWARD_PER_BLOCK = "10";
const POOL_AIRDROP_REWARD_PER_BLOCK = "20";

async function main() {
  try {
    const admin = await ethers.getSigner(
      "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F"
    );
    console.log("signer addr:", admin.address);

    const usdoAddr = await deployUSDO();
    const susdoAddr = await deployStakedUSDO(usdoAddr);
    await deployStakingRewardsDistributor(susdoAddr, usdoAddr, true);
    const liquidityAirdropRewardAssetAddr = await deployLiquidityAirdropReward(
      LIQUIDITY_REWARD_TOKEN_ADMIN
    );
    const liquidityAddr = await deployLiquidity(
      LIQUIDITY_ADMIN,
      REWARD_STARTING_BLOCK
    );
    const governanceTokenAddr: string = await deployGovernanceToken(
      admin.address
    );
    const airdropPoolRewardContract = new ethers.Contract(
      liquidityAirdropRewardAssetAddr,
      LIQUIDITY_REWARD_ABI.abi,
      admin
    );
    const governancePoolRewardContract = new ethers.Contract(
      governanceTokenAddr,
      OBSI_ABI.abi,
      admin
    );
    const airdropLiquidityAddr = await deployLiquidity(
      LIQUIDITY_ADMIN,
      REWARD_STARTING_BLOCK
    );
    await (airdropPoolRewardContract.connect(admin) as Contract).setMinter(
      airdropLiquidityAddr
    );
    await (governancePoolRewardContract.connect(admin) as Contract).setMinter(
      liquidityAddr
    );
    console.log(
      "airdropPoolRewardContract minter set to:",
      airdropLiquidityAddr
    );
    console.log("OBSI minter set to:", liquidityAddr);
    const rewards: { addr: string; rewardPerBlockEther: bigint }[] = [
      {
        addr: governanceTokenAddr,
        rewardPerBlockEther: ethers.parseEther(POOL_REWARD_PER_BLOCK)
      },
      {
        addr: liquidityAirdropRewardAssetAddr,
        rewardPerBlockEther: ethers.parseEther(POOL_AIRDROP_REWARD_PER_BLOCK)
      }
    ];
    await addRewardLiquidity(liquidityAddr, [rewards[0]]);
    await addRewardLiquidity(airdropLiquidityAddr, [rewards[1]]);
    await addPoolLiquidity(liquidityAddr, liquidityConfig, true);
    await addPoolLiquidity(airdropLiquidityAddr, airdropLiquidityConfig, true);
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
