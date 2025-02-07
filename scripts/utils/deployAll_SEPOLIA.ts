import { ethers } from "hardhat";
import { Contract } from "ethers";
import {
  deploy_USDO,
  deploy_StakedUSDO,
  StakedUSDO_setCooldownStaking,
  grantRole,
  USDO_proposeNewCollateralSpender,
  deploy_USDOBacking,
  USDO_mint,
  StakedUSDO_deposit,
  deploy_AirdropReward,
  deploy_AirdropSingleStableStake,
  SingleStableStake_setRewardForStakedAssets,
  SingleStableStake_addPool,
  AirdropReward_setStakingPools,
  AirdropReward_addTrackers,
  Liquidity_updateReferral,
  deploy_Dispatcher
} from "../functions";
import USDO_ABI from "../../artifacts/contracts/token/USDO.sol/USDO.json";
import SUSDO_ABI from "../../artifacts/contracts/token/StakedUSDOFront.sol/StakedUSDOFront.json";
import SINGLE_STABLE_STAKE_ABI from "../../artifacts/contracts/liquidity/SingleStableStake.sol/SingleStableStake.json";
import OVA_REFERRAL_ABI from "../../artifacts/contracts/token/OvaReferral.sol/OvaReferral.json";
import { getContractAddress } from "@ethersproject/address";
import {
  AUSDC_SEPOLIA_ADDRESS,
  AUSDT_SEPOLIA_ADDRESS,
  USDC_SEPOLIA_ADDRESS,
  USDT_SEPOLIA_ADDRESS
} from "../addresses";
import { USDC_ABI } from "../abi/USDC_abi";

const AIRDROP_POOLS_REWARD_TOKEN_ADMIN =
  "0xE6379d6EB7573734eD198cbc98D37769c40b4126";
const AIRDROP_POOLS_ADMIN = "0xE6379d6EB7573734eD198cbc98D37769c40b4126";
const OVA_SEPOLIA_SAFETY_MODULE = "0x7bE51020c8c6a9153B3C8688410d201bbbb27fB9";
const OVA_SEPOLIA_TEAM = "0x4b05A19E5b50498fe94d9F7A7c8362f5ACc457b1";

// Curve pools are mocked by using single token pools
async function main() {
  try {
    const admin = await ethers.getSigner(
      "0xE6379d6EB7573734eD198cbc98D37769c40b4126"
    );
    console.log("Signer address:", admin.address);

    const latestTime: number = Math.floor(new Date().getTime() / 1000);
    console.log(`Starting pools timestamp: ${latestTime}`);

    const defaultTransactionOptions = {
      gasLimit: 10000000
    };

    // 0. Retrieve mock tokens
    const fakeUsdcUsdo = "0xc0B8D9721a97f10863029510A0989dBaF0661947";
    const fakeUsdtUsdo = "0xf37D303B57b5feD5f1171aC02A411Ecc5cd7F343";

    // 1. Deploy USDO
    const usdoAddr = await deploy_USDO(
      USDC_SEPOLIA_ADDRESS,
      6,
      USDT_SEPOLIA_ADDRESS,
      6,
      AUSDC_SEPOLIA_ADDRESS,
      6,
      AUSDT_SEPOLIA_ADDRESS,
      6,
      true,
      2
    );

    // 2. Deploy sUSDO
    const susdoAddr = await deploy_StakedUSDO(usdoAddr, 2);

    // 3. Deploy airdrop points (also referral contract)
    const ovaReferralAddress = await deploy_AirdropReward(
      AIRDROP_POOLS_REWARD_TOKEN_ADMIN,
      2
    );
    const ovaReferralContract = new ethers.Contract(
      ovaReferralAddress,
      OVA_REFERRAL_ABI.abi,
      admin.provider
    );

    // 4. Deploy airdrop pools: Single stable stake and curve stable stake (faked with single stable stake)
    const singleStableStakeAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    const singleStableStakePremiumAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
    );
    const curveStableStakeCrvAddr = await deploy_AirdropSingleStableStake(
      AIRDROP_POOLS_ADMIN,
      2
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
    const curveStableStakeCrvContract = new ethers.Contract(
      curveStableStakeCrvAddr,
      SINGLE_STABLE_STAKE_ABI.abi,
      admin.provider
    );

    // 5. Set airdrop reward minters
    let tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakeAddr,
      defaultTransactionOptions
    );
    let receipt = await tx.wait();
    console.log(
      "Airdrop::reward minter set to:",
      singleStableStakeAddr,
      "hash =",
      tx.hash
    );
    tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      singleStableStakePremiumAddr,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(
      "Airdrop::reward minter set to:",
      singleStableStakePremiumAddr,
      "hash =",
      tx.hash
    );
    tx = await (ovaReferralContract.connect(admin) as Contract).setMinter(
      curveStableStakeCrvAddr,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(
      "Airdrop::reward minter set to:",
      curveStableStakeCrvAddr,
      "hash =",
      tx.hash
    );

    // 6. Set reward assets and pools inside Liquidity pools
    await SingleStableStake_setRewardForStakedAssets(
      curveStableStakeCrvContract,
      admin,
      ovaReferralAddress,
      17520 * 2,
      1,
      2
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakeContract,
      admin,
      ovaReferralAddress,
      43800,
      1,
      2
    );
    await SingleStableStake_setRewardForStakedAssets(
      singleStableStakePremiumContract,
      admin,
      ovaReferralAddress,
      87600,
      1,
      2
    );
    // Fake USDT-USDO pool with tri pool DAI-USDC-USDT LP
    const endTimeStamp = latestTime + 60 * 60 * 24 * 30 * 3;
    console.log(`Ending pools timestamp: ${endTimeStamp}`);
    await SingleStableStake_addPool(
      curveStableStakeCrvContract,
      admin,
      fakeUsdcUsdo,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true,
      2
    );
    await SingleStableStake_addPool(
      curveStableStakeCrvContract,
      admin,
      fakeUsdtUsdo,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true,
      2
    );
    await SingleStableStake_addPool(
      singleStableStakeContract,
      admin,
      usdoAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      false,
      true,
      2
    );
    await SingleStableStake_addPool(
      singleStableStakePremiumContract,
      admin,
      usdoAddr,
      ovaReferralAddress,
      1,
      endTimeStamp,
      true,
      true,
      2
    );

    // 7. Deploy ova dispatcher
    const dispatcherAddress = await deploy_Dispatcher(
      admin.address,
      OVA_SEPOLIA_TEAM,
      OVA_SEPOLIA_SAFETY_MODULE,
      OVA_SEPOLIA_SAFETY_MODULE,
      usdoAddr
    );

    // 8. Remove cool down from sUSDO
    await StakedUSDO_setCooldownStaking(susdoAddr, 0, 2); // None

    // 9. Grant role in USDO
    await grantRole(
      usdoAddr,
      USDO_ABI.abi,
      "COLLATERAL_MANAGER_ROLE",
      admin.address,
      2
    );

    // 10. Deploy and propose the USDO collateral spender (the backing contract)
    const USDOBackingNonce = (await admin.getNonce()) + 1;
    const futureAddress = getContractAddress({
      from: admin.address,
      nonce: USDOBackingNonce
    });
    await USDO_proposeNewCollateralSpender(usdoAddr, futureAddress, 2); //replace with usdo
    const usdobackingAddr = await deploy_USDOBacking(
      admin.address,
      dispatcherAddress,
      usdoAddr,
      susdoAddr,
      2
    );

    if (futureAddress !== usdobackingAddr) {
      throw new Error("The predicted USDOBacking address is not valid");
    }

    // 11. Grant to the backing contract the rewarder role
    await grantRole(
      susdoAddr,
      SUSDO_ABI.abi,
      "REWARDER_ROLE",
      usdobackingAddr,
      2
    );

    const usdcContract = new ethers.Contract(
      USDC_SEPOLIA_ADDRESS,
      USDC_ABI,
      admin
    );
    const usdtContract = new ethers.Contract(
      USDT_SEPOLIA_ADDRESS,
      USDC_ABI,
      admin
    );
    tx = await (usdcContract.connect(admin) as Contract).approve(
      usdoAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );
    tx = await (usdtContract.connect(admin) as Contract).approve(
      usdoAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );

    // 12. Mint and stake initial USDO
    const order = {
      benefactor: admin.address,
      beneficiary: admin.address,
      collateral_usdt: USDT_SEPOLIA_ADDRESS,
      collateral_usdc: USDC_SEPOLIA_ADDRESS,
      collateral_usdt_amount: ethers.parseUnits("1", 6),
      collateral_usdc_amount: ethers.parseUnits("1", 6),
      usdo_amount: ethers.parseEther("2")
    };
    await USDO_mint(usdoAddr, order, 2);
    const usdoContract = new ethers.Contract(usdoAddr, USDO_ABI.abi, admin);
    tx = await (usdoContract.connect(admin) as Contract).approve(
      susdoAddr,
      ethers.MaxUint256,
      defaultTransactionOptions
    );
    receipt = await tx.wait();
    console.log(`Approved deployer USDO to sUSDO hash = ${tx.hash}`);
    await StakedUSDO_deposit(susdoAddr, "1", admin.address, 2);

    // 13. Set staking pools inside the referral contract
    await AirdropReward_setStakingPools(
      ovaReferralAddress,
      [
        curveStableStakeCrvAddr,
        singleStableStakePremiumAddr,
        singleStableStakeAddr
      ],
      2
    );

    // 14. Add points trackers
    await AirdropReward_addTrackers(
      ovaReferralAddress,
      [
        curveStableStakeCrvAddr,
        singleStableStakePremiumAddr,
        singleStableStakeAddr
      ],
      2
    );

    // 15. Update referral contract address
    await Liquidity_updateReferral(
      curveStableStakeCrvAddr,
      ovaReferralAddress,
      2
    );
    await Liquidity_updateReferral(
      singleStableStakeAddr,
      ovaReferralAddress,
      2
    );
    await Liquidity_updateReferral(
      singleStableStakePremiumAddr,
      ovaReferralAddress,
      2
    );
  } catch (err) {
    console.error("Batch deployment failed ->", err);
  }
}

main();
