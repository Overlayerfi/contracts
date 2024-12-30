import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deploy_USDO,
  deploy_StakedUSDO,
  //deploy_StakingRewardsDistributor,
  deploy_LiquidityAirdropReward,
  deploy_Liquidity,
  deploy_OVA,
  Liquidity_addReward,
  Liquidity_addPool,
  StakedUSDO_setCooldownStaking,
  grantRole,
  USDO_proposeNewCollateralSpender,
  deploy_USDOBacking,
  USDO_mint,
  StakedUSDO_deposit,
  deploy_AirdropReward,
  deploy_AirdropPoolCurveStableStake,
  deploy_AirdropSingleStableStake,
  CurveStableStake_setRewardForStakedAssets,
  SingleStableStake_setRewardForStakedAssets,
  CurveStableStake_addWithNumCoinsAndPool,
  SingleStableStake_addPool
} from "../functions";
import OVA_ABI from "../../artifacts/contracts/token/OVA.sol/OVA.json";
import USDO_ABI from "../../artifacts/contracts/token/USDO.sol/USDO.json";
import SUSDO_ABI from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import CURVE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/CurveStableStake.sol/CurveStableStake.json";
import SINGLE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/SingleStableStake.sol/SingleStableStake.json";
import OVA_REFERRAL_ABI from "../../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import { swap } from "../uniswap_swapper/proxy";
import { getContractAddress } from "@ethersproject/address";
import {
  CURVE_DAI_USDC_USDT_LP,
  CURVE_DAI_USDC_USDT_POOL,
  DAI_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS
} from "../addresses";
import { DAI_ABI } from "../abi/DAI_abi";
import { USDC_ABI } from "../abi/USDC_abi";
import { USDT_ABI } from "../abi/USDT_abi";
import { addLiquidityTriStable } from "../curve/main";

const AIRDROP_POOLS_REWARD_TOKEN_ADMIN =
  "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";
const AIRDROP_POOLS_ADMIN = "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F";

async function main() {
  try {
    const admin = await ethers.getSigner(
      "0x10fc45741bfE5D527c1b83Fe0BD70fC96D7ec30F"
    );
    const treasuryAddr = "0xa1F55cE218ef2f7c47D8c0Fb0a238a76eE419626";
    console.log("Signer address:", admin.address);
    console.log("Treasury address:", treasuryAddr);

    const latestTime: number = Math.floor(new Date().getTime() * 1000);
    console.log("Latest time", latestTime);

    // 1. Deploy USDO
    const usdoAddr = await deploy_USDO(true);

    // 2. Deploy sUSDO
    const susdoAddr = await deploy_StakedUSDO(usdoAddr);

    // 3. Deploy airdrop points (also referral contract)
    const ovaReferralAddress = await deploy_AirdropReward(
      AIRDROP_POOLS_REWARD_TOKEN_ADMIN
    );
    const ovaReferralContract = new ethers.Contract(
      ovaReferralAddress,
      OVA_REFERRAL_ABI.abi,
      admin.provider
    );

    // 4. Deploy airdrop pool: Curve stable stake
    const curveStableStakeAddr = await deploy_AirdropPoolCurveStableStake(
      AIRDROP_POOLS_ADMIN,
      latestTime
    );
    const curveStableStakeContract = new ethers.Contract(
      curveStableStakeAddr,
      CURVE_STABLE_STAKE_ABI.abi,
      admin.provider
    );

    // 5. Deploy airdrop pools: Single stable stake
    const singleStableStakeAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      latestTime
    );
    const singleStableStakePremiumAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      latestTime
    );
    const singleStableStakeContract = new ethers.Contract(
      singleStableStakeAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );
    const singleStableStakePremiumContract = new ethers.Contract(
      singleStableStakePremiumAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );

    // 6. Set airdrop reward minters
    await (ovaReferralContract.connect(admin) as Contract).setMinter(
      curveStableStakeAddr
    );
    await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakeAddr
    );
    await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakePremiumAddr
    );
    console.log("Airdrop::reward minter set to:", curveStableStakeAddr);
    console.log("Airdrop::reward minter set to:", singleStableStakeAddr);
    console.log("Airdrop::reward minter set to:", singleStableStakePremiumAddr);

    // 7. Set reward assets and pools inside Liquidity pools
    // See internal doc for reference values
    await CurveStableStake_setRewardForStakedAssets(
      curveStableStakeContract,
      admin,
      ovaReferralAddress,
      17520 * 2,
      1
    ); // *2 as we will have 2 pools
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakeContract,
      admin,
      ovaReferralAddress,
      43800,
      1
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakePremiumContract,
      admin,
      ovaReferralAddress,
      87600,
      1
    );
    // Fake USDT-USDO pool with tri pool DAI-USDC-USDT LP
    const endTimeStamp = latestTime + 60 * 60 * 24 * 30 * 6;
    await CurveStableStake_addWithNumCoinsAndPool(
      curveStableStakeContract,
      admin,
      CURVE_DAI_USDC_USDT_LP,
      ovaReferralAddress,
      1,
      3,
      CURVE_DAI_USDC_USDT_POOL,
      endTimeStamp,
      false,
      true
    );
    await SingleStableStake_addPool(
      singleStableStakeContract,
      admin,
      usdoAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true
    );
    await SingleStableStake_addPool(
      singleStableStakePremiumContract,
      admin,
      usdoAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      true,
      true
    );

    // 8. Remove cool down from sUSDO
    await StakedUSDO_setCooldownStaking(susdoAddr, 0); // 1 minute

    // 9. Get some stable coins
    await swap("200", "50");

    // 10. Stake some stable to get Curve LPs
    const CurveContract = await ethers.getContractFactory(
      "CurveLiquidityProxy"
    );
    const curveContract = await CurveContract.deploy();
    await curveContract.waitForDeployment();
    const daiContract = new ethers.Contract(
      DAI_ADDRESS,
      DAI_ABI,
      admin.provider
    );
    const usdcContract = new ethers.Contract(
      USDC_ADDRESS,
      USDC_ABI,
      admin.provider
    );
    const usdtContract = new ethers.Contract(
      USDT_ADDRESS,
      USDT_ABI,
      admin.provider
    );
    const liquidityAmount = "100000";
    await daiContract
      .connect(admin)
      .transfer(
        await curveContract.getAddress(),
        ethers.parseUnits(liquidityAmount, 18)
      );
    await usdcContract
      .connect(admin)
      .transfer(
        await curveContract.getAddress(),
        ethers.parseUnits(liquidityAmount, 6)
      );
    await usdtContract
      .connect(admin)
      .transfer(
        await curveContract.getAddress(),
        ethers.parseUnits(liquidityAmount, 6)
      );
    await addLiquidityTriStable(
      curveContract,
      CURVE_DAI_USDC_USDT_POOL,
      CURVE_DAI_USDC_USDT_LP,
      DAI_ADDRESS,
      USDC_ADDRESS,
      USDT_ADDRESS,
      18,
      6,
      6,
      liquidityAmount,
      liquidityAmount,
      liquidityAmount
    );
    const curveLpContract = new ethers.Contract(
      CURVE_DAI_USDC_USDT_LP,
      USDC_ABI,
      admin.provider
    );
    console.log(
      "Curve::CURVE_DAI_USDC_USDT_LP balance:",
      ethers.formatEther(await curveLpContract.balanceOf(admin.address))
    );

    // 10. Grant role in USDO
    await grantRole(
      usdoAddr,
      USDO_ABI.abi,
      "COLLATERAL_MANAGER_ROLE",
      admin.address
    );

    // 11. Deploy and propose the USDO collateral spender (the backing contract)
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

    // 12. Grant to the backing contract the rewarder role
    await grantRole(susdoAddr, SUSDO_ABI.abi, "REWARDER_ROLE", usdobackingAddr);

    // 13. Mint and stake initial USDO
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
