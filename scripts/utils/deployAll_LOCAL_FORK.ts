import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deploy_USDO,
  deploy_StakedUSDO,
  //deploy_StakingRewardsDistributor,
  deploy_LiquidityAirdropReward,
  deploy_Liquidity,
  deploy_OBSI,
  Liquidity_addReward,
  Liquidity_addPool,
  StakedUSDO_setCooldownStaking,
  grantRole,
  USDO_proposeNewCollateralSpender,
  deploy_USDOBacking,
  USDO_mint,
  StakedUSDO_deposit
} from "../functions";
import LIQUIDITY_REWARD_ABI from "../../artifacts/contracts/token/LiquidityAirdropReward.sol/LiquidityAirdropReward.json";
import OBSI_ABI from "../../artifacts/contracts/token/OBSI.sol/OBSI.json";
import USDO_ABI from "../../artifacts/contracts/token/USDOM.sol/USDOM.json";
import SUSDO_ABI from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import liquidityConfig from "../../scripts/config/liquidity.config.json";
import airdropLiquidityConfig from "../../scripts/config/airdropliquidity.config.json";
import { swap } from "../get_stables_from_uniswap_local/swap";
import { getContractAddress } from "@ethersproject/address";
import { USDC_ADDRESS, USDT_ADDRESS } from "../addresses";

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
    const treasuryAddr = "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";

    const usdoAddr = await deploy_USDO(true);
    const susdoAddr = await deploy_StakedUSDO(usdoAddr);
    //await deploy_StakingRewardsDistributor(susdoAddr, usdoAddr, true);
    const liquidityAirdropRewardAssetAddr = await deploy_LiquidityAirdropReward(
      LIQUIDITY_REWARD_TOKEN_ADMIN
    );
    const liquidityAddr = await deploy_Liquidity(
      LIQUIDITY_ADMIN,
      REWARD_STARTING_BLOCK
    );
    const governanceTokenAddr: string = await deploy_OBSI(admin.address);
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
    const airdropLiquidityAddr = await deploy_Liquidity(
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
    await Liquidity_addReward(liquidityAddr, [rewards[0]]);
    await Liquidity_addReward(airdropLiquidityAddr, [rewards[1]]);
    await Liquidity_addPool(liquidityAddr, liquidityConfig, true);
    await Liquidity_addPool(airdropLiquidityAddr, airdropLiquidityConfig, true);

    await swap("100", "50");
    await StakedUSDO_setCooldownStaking(susdoAddr, 60); // 1 minute

    await grantRole(
      usdoAddr,
      USDO_ABI.abi,
      "COLLATERAL_MANAGER_ROLE",
      admin.address
    );

    const USDOBackingNonce = (await admin.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: admin.address,
      nonce: USDOBackingNonce
    });
    await USDO_proposeNewCollateralSpender(usdoAddr, futureAddress);
    const usdobackingAddr = await deploy_USDOBacking(
      admin.address,
      treasuryAddr,
      usdoAddr,
      susdoAddr
    );

    if (futureAddress !== usdobackingAddr) {
      throw new Error("The predicted USDOBacking address is not valid");
    }

    await grantRole(susdoAddr, SUSDO_ABI.abi, "REWARDER_ROLE", usdobackingAddr);

    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral_usdt: USDT_ADDRESS,
      collateral_usdc: USDC_ADDRESS,
      collateral_usdt_amount: ethers.parseUnits("0.5", 6),
      collateral_usdc_amount: ethers.parseUnits("0.5", 6),
      usdo_amount: ethers.parseEther("1")
    };
    await USDO_mint(usdoAddr, order);
    const usdoContract = new ethers.Contract(usdoAddr, USDO_ABI.abi, admin);
    await (usdoContract.connect(admin) as Contract).approve(
      susdoAddr,
      ethers.MaxUint256
    );
    await StakedUSDO_deposit(susdoAddr, "1", admin.address);
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
